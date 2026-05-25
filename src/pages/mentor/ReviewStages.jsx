import { useEffect, useState } from 'react';
import { Award, Plus, Search, Filter, Calendar, CheckCircle2, Star, FileText, Trash2, CheckSquare, Square, Zap, Loader2 } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

export default function ReviewStages() {
  const [reviews, setReviews] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ student_id: '', stage_type: 'proposal', title: '', scheduled_date: '', status: 'pending', score: '', feedback: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const toast = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [rData, sData] = await Promise.all([api.getReviews(), api.getStudents()]);
    setReviews(rData); setStudents(sData);
    setLoading(false);
    setSelectedIds(new Set());
  }

  const filtered = reviews.filter(r => {
    const matchSearch = (r.title + r.student_name).toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || r.stage_type === filterType;
    return matchSearch && matchType;
  });

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));

  function toggleSelect(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function toggleSelectAll() {
    if (allSelected) {
      const next = new Set(selectedIds);
      filtered.forEach(r => next.delete(r.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach(r => next.add(r.id));
      setSelectedIds(next);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editing) await api.updateReview(editing.id, form);
      else await api.createReview(form);
      toast.success(editing ? '评审节点已更新' : '评审节点已添加');
      setShowAdd(false); setEditing(null);
      setForm({ student_id: '', stage_type: 'proposal', title: '', scheduled_date: '', status: 'pending', score: '', feedback: '', notes: '' });
      load();
    } catch (e) { toast.error('操作失败：' + e.message); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id) {
    if (!confirm('确定删除此评审节点？')) return;
    try { await api.deleteReview(id); toast.success('评审节点已删除'); load(); }
    catch (e) { toast.error('删除失败：' + e.message); }
  }

  async function handleBatchDelete() {
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个评审节点？`)) return;
    try {
      await Promise.all([...selectedIds].map(id => api.deleteReview(id)));
      toast.success('批量删除成功');
      load();
    } catch (e) { toast.error('批量删除失败：' + e.message); }
  }

  async function handleBatchPass() {
    try {
      const today = new Date().toISOString().split('T')[0];
      await Promise.all([...selectedIds].map(id => {
        const r = reviews.find(x => x.id === id);
        return api.updateReview(id, { ...r, status: 'completed', completed_date: today });
      }));
      toast.success('一键通过成功');
      load();
    } catch (e) { toast.error('操作失败：' + e.message); }
  }

  function openEdit(r) {
    setEditing(r);
    setForm({ student_id: String(r.student_id), stage_type: r.stage_type, title: r.title, scheduled_date: r.scheduled_date || '', status: r.status, score: r.score || '', feedback: r.feedback || '', notes: r.notes || '' });
    setShowAdd(true);
  }

  const stageColors = { proposal: 'badge-c', midterm: 'badge-b', defense: 'badge-d', thesis: 'badge-a' };
  const stageLabels = { proposal: '开题', midterm: '中期', defense: '答辩', thesis: '论文' };
  const statusColors = { pending: 'badge-b', in_progress: 'badge-c', completed: 'badge-d' };
  const statusLabels = { pending: '待开始', in_progress: '进行中', completed: '已完成' };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient-warm">节点评审</h1>
          <p className="text-sm text-slate-400 mt-1">跟踪学生论文各阶段评审进度</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ student_id: '', stage_type: 'proposal', title: '', scheduled_date: '', status: 'pending', score: '', feedback: '', notes: '' }); setShowAdd(true); }}
          className="btn btn-primary"><Plus className="w-4 h-4" /> 添加节点</button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索学生或评审名称..." className="input pl-10" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400" />
          {[{k:'all',l:'全部'},{k:'proposal',l:'开题'},{k:'midterm',l:'中期'},{k:'defense',l:'答辩'}].map(s => (
            <button key={s.k} onClick={() => setFilterType(s.k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === s.k ? 'text-white shadow-md' : 'bg-white/60 text-slate-500 hover:bg-white'}`}
              style={filterType === s.k ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' } : {}}>
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-white/80 backdrop-blur-lg"
          style={{ animation: 'slideDown 0.3s var(--spring-bounce) both' }}>
          <span className="text-sm text-slate-600 font-medium">已选中 {selectedIds.size} 项</span>
          <div className="flex-1" />
          <button onClick={handleBatchPass} className="btn btn-success text-xs py-1.5 px-3">
            <Zap className="w-3.5 h-3.5" /> 一键通过
          </button>
          <button onClick={handleBatchDelete} className="btn btn-danger text-xs py-1.5 px-3">
            <Trash2 className="w-3.5 h-3.5" /> 批量删除
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-[var(--accent)] rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((review, i) => (
            <div key={review.id} className="card p-5 group"
              style={{ animation: `staggerFadeIn .4s var(--spring-bounce) ${i * 60}ms both` }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`badge ${stageColors[review.stage_type] || 'badge-c'}`}>{stageLabels[review.stage_type] || review.stage_type}</span>
                  <span className={`badge ${statusColors[review.status] || 'badge-c'}`}>{statusLabels[review.status] || review.status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleSelect(review.id)}
                    className="p-1 rounded-lg hover:bg-slate-50 transition-all"
                    title={selectedIds.has(review.id) ? '取消选中' : '选中'}>
                    {selectedIds.has(review.id)
                      ? <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                      : <Square className="w-4 h-4 text-slate-300" />}
                  </button>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(review)} className="text-xs font-medium transition-colors" style={{ color: 'var(--accent)' }}>编辑</button>
                    <button onClick={() => handleDelete(review.id)} className="text-xs text-red-400 hover:text-red-600">删除</button>
                  </div>
                </div>
              </div>

              <h3 className="text-slate-800 font-semibold mb-1">{review.title}</h3>
              <p className="text-sm text-slate-400 mb-3">{review.student_name}</p>

              <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>计划日期：{review.scheduled_date || '未设置'}</span>
                </div>
                {review.completed_date && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>完成日期：{review.completed_date}</span>
                  </div>
                )}
                {review.score && (
                  <div className="flex items-center gap-2 text-xs">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-amber-600 font-medium">评分：{review.score}</span>
                  </div>
                )}
              </div>

              {review.feedback && (
                <div className="p-3 rounded-xl bg-slate-50/60">
                  <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> 反馈意见</p>
                  <p className="text-sm text-slate-500">{review.feedback}</p>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <div className="text-center py-20 text-slate-300 md:col-span-2">暂无评审节点</div>}
        </div>
      )}

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)} title={editing ? '编辑评审节点' : '添加评审节点'}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <select required value={form.student_id} onChange={e => setForm({...form, student_id: e.target.value})} className="select">
              <option value="">选择学生</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <select value={form.stage_type} onChange={e => setForm({...form, stage_type: e.target.value})} className="select">
                <option value="proposal">开题答辩</option><option value="midterm">中期考核</option><option value="defense">毕业答辩</option><option value="thesis">论文提交</option>
              </select>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="select">
                <option value="pending">待开始</option><option value="in_progress">进行中</option><option value="completed">已完成</option>
              </select>
            </div>
            <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="评审名称（如：开题答辩）" className="input" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.scheduled_date} onChange={e => setForm({...form, scheduled_date: e.target.value})} type="date" placeholder="计划日期" className="input" />
              <input value={form.score} onChange={e => setForm({...form, score: e.target.value})} type="number" step="0.1" min="0" max="100" placeholder="评分（0-100）" className="input" />
            </div>
            <textarea value={form.feedback} onChange={e => setForm({...form, feedback: e.target.value})} placeholder="反馈意见" rows={2} className="input resize-none" />
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="备注" rows={2} className="input resize-none" />
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary flex-1">取消</button>
              <button type="submit" disabled={submitting} className="btn btn-primary flex-1 flex items-center justify-center gap-1.5">
                {submitting && <Loader2 size={14} className="animate-spin" />}{editing ? '保存' : '添加'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
