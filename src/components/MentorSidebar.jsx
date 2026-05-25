import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, ClipboardList, CalendarCheck, Award, Trophy,
  GraduationCap, Sparkles, Palette, Check, ChevronLeft, Menu,
  Kanban, CalendarDays, BookOpen, FileBarChart, Repeat, Bell, CalendarIcon, Clock, FolderOpen
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import api from '../api';

const mentorNavItems = [
  { path: '/', label: '导师总览', icon: LayoutDashboard },
  { path: '/students', label: '学生管理', icon: Users },
  { path: '/tasks', label: '任务指派', icon: ClipboardList },
  { path: '/meetings', label: '组会管理', icon: CalendarCheck },
  { path: '/reviews', label: '节点评审', icon: Award },
  { path: '/achievements', label: '学术成果', icon: Trophy },
  { path: '/calendar', label: '日程日历', icon: CalendarIcon },
  { path: '/attendance', label: '考勤打卡', icon: Clock },
  { path: '/files', label: '文件资料库', icon: FolderOpen },
  { path: '/notifications', label: '消息通知', icon: Bell },
];

const studentNavItems = [
  { path: '/agile/dashboard', label: '项目总览', icon: LayoutDashboard },
  { path: '/agile/board', label: '任务看板', icon: Kanban },
  { path: '/agile/plan', label: '迭代规划', icon: CalendarDays },
  { path: '/agile/backlog', label: '待办事项', icon: ClipboardList },
  { path: '/agile/standup', label: '每日日程', icon: CalendarCheck },
  { path: '/agile/risks', label: '风险管控', icon: Award },
  { path: '/agile/literature', label: '文献管理', icon: BookOpen },
  { path: '/agile/report', label: '项目报告', icon: FileBarChart },
  { path: '/agile/my-tasks', label: '我的任务', icon: ClipboardList },
  { path: '/calendar', label: '日程日历', icon: CalendarIcon },
  { path: '/attendance', label: '考勤打卡', icon: Clock },
  { path: '/files', label: '文件资料库', icon: FolderOpen },
  { path: '/notifications', label: '消息通知', icon: Bell },
];

export default function MentorSidebar({ role, onRoleChange, mobileOpen, onMobileClose, unreadCount }) {
  const { theme, themeId, switchTheme, themes } = useTheme();
  const { user, isLoggedIn, login, logout } = useAuth();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPwd, setLoginPwd] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const navItems = role === 'mentor' ? mentorNavItems : studentNavItems;
  const toggleRole = () => {
    const next = role === 'mentor' ? 'student' : 'mentor';
    onRoleChange(next);
    localStorage.setItem('app-role', next);
  };
  const pickerRef = useRef(null);
  const location = useLocation();
  const c = theme.colors;

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginPhone || !loginPwd) { setLoginError('请输入手机号和密码'); return; }
    setLoginLoading(true);
    setLoginError('');
    try {
      await login(loginPhone, loginPwd);
      setLoginPhone(''); setLoginPwd('');
    } catch (err) {
      setLoginError(err.message || '登录失败');
    } finally {
      setLoginLoading(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowThemePicker(false);
    }
    if (showThemePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showThemePicker]);

  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-50 flex flex-col transition-all duration-300 w-[220px] ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
      style={{
        background: `linear-gradient(180deg, ${c.sidebarFrom} 0%, ${c.sidebarTo} 50%, ${c.sidebarFrom} 100%)`,
        borderRight: `1px solid ${c.sidebarAccent}`,
      }}
    >
      {/* Ambient glow */}
      <div className="absolute top-0 left-0 w-full h-40 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 100% at 50% -20%, ${c.sidebarGlow}, transparent)` }} />

      {/* Logo */}
      <div className="px-5 h-16 flex items-center gap-3 border-b border-white/[0.06] relative">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center relative"
          style={{
            background: `linear-gradient(135deg, ${c.logoFrom}, ${c.logoTo})`,
            boxShadow: `0 4px 16px ${c.accent100 || 'rgba(0,0,0,0.1)'}, 0 0 30px ${c.accent50 || 'rgba(0,0,0,0.05)'}`,
          }}>
          <GraduationCap size={20} className="text-white relative z-10" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight">导师工作台</h1>
          <p className="text-[10px] text-white/60 font-medium flex items-center gap-1">
            <Sparkles size={9} /> Mentor System
          </p>
        </div>
      </div>

      {/* Role Switcher */}
      <div className="px-4 py-3 border-b border-white/[0.06] relative">
        <button onClick={toggleRole}
          className="flex items-center gap-2 w-full text-white/70 hover:text-white transition-colors text-xs font-medium">
          <Repeat size={14} />
          <span>{role === 'mentor' ? '导师工作台' : '学生工作台'}</span>
          <span className="ml-auto text-[10px] text-white/40">切换</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-hide relative">
        <div className="px-3 py-2 text-[10px] font-semibold text-white/40 uppercase tracking-widest">{role === 'mentor' ? '导师导航' : '学生导航'}</div>
        {navItems.map((item, i) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            style={{ animation: `staggerFadeIn .4s var(--spring-bounce) ${i * 50}ms both` }}
            onClick={onMobileClose}
          >
            <item.icon size={17} strokeWidth={2} />
            <span>{item.label}</span>
            {item.path === '/notifications' && unreadCount > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Backup */}
      <div className="px-4 py-2 border-t border-white/[0.06]">
        <button onClick={async () => {
          try {
            const res = await api.downloadBackup();
            if (!res.ok) throw new Error('备份失败');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mentor-backup-${new Date().toISOString().slice(0,10)}.db`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (e) { alert('备份失败: ' + e.message); }
        }}
          className="flex items-center gap-2 w-full text-white/70 hover:text-white transition-colors text-xs font-medium">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          <span>备份数据</span>
        </button>
      </div>

      {/* Theme Switcher */}
      <div className="px-4 py-3 border-t border-white/[0.06] relative" ref={pickerRef}>
        <button
          onClick={() => setShowThemePicker(!showThemePicker)}
          className="flex items-center gap-2 w-full text-white/70 hover:text-white transition-colors text-xs font-medium"
        >
          <Palette size={14} />
          <span>主题配色</span>
          <span className="ml-auto w-3 h-3 rounded-full" style={{ background: c.accent }} />
        </button>
        {showThemePicker && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              animation: 'slideDown 0.3s var(--spring-bounce) both',
            }}>
            <div className="p-2 space-y-1">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { switchTheme(t.id); setShowThemePicker(false); }}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="w-4 h-4 rounded-full shrink-0 border-2"
                    style={{
                      background: t.colors.accent,
                      borderColor: themeId === t.id ? t.colors.accent : 'transparent',
                      boxShadow: themeId === t.id ? `0 0 0 2px white, 0 0 0 4px ${t.colors.accent}` : 'none',
                    }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 truncate">{t.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{t.description}</div>
                  </div>
                  {themeId === t.id && <Check size={14} style={{ color: t.colors.accent }} />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User / Login */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        {isLoggedIn ? (
          <>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold relative"
                style={{
                  background: `linear-gradient(135deg, ${c.logoFrom}, ${c.logoTo})`,
                  boxShadow: `0 2px 10px ${c.accent100 || 'rgba(0,0,0,0.1)'}`,
                }}>
                {(user?.name?.[0] || (role === 'mentor' ? '导' : '生'))}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2"
                  style={{ borderColor: c.sidebarFrom }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white/90 truncate">{user?.name || (role === 'mentor' ? '张教授' : '李同学')}</div>
                <div className="text-[10px] text-white/50">{user?.title || (role === 'mentor' ? '博士生导师' : '在读研究生')}</div>
              </div>
            </div>
            <button onClick={logout}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-medium text-white/40 hover:text-white/70 hover:bg-white/5 transition-all">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              退出登录
            </button>
          </>
        ) : (
          <form onSubmit={handleLogin} className="space-y-2">
            <div className="text-xs font-semibold text-white/70 mb-2">登录</div>
            <input
              type="tel" value={loginPhone} onChange={e => setLoginPhone(e.target.value)}
              placeholder="手机号" maxLength={11}
              className="w-full px-3 py-1.5 rounded-lg text-xs bg-white/10 text-white placeholder-white/30 border border-white/10 focus:border-white/30 focus:outline-none transition-all"
            />
            <input
              type="password" value={loginPwd} onChange={e => setLoginPwd(e.target.value)}
              placeholder="密码"
              className="w-full px-3 py-1.5 rounded-lg text-xs bg-white/10 text-white placeholder-white/30 border border-white/10 focus:border-white/30 focus:outline-none transition-all"
            />
            {loginError && <p className="text-[10px] text-red-300">{loginError}</p>}
            <button type="submit" disabled={loginLoading}
              className="w-full py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              {loginLoading ? '登录中...' : '登 录'}
            </button>
            <p className="text-[10px] text-white/30 text-center">不登录也可以浏览所有功能</p>
          </form>
        )}
      </div>
    </aside>
  );
}
