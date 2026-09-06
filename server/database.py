import os
import sqlite3
import shutil
import threading
from datetime import datetime, timedelta

# Path Setup
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.abspath(os.getenv("DB_PATH", os.path.join(BASE_DIR, "data.db")))

def get_db_path() -> str:
    return DB_PATH

_db_lock = threading.Lock()

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    # Set timeout for busy handler (5 seconds)
    conn.execute("PRAGMA busy_timeout=5000")
    return conn

# Helper execution functions
def query_all(sql: str, params=()) -> list:
    with _db_lock:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

def query_one(sql: str, params=()) -> dict:
    with _db_lock:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(sql, params)
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

def run_sql(sql: str, params=()) -> dict:
    with _db_lock:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(sql, params)
            conn.commit()
            last_id = cursor.lastrowid
            return {"lastInsertRowid": last_id if last_id is not None else 0}
        finally:
            conn.close()

def run_transaction(handler):
    """Run a small multi-statement unit of work under the shared DB lock."""
    with _db_lock:
        conn = get_db_connection()
        try:
            result = handler(conn)
            conn.commit()
            return result
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

def _backup_dir() -> str:
    path = os.path.join(os.path.dirname(DB_PATH), "recovery-backups")
    os.makedirs(path, exist_ok=True)
    return path

def create_database_backup(label: str = "manual") -> dict:
    """Checkpoint WAL and create a recoverable copy of the current database."""
    safe_label = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in (label or "manual"))[:40] or "manual"
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = os.path.join(_backup_dir(), f"xiaojiu-{safe_label}-{timestamp}.db")
    with _db_lock:
        conn = get_db_connection()
        try:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        finally:
            conn.close()
        if not os.path.isfile(DB_PATH):
            raise FileNotFoundError("数据库文件不存在")
        shutil.copy2(DB_PATH, target)
    return {"path": target, "name": os.path.basename(target), "size": os.path.getsize(target), "created_at": datetime.now().isoformat(timespec="seconds")}

def validate_database_file(path: str) -> dict:
    """Validate an SQLite file before it is considered for recovery."""
    if not os.path.isfile(path) or os.path.getsize(path) <= 0:
        raise ValueError("备份文件为空或不存在")
    conn = sqlite3.connect(f"file:{os.path.abspath(path)}?mode=ro", uri=True, timeout=5)
    try:
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise ValueError(f"SQLite 完整性检查失败：{integrity}")
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        required = {"users", "tenants", "projects"}
        missing = sorted(required - tables)
        if missing:
            raise ValueError("备份缺少核心表：" + ", ".join(missing))
        return {"integrity": integrity, "tables": len(tables), "size": os.path.getsize(path)}
    finally:
        conn.close()

def restore_database(path: str) -> dict:
    """Create a pre-restore snapshot, replace DB atomically, and re-run migrations."""
    validation = validate_database_file(path)
    pre_restore = create_database_backup("before-restore")
    with _db_lock:
        if os.path.abspath(path) == os.path.abspath(DB_PATH):
            raise ValueError("不能把当前正在使用的数据库恢复到自身")
        os.replace(path, DB_PATH)
    init_db()
    return {"restored": True, "validation": validation, "pre_restore_backup": pre_restore}

def init_db():
    # Make sure parent directory of database exists
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    with _db_lock:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Create Core Tables
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS mentors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE,
            department TEXT,
            title TEXT,
            avatar TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS students (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS mentor_student_relations (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS review_stages (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS mentor_tasks (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS meeting_records (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS achievements (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mentor_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id INTEGER,
            details TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS task_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            author_name TEXT DEFAULT '导师',
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (task_id) REFERENCES mentor_tasks(id) ON DELETE CASCADE
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            agile_project_id INTEGER NOT NULL,
            project_name TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
            UNIQUE(student_id, agile_project_id)
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            status TEXT DEFAULT 'active'
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sprints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            number INTEGER NOT NULL,
            name TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            goal TEXT,
            status TEXT DEFAULT 'planned',
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_stories (
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
        )""")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS inbox_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            item_type TEXT NOT NULL DEFAULT 'idea',
            title TEXT NOT NULL,
            content TEXT,
            source_url TEXT,
            priority TEXT DEFAULT 'B',
            status TEXT NOT NULL DEFAULT 'unprocessed',
            captured_at TEXT DEFAULT (datetime('now')),
            processed_at TEXT,
            converted_type TEXT,
            converted_id INTEGER,
            source_type TEXT,
            source_id INTEGER,
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )""")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS personal_schedule_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT,
            location TEXT,
            note TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            source_inbox_id INTEGER,
            source_legacy_id TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (source_inbox_id) REFERENCES inbox_items(id) ON DELETE SET NULL
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS agile_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            story_id INTEGER,
            sprint_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT DEFAULT 'B',
            status TEXT DEFAULT 'backlog',
            sort_order INTEGER DEFAULT 0,
            due_date TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (story_id) REFERENCES user_stories(id),
            FOREIGN KEY (sprint_id) REFERENCES sprints(id)
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS standup_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sprint_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            yesterday TEXT,
            today TEXT,
            blockers TEXT,
            notes TEXT,
            FOREIGN KEY (sprint_id) REFERENCES sprints(id)
        )""")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS project_daily_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            yesterday TEXT,
            today TEXT,
            blockers TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(tenant_id, project_id, date),
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS agile_risks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            probability INTEGER DEFAULT 3,
            impact INTEGER DEFAULT 3,
            level TEXT DEFAULT 'medium',
            priority TEXT DEFAULT 'B',
            strategy TEXT,
            status TEXT DEFAULT 'monitoring',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS agile_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            due_date TEXT,
            status TEXT DEFAULT 'pending',
            criteria TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id)
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS literature (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS agile_meetings (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS auth_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sms_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL,
            code TEXT NOT NULL,
            purpose TEXT DEFAULT 'register',
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance_records (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS files (
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
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS tenants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE,
            description TEXT,
            logo TEXT,
            plan TEXT DEFAULT 'free',
            max_mentors INTEGER DEFAULT 1,
            max_students INTEGER DEFAULT 5,
            max_storage_mb INTEGER DEFAULT 100,
            used_storage_mb INTEGER DEFAULT 0,
            owner_id INTEGER NOT NULL,
            expires_at TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS tenant_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'student',
            joined_at TEXT DEFAULT (datetime('now')),
            UNIQUE(tenant_id, user_id)
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS tenant_invites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            code TEXT UNIQUE NOT NULL,
            role TEXT DEFAULT 'student',
            max_uses INTEGER DEFAULT 1,
            used_count INTEGER DEFAULT 0,
            expires_at TEXT,
            created_by INTEGER NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS weekly_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            week_start TEXT NOT NULL,
            week_end TEXT NOT NULL,
            period_label TEXT,
            status TEXT DEFAULT 'draft',
            attendance_days INTEGER DEFAULT 0,
            total_work_hours REAL DEFAULT 0,
            completed_tasks INTEGER DEFAULT 0,
            pending_tasks INTEGER DEFAULT 0,
            overdue_tasks INTEGER DEFAULT 0,
            new_literature INTEGER DEFAULT 0,
            meetings_attended INTEGER DEFAULT 0,
            new_achievements INTEGER DEFAULT 0,
            summary TEXT,
            content TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS papers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            author TEXT,
            abstract TEXT,
            keywords TEXT,
            file_path TEXT NOT NULL,
            file_name TEXT,
            file_size INTEGER DEFAULT 0,
            status TEXT DEFAULT 'draft',
            ai_summary TEXT,
            ai_score INTEGER,
            version INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )""")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS agent_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL UNIQUE,
            provider TEXT NOT NULL DEFAULT 'DeepSeek',
            base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com/v1',
            model TEXT NOT NULL DEFAULT 'deepseek-chat',
            api_key TEXT,
            updated_at TEXT DEFAULT (datetime('now'))
        )""")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS codex_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            prompt TEXT NOT NULL,
            context_json TEXT,
            status TEXT NOT NULL DEFAULT 'queued',
            worker_id TEXT,
            result TEXT,
            error TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            claimed_at TEXT,
            completed_at TEXT
        )""")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS research_weekly_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            week_start TEXT NOT NULL,
            week_end TEXT NOT NULL,
            period_label TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            task_total INTEGER DEFAULT 0,
            task_completed INTEGER DEFAULT 0,
            task_overdue INTEGER DEFAULT 0,
            daily_log_count INTEGER DEFAULT 0,
            blocker_count INTEGER DEFAULT 0,
            open_risk_count INTEGER DEFAULT 0,
            literature_added INTEGER DEFAULT 0,
            inbox_captured INTEGER DEFAULT 0,
            focus_days INTEGER DEFAULT 0,
            focus_hours REAL DEFAULT 0,
            rule_summary TEXT,
            summary TEXT,
            agent_analysis TEXT,
            strengths TEXT,
            gaps TEXT,
            next_focus TEXT,
            user_notes TEXT,
            codex_job_id INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(tenant_id, project_id, week_start, week_end),
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (codex_job_id) REFERENCES codex_jobs(id)
        )""")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS research_nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            node_type TEXT NOT NULL DEFAULT 'question',
            title TEXT NOT NULL,
            content TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            position_x REAL DEFAULT 0,
            position_y REAL DEFAULT 0,
            linked_task_id INTEGER,
            linked_literature_id INTEGER,
            metadata_json TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (linked_task_id) REFERENCES agile_tasks(id),
            FOREIGN KEY (linked_literature_id) REFERENCES literature(id)
        )""")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS research_edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            source_id INTEGER NOT NULL,
            target_id INTEGER NOT NULL,
            relation TEXT NOT NULL DEFAULT 'supports',
            note TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(tenant_id, source_id, target_id, relation),
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (source_id) REFERENCES research_nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (target_id) REFERENCES research_nodes(id) ON DELETE CASCADE
        )""")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS codex_workers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            worker_id TEXT NOT NULL,
            last_seen TEXT NOT NULL DEFAULT (datetime('now')),
            version TEXT,
            UNIQUE(tenant_id, worker_id)
        )""")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS zotero_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL UNIQUE,
            database_path TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        )""")

        cursor.execute("""
        CREATE TABLE IF NOT EXISTS obsidian_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL UNIQUE,
            vault_path TEXT NOT NULL,
            daily_folder TEXT NOT NULL DEFAULT 'Daily',
            updated_at TEXT DEFAULT (datetime('now'))
        )""")
        
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS paper_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paper_id INTEGER NOT NULL,
            reviewer_id INTEGER,
            reviewer_name TEXT DEFAULT '导师',
            content TEXT NOT NULL,
            section TEXT,
            page INTEGER,
            status TEXT DEFAULT 'open',
            created_at TEXT DEFAULT (datetime('now'))
        )""")
        
        # Run user_id migration in notifications
        try:
            cursor.execute("ALTER TABLE notifications ADD COLUMN user_id INTEGER")
        except sqlite3.OperationalError:
            pass # already exists
            
        # 2. Run multi-tenancy migrations
        TABLES_NEEDING_TENANT = [
            'mentors','students','mentor_student_relations','review_stages','mentor_tasks',
            'meeting_records','achievements','notifications','activity_logs','task_comments',
            'student_projects','attendance_records','files','projects','sprints','user_stories',
            'agile_tasks','standup_logs','agile_risks','agile_milestones','literature','agile_meetings'
        ]
        for table in TABLES_NEEDING_TENANT:
            try:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN tenant_id INTEGER DEFAULT 1")
            except sqlite3.OperationalError:
                pass # already exists

        # Surface legacy backlog entries inside the new capture inbox without
        # modifying or deleting the historical user_stories records.
        cursor.execute("""
            INSERT OR IGNORE INTO inbox_items
                (tenant_id, project_id, item_type, title, content, priority, status,
                 captured_at, processed_at, source_type, source_id)
            SELECT tenant_id, project_id, 'task', title, description, COALESCE(priority, 'B'),
                   CASE WHEN status = 'done' THEN 'archived' ELSE 'unprocessed' END,
                   COALESCE(created_at, datetime('now')),
                   CASE WHEN status = 'done' THEN COALESCE(created_at, datetime('now')) ELSE NULL END,
                   'user_story', id
              FROM user_stories
        """)

        # Project-level task fields. Sprint columns stay in place only for
        # backwards compatibility with historical data.
        for column_sql in [
            "ALTER TABLE agile_tasks ADD COLUMN project_id INTEGER",
            "ALTER TABLE agile_tasks ADD COLUMN description TEXT",
            "ALTER TABLE agile_tasks ADD COLUMN priority TEXT DEFAULT 'B'",
        ]:
            try:
                cursor.execute(column_sql)
            except sqlite3.OperationalError:
                pass

        try:
            cursor.execute("ALTER TABLE personal_schedule_items ADD COLUMN source_legacy_id TEXT")
        except sqlite3.OperationalError:
            pass

        try:
            cursor.execute("ALTER TABLE research_weekly_reviews ADD COLUMN summary TEXT")
        except sqlite3.OperationalError:
            pass

        # Personal risk queue: explicit priority is independent from the
        # legacy probability/impact assessment fields.
        try:
            cursor.execute("ALTER TABLE agile_risks ADD COLUMN priority TEXT DEFAULT 'B'")
        except sqlite3.OperationalError:
            pass

        # Backfill direct project ownership from legacy story/sprint links.
        cursor.execute("""
            UPDATE agile_tasks
               SET project_id = (SELECT project_id FROM user_stories WHERE user_stories.id = agile_tasks.story_id)
             WHERE project_id IS NULL AND story_id IS NOT NULL
        """)
        cursor.execute("""
            UPDATE agile_tasks
               SET project_id = (SELECT project_id FROM sprints WHERE sprints.id = agile_tasks.sprint_id)
             WHERE project_id IS NULL AND sprint_id IS NOT NULL
        """)

        # Bring old iteration-bound notes into the new project journal once.
        cursor.execute("""
            INSERT OR IGNORE INTO project_daily_logs
                (tenant_id, project_id, date, yesterday, today, blockers, notes)
            SELECT l.tenant_id, s.project_id, l.date, l.yesterday, l.today, l.blockers, l.notes
              FROM standup_logs l
              JOIN sprints s ON s.id = l.sprint_id AND s.tenant_id = l.tenant_id
        """)
                
        # 3. Create Indexes
        indexes = [
            'CREATE INDEX IF NOT EXISTS idx_students_tenant_status ON students(tenant_id, status)',
            'CREATE INDEX IF NOT EXISTS idx_tasks_tenant_student ON mentor_tasks(tenant_id, student_id, status)',
            'CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON mentor_tasks(tenant_id, deadline)',
            'CREATE INDEX IF NOT EXISTS idx_reviews_tenant_student ON review_stages(tenant_id, student_id, status)',
            'CREATE INDEX IF NOT EXISTS idx_meetings_tenant_date ON meeting_records(tenant_id, meeting_date)',
            'CREATE INDEX IF NOT EXISTS idx_achievements_tenant_student ON achievements(tenant_id, student_id)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read)',
            'CREATE INDEX IF NOT EXISTS idx_attendance_user_time ON attendance_records(user_id, check_in_time)',
            'CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id)',
            'CREATE INDEX IF NOT EXISTS idx_files_tenant ON files(tenant_id)',
            'CREATE INDEX IF NOT EXISTS idx_weekly_reports_tenant ON weekly_reports(tenant_id, student_id, week_start)',
            'CREATE INDEX IF NOT EXISTS idx_papers_tenant ON papers(tenant_id, student_id)',
            'CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_mentor_student_relations ON mentor_student_relations(mentor_id, student_id, status)',
            'CREATE INDEX IF NOT EXISTS idx_agile_tasks_project_status ON agile_tasks(tenant_id, project_id, status)',
            'CREATE INDEX IF NOT EXISTS idx_daily_logs_project_date ON project_daily_logs(tenant_id, project_id, date)',
            'CREATE INDEX IF NOT EXISTS idx_agent_configs_tenant ON agent_configs(tenant_id)',
            'CREATE INDEX IF NOT EXISTS idx_codex_jobs_status ON codex_jobs(status, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_codex_workers_seen ON codex_workers(tenant_id, last_seen)',
            'CREATE INDEX IF NOT EXISTS idx_weekly_reviews_project_range ON research_weekly_reviews(tenant_id, project_id, week_start DESC)',
            'CREATE INDEX IF NOT EXISTS idx_research_nodes_project ON research_nodes(tenant_id, project_id, node_type, updated_at DESC)',
            'CREATE INDEX IF NOT EXISTS idx_research_edges_project ON research_edges(tenant_id, project_id, source_id, target_id)',
            'CREATE INDEX IF NOT EXISTS idx_zotero_configs_tenant ON zotero_configs(tenant_id)',
            'CREATE INDEX IF NOT EXISTS idx_obsidian_configs_tenant ON obsidian_configs(tenant_id)',
            'CREATE INDEX IF NOT EXISTS idx_inbox_project_status ON inbox_items(tenant_id, project_id, status, captured_at)',
            'CREATE INDEX IF NOT EXISTS idx_inbox_project_type ON inbox_items(tenant_id, project_id, item_type)',
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_source_unique ON inbox_items(tenant_id, source_type, source_id)',
            'CREATE INDEX IF NOT EXISTS idx_schedule_project_date ON personal_schedule_items(tenant_id, project_id, date)',
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_source_inbox ON personal_schedule_items(tenant_id, source_inbox_id)',
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_legacy_source ON personal_schedule_items(tenant_id, project_id, source_legacy_id)',
        ]
        for idx in indexes:
            try:
                cursor.execute(idx)
            except sqlite3.OperationalError:
                pass

        # Remove dangling research links left by older databases where
        # SQLite foreign-key cascades were not enabled.
        try:
            cursor.execute(
                """DELETE FROM research_edges
                   WHERE source_id NOT IN (SELECT id FROM research_nodes)
                      OR target_id NOT IN (SELECT id FROM research_nodes)"""
            )
        except sqlite3.OperationalError:
            pass
                
        conn.commit()
        
        # 4. Ensure defaults
        ensure_default_tenant(cursor)
        ensure_tenant_projects(cursor)
        
        conn.commit()
        conn.close()

def ensure_default_tenant(cursor):
    cursor.execute("SELECT 1 FROM tenants WHERE id = 1")
    if cursor.fetchone():
        return
    cursor.execute("SELECT id FROM users ORDER BY id LIMIT 1")
    first_user = cursor.fetchone()
    owner_id = first_user[0] if first_user else 1
    
    cursor.execute(
        "INSERT INTO tenants (id, name, slug, plan, owner_id, max_mentors, max_students) VALUES (1, '默认课题组', 'default', 'pro', ?, 99, 999)",
        (owner_id,)
    )
    cursor.execute("SELECT id, role FROM users")
    users = cursor.fetchall()
    for u in users:
        cursor.execute(
            "INSERT OR IGNORE INTO tenant_members (tenant_id, user_id, role) VALUES (1, ?, ?)",
            (u["id"], u["role"])
        )

def ensure_tenant_projects(cursor):
    today = datetime.now()
    end = today + timedelta(days=365)
    
    cursor.execute("SELECT id, name FROM tenants")
    tenants = cursor.fetchall()
    for t in tenants:
        cursor.execute("SELECT id FROM projects WHERE tenant_id = ? LIMIT 1", (t["id"],))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO projects (tenant_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)",
                (t["id"], f"{t['name']}科研项目", today.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"), "active")
            )
