import { useState, useEffect } from 'react';
import { FileText, CheckCircle2, Clock, AlertTriangle, Users, Calendar, ChevronRight, Loader2, RefreshCw, Eye } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { Skeleton, SkeletonAvatar, SkeletonText } from '../../components/Skeleton';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}12` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export default function WeeklyReports() {
  const toast = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const pad = n => String(n).padStart(2, '0');
    return { start: `${mon.getFullYear()}-${pad(mon.getMonth()+1)}-${pad(mon.getDate())}`, end: `${sun.getFullYear()}-${pad(sun.getMonth()+1)}-${pad(sun.getDate())}` };
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getWeeklyReportStats({ week_start: selectedWeek.start, week_end: selectedWeek.end });
      setStats(data);
    } catch (e) {
      toast.error('加载周报数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [selectedWeek.start, selectedWeek.end]);

  const handlePrevWeek = () => {
    const s = new Date(selectedWeek.start);
    s.setDate(s.getDate() - 7);
    const e = new Date(selectedWeek.end);
    e.setDate(e.getDate() - 7);
    const pad = n => String(n).padStart(2, '0');
    setSelectedWeek({ start: `${s.getFullYear()}-${pad(s.getMonth()+1)}-${pad(s.getDate())}`, end: `${e.getFullYear()}-${pad(e.getMonth()+1)}-${pad(e.getDate())}` });
  };

  const handleNextWeek = () => {
    const s = new Date(selectedWeek.start);
    s.setDate(s.getDate() + 7);
    const e = new Date(selectedWeek.end);
    e.setDate(e.getDate() + 7);
    const pad = n => String(n).padStart(2, '0');
    setSelectedWeek({ start: `${s.getFullYear()}-${pad(s.getMonth()+1)}-${pad(s.getDate())}`, end: `${e.getFullYear()}-${pad(e.getMonth()+1)}-${pad(e.getDate())}` });
  };

  const period = stats?.period || selectedWeek;

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText size={24} className="text-orange-500" />
            周报管理
          </h1>
          <p className="text-sm text-slate-400 mt-1">查看学生每周工作进展与产出</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrevWeek} className="btn btn-secondary text-xs">← 上周</button>
          <div className="text-sm font-medium text-slate-700 px-3 py-1.5 bg-white rounded-lg border border-slate-200">
            <Calendar size={14} className="inline mr-1 text-slate-400" />
            {period.start} ~ {period.end}
          </div>
          <button onClick={handleNextWeek} className="btn btn-secondary text-xs">下周 →</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard icon={Users} label="应提交人数" value={stats?.totalStudents || 0} color="#6366f1" />
        <StatCard icon={CheckCircle2} label="已提交" value={stats?.submittedCount || 0} color="#10b981" />
        <StatCard icon={Clock} label="待提交" value={stats?.draftCount || 0} color="#f59e0b" />
        <StatCard icon={AlertTriangle} label="提交率" value={`${stats?.submissionRate || 0}%`} color="#f97316" />
      </div>

      {/* Report List */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-700">学生周报列表</h3>
          <button onClick={load} className="btn btn-ghost text-xs gap-1"><RefreshCw size={12} /> 刷新</button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-slate-50">
                <SkeletonAvatar size="w-10 h-10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {stats?.reports?.map(r => (
              <div key={r.id} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-sm font-bold text-slate-600 border border-slate-200">
                  {r.student_name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{r.student_name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500">{r.student_grade}</span>
                    {r.status === 'submitted' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 flex items-center gap-1"><CheckCircle2 size={10} /> 已提交</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 flex items-center gap-1"><Clock size={10} /> 未提交</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                    <span>出勤 {r.attendance_days} 天</span>
                    <span>工时 {r.total_work_hours}h</span>
                    <span>完成任务 {r.completed_tasks}</span>
                    <span>逾期 {r.overdue_tasks}</span>
                    <span>文献 {r.new_literature}</span>
                    <span>组会 {r.meetings_attended}</span>
                  </div>
                </div>
                <button onClick={() => navigate(`/weekly-reports/${r.id}`)} className="p-2 rounded-lg hover:bg-white text-slate-400 hover:text-slate-600 transition-colors">
                  <Eye size={16} />
                </button>
              </div>
            ))}
            {(!stats?.reports?.length) && (
              <div className="text-center py-12 text-sm text-slate-400">
                本周暂无周报数据
                <p className="text-xs text-slate-300 mt-1">学生可以在「我的周报」中生成并提交</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
