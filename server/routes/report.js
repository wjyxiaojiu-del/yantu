import { Router } from 'express';
import { queryAll, queryOne } from '../db.js';

const router = Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function getTenantId(req) {
  return Number(req.headers['x-tenant-id'] || req.query.tenant_id || 1);
}

// GET /api/reports/dashboard
router.get('/dashboard', wrap((req, res) => {
  const tenantId = getTenantId(req);

  // === Students ===
  const totalStudents = queryOne('SELECT COUNT(*) as c FROM students WHERE tenant_id = ? AND status = ?', [tenantId, 'active']).c;
  const gradStudents = queryOne("SELECT COUNT(*) as c FROM students WHERE tenant_id = ? AND grade LIKE '%博士%'", [tenantId]).c;
  const masterStudents = queryOne("SELECT COUNT(*) as c FROM students WHERE tenant_id = ? AND grade LIKE '%硕士%'", [tenantId]).c;
  const graduatingSoon = queryOne(`SELECT COUNT(*) as c FROM students WHERE tenant_id = ? AND expected_graduation >= date('now') AND expected_graduation <= date('now', '+6 months')`, [tenantId]).c;
  const overdueGrad = queryOne(`SELECT COUNT(*) as c FROM students WHERE tenant_id = ? AND expected_graduation < date('now') AND status = ?`, [tenantId, 'active']).c;

  const gradeDistribution = queryAll(`
    SELECT grade, COUNT(*) as count FROM students
    WHERE tenant_id = ? AND status = ?
    GROUP BY grade ORDER BY count DESC
  `, [tenantId, 'active']);

  const enrollmentTrend = queryAll(`
    SELECT strftime('%Y', enrollment_date) as year, COUNT(*) as count
    FROM students WHERE tenant_id = ? AND enrollment_date IS NOT NULL
    GROUP BY year ORDER BY year DESC LIMIT 8
  `, [tenantId]);

  // === Papers / Achievements ===
  const totalPapers = queryOne('SELECT COUNT(*) as c FROM achievements a JOIN students s ON a.student_id = s.id WHERE s.tenant_id = ?', [tenantId]).c;
  const papersByType = queryAll(`
    SELECT achievement_type, COUNT(*) as count FROM achievements a
    JOIN students s ON a.student_id = s.id WHERE s.tenant_id = ?
    GROUP BY achievement_type ORDER BY count DESC
  `, [tenantId]);
  const papersByYear = queryAll(`
    SELECT strftime('%Y', publish_date) as year, COUNT(*) as count FROM achievements a
    JOIN students s ON a.student_id = s.id WHERE s.tenant_id = ? AND publish_date IS NOT NULL
    GROUP BY year ORDER BY year DESC LIMIT 8
  `, [tenantId]);

  // === Tasks ===
  const taskStats = queryOne(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
      COUNT(CASE WHEN status = 'pending' AND deadline < date('now') THEN 1 END) as overdue
    FROM mentor_tasks mt
    JOIN students s ON mt.student_id = s.id
    WHERE s.tenant_id = ?
  `, [tenantId]);

  const tasksByPriority = queryAll(`
    SELECT priority, COUNT(*) as count FROM mentor_tasks mt
    JOIN students s ON mt.student_id = s.id WHERE s.tenant_id = ?
    GROUP BY priority ORDER BY count DESC
  `, [tenantId]);

  // === Meetings ===
  const totalMeetings = queryOne('SELECT COUNT(*) as c FROM meeting_records WHERE tenant_id = ?', [tenantId]).c;
  const meetingsThisMonth = queryOne(`SELECT COUNT(*) as c FROM meeting_records WHERE tenant_id = ? AND strftime('%Y-%m', meeting_date) = strftime('%Y-%m', 'now')`, [tenantId]).c;

  // === Attendance ===
  const attendanceThisMonth = queryOne(`
    SELECT COUNT(DISTINCT user_id) as people, SUM(work_hours) as hours
    FROM attendance_records ar
    JOIN users u ON ar.user_id = u.id
    JOIN tenant_members tm ON u.id = tm.user_id
    WHERE tm.tenant_id = ? AND strftime('%Y-%m', ar.check_in_time) = strftime('%Y-%m', 'now')
  `, [tenantId]);

  // === Warnings ===
  const highRiskStudents = queryAll(`
    SELECT s.id, s.name, s.grade, s.expected_graduation,
           COUNT(DISTINCT a.id) as paper_count,
           COUNT(DISTINCT mt.id) as pending_tasks,
           JULIANDAY(s.expected_graduation) - JULIANDAY('now') as days_left
    FROM students s
    LEFT JOIN achievements a ON s.id = a.student_id
    LEFT JOIN mentor_tasks mt ON s.id = mt.student_id AND mt.status = 'pending'
    WHERE s.tenant_id = ? AND s.status = 'active'
    GROUP BY s.id
    HAVING (days_left < 365 AND paper_count = 0) OR (days_left < 180 AND pending_tasks > 5)
    ORDER BY days_left ASC
    LIMIT 10
  `, [tenantId]);

  const noPaperStudents = queryAll(`
    SELECT s.id, s.name, s.grade, s.enrollment_date,
           JULIANDAY('now') - JULIANDAY(s.enrollment_date) as days_enrolled
    FROM students s
    WHERE s.tenant_id = ? AND s.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM achievements a WHERE a.student_id = s.id)
      AND days_enrolled > 365
    ORDER BY days_enrolled DESC
    LIMIT 10
  `, [tenantId]);

  res.json({
    summary: {
      totalStudents,
      gradStudents,
      masterStudents,
      graduatingSoon,
      overdueGrad,
      totalPapers,
      totalMeetings,
      meetingsThisMonth,
      taskCompletionRate: taskStats.total ? Math.round(taskStats.completed / taskStats.total * 100) : 0,
      taskOverdueRate: taskStats.total ? Math.round(taskStats.overdue / taskStats.total * 100) : 0,
      attendancePeople: attendanceThisMonth.people || 0,
      attendanceHours: Math.round((attendanceThisMonth.hours || 0) * 10) / 10,
    },
    gradeDistribution,
    enrollmentTrend,
    papersByType,
    papersByYear,
    tasksByPriority,
    warnings: {
      highRisk: highRiskStudents,
      noPaper: noPaperStudents,
    }
  });
}));

// GET /api/reports/student/:id - 个人成长报告
router.get('/student/:id', wrap((req, res) => {
  const tenantId = getTenantId(req);
  const studentId = Number(req.params.id);

  const student = queryOne('SELECT * FROM students WHERE tenant_id = ? AND id = ?', [tenantId, studentId]);
  if (!student) return res.status(404).json({ error: '学生不存在' });

  const papers = queryAll('SELECT * FROM achievements WHERE student_id = ? ORDER BY publish_date DESC', [studentId]);
  const tasks = queryAll('SELECT * FROM mentor_tasks WHERE student_id = ? ORDER BY created_at DESC', [studentId]);
  const reviews = queryAll('SELECT * FROM review_stages WHERE student_id = ? ORDER BY scheduled_date ASC', [studentId]);
  const attendance = queryAll('SELECT * FROM attendance_records WHERE student_id = ? ORDER BY check_in_time DESC LIMIT 50', [studentId]);
  const meetings = queryAll(`SELECT * FROM meeting_records WHERE mentor_id = ? ORDER BY meeting_date DESC`, [1]);
  const studentMeetings = meetings.filter(m => {
    try { return JSON.parse(m.student_ids || '[]').includes(studentId); } catch { return false; }
  });

  // Compute radar metrics
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const overdueTasks = tasks.filter(t => t.status === 'pending' && t.deadline && t.deadline < new Date().toISOString().split('T')[0]).length;
  const totalPapers = papers.length;
  const sciPapers = papers.filter(p => p.achievement_type === 'paper' && (p.journal_or_conference || '').toUpperCase().includes('SCI')).length;
  const totalMeetings = studentMeetings.length;
  const totalAttendance = attendance.length;
  const totalWorkHours = attendance.reduce((sum, a) => sum + (a.work_hours || 0), 0);

  // Normalize to 0-100
  const radar = {
    任务完成: Math.min(100, totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0),
    学术产出: Math.min(100, totalPapers * 20 + sciPapers * 30),
    出勤表现: Math.min(100, totalAttendance * 5),
    组会参与: Math.min(100, totalMeetings * 10),
    工时投入: Math.min(100, Math.round(totalWorkHours)),
  };

  res.json({
    student,
    papers,
    tasks,
    reviews,
    attendance,
    meetings: studentMeetings,
    stats: {
      totalTasks, completedTasks, overdueTasks,
      totalPapers, sciPapers,
      totalMeetings, totalAttendance, totalWorkHours: Math.round(totalWorkHours * 10) / 10
    },
    radar,
  });
}));

export default router;
