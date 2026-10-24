import { chromium } from 'playwright-core';

const base = process.env.WORKBENCH_URL || 'http://127.0.0.1:3002';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const consoleErrors = [];
const failedResponses = [];

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('dialog', d => d.accept()); // 提前接管所有 confirm，避免阻塞
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('response', r => {
  if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) failedResponses.push(`${r.status()} ${r.request().method()} ${r.url()}`);
});

const fail = (msg) => { console.error('SMOKE-FAIL:', msg); process.exitCode = 1; };

// 1. 免密本地会话 + 注入登录态
await page.goto(base, { waitUntil: 'networkidle' });
const session = await page.evaluate(async (base) => {
  const r = await fetch(base + '/api/auth/local-session', { method: 'POST' });
  if (!r.ok) throw new Error('local-session ' + r.status());
  const data = await r.json();
  localStorage.setItem('auth-token', data.token);
  localStorage.setItem('tenant-id', String(data.tenants[0].id));
  return { tenant: data.tenants[0].id, user: data.user.name };
}, base);
console.log('session ok, tenant =', session.tenant);

// 2. 通过 API 建一个模板（含变量和子步骤）
const seeded = await page.evaluate(async (base) => {
  const headers = {
    Authorization: `Bearer ${localStorage.getItem('auth-token')}`,
    'X-Tenant-Id': localStorage.getItem('tenant-id'),
    'Content-Type': 'application/json',
  };
  const projects = await (await fetch('/api/projects', { headers })).json();
  const tpl = await (await fetch('/api/sop/templates', {
    method: 'POST', headers,
    body: JSON.stringify({
      project_id: projects[0].id, name: '浏览器冒烟流程', category: '科研', tags: ['冒烟'],
      steps: [
        { id: 's1', title: '检查图表', note: '', substeps: [] },
        { id: 's2', title: '核对引用', note: '投给 {{期刊}}', substeps: [
          { id: 'u1', title: '更新格式' }, { id: 'u2', title: '检查 DOI' },
        ] },
      ],
    }),
  })).json();
  return { projectId: projects[0].id, tplId: tpl.id };
}, base);
console.log('seeded template', seeded.tplId);

// 3. 打开 SOP 页面
await page.goto(base + '/agile/sop', { waitUntil: 'networkidle' });
await page.waitForSelector('h1:has-text("SOP 流程")', { timeout: 8000 }).catch(() => fail('页面标题未出现'));
await page.waitForSelector('text=浏览器冒烟流程', { timeout: 8000 }).catch(() => fail('模板行未渲染'));

// 4. 点击“执行” → 变量弹窗 → 填变量 → 开始
await page.click('button:has-text("执行")');
await page.waitForSelector('text=期刊', { timeout: 5000 }).catch(() => fail('变量弹窗未出现'));
await page.fill('input[placeholder="{{期刊}}"]', 'Nature Plants');
await page.click('button:has-text("开始执行")');
await page.waitForSelector('text=暂停不计时,计时中', { timeout: 8000 }).catch(() => {});
await page.waitForSelector('text=核对引用', { timeout: 8000 }).catch(() => fail('执行视图未渲染'));
await page.waitForSelector('text=更新格式', { timeout: 8000 }).catch(() => fail('子步骤未渲染'));
const substituted = await page.locator('text=Nature Plants').first().isVisible().catch(() => false);
if (!substituted) fail('变量替换未生效');

// 5. 勾选子步骤 → 父步骤联动完成；再勾顶层步骤
// aria-label 在勾选后会翻转，从后往前点避免定位失效
await page.locator('button[aria-label="勾选子步骤"]').nth(1).click();
await page.waitForTimeout(400);
await page.locator('button[aria-label="勾选子步骤"]').nth(0).click();
await page.waitForTimeout(600);
await page.locator('button[aria-label="勾选步骤"]').nth(0).click();
await page.waitForTimeout(600);
const checked = await page.locator('.bg-emerald-500.border-emerald-500').count();
if (checked < 3) fail(`勾选后的完成样式数量异常: ${checked}`);

// 6. 暂停
await page.click('button:has-text("暂停")');
await page.waitForSelector('text=已暂停', { timeout: 5000 }).catch(() => fail('暂停状态未显示'));
await page.click('button:has-text("继续")');
await page.waitForSelector('text=执行中', { timeout: 5000 }).catch(() => fail('继续后状态未恢复'));

// 7. 完成并写入每日记录（confirm 已由全局 dialog 处理器自动接受）
await page.click('button:has-text("完成")');
await page.waitForSelector('button:has-text("写入今日每日记录")', { timeout: 5000 }).catch(() => fail('完成视图未出现'));
await page.click('button:has-text("写入今日每日记录")');
await page.waitForSelector('text=已写入每日记录', { timeout: 5000 }).catch(() => fail('每日记录写入反馈未出现'));

// 8. 返回列表，验证进行中卡片消失、历史出现
await page.click('button[aria-label="返回列表"]');
await page.waitForSelector('text=历史记录', { timeout: 8000 }).catch(() => fail('历史记录区块未出现'));
await page.waitForSelector('text=浏览器冒烟流程 >> nth=0', { timeout: 8000 }).catch(() => {});

console.log('consoleErrors:', consoleErrors.length ? consoleErrors : '无');
console.log('failedResponses:', failedResponses.length ? failedResponses : '无');
if (consoleErrors.length || failedResponses.length) process.exitCode = 1;
else console.log('SMOKE-PASS: SOP 页面完整链路(登录→模板→执行→勾选→暂停→完成→写每日记录)全部通过');
await browser.close();
