import { Router } from 'express';
import { queryAll, run } from '../../db.js';

const router = Router();
const wrap = fn => (req, res, next) => { try { fn(req, res, next); } catch(e) { next(e); } };

router.get('/', wrap((req, res) => {
  const { project_id } = req.query;
  let sql = 'SELECT * FROM agile_risks';
  const params = [];
  if (project_id) { sql += ' WHERE project_id = ?'; params.push(+project_id); }
  sql += ' ORDER BY probability * impact DESC';
  res.json(queryAll(sql, params));
}));

router.post('/', wrap((req, res) => {
  const { project_id, title, description, probability, impact, level, strategy, status } = req.body;
  const lvl = level || (probability * impact >= 16 ? 'high' : probability * impact >= 9 ? 'medium' : 'low');
  const result = run('INSERT INTO agile_risks (project_id, title, description, probability, impact, level, strategy, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [project_id, title, description, probability || 3, impact || 3, lvl, strategy, status || 'monitoring']);
  res.json({ id: result.lastInsertRowid });
}));

router.put('/', wrap((req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  const fields = ['title', 'description', 'probability', 'impact', 'level', 'strategy', 'status'];
  const updates = []; const params = [];
  fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(+id);
  run(`UPDATE agile_risks SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

router.delete('/', wrap((req, res) => {
  const id = req.query.id;
  const ids = req.query.ids;
  if (ids) {
    const idList = ids.split(',').map(Number).filter(Boolean);
    if (!idList.length) return res.status(400).json({ error: 'ids required' });
    const placeholders = idList.map(() => '?').join(',');
    run(`DELETE FROM agile_risks WHERE id IN (${placeholders})`, idList);
    return res.json({ ok: true, deleted: idList.length });
  }
  if (!id) return res.status(400).json({ error: 'id required' });
  run('DELETE FROM agile_risks WHERE id = ?', [+id]);
  res.json({ ok: true });
}));

export default router;
