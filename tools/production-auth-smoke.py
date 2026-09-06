import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


with tempfile.TemporaryDirectory(prefix="mentor-auth-smoke-") as temp_dir:
    os.environ.update(
        {
            "DB_PATH": str(Path(temp_dir) / "test.db"),
            "NODE_ENV": "production",
            "WORKSPACE_PASSWORD": "test-only-password-2026",
            "LOCAL_USER_NAME": "验收用户",
            "SINGLE_USER_MODE": "true",
            "DISABLE_BACKUPS": "true",
            "CORS_ORIGINS": "https://mentor.example.test",
        }
    )

    from fastapi.testclient import TestClient
    from server.main import app

    with TestClient(app) as client:
        assert client.post("/api/auth/local-session").status_code == 403
        assert client.post("/api/auth/send-sms", json={"phone": "13800000000", "purpose": "login"}).status_code == 404
        assert client.post("/api/auth/login-sms", json={"phone": "13800000000", "code": "123456"}).status_code == 404
        assert client.post(
            "/api/auth/register",
            json={"phone": "13800000000", "code": "123456", "password": "password", "name": "其他用户"},
        ).status_code == 404
        assert client.post(
            "/api/auth/login", json={"phone": "someone-else", "password": "test-only-password-2026"}
        ).status_code == 401

        login = client.post(
            "/api/auth/login", json={"phone": "local-owner", "password": "test-only-password-2026"}
        )
        assert login.status_code == 200
        payload = login.json()
        assert payload["user"]["phone"] == "local-owner"
        assert len(payload["tenants"]) >= 1
        assert "frame-ancestors 'none'" in login.headers["content-security-policy"]

        token = payload["token"]
        assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
        assert client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"}).status_code == 200

print("production auth smoke: PASS")
