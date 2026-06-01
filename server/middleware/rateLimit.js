// Simple in-memory rate limiter

const stores = new Map();

function createStore() {
  return { windows: new Map() };
}

function getStore(name) {
  if (!stores.has(name)) stores.set(name, createStore());
  return stores.get(name);
}

// Cleanup old entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, entry] of store.windows) {
      if (now - entry.resetAt > entry.windowMs * 2) {
        store.windows.delete(key);
      }
    }
  }
}, 60000).unref();

/**
 * @param {Object} options
 * @param {number} options.windowMs - time window in ms
 * @param {number} options.max - max requests in window
 * @param {string} [options.keyFn] - custom key generator, defaults to req.ip
 * @param {string} [options.name] - store name for separate counters
 */
export function rateLimit(options = {}) {
  const { windowMs = 60000, max = 60, name = 'default' } = options;
  const store = getStore(name);

  return (req, res, next) => {
    const key = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = store.windows.get(key);

    if (!entry || now > entry.resetAt + windowMs) {
      entry = { count: 0, resetAt: now + windowMs, windowMs };
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      return res.status(429).json({ error: `请求过于频繁，请 ${retryAfter} 秒后再试` });
    }

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(max - entry.count));
    store.windows.set(key, entry);
    next();
  };
}

// Pre-built limiters
export const authLimiter = rateLimit({ windowMs: 60000, max: 5, name: 'auth' });
export const smsLimiter = rateLimit({ windowMs: 60000, max: 1, name: 'sms' });
export const apiLimiter = rateLimit({ windowMs: 1000, max: 50, name: 'api' });
