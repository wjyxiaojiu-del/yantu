import { useEffect, useState } from 'react';
import {
  ClipboardList, Plus, Search, Filter, CheckCircle2, Clock,
  User, Calendar, Download, ToggleLeft, ToggleRight, Trash2, CheckSquare, Square,
  Sparkles, Loader2
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

export default function TaskAssign() {
  const [tasks, setTasks] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ student_id: '', title: '', description: '', deadline: '', priority: 'medium', category: 'general' });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const toast = useToast();

  const TASK_TEMPLATES = [
    { label: '文献阅读', icon: '📚', title: '阅读并总结核心文献', description: '精读指定文献，完成阅读笔记，提炼关键方法和结论', category: 'reading', priority: 'high' },
    { label: '论文写作', icon: '✍️', title: '撰写论文章节', description: '按照提纲完成指定章节的初稿写作', category: 'writing', priority: 'high' },
    { label: '实验研究', icon: '🔬', title: '完成实验并记录结果', description: '按实验方案执行实验，记录数据并分析结果', category: 'experiment', priority: 'medium' },
    { label: '代码开发', icon: '💻', title: '完成功能开发', description: '按需求完成代码实现，编写单元测试', category: 'coding', priority: 'medium' },
    { label: '答辩准备', icon: '🎯', title: '准备答辩材料', description: '制作答辩PPT，准备常见问题回答', category: 'writing', priority: 'urgent' },
  ];

  const [aiBreaking, setAiBreaking] = useState(false);

  async function handleAIBreakdown() {
    if (!form.title.trim()) { toast.error('请先填写任务标题'); return; }
    setAiBreaking(true);
    try {
      const res = await fetch('/api/ai/breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title, description: form.description, projectId: 1 }),
      }).then(r => r.json());
      if (res.content) {
        setForm(prev => ({ ...prev, description: res.content }));
        toast.success('AI 拆解完成');
      }
    } catch (e) {
      toast.error('AI 拆解失败：' + e.message);
    } finally {
      setAiBreaking(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [tData, sData] = await Promise.all([api.getTasks(), api.getStudents()]);
    setTasks(tData); setStudents(sData);
    setLoading(false);
    setSelectedIds(new Set());
  }

  const filtered = tasks.filter(t => {
    const matchSearch = (t.title + t.description + t.student_name).toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const allSelected = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id));

  function toggleSelect(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function toggleSelectAll() {
    if (allSelected) {
      const next = new Set(selectedIds);
      filtered.forEach(t => next.delete(t.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach(t => next.add(t.id));
      setSelectedIds(next);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editing) await api.updateTask(editing.id, form);
      else await api.createTask(form);
      toast.success(editing ? '任务已更新' : '任务已创建');
      setShowAdd(false); setEditing(null);
      setForm({ student_id: '', title: '', description: '', deadline: '', priority: 'medium', category: 'general' });
      load();
    } catch (e) { toast.error('操作失败：' + e.message); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id) {
    if (!confirm('确定删除此任务？')) return;
    try { await api.deleteTask(id); toast.success('任务已删除'); load(); }
    catch (e) { toast.error('删除失败：' + e.message); }
  }

  async function handleBatchDelete() {
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个任务？`)) return;
    try {
      await Promise.all([...selectedIds].map(id => api.deleteTask(id)));
      toast.success('批量删除成功');
      load();
    } catch (e) { toast.error('批量删除失败：' + e.message); }
  }

  async function handleBatchComplete() {
    try {
      const toComplete = [...selectedIds].map(id => {
        const t = tasks.find(x => x.id === id);
        return t && t.status !== 'completed' ? api.updateTask(id, { ...t, status: 'completed' }) : Promise.resolve();
      });
      await Promise.all(toComplete);
      toast.success('批量标记完成');
      load();
    } catch (e) { toast.error('批量操作失败：' + e.message); }
  }

  async function handleToggleStatus(task) {
    try {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      await api.updateTask(task.id, { ...task, status: newStatus });
      toast.success(newStatus === 'completed' ? '任务已完成' : '任务已重新打开');
      load();
    } catch (e) { toast.error('操作失败：' + e.message); }
  }

  function handleExportCSV() {
    const headers = ['任务标题', '学生', '截止日期', '优先级', '分类', '状态'];
    const pLabels = { urgent: '紧急', high: '高', medium: '中', low: '低' };
    const cLabels = { reading: '文献阅读', experiment: '实验研究', writing: '论文写作', general: '一般任务', coding: '代码开发' };
    const rows = filtered.map(t => [t.title, t.student_name, t.deadline || '无', pLabels[t.priority] || t.priority, cLabels[t.category] || t.category, t.status === 'completed' ? '已完成' : '进行中']);
    const csv = '\ufeff' + [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `任务列表_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('导出成功');
  }

  function openEdit(t) {
    setEditing(t);
    setForm({ student_id: String(t.student_id), title: t.title, description: t.description || '', deadline: t.deadline || '', priority: t.priority, category: t.category });
    setShowAdd(true);
  }

  const priorityColors = { urgent: 'badge-s', high: 'badge-a', medium: 'badge-b', low: 'badge-c' };
  const categoryLabels = { reading: '文献阅读', experiment: '实验研究', writing: '论文写作', general: '一般任务', coding: '代码开发' };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient-warm">任务指派</h1>
          <p className="text-sm text-slate-400 mt-1">给研究生分配和跟踪任务</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV} className="btn btn-secondary"><Download className="w-4 h-4" /> 导出CSV</button>
          <button onClick={() => { setEditing(null); setForm({ student_id: '', title: '', description: '', deadline: '', priority: 'medium', category: 'general' }); setShowAdd(true); }}
            className="btn btn-primary"><Plus className="w-4 h-4" /> 新建任务</button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索任务或学生..." className="input pl-10" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          {[{k:'all',l:'全部'},{k:'pending',l:'进行中'},{k:'completed',l:'已完成'}].map(s => (
            <button key={s.k} onClick={() => setFilterStatus(s.k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterStatus === s.k ? 'text-white shadow-md' : 'bg-white/60 text-slate-500 hover:bg-white'}`}
              style={filterStatus === s.k ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' } : {}}>
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
          <button onClick={handleBatchComplete} className="btn btn-success text-xs py-1.5 px-3">
            <CheckCircle2 className="w-3.5 h-3.5" /> 标记完成
          </button>
          <button onClick={handleBatchDelete} className="btn btn-danger text-xs py-1.5 px-3">
            <Trash2 className="w-3.5 h-3.5" /> 批量删除
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-[var(--accent)] rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400">
                  <th className="text-left px-5 py-3 font-medium w-10">
                    <button onClick={toggleSelectAll} className="transition-all hover:scale-110">
                      {allSelected ? <CheckSquare className="w-4 h-4 text-[var(--accent)]" /> : <Square className="w-4 h-4 text-slate-300" />}
                    </button>
                  </th>
                  <th className="text-left px-5 py-3 font-medium w-10">状态</th>
                  <th className="text-left px-5 py-3 font-medium">任务</th>
                  <th className="text-left px-5 py-3 font-medium">学生</th>
                  <th className="text-left px-5 py-3 font-medium hidden md:table-cell">截止日期</th>
                  <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">优先级</th>
                  <th className="text-right px-5 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(task => (
                  <tr key={task.id} className="table-row">
                    <td className="px-5 py-3">
                      <button onClick={() => toggleSelect(task.id)} className="transition-all hover:scale-110">
                        {selectedIds.has(task.id)
                          ? <CheckSquare className="w-4 h-4 text-[var(--accent)]" />
                          : <Square className="w-4 h-4 text-slate-300" />}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => handleToggleStatus(task)} className="transition-all hover:scale-110">
                        {task.status === 'completed'
                          ? <ToggleRight className="w-6 h-6 text-emerald-400" />
                          : <ToggleLeft className="w-6 h-6 text-slate-200 hover:text-slate-400" />}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div>
                        <p className={`font-medium ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{task.title}</p>
                        <p className="text-xs text-slate-300">{categoryLabels[task.category] || task.category}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-slate-300" /><span className="text-slate-500">{task.student_name}</span></div>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-2 text-slate-400"><Calendar className="w-3.5 h-3.5" /><span>{task.deadline || '无'}</span></div>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <span className={`badge ${priorityColors[task.priority] || 'badge-c'}`}>
                        {task.priority === 'urgent' ? '紧急' : task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => openEdit(task)} className="text-xs font-medium mr-3 transition-colors" style={{ color: 'var(--accent)' }}>编辑</button>
                      <button onClick={() => handleDelete(task.id)} className="text-xs text-red-400 hover:text-red-600">删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-12 text-slate-300">暂无任务</div>}
        </div>
      )}

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)} title={editing ? '编辑任务' : '新建任务'}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editing && (
              <div>
                <p className="text-xs font-medium text-slate-400 mb-2">快速模板</p>
                <div className="flex flex-wrap gap-2">
                  {TASK_TEMPLATES.map(t => (
                    <button key={t.label} type="button"
                      onClick={() => setForm({ ...form, title: t.title, description: t.description, category: t.category, priority: t.priority })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/60 text-slate-500 hover:bg-white hover:text-slate-700 transition-all border border-slate-100">
                      <span>{t.icon}</span> {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <select required value={form.student_id} onChange={e => setForm({...form, student_id: e.target.value})} className="select">
              <option value="">选择学生</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
            </select>
            <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="任务标题" className="input" />
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-400">任务描述</span>
                {!editing && (
                  <button type="button" onClick={handleAIBreakdown} disabled={aiBreaking}
                    className="flex items-center gap-1 text-[11px] font-medium text-orange-500 hover:text-orange-600 transition-colors disabled:opacity-50">
                    {aiBreaking ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    AI 拆解
                  </button>
                )}
              </div>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="任务描述（或点击 AI 拆解自动生成）" rows={3} className="input resize-none" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} type="date" className="input" />
              <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})} className="select">
                <option value="low">低优先级</option><option value="medium">中优先级</option><option value="high">高优先级</option><option value="urgent">紧急</option>
              </select>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="select">
                <option value="general">一般任务</option><option value="reading">文献阅读</option><option value="experiment">实验研究</option><option value="writing">论文写作</option><option value="coding">代码开发</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary flex-1">取消</button>
              <button type="submit" disabled={submitting} className="btn btn-primary flex-1 flex items-center justify-center gap-1.5">
                {submitting && <Loader2 size={14} className="animate-spin" />}{editing ? '保存' : '创建'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
