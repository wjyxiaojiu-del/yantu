import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock,
  CalendarDays, LayoutList, Award, ClipboardList, CalendarCheck, Trophy, Flag
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useToast } from '../../components/Toast';

const typeMeta = {
  meeting: { label: '会议', icon: CalendarCheck, color: '#8b5cf6', bg: '#f5f3ff' },
  task: { label: '任务', icon: ClipboardList, color: '#3b82f6', bg: '#eff6ff' },
  review: { label: '评审', icon: Award, color: '#f59e0b', bg: '#fffbeb' },
  sprint: { label: '冲刺', icon: Flag, color: '#06b6d4', bg: '#ecfeff' },
  milestone: { label: '里程碑', icon: Trophy, color: '#ec4899', bg: '#fdf2f8' },
};

function getMonthMatrix(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = lastDay.getDate();
  const days = [];
  // Pad start
  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month - 1, prevMonthLast - i), isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  // Pad end to complete 6 rows (42 cells)
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
  }
  return days;
}

function formatYMD(d) {
  return d.toISOString().split('T')[0];
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function CalendarView() {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState('month'); // month | week
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const toast = useToast();
  const navigate = useNavigate();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const start = formatYMD(new Date(year, month, 1));
      const end = formatYMD(new Date(year, month + 1, 0));
      const data = await api.getCalendar({ start, end });
      setEvents(data);
    } catch (e) {
      toast?.show?.('加载日历失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentDate, toast]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const ev of events) {
      if (!ev.date) continue;
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [events]);

  const goPrev = () => {
    if (view === 'month') setCurrentDate(new Date(year, month - 1, 1));
    else setCurrentDate(new Date(year, month, currentDate.getDate() - 7));
  };
  const goNext = () => {
    if (view === 'month') setCurrentDate(new Date(year, month + 1, 1));
    else setCurrentDate(new Date(year, month, currentDate.getDate() + 7));
  };
  const goToday = () => {
    if (view === 'month') {
      setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    } else {
      setCurrentDate(new Date(today));
    }
    setSelectedDate(new Date());
  };

  // When switching to week view, center on today or selected date
  const handleViewChange = (newView) => {
    setView(newView);
    if (newView === 'week') {
      setCurrentDate(selectedDate ? new Date(selectedDate) : new Date(today));
    } else {
      setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    }
  };

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  const monthDays = useMemo(() => getMonthMatrix(year, month), [year, month]);

  const weekDaysList = useMemo(() => {
    if (view !== 'week') return [];
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  }, [currentDate, view]);

  const selectedEvents = selectedDate ? (eventsByDate[formatYMD(selectedDate)] || []) : [];

  const handleEventClick = (ev) => {
    if (ev.related_type === 'meeting_records') navigate('/meetings');
    else if (ev.related_type === 'mentor_tasks') navigate('/tasks');
    else if (ev.related_type === 'review_stages') navigate('/reviews');
    else if (ev.related_type === 'sprints') navigate('/agile/plan');
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200">
            <CalendarIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">日程日历</h1>
            <p className="text-xs text-slate-400">会议 · 任务 · 评审 · 冲刺</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <button onClick={goPrev} className="p-2 hover:bg-slate-50 text-slate-500 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm font-semibold text-slate-700 min-w-[100px] text-center">
              {year}年{month + 1}月
            </span>
            <button onClick={goNext} className="p-2 hover:bg-slate-50 text-slate-500 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button onClick={goToday} className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-100 shadow-sm hover:bg-slate-50 transition-colors">
            今天
          </button>
          <div className="flex items-center bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden ml-1">
            <button
              onClick={() => handleViewChange('month')}
              className={`p-2 transition-colors ${view === 'month' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <CalendarDays className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleViewChange('week')}
              className={`p-2 transition-colors ${view === 'week' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <LayoutList className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar */}
      {view === 'month' ? (
        <div className="card overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-slate-100">
            {weekDays.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400">{d}</div>
            ))}
          </div>
          {/* Days grid */}
          <div className="grid grid-cols-7">
            {monthDays.map((day, idx) => {
              const ymd = formatYMD(day.date);
              const dayEvents = eventsByDate[ymd] || [];
              const isToday = isSameDay(day.date, today);
              const isSelected = selectedDate && isSameDay(day.date, selectedDate);
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDate(day.date)}
                  className={`min-h-[90px] sm:min-h-[110px] p-1.5 border-b border-r border-slate-50 cursor-pointer transition-colors hover:bg-slate-50/50 ${
                    !day.isCurrentMonth ? 'bg-slate-50/30' : ''
                  } ${isSelected ? 'bg-indigo-50/60' : ''}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-indigo-500 text-white' : 'text-slate-600'
                    } ${!day.isCurrentMonth ? 'text-slate-300' : ''}`}>
                      {day.date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[9px] text-slate-400">{dayEvents.length}</span>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map(ev => {
                      const meta = typeMeta[ev.type] || typeMeta.milestone;
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => { e.stopPropagation(); handleEventClick(ev); }}
                          className="text-[10px] truncate rounded px-1 py-0.5 cursor-pointer hover:opacity-80 hidden sm:block"
                          style={{ background: meta.bg, color: meta.color }}
                          title={ev.title}
                        >
                          {ev.title}
                        </div>
                      );
                    })}
                    {/* Mobile: dot indicators */}
                    <div className="flex flex-wrap gap-1 sm:hidden">
                      {dayEvents.slice(0, 4).map(ev => {
                        const meta = typeMeta[ev.type] || typeMeta.milestone;
                        return <span key={ev.id} className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />;
                      })}
                      {dayEvents.length > 4 && <span className="text-[8px] text-slate-400">+</span>}
                    </div>
                    {dayEvents.length > 2 && (
                      <div className="text-[9px] text-slate-400 pl-1 hidden sm:block">+{dayEvents.length - 2}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="grid grid-cols-7 gap-2 min-w-[600px]">
            {weekDays.map((d, i) => (
              <div key={d} className="text-center text-xs font-semibold text-slate-400 py-2">{d}</div>
            ))}
            {weekDaysList.map((day, idx) => {
              const ymd = formatYMD(day);
              const dayEvents = eventsByDate[ymd] || [];
              const isToday = isSameDay(day, today);
              return (
                <div key={idx} className={`card p-2 min-h-[160px] sm:min-h-[200px] ${isToday ? 'ring-2 ring-indigo-200' : ''}`}>
                  <div className={`text-xs font-semibold mb-2 ${isToday ? 'text-indigo-600' : 'text-slate-600'}`}>
                    {day.getMonth() + 1}/{day.getDate()}
                  </div>
                  <div className="space-y-1.5">
                    {dayEvents.map(ev => {
                      const meta = typeMeta[ev.type] || typeMeta.milestone;
                      const Icon = meta.icon;
                      return (
                        <div
                          key={ev.id}
                          onClick={() => handleEventClick(ev)}
                          className="flex items-start gap-1.5 p-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <Icon className="w-3 h-3 shrink-0 mt-0.5" style={{ color: meta.color }} />
                          <div className="min-w-0">
                            <div className="text-[10px] font-medium text-slate-700 truncate">{ev.title}</div>
                            {ev.student_name && (
                              <div className="text-[9px] text-slate-400">{ev.student_name}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected date detail */}
      {selectedDate && (
        <div className="mt-4 card p-4">
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 日程
            {selectedEvents.length > 0 && <span className="text-xs text-slate-400 font-normal">({selectedEvents.length}项)</span>}
          </h3>
          {selectedEvents.length === 0 ? (
            <p className="text-xs text-slate-400">当日无安排</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map(ev => {
                const meta = typeMeta[ev.type] || typeMeta.milestone;
                const Icon = meta.icon;
                return (
                  <div
                    key={ev.id}
                    onClick={() => handleEventClick(ev)}
                    className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
                      <Icon className="w-4 h-4" style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-700">{ev.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {meta.label}
                        {ev.student_name ? ` · ${ev.student_name}` : ''}
                        {ev.status ? ` · ${ev.status}` : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
