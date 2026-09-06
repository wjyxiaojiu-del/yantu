import os
from fastapi import Header, HTTPException, Depends, Query
from server.database import query_one

def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    token = authorization[7:]
    user = query_one(
        """SELECT u.* FROM users u
           JOIN auth_tokens t ON u.id = t.user_id
           WHERE t.token = ? AND t.expires_at > datetime('now')
           LIMIT 1""",
        (token,)
    )
    if not user:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    return user

def get_tenant_context(
    x_tenant_id: str = Header(None, alias="X-Tenant-Id"),
    tenant_id: int = Query(None),
    user: dict = Depends(get_current_user)
):
    tid_str = x_tenant_id
    if not tid_str and tenant_id:
        tid_str = str(tenant_id)
        
    if not tid_str:
        raise HTTPException(status_code=400, detail="需要选择工作区")
        
    try:
        tid = int(tid_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="工作区ID无效")
        
    # Verify user belongs to this tenant
    member = query_one(
        "SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?",
        (tid, user["id"])
    )
    if not member:
        raise HTTPException(status_code=403, detail="您无权访问该工作区")
        
    tenant = query_one("SELECT * FROM tenants WHERE id = ?", (tid,))
    if not tenant:
        raise HTTPException(status_code=404, detail="工作区不存在")
        
    return {
        "tenant_id": tid,
        "role": member["role"],
        "tenant": tenant,
        "user": user
    }

def require_roles(*roles: str):
    def dependency(ctx: dict = Depends(get_tenant_context)):
        if ctx["role"] not in roles:
            raise HTTPException(status_code=403, detail=f"权限不足，需要 {'/'.join(roles)} 权限")
        return ctx
    return dependency
