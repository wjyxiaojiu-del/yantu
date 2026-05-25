import { Router } from 'express';
import { queryAll, run, getDB, saveDB } from '../../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { sprint_id, status, story_id } = req.query;
  let sql = `SELECT t.*, s.title as story_title, s.priority, s.story_points
             FROM agile_tasks t LEFT JOIN user_stories s ON t.story_id = s.id WHERE 1=1`;
  const params = [];
  if (sprint_id) { sql += ' AND t.sprint_id = ?'; params.push(+sprint_id); }
  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  if (story_id) { sql += ' AND t.story_id = ?'; params.push(+story_id); }
  sql += ' ORDER BY t.sort_order';
  res.json(queryAll(sql, params));
});

router.post('/', (req, res) => {
  const { story_id, sprint_id, title, status, sort_order, due_date } = req.body;
  const result = run('INSERT INTO agile_tasks (story_id, sprint_id, title, status, sort_order, due_date) VALUES (?, ?, ?, ?, ?, ?)',
    [story_id, sprint_id, title, status || 'todo', sort_order || 0, due_date]);
  res.json({ id: result.lastInsertRowid });
});

router.put('/', async (req, res) => {
  const { id } = req.query;

  // Batch update: PUT /tasks?id=batch
  if (id === 'batch') {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'updates array required' });
    const db = getDB();
    updates.forEach(u => {
      db.run('UPDATE agile_tasks SET status = ?, sort_order = ? WHERE id = ?', [u.status, u.sort_order, u.id]);
    });
    saveDB();
    return res.json({ ok: true });
  }

  // Single update: PUT /tasks?id=123
  if (!id) return res.status(400).json({ error: 'id required' });
  const fields = ['title', 'status', 'sort_order', 'due_date', 'sprint_id', 'story_id'];
  const updates = []; const params = [];
  fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(+id);
  run(`UPDATE agile_tasks SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
});

router.delete('/', (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id required' });
  run('DELETE FROM agile_tasks WHERE id = ?', [+id]);
  res.json({ ok: true });
});

export default router;
