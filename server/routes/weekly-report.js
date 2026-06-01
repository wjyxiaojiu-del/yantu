import { Router } from 'express';
import { queryAll, queryOne, run } from '../db.js';
import { wrap } from '../middleware/wrap.js';
import { getTenantId } from '../middleware/tenant.js';

const router = Router();

function getTid(req) {
  return req.tenantId || getTenantId(req);
}

function getWeekRange(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diffToMonday));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const pad = n => String(n).padStart(2, '0');
  const fmt = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const getWeekNumber = dt => {
    const start = new Date(dt.getFullYear(), 0, 1);
    const diff = dt - start + ((start.getDay() + 1) % 7) * 86400000;
    return Math.ceil(diff / 604800000);
  };
  return {
    start: fmt(monday),
    end: fmt(sunday),
    label: `${monday.getFullYear()}年第${getWeekNumber(monday)}周`,
  };
}

// GET /api/weekly-reports?student_id=&week_start=&week_end=
router.get('/', wrap((req, res) => {
  const tenantId = getTid(req);
  const { student_id, week_start, week_end, limit = '20' } = req.query;
  let sql = 'SELECT * FROM weekly_reports WHERE tenant_id = ?';
  const params = [tenantId];
  if (student_id) { sql += ' AND student_id = ?'; params.push(student_id); }
  if (week_start) { sql += ' AND week_start >= ?'; params.push(week_start); }
  if (week_end) { sql += ' AND week_end <= ?'; params.push(week_end); }
  sql += ' ORDER BY week_start DESC LIMIT ?';
  params.push(Number(limit));
  res.json(queryAll(sql, params));
}));

// GET /api/weekly-reports/stats - 导师看板统计
router.get('/stats', wrap((req, res) => {
  const tenantId = getTid(req);
  const { week_start, week_end } = req.query;
  const range = week_start && week_end ? { start: week_start, end: week_end } : getWeekRange();

  const reports = queryAll(`
    SELECT wr.*, s.name as student_name, s.grade
    FROM weekly_reports wr
    JOIN students s ON wr.student_id = s.id
    WHERE wr.tenant_id = ? AND wr.week_start = ? AND wr.week_end = ?
    ORDER BY s.name
  `, [tenantId, range.start, range.end]);

  const submittedCount = reports.filter(r => r.status === 'submitted').length;
  const totalStudents = queryOne('SELECT COUNT(*) as c FROM students WHERE tenant_id = ? AND status = ?', [tenantId, 'active']).c;

  res.json({
    period: range,
    totalStudents,
    submittedCount,
    draftCount: reports.length - submittedCount,
    submissionRate: totalStudents ? Math.round(submittedCount / totalStudents * 100) : 0,
    reports,
  });
}));

// GET /api/weekly-reports/:id
router.get('/:id', wrap((req, res) => {
  const tenantId = getTid(req);
  const report = queryOne('SELECT * FROM weekly_reports WHERE tenant_id = ? AND id = ?', [tenantId, req.params.id]);
  if (!report) return res.status(404).json({ error: '周报不存在' });
  const student = queryOne('SELECT name, grade FROM students WHERE id = ?', [report.student_id]);
  res.json({ ...report, student_name: student?.name, student_grade: student?.grade });
}));

// POST /api/weekly-reports/generate
router.post('/generate', wrap((req, res) => {
  const tenantId = getTid(req);
  const { student_id, week_start, week_end } = req.body;
  if (!student_id) return res.status(400).json({ error: '需要 student_id' });

  const range = week_start && week_end
    ? { start: week_start, end: week_end, label: `${week_start} ~ ${week_end}` }
    : getWeekRange();

  // Check existing
  const existing = queryOne(
    'SELECT id FROM weekly_reports WHERE tenant_id = ? AND student_id = ? AND week_start = ? AND week_end = ?',
    [tenantId, student_id, range.start, range.end]
  );
  if (existing) return res.status(409).json({ error: '该周周报已存在', id: existing.id });

  // Aggregate attendance
  const attendance = queryOne(`
    SELECT COUNT(DISTINCT date(check_in_time)) as days, SUM(work_hours) as hours
    FROM attendance_records
    WHERE tenant_id = ? AND student_id = ? AND date(check_in_time) BETWEEN ? AND ?
  `, [tenantId, student_id, range.start, range.end]);

  // Aggregate tasks
  const tasks = queryOne(`
    SELECT
      COUNT(CASE WHEN status = 'completed' AND completed_at BETWEEN ? AND datetime(?, '+1 day') THEN 1 END) as completed,
      COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
      COUNT(CASE WHEN status = 'pending' AND deadline < ? THEN 1 END) as overdue
    FROM mentor_tasks
    WHERE tenant_id = ? AND student_id = ?
  `, [range.start, range.end, range.end, tenantId, student_id]);

  // Aggregate new tasks created this week
  const newTasks = queryOne(`
    SELECT COUNT(*) as c FROM mentor_tasks
    WHERE tenant_id = ? AND student_id = ? AND date(created_at) BETWEEN ? AND ?
  `, [tenantId, student_id, range.start, range.end]);

  // Aggregate literature
  const literature = queryOne(`
    SELECT COUNT(*) as c FROM literature l
    JOIN student_projects sp ON l.project_id = sp.agile_project_id
    JOIN students s ON sp.student_id = s.id
    WHERE s.tenant_id = ? AND sp.student_id = ? AND date(l.created_at) BETWEEN ? AND ?
  `, [tenantId, student_id, range.start, range.end]);

  // Aggregate meetings
  const meetings = queryAll(`
    SELECT student_ids FROM meeting_records
    WHERE tenant_id = ? AND date(meeting_date) BETWEEN ? AND ?
  `, [tenantId, range.start, range.end]);
  let meetingsAttended = 0;
  for (const m of meetings) {
    try { if (JSON.parse(m.student_ids || '[]').includes(Number(student_id))) meetingsAttended++; } catch { /* ignore */ }
  }

  // Aggregate achievements
  const achievements = queryOne(`
    SELECT COUNT(*) as c FROM achievements
    WHERE tenant_id = ? AND student_id = ? AND date(created_at) BETWEEN ? AND ?
  `, [tenantId, student_id, range.start, range.end]);

  const result = run(`
    INSERT INTO weekly_reports
    (tenant_id, student_id, week_start, week_end, period_label,
     attendance_days, total_work_hours, completed_tasks, pending_tasks, overdue_tasks,
     new_literature, meetings_attended, new_achievements, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    tenantId, student_id, range.start, range.end, range.label,
    attendance.days || 0, Math.round((attendance.hours || 0) * 10) / 10,
    tasks.completed || 0, tasks.pending || 0, tasks.overdue || 0,
    literature.c || 0, meetingsAttended, achievements.c || 0,
    JSON.stringify({ newTasks: newTasks.c || 0 })
  ]);

  const report = queryOne('SELECT * FROM weekly_reports WHERE id = ?', [result.lastInsertRowid]);
  res.json({ success: true, report });
}));

// PUT /api/weekly-reports/:id/submit
router.put('/:id/submit', wrap((req, res) => {
  const tenantId = getTid(req);
  run(`UPDATE weekly_reports SET status = 'submitted', updated_at = datetime('now') WHERE tenant_id = ? AND id = ?`, [tenantId, req.params.id]);
  res.json({ success: true });
}));

// DELETE /api/weekly-reports/:id
router.delete('/:id', wrap((req, res) => {
  const tenantId = getTid(req);
  run('DELETE FROM weekly_reports WHERE tenant_id = ? AND id = ?', [tenantId, req.params.id]);
  res.json({ success: true });
}));

export default router;
