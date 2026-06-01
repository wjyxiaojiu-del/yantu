import { copyFileSync, mkdirSync, readdirSync, unlinkSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { flushDB } from './db.js';

const BACKUP_DIR = join(process.cwd(), 'server', 'backups');
const SOURCE_DB = join(process.cwd(), 'server', 'data.db');
const KEEP_DAYS = 7;

function ensureDir() {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function backupFileName(dateKey = todayKey()) {
  return `data-${dateKey}.db`;
}

function cleanupOldBackups() {
  if (!existsSync(BACKUP_DIR)) return;
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const name of readdirSync(BACKUP_DIR)) {
    if (!name.startsWith('data-') || !name.endsWith('.db')) continue;
    const full = join(BACKUP_DIR, name);
    try {
      if (statSync(full).mtimeMs < cutoff) unlinkSync(full);
    } catch (e) {
      console.warn('[Backup] Cleanup failed for', name, e.message);
    }
  }
}

export function runBackup() {
  if (!existsSync(SOURCE_DB)) {
    console.warn('[Backup] Source DB not found, skipping');
    return null;
  }
  ensureDir();
  flushDB();
  const target = join(BACKUP_DIR, backupFileName());
  try {
    copyFileSync(SOURCE_DB, target);
    cleanupOldBackups();
    console.log(`[Backup] Saved ${target}`);
    return target;
  } catch (e) {
    console.error('[Backup] Failed:', e.message);
    return null;
  }
}

export function ensureTodayBackup() {
  ensureDir();
  const target = join(BACKUP_DIR, backupFileName());
  if (existsSync(target)) return target;
  return runBackup();
}

// Schedule next backup at 03:00 local time, then every 24h
export function scheduleDailyBackup() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(3, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();
  setTimeout(() => {
    runBackup();
    setInterval(runBackup, 24 * 60 * 60 * 1000);
  }, delay);
  console.log(`[Backup] Next scheduled at ${next.toISOString()}`);
}
