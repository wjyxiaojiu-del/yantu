import { useState, useEffect } from 'react';
import { Plus, Calendar, Trash2, Edit2, Sun, Coffee, CloudRain, AlertCircle, Zap, CheckSquare, Square, Clock, Loader2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import { SkeletonSpinner } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import api from '../../api';
import Modal from '../../components/Modal';

export default function Standup() {
  const { projectId } = useProject();
  const toast = useToast();
  const [sprints, setSprints] = useState([]);
  const [currentSprint, setCurrentSprint] = useState(null);
  const [logs, setLogs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [sprintStats, setSprintStats] = useState(null);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const s = await api.getSprints({ project_id: projectId });
      setSprints(s);
      if (s.length) {
        const active = s.find(sp => sp.status === 'active') || s[0];
        setCurrentSprint(active);
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
    if (currentSprint) {
      Promise.all([
        api.getStandups({ sprint_id: currentSprint.id }),
        api.getTasks({ sprint_id: currentSprint.id }),
        api.getSprintStats(currentSprint.id),
      ]).then(([s, t, st]) => { setLogs(s); setTasks(t); setSprintStats(st); }).catch(() => {});
    }
  }, [currentSprint]);

  const handleSave = async (data) => {
    try {
      if (modal.mode === 'create') await api.createStandup({ ...data, sprint_id: currentSprint.id });
      else await api.updateStandup(modal.log.id, data);
      setModal(null);
      toast.success(modal.mode === 'create' ? '日程创建成功' : '日程更新成功');
      api.getStandups({ sprint_id: currentSprint.id }).then(setLogs);
    } catch (e) {
      toast.error('保存失败');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除此日程记录？')) return;
    try {
      await api.deleteStandup(id);
      toast.success('日程已删除');
      api.getStandups({ sprint_id: currentSprint.id }).then(setLogs);
    } catch (e) {
      toast.error('删除失败');
    }
  };

  const handleQuickRecord = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const existing = logs.find(l => l.date === today);
    if (existing) {
      toast.error('今日已有日程记录');
      return;
    }
    try {
      await api.createStandup({
        date: today,
        yesterday: '',
        today: '',
        blockers: '',
        notes: '',
        sprint_id: currentSprint.id,
      });
      toast.success('快速创建今日日程');
      api.getStandups({ sprint_id: currentSprint.id }).then(setLogs);
    } catch (e) {
      toast.error('创建失败');
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const todayLog = logs.find(l => l.date === today);
  const pendingTasks = tasks.filter(t => t.status !== 'done').length;
  const totalPoints = sprintStats?.totalPoints || 0;
  const donePoints = sprintStats?.donePoints || 0;
  const progressPct = totalPoints ? Math.round(donePoints / totalPoints * 100) : 0;

  const isToday = (dateStr) => dateStr === today;

  if (loading) return <SkeletonSpinner />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex items-end justify-between" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">每日日程</h1>
          <p className="text-sm text-slate-400 mt-1">记录每日工作计划与进展</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={currentSprint?.id || ''} onChange={e => setCurrentSprint(sprints.find(s => s.id === +e.target.value))} className="select w-52">
            {sprints.map(s => <option key={s.id} value={s.id}>S{s.number}：{s.name.replace(/Sprint \d+：/, '')}</option>)}
          </select>
          <button onClick={handleQuickRecord} className="btn btn-secondary gap-1.5 text-xs">
            <Zap size={14} /> 快速记录
          </button>
          <button onClick={() => setModal({ mode: 'create' })} className="btn btn-primary">
            <Plus size={16} /> 新建日程
          </button>
        </div>
      </div>

      {/* Today Overview */}
      <div className="card-glass p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .05s both' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' }}>
              <Calendar size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">今日概览</h2>
              <p className="text-xs text-slate-400 mt-0.5">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
            </div>
          </div>
          {todayLog && (
            <span className="badge text-[10px] bg-emerald-50/60 text-emerald-600 ring-1 ring-emerald-100/40">已记录</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-3.5" style={{ background: 'rgba(99,102,241,0.04)' }}>
            <div className="text-[11px] text-slate-400 mb-1">迭代进度</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-slate-800">{progressPct}%</span>
              <span className="text-xs text-slate-400">{donePoints}/{totalPoints} 点</span>
            </div>
            <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'rgba(241,245,249,0.6)' }}>
              <div className="h-full rounded-full" style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                transition: 'width 1s cubic-bezier(0.22, 1, 0.36, 1)',
              }} />
            </div>
          </div>
          <div className="rounded-xl p-3.5" style={{ background: 'var(--accent-50)' }}>
            <div className="text-[11px] text-slate-400 mb-1">待处理任务</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-orange-600">{pendingTasks}</span>
              <span className="text-xs text-slate-400">个任务</span>
            </div>
            <div className="text-[11px] text-slate-300 mt-2">需要跟进处理</div>
          </div>
          <div className="rounded-xl p-3.5" style={{ background: 'rgba(16,185,129,0.04)' }}>
            <div className="text-[11px] text-slate-400 mb-1">今日状态</div>
            <div className="flex items-center gap-2 mt-1">
              {todayLog ? (
                <span className="text-sm font-medium text-emerald-600">已填写日程</span>
              ) : (
                <span className="text-sm font-medium text-amber-600">尚未记录</span>
              )}
            </div>
            <div className="text-[11px] text-slate-300 mt-2">{logs.length} 条日程记录</div>
          </div>
        </div>
      </div>

      {/* Timeline Logs */}
      <div className="relative">
        {/* Vertical timeline line */}
        <div className="absolute left-[18px] top-0 bottom-0 w-px" style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.3), rgba(241,245,249,0.3))' }} />

        <div className="space-y-4">
          {logs.map((log, i) => {
            const today = isToday(log.date);
            const older = new Date(log.date) < new Date(today);
            return (
              <div key={log.id} className="relative pl-12 group"
                style={{ animation: `slideInRight .4s var(--spring-bounce) ${i * 50}ms both` }}>
                {/* Timeline dot */}
                <div className="absolute left-[11px] top-5 w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center transition-all duration-300"
                  style={{
                    borderColor: today ? '#6366f1' : 'rgba(203,213,225,0.5)',
                    background: today ? '#fff' : 'rgba(255,255,255,0.8)',
                    boxShadow: today ? '0 0 0 4px rgba(99,102,241,0.1)' : 'none',
                  }}>
                  {today && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                </div>

                {/* Log card */}
                <div className={`card p-5 transition-all duration-500 ${today ? 'ring-1 ring-indigo-100/40' : ''} ${older ? 'opacity-70 hover:opacity-100' : ''}`}
                  style={{
                    borderLeft: log.blockers && log.blockers.trim() ? '3px solid #ef4444' : '3px solid transparent',
                  }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      {today ? (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: 'rgba(99,102,241,0.08)' }}>
                          <Clock size={15} className="text-indigo-500" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: 'var(--accent-50)' }}>
                          <Calendar size={15} className="text-orange-500" />
                        </div>
                      )}
                      <span className={`text-sm font-semibold ${today ? 'text-indigo-700' : 'text-slate-800'}`}>
                        {log.date}
                      </span>
                      {today && <span className="badge text-[10px] bg-indigo-50/60 text-indigo-600 ring-1 ring-indigo-100/40">今天</span>}
                      {log.blockers && log.blockers.trim() && (
                        <span className="badge text-[10px] bg-red-50/60 text-red-600 ring-1 ring-red-100/40">有阻塞</span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <button onClick={() => setModal({ mode: 'edit', log })} className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-500 transition-all duration-200"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(log.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all duration-200"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-xl p-3.5" style={{ background: 'rgba(245,158,11,0.04)' }}>
                      <div className="text-[11px] font-semibold text-amber-600 mb-2 flex items-center gap-1"><Sun size={12} /> 昨日完成</div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{log.yesterday || '—'}</p>
                    </div>
                    <div className="rounded-xl p-3.5" style={{ background: 'var(--accent-50)' }}>
                      <div className="text-[11px] font-semibold text-orange-600 mb-2 flex items-center gap-1"><Coffee size={12} /> 今日计划</div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{log.today || '—'}</p>
                    </div>
                    <div className="rounded-xl p-3.5" style={{ background: log.blockers && log.blockers.trim() ? 'rgba(239,68,68,0.04)' : 'rgba(244,63,94,0.04)' }}>
                      <div className={`text-[11px] font-semibold mb-2 flex items-center gap-1 ${log.blockers && log.blockers.trim() ? 'text-red-600' : 'text-rose-600'}`}>
                        <CloudRain size={12} /> 障碍风险
                        {log.blockers && log.blockers.trim() && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                      </div>
                      <p className={`text-sm whitespace-pre-wrap leading-relaxed ${log.blockers && log.blockers.trim() ? 'text-red-700 font-medium' : 'text-slate-700'}`}>
                        {log.blockers || '无阻塞项'}
                      </p>
                    </div>
                  </div>
                  {log.notes && <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(241,245,249,0.6)' }}><p className="text-xs text-slate-400">{log.notes}</p></div>}
                </div>
              </div>
            );
          })}
          {logs.length === 0 && (
            <div className="card text-center py-16 animate-fadeIn">
              <div className="text-4xl mb-3">📝</div>
              <div className="text-sm text-slate-400">暂无日程记录</div>
              <div className="text-xs text-slate-300 mt-1">点击「快速记录」或「新建日程」开始记录</div>
            </div>
          )}
        </div>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'create' ? '新建日程' : '编辑日程'}>
        {modal && <StandupForm log={modal.log} onSave={handleSave} onCancel={() => setModal(null)} sprint={currentSprint} />}
      </Modal>
    </div>
  );
}

function StandupForm({ log, onSave, onCancel, sprint }) {
  const [form, setForm] = useState({
    date: log?.date || new Date().toISOString().slice(0, 10),
    yesterday: log?.yesterday || '',
    today: log?.today || '',
    blockers: log?.blockers || '',
    notes: log?.notes || '',
  });
  const [tasks, setTasks] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  useEffect(() => {
    if (sprint) {
      api.getTasks({ sprint_id: sprint.id }).then(setTasks).catch(() => {});
    }
  }, [sprint]);

  const toggleTask = (id) => {
    setSelectedTasks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const checkedTasksText = () => {
    const checked = tasks.filter(t => selectedTasks.has(t.id));
    if (checked.length === 0) return '';
    return checked.map(t => `- ${t.title}`).join('\n');
  };

  const handleAutoFillToday = () => {
    const text = checkedTasksText();
    if (text) {
      const current = form.today ? form.today + '\n' : '';
      set('today', current + text);
    }
    const incomplete = tasks.filter(t => t.status !== 'done' && !selectedTasks.has(t.id));
    if (incomplete.length > 0) {
      const remainText = incomplete.slice(0, 5).map(t => `- ${t.title}`).join('\n');
      const currentBlockers = form.blockers ? form.blockers + '\n' : '';
      set('blockers', currentBlockers + '待处理任务：\n' + remainText);
    }
  };

  const validate = () => {
    const e = {};
    if (!form.date) e.date = '请选择日期';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try { await onSave(form); } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">日期 <span className="text-red-400">*</span></label>
        <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={`input ${errors.date ? 'error' : ''}`} />
        {errors.date && <p className="field-error flex items-center gap-1"><AlertCircle size={11} />{errors.date}</p>}
      </div>

      {/* Task Picker */}
      {tasks.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(241,245,249,0.3)', border: '1px solid rgba(241,245,249,0.5)' }}>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-slate-600">迭代任务</label>
            <button onClick={handleAutoFillToday} className="text-[11px] text-orange-500 hover:text-orange-700 font-medium transition-colors">
              勾选填入今日计划
            </button>
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-hide">
            {tasks.map(t => (
              <button key={t.id} onClick={() => toggleTask(t.id)}
                className="flex items-center gap-2.5 w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/50 transition-all duration-200"
                style={{ transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                {selectedTasks.has(t.id) ? (
                  <CheckSquare size={14} className="text-orange-500 flex-shrink-0" />
                ) : (
                  <Square size={14} className="text-slate-300 flex-shrink-0" />
                )}
                <span className="text-sm text-slate-700 truncate">{t.title}</span>
                {t.priority && <span className={`badge text-[9px] py-0 badge-${t.priority.toLowerCase()}`}>{t.priority}</span>}
                <span className="ml-auto text-[10px] text-slate-300">{t.status === 'done' ? '已完成' : t.status === 'in_progress' ? '进行中' : '待办'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">昨日完成</label>
        <textarea value={form.yesterday} onChange={e => set('yesterday', e.target.value)} className="input" rows={3} placeholder="昨天完成了哪些工作？" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">今日计划</label>
        <textarea value={form.today} onChange={e => set('today', e.target.value)} className="input" rows={3} placeholder="今天计划做什么？" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">障碍风险</label>
        <textarea value={form.blockers} onChange={e => set('blockers', e.target.value)} className="input" rows={2} placeholder="有什么阻碍了进展？" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">备注</label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="input" rows={2} placeholder="其他补充..." />
      </div>
      <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid rgba(241,245,249,0.5)' }}>
        <button type="button" onClick={onCancel} className="btn btn-secondary">取消</button>
        <button type="submit" disabled={submitting} className="btn btn-primary flex items-center gap-1.5">
          {submitting && <Loader2 size={14} className="animate-spin" />}保存
        </button>
      </div>
    </form>
  );
}
