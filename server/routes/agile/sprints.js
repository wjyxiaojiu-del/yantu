import { Router } from 'express';
import { queryAll, queryOne, run } from '../../db.js';

const router = Router();
const wrap = fn => (req, res, next) => { try { fn(req, res, next); } catch(e) { next(e); } };

router.get('/', wrap((req, res) => {
  const { project_id, id, action } = req.query;

  if (id && action === 'stats') {
    const sid = +id;
    const totalPoints = queryOne('SELECT COALESCE(SUM(story_points),0) as total FROM user_stories WHERE sprint_id = ?', [sid]).total;
    const donePoints = queryOne("SELECT COALESCE(SUM(story_points),0) as total FROM user_stories WHERE sprint_id = ? AND status = 'done'", [sid]).total;
    const tasksByStatus = queryAll("SELECT status, COUNT(*) as count FROM agile_tasks WHERE sprint_id = ? GROUP BY status", [sid]);
    return res.json({ totalPoints, donePoints, remainingPoints: totalPoints - donePoints, tasksByStatus });
  }

  if (id) {
    const sprint = queryOne('SELECT * FROM sprints WHERE id = ?', [+id]);
    if (!sprint) return res.status(404).json({ error: 'Not found' });
    return res.json(sprint);
  }

  let sql = 'SELECT * FROM sprints';
  const params = [];
  if (project_id) { sql += ' WHERE project_id = ?'; params.push(+project_id); }
  sql += ' ORDER BY number';
  res.json(queryAll(sql, params));
}));

router.put('/', wrap((req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  const fields = ['name', 'goal', 'status', 'start_date', 'end_date', 'number'];
  const updates = []; const params = [];
  fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });
  if (!updates.length) return res.status(400).json({ error: 'No fields' });
  params.push(+id);
  run(`UPDATE sprints SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

router.post('/', wrap((req, res) => {
  const { project_id, name, start_date, end_date, goal, status } = req.body;
  if (!project_id || !name) return res.status(400).json({ error: 'project_id and name required' });
  const maxNum = queryOne('SELECT COALESCE(MAX(number), 0) as maxNum FROM sprints WHERE project_id = ?', [+project_id]);
  const number = (maxNum?.maxNum || 0) + 1;
  const result = run('INSERT INTO sprints (project_id, number, name, start_date, end_date, goal, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [+project_id, number, name, start_date || '', end_date || '', goal || '', status || 'planned']);
  res.json({ id: result.lastInsertRowid, number });
}));

router.delete('/', wrap((req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  run('DELETE FROM agile_tasks WHERE sprint_id = ?', [+id]);
  run('DELETE FROM standup_logs WHERE sprint_id = ?', [+id]);
  run('UPDATE user_stories SET sprint_id = NULL WHERE sprint_id = ?', [+id]);
  run('DELETE FROM sprints WHERE id = ?', [+id]);
  res.json({ ok: true });
}));

export default router;
