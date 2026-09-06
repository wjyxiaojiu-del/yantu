import os
import sqlite3
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from server.database import (
    create_database_backup,
    get_db_path,
    query_all,
    query_one,
    restore_database,
    validate_database_file,
)
from server.dependencies import get_tenant_context


router = APIRouter(prefix="/system", tags=["system"])
BACKUP_DIR = Path(os.path.dirname(get_db_path())) / "recovery-backups"
MAX_RESTORE_BYTES = 200 * 1024 * 1024


def _database_health() -> dict:
    path = Path(get_db_path())
    result = {
        "connected": path.is_file(),
        "integrity": "unknown",
        "size": path.stat().st_size if path.is_file() else 0,
        "modifiedAt": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds") if path.is_file() else None,
        "name": path.name,
    }
    if not path.is_file():
        result["connected"] = False
        result["error"] = "数据库文件不存在"
        return result
    try:
        with sqlite3.connect(f"file:{path.resolve().as_posix()}?mode=ro", uri=True, timeout=5) as conn:
            result["integrity"] = conn.execute("PRAGMA integrity_check").fetchone()[0]
            result["connected"] = result["integrity"] == "ok"
    except sqlite3.Error as exc:
        result.update({"connected": False, "error": str(exc)})
    return result


def _codex_health(tenant_id: int) -> dict:
    rows = query_all("SELECT worker_id, last_seen, version FROM codex_workers WHERE tenant_id = ? ORDER BY worker_id", (tenant_id,))
    now = datetime.utcnow()
    workers = []
    for row in rows:
        try:
            seen = datetime.strptime(row["last_seen"], "%Y-%m-%d %H:%M:%S")
            online = (now - seen).total_seconds() <= 25
        except (TypeError, ValueError):
            online = False
        workers.append({**row, "online": online})
    latest_job = query_one(
        "SELECT id, status, error, completed_at, created_at FROM codex_jobs WHERE tenant_id = ? ORDER BY id DESC LIMIT 1",
        (tenant_id,),
    )
    if latest_job and latest_job.get("error"):
        raw_error = str(latest_job["error"])
        if "401 Unauthorized" in raw_error or "Invalid token" in raw_error:
            latest_job["error"] = "Codex CLI 认证失败，请在本机 Codex 登录或检查自定义 Provider/API Key"
        elif "WinError 5" in raw_error:
            latest_job["error"] = "Windows 拒绝执行 Codex CLI，请重启本地 Worker"
        else:
            latest_job["error"] = raw_error.splitlines()[0][:180]
    return {"online": any(row["online"] for row in workers), "workers": workers, "latestJob": latest_job}


def _backup_entries() -> list[dict]:
    if not BACKUP_DIR.is_dir():
        return []
    entries = []
    for path in sorted(BACKUP_DIR.glob("*.db"), key=lambda item: item.stat().st_mtime, reverse=True):
        stat = path.stat()
        entries.append({
            "name": path.name,
            "size": stat.st_size,
            "createdAt": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
        })
    return entries


@router.get("/health")
def system_health(ctx: dict = Depends(get_tenant_context)):
    tenant_id = ctx["tenant_id"]
    backups = _backup_entries()
    return {
        "database": _database_health(),
        "codex": _codex_health(tenant_id),
        "backups": {"count": len(backups), "latest": backups[0] if backups else None},
    }


@router.get("/recovery-backups")
def list_recovery_backups(_ctx: dict = Depends(get_tenant_context)):
    return {"backups": _backup_entries()}


@router.get("/recovery-backups/{name}")
def download_recovery_backup(name: str, _ctx: dict = Depends(get_tenant_context)):
    if Path(name).name != name or not name.endswith(".db"):
        raise HTTPException(status_code=400, detail="备份文件名无效")
    path = BACKUP_DIR / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="备份文件不存在")
    return FileResponse(path, media_type="application/octet-stream", filename=name)


@router.post("/backup")
def create_recovery_backup(_ctx: dict = Depends(get_tenant_context)):
    try:
        return create_database_backup("manual")
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(status_code=500, detail="创建安全备份失败：" + str(exc)) from exc


@router.post("/restore")
async def restore_from_upload(file: UploadFile = File(...), _ctx: dict = Depends(get_tenant_context)):
    filename = Path(file.filename or "").name
    if not filename.lower().endswith(".db"):
        raise HTTPException(status_code=400, detail="请选择 .db SQLite 备份文件")
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = BACKUP_DIR / (".incoming-" + filename + "-" + str(os.getpid()))
    try:
        total = 0
        with temp_path.open("wb") as target:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_RESTORE_BYTES:
                    raise HTTPException(status_code=413, detail="备份文件超过 200MB 限制")
                target.write(chunk)
        validate_database_file(str(temp_path))
        result = restore_database(str(temp_path))
        return {
            "ok": True,
            "filename": filename,
            "size": total,
            "preRestoreBackup": result["pre_restore_backup"],
            "validation": result["validation"],
        }
    except HTTPException:
        raise
    except (OSError, ValueError, sqlite3.Error) as exc:
        raise HTTPException(status_code=400, detail="恢复失败：" + str(exc)) from exc
    finally:
        if temp_path.exists():
            temp_path.unlink()
