import { requireAuth, requireTenant, requireRole, ROLES } from '../middleware/tenant.js';
import { queryAll, queryOne, run } from '../db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'mimo-v2.5-pro';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '../../uploads/papers');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export function setupPaperRoutes(app) {
  // 上传论文
  app.post('/api/papers', requireAuth, requireTenant, requireRole(ROLES.STUDENT, ROLES.MENTOR, ROLES.ADMIN, ROLES.OWNER), async (req, res) => {
    try {
      const { title, author, abstract, keywords, fileName, fileData, fileSize } = req.body;
      if (!title || !fileName || !fileData) return res.status(400).json({ error: '缺少必要字段' });

      const tenantId = req.tenantId;
      const studentId = req.user.role === 'student' ? req.user.id : req.body.student_id;
      if (!studentId) return res.status(400).json({ error: '缺少学生ID' });

      const version = queryOne('SELECT COUNT(*) as cnt FROM papers WHERE student_id = ? AND tenant_id = ?', [studentId, tenantId]).cnt + 1;
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueName = `${Date.now()}_${safeName}`;
      const filePath = path.join(UPLOAD_DIR, uniqueName);
      fs.writeFileSync(filePath, Buffer.from(fileData, 'base64'));

      run(`INSERT INTO papers (tenant_id, student_id, title, author, abstract, keywords, file_path, file_name, file_size, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, studentId, title, author || '', abstract || '', keywords || '', filePath, fileName, fileSize || 0, version]);

      const paper = queryOne('SELECT * FROM papers WHERE rowid = last_insert_rowid()');
      res.json({ success: true, paper });
    } catch (e) {
      console.error('Upload paper error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // 获取论文列表（导师看全部，学生只看自己的）
  app.get('/api/papers', requireAuth, requireTenant, async (req, res) => {
    try {
      const tenantId = req.tenantId;
      let sql = 'SELECT p.*, u.name as student_name FROM papers p JOIN users u ON p.student_id = u.id WHERE p.tenant_id = ?';
      const params = [tenantId];
      if (req.user.role === 'student') {
        sql += ' AND p.student_id = ?';
        params.push(req.user.id);
      } else if (req.query.student_id) {
        sql += ' AND p.student_id = ?';
        params.push(Number(req.query.student_id));
      }
      sql += ' ORDER BY p.updated_at DESC';
      const papers = queryAll(sql, params);
      res.json({ papers });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 获取单个论文详情
  app.get('/api/papers/:id', requireAuth, requireTenant, async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const paper = queryOne('SELECT p.*, u.name as student_name FROM papers p JOIN users u ON p.student_id = u.id WHERE p.id = ? AND p.tenant_id = ?', [req.params.id, tenantId]);
      if (!paper) return res.status(404).json({ error: '论文不存在' });
      if (req.user.role === 'student' && paper.student_id !== req.user.id) return res.status(403).json({ error: '无权限' });
      res.json({ paper });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 获取论文文件内容（PDF base64）
  app.get('/api/papers/:id/file', requireAuth, requireTenant, async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const paper = queryOne('SELECT file_path, file_name FROM papers WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
      if (!paper) return res.status(404).json({ error: '论文不存在' });
      const buf = fs.readFileSync(paper.file_path);
      res.json({ data: buf.toString('base64'), name: paper.file_name });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 添加批注
  app.post('/api/papers/:id/reviews', requireAuth, requireTenant, requireRole(ROLES.MENTOR, ROLES.ADMIN, ROLES.OWNER, ROLES.STUDENT), async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const paperId = Number(req.params.id);
      const paper = queryOne('SELECT student_id FROM papers WHERE id = ? AND tenant_id = ?', [paperId, tenantId]);
      if (!paper) return res.status(404).json({ error: '论文不存在' });
      if (req.user.role === 'student' && paper.student_id !== req.user.id) return res.status(403).json({ error: '无权限' });

      const { content, section, page } = req.body;
      if (!content) return res.status(400).json({ error: '批注内容不能为空' });

      run(`INSERT INTO paper_reviews (paper_id, reviewer_id, reviewer_name, content, section, page)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [paperId, req.user.id, req.user.name || '导师', content, section || '', page || 0]);

      // 更新论文状态
      run('UPDATE papers SET status = ?, updated_at = datetime("now") WHERE id = ?', ['reviewed', paperId]);

      // 创建通知
      const paperInfo = queryOne('SELECT title FROM papers WHERE id = ?', [paperId]);
      const msg = `论文《${paperInfo?.title || '未知'}》收到新批注`;
      if (req.user.role !== 'student' && paper.student_id !== req.user.id) {
        run(`INSERT INTO notifications (user_id, type, title, content, related_id)
          VALUES (?, 'paper', '论文批注', ?, ?)`, [paper.student_id, msg, paperId]);
      }

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 获取批注列表
  app.get('/api/papers/:id/reviews', requireAuth, requireTenant, async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const paperId = Number(req.params.id);
      const paper = queryOne('SELECT student_id FROM papers WHERE id = ? AND tenant_id = ?', [paperId, tenantId]);
      if (!paper) return res.status(404).json({ error: '论文不存在' });
      if (req.user.role === 'student' && paper.student_id !== req.user.id) return res.status(403).json({ error: '无权限' });

      const reviews = queryAll('SELECT * FROM paper_reviews WHERE paper_id = ? ORDER BY created_at DESC', [paperId]);
      res.json({ reviews });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // AI 分析论文（调用真实 AI API）
  app.post('/api/papers/:id/analyze', requireAuth, requireTenant, requireRole(ROLES.MENTOR, ROLES.ADMIN, ROLES.OWNER), async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const paperId = Number(req.params.id);
      const paper = queryOne('SELECT title, abstract, keywords, file_path, file_name FROM papers WHERE id = ? AND tenant_id = ?', [paperId, tenantId]);
      if (!paper) return res.status(404).json({ error: '论文不存在' });

      // 提取 PDF 文本
      let paperText = '';
      try {
        if (paper.file_path && fs.existsSync(paper.file_path)) {
          const dataBuffer = fs.readFileSync(paper.file_path);
          const pdfData = await pdfParse(dataBuffer);
          paperText = pdfData.text || '';
          // 限制长度避免超出 token 限制
          if (paperText.length > 12000) paperText = paperText.substring(0, 12000) + '\n...（内容已截断）';
        }
      } catch (pdfErr) {
        console.error('[AI] PDF parse failed:', pdfErr.message);
      }

      // 构建提示词
      const userContent = `请审阅以下学术论文，并给出修改建议和评分。

论文标题：${paper.title || '未命名'}
作者：${paper.author || '未知'}
关键词：${paper.keywords || '无'}
摘要：${paper.abstract || '无'}

${paperText ? `论文正文（前${paperText.length}字符）：\n${paperText}` : '（未能提取论文正文，请基于标题和摘要进行评价）'}

请严格按以下格式输出：
SCORE: <0-100的整数分数，综合评定论文质量>
SUGGESTIONS:
1. <第一条具体修改建议>
2. <第二条具体修改建议>
3. <第三条具体修改建议>
4. <第四条具体修改建议>`;

      // 调用 AI API
      const aiRes = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: '你是一位资深的学术论文审稿人，擅长计算机科学和相关领域的论文评审。你的评价应专业、具体、有建设性。请严格按用户要求的格式输出。' },
            { role: 'user', content: userContent }
          ],
          max_tokens: 2048,
          temperature: 0.5,
        }),
      });

      if (!aiRes.ok) {
        const errBody = await aiRes.text().catch(() => '');
        console.error('[AI] API error:', aiRes.status, errBody);
        return res.status(502).json({ error: `AI 服务暂时不可用 (${aiRes.status})，请稍后重试`, fallback: true });
      }

      const aiData = await aiRes.json();
      const content = aiData.choices?.[0]?.message?.content || '';

      // 解析评分和建议
      let score = null;
      const scoreMatch = content.match(/SCORE:\s*(\d+)/i);
      if (scoreMatch) score = Math.min(100, Math.max(0, parseInt(scoreMatch[1], 10)));

      let suggestions = content;
      const sugMatch = content.match(/SUGGESTIONS:([\s\S]*)/i);
      if (sugMatch) suggestions = sugMatch[1].trim();

      // 清理建议文本
      suggestions = suggestions
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.match(/^SCORE:/i))
        .join('\n');

      if (!score) {
        // 如果解析失败，给一个默认分数
        score = 75;
      }

      run('UPDATE papers SET ai_summary = ?, ai_score = ?, updated_at = datetime("now") WHERE id = ?',
        [suggestions, score, paperId]);

      res.json({ success: true, aiSummary: suggestions, aiScore: score });
    } catch (e) {
      console.error('[AI] Analyze error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // 删除论文
  app.delete('/api/papers/:id', requireAuth, requireTenant, requireRole(ROLES.ADMIN, ROLES.OWNER), async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const paper = queryOne('SELECT file_path FROM papers WHERE id = ? AND tenant_id = ?', [req.params.id, tenantId]);
      if (!paper) return res.status(404).json({ error: '论文不存在' });
      if (paper.file_path && fs.existsSync(paper.file_path)) fs.unlinkSync(paper.file_path);
      run('DELETE FROM paper_reviews WHERE paper_id = ?', [req.params.id]);
      run('DELETE FROM papers WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
