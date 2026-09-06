import os
import shutil
import json
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional, List

from server.database import query_one, query_all, run_sql
from server.dependencies import get_tenant_context, require_roles

router = APIRouter(prefix="/mentor", tags=["mentor"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.abspath(os.getenv("UPLOAD_DIR", os.path.join(BASE_DIR, "uploads")))
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- Pydantic Request Schemas ---
class StudentCreateSchema(BaseModel):
    name: str
    email: Optional[str] = None
    student_id: Optional[str] = None
    grade: Optional[str] = None
    major: Optional[str] = None
    research_topic: Optional[str] = None
    enrollment_date: Optional[str] = None
    expected_graduation: Optional[str] = None
    mentor_id: Optional[int] = None

class StudentUpdateSchema(BaseModel):
    name: str
    email: Optional[str] = None
    grade: Optional[str] = None
    major: Optional[str] = None
    research_topic: Optional[str] = None
    status: Optional[str] = "active"
    expected_graduation: Optional[str] = None

class TaskCreateSchema(BaseModel):
    student_id: int
    title: str
    description: Optional[str] = None
    deadline: Optional[str] = None
    priority: Optional[str] = "medium"
    category: Optional[str] = "general"
    mentor_id: Optional[int] = None

class TaskUpdateSchema(BaseModel):
    title: str
    description: Optional[str] = None
    deadline: Optional[str] = None
    priority: Optional[str] = "medium"
    status: Optional[str] = "pending"
    category: Optional[str] = "general"

class ReviewCreateSchema(BaseModel):
    student_id: int
    stage_type: str
    title: str
    scheduled_date: Optional[str] = None

class ReviewUpdateSchema(BaseModel):
    status: Optional[str] = "pending"
    scheduled_date: Optional[str] = None
    completed_date: Optional[str] = None
    score: Optional[float] = None
    feedback: Optional[str] = None
    notes: Optional[str] = None

class MeetingCreateSchema(BaseModel):
    student_ids: List[int]
    meeting_date: str
    meeting_type: Optional[str] = "individual"
    topic: str
    summary: Optional[str] = None
    action_items: Optional[str] = None
    next_meeting_date: Optional[str] = None
    mentor_id: Optional[int] = None

class MeetingUpdateSchema(BaseModel):
    student_ids: List[int]
    meeting_date: str
    meeting_type: Optional[str] = "individual"
    topic: Optional[str] = None
    summary: Optional[str] = None
    action_items: Optional[str] = None
    next_meeting_date: Optional[str] = None
    status: Optional[str] = "completed"

class AchievementCreateSchema(BaseModel):
    student_id: int
    title: str
    achievement_type: Optional[str] = "paper"
    journal_or_conference: Optional[str] = None
    publish_date: Optional[str] = None
    doi_or_link: Optional[str] = None
    status: Optional[str] = "published"
    notes: Optional[str] = None

class AchievementUpdateSchema(BaseModel):
    title: str
    achievement_type: Optional[str] = "paper"
    journal_or_conference: Optional[str] = None
    publish_date: Optional[str] = None
    doi_or_link: Optional[str] = None
    status: Optional[str] = "published"
    notes: Optional[str] = None

class CommentCreateSchema(BaseModel):
    author_name: Optional[str] = "导师"
    content: str

class ActivityLogCreateSchema(BaseModel):
    mentor_id: Optional[int] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    details: Optional[str] = None

class LinkProjectSchema(BaseModel):
    agile_project_id: int
    project_name: str

# --- Helper Functions ---
def get_mentor_id(ctx: dict, mentor_id: Optional[int] = None) -> int:
    if mentor_id:
        return mentor_id
    user = ctx["user"]
    if user and user.get("role") in ("mentor", "owner", "admin"):
        email = user.get("email") or f"{user['phone']}@phone.user"
        mentor = query_one("SELECT id FROM mentors WHERE email = ?", (email,))
        if not mentor:
            # Auto-create
            result = run_sql(
                "INSERT INTO mentors (name, email, department, title) VALUES (?, ?, ?, ?)",
                (user["name"], email, user.get("department", "默认部门"), user.get("title", "导师"))
            )
            return result["lastInsertRowid"]
        return mentor["id"]
    return 1

def get_student_agile_project_id(student_id: int) -> Optional[int]:
    link = query_one("SELECT agile_project_id FROM student_projects WHERE student_id = ? LIMIT 1", (student_id,))
    return link["agile_project_id"] if link else None

def get_current_student(ctx: dict) -> Optional[dict]:
    student_number = ctx["user"].get("student_id")
    if not student_number or not ctx["tenant_id"]:
        return None
    return query_one(
        "SELECT * FROM students WHERE tenant_id = ? AND student_id = ? LIMIT 1",
        (ctx["tenant_id"], student_number)
    )

def sync_task_to_agile(student_id: int, title: str, description: str, deadline: str, priority: str) -> Optional[dict]:
    project_id = get_student_agile_project_id(student_id)
    if not project_id:
        return None
    priority_map = {"urgent": "S", "high": "H", "medium": "M", "low": "L"}
    priority_code = priority_map.get(priority, "M")
    
    story_id = f"MENTOR-{int(datetime.now().timestamp() * 1000)}"
    acceptance_criteria = f"导师指派截止日期: {deadline}" if deadline else ""
    try:
        result = run_sql(
            """INSERT INTO user_stories (story_id, project_id, title, description, priority, story_points, sprint_id, status, acceptance_criteria)
               VALUES (?, ?, ?, ?, ?, 3, NULL, 'backlog', ?)""",
            (story_id, project_id, title, description or "", priority_code, acceptance_criteria)
        )
        return {"id": result["lastInsertRowid"]}
    except Exception as e:
        print("Sync task to agile failed:", str(e))
        return None

def sync_review_to_agile(student_id: int, title: str, scheduled_date: str, stage_type: str) -> Optional[dict]:
    project_id = get_student_agile_project_id(student_id)
    if not project_id:
        return None
    try:
        result = run_sql(
            "INSERT INTO agile_milestones (project_id, name, due_date, criteria) VALUES (?, ?, ?, ?)",
            (project_id, title, scheduled_date or "", f"评审类型: {stage_type}")
        )
        return {"id": result["lastInsertRowid"]}
    except Exception as e:
        print("Sync review to agile failed:", str(e))
        return None

def create_notification(tenant_id: int, title: str, content: str, user_id: Optional[int] = None, mentor_id: Optional[int] = None, type_: str = "system", related_id: Optional[int] = None, related_type: Optional[str] = None):
    try:
        run_sql(
            """INSERT INTO notifications (tenant_id, mentor_id, user_id, type, title, content, related_id, related_type, is_read)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)""",
            (tenant_id or 1, mentor_id, user_id, type_, title, content, related_id, related_type)
        )
    except Exception as e:
        print("[Notification] Failed to create:", str(e))

# --- Routes ---

# 1. Dashboard
@router.get("/dashboard")
def get_dashboard(mentor_id: Optional[int] = None, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    active_mentor_id = get_mentor_id(ctx, mentor_id)
    
    active_students = query_all(
        """SELECT s.* FROM students s
           JOIN mentor_student_relations msr ON s.id = msr.student_id
           WHERE s.tenant_id = ? AND msr.mentor_id = ? AND msr.status = 'active' AND s.status = 'active'""",
        (tenant_id, active_mentor_id)
    )
    
    student_ids = [s["id"] for s in active_students]
    pending_tasks = 0
    completed_tasks = 0
    overdue_tasks = 0
    
    if student_ids:
        placeholders = ",".join("?" for _ in student_ids)
        today = datetime.now().strftime("%Y-%m-%d")
        
        task_stats = query_one(
            f"""SELECT
                   SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingTasks,
                   SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedTasks,
                   SUM(CASE WHEN status = 'pending' AND deadline < ? THEN 1 ELSE 0 END) as overdueTasks
                 FROM mentor_tasks WHERE tenant_id = ? AND mentor_id = ? AND student_id IN ({placeholders})""",
            (today, tenant_id, active_mentor_id, *student_ids)
        )
        if task_stats:
            pending_tasks = task_stats["pendingTasks"] or 0
            completed_tasks = task_stats["completedTasks"] or 0
            overdue_tasks = task_stats["overdueTasks"] or 0
            
    upcoming_reviews = query_all(
        """SELECT rs.*, s.name as student_name FROM review_stages rs
           JOIN students s ON rs.student_id = s.id
           JOIN mentor_student_relations msr ON s.id = msr.student_id
           WHERE s.tenant_id = ? AND msr.mentor_id = ? AND rs.status IN ('pending','in_progress')
           ORDER BY rs.scheduled_date ASC LIMIT 5""",
        (tenant_id, active_mentor_id)
    )
    
    recent_meetings = query_all(
        "SELECT * FROM meeting_records WHERE tenant_id = ? AND mentor_id = ? ORDER BY meeting_date DESC LIMIT 5",
        (tenant_id, active_mentor_id)
    )
    
    return {
        "stats": {
            "studentCount": len(active_students),
            "pendingTasks": pending_tasks,
            "completedTasks": completed_tasks,
            "overdueTasks": overdue_tasks
        },
        "students": active_students,
        "upcomingReviews": upcoming_reviews,
        "recentMeetings": recent_meetings
    }

# 2. Students
@router.get("/students")
def get_students(
    mentor_id: Optional[int] = None,
    page: Optional[int] = None,
    pageSize: Optional[int] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    if ctx["role"] == "student":
        student = get_current_student(ctx)
        return [student] if student else []
        
    active_mentor_id = get_mentor_id(ctx, mentor_id)
    paginated = page is not None or pageSize is not None
    
    if paginated:
        p = max(1, page or 1)
        ps = min(100, max(1, pageSize or 20))
        offset = (p - 1) * ps
        
        total_res = query_one(
            """SELECT COUNT(*) as count FROM students s
               JOIN mentor_student_relations msr ON s.id = msr.student_id
               WHERE s.tenant_id = ? AND msr.mentor_id = ? AND msr.status = 'active'""",
            (tenant_id, active_mentor_id)
        )
        total = total_res["count"] if total_res else 0
        
        data = query_all(
            """SELECT s.*, msr.relation_type, msr.start_date
               FROM students s
               JOIN mentor_student_relations msr ON s.id = msr.student_id
               WHERE s.tenant_id = ? AND msr.mentor_id = ? AND msr.status = 'active'
               ORDER BY s.created_at DESC LIMIT ? OFFSET ?""",
            (tenant_id, active_mentor_id, ps, offset)
        )
        return {"data": data, "total": total, "page": p, "pageSize": ps}
    else:
        students = query_all(
            """SELECT s.*, msr.relation_type, msr.start_date
               FROM students s
               JOIN mentor_student_relations msr ON s.id = msr.student_id
               WHERE s.tenant_id = ? AND msr.mentor_id = ? AND msr.status = 'active'
               ORDER BY s.created_at DESC""",
            (tenant_id, active_mentor_id)
        )
        return students

@router.get("/students/me")
def get_my_student_profile(ctx: dict = Depends(get_tenant_context)):
    student = get_current_student(ctx)
    if not student:
        raise HTTPException(status_code=404, detail="未找到关联的学生档案")
    return student

@router.get("/students/{student_id}")
def get_student_details(student_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    current_std = get_current_student(ctx)
    if ctx["role"] == "student" and (not current_std or current_std["id"] != student_id):
        raise HTTPException(status_code=403, detail="只能查看自己的学生档案")
        
    student = query_one("SELECT * FROM students WHERE tenant_id = ? AND id = ?", (tenant_id, student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    tasks = query_all("SELECT * FROM mentor_tasks WHERE tenant_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 100", (tenant_id, student_id))
    reviews = query_all("SELECT * FROM review_stages WHERE tenant_id = ? AND student_id = ? ORDER BY scheduled_date ASC LIMIT 50", (tenant_id, student_id))
    achievements = query_all("SELECT * FROM achievements WHERE tenant_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 50", (tenant_id, student_id))
    
    active_mentor_id = get_mentor_id(ctx)
    meetings = query_all(
        """SELECT DISTINCT m.* FROM meeting_records m, json_each(m.student_ids)
           WHERE m.tenant_id = ? AND m.mentor_id = ? AND json_each.value = ?
           ORDER BY m.meeting_date DESC""",
        (tenant_id, active_mentor_id, student_id)
    )
    activity_logs = query_all("SELECT * FROM activity_logs WHERE tenant_id = ? AND entity_type = 'student' AND entity_id = ? ORDER BY created_at DESC LIMIT 20", (tenant_id, student_id))
    
    return {
        "student": student,
        "tasks": tasks,
        "reviews": reviews,
        "achievements": achievements,
        "meetings": meetings,
        "activityLogs": activity_logs
    }

@router.post("/students")
def create_student(body: StudentCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    result = run_sql(
        """INSERT INTO students (tenant_id, name, email, student_id, grade, major, research_topic, enrollment_date, expected_graduation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, body.name, body.email, body.student_id, body.grade, body.major, body.research_topic, body.enrollment_date, body.expected_graduation)
    )
    new_student_id = result["lastInsertRowid"]
    active_mentor_id = get_mentor_id(ctx, body.mentor_id)
    
    start_date = body.enrollment_date or datetime.now().strftime("%Y-%m-%d")
    run_sql(
        "INSERT INTO mentor_student_relations (tenant_id, mentor_id, student_id, relation_type, start_date) VALUES (?, ?, ?, 'master', ?)",
        (tenant_id, active_mentor_id, new_student_id, start_date)
    )
    return {"id": new_student_id, "name": body.name}

@router.put("/students/{student_id}")
def update_student(student_id: int, body: StudentUpdateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    run_sql(
        "UPDATE students SET name = ?, email = ?, grade = ?, major = ?, research_topic = ?, status = ?, expected_graduation = ? WHERE id = ? AND tenant_id = ?",
        (body.name, body.email, body.grade, body.major, body.research_topic, body.status, body.expected_graduation, student_id, tenant_id)
    )
    return {"success": True}

@router.delete("/students/{student_id}")
def delete_student(student_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    run_sql("UPDATE mentor_student_relations SET status = 'ended' WHERE student_id = ? AND tenant_id = ?", (student_id, tenant_id))
    run_sql("UPDATE students SET status = 'graduated' WHERE id = ? AND tenant_id = ?", (student_id, tenant_id))
    return {"success": True}

# 3. Tasks
@router.get("/tasks")
def get_tasks(
    mentor_id: Optional[int] = None,
    student_id: Optional[int] = None,
    page: Optional[int] = None,
    pageSize: Optional[int] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    active_mentor_id = get_mentor_id(ctx, mentor_id)
    current_std = get_current_student(ctx)
    
    if ctx["role"] == "student" and not current_std:
        raise HTTPException(status_code=404, detail="未找到关联的学生档案")
        
    active_student_id = current_std["id"] if ctx["role"] == "student" else student_id
    
    paginated = page is not None or pageSize is not None
    base_where = "mt.tenant_id = ? AND mt.mentor_id = ?"
    base_params = [tenant_id, active_mentor_id]
    if active_student_id:
        base_where += " AND mt.student_id = ?"
        base_params.append(active_student_id)
        
    if paginated:
        p = max(1, page or 1)
        ps = min(100, max(1, pageSize or 20))
        offset = (p - 1) * ps
        
        total_res = query_one(
            f"SELECT COUNT(*) as count FROM mentor_tasks mt JOIN students s ON mt.student_id = s.id WHERE {base_where}",
            tuple(base_params)
        )
        total = total_res["count"] if total_res else 0
        
        data = query_all(
            f"""SELECT mt.*, s.name as student_name FROM mentor_tasks mt
               JOIN students s ON mt.student_id = s.id WHERE {base_where}
               ORDER BY mt.created_at DESC LIMIT ? OFFSET ?""",
            (*base_params, ps, offset)
        )
        return {"data": data, "total": total, "page": p, "pageSize": ps}
    else:
        return query_all(
            f"""SELECT mt.*, s.name as student_name FROM mentor_tasks mt
               JOIN students s ON mt.student_id = s.id WHERE {base_where}
               ORDER BY mt.created_at DESC""",
            tuple(base_params)
        )

@router.post("/tasks")
def create_task(body: TaskCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    active_mentor_id = get_mentor_id(ctx, body.mentor_id)
    
    result = run_sql(
        """INSERT INTO mentor_tasks (tenant_id, mentor_id, student_id, title, description, deadline, priority, category)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, active_mentor_id, body.student_id, body.title, body.description, body.deadline, body.priority, body.category)
    )
    task_id = result["lastInsertRowid"]
    
    # Sync to agile project
    agile_story = sync_task_to_agile(body.student_id, body.title, body.description, body.deadline, body.priority)
    
    # Notify student
    create_notification(
        tenant_id=tenant_id,
        title="新任务指派",
        content=f"导师给您指派了新任务「{body.title}」" + (f"，截止时间：{body.deadline}" if body.deadline else ""),
        user_id=body.student_id,
        mentor_id=active_mentor_id,
        type_="task",
        related_id=task_id,
        related_type="mentor_tasks"
    )
    return {"id": task_id, "success": True, "agile_story_id": agile_story["id"] if agile_story else None}

@router.put("/tasks/{task_id}")
def update_task(task_id: int, body: TaskUpdateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    completed_at = datetime.now().isoformat() if body.status == "completed" else None
    run_sql(
        """UPDATE mentor_tasks SET title = ?, description = ?, deadline = ?, priority = ?, status = ?, category = ?, completed_at = ?
           WHERE id = ? AND tenant_id = ?""",
        (body.title, body.description, body.deadline, body.priority, body.status, body.category, completed_at, task_id, tenant_id)
    )
    return {"success": True}

@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    run_sql("DELETE FROM mentor_tasks WHERE id = ? AND tenant_id = ?", (task_id, tenant_id))
    return {"success": True}

# Comments
@router.get("/tasks/{task_id}/comments")
def get_task_comments(task_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    task = query_one("SELECT student_id FROM mentor_tasks WHERE id = ? AND tenant_id = ?", (task_id, tenant_id))
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
        
    current_std = get_current_student(ctx)
    if ctx["role"] == "student" and task["student_id"] != current_std.get("id"):
        raise HTTPException(status_code=403, detail="只能查看自己任务的评论")
        
    return query_all("SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC LIMIT 100", (task_id,))

@router.post("/tasks/{task_id}/comments")
def create_task_comment(task_id: int, body: CommentCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    task = query_one("SELECT student_id FROM mentor_tasks WHERE id = ? AND tenant_id = ?", (task_id, tenant_id))
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
        
    current_std = get_current_student(ctx)
    if ctx["role"] == "student" and task["student_id"] != current_std.get("id"):
        raise HTTPException(status_code=403, detail="只能评论自己的任务")
        
    result = run_sql(
        "INSERT INTO task_comments (task_id, author_name, content) VALUES (?, ?, ?)",
        (task_id, body.author_name or "导师", body.content)
    )
    return {"id": result["lastInsertRowid"], "success": True}

@router.delete("/tasks/{task_id}/comments/{comment_id}")
def delete_task_comment(task_id: int, comment_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    task = query_one("SELECT student_id FROM mentor_tasks WHERE id = ? AND tenant_id = ?", (task_id, tenant_id))
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
        
    current_std = get_current_student(ctx)
    if ctx["role"] == "student" and task["student_id"] != current_std.get("id"):
        raise HTTPException(status_code=403, detail="只能删除自己任务的评论")
        
    run_sql("DELETE FROM task_comments WHERE id = ? AND task_id = ?", (comment_id, task_id))
    return {"success": True}

# 4. Reviews
@router.get("/reviews")
def get_reviews(
    mentor_id: Optional[int] = None,
    page: Optional[int] = None,
    pageSize: Optional[int] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    active_mentor_id = get_mentor_id(ctx, mentor_id)
    paginated = page is not None or pageSize is not None
    
    if paginated:
        p = max(1, page or 1)
        ps = min(100, max(1, pageSize or 20))
        offset = (p - 1) * ps
        
        total_res = query_one(
            """SELECT COUNT(*) as count FROM review_stages rs
               JOIN students s ON rs.student_id = s.id
               JOIN mentor_student_relations msr ON s.id = msr.student_id
               WHERE s.tenant_id = ? AND msr.mentor_id = ?""",
            (tenant_id, active_mentor_id)
        )
        total = total_res["count"] if total_res else 0
        
        data = query_all(
            """SELECT rs.*, s.name as student_name FROM review_stages rs
               JOIN students s ON rs.student_id = s.id
               JOIN mentor_student_relations msr ON s.id = msr.student_id
               WHERE s.tenant_id = ? AND msr.mentor_id = ?
               ORDER BY rs.scheduled_date ASC LIMIT ? OFFSET ?""",
            (tenant_id, active_mentor_id, ps, offset)
        )
        return {"data": data, "total": total, "page": p, "pageSize": ps}
    else:
        return query_all(
            """SELECT rs.*, s.name as student_name FROM review_stages rs
               JOIN students s ON rs.student_id = s.id
               JOIN mentor_student_relations msr ON s.id = msr.student_id
               WHERE s.tenant_id = ? AND msr.mentor_id = ? ORDER BY rs.scheduled_date ASC""",
            (tenant_id, active_mentor_id)
        )

@router.post("/reviews")
def create_review(body: ReviewCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    result = run_sql(
        "INSERT INTO review_stages (tenant_id, student_id, stage_type, title, scheduled_date) VALUES (?, ?, ?, ?, ?)",
        (tenant_id, body.student_id, body.stage_type, body.title, body.scheduled_date)
    )
    review_id = result["lastInsertRowid"]
    
    # Sync review to agile project
    agile_milestone = sync_review_to_agile(body.student_id, body.title, body.scheduled_date, body.stage_type)
    
    create_notification(
        tenant_id=tenant_id,
        title="评审节点安排",
        content=f"您的「{body.title}」已安排，时间：{body.scheduled_date or '待定'}",
        user_id=body.student_id,
        type_="review",
        related_id=review_id,
        related_type="review_stages"
    )
    return {"id": review_id, "success": True, "agile_milestone_id": agile_milestone["id"] if agile_milestone else None}

@router.put("/reviews/{review_id}")
def update_review(review_id: int, body: ReviewUpdateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    prev = query_one("SELECT student_id, title FROM review_stages WHERE id = ? AND tenant_id = ?", (review_id, tenant_id))
    
    run_sql(
        """UPDATE review_stages SET status = ?, scheduled_date = ?, completed_date = ?, score = ?, feedback = ?, notes = ?
           WHERE id = ? AND tenant_id = ?""",
        (body.status, body.scheduled_date, body.completed_date, body.score, body.feedback, body.notes, review_id, tenant_id)
    )
    
    # Notify on feedback or completion
    if prev and (body.feedback or body.status == "completed"):
        score_str = f"得分：{body.score}，" if body.score is not None else ""
        create_notification(
            tenant_id=tenant_id,
            title="评审已完成" if body.status == "completed" else "评审反馈更新",
            content=f"「{prev['title']}」{score_str}{body.feedback or ''}",
            user_id=prev["student_id"],
            type_="review",
            related_id=review_id,
            related_type="review_stages"
        )
    return {"success": True}

@router.delete("/reviews/{review_id}")
def delete_review(review_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    run_sql("DELETE FROM review_stages WHERE id = ? AND tenant_id = ?", (review_id, tenant_id))
    return {"success": True}

# 5. Meetings
@router.get("/meetings")
def get_meetings(
    mentor_id: Optional[int] = None,
    page: Optional[int] = None,
    pageSize: Optional[int] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    active_mentor_id = get_mentor_id(ctx, mentor_id)
    paginated = page is not None or pageSize is not None
    
    if paginated:
        p = max(1, page or 1)
        ps = min(100, max(1, pageSize or 20))
        offset = (p - 1) * ps
        
        total_res = query_one("SELECT COUNT(*) as count FROM meeting_records WHERE tenant_id = ? AND mentor_id = ?", (tenant_id, active_mentor_id))
        total = total_res["count"] if total_res else 0
        
        data = query_all(
            "SELECT * FROM meeting_records WHERE tenant_id = ? AND mentor_id = ? ORDER BY meeting_date DESC LIMIT ? OFFSET ?",
            (tenant_id, active_mentor_id, ps, offset)
        )
        return {"data": data, "total": total, "page": p, "pageSize": ps}
    else:
        return query_all("SELECT * FROM meeting_records WHERE tenant_id = ? AND mentor_id = ? ORDER BY meeting_date DESC LIMIT 50", (tenant_id, active_mentor_id))

@router.post("/meetings")
def create_meeting(body: MeetingCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    active_mentor_id = get_mentor_id(ctx, body.mentor_id)
    student_ids_json = json.dumps(body.student_ids)
    
    result = run_sql(
        """INSERT INTO meeting_records (tenant_id, mentor_id, student_ids, meeting_date, meeting_type, topic, summary, action_items, next_meeting_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, active_mentor_id, student_ids_json, body.meeting_date, body.meeting_type, body.topic, body.summary, body.action_items, body.next_meeting_date)
    )
    meeting_id = result["lastInsertRowid"]
    
    # Notify attendees
    for sid in body.student_ids:
        create_notification(
            tenant_id=tenant_id,
            title="组会安排",
            content=f"您有一场「{body.topic}」安排在 {body.meeting_date}",
            user_id=sid,
            mentor_id=active_mentor_id,
            type_="meeting",
            related_id=meeting_id,
            related_type="meeting_records"
        )
    return {"id": meeting_id, "success": True}

@router.put("/meetings/{meeting_id}")
def update_meeting(meeting_id: int, body: MeetingUpdateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    student_ids_json = json.dumps(body.student_ids)
    run_sql(
        """UPDATE meeting_records SET student_ids = ?, meeting_date = ?, meeting_type = ?, topic = ?, summary = ?, action_items = ?, next_meeting_date = ?, status = ?
           WHERE id = ? AND tenant_id = ?""",
        (student_ids_json, body.meeting_date, body.meeting_type, body.topic, body.summary, body.action_items, body.next_meeting_date, body.status, meeting_id, tenant_id)
    )
    return {"success": True}

@router.delete("/meetings/{meeting_id}")
def delete_meeting(meeting_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    run_sql("DELETE FROM meeting_records WHERE id = ? AND tenant_id = ?", (meeting_id, tenant_id))
    return {"success": True}

# 6. Achievements
@router.get("/achievements")
def get_achievements(student_id: Optional[int] = None, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    sql = "SELECT a.* FROM achievements a JOIN students s ON a.student_id = s.id WHERE s.tenant_id = ?"
    params = [tenant_id]
    if student_id:
        sql += " AND a.student_id = ?"
        params.append(student_id)
    sql += " ORDER BY a.created_at DESC"
    return query_all(sql, tuple(params))

@router.post("/achievements")
def create_achievement(body: AchievementCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    result = run_sql(
        """INSERT INTO achievements (tenant_id, student_id, title, achievement_type, journal_or_conference, publish_date, doi_or_link, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, body.student_id, body.title, body.achievement_type, body.journal_or_conference, body.publish_date, body.doi_or_link, body.status, body.notes)
    )
    achievement_id = result["lastInsertRowid"]
    create_notification(
        tenant_id=tenant_id,
        title="学术成果记录更新",
        content=f"您的「{body.title}」已录入系统",
        user_id=body.student_id,
        type_="achievement",
        related_id=achievement_id,
        related_type="achievements"
    )
    return {"id": achievement_id, "success": True}

@router.put("/achievements/{achievement_id}")
def update_achievement(achievement_id: int, body: AchievementUpdateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    run_sql(
        """UPDATE achievements SET title = ?, achievement_type = ?, journal_or_conference = ?, publish_date = ?, doi_or_link = ?, status = ?, notes = ?
           WHERE id = ? AND tenant_id = ?""",
        (body.title, body.achievement_type, body.journal_or_conference, body.publish_date, body.doi_or_link, body.status, body.notes, achievement_id, tenant_id)
    )
    return {"success": True}

@router.delete("/achievements/{achievement_id}")
def delete_achievement(achievement_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    run_sql("DELETE FROM achievements WHERE id = ? AND tenant_id = ?", (achievement_id, tenant_id))
    return {"success": True}

# 7. Notifications
@router.get("/notifications")
def get_notifications(
    mentor_id: Optional[int] = None,
    user_id: Optional[int] = None,
    is_read: Optional[int] = None,
    type: Optional[str] = None,
    limit: int = 50,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    active_mentor_id = get_mentor_id(ctx, mentor_id)
    
    # Notifications belong to user OR mentor
    sql = "SELECT * FROM notifications WHERE tenant_id = ?"
    params = [tenant_id]
    
    # Filter user_id or roles
    if user_id:
        sql += " AND (user_id = ? OR mentor_id = ?)"
        params.extend([user_id, user_id])
    else:
        # Default to current user
        uid = ctx["user"]["id"]
        sql += " AND (user_id = ? OR mentor_id = ?)"
        params.extend([uid, uid])
        
    if is_read is not None:
        sql += " AND is_read = ?"
        params.append(is_read)
    if type:
        sql += " AND type = ?"
        params.append(type)
        
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    
    return query_all(sql, tuple(params))

@router.get("/notifications/unread-count")
def get_unread_notification_count(user_id: Optional[int] = None, mentor_id: Optional[int] = None, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    sql = "SELECT COUNT(*) as count FROM notifications WHERE is_read = 0 AND tenant_id = ?"
    params = [tenant_id]
    
    uid = user_id or ctx["user"]["id"]
    sql += " AND (user_id = ? OR mentor_id = ?)"
    params.extend([uid, uid])
    
    res = query_one(sql, tuple(params))
    return {"count": res["count"] if res else 0}

@router.post("/notifications/mark-all-read")
def mark_all_notifications_read(user_id: Optional[int] = None, mentor_id: Optional[int] = None, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    uid = user_id or ctx["user"]["id"]
    run_sql(
        "UPDATE notifications SET is_read = 1 WHERE (user_id = ? OR mentor_id = ?) AND is_read = 0 AND tenant_id = ?",
        (uid, uid, tenant_id)
    )
    return {"success": True}

# 8. Calendar
@router.get("/calendar")
def get_calendar_events(
    mentor_id: Optional[int] = None,
    student_id: Optional[int] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    active_mentor_id = get_mentor_id(ctx, mentor_id)
    
    events = []
    
    # 1. Meetings
    meeting_sql = "SELECT * FROM meeting_records WHERE tenant_id = ? AND mentor_id = ?"
    meeting_params = [tenant_id, active_mentor_id]
    if start:
        meeting_sql += " AND meeting_date >= ?"
        meeting_params.append(start)
    if end:
        meeting_sql += " AND meeting_date <= ?"
        meeting_params.append(end)
        
    meetings = query_all(meeting_sql, tuple(meeting_params))
    for m in meetings:
        events.append({
            "id": f"meeting-{m['id']}",
            "type": "meeting",
            "title": f"组会: {m['topic']}",
            "start": m["meeting_date"],
            "end": m["meeting_date"],
            "allDay": True,
            "details": m["summary"],
            "status": m["status"]
        })
        
    # 2. Tasks
    task_sql = "SELECT mt.*, s.name as student_name FROM mentor_tasks mt JOIN students s ON mt.student_id = s.id WHERE mt.tenant_id = ? AND mt.mentor_id = ?"
    task_params = [tenant_id, active_mentor_id]
    if student_id:
        task_sql += " AND mt.student_id = ?"
        task_params.append(student_id)
    if start:
        task_sql += " AND mt.deadline >= ?"
        task_params.append(start)
    if end:
        task_sql += " AND mt.deadline <= ?"
        task_params.append(end)
        
    tasks = query_all(task_sql, tuple(task_params))
    for t in tasks:
        events.append({
            "id": f"task-{t['id']}",
            "type": "task",
            "title": f"任务({t['student_name']}): {t['title']}",
            "start": t["deadline"],
            "end": t["deadline"],
            "allDay": True,
            "details": t["description"],
            "status": t["status"],
            "priority": t["priority"]
        })
        
    # 3. Reviews
    review_sql = """SELECT rs.*, s.name as student_name FROM review_stages rs
                    JOIN students s ON rs.student_id = s.id
                    JOIN mentor_student_relations msr ON s.id = msr.student_id
                    WHERE s.tenant_id = ? AND msr.mentor_id = ?"""
    review_params = [tenant_id, active_mentor_id]
    if student_id:
        review_sql += " AND rs.student_id = ?"
        review_params.append(student_id)
    if start:
        review_sql += " AND rs.scheduled_date >= ?"
        review_params.append(start)
    if end:
        review_sql += " AND rs.scheduled_date <= ?"
        review_params.append(end)
        
    reviews = query_all(review_sql, tuple(review_params))
    for r in reviews:
        events.append({
            "id": f"review-{r['id']}",
            "type": "review",
            "title": f"评审({r['student_name']}): {r['title']}",
            "start": r["scheduled_date"],
            "end": r["scheduled_date"],
            "allDay": True,
            "details": r["notes"],
            "status": r["status"],
            "stage_type": r["stage_type"]
        })
        
    return events

# 9. Files
@router.post("/files")
async def upload_file(
    file: UploadFile = File(...),
    category: Optional[str] = Form("document"),
    tags: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    student_id: Optional[int] = Form(None),
    mentor_id: Optional[int] = Form(None),
    uploaded_by: Optional[int] = Form(None),
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    user_id = uploaded_by or ctx["user"]["id"]
    active_mentor_id = get_mentor_id(ctx, mentor_id)
    
    # Create unique stored filename
    ext = file.filename.split(".")[-1] if "." in file.filename else "dat"
    unique_suffix = f"{secrets.randbelow(1000000000)}-{int(datetime.now().timestamp())}"
    stored_name = f"{unique_suffix}.{ext}"
    
    file_path = os.path.join(UPLOAD_DIR, stored_name)
    
    # Save the file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    file_size = os.path.getsize(file_path)
    
    result = run_sql(
        """INSERT INTO files (original_name, stored_name, mime_type, size, category, tags, description, uploaded_by, student_id, mentor_id, path, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            file.filename,
            stored_name,
            file.content_type,
            file_size,
            category or "document",
            tags,
            description,
            user_id,
            student_id,
            active_mentor_id,
            stored_name,
            tenant_id
        )
    )
    return {"id": result["lastInsertRowid"], "success": True, "original_name": file.filename}

@router.get("/files")
def get_files(
    mentor_id: Optional[int] = None,
    student_id: Optional[int] = None,
    category: Optional[str] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    active_mentor_id = get_mentor_id(ctx, mentor_id)
    
    sql = "SELECT f.*, u.name as uploader_name FROM files f LEFT JOIN users u ON f.uploaded_by = u.id WHERE f.tenant_id = ?"
    params = [tenant_id]
    
    # Filter by user role/ownership
    if ctx["role"] == "student":
        # Students see files assigned to them or uploaded by them
        sql += " AND (f.student_id = ? OR f.uploaded_by = ?)"
        params.extend([ctx["user"]["id"], ctx["user"]["id"]])
    else:
        sql += " AND f.mentor_id = ?"
        params.append(active_mentor_id)
        if student_id:
            sql += " AND f.student_id = ?"
            params.append(student_id)
            
    if category:
        sql += " AND f.category = ?"
        params.append(category)
        
    sql += " ORDER BY f.created_at DESC"
    return query_all(sql, tuple(params))

@router.get("/files/{file_id}/download")
def download_file(file_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    file = query_one("SELECT * FROM files WHERE id = ? AND tenant_id = ?", (file_id, tenant_id))
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
        
    file_path = os.path.join(UPLOAD_DIR, file["path"])
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件已丢失")
        
    return FileResponse(file_path, media_type=file["mime_type"] or "application/octet-stream", filename=file["original_name"])

@router.put("/files/{file_id}")
def update_file_meta(file_id: int, body: AchievementUpdateSchema, ctx: dict = Depends(get_tenant_context)):
    # Reuses AchievementUpdateSchema as shape matches
    tenant_id = ctx["tenant_id"]
    run_sql(
        "UPDATE files SET original_name = ?, category = ?, tags = ?, description = ? WHERE id = ? AND tenant_id = ?",
        (body.title, body.achievement_type, body.journal_or_conference, body.publish_date, file_id, tenant_id)
    )
    return {"success": True}

@router.delete("/files/{file_id}")
def delete_file(file_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    file = query_one("SELECT * FROM files WHERE id = ? AND tenant_id = ?", (file_id, tenant_id))
    if file:
        file_path = os.path.join(UPLOAD_DIR, file["path"])
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            print("Delete file failed:", str(e))
            
    run_sql("DELETE FROM files WHERE id = ? AND tenant_id = ?", (file_id, tenant_id))
    return {"success": True}

# 10. Activity Logs
@router.get("/activity-logs")
def get_activity_logs(limit: int = 20, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    return query_all(
        "SELECT * FROM activity_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?",
        (tenant_id, limit)
    )

@router.post("/activity-logs")
def create_activity_log(body: ActivityLogCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    active_mentor_id = get_mentor_id(ctx, body.mentor_id)
    
    result = run_sql(
        """INSERT INTO activity_logs (mentor_id, action, entity_type, entity_id, details, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (active_mentor_id, body.action, body.entity_type, body.entity_id, body.details, tenant_id)
    )
    return {"id": result["lastInsertRowid"], "success": True}

# 11. Links (Student-Project Link)
@router.get("/students/{student_id}/projects")
def get_student_project_links(student_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    student = query_one("SELECT id FROM students WHERE tenant_id = ? AND id = ?", (tenant_id, student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    current_std = get_current_student(ctx)
    if ctx["role"] == "student" and (not current_std or current_std["id"] != student_id):
        raise HTTPException(status_code=403, detail="只能查看自己的项目")
        
    return query_all("SELECT * FROM student_projects WHERE tenant_id = ? AND student_id = ? LIMIT 20", (tenant_id, student_id))

@router.post("/students/{student_id}/projects")
def link_student_project(student_id: int, body: LinkProjectSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    if ctx["role"] == "student":
        raise HTTPException(status_code=403, detail="学生不能修改项目关联")
        
    student = query_one("SELECT id FROM students WHERE id = ? AND tenant_id = ?", (student_id, tenant_id))
    project = query_one("SELECT id FROM projects WHERE id = ? AND tenant_id = ?", (body.agile_project_id, tenant_id))
    if not student or not project:
        raise HTTPException(status_code=404, detail="学生或项目不存在")
        
    result = run_sql(
        "INSERT INTO student_projects (student_id, agile_project_id, project_name, tenant_id) VALUES (?, ?, ?, ?)",
        (student_id, body.agile_project_id, body.project_name, tenant_id)
    )
    return {"id": result["lastInsertRowid"], "success": True}

@router.delete("/students/{student_id}/projects/{link_id}")
def unlink_student_project(student_id: int, link_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    if ctx["role"] == "student":
        raise HTTPException(status_code=403, detail="学生不能修改项目关联")
        
    run_sql("DELETE FROM student_projects WHERE id = ? AND student_id = ? AND tenant_id = ?", (link_id, student_id, tenant_id))
    return {"success": True}

# 12. Seed Endpoint
@router.post("/seed")
def seed_demo_data(ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    
    # Only seed if tables are empty
    mentors_count = query_one("SELECT COUNT(*) as count FROM mentors")["count"]
    if mentors_count == 0:
        run_sql(
            "INSERT INTO mentors (id, name, email, department, title) VALUES (1, '张教授', 'prof.zhang@university.edu.cn', '计算机学院', '博士生导师')"
        )
        
    students_count = query_one("SELECT COUNT(*) as count FROM students")["count"]
    if students_count == 0:
        demo_students = [
            ("李明", "liming@stu.edu.cn", "202301001", "研一", "计算机科学", "基于深度学习的图像分类研究", "2023-09-01", "2026-06-30"),
            ("王芳", "wangfang@stu.edu.cn", "202301002", "研一", "软件工程", "微服务架构下的智能运维系统", "2023-09-01", "2026-06-30"),
            ("张伟", "zhangwei@stu.edu.cn", "202201003", "研二", "人工智能", "大语言模型在代码生成中的应用", "2022-09-01", "2025-06-30"),
            ("刘洋", "liuyang@stu.edu.cn", "202201004", "研二", "数据科学", "时序数据异常检测算法研究", "2022-09-01", "2025-06-30"),
            ("陈静", "chenjing@stu.edu.cn", "202101005", "研三", "网络安全", "联邦学习中的隐私保护机制", "2021-09-01", "2024-06-30")
        ]
        for s in demo_students:
            result = run_sql(
                """INSERT INTO students (name, email, student_id, grade, major, research_topic, enrollment_date, expected_graduation, tenant_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (*s, tenant_id)
            )
            run_sql(
                "INSERT INTO mentor_student_relations (mentor_id, student_id, relation_type, start_date, tenant_id) VALUES (?, ?, 'master', ?, ?)",
                (1, result["lastInsertRowid"], s[6], tenant_id)
            )
            
        # Demo Reviews
        demo_reviews = [
            (1, "proposal", "开题答辩", "2024-03-15"),
            (2, "proposal", "开题答辩", "2024-03-20"),
            (3, "midterm", "中期考核", "2024-06-01"),
            (4, "midterm", "中期考核", "2024-06-10"),
            (5, "defense", "毕业答辩", "2024-05-20")
        ]
        for r in demo_reviews:
            run_sql(
                "INSERT INTO review_stages (student_id, stage_type, title, scheduled_date, tenant_id) VALUES (?, ?, ?, ?, ?)",
                (*r, tenant_id)
            )
            
        # Demo Tasks
        demo_tasks = [
            (1, 1, "阅读相关文献综述", "完成领域内20篇核心论文阅读", "2024-04-01", "high", "reading"),
            (1, 2, "搭建实验环境", "配置GPU服务器和深度学习框架", "2024-03-30", "high", "experiment"),
            (1, 3, "完成开题报告初稿", "撰写开题报告并提交导师审核", "2024-03-10", "urgent", "writing"),
            (1, 4, "复现基准模型", "复现3篇SOTA论文的实验结果", "2024-04-15", "medium", "experiment"),
            (1, 5, "准备答辩PPT", "制作毕业答辩演示文稿", "2024-05-10", "high", "writing")
        ]
        for t in demo_tasks:
            run_sql(
                """INSERT INTO mentor_tasks (mentor_id, student_id, title, description, deadline, priority, category, tenant_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (*t, tenant_id)
            )
            
        # Demo Meetings
        demo_meetings = [
            (1, json.dumps([1, 2, 3]), "2024-03-01", "group", "本周组会", "讨论各学生进度，李明进度稍慢需加快", "李明：下周完成环境搭建；王芳：开始文献阅读", "2024-03-08")
        ]
        for m in demo_meetings:
            run_sql(
                """INSERT INTO meeting_records (mentor_id, student_ids, meeting_date, meeting_type, topic, summary, action_items, next_meeting_date, tenant_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (*m, tenant_id)
            )
            
    return {"success": True}

# --- 13. Attendance ---
class CheckInSchema(BaseModel):
    user_id: int
    student_id: Optional[int] = None
    work_content: Optional[str] = None
    check_type: Optional[str] = "normal"

class CheckOutSchema(BaseModel):
    id: int
    work_content: Optional[str] = None

@router.post("/attendance/check-in")
def check_in(body: CheckInSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    now = datetime.now().isoformat()
    today = now.split("T")[0]
    
    existing = query_one(
        "SELECT id FROM attendance_records WHERE user_id = ? AND date(check_in_time) = ? AND tenant_id = ? LIMIT 1",
        (body.user_id, today, tenant_id)
    )
    if existing:
        raise HTTPException(status_code=409, detail="今日已打卡")
        
    result = run_sql(
        """INSERT INTO attendance_records (user_id, student_id, check_in_time, work_content, check_type, status, tenant_id)
           VALUES (?, ?, ?, ?, ?, 'checked_in', ?)""",
        (body.user_id, body.student_id, now, body.work_content, body.check_type or "normal", tenant_id)
    )
    return {"id": result["lastInsertRowid"], "check_in_time": now, "success": True}

@router.post("/attendance/check-out")
def check_out(body: CheckOutSchema, ctx: dict = Depends(get_tenant_context)):
    record = query_one("SELECT * FROM attendance_records WHERE id = ?", (body.id,))
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record["status"] != "checked_in":
        raise HTTPException(status_code=409, detail="已签退")
        
    now = datetime.now().isoformat()
    check_in_time = datetime.fromisoformat(record["check_in_time"])
    check_out_time = datetime.fromisoformat(now)
    hours = max(0.0, (check_out_time - check_in_time).total_seconds() / 3600.0)
    
    run_sql(
        "UPDATE attendance_records SET check_out_time = ?, work_content = ?, work_hours = round(?, 2), status = 'checked_out', updated_at = ? WHERE id = ?",
        (now, body.work_content or record["work_content"], hours, now, body.id)
    )
    return {"id": body.id, "check_out_time": now, "work_hours": round(hours, 2), "success": True}

@router.get("/attendance")
def get_attendance(
    user_id: Optional[int] = None,
    student_id: Optional[int] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    sql = """SELECT ar.*, u.name as user_name, s.name as student_name
             FROM attendance_records ar
             LEFT JOIN users u ON ar.user_id = u.id
             LEFT JOIN students s ON ar.student_id = s.id
             WHERE ar.tenant_id = ?"""
    params = [tenant_id]
    if user_id is not None:
        sql += " AND ar.user_id = ?"
        params.append(user_id)
    if student_id is not None:
        sql += " AND ar.student_id = ?"
        params.append(student_id)
    if start:
        sql += " AND date(ar.check_in_time) >= ?"
        params.append(start)
    if end:
        sql += " AND date(ar.check_in_time) <= ?"
        params.append(end)
        
    sql += " ORDER BY ar.check_in_time DESC"
    return query_all(sql, tuple(params))

@router.get("/attendance/stats")
def get_attendance_stats(
    user_id: Optional[int] = None,
    student_id: Optional[int] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    sql = """SELECT
              COUNT(*) as total_days,
              SUM(CASE WHEN status = 'checked_out' THEN 1 ELSE 0 END) as completed_days,
              SUM(work_hours) as total_hours,
              AVG(work_hours) as avg_hours,
              MAX(work_hours) as max_hours
             FROM attendance_records WHERE tenant_id = ?"""
    params = [tenant_id]
    if user_id is not None:
        sql += " AND user_id = ?"
        params.append(user_id)
    if student_id is not None:
        sql += " AND student_id = ?"
        params.append(student_id)
    if start:
        sql += " AND date(check_in_time) >= ?"
        params.append(start)
    if end:
        sql += " AND date(check_in_time) <= ?"
        params.append(end)
        
    stats = query_one(sql, tuple(params))
    
    daily_sql = """SELECT date(check_in_time) as day,
                    COUNT(*) as count,
                    SUM(work_hours) as hours
                   FROM attendance_records WHERE tenant_id = ?"""
    daily_params = [tenant_id]
    if user_id is not None:
        daily_sql += " AND user_id = ?"
        daily_params.append(user_id)
    if student_id is not None:
        daily_sql += " AND student_id = ?"
        daily_params.append(student_id)
    if start:
        daily_sql += " AND date(check_in_time) >= ?"
        daily_params.append(start)
    if end:
        daily_sql += " AND date(check_in_time) <= ?"
        daily_params.append(end)
    daily_sql += " GROUP BY date(check_in_time) ORDER BY day"
    
    daily = query_all(daily_sql, tuple(daily_params))
    return {**(stats or {}), "daily": daily}

