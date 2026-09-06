const port = Number(process.argv[2] || 9223);
const targetUrl = process.argv[3] || 'http://127.0.0.1:3002/agile/backlog';
const title = `浏览器验收项-${Date.now()}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPage() {
  const deadline = Date.now() + 12_000;
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
        return;
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  close() { this.socket.close(); }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result?.value;
}

async function waitFor(client, predicate, timeout = 8_000) {
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
const exceptions = [];
const failedRequests = [];
const badResponses = [];

client.on('Runtime.consoleAPICalled', ({ type, args }) => {
  if (type === 'error') consoleErrors.push(args.map((arg) => arg.value || arg.description || '').join(' '));
});
client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
  exceptions.push(exceptionDetails?.exception?.description || exceptionDetails?.text || 'Unknown exception');
});
client.on('Network.loadingFailed', ({ errorText, blockedReason }) => {
  failedRequests.push(blockedReason || errorText || 'Unknown network failure');
});
client.on('Network.responseReceived', ({ response }) => {
  if (response.status >= 400 && !response.url.endsWith('/favicon.ico')) {
    badResponses.push({ status: response.status, url: response.url });
  }
});

await Promise.all([
  client.send('Runtime.enable'),
  client.send('Page.enable'),
  client.send('Network.enable'),
]);
await client.send('Page.navigate', { url: targetUrl });
const loaded = await waitFor(client, `document.body?.innerText.includes('收集箱')`);
if (!loaded) throw new Error('Inbox page did not render');

const emptyButtonDisabled = await evaluate(client, `
  [...document.querySelectorAll('button')].find((button) => button.textContent.includes('收进来'))?.disabled === true
`);

await client.send('Input.dispatchKeyEvent', {
  type: 'keyDown', key: 'n', code: 'KeyN', modifiers: 2, windowsVirtualKeyCode: 78,
});
await client.send('Input.dispatchKeyEvent', {
  type: 'keyUp', key: 'n', code: 'KeyN', modifiers: 2, windowsVirtualKeyCode: 78,
});
await sleep(250);

const shortcut = await evaluate(client, `({
  path: location.pathname,
  placeholder: document.activeElement?.getAttribute('placeholder') || ''
})`);

const captured = await evaluate(client, `(() => {
  const input = [...document.querySelectorAll('input')].find((entry) => entry.placeholder?.includes('记下一个念头'));
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(title)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.includes('收进来'));
  button?.click();
  return true;
})()`);

const itemAppeared = captured && await waitFor(client, `document.body.innerText.includes(${JSON.stringify(title)})`);
const modalOpened = itemAppeared && await evaluate(client, `(() => {
  const article = [...document.querySelectorAll('article')].find((entry) => entry.innerText.includes(${JSON.stringify(title)}));
  const button = [...(article?.querySelectorAll('button') || [])].find((entry) => entry.textContent.trim() === '任务');
  button?.click();
  return Boolean(button);
})()`);
const modalVisible = modalOpened && await waitFor(client, `document.body.innerText.includes('准备安放')`);

if (modalVisible) {
  await evaluate(client, `(() => {
    const modal = [...document.querySelectorAll('.modal-panel')].find((entry) => entry.innerText.includes('准备安放'));
    [...(modal?.querySelectorAll('button') || [])].find((entry) => entry.textContent.trim() === '取消')?.click();
  })()`);
  await sleep(200);
}

const deleteClicked = await evaluate(client, `(() => {
  window.confirm = () => true;
  const article = [...document.querySelectorAll('article')].find((entry) => entry.innerText.includes(${JSON.stringify(title)}));
  const button = article?.querySelector('button[aria-label="删除"]');
  button?.click();
  return Boolean(button);
})()`);
const itemRemoved = deleteClicked && await waitFor(client, `!document.body.innerText.includes(${JSON.stringify(title)})`);

console.log(JSON.stringify({
  loaded,
  emptyButtonDisabled,
  shortcut,
  itemAppeared,
  modalVisible,
  itemRemoved,
  consoleErrors,
  exceptions,
  failedRequests,
  badResponses,
}, null, 2));

client.close();
