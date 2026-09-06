import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = process.env.WORKBENCH_URL || 'http://127.0.0.1:3002';
const runtimeDir = path.resolve(import.meta.dirname, '..', '.runtime');
await fs.mkdir(runtimeDir, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const failedResponses = [];
const title = `Todo 分级验收-${Date.now()}`;
let createdTaskId = null;

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('response', (response) => {
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
  await page.goto(`${baseUrl}/agile/board`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '任务清单' }).waitFor();
  for (const grade of ['S', 'A', 'B', 'C', 'L']) {
    await page.getByRole('button', { name: new RegExp(`^${grade} `) }).waitFor();
  }

  await page.locator('.todo-board-header').getByRole('button', { name: '添加任务', exact: true }).click();
  await page.getByPlaceholder('例如：整理实验 3 的异常样本').fill(title);
  await page.locator('form select').nth(0).selectOption('S');
  await page.getByRole('button', { name: '保存任务', exact: true }).click();
  await page.locator('.todo-task-row').filter({ hasText: title }).waitFor();

  const projectId = await page.evaluate(() => {
    const tenantId = localStorage.getItem('tenant-id');
    return localStorage.getItem(`project-id:${tenantId}`);
  });
  const tasks = await authenticatedFetch(`/api/tasks?project_id=${projectId}`);
  createdTaskId = tasks.data.find((task) => task.title === title)?.id || null;
  if (!createdTaskId) throw new Error('创建后没有从 API 找到验收任务');

  const row = page.locator('.todo-task-row').filter({ hasText: title });
  await row.getByRole('combobox', { name: `调整任务级别：${title}` }).selectOption('L');
  const movedRow = page.locator('.todo-task-row').filter({ hasText: title });
  await movedRow.getByRole('combobox', { name: `调整任务级别：${title}` }).waitFor();
  if (await movedRow.getByRole('combobox', { name: `调整任务级别：${title}` }).inputValue() !== 'L') {
    throw new Error('任务没有移动到 L 级清单');
  }
  await page.screenshot({ path: path.join(runtimeDir, 'task-todolist-desktop.png'), fullPage: true });
  await movedRow.getByRole('button', { name: `完成任务：${title}` }).click();
  await page.getByRole('button', { name: '已完成' }).click();
  const completedRow = page.locator('.todo-task-row.is-completed').filter({ hasText: title });
  await completedRow.waitFor();
  await completedRow.getByRole('button', { name: `恢复任务：${title}` }).click();
  await page.getByRole('button', { name: '待完成' }).click();
  await page.locator('.todo-task-row').filter({ hasText: title }).waitFor();

  const priorityUpdate = await authenticatedFetch(`/api/tasks?project_id=${projectId}`);
  const finalTask = priorityUpdate.data.find((task) => task.id === createdTaskId);
  if (finalTask?.priority !== 'L' || !['todo', 'backlog'].includes(finalTask?.status)) {
    throw new Error(`分级或恢复状态未持久化：${JSON.stringify(finalTask)}`);
  }

  if (consoleErrors.length) throw new Error(`浏览器控制台错误：${consoleErrors.join(' | ')}`);
  if (failedResponses.length) throw new Error(`失败请求：${failedResponses.join(' | ')}`);

  console.log(JSON.stringify({
    status: 'passed',
    gradesVisible: ['S', 'A', 'B', 'C', 'L'],
    createAtGradeS: true,
    moveToGradeL: true,
    completeAndRestore: true,
    persisted: true,
    screenshot: 'task-todolist-desktop.png',
    consoleErrors: 0,
    failedResponses: 0,
  }, null, 2));
} finally {
  try {
    if (createdTaskId) await authenticatedFetch(`/api/tasks?id=${createdTaskId}`, { method: 'DELETE' });
  } finally {
    await browser.close();
  }
}
