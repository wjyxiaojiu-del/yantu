import { useEffect, useState } from 'react';
import {
  AlertCircle, Calendar, CheckSquare, CloudRain, Coffee, Edit2,
  Loader2, Plus, Sparkles, Square, Sun, Trash2, Zap, NotebookPen, BrainCircuit,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import { SkeletonSpinner } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import Modal from '../../components/Modal';
import api from '../../api';

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function DailyJournal() {
  const { projectId, projects } = useProject();
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const today = localDateKey();
  const currentProject = projects.find((project) => project.id === projectId);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [logData, taskData] = await Promise.all([
        api.getDailyLogs({ project_id: projectId }),
        api.getAgileTasks({ project_id: projectId }),
      ]);
      setLogs(Array.isArray(logData) ? logData : []);
      setTasks(Array.isArray(taskData) ? taskData : []);
      setError(null);
    } catch (e) {
      setError(e.message);
      toast.error('加载每日记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const askCodexForReview = async () => {
    const existing = logs.find((log) => log.date === today);
    if (!existing) { toast.error('请先保存今天的工作台记录'); return; }
    setReviewBusy(true);
    try {
      const result = await api.createCodexJob({ projectId, prompt: `请只根据今天（${today}）在小九工作台中的每日记录、任务、风险、文献和研究地图，生成一份诚实、具体的每日复盘。区分事实、推断和待核验项；重点识别做得好的地方、没有完成的原因、重复出现的不足、证据缺口，以及明天唯一最重要的改进动作。不要虚构未记录的事实。` });
      toast.success(`已提交 Codex 复盘任务 #${result.id}，结果会回到右下角 Agent`);
    } catch (e) { toast.error(e.message); } finally { setReviewBusy(false); }
  };

  const handleSave = async (data) => {
    try {
      if (modal.mode === 'create') {
        const created = await api.createDailyLog({ ...data, project_id: projectId });
        setLogs((current) => [created, ...current.filter((log) => log.date !== created.date)]);
        toast.success('今日记录已保存');
      } else {
        const updated = await api.updateDailyLog(modal.log.id, data);
        setLogs((current) => current.map((log) => log.id === updated.id ? updated : log));
        toast.success('记录已更新');
      }
      setModal(null);
    } catch (e) {
      toast.error(`保存失败：${e.message}`);
    }
  };

  const handleDelete = async (log) => {
    if (!confirm(`确定删除 ${log.date} 的记录？`)) return;
    try {
      await api.deleteDailyLog(log.id);
      setLogs((current) => current.filter((item) => item.id !== log.id));
      toast.success('记录已删除');
    } catch (e) {
      toast.error(`删除失败：${e.message}`);
    }
  };

  const handleQuickRecord = async () => {
    const existing = logs.find((log) => log.date === today);
    if (existing) {
      setModal({ mode: 'edit', log: existing });
      return;
    }
    const suggested = tasks
      .filter((task) => task.status !== 'done')
      .slice(0, 3)
      .map((task) => `- ${task.title}`)
      .join('\n');
    try {
      const created = await api.createDailyLog({
        project_id: projectId,
        date: today,
        yesterday: '',
        today: suggested,
        blockers: '',
        notes: '',
      });
      setLogs((current) => [created, ...current]);
      setModal({ mode: 'edit', log: created });
      toast.success('已按待办生成今日计划');
    } catch (e) {
      toast.error(`创建失败：${e.message}`);
    }
  };

  if (loading) return <SkeletonSpinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const todayLog = logs.find((log) => log.date === today);
  const pendingTasks = tasks.filter((task) => task.status !== 'done');
  const overdueTasks = pendingTasks.filter((task) => task.due_date && task.due_date < today);
  const doneTasks = tasks.filter((task) => task.status === 'done').length;

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">每日记录</h1>
          <p className="text-sm text-slate-400 mt-1">{currentProject?.name || '当前项目'} · 计划、进展和阻塞都记在项目下</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={handleQuickRecord} className="btn btn-secondary gap-1.5 text-xs"><Zap size={14} />{todayLog ? '编辑今天' : '快速生成今天'}</button>
          <button onClick={() => setModal({ mode: 'create' })} className="btn btn-primary"><Plus size={16} /> 新建记录</button>
        </div>
      </header>

      <section className="workbench-panel p-5 md:p-6 overflow-hidden relative">
        <div className="absolute -right-16 -top-20 w-52 h-52 rounded-full bg-blue-100/30 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg,var(--accent),var(--accent-light))' }}><Calendar size={21} /></div>
            <div><div className="text-base font-bold text-slate-800">今天的工作节奏</div><div className="text-xs text-slate-400 mt-1">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</div></div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full lg:w-auto lg:min-w-[460px]">
            <JournalMetric label="待推进" value={pendingTasks.length} />
            <JournalMetric label="已完成" value={doneTasks} tone="emerald" />
            <JournalMetric label="已逾期" value={overdueTasks.length} tone={overdueTasks.length ? 'red' : 'slate'} />
          </div>
        </div>
        <div className="relative mt-5 p-4 rounded-2xl bg-slate-50/70 border border-slate-100">
          <div className="flex items-center justify-between gap-3 mb-2"><span className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><Sun size={13} className="text-amber-500" />今日计划</span>{todayLog && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">已记录</span>}</div>
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{todayLog?.today || '还没有写下今天的计划，点击“快速生成今天”从待办中自动带入。'}</p>
        </div>
      </section>

      <section className="workbench-panel overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><div className="flex items-center gap-2"><NotebookPen size={17} className="text-violet-600" /><h2 className="text-base font-bold text-slate-800">今日复盘证据</h2></div><p className="text-xs text-slate-400 mt-1.5">每日记录保存在工作台数据库中，Codex 只依据这些真实记录与项目上下文分析。</p></div>
            </div>
            <div className="mt-4 grid gap-3 rounded-2xl border border-violet-100/60 bg-violet-50/40 p-4 md:grid-cols-2">
              <LogBlock icon={Coffee} label="实际完成" text={todayLog?.yesterday || '尚未记录今天实际完成的事项'} tone="blue" />
              <LogBlock icon={CloudRain} label="阻塞与不足" text={todayLog?.blockers || '尚未记录阻塞项'} tone={todayLog?.blockers ? 'red' : 'emerald'} />
              {todayLog?.notes && <div className="md:col-span-2 rounded-xl bg-white/70 p-3 text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">{todayLog.notes}</div>}
            </div>
          </div>
          <div className="p-5 bg-[#1d1a26] text-white flex flex-col justify-between gap-4">
            <div><div className="text-[10px] uppercase tracking-[0.2em] text-violet-200/60">Reflection loop</div><h3 className="text-lg font-bold mt-2">让记录产生反馈</h3><p className="text-xs text-white/50 mt-2 leading-relaxed">工作台提供事实与过程证据，本地 Codex 帮你寻找反复出现的不足和明天的最小改进。</p></div>
            <div className="space-y-2">
              <button onClick={askCodexForReview} disabled={!todayLog || reviewBusy} className="w-full py-2.5 rounded-xl bg-violet-400 text-violet-950 font-semibold text-xs disabled:opacity-40"><BrainCircuit size={14} className="inline mr-1.5" />{reviewBusy ? '正在提交…' : 'Codex 深度复盘'}</button>
              <p className="text-center text-[10px] leading-relaxed text-white/35">结果进入右下角 Codex Agent，不产生额外外部连接。</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3"><div><h2 className="text-base font-bold text-slate-800">记录历史</h2><p className="text-xs text-slate-400 mt-1">按日期回看每天真正推进了什么</p></div><span className="text-xs text-slate-400">{logs.length} 条</span></div>
        <div className="space-y-3">
          {logs.map((log) => (
            <article key={log.id} className={`workbench-panel p-5 group ${log.date === today ? 'ring-1 ring-[var(--accent-100)]' : ''}`}>
              <div className="flex items-start gap-4">
                <div className="w-12 shrink-0 text-center"><div className="text-lg font-bold text-slate-800">{String(log.date).slice(8, 10)}</div><div className="text-[10px] text-slate-400">{String(log.date).slice(5, 7)}月</div></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="text-xs font-bold text-slate-600">{log.date === today ? '今天' : log.date}</div>
                    <div className="flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"><button onClick={() => setModal({ mode: 'edit', log })} className="p-1.5 text-slate-300 hover:text-slate-600" aria-label="编辑记录"><Edit2 size={13} /></button><button onClick={() => handleDelete(log)} className="p-1.5 text-slate-300 hover:text-red-500" aria-label="删除记录"><Trash2 size={13} /></button></div>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3">
                    <LogBlock icon={Coffee} label="昨日完成" text={log.yesterday || '—'} tone="blue" />
                    <LogBlock icon={Sun} label="今日计划" text={log.today || '—'} tone="amber" />
                    <LogBlock icon={CloudRain} label="阻塞与风险" text={log.blockers || '无阻塞项'} tone={log.blockers ? 'red' : 'emerald'} />
                  </div>
                  {log.notes && <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">{log.notes}</p>}
                </div>
              </div>
            </article>
          ))}
          {!logs.length && <div className="workbench-panel text-center py-16"><Sparkles size={28} className="mx-auto text-slate-300" /><p className="text-sm font-semibold text-slate-600 mt-3">从今天开始留下第一条记录</p><p className="text-xs text-slate-400 mt-1">不做周期汇报，只记录当天真正发生的事情。</p></div>}
        </div>
      </section>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'create' ? '新建每日记录' : '编辑每日记录'}>
        {modal && <DailyLogForm log={modal.log} tasks={tasks} onSave={handleSave} onCancel={() => setModal(null)} />}
      </Modal>
    </div>
  );
}

function JournalMetric({ label, value, tone = 'slate' }) {
  const colors = { slate: 'text-slate-700 bg-slate-50', emerald: 'text-emerald-700 bg-emerald-50', red: 'text-red-700 bg-red-50' };
  return <div className={`rounded-xl px-3 py-3 ${colors[tone] || colors.slate}`}><div className="text-lg font-bold">{value}</div><div className="text-[10px] opacity-60">{label}</div></div>;
}

function LogBlock({ icon: Icon, label, text, tone }) {
  const colors = { blue: 'bg-blue-50/60 text-blue-600', amber: 'bg-amber-50/60 text-amber-600', red: 'bg-red-50/60 text-red-600', emerald: 'bg-emerald-50/60 text-emerald-600' };
  return <div className={`rounded-xl p-3.5 ${colors[tone]}`}><div className="text-[11px] font-bold flex items-center gap-1.5 mb-2"><Icon size={12} />{label}</div><p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{text}</p></div>;
}

function DailyLogForm({ log, tasks, onSave, onCancel }) {
  const [form, setForm] = useState({ date: log?.date || localDateKey(), yesterday: log?.yesterday || '', today: log?.today || '', blockers: log?.blockers || '', notes: log?.notes || '' });
  const [selected, setSelected] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const availableTasks = tasks.filter((task) => task.status !== 'done');
  const toggle = (id) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const fillTasks = () => {
    const text = availableTasks.filter((task) => selected.has(task.id)).map((task) => `- ${task.title}`).join('\n');
    if (text) setForm((current) => ({ ...current, today: current.today ? `${current.today}\n${text}` : text }));
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!form.date) { setError('请选择日期'); return; }
    setSubmitting(true);
    try { await onSave(form); } finally { setSubmitting(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div><label className="block text-xs font-medium text-slate-500 mb-1.5">日期</label><input type="date" value={form.date} onChange={(e) => { setForm((v) => ({ ...v, date: e.target.value })); setError(''); }} className={`input ${error ? 'error' : ''}`} />{error && <p className="field-error flex items-center gap-1"><AlertCircle size={11} />{error}</p>}</div>
      {availableTasks.length > 0 && <div className="rounded-xl p-3.5 bg-slate-50/70 border border-slate-100"><div className="flex items-center justify-between mb-2"><span className="text-xs font-bold text-slate-600">从待办带入</span><button type="button" onClick={fillTasks} className="text-[11px] font-semibold text-[var(--accent)]">填入今日计划</button></div><div className="space-y-1 max-h-32 overflow-y-auto">{availableTasks.slice(0, 8).map((task) => <button type="button" key={task.id} onClick={() => toggle(task.id)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white text-left">{selected.has(task.id) ? <CheckSquare size={14} className="text-[var(--accent)]" /> : <Square size={14} className="text-slate-300" />}<span className="text-xs text-slate-600 truncate">{task.title}</span></button>)}</div></div>}
      <div><label className="block text-xs font-medium text-slate-500 mb-1.5">昨日完成</label><textarea value={form.yesterday} onChange={(e) => setForm((v) => ({ ...v, yesterday: e.target.value }))} className="input" rows={3} placeholder="昨天完成了什么？" /></div>
      <div><label className="block text-xs font-medium text-slate-500 mb-1.5">今日计划</label><textarea value={form.today} onChange={(e) => setForm((v) => ({ ...v, today: e.target.value }))} className="input" rows={4} placeholder="今天最重要的三件事是什么？" /></div>
      <div><label className="block text-xs font-medium text-slate-500 mb-1.5">阻塞与风险</label><textarea value={form.blockers} onChange={(e) => setForm((v) => ({ ...v, blockers: e.target.value }))} className="input" rows={2} placeholder="有什么卡住了进展？" /></div>
      <div><label className="block text-xs font-medium text-slate-500 mb-1.5">备注</label><textarea value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} className="input" rows={2} placeholder="其他补充" /></div>
      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100"><button type="button" onClick={onCancel} className="btn btn-secondary">取消</button><button type="submit" disabled={submitting} className="btn btn-primary">{submitting && <Loader2 size={14} className="animate-spin" />}保存</button></div>
    </form>
  );
}
