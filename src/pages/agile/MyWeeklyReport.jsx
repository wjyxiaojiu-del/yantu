import { useState, useEffect } from 'react';
import { FileText, Calendar, CheckCircle2, Clock, Loader2, Plus, ChevronRight, AlertTriangle, Users, BookOpen, BarChart3 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import api from '../../api';
import { SkeletonText } from '../../components/Skeleton';

export default function MyWeeklyReport() {
  const { user } = useAuth();
  const toast = useToast();
  const [reports, setReports] = useState([]);
  const [currentReport, setCurrentReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
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
      const data = await api.getWeeklyReports({ student_id: user?.id, limit: 10 });
      setReports(data);
      // Find current week report
      const current = data.find(r => r.week_start === selectedWeek.start && r.week_end === selectedWeek.end);
      setCurrentReport(current || null);
    } catch (e) {
      toast.error('加载周报失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  const handleGenerate = async () => {
    if (!user?.id) return;
    setGenerating(true);
    try {
      const res = await api.generateWeeklyReport({ student_id: user.id, week_start: selectedWeek.start, week_end: selectedWeek.end });
      toast.success('周报生成成功');
      setCurrentReport(res.report);
      await load();
    } catch (e) {
      if (e.status === 409) {
        toast.error('本周周报已存在');
        await load();
      } else {
        toast.error(e.message || '生成失败');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentReport?.id) return;
    try {
      await api.submitWeeklyReport(currentReport.id);
      toast.success('周报已提交');
      await load();
    } catch (e) {
      toast.error(e.message || '提交失败');
    }
  };

  const handlePrevWeek = () => {
    const s = new Date(selectedWeek.start);
    s.setDate(s.getDate() - 7);
    const e = new Date(selectedWeek.end);
    e.setDate(e.getDate() - 7);
    const pad = n => String(n).padStart(2, '0');
    const newWeek = { start: `${s.getFullYear()}-${pad(s.getMonth()+1)}-${pad(s.getDate())}`, end: `${e.getFullYear()}-${pad(e.getMonth()+1)}-${pad(e.getDate())}` };
    setSelectedWeek(newWeek);
    const found = reports.find(r => r.week_start === newWeek.start && r.week_end === newWeek.end);
    setCurrentReport(found || null);
  };

  const handleNextWeek = () => {
    const s = new Date(selectedWeek.start);
    s.setDate(s.getDate() + 7);
    const e = new Date(selectedWeek.end);
    e.setDate(e.getDate() + 7);
    const pad = n => String(n).padStart(2, '0');
    const newWeek = { start: `${s.getFullYear()}-${pad(s.getMonth()+1)}-${pad(s.getDate())}`, end: `${e.getFullYear()}-${pad(e.getMonth()+1)}-${pad(e.getDate())}` };
    setSelectedWeek(newWeek);
    const found = reports.find(r => r.week_start === newWeek.start && r.week_end === newWeek.end);
    setCurrentReport(found || null);
  };

  return (
    <div className="max-w-[800px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText size={24} className="text-orange-500" />
            我的周报
          </h1>
          <p className="text-sm text-slate-400 mt-1">自动生成并提交每周工作进展</p>
        </div>
      </div>

      {/* Week Selector */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={handlePrevWeek} className="btn btn-secondary text-xs">← 上周</button>
        <div className="text-sm font-medium text-slate-700 px-3 py-1.5 bg-white rounded-lg border border-slate-200">
          <Calendar size={14} className="inline mr-1 text-slate-400" />
          {selectedWeek.start} ~ {selectedWeek.end}
        </div>
        <button onClick={handleNextWeek} className="btn btn-secondary text-xs">下周 →</button>
      </div>

      {/* Current Week Report */}
      <div className="card p-5 mb-5">
        {currentReport ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800">{currentReport.period_label || '本周周报'}</h3>
                {currentReport.status === 'submitted' ? (
                  <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> 已提交</span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-600 flex items-center gap-1"><Clock size={12} /> 草稿</span>
                )}
              </div>
              {currentReport.status !== 'submitted' && (
                <button onClick={handleSubmit} className="btn btn-primary text-xs gap-1.5">
                  <CheckCircle2 size={12} /> 提交周报
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 text-center">
                <div className="text-xl font-bold text-slate-800">{currentReport.attendance_days}</div>
                <div className="text-xs text-slate-500">出勤天数</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 text-center">
                <div className="text-xl font-bold text-slate-800">{currentReport.total_work_hours}h</div>
                <div className="text-xs text-slate-500">工作时长</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 text-center">
                <div className="text-xl font-bold text-slate-800">{currentReport.completed_tasks}</div>
                <div className="text-xs text-slate-500">完成任务</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 text-center">
                <div className="text-xl font-bold text-slate-800">{currentReport.pending_tasks}</div>
                <div className="text-xs text-slate-500">待办任务</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 text-center">
                <div className="text-xl font-bold text-slate-800">{currentReport.new_literature}</div>
                <div className="text-xs text-slate-500">新增文献</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 text-center">
                <div className="text-xl font-bold text-slate-800">{currentReport.meetings_attended}</div>
                <div className="text-xs text-slate-500">参加组会</div>
              </div>
            </div>

            {currentReport.overdue_tasks > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm flex items-center gap-2">
                <AlertTriangle size={14} />
                本周有 {currentReport.overdue_tasks} 个任务已逾期，请及时处理
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <FileText size={28} className="text-slate-400" />
            </div>
            <h3 className="text-sm font-medium text-slate-700 mb-1">本周周报未生成</h3>
            <p className="text-xs text-slate-400 mb-4">系统会自动聚合你的考勤、任务、文献等数据</p>
            <button onClick={handleGenerate} disabled={generating} className="btn btn-primary gap-1.5 text-sm">
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              生成周报
            </button>
          </div>
        )}
      </div>

      {/* History */}
      <div className="card p-5">
        <h3 className="text-sm font-bold text-slate-700 mb-4">历史周报</h3>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50">
                <div className="w-2 h-2 rounded-full bg-slate-200" />
                <SkeletonText lines={2} lastWidth="40%" className="flex-1" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {reports.filter(r => r.id !== currentReport?.id).map(r => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <div className={`w-2 h-2 rounded-full ${r.status === 'submitted' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-700">{r.period_label || `${r.week_start} ~ ${r.week_end}`}</div>
                  <div className="text-xs text-slate-400">任务 {r.completed_tasks} · 文献 {r.new_literature} · 工时 {r.total_work_hours}h</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.status === 'submitted' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {r.status === 'submitted' ? '已提交' : '草稿'}
                </span>
              </div>
            ))}
            {reports.length <= 1 && <div className="text-center py-6 text-sm text-slate-400">暂无历史周报</div>}
          </div>
        )}
      </div>
    </div>
  );
}
