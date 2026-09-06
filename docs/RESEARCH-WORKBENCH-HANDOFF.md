# 小九科研工作台交接文档

更新时间：2026-08-19  
项目目录：`E:\Project coding\mentor-management-system`  
默认地址：<http://127.0.0.1:3002/>

## 1. 产品定位

小九工作台是 Windows 桌面优先的个人科研工作台，不是通用团队管理平台。核心闭环为：

```text
收集箱 → 任务 / 文献 / 风险 / 日程
研究问题 → 假设 → 实验 → 证据 → 结论 → 论文
每日记录 → 每周复盘 → 本地 Codex 反馈 → 下一步
```

网站内只允许连接本地 Codex Worker。文献、日程、记录、研究地图和备份均使用本地 SQLite；不再接入 AnySearch、SciVerse、Zotero、Obsidian、DeepSeek、OpenAI-compatible Agent、Sentry 或其他外部服务。

## 2. 已完成的主流程

### 统一收集箱

- `inbox_items` 接收想法、任务、文献线索、日程、风险和普通笔记。
- 支持把收集项转换为任务、文献、日程或风险。
- 兼容旧 `user_stories` 数据迁移，不删除历史表与字段。
- `Alt+N` 可从任意页面快速收集。

### S/A/B/C/L 任务清单

- “任务推进”采用分级 Todo List，不再使用三列拖拽看板。
- `S`：立即处理；`A`：优先处理；`B`：计划推进；`C`：批量处理；`L`：长期积累。
- 每项任务可直接勾选完成、恢复、推进状态、修改等级、编辑或删除。
- 旧数据中的 `D` 在界面中兼容映射为 `L`，不会破坏历史 SQLite 数据。

### 全局搜索与快捷键

- `Alt+K`：搜索任务、收集箱、文献、每日记录、风险、日程、每周复盘和研究地图节点。
- `Alt+J`：进入每日记录。
- 搜索结果按当前工作区与项目隔离，并跳转到对应页面。

### 每日记录与每周复盘

- 每日记录保存在 `project_daily_logs`，不再同步外部笔记软件。
- 每日页可根据待推进任务生成今日计划。
- “Codex 深度复盘”只使用工作台中的真实记录与项目上下文。
- 每周复盘保存事实指标、规则摘要、优势、缺口、下周三项重点及 Codex 分析。
- 周复盘快照包含研究地图节点、关系与链路缺口。

### 研究地图

- 节点：研究问题、假设、实验、证据、结论、论文。
- 关系与节点均持久化到 SQLite。
- 自动识别：假设无实验、实验无证据、证据无结论。
- Codex 上下文与每周复盘会读取有界研究地图摘要。

### 文献与证据

- 只显示工作台本地文献库。
- 支持标题、作者、期刊、DOI、摘要、笔记、标签、评分和阅读状态。
- 支持卡片/列表视图及本地全文字段搜索。
- 不在浏览器中联网检索或读取 Zotero；历史文献数据保持兼容。

### 日程日历

- 个人日程保存在 `personal_schedule_items`。
- 旧 localStorage 日程会安全迁移到 SQLite。
- 可分别显示/隐藏农历与节日，偏好保存在本机。
- 可添加、查看和删除个人日程。

### 本地 Codex Agent

- 右下角浮窗只创建与轮询 `codex_jobs`。
- 显示 Worker 绿色/红色连接状态、任务排队/运行/完成/失败状态。
- 失败任务可重新排队。
- 只在浮窗打开时检查 Worker；只有存在活动任务时才每 4 秒轮询任务，空闲时不持续轮询。
- Codex 上下文有数量上限，包含任务、风险、里程碑、最近每日记录、文献、收集箱、日程和研究地图。

### 连接、备份与恢复

- 健康页只保留：工作台数据库、本地 Codex Worker、安全快照。
- 支持创建恢复快照、下载数据库、上传 `.db` 恢复。
- 恢复前自动创建当前数据库快照。
- 上传恢复前执行 SQLite `integrity_check` 和核心表校验。

## 3. Codex Worker

核心接口：

```text
POST /api/codex/jobs
GET  /api/codex/jobs
POST /api/codex/jobs/{id}/retry
GET  /api/codex/workers/status
POST /api/codex/worker/heartbeat
POST /api/codex/worker/claim
POST /api/codex/worker/jobs/{id}/complete
```

Worker 启动所需变量：

```powershell
$env:CODEX_SERVER_URL = "http://127.0.0.1:3002"
$env:CODEX_WORKER_TOKEN = "服务器配置的令牌"
$env:CODEX_TENANT_ID = "1"
$env:CODEX_WORKER_ID = "我的电脑"
python tools/codex-worker.py
```

`start-workbench.ps1` 可同时启动工作台和 Worker。Worker 会优先执行 Windows 的 `codex.cmd`。

当前外部状态：本机 Codex 自定义 Provider 曾返回 `401 Invalid token`。Worker 心跳和队列本身正常；如再次出现，需要在 Codex 客户端登录或修复本机 Provider Token，然后重新排队失败任务。

## 4. Codex-only 约束

已删除或停用：

- `/api/search/anysearch`
- `/api/zotero/*`
- `/api/obsidian/*`
- `/api/ai/*`
- `/api/papers/{id}/analyze`
- 通用 Agent 配置/API Key 页面
- `server/routers/extra.py`
- `server/routers/zotero.py`
- `server/routers/obsidian.py`
- `server/cache_engine.py`
- `server/obsidian_service.py`
- 未使用的旧 `AIAssistant.jsx`
- Sentry 前端初始化与依赖
- `httpx`、`pypdf` 后端依赖

数据库中旧的配置表和论文 `ai_score` / `ai_summary` 历史字段仍保留，只为兼容已有数据，不再用于外部调用。

## 5. 验证记录

2026-08-19 最近验证：

- `npm run check`：通过。
- Python 全量编译：通过。
- Vite 生产构建：通过。
- 真实数据库副本启动：通过。
- 文献页、每日记录、连接健康、Codex 浮窗浏览器回归：通过。
- 浏览器 console error：0。
- 浏览器失败请求：0。
- OpenAPI 禁止路由检查：`/api/ai/*`、Zotero、Obsidian、AnySearch 均不存在。
- 数据库代码仍保留旧表定义，未删除历史数据。

常用命令：

```powershell
cd 'E:\Project coding\mentor-management-system'
npm run check
npm run test:browser
npm run test:research-search
venv\Scripts\python.exe tools\qa-recovery.py
```

## 6. 后续优化原则

1. 优先让现有闭环更顺，不新增重复页面或重复状态机。
2. 任何 Codex 结论都必须能回到工作台中的真实任务、记录、文献或研究节点。
3. 不自动把摘要、推断或 Codex 输出升级为已核验证据。
4. 不删除真实 SQLite 历史表，除非先完成迁移与独立恢复验证。
5. 保持桌面端约 220px 侧栏与主区最小宽度，不恢复手机/iPad 专用布局。
6. 控制轮询、上下文大小和依赖数量，避免增加常驻内存。
7. 不在前端、文档、日志或数据库迁移中写入真实 Token。

## 7. 下一次接手

1. 检查本机 Codex 认证并完成一次 queued → running → completed 的真实任务。
2. 用真实课题录入至少一条问题—假设—实验—证据—结论链路。
3. 生成并保存本周复盘，确认 Codex 分析引用真实项目内容。
4. 为文献增加更严格的“待核验 / 已核验 / 已用于结论”证据状态时，先设计兼容迁移。

<a href="https://deerflow.tech" target="_blank">Created by Deerflow</a>
