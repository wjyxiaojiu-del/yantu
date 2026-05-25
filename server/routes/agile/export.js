import { Router } from 'express';
import { queryAll, queryOne } from '../../db.js';

const router = Router();
const wrap = fn => (req, res, next) => { try { fn(req, res, next); } catch(e) { next(e); } };

router.get('/markdown', wrap((req, res) => {
  const projectId = +req.query.project_id || 1;

  const project = queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
  const sprints = queryAll('SELECT * FROM sprints WHERE project_id = ? ORDER BY number', [projectId]);
  const stories = queryAll('SELECT * FROM user_stories WHERE project_id = ? ORDER BY priority, story_points DESC', [projectId]);
  const tasks = queryAll(`
    SELECT t.*, s.title as story_title
    FROM agile_tasks t LEFT JOIN user_stories s ON t.story_id = s.id
    WHERE s.project_id = ?
    ORDER BY t.sort_order
  `, [projectId]);
  const risks = queryAll('SELECT * FROM agile_risks WHERE project_id = ?', [projectId]);
  const milestones = queryAll('SELECT * FROM agile_milestones WHERE project_id = ? ORDER BY due_date', [projectId]);
  const literature = queryAll('SELECT * FROM literature WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
  const meetings = queryAll('SELECT * FROM agile_meetings WHERE project_id = ? ORDER BY meeting_date DESC', [projectId]);
  const standups = queryAll(`
    SELECT sl.* FROM standup_logs sl
    JOIN sprints sp ON sl.sprint_id = sp.id
    WHERE sp.project_id = ?
    ORDER BY sl.date DESC
  `, [projectId]);

  let md = `# ${project?.name || '研究生项目'}\n\n`;
  md += `**周期：** ${project?.start_date} ~ ${project?.end_date}\n\n`;
  md += `**导出时间：** ${new Date().toLocaleString('zh-CN')}\n\n`;
  md += `---\n\n`;

  // Milestones
  md += `## 里程碑\n\n`;
  milestones.forEach(m => {
    const status = m.status === 'completed' ? '✅' : '⬜';
    md += `- ${status} **${m.name}** (${m.due_date})\n`;
    if (m.criteria) md += `  - 达成标准：${m.criteria}\n`;
  });
  md += `\n`;

  // Sprints
  md += `## 迭代计划\n\n`;
  sprints.forEach(s => {
    md += `### Sprint ${s.number}：${s.name.replace(/Sprint \d+：/, '')}\n`;
    md += `- **周期：** ${s.start_date} ~ ${s.end_date}\n`;
    md += `- **目标：** ${s.goal || '无'}\n`;
    md += `- **状态：** ${s.status}\n\n`;
  });

  // Stories
  md += `## 用户故事\n\n`;
  md += `| 编号 | 标题 | 优先级 | 故事点 | 状态 |\n`;
  md += `|------|------|--------|--------|------|\n`;
  stories.forEach(s => {
    md += `| ${s.story_id} | ${s.title} | ${s.priority} | ${s.story_points} | ${s.status} |\n`;
  });
  md += `\n`;

  // Tasks
  md += `## 任务列表\n\n`;
  const tasksBySprint = {};
  tasks.forEach(t => {
    const key = t.sprint_id || 'unassigned';
    if (!tasksBySprint[key]) tasksBySprint[key] = [];
    tasksBySprint[key].push(t);
  });
  Object.entries(tasksBySprint).forEach(([sid, tlist]) => {
    const sprint = sprints.find(s => s.id === +sid);
    md += `### ${sprint ? `Sprint ${sprint.number}` : '未分配'}\n`;
    tlist.forEach(t => {
      const check = t.status === 'done' ? 'x' : ' ';
      md += `- [${check}] ${t.title}\n`;
    });
    md += `\n`;
  });

  // Risks
  md += `## 风险管理\n\n`;
  risks.forEach(r => {
    const level = r.level === 'high' ? '🔴' : r.level === 'medium' ? '🟡' : '🟢';
    md += `- ${level} **${r.title}** (概率${r.probability} × 影响${r.impact})\n`;
    if (r.strategy) md += `  - 应对策略：${r.strategy}\n`;
  });
  md += `\n`;

  // Literature
  if (literature.length) {
    md += `## 文献库\n\n`;
    literature.forEach(l => {
      const status = l.status === 'done' ? '📖' : l.status === 'reading' ? '📚' : '📄';
      md += `- ${status} **${l.title}**\n`;
      if (l.authors) md += `  - 作者：${l.authors}\n`;
      if (l.journal) md += `  - 期刊：${l.journal}${l.year ? ` (${l.year})` : ''}\n`;
      if (l.notes) md += `  - 笔记：${l.notes}\n`;
    });
    md += `\n`;
  }

  // Meetings
  if (meetings.length) {
    md += `## 导师沟通记录\n\n`;
    meetings.forEach(m => {
      md += `### ${m.meeting_date}${m.mentor_name ? ` - ${m.mentor_name}` : ''}\n`;
      if (m.topic) md += `- **主题：** ${m.topic}\n`;
      if (m.summary) md += `- **纪要：** ${m.summary}\n`;
      if (m.action_items) md += `- **待办：** ${m.action_items}\n`;
      md += `\n`;
    });
  }

  // Standups
  if (standups.length) {
    md += `## 每日站会\n\n`;
    standups.slice(0, 10).forEach(s => {
      md += `### ${s.date}\n`;
      if (s.yesterday) md += `- **昨日完成：** ${s.yesterday}\n`;
      if (s.today) md += `- **今日计划：** ${s.today}\n`;
      if (s.blockers) md += `- **阻塞项：** ${s.blockers}\n`;
      md += `\n`;
    });
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="project-${projectId}-export.md"`);
  res.send(md);
}));

export default router;
