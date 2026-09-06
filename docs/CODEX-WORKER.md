# 本地 Codex Worker

本地模式下推荐直接运行项目根目录的 `start-workbench.ps1`。它会同时启动工作台和 Worker，并在 `.runtime/codex-worker-token` 中生成本机令牌；不需要手工填写令牌。

```powershell
.\start-workbench.ps1
```

停止时运行：

```powershell
.\stop-workbench.ps1
```

工作台通过服务器创建任务，本地 Worker 主动轮询服务器并调用本机 `codex exec`。电脑离线时任务保留在服务器队列中。

服务器环境变量：

```powershell
$env:CODEX_WORKER_TOKEN = "请生成一个随机长令牌"
```

本地电脑启动 Worker：

```powershell
$env:CODEX_SERVER_URL = "https://你的工作台域名"
$env:CODEX_WORKER_TOKEN = "与服务器相同的令牌"
$env:CODEX_TENANT_ID = "1"
$env:CODEX_WORKER_ID = "我的电脑"
$env:CODEX_WORKDIR = "E:\Project coding\mentor-management-system"
python tools/codex-worker.py
```

Worker 默认使用 `codex exec --ephemeral --sandbox read-only`，不会自动修改文件、删除内容、上传文件或执行高风险操作。第一版只提交当前项目的结构化上下文和用户问题，结果回到 Agent 面板后由用户决定是否保存。
