import { Router } from 'express';
import { queryAll, queryOne, run } from '../../db.js';

const router = Router();
const wrap = fn => (req, res, next) => { try { fn(req, res, next); } catch(e) { next(e); } };

router.get('/', wrap((req, res) => {
  const { project_id } = req.query;
  let sql = 'SELECT * FROM agile_meetings WHERE 1=1';
  const params = [];
  if (project_id) { sql += ' AND project_id = ?'; params.push(+project_id); }
  sql += ' ORDER BY meeting_date DESC';
  res.json(queryAll(sql, params));
}));

router.get('/:id', wrap((req, res) => {
  const item = queryOne('SELECT * FROM agile_meetings WHERE id = ?', [+req.params.id]);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
}));

router.post('/', wrap((req, res) => {
  const { project_id, mentor_name, meeting_date, topic, summary, action_items, next_meeting, notes } = req.body;
  if (!project_id || !meeting_date) return res.status(400).json({ error: 'project_id and meeting_date required' });
  const result = run(
    'INSERT INTO agile_meetings (project_id, mentor_name, meeting_date, topic, summary, action_items, next_meeting, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [project_id, mentor_name || '', meeting_date, topic || '', summary || '', action_items || '', next_meeting || '', notes || '']
  );
  res.json({ id: result.lastInsertRowid });
}));

router.put('/', wrap((req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  const fields = ['mentor_name', 'meeting_date', 'topic', 'summary', 'action_items', 'next_meeting', 'notes'];
  const updates = []; const params = [];
  fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(+id);
  run(`UPDATE agile_meetings SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

router.delete('/', wrap((req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  run('DELETE FROM agile_meetings WHERE id = ?', [+id]);
  res.json({ ok: true });
}));

export default router;
