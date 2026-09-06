import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BrainCircuit, CalendarRange, CheckCircle2,
  CircleAlert, Clock3, FileText, Flag, Lightbulb, Loader2, NotebookPen,
  RefreshCw, Save, ShieldAlert, Sparkles, Target, TrendingUp, Link2,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import ErrorState from '../../components/ErrorState';
import api from '../../api';

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function getWeek(date) {
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: localDateKey(start), end: localDateKey(end) };
}

function formatRange(week) {
  return week.start.replace(/-/g, '.') + ' — ' + week.end.slice(5).replace('-', '.');
}

const EMPTY_DRAFT = { summary: '', strengths: '', gaps: '', nextFocus: ['', '', ''], userNotes: '' };

export default function WeeklyReview() {
  const { projectId, projects } = useProject();
  const toast = useToast();
  const [cursor, setCursor] = useState(new Date());
  const [snapshot, setSnapshot] = useState(null);
  const [review, setReview] = useState(null);
  const [history, setHistory] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [error, setError] = useState(null);
  const week = useMemo(() => getWeek(cursor), [cursor]);
  const project = projects.find((item) => item.id === projectId);

  const applyReview = useCallback((nextReview) => {
    setReview(nextReview || null);
    if (!nextReview) return;
    const focus = Array.isArray(nextReview.next_focus) ? nextReview.next_focus : [];
    setDraft({
      summary: nextReview.summary || '',
      strengths: nextReview.strengths || '',
      gaps: nextReview.gaps || '',
      nextFocus: [focus[0] || '', focus[1] || '', focus[2] || ''],
      userNotes: nextReview.user_notes || '',
    });
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [summary, past] = await Promise.all([
        api.getWeeklyReviewSummary({ projectId, weekStart: week.start, weekEnd: week.end }),
        api.getWeeklyReviews({ projectId, limit: 8 }),
      ]);
      setSnapshot(summary?.snapshot || null);
      applyReview(summary?.review);
      setHistory(Array.isArray(past) ? past : []);
      setError(null);
    } catch (err) {
      setError(err.message);
      toast.error('加载周复盘失败');
    } finally {
      setLoading(false);
    }
  }, [applyReview, projectId, toast, week.end, week.start]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!agentBusy || !review?.id) return undefined;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const next = await api.getWeeklyReview(review.id);
        if (cancelled) return;
        applyReview(next);
        setReview(next);
        if (['ready', 'agent_failed'].includes(next.status) || attempts >= 20) {
          setAgentBusy(false);
          if (next.status === 'ready') toast.success('Codex 周复盘已经回来了');
          if (next.status === 'agent_failed') toast.error('Codex 复盘失败，但规则摘要仍然保留');
          return;
        }
      } catch { /* worker may still be processing */ }
      if (!cancelled) window.setTimeout(poll, 3000);
    };
    const timer = window.setTimeout(poll, 1800);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [agentBusy, applyReview, review?.id, toast]);

  const moveWeek = (offset) => {
    setCursor((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + offset * 7);
      return next;
    });
  };

  const ensureReview = async (requestAgent) => {
    const result = await api.createWeeklyReview({
      projectId,
      weekStart: week.start,
      weekEnd: week.end,
      requestAgent: Boolean(requestAgent),
    });
    setSnapshot(result.snapshot);
    applyReview(result.review);
    setReview(result.review);
    if (result.job) setAgentBusy(true);
    return result.review;
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const current = await ensureReview(false);
      const updated = await api.updateWeeklyReview(current.id, draft);
      applyReview(updated);
      setReview(updated);
      toast.success('本周复盘已保存');
    } catch (err) {
      toast.error('保存失败：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const requestAgent = async () => {
    setAgentBusy(true);
    try {
      const result = await ensureReview(true);
      if (!result || !result.id) setAgentBusy(false);
      toast.success('已提交 Codex，Worker 完成后会自动回填');
    } catch (err) {
      setAgentBusy(false);
      toast.error('提交失败：' + err.message);
    }
  };

  if (loading) return <WeeklyReviewLoading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const metrics = snapshot?.metrics || {};
  const evidence = snapshot?.evidence || {};
  const strengths = draft.strengths || (snapshot?.strengths || []).map((value) => '- ' + value).join('\n');
  const gaps = draft.gaps || (snapshot?.gaps || []).map((value) => '- ' + value).join('\n');
  const statusLabel = { draft: '尚未保存', agent_queued: '等待 Codex', ready: '已完成', agent_failed: '规则摘要可用' }[review?.status] || '规则摘要';

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-8">
      <header className="relative overflow-hidden rounded-[26px] border border-violet-100/80 bg-[#fbfaff] px-7 py-6 workbench-reveal">
        <div className="absolute -right-12 -top-20 h-56 w-56 rounded-full bg-violet-200/25 blur-3xl" />
        <div className="relative flex items-end justify-between gap-8">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-violet-700/70"><CalendarRange size={13} /> WEEKLY REFLECTION</div>
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900">每周复盘</h1>
            <p className="mt-1.5 text-sm text-slate-500">{project?.name || '当前项目'} · 回看事实，再决定下周把力气放在哪里。</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary p-2" onClick={() => moveWeek(-1)} aria-label="上一周"><ArrowLeft size={15} /></button>
            <div className="min-w-[190px] rounded-xl border border-violet-100 bg-white/75 px-3 py-2 text-center text-xs font-semibold text-slate-700">{formatRange(week)}</div>
            <button className="btn btn-secondary p-2" onClick={() => moveWeek(1)} aria-label="下一周"><ArrowRight size={15} /></button>
            <button className="btn btn-secondary p-2" onClick={load} aria-label="刷新"><RefreshCw size={14} /></button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-6 gap-3 workbench-reveal workbench-reveal-delay-1">
        <Metric icon={CheckCircle2} label="完成任务" value={metrics.task_completed || 0} note={(metrics.task_total || 0) + ' 项纳入本周'} tone="green" />
        <Metric icon={CircleAlert} label="逾期任务" value={metrics.task_overdue || 0} note={metrics.task_overdue ? '需要在下周先处理' : '没有逾期证据'} tone={metrics.task_overdue ? 'red' : 'slate'} />
        <Metric icon={NotebookPen} label="每日记录" value={metrics.daily_log_count || 0} note={(metrics.blocker_count || 0) + ' 天出现阻塞'} tone="blue" />
        <Metric icon={ShieldAlert} label="开放风险" value={metrics.open_risk_count || 0} note="只统计尚未关闭的风险" tone={metrics.open_risk_count ? 'orange' : 'green'} />
        <Metric icon={Clock3} label="专注时长" value={metrics.focus_hours || 0} note={(metrics.focus_days || 0) + ' 个专注日'} tone="violet" />
        <Metric icon={Link2} label="研究链路" value={metrics.research_node_count || 0} note={(metrics.research_gap_count || 0) + ' 个缺口'} tone={metrics.research_gap_count ? 'red' : 'blue'} />
      </section>

      <section className="grid grid-cols-[minmax(0,1.4fr)_minmax(340px,0.8fr)] gap-5 workbench-reveal workbench-reveal-delay-2">
        <div className="workbench-panel overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div><div className="flex items-center gap-2"><TrendingUp size={17} className="text-violet-600" /><h2 className="text-base font-bold text-slate-800">事实摘要</h2></div><p className="mt-1 text-xs text-slate-400">先看发生了什么，不把愿望当作进展。</p></div>
            <span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' + (review?.status === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700')}>{statusLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-6">
            <EvidenceBlock icon={CheckCircle2} title="本周完成" tone="green" items={evidence.completed_tasks} empty="没有标记完成的任务" render={(item) => item.title} />
            <EvidenceBlock icon={Flag} title="逾期与缺口" tone="red" items={evidence.overdue_tasks} empty="没有发现逾期任务" render={(item) => item.title + (item.due_date ? ' · 截止 ' + item.due_date : '')} />
            <EvidenceBlock icon={CircleAlert} title="记录里的阻塞" tone="orange" items={evidence.blockers} empty="每日记录里没有写下阻塞" render={(item) => item.date + ' · ' + item.text} />
            <EvidenceBlock icon={ShieldAlert} title="开放风险" tone="violet" items={evidence.risks} empty="目前没有开放风险" render={(item) => (item.priority || 'B') + ' · ' + item.title} />
            <EvidenceBlock icon={Link2} title="研究地图缺口" tone="blue" items={evidence.research_map?.gaps} empty="当前没有结构性链路缺口" render={(item) => item.title + ' · ' + item.message} />
          </div>
        </div>

        <div className="workbench-panel flex flex-col overflow-hidden bg-[#1e1a29] text-white">
          <div className="border-b border-white/10 px-6 py-5"><div className="text-[10px] font-bold tracking-[0.2em] text-violet-200/60">CODEX REFLECTION</div><h2 className="mt-2 text-xl font-bold">让数据产生反馈</h2><p className="mt-2 text-xs leading-5 text-white/50">规则摘要先保证可用；本地 Worker 在线时，再让 Codex 帮你发现重复模式和证据缺口。</p></div>
          <div className="flex-1 px-6 py-5">{review?.agent_analysis ? <pre className="max-h-[310px] overflow-auto whitespace-pre-wrap font-sans text-xs leading-5 text-white/75">{review.agent_analysis}</pre> : <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-5 text-white/60">{snapshot?.rule_summary || '保存本周复盘后，这里会保留规则摘要。'}</div>}</div>
          <div className="space-y-2 px-6 pb-6"><button onClick={requestAgent} disabled={agentBusy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-300 py-3 text-xs font-bold text-violet-950 hover:bg-violet-200 disabled:opacity-50">{agentBusy ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />} {agentBusy ? '等待本地 Codex Worker…' : '请求 Codex 深度复盘'}</button><p className="text-center text-[10px] text-white/35">只读分析，不会执行删除、上传或外部提交。</p></div>
        </div>
      </section>

      <section className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
        <div className="workbench-panel p-6">
          <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Target size={17} className="text-amber-600" /><h2 className="text-base font-bold text-slate-800">把复盘写成下一步</h2></div><p className="mt-1 text-xs text-slate-400">只保留能改变下周节奏的内容，避免写成流水账。</p></div><button onClick={saveDraft} disabled={saving} className="btn btn-primary gap-1.5">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} 保存本周复盘</button></div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <ReviewTextarea label="本周做得好的地方" value={draft.strengths || strengths} onChange={(value) => setDraft((current) => ({ ...current, strengths: value }))} placeholder="哪些事实说明你在推进？" />
            <ReviewTextarea label="本周的不足与缺口" value={draft.gaps || gaps} onChange={(value) => setDraft((current) => ({ ...current, gaps: value }))} placeholder="哪些问题重复出现？" />
          </div>
          <div className="mt-4"><ReviewTextarea label="我的一段总结" value={draft.summary} onChange={(value) => setDraft((current) => ({ ...current, summary: value }))} placeholder="用几句话写下本周最重要的判断。" rows={3} /></div>
          <div className="mt-4"><ReviewTextarea label="给下周自己的备注" value={draft.userNotes} onChange={(value) => setDraft((current) => ({ ...current, userNotes: value }))} placeholder="需要提醒未来自己的话。" rows={2} /></div>
        </div>
        <div className="workbench-panel p-6">
          <div className="flex items-center gap-2"><Lightbulb size={17} className="text-amber-500" /><h2 className="text-base font-bold text-slate-800">下周三项重点</h2></div><p className="mt-1 text-xs leading-5 text-slate-400">少一点，才更可能真的完成。</p>
          <div className="mt-5 space-y-3">{[0, 1, 2].map((index) => <div key={index} className="flex items-start gap-2.5"><span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">{index + 1}</span><input className="input py-2.5 text-xs" value={draft.nextFocus[index] || ''} onChange={(event) => setDraft((current) => ({ ...current, nextFocus: current.nextFocus.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} placeholder={snapshot?.next_focus?.[index] || '写一项可验收的重点'} /></div>)}</div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-4">
        <AssetCard icon={FileText} title="新增文献" value={metrics.literature_added || 0} note="本周进入项目库的文献" items={evidence.literature} render={(item) => item.title} tone="violet" />
        <AssetCard icon={Sparkles} title="收集箱捕捉" value={metrics.inbox_captured || 0} note="本周记下的想法和事项" items={evidence.inbox} render={(item) => item.title + ' · ' + item.item_type} tone="amber" />
        <AssetCard icon={NotebookPen} title="每日记录证据" value={metrics.daily_log_count || 0} note="本周留下的过程记录" items={evidence.daily_logs} render={(item) => item.date + ' · ' + (item.today || item.notes || '已记录')} tone="blue" />
      </section>

      <section className="workbench-panel p-6">
        <div className="flex items-center justify-between"><div><div className="flex items-center gap-2"><TrendingUp size={16} className="text-slate-400" /><h2 className="text-base font-bold text-slate-800">历史复盘</h2></div><p className="mt-1 text-xs text-slate-400">每周留下一个可回看的判断，才看得见长期变化。</p></div><span className="text-xs text-slate-400">{history.length} 条</span></div>
        <div className="mt-4 grid grid-cols-4 gap-2">{history.map((item) => <button key={item.id} onClick={() => { if (item.week_start === week.start) applyReview(item); }} className={'rounded-xl border p-3 text-left ' + (item.week_start === week.start ? 'border-violet-200 bg-violet-50/60' : 'border-slate-100 bg-slate-50/50')}><span className="block text-[10px] font-semibold text-slate-500">{item.week_start} — {item.week_end?.slice(5)}</span><strong className="mt-2 block text-lg text-slate-800">{item.task_completed || 0}<small className="ml-1 text-[10px] font-normal text-slate-400">项完成</small></strong><span className="mt-1 block text-[10px] text-slate-400">{item.status === 'ready' ? 'Codex 已分析' : '规则摘要'}</span></button>)}</div>
      </section>

      <div className="task-flow-signature"><span /><a href="https://deerflow.tech" target="_blank" rel="noreferrer">Created by Deerflow</a><span /></div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, note, tone }) {
  const colors = { green: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700', blue: 'bg-blue-50 text-blue-700', orange: 'bg-orange-50 text-orange-700', violet: 'bg-violet-50 text-violet-700', slate: 'bg-slate-50 text-slate-700' };
  return <div className={'rounded-2xl border border-slate-100 px-4 py-3 ' + (colors[tone] || colors.slate)}><Icon size={15} /><strong className="mt-2 block text-xl">{value}</strong><span className="mt-0.5 block text-xs font-semibold">{label}</span><small className="mt-1 block text-[10px] opacity-60">{note}</small></div>;
}

function EvidenceBlock({ icon: Icon, title, tone, items, empty, render }) {
  const colors = { green: 'text-emerald-600 bg-emerald-50', red: 'text-red-600 bg-red-50', orange: 'text-orange-600 bg-orange-50', violet: 'text-violet-600 bg-violet-50' };
  return <div className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center gap-2"><span className={'flex h-7 w-7 items-center justify-center rounded-lg ' + colors[tone]}><Icon size={14} /></span><h3 className="text-xs font-bold text-slate-700">{title}</h3></div><div className="mt-3 space-y-2">{items?.length ? items.slice(0, 4).map((item, index) => <div key={index} className="truncate text-[11px] text-slate-500">· {render(item)}</div>) : <div className="text-[11px] text-slate-300">{empty}</div>}</div></div>;
}

function ReviewTextarea({ label, value, onChange, placeholder, rows = 5 }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span><textarea className="input resize-y text-xs leading-5" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function AssetCard({ icon: Icon, title, value, note, items, render, tone }) {
  const colors = { violet: 'text-violet-600 bg-violet-50', amber: 'text-amber-600 bg-amber-50', blue: 'text-blue-600 bg-blue-50' };
  return <div className="workbench-panel p-5"><div className="flex items-start justify-between"><div><span className={'flex h-8 w-8 items-center justify-center rounded-xl ' + colors[tone]}><Icon size={15} /></span><h3 className="mt-3 text-sm font-bold text-slate-700">{title}</h3><p className="mt-1 text-[10px] text-slate-400">{note}</p></div><strong className="text-2xl text-slate-800">{value}</strong></div><div className="mt-4 space-y-1.5">{items?.slice(0, 3).map((item, index) => <div key={index} className="truncate text-[11px] text-slate-500">· {render(item)}</div>)}{!items?.length && <div className="text-[11px] text-slate-300">本周没有新增记录</div>}</div></div>;
}

function WeeklyReviewLoading() {
  return <div className="mx-auto max-w-[1500px] space-y-4"><div className="h-36 animate-pulse rounded-[26px] bg-violet-50" /><div className="grid grid-cols-5 gap-3">{[1, 2, 3, 4, 5].map((key) => <div key={key} className="h-28 animate-pulse rounded-2xl bg-white" />)}</div><div className="grid grid-cols-2 gap-5"><div className="h-96 animate-pulse rounded-2xl bg-white" /><div className="h-96 animate-pulse rounded-2xl bg-slate-900/80" /></div></div>;
}
