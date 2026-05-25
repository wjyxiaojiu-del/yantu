import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Filter, Search, AlertCircle, CheckSquare, Square, Trash, Loader2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../components/Toast';
import { SkeletonTable } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import api from '../../api';
import Modal from '../../components/Modal';

export default function Backlog() {
  const { projectId } = useProject();
  const toast = useToast();
  const [stories, setStories] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [filter, setFilter] = useState({ priority: '', sprint_id: '' });
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const load = async () => {
    try {
      const params = { project_id: projectId };
      if (filter.priority) params.priority = filter.priority;
      if (filter.sprint_id) params.sprint_id = filter.sprint_id;
      const [s, sp] = await Promise.all([
        api.getStories(params),
        sprints.length ? Promise.resolve(sprints) : api.getSprints({ project_id: projectId }),
      ]);
      setStories(s);
      setSprints(sp);
      setError(null);
    } catch (e) {
      setError(e.message);
      toast.error('加载事件列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter, projectId]);

  const handleSave = async (data) => {
    try {
      if (modal.mode === 'create') await api.createStory({ ...data, project_id: projectId });
      else await api.updateStory(modal.story.id, data);
      setModal(null);
      toast.success(modal.mode === 'create' ? '事件创建成功' : '事件更新成功');
      load();
    } catch (e) {
      toast.error('保存失败：' + e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除此事件？')) return;
    try {
      await api.deleteStory(id);
      toast.success('事件已删除');
      load();
    } catch (e) {
      toast.error('删除失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`确定删除选中的 ${selected.size} 个事件？`)) return;
    try {
      await api.batchDeleteStories([...selected]);
      toast.success(`已删除 ${selected.size} 个事件`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error('批量删除失败：' + e.message);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.updateStory(id, { status });
      setStories(prev => prev.map(s => s.id === id ? { ...s, status } : s));
      const label = { backlog: '待办', todo: '计划中', in_progress: '进行中', done: '已完成' }[status];
      toast.success(`状态已更新为「${label}」`);
    } catch (e) {
      toast.error('状态更新失败');
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(s => s.id)));
    }
  };

  const filtered = useMemo(() =>
    stories.filter(s => !search || s.title?.toLowerCase().includes(search.toLowerCase()) || s.story_id?.toLowerCase().includes(search.toLowerCase())),
    [stories, search]
  );
  const totalPoints = filtered.reduce((s, st) => s + st.story_points, 0);

  if (loading) return <SkeletonTable rows={6} cols={7} />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">事件待办</h1>
          <p className="text-sm text-slate-400 mt-1">管理所有事件与待办事项</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={handleBatchDelete} className="btn btn-danger gap-2 animate-popIn">
              <Trash size={15} /> 删除选中 ({selected.size})
            </button>
          )}
          <button onClick={() => setModal({ mode: 'create' })} className="btn btn-primary">
            <Plus size={16} /> 新建事件
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card p-3 flex items-center gap-3" style={{ animation: 'slideUp .5s var(--spring-bounce) .05s both' }}>
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-9 py-2" placeholder="搜索事件..." />
        </div>
        <div className="w-px h-6 bg-slate-200/40" />
        <Filter size={14} className="text-slate-300" />
        <select value={filter.priority} onChange={e => setFilter(f => ({ ...f, priority: e.target.value }))} className="select w-32 py-2 text-xs">
          <option value="">全部优先级</option>
          <option value="S">S - 最高</option>
          <option value="A">A - 高</option>
          <option value="B">B - 中</option>
          <option value="C">C - 低</option>
          <option value="D">D - 最低</option>
        </select>
        <select value={filter.sprint_id} onChange={e => setFilter(f => ({ ...f, sprint_id: e.target.value }))} className="select w-36 py-2 text-xs">
          <option value="">全部迭代</option>
          {sprints.map(s => <option key={s.id} value={s.id}>S{s.number}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
          <span>{filtered.length} 个事件</span>
          <span className="w-1 h-1 rounded-full bg-slate-200" />
          <span>{totalPoints} 工作量</span>
        </div>
      </div>

      {/* Stories List */}
      <div className="card overflow-hidden" style={{ animation: 'slideUp .5s var(--spring-bounce) .1s both' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'rgba(241,245,249,0.5)' }}>
              <th className="text-left px-4 py-3 w-10">
                <button onClick={toggleSelectAll} className="text-slate-400 hover:text-orange-500 transition-colors">
                  {selected.size === filtered.length && filtered.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">ID</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">标题</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">优先级</th>
              <th className="text-center px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">工作量</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">迭代</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">状态</th>
              <th className="text-center px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((st, i) => (
              <tr key={st.id} className={`table-row group ${selected.has(st.id) ? 'bg-orange-50/30' : ''}`}
                style={{ animation: `slideInRight .3s var(--spring-bounce) ${i * 30}ms both` }}>
                <td className="px-4 py-3.5">
                  <button onClick={() => toggleSelect(st.id)}
                    className={`transition-all duration-300 ${selected.has(st.id) ? 'text-orange-500 scale-110' : 'text-slate-300 hover:text-orange-400'}`}
                    style={{ transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                    {selected.has(st.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </td>
                <td className="px-5 py-3.5 text-slate-400 font-mono text-xs">{st.story_id}</td>
                <td className="px-5 py-3.5">
                  <div className="font-medium text-slate-800">{st.title}</div>
                  {st.description && <div className="text-xs text-slate-400 mt-0.5 max-w-md truncate">{st.description}</div>}
                </td>
                <td className="px-5 py-3.5"><span className={`badge badge-${(st.priority || 'D').toLowerCase()}`}>{st.priority}</span></td>
                <td className="px-5 py-3.5 text-center">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-semibold"
                    style={{ background: 'rgba(99,102,241,0.06)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.1)' }}>
                    {st.story_points}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-400 text-xs">
                  {sprints.find(s => s.id === st.sprint_id) ? `S${sprints.find(s => s.id === st.sprint_id).number}` : '—'}
                </td>
                <td className="px-5 py-3.5">
                  <select value={st.status} onChange={e => handleStatusChange(st.id, e.target.value)}
                    className="select text-xs py-1.5 w-28" style={{ fontSize: 11 }}>
                    <option value="backlog">待办</option>
                    <option value="todo">计划中</option>
                    <option value="in_progress">进行中</option>
                    <option value="done">已完成</option>
                  </select>
                </td>
                <td className="px-5 py-3.5 text-center">
                  <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <button onClick={() => setModal({ mode: 'edit', story: st })} className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-500 transition-all duration-200"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(st.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all duration-200"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400 animate-fadeIn">
            <div className="text-4xl mb-2">📋</div>
            <div className="text-sm">暂无匹配的事件</div>
          </div>
        )}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'create' ? '新建事件' : '编辑事件'}>
        {modal && <StoryForm story={modal.story} onSave={handleSave} onCancel={() => setModal(null)} sprints={sprints} />}
      </Modal>
    </div>
  );
}

function StoryForm({ story, onSave, onCancel, sprints }) {
  const [form, setForm] = useState({
    story_id: story?.story_id || '',
    title: story?.title || '',
    description: story?.description || '',
    priority: story?.priority || 'B',
    story_points: story?.story_points || 3,
    sprint_id: story?.sprint_id || '',
    status: story?.status || 'backlog',
    acceptance_criteria: story?.acceptance_criteria || '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.story_id.trim()) e.story_id = '请填写事件编号';
    if (!form.title.trim()) e.title = '请填写标题';
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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">事件编号 <span className="text-red-400">*</span></label>
          <input value={form.story_id} onChange={e => set('story_id', e.target.value)} className={`input ${errors.story_id ? 'error' : ''}`} placeholder="US-XXX" />
          {errors.story_id && <p className="field-error flex items-center gap-1"><AlertCircle size={11} />{errors.story_id}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">优先级</label>
          <select value={form.priority} onChange={e => set('priority', e.target.value)} className="select">
            <option value="S">S - 最高优先级</option>
            <option value="A">A - 高优先级</option>
            <option value="B">B - 中优先级</option>
            <option value="C">C - 低优先级</option>
            <option value="D">D - 最低优先级</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">标题 <span className="text-red-400">*</span></label>
        <input value={form.title} onChange={e => set('title', e.target.value)} className={`input ${errors.title ? 'error' : ''}`} placeholder="简要描述事件内容" />
        {errors.title && <p className="field-error flex items-center gap-1"><AlertCircle size={11} />{errors.title}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">描述</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} className="input" rows={2} placeholder="详细说明..." />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">验收标准</label>
        <textarea value={form.acceptance_criteria} onChange={e => set('acceptance_criteria', e.target.value)} className="input" rows={2} placeholder="如何判断此事件已完成？" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">工作量</label>
          <select value={form.story_points} onChange={e => set('story_points', +e.target.value)} className="select">
            {[1, 2, 3, 5, 8, 13].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">所属迭代</label>
          <select value={form.sprint_id} onChange={e => set('sprint_id', +e.target.value)} className="select">
            <option value="">未分配</option>
            {sprints.map(s => <option key={s.id} value={s.id}>S{s.number}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">状态</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} className="select">
            <option value="backlog">待办</option>
            <option value="todo">计划中</option>
            <option value="in_progress">进行中</option>
            <option value="done">已完成</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/30">
        <button type="button" onClick={onCancel} className="btn btn-secondary">取消</button>
        <button type="submit" disabled={submitting} className="btn btn-primary flex items-center gap-1.5">
          {submitting && <Loader2 size={14} className="animate-spin" />}保存
        </button>
      </div>
    </form>
  );
}
