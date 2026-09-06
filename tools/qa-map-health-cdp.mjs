const port = Number(process.argv[2] || 9348);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
const page = pages.find((entry) => entry.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('Edge page unavailable');

class CdpClient {
  constructor(url) {
    this.nextId = 1; this.pending = new Map(); this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); });
    this.socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (!message.id) return; const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); });
  }
  async send(method, params = {}) { await this.ready; const id = this.nextId++; const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject })); this.socket.send(JSON.stringify({ id, method, params })); return promise; }
}

const client = new CdpClient(page.webSocketDebuggerUrl);
async function evaluate(expression) { const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'evaluation failed'); return result.result?.value; }
async function waitFor(expression) { const deadline = Date.now() + 12000; while (Date.now() < deadline) { if (await evaluate(expression)) return true; await sleep(150); } return false; }

await client.send('Runtime.enable');
await client.send('Page.enable');
await evaluate("(() => { window.__qaConsoleErrors = []; const old = console.error; console.error = (...args) => { window.__qaConsoleErrors.push(String(args[0] || '')); old(...args); }; return true; })()");
await client.send('Page.navigate', { url: 'http://127.0.0.1:3002/agile/research-map' });
await waitFor("document.body?.innerText.includes('研究地图')");
await evaluate("(async () => { const s = await fetch('/api/auth/local-session', { method: 'POST' }).then(r => r.json()); localStorage.setItem('auth-token', s.token); localStorage.setItem('tenant-id', String(s.tenants[0].id)); location.reload(); return true; })()");
const mapLoaded = await waitFor("document.body?.innerText.includes('研究地图') && document.body?.innerText.includes('研究缺口')");
await evaluate("location.href = '/agile/connection-health'");
const healthLoaded = await waitFor("document.body?.innerText.includes('连接与恢复') && document.body?.innerText.includes('安全快照')");
const errors = await evaluate("window.__qaConsoleErrors || []");
console.log(JSON.stringify({ mapLoaded, healthLoaded, consoleErrors: errors }, null, 2));
client.socket.close();
