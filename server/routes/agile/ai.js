import { Router } from 'express';
import { queryAll, queryOne } from '../../db.js';
import { chat, chatWithSystem } from '../deepseek.js';
import { CacheEngine, DEFAULT_SYNONYMS } from '../cache-engine/index.js';

const router = Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const SYSTEM_PROMPT = `你是"研途启航"AI 助手，一个专为研究生设计的智能项目管理顾问。

你的职责：
1. 帮助研究生管理入学准备、学术研究、论文写作等任务
2. 基于敏捷方法论（Scrum）提供建议
3. 分析项目进度，识别风险，给出改进建议
4. 协助撰写站会纪要、任务拆解、文献综述等

回复要求：
- 使用中文
- 简洁专业，避免冗余
- 结合具体数据给出建议
- 适当使用 Markdown 格式提升可读性
- 如果用户询问具体任务，给出可执行的步骤`;

// Initialize cache engine
const cache = new CacheEngine({
  systemPrompt: SYSTEM_PROMPT,
  domainSynonyms: DEFAULT_SYNONYMS,
  ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
});

function buildProjectContext(projectId) {
  const project = queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
  const stories = queryAll('SELECT * FROM user_stories WHERE project_id = ?', [projectId]);
  const sprints = queryAll('SELECT * FROM sprints WHERE project_id = ? ORDER BY number', [projectId]);
  const tasks = queryAll(`
    SELECT t.*, s.title as story_title, sp.name as sprint_name
    FROM agile_tasks t
    LEFT JOIN user_stories s ON t.story_id = s.id
    LEFT JOIN sprints sp ON t.sprint_id = sp.id
    WHERE s.project_id = ?
  `, [projectId]);
  const risks = queryAll('SELECT * FROM agile_risks WHERE project_id = ?', [projectId]);
  const milestones = queryAll('SELECT * FROM agile_milestones WHERE project_id = ? ORDER BY due_date', [projectId]);
  const standups = queryAll(`
    SELECT sl.* FROM standup_logs sl
    JOIN sprints sp ON sl.sprint_id = sp.id
    WHERE sp.project_id = ?
    ORDER BY sl.date DESC LIMIT 7
  `, [projectId]);

  return {
    project,
    stories: stories.map(s => ({
      id: s.story_id, title: s.title, priority: s.priority,
      points: s.story_points, status: s.status, sprint: s.sprint_id,
    })),
    sprints: sprints.map(s => ({
      number: s.number, name: s.name, status: s.status,
      start: s.start_date, end: s.end_date, goal: s.goal,
    })),
    tasks: tasks.map(t => ({
      title: t.title, status: t.status, story: t.story_title,
      sprint: t.sprint_name, due: t.due_date,
    })),
    risks: risks.map(r => ({
      title: r.title, level: r.level, probability: r.probability,
      impact: r.impact, strategy: r.strategy,
    })),
    milestones: milestones.map(m => ({
      name: m.name, due: m.due_date, status: m.status,
    })),
    standups: standups.map(s => ({
      date: s.date, yesterday: s.yesterday, today: s.today,
      blockers: s.blockers,
    })),
  };
}

// POST /api/ai/chat - 普通聊天
router.post('/chat', wrap(async (req, res) => {
  const { messages, projectId } = req.body;
  if (!messages || !messages.length) {
    return res.status(400).json({ error: 'messages required' });
  }

  const context = buildProjectContext(projectId || 1);
  const contextMsg = `当前项目数据：\n${JSON.stringify(context, null, 2)}`;

  // Get the last user message for cache lookup
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';

  const result = await cache.process(lastUserMsg, async (query) => {
    const response = await chat([
      { role: 'system', content: SYSTEM_PROMPT + '\n\n' + contextMsg },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ], { maxTokens: 2048 });

    return response.content;
  });

  res.json({
    content: result.content,
    fromCache: result.fromCache,
    usage: result.fromCache ? null : result.usage,
  });
}));

// POST /api/ai/standup - AI 生成站会纪要
router.post('/standup', wrap(async (req, res) => {
  const { projectId, sprintId, completedTasks, plannedTasks, blockers } = req.body;
  const context = buildProjectContext(projectId || 1);

  const prompt = `基于以下信息，生成一份简洁的每日站会纪要：

已完成任务：${completedTasks || '（用户未填写）'}
今日计划：${plannedTasks || '（用户未填写）'}
阻塞项：${blockers || '无'}

项目进度：
- 总故事点：${context.stories.reduce((a, s) => a + s.points, 0)}
- 已完成：${context.stories.filter(s => s.status === 'done').length}/${context.stories.length}
- 当前迭代：${context.sprints.find(s => s.status === 'active')?.name || '无'}

请生成：
1. 昨日工作总结（基于已完成任务）
2. 今日重点计划（基于计划任务 + 项目进度）
3. 风险提示（基于阻塞项 + 项目数据）
4. 明日建议`;

  const result = await cache.process(prompt, async (query) => {
    const response = await chatWithSystem(SYSTEM_PROMPT, query, { maxTokens: 1024 });
    return response.content;
  });

  res.json({ content: result.content, fromCache: result.fromCache });
}));

// POST /api/ai/breakdown - AI 任务拆解
router.post('/breakdown', wrap(async (req, res) => {
  const { title, description, projectId } = req.body;
  const context = buildProjectContext(projectId || 1);

  const prompt = `请将以下任务拆解为具体的可执行步骤：

任务标题：${title}
任务描述：${description || '（无描述）'}

要求：
1. 拆解为 3-7 个具体子任务
2. 每个子任务标注预估时间
3. 标注优先级（高/中/低）
4. 给出验收标准

当前项目上下文：已进行到第 ${context.sprints.find(s => s.status === 'active')?.number || 1} 个迭代`;

  const result = await cache.process(prompt, async (query) => {
    const response = await chatWithSystem(SYSTEM_PROMPT, query, { maxTokens: 1024 });
    return response.content;
  });

  res.json({ content: result.content, fromCache: result.fromCache });
}));

// POST /api/ai/analyze - AI 项目分析
router.post('/analyze', wrap(async (req, res) => {
  const { projectId } = req.body;
  const context = buildProjectContext(projectId || 1);

  const prompt = `请对当前研究生项目进行全面分析：

项目概况：${context.project?.name}

迭代情况：
${context.sprints.map(s => `- ${s.name} (${s.status}): ${s.start} ~ ${s.end}`).join('\n')}

故事完成情况：
- 总计：${context.stories.length} 个
- 已完成：${context.stories.filter(s => s.status === 'done').length} 个
- 待办：${context.stories.filter(s => s.status !== 'done').length} 个

风险：${context.risks.map(r => `${r.title}(${r.level})`).join('、') || '暂无'}

里程碑：${context.milestones.map(m => `${m.name}(${m.status})`).join('、')}

请从以下维度分析：
1. 整体进度评估
2. 风险预警
3. 下一步建议
4. 改进方向`;

  const result = await cache.process(prompt, async (query) => {
    const response = await chatWithSystem(SYSTEM_PROMPT, query, { maxTokens: 1500 });
    return response.content;
  });

  res.json({ content: result.content, fromCache: result.fromCache });
}));

// POST /api/ai/literature - 文献助手
router.post('/literature', wrap(async (req, res) => {
  const { question, paperContent, projectId } = req.body;

  const prompt = `你是一个学术文献助手。请基于以下文献内容回答问题。

文献内容：
${paperContent || '（用户未提供文献内容）'}

问题：${question}

请用学术语言回答，必要时标注引用位置。`;

  const result = await cache.process(prompt, async (query) => {
    const response = await chatWithSystem(
      '你是一个专业的学术文献分析助手，擅长论文解读、方法论分析和文献综述。',
      query,
      { maxTokens: 2048 }
    );
    return response.content;
  });

  res.json({ content: result.content, fromCache: result.fromCache });
}));

// GET /api/ai/stats - 缓存统计
router.get('/stats', wrap(async (req, res) => {
  const stats = cache.getStats();
  res.json(stats);
}));

// GET /api/ai/hot-queries - 热点查询
router.get('/hot-queries', wrap(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const hotQueries = cache.getHotQueries(limit);
  res.json(hotQueries);
}));

// GET /api/ai/debug - 调试缓存
router.get('/debug', wrap(async (req, res) => {
  const query = req.query.q || '分析当前项目进度';
  const normalized = cache.normalizeQuery(query);
  const cacheKey = cache.getCacheKey(query);

  res.json({
    query,
    normalized,
    cacheKey,
    cacheSize: cache.cache.size,
    sampleKeys: Array.from(cache.cache.keys()).slice(0, 5),
  });
}));

// POST /api/ai/cleanup - 清理过期缓存
router.post('/cleanup', wrap(async (req, res) => {
  const cleaned = cache.cleanup();
  res.json({ cleaned, message: `清理了 ${cleaned} 条过期缓存` });
}));

// POST /api/ai/warmup - 预热缓存
router.post('/warmup', wrap(async (req, res) => {
  const { projectId } = req.body;
  const context = buildProjectContext(projectId || 1);

  // Common queries that users frequently ask
  const hotQueries = [
    '分析当前项目进度',
    '项目有什么风险',
    '帮我拆解任务',
    '今天做什么',
    '生成站会纪要',
    '项目整体情况如何',
    '有哪些待办任务',
    '迭代进度怎么样',
    '有什么建议',
    '总结一下项目状态',
    '下一步该做什么',
    '有哪些阻塞项',
    '如何提高效率',
    '任务优先级排序',
    '本周计划',
  ];

  const warmed = await cache.warmup(async (query) => {
    const contextMsg = `当前项目数据：\n${JSON.stringify(context, null, 2)}`;
    const response = await chat([
      { role: 'system', content: SYSTEM_PROMPT + '\n\n' + contextMsg },
      { role: 'user', content: query },
    ], { maxTokens: 1024 });
    return response.content;
  }, hotQueries);

  res.json({
    warmed,
    message: `预热完成，新增 ${warmed} 条缓存`,
    stats: cache.getStats(),
  });
}));

export default router;
