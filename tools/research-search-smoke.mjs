import { chromium } from 'playwright-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = process.env.WORKBENCH_URL || 'http://127.0.0.1:3002';
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
const failedResponses = [];
const uniqueTitle = `全局搜索验收-${Date.now()}`;
let createdInboxId = null;

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
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '今日推进' }).waitFor();

  await page.keyboard.press('Alt+N');
  await page.waitForURL('**/agile/backlog');
  await page.getByPlaceholder('记下一个念头、任务、链接或提醒……').fill(uniqueTitle);
  await page.getByRole('button', { name: '收进来', exact: true }).click();
  await page.getByText(uniqueTitle, { exact: true }).waitFor();

  const projectId = await page.evaluate(() => {
    const tenantId = localStorage.getItem('tenant-id');
    return localStorage.getItem(`project-id:${tenantId}`);
  });
  const inbox = await authenticatedFetch(`/api/inbox-items?project_id=${projectId}`);
  createdInboxId = inbox.data.find((item) => item.title === uniqueTitle)?.id || null;
  if (!createdInboxId) throw new Error('收集成功后没有从 API 找到验收记录');

  await page.keyboard.press('Alt+K');
  const globalSearch = page.getByPlaceholder('搜索任务、文献、复盘、风险或日程……');
  await globalSearch.fill(uniqueTitle);
  await page.locator('button').filter({ hasText: uniqueTitle }).first().waitFor({ timeout: 10_000 });

  if (consoleErrors.length) throw new Error(`浏览器控制台错误：${consoleErrors.join(' | ')}`);
  if (failedResponses.length) throw new Error(`失败请求：${failedResponses.join(' | ')}`);

  console.log(JSON.stringify({
    status: 'passed',
    quickCaptureShortcut: true,
    localGlobalSearch: true,
    externalSearchRequired: false,
    consoleErrors: 0,
    failedResponses: 0,
  }, null, 2));
} finally {
  try {
    if (createdInboxId) await authenticatedFetch(`/api/inbox-items?id=${createdInboxId}`, { method: 'DELETE' });
  } finally {
    await browser.close();
  }
}
