import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock3, Loader2, MapPin, Plus, Settings2, Sparkles, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import { useProject } from '../../context/ProjectContext';

const typeMeta = {
  meeting: { label: '会议', color: '#8b5cf6' }, task: { label: '任务', color: '#3b82f6' }, review: { label: '评审', color: '#f59e0b' },
  sprint: { label: '项目阶段', color: '#06b6d4' }, milestone: { label: '里程碑', color: '#ec4899' }, personal: { label: '个人日程', color: '#10b981' },
};

const SOLAR_DAYS = { '01-01': '元旦', '03-08': '妇女节', '05-01': '劳动节', '05-04': '青年节', '06-01': '儿童节', '09-10': '教师节', '10-01': '国庆节', '12-25': '圣诞节' };
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthMatrix(year, month) {
  const start = new Date(year, month, 1);
  const days = [];
  for (let index = start.getDay(); index > 0; index--) days.push({ date: new Date(year, month, 1 - index), current: false });
  const count = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= count; day++) days.push({ date: new Date(year, month, day), current: true });
  while (days.length < 42) days.push({ date: new Date(year, month + 1, days.length - (start.getDay() + count) + 1), current: false });
  return days;
}

function sameDay(a, b) { return a && b && dateKey(a) === dateKey(b); }

function lunarLabel(date) {
  try {
    return new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'short', day: 'numeric' }).format(date).replace(/月/g, '月');
  } catch { return ''; }
}

function specialDay(date) {
  const solar = SOLAR_DAYS[dateKey(date).slice(5)];
  if (solar) return solar;
  const lunar = lunarLabel(date);
  if (/正月1日|正月初一/.test(lunar)) return '春节';
  if (/五月5日|五月初五/.test(lunar)) return '端午';
  if (/八月15日|八月十五/.test(lunar)) return '中秋';
  return '';
}

function loadDisplayPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('calendar-display-preferences') || '{}');
    return {
      showLunar: saved.showLunar !== false,
      showHolidays: saved.showHolidays !== false,
    };
  } catch {
    return { showLunar: true, showHolidays: true };
  }
}

function loadPersonalEvents() {
  try { return JSON.parse(localStorage.getItem('personal-calendar-events') || '[]'); } catch { return []; }
}

export default function CalendarView() {
  const today = useMemo(() => new Date(), []);
  const toast = useToast();
  const navigate = useNavigate();
  const { projectId } = useProject();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [systemEvents, setSystemEvents] = useState([]);
  const [personalEvents, setPersonalEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [displayPreferences, setDisplayPreferences] = useState(loadDisplayPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const fetchEvents = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const range = { start: dateKey(new Date(year, month, 1)), end: dateKey(new Date(year, month + 1, 0)) };
      const [system, personal] = await Promise.all([
        api.getCalendar(range),
        api.getScheduleItems({ project_id: projectId, ...range }),
      ]);
      setSystemEvents(Array.isArray(system) ? system : []);
      setPersonalEvents((Array.isArray(personal) ? personal : []).map((event) => ({
        ...event,
        id: `personal-${event.id}`,
        raw_id: event.id,
        type: 'personal',
        related_type: 'personal_schedule_items',
      })));
    } catch (e) { toast.error('加载日历失败'); }
    finally { setLoading(false); }
  }, [year, month, projectId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    localStorage.setItem('calendar-display-preferences', JSON.stringify(displayPreferences));
  }, [displayPreferences]);

  useEffect(() => {
    if (!projectId) return;
    const legacy = loadPersonalEvents();
    if (!legacy.length) return;
    let cancelled = false;
    const migrateLegacyEvents = async () => {
      try {
        await Promise.all(legacy.map((event) => api.createScheduleItem({
          project_id: projectId,
          title: event.title,
          date: event.date,
          time: event.time || '',
          location: event.location || '',
          note: event.note || '',
          source_legacy_id: String(event.id),
        })));
        if (cancelled) return;
        localStorage.removeItem('personal-calendar-events');
        toast.success('旧日程已安全迁移到工作台数据库');
        fetchEvents();
      } catch (error) {
        if (!cancelled) toast.error(`旧日程迁移失败：${error.message}`);
      }
    };
    migrateLegacyEvents();
    return () => { cancelled = true; };
  }, [projectId, fetchEvents]);

  const allEvents = useMemo(() => [...systemEvents, ...personalEvents], [systemEvents, personalEvents]);
  const eventsByDate = useMemo(() => allEvents.reduce((map, event) => { if (event.date) (map[event.date] ||= []).push(event); return map; }, {}), [allEvents]);
  const days = useMemo(() => getMonthMatrix(year, month), [year, month]);
  const selectedKey = dateKey(selectedDate);
  const selectedEvents = eventsByDate[selectedKey] || [];
  const monthEventCount = systemEvents.length + personalEvents.filter((event) => event.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).length;
  const upcoming = allEvents.filter((event) => event.date >= dateKey(today)).sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`)).slice(0, 4);

  const savePersonalEvent = async (data) => {
    const created = await api.createScheduleItem({ ...data, project_id: projectId });
    const event = { ...created, id: `personal-${created.id}`, raw_id: created.id, type: 'personal', related_type: 'personal_schedule_items' };
    setPersonalEvents((current) => [event, ...current]);
    setModal(null);
    setSelectedDate(new Date(`${data.date}T12:00:00`));
    toast.success('日程已加入日历并保存');
  };

  const deletePersonalEvent = async (event) => {
    try {
      await api.deleteScheduleItem(event.raw_id);
      setPersonalEvents((current) => current.filter((item) => item.id !== event.id));
      toast.success('日程已删除');
    } catch (error) {
      toast.error(`删除失败：${error.message}`);
    }
  };

  const openEvent = (event) => {
    if (event.related_type === 'meeting_records') navigate('/meetings');
    else if (event.related_type === 'mentor_tasks') navigate('/tasks');
    else if (event.related_type === 'review_stages') navigate('/reviews');
    else if (event.related_type === 'sprints') navigate('/agile/dashboard');
  };

  const goToday = () => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(today); };

  return (
    <div className="living-calendar-shell max-w-[1500px] mx-auto space-y-5">
      <header className="living-calendar-header workbench-reveal">
        <div><div className="calendar-eyebrow"><CalendarIcon size={12} /> TIME & RHYTHM</div><h1>日程日历</h1><p>把科研、生活与重要日子放在同一个时间视野里。</p></div>
        <div className="calendar-header-actions">
          <div className="calendar-display-settings">
            <button className={`calendar-settings-trigger ${settingsOpen ? 'is-open' : ''}`} onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>
              <Settings2 size={15} /> 显示设置
            </button>
            {settingsOpen && (
              <div className="calendar-display-menu">
                <div className="calendar-display-menu-title">日历显示</div>
                <label><input type="checkbox" checked={displayPreferences.showLunar} onChange={(event) => setDisplayPreferences((current) => ({ ...current, showLunar: event.target.checked }))} /><span>农历</span><small>初一、十五等传统日期</small></label>
                <label><input type="checkbox" checked={displayPreferences.showHolidays} onChange={(event) => setDisplayPreferences((current) => ({ ...current, showHolidays: event.target.checked }))} /><span>节日与重要日</span><small>元旦、春节、国庆等</small></label>
                <p>设置只保存在本机，不会影响你的日程数据。</p>
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => setModal({ date: selectedKey })}><Plus size={16} /> 添加日程</button>
        </div>
      </header>

      <section className="calendar-month-brief workbench-reveal workbench-reveal-delay-1">
        <div className="calendar-month-name"><small>{year}</small><strong>{month + 1}</strong><span>月</span></div>
        <div className="calendar-month-copy"><span><Sparkles size={12} /> 本月节奏</span><h2>{monthEventCount ? `这个月已经有 ${monthEventCount} 项安排` : '这个月还有很多留白'}</h2><p>{upcoming[0] ? `下一项：${upcoming[0].title}` : '给重要的事情留出时间，也给自己留一点空白。'}</p></div>
        <div className="calendar-month-controls"><button onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={16} /></button><button onClick={goToday}>回到今天</button><button onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={16} /></button></div>
      </section>

      <div className="living-calendar-layout workbench-reveal workbench-reveal-delay-2">
        <main className="calendar-board">
          <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-days">
            {days.map(({ date, current }, index) => {
              const key = dateKey(date); const dayEvents = eventsByDate[key] || []; const holiday = specialDay(date); const lunar = lunarLabel(date); const dayLabels = [displayPreferences.showHolidays && holiday, displayPreferences.showLunar && lunar].filter(Boolean); const selected = sameDay(date, selectedDate); const isToday = sameDay(date, today);
              return <button key={index} onClick={() => setSelectedDate(date)} className={`living-calendar-day ${current ? '' : 'is-muted'} ${selected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''}`}>
                <div className="calendar-day-number"><strong>{date.getDate()}</strong>{dayLabels.length > 0 && <span>{dayLabels.join(' · ')}</span>}</div>
                <div className="calendar-day-events">{dayEvents.slice(0, 3).map((event) => <span key={`${event.related_type || event.type}-${event.id}`} style={{ '--event-color': (typeMeta[event.type] || typeMeta.personal).color }}><i />{event.time && <small>{event.time}</small>}<b>{event.title}</b></span>)}</div>
                {dayEvents.length > 3 && <em>还有 {dayEvents.length - 3} 项</em>}
              </button>;
            })}
          </div>
          {loading && <div className="calendar-loading"><Loader2 size={18} className="animate-spin" /></div>}
        </main>

        <aside className="calendar-agenda">
          <div className="calendar-agenda-date"><span>{selectedDate.toLocaleDateString('zh-CN', { weekday: 'long' })}</span><strong>{selectedDate.getDate()}</strong><p>{selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月{displayPreferences.showLunar ? ` · ${lunarLabel(selectedDate)}` : ''}</p>{displayPreferences.showHolidays && specialDay(selectedDate) && <b><Sparkles size={11} />{specialDay(selectedDate)}</b>}</div>
          <div className="calendar-agenda-head"><h2>当日日程</h2><button onClick={() => setModal({ date: selectedKey })}><Plus size={13} /> 添加</button></div>
          <div className="calendar-agenda-list">
            {selectedEvents.map((event) => { const meta = typeMeta[event.type] || typeMeta.personal; return <article key={`${event.related_type || event.type}-${event.id}`} onClick={() => openEvent(event)} style={{ '--event-color': meta.color }}><i /><div><span>{event.time || '全天'} · {meta.label}</span><h3>{event.title}</h3>{event.note && <p>{event.note}</p>}{event.location && <small><MapPin size={10} />{event.location}</small>}</div>{event.related_type === 'personal_schedule_items' && <button onClick={(click) => { click.stopPropagation(); deletePersonalEvent(event); }} aria-label="删除日程"><Trash2 size={12} /></button>}</article>; })}
            {!selectedEvents.length && <div className="calendar-free-day"><Clock3 size={23} /><b>今天没有安排</b><span>这也是一种很好的节奏。</span><button onClick={() => setModal({ date: selectedKey })}><Plus size={12} /> 添加一项</button></div>}
          </div>
        </aside>
      </div>

      <div className="task-flow-signature"><span /><a href="https://deerflow.tech" target="_blank" rel="noreferrer">Created by Deerflow</a><span /></div>
      <Modal open={!!modal} onClose={() => setModal(null)} title="添加个人日程">{modal && <ScheduleForm date={modal.date} onSave={savePersonalEvent} onCancel={() => setModal(null)} />}</Modal>
    </div>
  );
}

function ScheduleForm({ date, onSave, onCancel }) {
  const [form, setForm] = useState({ title: '', date, time: '', location: '', note: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event) => { event.preventDefault(); if (!form.title.trim()) { setError('请填写日程名称'); return; } setSaving(true); try { await onSave({ ...form, title: form.title.trim() }); } catch (saveError) { setError(saveError.message || '保存失败'); } finally { setSaving(false); } };
  return <form onSubmit={submit} className="space-y-4"><div><label className="block text-xs font-medium text-slate-500 mb-1.5">日程名称</label><input value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); setError(''); }} className={`input ${error ? 'error' : ''}`} placeholder="要在这一天做什么？" autoFocus />{error && <p className="field-error">{error}</p>}</div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-medium text-slate-500 mb-1.5">日期</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" /></div><div><label className="block text-xs font-medium text-slate-500 mb-1.5">时间</label><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="input" /></div></div><div><label className="block text-xs font-medium text-slate-500 mb-1.5">地点</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input" placeholder="实验室、线上会议……" /></div><div><label className="block text-xs font-medium text-slate-500 mb-1.5">备注</label><textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="input" rows={3} placeholder="准备事项或提醒" /></div><div className="flex justify-end gap-2 pt-3 border-t border-slate-100"><button type="button" className="btn btn-secondary" onClick={onCancel}>取消</button><button disabled={saving} className="btn btn-primary">{saving && <Loader2 size={13} className="animate-spin" />}保存日程</button></div></form>;
}
