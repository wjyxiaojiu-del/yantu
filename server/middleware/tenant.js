import { queryAll, queryOne } from '../db.js';

// Auth helper (shared with auth.js pattern)
export function getUserByToken(token) {
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

// ============ Auth Middleware ============

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

// ============ Tenant Middleware ============

export function requireTenant(req, res, next) {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
  if (!tenantId) {
    return res.status(400).json({ error: '需要选择课题组' });
  }

  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) {
    return res.status(400).json({ error: '课题组ID无效' });
  }

  // Verify user belongs to this tenant
  const member = queryOne(
    'SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?',
    [tid, req.user.id]
  );
  if (!member) {
    return res.status(403).json({ error: '您不是该课题组成员' });
  }

  // Load tenant info
  const tenant = queryOne('SELECT * FROM tenants WHERE id = ?', [tid]);
  if (!tenant) {
    return res.status(404).json({ error: '课题组不存在' });
  }

  req.tenantId = tid;
  req.tenantRole = member.role;
  req.tenant = tenant;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.tenantRole)) {
      return res.status(403).json({ error: '权限不足，需要 ' + roles.join('/') + ' 权限' });
    }
    next();
  };
}

// Map legacy single roles to tenant-aware
// owner = full access, admin = manage members + data, mentor = own students, student = self only
export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MENTOR: 'mentor',
  STUDENT: 'student',
  VIEWER: 'viewer',
};

// Helper to check if role can access all data in tenant
export function isManager(role) {
  return role === ROLES.OWNER || role === ROLES.ADMIN;
}

// ============ Subscription Middleware ============

export function checkSubscription(req, res, next) {
  const tenant = req.tenant;
  if (!tenant) {
    return res.status(500).json({ error: '租户信息未加载' });
  }

  // Check expiry
  if (tenant.expires_at && new Date(tenant.expires_at) < new Date()) {
    // Allow read-only after expiry, block writes
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(403).json({ error: '订阅已到期，请联系课题组负责人续费' });
    }
  }

  next();
}

// Check resource limits before create operations
export function checkLimit(resource) {
  return (req, res, next) => {
    const tenant = req.tenant;
    const tid = req.tenantId;

    if (resource === 'students') {
      const count = queryOne('SELECT COUNT(*) as c FROM students WHERE tenant_id = ?', [tid]).c;
      if (count >= tenant.max_students) {
        return res.status(403).json({ error: `已达学生上限 (${tenant.max_students})，请升级套餐` });
      }
    }
    if (resource === 'mentors') {
      const count = queryOne(
        `SELECT COUNT(*) as c FROM tenant_members WHERE tenant_id = ? AND role IN ('owner','admin','mentor')`,
        [tid]
      ).c;
      if (count >= tenant.max_mentors) {
        return res.status(403).json({ error: `已达导师上限 (${tenant.max_mentors})，请升级套餐` });
      }
    }
    if (resource === 'storage') {
      // Simplified: check on upload endpoint directly
    }

    next();
  };
}

// Shared helper: extract tenant_id from request headers/query
export function getTenantId(req) {
  return Number(req.headers['x-tenant-id'] || req.query.tenant_id || 1);
}

export function toSafeUser(user) {
  const { id, phone, email, name, role, avatar, student_id, department, title } = user;
  return { id, phone, email, name, role, avatar, student_id, department, title };
}


