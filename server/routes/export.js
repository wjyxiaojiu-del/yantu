import { Router } from 'express';
import { queryAll } from '../db.js';
import { wrap } from '../middleware/wrap.js';
import { getTenantId } from '../middleware/tenant.js';

const router = Router();

function getTid(req) {
  return req.tenantId || getTenantId(req);
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCsv(headers, rows) {
  const head = headers.map(h => escapeCsv(h.label)).join(',');
  const body = rows.map(r => headers.map(h => escapeCsv(typeof h.value === 'function' ? h.value(r) : r[h.key])).join(',')).join('\r\n');
  return '﻿' + head + '\r\n' + body;
}

function sendCsv(res, filenameStem, csv) {
  const ts = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameStem}-${ts}.csv"`);
  res.send(csv);
}

router.get('/students.csv', wrap((req, res) => {
  const tenantId = getTid(req);
  const rows = queryAll(
    `SELECT id, name, student_id, email, grade, major, research_topic,
            enrollment_date, expected_graduation, status, created_at
     FROM students WHERE tenant_id = ? ORDER BY enrollment_date DESC, id DESC`,
    [tenantId]
  );
  const headers = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: '姓名' },
    { key: 'student_id', label: '学号' },
    { key: 'email', label: '邮箱' },
    { key: 'grade', label: '年级' },
    { key: 'major', label: '专业' },
    { key: 'research_topic', label: '研究方向' },
    { key: 'enrollment_date', label: '入学日期' },
    { key: 'expected_graduation', label: '预计毕业' },
    { key: 'status', label: '状态' },
    { key: 'created_at', label: '创建时间' },
  ];
  sendCsv(res, 'students', rowsToCsv(headers, rows));
}));

router.get('/tasks.csv', wrap((req, res) => {
  const tenantId = getTid(req);
  const rows = queryAll(
    `SELECT mt.id, mt.title, s.name AS student_name, mt.priority, mt.status,
            mt.category, mt.deadline, mt.completed_at, mt.created_at, mt.description
     FROM mentor_tasks mt
     LEFT JOIN students s ON s.id = mt.student_id
     WHERE mt.tenant_id = ?
     ORDER BY mt.created_at DESC`,
    [tenantId]
  );
  const headers = [
    { key: 'id', label: 'ID' },
    { key: 'title', label: '任务标题' },
    { key: 'student_name', label: '指派学生' },
    { key: 'priority', label: '优先级' },
    { key: 'status', label: '状态' },
    { key: 'category', label: '类别' },
    { key: 'deadline', label: '截止日期' },
    { key: 'completed_at', label: '完成时间' },
    { key: 'created_at', label: '创建时间' },
    { key: 'description', label: '描述' },
  ];
  sendCsv(res, 'tasks', rowsToCsv(headers, rows));
}));

router.get('/achievements.csv', wrap((req, res) => {
  const tenantId = getTid(req);
  const rows = queryAll(
    `SELECT a.id, s.name AS student_name, a.title, a.achievement_type,
            a.journal_or_conference, a.publish_date, a.doi_or_link,
            a.status, a.notes, a.created_at
     FROM achievements a
     LEFT JOIN students s ON s.id = a.student_id
     WHERE a.tenant_id = ?
     ORDER BY a.publish_date DESC, a.id DESC`,
    [tenantId]
  );
  const headers = [
    { key: 'id', label: 'ID' },
    { key: 'student_name', label: '学生' },
    { key: 'title', label: '成果标题' },
    { key: 'achievement_type', label: '类型' },
    { key: 'journal_or_conference', label: '期刊/会议' },
    { key: 'publish_date', label: '发表日期' },
    { key: 'doi_or_link', label: 'DOI/链接' },
    { key: 'status', label: '状态' },
    { key: 'notes', label: '备注' },
    { key: 'created_at', label: '创建时间' },
  ];
  sendCsv(res, 'achievements', rowsToCsv(headers, rows));
}));

export default router;
