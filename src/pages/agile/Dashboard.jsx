import { useState, useEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Target, CheckCircle2, ListTodo, Flame, Calendar, AlertTriangle, TrendingUp, Clock, Zap, ThumbsUp, Plus, Trash2, Loader2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import { SkeletonCard } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import api from '../../api';
import Modal from '../../components/Modal';

export default function Dashboard() {
  const { projectId } = useProject();
  const { theme } = useTheme();
  const toast = useToast();
  const c = theme.colors;
  const [stats, setStats] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [risks, setRisks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [burndownData, setBurndownData] = useState([]);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [celebrating, setCelebrating] = useState(null);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, s, r, storiesData] = await Promise.all([
        api.getProjectStats(projectId),
        api.getSprints({ project_id: projectId }),
        api.getRisks({ project_id: projectId }),
        api.getStories({ project_id: projectId }),
      ]);
      setStats(d);
      setMilestones(d.milestones || []);
      setSprints(s);
      setRisks(r);
      setStories(storiesData || []);

      const activeSprint = d.activeSprint;
      if (activeSprint) {
        const sprintStats = await api.getSprintStats(activeSprint.id);
        const total = sprintStats.totalPoints || 0;
        const done = sprintStats.donePoints || 0;
        const remaining = total - done;
        const start = new Date(activeSprint.start_date);
        const end = new Date(activeSprint.end_date);
        const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        const today = new Date();
        const elapsedDays = Math.min(totalDays, Math.max(0, Math.ceil((today - start) / (1000 * 60 * 60 * 24))));
        const data = [];
        for (let i = 0; i <= totalDays; i++) {
          const ideal = Math.round(total - (total / totalDays) * i);
          const progress = i <= elapsedDays ? Math.round(remaining + (total - remaining) * (1 - i / Math.max(1, elapsedDays))) : null;
          data.push({
            day: `D${i + 1}`,
            label: i + 1,
            ideal,
            actual: i <= elapsedDays ? Math.max(0, Math.min(total, progress)) : null,
          });
        }
        setBurndownData(data);
      }
    } catch (e) {
      setError(e.message);
      toast.error('加载控制台数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const handleToggleMilestone = async (m) => {
    if (m.status === 'completed') return;
    try {
      const newStatus = 'completed';
      await fetch(`/api/milestones?id=${m.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setMilestones(prev => prev.map(ms => ms.id === m.id ? { ...ms, status: newStatus } : ms));
      setCelebrating(m.id);
      setTimeout(() => setCelebrating(null), 2000);
      toast.success(`🎉 「${m.name.replace(/M\d+：/, '')}」已达成！`);
    } catch (e) {
      toast.error('更新失败：' + e.message);
    }
  };

  const handleCreateMilestone = async (data) => {
    try {
      await api.createMilestone({ ...data, project_id: projectId });
      setShowMilestoneModal(false);
      toast.success('里程碑创建成功');
      load();
    } catch (e) {
      toast.error('创建失败：' + e.message);
    }
  };

  const handleDeleteMilestone = async (m) => {
    if (!confirm(`确定删除里程碑「${m.name}」？`)) return;
    try {
      await api.deleteMilestone(m.id);
      toast.success('里程碑已删除');
      load();
    } catch (e) {
      toast.error('删除失败：' + e.message);
    }
  };

  if (loading) return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div><div className="h-8 w-32 bg-slate-200/50 rounded-lg animate-pulse" /><div className="h-4 w-48 bg-slate-200/30 rounded-md mt-2 animate-pulse" /></div>
      </div>
      <div className="grid grid-cols-4 gap-4">{Array.from({length:4}).map((_,i)=><SkeletonCard key={i} />)}</div>
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3 rounded-2xl p-5 h-[300px] animate-pulse" style={{ background: 'rgba(255,255,255,0.5)' }} />
        <div className="col-span-2 rounded-2xl p-5 h-[300px] animate-pulse" style={{ background: 'rgba(255,255,255,0.5)' }} />
      </div>
    </div>
  );

  if (error) return <ErrorState message={error} onRetry={load} />;

  const sprintData = sprints.map((s) => {
    const sprintStories = stories.filter(st => st.sprint_id === s.id);
    const totalPoints = sprintStories.reduce((sum, st) => sum + (st.story_points || 0), 0);
    const completedPoints = sprintStories
      .filter(st => st.status === 'done')
      .reduce((sum, st) => sum + (st.story_points || 0), 0);
    return {
      name: `S${s.number}`,
      计划: totalPoints,
      完成: completedPoints,
    };
  });

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">控制台</h1>
          <p className="text-sm text-slate-400 mt-1">「研途启航」项目运行状态总览</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-1.5 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.6)' }}>
          <Clock size={13} />
          <span>{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={<Target size={20} />} iconClass="animate-icon-spin" label="总工作量" value={stats.totalPoints} sub={`已完成 ${stats.completedPoints} 点`} color="indigo" trend={stats.pointsCompletionRate} delay={0} />
        <StatCard icon={<CheckCircle2 size={20} />} iconClass="animate-icon-bounce" label="事件完成率" value={`${stats.storyCompletionRate}%`} sub={`${stats.completedStories}/${stats.totalStories} 个事件`} color="emerald" trend={stats.storyCompletionRate} delay={1} />
        <StatCard icon={<ListTodo size={20} />} iconClass="animate-icon-shake" label="任务进度" value={`${stats.doneTasks}/${stats.totalTasks}`} sub="已完成 / 总任务" color="amber" trend={stats.totalTasks ? Math.round(stats.doneTasks / stats.totalTasks * 100) : 0} delay={2} />
        <StatCard icon={<Flame size={20} />} iconClass="animate-icon-flicker" label="当前迭代" value={stats.activeSprint ? `S${stats.activeSprint.number}` : '—'} sub={stats.activeSprint?.name?.replace(/Sprint \d+：/, '') || '无活跃迭代'} color="rose" trend={null} delay={3} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-5 gap-4">
        <div className="card col-span-3 p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .15s both' }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">燃尽图</h3>
              <p className="text-xs text-slate-400 mt-0.5">理想进度 vs 实际进度</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-slate-200 rounded" />理想</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: c.accent }} />实际</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={burndownData} isAnimationActive={false}>
              <defs>
                <linearGradient id="burndown" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.accent} stopOpacity={.15} />
                  <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(241,245,249,0.6)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(30px) saturate(200%)', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', fontSize: 12 }} cursor={{ stroke: c.accent, strokeWidth: 1, strokeDasharray: '4 4' }} />
              <Area type="monotone" dataKey="ideal" stroke="#cbd5e1" strokeDasharray="6 4" strokeWidth={1.5} dot={false} fill="none" />
              <Area type="monotone" dataKey="actual" stroke={c.accent} strokeWidth={2.5} fill="url(#burndown)" dot={{ r: 3, fill: c.accent, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 5, fill: c.accent, stroke: '#fff', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card col-span-2 p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .2s both' }}>
          <h3 className="text-sm font-semibold text-slate-800 mb-1">迭代工作量</h3>
          <p className="text-xs text-slate-400 mb-5">各迭代计划 vs 完成</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={sprintData} barGap={4} isAnimationActive={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(241,245,249,0.6)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(30px) saturate(200%)', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', fontSize: 12 }} cursor={{ fill: c.accent50 }} />
              <Bar dataKey="计划" fill="rgba(226,232,240,0.5)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="完成" fill={c.accent} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .25s both' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Calendar size={15} className="text-orange-500" />里程碑</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">{milestones.filter(m => m.status === 'completed').length}/{milestones.length} 已达成</span>
              <button onClick={() => setShowMilestoneModal(true)} className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-500 transition-all duration-200">
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {milestones.map((m, i) => (
              <div key={m.id} className="group/ms" style={{ animation: `slideInRight .35s var(--spring-bounce) ${i * 60}ms both` }}>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleToggleMilestone(m)} className="flex items-center gap-3 flex-1 min-w-0 text-left group">
                    <div className="relative flex-shrink-0">
                      <div className={`w-3 h-3 rounded-full transition-all duration-500 ${m.status === 'completed' ? 'bg-emerald-500 shadow-sm shadow-emerald-200' : 'bg-slate-200 group-hover:bg-slate-300'}`} />
                      {i < milestones.length - 1 && <div className="absolute top-4 left-1/2 -translate-x-1/2 w-px h-6" style={{ background: 'rgba(241,245,249,0.8)' }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">{m.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{m.due_date}</div>
                    </div>
                    <span className={`badge text-[10px] flex-shrink-0 ${m.status === 'completed' ? 'bg-emerald-50/60 text-emerald-600 ring-1 ring-emerald-100/40' : 'bg-slate-50/60 text-slate-400 ring-1 ring-slate-100/40'}`}>
                      {m.status === 'completed' ? '已达成' : '点击达成'}
                    </span>
                  </button>
                  <button onClick={() => handleDeleteMilestone(m)}
                    className="p-1.5 rounded-lg opacity-0 group-hover/ms:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all duration-200 flex-shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
                {celebrating === m.id && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="animate-thumbs-up">
                      <div className="text-5xl animate-thumbs-pulse" style={{ filter: 'drop-shadow(0 4px 12px var(--accent-300))' }}>
                        <ThumbsUp size={48} className="text-orange-500 fill-orange-500" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .3s both' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><AlertTriangle size={15} className="text-amber-500" />风险概览</h3>
            <span className="text-xs text-slate-400">{risks.length} 个风险</span>
          </div>
          <div className="space-y-2.5">
            {risks.slice(0, 5).map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-orange-50/20 transition-all duration-300 group"
                style={{ animation: `slideInRight .35s var(--spring-bounce) ${i * 60 + 100}ms both` }}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-300 ${r.level === 'high' ? 'bg-red-500 shadow-sm shadow-red-200' : r.level === 'medium' ? 'bg-amber-500 shadow-sm shadow-amber-200' : 'bg-emerald-500 shadow-sm shadow-emerald-200'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-700 truncate group-hover:text-slate-900 transition-colors">{r.title}</div>
                  <div className="text-[11px] text-slate-400">概率{r.probability} × 影响{r.impact}</div>
                </div>
                <span className={`badge text-[10px] ${r.level === 'high' ? 'badge-s' : r.level === 'medium' ? 'badge-b' : 'badge-d'}`}>
                  {r.level === 'high' ? '高' : r.level === 'medium' ? '中' : '低'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal open={showMilestoneModal} onClose={() => setShowMilestoneModal(false)} title="新建里程碑">
        <MilestoneForm onCreate={handleCreateMilestone} onCancel={() => setShowMilestoneModal(false)} />
      </Modal>
    </div>
  );
}

function MilestoneForm({ onCreate, onCancel }) {
  const [form, setForm] = useState({ name: '', due_date: '', criteria: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = '请填写里程碑名称';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try { await onCreate(form); } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">名称 <span className="text-red-400">*</span></label>
        <input value={form.name} onChange={e => set('name', e.target.value)}
          className={`input ${errors.name ? 'error' : ''}`} placeholder="例如：M1：入学材料就绪" autoFocus />
        {errors.name && <p className="field-error">{errors.name}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">截止日期</label>
        <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className="input" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">达成标准</label>
        <textarea value={form.criteria} onChange={e => set('criteria', e.target.value)} className="input" rows={2} placeholder="如何判断此里程碑已达成？" />
      </div>
      <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid rgba(241,245,249,0.5)' }}>
        <button type="button" onClick={onCancel} className="btn btn-secondary">取消</button>
        <button type="submit" disabled={submitting} className="btn btn-primary flex items-center gap-1.5">
          {submitting && <Loader2 size={14} className="animate-spin" />}创建
        </button>
      </div>
    </form>
  );
}

function StatCard({ icon, iconClass, label, value, sub, color, trend, delay = 0 }) {
  const { theme } = useTheme();
  const tc = theme.colors;
  const colors = {
    indigo: { gradient: `linear-gradient(135deg, ${tc.accent50}, ${tc.accent100})`, text: 'text-theme', glow: tc.accent100 },
    emerald: { gradient: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.15))', text: 'text-emerald-600', glow: 'rgba(16,185,129,0.15)' },
    amber: { gradient: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.15))', text: 'text-amber-600', glow: 'rgba(245,158,11,0.15)' },
    rose: { gradient: 'linear-gradient(135deg, rgba(244,63,94,0.08), rgba(244,63,94,0.15))', text: 'text-rose-600', glow: 'rgba(244,63,94,0.15)' },
  };
  const c = colors[color] || colors.indigo;

  return (
    <div className="stat-card group" style={{ animation: `slideUp .5s var(--spring-bounce) ${delay * 0.08}s both` }}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</span>
        <div className={`w-10 h-10 rounded-xl ${c.text} flex items-center justify-center group-hover:scale-110 group-hover:shadow-lg transition-all duration-500`}
          style={{ background: c.gradient, boxShadow: `0 2px 8px ${c.glow}` }}>
          <span className={iconClass}>{icon}</span>
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900 tracking-tight animate-countUp">{value}</div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-slate-400">{sub}</span>
        {trend !== null && trend !== undefined && (
          <span className={`flex items-center gap-0.5 text-[11px] font-medium transition-colors ${trend > 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
            <TrendingUp size={12} className={trend > 0 ? 'animate-float' : ''} />{trend}%
          </span>
        )}
      </div>
    </div>
  );
}
