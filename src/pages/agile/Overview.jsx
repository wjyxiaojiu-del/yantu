import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, BookOpen, CalendarDays, CheckCircle2, CircleDot, Clock3, Gauge, Kanban, ListTodo, Loader2, ShieldAlert, Sparkles, Target, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../context/ThemeContext';
import ErrorState from '../../components/ErrorState';
import { SkeletonCard } from '../../components/LoadingSkeleton';
import api from '../../api';

const PRIORITY_ORDER = { S: 0, A: 1, B: 2, C: 3, L: 4 };
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const daysUntil = (value, today) => value ? Math.round((new Date(`${String(value).slice(0, 10)}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000) : null;

export default function Overview() {
  const navigate = useNavigate();
  const toast = useToast();
  const { theme } = useTheme();
  const { projectId, projects } = useProject();
  const [data, setData] = useState({ stats: null, tasks: [], risks: [], logs: [], literature: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const today = dateKey();
  const project = projects.find((item) => item.id === projectId);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [stats, tasks, risks, logs, literature] = await Promise.all([
        api.getProjectStats(projectId), api.getAgileTasks({ project_id: projectId }), api.getRisks({ project_id: projectId }),
        api.getDailyLogs({ project_id: projectId }), api.getLiterature({ project_id: projectId }),
      ]);
      setData({ stats, tasks: Array.isArray(tasks) ? tasks : [], risks: Array.isArray(risks) ? risks : [], logs: Array.isArray(logs) ? logs : [], literature: Array.isArray(literature) ? literature : [] });
      setError(null);
    } catch (e) { setError(e.message); toast.error('加载科研总览失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]);

  const tasks = data.tasks;
  const pending = tasks.filter((task) => task.status !== 'done');
  const done = tasks.filter((task) => task.status === 'done');
  const inProgress = pending.filter((task) => task.status === 'in_progress');
  const overdue = pending.filter((task) => (daysUntil(task.due_date, today) ?? 1) < 0);
  const dueSoon = pending.filter((task) => { const days = daysUntil(task.due_date, today); return days !== null && days >= 0 && days <= 7; });
  const openRisks = data.risks.filter((risk) => !['closed', 'resolved', 'done'].includes(risk.status));
  const criticalRisks = openRisks.filter((risk) => ['S', 'A'].includes(risk.priority) || risk.level === 'high');
  const completion = tasks.length ? Math.round(done.length / tasks.length * 100) : 0;
  const reading = data.literature.filter((item) => item.status === 'reading').length;
  const todayLog = data.logs.find((log) => String(log.date).slice(0, 10) === today);
  const focus = [...pending].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) || (daysUntil(a.due_date, today) ?? 99) - (daysUntil(b.due_date, today) ?? 99))[0];
  const recentDone = [...done].sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''))).slice(0, 4);
  const insight = overdue.length ? `先处理 ${overdue.length} 项逾期任务，今天不建议再增加新的复杂事项。` : focus ? `建议把今天最清醒的一段时间留给「${focus.title}」。` : '目前没有明确的下一步，可以从最近的复盘里补充一项。';

  if (loading) return <div className="space-y-5 max-w-[1500px] mx-auto"><div className="h-10 w-60 bg-slate-200/40 rounded-xl animate-pulse" /><div className="h-44 rounded-[26px] bg-slate-200/40 animate-pulse" /><div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div></div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return <div className="overview-shell max-w-[1500px] mx-auto space-y-5 pb-8">
    <header className="overview-header workbench-reveal"><div><div className="overview-eyebrow"><CircleDot size={12} /> RESEARCH OVERVIEW</div><h1>科研总览</h1><p>{project?.name || '当前项目'} · 看全局，再决定今天把力气放在哪里。</p></div><button className="overview-date" onClick={() => navigate('/calendar')}><CalendarDays size={14} /> {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</button></header>

    <section className="overview-hero workbench-reveal workbench-reveal-delay-1" style={{ '--overview-accent': theme.colors.accent }}><div><span><Sparkles size={13} /> 当前判断</span><h2>{insight}</h2><p>数据来自任务推进、风险管控、每日记录和文献库。</p><div className="flex flex-wrap gap-2 mt-5"><button onClick={() => navigate(focus ? '/agile/board' : '/agile/standup')}><Target size={14} /> {focus ? '打开推进台' : '写下下一步'}</button><button onClick={() => navigate('/agile/standup')}><Clock3 size={14} /> {todayLog ? '查看今日复盘' : '补充今日记录'}</button></div></div><div className="overview-hero-ring" style={{ background: `conic-gradient(${theme.colors.accentLight || theme.colors.accent} ${completion * 3.6}deg, rgba(255,255,255,.1) 0deg)` }}><strong>{completion}%</strong><span>任务完成率</span></div></section>

    <section className="overview-kpi-grid workbench-reveal workbench-reveal-delay-2"><Kpi icon={ListTodo} label="待推进任务" value={pending.length} note={`${inProgress.length} 项正在进行`} tone="blue" onClick={() => navigate('/agile/board')} /><Kpi icon={AlertTriangle} label="逾期任务" value={overdue.length} note={overdue.length ? '需要优先处理' : '目前没有逾期'} tone={overdue.length ? 'red' : 'green'} onClick={() => navigate('/agile/board')} /><Kpi icon={ShieldAlert} label="开放风险" value={openRisks.length} note={`${criticalRisks.length} 项 S/A 级关注`} tone={criticalRisks.length ? 'orange' : 'green'} onClick={() => navigate('/agile/risks')} /><Kpi icon={BookOpen} label="正在阅读" value={reading} note={`${data.literature.length} 篇文献在库`} tone="violet" onClick={() => navigate('/agile/literature')} /></section>

    <section className="overview-main-grid workbench-reveal workbench-reveal-delay-3"><div className="overview-panel"><PanelTitle icon={Kanban} title="本周节奏" note="从待办到完成，研究是否在流动" action="查看任务" onClick={() => navigate('/agile/board')} /><div className="overview-flow"><FlowStep label="待办" value={tasks.filter((task) => ['todo', 'backlog', 'this_sprint'].includes(task.status)).length} tone="slate" /><FlowArrow /><FlowStep label="进行中" value={inProgress.length} tone="amber" /><FlowArrow /><FlowStep label="待确认" value={tasks.filter((task) => task.status === 'verify').length} tone="blue" /><FlowArrow /><FlowStep label="已完成" value={done.length} tone="green" /></div><div className="overview-bar"><span style={{ width: `${completion}%`, background: theme.colors.accent }} /></div><div className="overview-bar-caption"><span>完成进度</span><b>{completion}%</b></div></div><div className="overview-panel"><PanelTitle icon={CalendarDays} title="接下来 7 天" note="截止日期和日程的交叉提醒" action="打开日历" onClick={() => navigate('/calendar')} /><div className="overview-list">{dueSoon.slice(0, 4).map((task) => <button key={task.id} onClick={() => navigate('/agile/board')}><span className="overview-list-dot" /><div><b>{task.title}</b><small>{daysUntil(task.due_date, today) === 0 ? '今天截止' : `${daysUntil(task.due_date, today)} 天后截止`}</small></div><ArrowRight size={13} /></button>)}{!dueSoon.length && <EmptyOverview icon={CalendarDays} text="接下来 7 天没有临近截止任务" />}</div></div></section>

    <section className="overview-bottom-grid"><div className="overview-panel"><PanelTitle icon={ShieldAlert} title="需要关注" note="风险与阻塞，不让它们悄悄积累" action="风险清单" onClick={() => navigate('/agile/risks')} />{openRisks.length ? <div className="overview-list">{openRisks.slice(0, 4).map((risk) => <button key={risk.id} onClick={() => navigate('/agile/risks')}><span className={`overview-list-dot risk-${risk.priority || risk.level || 'B'}`} /><div><b>{risk.title}</b><small>{risk.priority ? `${risk.priority} 级 · ` : ''}{risk.status === 'monitoring' ? '关注中' : risk.status}</small></div><ArrowRight size={13} /></button>)}</div> : <EmptyOverview icon={CheckCircle2} text="目前没有开放风险，保持这个状态。" />}</div><div className="overview-panel"><PanelTitle icon={CheckCircle2} title="最近完成" note="已经留下的进展，也是继续前进的证据" action="任务推进" onClick={() => navigate('/agile/board')} />{recentDone.length ? <div className="overview-list">{recentDone.map((task) => <button key={task.id} onClick={() => navigate('/agile/board')}><span className="overview-list-dot done" /><div><b>{task.title}</b><small>已完成</small></div><CheckCircle2 size={14} className="text-emerald-500" /></button>)}</div> : <EmptyOverview icon={Gauge} text="还没有完成记录，先推进一件小事。" />}</div><div className="overview-panel"><PanelTitle icon={Timer} title="研究资产" note="文献、复盘与持续积累" action="文献与证据" onClick={() => navigate('/agile/literature')} /><div className="overview-asset-grid"><button onClick={() => navigate('/agile/literature')}><BookOpen size={15}/><strong>{data.literature.length}</strong><span>文献在库</span></button><button onClick={() => navigate('/agile/standup')}><Clock3 size={15}/><strong>{data.logs.length}</strong><span>每日记录</span></button><button onClick={() => navigate('/calendar')}><CalendarDays size={15}/><strong>{dueSoon.length}</strong><span>近期截止</span></button></div></div></section>
  </div>;
}

function Kpi({ icon: Icon, label, value, note, tone, onClick }) { return <button className={`overview-kpi tone-${tone}`} onClick={onClick}><span className="overview-kpi-icon"><Icon size={17}/></span><span><strong>{value}</strong><b>{label}</b><small>{note}</small></span><ArrowRight size={13} /></button>; }
function PanelTitle({ icon: Icon, title, note, action, onClick }) { return <div className="overview-panel-title"><div><div><Icon size={15}/><h2>{title}</h2></div><p>{note}</p></div><button onClick={onClick}>{action}<ArrowRight size={12}/></button></div>; }
function FlowStep({ label, value, tone }) { return <div className="overview-flow-step"><span className={`flow-step-dot ${tone}`} /><strong>{value}</strong><small>{label}</small></div>; }
function FlowArrow() { return <ArrowRight size={15} className="text-slate-300" />; }
function EmptyOverview({ icon: Icon, text }) { return <div className="overview-empty"><Icon size={21}/><span>{text}</span></div>; }
