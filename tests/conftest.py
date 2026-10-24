import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="yt-test-")
os.environ["DB_PATH"] = os.path.join(_TMP, "test.db")
os.environ["UPLOAD_DIR"] = os.path.join(_TMP, "uploads")
os.environ["CORS_ORIGINS"] = ""
os.environ["TESTING"] = "1"

import sqlite3

import pytest
from fastapi.testclient import TestClient

from server.database import get_db_path
from server.main import app


@pytest.fixture(autouse=True)
def fresh_db():
    conn = sqlite3.connect(get_db_path())
    try:
        for table in ("auth_tokens", "sms_codes", "tenant_members", "tenants", "users"):
            try:
                conn.execute(f"DELETE FROM {table}")
            except sqlite3.OperationalError:
                pass  # table not created yet
        conn.commit()
    finally:
        conn.close()
    yield


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def _fetch_sms_code(phone: str) -> str:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT code FROM sms_codes WHERE phone = ? AND used = 0"
            " ORDER BY id DESC LIMIT 1",
            (phone,),
        ).fetchone()
    finally:
        conn.close()
    assert row is not None, "短信验证码未入库"
    return row["code"]


def _register_and_login(client: TestClient, phone: str = "13900000001", password: str = "Passw0rd!") -> str:
    r = client.post("/api/auth/send-sms", json={"phone": phone, "purpose": "register"})
    assert r.status_code == 200, r.text
    r = client.post(
        "/api/auth/register",
        json={
            "phone": phone,
            "code": _fetch_sms_code(phone),
            "password": password,
            "name": "测试用户",
        },
    )
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    assert token
    return token
