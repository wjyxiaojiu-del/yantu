import base64
import os

from conftest import _register_and_login

# 1x1 透明 PNG
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
    "AAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestProfileRename:
    def test_rename_roundtrip(self, client):
        headers = _auth_headers(_register_and_login(client))
        r = client.put("/api/auth/profile", json={"name": "小九"}, headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["name"] == "小九"
        r = client.get("/api/auth/me", headers=headers)
        assert r.json()["user"]["name"] == "小九"

    def test_rename_validation(self, client):
        headers = _auth_headers(_register_and_login(client))
        assert client.put("/api/auth/profile", json={"name": "   "}, headers=headers).status_code == 400
        assert client.put("/api/auth/profile", json={"name": "长" * 31}, headers=headers).status_code == 400
        assert client.put("/api/auth/profile", json={}, headers=headers).status_code == 400

    def test_rename_requires_auth(self, client):
        assert client.put("/api/auth/profile", json={"name": "匿名"}).status_code == 401


class TestAvatar:
    def test_upload_then_me_then_remove(self, client):
        headers = _auth_headers(_register_and_login(client))
        r = client.post(
            "/api/auth/avatar",
            files={"file": ("me.png", PNG_1PX, "image/png")},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        avatar = r.json()["avatar"]
        assert avatar.startswith("/uploads/avatars/")
        # 文件真实落盘且可经静态服务访问
        stored = os.path.join(os.environ["UPLOAD_DIR"], "avatars", avatar.rsplit("/", 1)[-1])
        assert os.path.isfile(stored)
        assert client.get(avatar).status_code == 200
        # me 带回头像字段
        assert client.get("/api/auth/me", headers=headers).json()["user"]["avatar"] == avatar

        r = client.delete("/api/auth/avatar", headers=headers)
        assert r.status_code == 200
        assert client.get("/api/auth/me", headers=headers).json()["user"]["avatar"] is None

    def test_upload_rejects_bad_type_and_oversize(self, client):
        headers = _auth_headers(_register_and_login(client))
        r = client.post(
            "/api/auth/avatar",
            files={"file": ("notes.txt", b"hello", "text/plain")},
            headers=headers,
        )
        assert r.status_code == 400
        r = client.post(
            "/api/auth/avatar",
            files={"file": ("big.png", b"x" * (2 * 1024 * 1024 + 1), "image/png")},
            headers=headers,
        )
        assert r.status_code == 400
        # 校验失败不应留下半成品头像
        assert client.get("/api/auth/me", headers=headers).json()["user"]["avatar"] is None
