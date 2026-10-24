from fastapi.testclient import TestClient

from conftest import _register_and_login


def _workspace(client: TestClient, token: str):
    """注册后用户有自己的个人工作台，动态取 tenant 头和默认项目。"""
    r = client.get("/api/tenants/my", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    tenants = r.json()["tenants"]
    assert tenants
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenants[0]["id"])}
    r = client.get("/api/projects", headers=headers)
    assert r.status_code == 200, r.text
    projects = r.json()
    assert projects
    return headers, projects[0]["id"]


def _make_template(client: TestClient, headers: dict, project_id: int, **overrides) -> dict:
    payload = {
        "project_id": project_id,
        "name": "投稿前检查",
        "description": "提交论文前的标准流程",
        "category": "科研",
        "tags": ["论文", "投稿"],
        "favorite": True,
        "steps": [
            {"id": "s1", "title": "检查图表编号", "note": "按引用顺序", "substeps": []},
            {"id": "s2", "title": "核对参考文献", "note": "", "substeps": [
                {"id": "u1", "title": "更新 {{期刊}} 格式"},
                {"id": "u2", "title": "检查 DOI 链接"},
            ]},
        ],
    }
    payload.update(overrides)
    r = client.post("/api/sop/templates", json=payload, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


class TestSopTemplates:
    def test_crud_roundtrip(self, client):
        headers, pid = _workspace(client, _register_and_login(client))

        created = _make_template(client, headers, pid)
        assert created["name"] == "投稿前检查"
        assert created["tags"] == ["论文", "投稿"]
        assert created["favorite"] is True
        assert len(created["steps"]) == 2

        r = client.put(f"/api/sop/templates?id={created['id']}",
                       json={"name": "改名", "steps": [{"id": "a", "title": "唯一步骤", "substeps": []}]},
                       headers=headers)
        assert r.status_code == 200
        updated = r.json()
        assert updated["name"] == "改名"
        assert updated["version"] == created["version"] + 1

        r = client.get(f"/api/sop/templates?project_id={pid}", headers=headers)
        assert [t["id"] for t in r.json()] == [created["id"]]

        r = client.delete(f"/api/sop/templates?id={created['id']}", headers=headers)
        assert r.status_code == 200
        assert client.get(f"/api/sop/templates?project_id={pid}", headers=headers).json() == []

    def test_validation_rejects_empty_steps_and_title(self, client):
        headers, pid = _workspace(client, _register_and_login(client))
        r = client.post("/api/sop/templates",
                        json={"project_id": pid, "name": "空步骤", "steps": []}, headers=headers)
        assert r.status_code == 400
        r = client.post("/api/sop/templates",
                        json={"project_id": pid, "name": "空标题",
                              "steps": [{"id": "s", "title": "  ", "substeps": []}]},
                        headers=headers)
        assert r.status_code == 400

    def test_template_isolated_by_tenant(self, client):
        headers_a, pid_a = _workspace(client, _register_and_login(client, phone="13900000011"))
        headers_b, _pid_b = _workspace(client, _register_and_login(client, phone="13900000012"))
        created = _make_template(client, headers_a, pid_a)

        # B 冒用 A 的工作区头 → 直接拒绝
        forged = dict(headers_b, **{"X-Tenant-Id": headers_a["X-Tenant-Id"]})
        r = client.get(f"/api/sop/templates?project_id={pid_a}", headers=forged)
        assert r.status_code == 403
        # B 用自己的合法工作区查 A 的项目 → 不报错也不泄露数据
        r = client.get(f"/api/sop/templates?project_id={pid_a}", headers=headers_b)
        assert r.status_code == 200
        assert r.json() == []
        assert client.get(f"/api/sop/templates?project_id={pid_a}", headers=headers_a).json()[0]["id"] == created["id"]


class TestSopInstances:
    def test_start_snapshot_and_toggle(self, client):
        headers, pid = _workspace(client, _register_and_login(client))
        template = _make_template(client, headers, pid)

        r = client.post("/api/sop/instances",
                        json={"template_id": template["id"], "variables": {"期刊": "Nature"}},
                        headers=headers)
        assert r.status_code == 200, r.text
        inst = r.json()
        assert inst["status"] == "running"
        assert inst["variables"] == {"期刊": "Nature"}
        assert all(s["done"] is False for s in inst["steps"])

        # 模板改名加版本，不影响已启动实例的快照
        client.put(f"/api/sop/templates?id={template['id']}",
                   json={"name": "完全不同的模板", "steps": [{"id": "x", "title": "新步骤", "substeps": []}]},
                   headers=headers)
        r = client.get(f"/api/sop/instances?project_id={pid}", headers=headers)
        assert r.json()[0]["name"] == "投稿前检查"
        assert len(r.json()[0]["steps"]) == 2

        # 勾选按原样持久化（父子联动由前端 utils/sop.js 负责，后端为纯存储）
        steps = r.json()[0]["steps"]
        steps[1]["substeps"][0]["done"] = True
        r = client.put(f"/api/sop/instances?id={inst['id']}", json={"steps": steps}, headers=headers)
        assert r.status_code == 200
        assert r.json()["steps"][1]["substeps"][0]["done"] is True
        assert r.json()["steps"][1]["substeps"][1]["done"] is False

    def test_duplicate_active_instance_rejected(self, client):
        headers, pid = _workspace(client, _register_and_login(client))
        template = _make_template(client, headers, pid)
        r = client.post("/api/sop/instances", json={"template_id": template["id"]}, headers=headers)
        assert r.status_code == 200
        r = client.post("/api/sop/instances", json={"template_id": template["id"]}, headers=headers)
        assert r.status_code == 409
        # 结束后可以再次启动
        first = client.get(f"/api/sop/instances?project_id={pid}", headers=headers).json()[0]
        r = client.put(f"/api/sop/instances?id={first['id']}", json={"status": "abandoned"}, headers=headers)
        assert r.status_code == 200
        r = client.post("/api/sop/instances", json={"template_id": template["id"]}, headers=headers)
        assert r.status_code == 200

    def test_pause_resume_elapsed_and_terminal_guards(self, client):
        headers, pid = _workspace(client, _register_and_login(client))
        template = _make_template(client, headers, pid)
        inst = client.post("/api/sop/instances", json={"template_id": template["id"]}, headers=headers).json()

        # running -> paused 结算 running_since
        r = client.put(f"/api/sop/instances?id={inst['id']}", json={"status": "paused"}, headers=headers)
        assert r.status_code == 200
        paused = r.json()
        assert paused["status"] == "paused"
        assert paused["running_since"] is None
        assert paused["elapsed_ms"] >= 0

        # 暂停后继续计时基点重置
        r = client.put(f"/api/sop/instances?id={inst['id']}", json={"status": "running"}, headers=headers)
        assert r.json()["running_since"] is not None

        # running 状态不能直接“继续”
        r = client.put(f"/api/sop/instances?id={inst['id']}", json={"status": "running"}, headers=headers)
        assert r.status_code == 400

        # 完成后终态不可再变更
        r = client.put(f"/api/sop/instances?id={inst['id']}", json={"status": "completed"}, headers=headers)
        assert r.status_code == 200
        assert r.json()["ended_at"] is not None
        r = client.put(f"/api/sop/instances?id={inst['id']}", json={"status": "running"}, headers=headers)
        assert r.status_code == 409

    def test_status_filter_and_delete(self, client):
        headers, pid = _workspace(client, _register_and_login(client))
        t1 = _make_template(client, headers, pid, name="流程一")
        t2 = _make_template(client, headers, pid, name="流程二")
        i1 = client.post("/api/sop/instances", json={"template_id": t1["id"]}, headers=headers).json()
        client.put(f"/api/sop/instances?id={i1['id']}", json={"status": "completed"}, headers=headers)
        i2 = client.post("/api/sop/instances", json={"template_id": t2["id"]}, headers=headers).json()

        r = client.get(f"/api/sop/instances?project_id={pid}&status=running,paused", headers=headers)
        assert [i["id"] for i in r.json()] == [i2["id"]]
        r = client.get(f"/api/sop/instances?project_id={pid}&status=completed", headers=headers)
        assert [i["id"] for i in r.json()] == [i1["id"]]

        r = client.delete(f"/api/sop/instances?id={i1['id']}", headers=headers)
        assert r.status_code == 200
        r = client.get(f"/api/sop/instances?project_id={pid}&status=completed", headers=headers)
        assert r.json() == []
