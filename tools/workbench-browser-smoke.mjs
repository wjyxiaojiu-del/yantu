import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const runtimeDir = path.join(root, '.runtime');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = process.env.WORKBENCH_URL || 'http://127.0.0.1:3002';
const workspacePassword = process.env.WORKBENCH_PASSWORD || '';
const uniqueTitle = `浏览器验收任务-${Date.now()}`;

await fs.mkdir(runtimeDir, { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const failedResponses = [];
let createdTaskId = null;
let createdLogId = null;

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('response', (response) => {
  if (workspacePassword && response.status() === 403 && response.url().endsWith('/api/auth/local-session')) return;
  if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
    failedResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  }
});

async function authenticatedFetch(pathname, options = {}) {
  return page.evaluate(async ({ pathname, options }) => {
    const token = localStorage.getItem('auth-token') || '';
    const tenantId = localStorage.getItem('tenant-id') || '';
    const response = await fetch(pathname, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': tenantId,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : null };
  }, { pathname, options });
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if (workspacePassword) {
    await page.getByPlaceholder('请输入工作台密码').fill(workspacePassword);
    await page.getByRole('button', { name: '进入工作台', exact: true }).click();
  }
  await page.getByRole('heading', { name: '今日推进' }).waitFor();
  if (workspacePassword) {
    consoleErrors.length = 0;
    failedResponses.length = 0;
  }
  await page.screenshot({ path: path.join(runtimeDir, 'workbench-desktop.png'), fullPage: true });

  await page.getByText('更多工具', { exact: true }).waitFor();
  await page.getByText('日程日历', { exact: true }).waitFor();
  await page.getByText('连接与恢复', { exact: true }).waitFor();
  await page.getByText('研究地图', { exact: true }).waitFor();

  await page.getByRole('button', { name: /添加下一步|新增任务/ }).first().click();
  await page.getByPlaceholder('例如：完成实验拆解课程的浏览器验收').fill(uniqueTitle);
  await page.getByRole('button', { name: '记下下一步', exact: true }).click();
  await page.getByRole('heading', { name: uniqueTitle, exact: true }).waitFor();

  const projectId = await page.evaluate(() => {
    const tenantId = localStorage.getItem('tenant-id');
    return localStorage.getItem(`project-id:${tenantId}`);
  });
  const taskList = await authenticatedFetch(`/api/tasks?project_id=${projectId}`);
  createdTaskId = taskList.data.find((task) => task.title === uniqueTitle)?.id || null;
  if (!createdTaskId) throw new Error('快速创建成功后没有从 API 找到任务');

  const taskRow = page.locator('.workbench-task-row').filter({ hasText: uniqueTitle });
  await taskRow.getByRole('button', { name: '开始', exact: true }).click();
  await taskRow.getByText('进行中', { exact: true }).waitFor();

  const dailyLogResponse = page.waitForResponse((response) => response.url().includes('/api/daily-logs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '按优先任务生成计划', exact: true }).click();
  const logResponse = await dailyLogResponse;
  const logData = await logResponse.json();
  createdLogId = logData.id;
  await page.waitForURL('**/agile/standup');

  await page.goto(`${baseUrl}/agile/dashboard`, { waitUntil: 'networkidle' });
  const completedTaskRow = page.locator('.workbench-task-row').filter({ hasText: uniqueTitle });
  await completedTaskRow.getByRole('button', { name: `完成任务：${uniqueTitle}` }).click();
  await page.getByText('今天没有待推进任务', { exact: true }).waitFor();

  await page.goto(`${baseUrl}/calendar`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '日程日历' }).waitFor();
  await page.getByRole('button', { name: '显示设置' }).click();
  const lunarToggle = page.locator('.calendar-display-menu label').filter({ hasText: '农历' }).locator('input');
  const holidayToggle = page.locator('.calendar-display-menu label').filter({ hasText: '节日与重要日' }).locator('input');
  await lunarToggle.waitFor();
  await holidayToggle.waitFor();
  if (!(await lunarToggle.isChecked()) || !(await holidayToggle.isChecked())) {
    throw new Error('日历农历与节日开关没有按默认设置开启');
  }
  await lunarToggle.uncheck();
  if (!(await holidayToggle.isChecked())) throw new Error('农历开关不应影响节日开关');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '显示设置' }).click();
  if (await lunarToggle.isChecked()) throw new Error('农历显示偏好刷新后未保持');
  if (!(await holidayToggle.isChecked())) throw new Error('节日显示偏好刷新后未保持');
  await lunarToggle.check();

  await page.goto(`${baseUrl}/agile/literature`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '文献与证据' }).waitFor();
  const literatureExternal = await page.locator('body').evaluate((body) => /AnySearch|Zotero/.test(body.innerText));
  if (literatureExternal) throw new Error('文献页仍显示已移除的外部工具入口');

  await page.goto(`${baseUrl}/agile/standup`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '每日记录' }).waitFor();
  await page.getByRole('button', { name: 'Codex 深度复盘' }).waitFor();
  const standupExternal = await page.locator('body').evaluate((body) => /Obsidian|DeepSeek/.test(body.innerText));
  if (standupExternal) throw new Error('每日记录页仍显示已移除的外部工具入口');

  await page.goto(`${baseUrl}/agile/connection-health`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '连接与恢复' }).waitFor();
  await page.getByRole('heading', { name: '工作台数据库' }).waitFor();
  await page.getByRole('heading', { name: '本地 Codex Worker' }).waitFor();
  await page.getByRole('heading', { name: '安全快照', level: 3 }).waitFor();
  const healthExternal = await page.locator('body').evaluate((body) => /AnySearch|Zotero|Obsidian|DeepSeek/.test(body.innerText));
  if (healthExternal) throw new Error('连接页仍显示已移除的外部工具');

  await page.getByRole('button', { name: '打开本地 Codex Agent' }).click();
  await page.getByText('本地 Codex Agent', { exact: true }).waitFor();
  await page.getByText('只调用你电脑上的 Codex Worker', { exact: false }).waitFor();

  const openApiPaths = await page.evaluate(async () => {
    const response = await fetch('/openapi.json');
    const data = await response.json();
    return Object.keys(data.paths || {});
  });
  const forbiddenPaths = openApiPaths.filter((pathname) => (
    pathname.startsWith('/api/ai/')
    || pathname.startsWith('/api/zotero/')
    || pathname.startsWith('/api/obsidian/')
    || pathname === '/api/search/anysearch'
  ));
  if (forbiddenPaths.length) throw new Error(`仍注册了已移除的外接路由：${forbiddenPaths.join(', ')}`);

  if (consoleErrors.length) throw new Error(`浏览器控制台错误：${consoleErrors.join(' | ')}`);
  if (failedResponses.length) throw new Error(`失败请求：${failedResponses.join(' | ')}`);

  console.log(JSON.stringify({
    status: 'passed',
    authenticated: Boolean(workspacePassword),
    desktop: '1440x1000',
    sidebarExpanded: true,
    quickTask: true,
    taskStart: true,
    dailyPlan: true,
    taskComplete: true,
    calendarDisplayPreferences: true,
    literatureLocalOnly: true,
    codexReviewOnly: true,
    connectionCards: 3,
    codexAgentVisible: true,
    forbiddenPaths,
    consoleErrors: 0,
    failedResponses: 0,
  }, null, 2));
} finally {
  try {
    if (createdLogId) await authenticatedFetch(`/api/daily-logs?id=${createdLogId}`, { method: 'DELETE' });
    if (createdTaskId) await authenticatedFetch(`/api/tasks?id=${createdTaskId}`, { method: 'DELETE' });
    await authenticatedFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    await browser.close();
  }
}
