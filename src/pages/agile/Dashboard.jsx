import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, Calendar, CalendarCheck2, Check,
  CheckCircle2, ChevronRight, Circle, ClipboardCheck, Flag, Focus,
  Gauge, Kanban, ListTodo, Loader2, Plus, Sparkles, Target, BookOpen, Search,
  Timer, Trash2, Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProject } from '../../context/ProjectContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import { SkeletonCard } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import Modal from '../../components/Modal';
import api from '../../api';

const STATUS_LABELS = {
  todo: '待办', backlog: '待办', this_sprint: '计划中',
  in_progress: '进行中', verify: '待确认', done: '已完成',
};
const PRIORITY_LABELS = { urgent: 'S', high: 'A', medium: 'B', low: 'C', S: 'S', A: 'A', B: 'B', C: 'C', D: 'L', L: 'L' };
const PRIORITY_ORDER = { urgent: 0, S: 0, high: 1, A: 1, medium: 2, B: 2, low: 3, C: 3, D: 4, L: 4 };

function toLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateDiffInDays(dateString, todayKey) {
  if (!dateString) return null;
  const target = new Date(`${String(dateString).slice(0, 10)}T00:00:00`);
  const today = new Date(`${todayKey}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target - today) / 86400000);
}

function formatRelativeDate(dateString, todayKey) {
  const diff = dateDiffInDays(dateString, todayKey);
  if (diff === null) return '未设截止日期';
  if (diff < 0) return `逾期 ${Math.abs(diff)} 天`;
  if (diff === 0) return '今天截止';
  if (diff === 1) return '明天截止';
  if (diff <= 7) return `${diff} 天后截止`;
  return `${String(dateString).slice(5, 7)}月${String(dateString).slice(8, 10)}日`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projectId, projects } = useProject();
  const { theme } = useTheme();
  const toast = useToast();
  const c = theme.colors;
  const [stats, setStats] = useState(null);
  const [risks, setRisks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [literature, setLiterature] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [showQuickTaskModal, setShowQuickTaskModal] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const todayKey = toLocalDateKey();
  const currentProject = projects.find((project) => project.id === projectId);

  const load = async () => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [dashboardData, riskData, taskData, logData, literatureData] = await Promise.all([
        api.getProjectStats(projectId),
        api.getRisks({ project_id: projectId }),
        api.getAgileTasks({ project_id: projectId }),
        api.getDailyLogs({ project_id: projectId }),
        api.getLiterature({ project_id: projectId }),
      ]);
      setStats(dashboardData);
      setMilestones(dashboardData.milestones || []);
      setRisks(Array.isArray(riskData) ? riskData : []);
      setTasks((Array.isArray(taskData) ? taskData : []).map((task) => ({ ...task, _priority: task.priority === 'D' ? 'L' : (task.priority || 'B') })));
      setDailyLogs(Array.isArray(logData) ? logData : []);
      setLiterature(Array.isArray(literatureData) ? literatureData : []);
    } catch (e) {
      setError(e.message);
      toast.error('加载工作台数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const todayLog = dailyLogs.find((log) => String(log.date).slice(0, 10) === todayKey);
  const pendingTasks = useMemo(() => tasks.filter((task) => task.status !== 'done'), [tasks]);
  const overdueTasks = useMemo(() => pendingTasks.filter((task) => dateDiffInDays(task.due_date, todayKey) < 0), [pendingTasks, todayKey]);
  const dueTodayTasks = useMemo(() => pendingTasks.filter((task) => dateDiffInDays(task.due_date, todayKey) === 0), [pendingTasks, todayKey]);
  const inProgressTasks = useMemo(() => pendingTasks.filter((task) => task.status === 'in_progress'), [pendingTasks]);
  const sortedPendingTasks = useMemo(() => [...pendingTasks].sort((left, right) => {
    if (left.status === 'in_progress' && right.status !== 'in_progress') return -1;
    if (right.status === 'in_progress' && left.status !== 'in_progress') return 1;
    const leftDue = dateDiffInDays(left.due_date, todayKey) ?? Number.MAX_SAFE_INTEGER;
    const rightDue = dateDiffInDays(right.due_date, todayKey) ?? Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) return leftDue - rightDue;
    return (PRIORITY_ORDER[left._priority] ?? 9) - (PRIORITY_ORDER[right._priority] ?? 9);
  }), [pendingTasks, todayKey]);
  const focusTask = sortedPendingTasks[0] || null;
  const dailyTasks = useMemo(() => {
    const importantIds = new Set([...overdueTasks, ...dueTodayTasks, ...inProgressTasks].map((task) => task.id));
    return [...sortedPendingTasks.filter((task) => importantIds.has(task.id)), ...sortedPendingTasks.filter((task) => !importantIds.has(task.id))].slice(0, 5);
  }, [dueTodayTasks, inProgressTasks, overdueTasks, sortedPendingTasks]);
  const openRisks = risks.filter((risk) => !['closed', 'resolved', 'done'].includes(risk.status));
  const readingLiterature = literature.filter((item) => item.status === 'reading');
  const unverifiedLiterature = literature.filter((item) => String(item.tags || '').includes('待核验'));
  const recentLiterature = literature.slice(0, 2);
  const upcomingMilestones = [...milestones].filter((item) => item.status !== 'completed').sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
  const taskCompletionRate = tasks.length ? Math.round(tasks.filter((task) => task.status === 'done').length / tasks.length * 100) : 0;

  const handleTaskStatus = async (task, nextStatus) => {
    const previousStatus = task.status;
    if (previousStatus === nextStatus || updatingTaskId) return;
    setUpdatingTaskId(task.id);
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: nextStatus } : item));
    try {
      await api.updateAgileTask(task.id, { status: nextStatus });
      setStats((current) => current ? { ...current, doneTasks: Math.max(0, (current.doneTasks || 0) + (nextStatus === 'done' ? 1 : previousStatus === 'done' ? -1 : 0)) } : current);
      toast.success(nextStatus === 'done' ? '任务已完成，今天又向前一步' : '已设为进行中');
    } catch (e) {
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: previousStatus } : item));
      toast.error(`更新失败：${e.message}`);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleCreateQuickTask = async (data) => {
    try {
      const created = await api.createAgileTask({
        project_id: projectId,
        title: data.title,
        priority: data.priority,
        status: 'todo',
        due_date: data.doToday ? todayKey : null,
      });
      setTasks((current) => [{ ...created, _priority: created.priority === 'D' ? 'L' : (created.priority || 'B') }, ...current]);
      setShowQuickTaskModal(false);
      toast.success(data.doToday ? '已加入今日推进' : '下一步已记下');
    } catch (e) {
      toast.error(`创建失败：${e.message}`);
    }
  };

  const handleStartFocus = async () => {
    if (!focusTask) { setShowQuickTaskModal(true); return; }
    if (focusTask.status !== 'in_progress') await handleTaskStatus(focusTask, 'in_progress');
    else navigate('/attendance');
  };

  const handleCreateDailyPlan = async () => {
    if (todayLog) { navigate('/agile/standup'); return; }
    setCreatingPlan(true);
    try {
      const created = await api.createDailyLog({
        project_id: projectId,
        date: todayKey,
        yesterday: '',
        today: dailyTasks.slice(0, 3).map((task) => `- ${task.title}`).join('\n'),
        blockers: overdueTasks.length ? `优先处理 ${overdueTasks.length} 个逾期任务` : '',
        notes: '由今日工作台生成，可继续补充进展与复盘。',
      });
      setDailyLogs((current) => [created, ...current]);
      toast.success('今日计划已生成');
      navigate('/agile/standup');
    } catch (e) {
      toast.error(`生成失败：${e.message}`);
    } finally {
      setCreatingPlan(false);
    }
  };

  const handleToggleMilestone = async (milestone) => {
    if (milestone.status === 'completed') return;
    try {
      await api.updateMilestone(milestone.id, { status: 'completed' });
      setMilestones((current) => current.map((item) => item.id === milestone.id ? { ...item, status: 'completed' } : item));
      toast.success(`「${milestone.name.replace(/M\d+：/, '')}」已达成`);
    } catch (e) { toast.error(`更新失败：${e.message}`); }
  };

  const handleCreateMilestone = async (data) => {
    try {
      const created = await api.createMilestone({ ...data, project_id: projectId });
      setMilestones((current) => [...current, created]);
      setShowMilestoneModal(false);
      toast.success('里程碑创建成功');
    } catch (e) { toast.error(`创建失败：${e.message}`); }
  };

  const handleDeleteMilestone = async (milestone) => {
    if (!confirm(`确定删除里程碑「${milestone.name}」？`)) return;
    try {
      await api.deleteMilestone(milestone.id);
      setMilestones((current) => current.filter((item) => item.id !== milestone.id));
      toast.success('里程碑已删除');
    } catch (e) { toast.error(`删除失败：${e.message}`); }
  };

  if (loading) return <div className="space-y-5 max-w-[1500px] mx-auto"><div className="h-10 w-64 bg-slate-200/40 rounded-xl animate-pulse" /><div className="h-[310px] rounded-[28px] bg-slate-200/40 animate-pulse" /><div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><div className="lg:col-span-2"><SkeletonCard /></div><SkeletonCard /></div></div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const focusDescription = overdueTasks.length
    ? `有 ${overdueTasks.length} 项已经逾期，先清掉最靠前的一项，重新找回节奏。`
    : focusTask ? '把今天最清醒的一段时间留给它，先推进到一个可以交付的小结果。' : '当前没有待推进任务，可以补充一个清晰的下一步。';

  return (
    <div className="workbench-shell space-y-5 max-w-[1500px] mx-auto pb-8">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 workbench-reveal">
        <div><div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.22em] uppercase text-slate-400 mb-2"><span className="w-7 h-px" style={{ background: c.accent }} />Research Day</div><h1 className="text-2xl md:text-[28px] font-bold text-slate-900 tracking-tight">{getGreeting()}，{user?.name || '今天也要稳步推进'}</h1><p className="text-sm text-slate-400 mt-1">{currentProject?.name || '当前项目'} · 推进一件事，核验一个证据，留下一条记录</p></div>
        <div className="flex items-center gap-2 self-start sm:self-auto text-xs text-slate-500 px-3 py-2 rounded-xl bg-white/60 border border-white/80 shadow-sm"><Calendar size={14} style={{ color: c.accent }} /><span>{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span></div>
      </header>

      <section className="workbench-briefing workbench-reveal workbench-reveal-delay-1" style={{ background: `linear-gradient(135deg, ${c.sidebarFrom} 0%, ${c.sidebarTo} 100%)`, '--briefing-accent': c.accent, '--briefing-glow': c.sidebarGlow }}>
        <div className="relative z-10 grid lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.65fr)] gap-6 lg:gap-8 p-5 md:p-6">
          <div className="flex flex-col justify-between min-h-[178px]">
            <div><div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-[11px] font-semibold text-white/70 mb-4"><Sparkles size={12} />今日第一优先级</div><h2 className="text-2xl md:text-[30px] font-bold text-white leading-tight tracking-tight max-w-3xl">{focusTask?.title || '先写下一个清晰、可完成的下一步'}</h2><p className="text-sm text-white/55 mt-2.5 max-w-2xl leading-relaxed">{focusDescription}</p>{focusTask && <div className="flex flex-wrap gap-2 mt-3 text-[11px] text-white/65"><span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10">{STATUS_LABELS[focusTask.status] || focusTask.status}</span><span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10">优先级 {PRIORITY_LABELS[focusTask._priority] || focusTask._priority}</span><span className={`px-2.5 py-1 rounded-full border ${dateDiffInDays(focusTask.due_date, todayKey) < 0 ? 'bg-red-400/15 border-red-300/20 text-red-100' : 'bg-white/10 border-white/10'}`}>{formatRelativeDate(focusTask.due_date, todayKey)}</span></div>}</div>
            <div className="flex flex-wrap gap-3 mt-5"><button onClick={handleStartFocus} disabled={updatingTaskId === focusTask?.id} className="workbench-primary-action">{updatingTaskId === focusTask?.id ? <Loader2 size={16} className="animate-spin" /> : focusTask?.status === 'in_progress' ? <Timer size={16} /> : <Zap size={16} />}{focusTask ? (focusTask.status === 'in_progress' ? '开始专注' : '开始这项任务') : '添加下一步'}</button><button onClick={() => navigate('/agile/board')} className="workbench-secondary-action"><Kanban size={16} />任务推进</button></div>
          </div>
          <div className="rounded-[22px] bg-white/[0.07] border border-white/10 p-5 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/40">Project Rhythm</p><h3 className="text-base font-semibold text-white mt-1">{todayLog ? '今天已经有计划' : '今天等待开始'}</h3></div><div className="workbench-progress-ring" style={{ background: `conic-gradient(${c.accentLight || c.accent} ${taskCompletionRate * 3.6}deg, rgba(255,255,255,0.1) 0deg)` }} aria-label={`任务完成率 ${taskCompletionRate}%`}><span>{taskCompletionRate}%</span></div></div>
            <div className="grid grid-cols-3 gap-2 mt-6"><BriefingMetric value={pendingTasks.length} label="待推进" /><BriefingMetric value={inProgressTasks.length} label="进行中" /><BriefingMetric value={overdueTasks.length} label="已逾期" alert={overdueTasks.length > 0} /></div>
            <button onClick={() => navigate('/agile/my-tasks')} className="w-full flex items-center justify-between mt-5 pt-4 border-t border-white/10 text-xs text-white/55 hover:text-white transition-colors"><span>查看当前项目的全部任务</span><ArrowRight size={14} /></button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.7fr)] gap-4 workbench-reveal workbench-reveal-delay-2">
        <div className="workbench-panel p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 mb-5"><div><div className="flex items-center gap-2"><Target size={17} style={{ color: c.accent }} /><h2 className="text-base font-bold text-slate-900">今日推进</h2></div><p className="text-xs text-slate-400 mt-1.5">按截止时间、状态和优先级自动排好顺序</p></div><button onClick={() => navigate('/agile/my-tasks')} className="text-xs font-semibold text-slate-400 hover:text-slate-700 flex items-center gap-1">全部任务<ChevronRight size={13} /></button></div>
          {dailyTasks.length ? <div className="space-y-2">{dailyTasks.map((task, index) => <DailyTaskRow key={task.id} task={task} index={index} todayKey={todayKey} accent={c.accent} updating={updatingTaskId === task.id} onStart={() => task.status === 'in_progress' ? navigate('/attendance') : handleTaskStatus(task, 'in_progress')} onComplete={() => handleTaskStatus(task, 'done')} />)}</div> : <EmptyPanel icon={CheckCircle2} title="今天没有待推进任务" description="补充一个下一步，让项目继续向前。" action="添加下一步" onAction={() => setShowQuickTaskModal(true)} />}
        </div>
        <div className="space-y-4">
          <div className="workbench-panel p-5"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><div className={`w-10 h-10 rounded-xl flex items-center justify-center ${todayLog ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{todayLog ? <ClipboardCheck size={19} /> : <CalendarCheck2 size={19} />}</div><div><h3 className="text-sm font-bold text-slate-800">今日记录</h3><p className="text-xs text-slate-400 mt-1">{todayLog ? '计划已记录，结束前补充复盘' : '还没有今天的计划记录'}</p></div></div><span className={`text-[10px] font-bold px-2 py-1 rounded-full ${todayLog ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{todayLog ? '已记录' : '待完成'}</span></div><button onClick={handleCreateDailyPlan} disabled={creatingPlan} className="mt-4 w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all" style={{ background: c.accent50, color: c.accent, border: `1px solid ${c.accent100}` }}>{creatingPlan && <Loader2 size={14} className="animate-spin" />}{todayLog ? '打开今日记录' : '按优先任务生成计划'}</button></div>
          <div className="workbench-panel p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><BookOpen size={19} /></div>
                <div><h3 className="text-sm font-bold text-slate-800">文献与证据</h3><p className="text-xs text-slate-400 mt-1">发现只是入口，核验后才进入证据矩阵</p></div>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-50 text-slate-500">{literature.length} 篇</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button onClick={() => navigate('/agile/literature')} className="rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-3 text-left hover:bg-white hover:shadow-sm transition-all">
                <div className="text-lg font-bold text-slate-800">{readingLiterature.length}</div><div className="text-[10px] text-slate-400 mt-0.5">正在阅读</div>
              </button>
              <button onClick={() => navigate('/agile/literature')} className="rounded-xl bg-amber-50/70 border border-amber-100/70 px-3 py-3 text-left hover:bg-amber-50 transition-all">
                <div className="text-lg font-bold text-amber-700">{unverifiedLiterature.length}</div><div className="text-[10px] text-amber-600/70 mt-0.5">待核验线索</div>
              </button>
            </div>
            {recentLiterature.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {recentLiterature.map((item) => <div key={item.id} className="text-[11px] text-slate-500 truncate">· {item.title}</div>)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => navigate('/agile/literature')} className="btn btn-secondary justify-center text-xs"><Search size={14} />搜索本地文献</button>
              <button onClick={() => navigate('/agile/literature')} className="btn btn-secondary justify-center text-xs"><BookOpen size={14} />打开文献库</button>
            </div>
          </div>
        </div>
      </section>

      <details className="workbench-panel overflow-hidden workbench-reveal workbench-reveal-delay-3">
        <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between gap-4 text-sm font-bold text-slate-700 hover:bg-slate-50/70">
          <span className="flex items-center gap-2"><Gauge size={16} className="text-slate-400" />项目状态与长期信息</span>
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">需要时再展开<ChevronRight size={13} /></span>
        </summary>
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100">
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4"><MetricTile icon={ListTodo} label="待推进任务" value={pendingTasks.length} note={`${inProgressTasks.length} 项正在进行`} color="slate" /><MetricTile icon={AlertTriangle} label="逾期提醒" value={overdueTasks.length} note={overdueTasks.length ? '建议今天优先处理' : '目前没有逾期'} color={overdueTasks.length ? 'red' : 'emerald'} /><MetricTile icon={Flag} label="近期里程碑" value={upcomingMilestones.length} note={upcomingMilestones[0] ? formatRelativeDate(upcomingMilestones[0].due_date, todayKey) : '暂无待达成节点'} color="amber" /><MetricTile icon={Gauge} label="任务完成率" value={`${taskCompletionRate}%`} note={`${tasks.filter((task) => task.status === 'done').length}/${tasks.length} 个任务完成`} color="blue" /></section>
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="workbench-panel p-5 md:p-6"><div className="flex items-center justify-between mb-5"><div><h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><Flag size={16} className="text-amber-500" />近期节点</h2><p className="text-xs text-slate-400 mt-1">盯住接下来最重要的交付点</p></div><button onClick={() => setShowMilestoneModal(true)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50" aria-label="新建里程碑"><Plus size={16} /></button></div>{milestones.length ? <div className="space-y-2">{[...milestones].sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'))).slice(0, 5).map((milestone) => { const completed = milestone.status === 'completed'; const overdue = !completed && dateDiffInDays(milestone.due_date, todayKey) < 0; return <div key={milestone.id} className="group flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-slate-50/70"><button onClick={() => handleToggleMilestone(milestone)} disabled={completed} className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 text-transparent hover:text-emerald-400'}`} aria-label={completed ? '里程碑已完成' : '标记里程碑完成'}><Check size={13} /></button><div className="flex-1 min-w-0"><p className={`text-sm font-medium truncate ${completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{milestone.name}</p><p className={`text-[11px] mt-0.5 ${overdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>{completed ? '已达成' : formatRelativeDate(milestone.due_date, todayKey)}</p></div><button onClick={() => handleDeleteMilestone(milestone)} className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500" aria-label="删除里程碑"><Trash2 size={13} /></button></div>; })}</div> : <EmptyPanel icon={Flag} title="还没有里程碑" description="为项目设置一个清晰的下一节点。" action="创建里程碑" onAction={() => setShowMilestoneModal(true)} compact />}</div>
            <div className="workbench-panel p-5 md:p-6"><div className="flex items-center justify-between mb-5"><div><h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><AlertTriangle size={16} className="text-rose-500" />需要关注</h2><p className="text-xs text-slate-400 mt-1">只展示尚未关闭、影响最大的风险</p></div><button onClick={() => navigate('/agile/risks')} className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1">风险清单<ChevronRight size={13} /></button></div>{openRisks.length ? <div className="space-y-2">{openRisks.slice(0, 5).map((risk) => <button key={risk.id} onClick={() => navigate('/agile/risks')} className="w-full text-left flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-slate-50/70"><span className={`w-2.5 h-2.5 rounded-full shrink-0 ${risk.level === 'high' ? 'bg-rose-500' : risk.level === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} /><div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-700 truncate">{risk.title}</p><p className="text-[11px] text-slate-400 mt-0.5">概率 {risk.probability} × 影响 {risk.impact}</p></div><span className={`text-[10px] font-bold px-2 py-1 rounded-full ${risk.level === 'high' ? 'bg-rose-50 text-rose-600' : risk.level === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{risk.level === 'high' ? '高风险' : risk.level === 'medium' ? '中风险' : '低风险'}</span></button>)}</div> : <EmptyPanel icon={CheckCircle2} title="暂时没有开放风险" description="当前项目状态平稳，继续保持节奏。" action="查看风险清单" onAction={() => navigate('/agile/risks')} compact />}</div>
          </section>
        </div>
      </details>

      <div className="flex items-center justify-center gap-2 pt-1 text-[10px] tracking-[0.14em] uppercase text-slate-300">
        <span>小九科研工作台</span><span>·</span>
        <a href="https://deerflow.tech" target="_blank" rel="noreferrer" className="hover:text-slate-500 transition-colors">Created by Deerflow</a>
      </div>
      <Modal open={showQuickTaskModal} onClose={() => setShowQuickTaskModal(false)} title="记下一个明确的下一步"><QuickTaskForm projectName={currentProject?.name} onCreate={handleCreateQuickTask} onCancel={() => setShowQuickTaskModal(false)} /></Modal>
      <Modal open={showMilestoneModal} onClose={() => setShowMilestoneModal(false)} title="新建里程碑"><MilestoneForm onCreate={handleCreateMilestone} onCancel={() => setShowMilestoneModal(false)} /></Modal>
    </div>
  );
}

function BriefingMetric({ value, label, alert = false }) { return <div className="rounded-xl bg-white/[0.06] border border-white/[0.07] px-3 py-3"><div className={`text-lg font-bold truncate ${alert ? 'text-red-200' : 'text-white'}`}>{value}</div><div className="text-[10px] text-white/40 mt-0.5">{label}</div></div>; }

function DailyTaskRow({ task, index, todayKey, accent, updating, onStart, onComplete }) {
  const overdue = dateDiffInDays(task.due_date, todayKey) < 0;
  const inProgress = task.status === 'in_progress';
  return <div className={`workbench-task-row group ${inProgress ? 'is-active' : ''}`}><div className="w-7 text-[11px] font-bold text-slate-300 tabular-nums">{String(index + 1).padStart(2, '0')}</div><button onClick={onComplete} disabled={updating} className="w-7 h-7 rounded-full border border-slate-200 text-transparent hover:text-emerald-500 hover:border-emerald-400 flex items-center justify-center shrink-0" aria-label={`完成任务：${task.title}`}>{updating ? <Loader2 size={13} className="animate-spin text-slate-400" /> : <Check size={13} />}</button><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><p className="text-sm font-semibold text-slate-700 truncate">{task.title}</p>{inProgress && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">进行中</span>}</div><div className="flex flex-wrap items-center gap-x-3 mt-1 text-[10px] text-slate-400"><span className={overdue ? 'text-red-500 font-semibold' : ''}>{formatRelativeDate(task.due_date, todayKey)}</span><span>优先级 {PRIORITY_LABELS[task._priority] || task._priority}</span></div></div><button onClick={onStart} disabled={updating} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold opacity-100 md:opacity-0 md:group-hover:opacity-100" style={{ color: accent, background: 'rgba(255,255,255,.85)', border: '1px solid rgba(226,232,240,.8)' }}>{inProgress ? <Focus size={13} /> : <Circle size={13} />}{inProgress ? '去专注' : '开始'}</button></div>;
}

function MetricTile({ icon: Icon, label, value, note, color }) {
  const tones = { slate: 'bg-slate-100 text-slate-600', red: 'bg-red-50 text-red-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', blue: 'bg-blue-50 text-blue-600' };
  return <div className="workbench-panel px-4 py-4 flex items-center gap-3 min-w-0"><div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tones[color] || tones.slate}`}><Icon size={18} /></div><div className="min-w-0"><div className="flex items-baseline gap-2"><span className="text-xl font-bold text-slate-900 tabular-nums">{value}</span><span className="text-[10px] font-semibold text-slate-400 truncate">{label}</span></div><p className="text-[10px] text-slate-400 truncate mt-0.5">{note}</p></div></div>;
}

function EmptyPanel({ icon: Icon, title, description, action, onAction, compact = false }) { return <div className={`text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 ${compact ? 'py-7 px-4' : 'py-10 px-5'}`}><Icon size={compact ? 24 : 30} className="mx-auto text-slate-300" /><h3 className="text-sm font-semibold text-slate-600 mt-3">{title}</h3><p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">{description}</p><button onClick={onAction} className="mt-3 text-xs font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">{action}<ArrowRight size={12} /></button></div>; }

function QuickTaskForm({ projectName, onCreate, onCancel }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('B');
  const [doToday, setDoToday] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) { setError('先写下一个可以直接行动的下一步'); return; }
    setSubmitting(true);
    try {
      await onCreate({ title: cleanTitle, priority, doToday });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
        归属项目：<span className="font-semibold text-slate-700">{projectName || '当前项目'}</span>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">下一步要完成什么？</label>
        <input value={title} onChange={(event) => { setTitle(event.target.value); setError(''); }} className={`input ${error ? 'error' : ''}`} autoFocus placeholder="例如：完成实验拆解课程的浏览器验收" />
        {error && <p className="field-error">{error}</p>}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">优先级</label>
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className="select">
            <option value="S">S · 立即处理</option><option value="A">A · 优先处理</option><option value="B">B · 计划推进</option><option value="C">C · 批量处理</option><option value="L">L · 长期积累</option>
          </select>
        </div>
        <label className="h-10 px-3 rounded-xl border border-slate-200 bg-white flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
          <input type="checkbox" checked={doToday} onChange={(event) => setDoToday(event.target.checked)} />今天处理
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onCancel} className="btn btn-secondary">取消</button><button type="submit" disabled={submitting} className="btn btn-primary">{submitting && <Loader2 size={14} className="animate-spin" />}记下下一步</button></div>
    </form>
  );
}

function MilestoneForm({ onCreate, onCancel }) {
  const [form, setForm] = useState({ name: '', due_date: '', criteria: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event) => { event.preventDefault(); if (!form.name.trim()) { setError('请填写里程碑名称'); return; } setSubmitting(true); try { await onCreate(form); } finally { setSubmitting(false); } };
  return <form onSubmit={submit} className="space-y-4"><div><label className="block text-xs font-medium text-slate-500 mb-1.5">名称</label><input value={form.name} onChange={(e) => { setForm((v) => ({ ...v, name: e.target.value })); setError(''); }} className={`input ${error ? 'error' : ''}`} placeholder="例如：完成第一版实验方案" autoFocus />{error && <p className="field-error">{error}</p>}</div><div><label className="block text-xs font-medium text-slate-500 mb-1.5">截止日期</label><input type="date" value={form.due_date} onChange={(e) => setForm((v) => ({ ...v, due_date: e.target.value }))} className="input" /></div><div><label className="block text-xs font-medium text-slate-500 mb-1.5">达成标准</label><textarea value={form.criteria} onChange={(e) => setForm((v) => ({ ...v, criteria: e.target.value }))} className="input" rows={3} placeholder="怎样才算真正完成？" /></div><div className="flex justify-end gap-2 pt-3 border-t border-slate-100"><button type="button" onClick={onCancel} className="btn btn-secondary">取消</button><button type="submit" disabled={submitting} className="btn btn-primary">{submitting && <Loader2 size={14} className="animate-spin" />}创建</button></div></form>;
}
