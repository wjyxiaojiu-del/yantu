import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { initDB, flushDB, getDBIntegrity } from './db.js';
import { getMentorRoutes } from './routes/mentor.js';
import { getAuthRoutes } from './routes/auth.js';
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
];

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// Auth & Mentor routes
getAuthRoutes(app);
getMentorRoutes(app);

// Agile routes (dynamic import)
for (const { path, router } of agileModules) {
  import(router).then(m => app.use(path, m.default));
}

// Backup download endpoint
app.get('/api/backup', (req, res) => {
  const dbPath = join(process.cwd(), 'server', 'data.db');
  if (!existsSync(dbPath)) return res.status(404).json({ error: '备份文件不存在' });
  flushDB();
  const data = readFileSync(dbPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="mentor-backup-${timestamp}.db"`);
  res.send(data);
});

app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '文件大小超过 50MB 限制' });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error('Server error:', err.message);
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

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err.message);
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
