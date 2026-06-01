# 研途研究生导师管理系统

面向研究生导师与学生的多课题组（多租户）协同平台：学生档案、任务指派、组会记录、阶段评审、学术成果、考勤、文件、敏捷项目（看板/Sprint/站会）、周报与成长档案全流程闭环。

## 技术栈

- **前端**：React 18 + Vite 6 + React Router v7 + Tailwind CSS + Recharts + dnd-kit + lucide-react
- **后端**：Express 4 + sql.js（SQLite in-process）+ multer + compression
- **鉴权**：Bearer Token（localStorage）+ X-Tenant-Id 头部租户隔离
- **AI**：mimo-v2.5-pro 论文审阅，DeepSeek 助手（可选）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 准备环境变量
cp .env.example .env
# 编辑 .env 填写 AI_API_KEY 等

# 3. 启动后端（端口 3002）
npm run server

# 4. 另开终端启动前端（端口 5174，开发模式带 HMR）
npm run dev

# 5. 浏览器打开 http://localhost:5174
```

**初次使用**：注册第一个用户（角色选 mentor），系统会自动创建"默认课题组"并把该用户设为 owner。

## 生产部署

```bash
npm install
cp .env.example .env  # 编辑：NODE_ENV=production，填写真实 AI key
npm run build         # 构建前端 → dist/
npm run server        # Express 同时提供 API 和静态前端（单端口）
```

部署后只需暴露 `PORT`（默认 3002）。所有非 `/api/*` 的路径都会回退到 `index.html` 由前端路由处理。

可选反向代理（推荐 nginx）：
```nginx
server {
  server_name your-domain;
  location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `AI_API_KEY` | 仅论文审阅功能 | mimo-v2.5-pro Token |
| `AI_BASE_URL` | 同上 | 默认 `https://token-plan-sgp.xiaomimimo.com/v1` |
| `AI_MODEL` | 同上 | 默认 `mimo-v2.5-pro` |
| `DEEPSEEK_API_KEY` | 否 | 启用 DeepSeek 助手 |
| `PORT` | 否 | 默认 3002 |
| `NODE_ENV` | 否 | `production` 时不再返回短信验证码 |
| `SENTRY_DSN` | 否 | 后端错误上报（@sentry/node），留空则关闭 |
| `VITE_SENTRY_DSN` | 否 | 前端错误上报（@sentry/react），构建期注入 |
| `SENTRY_TRACES_SAMPLE_RATE` | 否 | 性能采样率，默认 0（关闭） |

## 目录结构

```
mentor-management-system/
├── server/
│   ├── index.js              # Express 入口（鉴权、限流、安全头、SPA fallback）
│   ├── db.js                 # sql.js 初始化、建表、索引
│   ├── middleware/
│   │   ├── tenant.js         # requireAuth / requireTenant / checkSubscription
│   │   ├── rateLimit.js      # 登录/短信/通用 API 三档限流
│   │   ├── validate.js       # 请求体校验
│   │   ├── upload.js         # multer 配置
│   │   └── wrap.js           # async error wrapper
│   └── routes/
│       ├── auth.js           # 登录/注册/短信验证
│       ├── tenant.js         # 课题组与成员
│       ├── mentor.js         # 学生/任务/评审/组会/通知/考勤/文件/活动日志
│       ├── export.js         # CSV 导出
│       ├── report.js         # 数据 Dashboard
│       ├── weekly-report.js  # 周报
│       ├── growth.js         # 成长档案
│       ├── papers.js         # 论文上传与 AI 审阅
│       └── agile/            # 敏捷项目子模块
├── src/
│   ├── api.js                # 前端 API 客户端（含 GET 缓存）
│   ├── context/              # AuthContext / TenantContext / ThemeContext / ToastContext
│   ├── components/           # Modal / Skeleton / ErrorBoundary 等
│   └── pages/
│       ├── mentor/           # 导师视角
│       ├── agile/            # 敏捷视角
│       └── common/           # 通用页（考勤、通知、设置等）
├── .env / .env.example       # 环境变量
└── dist/                     # vite build 产物（部署时由 Express 提供）
```

## 关键设计

### 多租户隔离

所有数据表带 `tenant_id` 列；写入与查询都强制走 `req.tenantId`（由 `requireTenant` 中间件根据 `X-Tenant-Id` 头部填充），并校验当前用户是否属于该课题组。租户切换不刷新页面，前端清除 `_cache` 后重新拉数据。

### 限流

- 登录：每 IP 每分钟 5 次（`authLimiter`）
- 短信：每手机号每分钟 1 次（`smsLimiter`，在 send-sms 路由内）
- 通用：每 IP 每秒 50 次（`apiLimiter`）

### GET 缓存

`src/api.js` 内置 60 秒 GET 缓存与 in-flight 去重；写操作（POST/PUT/DELETE）自动清除。

### CSV 导出

服务端流式：`/api/mentor/export/{students,tasks,achievements}.csv`，BOM 前缀兼容 Excel。

## 常见运维操作

```bash
# 备份数据库（需要登录 token）
curl -H "Authorization: Bearer <token>" http://localhost:3002/api/backup -o backup.db

# 健康检查
curl http://localhost:3002/healthz
```

服务启动时会自动在 `server/backups/` 下生成当日快照（`data-YYYY-MM-DD.db`），并保留最近 7 天，每天凌晨 3 点滚动。如果当天已有备份则跳过。该目录已在 `.gitignore` 中。

如需配置 Sentry 错误上报，在 `.env` 中填写 `SENTRY_DSN`（后端）与 `VITE_SENTRY_DSN`（前端，构建时注入）。两者独立，留空即关闭，不影响其他功能。

## 已知限制

- sql.js 是纯 JS 实现的 SQLite，写入会全量重写文件（30 秒一次自动 flush）；单机数据量超过百万行可能需要换成 better-sqlite3 或 PostgreSQL。
- AI 论文审阅依赖 `mimo-v2.5-pro` 接口，国内访问可能需要代理。
- 列表分页参数 `page`/`pageSize` 已加但前端默认仍走非分页（向后兼容）。
