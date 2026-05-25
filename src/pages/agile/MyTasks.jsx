import { useState, useEffect, useMemo } from 'react';
import {
  ClipboardList, CheckCircle2, Clock, AlertTriangle, Calendar,
  Filter, Search, ChevronDown, ChevronUp, Zap, Target, BookOpen
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import { SkeletonSpinner } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';

export default function MyTasks() {
  const toast = useToast();
  const [mentorTasks, setMentorTasks] = useState([]);
  const [agileTasks, setAgileTasks] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    try {
      const [mt, s] = await Promise.all([
        api.getTasks(),
        api.getSprints({ project_id: 1 }),
      ]);
      setMentorTasks(mt);
      setSprints(s);
      const activeSprint = s.find(sp => sp.status === 'active') || s[0];
      if (activeSprint) {
        const at = await api.getTasks({ sprint_id: activeSprint.id });
        setAgileTasks(at);
      }
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const today = new Date().toISOString().split('T')[0];

  const unifiedTasks = useMemo(() => {
    const items = [];
    mentorTasks.forEach(t => {
      items.push({
        id: `mentor-${t.id}`,
        source: 'mentor',
        sourceLabel: '导师指派',
        title: t.title,
        description: t.description,
        deadline: t.deadline,
        priority: t.priority,
        status: t.status === 'completed' ? 'done' : 'todo',
        category: t.category,
        student_name: t.student_name,
      });
    });
    agileTasks.forEach(t => {
      items.push({
        id: `agile-${t.id}`,
        source: 'agile',
        sourceLabel: '项目看板',
        title: t.title,
        description: t.story_title || '',
        deadline: t.due_date,
        priority: t.priority || 'B',
        status: t.status,
        category: '',
        story_points: t.story_points,
      });
    });
    return items;
  }, [mentorTasks, agileTasks]);

  const filtered = useMemo(() => {
    return unifiedTasks.filter(t => {
      const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(search.toLowerCase());
      let matchFilter = true;
      if (filter === 'pending') matchFilter = t.status !== 'done';
      else if (filter === 'done') matchFilter = t.status === 'done';
      else if (filter === 'overdue') matchFilter = t.deadline && t.deadline < today && t.status !== 'done';
      else if (filter === 'mentor') matchFilter = t.source === 'mentor';
      else if (filter === 'agile') matchFilter = t.source === 'agile';
      return matchSearch && matchFilter;
    });
  }, [unifiedTasks, filter, search, today]);

  const stats = useMemo(() => {
    const total = unifiedTasks.length;
    const done = unifiedTasks.filter(t => t.status === 'done').length;
    const overdue = unifiedTasks.filter(t => t.deadline && t.deadline < today && t.status !== 'done').length;
    const dueSoon = unifiedTasks.filter(t => {
      if (!t.deadline || t.status === 'done') return false;
      const diff = (new Date(t.deadline) - new Date(today)) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 3;
    }).length;
    return { total, done, overdue, dueSoon, rate: total ? Math.round(done / total * 100) : 0 };
  }, [unifiedTasks, today]);

  const priorityColors = { urgent: 'badge-s', high: 'badge-a', S: 'badge-s', A: 'badge-a', B: 'badge-b', C: 'badge-c', D: 'badge-c', medium: 'badge-b', low: 'badge-c' };
  const priorityLabels = { urgent: '紧急', high: '高', medium: '中', low: '低', S: 'S', A: 'A', B: 'B', C: 'C', D: 'D' };
  const statusLabels = { todo: '待办', backlog: '待办', this_sprint: '本周', in_progress: '进行中', verify: '待验收', done: '已完成' };
  const statusColors = { todo: 'text-slate-400', backlog: 'text-slate-400', this_sprint: 'text-blue-500', in_progress: 'text-amber-500', verify: 'text-purple-500', done: 'text-emerald-500' };
  const categoryLabels = { reading: '文献阅读', experiment: '实验研究', writing: '论文写作', general: '一般任务', coding: '代码开发' };

  if (loading) return <SkeletonSpinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">我的任务</h1>
        <p className="text-sm text-slate-400 mt-1">导师指派 + 项目看板，统一视图</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '总任务', value: stats.total, icon: ClipboardList, color: 'var(--accent)' },
          { label: '完成率', value: `${stats.rate}%`, icon: Target, color: '#10b981' },
          { label: '已逾期', value: stats.overdue, icon: AlertTriangle, color: '#ef4444' },
          { label: '即将到期', value: stats.dueSoon, icon: Clock, color: '#f59e0b' },
        ].map((s, i) => (
          <div key={s.label} className="stat-card" style={{ animation: `slideUp .5s var(--spring-bounce) ${i * 0.06}s both` }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{s.label}</span>
              <s.icon size={16} style={{ color: s.color }} />
            </div>
            <div className="text-2xl font-bold text-slate-900">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索任务..." className="input pl-10" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400" />
          {[
            { k: 'all', l: '全部' }, { k: 'pending', l: '进行中' }, { k: 'done', l: '已完成' },
            { k: 'overdue', l: '已逾期' }, { k: 'mentor', l: '导师指派' }, { k: 'agile', l: '项目看板' },
          ].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f.k ? 'text-white shadow-md' : 'bg-white/60 text-slate-500 hover:bg-white'}`}
              style={filter === f.k ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' } : {}}>
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {filtered.map((task, i) => {
          const isOverdue = task.deadline && task.deadline < today && task.status !== 'done';
          const isExpanded = expandedId === task.id;
          return (
            <div key={task.id} className="card overflow-hidden"
              style={{ animation: `staggerFadeIn .35s var(--spring-bounce) ${i * 30}ms both`, borderLeft: isOverdue ? '3px solid #ef4444' : '3px solid transparent' }}>
              <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50/40 transition-all"
                onClick={() => setExpandedId(isExpanded ? null : task.id)}>
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all
                  ${task.status === 'done' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-200'}`}>
                  {task.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${task.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{task.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${task.source === 'mentor' ? 'bg-orange-50 text-orange-500' : 'bg-indigo-50 text-indigo-500'}`}>
                      {task.sourceLabel}
                    </span>
                    {task.category && <span className="text-[10px] text-slate-300">{categoryLabels[task.category]}</span>}
                    {task.story_points && <span className="text-[10px] font-bold text-indigo-400">{task.story_points}pt</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`badge text-[10px] ${priorityColors[task.priority] || 'badge-c'}`}>
                    {priorityLabels[task.priority] || task.priority}
                  </span>
                  <span className={`text-[10px] font-medium ${statusColors[task.status] || 'text-slate-400'}`}>
                    {statusLabels[task.status] || task.status}
                  </span>
                  {task.deadline && (
                    <span className={`text-[10px] flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : 'text-slate-300'}`}>
                      <Calendar size={10} />{task.deadline.slice(5)}
                    </span>
                  )}
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
                </div>
              </div>
              {isExpanded && task.description && (
                <div className="px-4 pb-4 pt-0 border-t border-slate-50" style={{ animation: 'slideDown 0.2s ease' }}>
                  <p className="text-sm text-slate-500 mt-3">{task.description}</p>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="card text-center py-16">
            <Target className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="text-sm text-slate-400">暂无匹配任务</p>
          </div>
        )}
      </div>
    </div>
  );
}
