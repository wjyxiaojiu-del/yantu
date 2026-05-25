import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, Search, Plus, GraduationCap, Filter, BookOpen, Calendar, Download, Trophy } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

export default function StudentList() {
  const [students, setStudents] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGrade, setFilterGrade] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', student_id: '', grade: '研一', major: '', research_topic: '', enrollment_date: '', expected_graduation: '' });
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [sData, aData] = await Promise.all([api.getStudents(), api.getAchievements()]);
    setStudents(sData);
    setAchievements(aData);
    setLoading(false);
  }

  const grades = ['all', '研一', '研二', '研三', '博士'];

  // 搜索防抖：用 useMemo 缓存过滤结果，避免输入时频繁重渲染
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter(s => {
      const matchSearch = !term || (s.name + s.email + s.student_id + s.research_topic).toLowerCase().includes(term);
      const matchGrade = filterGrade === 'all' || s.grade === filterGrade;
      return matchSearch && matchGrade;
    });
  }, [students, search, filterGrade]);

  const achievementCounts = useMemo(() => {
    const map = {};
    achievements.forEach(a => { map[a.student_id] = (map[a.student_id] || 0) + 1; });
    return map;
  }, [achievements]);

  function getAchievementCount(studentId) {
    return achievementCounts[studentId] || 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    if (!form.name.trim()) { toast.error('请输入姓名'); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error('邮箱格式不正确'); return; }
    setSubmitting(true);
    try {
      if (editing) await api.updateStudent(editing.id, form);
      else await api.createStudent(form);
      toast.success(editing ? '学生信息已更新' : '学生已添加');
      setShowAdd(false); setEditing(null);
      setForm({ name: '', email: '', student_id: '', grade: '研一', major: '', research_topic: '', enrollment_date: '', expected_graduation: '' });
      load();
    } catch (e) { toast.error('操作失败：' + e.message); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id) {
    if (!confirm('确定要移除这名学生吗？（数据将保留为已毕业状态）')) return;
    try { await api.deleteStudent(id); toast.success('学生已移除'); load(); }
    catch (e) { toast.error('删除失败：' + e.message); }
  }

  function handleExportCSV() {
    const headers = ['姓名', '学号', '邮箱', '年级', '专业', '研究课题', '入学日期', '预计毕业', '学术成果数'];
    const rows = filtered.map(s => [
      s.name, s.student_id || '', s.email || '', s.grade || '', s.major || '',
      s.research_topic || '', s.enrollment_date || '', s.expected_graduation || '',
      getAchievementCount(s.id)
    ]);
    const csv = '\ufeff' + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `学生列表_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('导出成功');
  }

  function openEdit(s) {
    setEditing(s);
    setForm({ name: s.name, email: s.email || '', student_id: s.student_id || '', grade: s.grade || '研一', major: s.major || '', research_topic: s.research_topic || '', enrollment_date: s.enrollment_date || '', expected_graduation: s.expected_graduation || '' });
    setShowAdd(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient-warm">学生管理</h1>
          <p className="text-sm text-slate-400 mt-1">管理名下研究生信息</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV} className="btn btn-secondary">
            <Download className="w-4 h-4" /> 导出CSV
          </button>
          <button onClick={() => { setEditing(null); setForm({ name: '', email: '', student_id: '', grade: '研一', major: '', research_topic: '', enrollment_date: '', expected_graduation: '' }); setShowAdd(true); }}
            className="btn btn-primary">
            <Plus className="w-4 h-4" /> 添加学生
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索姓名、学号、课题..."
            className="input pl-10" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400" />
          {grades.map(g => (
            <button key={g} onClick={() => setFilterGrade(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterGrade === g ? 'text-white shadow-md' : 'bg-white/60 text-slate-500 hover:bg-white'}`}
              style={filterGrade === g ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' } : {}}>
              {g === 'all' ? '全部' : g}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-[var(--accent)] rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((student, i) => {
            const achCount = getAchievementCount(student.id);
            return (
              <div key={student.id} className="card p-5 group"
                style={{ animation: `staggerFadeIn .4s var(--spring-bounce) ${i * 60}ms both` }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold shrink-0"
                      style={{ background: `linear-gradient(135deg, var(--logo-from), var(--logo-to))` }}>
                      {student.name?.[0]}
                    </div>
                    <div>
                      <h3 className="text-slate-800 font-semibold">{student.name}</h3>
                      <p className="text-xs text-slate-400">{student.student_id || '暂无学号'}</p>
                    </div>
                  </div>
                  {achCount > 0 && (
                    <span className="badge badge-a flex items-center gap-1">
                      <Trophy className="w-3 h-3" />
                      {achCount}
                    </span>
                  )}
                </div>
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <GraduationCap className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                    <span>{student.grade} · {student.major || '未知专业'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <BookOpen className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                    <span className="truncate">{student.research_topic || '暂无课题'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                    <span>预计毕业：{student.expected_graduation || '未设置'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <Link to={`/students/${student.id}`} className="flex-1 text-center py-2 rounded-lg text-sm font-medium transition-all"
                    style={{ background: 'var(--accent-50)', color: 'var(--accent)' }}>
                    查看详情
                  </Link>
                  <Link to="/agile/dashboard"
                    className="text-center py-2 rounded-lg text-xs font-medium px-3 transition-all bg-purple-50 text-purple-500 hover:bg-purple-100">
                    项目看板
                  </Link>
                  <button onClick={() => openEdit(student)} className="btn-ghost px-3 py-2 rounded-lg text-xs text-slate-400">编辑</button>
                  <button onClick={() => handleDelete(student.id)} className="btn-ghost px-3 py-2 rounded-lg text-xs text-red-400 hover:!text-red-600">移除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <div className="text-center py-20 text-slate-300"><Users className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>未找到匹配的学生</p></div>
      )}

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)} title={editing ? '编辑学生' : '添加学生'}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="姓名" className="input" />
              <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="邮箱" className="input" />
              <input value={form.student_id} onChange={e => setForm({...form, student_id: e.target.value})} placeholder="学号" className="input" />
              <select value={form.grade} onChange={e => setForm({...form, grade: e.target.value})} className="select">
                {['研一','研二','研三','博士'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <input value={form.major} onChange={e => setForm({...form, major: e.target.value})} placeholder="专业" className="input" />
              <input value={form.enrollment_date} onChange={e => setForm({...form, enrollment_date: e.target.value})} placeholder="入学日期" type="date" className="input" />
            </div>
            <input value={form.research_topic} onChange={e => setForm({...form, research_topic: e.target.value})} placeholder="研究课题" className="input" />
            <input value={form.expected_graduation} onChange={e => setForm({...form, expected_graduation: e.target.value})} placeholder="预计毕业时间" type="date" className="input" />
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary flex-1">取消</button>
              <button type="submit" disabled={submitting} className="btn btn-primary flex-1">{submitting ? '提交中...' : (editing ? '保存' : '添加')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
