import { randomBytes } from 'crypto';
import { queryAll, queryOne, run } from '../db.js';
import { requireAuth, requireTenant, requireRole, isManager, ROLES } from '../middleware/tenant.js';

const wrap = (fn) => (req, res) => {
  try { fn(req, res); } catch (e) { res.status(500).json({ error: e.message }); }
};

function generateInviteCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

export function getTenantRoutes(app) {
  // GET /api/tenants/my - 获取我加入的所有课题组
  app.get('/api/tenants/my', requireAuth, wrap((req, res) => {
    const memberships = queryAll(`
      SELECT t.*, tm.role as my_role
      FROM tenants t
      JOIN tenant_members tm ON t.id = tm.tenant_id
      WHERE tm.user_id = ?
      ORDER BY t.created_at DESC
    `, [req.user.id]);
    res.json({ tenants: memberships });
  }));

  // POST /api/tenants - 创建课题组
  app.post('/api/tenants', requireAuth, wrap((req, res) => {
    const { name, description } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: '课题组名称至少2个字' });
    }
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
    const tenantResult = run(
      'INSERT INTO tenants (name, slug, description, owner_id, plan, max_mentors, max_students) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), slug, description || null, req.user.id, 'free', 1, 5]
    );
    const tenantId = tenantResult.lastInsertRowid;
    run('INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)', [tenantId, req.user.id, ROLES.OWNER]);

    const tenant = queryOne('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    res.json({ success: true, tenant });
  }));

  // GET /api/tenants/:id - 获取课题组详情（需要成员权限）
  app.get('/api/tenants/:id', requireAuth, requireTenant, wrap((req, res) => {
    const tenant = queryOne('SELECT * FROM tenants WHERE id = ?', [req.tenantId]);
    const members = queryAll(`
      SELECT u.id, u.name, u.email, u.avatar, u.phone, tm.role, tm.joined_at
      FROM tenant_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.tenant_id = ?
      ORDER BY CASE tm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'mentor' THEN 3 ELSE 4 END, u.name
    `, [req.tenantId]);
    const usage = {
      students: queryOne('SELECT COUNT(*) as c FROM students WHERE tenant_id = ?', [req.tenantId]).c,
      mentors: queryOne(`SELECT COUNT(*) as c FROM tenant_members WHERE tenant_id = ? AND role IN ('owner','admin','mentor')`, [req.tenantId]).c,
      storage_mb: tenant.used_storage_mb || 0,
    };
    res.json({ tenant: { ...tenant, members, usage } });
  }));

  // PUT /api/tenants/:id - 更新课题组信息
  app.put('/api/tenants/:id', requireAuth, requireTenant, requireRole(ROLES.OWNER, ROLES.ADMIN), wrap((req, res) => {
    const { name, description, max_mentors, max_students } = req.body;
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (max_mentors !== undefined) { updates.push('max_mentors = ?'); params.push(max_mentors); }
    if (max_students !== undefined) { updates.push('max_students = ?'); params.push(max_students); }
    if (!updates.length) return res.status(400).json({ error: '没有要更新的字段' });
    params.push(req.tenantId);
    run(`UPDATE tenants SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
    const tenant = queryOne('SELECT * FROM tenants WHERE id = ?', [req.tenantId]);
    res.json({ success: true, tenant });
  }));

  // POST /api/tenants/:id/invites - 创建邀请链接
  app.post('/api/tenants/:id/invites', requireAuth, requireTenant, requireRole(ROLES.OWNER, ROLES.ADMIN, ROLES.MENTOR), wrap((req, res) => {
    const { role = ROLES.STUDENT, max_uses = 1, expires_in_hours = 168 } = req.body;
    const allowedRoles = [ROLES.STUDENT, ROLES.VIEWER];
    if (isManager(req.tenantRole)) allowedRoles.push(ROLES.MENTOR, ROLES.ADMIN);
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: '无权邀请该角色' });
    }
    const code = generateInviteCode();
    const expiresAt = new Date(Date.now() + expires_in_hours * 3600000).toISOString();
    run('INSERT INTO tenant_invites (tenant_id, code, role, max_uses, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [req.tenantId, code, role, max_uses, expiresAt, req.user.id]);
    res.json({ success: true, invite: { code, role, max_uses, expires_at: expiresAt } });
  }));

  // GET /api/tenants/:id/invites - 获取邀请列表
  app.get('/api/tenants/:id/invites', requireAuth, requireTenant, requireRole(ROLES.OWNER, ROLES.ADMIN, ROLES.MENTOR), wrap((req, res) => {
    const invites = queryAll(`
      SELECT ti.*, u.name as created_by_name
      FROM tenant_invites ti
      LEFT JOIN users u ON ti.created_by = u.id
      WHERE ti.tenant_id = ?
      ORDER BY ti.created_at DESC
    `, [req.tenantId]);
    res.json({ invites });
  }));

  // POST /api/tenants/join - 通过邀请码加入
  app.post('/api/tenants/join', requireAuth, wrap((req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: '邀请码不能为空' });

    const invite = queryOne(`
      SELECT * FROM tenant_invites
      WHERE code = ? AND (expires_at > datetime('now') OR expires_at IS NULL)
    `, [code.trim().toUpperCase()]);
    if (!invite) return res.status(400).json({ error: '邀请码无效或已过期' });
    if (invite.used_count >= invite.max_uses) return res.status(400).json({ error: '邀请码已达使用上限' });

    // Check if already member
    const existing = queryOne('SELECT id FROM tenant_members WHERE tenant_id = ? AND user_id = ?', [invite.tenant_id, req.user.id]);
    if (existing) return res.status(409).json({ error: '您已是该课题组成员' });

    // Check limits
    const tenant = queryOne('SELECT * FROM tenants WHERE id = ?', [invite.tenant_id]);
    if (invite.role === ROLES.STUDENT) {
      const count = queryOne('SELECT COUNT(*) as c FROM tenant_members WHERE tenant_id = ? AND role = ?', [invite.tenant_id, ROLES.STUDENT]).c;
      if (count >= tenant.max_students) return res.status(403).json({ error: '课题组学生人数已满' });
    } else {
      const count = queryOne(`SELECT COUNT(*) as c FROM tenant_members WHERE tenant_id = ? AND role IN ('owner','admin','mentor')`, [invite.tenant_id]).c;
      if (count >= tenant.max_mentors) return res.status(403).json({ error: '课题组导师人数已满' });
    }

    run('INSERT INTO tenant_members (tenant_id, user_id, role) VALUES (?, ?, ?)', [invite.tenant_id, req.user.id, invite.role]);
    run('UPDATE tenant_invites SET used_count = used_count + 1 WHERE id = ?', [invite.id]);

    const newTenant = queryOne('SELECT * FROM tenants WHERE id = ?', [invite.tenant_id]);
    res.json({ success: true, tenant: newTenant, role: invite.role });
  }));

  // PUT /api/tenants/:id/members/:userId - 修改成员角色
  app.put('/api/tenants/:id/members/:userId', requireAuth, requireTenant, requireRole(ROLES.OWNER, ROLES.ADMIN), wrap((req, res) => {
    const targetUserId = Number(req.params.userId);
    const { role } = req.body;
    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({ error: '无效的角色' });
    }
    // Cannot modify owner
    const target = queryOne('SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?', [req.tenantId, targetUserId]);
    if (!target) return res.status(404).json({ error: '成员不存在' });
    if (target.role === ROLES.OWNER) return res.status(403).json({ error: '不能修改负责人的角色' });

    // Admin cannot promote to owner or admin
    if (req.tenantRole === ROLES.ADMIN && (role === ROLES.OWNER || role === ROLES.ADMIN)) {
      return res.status(403).json({ error: '权限不足' });
    }

    run('UPDATE tenant_members SET role = ? WHERE tenant_id = ? AND user_id = ?', [role, req.tenantId, targetUserId]);
    res.json({ success: true });
  }));

  // DELETE /api/tenants/:id/members/:userId - 移除成员
  app.delete('/api/tenants/:id/members/:userId', requireAuth, requireTenant, requireRole(ROLES.OWNER, ROLES.ADMIN), wrap((req, res) => {
    const targetUserId = Number(req.params.userId);
    if (targetUserId === req.user.id) return res.status(400).json({ error: '不能移除自己' });
    const target = queryOne('SELECT role FROM tenant_members WHERE tenant_id = ? AND user_id = ?', [req.tenantId, targetUserId]);
    if (!target) return res.status(404).json({ error: '成员不存在' });
    if (target.role === ROLES.OWNER) return res.status(403).json({ error: '不能移除负责人' });
    if (req.tenantRole === ROLES.ADMIN && target.role === ROLES.ADMIN) {
      return res.status(403).json({ error: '不能移除其他管理员' });
    }
    run('DELETE FROM tenant_members WHERE tenant_id = ? AND user_id = ?', [req.tenantId, targetUserId]);
    res.json({ success: true });
  }));

  // DELETE /api/tenants/:id/invites/:inviteId - 删除邀请码
  app.delete('/api/tenants/:id/invites/:inviteId', requireAuth, requireTenant, requireRole(ROLES.OWNER, ROLES.ADMIN, ROLES.MENTOR), wrap((req, res) => {
    const invite = queryOne('SELECT * FROM tenant_invites WHERE id = ? AND tenant_id = ?', [req.params.inviteId, req.tenantId]);
    if (!invite) return res.status(404).json({ error: '邀请码不存在' });
    run('DELETE FROM tenant_invites WHERE id = ?', [req.params.inviteId]);
    res.json({ success: true });
  }));

  // POST /api/tenants/:id/leave - 主动退出课题组（非owner）
  app.post('/api/tenants/:id/leave', requireAuth, requireTenant, wrap((req, res) => {
    if (req.tenantRole === ROLES.OWNER) {
      return res.status(400).json({ error: '负责人不能退出课题组，请转让或删除课题组' });
    }
    run('DELETE FROM tenant_members WHERE tenant_id = ? AND user_id = ?', [req.tenantId, req.user.id]);
    res.json({ success: true });
  }));
}
