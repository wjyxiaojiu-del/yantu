import { useState, useEffect } from 'react';
import { Plus, Calendar, User, MessageSquare, CheckSquare, Trash2, Edit2, Clock, ArrowRight, Loader2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import { SkeletonSpinner } from '../../components/LoadingSkeleton';
import ErrorState from '../../components/ErrorState';
import api from '../../api';
import Modal from '../../components/Modal';

export default function Meetings() {
  const { projectId } = useProject();
  const { theme } = useTheme();
  const c = theme.colors;
  const toast = useToast();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [detailItem, setDetailItem] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getMeetings({ project_id: projectId });
      setMeetings(data);
    } catch (e) {
      setError(e.message);
      toast.error('加载会议记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const handleSave = async (data) => {
    try {
      if (modal.mode === 'create') {
        await api.createMeeting({ ...data, project_id: projectId });
        toast.success('会议记录创建成功');
      } else {
        await api.updateMeeting(modal.item.id, data);
        toast.success('会议记录更新成功');
      }
      setModal(null);
      load();
    } catch (e) {
      toast.error('保存失败：' + e.message);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm('确定删除此会议记录？')) return;
    try {
      await api.deleteMeeting(item.id);
      toast.success('会议记录已删除');
      load();
    } catch (e) {
      toast.error('删除失败');
    }
  };

  if (loading) return <SkeletonSpinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const upcoming = meetings.filter(m => new Date(m.meeting_date) >= new Date()).slice(0, 3);
  const past = meetings.filter(m => new Date(m.meeting_date) < new Date());

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between" style={{ animation: 'slideUp .5s var(--spring-bounce)' }}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquare size={24} className="text-orange-500" />
            导师沟通记录
          </h1>
          <p className="text-sm text-slate-400 mt-1">记录每次与导师的 meeting 内容和待办事项</p>
        </div>
        <button onClick={() => setModal({ mode: 'create' })} className="btn btn-primary">
          <Plus size={16} /> 新建记录
        </button>
      </div>

      {/* Upcoming Meetings */}
      {upcoming.length > 0 && (
        <div className="card p-5" style={{ animation: 'slideUp .5s var(--spring-bounce) .05s both' }}>
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Calendar size={14} className="text-orange-500" />
            即将到来的会议
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {upcoming.map(m => (
              <div key={m.id} className="rounded-xl p-4 bg-orange-50/50 border border-orange-100/50 cursor-pointer hover:bg-orange-50 transition-all"
                onClick={() => setDetailItem(m)}>
                <div className="text-xs text-orange-600 font-medium mb-1">{m.meeting_date}</div>
                <div className="text-sm font-semibold text-slate-800 truncate">{m.topic || '未命名会议'}</div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <User size={10} /> {m.mentor_name || '导师'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-[18px] top-0 bottom-0 w-px"
          style={{ background: 'linear-gradient(180deg, var(--accent-300), rgba(241,245,249,0.3))' }} />

        <div className="space-y-4">
          {meetings.map((m, i) => {
            const isPast = new Date(m.meeting_date) < new Date();
            return (
              <div key={m.id} className="relative pl-12 group"
                style={{ animation: `slideInRight .4s var(--spring-bounce) ${i * 50}ms both` }}>
                <div className="absolute left-[11px] top-5 w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center"
                  style={{
                    borderColor: isPast ? 'rgba(203,213,225,0.5)' : c.accent,
                    background: isPast ? 'rgba(255,255,255,0.8)' : '#fff',
                    boxShadow: !isPast ? `0 0 0 4px ${c.accent50}` : 'none',
                  }}>
                  {!isPast && <div className="w-2 h-2 rounded-full" style={{ background: c.accent }} />}
                </div>

                <div className={`card p-5 transition-all duration-500 ${isPast ? 'opacity-70 hover:opacity-100' : ''}`} style={!isPast ? { boxShadow: `0 0 0 1px ${c.accent100}, 0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)` } : {}}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: isPast ? 'rgba(148,163,184,0.1)' : 'var(--accent-50)' }}>
                        <Calendar size={15} className={isPast ? 'text-slate-400' : 'text-orange-500'} />
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-slate-800">{m.meeting_date}</span>
                        {m.mentor_name && <span className="text-xs text-slate-400 ml-2">与 {m.mentor_name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setModal({ mode: 'edit', item: m })}
                        className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-500">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(m)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {m.topic && (
                    <div className="mb-3">
                      <div className="text-xs font-semibold text-slate-500 mb-1">主题</div>
                      <p className="text-sm text-slate-700">{m.topic}</p>
                    </div>
                  )}

                  {m.summary && (
                    <div className="rounded-xl p-3.5 mb-3" style={{ background: 'rgba(99,102,241,0.04)' }}>
                      <div className="text-[11px] font-semibold text-indigo-600 mb-1.5 flex items-center gap-1">
                        <MessageSquare size={11} /> 会议纪要
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{m.summary}</p>
                    </div>
                  )}

                  {m.action_items && (
                    <div className="rounded-xl p-3.5 mb-3" style={{ background: 'var(--accent-50)' }}>
                      <div className="text-[11px] font-semibold text-orange-600 mb-1.5 flex items-center gap-1">
                        <CheckSquare size={11} /> 待办事项
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{m.action_items}</p>
                    </div>
                  )}

                  {m.next_meeting && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <ArrowRight size={12} />
                      <span>下次会议：{m.next_meeting}</span>
                    </div>
                  )}

                  {m.notes && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(241,245,249,0.6)' }}>
                      <p className="text-xs text-slate-400">{m.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {meetings.length === 0 && (
            <div className="card text-center py-16" style={{ animation: 'slideUp .4s var(--spring-bounce)' }}>
              <MessageSquare size={48} className="text-slate-200 mx-auto mb-3" />
              <div className="text-sm text-slate-400">暂无会议记录</div>
              <div className="text-xs text-slate-300 mt-1">点击「新建记录」开始记录与导师的沟通</div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <Modal open={!!detailItem} onClose={() => setDetailItem(null)} title="会议详情">
        {detailItem && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Calendar size={18} className="text-orange-500" />
              <div>
                <div className="text-sm font-semibold text-slate-800">{detailItem.meeting_date}</div>
                {detailItem.mentor_name && <div className="text-xs text-slate-400">与 {detailItem.mentor_name}</div>}
              </div>
            </div>
            {detailItem.topic && <div><div className="text-xs font-semibold text-slate-500 mb-1">主题</div><p className="text-sm text-slate-700">{detailItem.topic}</p></div>}
            {detailItem.summary && <div><div className="text-xs font-semibold text-slate-500 mb-1">纪要</div><p className="text-sm text-slate-700 whitespace-pre-wrap">{detailItem.summary}</p></div>}
            {detailItem.action_items && <div><div className="text-xs font-semibold text-slate-500 mb-1">待办</div><p className="text-sm text-slate-700 whitespace-pre-wrap">{detailItem.action_items}</p></div>}
            {detailItem.notes && <div><div className="text-xs font-semibold text-slate-500 mb-1">备注</div><p className="text-sm text-slate-500">{detailItem.notes}</p></div>}
          </div>
        )}
      </Modal>

      {/* Create/Edit Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'create' ? '新建会议记录' : '编辑会议记录'}>
        {modal && <MeetingForm item={modal.item} onSave={handleSave} onCancel={() => setModal(null)} />}
      </Modal>
    </div>
  );
}

function MeetingForm({ item, onSave, onCancel }) {
  const [form, setForm] = useState({
    mentor_name: item?.mentor_name || '',
    meeting_date: item?.meeting_date || new Date().toISOString().slice(0, 10),
    topic: item?.topic || '',
    summary: item?.summary || '',
    action_items: item?.action_items || '',
    next_meeting: item?.next_meeting || '',
    notes: item?.notes || '',
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.meeting_date) e.meeting_date = '请选择日期';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try { await onSave(form); } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto scrollbar-hide pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">导师姓名</label>
          <input value={form.mentor_name} onChange={e => set('mentor_name', e.target.value)} className="input" placeholder="导师姓名" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">会议日期 <span className="text-red-400">*</span></label>
          <input type="date" value={form.meeting_date} onChange={e => set('meeting_date', e.target.value)}
            className={`input ${errors.meeting_date ? 'error' : ''}`} />
          {errors.meeting_date && <p className="field-error">{errors.meeting_date}</p>}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">会议主题</label>
        <input value={form.topic} onChange={e => set('topic', e.target.value)} className="input" placeholder="讨论什么内容？" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">会议纪要</label>
        <textarea value={form.summary} onChange={e => set('summary', e.target.value)} className="input" rows={4} placeholder="会议中讨论了哪些内容？达成了什么共识？" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">待办事项</label>
        <textarea value={form.action_items} onChange={e => set('action_items', e.target.value)} className="input" rows={3} placeholder="会议后需要完成哪些任务？" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">下次会议时间</label>
        <input type="date" value={form.next_meeting} onChange={e => set('next_meeting', e.target.value)} className="input" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">备注</label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className="input" rows={2} placeholder="其他补充..." />
      </div>
      <div className="flex justify-end gap-2 pt-3" style={{ borderTop: '1px solid rgba(241,245,249,0.5)' }}>
        <button type="button" onClick={onCancel} className="btn btn-secondary">取消</button>
        <button type="submit" disabled={submitting} className="btn btn-primary flex items-center gap-1.5">
          {submitting && <Loader2 size={14} className="animate-spin" />}保存
        </button>
      </div>
    </form>
  );
}
