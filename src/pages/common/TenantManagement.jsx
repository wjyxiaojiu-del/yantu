import { useState, useEffect } from 'react';
import { Building2, Users, Plus, Link2, Copy, Check, Trash2, Loader2, Crown, Shield, GraduationCap, Eye, X, ChevronRight, HardDrive, UserCheck } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import api from '../../api';

const ROLE_LABELS = {
  owner: { label: '负责人', color: '#f59e0b', icon: Crown },
  admin: { label: '管理员', color: '#6366f1', icon: Shield },
  mentor: { label: '导师', color: '#10b981', icon: UserCheck },
  student: { label: '学生', color: '#3b82f6', icon: GraduationCap },
  viewer: { label: '访客', color: '#94a3b8', icon: Eye },
};

const PLAN_LABELS = { free: '免费版', pro: '课题组版', lab: '实验室版', enterprise: '学院版' };

function UsageBar({ icon: Icon, label, used, max, color, unit = '' }) {
  const pct = Math.min(100, max > 0 ? (used / max) * 100 : 0);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500 flex items-center gap-1.5"><Icon size={14} /> {label}</span>
        <span className="font-medium text-slate-700">{used}{unit} / {max}{unit}</span>
      </div>
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function SimpleModal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function TenantManagement() {
  const { currentTenant, tenants, switchTenant, refreshTenants } = useTenant();
  const { user } = useAuth();
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'create' | 'join' | null
  const [newTenantName, setNewTenantName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    if (!currentTenant?.id) return;
    setLoading(true);
    try {
      setDetail(await api.getTenant(currentTenant.id));
    } catch (e) {
      toast.error('加载课题组信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentTenant?.id]);

  const withProcess = async (fn, successMsg) => {
    setProcessing(true);
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      return true;
    } catch (e) {
      toast.error(e.message || '操作失败');
      return false;
    } finally {
      setProcessing(false);
    }
  };

  const handleCreate = () => withProcess(
    async () => {
      await api.createTenant({ name: newTenantName.trim() });
      setNewTenantName('');
      setModal(null);
      await refreshTenants();
    },
    '课题组创建成功'
  );

  const handleJoin = () => withProcess(
    async () => {
      const res = await api.joinTenant(inviteCode.trim().toUpperCase());
      setInviteCode('');
      setModal(null);
      await refreshTenants();
      if (res.tenant) switchTenant(res.tenant.id);
    },
    '加入成功'
  );

  const handleCreateInvite = () => withProcess(
    () => api.createInvite(currentTenant.id, { max_uses: 10, expires_in_hours: 168 }),
    '邀请码已生成'
  ).then(ok => ok && load());

  const handleDeleteInvite = (id) => withProcess(
    () => api.deleteInvite(currentTenant.id, id),
    '邀请码已删除'
  ).then(ok => ok && load());

  const handleUpdateRole = (memberId, role) => withProcess(
    () => api.updateMemberRole(currentTenant.id, memberId, { role }),
    '角色已更新'
  ).then(ok => ok && load());

  const handleRemoveMember = (memberId) => {
    if (!confirm('确定移除该成员？')) return;
    withProcess(() => api.removeMember(currentTenant.id, memberId), '成员已移除').then(ok => ok && load());
  };

  const handleLeave = () => {
    if (!confirm('确定退出该课题组？')) return;
    withProcess(() => api.leaveTenant(currentTenant.id), '已退出课题组').then(ok => ok && refreshTenants());
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('已复制');
  };

  const canManage = ['owner', 'admin'].includes(currentTenant?.tenant_role);
  const isOwner = currentTenant?.tenant_role === 'owner';

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-6" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Building2 size={24} className="text-orange-500" />
            课题组管理
          </h1>
          <p className="text-sm text-slate-400 mt-1">管理课题组、成员与权限</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('join')} className="btn btn-secondary gap-1.5 text-sm"><Link2 size={14} /> 加入课题组</button>
          <button onClick={() => setModal('create')} className="btn btn-primary gap-1.5 text-sm"><Plus size={14} /> 创建课题组</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Sidebar */}
        <div className="space-y-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .05s both' }}>
          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{currentTenant?.name || '未选择课题组'}</h2>
                <span className="inline-flex items-center gap-1 mt-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {PLAN_LABELS[currentTenant?.plan] || '免费版'}
                </span>
              </div>
              {isOwner && <button className="text-xs text-orange-600 hover:text-orange-700 font-medium">升级套餐</button>}
            </div>

            {detail && (
              <div className="space-y-3">
                <UsageBar icon={Users} label="学生" used={detail.usage?.students || 0} max={detail.tenant?.max_students || 5} color="#3b82f6" />
                <UsageBar icon={UserCheck} label="导师" used={detail.usage?.mentors || 0} max={detail.tenant?.max_mentors || 1} color="#10b981" />
                <UsageBar icon={HardDrive} label="存储" used={detail.usage?.storage_mb || 0} max={detail.tenant?.max_storage_mb || 100} color="#f59e0b" unit=" MB" />
              </div>
            )}

            {!isOwner && (
              <button onClick={handleLeave} className="w-full mt-4 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 py-2 rounded-lg transition-colors">
                退出课题组
              </button>
            )}
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">我的课题组</h3>
            <div className="space-y-1">
              {tenants.map(t => (
                <button key={t.id} onClick={() => switchTenant(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                    String(t.id) === String(currentTenant?.id) ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50'
                  }`}>
                  <Building2 size={16} className={String(t.id) === String(currentTenant?.id) ? 'text-orange-500' : 'text-slate-400'} />
                  <span className="text-sm font-medium flex-1 truncate">{t.name}</span>
                  <ChevronRight size={14} className="text-slate-300" />
                </button>
              ))}
              {tenants.length === 0 && <div className="text-center py-4 text-xs text-slate-400">暂无课题组</div>}
            </div>
          </div>
        </div>

        {/* Center */}
        <div className="lg:col-span-2 space-y-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .1s both' }}>
          {/* Members */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-700">成员列表 ({detail?.tenant?.members?.length || 0})</h3>
              {canManage && (
                <button onClick={handleCreateInvite} disabled={processing} className="btn btn-secondary text-xs gap-1.5">
                  <Link2 size={12} /> 生成邀请码
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}</div>
            ) : (
              <div className="space-y-1">
                {detail?.tenant?.members?.map(member => {
                  const { label, color, icon: RoleIcon } = ROLE_LABELS[member.role] || ROLE_LABELS.student;
                  return (
                    <div key={member.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                        {member.avatar ? <img src={member.avatar} className="w-8 h-8 rounded-full" alt="" /> : member.name?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700">{member.name}</div>
                        <div className="text-xs text-slate-400">{member.email || member.phone}</div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ background: `${color}12`, color }}>
                        <RoleIcon size={10} /> {label}
                      </span>
                      {canManage && member.id !== user?.id && member.role !== 'owner' && (
                        <div className="flex items-center gap-1">
                          <select value={member.role} onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                            className="text-xs border-0 bg-transparent text-slate-500 hover:text-slate-700 cursor-pointer">
                            <option value="mentor">导师</option>
                            <option value="student">学生</option>
                            <option value="viewer">访客</option>
                          </select>
                          <button onClick={() => handleRemoveMember(member.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!detail?.tenant?.members?.length) && <div className="text-center py-8 text-sm text-slate-400">暂无成员</div>}
              </div>
            )}
          </div>

          {/* Invites */}
          {canManage && detail?.tenant?.invites?.length > 0 && (
            <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .15s both' }}>
              <h3 className="text-sm font-bold text-slate-700 mb-4">邀请码</h3>
              <div className="space-y-2">
                {detail.tenant.invites.map(invite => (
                  <div key={invite.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <code className="text-sm font-mono font-bold text-slate-700 tracking-wider">{invite.code}</code>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white text-slate-500 border border-slate-100">{ROLE_LABELS[invite.role]?.label || invite.role}</span>
                    <span className="text-xs text-slate-400">{invite.used_count}/{invite.max_uses} 已用</span>
                    <span className="text-xs text-slate-400">{new Date(invite.expires_at).toLocaleDateString()} 过期</span>
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => handleCopy(invite.code, invite.id)} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-slate-600 transition-colors">
                        {copiedId === invite.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                      <button onClick={() => handleDeleteInvite(invite.id)} className="p-1.5 rounded-lg hover:bg-white text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <SimpleModal open={modal === 'create'} onClose={() => setModal(null)} title="创建课题组">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">课题组名称</label>
            <input className="input" value={newTenantName} onChange={e => setNewTenantName(e.target.value)} placeholder="例如：张三课题组" />
          </div>
          <button onClick={handleCreate} disabled={!newTenantName.trim() || processing} className="btn btn-primary w-full">
            {processing ? <Loader2 size={16} className="animate-spin" /> : '创建'}
          </button>
        </div>
      </SimpleModal>

      <SimpleModal open={modal === 'join'} onClose={() => setModal(null)} title="加入课题组">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">邀请码</label>
            <input className="input uppercase" value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="输入8位邀请码" maxLength={8} />
          </div>
          <button onClick={handleJoin} disabled={!inviteCode.trim() || processing} className="btn btn-primary w-full">
            {processing ? <Loader2 size={16} className="animate-spin" /> : '加入'}
          </button>
        </div>
      </SimpleModal>
    </div>
  );
}
