import { randomBytes, pbkdf2Sync, randomUUID } from 'crypto';
import { queryAll, queryOne, run } from '../db.js';
import { validateBody, Patterns } from '../middleware/validate.js';

const TOKEN_TTL_DAYS = 7;
const SMS_COOLDOWN_SECONDS = 60;
const SMS_EXPIRE_MINUTES = 5;

// ============ Crypto helpers ============

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return derived === hash;
}

function generateToken() {
  return randomUUID().replace(/-/g, '') + randomBytes(16).toString('hex');
}

function getExpiryDate(days = TOKEN_TTL_DAYS) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function getSmsExpiryDate(minutes = SMS_EXPIRE_MINUTES) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

// ============ SMS Code ============

function generateSmsCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function canSendSms(phone) {
  const latest = queryOne(
    "SELECT created_at FROM sms_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 1",
    [phone]
  );
  if (!latest) return true;
  const diff = Date.now() - new Date(latest.created_at).getTime();
  return diff > SMS_COOLDOWN_SECONDS * 1000;
}

function verifySmsCode(phone, code, purpose) {
  const row = queryOne(
    `SELECT * FROM sms_codes WHERE phone = ? AND code = ? AND purpose = ? AND used = 0
     AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1`,
    [phone, code, purpose]
  );
  if (row) {
    run('UPDATE sms_codes SET used = 1 WHERE id = ?', [row.id]);
  }
  return !!row;
}

// ============ Token ============

function createToken(userId) {
  const token = generateToken();
  const expiresAt = getExpiryDate();
  run('INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [userId, token, expiresAt]);
  return token;
}

function getUserByToken(token) {
  if (!token) return null;
  const row = queryOne(
    `SELECT u.* FROM users u
     JOIN auth_tokens t ON u.id = t.user_id
     WHERE t.token = ? AND t.expires_at > datetime('now')
     LIMIT 1`,
    [token]
  );
  return row || null;
}

// ============ Routes ============

export function getAuthRoutes(app) {
  // POST /api/auth/send-sms
  app.post('/api/auth/send-sms', (req, res) => {
    try {
      const { phone, purpose = 'register' } = req.body;
      if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return res.status(400).json({ error: '请输入有效的手机号' });
      }
      if (!canSendSms(phone)) {
        return res.status(429).json({ error: '发送过于频繁，请稍后再试' });
      }
      const code = generateSmsCode();
      run('INSERT INTO sms_codes (phone, code, purpose, expires_at) VALUES (?, ?, ?, ?)',
        [phone, code, purpose, getSmsExpiryDate()]);
      console.log(`[SMS] 手机号: ${phone}, 验证码: ${code}, 用途: ${purpose}`);
      res.json({ success: true, message: '验证码已发送', code });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/auth/register
  app.post('/api/auth/register',
    validateBody({
      phone: { required: true, pattern: Patterns.phone, message: '请输入有效的手机号' },
      code: { required: true, minLength: 6, maxLength: 6 },
      password: { required: true, minLength: 6 },
      name: { required: true, minLength: 1, maxLength: 50 },
      role: { required: true, enum: ['mentor', 'student'] },
      email: { pattern: Patterns.email, message: '邮箱格式不正确' },
    }),
    (req, res) => {
    try {
      const { phone, code, password, name, role = 'student', email, student_id, department, title } = req.body;
      if (!phone || !code || !password || !name) {
        return res.status(400).json({ error: '请填写完整信息' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: '密码至少 6 位' });
      }
      if (!verifySmsCode(phone, code, 'register')) {
        return res.status(400).json({ error: '验证码错误或已过期' });
      }
      const existing = queryOne('SELECT id FROM users WHERE phone = ?', [phone]);
      if (existing) {
        return res.status(409).json({ error: '该手机号已注册' });
      }
      const passwordHash = hashPassword(password);
      const result = run(
        'INSERT INTO users (phone, email, password_hash, name, role, student_id, department, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [phone, email || null, passwordHash, name, role, student_id || null, department || null, title || null]
      );
      const token = createToken(result.lastInsertRowid);
      const user = queryOne('SELECT id, phone, email, name, role, avatar, student_id, department, title FROM users WHERE id = ?', [result.lastInsertRowid]);
      res.json({ success: true, token, user });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login',
    validateBody({
      phone: { required: true, pattern: Patterns.phone, message: '请输入有效的手机号' },
      password: { required: true, minLength: 1 },
    }),
    (req, res) => {
    try {
      const { phone, password } = req.body;
      if (!phone || !password) {
        return res.status(400).json({ error: '请输入手机号和密码' });
      }
      const user = queryOne('SELECT * FROM users WHERE phone = ?', [phone]);
      if (!user) {
        return res.status(401).json({ error: '手机号或密码错误' });
      }
      if (!verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: '手机号或密码错误' });
      }
      const token = createToken(user.id);
      const safeUser = { id: user.id, phone: user.phone, email: user.email, name: user.name, role: user.role, avatar: user.avatar, student_id: user.student_id, department: user.department, title: user.title };
      res.json({ success: true, token, user: safeUser });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/auth/login-sms
  app.post('/api/auth/login-sms',
    validateBody({
      phone: { required: true, pattern: Patterns.phone, message: '请输入有效的手机号' },
      code: { required: true, minLength: 6, maxLength: 6 },
    }),
    (req, res) => {
    try {
      const { phone, code } = req.body;
      if (!phone || !code) {
        return res.status(400).json({ error: '请输入手机号和验证码' });
      }
      if (!verifySmsCode(phone, code, 'login')) {
        return res.status(400).json({ error: '验证码错误或已过期' });
      }
      let user = queryOne('SELECT * FROM users WHERE phone = ?', [phone]);
      if (!user) {
        // Auto-register for SMS login if user doesn't exist
        const passwordHash = hashPassword(phone.slice(-6));
        const result = run('INSERT INTO users (phone, password_hash, name, role) VALUES (?, ?, ?, ?)',
          [phone, passwordHash, `用户${phone.slice(-4)}`, 'student']);
        user = queryOne('SELECT * FROM users WHERE id = ?', [result.lastInsertRowid]);
      }
      const token = createToken(user.id);
      const safeUser = { id: user.id, phone: user.phone, email: user.email, name: user.name, role: user.role, avatar: user.avatar, student_id: user.student_id, department: user.department, title: user.title };
      res.json({ success: true, token, user: safeUser });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/auth/me
  app.get('/api/auth/me', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const user = getUserByToken(token);
      if (!user) {
        return res.status(401).json({ error: '未登录或登录已过期' });
      }
      const safeUser = { id: user.id, phone: user.phone, email: user.email, name: user.name, role: user.role, avatar: user.avatar, student_id: user.student_id, department: user.department, title: user.title };
      res.json({ user: safeUser });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token) {
        run('DELETE FROM auth_tokens WHERE token = ?', [token]);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

// Middleware for protected routes
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  req.user = user;
  next();
}
