import { useEffect, useState, useMemo } from 'react';
import {
  Users, FileText, Calendar, CheckCircle2, AlertTriangle, Trophy,
  Clock, TrendingUp, BookOpen, GraduationCap, BarChart3
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import api from '../../api';
import { SkeletonCard } from '../../components/Skeleton';

const COLORS = ['#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa', '#10b981', '#06b6d4', '#8b5cf6'];

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

export default function MentorOverview() {
  const [dash, setDash] = useState(null);
  const [report, setReport] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [d, r, a] = await Promise.all([
        api.getDashboard().catch(() => null),
        api.getReportDashboard().catch(() => null),
        api.getAchievements().catch(() => []),
      ]);
      setDash(d);
      setReport(r);
      setAchievements(Array.isArray(a) ? a : []);
      setUpdatedAt(new Date());
      setLoading(false);
    })();
  }, []);

  const stats = dash?.stats || {};
  const students = dash?.students || [];
  const summary = report?.summary || {};
  const warnings = report?.warnings || {};
  const recentMeetings = dash?.recentMeetings || [];

  // Merge high-risk + no-paper warnings
  const alerts = useMemo(() => {
    const list = [];
    (warnings.highRisk || []).forEach(s => {
      list.push({
        name: s.name,
        grade: s.grade,
        reason: s.days_left != null && s.days_left <= 180
          ? `距毕业 ${s.days_left} 天，${s.paper_count || 0} 篇论文，${s.pending_tasks || 0} 个待处理任务`
          : `${s.paper_count || 0} 篇论文，${s.pending_tasks || 0} 个待处理任务`,
        level: s.days_left != null && s.days_left <= 90 ? 'danger' : 'warning',
      });
    });
    (warnings.noPaper || []).forEach(s => {
      if (!list.find(x => x.name === s.name)) {
        list.push({ name: s.name, grade: s.grade, reason: '入学超 1 年，暂无学术成果', level: 'warning' });
      }
    });
    return list;
  }, [warnings]);

  const gradeChartData = useMemo(() => {
    if (report?.gradeDistribution?.length) return report.gradeDistribution;
    const map = {};
    students.forEach(s => { const g = s.grade || '未知'; map[g] = (map[g] || 0) + 1; });
    return Object.entries(map).map(([name, count]) => ({ name, count }));
  }, [report, students]);

  const trendData = useMemo(() => {
    if (report?.papersByYear?.length) return report.papersByYear;
    return [];
  }, [report]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard /><SkeletonCard />
        </div>
      </div>
    );
  }

  const statCards = [
    { label: '在带学生', value: summary.totalStudents ?? stats.studentCount ?? 0, icon: Users, color: '#3b82f6' },
    { label: '学术成果', value: summary.totalPapers ?? 0, icon: FileText, color: '#10b981' },
    { label: '本月组会', value: summary.meetingsThisMonth ?? 0, icon: Calendar, color: '#06b6d4' },
    { label: '任务完成率', value: `${summary.taskCompletionRate ?? 0}%`, icon: CheckCircle2, color: '#8b5cf6' },
    { label: '预警学生', value: alerts.length, icon: AlertTriangle, color: alerts.length > 0 ? '#ef4444' : '#94a3b8' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-warm">课题组总览</h1>
          <p className="text-sm text-slate-400 mt-1">一目了然掌握课题组全貌</p>
        </div>
        {updatedAt && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/60 border border-white/80 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            更新于 {updatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {statCards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="stat-card">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ background: card.color + '15' }}>
                <Icon size={20} style={{ color: card.color }} />
              </div>
              <p className="text-2xl font-bold text-slate-800">{card.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* Warnings */}
      {alerts.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> 预警关注
          </h3>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl"
                style={{
                  background: a.level === 'danger' ? '#fef2f2' : '#fffbeb',
                  border: `1px solid ${a.level === 'danger' ? '#fecaca' : '#fde68a'}`,
                }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: `linear-gradient(135deg, var(--logo-from), var(--logo-to))` }}>
                  {a.name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-700">{a.name}</span>
                  {a.grade && <span className="text-xs text-slate-400 ml-2">{a.grade}</span>}
                  <p className="text-xs text-slate-500 mt-0.5">{a.reason}</p>
                </div>
                <span className={`badge ${a.level === 'danger' ? 'badge-s' : 'badge-b'}`}>
                  {a.level === 'danger' ? '高风险' : '关注'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Grade Distribution */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-slate-400" /> 学生年级分布
          </h3>
          {gradeChartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart isAnimationActive={false}>
                  <Pie data={gradeChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}
                    dataKey={gradeChartData[0]?.count != null ? 'count' : 'value'}>
                    {gradeChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {gradeChartData.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span>{item.name} ({item.count ?? item.value})</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-slate-300 text-sm">暂无数据</div>
          )}
        </div>

        {/* Paper Trend */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" /> 成果发表趋势
          </h3>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData} isAnimationActive={false}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="count" name="成果数" stroke="var(--accent)" fill="url(#colorCount)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-slate-300 text-sm">暂无数据</div>
          )}
        </div>
      </div>

      {/* Meetings & Achievements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent Meetings */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-500" /> 近期组会
          </h3>
          {recentMeetings.length > 0 ? (
            <div className="space-y-2">
              {recentMeetings.slice(0, 5).map(m => (
                <div key={m.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/60">
                  <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{m.topic || '未填写主题'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {m.meeting_date} · {m.meeting_type === 'individual' ? '一对一' : '组会'}
                      {m.status && <span className="ml-2 text-slate-300">({m.status === 'completed' ? '已完成' : m.status})</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-300 text-sm">暂无组会记录</div>
          )}
        </div>

        {/* Recent Achievements */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-emerald-500" /> 最新成果
          </h3>
          {achievements.length > 0 ? (
            <div className="space-y-2">
              {achievements.slice(0, 5).map(a => {
                const student = students.find(s => s.id === a.student_id);
                return (
                  <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/60">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: a.achievement_type === 'paper' ? '#dbeafe' : a.achievement_type === 'patent' ? '#fef3c7' : '#d1fae5' }}>
                      {a.achievement_type === 'paper' ? <FileText className="w-4 h-4 text-blue-500" /> :
                       a.achievement_type === 'patent' ? <Award className="w-4 h-4 text-amber-500" /> :
                       <BookOpen className="w-4 h-4 text-emerald-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{a.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {student?.name || '未知'} · {a.journal_or_conference || a.achievement_type}
                        {a.publish_date && <span className="ml-1">· {a.publish_date}</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-300 text-sm">暂无成果记录</div>
          )}
        </div>
      </div>

      {/* Student Overview Table */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" /> 学生一览
        </h3>
        {students.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 px-3 text-xs font-medium text-slate-400">姓名</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-slate-400">年级</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-slate-400">课题方向</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-slate-400">状态</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ background: `linear-gradient(135deg, var(--logo-from), var(--logo-to))` }}>
                          {s.name?.[0]}
                        </div>
                        <span className="font-medium text-slate-700">{s.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{s.grade || '-'}</td>
                    <td className="py-2.5 px-3 text-slate-400 max-w-[200px] truncate">{s.research_topic || '-'}</td>
                    <td className="py-2.5 px-3">
                      <span className={`badge ${s.status === 'active' ? 'badge-d' : 'badge-c'}`}>
                        {s.status === 'active' ? '培养中' : '已毕业'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-300 text-sm">暂无学生数据</div>
        )}
      </div>
    </div>
  );
}
