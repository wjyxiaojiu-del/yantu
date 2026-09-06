import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Edit2, FileText, LayoutGrid, ListFilter, Loader2,
  Plus, Rows3, Search, Star, Trash2,
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import { SkeletonCard } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import Modal from '../../components/Modal';
import api from '../../api';

const STATUS_MAP = {
  unread: { label: '未读', color: '#64748b', tint: '#f8fafc' },
  reading: { label: '阅读中', color: '#2563eb', tint: '#eff6ff' },
  done: { label: '已读', color: '#059669', tint: '#ecfdf5' },
  favorite: { label: '重点证据', color: '#d97706', tint: '#fffbeb' },
};
const STATUS_ORDER = ['unread', 'reading', 'done', 'favorite'];
const TAG_PRESETS = ['方法学', '综述', '实验', '理论', '应用', '跨学科', '必读', '待精读'];

function tagsOf(item) {
  return String(item.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
}

export default function Literature() {
  const { projectId } = useProject();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [viewMode, setViewMode] = useState('cards');
  const [modal, setModal] = useState(null);
  const [detailItem, setDetailItem] = useState(null);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLiterature({ project_id: projectId });
      setItems(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filterStatus && item.status !== filterStatus) return false;
      if (filterTag && !tagsOf(item).includes(filterTag)) return false;
      if (!query) return true;
      return [item.title, item.authors, item.journal, item.doi, item.abstract, item.notes, item.tags]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [items, search, filterStatus, filterTag]);

  const tags = useMemo(() => {
    const counts = new Map();
    items.forEach((item) => tagsOf(item).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [items]);

  const handleSave = async (data) => {
    try {
      if (modal.mode === 'create') {
        await api.createLiterature({ ...data, project_id: projectId });
        toast.success('文献已加入本地知识库');
      } else {
        await api.updateLiterature(modal.item.id, data);
        toast.success('文献信息已更新');
      }
      setModal(null);
      await load();
    } catch (saveError) {
      toast.error(`保存失败：${saveError.message}`);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm(`确定删除文献「${item.title}」？`)) return;
    try {
      await api.deleteLiterature(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (detailItem?.id === item.id) setDetailItem(null);
      toast.success('文献已删除');
    } catch (deleteError) {
      toast.error(`删除失败：${deleteError.message}`);
    }
  };

  const cycleStatus = async (item) => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(item.status) + 1) % STATUS_ORDER.length];
    try {
      const updated = await api.updateLiterature(item.id, { status: next });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...updated, status: next } : entry));
    } catch (statusError) {
      toast.error(`更新状态失败：${statusError.message}`);
    }
  };

  if (loading) return <div className="grid grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} />)}</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const rated = items.filter((item) => Number(item.rating) > 0).length;
  const reading = items.filter((item) => item.status === 'reading').length;
  const evidence = items.filter((item) => item.status === 'favorite').length;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700"><BookOpen size={13} /> Literature & evidence</div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">文献与证据</h1>
          <p className="mt-1 text-sm text-slate-400">只管理工作台数据库中的题录、阅读状态和证据笔记，不连接外部文献工具。</p>
        </div>
        <button onClick={() => setModal({ mode: 'create' })} className="btn btn-primary"><Plus size={16} />添加文献</button>
      </header>

      <section className="grid grid-cols-4 overflow-hidden rounded-[20px] border border-slate-200/80 bg-white/70 shadow-sm">
        <Metric label="本地文献" value={items.length} note="全部保存在工作台" />
        <Metric label="阅读中" value={reading} note="正在形成理解" tone="blue" />
        <Metric label="重点证据" value={evidence} note="可进入研究链路" tone="amber" />
        <Metric label="已评分" value={rated} note="已有价值判断" tone="emerald" last />
      </section>

      <section className="rounded-[20px] border border-slate-200/80 bg-white/70 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input pl-9" placeholder="搜索标题、作者、期刊、DOI、摘要或笔记…" />
          </div>
          <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="input w-32 text-xs">
            <option value="">全部状态</option>
            {Object.entries(STATUS_MAP).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            <button onClick={() => setViewMode('cards')} className={`rounded-lg p-2 ${viewMode === 'cards' ? 'bg-slate-100 text-slate-700' : 'text-slate-300'}`} aria-label="卡片视图"><LayoutGrid size={14} /></button>
            <button onClick={() => setViewMode('list')} className={`rounded-lg p-2 ${viewMode === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-300'}`} aria-label="列表视图"><Rows3 size={14} /></button>
          </div>
        </div>
        {!!tags.length && <div className="mt-3 flex items-center gap-1.5 overflow-x-auto"><ListFilter size={12} className="shrink-0 text-slate-300" /><button onClick={() => setFilterTag('')} className={`rounded-lg px-2.5 py-1 text-[10px] ${!filterTag ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400 hover:bg-slate-50'}`}>全部标签</button>{tags.map(([tag, count]) => <button key={tag} onClick={() => setFilterTag(filterTag === tag ? '' : tag)} className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[10px] ${filterTag === tag ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400 hover:bg-slate-50'}`}>{tag} · {count}</button>)}</div>}
      </section>

      <div className={viewMode === 'cards' ? 'grid grid-cols-3 gap-4' : 'space-y-2'}>
        {filteredItems.map((item) => <LiteratureCard key={item.id} item={item} viewMode={viewMode} onOpen={() => setDetailItem(item)} onEdit={() => setModal({ mode: 'edit', item })} onDelete={() => handleDelete(item)} onCycle={() => cycleStatus(item)} />)}
      </div>

      {!filteredItems.length && (
        <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/50 py-16 text-center">
          <FileText size={38} className="mx-auto text-slate-200" />
          <h2 className="mt-3 text-sm font-bold text-slate-600">{items.length ? '没有符合筛选条件的文献' : '还没有本地文献记录'}</h2>
          <p className="mt-1 text-xs text-slate-400">手工加入一篇最关键的文献，从真实证据开始。</p>
        </div>
      )}

      <Modal open={!!detailItem} onClose={() => setDetailItem(null)} title="文献详情">
        {detailItem && <LiteratureDetail item={detailItem} />}
      </Modal>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'create' ? '添加文献' : '编辑文献'}>
        {modal && <LiteratureForm item={modal.item} onSave={handleSave} onCancel={() => setModal(null)} />}
      </Modal>
    </div>
  );
}

function Metric({ label, value, note, tone = 'slate', last = false }) {
  const color = { slate: 'text-slate-700', blue: 'text-blue-600', amber: 'text-amber-600', emerald: 'text-emerald-600' }[tone];
  return <div className={`px-5 py-4 ${last ? '' : 'border-r border-slate-200/70'}`}><span className="text-[10px] font-bold text-slate-400">{label}</span><strong className={`mt-1 block text-2xl font-medium ${color}`}>{value}</strong><small className="mt-1 block text-[9px] text-slate-300">{note}</small></div>;
}

function LiteratureCard({ item, viewMode, onOpen, onEdit, onDelete, onCycle }) {
  const meta = STATUS_MAP[item.status] || STATUS_MAP.unread;
  const tagList = tagsOf(item);
  if (viewMode === 'list') {
    return (
      <article onClick={onOpen} className="group grid cursor-pointer grid-cols-[110px_minmax(0,1fr)_170px_70px] items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/75 px-4 py-3 hover:border-emerald-200 hover:bg-white">
        <button onClick={(event) => { event.stopPropagation(); onCycle(); }} className="w-fit rounded-lg px-2 py-1 text-[9px] font-bold" style={{ color: meta.color, background: meta.tint }}>{meta.label}</button>
        <div className="min-w-0"><h2 className="truncate text-xs font-bold text-slate-700">{item.title}</h2><p className="mt-1 truncate text-[10px] text-slate-400">{item.authors || '作者未记录'}{item.journal ? ` · ${item.journal}` : ''}</p></div>
        <div className="truncate text-[10px] text-slate-400">{tagList.join(' · ') || '暂无标签'}</div>
        <CardActions onEdit={onEdit} onDelete={onDelete} />
      </article>
    );
  }
  return (
    <article onClick={onOpen} className="group relative min-h-[220px] cursor-pointer overflow-hidden rounded-[20px] border border-slate-200/75 bg-white/80 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg">
      <i className="absolute inset-x-0 top-0 h-[3px]" style={{ background: meta.color }} />
      <div className="flex items-start justify-between gap-3"><button onClick={(event) => { event.stopPropagation(); onCycle(); }} className="rounded-lg px-2 py-1 text-[9px] font-bold" style={{ color: meta.color, background: meta.tint }}>{meta.label}</button><CardActions onEdit={onEdit} onDelete={onDelete} /></div>
      <h2 className="mt-4 line-clamp-3 text-sm font-extrabold leading-relaxed text-slate-800">{item.title}</h2>
      <p className="mt-2 truncate text-[10px] text-slate-400">{item.authors || '作者未记录'}</p>
      <p className="mt-1 truncate text-[10px] italic text-slate-400">{item.journal || '来源未记录'}{item.year ? ` · ${item.year}` : ''}</p>
      <div className="mt-4 flex flex-wrap gap-1">{tagList.slice(0, 4).map((tag) => <span key={tag} className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-500">{tag}</span>)}</div>
      <div className="absolute inset-x-5 bottom-4 flex items-center justify-between border-t border-slate-100 pt-3"><div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={11} className={star <= Number(item.rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} />)}</div><span className="max-w-[135px] truncate text-[9px] text-slate-300">{item.doi || '未记录 DOI'}</span></div>
    </article>
  );
}

function CardActions({ onEdit, onDelete }) {
  return <div className="flex opacity-40 transition group-hover:opacity-100"><button onClick={(event) => { event.stopPropagation(); onEdit(); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600" aria-label="编辑文献"><Edit2 size={12} /></button><button onClick={(event) => { event.stopPropagation(); onDelete(); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="删除文献"><Trash2 size={12} /></button></div>;
}

function LiteratureDetail({ item }) {
  return <div className="space-y-4"><div><h2 className="text-base font-extrabold leading-relaxed text-slate-800">{item.title}</h2><p className="mt-1 text-sm text-slate-500">{item.authors || '作者未记录'}</p><p className="mt-1 text-xs italic text-slate-400">{item.journal || '来源未记录'}{item.year ? ` · ${item.year}` : ''}</p>{item.doi && <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-500">DOI：{item.doi}</p>}</div>{item.abstract && <DetailBlock title="摘要" text={item.abstract} />}{item.notes && <DetailBlock title="证据笔记" text={item.notes} tone="emerald" />}{!!tagsOf(item).length && <div className="flex flex-wrap gap-1.5">{tagsOf(item).map((tag) => <span key={tag} className="rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{tag}</span>)}</div>}</div>;
}

function DetailBlock({ title, text, tone = 'slate' }) {
  return <section className={`rounded-xl p-4 ${tone === 'emerald' ? 'bg-emerald-50/60' : 'bg-slate-50'}`}><h3 className={`mb-2 text-xs font-bold ${tone === 'emerald' ? 'text-emerald-700' : 'text-slate-500'}`}>{title}</h3><p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{text}</p></section>;
}

function LiteratureForm({ item, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: item?.title || '', authors: item?.authors || '', journal: item?.journal || '',
    year: item?.year || '', doi: item?.doi || '', abstract: item?.abstract || '',
    notes: item?.notes || '', tags: item?.tags || '', rating: Number(item?.rating || 0),
    status: item?.status || 'unread',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const toggleTag = (tag) => {
    const current = new Set(String(form.tags || '').split(',').map((value) => value.trim()).filter(Boolean));
    current.has(tag) ? current.delete(tag) : current.add(tag);
    update('tags', [...current].join(','));
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) { setError('请填写文献标题'); return; }
    setSubmitting(true);
    try { await onSave({ ...form, title: form.title.trim(), year: form.year ? Number(form.year) : null }); } finally { setSubmitting(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="标题" required><input value={form.title} onChange={(event) => { update('title', event.target.value); setError(''); }} className={`input ${error ? 'error' : ''}`} autoFocus />{error && <p className="field-error">{error}</p>}</Field>
      <Field label="作者"><input value={form.authors} onChange={(event) => update('authors', event.target.value)} className="input" placeholder="多位作者可用逗号分隔" /></Field>
      <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3"><Field label="期刊或来源"><input value={form.journal} onChange={(event) => update('journal', event.target.value)} className="input" /></Field><Field label="年份"><input type="number" value={form.year} onChange={(event) => update('year', event.target.value)} className="input" /></Field></div>
      <Field label="DOI"><input value={form.doi} onChange={(event) => update('doi', event.target.value)} className="input" placeholder="10.xxxx/xxxxx" /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="阅读状态"><select value={form.status} onChange={(event) => update('status', event.target.value)} className="input">{Object.entries(STATUS_MAP).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></Field><Field label="价值评分"><div className="flex h-10 items-center gap-1">{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" onClick={() => update('rating', form.rating === star ? 0 : star)}><Star size={19} className={star <= form.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'} /></button>)}</div></Field></div>
      <Field label="标签"><input value={form.tags} onChange={(event) => update('tags', event.target.value)} className="input" placeholder="用逗号分隔" /><div className="mt-2 flex flex-wrap gap-1">{TAG_PRESETS.map((tag) => <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`rounded-md px-2 py-1 text-[9px] ${tagsOf(form).includes(tag) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}>{tag}</button>)}</div></Field>
      <Field label="摘要"><textarea value={form.abstract} onChange={(event) => update('abstract', event.target.value)} className="input" rows={4} /></Field>
      <Field label="证据笔记"><textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} className="input" rows={4} placeholder="这篇文献支持或反驳了什么？还需要核验什么？" /></Field>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={onCancel} className="btn btn-secondary">取消</button><button disabled={submitting} className="btn btn-primary">{submitting && <Loader2 size={13} className="animate-spin" />}保存</button></div>
    </form>
  );
}

function Field({ label, required = false, children }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-500">{label}{required && <b className="ml-1 text-red-400">*</b>}</span>{children}</label>;
}
