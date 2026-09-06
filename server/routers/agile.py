from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import io

from server.database import query_one, query_all, run_sql, run_transaction
from server.dependencies import get_tenant_context

router = APIRouter(tags=["agile"])

# --- Pydantic Schemas ---
class ProjectCreateSchema(BaseModel):
    name: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = "active"

class ProjectUpdateSchema(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None

class StoryCreateSchema(BaseModel):
    project_id: int
    title: str
    description: Optional[str] = ""
    priority: Optional[str] = "M"
    story_points: Optional[int] = 3
    sprint_id: Optional[int] = None
    status: Optional[str] = "backlog"
    acceptance_criteria: Optional[str] = ""

class StoryUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    story_points: Optional[int] = None
    sprint_id: Optional[int] = None
    status: Optional[str] = None
    acceptance_criteria: Optional[str] = None

class InboxCreateSchema(BaseModel):
    project_id: int
    title: str
    content: Optional[str] = ""
    item_type: Optional[str] = "idea"
    source_url: Optional[str] = ""
    priority: Optional[str] = "B"

class InboxUpdateSchema(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    item_type: Optional[str] = None
    source_url: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None

class InboxConvertSchema(BaseModel):
    target_type: str
    priority: Optional[str] = "B"
    due_date: Optional[str] = None
    schedule_date: Optional[str] = None
    schedule_time: Optional[str] = ""
    location: Optional[str] = ""
    note: Optional[str] = ""

class ScheduleCreateSchema(BaseModel):
    project_id: int
    title: str
    date: str
    time: Optional[str] = ""
    location: Optional[str] = ""
    note: Optional[str] = ""
    source_legacy_id: Optional[str] = None

class ScheduleUpdateSchema(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    location: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None

class SprintCreateSchema(BaseModel):
    project_id: int
    number: int
    name: str
    start_date: str
    end_date: str
    goal: Optional[str] = ""
    status: Optional[str] = "planned"

class SprintUpdateSchema(BaseModel):
    number: Optional[int] = None
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    goal: Optional[str] = None
    status: Optional[str] = None

class TaskCreateSchema(BaseModel):
    project_id: Optional[int] = None
    story_id: Optional[int] = None
    sprint_id: Optional[int] = None
    title: str
    description: Optional[str] = ""
    priority: Optional[str] = "B"
    status: Optional[str] = "backlog"
    sort_order: Optional[int] = 0
    due_date: Optional[str] = None

class TaskUpdateSchema(BaseModel):
    project_id: Optional[int] = None
    story_id: Optional[int] = None
    sprint_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    sort_order: Optional[int] = None
    due_date: Optional[str] = None

class StandupCreateSchema(BaseModel):
    sprint_id: int
    date: str
    yesterday: Optional[str] = ""
    today: Optional[str] = ""
    blockers: Optional[str] = ""
    notes: Optional[str] = ""

class StandupUpdateSchema(BaseModel):
    date: Optional[str] = None
    yesterday: Optional[str] = None
    today: Optional[str] = None
    blockers: Optional[str] = None
    notes: Optional[str] = None

class DailyLogCreateSchema(BaseModel):
    project_id: int
    date: str
    yesterday: Optional[str] = ""
    today: Optional[str] = ""
    blockers: Optional[str] = ""
    notes: Optional[str] = ""

class DailyLogUpdateSchema(BaseModel):
    date: Optional[str] = None
    yesterday: Optional[str] = None
    today: Optional[str] = None
    blockers: Optional[str] = None
    notes: Optional[str] = None

class RiskCreateSchema(BaseModel):
    project_id: int
    title: str
    description: Optional[str] = ""
    probability: Optional[int] = 3
    impact: Optional[int] = 3
    level: Optional[str] = "medium"
    priority: Optional[str] = "B"
    strategy: Optional[str] = ""
    status: Optional[str] = "monitoring"

class RiskUpdateSchema(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    probability: Optional[int] = None
    impact: Optional[int] = None
    level: Optional[str] = None
    priority: Optional[str] = None
    strategy: Optional[str] = None
    status: Optional[str] = None

class MilestoneCreateSchema(BaseModel):
    project_id: int
    name: str
    due_date: Optional[str] = ""
    status: Optional[str] = "pending"
    criteria: Optional[str] = ""

class MilestoneUpdateSchema(BaseModel):
    name: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    criteria: Optional[str] = None

class LiteratureCreateSchema(BaseModel):
    project_id: int
    title: str
    authors: Optional[str] = ""
    journal: Optional[str] = ""
    year: Optional[int] = None
    doi: Optional[str] = ""
    abstract: Optional[str] = ""
    notes: Optional[str] = ""
    tags: Optional[str] = ""
    rating: Optional[int] = 0
    status: Optional[str] = "unread"

class LiteratureUpdateSchema(BaseModel):
    title: Optional[str] = None
    authors: Optional[str] = None
    journal: Optional[str] = None
    year: Optional[int] = None
    doi: Optional[str] = None
    abstract: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    rating: Optional[int] = None
    status: Optional[str] = None

class AgileMeetingCreateSchema(BaseModel):
    project_id: int
    mentor_name: Optional[str] = ""
    meeting_date: str
    topic: Optional[str] = ""
    summary: Optional[str] = ""
    action_items: Optional[str] = ""
    next_meeting: Optional[str] = ""
    notes: Optional[str] = ""

class AgileMeetingUpdateSchema(BaseModel):
    mentor_name: Optional[str] = None
    meeting_date: Optional[str] = None
    topic: Optional[str] = None
    summary: Optional[str] = None
    action_items: Optional[str] = None
    next_meeting: Optional[str] = None
    notes: Optional[str] = None

# ==================== Agile Proxy Routes ====================

@router.get("/agile/projects")
def get_agile_projects(ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    return query_all("SELECT * FROM projects WHERE tenant_id = ? ORDER BY id DESC LIMIT 100", (tenant_id,))

@router.get("/agile/projects/{project_id}/stats")
def get_agile_project_stats(project_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    project = query_one("SELECT id FROM projects WHERE id = ? AND tenant_id = ?", (project_id, tenant_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    total_stories = query_one("SELECT COUNT(*) as count FROM user_stories WHERE project_id = ? AND tenant_id = ?", (project_id, tenant_id))
    done_stories = query_one("SELECT COUNT(*) as count FROM user_stories WHERE project_id = ? AND tenant_id = ? AND status = 'done'", (project_id, tenant_id))
    
    total_tasks = query_one(
        """SELECT COUNT(*) as count FROM agile_tasks WHERE tenant_id = ?
           AND story_id IN (SELECT id FROM user_stories WHERE project_id = ? AND tenant_id = ?)""",
        (tenant_id, project_id, tenant_id)
    )
    done_tasks = query_one(
        """SELECT COUNT(*) as count FROM agile_tasks WHERE tenant_id = ?
           AND story_id IN (SELECT id FROM user_stories WHERE project_id = ? AND tenant_id = ?)
           AND status = 'done'""",
        (tenant_id, project_id, tenant_id)
    )
    
    active_sprint = query_one(
        "SELECT * FROM sprints WHERE project_id = ? AND tenant_id = ? AND status = 'active' ORDER BY end_date DESC LIMIT 1",
        (project_id, tenant_id)
    )
    
    milestones = query_all("SELECT * FROM agile_milestones WHERE project_id = ? AND tenant_id = ? ORDER BY due_date LIMIT 50", (project_id, tenant_id))
    
    return {
        "totalStories": total_stories["count"] if total_stories else 0,
        "doneStories": done_stories["count"] if done_stories else 0,
        "totalTasks": total_tasks["count"] if total_tasks else 0,
        "doneTasks": done_tasks["count"] if done_tasks else 0,
        "activeSprint": active_sprint,
        "milestones": milestones
    }

@router.get("/agile/projects/{project_id}/milestones")
def get_agile_project_milestones(project_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    return query_all("SELECT * FROM agile_milestones WHERE project_id = ? AND tenant_id = ? ORDER BY due_date LIMIT 50", (project_id, tenant_id))

@router.get("/agile/projects/{project_id}/sprints")
def get_agile_project_sprints(project_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    return query_all("SELECT * FROM sprints WHERE project_id = ? AND tenant_id = ? ORDER BY start_date DESC LIMIT 50", (project_id, tenant_id))

@router.get("/agile/projects/{project_id}/stories")
def get_agile_project_stories(project_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    return query_all("SELECT * FROM user_stories WHERE project_id = ? AND tenant_id = ? ORDER BY priority, created_at DESC LIMIT 200", (project_id, tenant_id))


# ==================== Projects Native Routes ====================

@router.get("/projects")
def get_projects(
    id: Optional[int] = None,
    action: Optional[str] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    
    # GET /projects?id=1&action=stats
    if id is not None and action == "stats":
        project = query_one("SELECT id FROM projects WHERE id = ? AND tenant_id = ?", (id, tenant_id))
        if not project:
            raise HTTPException(status_code=404, detail="Not found")
            
        story_stats = query_one(
            """SELECT
                COUNT(*) as totalStories,
                COUNT(CASE WHEN status = 'done' THEN 1 END) as completedStories,
                COALESCE(SUM(story_points), 0) as totalPoints,
                COALESCE(SUM(CASE WHEN status = 'done' THEN story_points ELSE 0 END), 0) as completedPoints
              FROM user_stories WHERE project_id = ? AND tenant_id = ?""",
            (id, tenant_id)
        )
        
        task_stats = query_one(
            """SELECT
                COUNT(*) as totalTasks,
                COUNT(CASE WHEN t.status = 'done' THEN 1 END) as doneTasks
              FROM agile_tasks t
              LEFT JOIN user_stories s ON t.story_id = s.id
              WHERE t.tenant_id = ?
                AND (
                    t.project_id = ?
                    OR s.project_id = ?
                    OR t.sprint_id IN (SELECT id FROM sprints WHERE project_id = ? AND tenant_id = ?)
                )""",
            (tenant_id, id, id, id, tenant_id)
        )
        
        active_sprint = query_one(
            "SELECT * FROM sprints WHERE project_id = ? AND tenant_id = ? AND status != 'completed' ORDER BY number LIMIT 1",
            (id, tenant_id)
        )
        
        milestones = query_all("SELECT * FROM agile_milestones WHERE project_id = ? AND tenant_id = ? ORDER BY due_date", (id, tenant_id))
        
        total_stories = story_stats["totalStories"] if story_stats else 0
        completed_stories = story_stats["completedStories"] if story_stats else 0
        total_points = story_stats["totalPoints"] if story_stats else 0
        completed_points = story_stats["completedPoints"] if story_stats else 0
        
        total_tasks = task_stats["totalTasks"] if task_stats else 0
        done_tasks = task_stats["doneTasks"] if task_stats else 0
        
        return {
            "totalStories": total_stories,
            "completedStories": completed_stories,
            "totalPoints": total_points,
            "completedPoints": completed_points,
            "totalTasks": total_tasks,
            "doneTasks": done_tasks,
            "activeSprint": active_sprint,
            "milestones": milestones,
            "storyCompletionRate": int(round(completed_stories / total_stories * 100)) if total_stories else 0,
            "pointsCompletionRate": int(round(completed_points / total_points * 100)) if total_points else 0
        }
        
    # GET /projects?id=1
    if id is not None:
        project = query_one("SELECT * FROM projects WHERE id = ? AND tenant_id = ?", (id, tenant_id))
        if not project:
            raise HTTPException(status_code=404, detail="Not found")
        return project
        
    # GET /projects
    return query_all("SELECT * FROM projects WHERE tenant_id = ?", (tenant_id,))

@router.post("/projects")
def create_project(body: ProjectCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="请输入项目名称")
        
    today = datetime.now().strftime("%Y-%m-%d")
    next_year = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
    
    result = run_sql(
        "INSERT INTO projects (tenant_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)",
        (tenant_id, name, body.start_date or today, body.end_date or next_year, body.status)
    )
    return query_one("SELECT * FROM projects WHERE id = ? AND tenant_id = ?", (result["lastInsertRowid"], tenant_id))

@router.put("/projects")
def update_project(id: int = Query(...), body: ProjectUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    project = query_one("SELECT id FROM projects WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
        
    updates = []
    params = []
    
    if body.name is not None:
        updates.append("name = ?")
        params.append(body.name.strip())
    if body.start_date is not None:
        updates.append("start_date = ?")
        params.append(body.start_date)
    if body.end_date is not None:
        updates.append("end_date = ?")
        params.append(body.end_date)
    if body.status is not None:
        updates.append("status = ?")
        params.append(body.status)
        
    if not updates:
        raise HTTPException(status_code=400, detail="没有可更新的内容")
        
    params.extend([id, tenant_id])
    run_sql(f"UPDATE projects SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return query_one("SELECT * FROM projects WHERE id = ? AND tenant_id = ?", (id, tenant_id))

@router.delete("/projects")
def delete_project(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    project = query_one("SELECT id FROM projects WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
        
    count_res = query_one("SELECT COUNT(*) AS count FROM projects WHERE tenant_id = ?", (tenant_id,))
    if count_res and count_res["count"] <= 1:
        raise HTTPException(status_code=409, detail="至少保留一个项目")
        
    sprints = query_all("SELECT id FROM sprints WHERE project_id = ? AND tenant_id = ?", (id, tenant_id))
    stories = query_all("SELECT id FROM user_stories WHERE project_id = ? AND tenant_id = ?", (id, tenant_id))
    
    sprint_ids = [s["id"] for s in sprints]
    story_ids = [s["id"] for s in stories]
    
    if sprint_ids:
        placeholders = ",".join("?" for _ in sprint_ids)
        run_sql(f"DELETE FROM agile_tasks WHERE sprint_id IN ({placeholders}) AND tenant_id = ?", (*sprint_ids, tenant_id))
        run_sql(f"DELETE FROM standup_logs WHERE sprint_id IN ({placeholders}) AND tenant_id = ?", (*sprint_ids, tenant_id))
        
    if story_ids:
        placeholders = ",".join("?" for _ in story_ids)
        run_sql(f"DELETE FROM agile_tasks WHERE story_id IN ({placeholders}) AND tenant_id = ?", (*story_ids, tenant_id))
        
    run_sql("DELETE FROM user_stories WHERE project_id = ? AND tenant_id = ?", (id, tenant_id))
    run_sql("DELETE FROM sprints WHERE project_id = ? AND tenant_id = ?", (id, tenant_id))
    run_sql("DELETE FROM agile_risks WHERE project_id = ? AND tenant_id = ?", (id, tenant_id))
    run_sql("DELETE FROM agile_milestones WHERE project_id = ? AND tenant_id = ?", (id, tenant_id))
    run_sql("DELETE FROM agile_tasks WHERE project_id = ? AND tenant_id = ?", (id, tenant_id))
    run_sql("DELETE FROM project_daily_logs WHERE project_id = ? AND tenant_id = ?", (id, tenant_id))
    run_sql("DELETE FROM literature WHERE project_id = ? AND tenant_id = ?", (id, tenant_id))
    run_sql("DELETE FROM agile_meetings WHERE project_id = ? AND tenant_id = ?", (id, tenant_id))
    run_sql("DELETE FROM projects WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    
    return {"ok": True}


# ==================== User Stories Native Routes ====================

@router.get("/stories")
def get_stories(
    project_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    sql = "SELECT * FROM user_stories WHERE tenant_id = ?"
    params = [tenant_id]
    
    if project_id is not None:
        sql += " AND project_id = ?"
        params.append(project_id)
    if sprint_id is not None:
        sql += " AND sprint_id = ?"
        params.append(sprint_id)
        
    sql += " ORDER BY priority, id DESC"
    return query_all(sql, tuple(params))

@router.post("/stories")
def create_story(body: StoryCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    story_id = f"STORY-{int(datetime.now().timestamp() * 1000)}"
    result = run_sql(
        """INSERT INTO user_stories (tenant_id, story_id, project_id, title, description, priority, story_points, sprint_id, status, acceptance_criteria)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, story_id, body.project_id, body.title, body.description, body.priority, body.story_points, body.sprint_id, body.status, body.acceptance_criteria)
    )
    return query_one("SELECT * FROM user_stories WHERE id = ? AND tenant_id = ?", (result["lastInsertRowid"], tenant_id))

@router.put("/stories")
def update_story(id: int = Query(...), body: StoryUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    story = query_one("SELECT id FROM user_stories WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not story:
        raise HTTPException(status_code=404, detail="User story not found")
        
    updates = []
    params = []
    
    fields = ["title", "description", "priority", "story_points", "sprint_id", "status", "acceptance_criteria"]
    for f in fields:
        val = getattr(body, f)
        if val is not None:
            updates.append(f"{f} = ?")
            params.append(val)
            
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
        
    params.extend([id, tenant_id])
    run_sql(f"UPDATE user_stories SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return query_one("SELECT * FROM user_stories WHERE id = ? AND tenant_id = ?", (id, tenant_id))

@router.delete("/stories")
def delete_story(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    story = query_one("SELECT id FROM user_stories WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not story:
        raise HTTPException(status_code=404, detail="User story not found")
        
    run_sql("DELETE FROM agile_tasks WHERE story_id = ? AND tenant_id = ?", (id, tenant_id))
    run_sql("DELETE FROM user_stories WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    return {"ok": True}


# ==================== Personal Capture Inbox ====================

INBOX_TYPES = {"idea", "task", "link", "schedule", "risk", "note", "literature"}
INBOX_STATUSES = {"unprocessed", "planned", "converted", "archived"}
PRIORITIES = {"S", "A", "B", "C", "L"}

def _require_project(project_id: int, tenant_id: int):
    project = query_one(
        "SELECT id FROM projects WHERE id = ? AND tenant_id = ?",
        (project_id, tenant_id),
    )
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

def _normalized_choice(value: Optional[str], allowed: set, fallback: str) -> str:
    candidate = (value or fallback).strip()
    return candidate if candidate in allowed else fallback

@router.get("/inbox-items")
def get_inbox_items(
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    item_type: Optional[str] = None,
    q: Optional[str] = None,
    ctx: dict = Depends(get_tenant_context),
):
    tenant_id = ctx["tenant_id"]
    sql = "SELECT * FROM inbox_items WHERE tenant_id = ?"
    params = [tenant_id]
    if project_id is not None:
        sql += " AND project_id = ?"
        params.append(project_id)
    if status:
        sql += " AND status = ?"
        params.append(status)
    if item_type:
        sql += " AND item_type = ?"
        params.append(item_type)
    if q and q.strip():
        term = f"%{q.strip()}%"
        sql += " AND (title LIKE ? OR content LIKE ? OR source_url LIKE ?)"
        params.extend([term, term, term])
    sql += """ ORDER BY
        CASE status WHEN 'unprocessed' THEN 1 WHEN 'planned' THEN 2 WHEN 'converted' THEN 3 ELSE 4 END,
        captured_at DESC, id DESC"""
    return query_all(sql, tuple(params))

@router.post("/inbox-items")
def create_inbox_item(body: InboxCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    _require_project(body.project_id, tenant_id)
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="请输入要收集的内容")
    item_type = _normalized_choice(body.item_type, INBOX_TYPES, "idea")
    priority = _normalized_choice((body.priority or "B").upper(), PRIORITIES, "B")
    result = run_sql(
        """INSERT INTO inbox_items
               (tenant_id, project_id, item_type, title, content, source_url, priority, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'unprocessed')""",
        (tenant_id, body.project_id, item_type, title, body.content or "", body.source_url or "", priority),
    )
    return query_one(
        "SELECT * FROM inbox_items WHERE id = ? AND tenant_id = ?",
        (result["lastInsertRowid"], tenant_id),
    )

@router.put("/inbox-items")
def update_inbox_item(
    id: int = Query(...),
    body: InboxUpdateSchema = Body(...),
    ctx: dict = Depends(get_tenant_context),
):
    tenant_id = ctx["tenant_id"]
    item = query_one("SELECT * FROM inbox_items WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not item:
        raise HTTPException(status_code=404, detail="收集项不存在")
    updates = []
    params = []
    for field in ["title", "content", "source_url"]:
        value = getattr(body, field)
        if value is not None:
            value = value.strip() if field == "title" else value
            if field == "title" and not value:
                raise HTTPException(status_code=400, detail="标题不能为空")
            updates.append(f"{field} = ?")
            params.append(value)
    if body.item_type is not None:
        updates.append("item_type = ?")
        params.append(_normalized_choice(body.item_type, INBOX_TYPES, item["item_type"]))
    if body.priority is not None:
        updates.append("priority = ?")
        params.append(_normalized_choice(body.priority.upper(), PRIORITIES, item["priority"] or "B"))
    if body.status is not None:
        status = _normalized_choice(body.status, INBOX_STATUSES, item["status"])
        updates.append("status = ?")
        params.append(status)
        updates.append("processed_at = CASE WHEN ? IN ('converted', 'archived') THEN datetime('now') ELSE NULL END")
        params.append(status)
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
    updates.append("updated_at = datetime('now')")
    params.extend([id, tenant_id])
    run_sql(f"UPDATE inbox_items SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return query_one("SELECT * FROM inbox_items WHERE id = ? AND tenant_id = ?", (id, tenant_id))

@router.post("/inbox-items/{item_id}/convert")
def convert_inbox_item(
    item_id: int,
    body: InboxConvertSchema,
    ctx: dict = Depends(get_tenant_context),
):
    tenant_id = ctx["tenant_id"]
    target_type = body.target_type.strip().lower()
    if target_type not in {"task", "risk", "schedule", "literature", "idea"}:
        raise HTTPException(status_code=400, detail="不支持的转化类型")

    def convert(conn):
        cursor = conn.cursor()
        item = cursor.execute(
            "SELECT * FROM inbox_items WHERE id = ? AND tenant_id = ?",
            (item_id, tenant_id),
        ).fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="收集项不存在")
        if item["status"] in {"converted", "archived"}:
            raise HTTPException(status_code=409, detail="这个收集项已经处理，不能重复转化")
        project = cursor.execute(
            "SELECT id FROM projects WHERE id = ? AND tenant_id = ?",
            (item["project_id"], tenant_id),
        ).fetchone()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        priority = _normalized_choice((body.priority or item["priority"] or "B").upper(), PRIORITIES, "B")
        description = item["content"] or ""
        if item["source_url"]:
            description = f"{description}\n\n来源：{item['source_url']}".strip()
        converted_id = None
        status = "converted"

        if target_type == "task":
            cursor.execute(
                """INSERT INTO agile_tasks
                       (tenant_id, project_id, title, description, priority, status, sort_order, due_date)
                       VALUES (?, ?, ?, ?, ?, 'backlog', 0, ?)""",
                (tenant_id, item["project_id"], item["title"], description, priority, body.due_date),
            )
            converted_id = cursor.lastrowid
        elif target_type == "risk":
            cursor.execute(
                """INSERT INTO agile_risks
                       (tenant_id, project_id, title, description, probability, impact, level, priority, strategy, status)
                       VALUES (?, ?, ?, ?, 3, 3, 'medium', ?, '', 'monitoring')""",
                (tenant_id, item["project_id"], item["title"], description, priority),
            )
            converted_id = cursor.lastrowid
        elif target_type == "schedule":
            if not body.schedule_date:
                raise HTTPException(status_code=400, detail="请选择日程日期")
            cursor.execute(
                """INSERT INTO personal_schedule_items
                       (tenant_id, project_id, title, date, time, location, note, source_inbox_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (tenant_id, item["project_id"], item["title"], body.schedule_date,
                 body.schedule_time or "", body.location or "", body.note or description, item_id),
            )
            converted_id = cursor.lastrowid
        elif target_type == "literature":
            cursor.execute(
                """INSERT INTO literature
                       (tenant_id, project_id, title, notes, status, file_url)
                       VALUES (?, ?, ?, ?, 'unread', ?)""",
                (tenant_id, item["project_id"], item["title"], description, item["source_url"] or ""),
            )
            converted_id = cursor.lastrowid
        else:
            status = "planned"

        cursor.execute(
            """UPDATE inbox_items
                  SET item_type = CASE WHEN ? = 'idea' THEN 'idea' ELSE item_type END,
                      status = ?, processed_at = datetime('now'), converted_type = ?, converted_id = ?,
                      updated_at = datetime('now')
                WHERE id = ? AND tenant_id = ?""",
            (target_type, status, target_type, converted_id, item_id, tenant_id),
        )
        return converted_id

    converted_id = run_transaction(convert)
    item = query_one("SELECT * FROM inbox_items WHERE id = ? AND tenant_id = ?", (item_id, tenant_id))
    return {"item": item, "converted_type": target_type, "converted_id": converted_id}

@router.delete("/inbox-items")
def delete_inbox_item(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    item = query_one("SELECT id FROM inbox_items WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not item:
        raise HTTPException(status_code=404, detail="收集项不存在")
    run_sql("DELETE FROM inbox_items WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    return {"ok": True}


# ==================== Personal Schedule ====================

@router.get("/schedule-items")
def get_schedule_items(
    project_id: Optional[int] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    ctx: dict = Depends(get_tenant_context),
):
    tenant_id = ctx["tenant_id"]
    sql = "SELECT * FROM personal_schedule_items WHERE tenant_id = ? AND status = 'active'"
    params = [tenant_id]
    if project_id is not None:
        sql += " AND project_id = ?"
        params.append(project_id)
    if start:
        sql += " AND date >= ?"
        params.append(start)
    if end:
        sql += " AND date <= ?"
        params.append(end)
    sql += " ORDER BY date, COALESCE(time, ''), id"
    return query_all(sql, tuple(params))

@router.post("/schedule-items")
def create_schedule_item(body: ScheduleCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    _require_project(body.project_id, tenant_id)
    title = body.title.strip()
    if not title or not body.date:
        raise HTTPException(status_code=400, detail="日程标题和日期不能为空")
    if body.source_legacy_id:
        existing = query_one(
            """SELECT * FROM personal_schedule_items
                 WHERE tenant_id = ? AND project_id = ? AND source_legacy_id = ?""",
            (tenant_id, body.project_id, body.source_legacy_id),
        )
        if existing:
            return existing
    result = run_sql(
        """INSERT INTO personal_schedule_items
               (tenant_id, project_id, title, date, time, location, note, source_legacy_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, body.project_id, title, body.date, body.time or "", body.location or "", body.note or "", body.source_legacy_id),
    )
    return query_one(
        "SELECT * FROM personal_schedule_items WHERE id = ? AND tenant_id = ?",
        (result["lastInsertRowid"], tenant_id),
    )

@router.put("/schedule-items")
def update_schedule_item(
    id: int = Query(...),
    body: ScheduleUpdateSchema = Body(...),
    ctx: dict = Depends(get_tenant_context),
):
    tenant_id = ctx["tenant_id"]
    item = query_one("SELECT id FROM personal_schedule_items WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not item:
        raise HTTPException(status_code=404, detail="日程不存在")
    updates = []
    params = []
    for field in ["title", "date", "time", "location", "note", "status"]:
        value = getattr(body, field)
        if value is not None:
            if field == "title":
                value = value.strip()
                if not value:
                    raise HTTPException(status_code=400, detail="日程标题不能为空")
            updates.append(f"{field} = ?")
            params.append(value)
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
    updates.append("updated_at = datetime('now')")
    params.extend([id, tenant_id])
    run_sql(f"UPDATE personal_schedule_items SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return query_one("SELECT * FROM personal_schedule_items WHERE id = ? AND tenant_id = ?", (id, tenant_id))

@router.delete("/schedule-items")
def delete_schedule_item(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    item = query_one("SELECT id FROM personal_schedule_items WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not item:
        raise HTTPException(status_code=404, detail="日程不存在")
    run_sql("DELETE FROM personal_schedule_items WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    return {"ok": True}


# ==================== Sprints Native Routes ====================

@router.get("/sprints")
def get_sprints(
    id: Optional[int] = None,
    project_id: Optional[int] = None,
    action: Optional[str] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    
    # GET /sprints?id=1&action=stats
    if id is not None and action == "stats":
        sprint = query_one("SELECT id FROM sprints WHERE id = ? AND tenant_id = ?", (id, tenant_id))
        if not sprint:
            raise HTTPException(status_code=404, detail="Sprint not found")
            
        task_stats = query_one(
            """SELECT
                COUNT(*) as totalTasks,
                COUNT(CASE WHEN status = 'todo' THEN 1 END) as todoTasks,
                COUNT(CASE WHEN status = 'this_sprint' THEN 1 END) as planTasks,
                COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as progressTasks,
                COUNT(CASE WHEN status = 'verify' THEN 1 END) as verifyTasks,
                COUNT(CASE WHEN status = 'done' THEN 1 END) as doneTasks
              FROM agile_tasks WHERE sprint_id = ? AND tenant_id = ?""",
            (id, tenant_id)
        )
        
        story_stats = query_one(
            """SELECT
                COUNT(*) as totalStories,
                COUNT(CASE WHEN status = 'done' THEN 1 END) as doneStories,
                COALESCE(SUM(story_points), 0) as totalPoints,
                COALESCE(SUM(CASE WHEN status = 'done' THEN story_points ELSE 0 END), 0) as donePoints
              FROM user_stories WHERE sprint_id = ? AND tenant_id = ?""",
            (id, tenant_id)
        )
        
        return {
            "tasks": task_stats,
            "stories": story_stats
        }
        
    # GET /sprints?id=1
    if id is not None:
        sprint = query_one("SELECT * FROM sprints WHERE id = ? AND tenant_id = ?", (id, tenant_id))
        if not sprint:
            raise HTTPException(status_code=404, detail="Sprint not found")
        return sprint
        
    # GET /sprints?project_id=1
    if project_id is not None:
        return query_all("SELECT * FROM sprints WHERE project_id = ? AND tenant_id = ? ORDER BY number DESC", (project_id, tenant_id))
        
    return query_all("SELECT * FROM sprints WHERE tenant_id = ? ORDER BY number DESC", (tenant_id,))

@router.post("/sprints")
def create_sprint(body: SprintCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    result = run_sql(
        """INSERT INTO sprints (tenant_id, project_id, number, name, start_date, end_date, goal, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, body.project_id, body.number, body.name, body.start_date, body.end_date, body.goal, body.status)
    )
    return query_one("SELECT * FROM sprints WHERE id = ? AND tenant_id = ?", (result["lastInsertRowid"], tenant_id))

@router.put("/sprints")
def update_sprint(id: int = Query(...), body: SprintUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    sprint = query_one("SELECT id FROM sprints WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
        
    updates = []
    params = []
    
    fields = ["number", "name", "start_date", "end_date", "goal", "status"]
    for f in fields:
        val = getattr(body, f)
        if val is not None:
            updates.append(f"{f} = ?")
            params.append(val)
            
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
        
    params.extend([id, tenant_id])
    run_sql(f"UPDATE sprints SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return query_one("SELECT * FROM sprints WHERE id = ? AND tenant_id = ?", (id, tenant_id))

@router.delete("/sprints")
def delete_sprint(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    sprint = query_one("SELECT id FROM sprints WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
        
    # Unlink tasks and standup logs
    run_sql("DELETE FROM agile_tasks WHERE sprint_id = ? AND tenant_id = ?", (id, tenant_id))
    run_sql("DELETE FROM standup_logs WHERE sprint_id = ? AND tenant_id = ?", (id, tenant_id))
    run_sql("DELETE FROM sprints WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    return {"ok": True}


# ==================== Agile Tasks Native Routes ====================

@router.get("/tasks")
def get_agile_tasks(
    project_id: Optional[int] = None,
    story_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    sql = """SELECT t.*,
                    COALESCE(t.priority, s.priority, 'B') AS priority,
                    COALESCE(t.description, '') AS description,
                    s.title AS story_title,
                    s.story_points AS story_points
               FROM agile_tasks t
               LEFT JOIN user_stories s ON t.story_id = s.id
              WHERE t.tenant_id = ?"""
    params = [tenant_id]

    if project_id is not None:
        sql += """ AND (
            t.project_id = ?
            OR s.project_id = ?
            OR t.sprint_id IN (SELECT id FROM sprints WHERE project_id = ? AND tenant_id = ?)
        )"""
        params.extend([project_id, project_id, project_id, tenant_id])
    
    if story_id is not None:
        sql += " AND t.story_id = ?"
        params.append(story_id)
    if sprint_id is not None:
        sql += " AND t.sprint_id = ?"
        params.append(sprint_id)
        
    sql += " ORDER BY t.sort_order ASC, t.id DESC"
    return query_all(sql, tuple(params))

@router.post("/tasks")
def create_agile_task(body: TaskCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    project_id = body.project_id
    if project_id is None and body.story_id is not None:
        story = query_one("SELECT project_id FROM user_stories WHERE id = ? AND tenant_id = ?", (body.story_id, tenant_id))
        project_id = story["project_id"] if story else None
    if project_id is None and body.sprint_id is not None:
        sprint = query_one("SELECT project_id FROM sprints WHERE id = ? AND tenant_id = ?", (body.sprint_id, tenant_id))
        project_id = sprint["project_id"] if sprint else None
    if project_id is None:
        raise HTTPException(status_code=400, detail="任务必须归属一个项目")
    project = query_one("SELECT id FROM projects WHERE id = ? AND tenant_id = ?", (project_id, tenant_id))
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="请输入任务标题")
    result = run_sql(
        """INSERT INTO agile_tasks
               (tenant_id, project_id, story_id, sprint_id, title, description, priority, status, sort_order, due_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, project_id, body.story_id, body.sprint_id, title, body.description,
         body.priority, body.status, body.sort_order, body.due_date)
    )
    return query_one("SELECT * FROM agile_tasks WHERE id = ? AND tenant_id = ?", (result["lastInsertRowid"], tenant_id))

@router.put("/tasks")
def update_agile_task(id: int = Query(...), body: TaskUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    task = query_one("SELECT id FROM agile_tasks WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    updates = []
    params = []
    
    fields = ["project_id", "story_id", "sprint_id", "title", "description", "priority", "status", "sort_order", "due_date"]
    for f in fields:
        val = getattr(body, f)
        if val is not None:
            updates.append(f"{f} = ?")
            params.append(val)
            
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
        
    params.extend([id, tenant_id])
    run_sql(f"UPDATE agile_tasks SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return query_one("SELECT * FROM agile_tasks WHERE id = ? AND tenant_id = ?", (id, tenant_id))

@router.delete("/tasks")
def delete_agile_task(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    task = query_one("SELECT id FROM agile_tasks WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    run_sql("DELETE FROM agile_tasks WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    return {"ok": True}


# ==================== Project Daily Logs ====================

@router.get("/daily-logs")
def get_daily_logs(project_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    return query_all(
        "SELECT * FROM project_daily_logs WHERE project_id = ? AND tenant_id = ? ORDER BY date DESC, id DESC",
        (project_id, tenant_id)
    )

@router.post("/daily-logs")
def create_daily_log(body: DailyLogCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    project = query_one("SELECT id FROM projects WHERE id = ? AND tenant_id = ?", (body.project_id, tenant_id))
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    existing = query_one(
        "SELECT id FROM project_daily_logs WHERE tenant_id = ? AND project_id = ? AND date = ?",
        (tenant_id, body.project_id, body.date)
    )
    if existing:
        run_sql(
            """UPDATE project_daily_logs
                  SET yesterday = ?, today = ?, blockers = ?, notes = ?, updated_at = datetime('now')
                WHERE id = ? AND tenant_id = ?""",
            (body.yesterday, body.today, body.blockers, body.notes, existing["id"], tenant_id)
        )
        return query_one("SELECT * FROM project_daily_logs WHERE id = ? AND tenant_id = ?", (existing["id"], tenant_id))
    result = run_sql(
        """INSERT INTO project_daily_logs
               (tenant_id, project_id, date, yesterday, today, blockers, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, body.project_id, body.date, body.yesterday, body.today, body.blockers, body.notes)
    )
    return query_one("SELECT * FROM project_daily_logs WHERE id = ? AND tenant_id = ?", (result["lastInsertRowid"], tenant_id))

@router.put("/daily-logs")
def update_daily_log(id: int = Query(...), body: DailyLogUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    log = query_one("SELECT id FROM project_daily_logs WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not log:
        raise HTTPException(status_code=404, detail="记录不存在")
    updates = []
    params = []
    for field in ["date", "yesterday", "today", "blockers", "notes"]:
        value = getattr(body, field)
        if value is not None:
            updates.append(f"{field} = ?")
            params.append(value)
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
    updates.append("updated_at = datetime('now')")
    params.extend([id, tenant_id])
    run_sql(f"UPDATE project_daily_logs SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return query_one("SELECT * FROM project_daily_logs WHERE id = ? AND tenant_id = ?", (id, tenant_id))

@router.delete("/daily-logs")
def delete_daily_log(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    log = query_one("SELECT id FROM project_daily_logs WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not log:
        raise HTTPException(status_code=404, detail="记录不存在")
    run_sql("DELETE FROM project_daily_logs WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    return {"ok": True}


# ==================== Standup Logs Native Routes ====================

@router.get("/standups")
def get_standups(sprint_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    return query_all("SELECT * FROM standup_logs WHERE sprint_id = ? AND tenant_id = ? ORDER BY date DESC", (sprint_id, tenant_id))

@router.post("/standups")
def create_standup(body: StandupCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    result = run_sql(
        "INSERT INTO standup_logs (tenant_id, sprint_id, date, yesterday, today, blockers, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (tenant_id, body.sprint_id, body.date, body.yesterday, body.today, body.blockers, body.notes)
    )
    return query_one("SELECT * FROM standup_logs WHERE id = ? AND tenant_id = ?", (result["lastInsertRowid"], tenant_id))

@router.put("/standups")
def update_standup(id: int = Query(...), body: StandupUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    log = query_one("SELECT id FROM standup_logs WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
        
    updates = []
    params = []
    
    fields = ["date", "yesterday", "today", "blockers", "notes"]
    for f in fields:
        val = getattr(body, f)
        if val is not None:
            updates.append(f"{f} = ?")
            params.append(val)
            
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
        
    params.extend([id, tenant_id])
    run_sql(f"UPDATE standup_logs SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return query_one("SELECT * FROM standup_logs WHERE id = ? AND tenant_id = ?", (id, tenant_id))

@router.delete("/standups")
def delete_standup(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    log = query_one("SELECT id FROM standup_logs WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
        
    run_sql("DELETE FROM standup_logs WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    return {"ok": True}


# ==================== Risks Native Routes ====================

@router.get("/risks")
def get_risks(project_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    return query_all("""SELECT * FROM agile_risks WHERE project_id = ? AND tenant_id = ?
        ORDER BY CASE COALESCE(priority, 'B') WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 WHEN 'L' THEN 5 ELSE 3 END, id DESC""", (project_id, tenant_id))

@router.post("/risks")
def create_risk(body: RiskCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    result = run_sql(
        "INSERT INTO agile_risks (tenant_id, project_id, title, description, probability, impact, level, priority, strategy, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (tenant_id, body.project_id, body.title, body.description, body.probability, body.impact, body.level, body.priority, body.strategy, body.status)
    )
    return query_one("SELECT * FROM agile_risks WHERE id = ? AND tenant_id = ?", (result["lastInsertRowid"], tenant_id))

@router.put("/risks")
def update_risk(id: int = Query(...), body: RiskUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    risk = query_one("SELECT id FROM agile_risks WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
        
    updates = []
    params = []
    
    fields = ["title", "description", "probability", "impact", "level", "priority", "strategy", "status"]
    for f in fields:
        val = getattr(body, f)
        if val is not None:
            updates.append(f"{f} = ?")
            params.append(val)
            
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
        
    params.extend([id, tenant_id])
    run_sql(f"UPDATE agile_risks SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return query_one("SELECT * FROM agile_risks WHERE id = ? AND tenant_id = ?", (id, tenant_id))

@router.delete("/risks")
def delete_risk(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    risk = query_one("SELECT id FROM agile_risks WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
        
    run_sql("DELETE FROM agile_risks WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    return {"ok": True}


# ==================== Milestones Native Routes ====================

@router.get("/milestones")
def get_milestones(project_id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    return query_all("SELECT * FROM agile_milestones WHERE project_id = ? AND tenant_id = ? ORDER BY due_date ASC", (project_id, tenant_id))

@router.post("/milestones")
def create_milestone(body: MilestoneCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    result = run_sql(
        "INSERT INTO agile_milestones (tenant_id, project_id, name, due_date, status, criteria) VALUES (?, ?, ?, ?, ?, ?)",
        (tenant_id, body.project_id, body.name, body.due_date, body.status, body.criteria)
    )
    return query_one("SELECT * FROM agile_milestones WHERE id = ? AND tenant_id = ?", (result["lastInsertRowid"], tenant_id))

@router.put("/milestones")
def update_milestone(id: int = Query(...), body: MilestoneUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    milestone = query_one("SELECT id FROM agile_milestones WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
        
    updates = []
    params = []
    
    fields = ["name", "due_date", "status", "criteria"]
    for f in fields:
        val = getattr(body, f)
        if val is not None:
            updates.append(f"{f} = ?")
            params.append(val)
            
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
        
    params.extend([id, tenant_id])
    run_sql(f"UPDATE agile_milestones SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return query_one("SELECT * FROM agile_milestones WHERE id = ? AND tenant_id = ?", (id, tenant_id))

@router.delete("/milestones")
def delete_milestone(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    milestone = query_one("SELECT id FROM agile_milestones WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
        
    run_sql("DELETE FROM agile_milestones WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    return {"ok": True}


# ==================== Literature Native Routes ====================

@router.get("/literature")
def get_literature(
    project_id: int,
    status: Optional[str] = None,
    q: Optional[str] = None,
    search: Optional[str] = None,
    tag: Optional[str] = None,
    ctx: dict = Depends(get_tenant_context)
):
    tenant_id = ctx["tenant_id"]
    sql = "SELECT * FROM literature WHERE project_id = ? AND tenant_id = ?"
    params = [project_id, tenant_id]
    
    if status:
        sql += " AND status = ?"
        params.append(status)
        
    search_term = search or q
    if search_term:
        sql += " AND (title LIKE ? OR authors LIKE ? OR tags LIKE ?)"
        term = f"%{search_term}%"
        params.extend([term, term, term])

    if tag:
        sql += " AND tags LIKE ?"
        params.append(f"%{tag}%")
        
    sql += " ORDER BY id DESC"
    return query_all(sql, tuple(params))

@router.post("/literature")
def create_literature(body: LiteratureCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    result = run_sql(
        """INSERT INTO literature (tenant_id, project_id, title, authors, journal, year, doi, abstract, notes, tags, rating, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, body.project_id, body.title, body.authors, body.journal, body.year, body.doi, body.abstract, body.notes, body.tags, body.rating, body.status)
    )
    return query_one("SELECT * FROM literature WHERE id = ? AND tenant_id = ?", (result["lastInsertRowid"], tenant_id))

@router.put("/literature")
def update_literature(id: int = Query(...), body: LiteratureUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    lit = query_one("SELECT id FROM literature WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not lit:
        raise HTTPException(status_code=404, detail="Literature not found")
        
    updates = []
    params = []
    
    fields = ["title", "authors", "journal", "year", "doi", "abstract", "notes", "tags", "rating", "status"]
    for f in fields:
        val = getattr(body, f)
        if val is not None:
            updates.append(f"{f} = ?")
            params.append(val)
            
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
        
    params.extend([id, tenant_id])
    run_sql(f"UPDATE literature SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return query_one("SELECT * FROM literature WHERE id = ? AND tenant_id = ?", (id, tenant_id))

@router.delete("/literature")
def delete_literature(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    lit = query_one("SELECT id FROM literature WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not lit:
        raise HTTPException(status_code=404, detail="Literature not found")
        
    run_sql("DELETE FROM literature WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    return {"ok": True}


# ==================== Agile Meetings Native Routes ====================

@router.get("/meetings")
def get_agile_meetings(project_id: Optional[int] = None, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    sql = "SELECT * FROM agile_meetings WHERE tenant_id = ?"
    params = [tenant_id]
    if project_id is not None:
        sql += " AND project_id = ?"
        params.append(project_id)
    sql += " ORDER BY meeting_date DESC"
    return query_all(sql, tuple(params))

@router.get("/meetings/{id}")
def get_agile_meeting_details(id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    meeting = query_one("SELECT * FROM agile_meetings WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Not found")
    return meeting

@router.post("/meetings")
def create_agile_meeting(body: AgileMeetingCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    result = run_sql(
        """INSERT INTO agile_meetings (project_id, mentor_name, meeting_date, topic, summary, action_items, next_meeting, notes, tenant_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (body.project_id, body.mentor_name or "", body.meeting_date, body.topic or "", body.summary or "", body.action_items or "", body.next_meeting or "", body.notes or "", tenant_id)
    )
    return {"id": result["lastInsertRowid"]}

@router.put("/meetings")
def update_agile_meeting(id: int = Query(...), body: AgileMeetingUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    meeting = query_one("SELECT id FROM agile_meetings WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    updates = []
    params = []
    
    fields = ["mentor_name", "meeting_date", "topic", "summary", "action_items", "next_meeting", "notes"]
    for f in fields:
        val = getattr(body, f)
        if val is not None:
            updates.append(f"{f} = ?")
            params.append(val)
            
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
        
    params.extend([id, tenant_id])
    run_sql(f"UPDATE agile_meetings SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return {"ok": True}

@router.delete("/meetings")
def delete_agile_meeting(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    meeting = query_one("SELECT id FROM agile_meetings WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    run_sql("DELETE FROM agile_meetings WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    return {"ok": True}


# ==================== Agile Export Markdown ====================

@router.get("/export/markdown")
def export_project_markdown(project_id: int = Query(1), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    
    project = query_one("SELECT * FROM projects WHERE id = ? AND tenant_id = ?", (project_id, tenant_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    sprints = query_all("SELECT * FROM sprints WHERE project_id = ? AND tenant_id = ? ORDER BY number", (project_id, tenant_id))
    stories = query_all("SELECT * FROM user_stories WHERE project_id = ? AND tenant_id = ? ORDER BY priority, story_points DESC", (project_id, tenant_id))
    
    tasks = query_all(
        """SELECT t.*, s.title as story_title
           FROM agile_tasks t LEFT JOIN user_stories s ON t.story_id = s.id
           WHERE s.project_id = ? AND t.tenant_id = ?
           ORDER BY t.sort_order""",
        (project_id, tenant_id)
    )
    
    risks = query_all("SELECT * FROM agile_risks WHERE project_id = ? AND tenant_id = ?", (project_id, tenant_id))
    milestones = query_all("SELECT * FROM agile_milestones WHERE project_id = ? AND tenant_id = ? ORDER BY due_date", (project_id, tenant_id))
    literature = query_all("SELECT * FROM literature WHERE project_id = ? AND tenant_id = ? ORDER BY created_at DESC", (project_id, tenant_id))
    meetings = query_all("SELECT * FROM agile_meetings WHERE project_id = ? AND tenant_id = ? ORDER BY meeting_date DESC", (project_id, tenant_id))
    
    standups = query_all(
        """SELECT sl.* FROM standup_logs sl
           JOIN sprints sp ON sl.sprint_id = sp.id
           WHERE sp.project_id = ? AND sl.tenant_id = ?
           ORDER BY sl.date DESC""",
        (project_id, tenant_id)
    )
    
    md = f"# {project['name'] or '研究生项目'}\n\n"
    md += f"**周期：** {project['start_date'] or ''} ~ {project['end_date'] or ''}\n\n"
    md += f"**导出时间：** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    md += "---\n\n"
    
    # Milestones
    md += "## 里程碑\n\n"
    for m in milestones:
        status = "✅" if m["status"] == "completed" else "⬜"
        md += f"- {status} **{m['name']}** ({m['due_date'] or ''})\n"
        if m["criteria"]:
            md += f"  - 达成标准：{m['criteria']}\n"
    md += "\n"
    
    # Sprints
    md += "## 迭代计划\n\n"
    for s in sprints:
        cleaned_name = re.sub(r"^Sprint \d+：", "", s["name"])
        md += f"### Sprint {s['number']}：{cleaned_name}\n"
        md += f"- **周期：** {s['start_date']} ~ {s['end_date']}\n"
        md += f"- **目标：** {s['goal'] or '无'}\n"
        md += f"- **状态：** {s['status']}\n\n"
        
    # Stories
    md += "## 用户故事\n\n"
    md += "| 编号 | 标题 | 优先级 | 故事点 | 状态 |\n"
    md += "|------|------|--------|--------|------|\n"
    for s in stories:
        md += f"| {s['story_id']} | {s['title']} | {s['priority']} | {s['story_points']} | {s['status']} |\n"
    md += "\n"
    
    # Tasks
    md += "## 任务列表\n\n"
    tasks_by_sprint = {}
    for t in tasks:
        key = t["sprint_id"] or "unassigned"
        if key not in tasks_by_sprint:
            tasks_by_sprint[key] = []
        tasks_by_sprint[key].append(t)
        
    for sid, tlist in tasks_by_sprint.items():
        sprint = next((s for s in sprints if s["id"] == sid), None) if sid != "unassigned" else None
        sprint_name = f"Sprint {sprint['number']}" if sprint else "未分配"
        md += f"### {sprint_name}\n"
        for t in tlist:
            check = "x" if t["status"] == "done" else " "
            md += f"- [{check}] {t['title']}\n"
        md += "\n"
        
    # Risks
    md += "## 风险管理\n\n"
    for r in risks:
        priority = r.get("priority") or "B"
        marker = {"S": "🔴", "A": "🟠", "B": "🟡", "C": "🔵", "L": "🟣"}.get(priority, "🟡")
        md += f"- {marker} **[{priority}] {r['title']}**\n"
        if r["strategy"]:
            md += f"  - 应对策略：{r['strategy']}\n"
    md += "\n"
    
    # Literature
    if literature:
        md += "## 文献库\n\n"
        for l in literature:
            status = "📖" if l["status"] == "done" else "📚" if l["status"] == "reading" else "📄"
            md += f"- {status} **{l['title']}**\n"
            if l["authors"]:
                md += f"  - 作者：{l['authors']}\n"
            if l["journal"]:
                year_suffix = f" ({l['year']})" if l["year"] else ""
                md += f"  - 期刊：{l['journal']}{year_suffix}\n"
            if l["notes"]:
                md += f"  - 笔记：{l['notes']}\n"
        md += "\n"
        
    # Meetings
    if meetings:
        md += "## 导师沟通记录\n\n"
        for m in meetings:
            mentor_suffix = f" - {m['mentor_name']}" if m['mentor_name'] else ""
            md += f"### {m['meeting_date']}{mentor_suffix}\n"
            if m["topic"]: md += f"- **主题：** {m['topic']}\n"
            if m["summary"]: md += f"- **纪要：** {m['summary']}\n"
            if m["action_items"]: md += f"- **待办：** {m['action_items']}\n"
            md += "\n"
            
    # Standups
    if standups:
        md += "## 每日站会\n\n"
        for s in standups[:10]:
            md += f"### {s['date']}\n"
            if s["yesterday"]: md += f"- **昨日完成：** {s['yesterday']}\n"
            if s["today"]: md += f"- **今日计划：** {s['today']}\n"
            if s["blockers"]: md += f"- **阻塞项：** {s['blockers']}\n"
            md += "\n"
            
    response = StreamingResponse(
        io.BytesIO(md.encode('utf-8')),
        media_type="text/markdown"
    )
    response.headers["Content-Disposition"] = f'attachment; filename="project-{project_id}-export.md"'
    return response
