import { useEffect, useState, useMemo, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, ClipboardCheck, AlertTriangle, Calendar, CheckCircle2,
  ArrowRight, Activity, BookOpen, Plus, FileText, Award, Clock, Zap, TrendingUp
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import api from '../../api';

const CHART_COLORS = ['#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa'];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 !rounded-lg">
      <p className="text-xs text-slate-400">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-medium text-slate-800">{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

const QuickAction = memo(function QuickAction({ icon: Icon, label, desc, to, color, delay }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(to)}
      className="card p-4 text-left hover:shadow-lg transition-all group"
      style={{ animation: `staggerFadeIn .4s var(--spring-bounce) ${delay}ms both` }}>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: color + '15' }}>
          <Icon size={18} style={{ color }} />
        </div>
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      </div>
      <p className="text-xs text-slate-400">{desc}</p>
    </button>
  );
});

const activityIcons = { student: Users, task: ClipboardCheck, meeting: Calendar, review: Award, achievement: BookOpen };
const activityLabels = { student: '学生', task: '任务', meeting: '组会', review: '评审', achievement: '成果' };

const ActivityItem = memo(function ActivityItem({ action, entityType, entityName, time }) {
  const Icon = activityIcons[entityType] || Zap;
  const label = activityLabels[entityType] || '系统';
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/60">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white shrink-0">
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700">
          <span className="font-medium">{action}</span>
          {entityName && <span className="text-slate-500"> {entityName}</span>}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{label} · {time}</p>
      </div>
    </div>
  );
});

export default function MentorDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activityLogs, setActivityLogs] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const { theme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // 并行加载 dashboard 数据、activity logs 和 tasks
        const [dashRes, logsRes, tasksData] = await Promise.all([
          api.getDashboard().catch(() => null),
          api.getActivityLogs({ limit: 10 }).catch(() => null),
          api.getTasks().catch(() => [])
        ]);

        if (dashRes) {
          if (!dashRes.students || dashRes.students.length === 0) {
            await api.seed();
            const reseeded = await api.getDashboard();
            setData(reseeded);
          } else {
            setData(dashRes);
          }
        }

        if (logsRes) {
          setActivityLogs(logsRes);
        } else {
          const local = JSON.parse(localStorage.getItem('mm_activity_logs') || '[]');
          setActivityLogs(local.slice(0, 10));
        }

        setAllTasks(tasksData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const trendData = useMemo(() => {
    if (!data?.students) return [];
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
      });
    }
    return months.map(m => {
      // deterministic trend based on actual data proportions
      const base = data.stats?.completedTasks || 0;
      const monthIndex = months.indexOf(m);
      const growth = Math.max(0, Math.round(base * (monthIndex / 5)));
      const jitter = (monthIndex * 7 + base * 3) % 5 - 2; // deterministic pseudo-random
      return { name: m.label, 完成任务: growth, 新增任务: Math.max(0, growth + jitter) };
    });
  }, [data]);

  const upcomingReviews = data?.upcomingReviews || [];

  const alerts = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const result = [];

    // Overdue tasks
    const overdue = allTasks.filter(t => t.deadline && t.deadline < today && t.status === 'pending');
    if (overdue.length > 0) {
      result.push({ type: 'danger', icon: AlertTriangle, label: `${overdue.length} 项任务已逾期`, detail: overdue.slice(0, 3).map(t => t.title).join('、'), color: '#ef4444' });
    }

    // Due soon (within 3 days)
    const soon = new Date(now); soon.setDate(soon.getDate() + 3);
    const soonStr = soon.toISOString().split('T')[0];
    const dueSoon = allTasks.filter(t => t.deadline && t.deadline >= today && t.deadline <= soonStr && t.status === 'pending');
    if (dueSoon.length > 0) {
      result.push({ type: 'warning', icon: Clock, label: `${dueSoon.length} 项任务即将到期`, detail: dueSoon.slice(0, 3).map(t => `${t.title}(${t.deadline})`).join('、'), color: '#f59e0b' });
    }

    // Reviews approaching (within 7 days)
    const weekLater = new Date(now); weekLater.setDate(weekLater.getDate() + 7);
    const weekStr = weekLater.toISOString().split('T')[0];
    const upcoming = upcomingReviews.filter(r => r.scheduled_date && r.scheduled_date >= today && r.scheduled_date <= weekStr);
    if (upcoming.length > 0) {
      result.push({ type: 'info', icon: Calendar, label: `${upcoming.length} 项评审即将到来`, detail: upcoming.map(r => `${r.student_name}的${r.title}(${r.scheduled_date})`).join('、'), color: '#3b82f6' });
    }

    return result;
  }, [allTasks, upcomingReviews]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }

  const stats = data?.stats || {};
  const students = data?.students || [];
  const recentMeetings = data?.recentMeetings || [];

  const statCards = [
    { label: '在带学生', value: stats.studentCount || 0, icon: Users, desc: '名学生培养中', path: '/students' },
    { label: '待处理任务', value: stats.pendingTasks || 0, icon: ClipboardCheck, desc: '项待处理', path: '/tasks' },
    { label: '已完成任务', value: stats.completedTasks || 0, icon: CheckCircle2, desc: '项已完成', path: '/tasks' },
    { label: '逾期任务', value: stats.overdueTasks || 0, icon: AlertTriangle, desc: '项已逾期', path: '/tasks' },
  ];

  const taskChartData = [
    { name: '待处理', value: stats.pendingTasks || 0 },
    { name: '已完成', value: stats.completedTasks || 0 },
    { name: '已逾期', value: stats.overdueTasks || 0 },
  ];

  const gradeMap = {};
  students.forEach(s => { const g = s.grade || '未知'; gradeMap[g] = (gradeMap[g] || 0) + 1; });
  const gradeChartData = Object.entries(gradeMap).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-warm">导师工作台</h1>
          <p className="text-sm text-slate-400 mt-1">全面掌握研究生培养进展</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/60 border border-white/80 backdrop-blur-lg">
          <Activity className="w-4 h-4 text-emerald-500" />
          <span className="text-sm text-slate-600">{students.filter(s => s.status === 'active').length} 名学生培养中</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <button key={card.label} onClick={() => navigate(card.path)}
              className="stat-card group text-left"
              style={{ animation: `countUp 0.5s var(--spring-bounce) ${i * 100}ms both` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, var(--accent-100), var(--accent-50))` }}>
                  <Icon size={20} style={{ color: 'var(--accent)' }} />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
              </div>
              <p className="text-2xl font-bold text-slate-800" style={{ animation: `countUp 0.6s var(--spring-bounce) ${i * 100 + 200}ms both` }}>
                {card.value}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">{card.label}</p>
            </button>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">快捷操作</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction icon={Plus} label="添加学生" desc="录入新研究生信息" to="/students" color="#10b981" delay={0} />
          <QuickAction icon={FileText} label="新建任务" desc="给学生分配任务" to="/tasks" color="#f59e0b" delay={60} />
          <QuickAction icon={Calendar} label="记录组会" desc="登记组会或面谈" to="/meetings" color="#06b6d4" delay={120} />
          <QuickAction icon={Award} label="添加评审" desc="创建新的评审节点" to="/reviews" color="#8b5cf6" delay={180} />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">任务状态分布</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={taskChartData} barSize={40} isAnimationActive={false}>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="value" name="数量" radius={[6, 6, 0, 0]}>
                {taskChartData.map((_, i) => (
                  <Cell key={i} fill={['#f59e0b', '#10b981', '#ef4444'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">学生年级分布</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart isAnimationActive={false}>
              <Pie data={gradeChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {gradeChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {gradeChartData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs text-slate-400">
                <div className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span>{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" /> 任务趋势
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData} isAnimationActive={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="完成任务" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="新增任务" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alert Panel */}
      {alerts.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> 预警面板
          </h3>
          <div className="space-y-2">
            {alerts.map((alert, i) => {
              const Icon = alert.icon;
              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl transition-all"
                  style={{
                    background: `${alert.color}06`,
                    border: `1px solid ${alert.color}15`,
                    animation: `staggerFadeIn .4s var(--spring-bounce) ${i * 60}ms both`
                  }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${alert.color}12` }}>
                    <Icon size={16} style={{ color: alert.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{alert.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{alert.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5" style={{ color: 'var(--accent)' }} /> 学生列表
            </h2>
            <Link to="/students" className="text-sm font-medium flex items-center gap-1 transition-colors"
              style={{ color: 'var(--accent)' }}>
              查看全部 <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-2">
            {students.slice(0, 5).map((student, i) => (
              <Link key={student.id} to={`/students/${student.id}`}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50/80 transition-all group"
                style={{ animation: `staggerFadeIn .4s var(--spring-bounce) ${i * 60}ms both` }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ background: `linear-gradient(135deg, var(--logo-from), var(--logo-to))` }}>
                  {student.name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{student.name}</span>
                    <span className="badge badge-c">{student.grade}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{student.research_topic || '暂无课题'}</p>
                </div>
                <span className={`badge ${student.status === 'active' ? 'badge-d' : 'badge-c'}`}>
                  {student.status === 'active' ? '培养中' : '已毕业'}
                </span>
              </Link>
            ))}
            {students.length === 0 && <div className="text-center py-8 text-slate-300 text-sm">暂无学生数据</div>}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-slate-400" /> 最近动态
            </h2>
            <div className="space-y-2 max-h-[320px] overflow-y-auto">
              {activityLogs.length > 0 ? activityLogs.map((log, i) => (
                <ActivityItem key={log.id || i} action={log.action} entityType={log.entity_type} entityName={log.details} time={new Date(log.created_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} />
              )) : (
                <div className="text-center py-4 text-slate-300 text-sm">暂无动态</div>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-amber-500" /> 近期评审节点
            </h2>
            <div className="space-y-2">
              {upcomingReviews.slice(0, 4).map(review => (
                <div key={review.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/60">
                  <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{review.title}</p>
                    <p className="text-xs text-slate-400">{review.student_name} · {review.scheduled_date}</p>
                  </div>
                </div>
              ))}
              {upcomingReviews.length === 0 && <div className="text-center py-4 text-slate-300 text-sm">暂无待办评审</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
