const port = Number(process.argv[2] || 9348);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPage() {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
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
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result?.value;
}

async function waitFor(client, expression) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return true;
    await sleep(150);
  }
  return false;
}

const page = await waitForPage();
const client = new CdpClient(page.webSocketDebuggerUrl);
const consoleErrors = [];
await client.send('Runtime.enable');
await client.send('Page.enable');
await client.send('Runtime.addBinding', { name: '__qaConsole' }).catch(() => {});
await evaluate(client, "(() => { const old = console.error; console.error = (...args) => { window.__qaConsoleErrors = (window.__qaConsoleErrors || []).concat(String(args[0] || '')); old(...args); }; return true; })()");
await client.send('Page.navigate', { url: 'http://127.0.0.1:3002/calendar' });
await waitFor(client, "document.body?.innerText.includes('日程日历')");
await evaluate(client, "(async () => { const s = await fetch('/api/auth/local-session', { method: 'POST' }).then(r => r.json()); localStorage.setItem('auth-token', s.token); localStorage.setItem('tenant-id', String(s.tenants[0].id)); location.reload(); return true; })()");
const loaded = await waitFor(client, "document.body?.innerText.includes('日程日历') && document.body?.innerText.includes('显示设置')");
const opened = await evaluate(client, "(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('显示设置')); if (!button) return false; button.click(); return true; })()");
const menuVisible = await waitFor(client, "document.body?.innerText.includes('节日与重要日') && document.body?.innerText.includes('农历')");
const toggled = await evaluate(client, "(() => { const input = document.querySelector('.calendar-display-menu input'); if (!input) return false; input.click(); return true; })()");
await sleep(250);
const persistedOff = await evaluate(client, "JSON.parse(localStorage.getItem('calendar-display-preferences') || '{}').showLunar === false");
await evaluate(client, "location.reload()");
const persistedAfterReload = await waitFor(client, "document.body?.innerText.includes('日程日历')");
const reopened = await evaluate(client, "(() => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('显示设置')); if (!button) return false; button.click(); return true; })()");
const checkboxOffAfterReload = await waitFor(client, "document.querySelector('.calendar-display-menu input')?.checked === false");
const reset = await evaluate(client, "(() => { localStorage.setItem('calendar-display-preferences', JSON.stringify({ showLunar: true, showHolidays: true })); return true; })()");
console.log(JSON.stringify({ loaded, opened, menuVisible, toggled, persistedOff, persistedAfterReload, reopened, checkboxOffAfterReload, reset, consoleErrors }, null, 2));
client.socket.close();
