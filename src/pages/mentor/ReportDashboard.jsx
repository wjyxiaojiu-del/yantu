import { useState, useEffect } from 'react';
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, FileText, CheckCircle2, CalendarDays, AlertTriangle, TrendingUp, Download, Loader2, ChevronRight, GraduationCap, Clock, Award, BarChart3 } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

const COLORS = ['#f97316', '#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];
const PRIORITY_COLORS = { urgent: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#10b981' };
const TT = { borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' };
const AXIS_STYLE = { fontSize: 12, fill: '#94a3b8' };
const ANIM = (d = 0) => ({ animation: `slideUp .5s var(--spring-bounce) ${d}s both` });

function StatCard({ icon: Icon, label, value, sub, color, delay }) {
  return (
    <div className="card p-4 flex items-start gap-3" style={{ animation: `slideUp .5s var(--spring-bounce) ${delay}s both` }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}12` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function ReportDashboard() {
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getReportDashboard();
      setData(res);
    } catch (e) {
      toast.error('加载报表失败');
    } finally {
      setLoading(false);
    }
  };

  const summary = data?.summary || {};
  const gradeDist = data?.gradeDistribution || [];
  const paperTrend = data?.papersByYear || [];
  const tasksByPriority = data?.tasksByPriority || [];
  const warnings = data?.warnings || {};

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <Loader2 size={32} className="animate-spin text-orange-500 mb-3" />
        <span className="text-sm text-slate-400">加载报表数据中...</span>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 size={24} className="text-orange-500" />
            课题组数据大屏
          </h1>
          <p className="text-sm text-slate-400 mt-1">实时监控课题组运行状态与学术产出</p>
        </div>
        <button onClick={() => window.print()} className="btn btn-secondary gap-1.5 text-sm">
          <Download size={14} /> 导出报表
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard icon={Users} label="在研学生" value={summary.totalStudents || 0} sub={`博士 ${summary.gradStudents || 0} · 硕士 ${summary.masterStudents || 0}`} color="#6366f1" delay={0} />
        <StatCard icon={FileText} label="学术成果" value={summary.totalPapers || 0} sub="累计发表论文/专利/项目" color="#10b981" delay={0.05} />
        <StatCard icon={CheckCircle2} label="任务完成率" value={`${summary.taskCompletionRate || 0}%`} sub={`逾期 ${summary.taskOverdueRate || 0}%`} color="#f59e0b" delay={0.1} />
        <StatCard icon={CalendarDays} label="本月组会" value={summary.meetingsThisMonth || 0} sub={`累计 ${summary.totalMeetings || 0} 场`} color="#f97316" delay={0.15} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Paper Trend */}
        <div className="card p-5 lg:col-span-2" style={ANIM(.1)}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700">学术产出趋势</h3>
            <span className="text-xs text-slate-400">按年度统计</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[...paperTrend].reverse()} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} formatter={(value) => [value, '论文数']} />
              <Bar dataKey="count" fill="#f97316" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Grade Distribution */}
        <div className="card p-5" style={ANIM(.15)}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700">学生年级分布</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={gradeDist}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={4}
                dataKey="count"
                nameKey="grade"
              >
                {gradeDist.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TT} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2">
            {gradeDist.slice(0, 4).map((g, i) => (
              <span key={g.grade} className="text-[11px] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-slate-500">{g.grade}</span>
                <span className="text-slate-700 font-medium">{g.count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Task Priority */}
        <div className="card p-5" style={ANIM(.2)}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700">任务优先级分布</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={tasksByPriority} layout="vertical" barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis dataKey="priority" type="category" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={60} />
              <Tooltip contentStyle={TT} />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {tasksByPriority.map((t) => (
                  <Cell key={t.priority} fill={PRIORITY_COLORS[t.priority] || '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Enrollment Trend */}
        <div className="card p-5" style={ANIM(.25)}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700">入学趋势</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={[...data?.enrollmentTrend || []].reverse()}>
              <defs>
                <linearGradient id="enrollGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} />
              <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} fill="url(#enrollGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Warnings Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={ANIM(.3)}>
        {/* High Risk */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-red-500" />
            <h3 className="text-sm font-bold text-slate-700">延期风险预警</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
              {warnings.highRisk?.length || 0} 人
            </span>
          </div>
          {warnings.highRisk?.length > 0 ? (
            <div className="space-y-2">
              {warnings.highRisk.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/students/${s.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-50/50 hover:bg-red-50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-600">
                    {s.name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700">{s.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {s.grade} · {Math.max(0, Math.round(s.days_left))} 天到期 · {s.paper_count} 篇论文 · {s.pending_tasks} 个待办
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-300" />
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-slate-400">暂无高风险学生</div>
          )}
        </div>

        {/* No Paper */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-amber-500" />
            <h3 className="text-sm font-bold text-slate-700">长期无成果关注</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">
              {warnings.noPaper?.length || 0} 人
            </span>
          </div>
          {warnings.noPaper?.length > 0 ? (
            <div className="space-y-2">
              {warnings.noPaper.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/students/${s.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-50/50 hover:bg-amber-50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-600">
                    {s.name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700">{s.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {s.grade} · 入学 {Math.round(s.days_enrolled)} 天 · 暂无论文产出
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-300" />
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-slate-400">暂无需要关注的学生</div>
          )}
        </div>
      </div>
    </div>
  );
}
