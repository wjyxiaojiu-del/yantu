import { useState, useEffect } from 'react';
import { Zap, ChevronRight, Edit3, Check, X, Pencil, Plus, Trash2, Calendar, Loader2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import { SkeletonSpinner } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import api from '../../api';
import Modal from '../../components/Modal';

export default function SprintPlan() {
  const { projectId } = useProject();
  const { theme } = useTheme();
  const tc = theme.colors;
  const toast = useToast();
  const [sprints, setSprints] = useState([]);
  const [current, setCurrent] = useState(null);
  const [stories, setStories] = useState([]);
  const [stats, setStats] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goal, setGoal] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const s = await api.getSprints({ project_id: projectId });
      setSprints(s);
      if (s.length) {
        const active = s.find(sp => sp.status === 'active') || s[0];
        if (!current || !s.find(sp => sp.id === current.id)) {
          setCurrent(active);
        } else {
          setCurrent(s.find(sp => sp.id === current.id));
        }
      }
      setError(null);
    } catch (e) {
      setError(e.message);
      toast.error('加载迭代数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  useEffect(() => {
    if (current) {
      Promise.all([
        api.getStories({ sprint_id: current.id }),
        api.getSprintStats(current.id),
      ]).then(([s, st]) => { setStories(s); setStats(st); }).catch(() => {});
      setGoal(current.goal || '');
    }
  }, [current]);

  const handleSaveGoal = async () => {
    try {
      await api.updateSprint(current.id, { goal });
      setCurrent({ ...current, goal });
      setEditingGoal(false);
      toast.success('迭代目标已更新');
    } catch (e) {
      toast.error('保存失败');
    }
  };

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    try {
      await api.updateSprint(current.id, { name: editName });
      const updated = { ...current, name: editName };
      setCurrent(updated);
      setSprints(prev => prev.map(s => s.id === current.id ? updated : s));
      setEditingName(false);
      toast.success('迭代名称已更新');
    } catch (e) {
      toast.error('保存失败');
    }
  };

  const handleCreateSprint = async (data) => {
    try {
      const result = await api.createSprint({ ...data, project_id: projectId });
      setShowCreateModal(false);
      toast.success('迭代创建成功');
      await load();
      // Select the newly created sprint
      const newSprints = await api.getSprints({ project_id: projectId });
      const created = newSprints.find(s => s.id === result.id);
      if (created) setCurrent(created);
    } catch (e) {
      toast.error('创建失败：' + e.message);
    }
  };

  const handleDeleteSprint = async (sprint) => {
    if (!confirm(`确定删除迭代「${sprint.name}」？\n该迭代下的任务和日程将被清除，事件将变为未分配状态。`)) return;
    try {
      await api.deleteSprint(sprint.id);
      toast.success('迭代已删除');
      if (current?.id === sprint.id) setCurrent(null);
      await load();
    } catch (e) {
      toast.error('删除失败：' + e.message);
    }
  };

  if (loading) return <SkeletonSpinner />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  const totalPoints = stories.reduce((s, st) => s + st.story_points, 0);

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex items-end justify-between" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">迭代规划</h1>
          <p className="text-sm text-slate-400 mt-1">规划迭代目标与任务分配</p>
        </div>
        <div className="flex items-center gap-2">
          {current && (
            <button onClick={() => handleDeleteSprint(current)} className="btn btn-danger gap-1.5 text-xs">
              <Trash2 size={14} /> 删除当前迭代
            </button>
          )}
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary gap-1.5">
            <Plus size={16} /> 新建迭代
          </button>
          <select value={current?.id || ''} onChange={e => setCurrent(sprints.find(s => s.id === +e.target.value))} className="select w-52">
            {sprints.map(s => <option key={s.id} value={s.id}>S{s.number}：{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Sprint List Overview */}
      <div className="flex gap-2 flex-wrap" style={{ animation: 'slideUp .5s var(--spring-bounce) .03s both' }}>
        {sprints.map((s, i) => (
          <button key={s.id} onClick={() => setCurrent(s)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-300"
            style={{
              background: current?.id === s.id
                ? 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.1))'
                : 'rgba(255,255,255,0.5)',
              border: `1.5px solid ${current?.id === s.id ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.6)'}`,
              color: current?.id === s.id ? '#4f46e5' : '#64748b',
              animation: `scaleIn .3s var(--spring-bounce) ${i * 0.04}s both`,
            }}>
            <span className="text-xs font-bold">S{s.number}</span>
            <span className="max-w-[120px] truncate text-xs">{s.name}</span>
            {s.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </button>
        ))}
      </div>

      {current ? (
        <>
          {/* Sprint Info Card */}
          <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .05s both' }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm relative"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
                }}>
                S{current.number}
              </div>
              <div className="flex-1">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="input flex-1 py-1.5 text-sm font-semibold" autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }} />
                    <button onClick={handleSaveName} className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50"
                      style={{ transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}><Check size={16} /></button>
                    <button onClick={() => setEditingName(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h2 className="text-base font-semibold text-slate-900">{current.name}</h2>
                    <button onClick={() => { setEditingName(true); setEditName(current.name); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-500"
                      style={{ transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                      <Pencil size={13} />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <Calendar size={11} className="text-slate-300" />
                  <p className="text-xs text-slate-400">{current.start_date || '未设置'} — {current.end_date || '未设置'}</p>
                </div>
              </div>
              <span className={`badge ${current.status === 'planned' ? 'bg-blue-50/60 text-blue-600 ring-1 ring-blue-100/40' : current.status === 'active' ? 'bg-amber-50/60 text-amber-600 ring-1 ring-amber-100/40' : 'bg-emerald-50/60 text-emerald-600 ring-1 ring-emerald-100/40'}`}>
                {current.status === 'planned' ? '计划中' : current.status === 'active' ? '进行中' : '已完成'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-5">
              {[
                { label: '事件数', value: stories.length, unit: '个' },
                { label: '工作量', value: totalPoints, unit: '点' },
                { label: '已完成', value: stats?.donePoints || 0, unit: '点', color: 'text-emerald-600' },
                { label: '完成率', value: totalPoints ? Math.round((stats?.donePoints || 0) / totalPoints * 100) : 0, unit: '%', color: 'text-orange-600' },
              ].map((item, i) => (
                <div key={i} className="rounded-xl p-3.5" style={{ background: 'rgba(241,245,249,0.5)', animation: `scaleIn .4s var(--spring-bounce) ${i * 0.05}s both` }}>
                  <div className="text-[11px] text-slate-400 mb-1">{item.label}</div>
                  <div className={`text-lg font-bold ${item.color || 'text-slate-800'}`}>{item.value}<span className="text-xs font-normal text-slate-400 ml-1">{item.unit}</span></div>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">迭代目标</span>
                {!editingGoal && <button onClick={() => setEditingGoal(true)} className="text-xs text-orange-500 hover:text-orange-700 flex items-center gap-1 transition-colors"><Edit3 size={12} />编辑</button>}
              </div>
              {editingGoal ? (
                <div className="flex gap-2">
                  <input value={goal} onChange={e => setGoal(e.target.value)} className="input flex-1" placeholder="输入迭代目标..." autoFocus />
                  <button onClick={handleSaveGoal} className="btn btn-primary py-2"><Check size={14} /></button>
                  <button onClick={() => { setEditingGoal(false); setGoal(current.goal || ''); }} className="btn btn-secondary py-2"><X size={14} /></button>
                </div>
              ) : (
                <p className="text-sm text-slate-600 rounded-xl p-3.5" style={{ background: 'rgba(241,245,249,0.4)' }}>{current.goal || '暂未设置目标'}</p>
              )}
            </div>
          </div>

          {/* Points Distribution */}
          <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .1s both' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Zap size={15} className="text-amber-500" /> 工作量分布</span>
              <span className="text-xs text-slate-400">{stats?.donePoints || 0} / {totalPoints} 点已完成</span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden mb-5" style={{ background: 'rgba(241,245,249,0.6)' }}>
              <div className="h-full rounded-full relative overflow-hidden"
                style={{
                  width: `${totalPoints ? (stats?.donePoints || 0) / totalPoints * 100 : 0}%`,
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7)',
                  boxShadow: '0 0 12px rgba(99,102,241,0.4)',
                  transition: 'width 1s cubic-bezier(0.22, 1, 0.36, 1)',
                }}>
                <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', animation: 'shimmerBar 2s infinite' }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['S', 'A', 'B'].map((p, i) => {
                const pts = stories.filter(s => s.priority === p).reduce((a, s) => a + s.story_points, 0);
                const gradients = {
                  S: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.1))',
                  A: `linear-gradient(135deg, ${tc.accent50}, ${tc.accent100})`,
                  B: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.1))',
                };
                return (
                  <div key={p} className="relative overflow-hidden rounded-xl p-4 transition-all duration-300 group"
                    style={{ background: gradients[p], animation: `scaleIn .4s var(--spring-bounce) ${0.15 + i * 0.05}s both` }}>
                    <span className={`badge badge-${p.toLowerCase()} mb-2`}>{p}</span>
                    <div className="text-xl font-bold text-slate-800">{pts}<span className="text-xs font-normal text-slate-400 ml-1">点</span></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stories List */}
          <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .15s both' }}>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">迭代待办列表</h3>
            <div className="space-y-1.5">
              {stories.map((st, i) => (
                <div key={st.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-orange-50/20 transition-all duration-300 group"
                  style={{ animation: `slideInRight .3s var(--spring-bounce) ${i * 40}ms both` }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-300 font-mono w-14">{st.story_id}</span>
                    <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 transition-colors">{st.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`badge badge-${(st.priority || 'D').toLowerCase()}`}>{st.priority}</span>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-semibold"
                      style={{ background: 'rgba(99,102,241,0.06)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.1)' }}>{st.story_points}</span>
                    <ChevronRight size={14} className="text-slate-200 group-hover:text-orange-400 transition-all duration-300 group-hover:translate-x-1" />
                  </div>
                </div>
              ))}
              {stories.length === 0 && <div className="text-center py-12 text-slate-400 text-sm animate-fadeIn">暂无分配的事件</div>}
            </div>
          </div>
        </>
      ) : (
        <div className="card p-12 text-center" style={{ animation: 'slideUp .5s var(--spring-bounce) .05s both' }}>
          <div className="text-4xl mb-3">🚀</div>
          <div className="text-sm font-medium text-slate-500 mb-1">暂无迭代</div>
          <div className="text-xs text-slate-400 mb-4">点击「新建迭代」开始规划</div>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary gap-1.5">
            <Plus size={16} /> 新建迭代
          </button>
        </div>
      )}

      <CreateSprintModal open={showCreateModal} onClose={() => setShowCreateModal(false)} onCreate={handleCreateSprint} />
    </div>
  );
}

function CreateSprintModal({ open, onClose, onCreate }) {
  const [form, setForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    goal: '',
    status: 'planned',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = '请填写迭代名称';
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
    <Modal open={open} onClose={onClose} title="新建迭代">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">迭代名称 <span className="text-red-400">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            className={`input ${errors.name ? 'error' : ''}`} placeholder="例如：入学筹备冲刺" autoFocus />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">开始日期</label>
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">结束日期</label>
            <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className="input" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">迭代目标</label>
          <textarea value={form.goal} onChange={e => set('goal', e.target.value)} className="input" rows={2} placeholder="这个迭代要达成什么目标？" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">状态</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} className="select">
            <option value="planned">计划中</option>
            <option value="active">进行中</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid rgba(241,245,249,0.5)' }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">取消</button>
          <button type="submit" disabled={submitting} className="btn btn-primary flex items-center gap-1.5">
            {submitting && <Loader2 size={14} className="animate-spin" />}创建
          </button>
        </div>
      </form>
    </Modal>
  );
}
