import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Calendar, Check, CheckCircle2, ChevronDown, CircleDot,
  Clock3, Edit2, Filter, ListChecks, Loader2, Plus, RotateCcw, Search,
  Sparkles, Trash2, Zap,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import { SkeletonSpinner } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import Modal from '../../components/Modal';
import api from '../../api';

const PRIORITY_META = {
  S: { title: '立即处理', meaning: '极其紧急且关键', note: '今天优先清空，避免同时堆积', color: '#dc2626', soft: '#fef2f2' },
  A: { title: '优先处理', meaning: '紧急且重要', note: '安排在最近的明确时间块', color: '#ea580c', soft: '#fff7ed' },
  B: { title: '计划推进', meaning: '不紧急但重要', note: '科研积累的主体，持续排进日程', color: '#2563eb', soft: '#eff6ff' },
  C: { title: '批量处理', meaning: '不紧急不重要但要做', note: '集中处理，不打断深度工作', color: '#64748b', soft: '#f8fafc' },
  L: { title: '长期积累', meaning: '长期任务', note: '按里程碑拆成可持续的小步骤', color: '#7c3aed', soft: '#f5f3ff' },
};

const PRIORITY_KEYS = ['S', 'A', 'B', 'C', 'L'];
const PRIORITY_ORDER = { S: 0, A: 1, B: 2, C: 3, L: 4 };

const FILTERS = [
  { id: 'open', label: '待完成' },
  { id: 'today', label: '今天' },
  { id: 'overdue', label: '已逾期' },
  { id: 'active', label: '进行中' },
  { id: 'done', label: '已完成' },
  { id: 'all', label: '全部' },
];

const STATUS_META = {
  todo: { label: '待办', next: 'in_progress', action: '开始', icon: Zap },
  in_progress: { label: '进行中', next: 'verify', action: '待确认', icon: Clock3 },
  verify: { label: '待确认', next: 'done', action: '完成', icon: Check },
  done: { label: '已完成', next: 'todo', action: '恢复', icon: RotateCcw },
};

function normalizeStatus(status) {
  return status === 'backlog' || status === 'this_sprint' ? 'todo' : (STATUS_META[status] ? status : 'todo');
}

function normalizePriority(priority) {
  if (priority === 'D') return 'L';
  return PRIORITY_META[priority] ? priority : 'B';
}

function normalizeTask(task) {
  return { ...task, status: normalizeStatus(task.status), priority: normalizePriority(task.priority) };
}

function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function isOverdue(task) {
  return Boolean(task.due_date && task.due_date < localDateKey() && task.status !== 'done');
}

function sortTasks(a, b) {
  const statusOrder = { in_progress: 0, verify: 1, todo: 2, done: 3 };
  return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
    || (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2)
    || (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31')
    || (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

export default function TaskBoard() {
  const { projectId, projects } = useProject();
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState('open');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const currentProject = projects.find((project) => project.id === projectId);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await api.getAgileTasks({ project_id: projectId });
      setTasks((Array.isArray(data) ? data : []).map(normalizeTask));
      setError(null);
    } catch (loadError) {
      setError(loadError.message);
      toast.error('加载任务清单失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const counts = useMemo(() => {
    const open = tasks.filter((task) => task.status !== 'done');
    return {
      open: open.length,
      active: tasks.filter((task) => task.status === 'in_progress').length,
      overdue: tasks.filter(isOverdue).length,
      done: tasks.filter((task) => task.status === 'done').length,
      grades: Object.fromEntries(PRIORITY_KEYS.map((priority) => [priority, open.filter((task) => task.priority === priority).length])),
    };
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const today = localDateKey();
    const term = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (gradeFilter !== 'all' && task.priority !== gradeFilter) return false;
      if (term && ![task.title, task.description].some((value) => String(value || '').toLowerCase().includes(term))) return false;
      if (filter === 'open') return task.status !== 'done';
      if (filter === 'today') return task.due_date === today && task.status !== 'done';
      if (filter === 'overdue') return isOverdue(task);
      if (filter === 'active') return task.status === 'in_progress' || task.status === 'verify';
      if (filter === 'done') return task.status === 'done';
      return true;
    }).sort(sortTasks);
  }, [tasks, filter, gradeFilter, search]);

  const groupedTasks = useMemo(() => Object.fromEntries(PRIORITY_KEYS.map((priority) => [
    priority,
    visibleTasks.filter((task) => task.status !== 'done' && task.priority === priority),
  ])), [visibleTasks]);

  const completedTasks = useMemo(() => visibleTasks.filter((task) => task.status === 'done'), [visibleTasks]);
  const focusTask = useMemo(() => tasks.filter((task) => task.status !== 'done').sort(sortTasks)[0], [tasks]);
  const completion = tasks.length ? Math.round((counts.done / tasks.length) * 100) : 0;

  const patchTask = async (task, patch, successMessage) => {
    const previous = task;
    setTasks((current) => current.map((item) => item.id === task.id ? normalizeTask({ ...item, ...patch }) : item));
    try {
      const updated = await api.updateAgileTask(task.id, patch);
      setTasks((current) => current.map((item) => item.id === task.id ? normalizeTask({ ...item, ...updated }) : item));
      if (successMessage) toast.success(successMessage);
    } catch (updateError) {
      setTasks((current) => current.map((item) => item.id === task.id ? previous : item));
      toast.error(`更新失败：${updateError.message}`);
    }
  };

  const toggleTask = (task) => {
    const done = task.status !== 'done';
    patchTask(task, { status: done ? 'done' : 'todo' }, done ? '任务已完成' : '任务已恢复到待办');
  };

  const advanceTask = (task) => {
    const status = STATUS_META[task.status] || STATUS_META.todo;
    patchTask(task, { status: status.next }, `已更新为「${STATUS_META[status.next].label}」`);
  };

  const updatePriority = (task, priority) => {
    if (task.priority === priority) return;
    patchTask(task, { priority }, `已调整为 ${priority} 级任务`);
  };

  const handleSave = async (data) => {
    try {
      if (modal.mode === 'create') {
        const created = await api.createAgileTask({ ...data, project_id: projectId });
        setTasks((current) => [normalizeTask(created), ...current]);
        toast.success(`任务已加入 ${normalizePriority(created.priority)} 级清单`);
      } else {
        const updated = await api.updateAgileTask(modal.task.id, data);
        setTasks((current) => current.map((task) => task.id === updated.id ? normalizeTask({ ...task, ...updated }) : task));
        toast.success('任务已更新');
      }
      setModal(null);
    } catch (saveError) {
      toast.error(`保存失败：${saveError.message}`);
      throw saveError;
    }
  };

  const handleDelete = async (task) => {
    if (!confirm(`确定删除任务「${task.title}」？`)) return;
    try {
      await api.deleteAgileTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      toast.success('任务已删除');
    } catch (deleteError) {
      toast.error(`删除失败：${deleteError.message}`);
    }
  };

  if (loading) return <SkeletonSpinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="todo-board-shell mx-auto max-w-[1500px] space-y-5 pb-8">
      <header className="todo-board-header workbench-reveal">
        <div>
          <div className="todo-board-eyebrow"><CircleDot size={12} /> RESEARCH TODO LEDGER</div>
          <h1>任务清单</h1>
          <p>{currentProject?.name || '当前项目'} · 先分级，再逐项完成；一次只推进真正重要的事情。</p>
        </div>
        <button onClick={() => setModal({ mode: 'create', defaults: { priority: gradeFilter === 'all' ? 'B' : gradeFilter } })} className="btn btn-primary">
          <Plus size={16} /> 添加任务
        </button>
      </header>

      <section className="todo-grade-summary workbench-reveal workbench-reveal-delay-1" aria-label="任务分级概览">
        {PRIORITY_KEYS.map((priority) => {
          const meta = PRIORITY_META[priority];
          const active = gradeFilter === priority;
          return (
            <button key={priority} onClick={() => setGradeFilter(active ? 'all' : priority)} className={active ? 'is-active' : ''} style={{ '--grade': meta.color, '--grade-soft': meta.soft }}>
              <span>{priority}</span><div><b>{meta.title}</b><small>{meta.meaning}</small></div><strong>{counts.grades[priority]}</strong>
            </button>
          );
        })}
      </section>

      <div className="todo-toolbar workbench-reveal workbench-reveal-delay-2">
        <div className="todo-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务或完成标准……" /></div>
        <div className="task-filter-group" role="group" aria-label="筛选任务">
          <Filter size={13} className="mx-1 text-slate-400" />
          {FILTERS.map((item) => <button key={item.id} onClick={() => setFilter(item.id)} className={filter === item.id ? 'is-active' : ''}>{item.label}{item.id === 'overdue' && counts.overdue > 0 && <span>{counts.overdue}</span>}</button>)}
        </div>
        <div className="todo-toolbar-count">当前显示 <b>{visibleTasks.length}</b> 项</div>
      </div>

      <div className="todo-board-layout workbench-reveal workbench-reveal-delay-3">
        <main className="todo-ledger">
          <div className="todo-ledger-title"><div><ListChecks size={17} /><span><b>分级 Todo List</b><small>勾选完成，使用下拉框随时调整任务等级</small></span></div>{gradeFilter !== 'all' && <button onClick={() => setGradeFilter('all')}><RotateCcw size={12} /> 查看全部等级</button>}</div>

          {filter !== 'done' && PRIORITY_KEYS.map((priority) => {
            const items = groupedTasks[priority];
            const showEmpty = filter === 'open' && !search.trim() && gradeFilter === 'all';
            if (!items.length && !showEmpty && gradeFilter !== priority) return null;
            return <PriorityTodoSection key={priority} priority={priority} tasks={items} onAdd={() => setModal({ mode: 'create', defaults: { priority } })} onToggle={toggleTask} onAdvance={advanceTask} onPriority={updatePriority} onEdit={(task) => setModal({ mode: 'edit', task })} onDelete={handleDelete} />;
          })}

          {filter !== 'done' && !visibleTasks.some((task) => task.status !== 'done') && !(filter === 'open' && !search.trim() && gradeFilter === 'all') && (
            <div className="todo-no-results"><CheckCircle2 size={24} /><b>当前筛选下没有待完成任务</b><span>可以换一个筛选条件，或添加一项新的任务。</span></div>
          )}

          <CompletedTodoShelf tasks={completedTasks} total={counts.done} forceOpen={filter === 'done'} onToggle={toggleTask} onPriority={updatePriority} onEdit={(task) => setModal({ mode: 'edit', task })} onDelete={handleDelete} />
        </main>

        <aside className="todo-board-side">
          <article className="todo-focus-card">
            <div className="todo-focus-top"><span><Sparkles size={12} /> 当前焦点</span><div className="todo-progress" style={{ '--completion': `${completion * 3.6}deg` }}><b>{completion}%</b></div></div>
            {focusTask ? <><PriorityBadge priority={focusTask.priority} /><h2>{focusTask.title}</h2><p>{focusTask.description || '把它推进一个明确的小步骤。'}</p><div className="todo-focus-meta"><StatusPill status={focusTask.status} /><DueDate task={focusTask} /></div><button onClick={() => advanceTask(focusTask)}><Zap size={13} /> {STATUS_META[focusTask.status].action}</button></> : <><CheckCircle2 size={28} className="mt-7 text-emerald-300" /><h2>所有任务都已完成</h2><p>可以为下一阶段补充一个清晰的下一步。</p><button onClick={() => setModal({ mode: 'create', defaults: { priority: 'B' } })}><Plus size={13} /> 添加任务</button></>}
          </article>

          <article className="todo-grade-guide">
            <div className="todo-guide-title"><ListChecks size={14} /><div><b>分级规则</b><small>不确定时，默认放到 B</small></div></div>
            {PRIORITY_KEYS.map((priority) => { const meta = PRIORITY_META[priority]; return <div key={priority} style={{ '--grade': meta.color, '--grade-soft': meta.soft }}><span>{priority}</span><p><b>{meta.meaning}</b><small>{meta.note}</small></p></div>; })}
          </article>

          <div className="todo-side-stats"><span><b>{counts.open}</b> 待完成</span><span><b>{counts.active}</b> 进行中</span><span className={counts.overdue ? 'is-warning' : ''}><b>{counts.overdue}</b> 已逾期</span></div>
        </aside>
      </div>

      <div className="task-flow-signature"><span /><a href="https://deerflow.tech" target="_blank" rel="noreferrer">Created by Deerflow</a><span /></div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'edit' ? '编辑任务' : '添加任务'}>
        {modal && <TaskForm task={modal.task} defaults={modal.defaults} onSave={handleSave} onCancel={() => setModal(null)} />}
      </Modal>
    </div>
  );
}

function PriorityTodoSection({ priority, tasks, onAdd, onToggle, onAdvance, onPriority, onEdit, onDelete }) {
  const meta = PRIORITY_META[priority];
  return (
    <section className="todo-grade-section" style={{ '--grade': meta.color, '--grade-soft': meta.soft }}>
      <header><span className="todo-grade-letter">{priority}</span><div><h2>{meta.title}</h2><p>{meta.meaning} · {meta.note}</p></div><strong>{tasks.length}</strong><button onClick={onAdd} aria-label={`添加 ${priority} 级任务`}><Plus size={13} /></button></header>
      <div className="todo-grade-list">
        {tasks.map((task) => <TaskTodoRow key={task.id} task={task} onToggle={onToggle} onAdvance={onAdvance} onPriority={onPriority} onEdit={onEdit} onDelete={onDelete} />)}
        {!tasks.length && <button className="todo-grade-empty" onClick={onAdd}><Plus size={12} /> 这一等级暂时没有任务</button>}
      </div>
    </section>
  );
}

function TaskTodoRow({ task, onToggle, onAdvance, onPriority, onEdit, onDelete, completed = false }) {
  const meta = PRIORITY_META[task.priority];
  const status = STATUS_META[task.status] || STATUS_META.todo;
  const ActionIcon = status.icon;
  return (
    <article className={`todo-task-row ${completed ? 'is-completed' : ''}`} style={{ '--grade': meta.color }}>
      <button className="todo-check" onClick={() => onToggle(task)} aria-label={completed ? `恢复任务：${task.title}` : `完成任务：${task.title}`}>{completed && <Check size={13} />}</button>
      <div className="todo-task-copy"><h3>{task.title}</h3>{task.description && <p>{task.description}</p>}<div className="todo-task-meta"><StatusPill status={task.status} /><DueDate task={task} />{isOverdue(task) && <span className="todo-overdue"><AlertTriangle size={10} /> 已逾期</span>}</div></div>
      <div className="todo-task-controls">
        <select value={task.priority} onChange={(event) => onPriority(task, event.target.value)} aria-label={`调整任务级别：${task.title}`}>{PRIORITY_KEYS.map((priority) => <option key={priority} value={priority}>{priority} 级</option>)}</select>
        {!completed && <button className="todo-status-action" onClick={() => onAdvance(task)}><ActionIcon size={11} /> {status.action}</button>}
        <button onClick={() => onEdit(task)} aria-label={`编辑任务：${task.title}`}><Edit2 size={12} /></button>
        <button onClick={() => onDelete(task)} aria-label={`删除任务：${task.title}`}><Trash2 size={12} /></button>
      </div>
    </article>
  );
}

function CompletedTodoShelf({ tasks, total, forceOpen, onToggle, onPriority, onEdit, onDelete }) {
  return (
    <details className="completed-todo-shelf" open={forceOpen || undefined}>
      <summary><span><CheckCircle2 size={16} /></span><div><b>已完成任务</b><small>完成项收在这里，需要时可以恢复</small></div><strong>{total} 项</strong><ChevronDown size={14} /></summary>
      <div className="completed-todo-list">{tasks.length ? tasks.slice(0, 30).map((task) => <TaskTodoRow key={task.id} task={task} completed onToggle={onToggle} onPriority={onPriority} onEdit={onEdit} onDelete={onDelete} />) : <p>当前筛选下没有已完成任务</p>}</div>
    </details>
  );
}

function PriorityBadge({ priority }) {
  const meta = PRIORITY_META[priority] || PRIORITY_META.B;
  return <span className="todo-priority-badge" style={{ '--grade': meta.color, '--grade-soft': meta.soft }}>{priority} · {meta.title}</span>;
}

function StatusPill({ status }) {
  const meta = STATUS_META[normalizeStatus(status)];
  return <span className={`todo-status-pill status-${normalizeStatus(status)}`}>{meta.label}</span>;
}

function DueDate({ task }) {
  if (!task?.due_date) return <span className="todo-due is-muted"><Clock3 size={10} /> 无期限</span>;
  const label = task.due_date === localDateKey() ? '今天' : task.due_date.slice(5).replace('-', '/');
  return <span className={`todo-due ${isOverdue(task) ? 'is-overdue' : ''}`}><Calendar size={10} /> {label}</span>;
}

function TaskForm({ task, defaults, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    priority: normalizePriority(task?.priority || defaults?.priority || 'B'),
    due_date: task?.due_date || '',
    status: normalizeStatus(task?.status || defaults?.status || 'todo'),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) { setError('请写下一个明确的任务'); return; }
    setSubmitting(true);
    try { await onSave({ ...form, title: form.title.trim(), due_date: form.due_date || null }); }
    catch (saveError) { setError(saveError.message || '保存失败'); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div><label className="mb-1.5 block text-xs font-medium text-slate-500">任务名称</label><input value={form.title} onChange={(event) => { setForm((current) => ({ ...current, title: event.target.value })); setError(''); }} className={`input ${error ? 'error' : ''}`} autoFocus placeholder="例如：整理实验 3 的异常样本" />{error && <p className="field-error">{error}</p>}</div>
      <div><label className="mb-1.5 block text-xs font-medium text-slate-500">完成标准或背景</label><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="input" rows={3} placeholder="做到什么程度，就算这项任务完成？" /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="mb-1.5 block text-xs font-medium text-slate-500">任务等级</label><select aria-label="任务等级" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className="select">{PRIORITY_KEYS.map((priority) => <option key={priority} value={priority}>{priority} · {PRIORITY_META[priority].meaning}</option>)}</select></div>
        <div><label className="mb-1.5 block text-xs font-medium text-slate-500">当前状态</label><select aria-label="当前状态" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="select"><option value="todo">待办</option><option value="in_progress">进行中</option><option value="verify">待确认</option><option value="done">已完成</option></select></div>
        <div><label className="mb-1.5 block text-xs font-medium text-slate-500">截止日期</label><input aria-label="截止日期" type="date" value={form.due_date} onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))} className="input" /></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" className="btn btn-secondary" onClick={onCancel}>取消</button><button disabled={submitting} className="btn btn-primary">{submitting && <Loader2 size={13} className="animate-spin" />}保存任务</button></div>
    </form>
  );
}
