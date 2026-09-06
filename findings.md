# 发现与决策

## 需求
- 用户授权持续优化全部建议能力。
- 工作台为 Windows 桌面端专用，不再投入手机和平板适配。
- 核心目标不是继续堆页面，而是形成个人科研闭环。

## 研究发现
- 已有科研总览、今日、任务推进、统一收集箱、每日记录、风险管控、日历、Codex Worker 和备份能力。
- 顶部搜索目前主要用于页面导航，不是跨业务数据检索。
- 待办事项与任务推进存在职责重叠，适合将待办事项改造成统一收集箱。
- 科研总览中的建议目前主要是规则生成，尚未形成按周读取复盘内容的 Agent 分析。
- 备份入口已存在，但缺少面向用户的安全恢复工作流。
- Git 工作区已有大范围用户修改与旧 Node 后端删除；本轮必须只做增量编辑，不能重置或清理现有改动。
- 当前 Python 后端多数科研业务表按 project_id 隔离，只有每日记录等少数新表额外带 tenant_id；收集箱需要沿用现有项目上下文并兼容当前单机模式。
- 个人日程仍存储在 localStorage，收集箱若直接转日程会造成跨页面/备份不一致；阶段 1 应先增加后端 personal_schedule_items，再让日历迁移读取。
- 数据库初始化采用 CREATE TABLE IF NOT EXISTS 加逐列 ALTER TABLE 的幂等模式；新表可安全加入 init_db，并补 tenant/project/status 索引。
- 现有任务创建接口已校验项目归属，风险创建接口暂未显式校验项目；收集箱转化接口应统一校验项目并在同一后端调用内写入目标记录和转化状态。
- 前端 API 已有统一缓存与写后清缓存机制，新增 inbox/schedule 方法可直接复用 GET_PARAMS、POST、PUT、DEL。
- App 已实现全局页面搜索和路由预热；阶段 1 将预热对象改为 inbox，并由全局快捷键派发“打开快速收集”事件。
- 收集箱 schema、旧事项导入、任务/日程转化与旧日程来源去重均已通过独立 SQLite 测试库验证。
- 当前 Codex 会话未暴露浏览器自动化 MCP，项目也未安装 Playwright/Puppeteer；桌面验收改用本机 Edge headless、HTTP 接口与截图降级方案，不新增测试依赖。
- 127.0.0.1:3002 健康检查正常，但新 inbox 接口首次请求为 404，确认正在运行的 Python 后端尚未重载本轮代码；需使用现有工作台脚本重启后再验收。
- start/stop 脚本通过 .runtime 中记录的精确 PID 管理服务与 Worker，后台进程使用 Hidden 窗口；可安全用于本轮重载。
- 本地会话响应提供 tenants 数组而非 tenant 单值，真实接口烟测应使用 tenants[0].id 作为 X-Tenant-Id。
- Edge 1440×1000 截图显示新版收集箱在固定 220px 导航和 1060px+ 主区下布局完整，首屏信息层级清晰，无横向溢出或控件遮挡。
- 阶段 1 已完成：收集箱、旧事项/旧日程迁移、转化链路、快速收集和桌面浏览器交互均通过；测试创建的数据已经清理。
- search.py 已收敛为本地工作区内容搜索，不再包含外部检索客户端。
- 全局搜索首批数据源确定为 agile_tasks、inbox_items、literature、project_daily_logs、agile_risks、personal_schedule_items；统一返回 type/title/snippet/path/status/meta/score。
- 顶部搜索适合升级为双层命令面板：空查询显示快捷动作与页面，输入 2 个字符后展示后端聚合内容结果；Alt+J 直接进入每日记录。
- 每周复盘采用 research_weekly_reviews 独立表，保留事实指标、规则摘要、手工总结、三项重点和 Codex 结果；旧 weekly_reports 表不改动。
- Codex Worker 完成任务时会根据 context_json 中的 weekly_review_id 自动回填 agent_analysis 和 ready/agent_failed 状态，Worker 离线时仍可使用规则摘要。
- 阶段 3 页面已接入 /agile/weekly-review，并在前端构建与独立 SQLite 测试中通过。
- 连接健康后端路由已写入并由 server/main.py 注册；当前剩余工作是前端路由/导航接入、备份恢复验收，以及将健康页作为桌面工作流的可靠性入口。
- 日历当前已经能计算农历与固定节日，但所有信息默认强制显示；用户需要在日历内选择是否显示农历和节日，因此应增加本地持久化的显示偏好，不改变日程数据模型。
- 研究地图适合采用轻量六列链路视图，而不是引入图形库：节点和关系持久化在 SQLite，前端用六个类型泳道、关系选择器和缺口列表表达研究逻辑，能保持桌面端低内存占用。
- Windows 上 Python `subprocess.run(["codex", ...])` 会命中无扩展 shim 并触发 WinError 5；`codex.cmd` 可被 Worker 正常执行。当前 Codex CLI 版本要求 `--ask-for-approval` 放在 `exec` 之前。
- 本机 Codex 重试后已越过 WinError 5，但现有自定义 Provider 返回 401 Invalid token；这属于 Codex 登录/Provider 配置问题，工作台现在会将错误解释为认证问题并支持重新排队，不会伪装成 Worker 离线。
- 工作台新增的研究地图和连接健康页均只使用已有 React/Lucide/SQLite 栈，没有引入外部图形或同步服务；AnySearch、Zotero、Obsidian 与通用外部 Agent 已全部从运行路径移除。
- 当前全局搜索原先只覆盖每日记录等“复盘事实”，没有覆盖 `research_weekly_reviews` 和研究地图节点；已补上每周复盘与研究地图两类本地索引结果，仍由统一后端聚合，不增加请求数量。
- Codex 项目上下文按 `agile_tasks.project_id` 读取，并以有界数量包含文献、每日记录、收集箱、日程和研究地图，避免全量数据常驻内存。
- Codex-only 审计发现外接能力分散在前端页面、API 封装、后端路由、健康页、论文分析、错误追踪和依赖清单；只隐藏 UI 不足以满足约束，必须同时删除路由注册与网络客户端。
- 历史 `agent_configs`、`zotero_configs`、`obsidian_configs` 表以及论文 `ai_score`/`ai_summary` 字段暂时保留，防止破坏已有 SQLite 数据；运行代码不再读取它们。
- 空闲资源策略：Codex 浮窗关闭时不轮询；打开但无活动任务时只低频检查 Worker，不轮询 Job；页面隐藏时暂停定时请求。
- Chrome/Edge 会优先占用 Ctrl+K、Ctrl+N 等浏览器快捷键，网页无法稳定拦截；Windows 桌面工作台改用 Alt+K 搜索、Alt+N 收集、Alt+J 复盘，并通过真实按键自动化验证。

## 技术决策
| 决策 | 理由 |
|------|------|
| 第一阶段优先复用或迁移现有 Backlog 数据 | 降低破坏现有数据的风险 |
| 收集箱采用独立 inbox_items 表，旧 user_stories 仅保留兼容 | 避免企业敏捷字段污染，并保护当前真实数据与大量既有改造 |
| 全局搜索统一由后端聚合 | 避免前端逐页拉取全部数据，便于权限与租户隔离 |
| Agent 分析保留规则降级结果 | Codex 离线时周复盘仍然可用 |
| 恢复前创建安全快照 | 避免用户选择错误备份后不可逆 |

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 规划文件初次检查命令参数错误 | 使用 Test-Path 单文件检查并记录错误 |
| 当前环境内置 rg.exe 无法启动（拒绝访问） | 本轮使用 PowerShell 原生文件枚举与 Select-String，避免重复失败 |

## 资源
- 项目根目录：E:\Project coding\mentor-management-system
- 当前工作台：http://127.0.0.1:3002

## 视觉/浏览器发现
- 当前核心页面已改为固定 220px 侧边栏和桌面布局。
- 科研总览适合作为全局状态入口，收集箱应承担统一输入端而非再次展示统计。

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
