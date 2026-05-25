import { useState, useEffect } from 'react';
import { Plus, Search, BookOpen, Star, Trash2, Edit2, ExternalLink, Tag, Filter, X, Eye, EyeOff, FileText, Loader2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import { SkeletonCard } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import api from '../../api';
import Modal from '../../components/Modal';

const STATUS_MAP = {
  unread: { label: '未读', color: 'text-slate-500', bg: 'bg-slate-50' },
  reading: { label: '阅读中', color: 'text-blue-600', bg: 'bg-blue-50' },
  done: { label: '已读', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  favorite: { label: '收藏', color: 'text-amber-600', bg: 'bg-amber-50' },
};

const TAG_PRESETS = ['方法学', '综述', '实验', '理论', '应用', '跨学科', '必读', '待精读'];

export default function Literature() {
  const { projectId } = useProject();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [modal, setModal] = useState(null);
  const [detailItem, setDetailItem] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { project_id: projectId };
      if (filterStatus) params.status = filterStatus;
      if (filterTag) params.tag = filterTag;
      if (search) params.search = search;
      const data = await api.getLiterature(params);
      setItems(data);
    } catch (e) {
      setError(e.message);
      toast.error('加载文献失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId, filterStatus, filterTag]);

  useEffect(() => {
    const timer = setTimeout(() => load(), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSave = async (data) => {
    try {
      if (modal.mode === 'create') {
        await api.createLiterature({ ...data, project_id: projectId });
        toast.success('文献添加成功');
      } else {
        await api.updateLiterature(modal.item.id, data);
        toast.success('文献更新成功');
      }
      setModal(null);
      load();
    } catch (e) {
      toast.error('保存失败：' + e.message);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm(`确定删除文献「${item.title}」？`)) return;
    try {
      await api.deleteLiterature(item.id);
      toast.success('文献已删除');
      load();
    } catch (e) {
      toast.error('删除失败');
    }
  };

  const handleStatusToggle = async (item) => {
    const cycle = ['unread', 'reading', 'done', 'favorite'];
    const next = cycle[(cycle.indexOf(item.status) + 1) % cycle.length];
    try {
      await api.updateLiterature(item.id, { status: next });
      toast.success(`状态已更新为：${STATUS_MAP[next].label}`);
      load();
    } catch (e) {
      toast.error('更新失败');
    }
  };

  const filteredItems = items;

  if (loading) return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex items-end justify-between">
        <div><div className="h-8 w-32 bg-slate-200/50 rounded-lg animate-pulse" /></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen size={24} className="text-orange-500" />
            文献知识库
          </h1>
          <p className="text-sm text-slate-400 mt-1">管理你的学术文献、笔记和阅读进度</p>
        </div>
        <button onClick={() => setModal({ mode: 'create' })} className="btn btn-primary">
          <Plus size={16} /> 添加文献
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4" style={{ animation: 'slideUp .5s var(--spring-bounce) .05s both' }}>
        {Object.entries(STATUS_MAP).map(([key, val]) => {
          const count = items.filter(i => i.status === key).length;
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(filterStatus === key ? '' : key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-300 ${
                filterStatus === key ? 'ring-1 ring-orange-200' : ''
              }`}
              style={{ background: filterStatus === key ? 'var(--accent-50)' : 'rgba(255,255,255,0.6)' }}>
              <span className={`w-2 h-2 rounded-full ${val.bg}`} style={{ background: key === 'unread' ? '#94a3b8' : key === 'reading' ? '#3b82f6' : key === 'done' ? '#10b981' : '#f59e0b' }} />
              <span className={filterStatus === key ? 'text-orange-700' : 'text-slate-600'}>{val.label}</span>
              <span className="text-slate-400">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3" style={{ animation: 'slideUp .5s var(--spring-bounce) .1s both' }}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9"
            placeholder="搜索文献标题、作者、期刊..."
          />
        </div>
        <div className="flex gap-1.5">
          {TAG_PRESETS.slice(0, 5).map(tag => (
            <button
              key={tag}
              onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 ${
                filterTag === tag
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/60 text-slate-500 hover:bg-orange-50 hover:text-orange-600'
              }`}>
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Literature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item, i) => (
          <div
            key={item.id}
            className="card p-4 group cursor-pointer hover:shadow-lg transition-all duration-300"
            style={{ animation: `slideUp .4s var(--spring-bounce) ${i * 0.04}s both` }}
            onClick={() => setDetailItem(item)}>
            <div className="flex items-start justify-between mb-3">
              <div className={`badge text-[10px] ${STATUS_MAP[item.status]?.bg} ${STATUS_MAP[item.status]?.color}`}>
                {STATUS_MAP[item.status]?.label}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', item }); }}
                  className="p-1 rounded-md hover:bg-orange-50 text-slate-400 hover:text-orange-500">
                  <Edit2 size={12} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                  className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            <h3 className="text-sm font-semibold text-slate-800 line-clamp-2 mb-2 group-hover:text-orange-600 transition-colors">
              {item.title}
            </h3>
            <div className="text-xs text-slate-400 space-y-1 mb-3">
              {item.authors && <p className="truncate">{item.authors}</p>}
              {item.journal && <p className="truncate italic">{item.journal} {item.year && `(${item.year})`}</p>}
            </div>
            {item.tags && (
              <div className="flex flex-wrap gap-1 mb-3">
                {item.tags.split(',').map((t, j) => (
                  <span key={j} className="px-1.5 py-0.5 rounded text-[9px] bg-orange-50 text-orange-600">
                    {t.trim()}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(241,245,249,0.6)' }}>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} size={12} className={s <= item.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
                ))}
              </div>
              {item.doi && (
                <a href={`https://doi.org/${item.doi}`} target="_blank" rel="noopener"
                  onClick={e => e.stopPropagation()}
                  className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                  DOI <ExternalLink size={9} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="card text-center py-16" style={{ animation: 'slideUp .4s var(--spring-bounce)' }}>
          <BookOpen size={48} className="text-slate-200 mx-auto mb-3" />
          <div className="text-sm text-slate-400">暂无文献</div>
          <div className="text-xs text-slate-300 mt-1">点击「添加文献」开始构建你的知识库</div>
        </div>
      )}

      {/* Detail Modal */}
      <Modal open={!!detailItem} onClose={() => setDetailItem(null)} title="文献详情">
        {detailItem && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">{detailItem.title}</h3>
              {detailItem.authors && <p className="text-sm text-slate-500 mt-1">{detailItem.authors}</p>}
              {detailItem.journal && <p className="text-sm text-slate-400 italic">{detailItem.journal} {detailItem.year && `(${detailItem.year})`}</p>}
            </div>
            {detailItem.abstract && (
              <div className="rounded-xl p-4 bg-slate-50">
                <div className="text-xs font-semibold text-slate-500 mb-2">摘要</div>
                <p className="text-sm text-slate-600 leading-relaxed">{detailItem.abstract}</p>
              </div>
            )}
            {detailItem.notes && (
              <div className="rounded-xl p-4 bg-orange-50/50">
                <div className="text-xs font-semibold text-orange-600 mb-2">笔记</div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{detailItem.notes}</p>
              </div>
            )}
            {detailItem.tags && (
              <div className="flex flex-wrap gap-1.5">
                {detailItem.tags.split(',').map((t, j) => (
                  <span key={j} className="px-2 py-1 rounded-lg text-xs bg-orange-50 text-orange-600">
                    {t.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create/Edit Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'create' ? '添加文献' : '编辑文献'}>
        {modal && <LiteratureForm item={modal.item} onSave={handleSave} onCancel={() => setModal(null)} />}
      </Modal>
    </div>
  );
}

function LiteratureForm({ item, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: item?.title || '',
    authors: item?.authors || '',
    journal: item?.journal || '',
    year: item?.year || '',
    doi: item?.doi || '',
    abstract: item?.abstract || '',
    notes: item?.notes || '',
    tags: item?.tags || '',
    rating: item?.rating || 0,
    status: item?.status || 'unread',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = '请填写文献标题';
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
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto scrollbar-hide pr-1">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">标题 <span className="text-red-400">*</span></label>
        <input value={form.title} onChange={e => set('title', e.target.value)}
          className={`input ${errors.title ? 'error' : ''}`} placeholder="论文标题" autoFocus />
        {errors.title && <p className="field-error">{errors.title}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">作者</label>
          <input value={form.authors} onChange={e => set('authors', e.target.value)} className="input" placeholder="作者列表" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">期刊</label>
          <input value={form.journal} onChange={e => set('journal', e.target.value)} className="input" placeholder="期刊名称" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">年份</label>
          <input type="number" value={form.year} onChange={e => set('year', e.target.value ? +e.target.value : '')} className="input" placeholder="2024" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">DOI</label>
          <input value={form.doi} onChange={e => set('doi', e.target.value)} className="input" placeholder="10.xxxx/xxxxx" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">状态</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} className="input">
            <option value="unread">未读</option>
            <option value="reading">阅读中</option>
            <option value="done">已读</option>
            <option value="favorite">收藏</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">标签（逗号分隔）</label>
        <input value={form.tags} onChange={e => set('tags', e.target.value)} className="input" placeholder="方法学, 综述, 必读" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">评分</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(s => (
            <button key={s} onClick={() => set('rating', s === form.rating ? 0 : s)}>
              <Star size={20} className={s <= form.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200 hover:text-amber-200'} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">摘要</label>
        <textarea value={form.abstract} onChange={e => set('abstract', e.target.value)} className="input" rows={3} placeholder="论文摘要..." />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">笔记</label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="input" rows={3} placeholder="你的阅读笔记..." />
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
