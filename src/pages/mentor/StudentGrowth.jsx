import { useState, useEffect } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, AlertTriangle, CheckCircle2, Clock, ChevronRight, Loader2, GraduationCap, FileText, Award } from 'lucide-react';
import { useToast } from '../../components/Toast';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { Skeleton, SkeletonCard, SkeletonAvatar, SkeletonText } from '../../components/Skeleton';

const RISK_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
const RISK_LABELS = { high: '高风险', medium: '中风险', low: '正常' };

export default function StudentGrowth() {
  const toast = useToast();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getGrowthStudents();
      setStudents(data);
    } catch (e) {
      toast.error('加载成长档案失败');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (student) => {
    try {
      const detail = await api.getGrowthStudent(student.id);
      setSelectedStudent(detail);
    } catch (e) {
      toast.error('加载详情失败');
    }
  };

  const radarData = selectedStudent ? Object.entries(selectedStudent.radar || {}).map(([k, v]) => ({ subject: k, value: v })) : [];

  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp size={24} className="text-orange-500" />
            学生成长档案
          </h1>
          <p className="text-sm text-slate-400 mt-1">追踪每位学生的成长轨迹与毕业风险</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <SkeletonAvatar size="w-10 h-10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
            ))}
          </div>
          <div className="lg:col-span-2 space-y-5">
            <SkeletonCard />
            <div className="grid grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Student List */}
          <div className="lg:col-span-1 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-red-500" />
              <span className="text-xs font-medium text-slate-500">
                高风险 {students.filter(s => s.riskLevel === 'high').length} 人 · 中风险 {students.filter(s => s.riskLevel === 'medium').length} 人
              </span>
            </div>
            {students.map(s => (
              <button
                key={s.id}
                onClick={() => handleViewDetail(s)}
                className={`w-full text-left p-3 rounded-xl transition-all ${
                  selectedStudent?.student?.id === s.id ? 'bg-orange-50 ring-1 ring-orange-200' : 'bg-white hover:bg-slate-50'
                }`}
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                    {s.name?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{s.name}</span>
                      <span className={`w-2 h-2 rounded-full`} style={{ background: RISK_COLORS[s.riskLevel] }} />
                    </div>
                    <div className="text-xs text-slate-400">{s.grade} · {s.monthsEnrolled}个月 · 论文{s.papers}篇</div>
                  </div>
                  <ChevronRight size={14} className="text-slate-300" />
                </div>
                {s.riskScore > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${s.riskScore}%`, background: RISK_COLORS[s.riskLevel] }} />
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: RISK_COLORS[s.riskLevel] }}>{RISK_LABELS[s.riskLevel]}</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-2">
            {selectedStudent ? (
              <div className="space-y-5">
                {/* Header */}
                <div className="card p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-slate-200 flex items-center justify-center text-xl font-bold text-slate-600">
                        {selectedStudent.student?.name?.[0]}
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-slate-800">{selectedStudent.student?.name}</h2>
                        <div className="text-sm text-slate-500">{selectedStudent.student?.grade} · {selectedStudent.student?.major}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          入学 {selectedStudent.student?.enrollment_date} · 预计毕业 {selectedStudent.student?.expected_graduation}
                        </div>
                      </div>
                    </div>
                    <div className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                      selectedStudent.risk.level === 'high' ? 'bg-red-50 text-red-600' :
                      selectedStudent.risk.level === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      毕业风险：{selectedStudent.risk.score}分 · {RISK_LABELS[selectedStudent.risk.level]}
                    </div>
                  </div>

                  {selectedStudent.risk.factors?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedStudent.risk.factors.map((f, i) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-600">{f}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stats + Radar */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                        <div className="text-lg font-bold text-slate-800">{selectedStudent.stats?.totalPapers || 0}</div>
                        <div className="text-xs text-slate-500">论文/成果</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 text-center">
                        <CheckCircle2 size={18} className="mx-auto mb-1 text-slate-400" />
                        <div className="text-lg font-bold text-slate-800">{selectedStudent.stats?.completedTasks || 0}/{selectedStudent.stats?.totalTasks || 0}</div>
                        <div className="text-xs text-slate-500">完成任务</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 text-center">
                        <Clock size={18} className="mx-auto mb-1 text-slate-400" />
                        <div className="text-lg font-bold text-slate-800">{selectedStudent.stats?.totalWorkHours || 0}h</div>
                        <div className="text-xs text-slate-500">累计工时</div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 text-center">
                        <Award size={18} className="mx-auto mb-1 text-slate-400" />
                        <div className="text-lg font-bold text-slate-800">{selectedStudent.stats?.totalMeetings || 0}</div>
                        <div className="text-xs text-slate-500">参加组会</div>
                      </div>
                    </div>
                    <div className="mt-3 p-2.5 rounded-lg bg-slate-50 text-center">
                      <div className="text-xs text-slate-400">距离预计毕业还有</div>
                      <div className={`text-lg font-bold ${selectedStudent.stats?.daysToGrad < 365 ? 'text-red-500' : 'text-slate-700'}`}>
                        {selectedStudent.stats?.daysToGrad || 0} 天
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="card p-5">
                  <h3 className="text-sm font-bold text-slate-700 mb-4">成长时间轴</h3>
                  <div className="space-y-3">
                    {selectedStudent.timeline?.map((item, i) => (
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
                    {(!selectedStudent.timeline?.length) && <div className="text-center py-4 text-sm text-slate-400">暂无记录</div>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="card flex flex-col items-center justify-center py-20 text-slate-400">
                <TrendingUp size={40} className="mb-3 text-slate-300" />
                <p className="text-sm">点击左侧学生查看详细成长档案</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
