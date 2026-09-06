import os
import secrets
import re
from datetime import datetime, timedelta
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional

from server.database import query_one, query_all, run_sql
from server.dependencies import get_current_user, get_tenant_context, require_roles

router = APIRouter(prefix="/tenants", tags=["tenants"])

class CreateTenantSchema(BaseModel):
    name: str
    description: Optional[str] = None

class UpdateTenantSchema(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    max_mentors: Optional[int] = None
    max_students: Optional[int] = None

class CreateInviteSchema(BaseModel):
    role: Optional[str] = "student"
    max_uses: Optional[int] = 1
    expires_in_hours: Optional[int] = 168

class JoinTenantSchema(BaseModel):
    code: str

class UpdateMemberRoleSchema(BaseModel):
    role: str

def generate_invite_code() -> str:
    return secrets.token_hex(4).upper()

@router.get("/my")
def get_my_tenants(user: dict = Depends(get_current_user)):
    memberships = query_all(
        """SELECT t.*, tm.role as my_role
           FROM tenants t
           JOIN tenant_members tm ON t.id = tm.tenant_id
           WHERE tm.user_id = ?
           ORDER BY t.created_at DESC""",
        (user["id"],)
    )
    return {"tenants": memberships}

@router.post("")
def create_tenant(body: CreateTenantSchema, user: dict = Depends(get_current_user)):
    name = body.name.strip()
    if not name or len(name) < 2:
        raise HTTPException(status_code=400, detail="课题组名称至少2个字")
        
    # Slug generation
    slug_base = re.sub(r'[^a-zA-Z0-9\u4e00-\u9fa5]+', '-', name.lower()).strip('-')
    slug = f"{slug_base}-{int(datetime.now().timestamp())}"
    
    tenant_result = run_sql(
        "INSERT INTO tenants (name, slug, description, owner_id, plan, max_mentors, max_students) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (name, slug, body.description, user["id"], "free", 1, 5)
    )
    tenant_id = tenant_result["lastInsertRowid"]
    
    run_sql("INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)", (tenant_id, user["id"], "owner"))
    
    today = datetime.now().strftime("%Y-%m-%d")
    end = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
    run_sql(
        "INSERT INTO projects (tenant_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, 'active')",
        (tenant_id, f"{name}科研项目", today, end)
    )
    
    tenant = query_one("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
    return {"success": True, "tenant": tenant}

@router.get("/{id}")
def get_tenant_details(id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    tenant = ctx["tenant"]
    
    members = query_all(
        """SELECT u.id, u.name, u.email, u.avatar, u.phone, tm.role, tm.joined_at
           FROM tenant_members tm
           JOIN users u ON tm.user_id = u.id
           WHERE tm.tenant_id = ?
           ORDER BY CASE tm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'mentor' THEN 3 ELSE 4 END, u.name""",
        (tenant_id,)
    )
    
    usage_students = query_one("SELECT COUNT(*) as c FROM students WHERE tenant_id = ?", (tenant_id,))
    usage_mentors = query_one(
        "SELECT COUNT(*) as c FROM tenant_members WHERE tenant_id = ? AND role IN ('owner','admin','mentor')",
        (tenant_id,)
    )
    
    usage = {
        "students": usage_students["c"] if usage_students else 0,
        "mentors": usage_mentors["c"] if usage_mentors else 0,
        "storage_mb": tenant.get("used_storage_mb", 0) or 0
    }
    
    return {"tenant": {**tenant, "members": members, "usage": usage}}

@router.put("/{id}")
def update_tenant(id: int, body: UpdateTenantSchema, ctx: dict = Depends(require_roles("owner", "admin"))):
    tenant_id = ctx["tenant_id"]
    
    updates = []
    params = []
    
    if body.name is not None:
        updates.append("name = ?")
        params.append(body.name)
    if body.description is not None:
        updates.append("description = ?")
        params.append(body.description)
    if body.max_mentors is not None:
        updates.append("max_mentors = ?")
        params.append(body.max_mentors)
    if body.max_students is not None:
        updates.append("max_students = ?")
        params.append(body.max_students)
        
    if not updates:
        raise HTTPException(status_code=400, detail="没有要更新的字段")
        
    params.append(tenant_id)
    run_sql(f"UPDATE tenants SET {', '.join(updates)}, updated_at = datetime('now') WHERE id = ?", tuple(params))
    
    tenant = query_one("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
    return {"success": True, "tenant": tenant}

@router.post("/join")
def join_tenant(body: JoinTenantSchema, user: dict = Depends(get_current_user)):
    code = body.code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="邀请码不能为空")
        
    invite = query_one(
        "SELECT * FROM tenant_invites WHERE code = ? AND (expires_at > datetime('now') OR expires_at IS NULL)",
        (code,)
    )
    if not invite:
        raise HTTPException(status_code=400, detail="邀请码无效或已过期")
        
    if invite["used_count"] >= invite["max_uses"]:
        raise HTTPException(status_code=400, detail="邀请码已达使用上限")
        
    existing = query_one("SELECT id FROM tenant_members WHERE tenant_id = ? AND user_id = ?", (invite["tenant_id"], user["id"]))
    if existing:
        raise HTTPException(status_code=409, detail="您已是该课题组成员")
        
    tenant = query_one("SELECT * FROM tenants WHERE id = ?", (invite["tenant_id"],))
    if not tenant:
        raise HTTPException(status_code=404, detail="工作区不存在")
        
    if invite["role"] == "student":
        count = query_one("SELECT COUNT(*) as c FROM tenant_members WHERE tenant_id = ? AND role = 'student'", (invite["tenant_id"],))
        if count and count["c"] >= tenant["max_students"]:
            raise HTTPException(status_code=403, detail="课题组学生人数已满")
    else:
        count = query_one(
            "SELECT COUNT(*) as c FROM tenant_members WHERE tenant_id = ? AND role IN ('owner','admin','mentor')",
            (invite["tenant_id"],)
        )
        if count and count["c"] >= tenant["max_mentors"]:
            raise HTTPException(status_code=403, detail="课题组导师人数已满")
            
    run_sql("INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)", (invite["tenant_id"], user["id"], invite["role"]))
    run_sql("UPDATE tenant_invites SET used_count = used_count + 1 WHERE id = ?", (invite["id"],))
    
    new_tenant = query_one("SELECT * FROM tenants WHERE id = ?", (invite["tenant_id"],))
    return {"success": True, "tenant": new_tenant, "role": invite["role"]}

@router.post("/{id}/invites")
def create_invite(id: int, body: CreateInviteSchema, ctx: dict = Depends(require_roles("owner", "admin", "mentor"))):
    tenant_id = ctx["tenant_id"]
    user = ctx["user"]
    user_role = ctx["role"]
    
    allowed_roles = ["student", "viewer"]
    if user_role in ("owner", "admin"):
        allowed_roles.extend(["mentor", "admin"])
        
    if body.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="无权邀请该角色")
        
    code = generate_invite_code()
    expires_at = (datetime.now() + timedelta(hours=body.expires_in_hours)).isoformat()
    
    run_sql(
        "INSERT INTO tenant_invites (tenant_id, code, role, max_uses, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        (tenant_id, code, body.role, body.max_uses, expires_at, user["id"])
    )
    return {"success": True, "invite": {"code": code, "role": body.role, "max_uses": body.max_uses, "expires_at": expires_at}}

@router.get("/{id}/invites")
def get_invites(id: int, ctx: dict = Depends(require_roles("owner", "admin", "mentor"))):
    tenant_id = ctx["tenant_id"]
    invites = query_all(
        """SELECT ti.*, u.name as created_by_name
           FROM tenant_invites ti
           LEFT JOIN users u ON ti.created_by = u.id
           WHERE ti.tenant_id = ?
           ORDER BY ti.created_at DESC""",
        (tenant_id,)
    )
    return {"invites": invites}

@router.delete("/{id}/invites/{invite_id}")
def delete_invite(id: int, invite_id: int, ctx: dict = Depends(require_roles("owner", "admin", "mentor"))):
    tenant_id = ctx["tenant_id"]
    invite = query_one("SELECT * FROM tenant_invites WHERE id = ? AND tenant_id = ?", (invite_id, tenant_id))
    if not invite:
        raise HTTPException(status_code=404, detail="邀请码不存在")
        
    run_sql("DELETE FROM tenant_invites WHERE id = ?", (invite_id,))
    return {"success": True}

@router.put("/{id}/members/{user_id}")
def update_member_role(id: int, user_id: int, body: UpdateMemberRoleSchema, ctx: dict = Depends(require_roles("owner", "admin"))):
    tenant_id = ctx["tenant_id"]
    user_role = ctx["role"]
    
    target_role = body.role
    if target_role not in ("owner", "admin", "mentor", "student", "viewer"):
        raise HTTPException(status_code=400, detail="无效的角色")
        
    target = query_one("SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?", (tenant_id, user_id))
    if not target:
        raise HTTPException(status_code=404, detail="成员不存在")
        
    if target["role"] == "owner":
        raise HTTPException(status_code=403, detail="不能修改负责人的角色")
        
    # Admin cannot promote to owner or admin
    if user_role == "admin" and target_role in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="权限不足")
        
    run_sql("UPDATE tenant_members SET role = ? WHERE tenant_id = ? AND user_id = ?", (target_role, tenant_id, user_id))
    return {"success": True}

@router.delete("/{id}/members/{user_id}")
def remove_member(id: int, user_id: int, ctx: dict = Depends(require_roles("owner", "admin"))):
    tenant_id = ctx["tenant_id"]
    user = ctx["user"]
    user_role = ctx["role"]
    
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="不能移除自己")
        
    target = query_one("SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?", (tenant_id, user_id))
    if not target:
        raise HTTPException(status_code=404, detail="成员不存在")
        
    if target["role"] == "owner":
        raise HTTPException(status_code=403, detail="不能移除负责人")
        
    if user_role == "admin" and target["role"] == "admin":
        raise HTTPException(status_code=403, detail="不能移除其他管理员")
        
    run_sql("DELETE FROM tenant_members WHERE tenant_id = ? AND user_id = ?", (tenant_id, user_id))
    return {"success": True}

@router.post("/{id}/leave")
def leave_tenant(id: int, ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    user = ctx["user"]
    role = ctx["role"]
    
    if role == "owner":
        raise HTTPException(status_code=400, detail="负责人不能退出课题组，请转让或删除课题组")
        
    run_sql("DELETE FROM tenant_members WHERE tenant_id = ? AND user_id = ?", (tenant_id, user["id"]))
    return {"success": True}
