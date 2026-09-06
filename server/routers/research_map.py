import json
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel

from server.database import query_all, query_one, run_sql
from server.dependencies import get_tenant_context


router = APIRouter(prefix="/research-map", tags=["research-map"])

NODE_TYPES = {"question", "hypothesis", "experiment", "evidence", "conclusion", "paper"}
NODE_STATUSES = {"active", "blocked", "done", "archived"}


class NodeCreateSchema(BaseModel):
    projectId: int
    nodeType: str = "question"
    title: str
    content: Optional[str] = ""
    status: str = "active"
    positionX: float = 0
    positionY: float = 0
    linkedTaskId: Optional[int] = None
    linkedLiteratureId: Optional[int] = None
    metadata: Optional[dict[str, Any]] = None


class NodeUpdateSchema(BaseModel):
    nodeType: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    positionX: Optional[float] = None
    positionY: Optional[float] = None
    linkedTaskId: Optional[int] = None
    linkedLiteratureId: Optional[int] = None
    metadata: Optional[dict[str, Any]] = None


class EdgeCreateSchema(BaseModel):
    projectId: int
    sourceId: int
    targetId: int
    relation: str = "supports"
    note: Optional[str] = ""


class EdgeUpdateSchema(BaseModel):
    relation: Optional[str] = None
    note: Optional[str] = None


def _validate_node_type(value: str) -> str:
    normalized = (value or "").strip().lower()
    if normalized not in NODE_TYPES:
        raise HTTPException(status_code=400, detail="研究节点类型无效")
    return normalized


def _validate_status(value: str) -> str:
    normalized = (value or "active").strip().lower()
    if normalized not in NODE_STATUSES:
        raise HTTPException(status_code=400, detail="研究节点状态无效")
    return normalized


def _project(project_id: int, tenant_id: int) -> dict:
    project = query_one("SELECT id, name FROM projects WHERE id = ? AND tenant_id = ?", (project_id, tenant_id))
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


def _node(node_id: int, tenant_id: int, project_id: Optional[int] = None) -> dict:
    sql = "SELECT * FROM research_nodes WHERE id = ? AND tenant_id = ?"
    params: list[Any] = [node_id, tenant_id]
    if project_id is not None:
        sql += " AND project_id = ?"
        params.append(project_id)
    node = query_one(sql, tuple(params))
    if not node:
        raise HTTPException(status_code=404, detail="研究节点不存在")
    return node


def _public_node(row: dict) -> dict:
    result = dict(row)
    raw_metadata = result.pop("metadata_json", None)
    try:
        result["metadata"] = json.loads(raw_metadata) if raw_metadata else {}
    except (TypeError, ValueError):
        result["metadata"] = {}
    result.update({
        "nodeType": result.pop("node_type"),
        "projectId": result.pop("project_id"),
        "positionX": result.pop("position_x") or 0,
        "positionY": result.pop("position_y") or 0,
        "linkedTaskId": result.pop("linked_task_id"),
        "linkedLiteratureId": result.pop("linked_literature_id"),
    })
    return result


def _public_edge(row: dict) -> dict:
    result = dict(row)
    result.update({"projectId": result.pop("project_id"), "sourceId": result.pop("source_id"), "targetId": result.pop("target_id")})
    return result


@router.get("/nodes")
def list_nodes(projectId: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    _project(projectId, ctx["tenant_id"])
    rows = query_all(
        "SELECT * FROM research_nodes WHERE tenant_id = ? AND project_id = ? ORDER BY node_type, updated_at DESC, id DESC",
        (ctx["tenant_id"], projectId),
    )
    return [_public_node(row) for row in rows]


@router.post("/nodes")
def create_node(body: NodeCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    _project(body.projectId, tenant_id)
    node_type = _validate_node_type(body.nodeType)
    status = _validate_status(body.status)
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="节点标题不能为空")
    if body.linkedTaskId is not None and not query_one("SELECT id FROM agile_tasks WHERE id = ? AND tenant_id = ? AND project_id = ?", (body.linkedTaskId, tenant_id, body.projectId)):
        raise HTTPException(status_code=400, detail="关联任务不属于当前项目")
    if body.linkedLiteratureId is not None and not query_one("SELECT id FROM literature WHERE id = ? AND tenant_id = ? AND project_id = ?", (body.linkedLiteratureId, tenant_id, body.projectId)):
        raise HTTPException(status_code=400, detail="关联文献不属于当前项目")
    result = run_sql(
        """INSERT INTO research_nodes
           (tenant_id, project_id, node_type, title, content, status, position_x, position_y, linked_task_id, linked_literature_id, metadata_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, body.projectId, node_type, title, body.content or "", status, body.positionX, body.positionY,
         body.linkedTaskId, body.linkedLiteratureId, json.dumps(body.metadata or {}, ensure_ascii=False)),
    )
    return _public_node(_node(result["lastInsertRowid"], tenant_id, body.projectId))


@router.put("/nodes")
def update_node(id: int = Query(...), body: NodeUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    current = _node(id, tenant_id)
    updates: list[str] = []
    params: list[Any] = []
    values = body.model_dump(exclude_unset=True)
    if "nodeType" in values:
        updates.append("node_type = ?"); params.append(_validate_node_type(values["nodeType"]))
    if "title" in values:
        title = (values["title"] or "").strip()
        if not title: raise HTTPException(status_code=400, detail="节点标题不能为空")
        updates.append("title = ?"); params.append(title)
    if "content" in values: updates.append("content = ?"); params.append(values["content"] or "")
    if "status" in values: updates.append("status = ?"); params.append(_validate_status(values["status"]))
    if "positionX" in values: updates.append("position_x = ?"); params.append(values["positionX"])
    if "positionY" in values: updates.append("position_y = ?"); params.append(values["positionY"])
    if "linkedTaskId" in values:
        linked = values["linkedTaskId"]
        if linked is not None and not query_one("SELECT id FROM agile_tasks WHERE id = ? AND tenant_id = ? AND project_id = ?", (linked, tenant_id, current["project_id"])):
            raise HTTPException(status_code=400, detail="关联任务不属于当前项目")
        updates.append("linked_task_id = ?"); params.append(linked)
    if "linkedLiteratureId" in values:
        linked = values["linkedLiteratureId"]
        if linked is not None and not query_one("SELECT id FROM literature WHERE id = ? AND tenant_id = ? AND project_id = ?", (linked, tenant_id, current["project_id"])):
            raise HTTPException(status_code=400, detail="关联文献不属于当前项目")
        updates.append("linked_literature_id = ?"); params.append(linked)
    if "metadata" in values:
        updates.append("metadata_json = ?"); params.append(json.dumps(values["metadata"] or {}, ensure_ascii=False))
    if not updates:
        return _public_node(current)
    updates.append("updated_at = datetime('now')")
    params.extend([id, tenant_id])
    run_sql(f"UPDATE research_nodes SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return _public_node(_node(id, tenant_id))


@router.delete("/nodes")
def delete_node(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    _node(id, ctx["tenant_id"])
    run_sql("DELETE FROM research_edges WHERE (source_id = ? OR target_id = ?) AND tenant_id = ?", (id, id, ctx["tenant_id"]))
    run_sql("DELETE FROM research_nodes WHERE id = ? AND tenant_id = ?", (id, ctx["tenant_id"]))
    return {"ok": True}


@router.get("/edges")
def list_edges(projectId: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    _project(projectId, ctx["tenant_id"])
    rows = query_all("SELECT * FROM research_edges WHERE tenant_id = ? AND project_id = ? ORDER BY id", (ctx["tenant_id"], projectId))
    return [_public_edge(row) for row in rows]


@router.post("/edges")
def create_edge(body: EdgeCreateSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    _project(body.projectId, tenant_id)
    if body.sourceId == body.targetId:
        raise HTTPException(status_code=400, detail="节点不能连接到自身")
    source = _node(body.sourceId, tenant_id, body.projectId)
    target = _node(body.targetId, tenant_id, body.projectId)
    relation = (body.relation or "supports").strip()[:40] or "supports"
    try:
        result = run_sql("INSERT INTO research_edges (tenant_id, project_id, source_id, target_id, relation, note) VALUES (?, ?, ?, ?, ?, ?)", (tenant_id, body.projectId, source["id"], target["id"], relation, body.note or ""))
    except Exception as exc:
        if "UNIQUE" in str(exc).upper():
            raise HTTPException(status_code=409, detail="这条研究关系已经存在") from exc
        raise
    row = query_one("SELECT * FROM research_edges WHERE id = ? AND tenant_id = ?", (result["lastInsertRowid"], tenant_id))
    return _public_edge(row)


@router.put("/edges")
def update_edge(id: int = Query(...), body: EdgeUpdateSchema = Body(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    edge = query_one("SELECT * FROM research_edges WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not edge:
        raise HTTPException(status_code=404, detail="研究关系不存在")
    updates: list[str] = []
    params: list[Any] = []
    values = body.model_dump(exclude_unset=True)
    if "relation" in values: updates.append("relation = ?"); params.append((values["relation"] or "supports").strip()[:40] or "supports")
    if "note" in values: updates.append("note = ?"); params.append(values["note"] or "")
    if updates:
        params.extend([id, tenant_id])
        run_sql(f"UPDATE research_edges SET {', '.join(updates)} WHERE id = ? AND tenant_id = ?", tuple(params))
    return _public_edge(query_one("SELECT * FROM research_edges WHERE id = ? AND tenant_id = ?", (id, tenant_id)))


@router.delete("/edges")
def delete_edge(id: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    edge = query_one("SELECT id FROM research_edges WHERE id = ? AND tenant_id = ?", (id, ctx["tenant_id"]))
    if not edge:
        raise HTTPException(status_code=404, detail="研究关系不存在")
    run_sql("DELETE FROM research_edges WHERE id = ? AND tenant_id = ?", (id, ctx["tenant_id"]))
    return {"ok": True}


@router.get("/summary")
def research_summary(projectId: int = Query(...), ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    _project(projectId, tenant_id)
    nodes = [_public_node(row) for row in query_all("SELECT * FROM research_nodes WHERE tenant_id = ? AND project_id = ?", (tenant_id, projectId))]
    edges = [_public_edge(row) for row in query_all("SELECT * FROM research_edges WHERE tenant_id = ? AND project_id = ?", (tenant_id, projectId))]
    by_id = {node["id"]: node for node in nodes}
    adjacency: dict[int, list[int]] = {}
    for edge in edges:
        adjacency.setdefault(edge["sourceId"], []).append(edge["targetId"])

    def reachable_types(start_id: int) -> set[str]:
        seen: set[int] = set(); stack = [start_id]; result: set[str] = set()
        while stack:
            current = stack.pop()
            if current in seen: continue
            seen.add(current)
            node = by_id.get(current)
            if node: result.add(node["nodeType"])
            stack.extend(adjacency.get(current, []))
        return result

    gaps = []
    for node in nodes:
        reachable = reachable_types(node["id"])
        if node["nodeType"] == "hypothesis":
            if "experiment" not in reachable:
                gaps.append({"kind": "hypothesis_without_experiment", "nodeId": node["id"], "title": node["title"], "message": "这个假设还没有对应实验"})
            elif "evidence" not in reachable:
                gaps.append({"kind": "hypothesis_without_evidence", "nodeId": node["id"], "title": node["title"], "message": "这个假设还没有证据链"})
        elif node["nodeType"] == "experiment" and "evidence" not in reachable:
            gaps.append({"kind": "experiment_without_evidence", "nodeId": node["id"], "title": node["title"], "message": "实验还没有挂接证据"})
        elif node["nodeType"] == "evidence" and "conclusion" not in reachable:
            gaps.append({"kind": "evidence_without_conclusion", "nodeId": node["id"], "title": node["title"], "message": "证据还没有沉淀为结论"})
    counts = {node_type: sum(1 for node in nodes if node["nodeType"] == node_type) for node_type in NODE_TYPES}
    return {"counts": counts, "totalNodes": len(nodes), "totalEdges": len(edges), "gaps": gaps[:30], "nodes": nodes, "edges": edges}
