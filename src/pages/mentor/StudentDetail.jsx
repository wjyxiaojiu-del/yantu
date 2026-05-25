import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, GraduationCap, BookOpen, Calendar, Mail,
  ClipboardList, Award, Clock, CheckCircle2, AlertCircle, AlertTriangle,
  ChevronDown, ChevronUp, Trash2, Send, Plus, Edit3,
  Users, FileText, ExternalLink, Flag, BarChart3, Link2, Unlink, Rocket, Target, Zap, TrendingUp, Trophy, Loader2
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

const stageColors = { proposal: 'badge-c', midterm: 'badge-b', defense: 'badge-d', thesis: 'badge-a' };
const stageLabels = { proposal: '开题', midterm: '中期', defense: '答辩', thesis: '论文' };

const achievementTypeLabels = { paper: '论文', patent: '专利', competition: '竞赛', project: '项目', other: '其他' };
const achievementTypeColors = { paper: 'badge-c', patent: 'badge-a', competition: 'badge-b', project: 'badge-d', other: 'badge-c' };

function addActivityLog(action, entityType, entityName) {
  try {
    const logs = JSON.parse(localStorage.getItem('mm_activity_logs') || '[]');
    logs.unshift({ action, entityType, entityName, time: new Date().toISOString() });
    localStorage.setItem('mm_activity_logs', JSON.stringify(logs.slice(0, 50)));
  } catch { /* ignore */ }
}

export default function StudentDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Meetings & Achievements
  const [meetings, setMeetings] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [achLoading, setAchLoading] = useState(true);

  // Task interaction
  const [expandedTask, setExpandedTask] = useState(null);
  const [taskComments, setTaskComments] = useState({});
  const [commentInput, setCommentInput] = useState('');

  // Edit student
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Achievement modal
  const [showAchModal, setShowAchModal] = useState(false);
  const [editingAch, setEditingAch] = useState(null);
  const [achForm, setAchForm] = useState({ title: '', type: 'paper', date: '', description: '', url: '' });

  // Agile project integration
  const [studentProjects, setStudentProjects] = useState([]);
  const [agileProjects, setAgileProjects] = useState([]);
  const [projectStats, setProjectStats] = useState({});
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [selectedAgileProject, setSelectedAgileProject] = useState('');
  const [expandedAgileProject, setExpandedAgileProject] = useState(null);

  useEffect(() => { load(); loadStudentProjects(); }, [id]);

  async function loadStudentProjects() {
    try {
      const links = await api.getStudentProjects(id);
      setStudentProjects(links);
      // load stats for each linked project
      const stats = {};
      for (const link of links) {
        try {
          const s = await api.getAgileProjectStats(link.agile_project_id);
          stats[link.agile_project_id] = s;
        } catch (e) { /* ignore */ }
      }
      setProjectStats(stats);
    } catch (e) { console.error(e); }
  }

  async function handleLinkProject() {
    if (!selectedAgileProject || submitting) return;
    const proj = agileProjects.find(p => String(p.id) === selectedAgileProject);
    setSubmitting(true);
    try {
      await api.linkStudentProject(id, { agile_project_id: Number(selectedAgileProject), project_name: proj?.name || '' });
      toast.success('项目关联成功');
      setShowLinkModal(false);
      setSelectedAgileProject('');
      loadStudentProjects();
    } catch (e) { toast.error('关联失败：' + e.message); }
    finally { setSubmitting(false); }
  }

  async function handleUnlinkProject(linkId) {
    if (!confirm('确定取消关联此项目？')) return;
    try {
      await api.unlinkStudentProject(id, linkId);
      toast.success('已取消关联');
      loadStudentProjects();
    } catch (e) { toast.error('操作失败'); }
  }

  async function openLinkModal() {
    try {
      const all = await api.getAgileProjects();
      setAgileProjects(all);
      setShowLinkModal(true);
    } catch (e) { toast.error('无法获取项目列表，请确认敏捷系统已启动'); }
  }

  async function load() {
    setLoading(true);
    try {
      const studentData = await api.getStudent(id);
      setData(studentData);
      setEditForm({
        name: studentData.student?.name || '',
        email: studentData.student?.email || '',
        student_id: studentData.student?.student_id || '',
        grade: studentData.student?.grade || '研一',
        major: studentData.student?.major || '',
        research_topic: studentData.student?.research_topic || '',
        enrollment_date: studentData.student?.enrollment_date || '',
        expected_graduation: studentData.student?.expected_graduation || '',
      });
      // 后端已返回该学生的 meetings 和 achievements，直接使用
      setMeetings(studentData.meetings || []);
      setAchievements(studentData.achievements || []);
    } catch (e) {
      console.error(e);
      toast.error('加载学生数据失败');
    } finally {
      setLoading(false);
      setAchLoading(false);
    }
  }

  async function handleToggleTask(task) {
    try {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      await api.updateTask(task.id, { ...task, status: newStatus });
      toast.success(newStatus === 'completed' ? '任务已完成' : '任务已重新打开');
      addActivityLog(newStatus === 'completed' ? '完成' : '重新打开', '任务', task.title);
      load();
    } catch (e) { toast.error('操作失败：' + e.message); }
  }

  async function handleDeleteTask(taskId) {
    if (!confirm('确定删除此任务？')) return;
    try {
      await api.deleteTask(taskId);
      toast.success('任务已删除');
      load();
    } catch (e) { toast.error('删除失败：' + e.message); }
  }

  async function loadTaskComments(taskId) {
    try {
      const comments = await api.getTaskComments(taskId);
      setTaskComments(prev => ({ ...prev, [taskId]: comments }));
    } catch (e) {
      setTaskComments(prev => ({ ...prev, [taskId]: [] }));
    }
  }

  async function handleAddComment(taskId) {
    if (!commentInput.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.createTaskComment(taskId, { content: commentInput.trim() });
      setCommentInput('');
      loadTaskComments(taskId);
      toast.success('评论已添加');
    } catch (e) { toast.error('评论添加失败：' + e.message); }
    finally { setSubmitting(false); }
  }

  async function handleDeleteComment(taskId, commentId) {
    if (!confirm('确定删除此评论？')) return;
    try {
      await api.deleteTaskComment(taskId, commentId);
      loadTaskComments(taskId);
      toast.success('评论已删除');
    } catch (e) { toast.error('删除失败：' + e.message); }
  }

  async function handleUpdateStudent(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.updateStudent(id, editForm);
      toast.success('学生信息已更新');
      setShowEdit(false);
      load();
    } catch (e) { toast.error('更新失败：' + e.message); }
    finally { setSubmitting(false); }
  }

  async function handleGraduate() {
    if (!confirm('确定将此学生标记为已毕业？')) return;
    try {
      await api.updateStudent(id, { status: 'graduated' });
      toast.success('学生已标记为已毕业');
      addActivityLog('标记毕业', '学生', data.student?.name);
      load();
    } catch (e) { toast.error('操作失败：' + e.message); }
  }

  async function handleSaveAchievement(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = { ...achForm, student_id: Number(id) };
      if (editingAch) await api.updateAchievement(editingAch.id, payload);
      else await api.createAchievement(payload);
      toast.success(editingAch ? '成果已更新' : '成果已添加');
      setShowAchModal(false);
      setEditingAch(null);
      setAchForm({ title: '', type: 'paper', date: '', description: '', url: '' });
      const aData = await api.getAchievements(id).catch(() => []);
      setAchievements(aData);
    } catch (e) { toast.error('操作失败：' + e.message); }
    finally { setSubmitting(false); }
  }

  async function handleDeleteAchievement(achId) {
    if (!confirm('确定删除此成果？')) return;
    try {
      await api.deleteAchievement(achId);
      toast.success('成果已删除');
      setAchievements(prev => prev.filter(a => a.id !== achId));
    } catch (e) { toast.error('删除失败：' + e.message); }
  }

  function openEditAchievement(ach) {
    setEditingAch(ach);
    setAchForm({
      title: ach.title || '',
      type: ach.type || 'paper',
      date: ach.date || '',
      description: ach.description || '',
      url: ach.url || ''
    });
    setShowAchModal(true);
  }

  function toggleTaskExpand(task) {
    if (expandedTask === task.id) {
      setExpandedTask(null);
    } else {
      setExpandedTask(task.id);
      loadTaskComments(task.id);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-[var(--accent)] rounded-full animate-spin" /></div>;

  const student = data?.student;
  const tasks = data?.tasks || [];
  const reviews = data?.reviews || [];
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const kpiStats = useMemo(() => [
    { label: '任务完成率', value: tasks.length > 0 ? `${Math.round(completedTasks.length / tasks.length * 100)}%` : '0%', icon: TrendingUp, isProgress: true, pct: tasks.length > 0 ? Math.round(completedTasks.length / tasks.length * 100) : 0 },
    { label: '逾期任务', value: tasks.filter(t => t.status === 'pending' && t.deadline && new Date(t.deadline) < new Date()).length, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50' },
    { label: '学术成果', value: achievements.length, icon: Trophy, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: '组会次数', value: meetings.length, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: '培养天数', value: student?.enrollment_date ? Math.max(0, Math.floor((new Date() - new Date(student.enrollment_date)) / (1000 * 60 * 60 * 24))) : 0, icon: Clock, color: 'text-purple-500', bg: 'bg-purple-50' },
  ], [data, tasks, achievements, meetings]);

  // Timeline
  const timelineItems = [
    { label: '入学', date: student.enrollment_date, status: 'completed', icon: GraduationCap },
    ...reviews.map(r => ({
      label: stageLabels[r.stage_type] || r.stage_type,
      date: r.scheduled_date,
      status: r.status === 'completed' ? 'completed' : r.status === 'in_progress' ? 'in_progress' : 'pending',
      icon: Award,
      detail: r.title
    })),
    { label: '预计毕业', date: student.expected_graduation, status: 'pending', icon: Flag }
  ];

  let foundInProgress = false;
  timelineItems.forEach(item => {
    if (item.status === 'completed') return;
    if (!foundInProgress && item.status === 'pending') {
      item.status = 'in_progress';
      foundInProgress = true;
    }
  });

  return (
    <div className="space-y-6">
      <Link to="/students" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 transition-all">
        <ArrowLeft className="w-4 h-4" /> 返回学生列表
      </Link>

      {/* Student Header */}
      <div className="card p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shrink-0"
            style={{ background: `linear-gradient(135deg, var(--logo-from), var(--logo-to))` }}>
            {student.name?.[0]}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-800">{student.name}</h1>
              <span className="badge badge-c">{student.grade}</span>
              <span className={`badge ${student.status === 'active' ? 'badge-d' : 'badge-c'}`}>
                {student.status === 'active' ? '培养中' : '已毕业'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm text-slate-500">
              <div className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-slate-300" /><span>{student.major || '未设置专业'}</span></div>
              <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-300" /><span>{student.email || '未设置邮箱'}</span></div>
              <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-slate-300" /><span>入学：{student.enrollment_date || '未设置'}</span></div>
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-slate-300" /><span>预计毕业：{student.expected_graduation || '未设置'}</span></div>
            </div>
            {student.research_topic && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <BookOpen className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span>研究课题：{student.research_topic}</span>
              </div>
            )}
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => setShowEdit(true)} className="btn btn-secondary text-xs py-2 px-3">
                <Edit3 className="w-3.5 h-3.5" /> 编辑学生
              </button>
              {student.status === 'active' && (
                <button onClick={handleGraduate} className="btn btn-success text-xs py-2 px-3">
                  <Flag className="w-3.5 h-3.5" /> 标记为已毕业
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Student Profile KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiStats.map((s, i) => (
          <div key={s.label} className="stat-card" style={{ animation: `countUp 0.5s var(--spring-bounce) ${i * 80}ms both` }}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg || 'bg-emerald-50'}`}>
                <s.icon size={20} className={s.color || 'text-emerald-500'} />
              </div>
              <div className="min-w-0">
                <p className={`text-xl font-bold ${s.color ? 'text-slate-800' : 'text-slate-800'}`}>{s.value}</p>
                <p className="text-xs text-slate-400 truncate">{s.label}</p>
                {s.isProgress && (
                  <div className="mt-1 w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${s.pct}%` }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-6">
          <Clock className="w-5 h-5" style={{ color: 'var(--accent)' }} /> 培养时间线
        </h2>
        <div className="relative pl-2">
          <div className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-slate-100" />
          <div className="space-y-0">
            {timelineItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="relative flex items-start gap-4 pb-8 last:pb-0"
                  style={{ animation: `staggerFadeIn .4s var(--spring-bounce) ${i * 80}ms both` }}>
                  <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 shrink-0 transition-all
                    ${item.status === 'completed' ? 'bg-emerald-50 border-emerald-500 text-emerald-600' :
                      item.status === 'in_progress' ? 'bg-amber-50 border-amber-500 text-amber-600' :
                        'bg-slate-50 border-slate-200 text-slate-300'}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 pt-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${item.status === 'completed' ? 'text-emerald-700' : item.status === 'in_progress' ? 'text-amber-700' : 'text-slate-400'}`}>
                        {item.label}
                      </span>
                      {item.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {item.status === 'in_progress' && <span className="badge badge-b text-[10px]">进行中</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{item.date || '未设置'}</p>
                    {item.detail && <p className="text-xs text-slate-500 mt-1">{item.detail}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '总任务数', value: tasks.length, icon: ClipboardList },
          { label: '待完成', value: pendingTasks.length, icon: AlertCircle },
          { label: '已完成', value: completedTasks.length, icon: CheckCircle2 },
        ].map((s, i) => (
          <div key={s.label} className="stat-card" style={{ animation: `countUp 0.5s var(--spring-bounce) ${i * 100}ms both` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-50)' }}>
                <s.icon size={20} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{s.value}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interactive Tasks */}
        <div className="card p-5">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
            <ClipboardList className="w-5 h-5" style={{ color: 'var(--accent)' }} /> 任务列表
          </h2>
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {tasks.map((task, i) => (
              <div key={task.id} className="rounded-xl border border-slate-100 overflow-hidden"
                style={{ animation: `staggerFadeIn .4s var(--spring-bounce) ${i * 60}ms both` }}>
                <div className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50/60 transition-all"
                  onClick={() => toggleTaskExpand(task)}>
                  <button
                    onClick={e => { e.stopPropagation(); handleToggleTask(task); }}
                    className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0
                    ${task.status === 'completed' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'}`}>
                    {task.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{task.title}</p>
                    <p className="text-xs text-slate-300 mt-0.5">{task.deadline ? `截止：${task.deadline}` : '无截止日期'} · {task.category}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={e => { e.stopPropagation(); handleDeleteTask(task.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {expandedTask === task.id ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
                  </div>
                </div>

                {expandedTask === task.id && (
                  <div className="px-3 pb-3 border-t border-slate-50 bg-slate-50/30"
                    style={{ animation: 'slideDown 0.2s ease' }}>
                    {task.description && (
                      <p className="text-sm text-slate-500 py-3">{task.description}</p>
                    )}

                    {/* Comments */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-400 flex items-center gap-1">
                        <Send className="w-3 h-3" /> 评论
                      </p>
                      {(taskComments[task.id] || []).map(comment => (
                        <div key={comment.id} className="flex items-start gap-2 group">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                            style={{ background: `linear-gradient(135deg, var(--logo-from), var(--logo-to))` }}>
                            {comment.author?.[0] || '导'}
                          </div>
                          <div className="flex-1 bg-white rounded-xl px-3 py-2 border border-slate-100">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-600">{comment.author || '导师'}</span>
                              <button onClick={() => handleDeleteComment(task.id, comment.id)}
                                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-sm text-slate-700 mt-0.5">{comment.content}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          value={commentInput}
                          onChange={e => setCommentInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAddComment(task.id)}
                          placeholder="添加评论..."
                          className="input flex-1 text-xs py-2"
                        />
                        <button onClick={() => handleAddComment(task.id)} disabled={submitting}
                          className="btn btn-primary text-xs py-2 px-3 flex items-center gap-1">
                          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {tasks.length === 0 && <div className="text-center py-8 text-slate-300 text-sm">暂无任务</div>}
          </div>
        </div>

        {/* Reviews + Meetings + Achievements */}
        <div className="space-y-6">
          {/* Agile Project Progress */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Rocket className="w-5 h-5 text-purple-500" /> 项目进度
              </h2>
              <button onClick={openLinkModal} className="btn btn-primary text-xs py-1.5 px-3">
                <Link2 className="w-3.5 h-3.5 mr-1" /> 关联项目
              </button>
            </div>
            {studentProjects.length === 0 ? (
              <div className="text-center py-6 text-slate-300 text-sm">
                <Target className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>尚未关联敏捷项目</p>
                <p className="text-xs mt-1">关联后可查看学生项目看板进度</p>
              </div>
            ) : (
              <div className="space-y-4">
                {studentProjects.map(link => {
                  const stats = projectStats[link.agile_project_id];
                  const storyRate = stats?.storyCompletionRate || 0;
                  const taskRate = stats?.totalTasks ? Math.round((stats.doneTasks || 0) / stats.totalTasks * 100) : 0;
                  return (
                    <div key={link.id} className="p-4 rounded-xl bg-slate-50/60">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-purple-500" />
                          <span className="text-sm font-semibold text-slate-700">{link.project_name || `项目 #${link.agile_project_id}`}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setExpandedAgileProject(link.agile_project_id)}
                            className="text-xs font-medium flex items-center gap-1 transition-colors hover:opacity-80" style={{ color: 'var(--accent)' }}>
                            <ExternalLink className="w-3 h-3" /> {expandedAgileProject === link.agile_project_id ? '收起看板' : '展开看板'}
                          </button>
                          <button onClick={() => handleUnlinkProject(link.id)}
                            className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all">
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {stats && (
                        <div className="space-y-2">
                          <div>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-slate-500">故事完成率</span>
                              <span className="font-medium text-slate-700">{storyRate}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${storyRate}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-slate-500">任务完成率</span>
                              <span className="font-medium text-slate-700">{taskRate}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${taskRate}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-4 pt-1">
                            <span className="text-xs text-slate-400">{stats.totalStories || 0} 故事 · {stats.totalTasks || 0} 任务</span>
                            {stats.activeSprint && (
                              <span className="text-xs text-slate-400">当前 Sprint: {stats.activeSprint.name}</span>
                            )}
                          </div>
                          {stats.milestones && stats.milestones.length > 0 && (
                            <div className="pt-2 border-t border-slate-100">
                              <p className="text-xs text-slate-400 mb-1.5">里程碑</p>
                              <div className="space-y-1.5">
                                {stats.milestones.slice(0, 3).map(m => (
                                  <div key={m.id} className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${m.status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                    <span className="text-xs text-slate-600">{m.name}</span>
                                    <span className="text-[10px] text-slate-400 ml-auto">{m.due_date}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {expandedAgileProject === link.agile_project_id && (
                            <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden" style={{ animation: 'slideDown 0.3s ease' }}>
                              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                                <span className="text-xs font-medium text-slate-600">项目看板</span>
                                <Link to={`/agile/board?project=${link.agile_project_id}`}
                                  className="text-xs flex items-center gap-1 transition-colors hover:opacity-80" style={{ color: 'var(--accent)' }}>
                                  <ExternalLink className="w-3 h-3" /> 查看看板
                                </Link>
                              </div>
                              <div className="p-8 text-center">
                                <p className="text-sm text-slate-400 mb-3">项目看板已集成到统一工作台</p>
                                <Link to={`/agile/board?project=${link.agile_project_id}`}
                                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90"
                                  style={{ background: 'var(--accent)' }}>
                                  <ExternalLink className="w-3 h-3" /> 打开看板
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reviews */}
          <div className="card p-5">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-amber-500" /> 评审节点
            </h2>
            <div className="space-y-3">
              {reviews.map(review => (
                <div key={review.id} className="p-4 rounded-xl bg-slate-50/60">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${stageColors[review.stage_type] || 'badge-c'}`}>
                        {stageLabels[review.stage_type] || review.stage_type}
                      </span>
                      <span className="text-sm font-medium text-slate-700">{review.title}</span>
                    </div>
                    <span className={`badge ${review.status === 'completed' ? 'badge-d' : review.status === 'in_progress' ? 'badge-c' : 'badge-b'}`}>
                      {review.status === 'completed' ? '已完成' : review.status === 'in_progress' ? '进行中' : '待开始'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>计划日期：{review.scheduled_date || '未设置'}</span>
                    {review.score && <span>评分：{review.score}</span>}
                  </div>
                  {review.feedback && <p className="text-xs text-slate-400 mt-2 bg-white/60 p-2 rounded-lg">{review.feedback}</p>}
                </div>
              ))}
              {reviews.length === 0 && <div className="text-center py-8 text-slate-300 text-sm">暂无评审节点</div>}
            </div>
          </div>

          {/* Achievements */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-500" /> 学术成果
              </h2>
              <button onClick={() => { setEditingAch(null); setAchForm({ title: '', type: 'paper', date: '', description: '', url: '' }); setShowAchModal(true); }}
                className="btn btn-primary text-xs py-2 px-3">
                <Plus className="w-3.5 h-3.5" /> 添加成果
              </button>
            </div>
            {achLoading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-slate-200 border-t-[var(--accent)] rounded-full animate-spin" /></div>
            ) : (
              <div className="space-y-3">
                {achievements.map(ach => (
                  <div key={ach.id} className="p-4 rounded-xl bg-slate-50/60 group">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`badge ${achievementTypeColors[ach.type] || 'badge-c'}`}>
                          {achievementTypeLabels[ach.type] || ach.type}
                        </span>
                        <span className="text-sm font-medium text-slate-700">{ach.title}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEditAchievement(ach)} className="p-1 rounded hover:bg-white text-slate-400 hover:text-slate-600">
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleDeleteAchievement(ach.id)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {ach.date && <p className="text-xs text-slate-400 mt-1">{ach.date}</p>}
                    {ach.description && <p className="text-xs text-slate-500 mt-1">{ach.description}</p>}
                    {ach.url && (
                      <a href={ach.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs mt-1 transition-colors" style={{ color: 'var(--accent)' }}>
                        <ExternalLink className="w-3 h-3" /> 查看链接
                      </a>
                    )}
                  </div>
                ))}
                {achievements.length === 0 && <div className="text-center py-8 text-slate-300 text-sm">暂无学术成果</div>}
              </div>
            )}
          </div>

          {/* Meetings */}
          <div className="card p-5">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-cyan-500" /> 关联组会
            </h2>
            <div className="space-y-2">
              {meetings.map(m => (
                <div key={m.id} className="p-3 rounded-xl bg-slate-50/60">
                  <p className="text-sm font-medium text-slate-700">{m.topic || '组会'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{m.meeting_date} · {m.meeting_type === 'group' ? '组会' : '个人面谈'}</p>
                  {m.summary && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{m.summary}</p>}
                </div>
              ))}
              {meetings.length === 0 && <div className="text-center py-8 text-slate-300 text-sm">暂无组会记录</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Student Modal */}
      {showEdit && (
        <Modal onClose={() => setShowEdit(false)} title="编辑学生">
          <form onSubmit={handleUpdateStudent} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input required value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} placeholder="姓名" className="input" />
              <input value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} placeholder="邮箱" className="input" />
              <input value={editForm.student_id} onChange={e => setEditForm({...editForm, student_id: e.target.value})} placeholder="学号" className="input" />
              <select value={editForm.grade} onChange={e => setEditForm({...editForm, grade: e.target.value})} className="select">
                {['研一','研二','研三','博士'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <input value={editForm.major} onChange={e => setEditForm({...editForm, major: e.target.value})} placeholder="专业" className="input" />
              <input value={editForm.enrollment_date} onChange={e => setEditForm({...editForm, enrollment_date: e.target.value})} placeholder="入学日期" type="date" className="input" />
            </div>
            <input value={editForm.research_topic} onChange={e => setEditForm({...editForm, research_topic: e.target.value})} placeholder="研究课题" className="input" />
            <input value={editForm.expected_graduation} onChange={e => setEditForm({...editForm, expected_graduation: e.target.value})} placeholder="预计毕业时间" type="date" className="input" />
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowEdit(false)} className="btn btn-secondary flex-1">取消</button>
              <button type="submit" disabled={submitting} className="btn btn-primary flex-1 flex items-center justify-center gap-1.5">
                {submitting && <Loader2 size={14} className="animate-spin" />}保存
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Achievement Modal */}
      {showAchModal && (
        <Modal onClose={() => setShowAchModal(false)} title={editingAch ? '编辑成果' : '添加成果'}>
          <form onSubmit={handleSaveAchievement} className="space-y-4">
            <input required value={achForm.title} onChange={e => setAchForm({...achForm, title: e.target.value})} placeholder="成果标题" className="input" />
            <div className="grid grid-cols-2 gap-3">
              <select value={achForm.type} onChange={e => setAchForm({...achForm, type: e.target.value})} className="select">
                {Object.entries(achievementTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input value={achForm.date} onChange={e => setAchForm({...achForm, date: e.target.value})} type="date" placeholder="日期" className="input" />
            </div>
            <textarea value={achForm.description} onChange={e => setAchForm({...achForm, description: e.target.value})} placeholder="成果描述" rows={3} className="input resize-none" />
            <input value={achForm.url} onChange={e => setAchForm({...achForm, url: e.target.value})} placeholder="相关链接（可选）" className="input" />
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAchModal(false)} className="btn btn-secondary flex-1">取消</button>
              <button type="submit" disabled={submitting} className="btn btn-primary flex-1 flex items-center justify-center gap-1.5">
                {submitting && <Loader2 size={14} className="animate-spin" />}{editingAch ? '保存' : '添加'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Link Project Modal */}
      {showLinkModal && (
        <Modal onClose={() => setShowLinkModal(false)} title="关联敏捷项目">
          <div className="space-y-4">
            <p className="text-sm text-slate-500">选择该学生对应的敏捷项目：</p>
            <select value={selectedAgileProject} onChange={e => setSelectedAgileProject(e.target.value)} className="select">
              <option value="">请选择项目</option>
              {agileProjects.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.start_date} ~ {p.end_date})</option>
              ))}
            </select>
            {agileProjects.length === 0 && (
              <p className="text-xs text-amber-500">未获取到项目列表，请确认项目数据已初始化</p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowLinkModal(false)} className="btn btn-secondary flex-1">取消</button>
              <button onClick={handleLinkProject} disabled={!selectedAgileProject || submitting} className="btn btn-primary flex-1 flex items-center justify-center gap-1.5">
                {submitting && <Loader2 size={14} className="animate-spin" />}关联
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
