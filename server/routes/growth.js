import { Router } from 'express';
import { queryAll, queryOne } from '../db.js';
import { wrap } from '../middleware/wrap.js';
import { getTenantId } from '../middleware/tenant.js';

const router = Router();

function getTid(req) {
  return req.tenantId || getTenantId(req);
}

// GET /api/growth/students - 导师看所有学生的成长概览
router.get('/students', wrap((req, res) => {
  const tenantId = getTid(req);
  const students = queryAll(`
    SELECT s.id, s.name, s.grade, s.major, s.enrollment_date, s.expected_graduation, s.status
    FROM students s WHERE s.tenant_id = ? AND s.status = ? ORDER BY s.enrollment_date DESC
  `, [tenantId, 'active']);

  const result = students.map(s => {
    const papers = queryOne('SELECT COUNT(*) as c FROM achievements WHERE student_id = ?', [s.id]).c;
    const tasks = queryOne(`
      SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
             COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
             COUNT(CASE WHEN status = 'pending' AND deadline < date('now') THEN 1 END) as overdue
      FROM mentor_tasks WHERE student_id = ?
    `, [s.id]);
    const attendance = queryOne('SELECT COUNT(DISTINCT date(check_in_time)) as days, SUM(work_hours) as hours FROM attendance_records WHERE student_id = ?', [s.id]);
    const meetings = queryAll('SELECT student_ids FROM meeting_records WHERE tenant_id = ?', [tenantId]);
    let meetingCount = 0;
    for (const m of meetings) {
      try { if (JSON.parse(m.student_ids || '[]').includes(s.id)) meetingCount++; } catch { /* ignore */ }
    }

    const today = new Date();
    const gradDate = s.expected_graduation ? new Date(s.expected_graduation) : null;
    const enrollDate = s.enrollment_date ? new Date(s.enrollment_date) : today;
    const daysToGrad = gradDate ? Math.max(0, Math.ceil((gradDate - today) / 86400000)) : 999;
    const daysEnrolled = Math.max(1, Math.ceil((today - enrollDate) / 86400000));
    const monthsEnrolled = Math.floor(daysEnrolled / 30);

    // Risk score: 0-100, higher = more risky
    let riskScore = 0;
    if (daysToGrad < 365 && papers === 0) riskScore += 40;
    if (daysToGrad < 180 && tasks.pending > 3) riskScore += 30;
    if (monthsEnrolled > 12 && papers === 0) riskScore += 20;
    if (tasks.overdue > 2) riskScore += 10;
    if (attendance.days < Math.min(monthsEnrolled * 4, 20)) riskScore += 10;
    riskScore = Math.min(100, riskScore);

    // Radar data (0-100)
    const radar = {
      taskCompletion: Math.min(100, tasks.total ? Math.round(tasks.completed / tasks.total * 100) : 0),
      academicOutput: Math.min(100, papers * 20),
      attendance: Math.min(100, Math.round(attendance.days / Math.max(1, monthsEnrolled) * 10)),
      meetings: Math.min(100, meetingCount * 10),
      workHours: Math.min(100, Math.round((attendance.hours || 0) / 4)),
    };

    return {
      ...s,
      papers,
      tasksCompleted: tasks.completed,
      tasksTotal: tasks.total,
      attendanceDays: attendance.days || 0,
      workHours: Math.round((attendance.hours || 0) * 10) / 10,
      meetings: meetingCount,
      daysToGrad,
      monthsEnrolled,
      riskScore,
      riskLevel: riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low',
      radar,
    };
  });

  res.json(result);
}));

// GET /api/growth/student/:id - 单个学生详细成长档案
router.get('/student/:id', wrap((req, res) => {
  const tenantId = getTid(req);
  const studentId = Number(req.params.id);

  const student = queryOne('SELECT * FROM students WHERE tenant_id = ? AND id = ?', [tenantId, studentId]);
  if (!student) return res.status(404).json({ error: '学生不存在' });

  // Timeline: milestones + events
  const milestones = [];
  milestones.push({ date: student.enrollment_date, type: 'enrollment', title: '入学', description: `入学${student.grade}` });

  const reviews = queryAll('SELECT * FROM review_stages WHERE student_id = ? ORDER BY scheduled_date', [studentId]);
  for (const r of reviews) {
    milestones.push({
      date: r.completed_date || r.scheduled_date,
      type: 'review',
      title: r.stage_type || r.title,
      description: r.status === 'completed' ? `已完成，评分 ${r.score || '无'}` : '待完成',
      status: r.status,
    });
  }

  const achievements = queryAll('SELECT * FROM achievements WHERE student_id = ? ORDER BY publish_date', [studentId]);
  for (const a of achievements) {
    milestones.push({
      date: a.publish_date || a.created_at,
      type: 'achievement',
      title: a.title,
      description: `${a.achievement_type} · ${a.journal_or_conference || ''}`,
    });
  }

  // Sort timeline by date
  milestones.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  // Stats
  const allTasks = queryAll('SELECT * FROM mentor_tasks WHERE student_id = ? ORDER BY created_at', [studentId]);
  const allPapers = achievements;
  const allAttendance = queryAll('SELECT * FROM attendance_records WHERE student_id = ? ORDER BY check_in_time', [studentId]);
  const allMeetings = queryAll('SELECT student_ids, meeting_date, topic FROM meeting_records WHERE tenant_id = ? ORDER BY meeting_date', [tenantId]);
  const myMeetings = allMeetings.filter(m => {
    try { return JSON.parse(m.student_ids || '[]').includes(studentId); } catch { return false; }
  });

  // Weekly trend (last 8 weeks)
  const weeklyTrend = queryAll(`
    SELECT week_start, completed_tasks, pending_tasks, attendance_days, total_work_hours
    FROM weekly_reports WHERE tenant_id = ? AND student_id = ?
    ORDER BY week_start DESC LIMIT 8
  `, [tenantId, studentId]);

  // Risk calculation
  const today = new Date();
  const gradDate = student.expected_graduation ? new Date(student.expected_graduation) : null;
  const enrollDate = student.enrollment_date ? new Date(student.enrollment_date) : today;
  const daysToGrad = gradDate ? Math.max(0, Math.ceil((gradDate - today) / 86400000)) : 999;
  const daysEnrolled = Math.max(1, Math.ceil((today - enrollDate) / 86400000));
  const monthsEnrolled = Math.floor(daysEnrolled / 30);
  const totalPapers = allPapers.length;
  const completedTasks = allTasks.filter(t => t.status === 'completed').length;
  const overdueTasks = allTasks.filter(t => t.status === 'pending' && t.deadline && t.deadline < new Date().toISOString().split('T')[0]).length;

  let riskScore = 0;
  if (daysToGrad < 365 && totalPapers === 0) riskScore += 40;
  if (daysToGrad < 180 && allTasks.filter(t => t.status === 'pending').length > 3) riskScore += 30;
  if (monthsEnrolled > 12 && totalPapers === 0) riskScore += 20;
  if (overdueTasks > 2) riskScore += 10;
  riskScore = Math.min(100, riskScore);

  const riskFactors = [];
  if (daysToGrad < 365 && totalPapers === 0) riskFactors.push('临近毕业但无论文产出');
  if (daysToGrad < 180 && allTasks.filter(t => t.status === 'pending').length > 3) riskFactors.push('毕业前任务积压严重');
  if (monthsEnrolled > 12 && totalPapers === 0) riskFactors.push('入学超1年零论文');
  if (overdueTasks > 2) riskFactors.push('逾期任务过多');

  // Radar
  const totalMeetings = myMeetings.length;
  const totalAttendanceDays = allAttendance.length;
  const totalWorkHours = allAttendance.reduce((s, a) => s + (a.work_hours || 0), 0);

  const radar = {
    任务完成: Math.min(100, allTasks.length ? Math.round(completedTasks / allTasks.length * 100) : 0),
    学术产出: Math.min(100, totalPapers * 20 + allPapers.filter(p => (p.journal_or_conference || '').toUpperCase().includes('SCI')).length * 30),
    出勤表现: Math.min(100, Math.round(totalAttendanceDays / Math.max(1, monthsEnrolled) * 10)),
    组会参与: Math.min(100, totalMeetings * 10),
    工时投入: Math.min(100, Math.round(totalWorkHours / 4)),
  };

  res.json({
    student,
    timeline: milestones,
    stats: {
      totalTasks: allTasks.length,
      completedTasks,
      overdueTasks,
      totalPapers,
      sciPapers: allPapers.filter(p => (p.journal_or_conference || '').toUpperCase().includes('SCI')).length,
      totalMeetings,
      totalAttendanceDays,
      totalWorkHours: Math.round(totalWorkHours * 10) / 10,
      daysToGrad,
      monthsEnrolled,
    },
    risk: { score: riskScore, level: riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low', factors: riskFactors },
    radar,
    weeklyTrend: weeklyTrend.reverse(),
  });
}));

export default router;
