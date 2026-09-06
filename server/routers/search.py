from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from server.dependencies import get_tenant_context
from server.database import query_all


router = APIRouter(tags=["search"])


def _compact_text(parts: list[Any]) -> str:
    return " ".join(" ".join(str(part or "").split()) for part in parts if part).strip()


def _make_snippet(parts: list[Any], query: str, max_length: int = 180) -> str:
    text = _compact_text(parts)
    if len(text) <= max_length:
        return text
    index = text.lower().find(query.lower())
    if index < 0:
        return text[:max_length].rstrip() + "…"
    start = max(0, index - max_length // 3)
    end = min(len(text), start + max_length)
    prefix = "…" if start else ""
    suffix = "…" if end < len(text) else ""
    return prefix + text[start:end].strip() + suffix


def _score_result(title: str, parts: list[Any], query: str) -> int:
    title_lower = (title or "").lower()
    query_lower = query.lower()
    if title_lower == query_lower:
        return 100
    if title_lower.startswith(query_lower):
        return 85
    if query_lower in title_lower:
        return 70
    content = _compact_text(parts).lower()
    if content.startswith(query_lower):
        return 50
    return 35 if query_lower in content else 0


def _project_filter(project_id: Optional[int]) -> tuple[str, list[Any]]:
    return (" AND project_id = ?", [project_id]) if project_id is not None else ("", [])


@router.get("/search/global")
def search_workspace(
    q: str = Query(..., min_length=1, max_length=200),
    project_id: Optional[int] = None,
    limit: int = Query(default=24, ge=1, le=60),
    ctx: dict = Depends(get_tenant_context),
):
    tenant_id = ctx["tenant_id"]
    query = q.strip()
    if not query:
        return {"query": "", "total": 0, "results": [], "sources": {}}
    like = f"%{query}%"
    project_sql, project_params = _project_filter(project_id)
    per_source_limit = min(max(limit, 8), 30)
    results: list[dict[str, Any]] = []

    task_rows = query_all(
        f"""SELECT id, title, description, status, priority, due_date, created_at
              FROM agile_tasks
             WHERE tenant_id = ?{project_sql}
               AND (title LIKE ? OR COALESCE(description, '') LIKE ?)
             ORDER BY id DESC LIMIT ?""",
        tuple([tenant_id, *project_params, like, like, per_source_limit]),
    )
    for row in task_rows:
        parts = [row.get("description")]
        results.append({
            "id": row["id"], "type": "task", "label": "任务", "title": row["title"],
            "snippet": _make_snippet(parts, query), "path": "/agile/board",
            "status": row.get("status"), "occurred_at": row.get("due_date") or row.get("created_at"),
            "meta": {"priority": row.get("priority"), "due_date": row.get("due_date")},
            "score": _score_result(row["title"], parts, query),
        })

    inbox_rows = query_all(
        f"""SELECT id, title, content, source_url, item_type, status, priority, captured_at
              FROM inbox_items
             WHERE tenant_id = ?{project_sql}
               AND (title LIKE ? OR COALESCE(content, '') LIKE ? OR COALESCE(source_url, '') LIKE ?)
             ORDER BY id DESC LIMIT ?""",
        tuple([tenant_id, *project_params, like, like, like, per_source_limit]),
    )
    for row in inbox_rows:
        parts = [row.get("content"), row.get("source_url")]
        results.append({
            "id": row["id"], "type": "inbox", "label": "收集箱", "title": row["title"],
            "snippet": _make_snippet(parts, query), "path": "/agile/backlog",
            "status": row.get("status"), "occurred_at": row.get("captured_at"),
            "meta": {"item_type": row.get("item_type"), "priority": row.get("priority")},
            "score": _score_result(row["title"], parts, query),
        })

    literature_rows = query_all(
        f"""SELECT id, title, authors, journal, year, doi, abstract, notes, tags, status, created_at
              FROM literature
             WHERE tenant_id = ?{project_sql}
               AND (title LIKE ? OR COALESCE(authors, '') LIKE ? OR COALESCE(abstract, '') LIKE ?
                    OR COALESCE(notes, '') LIKE ? OR COALESCE(tags, '') LIKE ? OR COALESCE(doi, '') LIKE ?)
             ORDER BY id DESC LIMIT ?""",
        tuple([tenant_id, *project_params, like, like, like, like, like, like, per_source_limit]),
    )
    for row in literature_rows:
        parts = [row.get("authors"), row.get("abstract"), row.get("notes"), row.get("tags"), row.get("doi")]
        results.append({
            "id": row["id"], "type": "literature", "label": "文献", "title": row["title"],
            "snippet": _make_snippet(parts, query), "path": "/agile/literature",
            "status": row.get("status"), "occurred_at": row.get("created_at"),
            "meta": {"authors": row.get("authors"), "journal": row.get("journal"), "year": row.get("year")},
            "score": _score_result(row["title"], parts, query),
        })

    daily_rows = query_all(
        f"""SELECT id, date, yesterday, today, blockers, notes, updated_at
              FROM project_daily_logs
             WHERE tenant_id = ?{project_sql}
               AND (date LIKE ? OR COALESCE(yesterday, '') LIKE ? OR COALESCE(today, '') LIKE ?
                    OR COALESCE(blockers, '') LIKE ? OR COALESCE(notes, '') LIKE ?)
             ORDER BY date DESC LIMIT ?""",
        tuple([tenant_id, *project_params, like, like, like, like, like, per_source_limit]),
    )
    for row in daily_rows:
        title = f"{row['date']} 每日复盘"
        parts = [row.get("yesterday"), row.get("today"), row.get("blockers"), row.get("notes")]
        results.append({
            "id": row["id"], "type": "daily_log", "label": "每日记录", "title": title,
            "snippet": _make_snippet(parts, query), "path": "/agile/standup",
            "status": "blocked" if row.get("blockers") else "recorded", "occurred_at": row.get("date"),
            "meta": {"date": row.get("date")}, "score": _score_result(title, parts, query),
        })

    risk_rows = query_all(
        f"""SELECT id, title, description, strategy, priority, status, created_at
              FROM agile_risks
             WHERE tenant_id = ?{project_sql}
               AND (title LIKE ? OR COALESCE(description, '') LIKE ? OR COALESCE(strategy, '') LIKE ?)
             ORDER BY id DESC LIMIT ?""",
        tuple([tenant_id, *project_params, like, like, like, per_source_limit]),
    )
    for row in risk_rows:
        parts = [row.get("description"), row.get("strategy")]
        results.append({
            "id": row["id"], "type": "risk", "label": "风险", "title": row["title"],
            "snippet": _make_snippet(parts, query), "path": "/agile/risks",
            "status": row.get("status"), "occurred_at": row.get("created_at"),
            "meta": {"priority": row.get("priority")}, "score": _score_result(row["title"], parts, query),
        })

    schedule_rows = query_all(
        f"""SELECT id, title, date, time, location, note, created_at
              FROM personal_schedule_items
             WHERE tenant_id = ?{project_sql} AND status = 'active'
               AND (title LIKE ? OR COALESCE(location, '') LIKE ? OR COALESCE(note, '') LIKE ? OR date LIKE ?)
             ORDER BY date DESC, id DESC LIMIT ?""",
        tuple([tenant_id, *project_params, like, like, like, like, per_source_limit]),
    )
    for row in schedule_rows:
        parts = [row.get("location"), row.get("note"), row.get("date"), row.get("time")]
        results.append({
            "id": row["id"], "type": "schedule", "label": "日程", "title": row["title"],
            "snippet": _make_snippet(parts, query), "path": "/calendar", "status": "active",
            "occurred_at": row.get("date"), "meta": {"date": row.get("date"), "time": row.get("time"), "location": row.get("location")},
            "score": _score_result(row["title"], parts, query),
        })

    weekly_rows = query_all(
        f"""SELECT id, period_label, week_start, week_end, status, summary, rule_summary,
                    agent_analysis, strengths, gaps, next_focus
               FROM research_weekly_reviews
              WHERE tenant_id = ?{project_sql}
                AND (COALESCE(period_label, '') LIKE ? OR COALESCE(summary, '') LIKE ?
                     OR COALESCE(rule_summary, '') LIKE ? OR COALESCE(agent_analysis, '') LIKE ?
                     OR COALESCE(strengths, '') LIKE ? OR COALESCE(gaps, '') LIKE ?
                     OR COALESCE(next_focus, '') LIKE ? OR COALESCE(user_notes, '') LIKE ?)
              ORDER BY week_start DESC, id DESC LIMIT ?""",
        tuple([tenant_id, *project_params, like, like, like, like, like, like, like, like, per_source_limit]),
    )
    for row in weekly_rows:
        title = row.get("period_label") or f"{row.get('week_start')} 周复盘"
        parts = [row.get("summary"), row.get("rule_summary"), row.get("agent_analysis"), row.get("strengths"), row.get("gaps"), row.get("next_focus")]
        results.append({
            "id": row["id"], "type": "weekly_review", "label": "每周复盘", "title": title,
            "snippet": _make_snippet(parts, query), "path": "/agile/weekly-review",
            "status": row.get("status"), "occurred_at": row.get("week_start"),
            "meta": {"week_start": row.get("week_start"), "week_end": row.get("week_end")},
            "score": _score_result(title, parts, query),
        })

    research_rows = query_all(
        f"""SELECT id, node_type, title, content, status, updated_at
               FROM research_nodes
              WHERE tenant_id = ?{project_sql}
                AND (title LIKE ? OR COALESCE(content, '') LIKE ?)
              ORDER BY updated_at DESC, id DESC LIMIT ?""",
        tuple([tenant_id, *project_params, like, like, per_source_limit]),
    )
    for row in research_rows:
        parts = [row.get("content")]
        results.append({
            "id": row["id"], "type": "research_node", "label": "研究地图", "title": row["title"],
            "snippet": _make_snippet(parts, query), "path": "/agile/research-map",
            "status": row.get("status"), "occurred_at": row.get("updated_at"),
            "meta": {"node_type": row.get("node_type")},
            "score": _score_result(row["title"], parts, query),
        })

    results.sort(key=lambda item: (item["score"], str(item.get("occurred_at") or "")), reverse=True)
    limited = results[:limit]
    sources: dict[str, int] = {}
    for item in limited:
        sources[item["type"]] = sources.get(item["type"], 0) + 1
    return {"query": query, "total": len(results), "results": limited, "sources": sources}

