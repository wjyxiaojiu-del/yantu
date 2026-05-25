import { useState, useEffect, useCallback } from 'react';
import {
  Bell, CheckCheck, Trash2, ClipboardList, CalendarCheck, Award, Trophy,
  Info, Filter, ArrowLeft, Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useToast } from '../../components/Toast';

const typeConfig = {
  task: { label: '任务', icon: ClipboardList, color: '#3b82f6', bg: '#eff6ff' },
  meeting: { label: '会议', icon: CalendarCheck, color: '#8b5cf6', bg: '#f5f3ff' },
  review: { label: '评审', icon: Award, color: '#f59e0b', bg: '#fffbeb' },
  achievement: { label: '成果', icon: Trophy, color: '#10b981', bg: '#ecfdf5' },
  system: { label: '系统', icon: Info, color: '#64748b', bg: '#f8fafc' },
};

const filters = [
  { key: 'all', label: '全部' },
  { key: 'task', label: '任务' },
  { key: 'meeting', label: '会议' },
  { key: 'review', label: '评审' },
  { key: 'achievement', label: '成果' },
  { key: 'system', label: '系统' },
];

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const toast = useToast();
  const navigate = useNavigate();

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params = activeFilter === 'all' ? {} : { type: activeFilter };
      const data = await api.getNotifications(params);
      setNotifications(data);
    } catch (e) {
      toast?.show?.('加载通知失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeFilter, toast]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await api.getUnreadCount();
      setUnreadCount(data?.count || 0);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Refresh on page focus
  useEffect(() => {
    const handler = () => { if (!document.hidden) { fetchNotifications(); fetchUnreadCount(); } };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [fetchNotifications, fetchUnreadCount]);

  const handleMarkRead = async (id) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch (e) {
      toast?.show?.('操作失败', 'error');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
      toast?.show?.('已全部标记为已读', 'success');
    } catch (e) {
      toast?.show?.('操作失败', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteNotification(id);
      const removed = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (removed && !removed.is_read) setUnreadCount(c => Math.max(0, c - 1));
    } catch (e) {
      toast?.show?.('删除失败', 'error');
    }
  };

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const readNotifications = notifications.filter(n => n.is_read);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="btn-ghost p-2 rounded-lg md:hidden">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />
              消息通知
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              共 {notifications.length} 条通知，{unreadCount} 条未读
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            全部已读
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              activeFilter === f.key
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-white text-slate-500 hover:text-slate-700 border border-slate-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-slate-100 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="card p-12 text-center">
          <Bell className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">暂无通知</p>
        </div>
      ) : (
        <div className="space-y-3">
          {unreadNotifications.length > 0 && (
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
              未读 ({unreadNotifications.length})
            </div>
          )}
          {unreadNotifications.map(n => (
            <NotificationItem key={n.id} n={n} onMarkRead={handleMarkRead} onDelete={handleDelete} />
          ))}

          {readNotifications.length > 0 && unreadNotifications.length > 0 && (
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 pt-2">
              已读 ({readNotifications.length})
            </div>
          )}
          {readNotifications.map(n => (
            <NotificationItem key={n.id} n={n} onMarkRead={handleMarkRead} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationItem({ n, onMarkRead, onDelete }) {
  const config = typeConfig[n.type] || typeConfig.system;
  const Icon = config.icon;
  const isRead = !!n.is_read;

  return (
    <div
      className={`card p-4 transition-all ${isRead ? 'opacity-70' : 'border-l-4'}`}
      style={!isRead ? { borderLeftColor: config.color } : {}}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: config.bg }}
        >
          <Icon className="w-4 h-4" style={{ color: config.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className={`text-sm font-semibold ${isRead ? 'text-slate-500' : 'text-slate-800'}`}>
              {n.title}
              {!isRead && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </h3>
            <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" />
              {timeAgo(n.created_at)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{n.content}</p>
          <div className="flex items-center gap-2 mt-3">
            {!isRead && (
              <button
                onClick={() => onMarkRead(n.id)}
                className="text-[10px] font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-50 transition-colors"
              >
                <CheckCheck className="w-3 h-3" />
                标记已读
              </button>
            )}
            <button
              onClick={() => onDelete(n.id)}
              className="text-[10px] font-medium text-slate-400 hover:text-red-500 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              删除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
