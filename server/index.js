import 'dotenv/config';

import * as Sentry from '@sentry/node';
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  });
  console.log('[Sentry] Backend tracking enabled');
}

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { initDB, flushDB, getDBIntegrity } from './db.js';
import { getAuthRoutes } from './routes/auth.js';
import { getTenantRoutes } from './routes/tenant.js';
import { setupPaperRoutes } from './routes/papers.js';
import { requireAuth, requireTenant } from './middleware/tenant.js';
import { apiLimiter, authLimiter } from './middleware/rateLimit.js';
import { ensureTodayBackup, scheduleDailyBackup } from './backup.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const agileModules = [
  { path: '/api/projects', router: './routes/agile/projects.js' },
  { path: '/api/stories', router: './routes/agile/stories.js' },
  { path: '/api/tasks', router: './routes/agile/tasks.js' },
  { path: '/api/sprints', router: './routes/agile/sprints.js' },
  { path: '/api/standups', router: './routes/agile/standups.js' },
  { path: '/api/risks', router: './routes/agile/risks.js' },
  { path: '/api/milestones', router: './routes/agile/milestones.js' },
  { path: '/api/literature', router: './routes/agile/literature.js' },
  { path: '/api/meetings', router: './routes/agile/meetings.js' },
  { path: '/api/export', router: './routes/agile/export.js' },
  { path: '/api/ai', router: './routes/agile/ai.js' },
  { path: '/api/reports', router: './routes/report.js' },
  { path: '/api/weekly-reports', router: './routes/weekly-report.js' },
  { path: '/api/growth', router: './routes/growth.js' },
];

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(compression());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use('/uploads', express.static(join(__dirname, 'uploads')));

app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Global rate limit
app.use(apiLimiter);

// Auth routes (public, with stricter rate limit)
getAuthRoutes(app, authLimiter);
getTenantRoutes(app);
setupPaperRoutes(app);

// Mentor routes (protected)
import('./routes/mentor.js').then(m => {
  app.use('/api/mentor', requireAuth, requireTenant, m.default);
}).catch(err => {
  console.error('[Route] Failed to load mentor routes:', err.message);
});

// CSV export endpoints (protected)
import('./routes/export.js').then(m => {
  app.use('/api/mentor/export', requireAuth, requireTenant, m.default);
}).catch(err => {
  console.error('[Route] Failed to load export routes:', err.message);
});

// Agile proxy routes (used by frontend for direct DB access)
import('./routes/agile-proxy.js').then(m => {
  app.use('/api/agile', requireAuth, requireTenant, m.default);
}).catch(err => {
  console.error('[Route] Failed to load agile-proxy:', err.message);
});

// Agile routes (protected, dynamic import)
for (const { path, router } of agileModules) {
  import(router).then(m => {
    app.use(path, requireAuth, requireTenant, m.default);
  }).catch(err => {
    console.error(`[Route] Failed to load ${router}:`, err.message);
  });
}

// Backup download endpoint (protected)
app.get('/api/backup', requireAuth, (req, res) => {
  const dbPath = join(process.cwd(), 'server', 'data.db');
  if (!existsSync(dbPath)) return res.status(404).json({ error: '备份文件不存在' });
  flushDB();
  const data = readFileSync(dbPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="mentor-backup-${timestamp}.db"`);
  res.send(data);
});

// Serve built SPA if dist/ exists (single-port deployment)
const distDir = join(process.cwd(), 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir, {
    maxAge: '1y',
    etag: true,
    setHeaders: (res, path) => {
      if (path.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
  console.log(`[Static] Serving SPA from ${distDir}`);
}

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '文件大小超过 50MB 限制' });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error('Server error:', err.message);
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  res.status(500).json({ error: err.message });
});

async function start() {
  await initDB();

  const integrity = getDBIntegrity();
  if (integrity.ok) {
    console.log(`[DB] Integrity check passed. ${integrity.tables.length} tables.`);
  } else {
    console.error('[DB] Integrity check failed:', integrity.error);
  }

  const autoFlushInterval = setInterval(() => flushDB(), 30000);

  ensureTodayBackup();
  scheduleDailyBackup();

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err.message);
    if (process.env.SENTRY_DSN) Sentry.captureException(err);
    flushDB();
    clearInterval(autoFlushInterval);
    process.exit(1);
  });

  app.listen(PORT, () => {
    console.log(`Unified server running on http://localhost:${PORT}`);
  });
}

process.on('SIGINT', () => { flushDB(); process.exit(0); });
process.on('SIGTERM', () => { flushDB(); process.exit(0); });
process.on('exit', () => { flushDB(); });

start().catch(console.error);
