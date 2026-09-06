# 任务计划：小九科研工作台持续工作流优化

## 目标
把现有页面集合升级为完整的个人科研闭环：快速收集、统一检索、执行推进、每周复盘、可靠恢复与研究逻辑映射，并保持现有数据兼容。

## 当前阶段
阶段 8（最终验收完成）

## 各阶段

### 阶段 1：统一收集箱
- [x] 审计现有待办事项数据结构和 API
- [x] 将待办事项页面改造为可快速记录、分类和转化的收集箱
- [x] 支持转为任务、日程、风险或保留为灵感
- [x] 完成数据迁移与桌面端验证
- **状态：** complete

### 阶段 2：全局内容搜索与桌面快捷键
- [x] 建立跨任务、文献、复盘、风险、日程的搜索 API
- [x] 将顶部搜索升级为内容搜索与页面命令面板
- [x] 增加 Alt+K、Alt+N、Alt+J 快捷键，避开浏览器保留组合键
- **状态：** complete

### 阶段 3：每周复盘与 Codex Agent
- [x] 汇总一周任务、每日记录、风险、文献和专注数据
- [x] 提供规则摘要与 Codex 深度分析入口
- [x] 保存周复盘和下周三项重点
- **状态：** complete

### 阶段 4：连接健康与备份恢复
- [x] 汇总数据库、本地 Codex Worker 和安全快照状态
- [x] 增加安全恢复流程，恢复前自动备份
- [x] 提供一键检查与可解释的故障提示
- **状态：** complete

### 阶段 5：研究地图
- [x] 设计研究问题、假设、实验、证据、结论、论文节点模型
- [x] 建立节点关系与任务/文献关联
- [x] 实现桌面研究地图和缺口提示
- **状态：** complete

### 阶段 6：统一验收与收口
- [x] 完整构建和后端编译
- [x] 桌面浏览器关键路径回归
- [x] 清理重复入口与死代码
- [x] 更新交接与使用说明
- **状态：** complete

### 阶段 7：Codex-only 与低资源收敛
- [x] 将右下角 Agent 改为只创建和轮询 Codex Job
- [x] 文献页移除 AnySearch/Zotero，只保留本地文献与证据
- [x] 每日记录移除 Obsidian，只基于工作台记录请求 Codex 复盘
- [x] 删除 `/api/ai/*`、AnySearch、Zotero、Obsidian 与外部论文分析路由
- [x] 连接健康页收敛为数据库、Codex Worker、安全快照
- [x] 移除 Sentry、httpx、pypdf 和旧外接代码，保留历史数据库字段兼容
- [x] 完成真实数据库、构建、OpenAPI 与浏览器回归
- **状态：** complete

### 阶段 8：真实 3002 最终验收
- [x] 日历独立选择农历与节日/重要日，并持久保存
- [x] 将浏览器保留快捷键改为 Alt+K、Alt+N、Alt+J
- [x] 更新桌面烟测，移除 AnySearch 与移动端旧断言
- [x] 在 `127.0.0.1:3002` 验证构建、搜索、任务闭环、日历、Codex-only 页面与数据库完整性
- **状态：** complete

## 关键问题
1. 现有 Backlog/user_stories 是否适合直接承载收集箱，还是需要独立 inbox 表？
2. Codex Worker 当前支持哪些可复用的分析调用与状态接口？
3. 备份恢复如何在 Windows 本地服务中保证可回滚和租户安全？

## 已做决策
| 决策 | 理由 |
|------|------|
| 采用桌面端专用布局 | 用户主要在电脑使用，优先信息密度和快捷键 |
| 按输入→检索→复盘→可靠性→研究地图顺序实现 | 先补工作流闭环，再建设高级研究结构 |
| 保持现有数据兼容 | 工作台已有真实数据，不能破坏或强制重录 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| PowerShell Get-ChildItem 同时传多个 Name 参数失败 | 1 | 改用 Test-Path 逐个检查规划文件 |
| 当前 Codex 环境内置 rg.exe 启动被 Windows 拒绝访问 | 1 | 改用 PowerShell Get-ChildItem/Select-String 完成搜索 |
| 首次更新 findings.md 时补丁上下文顺序不匹配 | 1 | 使用更小且精确的上下文重新补丁 |
| apply_patch 拒绝同一补丁删除并新增 Backlog.jsx | 1 | 改为顺序执行两个补丁，文件已成功重建 |
| 侧边栏组合补丁 import 上下文不匹配 | 1 | 按实际源文件行重新补丁 |
| 动态临时数据库创建/清理命令被执行策略拒绝 | 1 | 使用 .runtime/inbox-schema-test.db 进行非破坏性验证 |
| PowerShell 错误解析 Python schema 查询中的双引号 | 1 | 用单引号封装完整 Python 代码段 |
| Edge CDP 的 Start-Process/Stop-Process 组合命令被策略拒绝 | 1 | 使用可控 exec PTY 会话启动和终止 |
| 周复盘快照查询假设 agile_tasks 存在 updated_at，旧表实际没有 | 1 | 改用现有 created_at，保持旧数据库兼容 |
| 周复盘更新接口使用了未建出的 summary 字段 | 1 | 增加 summary 字段并提供幂等 ALTER 迁移 |
| Chrome/Edge 会优先占用 Ctrl+K 和 Ctrl+N | 1 | 改用浏览器可可靠传递给网页的 Alt+K、Alt+N、Alt+J，并完成物理按键验收 |
| 页面级 KeyboardEvent 表达式返回循环对象导致 CDP 序列化失败 | 1 | 将 dispatchEvent 结果包装为 Boolean 原始值 |
| CDP waitFor 的 && 表达式返回 DOM Element 导致序列化失败 | 1 | 用 Boolean 包装 command panel 检查表达式 |
| 启动脚本在健康服务在线时只构建不重载后端 | 1 | 精确停止 3002 监听进程与 Worker 后重新启动，确认新路由上线 |
| Python 直接启动扩展名为 codex 的 Windows shim 报 WinError 5 | 1 | Worker 优先解析 codex.cmd/codex.exe，并支持 CODEX_CLI_PATH |
| Codex CLI 的 ask-for-approval 是根命令参数 | 1 | 将参数移动到 exec 子命令之前 |
| 本机 Codex 自定义 Provider 返回 401 Invalid token | 1 | 明确显示为 Codex CLI 认证问题并提供重新排队；需用户在 Codex 侧更新登录/令牌 |
| 当前线程一度只能写入 C 盘科研工作区 | 1 | 在可写目录建立不含真实数据的轻量镜像，先验证 Codex-only 改造；权限恢复后同步到真实项目并再次回归 |

## 备注
- 规划文件属于项目开发记忆，不承载外部不可信内容。
- 每个阶段完成后同步更新 progress.md 与 findings.md。
