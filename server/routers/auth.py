import os
import secrets
import hashlib
import uuid
import time
import threading
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Request, Response, HTTPException, Depends, Header, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional

from server.database import query_one, query_all, run_sql
from server.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

# 与 server.main 相同的公式，避免循环导入
UPLOAD_DIR = os.path.abspath(os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")))
AVATAR_DIR = os.path.join(UPLOAD_DIR, "avatars")
AVATAR_MAX_BYTES = 2 * 1024 * 1024
AVATAR_ALLOWED_EXT = {"png", "jpg", "jpeg", "webp", "gif"}

TOKEN_TTL_DAYS = 7
SMS_COOLDOWN_SECONDS = 60
SMS_EXPIRE_MINUTES = 5
LOGIN_WINDOW_SECONDS = 60
LOGIN_MAX_FAILURES = 5
_login_failures = {}
_login_lock = threading.Lock()

# --- Pydantic Schemas ---
class SendSmsSchema(BaseModel):
    phone: str
    purpose: Optional[str] = "register"

class RegisterSchema(BaseModel):
    phone: str
    code: str
    password: str
    name: str
    role: Optional[str] = "student"
    email: Optional[str] = None
    student_id: Optional[str] = None
    department: Optional[str] = None
    title: Optional[str] = None

class LoginSchema(BaseModel):
    phone: str
    password: str

class LoginSmsSchema(BaseModel):
    phone: str
    code: str

# --- Helper Functions ---
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000,
        dklen=64
    ).hex()
    return f"{salt}:{derived}"

def verify_password(password: str, stored: str) -> bool:
    try:
        salt, stored_hash = stored.split(':')
    except ValueError:
        return False
    derived = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000,
        dklen=64
    ).hex()
    return derived == stored_hash

def generate_token() -> str:
    return uuid.uuid4().hex + secrets.token_hex(16)

def get_expiry_date(days=TOKEN_TTL_DAYS) -> str:
    return (datetime.now() + timedelta(days=days)).isoformat()

def get_sms_expiry_date(minutes=SMS_EXPIRE_MINUTES) -> str:
    return (datetime.now() + timedelta(minutes=minutes)).isoformat()

def generate_sms_code() -> str:
    return str(secrets.randbelow(900000) + 100000)

def can_send_sms(phone: str) -> bool:
    latest = query_one(
        "SELECT created_at FROM sms_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1",
        (phone,)
    )
    if not latest:
        return True
    try:
        # sqlite returns created_at in ISO format or similar
        created_time = datetime.fromisoformat(latest["created_at"].replace("Z", "+00:00"))
        # Strip timezone if native
        created_time = created_time.replace(tzinfo=None)
    except Exception:
        # Fallback if parse fails
        return True
    # created_at 由 sqlite datetime('now') 生成，是 UTC；必须用 UTC 当前时间比较，
    # 否则在非 UTC 机器上差值恒为时区偏移，冷却形同虚设
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    diff = (now_utc - created_time).total_seconds()
    return diff > SMS_COOLDOWN_SECONDS

def verify_sms_code(phone: str, code: str, purpose: str) -> bool:
    row = query_one(
        """SELECT * FROM sms_codes WHERE phone = ? AND code = ? AND purpose = ? AND used = 0
           AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1""",
        (phone, code, purpose)
    )
    if row:
        run_sql("UPDATE sms_codes SET used = 1 WHERE id = ?", (row["id"],))
        return True
    return False

def create_token_record(user_id: int) -> str:
    token = generate_token()
    expires_at = get_expiry_date()
    run_sql("INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?, ?, ?)", (user_id, token, expires_at))
    return token

def check_login_rate_limit(request: Request):
    client_host = request.client.host if request.client else "unknown"
    cutoff = time.time() - LOGIN_WINDOW_SECONDS
    with _login_lock:
        recent = [ts for ts in _login_failures.get(client_host, []) if ts > cutoff]
        _login_failures[client_host] = recent
        if len(recent) >= LOGIN_MAX_FAILURES:
            raise HTTPException(status_code=429, detail="登录失败次数过多，请稍后再试")
    return client_host

def record_login_failure(client_host: str):
    with _login_lock:
        _login_failures.setdefault(client_host, []).append(time.time())

def clear_login_failures(client_host: str):
    with _login_lock:
        _login_failures.pop(client_host, None)

def get_user_tenants(user_id: int) -> list:
    return query_all(
        """SELECT t.id, t.name, t.slug, t.plan, tm.role as tenant_role
           FROM tenants t
           JOIN tenant_members tm ON t.id = tm.tenant_id
           WHERE tm.user_id = ?
           ORDER BY t.created_at DESC""",
        (user_id,)
    )

def create_personal_workspace(user_id: int, name: str) -> int:
    result = run_sql(
        "INSERT INTO tenants (name, slug, plan, owner_id, max_mentors, max_students) VALUES (?, ?, 'pro', ?, 99, 999)",
        (f"{name}的个人工作台", f"personal-{user_id}", user_id)
    )
    tenant_id = result["lastInsertRowid"]
    run_sql("INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)", (tenant_id, user_id, "owner"))
    
    # Add first project
    today = datetime.now().strftime("%Y-%m-%d")
    end = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
    run_sql(
        "INSERT INTO projects (tenant_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, 'active')",
        (tenant_id, "我的第一个项目", today, end)
    )
    return tenant_id

def get_or_create_local_user() -> dict:
    user = query_one("SELECT * FROM users WHERE phone = 'local-owner' LIMIT 1")
    if not user:
        password_hash = hash_password(secrets.token_hex(32))
        local_name = os.getenv("LOCAL_USER_NAME", "我")
        result = run_sql(
            "INSERT INTO users (phone, password_hash, name, role, title) VALUES (?, ?, ?, ?, ?)",
            ("local-owner", password_hash, local_name, "student", "本地个人用户")
        )
        user = query_one("SELECT * FROM users WHERE id = ?", (result["lastInsertRowid"],))
        
    # Ensure workspace
    tenants = get_user_tenants(user["id"])
    if not tenants:
        create_personal_workspace(user["id"], user["name"])
        
    return user

def ensure_workspace_owner() -> dict:
    """Create the single-user workspace account required by production."""
    password = os.getenv("WORKSPACE_PASSWORD", "")
    if len(password) < 12:
        raise RuntimeError("WORKSPACE_PASSWORD must contain at least 12 characters")
    user = get_or_create_local_user()
    local_name = os.getenv("LOCAL_USER_NAME", user.get("name") or "我")
    run_sql(
        "UPDATE users SET password_hash = ?, name = ?, title = ? WHERE id = ?",
        (hash_password(password), local_name, "个人工作台用户", user["id"])
    )
    return query_one("SELECT * FROM users WHERE id = ?", (user["id"],))

def to_safe_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "phone": user["phone"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "avatar": user["avatar"],
        "student_id": user["student_id"],
        "department": user["department"],
        "title": user["title"]
    }

def is_loopback_request(request: Request) -> bool:
    if os.getenv("ALLOW_EXTERNAL_LOCAL_SESSION") == "true":
        return True
    client_host = request.client.host if request.client else ""
    return client_host in ("127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1")

def single_user_mode_enabled() -> bool:
    return os.getenv("SINGLE_USER_MODE", "false").lower() == "true"

def require_public_accounts_enabled() -> None:
    if single_user_mode_enabled():
        raise HTTPException(status_code=404, detail="该个人工作台不开放注册或短信登录")

# --- Routes ---

@router.post("/send-sms")
def send_sms(body: SendSmsSchema):
    require_public_accounts_enabled()
    phone = body.phone
    purpose = body.purpose
    
    if not phone:
        raise HTTPException(status_code=400, detail="请输入手机号")
        
    if not can_send_sms(phone):
        raise HTTPException(status_code=429, detail=f"发送验证码过于频繁，请等待 {SMS_COOLDOWN_SECONDS} 秒")
        
    code = generate_sms_code()
    expires_at = get_sms_expiry_date()
    
    run_sql(
        "INSERT INTO sms_codes (phone, code, purpose, expires_at) VALUES (?, ?, ?, ?)",
        (phone, code, purpose, expires_at)
    )
    
    # Mock SMS behavior in production vs dev
    is_dev = os.getenv("NODE_ENV") != "production" or os.getenv("MOCK_SMS") == "true"
    
    # In real production with SMS services, send the code to SMS gateway here
    print(f"[SMS Code] Purpose: {purpose}, Phone: {phone}, Code: {code}")
    
    res = {"success": True, "message": "验证码已发送"}
    if is_dev:
        res["code"] = code
        
    return res

@router.post("/register")
def register(body: RegisterSchema):
    require_public_accounts_enabled()
    if not body.phone or not body.code or not body.password or not body.name:
        raise HTTPException(status_code=400, detail="请填写完整信息")
        
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少 6 位")
        
    if not verify_sms_code(body.phone, body.code, "register"):
        raise HTTPException(status_code=400, detail="验证码错误或已过期")
        
    existing = query_one("SELECT id FROM users WHERE phone = ?", (body.phone,))
    if existing:
        raise HTTPException(status_code=409, detail="该手机号已注册")
        
    password_hash = hash_password(body.password)
    result = run_sql(
        """INSERT INTO users (phone, email, password_hash, name, role, student_id, department, title)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (body.phone, body.email, password_hash, body.name, body.role, body.student_id, body.department, body.title)
    )
    
    user_id = result["lastInsertRowid"]
    token = create_token_record(user_id)
    user = query_one("SELECT * FROM users WHERE id = ?", (user_id,))
    create_personal_workspace(user_id, body.name)
    
    return {
        "success": True,
        "token": token,
        "user": to_safe_user(user),
        "tenants": get_user_tenants(user_id)
    }

@router.post("/login")
def login(body: LoginSchema, request: Request):
    if not body.phone or not body.password:
        raise HTTPException(status_code=400, detail="请输入手机号和密码")
    client_host = check_login_rate_limit(request)
    login_phone = "local-owner" if single_user_mode_enabled() else body.phone
    if single_user_mode_enabled() and body.phone != "local-owner":
        record_login_failure(client_host)
        raise HTTPException(status_code=401, detail="账号或密码错误")
    user = query_one("SELECT * FROM users WHERE phone = ?", (login_phone,))
    if not user or not verify_password(body.password, user["password_hash"]):
        record_login_failure(client_host)
        raise HTTPException(status_code=401, detail="手机号或密码错误")
    clear_login_failures(client_host)
    token = create_token_record(user["id"])
    return {
        "success": True,
        "token": token,
        "user": to_safe_user(user),
        "tenants": get_user_tenants(user["id"])
    }

@router.post("/login-sms")
def login_sms(body: LoginSmsSchema):
    require_public_accounts_enabled()
    if not body.phone or not body.code:
        raise HTTPException(status_code=400, detail="请输入手机号和验证码")
        
    if not verify_sms_code(body.phone, body.code, "login"):
        raise HTTPException(status_code=400, detail="验证码错误或已过期")
        
    user = query_one("SELECT * FROM users WHERE phone = ?", (body.phone,))
    if not user:
        # Auto register if phone is not registered
        password_hash = hash_password(secrets.token_hex(16))
        result = run_sql(
            "INSERT INTO users (phone, password_hash, name, role) VALUES (?, ?, ?, 'student')",
            (body.phone, password_hash, f"手机用户_{body.phone[-4:]}")
        )
        user_id = result["lastInsertRowid"]
        create_personal_workspace(user_id, f"手机用户_{body.phone[-4:]}")
        user = query_one("SELECT * FROM users WHERE id = ?", (user_id,))
    
    token = create_token_record(user["id"])
    return {
        "success": True,
        "token": token,
        "user": to_safe_user(user),
        "tenants": get_user_tenants(user["id"])
    }

@router.post("/local-session")
def local_session(request: Request):
    if os.getenv("DISABLE_LOCAL_SESSION") == "true" or (
        os.getenv("NODE_ENV") == "production" and os.getenv("ALLOW_EXTERNAL_LOCAL_SESSION") != "true"
    ):
        raise HTTPException(status_code=403, detail="本地免密会话在生产环境中已禁用")
        
    if not is_loopback_request(request):
        raise HTTPException(status_code=403, detail="本地会话仅允许当前电脑访问")
        
    user = get_or_create_local_user()
    existing_token = query_one(
        "SELECT token FROM auth_tokens WHERE user_id = ? AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1",
        (user["id"],)
    )
    token = existing_token["token"] if existing_token else create_token_record(user["id"])
    
    return {
        "success": True,
        "token": token,
        "user": to_safe_user(user),
        "tenants": get_user_tenants(user["id"])
    }

@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    return {
        "success": True,
        "user": to_safe_user(user),
        "tenants": get_user_tenants(user["id"])
    }

@router.post("/logout")
def logout(authorization: str = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        run_sql("DELETE FROM auth_tokens WHERE token = ?", (token,))
    return {"success": True}


# ---------- 个人资料：名称与头像 ----------

class ProfileUpdateSchema(BaseModel):
    name: Optional[str] = None

def _current_user_row(user_id: int) -> dict:
    return query_one("SELECT * FROM users WHERE id = ?", (user_id,))

@router.put("/profile")
def update_profile(body: ProfileUpdateSchema, user: dict = Depends(get_current_user)):
    if body.name is None:
        raise HTTPException(status_code=400, detail="没有需要更新的字段")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="姓名不能为空")
    if len(name) > 30:
        raise HTTPException(status_code=400, detail="姓名不能超过 30 个字符")
    run_sql(
        "UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?",
        (name, user["id"]),
    )
    return {"success": True, "user": to_safe_user(_current_user_row(user["id"]))}

@router.post("/avatar")
async def upload_avatar(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in AVATAR_ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="只支持 png / jpg / webp / gif 图片")
    content = await file.read()
    if len(content) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="头像图片不能超过 2MB")
    if not content:
        raise HTTPException(status_code=400, detail="头像图片为空")

    os.makedirs(AVATAR_DIR, exist_ok=True)
    stored_name = f"avatar-{user['id']}-{secrets.randbelow(10**9)}.{ext}"
    with open(os.path.join(AVATAR_DIR, stored_name), "wb") as target:
        target.write(content)

    avatar_url = f"/uploads/avatars/{stored_name}"
    run_sql(
        "UPDATE users SET avatar = ?, updated_at = datetime('now') WHERE id = ?",
        (avatar_url, user["id"]),
    )
    return {"success": True, "avatar": avatar_url, "user": to_safe_user(_current_user_row(user["id"]))}

@router.delete("/avatar")
def remove_avatar(user: dict = Depends(get_current_user)):
    run_sql(
        "UPDATE users SET avatar = NULL, updated_at = datetime('now') WHERE id = ?",
        (user["id"],),
    )
    return {"success": True, "user": to_safe_user(_current_user_row(user["id"]))}
