# 小九科研工作台

当前版本：`v0.1`

小九科研工作台是一个 Windows 桌面优先、本地数据优先的个人科研工作台。它把科研任务、文献证据、日程、每日记录、每周复盘和研究逻辑放进同一个闭环，并只允许连接本机 Codex Worker。

## 核心工作流

```text
收集箱 → 任务 / 文献 / 风险 / 日程
研究问题 → 假设 → 实验 → 证据 → 结论 → 论文
每日记录 → 每周复盘 → 本地 Codex 反馈 → 下一步
```

主要功能：

- 科研总览与今日推进仪表盘
- `S / A / B / C / L` 任务优先级与长期任务
- 统一收集箱及任务、文献、风险、日程转化
- 本地文献与证据管理
- 每日记录、每周复盘和本地 Codex 分析
- 研究地图与证据链缺口提示
- 农历、节日和个人日程日历
- 跨任务、文献、复盘、风险、日程的本地全局搜索
- Codex Worker 红绿连接状态、任务队列和失败重试
- SQLite 安全快照、下载、恢复与完整性检查

## 一键启动

首次使用需要安装 Node.js、Python，并在项目目录创建虚拟环境：

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r server\requirements.txt
npm install
Copy-Item .env.example .env
```

启动工作台和本地 Codex Worker：

```powershell
.\start-workbench.ps1
```

默认地址：<http://127.0.0.1:3002/>

需要重新构建前端时：

```powershell
.\start-workbench.ps1 -Rebuild
```

停止服务：

```powershell
.\stop-workbench.ps1
```

## 桌面快捷键

- `Alt+K`：全局搜索
- `Alt+N`：快速收集
- `Alt+J`：进入每日记录

## 数据与隐私

- 真实数据默认保存在 `server/data.db`，该文件已被 Git 忽略。
- `.env`、运行日志、恢复快照和 Worker Token 不会进入仓库。
- 文献、记录、日程与研究地图均存储在本地 SQLite。
- 网站内不接入 AnySearch、Zotero、Obsidian、DeepSeek 或其他外部 Agent。
- Codex 分析只通过你电脑上主动连接的本地 Worker 执行。

在重要修改前，可从“连接与恢复”页面创建安全快照。恢复数据库前，工作台还会自动保存当前状态。

## 开发与验证

```powershell
npm run check
npm run test:research-search
npm run test:browser
.\venv\Scripts\python.exe tools\qa-recovery.py
```

技术栈：React 18、Vite、FastAPI、SQLite、Codex CLI。

更完整的工作流与维护说明见 [docs/RESEARCH-WORKBENCH-HANDOFF.md](docs/RESEARCH-WORKBENCH-HANDOFF.md)。

<a href="https://deerflow.tech" target="_blank">Created by Deerflow</a>
