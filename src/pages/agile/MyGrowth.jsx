import { useState, useEffect } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, AlertTriangle, CheckCircle2, Clock, Award, GraduationCap, FileText, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import api from '../../api';

export default function MyGrowth() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) load();
  }, [user?.id]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getGrowthStudent(user.id);
      setData(res);
    } catch (e) {
      toast.error('加载成长档案失败');
    } finally {
      setLoading(false);
    }
  };

  const radarData = data ? Object.entries(data.radar || {}).map(([k, v]) => ({ subject: k, value: v })) : [];
  const riskColor = data?.risk?.level === 'high' ? '#ef4444' : data?.risk?.level === 'medium' ? '#f59e0b' : '#10b981';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
          <span className="text-sm text-slate-400">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <TrendingUp size={24} className="text-orange-500" />
          我的成长档案
        </h1>
        <p className="text-sm text-slate-400 mt-1">追踪你的学术成长轨迹与毕业进度</p>
      </div>

      {/* Risk Banner */}
      {data?.risk?.score > 0 && (
        <div className={`card p-4 mb-5 flex items-center gap-3 ${data.risk.level === 'high' ? 'bg-red-50 border-red-100' : data.risk.level === 'medium' ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
          <AlertTriangle size={20} style={{ color: riskColor }} />
          <div className="flex-1">
            <div className="text-sm font-medium" style={{ color: riskColor }}>
              毕业风险评估：{data.risk.score}分 · {data.risk.level === 'high' ? '高风险' : data.risk.level === 'medium' ? '中风险' : '正常'}
            </div>
            {data.risk.factors?.length > 0 && (
              <div className="text-xs mt-1" style={{ color: riskColor, opacity: 0.8 }}>
                {data.risk.factors.join(' · ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Radar + Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4">能力雷达图</h3>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#f1f5f9" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#64748b' }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Radar name="能力" dataKey="value" stroke="#f97316" fill="#f97316" fillOpacity={0.2} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4">核心数据</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 text-center">
              <GraduationCap size={18} className="mx-auto mb-1 text-slate-400" />
              <div className="text-lg font-bold text-slate-800">{data?.stats?.totalPapers || 0}</div>
              <div className="text-xs text-slate-500">论文/成果</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 text-center">
              <CheckCircle2 size={18} className="mx-auto mb-1 text-slate-400" />
              <div className="text-lg font-bold text-slate-800">{data?.stats?.completedTasks || 0}</div>
              <div className="text-xs text-slate-500">完成任务</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 text-center">
              <Clock size={18} className="mx-auto mb-1 text-slate-400" />
              <div className="text-lg font-bold text-slate-800">{data?.stats?.totalWorkHours || 0}h</div>
              <div className="text-xs text-slate-500">累计工时</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 text-center">
              <Award size={18} className="mx-auto mb-1 text-slate-400" />
              <div className="text-lg font-bold text-slate-800">{data?.stats?.totalMeetings || 0}</div>
              <div className="text-xs text-slate-500">参加组会</div>
            </div>
          </div>
          <div className="mt-3 p-3 rounded-lg bg-slate-50 text-center">
            <div className="text-xs text-slate-400">距离预计毕业还有</div>
            <div className={`text-xl font-bold ${(data?.stats?.daysToGrad || 0) < 365 ? 'text-red-500' : 'text-slate-700'}`}>
              {data?.stats?.daysToGrad || 0} 天
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card p-5">
        <h3 className="text-sm font-bold text-slate-700 mb-4">成长时间轴</h3>
        <div className="space-y-3">
          {data?.timeline?.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${
                item.type === 'enrollment' ? 'bg-blue-400' :
                item.type === 'review' ? (item.status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400') :
                'bg-orange-400'
              }`} />
              <div className="flex-1 pb-3" style={{ borderLeft: '1px solid #f1f5f9', paddingLeft: 12, marginLeft: -7 }}>
                <div className="text-xs text-slate-400">{item.date}</div>
                <div className="text-sm font-medium text-slate-700">{item.title}</div>
                <div className="text-xs text-slate-500">{item.description}</div>
              </div>
            </div>
          ))}
          {(!data?.timeline?.length) && <div className="text-center py-4 text-sm text-slate-400">暂无记录</div>}
        </div>
      </div>

      {/* Weekly Trend */}
      {data?.weeklyTrend?.length > 0 && (
        <div className="card p-5 mt-5">
          <h3 className="text-sm font-bold text-slate-700 mb-4">近8周趋势</h3>
          <div className="space-y-2">
            {data.weeklyTrend.map(w => (
              <div key={w.week_start} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-slate-400 w-24">{w.week_start}</span>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-slate-500">任务 {w.completed_tasks}</span>
                  <span className="text-xs text-slate-500">出勤 {w.attendance_days}天</span>
                  <span className="text-xs text-slate-500">工时 {w.total_work_hours}h</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
