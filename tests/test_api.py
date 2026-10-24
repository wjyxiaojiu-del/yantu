import sqlite3

from conftest import _fetch_sms_code, _register_and_login
from server.database import get_db_path


class TestHealth:
    def test_healthz_ok(self, client):
        r = client.get("/healthz")
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_security_headers(self, client):
        r = client.get("/healthz")
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert r.headers["X-Frame-Options"] == "DENY"
        assert "object-src 'none'" in r.headers["Content-Security-Policy"]

    def test_unauthenticated_me_is_401(self, client):
        r = client.get("/api/auth/me")
        assert r.status_code == 401


class TestAuthFlow:
    def test_register_returns_token_and_me_works(self, client):
        token = _register_and_login(client)
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200

    def test_login_with_wrong_password_rejected(self, client):
        phone = "13700000001"
        _register_and_login(client, phone=phone)
        r = client.post("/api/auth/login", json={"phone": phone, "password": "N0tThePassword"})
        assert r.status_code >= 400
        assert r.json()["detail"]

    def test_register_duplicate_phone_rejected(self, client):
        phone = "13600000001"
        _register_and_login(client, phone=phone)
        # 同手机号 60 秒冷却期内无法再次发码；直接重置已用验证码来构造重复注册请求
        conn = sqlite3.connect(get_db_path())
        try:
            conn.execute("UPDATE sms_codes SET used = 0 WHERE phone = ?", (phone,))
            conn.commit()
        finally:
            conn.close()
        r = client.post(
            "/api/auth/register",
            json={
                "phone": phone,
                "code": _fetch_sms_code(phone),
                "password": "Passw0rd!",
                "name": "重复注册",
            },
        )
        assert r.status_code >= 400


class TestWorkspaceGuard:
    def test_papers_requires_workspace(self, client):
        token = _register_and_login(client)
        r = client.get("/api/papers", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 400
        assert "工作区" in r.json()["detail"]
