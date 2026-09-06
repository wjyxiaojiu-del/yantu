import os
import base64
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

from server.database import query_one, query_all, run_sql
from server.dependencies import get_tenant_context, require_roles

router = APIRouter(prefix="/papers", tags=["papers"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.abspath(os.getenv("UPLOAD_DIR", os.path.join(BASE_DIR, "uploads", "papers")))
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- Pydantic Schemas ---
class PaperUploadSchema(BaseModel):
    title: str
    author: Optional[str] = ""
    abstract: Optional[str] = ""
    keywords: Optional[str] = ""
    fileName: str
    fileData: str # base64 encoded string
    fileSize: Optional[int] = 0
    student_id: Optional[int] = None

class AddReviewSchema(BaseModel):
    content: str
    section: Optional[str] = ""
    page: Optional[int] = 0

# --- Routes ---

@router.post("")
def upload_paper(body: PaperUploadSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    role = ctx["role"]
    user = ctx["user"]
    
    if not body.title or not body.fileName or not body.fileData:
        raise HTTPException(status_code=400, detail="缺少必要字段")
        
    student_id = user["id"] if role == "student" else body.student_id
    if not student_id:
        raise HTTPException(status_code=400, detail="缺少学生ID")
        
    version_res = query_one("SELECT COUNT(*) as cnt FROM papers WHERE student_id = ? AND tenant_id = ?", (student_id, tenant_id))
    version = (version_res["cnt"] if version_res else 0) + 1
    
    # Safe name conversion
    safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', body.fileName)
    unique_name = f"{int(datetime.now().timestamp() * 1000)}_{safe_name}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)
    
    try:
        file_bytes = base64.b64decode(body.fileData)
        with open(file_path, "wb") as f:
            f.write(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件保存失败: {str(e)}")
        
    result = run_sql(
        """INSERT INTO papers (tenant_id, student_id, title, author, abstract, keywords, file_path, file_name, file_size, version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (tenant_id, student_id, body.title, body.author or "", body.abstract or "", body.keywords or "", file_path, body.fileName, body.fileSize or 0, version)
    )
    
    paper = query_one("SELECT * FROM papers WHERE id = ?", (result["lastInsertRowid"],))
    return {"success": True, "paper": paper}

@router.get("")
def get_papers(student_id: Optional[int] = None, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    role = ctx["role"]
    user = ctx["user"]
    
    sql = "SELECT p.*, u.name as student_name FROM papers p JOIN users u ON p.student_id = u.id WHERE p.tenant_id = ?"
    params = [tenant_id]
    
    if role == "student":
        sql += " AND p.student_id = ?"
        params.append(user["id"])
    elif student_id:
        sql += " AND p.student_id = ?"
        params.append(student_id)
        
    sql += " ORDER BY p.updated_at DESC"
    papers = query_all(sql, tuple(params))
    return {"papers": papers}

@router.get("/{id}")
def get_paper_details(id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    role = ctx["role"]
    user = ctx["user"]
    
    paper = query_one(
        "SELECT p.*, u.name as student_name FROM papers p JOIN users u ON p.student_id = u.id WHERE p.id = ? AND p.tenant_id = ?",
        (id, tenant_id)
    )
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
        
    if role == "student" and paper["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="无权限")
        
    return {"paper": paper}

@router.get("/{id}/file")
def get_paper_file(id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    role = ctx["role"]
    user = ctx["user"]
    
    paper = query_one("SELECT student_id, file_path, file_name FROM papers WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
        
    if role == "student" and paper["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="无权限")
        
    if not paper["file_path"] or not os.path.exists(paper["file_path"]):
        raise HTTPException(status_code=404, detail="文件已丢失")
        
    try:
        with open(paper["file_path"], "rb") as f:
            data = base64.b64encode(f.read()).decode("utf-8")
        return {"data": data, "name": paper["file_name"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{id}/reviews")
def add_review(id: int, body: AddReviewSchema, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    role = ctx["role"]
    user = ctx["user"]
    
    paper = query_one("SELECT student_id, title FROM papers WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
        
    if role == "student" and paper["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="无权限")
        
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="批注内容不能为空")
        
    run_sql(
        """INSERT INTO paper_reviews (paper_id, reviewer_id, reviewer_name, content, section, page)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (id, user["id"], user.get("name") or "导师", body.content, body.section or "", body.page or 0)
    )
    
    # Update status
    run_sql("UPDATE papers SET status = 'reviewed', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    
    # Notify student
    if role != "student":
        msg = f"论文《{paper['title']}》收到新批注"
        run_sql(
            """INSERT INTO notifications (tenant_id, user_id, type, title, content, related_id)
               VALUES (?, ?, 'paper', '论文批注', ?, ?)""",
            (tenant_id, paper["student_id"], msg, id)
        )
        
    return {"success": True}

@router.get("/{id}/reviews")
def get_paper_reviews(id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    role = ctx["role"]
    user = ctx["user"]
    
    paper = query_one("SELECT student_id FROM papers WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
        
    if role == "student" and paper["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="无权限")
        
    reviews = query_all("SELECT * FROM paper_reviews WHERE paper_id = ? ORDER BY created_at DESC", (id,))
    return {"reviews": reviews}

@router.delete("/{id}")
def delete_paper(id: int, ctx: dict = Depends(require_roles("owner", "admin"))):
    tenant_id = ctx["tenant_id"]
    paper = query_one("SELECT file_path FROM papers WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
        
    if paper["file_path"] and os.path.exists(paper["file_path"]):
        try:
            os.remove(paper["file_path"])
        except Exception as e:
            print("Delete paper file failed:", str(e))
            
    run_sql("DELETE FROM paper_reviews WHERE paper_id = ?", (id,))
    run_sql("DELETE FROM papers WHERE id = ? AND tenant_id = ?", (id, tenant_id))
    
    return {"success": True}
