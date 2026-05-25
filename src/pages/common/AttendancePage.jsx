import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock, Play, Square, Calendar as CalendarIcon, BarChart3, User, Filter,
  CheckCircle2, Timer, TrendingUp, Award, AlertCircle
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';

function formatHM(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatYMD(d) {
  return d.toISOString().split('T')[0];
}

export default function AttendancePage() {
  const { user } = useAuth();
  const toast = useToast();
  const isMentor = user?.role === 'mentor';
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [todayRecord, setTodayRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [workContent, setWorkContent] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [filterStudent, setFilterStudent] = useState('');
  const todayStr = formatYMD(new Date());
  const weekAgoStr = formatYMD(new Date(Date.now() - 7 * 86400000));
  const [dateRange, setDateRange] = useState({ start: weekAgoStr, end: todayStr });
  const [students, setStudents] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const today = formatYMD(new Date());
      const weekAgo = formatYMD(new Date(Date.now() - 7 * 86400000));

      if (isMentor) {
        const [recs, st, allStudents] = await Promise.all([
          api.getAttendance({ start: dateRange.start || weekAgo, end: dateRange.end || today }),
          api.getAttendanceStats({ start: dateRange.start || weekAgo, end: dateRange.end || today }),
          api.getStudents(),
        ]);
        setRecords(recs);
        setStats(st);
        setStudents(allStudents);
      } else {
        const [recs, st, todayRec] = await Promise.all([
          api.getAttendance({ user_id: user?.id, start: weekAgo, end: today }),
          api.getAttendanceStats({ user_id: user?.id, start: weekAgo, end: today }),
          api.getAttendance({ user_id: user?.id, start: today, end: today }),
        ]);
        setRecords(recs);
        setStats(st);
        const tr = todayRec?.[0] || null;
        setTodayRecord(tr);
        if (tr) {
          setWorkContent(tr.work_content || '');
          if (tr.status === 'checked_in') {
            setElapsed(Math.floor((Date.now() - new Date(tr.check_in_time).getTime()) / 1000));
          }
        }
      }
    } catch (e) {
      toast?.show?.('加载考勤数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [isMentor, user?.id, dateRange.start, dateRange.end, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Timer for checked-in state
  useEffect(() => {
    if (!todayRecord || todayRecord.status !== 'checked_in') return;
    setElapsed(Math.floor((Date.now() - new Date(todayRecord.check_in_time).getTime()) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(todayRecord.check_in_time).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [todayRecord?.id, todayRecord?.status]);

  const handleCheckIn = async () => {
    try {
      const res = await api.checkIn({
        user_id: user?.id,
        student_id: user?.student_id || null,
        work_content: workContent,
        check_type: 'normal',
      });
      toast?.show?.('打卡成功', 'success');
      setTodayRecord({ id: res.id, check_in_time: res.check_in_time, status: 'checked_in', work_content: workContent });
      fetchData();
    } catch (e) {
      toast?.show?.(e.message || '打卡失败', 'error');
    }
  };

  const handleCheckOut = async () => {
    if (!todayRecord) return;
    try {
      const res = await api.checkOut({ id: todayRecord.id, work_content: workContent });
      toast?.show?.(`签退成功，今日工作 ${res.work_hours} 小时`, 'success');
      setTodayRecord(prev => ({ ...prev, status: 'checked_out', check_out_time: res.check_out_time, work_hours: res.work_hours }));
      fetchData();
    } catch (e) {
      toast?.show?.(e.message || '签退失败', 'error');
    }
  };

  const formatElapsed = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const chartData = useMemo(() => {
    if (!stats?.daily) return [];
    return stats.daily.map(d => ({ day: d.day.slice(5), hours: Math.round(d.hours * 10) / 10 }));
  }, [stats]);

  const filteredRecords = useMemo(() => {
    if (!filterStudent) return records;
    return records.filter(r => r.student_name?.includes(filterStudent) || r.user_name?.includes(filterStudent));
  }, [records, filterStudent]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-200">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">考勤打卡</h1>
            <p className="text-xs text-slate-400">{isMentor ? '学生工时统计与考勤管理' : '记录每日工作时长'}</p>
          </div>
        </div>
      </div>

      {!isMentor && (
        <>
          {/* Student Check-in Card */}
          <div className="card p-6 mb-4">
            {todayRecord?.status === 'checked_in' ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1 w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <Timer className="w-4 h-4 text-emerald-500 animate-pulse" />
                    <span className="text-sm font-semibold text-slate-700">工作中</span>
                    <span className="text-xs text-slate-400">打卡时间 {formatHM(todayRecord.check_in_time)}</span>
                  </div>
                  <div className="text-3xl font-bold text-slate-800 font-mono tracking-wider mb-3">
                    {formatElapsed(elapsed)}
                  </div>
                  <textarea
                    value={workContent}
                    onChange={e => setWorkContent(e.target.value)}
                    placeholder="记录今日工作内容..."
                    className="input w-full text-sm min-h-[60px] resize-none"
                  />
                </div>
                <button
                  onClick={handleCheckOut}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                >
                  <Square className="w-4 h-4" />
                  下班签退
                </button>
              </div>
            ) : todayRecord?.status === 'checked_out' ? (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-slate-700">今日已完成</span>
                  </div>
                  <div className="text-2xl font-bold text-slate-800">
                    {todayRecord.work_hours} <span className="text-sm font-normal text-slate-400">小时</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {formatHM(todayRecord.check_in_time)} - {formatHM(todayRecord.check_out_time)}
                  </p>
                  {todayRecord.work_content && (
                    <p className="text-xs text-slate-500 mt-2 bg-slate-50 rounded-lg p-2">{todayRecord.work_content}</p>
                  )}
                </div>
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                  <Award className="w-7 h-7 text-emerald-500" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-1 w-full">
                  <p className="text-sm text-slate-500 mb-3">今日尚未打卡，记录你的工作时光</p>
                  <textarea
                    value={workContent}
                    onChange={e => setWorkContent(e.target.value)}
                    placeholder="提前规划今日工作...（可选）"
                    className="input w-full text-sm min-h-[60px] resize-none"
                  />
                </div>
                <button
                  onClick={handleCheckIn}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-lg shadow-emerald-200"
                >
                  <Play className="w-4 h-4" />
                  上班打卡
                </button>
              </div>
            )}
          </div>

          {/* Student Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard icon={CalendarIcon} label="本周天数" value={stats?.total_days || 0} color="#10b981" />
            <StatCard icon={CheckCircle2} label="完整打卡" value={stats?.completed_days || 0} color="#3b82f6" />
            <StatCard icon={Timer} label="总工时" value={`${Math.round((stats?.total_hours || 0) * 10) / 10}h`} color="#8b5cf6" />
            <StatCard icon={TrendingUp} label="日均工时" value={`${Math.round((stats?.avg_hours || 0) * 10) / 10}h`} color="#f59e0b" />
          </div>
        </>
      )}

      {isMentor && (
        <>
          {/* Mentor Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-4">
            <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-2">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filterStudent}
                onChange={e => setFilterStudent(e.target.value)}
                className="text-sm outline-none bg-transparent w-32"
              >
                <option value="">全部学生</option>
                {students.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
                className="input text-xs py-2"
              />
              <span className="text-slate-400 text-xs">至</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
                className="input text-xs py-2"
              />
            </div>
          </div>

          {/* Mentor Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard icon={User} label="打卡人次" value={stats?.total_days || 0} color="#3b82f6" />
            <StatCard icon={CheckCircle2} label="完整签退" value={stats?.completed_days || 0} color="#10b981" />
            <StatCard icon={Timer} label="总工时" value={`${Math.round((stats?.total_hours || 0) * 10) / 10}h`} color="#8b5cf6" />
            <StatCard icon={TrendingUp} label="平均工时" value={`${Math.round((stats?.avg_hours || 0) * 10) / 10}h`} color="#f59e0b" />
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="card p-4 mb-4">
              <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                每日工时分布
              </h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '12px' }}
                      formatter={(value) => [`${value} 小时`, '工时']}
                    />
                    <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'][i % 6]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}

      {/* Records Table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">
            {isMentor ? '考勤记录' : '近期记录'}
          </h3>
          <span className="text-xs text-slate-400">共 {filteredRecords.length} 条</span>
        </div>
        {loading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />)}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">暂无打卡记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">日期</th>
                  {isMentor && <th className="text-left px-4 py-2.5 font-semibold text-slate-500">学生</th>}
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">打卡</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">签退</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">工时</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-500">状态</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(r => (
                  <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2.5 text-slate-600">{r.check_in_time?.split('T')[0]}</td>
                    {isMentor && <td className="px-4 py-2.5 text-slate-600">{r.student_name || r.user_name || '-'}</td>}
                    <td className="px-4 py-2.5 text-slate-600">{formatHM(r.check_in_time)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.check_out_time ? formatHM(r.check_out_time) : '-'}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{r.work_hours || 0}h</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        r.status === 'checked_out'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}>
                        {r.status === 'checked_out' ? <CheckCircle2 className="w-3 h-3" /> : <Timer className="w-3 h-3" />}
                        {r.status === 'checked_out' ? '已完成' : '工作中'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '15' }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <div className="text-lg font-bold text-slate-800">{value}</div>
        <div className="text-[10px] text-slate-400">{label}</div>
      </div>
    </div>
  );
}
