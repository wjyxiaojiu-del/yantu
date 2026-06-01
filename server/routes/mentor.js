import { Router } from 'express';
import { queryAll, queryOne, run } from '../db.js';
import { validateBody, Patterns } from '../middleware/validate.js';
import { upload, UPLOAD_PATH } from '../middleware/upload.js';
import { getTenantId, ROLES } from '../middleware/tenant.js';
import { wrap } from '../middleware/wrap.js';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const router = Router();
const DEFAULT_MENTOR_ID = 1;

function getTid(req) {
  return req.tenantId || getTenantId(req);
}

function getStudentAgileProjectId(studentId) {
  const link = queryOne('SELECT agile_project_id FROM student_projects WHERE student_id = ? LIMIT 1', [studentId]);
  return link ? link.agile_project_id : null;
}

function syncTaskToAgile(studentId, title, description, deadline, priority) {
  const projectId = getStudentAgileProjectId(studentId);
  if (!projectId) return null;
  const priorityMap = { urgent: 'S', high: 'H', medium: 'M', low: 'L' };
  try {
    const result = run(
      'INSERT INTO user_stories (story_id, project_id, title, description, priority, story_points, sprint_id, status, acceptance_criteria) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [`MENTOR-${Date.now()}`, projectId, title, description || '', priorityMap[priority] || 'M', 3, null, 'backlog', deadline ? `导师指派截止日期: ${deadline}` : '']
    );
    return { id: result.lastInsertRowid };
  } catch (e) {
    console.error('Sync task to agile failed:', e.message);
    return null;
  }
}

function syncReviewToAgile(studentId, title, scheduledDate, stageType) {
  const projectId = getStudentAgileProjectId(studentId);
  if (!projectId) return null;
  try {
    const result = run(
      'INSERT INTO agile_milestones (project_id, name, due_date, criteria) VALUES (?, ?, ?, ?)',
      [projectId, title, scheduledDate || '', `评审类型: ${stageType}`]
    );
    return { id: result.lastInsertRowid };
  } catch (e) {
    console.error('Sync review to agile failed:', e.message);
    return null;
  }
}

function createNotification({ tenant_id, mentor_id, user_id, type = 'system', title, content, related_id, related_type }) {
  try {
    run(
      `INSERT INTO notifications (tenant_id, mentor_id, user_id, type, title, content, related_id, related_type, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [tenant_id || 1, mentor_id || null, user_id || null, type, title, content || null, related_id || null, related_type || null]
    );
  } catch (e) {
    console.error('[Notification] Failed to create:', e.message);
  }
}

// Dashboard
  router.get('/dashboard', (req, res) => {
    try {
      const tenantId = getTid(req);
      const mentorId = req.query.mentor_id || DEFAULT_MENTOR_ID;

      const activeStudents = queryAll(
        `SELECT s.* FROM students s
         JOIN mentor_student_relations msr ON s.id = msr.student_id
         WHERE s.tenant_id = ? AND msr.mentor_id = ? AND msr.status = ? AND s.status = ?`,
        [tenantId, mentorId, 'active', 'active']
      );

      const studentIds = activeStudents.map(s => s.id);
      let pendingTasks = 0, completedTasks = 0, overdueTasks = 0;

      if (studentIds.length > 0) {
        const placeholders = studentIds.map(() => '?').join(',');
        const today = new Date().toISOString().split('T')[0];
        // 合并为单次查询，用条件聚合代替 3 次独立 COUNT
        const taskStats = queryOne(
          `SELECT
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingTasks,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedTasks,
             SUM(CASE WHEN status = 'pending' AND deadline < ? THEN 1 ELSE 0 END) as overdueTasks
           FROM mentor_tasks WHERE tenant_id = ? AND mentor_id = ? AND student_id IN (${placeholders})`,
          [today, tenantId, mentorId, ...studentIds]
        );
        pendingTasks = taskStats?.pendingTasks || 0;
        completedTasks = taskStats?.completedTasks || 0;
        overdueTasks = taskStats?.overdueTasks || 0;
      }

      const upcomingReviews = queryAll(
        `SELECT rs.*, s.name as student_name FROM review_stages rs
         JOIN students s ON rs.student_id = s.id
         JOIN mentor_student_relations msr ON s.id = msr.student_id
         WHERE s.tenant_id = ? AND msr.mentor_id = ? AND rs.status IN ('pending','in_progress')
         ORDER BY rs.scheduled_date ASC LIMIT 5`,
        [tenantId, mentorId]
      );

      const recentMeetings = queryAll(
        'SELECT * FROM meeting_records WHERE tenant_id = ? AND mentor_id = ? ORDER BY meeting_date DESC LIMIT 5',
        [tenantId, mentorId]
      );

      res.json({
        stats: { studentCount: activeStudents.length, pendingTasks, completedTasks, overdueTasks },
        students: activeStudents,
        upcomingReviews,
        recentMeetings
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Students
  router.get('/students', (req, res) => {
    try {
      const tenantId = getTid(req);
      const mentorId = req.query.mentor_id || DEFAULT_MENTOR_ID;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
      const offset = (page - 1) * pageSize;
      const paginated = req.query.page !== undefined || req.query.pageSize !== undefined;

      if (paginated) {
        const total = queryOne(
          `SELECT COUNT(*) as count FROM students s
           JOIN mentor_student_relations msr ON s.id = msr.student_id
           WHERE s.tenant_id = ? AND msr.mentor_id = ? AND msr.status = ?`,
          [tenantId, mentorId, 'active']
        ).count;
        const data = queryAll(
          `SELECT s.*, msr.relation_type, msr.start_date
           FROM students s
           JOIN mentor_student_relations msr ON s.id = msr.student_id
           WHERE s.tenant_id = ? AND msr.mentor_id = ? AND msr.status = ?
           ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
          [tenantId, mentorId, 'active', pageSize, offset]
        );
        res.json({ data, total, page, pageSize });
      } else {
        const students = queryAll(
          `SELECT s.*, msr.relation_type, msr.start_date
           FROM students s
           JOIN mentor_student_relations msr ON s.id = msr.student_id
           WHERE s.tenant_id = ? AND msr.mentor_id = ? AND msr.status = ?
           ORDER BY s.created_at DESC`,
          [tenantId, mentorId, 'active']
        );
        res.json(students);
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/students/:id', (req, res) => {
    try {
      const tenantId = getTid(req);
      const student = queryOne('SELECT * FROM students WHERE tenant_id = ? AND id = ?', [tenantId, req.params.id]);
      if (!student) return res.status(404).json({ error: 'Student not found' });
      const tasks = queryAll('SELECT * FROM mentor_tasks WHERE tenant_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 100', [tenantId, req.params.id]);
      const reviews = queryAll('SELECT * FROM review_stages WHERE tenant_id = ? AND student_id = ? ORDER BY scheduled_date ASC LIMIT 50', [tenantId, req.params.id]);
      const achievements = queryAll('SELECT * FROM achievements WHERE tenant_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 50', [tenantId, req.params.id]);
      const meetings = queryAll(
        `SELECT DISTINCT m.* FROM meeting_records m, json_each(m.student_ids)
         WHERE m.tenant_id = ? AND m.mentor_id = ? AND json_each.value = ?
         ORDER BY m.meeting_date DESC`,
        [tenantId, DEFAULT_MENTOR_ID, +req.params.id]
      );
      const activityLogs = queryAll('SELECT * FROM activity_logs WHERE tenant_id = ? AND entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 20', [tenantId, 'student', req.params.id]);
      res.json({ student, tasks, reviews, achievements, meetings, activityLogs });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/students',
    validateBody({
      name: { required: true, minLength: 1, maxLength: 50 },
      email: { pattern: Patterns.email, message: '邮箱格式不正确' },
      student_id: { minLength: 1, maxLength: 30 },
    }),
    (req, res) => {
    try {
      const { name, email, student_id, grade, major, research_topic, enrollment_date, expected_graduation } = req.body;
      const tenantId = getTid(req);
      const result = run(
        `INSERT INTO students (tenant_id, name, email, student_id, grade, major, research_topic, enrollment_date, expected_graduation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, name, email || null, student_id || null, grade || null, major || null, research_topic || null, enrollment_date || null, expected_graduation || null]
      );
      const mentorId = req.body.mentor_id || DEFAULT_MENTOR_ID;
      run(
        'INSERT INTO mentor_student_relations (tenant_id, mentor_id, student_id, relation_type, start_date) VALUES (?, ?, ?, ?, ?)',
        [tenantId, mentorId, result.lastInsertRowid, 'master', enrollment_date || new Date().toISOString().split('T')[0]]
      );
      res.json({ id: result.lastInsertRowid, name });
    } catch (e) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  router.put('/students/:id', (req, res) => {
    try {
      const { name, email, grade, major, research_topic, status, expected_graduation } = req.body;
      run(
        `UPDATE students SET name = ?, email = ?, grade = ?, major = ?, research_topic = ?, status = ?, expected_graduation = ? WHERE id = ? AND tenant_id = ?`,
        [name, email, grade, major, research_topic, status, expected_graduation, req.params.id, getTid(req)]
      );
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/students/:id', (req, res) => {
    try {
      const tenantId = getTid(req);
      run('UPDATE mentor_student_relations SET status = ? WHERE student_id = ? AND tenant_id = ?', ['ended', req.params.id, tenantId]);
      run('UPDATE students SET status = ? WHERE id = ? AND tenant_id = ?', ['graduated', req.params.id, tenantId]);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Tasks
  router.get('/tasks', (req, res) => {
    try {
      const tenantId = getTid(req);
      const mentorId = req.query.mentor_id || DEFAULT_MENTOR_ID;
      const studentId = req.query.student_id;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
      const offset = (page - 1) * pageSize;
      const paginated = req.query.page !== undefined || req.query.pageSize !== undefined;

      let baseWhere = `mt.tenant_id = ? AND mt.mentor_id = ?`;
      const baseParams = [tenantId, mentorId];
      if (studentId) { baseWhere += ' AND mt.student_id = ?'; baseParams.push(studentId); }

      if (paginated) {
        const total = queryOne(
          `SELECT COUNT(*) as count FROM mentor_tasks mt
           JOIN students s ON mt.student_id = s.id WHERE ${baseWhere}`,
          baseParams
        ).count;
        const data = queryAll(
          `SELECT mt.*, s.name as student_name FROM mentor_tasks mt
           JOIN students s ON mt.student_id = s.id WHERE ${baseWhere}
           ORDER BY mt.created_at DESC LIMIT ? OFFSET ?`,
          [...baseParams, pageSize, offset]
        );
        res.json({ data, total, page, pageSize });
      } else {
        res.json(queryAll(
          `SELECT mt.*, s.name as student_name FROM mentor_tasks mt
           JOIN students s ON mt.student_id = s.id WHERE ${baseWhere}
           ORDER BY mt.created_at DESC`,
          baseParams
        ));
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/tasks',
    validateBody({
      title: { required: true, minLength: 1, maxLength: 200 },
      student_id: { required: true },
    }),
    async (req, res) => {
    try {
      const { mentor_id, student_id, title, description, deadline, priority, category } = req.body;
      const result = run(
        `INSERT INTO mentor_tasks (tenant_id, mentor_id, student_id, title, description, deadline, priority, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [getTid(req), mentor_id || DEFAULT_MENTOR_ID, student_id, title, description || null, deadline || null, priority || 'medium', category || 'general']
      );
      // Auto-sync to agile project
      const agileStory = await syncTaskToAgile(student_id, title, description, deadline, priority);
      // Notify student
      const studentName = queryOne('SELECT name FROM students WHERE id = ?', [student_id])?.name || '';
      createNotification({
        tenant_id: getTid(req),
        mentor_id: mentor_id || DEFAULT_MENTOR_ID,
        user_id: student_id,
        type: 'task',
        title: '新任务指派',
        content: `导师给您指派了新任务「${title}」${deadline ? '，截止时间：' + deadline : ''}`,
        related_id: result.lastInsertRowid,
        related_type: 'mentor_tasks'
      });
      res.json({ id: result.lastInsertRowid, success: true, agile_story_id: agileStory?.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/tasks/:id', (req, res) => {
    try {
      const { title, description, deadline, priority, status, category } = req.body;
      const completedAt = status === 'completed' ? new Date().toISOString() : null;
      run(
        `UPDATE mentor_tasks SET title = ?, description = ?, deadline = ?, priority = ?, status = ?, category = ?, completed_at = ? WHERE id = ? AND tenant_id = ?`,
        [title, description, deadline, priority, status, category, completedAt, req.params.id, getTid(req)]
      );
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/tasks/:id', wrap((req, res) => { run('DELETE FROM mentor_tasks WHERE id = ? AND tenant_id = ?', [req.params.id, getTid(req)]); res.json({ success: true }); }));

  // Reviews
  router.get('/reviews', (req, res) => {
    try {
      const mentorId = req.query.mentor_id || DEFAULT_MENTOR_ID;
      const tenantId = getTid(req);
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
      const offset = (page - 1) * pageSize;
      const paginated = req.query.page !== undefined || req.query.pageSize !== undefined;

      if (paginated) {
        const total = queryOne(
          `SELECT COUNT(*) as count FROM review_stages rs
           JOIN students s ON rs.student_id = s.id
           JOIN mentor_student_relations msr ON s.id = msr.student_id
           WHERE s.tenant_id = ? AND msr.mentor_id = ?`,
          [tenantId, mentorId]
        ).count;
        const data = queryAll(
          `SELECT rs.*, s.name as student_name FROM review_stages rs
           JOIN students s ON rs.student_id = s.id
           JOIN mentor_student_relations msr ON s.id = msr.student_id
           WHERE s.tenant_id = ? AND msr.mentor_id = ?
           ORDER BY rs.scheduled_date ASC LIMIT ? OFFSET ?`,
          [tenantId, mentorId, pageSize, offset]
        );
        res.json({ data, total, page, pageSize });
      } else {
        res.json(queryAll(
          `SELECT rs.*, s.name as student_name FROM review_stages rs
           JOIN students s ON rs.student_id = s.id
           JOIN mentor_student_relations msr ON s.id = msr.student_id
           WHERE s.tenant_id = ? AND msr.mentor_id = ? ORDER BY rs.scheduled_date ASC`,
          [tenantId, mentorId]
        ));
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/reviews',
    validateBody({
      student_id: { required: true },
      stage_type: { required: true, minLength: 1 },
      title: { required: true, minLength: 1, maxLength: 200 },
    }),
    async (req, res) => {
    try {
      const { student_id, stage_type, title, scheduled_date } = req.body;
      const result = run(
        `INSERT INTO review_stages (tenant_id, student_id, stage_type, title, scheduled_date) VALUES (?, ?, ?, ?, ?)`,
        [getTid(req), student_id, stage_type, title, scheduled_date || null]
      );
      // Auto-sync to agile project
      const agileMilestone = await syncReviewToAgile(student_id, title, scheduled_date, stage_type);
      createNotification({
        tenant_id: getTid(req),
        user_id: student_id,
        type: 'review',
        title: '评审节点安排',
        content: `您的「${title}」已安排，时间：${scheduled_date || '待定'}`,
        related_id: result.lastInsertRowid,
        related_type: 'review_stages'
      });
      res.json({ id: result.lastInsertRowid, success: true, agile_milestone_id: agileMilestone?.id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/reviews/:id', (req, res) => {
    try {
      const { status, scheduled_date, completed_date, score, feedback, notes } = req.body;
      const prev = queryOne('SELECT student_id, title FROM review_stages WHERE id = ? AND tenant_id = ?', [req.params.id, getTid(req)]);
      run(
        `UPDATE review_stages SET status = ?, scheduled_date = ?, completed_date = ?, score = ?, feedback = ?, notes = ? WHERE id = ? AND tenant_id = ?`,
        [status || null, scheduled_date || null, completed_date || null, score ?? null, feedback || null, notes || null, req.params.id, getTid(req)]
      );
      // Notify on feedback or completion
      if (prev && (feedback || status === 'completed')) {
        createNotification({
          tenant_id: getTid(req),
          user_id: prev.student_id,
          type: 'review',
          title: status === 'completed' ? '评审已完成' : '评审反馈更新',
          content: `「${prev.title}」${score ? '得分：' + score + '，' : ''}${feedback || ''}`,
          related_id: +req.params.id,
          related_type: 'review_stages'
        });
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/reviews/:id', wrap((req, res) => { run('DELETE FROM review_stages WHERE id = ? AND tenant_id = ?', [req.params.id, getTid(req)]); res.json({ success: true }); }));

  // Meetings
  router.get('/meetings', (req, res) => {
    try {
      const mentorId = req.query.mentor_id || DEFAULT_MENTOR_ID;
      const tenantId = getTid(req);
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
      const offset = (page - 1) * pageSize;
      const paginated = req.query.page !== undefined || req.query.pageSize !== undefined;

      if (paginated) {
        const total = queryOne(
          'SELECT COUNT(*) as count FROM meeting_records WHERE tenant_id = ? AND mentor_id = ?',
          [tenantId, mentorId]
        ).count;
        const data = queryAll(
          'SELECT * FROM meeting_records WHERE tenant_id = ? AND mentor_id = ? ORDER BY meeting_date DESC LIMIT ? OFFSET ?',
          [tenantId, mentorId, pageSize, offset]
        );
        res.json({ data, total, page, pageSize });
      } else {
        res.json(queryAll('SELECT * FROM meeting_records WHERE tenant_id = ? AND mentor_id = ? ORDER BY meeting_date DESC LIMIT 50', [tenantId, mentorId]));
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/meetings',
    validateBody({
      student_ids: { required: true },
      meeting_date: { required: true, pattern: Patterns.date, message: '日期格式应为 YYYY-MM-DD' },
      topic: { required: true, minLength: 1, maxLength: 200 },
    }),
    (req, res) => {
    try {
      const { mentor_id, student_ids, meeting_date, meeting_type, topic, summary, action_items, next_meeting_date } = req.body;
      const result = run(
        `INSERT INTO meeting_records (tenant_id, mentor_id, student_ids, meeting_date, meeting_type, topic, summary, action_items, next_meeting_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [getTid(req), mentor_id || DEFAULT_MENTOR_ID, JSON.stringify(student_ids || []), meeting_date, meeting_type || 'individual', topic, summary || null, action_items || null, next_meeting_date || null]
      );
      // Notify attendees
      for (const sid of student_ids || []) {
        createNotification({
          tenant_id: getTid(req),
          mentor_id: mentor_id || DEFAULT_MENTOR_ID,
          user_id: sid,
          type: 'meeting',
          title: '组会安排',
          content: `您有一场「${topic}」安排在 ${meeting_date}`,
          related_id: result.lastInsertRowid,
          related_type: 'meeting_records'
        });
      }
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/meetings/:id', (req, res) => {
    try {
      const { student_ids, meeting_date, meeting_type, topic, summary, action_items, next_meeting_date, status } = req.body;
      run(
        `UPDATE meeting_records SET student_ids = ?, meeting_date = ?, meeting_type = ?, topic = ?, summary = ?, action_items = ?, next_meeting_date = ?, status = ? WHERE id = ? AND tenant_id = ?`,
        [JSON.stringify(student_ids || []), meeting_date, meeting_type || null, topic || null, summary || null, action_items || null, next_meeting_date || null, status || null, req.params.id, getTid(req)]
      );
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/meetings/:id', wrap((req, res) => { run('DELETE FROM meeting_records WHERE id = ? AND tenant_id = ?', [req.params.id, getTid(req)]); res.json({ success: true }); }));

  // Achievements
  router.get('/achievements', (req, res) => {
    try {
      const tenantId = getTid(req);
      const studentId = req.query.student_id;
      let sql = 'SELECT a.* FROM achievements a JOIN students s ON a.student_id = s.id WHERE s.tenant_id = ?';
      const params = [tenantId];
      if (studentId) { sql += ' AND a.student_id = ?'; params.push(studentId); }
      sql += ' ORDER BY a.created_at DESC';
      res.json(queryAll(sql, params));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/achievements', (req, res) => {
    try {
      const { student_id, title, achievement_type, journal_or_conference, publish_date, doi_or_link, status, notes } = req.body;
      const result = run(
        `INSERT INTO achievements (tenant_id, student_id, title, achievement_type, journal_or_conference, publish_date, doi_or_link, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [getTid(req), student_id, title, achievement_type || 'paper', journal_or_conference || null, publish_date || null, doi_or_link || null, status || 'published', notes || null]
      );
      createNotification({
        tenant_id: getTid(req),
        user_id: student_id,
        type: 'achievement',
        title: '学术成果记录更新',
        content: `您的「${title}」已录入系统`,
        related_id: result.lastInsertRowid,
        related_type: 'achievements'
      });
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/achievements/:id', (req, res) => {
    try {
      const { title, achievement_type, journal_or_conference, publish_date, doi_or_link, status, notes } = req.body;
      run(
        `UPDATE achievements SET title = ?, achievement_type = ?, journal_or_conference = ?, publish_date = ?, doi_or_link = ?, status = ?, notes = ? WHERE id = ? AND tenant_id = ?`,
        [title, achievement_type || null, journal_or_conference || null, publish_date || null, doi_or_link || null, status || null, notes || null, req.params.id, getTid(req)]
      );
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/achievements/:id', wrap((req, res) => { run('DELETE FROM achievements WHERE id = ? AND tenant_id = ?', [req.params.id, getTid(req)]); res.json({ success: true }); }));

  // Notifications
  router.get('/notifications', (req, res) => {
    try {
      const mentorId = req.query.mentor_id || DEFAULT_MENTOR_ID;
      const userId = req.query.user_id;
      const isRead = req.query.is_read;
      const type = req.query.type;
      let sql = 'SELECT * FROM notifications WHERE tenant_id = ?';
      const params = [getTid(req)];
      if (userId) {
        sql += ' AND (user_id = ? OR mentor_id = ?)';
        params.push(userId, userId);
      } else {
        sql += ' AND mentor_id = ?';
        params.push(mentorId);
      }
      if (isRead !== undefined) { sql += ' AND is_read = ?'; params.push(isRead); }
      if (type) { sql += ' AND type = ?'; params.push(type); }
      sql += ' ORDER BY created_at DESC';
      res.json(queryAll(sql, params));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/notifications/unread-count', (req, res) => {
    try {
      const userId = req.query.user_id;
      const mentorId = req.query.mentor_id || DEFAULT_MENTOR_ID;
      let sql = 'SELECT COUNT(*) as count FROM notifications WHERE is_read = 0 AND tenant_id = ?';
      const params = [getTid(req)];
      if (userId) {
        sql += ' AND (user_id = ? OR mentor_id = ?)';
        params.push(userId, userId);
      } else {
        sql += ' AND mentor_id = ?';
        params.push(mentorId);
      }
      res.json(queryOne(sql, params));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/notifications/:id/read', wrap((req, res) => { run('UPDATE notifications SET is_read = 1 WHERE id = ? AND tenant_id = ?', [req.params.id, getTid(req)]); res.json({ success: true }); }));

  router.post('/notifications/mark-all-read', (req, res) => {
    try {
      const userId = req.query.user_id;
      const mentorId = req.query.mentor_id || DEFAULT_MENTOR_ID;
      if (userId) {
        run('UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR mentor_id = ?) AND is_read = 0 AND tenant_id = ?', [userId, userId, getTid(req)]);
      } else {
        run('UPDATE notifications SET is_read = 1 WHERE mentor_id = ? AND is_read = 0 AND tenant_id = ?', [mentorId, getTid(req)]);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/notifications/:id', wrap((req, res) => { run('DELETE FROM notifications WHERE id = ? AND tenant_id = ?', [req.params.id, getTid(req)]); res.json({ success: true }); }));

  // Calendar — aggregate events from meetings, tasks, reviews, sprints, milestones
  router.get('/calendar', (req, res) => {
    try {
      const mentorId = req.query.mentor_id || DEFAULT_MENTOR_ID;
      const studentId = req.query.student_id;
      const start = req.query.start;
      const end = req.query.end;
      const tenantId = getTid(req);
      const events = [];

      // Meetings
      const meetings = queryAll(
        `SELECT id, topic as title, meeting_date as date, meeting_type, student_ids, 'meeting' as type
         FROM meeting_records WHERE mentor_id = ? AND tenant_id = ? ${start && end ? 'AND meeting_date >= ? AND meeting_date <= ?' : ''}`,
        start && end ? [mentorId, tenantId, start, end] : [mentorId, tenantId]
      );
      for (const m of meetings) {
        events.push({
          id: `meeting-${m.id}`, title: m.title, date: m.date, type: 'meeting',
          subtype: m.meeting_type, related_id: m.id, related_type: 'meeting_records',
          student_ids: JSON.parse(m.student_ids || '[]')
        });
      }

      // Tasks
      let taskSql = `SELECT mt.id, mt.title, mt.deadline as date, mt.status, mt.student_id, s.name as student_name
                     FROM mentor_tasks mt JOIN students s ON mt.student_id = s.id
                     WHERE mt.mentor_id = ? AND mt.tenant_id = ? AND mt.deadline IS NOT NULL`;
      const taskParams = [mentorId, tenantId];
      if (start && end) { taskSql += ' AND mt.deadline >= ? AND mt.deadline <= ?'; taskParams.push(start, end); }
      if (studentId) { taskSql += ' AND mt.student_id = ?'; taskParams.push(studentId); }
      const tasks = queryAll(taskSql, taskParams);
      for (const t of tasks) {
        events.push({
          id: `task-${t.id}`, title: t.title, date: t.date, type: 'task',
          status: t.status, related_id: t.id, related_type: 'mentor_tasks',
          student_id: t.student_id, student_name: t.student_name
        });
      }

      // Reviews
      let reviewSql = `SELECT rs.id, rs.title, rs.scheduled_date as date, rs.status, rs.student_id, s.name as student_name
                       FROM review_stages rs JOIN students s ON rs.student_id = s.id
                       JOIN mentor_student_relations msr ON s.id = msr.student_id
                       WHERE msr.mentor_id = ? AND rs.tenant_id = ? AND rs.scheduled_date IS NOT NULL`;
      const reviewParams = [mentorId, tenantId];
      if (start && end) { reviewSql += ' AND rs.scheduled_date >= ? AND rs.scheduled_date <= ?'; reviewParams.push(start, end); }
      if (studentId) { reviewSql += ' AND rs.student_id = ?'; reviewParams.push(studentId); }
      const reviews = queryAll(reviewSql, reviewParams);
      for (const r of reviews) {
        events.push({
          id: `review-${r.id}`, title: r.title, date: r.date, type: 'review',
          status: r.status, related_id: r.id, related_type: 'review_stages',
          student_id: r.student_id, student_name: r.student_name
        });
      }

      // Sprints (start + end)
      const sprints = queryAll(
        `SELECT id, name, start_date, end_date, status FROM sprints WHERE tenant_id = ?
         ${start && end ? 'AND ((start_date >= ? AND start_date <= ?) OR (end_date >= ? AND end_date <= ?))' : ''}`,
        start && end ? [tenantId, start, end, start, end] : [tenantId]
      );
      for (const s of sprints) {
        events.push({
          id: `sprint-start-${s.id}`, title: `「${s.name}」开始`, date: s.start_date, type: 'sprint',
          subtype: 'start', status: s.status, related_id: s.id, related_type: 'sprints'
        });
        events.push({
          id: `sprint-end-${s.id}`, title: `「${s.name}」结束`, date: s.end_date, type: 'sprint',
          subtype: 'end', status: s.status, related_id: s.id, related_type: 'sprints'
        });
      }

      // Agile milestones
      const milestones = queryAll(
        `SELECT id, name, due_date as date, status FROM agile_milestones WHERE tenant_id = ? AND due_date IS NOT NULL
         ${start && end ? 'AND due_date >= ? AND due_date <= ?' : ''}`,
        start && end ? [tenantId, start, end] : [tenantId]
      );
      for (const m of milestones) {
        events.push({
          id: `milestone-${m.id}`, title: m.name, date: m.date, type: 'milestone',
          status: m.status, related_id: m.id, related_type: 'agile_milestones'
        });
      }

      // Sort by date
      events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      res.json(events);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Attendance
  router.post('/attendance/check-in', (req, res) => {
    try {
      const { user_id, student_id, work_content, check_type } = req.body;
      const now = new Date().toISOString();
      // Prevent duplicate check-in on same day
      const today = now.split('T')[0];
      const existing = queryOne(
        'SELECT id FROM attendance_records WHERE user_id = ? AND date(check_in_time) = ? AND tenant_id = ? LIMIT 1',
        [user_id, today, getTid(req)]
      );
      if (existing) return res.status(409).json({ error: '今日已打卡' });
      const result = run(
        `INSERT INTO attendance_records (user_id, student_id, check_in_time, work_content, check_type, status, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user_id, student_id || null, now, work_content || null, check_type || 'normal', 'checked_in', getTid(req)]
      );
      res.json({ id: result.lastInsertRowid, check_in_time: now, success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/attendance/check-out', (req, res) => {
    try {
      const { id, work_content } = req.body;
      const record = queryOne('SELECT * FROM attendance_records WHERE id = ?', [id]);
      if (!record) return res.status(404).json({ error: '记录不存在' });
      if (record.status !== 'checked_in') return res.status(409).json({ error: '已签退' });
      const now = new Date().toISOString();
      const checkIn = new Date(record.check_in_time);
      const checkOut = new Date(now);
      const hours = Math.max(0, (checkOut - checkIn) / 3600000);
      run(
        `UPDATE attendance_records SET check_out_time = ?, work_content = ?, work_hours = ROUND(?, 2), status = ?, updated_at = ? WHERE id = ?`,
        [now, work_content || record.work_content, hours, 'checked_out', now, id]
      );
      res.json({ id, check_out_time: now, work_hours: Math.round(hours * 100) / 100, success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/attendance', (req, res) => {
    try {
      const userId = req.query.user_id;
      const studentId = req.query.student_id;
      const start = req.query.start;
      const end = req.query.end;
      let sql = `SELECT ar.*, u.name as user_name, s.name as student_name
                 FROM attendance_records ar
                 LEFT JOIN users u ON ar.user_id = u.id
                 LEFT JOIN students s ON ar.student_id = s.id
                 WHERE ar.tenant_id = ?`;
      const params = [getTid(req)];
      if (userId) { sql += ' AND ar.user_id = ?'; params.push(userId); }
      if (studentId) { sql += ' AND ar.student_id = ?'; params.push(studentId); }
      if (start) { sql += ' AND date(ar.check_in_time) >= ?'; params.push(start); }
      if (end) { sql += ' AND date(ar.check_in_time) <= ?'; params.push(end); }
      sql += ' ORDER BY ar.check_in_time DESC';
      res.json(queryAll(sql, params));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/attendance/stats', (req, res) => {
    try {
      const userId = req.query.user_id;
      const studentId = req.query.student_id;
      const start = req.query.start;
      const end = req.query.end;
      let sql = `SELECT
        COUNT(*) as total_days,
        SUM(CASE WHEN status = 'checked_out' THEN 1 ELSE 0 END) as completed_days,
        SUM(work_hours) as total_hours,
        AVG(work_hours) as avg_hours,
        MAX(work_hours) as max_hours
        FROM attendance_records WHERE tenant_id = ?`;
      const params = [getTid(req)];
      if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
      if (studentId) { sql += ' AND student_id = ?'; params.push(studentId); }
      if (start) { sql += ' AND date(check_in_time) >= ?'; params.push(start); }
      if (end) { sql += ' AND date(check_in_time) <= ?'; params.push(end); }
      const stats = queryOne(sql, params);
      // Daily breakdown
      let dailySql = `SELECT date(check_in_time) as day,
        COUNT(*) as count,
        SUM(work_hours) as hours
        FROM attendance_records WHERE tenant_id = ?`;
      const dailyParams = [getTid(req)];
      if (userId) { dailySql += ' AND user_id = ?'; dailyParams.push(userId); }
      if (studentId) { dailySql += ' AND student_id = ?'; dailyParams.push(studentId); }
      if (start) { dailySql += ' AND date(check_in_time) >= ?'; dailyParams.push(start); }
      if (end) { dailySql += ' AND date(check_in_time) <= ?'; dailyParams.push(end); }
      dailySql += ' GROUP BY date(check_in_time) ORDER BY day';
      const daily = queryAll(dailySql, dailyParams);
      res.json({ ...stats, daily });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Files
  router.post('/files/upload', upload.single('file'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: '未选择文件' });
      const { category, tags, description, uploaded_by, student_id, mentor_id } = req.body;
      const result = run(
        `INSERT INTO files (original_name, stored_name, mime_type, size, category, tags, description, uploaded_by, student_id, mentor_id, path, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.file.originalname,
          req.file.filename,
          req.file.mimetype,
          req.file.size,
          category || 'document',
          tags || null,
          description || null,
          uploaded_by || DEFAULT_MENTOR_ID,
          student_id || null,
          mentor_id || DEFAULT_MENTOR_ID,
          req.file.filename,
          getTid(req),
        ]
      );
      res.json({ id: result.lastInsertRowid, success: true, original_name: req.file.originalname });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/files', (req, res) => {
    try {
      const studentId = req.query.student_id;
      const category = req.query.category;
      let sql = `SELECT f.*, u.name as uploader_name, s.name as student_name
                 FROM files f
                 LEFT JOIN users u ON f.uploaded_by = u.id
                 LEFT JOIN students s ON f.student_id = s.id
                 WHERE f.tenant_id = ?`;
      const params = [getTid(req)];
      if (studentId) { sql += ' AND f.student_id = ?'; params.push(studentId); }
      if (category) { sql += ' AND f.category = ?'; params.push(category); }
      sql += ' ORDER BY f.created_at DESC';
      res.json(queryAll(sql, params));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/files/:id/download', (req, res) => {
    try {
      const file = queryOne('SELECT * FROM files WHERE id = ? AND tenant_id = ?', [req.params.id, getTid(req)]);
      if (!file) return res.status(404).json({ error: '文件不存在' });
      const filePath = join(UPLOAD_PATH, file.path);
      if (!existsSync(filePath)) return res.status(404).json({ error: '文件已丢失' });
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      res.sendFile(filePath);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/files/:id', (req, res) => {
    try {
      const { original_name, category, tags, description } = req.body;
      run(
        'UPDATE files SET original_name = ?, category = ?, tags = ?, description = ? WHERE id = ? AND tenant_id = ?',
        [original_name, category, tags, description, req.params.id, getTid(req)]
      );
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/files/:id', wrap((req, res) => {
    const file = queryOne('SELECT * FROM files WHERE id = ? AND tenant_id = ?', [req.params.id, getTid(req)]);
    if (file) {
      const filePath = join(UPLOAD_PATH, file.path);
      try { if (existsSync(filePath)) unlinkSync(filePath); } catch (e) { console.error('Delete file failed:', e.message); }
    }
    run('DELETE FROM files WHERE id = ? AND tenant_id = ?', [req.params.id, getTid(req)]);
    res.json({ success: true });
  }));

  // Activity Logs
  router.get('/activity-logs', (req, res) => {
    try {
      const limit = req.query.limit || 20;
      res.json(queryAll(
        'SELECT * FROM activity_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?',
        [getTid(req), limit]
      ));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/activity-logs', (req, res) => {
    try {
      const { mentor_id, action, entity_type, entity_id, details } = req.body;
      const result = run(
        `INSERT INTO activity_logs (mentor_id, action, entity_type, entity_id, details, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [mentor_id || DEFAULT_MENTOR_ID, action, entity_type, entity_id, details, getTid(req)]
      );
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Task Comments
  router.get('/tasks/:id/comments', wrap((req, res) => { res.json(queryAll('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC LIMIT 100', [req.params.id])); }));

  router.post('/tasks/:id/comments', (req, res) => {
    try {
      const { author_name, content } = req.body;
      const result = run(
        `INSERT INTO task_comments (task_id, author_name, content) VALUES (?, ?, ?)`,
        [req.params.id, author_name || '导师', content]
      );
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/tasks/:id/comments/:cid', wrap((req, res) => { run('DELETE FROM task_comments WHERE id = ? AND task_id = ?', [req.params.cid, req.params.id]); res.json({ success: true }); }));

  // Seed
  router.post('/seed', (req, res) => {
    try {
      if (queryOne('SELECT COUNT(*) as count FROM mentors').count === 0) {
        run(`INSERT INTO mentors (name, email, department, title) VALUES (?, ?, ?, ?)`,
          ['张教授', 'prof.zhang@university.edu.cn', '计算机学院', '博士生导师']);
      }
      if (queryOne('SELECT COUNT(*) as count FROM students').count === 0) {
        const demoStudents = [
          ['李明', 'liming@stu.edu.cn', '202301001', '研一', '计算机科学', '基于深度学习的图像分类研究', '2023-09-01', '2026-06-30'],
          ['王芳', 'wangfang@stu.edu.cn', '202301002', '研一', '软件工程', '微服务架构下的智能运维系统', '2023-09-01', '2026-06-30'],
          ['张伟', 'zhangwei@stu.edu.cn', '202201003', '研二', '人工智能', '大语言模型在代码生成中的应用', '2022-09-01', '2025-06-30'],
          ['刘洋', 'liuyang@stu.edu.cn', '202201004', '研二', '数据科学', '时序数据异常检测算法研究', '2022-09-01', '2025-06-30'],
          ['陈静', 'chenjing@stu.edu.cn', '202101005', '研三', '网络安全', '联邦学习中的隐私保护机制', '2021-09-01', '2024-06-30'],
        ];
        demoStudents.forEach(s => {
          const r = run(`INSERT INTO students (name, email, student_id, grade, major, research_topic, enrollment_date, expected_graduation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, s);
          run(`INSERT INTO mentor_student_relations (mentor_id, student_id, relation_type, start_date) VALUES (?, ?, ?, ?)`,
            [1, r.lastInsertRowid, 'master', s[6]]);
        });
        const demoReviews = [
          [1, 'proposal', '开题答辩', '2024-03-15'], [2, 'proposal', '开题答辩', '2024-03-20'],
          [3, 'midterm', '中期考核', '2024-06-01'], [4, 'midterm', '中期考核', '2024-06-10'],
          [5, 'defense', '毕业答辩', '2024-05-20'],
        ];
        demoReviews.forEach(r => run(`INSERT INTO review_stages (student_id, stage_type, title, scheduled_date) VALUES (?, ?, ?, ?)`, r));
        const demoTasks = [
          [1, 1, '阅读相关文献综述', '完成领域内20篇核心论文阅读', '2024-04-01', 'high', 'reading'],
          [1, 2, '搭建实验环境', '配置GPU服务器和深度学习框架', '2024-03-30', 'high', 'experiment'],
          [1, 3, '完成开题报告初稿', '撰写开题报告并提交导师审核', '2024-03-10', 'urgent', 'writing'],
          [1, 4, '复现基准模型', '复现3篇SOTA论文的实验结果', '2024-04-15', 'medium', 'experiment'],
          [1, 5, '准备答辩PPT', '制作毕业答辩演示文稿', '2024-05-10', 'high', 'writing'],
        ];
        demoTasks.forEach(t => run(`INSERT INTO mentor_tasks (mentor_id, student_id, title, description, deadline, priority, category) VALUES (?, ?, ?, ?, ?, ?, ?)`, t));
        const demoMeetings = [
          [1, JSON.stringify([1,2,3]), '2024-03-01', 'group', '本周组会', '讨论各学生进度，李明进度稍慢需加快', '李明：下周完成环境搭建；王芳：开始文献阅读', '2024-03-08'],
          [1, JSON.stringify([3,4]), '2024-02-25', 'group', '研二进度检查', '张伟中期材料准备充分，刘洋实验遇到数据缺失问题', '刘洋：联系数据提供方补全数据', '2024-03-04'],
          [1, JSON.stringify([1]), '2024-02-20', 'individual', '李明朗谈', '了解李明研究兴趣和困难', '确定研究方向为图像分类', '2024-03-01'],
        ];
        demoMeetings.forEach(m => run(`INSERT INTO meeting_records (mentor_id, student_ids, meeting_date, meeting_type, topic, summary, action_items, next_meeting_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, m));
      }
      // Seed agile sprints & tasks if missing
      if (queryOne('SELECT COUNT(*) as count FROM sprints').count === 0) {
        const projectId = 1;
        // Seed user stories first
        const demoStories = [
          ['US-1', projectId, '完成入学材料准备', '准备并提交所有入学所需材料', 'S', 5, 1, 'done', '材料齐全并提交'],
          ['US-2', projectId, '建立文献管理体系', '配置Zotero和Obsidian，建立文献分类体系', 'A', 3, 1, 'done', '工具配置完成，导入至少10篇文献'],
          ['US-3', projectId, '完成文献调研', '阅读并整理研究方向核心文献20篇', 'S', 8, 2, 'in_progress', '完成文献笔记和综述初稿'],
          ['US-4', projectId, '确定研究方向', '与导师讨论并确定具体研究方向和问题', 'S', 5, 2, 'in_progress', '研究问题明确，有可验证的假设'],
          ['US-5', projectId, '撰写文献综述', '完成研究方向的文献综述初稿', 'A', 5, 2, 'backlog', '综述结构完整，引用规范'],
          ['US-6', projectId, '设计实验方案', '基于研究问题设计实验方案', 'B', 8, 3, 'backlog', '实验方案通过导师审核'],
          ['US-7', projectId, '搭建实验环境', '配置实验所需的软硬件环境', 'B', 5, 3, 'backlog', '环境可用，完成初步测试'],
          ['US-8', projectId, '撰写开题报告', '完成开题报告初稿', 'A', 8, 3, 'backlog', '报告结构完整'],
          ['US-9', projectId, '准备开题答辩', '制作答辩PPT并练习', 'A', 3, 4, 'backlog', 'PPT完成，模拟答辩通过'],
        ];
        demoStories.forEach(s => run('INSERT INTO user_stories (story_id, project_id, title, description, priority, story_points, sprint_id, status, acceptance_criteria) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', s));
        const demoSprints = [
          [projectId, 1, 'Sprint 1：入学准备与文献调研', '2026-06-01', '2026-06-14', '完成入学材料准备，建立文献管理体系', 'completed'],
          [projectId, 2, 'Sprint 2：研究方向探索', '2026-06-15', '2026-06-28', '确定研究方向，完成文献综述初稿', 'active'],
          [projectId, 3, 'Sprint 3：实验设计与开题', '2026-06-29', '2026-07-12', '完成实验方案设计，准备开题报告', 'planned'],
          [projectId, 4, 'Sprint 4：开题答辩准备', '2026-07-13', '2026-07-26', '完善开题报告，准备答辩PPT', 'planned'],
        ];
        demoSprints.forEach(s => run('INSERT INTO sprints (project_id, number, name, start_date, end_date, goal, status) VALUES (?, ?, ?, ?, ?, ?, ?)', s));
        const demoAgileTasks = [
          [1, 1, '准备入学材料清单', 'done', 1, '2026-06-03'],
          [2, 1, '联系导师确认研究方向', 'done', 2, '2026-06-05'],
          [3, 1, '配置Zotero文献管理工具', 'done', 3, '2026-06-07'],
          [4, 1, '搭建Obsidian知识库', 'done', 4, '2026-06-10'],
          [5, 1, '阅读第一批核心文献(5篇)', 'done', 5, '2026-06-14'],
          [6, 2, '精读文献并做笔记(10篇)', 'in_progress', 1, '2026-06-20'],
          [7, 2, '撰写文献综述初稿', 'this_sprint', 2, '2026-06-25'],
          [8, 2, '调研实验方法和工具', 'this_sprint', 3, '2026-06-28'],
          [9, 2, '整理研究问题和假设', 'todo', 4, '2026-06-28'],
          [10, 3, '设计实验方案', 'todo', 1, '2026-07-05'],
          [11, 3, '搭建实验环境', 'todo', 2, '2026-07-08'],
          [12, 3, '撰写开题报告初稿', 'todo', 3, '2026-07-12'],
          [13, 4, '修改开题报告', 'todo', 1, '2026-07-19'],
          [14, 4, '制作答辩PPT', 'todo', 2, '2026-07-23'],
          [15, 4, '模拟答辩练习', 'todo', 3, '2026-07-26'],
        ];
        demoAgileTasks.forEach(t => run('INSERT INTO agile_tasks (story_id, sprint_id, title, status, sort_order, due_date) VALUES (?, ?, ?, ?, ?, ?)', t));
        const demoStandups = [
          [1, '2026-06-02', '完成入学材料清单整理', '联系导师确认见面时间', '无', '第一天，状态良好'],
          [1, '2026-06-05', '与导师会面，确定研究方向', '开始配置文献管理工具', '无', '导师建议先从综述类论文读起'],
          [2, '2026-06-16', '完成第一批文献阅读', '开始精读并做笔记', '部分文献获取困难', '已通过馆际互借申请'],
        ];
        demoStandups.forEach(s => run('INSERT INTO standup_logs (sprint_id, date, yesterday, today, blockers, notes) VALUES (?, ?, ?, ?, ?, ?)', s));
        // Link student to agile project
        run('INSERT OR IGNORE INTO student_projects (student_id, agile_project_id, project_name) VALUES (?, ?, ?)', [1, projectId, '研途启航']);
        // Seed literature
        const demoLit = [
          [projectId, 'Attention Is All You Need', 'Vaswani et al.', 'NeurIPS', 2017, '10.48550/arXiv.1706.03762', '提出Transformer架构', '核心论文，必读', 'attention,transformer', 5, 'done'],
          [projectId, 'BERT: Pre-training of Deep Bidirectional Transformers', 'Devlin et al.', 'NAACL', 2019, '10.18653/v1/N19-1423', '双向预训练语言模型', 'NLP基础', 'bert,pre-training', 4, 'done'],
          [projectId, 'A Survey of Large Language Models', 'Zhao et al.', 'arXiv', 2023, '10.48550/arXiv.2303.18223', '大语言模型综述', '了解领域全貌', 'llm,survey', 4, 'reading'],
        ];
        demoLit.forEach(l => run('INSERT INTO literature (project_id, title, authors, journal, year, doi, abstract, notes, tags, rating, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', l));
      }
      res.json({ success: true, message: 'Mentor data seeded' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // === Student-Project Link ===
  router.get('/students/:id/projects', (req, res) => {
    try {
      const links = queryAll('SELECT * FROM student_projects WHERE student_id = ? LIMIT 20', [req.params.id]);
      res.json(links);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/students/:id/projects', (req, res) => {
    try {
      const { agile_project_id, project_name } = req.body;
      const result = run('INSERT INTO student_projects (student_id, agile_project_id, project_name) VALUES (?, ?, ?)',
        [req.params.id, agile_project_id, project_name]);
      res.json({ id: result.lastInsertRowid, success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/students/:studentId/projects/:linkId', (req, res) => {
    try {
      run('DELETE FROM student_projects WHERE id = ? AND student_id = ?', [req.params.linkId, req.params.studentId]);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

export default router;
