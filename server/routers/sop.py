import json

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel
from typing import Optional, List

from server.database import query_one, query_all, run_sql
from server.dependencies import get_tenant_context

router = APIRouter(tags=["sop"])

SOP_CATEGORIES = ("科研", "学习", "开发", "生活", "其他")
SOP_ACTIVE_STATUSES = ("running", "paused")
SOP_TERMINAL_STATUSES = ("completed", "abandoned")
SOP_STATUSES = SOP_ACTIVE_STATUSES + SOP_TERMINAL_STATUSES


class SopStepIn(BaseModel):
    id: Optional[str] = None
    title: str
    note: Optional[str] = ""
    substeps: Optional[List["SopStepIn"]] = []
    done: Optional[bool] = False


class SopTemplateCreate(BaseModel):
    project_id: int
    name: str
    description: Optional[str] = ""
    category: Optional[str] = "其他"
    tags: Optional[List[str]] = []
    favorite: Optional[bool] = False
    steps: List[SopStepIn]


class SopTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    favorite: Optional[bool] = None
    steps: Optional[List[SopStepIn]] = None


class SopInstanceStart(BaseModel):
    template_id: int
    variables: Optional[dict] = {}


class SopInstanceUpdate(BaseModel):
    steps: Optional[List[SopStepIn]] = None
    status: Optional[str] = None
    note: Optional[str] = None
    variables: Optional[dict] = None


def _clean_steps(steps: List[SopStepIn], with_done: bool) -> list:
    """校验并规范化步骤树：两级结构，标题必填，子步骤不再嵌套。"""
    rows = []
    for step in steps or []:
        title = (step.title or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="步骤标题不能为空")
        row = {"title": title, "note": (step.note or "").strip()}
        if step.id:
            row["id"] = step.id[:64]
        if with_done:
            row["done"] = bool(step.done)
        subs = step.substeps or []
        if subs:
            cleaned_subs = []
            for sub in subs:
                sub_title = (sub.title or "").strip()
                if not sub_title:
                    raise HTTPException(status_code=400, detail="子步骤标题不能为空")
                sub_row = {"title": sub_title}
                if sub.id:
                    sub_row["id"] = sub.id[:64]
                if with_done:
                    sub_row["done"] = bool(sub.done)
                cleaned_subs.append(sub_row)
            row["substeps"] = cleaned_subs
        rows.append(row)
    return rows


def _template_out(row: dict) -> dict:
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "name": row["name"],
        "description": row["description"] or "",
        "category": row["category"] or "其他",
        "tags": [t for t in (row["tags"] or "").split(",") if t],
        "favorite": bool(row["favorite"]),
        "steps": json.loads(row["steps_json"] or "[]"),
        "version": row["version"],
        "last_used_at": row["last_used_at"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _instance_out(row: dict) -> dict:
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "template_id": row["template_id"],
        "name": row["name"],
        "category": row["category"] or "其他",
        "steps": json.loads(row["steps_json"] or "[]"),
        "variables": json.loads(row["variables_json"] or "{}"),
        "status": row["status"],
        "elapsed_ms": row["elapsed_ms"] or 0,
        "live_elapsed_ms": row["live_elapsed_ms"] if "live_elapsed_ms" in row.keys() else (row["elapsed_ms"] or 0),
        "running_since": row["running_since"],
        "note": row["note"] or "",
        "started_at": row["started_at"],
        "ended_at": row["ended_at"],
        "updated_at": row["updated_at"],
    }


_INSTANCE_SELECT = """
    SELECT i.*, (
        i.elapsed_ms + CASE WHEN i.status = 'running' AND i.running_since IS NOT NULL
            THEN CAST((julianday('now') - julianday(i.running_since)) * 86400000 AS INTEGER)
            ELSE 0 END
    ) AS live_elapsed_ms
    FROM sop_instances i
"""


def _get_instance(instance_id: int, tenant_id: int, project_id: Optional[int] = None) -> dict:
    row = query_one(
        _INSTANCE_SELECT + " WHERE i.id = ? AND i.tenant_id = ?" + (" AND i.project_id = ?" if project_id else ""),
        (instance_id, tenant_id, project_id) if project_id else (instance_id, tenant_id),
    )
    if not row:
        raise HTTPException(status_code=404, detail="执行记录不存在")
    return row


def _get_project_or_404(project_id: int, tenant_id: int) -> dict:
    project = query_one("SELECT id FROM projects WHERE id = ? AND tenant_id = ?", (project_id, tenant_id))
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


# ---------- 模板 ----------

@router.get("/sop/templates")
def list_sop_templates(project_id: Optional[int] = None, ctx: dict = Depends(get_tenant_context)):
    sql = "SELECT * FROM sop_templates WHERE tenant_id = ?"
    params = [ctx["tenant_id"]]
    if project_id:
        sql += " AND project_id = ?"
        params.append(project_id)
    sql += " ORDER BY favorite DESC, COALESCE(last_used_at, updated_at) DESC"
    return [_template_out(r) for r in query_all(sql, tuple(params))]


@router.post("/sop/templates")
def create_sop_template(body: SopTemplateCreate, ctx: dict = Depends(get_tenant_context)):
    _get_project_or_404(body.project_id, ctx["tenant_id"])
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="模板名称不能为空")
    steps = _clean_steps(body.steps, with_done=False)
    if not steps:
        raise HTTPException(status_code=400, detail="至少需要一个步骤")
    category = body.category if body.category in SOP_CATEGORIES else "其他"
    tags = ",".join(t.strip().replace(",", " ") for t in (body.tags or []) if t and t.strip())
    result = run_sql(
        """INSERT INTO sop_templates (tenant_id, project_id, name, description, category, tags, favorite, steps_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (ctx["tenant_id"], body.project_id, name, body.description or "", category, tags,
         1 if body.favorite else 0, json.dumps(steps, ensure_ascii=False)),
    )
    row = query_one("SELECT * FROM sop_templates WHERE id = ?", (result["lastInsertRowid"],))
    return _template_out(row)


@router.put("/sop/templates")
def update_sop_template(id: int = Query(...), body: SopTemplateUpdate = Body(...), ctx: dict = Depends(get_tenant_context)):
    row = query_one(
        "SELECT * FROM sop_templates WHERE id = ? AND tenant_id = ?",
        (id, ctx["tenant_id"]),
    )
    if not row:
        raise HTTPException(status_code=404, detail="模板不存在")

    sets, params = [], []
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="模板名称不能为空")
        sets.append("name = ?"); params.append(name)
    if body.description is not None:
        sets.append("description = ?"); params.append(body.description)
    if body.category is not None:
        sets.append("category = ?"); params.append(body.category if body.category in SOP_CATEGORIES else "其他")
    if body.tags is not None:
        sets.append("tags = ?")
        params.append(",".join(t.strip().replace(",", " ") for t in body.tags if t and t.strip()))
    if body.favorite is not None:
        sets.append("favorite = ?"); params.append(1 if body.favorite else 0)
    if body.steps is not None:
        steps = _clean_steps(body.steps, with_done=False)
        if not steps:
            raise HTTPException(status_code=400, detail="至少需要一个步骤")
        sets.append("steps_json = ?"); params.append(json.dumps(steps, ensure_ascii=False))
        sets.append("version = version + 1")
    if not sets:
        raise HTTPException(status_code=400, detail="没有需要更新的字段")
    sets.append("updated_at = datetime('now')")
    params.extend([id, ctx["tenant_id"]])
    run_sql(f"UPDATE sop_templates SET {', '.join(sets)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return _template_out(query_one("SELECT * FROM sop_templates WHERE id = ?", (id,)))


@router.delete("/sop/templates")
def delete_sop_template(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    row = query_one("SELECT id FROM sop_templates WHERE id = ? AND tenant_id = ?", (id, ctx["tenant_id"]))
    if not row:
        raise HTTPException(status_code=404, detail="模板不存在")
    run_sql("DELETE FROM sop_templates WHERE id = ?", (id,))
    return {"ok": True}


# ---------- 执行实例 ----------

@router.get("/sop/instances")
def list_sop_instances(
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    ctx: dict = Depends(get_tenant_context),
):
    sql = _INSTANCE_SELECT + " WHERE i.tenant_id = ?"
    params = [ctx["tenant_id"]]
    if project_id:
        sql += " AND i.project_id = ?"
        params.append(project_id)
    if status:
        wanted = [s.strip() for s in status.split(",") if s.strip() in SOP_STATUSES]
        if wanted:
            sql += f" AND i.status IN ({','.join('?' * len(wanted))})"
            params.extend(wanted)
    sql += " ORDER BY i.updated_at DESC"
    return [_instance_out(r) for r in query_all(sql, tuple(params))]


@router.post("/sop/instances")
def start_sop_instance(body: SopInstanceStart, ctx: dict = Depends(get_tenant_context)):
    template = query_one(
        "SELECT * FROM sop_templates WHERE id = ? AND tenant_id = ?",
        (body.template_id, ctx["tenant_id"]),
    )
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    active = query_one(
        "SELECT id FROM sop_instances WHERE template_id = ? AND tenant_id = ? AND status IN ('running', 'paused')",
        (body.template_id, ctx["tenant_id"]),
    )
    if active:
        raise HTTPException(status_code=409, detail="该模板已有进行中的执行，请先继续或结束它")

    # 实例保存模板快照（补 done 标记），后续模板修改不影响已启动的执行
    steps = json.loads(template["steps_json"] or "[]")
    for index, step in enumerate(steps):
        step["done"] = False
        if not step.get("id"):
            step["id"] = f"t{template['id']}s{index}"
        for sub_index, sub in enumerate(step.get("substeps", [])):
            sub["done"] = False
            if not sub.get("id"):
                sub["id"] = f"{step['id']}u{sub_index}"

    result = run_sql(
        """INSERT INTO sop_instances
           (tenant_id, project_id, template_id, name, category, steps_json, variables_json,
            status, running_since, started_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'running', datetime('now'), datetime('now'))""",
        (ctx["tenant_id"], template["project_id"], template["id"], template["name"],
         template["category"] or "其他", json.dumps(steps, ensure_ascii=False),
         json.dumps(body.variables or {}, ensure_ascii=False)),
    )
    run_sql("UPDATE sop_templates SET last_used_at = datetime('now') WHERE id = ?", (template["id"],))
    return _instance_out(_get_instance(result["lastInsertRowid"], ctx["tenant_id"]))


@router.put("/sop/instances")
def update_sop_instance(id: int = Query(...), body: SopInstanceUpdate = Body(...), ctx: dict = Depends(get_tenant_context)):
    row = _get_instance(id, ctx["tenant_id"])
    sets, params = [], []

    if body.steps is not None:
        sets.append("steps_json = ?")
        params.append(json.dumps(_clean_steps(body.steps, with_done=True), ensure_ascii=False))

    if body.note is not None:
        sets.append("note = ?"); params.append(body.note)

    if body.variables is not None:
        sets.append("variables_json = ?"); params.append(json.dumps(body.variables, ensure_ascii=False))

    if body.status is not None and body.status != row["status"]:
        target = body.status
        if target not in SOP_STATUSES:
            raise HTTPException(status_code=400, detail="无效的执行状态")
        if row["status"] in SOP_TERMINAL_STATUSES:
            raise HTTPException(status_code=409, detail="已结束的执行不能再次变更状态")
        if target == "running" and row["status"] != "paused":
            raise HTTPException(status_code=400, detail="只有暂停中的执行可以继续")
        if target != "running" and row["status"] == "running":
            # 离开运行态（暂停或结束）先把进行中的耗时结算进累计值
            run_sql(
                """UPDATE sop_instances SET
                     elapsed_ms = elapsed_ms + CAST((julianday('now') - julianday(running_since)) * 86400000 AS INTEGER),
                     running_since = NULL
                   WHERE id = ? AND status = 'running' AND running_since IS NOT NULL""",
                (id,),
            )
        sets.append("status = ?"); params.append(target)
        sets.append("running_since = " + ("datetime('now')" if target == "running" else "NULL"))
        sets.append("ended_at = " + ("datetime('now')" if target in SOP_TERMINAL_STATUSES else "NULL"))

    if not sets:
        raise HTTPException(status_code=400, detail="没有需要更新的字段")
    sets.append("updated_at = datetime('now')")
    params.extend([id, ctx["tenant_id"]])
    run_sql(f"UPDATE sop_instances SET {', '.join(sets)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return _instance_out(_get_instance(id, ctx["tenant_id"]))


@router.delete("/sop/instances")
def delete_sop_instance(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    row = query_one("SELECT id FROM sop_instances WHERE id = ? AND tenant_id = ?", (id, ctx["tenant_id"]))
    if not row:
        raise HTTPException(status_code=404, detail="执行记录不存在")
    run_sql("DELETE FROM sop_instances WHERE id = ?", (id,))
    return {"ok": True}
