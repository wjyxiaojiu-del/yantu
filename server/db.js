import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, 'data.db');

let db = null;
let saveTimeout = null;
let dirty = false;

export async function initDB() {
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  createTables();
  return db;
}

function createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS mentors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    department TEXT,
    title TEXT,
    avatar TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    student_id TEXT UNIQUE,
    grade TEXT,
    major TEXT,
    research_topic TEXT,
    enrollment_date TEXT,
    expected_graduation TEXT,
    status TEXT DEFAULT 'active',
    avatar TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS mentor_student_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    relation_type TEXT DEFAULT 'master',
    start_date TEXT,
    end_date TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (mentor_id) REFERENCES mentors(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    UNIQUE(mentor_id, student_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS review_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    stage_type TEXT NOT NULL,
    title TEXT,
    status TEXT DEFAULT 'pending',
    scheduled_date TEXT,
    completed_date TEXT,
    score REAL,
    feedback TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS mentor_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    deadline TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    category TEXT DEFAULT 'general',
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (mentor_id) REFERENCES mentors(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS meeting_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id INTEGER NOT NULL,
    student_ids TEXT,
    meeting_date TEXT NOT NULL,
    meeting_type TEXT DEFAULT 'individual',
    topic TEXT,
    summary TEXT,
    action_items TEXT,
    next_meeting_date TEXT,
    status TEXT DEFAULT 'completed',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (mentor_id) REFERENCES mentors(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    achievement_type TEXT DEFAULT 'paper',
    journal_or_conference TEXT,
    publish_date TEXT,
    doi_or_link TEXT,
    status TEXT DEFAULT 'published',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id INTEGER,
    user_id INTEGER,
    type TEXT DEFAULT 'system',
    title TEXT NOT NULL,
    content TEXT,
    related_id INTEGER,
    related_type TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  // Migration: add user_id if missing
  try { db.run(`ALTER TABLE notifications ADD COLUMN user_id INTEGER`); } catch (e) { /* already exists */ }

  db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mentor_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    author_name TEXT DEFAULT '导师',
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES mentor_tasks(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS student_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    agile_project_id INTEGER NOT NULL,
    project_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE(student_id, agile_project_id)
  )`);

  // === Agile Project Tables ===
  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT DEFAULT 'active'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS sprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    number INTEGER NOT NULL,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    goal TEXT,
    status TEXT DEFAULT 'planned',
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS user_stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id TEXT NOT NULL,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT DEFAULT 'B',
    story_points INTEGER DEFAULT 3,
    sprint_id INTEGER,
    status TEXT DEFAULT 'backlog',
    acceptance_criteria TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (sprint_id) REFERENCES sprints(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS agile_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER,
    sprint_id INTEGER,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'backlog',
    sort_order INTEGER DEFAULT 0,
    due_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (story_id) REFERENCES user_stories(id),
    FOREIGN KEY (sprint_id) REFERENCES sprints(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS standup_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sprint_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    yesterday TEXT,
    today TEXT,
    blockers TEXT,
    notes TEXT,
    FOREIGN KEY (sprint_id) REFERENCES sprints(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS agile_risks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    probability INTEGER DEFAULT 3,
    impact INTEGER DEFAULT 3,
    level TEXT DEFAULT 'medium',
    strategy TEXT,
    status TEXT DEFAULT 'monitoring',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS agile_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    due_date TEXT,
    status TEXT DEFAULT 'pending',
    criteria TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS literature (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    authors TEXT,
    journal TEXT,
    year INTEGER,
    doi TEXT,
    abstract TEXT,
    notes TEXT,
    tags TEXT,
    rating INTEGER DEFAULT 0,
    status TEXT DEFAULT 'unread',
    file_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS agile_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    mentor_name TEXT,
    meeting_date TEXT NOT NULL,
    topic TEXT,
    summary TEXT,
    action_items TEXT,
    next_meeting TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`);

  // Auth tables
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'student',
    avatar TEXT,
    student_id TEXT,
    department TEXT,
    title TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sms_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT DEFAULT 'register',
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    student_id INTEGER,
    check_in_time TEXT NOT NULL,
    check_out_time TEXT,
    work_content TEXT,
    work_hours REAL DEFAULT 0,
    check_type TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'checked_in',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER DEFAULT 0,
    category TEXT DEFAULT 'document',
    tags TEXT,
    description TEXT,
    uploaded_by INTEGER NOT NULL,
    student_id INTEGER,
    mentor_id INTEGER,
    path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
}

export function saveDB(immediate = false) {
  dirty = true;
  if (saveTimeout) {
    if (!immediate) return;
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  const doSave = () => {
    saveTimeout = null;
    if (dirty && db) {
      try {
        const data = db.export();
        writeFileSync(DB_PATH, Buffer.from(data));
        dirty = false;
      } catch (e) {
        console.error('[DB] Save failed:', e.message);
      }
    }
  };
  if (immediate) {
    doSave();
  } else {
    saveTimeout = setTimeout(doSave, 500);
  }
}

export function flushDB() {
  if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
  if (dirty && db) {
    try {
      const data = db.export();
      writeFileSync(DB_PATH, Buffer.from(data));
      dirty = false;
    } catch (e) {
      console.error('[DB] Flush failed:', e.message);
    }
  }
}

export function getDBIntegrity() {
  if (!db) return { ok: false, error: 'Database not initialized' };
  try {
    const tables = queryAll("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const counts = {};
    for (const t of tables) {
      const c = queryOne(`SELECT COUNT(*) as count FROM "${t.name}"`);
      counts[t.name] = c.count;
    }
    return { ok: true, tables: tables.map(t => t.name), counts };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function getDB() {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

export function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) { results.push(stmt.getAsObject()); }
  stmt.free();
  return results;
}

export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length ? rows[0] : null;
}

export function run(sql, params = []) {
  db.run(sql, params);
  saveDB();
  return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0 };
}
