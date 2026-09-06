# 进度日志

## 会话：2026-08-19

### 阶段 1：统一收集箱
- **状态：** complete
- **开始时间：** 2026-08-19
- 执行的操作：
  - 建立持续优化目标。
  - 确定六阶段实施顺序。
  - 初始化持久化规划文件。
  - 完成会话恢复检查和 Git 工作区审计，确认保留全部既有改动。
  - 审计数据库表结构、任务/风险调用和日历存储，确认收集箱与个人日程需要独立持久化模型。
  - 确认数据库迁移惯例与任务/风险租户校验方式，确定使用幂等新表和原子式后端转化接口。
  - 审计前端缓存、路由预热与快捷键处理，确定收集箱 API 和全局快速收集的接入点。
  - 新增 inbox_items 与 personal_schedule_items 幂等表、索引及旧 user_stories 导入迁移。
  - 新增收集箱 CRUD/转任务、风险、日程、文献、灵感接口，以及个人日程 CRUD 接口。
  - 在前端 API 层接入收集箱与个人日程方法。
  - 重做 /agile/backlog 为桌面统一收集箱，支持快速捕捉、筛选、编辑、归档及一键转化。
  - 侧边栏名称更新为“收集箱”，并增加全局快速收集快捷键与数据预热。
  - 将个人日程由 localStorage 迁移到 SQLite，并加入带来源去重的旧日程自动迁移。
  - 浏览器 QA 环境审计：无浏览器 MCP/Playwright，切换为本机 Edge headless 与真实接口验收。
  - 首次真实服务器烟测确认前端端口在线，但后端尚未重载新路由，准备通过工作台脚本重启。
- 创建/修改的文件：
  - task_plan.md
  - findings.md
  - progress.md
  - server/database.py
  - server/routers/agile.py
  - src/api.js
  - src/pages/agile/Backlog.jsx
  - src/components/WorkspaceSidebar.jsx
  - src/App.jsx
  - src/pages/common/CalendarView.jsx

### 阶段 2：全局内容搜索与桌面快捷键
- **状态：** complete
- **开始时间：** 2026-08-19
- 已审计本地/外部搜索路由与 App 命令面板，确定六类本地数据源和双层搜索交互。
- 已实现 GET /search/global 聚合六类项目数据，包含相关性评分、摘要、去向路由和元数据。
- 已将顶部搜索改造成快捷动作/页面命令/工作区内容三合一面板，并接入每日记录快捷键。
- 已完成真实服务搜索接口与 Edge CDP 回归，页面级快捷键和内容结果无 console error。

### 阶段 3：每周复盘与 Codex Agent
- **状态：** complete
- **开始时间：** 2026-08-19
- 已新增 research_weekly_reviews 表与幂等迁移。
- 已实现周范围事实快照、规则摘要、复盘 CRUD、Codex Job 回填和下周三项重点保存。
- 已新增桌面周复盘页面与侧边栏入口。
- 已完成周快照、手工更新、三项重点、Codex Job 回填和真实页面加载验收。

### 阶段 4：连接健康与备份恢复
- **状态：** complete
- 已接入 /api/system/health、快照列表、手动备份、上传恢复和恢复前自动快照。
- 已接入桌面“连接与恢复”页面、侧边栏入口和解释性状态卡。
- 真实服务健康检查、手动备份、独立 SQLite 恢复往返均通过；恢复测试 marker 和 integrity_check 均正确。

### 阶段 5：研究地图
- **状态：** complete
- 新增 research_nodes/research_edges 表、幂等索引和悬空关系清理迁移。
- 新增研究地图 CRUD、关系 CRUD、summary 缺口分析 API。
- 新增桌面六列研究地图页面，支持问题/假设/实验/证据/结论/论文、连接关系、删除节点和缺口定位。
- 独立真实服务创建六节点→五条关系→summary→清理测试通过；无残留节点或关系。

### 阶段 6：统一验收与收口
- **状态：** complete
- `npm run check`、Python 编译、真实服务健康/备份/研究地图接口均通过。
- Edge CDP：日历显示设置持久化、研究地图页面、连接健康页面均加载通过且 0 console error。
- 修复本地 Codex Worker 的 Windows `WinError 5`：优先使用 `codex.cmd`，并移动 CLI 参数到当前版本的正确位置。
- 增加 Codex 失败任务重新排队入口与认证错误解释；当前历史任务实际剩余问题是本机 Provider 的 401 令牌，不是 Worker 连接。
- 已移除文件资料库路由、页面代码和侧边栏重复备份入口；通知中心仅由右上角铃铛按需加载。
- 已更新 `docs/RESEARCH-WORKBENCH-HANDOFF.md`，记录完整工作流、验证结果和唯一外部阻塞。

### 阶段 7：Codex-only 与低资源收敛
- **状态：** complete
- 右下角浮窗重写为 Codex Job 客户端：提交、状态显示、结果复制、失败重试、Worker 连接说明。
- Worker 状态改为浮窗打开时每 15 秒检查；只有 queued/running 任务存在时才每 4 秒轮询任务，页面隐藏时不请求。
- 文献页重写为本地“文献与证据”视图，保留题录、DOI、摘要、笔记、标签、评分、状态和卡片/列表视图。
- 每日记录移除 Obsidian 配置、读取、同步与 URI 链接，Codex 复盘只依据工作台事实。
- 连接健康页只保留数据库、Codex Worker、安全快照三类状态。
- 后端删除 AnySearch、Zotero、Obsidian、通用外部 Agent 与外部论文分析路由；Codex 上下文构建移入 `codex.py`。
- 删除旧 `extra.py`、Zotero/Obsidian 路由与服务、CacheEngine、旧 AIAssistant 页面。
- 移除 Sentry 前端接入与依赖，移除 httpx/pypdf 后端依赖；历史配置表与论文历史 AI 字段保留兼容。
- 使用真实数据库副本在 3012 隔离端口验证后同步到真实项目，再在 3013 对真实项目二次浏览器回归。
- 重写 `docs/RESEARCH-WORKBENCH-HANDOFF.md` 为 Codex-only 当前状态。

### 阶段 8：真实 3002 最终验收
- **状态：** complete
- 日历“显示设置”支持独立控制农历与节日/重要日，默认开启，并通过 localStorage 在刷新后保持。
- 首页文献入口改为“搜索本地文献”，清除最后一处 AnySearch 语义残留。
- 快捷键由浏览器保留的 Ctrl 组合改为 Alt+K 搜索、Alt+N 收集、Alt+J 复盘，并用真实按键完成验证。
- 浏览器烟测收敛为桌面关键流程，删除移动端与旧项目报告断言，新增日历、文献本地化、Codex 复盘、连接健康、Codex 浮窗和 OpenAPI 禁止路由检查。
- 真实 `127.0.0.1:3002` 上构建、全局本地搜索、任务闭环与 Codex-only 回归全部通过；console error=0、failed response=0。
- Worker 在线 1 个，数据库 connected=true、integrity=ok，安全快照 1 个。

### 阶段 9：S/A/B/C/L Todo List
- **状态：** complete
- 将任务推进三列拖拽看板替换为桌面分级 Todo List。
- 支持 S/A/B/C/L 分组、等级筛选、状态筛选、搜索、直接勾选、完成恢复、状态推进和等级即时调整。
- 旧 D 级任务在前端兼容映射为 L，数据库结构保持不变。
- 删除不再使用的 DnD 依赖及构建分包，`npm audit` 为 0 漏洞。
- 真实 3002 自动化完成 S 级创建→L 级调整→勾选完成→恢复→清理，0 console error、0 failed response。

## 测试结果
| 测试 | 输入 | 预期结果 | 实际结果 | 状态 |
|------|------|---------|---------|------|
| 规划初始化 | 三个规划文件 | 文件存在且记录目标 | 已创建 | 通过 |
| 前端生产构建 | npm run check | Vite 构建与 Python compileall 通过 | 2585 模块构建成功 | 通过 |
| Python 语法 | database/agile/main | 无语法错误 | py_compile 无输出，exit 0 | 通过 |
| 新库迁移 | .runtime/inbox-schema-test.db | 创建收集箱/日程表与索引 | 表、字段、索引齐全 | 通过 |
| 旧事项导入 | 同一 user_story 连续 init_db | 只生成一条 inbox 来源记录 | legacy_import_count=1 | 通过 |
| 收集箱转化 | task/schedule | 生成目标记录并标记 converted | 两类均成功且返回 converted_id | 通过 |
| 旧日程去重 | 同 source_legacy_id 创建两次 | 返回同一日程 | id 相同 | 通过 |
| 真实服务 API | 本地会话下创建→转任务→查询→清理 | 新路由在线且目标可查询 | 全部成功，测试数据已清理 | 通过 |
| 桌面视觉烟测 | Edge headless 1440×1000 | 页面完整无明显溢出/遮挡 | 收集区、筛选、空态和品牌签名均正常 | 通过 |
| 收集箱 CDP 交互 | 快捷收集、空输入、创建、转化弹窗、删除 | 全路径可操作且无前端异常 | 全部通过，0 console/network error | 通过 |
| 全局搜索聚合 | 独立库写入六类同关键词数据 | 返回六类结果与对应路由 | total=6，六种 type/path 均存在 | 通过 |
| 阶段 2 构建 | npm run check | 新搜索面板与后端编译通过 | 2585 模块构建成功 | 通过 |
| 连接健康真实接口 | `/api/system/health` + `/api/system/backup` | 数据库/Worker 状态可读且快照生成 | integrity=ok、worker_online=true、快照生成成功 | 通过 |
| 恢复往返 | 独立 SQLite marker | 恢复前自动备份且 marker 回到 before | restored=true、两次 integrity_check=ok | 通过 |
| 研究地图 API | 六节点五关系创建→summary→清理 | 链路统计和缺口分析正确 | nodes=6、edges=5、qaGapCount=0，清理后 0/0 | 通过 |
| 日历显示偏好 CDP | 关闭农历→刷新→打开设置 | 选择本机持久化且无前端异常 | persistedOff=true、reload 后 checkbox=false、0 errors | 通过 |
| 研究地图/连接健康 CDP | 页面加载与关键文案 | 两页可访问且无前端异常 | mapLoaded=true、healthLoaded=true、0 errors | 通过 |
| Codex Worker Windows 启动 | `codex` / `codex.cmd` 版本调用 | Worker 不再因 WinError 5 立即失败 | codex.cmd 可执行；重试已进入 CLI 认证阶段 | 通过 |
| Codex-only 构建 | `npm run check` | Python 与 Vite 生产构建通过 | 2252 模块，exit 0 | 通过 |
| 禁止外接路由 | OpenAPI paths | 不存在 `/api/ai/*`、Zotero、Obsidian、AnySearch | forbiddenPaths=[] | 通过 |
| Codex-only 页面回归 | 文献、每日记录、连接健康、Codex 浮窗 | 无外接入口且核心操作可见 | 外接文案计数均 0；Codex 复盘按钮 1；健康卡 3 | 通过 |
| 真实项目浏览器回归 | 127.0.0.1:3013 | 0 console error / 0 失败请求 | 两项均为 0 | 通过 |
| 真实 3002 本地搜索 | Alt+N 收集→Alt+K 搜索 | 真实按键可触发且无需外部检索 | quickCaptureShortcut=true、localGlobalSearch=true | 通过 |
| 真实 3002 桌面闭环 | 任务创建/开始/计划/完成、侧栏、日历 | 桌面关键路径全部可用 | 全部 true，0 console/network error | 通过 |
| 日历双开关 | 农历关闭、节日保持、刷新 | 两项独立且刷新后持久化 | calendarDisplayPreferences=true | 通过 |
| 真实 3002 Codex-only | 文献、每日记录、连接、浮窗、OpenAPI | 无外接入口与禁止路由 | forbiddenPaths=[]、健康卡 3、Codex 浮窗可见 | 通过 |
| 最终运行健康 | Worker/数据库/备份 | Worker 在线、SQLite 完整、有安全快照 | online_workers=1、integrity=ok、backup_count=1 | 通过 |

## 错误日志
| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|--------|------|---------|---------|
| 2026-08-19 | Get-ChildItem 多 Name 参数类型错误 | 1 | 改用 Test-Path |
| 2026-08-19 | Codex 内置 rg.exe 被 Windows 拒绝启动 | 1 | 改用 PowerShell Get-ChildItem/Select-String |
| 2026-08-19 | 首次追加规划记录时补丁上下文顺序不匹配 | 1 | 拆分为精确上下文补丁 |
| 2026-08-19 | apply_patch 不允许同一补丁同时删除并新增同一路径 | 1 | 在同一工具脚本中顺序执行删除与新增补丁 |
| 2026-08-19 | 侧边栏 import 与标签的组合补丁上下文顺序不匹配 | 1 | 使用文件实际 import 行重新应用精确补丁 |
| 2026-08-19 | 临时数据库验证命令因包含动态路径清理被安全策略拒绝 | 1 | 改用工作区 .runtime 下固定测试数据库且不执行删除 |
| 2026-08-19 | 数据库 schema 验证中的 Python 双引号被 PowerShell 提前解析 | 1 | 改用 PowerShell 单引号包裹 Python -c 代码 |
| 2026-08-19 | 同一 PowerShell 命令启动并强制停止 Edge 被安全策略拒绝 | 1 | 改用 PTY 会话运行 Edge，测试后向同一会话发送 Ctrl+C |
| 2026-08-19 | 周复盘测试发现历史 agile_tasks 无 updated_at 字段 | 1 | 快照按 created_at 统计，不新增破坏性字段 |
| 2026-08-19 | 周复盘 CRUD 测试发现 review 表缺少 summary 字段 | 1 | 添加字段与旧库 ALTER 迁移 |
| 2026-08-19 | Chrome/Edge 优先占用 Ctrl+K 与 Ctrl+N，网页无法可靠接收 | 1 | 快捷键改为 Alt+K、Alt+N、Alt+J，并用真实物理按键自动化验证 |
| 2026-08-19 | CDP 页面事件测试返回循环 KeyboardEvent 对象 | 1 | 用 Boolean 包装 dispatchEvent，避免序列化错误 |
| 2026-08-19 | CDP 搜索面板检查表达式返回 input DOM 节点 | 1 | 用 Boolean 包装 waitFor 条件 |

## 五问重启检查
| 问题 | 答案 |
|------|------|
| 我在哪里？ | 阶段 6：统一验收与收口 |
| 我要去哪里？ | 搜索、周复盘、健康恢复、研究地图、统一验收 |
| 目标是什么？ | 建立完整的个人科研工作流闭环 |
| 我学到了什么？ | 见 findings.md |
| 我做了什么？ | 已完成收集、搜索、复盘、健康恢复和研究地图主链路，正在做最终清理与说明 |
