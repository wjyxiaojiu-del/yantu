import { Router } from 'express';
import { queryAll, queryOne } from '../db.js';

const router = Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/projects', wrap((req, res) => {
  res.json(queryAll('SELECT * FROM projects ORDER BY created_at DESC LIMIT 100'));
}));

router.get('/projects/:id/stats', wrap((req, res) => {
  const projectId = req.params.id;
  const totalStories = queryOne('SELECT COUNT(*) as count FROM user_stories WHERE project_id = ?', [projectId]);
  const doneStories = queryOne('SELECT COUNT(*) as count FROM user_stories WHERE project_id = ? AND status = ?', [projectId, 'done']);
  const totalTasks = queryOne('SELECT COUNT(*) as count FROM agile_tasks WHERE story_id IN (SELECT id FROM user_stories WHERE project_id = ?)', [projectId]);
  const doneTasks = queryOne('SELECT COUNT(*) as count FROM agile_tasks WHERE story_id IN (SELECT id FROM user_stories WHERE project_id = ?) AND status = ?', [projectId, 'done']);
  const activeSprint = queryOne('SELECT * FROM sprints WHERE project_id = ? AND status = ? ORDER BY end_date DESC LIMIT 1', [projectId, 'active']);
  const milestones = queryAll('SELECT * FROM agile_milestones WHERE project_id = ? ORDER BY due_date LIMIT 50', [projectId]);
  res.json({
    totalStories: totalStories?.count || 0,
    doneStories: doneStories?.count || 0,
    totalTasks: totalTasks?.count || 0,
    doneTasks: doneTasks?.count || 0,
    activeSprint: activeSprint || null,
    milestones: milestones || [],
  });
}));

router.get('/projects/:id/milestones', wrap((req, res) => {
  res.json(queryAll('SELECT * FROM agile_milestones WHERE project_id = ? ORDER BY due_date LIMIT 50', [req.params.id]));
}));

router.get('/projects/:id/sprints', wrap((req, res) => {
  res.json(queryAll('SELECT * FROM sprints WHERE project_id = ? ORDER BY start_date DESC LIMIT 50', [req.params.id]));
}));

router.get('/projects/:id/stories', wrap((req, res) => {
  res.json(queryAll('SELECT * FROM user_stories WHERE project_id = ? ORDER BY priority, created_at DESC LIMIT 200', [req.params.id]));
}));

export default router;
