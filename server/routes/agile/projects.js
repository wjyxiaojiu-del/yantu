import { Router } from 'express';
import { queryAll, queryOne } from '../../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { id, action } = req.query;

  // GET /projects?id=1&action=stats
  if (id && action === 'stats') {
    const pid = +id;

    const storyStats = queryOne(`
      SELECT
        COUNT(*) as totalStories,
        COUNT(CASE WHEN status = 'done' THEN 1 END) as completedStories,
        COALESCE(SUM(story_points), 0) as totalPoints,
        COALESCE(SUM(CASE WHEN status = 'done' THEN story_points ELSE 0 END), 0) as completedPoints
      FROM user_stories WHERE project_id = ?
    `, [pid]);

    const taskStats = queryOne(`
      SELECT
        COUNT(*) as totalTasks,
        COUNT(CASE WHEN t.status = 'done' THEN 1 END) as doneTasks
      FROM agile_tasks t JOIN user_stories s ON t.story_id = s.id
      WHERE s.project_id = ?
    `, [pid]);

    const activeSprint = queryOne("SELECT * FROM sprints WHERE project_id = ? AND status != 'completed' ORDER BY number LIMIT 1", [pid]);
    const milestones = queryAll('SELECT * FROM agile_milestones WHERE project_id = ? ORDER BY due_date', [pid]);

    const { totalStories, completedStories, totalPoints, completedPoints } = storyStats;
    const { totalTasks, doneTasks } = taskStats;

    return res.json({
      totalStories, completedStories, totalPoints, completedPoints,
      totalTasks, doneTasks, activeSprint, milestones,
      storyCompletionRate: totalStories ? Math.round(completedStories / totalStories * 100) : 0,
      pointsCompletionRate: totalPoints ? Math.round(completedPoints / totalPoints * 100) : 0,
    });
  }

  // GET /projects?id=1
  if (id) {
    const project = queryOne('SELECT * FROM projects WHERE id = ?', [+id]);
    if (!project) return res.status(404).json({ error: 'Not found' });
    return res.json(project);
  }

  // GET /projects
  res.json(queryAll('SELECT * FROM projects'));
});

export default router;
