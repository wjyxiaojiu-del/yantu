import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime

from server.database import init_db, run_sql, get_db_path
from server.dependencies import get_current_user
from server.routers import auth, tenant, mentor, agile, papers, search, codex, system, research_map

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.abspath(os.getenv("UPLOAD_DIR", os.path.join(BASE_DIR, "uploads")))
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="研途启航 API (FastAPI)", version="1.0.0")

is_production = os.getenv("NODE_ENV") == "production"
configured_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]

# CORS and Compression Middlewares
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins if configured_origins else ([] if is_production else ["*"]),
    allow_credentials=bool(configured_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    )
    if is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

@app.on_event("startup")
def startup_event():
    init_db()
    if is_production:
        auth.ensure_workspace_owner()
    print("[DB] SQLite database initialized successfully.")

@app.get("/healthz")
def health_check():
    return {"ok": True, "ts": int(datetime.now().timestamp() * 1000)}

# Mount static upload folder
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Include Routers with /api prefix
app.include_router(auth.router, prefix="/api")
app.include_router(tenant.router, prefix="/api")
app.include_router(mentor.router, prefix="/api")
app.include_router(agile.router, prefix="/api")
app.include_router(papers.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(codex.router, prefix="/api")
app.include_router(system.router, prefix="/api")
app.include_router(research_map.router, prefix="/api")

# Database backup endpoint
@app.get("/api/backup")
def download_db_backup(user: dict = Depends(get_current_user)):
    # Flush database WAL log before backup
    try:
        run_sql("PRAGMA wal_checkpoint(TRUNCATE)")
    except Exception as e:
        print("[DB] Failed to checkpoint WAL:", str(e))
        
    db_path = get_db_path()
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="备份文件不存在")
        
    timestamp = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
    return FileResponse(
        db_path,
        media_type="application/octet-stream",
        filename=f"mentor-backup-{timestamp}.db"
    )

# SPA Single-Port Production Hosting (if frontend is built)
dist_dir = os.path.abspath(os.path.join(BASE_DIR, "..", "dist"))
if os.path.exists(dist_dir):
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
        
    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("api") or full_path.startswith("healthz"):
            raise HTTPException(status_code=404)
        if any(part.startswith(".") for part in full_path.split("/") if part):
            raise HTTPException(status_code=404)
        file_path = os.path.join(dist_dir, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        # Fallback to index.html for SPA client-side routing
        return FileResponse(os.path.join(dist_dir, "index.html"))
    print(f"[Static] Single-port hosting enabled, serving SPA from {dist_dir}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "3002")))
