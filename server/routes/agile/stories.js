import { Router } from 'express';
import { queryAll, queryOne, run } from '../../db.js';

const router = Router();
const wrap = fn => (req, res, next) => { try { fn(req, res, next); } catch(e) { next(e); } };

router.get('/', wrap((req, res) => {
  const { project_id, sprint_id, priority, status } = req.query;
  let sql = 'SELECT * FROM user_stories WHERE 1=1';
  const params = [];
  if (project_id) { sql += ' AND project_id = ?'; params.push(+project_id); }
  if (sprint_id) { sql += ' AND sprint_id = ?'; params.push(+sprint_id); }
  if (priority) { sql += ' AND priority = ?'; params.push(priority); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY priority, story_points DESC';
  res.json(queryAll(sql, params));
}));

router.get('/:id', wrap((req, res) => {
  const story = queryOne('SELECT * FROM user_stories WHERE id = ?', [+req.params.id]);
  if (!story) return res.status(404).json({ error: 'Not found' });
  res.json(story);
}));

router.post('/', wrap((req, res) => {
  const { story_id, project_id, title, description, priority, story_points, sprint_id, status, acceptance_criteria } = req.body;
  const result = run('INSERT INTO user_stories (story_id, project_id, title, description, priority, story_points, sprint_id, status, acceptance_criteria) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [story_id, project_id, title, description || '', priority || 'S', story_points || 3, sprint_id || null, status || 'backlog', acceptance_criteria || '']);
  res.json({ id: result.lastInsertRowid });
}));

router.put('/', wrap((req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  const fields = ['title', 'description', 'priority', 'story_points', 'sprint_id', 'status', 'acceptance_criteria'];
  const updates = []; const params = [];
  fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(+id);
  run(`UPDATE user_stories SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

router.delete('/', wrap((req, res) => {
  const id = req.query.id;
  const ids = req.query.ids;
  if (ids) {
    const idList = ids.split(',').map(Number).filter(Boolean);
    if (!idList.length) return res.status(400).json({ error: 'ids required' });
    const placeholders = idList.map(() => '?').join(',');
    run(`DELETE FROM user_stories WHERE id IN (${placeholders})`, idList);
    return res.json({ ok: true, deleted: idList.length });
  }
  if (!id) return res.status(400).json({ error: 'id required' });
  run('DELETE FROM user_stories WHERE id = ?', [+id]);
  res.json({ ok: true });
}));

export default router;
