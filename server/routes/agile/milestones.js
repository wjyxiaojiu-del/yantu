import { Router } from 'express';
import { queryAll, run } from '../../db.js';

const router = Router();
const wrap = fn => (req, res, next) => { try { fn(req, res, next); } catch(e) { next(e); } };

router.get('/', wrap((req, res) => {
  const { project_id } = req.query;
  let sql = 'SELECT * FROM agile_milestones';
  const params = [];
  if (project_id) { sql += ' WHERE project_id = ?'; params.push(+project_id); }
  sql += ' ORDER BY due_date';
  res.json(queryAll(sql, params));
}));

router.post('/', wrap((req, res) => {
  const { project_id, name, due_date, criteria } = req.body;
  if (!project_id || !name) return res.status(400).json({ error: 'project_id and name required' });
  const result = run('INSERT INTO agile_milestones (project_id, name, due_date, status, criteria) VALUES (?, ?, ?, ?, ?)',
    [+project_id, name, due_date || '', 'pending', criteria || '']);
  res.json({ id: result.lastInsertRowid });
}));

router.put('/', wrap((req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  const fields = ['name', 'due_date', 'status', 'criteria'];
  const updates = []; const params = [];
  fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });
  if (!updates.length) return res.status(400).json({ error: 'No fields' });
  params.push(+id);
  run(`UPDATE agile_milestones SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

router.delete('/', wrap((req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  run('DELETE FROM agile_milestones WHERE id = ?', [+id]);
  res.json({ ok: true });
}));

export default router;
