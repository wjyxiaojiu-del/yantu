"""Small polling worker for the local Codex CLI.

Environment:
  CODEX_SERVER_URL       e.g. https://workbench.example.com
  CODEX_WORKER_TOKEN     same secret configured on the server
  CODEX_TENANT_ID        workspace ID
  CODEX_WORKER_ID        optional device name
  CODEX_WORKDIR           optional Codex working directory
  CODEX_CLI_PATH          optional explicit Codex executable or .cmd path
"""
import json
import os
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.request


BASE = os.getenv("CODEX_SERVER_URL", "http://127.0.0.1:3002").rstrip("/")
TOKEN = os.getenv("CODEX_WORKER_TOKEN", "")
TENANT = os.getenv("CODEX_TENANT_ID", "")
WORKER = os.getenv("CODEX_WORKER_ID", "local-codex")
WORKDIR = os.getenv("CODEX_WORKDIR", os.getcwd())
INTERVAL = int(os.getenv("CODEX_WORKER_INTERVAL", "5"))


def codex_command():
    """Resolve a directly executable Codex command for the worker process."""
    configured = os.getenv("CODEX_CLI_PATH", "").strip()
    candidates = [configured] if configured else []
    candidates.extend(["codex.cmd", "codex.exe", "codex"] if os.name == "nt" else ["codex"])
    for candidate in candidates:
        if not candidate:
            continue
        resolved = candidate if os.path.isfile(candidate) else shutil.which(candidate)
        if resolved:
            return resolved
    raise FileNotFoundError("找不到 Codex CLI，请设置 CODEX_CLI_PATH 或确认 codex.cmd 在 PATH 中")


def summarize_codex_error(error: str) -> str:
    text = (error or "").strip()
    if "401 Unauthorized" in text or "Invalid token" in text:
        prefix = "Codex CLI 认证失败（401）。请先在本机 Codex 完成登录，或检查自定义 Provider/API Key。"
    elif "WinError 5" in text or "PermissionError" in text:
        prefix = "Codex CLI 被 Windows 拒绝执行。请确认 CODEX_CLI_PATH 指向 codex.cmd，并检查项目目录权限。"
    elif "unexpected argument '--ask-for-approval'" in text:
        prefix = "Codex CLI 参数版本不兼容，请更新本地 Worker。"
    else:
        prefix = "Codex CLI 执行失败。"
    return prefix + "\n\n" + text[-5000:]


def request(path, method="GET", payload=None):
    body = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Codex-Worker-Token", TOKEN)
    req.add_header("X-Codex-Worker-Id", WORKER)
    req.add_header("X-Codex-Tenant-Id", TENANT)
    with urllib.request.urlopen(req, timeout=35) as response:
        return json.loads(response.read().decode())


def run_job(job):
    context = json.loads(job.get("context_json") or "{}")
    prompt = (
        "你是本地科研工作台 Codex Worker。只分析，不执行删除、上传、外部提交或高风险实验操作。\n"
        "请基于下面的工作台上下文完成用户任务，并明确区分事实、推断和待核验项。\n\n"
        f"用户任务：{job['prompt']}\n\n"
        f"工作台上下文：{json.dumps(context, ensure_ascii=False, indent=2)}"
    )
    completed = subprocess.run(
        [codex_command(), "--ask-for-approval", "never", "exec", "--ephemeral", "--sandbox", "read-only", "-C", WORKDIR, prompt],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=1800,
    )
    if completed.returncode:
        return {"error": summarize_codex_error(completed.stderr or completed.stdout)}
    return {"result": completed.stdout[-200000:]}


def heartbeat_loop():
    while True:
        try:
            request("/api/codex/worker/heartbeat", "POST", {"version": "1"})
        except Exception as exc:
            print(f"Worker heartbeat issue: {exc}")
        time.sleep(10)


def main():
    if not TOKEN or not TENANT:
        raise SystemExit("请设置 CODEX_WORKER_TOKEN 和 CODEX_TENANT_ID")
    print(f"Codex Worker online: {WORKER}, server={BASE}")
    threading.Thread(target=heartbeat_loop, daemon=True).start()
    while True:
        try:
            response = request("/api/codex/worker/claim", "POST")
            job = response.get("job")
            if job:
                print(f"Claimed job #{job['id']}")
                try:
                    outcome = run_job(job)
                except Exception as exc:
                    outcome = {"error": str(exc)}
                request(f"/api/codex/worker/jobs/{job['id']}/complete", "POST", {"workerId": WORKER, **outcome})
                print(f"Completed job #{job['id']}")
            else:
                time.sleep(INTERVAL)
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            print(f"Worker connection issue: {exc}")
            time.sleep(min(30, INTERVAL * 2))


if __name__ == "__main__":
    main()
