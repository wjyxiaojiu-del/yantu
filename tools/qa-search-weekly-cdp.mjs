const port = Number(process.argv[2] || 9334);
const screenshotPath = process.argv[3] || 'E:\\Project coding\\mentor-management-system\\.runtime\\weekly-review-qa.png';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPage() {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try {
      const pages = await fetch('http://127.0.0.1:' + port + '/json').then((response) => response.json());
      const page = pages.find((entry) => entry.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await sleep(200);
  }
  throw new Error('Edge CDP endpoint did not become ready');
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      }
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }
  close() { this.socket.close(); }
}

async function evaluate(client, expression) {
  let result;
  try {
    result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  } catch (error) {
    console.error('EVAL_FAIL', expression.slice(0, 160), error.message);
    throw error;
  }
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result?.value;
}

async function waitFor(client, predicate, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(client, predicate)) return true;
    await sleep(150);
  }
  return false;
}

const page = await waitForPage();
const client = new CdpClient(page.webSocketDebuggerUrl);
const consoleErrors = [];
await Promise.all([client.send('Runtime.enable'), client.send('Page.enable'), client.send('Network.enable')]);
await client.send('Page.navigate', { url: 'http://127.0.0.1:3002/agile/dashboard' });
const authenticated = await waitFor(client, "document.body?.innerText.includes('小九工作台') || document.body?.innerText.includes('科研总览')");

await evaluate(client, "Boolean(window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })))");
const commandOpen = await waitFor(client, "Boolean(document.body?.innerText.includes('快捷动作') && document.querySelector('input[placeholder*=\"搜索任务\"]'))");

const queryFilled = await evaluate(client, "(() => { const input = document.querySelector('input[placeholder*=\"搜索任务\"]'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '科研'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
const searchSettled = queryFilled && await waitFor(client, "document.body?.innerText.includes('工作区内容') || document.body?.innerText.includes('没有找到相关内容')", 6000);

await evaluate(client, "Boolean(window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true })))");
const ctrlJ = await waitFor(client, "location.pathname === '/agile/standup'");

await client.send('Page.navigate', { url: 'http://127.0.0.1:3002/agile/weekly-review' });
const weeklyLoaded = await waitFor(client, "document.body?.innerText.includes('每周复盘') && document.body?.innerText.includes('事实摘要')", 10000);
const shot = await client.send('Page.captureScreenshot', { format: 'png' });
const fs = await import('node:fs/promises');
await fs.writeFile(screenshotPath, Buffer.from(shot.data, 'base64'));

console.log(JSON.stringify({ authenticated, commandOpen, queryFilled, searchSettled, ctrlJ, weeklyLoaded, screenshotPath, consoleErrors }, null, 2));
client.close();
