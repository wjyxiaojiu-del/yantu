import { useEffect, useState } from 'react';
import {
  CalendarCheck, Plus, Search, Users, User, Clock, FileText, ArrowRight,
  LayoutList, CalendarDays, ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

export default function MeetingManager() {
  const [meetings, setMeetings] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [form, setForm] = useState({ meeting_date: '', meeting_type: 'group', topic: '', summary: '', action_items: '', next_meeting_date: '', student_ids: [] });
  const toast = useToast();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [mData, sData] = await Promise.all([api.getMeetings(), api.getStudents()]);
    setMeetings(mData); setStudents(sData);
    setLoading(false);
  }

  const filtered = meetings.filter(m =>
    (m.topic + m.summary + m.meeting_date).toLowerCase().includes(search.toLowerCase())
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = { ...form, student_ids: form.student_ids.map(Number) };
      if (editing) await api.updateMeeting(editing.id, payload);
      else await api.createMeeting(payload);
      toast.success(editing ? '组会记录已更新' : '组会已记录');
      setShowAdd(false); setEditing(null);
      setForm({ meeting_date: '', meeting_type: 'group', topic: '', summary: '', action_items: '', next_meeting_date: '', student_ids: [] });
      load();
    } catch (e) { toast.error('操作失败：' + e.message); }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id) {
    if (!confirm('确定删除此组会记录？')) return;
    try { await api.deleteMeeting(id); toast.success('组会记录已删除'); load(); }
    catch (e) { toast.error('删除失败：' + e.message); }
  }

  function openEdit(m) {
    setEditing(m);
    let ids = []; try { ids = JSON.parse(m.student_ids || '[]'); } catch {}
    setForm({ meeting_date: m.meeting_date, meeting_type: m.meeting_type, topic: m.topic || '', summary: m.summary || '', action_items: m.action_items || '', next_meeting_date: m.next_meeting_date || '', student_ids: ids.map(String) });
    setShowAdd(true);
  }

  function toggleStudent(id) {
    const ids = form.student_ids.includes(id) ? form.student_ids.filter(x => x !== id) : [...form.student_ids, id];
    setForm({ ...form, student_ids: ids });
  }

  // Calendar helpers
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startDay = firstDayOfMonth.getDay();

  const monthMeetings = filtered.filter(m => {
    const d = new Date(m.meeting_date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  function getMeetingsForDay(day) {
    return monthMeetings.filter(m => {
      const d = new Date(m.meeting_date);
      return d.getDate() === day;
    });
  }

  function prevMonth() {
    setCalendarDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCalendarDate(new Date(year, month + 1, 1));
  }

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gradient-warm">组会管理</h1>
          <p className="text-sm text-slate-400 mt-1">记录和跟踪与学生组会的内容</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white/60 rounded-xl p-1 border border-white/80">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'list' ? 'text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}
              style={viewMode === 'list' ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' } : {}}
            >
              <LayoutList className="w-3.5 h-3.5" /> 列表
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'calendar' ? 'text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}
              style={viewMode === 'calendar' ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' } : {}}
            >
              <CalendarDays className="w-3.5 h-3.5" /> 日历
            </button>
          </div>
          <button onClick={() => { setEditing(null); setForm({ meeting_date: '', meeting_type: 'group', topic: '', summary: '', action_items: '', next_meeting_date: '', student_ids: [] }); setShowAdd(true); }}
            className="btn btn-primary"><Plus className="w-4 h-4" /> 记录组会</button>
        </div>
      </div>

      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索组会主题或内容..." className="input pl-10" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-slate-200 border-t-[var(--accent)] rounded-full animate-spin" /></div>
      ) : viewMode === 'calendar' ? (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-slate-700">
              {year}年 {month + 1}月
            </h3>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="btn-ghost p-1.5 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setCalendarDate(new Date())} className="text-xs text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-50 transition-colors">今天</button>
              <button onClick={nextMonth} className="btn-ghost p-1.5 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(d => (
              <div key={d} className="text-center text-xs font-medium text-slate-400 py-2">{d}</div>
            ))}
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-24 rounded-lg" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayMeetings = getMeetingsForDay(day);
              const isToday = new Date().toDateString() === new Date(year, month, day).toDateString();
              return (
                <div
                  key={day}
                  className={`h-24 rounded-lg border p-1.5 transition-all ${isToday ? 'border-[var(--accent)] bg-[var(--accent-50)]' : 'border-slate-100 bg-white/40 hover:bg-white/80'}`}
                >
                  <div className={`text-xs font-medium mb-1 ${isToday ? 'text-[var(--accent)]' : 'text-slate-500'}`}>{day}</div>
                  <div className="space-y-1 overflow-hidden">
                    {dayMeetings.slice(0, 2).map(m => (
                      <div key={m.id} className="text-[10px] truncate px-1.5 py-0.5 rounded bg-[var(--accent-100)] text-[var(--accent)] font-medium">
                        {m.topic || '组会'}
                      </div>
                    ))}
                    {dayMeetings.length > 2 && (
                      <div className="text-[10px] text-slate-400 px-1">+{dayMeetings.length - 2}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((meeting, i) => {
            let ids = []; try { ids = JSON.parse(meeting.student_ids || '[]'); } catch {}
            const meetingStudents = students.filter(s => ids.includes(s.id));
            return (
              <div key={meeting.id} className="card p-5"
                style={{ animation: `staggerFadeIn .4s var(--spring-bounce) ${i * 60}ms both` }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: meeting.meeting_type === 'group' ? 'var(--accent-50)' : 'rgba(6, 182, 212, 0.08)' }}>
                      {meeting.meeting_type === 'group'
                        ? <Users className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                        : <User className="w-5 h-5 text-cyan-500" />}
                    </div>
                    <div>
                      <h3 className="text-slate-800 font-semibold">{meeting.topic || '组会记录'}</h3>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {meeting.meeting_date}</span>
                        <span>{meeting.meeting_type === 'group' ? '组会' : '个人面谈'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(meeting)} className="text-xs font-medium px-2 py-1 rounded-lg hover:bg-slate-50 transition-all" style={{ color: 'var(--accent)' }}>编辑</button>
                    <button onClick={() => handleDelete(meeting.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50/50 transition-all">删除</button>
                  </div>
                </div>

                {meeting.summary && (
                  <div className="mb-3 p-3 rounded-xl bg-slate-50/60">
                    <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><FileText className="w-3 h-3" /> 会议纪要</p>
                    <p className="text-sm text-slate-600">{meeting.summary}</p>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {meetingStudents.map(s => (
                      <div key={s.id} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-white shrink-0 relative group/av"
                        style={{ background: `linear-gradient(135deg, var(--logo-from), var(--logo-to))` }}
                        title={s.name}>
                        {s.name?.[0]}
                      </div>
                    ))}
                    {meetingStudents.length === 0 && <span className="text-xs text-slate-300">无参会人</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {meetingStudents.map(s => (
                      <span key={s.id} className="text-xs text-slate-500">{s.name}</span>
                    ))}
                  </div>
                  {meeting.action_items && (
                    <span className="badge badge-b ml-auto"><ArrowRight className="w-3 h-3 mr-1" /> {meeting.action_items}</span>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-center py-20 text-slate-300">暂无组会记录</div>}
        </div>
      )}

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)} title={editing ? '编辑组会' : '记录组会'}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input required value={form.meeting_date} onChange={e => setForm({...form, meeting_date: e.target.value})} type="date" className="input" />
              <select value={form.meeting_type} onChange={e => setForm({...form, meeting_type: e.target.value})} className="select">
                <option value="group">组会</option><option value="individual">个人面谈</option>
              </select>
            </div>
            <input required value={form.topic} onChange={e => setForm({...form, topic: e.target.value})} placeholder="组会主题" className="input" />
            <textarea value={form.summary} onChange={e => setForm({...form, summary: e.target.value})} placeholder="会议纪要" rows={3} className="input resize-none" />
            <textarea value={form.action_items} onChange={e => setForm({...form, action_items: e.target.value})} placeholder="行动项 / 待办事项" rows={2} className="input resize-none" />
            <input value={form.next_meeting_date} onChange={e => setForm({...form, next_meeting_date: e.target.value})} type="date" placeholder="下次会议日期" className="input" />
            <div>
              <p className="text-sm text-slate-500 mb-2">参与学生</p>
              <div className="flex flex-wrap gap-2">
                {students.map(s => (
                  <button key={s.id} type="button" onClick={() => toggleStudent(String(s.id))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${form.student_ids.includes(String(s.id)) ? 'text-white shadow-md' : 'bg-white/60 text-slate-500 hover:bg-white'}`}
                    style={form.student_ids.includes(String(s.id)) ? { background: 'linear-gradient(135deg, var(--accent), var(--accent-light))' } : {}}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary flex-1">取消</button>
              <button type="submit" disabled={submitting} className="btn btn-primary flex-1 flex items-center justify-center gap-1.5">
                {submitting && <Loader2 size={14} className="animate-spin" />}{editing ? '保存' : '记录'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
