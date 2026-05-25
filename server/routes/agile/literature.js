import { Router } from 'express';
import { queryAll, queryOne, run } from '../../db.js';

const router = Router();
const wrap = fn => (req, res, next) => { try { fn(req, res, next); } catch(e) { next(e); } };

router.get('/', wrap((req, res) => {
  const { project_id, status, tag, search } = req.query;
  let sql = 'SELECT * FROM literature WHERE 1=1';
  const params = [];
  if (project_id) { sql += ' AND project_id = ?'; params.push(+project_id); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (tag) { sql += ' AND tags LIKE ?'; params.push(`%${tag}%`); }
  if (search) { sql += ' AND (title LIKE ? OR authors LIKE ? OR journal LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  sql += ' ORDER BY created_at DESC';
  res.json(queryAll(sql, params));
}));

router.get('/:id', wrap((req, res) => {
  const item = queryOne('SELECT * FROM literature WHERE id = ?', [+req.params.id]);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
}));

router.post('/', wrap((req, res) => {
  const { project_id, title, authors, journal, year, doi, abstract, notes, tags, rating, status, file_url } = req.body;
  if (!project_id || !title) return res.status(400).json({ error: 'project_id and title required' });
  const result = run(
    'INSERT INTO literature (project_id, title, authors, journal, year, doi, abstract, notes, tags, rating, status, file_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [project_id, title, authors || '', journal || '', year || null, doi || '', abstract || '', notes || '', tags || '', rating || 0, status || 'unread', file_url || '']
  );
  res.json({ id: result.lastInsertRowid });
}));

router.put('/', wrap((req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  const fields = ['title', 'authors', 'journal', 'year', 'doi', 'abstract', 'notes', 'tags', 'rating', 'status', 'file_url'];
  const updates = []; const params = [];
  fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });
  if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(+id);
  run(`UPDATE literature SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ ok: true });
}));

router.delete('/', wrap((req, res) => {
  const id = req.query.id;
  const ids = req.query.ids;
  if (ids) {
    const idList = ids.split(',').map(Number).filter(Boolean);
    if (!idList.length) return res.status(400).json({ error: 'ids required' });
    const placeholders = idList.map(() => '?').join(',');
    run(`DELETE FROM literature WHERE id IN (${placeholders})`, idList);
    return res.json({ ok: true, deleted: idList.length });
  }
  if (!id) return res.status(400).json({ error: 'id required' });
  run('DELETE FROM literature WHERE id = ?', [+id]);
  res.json({ ok: true });
}));

export default router;
