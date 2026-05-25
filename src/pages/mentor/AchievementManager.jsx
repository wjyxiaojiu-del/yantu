import { useEffect, useState } from 'react';
import { Trophy, Plus, Search, Filter, FileText, Award, FlaskConical, Zap, Edit2, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

const typeConfig = {
  paper: { label: '论文', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  patent: { label: '专利', icon: Award, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  project: { label: '项目', icon: FlaskConical, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  competition: { label: '竞赛', icon: Zap, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
};

const statusConfig = {
  published: { label: '已发表', badge: 'badge-d' },
  accepted: { label: '已接收', badge: 'badge-c' },
  submitted: { label: '投稿中', badge: 'badge-b' },
  draft: { label: '草稿', badge: 'badge-a' },
};

export default function AchievementManager() {
  const [achievements, setAchievements] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ student_id: '', title: '', achievement_type: 'paper', journal_or_conference: '', publish_date: '', doi_or_link: '', status: 'published', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [aData, sData] = await Promise.all([api.getAchievements(), api.getStudents()]);
    setAchievements(aData); setStudents(sData);
    setLoading(false);
  }

  const filtered = achievements.filter(a => {
    const s = students.find(st => st.id === a.student_id);
    const matchSearch = (a.title + (s?.name || '') + (a.journal_or_conference || '')).toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || a.achievement_type === filterType;
    return matchSearch && matchType;
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (editing) await api.updateAchievement(editing.id, form);
      else await api.createAchievement(form);
      toast.success(editing ? '成果已更新' : '成果已添加');
      setShowAdd(false); setEditing(null);
      setForm({ student_id: '', title: '', achievement_type: 'paper', journal_or_conference: '', publish_date: '', doi_or_link: '', status: 'published', notes: '' });
      load();
    } catch (e) { toast.error('操作失败：' + e.message); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id) {
    if (!confirm('确定删除此成果？')) return;
    try { await api.deleteAchievement(id); toast.success('成果已删除'); load(); }
    catch (e) { toast.error('删除失败：' + e.message); }
  }

  function openEdit(a) {
    setEditing(a);
    setForm({ student_id: String(a.student_id), title: a.title, achievement_type: a.achievement_type, journal_or_conference: a.journal_or_conference || '', publish_date: a.publish_date || '', doi_or_link: a.doi_or_link || '', status: a.status, notes: a.notes || '' });
    setShowAdd(true);
  }

  const types = ['all', 'paper', 'patent', 'project', 'competition'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient-warm">学术成果</h1>
          <p className="text-sm text-slate-400 mt-1">管理学生的论文、专利、项目和竞赛成果</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ student_id: '', title: '', achievement_type: 'paper', journal_or_conference: '', publish_date: '', doi_or_link: '', status: 'published', notes: '' }); setShowAdd(true); }}
          className="btn btn-primary"><Plus className="w-4 h-4" /> 添加成果</button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索标题、学生、期刊..." className="input pl-10" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400" />
          {types.map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === t ? 'text-white shadow-md' : 'bg-white/60 text-slate-500 hover:bg-white'}`}
              style={filterType === t ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' } : {}}>
              {t === 'all' ? '全部' : typeConfig[t]?.label || t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-[var(--accent)] rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((a, i) => {
            const student = students.find(s => s.id === a.student_id);
            const tcfg = typeConfig[a.achievement_type] || typeConfig.paper;
            const Icon = tcfg.icon;
            const scfg = statusConfig[a.status] || statusConfig.draft;
            return (
              <div key={a.id} className="card p-5 group"
                style={{ animation: `staggerFadeIn .4s var(--spring-bounce) ${i * 60}ms both` }}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium ${tcfg.bg} ${tcfg.color} border ${tcfg.border}`}>
                    <Icon className="w-3.5 h-3.5" /> {tcfg.label}
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-all">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <h3 className="text-slate-800 font-semibold mb-1 line-clamp-2">{a.title}</h3>
                <p className="text-sm text-slate-400 mb-3">{student?.name || '未知学生'} · {student?.grade || ''}</p>

                {a.journal_or_conference && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <FileText className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    <span className="truncate">{a.journal_or_conference}</span>
                  </div>
                )}
                {a.publish_date && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                    <span className="text-slate-300">📅</span>
                    <span>{a.publish_date}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className={`badge ${scfg.badge}`}>{scfg.label}</span>
                  {a.doi_or_link && (
                    <a href={a.doi_or_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80" style={{ color: 'var(--accent)' }}>
                      <ExternalLink className="w-3 h-3" /> 查看
                    </a>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-20 text-slate-300 md:col-span-2 xl:col-span-3">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>暂无学术成果</p>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)} title={editing ? '编辑成果' : '添加成果'}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <select required value={form.student_id} onChange={e => setForm({...form, student_id: e.target.value})} className="select">
              <option value="">选择学生</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.grade})</option>)}
            </select>
            <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="成果标题" className="input" />
            <div className="grid grid-cols-2 gap-3">
              <select value={form.achievement_type} onChange={e => setForm({...form, achievement_type: e.target.value})} className="select">
                <option value="paper">论文</option><option value="patent">专利</option><option value="project">项目</option><option value="competition">竞赛</option>
              </select>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="select">
                <option value="published">已发表</option><option value="accepted">已接收</option><option value="submitted">投稿中</option><option value="draft">草稿</option>
              </select>
            </div>
            <input value={form.journal_or_conference} onChange={e => setForm({...form, journal_or_conference: e.target.value})} placeholder="期刊 / 会议 / 奖项名称" className="input" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.publish_date} onChange={e => setForm({...form, publish_date: e.target.value})} type="date" placeholder="发表日期" className="input" />
              <input value={form.doi_or_link} onChange={e => setForm({...form, doi_or_link: e.target.value})} placeholder="DOI / 链接" className="input" />
            </div>
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
