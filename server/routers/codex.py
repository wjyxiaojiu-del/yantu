import json
import os
from datetime import datetime, timedelta
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from server.database import query_all, query_one, run_sql
from server.dependencies import get_tenant_context


router = APIRouter(tags=["codex"])


class CreateJobSchema(BaseModel):
    projectId: int
    prompt: str = Field(min_length=1, max_length=4000)


class CompleteJobSchema(BaseModel):
    workerId: str = Field(min_length=1, max_length=100)
    result: Optional[str] = Field(default=None, max_length=200000)
    error: Optional[str] = Field(default=None, max_length=10000)


class WorkerHeartbeatSchema(BaseModel):
    version: Optional[str] = Field(default=None, max_length=50)


def build_project_context(project_id: int, tenant_id: int) -> dict:
    """Build a bounded, local-only context for one Codex job."""
    project = query_one("SELECT * FROM projects WHERE id = ? AND tenant_id = ?", (project_id, tenant_id))
    if not project:
        return {}
    stories = query_all("SELECT * FROM user_stories WHERE project_id = ? AND tenant_id = ?", (project_id, tenant_id))
    sprints = query_all("SELECT * FROM sprints WHERE project_id = ? AND tenant_id = ? ORDER BY number", (project_id, tenant_id))
    tasks = query_all(
        """SELECT t.*, s.title AS story_title, sp.name AS sprint_name
             FROM agile_tasks t
             LEFT JOIN user_stories s ON t.story_id = s.id
             LEFT JOIN sprints sp ON t.sprint_id = sp.id
            WHERE t.project_id = ? AND t.tenant_id = ?""",
        (project_id, tenant_id),
    )
    risks = query_all("SELECT * FROM agile_risks WHERE project_id = ? AND tenant_id = ?", (project_id, tenant_id))
    milestones = query_all("SELECT * FROM agile_milestones WHERE project_id = ? AND tenant_id = ? ORDER BY due_date", (project_id, tenant_id))
    daily_logs = query_all(
        """SELECT date, yesterday, today, blockers, notes FROM project_daily_logs
            WHERE project_id = ? AND tenant_id = ? ORDER BY date DESC LIMIT 7""",
        (project_id, tenant_id),
    )
    literature = query_all(
        """SELECT title, authors, journal, year, doi, tags, status, rating, notes FROM literature
            WHERE project_id = ? AND tenant_id = ? ORDER BY id DESC LIMIT 30""",
        (project_id, tenant_id),
    )
    inbox = query_all(
        """SELECT title, content, item_type, status, priority FROM inbox_items
            WHERE project_id = ? AND tenant_id = ? ORDER BY id DESC LIMIT 30""",
        (project_id, tenant_id),
    )
    schedule = query_all(
        """SELECT title, date, time, location, note, status FROM personal_schedule_items
            WHERE project_id = ? AND tenant_id = ? ORDER BY date DESC, id DESC LIMIT 30""",
        (project_id, tenant_id),
    )
    nodes = query_all(
        """SELECT id, node_type, title, content, status FROM research_nodes
            WHERE project_id = ? AND tenant_id = ? ORDER BY updated_at DESC, id DESC LIMIT 30""",
        (project_id, tenant_id),
    )
    edges = query_all(
        """SELECT source_id, target_id, relation, note FROM research_edges
            WHERE project_id = ? AND tenant_id = ? ORDER BY id DESC LIMIT 50""",
        (project_id, tenant_id),
    )
    return {
        "project": project,
        "stories": [{"id": row["story_id"], "title": row["title"], "priority": row["priority"], "points": row["story_points"], "status": row["status"], "sprint": row["sprint_id"]} for row in stories],
        "sprints": [{"number": row["number"], "name": row["name"], "status": row["status"], "start": row["start_date"], "end": row["end_date"], "goal": row["goal"]} for row in sprints],
        "tasks": [{"title": row["title"], "status": row["status"], "story": row["story_title"], "sprint": row["sprint_name"], "due": row["due_date"]} for row in tasks],
        "risks": [{"title": row["title"], "level": row["level"], "priority": row.get("priority"), "strategy": row["strategy"]} for row in risks],
        "milestones": [{"name": row["name"], "due": row["due_date"], "status": row["status"]} for row in milestones],
        "daily_logs": daily_logs,
        "literature": literature,
        "inbox": inbox,
        "schedule": schedule,
        "research_map": {"nodes": nodes, "edges": edges},
    }


class WeeklyReviewCreateSchema(BaseModel):
    projectId: int
    weekStart: Optional[str] = None
    weekEnd: Optional[str] = None
    requestAgent: bool = False


class WeeklyReviewUpdateSchema(BaseModel):
    summary: Optional[str] = Field(default=None, max_length=12000)
    strengths: Optional[str] = Field(default=None, max_length=12000)
    gaps: Optional[str] = Field(default=None, max_length=12000)
    nextFocus: Optional[List[str]] = None
    userNotes: Optional[str] = Field(default=None, max_length=12000)
    status: Optional[str] = Field(default=None, max_length=30)


def _weekly_range(week_start: Optional[str] = None, week_end: Optional[str] = None) -> dict[str, str]:
    if week_start and week_end:
        try:
            start = datetime.strptime(week_start, "%Y-%m-%d")
            end = datetime.strptime(week_end, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="周复盘日期必须使用 YYYY-MM-DD") from exc
        if end < start or (end - start).days > 13:
            raise HTTPException(status_code=400, detail="周复盘范围无效，最多支持连续 14 天")
    else:
        today = datetime.now()
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
    return {
        "start": start.strftime("%Y-%m-%d"),
        "end": end.strftime("%Y-%m-%d"),
        "label": f"{start.strftime('%Y年%m月%d日')} — {end.strftime('%m月%d日')}",
    }


def _review_next_focus(value: Optional[str]) -> list[str]:
    if not value:
        return ["", "", ""]
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(item or "") for item in parsed[:3]] + [""] * max(0, 3 - len(parsed))
    except (TypeError, ValueError):
        pass
    lines = [line.strip(" -•\t") for line in str(value).splitlines() if line.strip()]
    return lines[:3] + [""] * max(0, 3 - len(lines))


def _public_review(row: Optional[dict]) -> Optional[dict]:
    if not row:
        return None
    result = dict(row)
    result["next_focus"] = _review_next_focus(result.get("next_focus"))
    return result


def _research_map_snapshot(project_id: int, tenant_id: int) -> dict[str, Any]:
    """Return a bounded research-map summary for weekly review context.

    Keep this query-only and small: the map page owns full CRUD/graph logic,
    while the weekly review only needs enough structure to point Codex at
    missing links without copying every node's long content.
    """
    nodes = query_all(
        "SELECT id, node_type, title FROM research_nodes WHERE tenant_id = ? AND project_id = ?",
        (tenant_id, project_id),
    )
    edges = query_all(
        "SELECT source_id, target_id FROM research_edges WHERE tenant_id = ? AND project_id = ?",
        (tenant_id, project_id),
    )
    by_id = {node["id"]: node for node in nodes}
    outgoing: dict[int, set[str]] = {}
    for edge in edges:
        target = by_id.get(edge["target_id"])
        if target:
            outgoing.setdefault(edge["source_id"], set()).add(target["node_type"])
    gaps = []
    for node in nodes:
        linked = outgoing.get(node["id"], set())
        if node["node_type"] == "hypothesis" and "experiment" not in linked:
            gaps.append({"title": node["title"], "message": "假设还没有连接实验"})
        elif node["node_type"] == "experiment" and "evidence" not in linked:
            gaps.append({"title": node["title"], "message": "实验还没有连接证据"})
        elif node["node_type"] == "evidence" and "conclusion" not in linked:
            gaps.append({"title": node["title"], "message": "证据还没有沉淀为结论"})
    counts = {node_type: sum(1 for node in nodes if node["node_type"] == node_type) for node_type in ("question", "hypothesis", "experiment", "evidence", "conclusion", "paper")}
    return {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "counts": counts,
        "gaps": gaps[:12],
        "nodes": [{"type": node["node_type"], "title": node["title"]} for node in nodes[:24]],
    }


def _weekly_snapshot(project_id: int, tenant_id: int, week: dict[str, str]) -> dict[str, Any]:
    project = query_one("SELECT id, name, status FROM projects WHERE id = ? AND tenant_id = ?", (project_id, tenant_id))
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    start, end = week["start"], week["end"]

    tasks = query_all(
        """SELECT id, title, status, priority, due_date, created_at
             FROM agile_tasks
            WHERE tenant_id = ? AND project_id = ?
            ORDER BY created_at DESC, id DESC""",
        (tenant_id, project_id),
    )
    in_range_tasks = [
        task for task in tasks
        if start <= str(task.get("created_at") or "")[:10] <= end
    ]
    completed_statuses = {"done", "completed"}
    completed = [task for task in in_range_tasks if task.get("status") in completed_statuses]
    open_tasks = [task for task in tasks if task.get("status") not in completed_statuses]
    overdue = [task for task in open_tasks if task.get("due_date") and str(task["due_date"]) < start]

    logs = query_all(
        """SELECT id, date, yesterday, today, blockers, notes
             FROM project_daily_logs
            WHERE tenant_id = ? AND project_id = ? AND date BETWEEN ? AND ?
            ORDER BY date""",
        (tenant_id, project_id, start, end),
    )
    blockers = [
        {"date": log["date"], "text": log.get("blockers")}
        for log in logs if str(log.get("blockers") or "").strip()
    ]
    risks = query_all(
        """SELECT id, title, priority, level, status, strategy
             FROM agile_risks
            WHERE tenant_id = ? AND project_id = ?
              AND status NOT IN ('closed', 'resolved', 'done')
            ORDER BY CASE COALESCE(priority, 'B') WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 WHEN 'L' THEN 5 ELSE 3 END, id DESC""",
        (tenant_id, project_id),
    )
    literature = query_all(
        """SELECT id, title, authors, status, rating, created_at
             FROM literature
            WHERE tenant_id = ? AND project_id = ? AND substr(created_at, 1, 10) BETWEEN ? AND ?
            ORDER BY created_at DESC, id DESC""",
        (tenant_id, project_id, start, end),
    )
    inbox = query_all(
        """SELECT id, title, item_type, status, captured_at
             FROM inbox_items
            WHERE tenant_id = ? AND project_id = ? AND substr(captured_at, 1, 10) BETWEEN ? AND ?
            ORDER BY captured_at DESC, id DESC""",
        (tenant_id, project_id, start, end),
    )
    attendance = query_one(
        """SELECT COUNT(DISTINCT date(check_in_time)) AS days,
                  COALESCE(SUM(work_hours), 0) AS hours
             FROM attendance_records
            WHERE tenant_id = ? AND date(check_in_time) BETWEEN ? AND ?""",
        (tenant_id, start, end),
    ) or {"days": 0, "hours": 0}
    research_map = _research_map_snapshot(project_id, tenant_id)

    metrics = {
        "task_total": len(in_range_tasks),
        "task_completed": len(completed),
        "task_overdue": len(overdue),
        "daily_log_count": len(logs),
        "blocker_count": len(blockers),
        "open_risk_count": len(risks),
        "literature_added": len(literature),
        "inbox_captured": len(inbox),
        "focus_days": int(attendance.get("days") or 0),
        "focus_hours": round(float(attendance.get("hours") or 0), 2),
        "research_node_count": research_map["node_count"],
        "research_edge_count": research_map["edge_count"],
        "research_gap_count": len(research_map["gaps"]),
    }
    completion_rate = round(metrics["task_completed"] / metrics["task_total"] * 100) if metrics["task_total"] else 0
    strengths = []
    gaps = []
    if metrics["task_completed"]:
        strengths.append(f"完成 {metrics['task_completed']} 项任务，周内任务完成率 {completion_rate}%")
    if metrics["daily_log_count"]:
        strengths.append(f"留下 {metrics['daily_log_count']} 天每日记录，过程证据连续")
    if metrics["literature_added"]:
        strengths.append(f"新增/收录 {metrics['literature_added']} 篇文献，研究资产在积累")
    if not strengths:
        strengths.append("本周还没有足够的正向证据，先从记录一项真实推进开始")
    if metrics["task_overdue"]:
        gaps.append(f"有 {metrics['task_overdue']} 项任务在本周开始前已逾期")
    if metrics["blocker_count"]:
        gaps.append(f"{metrics['blocker_count']} 天记录出现阻塞，需要把阻塞转成可执行的解除动作")
    if metrics["open_risk_count"]:
        gaps.append(f"仍有 {metrics['open_risk_count']} 项开放风险，优先处理 S/A 级事项")
    if research_map["gaps"]:
        gaps.append(f"研究地图有 {len(research_map['gaps'])} 个链路缺口，先补假设—实验—证据关系")
    if not metrics["daily_log_count"]:
        gaps.append("本周没有每日记录，复盘证据不足，容易只凭印象判断")
    if not gaps:
        gaps.append("没有发现明显结构性缺口，下周保持记录并验证当前节奏")
    next_focus = [
        ("处理最早逾期任务" if metrics["task_overdue"] else "推进一个可验收的研究任务"),
        ("解除一个最高优先级阻塞" if metrics["blocker_count"] else "连续留下每日记录"),
        ("核验一条关键文献证据" if metrics["literature_added"] else "把一个收集箱想法安放到正确位置"),
    ]
    rule_summary = "；".join([*strengths[:2], *gaps[:2]])
    return {
        "project": dict(project),
        "period": week,
        "metrics": metrics,
        "completion_rate": completion_rate,
        "strengths": strengths,
        "gaps": gaps,
        "next_focus": next_focus,
        "rule_summary": rule_summary,
        "evidence": {
            "completed_tasks": [{"title": task["title"], "priority": task.get("priority")} for task in completed[:12]],
            "overdue_tasks": [{"title": task["title"], "due_date": task.get("due_date")} for task in overdue[:12]],
            "blockers": blockers[:12],
            "risks": risks[:12],
            "literature": [{"title": row["title"], "authors": row.get("authors"), "status": row.get("status")} for row in literature[:12]],
            "inbox": [{"title": row["title"], "item_type": row.get("item_type"), "status": row.get("status")} for row in inbox[:12]],
            "daily_logs": [{"date": row["date"], "today": row.get("today"), "notes": row.get("notes")} for row in logs[:12]],
            "research_map": research_map,
        },
    }


def require_worker(x_codex_worker_token: str = Header(None), x_codex_worker_id: str = Header(None), x_codex_tenant_id: str = Header(None)) -> dict:
    expected = os.getenv("CODEX_WORKER_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="服务器尚未配置 CODEX_WORKER_TOKEN")
    if not x_codex_worker_token or x_codex_worker_token != expected:
        raise HTTPException(status_code=401, detail="Worker 凭据无效")
    try:
        tenant_id = int(x_codex_tenant_id or "")
    except ValueError:
        raise HTTPException(status_code=400, detail="Worker 缺少工作区 ID")
    return {"id": (x_codex_worker_id or "local-codex").strip()[:100], "tenant_id": tenant_id}


def touch_worker(worker: dict, version: Optional[str] = None):
    run_sql(
        """INSERT INTO codex_workers (tenant_id, worker_id, last_seen, version)
           VALUES (?, ?, datetime('now'), ?)
           ON CONFLICT(tenant_id, worker_id) DO UPDATE SET last_seen=datetime('now'), version=excluded.version""",
        (worker["tenant_id"], worker["id"], version),
    )


@router.post("/codex/worker/heartbeat")
def worker_heartbeat(body: WorkerHeartbeatSchema = WorkerHeartbeatSchema(), worker: dict = Depends(require_worker)):
    touch_worker(worker, body.version)
    return {"ok": True, "workerId": worker["id"], "lastSeen": datetime.utcnow().isoformat()}


@router.get("/codex/workers/status")
def worker_status(ctx: dict = Depends(get_tenant_context)):
    rows = query_all("SELECT worker_id, last_seen, version FROM codex_workers WHERE tenant_id = ? ORDER BY worker_id", (ctx["tenant_id"],))
    now = datetime.utcnow()
    result = []
    for row in rows:
        try:
            seen = datetime.strptime(row["last_seen"], "%Y-%m-%d %H:%M:%S")
            online = (now - seen).total_seconds() <= 25
        except (TypeError, ValueError):
            online = False
        result.append({**row, "online": online})
    return {"workers": result, "online": any(item["online"] for item in result)}


@router.get("/codex/weekly-reviews/summary")
def weekly_review_summary(
    projectId: int = Query(...),
    weekStart: Optional[str] = None,
    weekEnd: Optional[str] = None,
    ctx: dict = Depends(get_tenant_context),
):
    week = _weekly_range(weekStart, weekEnd)
    snapshot = _weekly_snapshot(projectId, ctx["tenant_id"], week)
    existing = query_one(
        """SELECT * FROM research_weekly_reviews
             WHERE tenant_id = ? AND project_id = ? AND week_start = ? AND week_end = ?""",
        (ctx["tenant_id"], projectId, week["start"], week["end"]),
    )
    return {"snapshot": snapshot, "review": _public_review(existing)}


@router.get("/codex/weekly-reviews")
def list_weekly_reviews(
    projectId: Optional[int] = None,
    limit: int = Query(default=12, ge=1, le=50),
    ctx: dict = Depends(get_tenant_context),
):
    sql = "SELECT * FROM research_weekly_reviews WHERE tenant_id = ?"
    params: list[Any] = [ctx["tenant_id"]]
    if projectId is not None:
        sql += " AND project_id = ?"
        params.append(projectId)
    sql += " ORDER BY week_start DESC, id DESC LIMIT ?"
    params.append(limit)
    return [_public_review(row) for row in query_all(sql, tuple(params))]


@router.post("/codex/weekly-reviews")
def create_weekly_review(body: WeeklyReviewCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    week = _weekly_range(body.weekStart, body.weekEnd)
    snapshot = _weekly_snapshot(body.projectId, tenant_id, week)
    existing = query_one(
        """SELECT * FROM research_weekly_reviews
             WHERE tenant_id = ? AND project_id = ? AND week_start = ? AND week_end = ?""",
        (tenant_id, body.projectId, week["start"], week["end"]),
    )
    metrics = snapshot["metrics"]
    if existing:
        review_id = existing["id"]
        run_sql(
            """UPDATE research_weekly_reviews
                  SET period_label = ?, task_total = ?, task_completed = ?, task_overdue = ?,
                      daily_log_count = ?, blocker_count = ?, open_risk_count = ?, literature_added = ?,
                      inbox_captured = ?, focus_days = ?, focus_hours = ?, rule_summary = ?, updated_at = datetime('now')
                WHERE id = ? AND tenant_id = ?""",
            (week["label"], metrics["task_total"], metrics["task_completed"], metrics["task_overdue"],
             metrics["daily_log_count"], metrics["blocker_count"], metrics["open_risk_count"], metrics["literature_added"],
             metrics["inbox_captured"], metrics["focus_days"], metrics["focus_hours"], snapshot["rule_summary"], review_id, tenant_id),
        )
    else:
        result = run_sql(
            """INSERT INTO research_weekly_reviews
                   (tenant_id, project_id, week_start, week_end, period_label, task_total, task_completed,
                    task_overdue, daily_log_count, blocker_count, open_risk_count, literature_added,
                    inbox_captured, focus_days, focus_hours, rule_summary, strengths, gaps, next_focus)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (tenant_id, body.projectId, week["start"], week["end"], week["label"], metrics["task_total"], metrics["task_completed"],
             metrics["task_overdue"], metrics["daily_log_count"], metrics["blocker_count"], metrics["open_risk_count"],
             metrics["literature_added"], metrics["inbox_captured"], metrics["focus_days"], metrics["focus_hours"],
             snapshot["rule_summary"], "\n".join(f"- {value}" for value in snapshot["strengths"]),
             "\n".join(f"- {value}" for value in snapshot["gaps"]), json.dumps(snapshot["next_focus"], ensure_ascii=False)),
        )
        review_id = result["lastInsertRowid"]

    job = None
    review = query_one("SELECT * FROM research_weekly_reviews WHERE id = ? AND tenant_id = ?", (review_id, tenant_id))
    if body.requestAgent:
        current_job = query_one(
            "SELECT id, status FROM codex_jobs WHERE id = ? AND tenant_id = ?",
            (review.get("codex_job_id") if review else None, tenant_id),
        ) if review and review.get("codex_job_id") else None
        if not current_job or current_job["status"] not in {"queued", "running"}:
            prompt = (
                f"请完成 {week['label']} 的科研周复盘。先区分事实、推断和待核验项，"
                "再总结本周真正完成的推进、重复出现的不足、阻塞与证据缺口，最后给出下周最重要的三项重点。"
                "不要虚构实验、样本、结果或导师决定；用中文，短而具体。"
            )
            context = {"kind": "weekly_review", "weekly_review_id": review_id, "snapshot": snapshot}
            result = run_sql(
                "INSERT INTO codex_jobs (tenant_id, project_id, prompt, context_json) VALUES (?, ?, ?, ?)",
                (tenant_id, body.projectId, prompt, json.dumps(context, ensure_ascii=False, default=str)),
            )
            job_id = result["lastInsertRowid"]
            run_sql(
                "UPDATE research_weekly_reviews SET codex_job_id = ?, status = 'agent_queued', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
                (job_id, review_id, tenant_id),
            )
            job = query_one("SELECT id, status, created_at FROM codex_jobs WHERE id = ? AND tenant_id = ?", (job_id, tenant_id))
        else:
            job = current_job
    review = query_one("SELECT * FROM research_weekly_reviews WHERE id = ? AND tenant_id = ?", (review_id, tenant_id))
    return {"review": _public_review(review), "snapshot": snapshot, "job": job}


@router.get("/codex/weekly-reviews/{review_id}")
def get_weekly_review(review_id: int, ctx: dict = Depends(get_tenant_context)):
    review = query_one("SELECT * FROM research_weekly_reviews WHERE id = ? AND tenant_id = ?", (review_id, ctx["tenant_id"]))
    if not review:
        raise HTTPException(status_code=404, detail="周复盘不存在")
    return _public_review(review)


@router.put("/codex/weekly-reviews")
def update_weekly_review(
    id: int = Query(...),
    body: WeeklyReviewUpdateSchema = WeeklyReviewUpdateSchema(),
    ctx: dict = Depends(get_tenant_context),
):
    tenant_id = ctx["tenant_id"]
    review = query_one("SELECT id FROM research_weekly_reviews WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not review:
        raise HTTPException(status_code=404, detail="周复盘不存在")
    updates = []
    params: list[Any] = []
    fields = {"summary": body.summary, "strengths": body.strengths, "gaps": body.gaps, "user_notes": body.userNotes, "status": body.status}
    for field, value in fields.items():
        if value is not None:
            updates.append(f"{field} = ?")
            params.append(value)
    if body.nextFocus is not None:
        updates.append("next_focus = ?")
        params.append(json.dumps([str(item or "").strip() for item in body.nextFocus[:3]], ensure_ascii=False))
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的内容")
    updates.append("updated_at = datetime('now')")
    params.extend([id, tenant_id])
    run_sql(f"UPDATE research_weekly_reviews SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return _public_review(query_one("SELECT * FROM research_weekly_reviews WHERE id = ? AND tenant_id = ?", (id, tenant_id)))


@router.post("/codex/jobs")
def create_codex_job(body: CreateJobSchema, ctx: dict = Depends(get_tenant_context)):
    context = build_project_context(body.projectId, ctx["tenant_id"])
    if not context:
        raise HTTPException(status_code=404, detail="项目不存在")
    result = run_sql(
        "INSERT INTO codex_jobs (tenant_id, project_id, prompt, context_json) VALUES (?, ?, ?, ?)",
        (ctx["tenant_id"], body.projectId, body.prompt.strip(), json.dumps(context, ensure_ascii=False, default=str)),
    )
    return {"id": result["lastInsertRowid"], "status": "queued"}


@router.get("/codex/jobs")
def list_codex_jobs(projectId: Optional[int] = None, ctx: dict = Depends(get_tenant_context)):
    sql = "SELECT id, project_id, prompt, status, worker_id, result, error, created_at, claimed_at, completed_at FROM codex_jobs WHERE tenant_id = ?"
    params = [ctx["tenant_id"]]
    if projectId:
        sql += " AND project_id = ?"
        params.append(projectId)
    sql += " ORDER BY id DESC LIMIT 30"
    return query_all(sql, tuple(params))


@router.get("/codex/jobs/{job_id}")
def get_codex_job(job_id: int, ctx: dict = Depends(get_tenant_context)):
    job = query_one(
        "SELECT id, project_id, prompt, status, worker_id, result, error, created_at, claimed_at, completed_at FROM codex_jobs WHERE id = ? AND tenant_id = ?",
        (job_id, ctx["tenant_id"]),
    )
    if not job:
        raise HTTPException(status_code=404, detail="Codex 任务不存在")
    return job


@router.post("/codex/jobs/{job_id}/retry")
def retry_codex_job(job_id: int, ctx: dict = Depends(get_tenant_context)):
    """Put a failed local job back in the queue without duplicating its context."""
    tenant_id = ctx["tenant_id"]
    job = query_one("SELECT id, status FROM codex_jobs WHERE id = ? AND tenant_id = ?", (job_id, tenant_id))
    if not job:
        raise HTTPException(status_code=404, detail="Codex 任务不存在")
    if job["status"] not in {"failed", "completed"}:
        raise HTTPException(status_code=409, detail="当前任务还不能重试")
    run_sql(
        """UPDATE codex_jobs
              SET status = 'queued', worker_id = NULL, result = NULL, error = NULL,
                  claimed_at = NULL, completed_at = NULL
            WHERE id = ? AND tenant_id = ?""",
        (job_id, tenant_id),
    )
    return {"id": job_id, "status": "queued"}


@router.post("/codex/worker/claim")
def claim_codex_job(worker: dict = Depends(require_worker)):
    touch_worker(worker)
    # Release jobs abandoned by an interrupted worker, then claim one job.
    cutoff = (datetime.utcnow() - timedelta(minutes=30)).strftime("%Y-%m-%d %H:%M:%S")
    run_sql("UPDATE codex_jobs SET status = 'queued', worker_id = NULL, claimed_at = NULL WHERE status = 'running' AND claimed_at < ?", (cutoff,))
    job = query_one("SELECT * FROM codex_jobs WHERE tenant_id = ? AND status = 'queued' ORDER BY id LIMIT 1", (worker["tenant_id"],))
    if not job:
        return {"job": None}
    run_sql(
        "UPDATE codex_jobs SET status = 'running', worker_id = ?, claimed_at = datetime('now') WHERE id = ? AND status = 'queued'",
        (worker["id"], job["id"]),
    )
    claimed = query_one("SELECT * FROM codex_jobs WHERE id = ? AND tenant_id = ? AND status = 'running' AND worker_id = ?", (job["id"], worker["tenant_id"], worker["id"]))
    return {"job": claimed}


@router.post("/codex/worker/jobs/{job_id}/complete")
def complete_codex_job(job_id: int, body: CompleteJobSchema, worker: dict = Depends(require_worker)):
    if body.workerId != worker["id"]:
        raise HTTPException(status_code=403, detail="Worker ID 不匹配")
    job = query_one("SELECT id, context_json FROM codex_jobs WHERE id = ? AND tenant_id = ? AND status = 'running' AND worker_id = ?", (job_id, worker["tenant_id"], worker["id"]))
    if not job:
        raise HTTPException(status_code=409, detail="任务未由当前 Worker 执行")
    status = "failed" if body.error else "completed"
    run_sql(
        "UPDATE codex_jobs SET status = ?, result = ?, error = ?, completed_at = datetime('now') WHERE id = ?",
        (status, body.result, body.error, job_id),
    )
    try:
        context = json.loads(job.get("context_json") or "{}")
    except (TypeError, ValueError):
        context = {}
    review_id = context.get("weekly_review_id")
    if review_id:
        run_sql(
            """UPDATE research_weekly_reviews
                  SET status = ?, agent_analysis = ?, updated_at = datetime('now')
                WHERE id = ? AND tenant_id = ?""",
            ("agent_failed" if body.error else "ready", body.error or body.result, review_id, worker["tenant_id"]),
        )
    return {"id": job_id, "status": status}
