import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, ArrowRight, BookOpen, CalendarDays, CheckCircle2, Edit3,
  Inbox, Lightbulb, Link2, ListTodo, Loader2, RotateCcw, Search,
  ShieldAlert, Sparkles, StickyNote, Trash2,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import ErrorState from '../../components/ErrorState';
import Modal from '../../components/Modal';
import api from '../../api';

const TYPE_META = {
  idea: { label: '灵感', icon: Lightbulb, color: '#d97706', tint: '#fffbeb' },
  task: { label: '任务', icon: ListTodo, color: '#2563eb', tint: '#eff6ff' },
  link: { label: '文献 / 链接', icon: Link2, color: '#7c3aed', tint: '#f5f3ff' },
  literature: { label: '文献', icon: BookOpen, color: '#7c3aed', tint: '#f5f3ff' },
  schedule: { label: '日程', icon: CalendarDays, color: '#059669', tint: '#ecfdf5' },
  risk: { label: '风险', icon: ShieldAlert, color: '#dc2626', tint: '#fef2f2' },
  note: { label: '随手笔记', icon: StickyNote, color: '#475569', tint: '#f8fafc' },
};

const STATUS_META = {
  unprocessed: { label: '待整理', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  planned: { label: '已保留', className: 'bg-blue-50 text-blue-700 border-blue-100' },
  converted: { label: '已转化', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  archived: { label: '已归档', className: 'bg-slate-50 text-slate-500 border-slate-100' },
};

const CONVERT_META = {
  task: { label: '转为任务', icon: ListTodo, path: '/agile/board' },
  risk: { label: '转为风险', icon: ShieldAlert, path: '/agile/risks' },
  schedule: { label: '转为日程', icon: CalendarDays, path: '/calendar' },
  literature: { label: '转为文献', icon: BookOpen, path: '/agile/literature' },
};

const dateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function relativeTime(value) {
  if (!value) return '刚刚';
  const parsed = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  const seconds = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 1000));
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} 天前`;
  return String(value).slice(0, 10);
}

export default function Backlog() {
  const { projectId } = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const captureRef = useRef(null);
  const [items, setItems] = useState([]);
  const [capture, setCapture] = useState({ title: '', item_type: 'idea' });
  const [view, setView] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await api.getInboxItems({ project_id: projectId });
      setItems(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.message);
      toast.error('收集箱加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    const focusCapture = () => window.setTimeout(() => captureRef.current?.focus(), 40);
    window.addEventListener('workspace:quick-capture', focusCapture);
    return () => window.removeEventListener('workspace:quick-capture', focusCapture);
  }, []);

  const stats = useMemo(() => ({
    pending: items.filter((item) => ['unprocessed', 'planned'].includes(item.status)).length,
    settled: items.filter((item) => ['converted', 'archived'].includes(item.status)).length,
    today: items.filter((item) => String(item.captured_at || '').slice(0, 10) === dateKey()).length,
  }), [items]);

  const visibleItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesView = view === 'all'
        || (view === 'pending' && ['unprocessed', 'planned'].includes(item.status))
        || (view === 'settled' && ['converted', 'archived'].includes(item.status));
      const matchesType = !typeFilter || item.item_type === typeFilter;
      const matchesTerm = !term || [item.title, item.content, item.source_url]
        .some((value) => String(value || '').toLowerCase().includes(term));
      return matchesView && matchesType && matchesTerm;
    });
  }, [items, query, typeFilter, view]);

  const submitCapture = async (event) => {
    event.preventDefault();
    const title = capture.title.trim();
    if (!title || !projectId) return;
    setSaving(true);
    try {
      const looksLikeUrl = /^https?:\/\//i.test(title);
      const created = await api.createInboxItem({
        project_id: projectId,
        title,
        item_type: looksLikeUrl && capture.item_type === 'idea' ? 'link' : capture.item_type,
        source_url: looksLikeUrl ? title : '',
      });
      setItems((current) => [created, ...current]);
      setCapture((current) => ({ ...current, title: '' }));
      toast.success('已经收进来了');
      captureRef.current?.focus();
    } catch (err) {
      toast.error(`收集失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const replaceItem = (updated) => {
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  };

  const archiveItem = async (item) => {
    try {
      const updated = await api.updateInboxItem(item.id, { status: 'archived' });
      replaceItem(updated);
      toast.success('已归档');
    } catch (err) { toast.error(`归档失败：${err.message}`); }
  };

  const restoreItem = async (item) => {
    try {
      const updated = await api.updateInboxItem(item.id, { status: 'unprocessed' });
      replaceItem(updated);
      toast.success('已放回待整理');
    } catch (err) { toast.error(`恢复失败：${err.message}`); }
  };

  const keepAsIdea = async (item) => {
    try {
      const result = await api.convertInboxItem(item.id, { target_type: 'idea' });
      replaceItem(result.item);
      toast.success('已经留在灵感池');
    } catch (err) { toast.error(`保存失败：${err.message}`); }
  };

  const deleteItem = async (item) => {
    if (!window.confirm(`确定删除“${item.title}”？此操作不会删除已经转化出的任务或日程。`)) return;
    try {
      await api.deleteInboxItem(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      toast.success('已从收集箱删除');
    } catch (err) { toast.error(`删除失败：${err.message}`); }
  };

  const saveEdit = async (data) => {
    setSaving(true);
    try {
      const updated = await api.updateInboxItem(modal.item.id, data);
      replaceItem(updated);
      setModal(null);
      toast.success('收集项已更新');
    } catch (err) { toast.error(`保存失败：${err.message}`); }
    finally { setSaving(false); }
  };

  const convertItem = async (data) => {
    setSaving(true);
    try {
      const result = await api.convertInboxItem(modal.item.id, data);
      replaceItem(result.item);
      setModal(null);
      toast.success(`${CONVERT_META[data.target_type]?.label || '转化'}成功`);
    } catch (err) { toast.error(`转化失败：${err.message}`); }
    finally { setSaving(false); }
  };

  if (loading) return <InboxLoading />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <div className="max-w-[1500px] mx-auto space-y-5">
      <header className="relative overflow-hidden rounded-[26px] border border-amber-100/80 bg-[#fffdf8] px-7 py-6 workbench-reveal">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-amber-200/25 blur-3xl" />
        <div className="absolute right-36 -bottom-20 h-40 w-40 rounded-full bg-emerald-100/35 blur-3xl" />
        <div className="relative flex items-end justify-between gap-8">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-amber-700/70">
              <Inbox size={13} /> RESEARCH CAPTURE
            </div>
            <h1 className="text-[28px] font-bold tracking-tight text-slate-900">收集箱</h1>
            <p className="mt-1.5 text-sm text-slate-500">先把念头接住，再决定它要去哪里。不要让分类打断思路。</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatPill value={stats.pending} label="待整理" tone="amber" />
            <StatPill value={stats.today} label="今日捕捉" tone="emerald" />
            <StatPill value={stats.settled} label="已安放" tone="slate" />
          </div>
        </div>
      </header>

      <form onSubmit={submitCapture} className="rounded-[22px] border border-slate-200/70 bg-white p-4 shadow-[0_16px_50px_rgba(15,23,42,0.05)] workbench-reveal workbench-reveal-delay-1">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/10">
            <Sparkles size={17} />
          </div>
          <input
            ref={captureRef}
            value={capture.title}
            onChange={(event) => setCapture((current) => ({ ...current, title: event.target.value }))}
            className="min-w-0 flex-1 border-0 bg-transparent px-1 py-3 text-[17px] font-medium text-slate-800 outline-none placeholder:text-slate-300"
            placeholder="记下一个念头、任务、链接或提醒……"
          />
          <span className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-400">Alt + N</span>
          <button type="submit" disabled={saving || !capture.title.trim()} className="btn btn-primary h-10 px-5 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />} 收进来
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 pl-14">
          <span className="mr-1 text-[11px] text-slate-400">它更像：</span>
          {['idea', 'task', 'link', 'schedule', 'risk', 'note'].map((type) => {
            const meta = TYPE_META[type];
            const Icon = meta.icon;
            const active = capture.item_type === type;
            return (
              <button key={type} type="button" onClick={() => setCapture((current) => ({ ...current, item_type: type }))}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all ${active ? 'border-transparent text-white shadow-sm' : 'border-slate-100 bg-slate-50/70 text-slate-500 hover:border-slate-200 hover:bg-white'}`}
                style={active ? { background: meta.color } : undefined}>
                <Icon size={12} />{meta.label}
              </button>
            );
          })}
        </div>
      </form>

      <div className="grid grid-cols-[210px_minmax(0,1fr)] gap-5 workbench-reveal workbench-reveal-delay-2">
        <aside className="h-fit rounded-[20px] border border-slate-200/70 bg-white p-3">
          <div className="px-2 pb-2 pt-1 text-[10px] font-bold tracking-[0.18em] text-slate-400">整理视图</div>
          {[
            ['pending', '待整理', stats.pending, Inbox],
            ['settled', '已安放', stats.settled, CheckCircle2],
            ['all', '全部记录', items.length, StickyNote],
          ].map(([key, label, count, Icon]) => (
            <button key={key} onClick={() => setView(key)} className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${view === key ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon size={15} /><span>{label}</span><b className={`ml-auto text-[11px] ${view === key ? 'text-white/60' : 'text-slate-300'}`}>{count}</b>
            </button>
          ))}
          <div className="mx-2 my-3 h-px bg-slate-100" />
          <div className="px-2 pb-2 text-[10px] font-bold tracking-[0.18em] text-slate-400">按类型</div>
          <button onClick={() => setTypeFilter('')} className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-xs ${!typeFilter ? 'bg-amber-50 font-semibold text-amber-800' : 'text-slate-500 hover:bg-slate-50'}`}>全部类型</button>
          {Object.entries(TYPE_META).filter(([key]) => key !== 'literature').map(([key, meta]) => {
            const Icon = meta.icon;
            return <button key={key} onClick={() => setTypeFilter(key)} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${typeFilter === key ? 'font-semibold' : 'text-slate-500 hover:bg-slate-50'}`} style={typeFilter === key ? { color: meta.color, background: meta.tint } : undefined}><Icon size={13} />{meta.label}</button>;
          })}
        </aside>

        <section className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="input py-2 pl-9 text-xs" placeholder="在收集箱里搜索……" />
            </div>
            <p className="ml-auto text-xs text-slate-400">{visibleItems.length} 条记录</p>
          </div>

          <div className="space-y-2.5">
            {visibleItems.map((item) => (
              <InboxCard key={item.id} item={item} onEdit={() => setModal({ mode: 'edit', item })}
                onConvert={(target) => setModal({ mode: 'convert', item, target })}
                onKeep={() => keepAsIdea(item)} onArchive={() => archiveItem(item)}
                onRestore={() => restoreItem(item)} onDelete={() => deleteItem(item)}
                onOpenConverted={() => navigate(CONVERT_META[item.converted_type]?.path || '/agile/dashboard')} />
            ))}
            {!visibleItems.length && <EmptyInbox view={view} onFocus={() => captureRef.current?.focus()} />}
          </div>
        </section>
      </div>

      <div className="task-flow-signature"><span /><a href="https://deerflow.tech" target="_blank" rel="noreferrer">Created by Deerflow</a><span /></div>

      <Modal open={modal?.mode === 'edit'} onClose={() => setModal(null)} title="编辑收集项">
        {modal?.mode === 'edit' && <EditInboxForm item={modal.item} saving={saving} onSave={saveEdit} onCancel={() => setModal(null)} />}
      </Modal>
      <Modal open={modal?.mode === 'convert'} onClose={() => setModal(null)} title={CONVERT_META[modal?.target]?.label || '安放收集项'}>
        {modal?.mode === 'convert' && <ConvertForm item={modal.item} target={modal.target} saving={saving} onSave={convertItem} onCancel={() => setModal(null)} />}
      </Modal>
    </div>
  );
}

function StatPill({ value, label, tone }) {
  const tones = {
    amber: 'border-amber-100 bg-amber-50/80 text-amber-800',
    emerald: 'border-emerald-100 bg-emerald-50/80 text-emerald-800',
    slate: 'border-slate-200 bg-white/80 text-slate-700',
  };
  return <div className={`min-w-[92px] rounded-2xl border px-4 py-2.5 ${tones[tone]}`}><strong className="block text-lg leading-none">{value}</strong><span className="mt-1 block text-[10px] opacity-65">{label}</span></div>;
}

function InboxCard({ item, onEdit, onConvert, onKeep, onArchive, onRestore, onDelete, onOpenConverted }) {
  const meta = TYPE_META[item.item_type] || TYPE_META.note;
  const status = STATUS_META[item.status] || STATUS_META.unprocessed;
  const Icon = meta.icon;
  const active = ['unprocessed', 'planned'].includes(item.status);
  return (
    <article className="group rounded-[18px] border border-slate-200/70 bg-white px-4 py-4 shadow-[0_8px_30px_rgba(15,23,42,0.035)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_36px_rgba(15,23,42,0.07)]">
      <div className="flex gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ color: meta.color, background: meta.tint }}><Icon size={17} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-slate-800">{item.title}</h3>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${status.className}`}>{status.label}</span>
                {item.source_type === 'user_story' && <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[9px] text-slate-400">旧事项</span>}
              </div>
              {item.content && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.content}</p>}
              {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer" className="mt-1.5 flex max-w-xl items-center gap-1 truncate text-[11px] text-violet-500 hover:text-violet-700"><Link2 size={10} />{item.source_url}</a>}
            </div>
            <div className="flex shrink-0 items-center gap-1 text-[10px] text-slate-300"><span>{meta.label}</span><span>·</span><span>{relativeTime(item.captured_at)}</span>{item.priority && <span className="ml-1 rounded bg-slate-50 px-1.5 py-0.5 font-bold text-slate-400">{item.priority}</span>}</div>
          </div>

          <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3">
            {active && Object.entries(CONVERT_META).map(([target, info]) => {
              const ActionIcon = info.icon;
              return <button key={target} onClick={() => onConvert(target)} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"><ActionIcon size={12} />{info.label.replace('转为', '')}</button>;
            })}
            {active && item.status !== 'planned' && <button onClick={onKeep} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-amber-600 hover:bg-amber-50"><Lightbulb size={12} />留作灵感</button>}
            {item.status === 'converted' && <button onClick={onOpenConverted} className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100">查看{CONVERT_META[item.converted_type]?.label.replace('转为', '') || '去向'}<ArrowRight size={11} /></button>}
            {item.status === 'archived' && <button onClick={onRestore} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50"><RotateCcw size={12} />放回待整理</button>}
            <div className="ml-auto flex items-center gap-0.5 opacity-30 transition-opacity group-hover:opacity-100">
              {active && <button onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600" aria-label="编辑"><Edit3 size={13} /></button>}
              {active && <button onClick={onArchive} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700" aria-label="归档"><Archive size={13} /></button>}
              <button onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="删除"><Trash2 size={13} /></button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyInbox({ view, onFocus }) {
  return <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/60 px-6 py-16 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 size={21} /></div><h3 className="mt-4 text-sm font-semibold text-slate-700">{view === 'pending' ? '收集箱已经理清了' : '这里还没有记录'}</h3><p className="mt-1 text-xs text-slate-400">{view === 'pending' ? '新的念头出现时，随手接住就好。' : '整理后的任务、日程和文献会留在这里。'}</p>{view === 'pending' && <button onClick={onFocus} className="mt-4 text-xs font-semibold text-amber-700 hover:text-amber-900">记录一个新想法 →</button>}</div>;
}

function EditInboxForm({ item, saving, onSave, onCancel }) {
  const [form, setForm] = useState({ title: item.title || '', content: item.content || '', item_type: item.item_type || 'idea', source_url: item.source_url || '', priority: item.priority || 'B' });
  const submit = (event) => { event.preventDefault(); if (form.title.trim()) onSave({ ...form, title: form.title.trim() }); };
  return <form onSubmit={submit} className="space-y-4"><div><label className="mb-1.5 block text-xs font-medium text-slate-500">标题</label><input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} autoFocus /></div><div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-xs font-medium text-slate-500">类型</label><select className="select" value={form.item_type} onChange={(event) => setForm({ ...form, item_type: event.target.value })}>{Object.entries(TYPE_META).filter(([key]) => key !== 'literature').map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select></div><div><label className="mb-1.5 block text-xs font-medium text-slate-500">优先级</label><select className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{['S', 'A', 'B', 'C', 'L'].map((value) => <option key={value}>{value}</option>)}</select></div></div><div><label className="mb-1.5 block text-xs font-medium text-slate-500">补充说明</label><textarea className="input" rows={3} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></div><div><label className="mb-1.5 block text-xs font-medium text-slate-500">来源链接</label><input className="input" value={form.source_url} onChange={(event) => setForm({ ...form, source_url: event.target.value })} placeholder="https://" /></div><FormActions saving={saving} onCancel={onCancel} label="保存修改" /></form>;
}

function ConvertForm({ item, target, saving, onSave, onCancel }) {
  const [form, setForm] = useState({ target_type: target, priority: item.priority || 'B', due_date: '', schedule_date: dateKey(), schedule_time: '', location: '', note: item.content || '' });
  const submit = (event) => { event.preventDefault(); onSave(form); };
  return <form onSubmit={submit} className="space-y-4"><div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"><span className="text-[10px] font-medium text-slate-400">准备安放</span><p className="mt-1 text-sm font-semibold text-slate-700">{item.title}</p></div>{['task', 'risk'].includes(target) && <div><label className="mb-1.5 block text-xs font-medium text-slate-500">优先级</label><select className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>{['S', 'A', 'B', 'C', 'L'].map((value) => <option key={value}>{value}</option>)}</select></div>}{target === 'task' && <div><label className="mb-1.5 block text-xs font-medium text-slate-500">截止日期（可选）</label><input type="date" className="input" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></div>}{target === 'schedule' && <><div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-xs font-medium text-slate-500">日期</label><input type="date" required className="input" value={form.schedule_date} onChange={(event) => setForm({ ...form, schedule_date: event.target.value })} /></div><div><label className="mb-1.5 block text-xs font-medium text-slate-500">时间</label><input type="time" className="input" value={form.schedule_time} onChange={(event) => setForm({ ...form, schedule_time: event.target.value })} /></div></div><div><label className="mb-1.5 block text-xs font-medium text-slate-500">地点（可选）</label><input className="input" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></div><div><label className="mb-1.5 block text-xs font-medium text-slate-500">备注</label><textarea rows={2} className="input" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></div></>}{target === 'literature' && <p className="rounded-xl border border-violet-100 bg-violet-50/70 p-3 text-xs leading-5 text-violet-700">标题、来源链接和已有说明会进入文献与证据库，阅读状态设为“未读”。</p>}<FormActions saving={saving} onCancel={onCancel} label={CONVERT_META[target]?.label || '确认转化'} /></form>;
}

function FormActions({ saving, onCancel, label }) {
  return <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onCancel} className="btn btn-secondary">取消</button><button type="submit" disabled={saving} className="btn btn-primary">{saving && <Loader2 size={14} className="animate-spin" />}{label}</button></div>;
}

function InboxLoading() {
  return <div className="max-w-[1500px] mx-auto space-y-4"><div className="h-36 animate-pulse rounded-[26px] bg-amber-50" /><div className="h-24 animate-pulse rounded-[22px] bg-white" /><div className="grid grid-cols-[210px_1fr] gap-5"><div className="h-72 animate-pulse rounded-[20px] bg-white" /><div className="space-y-3">{[1, 2, 3].map((key) => <div key={key} className="h-28 animate-pulse rounded-[18px] bg-white" />)}</div></div></div>;
}
