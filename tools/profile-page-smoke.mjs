import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const base = process.env.WORKBENCH_URL || 'http://127.0.0.1:3002';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const consoleErrors = [];
const failedResponses = [];

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('response', r => {
  if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) failedResponses.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});
const fail = (msg) => { console.error('SMOKE-FAIL:', msg); process.exitCode = 1; };

// 1. 本地会话登录
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(async (b) => {
  const r = await fetch(b + '/api/auth/local-session', { method: 'POST' });
  if (!r.ok) throw new Error('local-session ' + r.status());
  const data = await r.json();
  localStorage.setItem('auth-token', data.token);
  localStorage.setItem('tenant-id', String(data.tenants[0].id));
}, base);

// 2. 点击侧栏用户区 → 资料弹窗
await page.goto(base + '/agile/dashboard', { waitUntil: 'networkidle' });
await page.click('button[aria-label="编辑个人资料"]');
await page.waitForSelector('text=个人资料', { timeout: 5000 }).catch(() => fail('资料弹窗未出现'));

// 3. 改名 + 上传头像（真实文件输入）
const avatarPath = path.join(os.tmpdir(), 'smiley.png');
await fs.writeFile(avatarPath, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
));
await page.fill('input[placeholder="显示在工作台中的名称"]', '小九');
await page.setInputFiles('input[type="file"]', avatarPath);
await page.click('button:has-text("保存")');

// 4. 弹窗关闭、侧栏名称与头像更新
await page.waitForSelector('text=个人资料', { state: 'detached', timeout: 5000 }).catch(() => fail('保存后弹窗未关闭'));
await page.waitForSelector('aside button[aria-label="编辑个人资料"] >> text=小九', { timeout: 5000 }).catch(() => fail('侧栏名称未更新为 小九'));
const avatarSrc = await page.locator('aside button[aria-label="编辑个人资料"] img').first().getAttribute('src')
  .catch(() => null);
if (!avatarSrc || !avatarSrc.startsWith('/uploads/avatars/')) fail(`侧栏头像未更新: ${avatarSrc}`);

// 5. 头像图片真实可访问
if (avatarSrc) {
  const status = await page.evaluate(async (src) => (await fetch(src)).status, avatarSrc);
  if (status !== 200) fail(`头像静态访问失败: ${status}`);
}

console.log('consoleErrors:', consoleErrors.length ? consoleErrors : '无');
console.log('failedResponses:', failedResponses.length ? failedResponses : '无');
if (consoleErrors.length || failedResponses.length) process.exitCode = 1;
else console.log('SMOKE-PASS: 改名 + 头像上传 + 侧栏实时更新全部通过');
await browser.close();
