import { memo, useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, CalendarCheck, Award, Inbox,
  Atom, Sparkles, Palette, Check,
  Kanban, Gauge, CalendarIcon, Clock, BookOpen, HeartPulse, Link2, ListChecks
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import ProfileModal, { AvatarView } from './ProfileModal';

const primaryNavItems = [
  { path: '/agile/overview', label: '科研总览', icon: Gauge },
  { path: '/agile/dashboard', label: '今日', icon: LayoutDashboard },
  { path: '/agile/board', label: '任务推进', icon: Kanban },
  { path: '/agile/literature', label: '文献与证据', icon: BookOpen },
  { path: '/agile/standup', label: '每日记录', icon: CalendarCheck },
  { path: '/agile/weekly-review', label: '每周复盘', icon: ClipboardList },
];

const secondaryNavItems = [
  { path: '/attendance', label: '专注记录', icon: Clock },
  { path: '/agile/backlog', label: '收集箱', icon: Inbox },
  { path: '/agile/sop', label: 'SOP 流程', icon: ListChecks },
  { path: '/agile/risks', label: '风险管控', icon: Award },
  { path: '/calendar', label: '日程日历', icon: CalendarIcon },
  { path: '/agile/connection-health', label: '连接与恢复', icon: HeartPulse },
  { path: '/agile/research-map', label: '研究地图', icon: Link2 },
];

function NavItemRow({ item }) {
  const Icon = item.icon;

  return (
    <div className="group relative flex items-center">
      <NavLink
        to={item.path}
        end={item.path === '/'}
        className={({ isActive: active }) => `sidebar-nav-item flex-1 ${active ? 'active' : ''}`}
      >
        <Icon size={17} strokeWidth={2} />
        <span>{item.label}</span>
      </NavLink>
    </div>
  );
}

function WorkspaceSidebar() {
  const { theme, themeId, switchTheme, themes } = useTheme();
  const { user } = useAuth();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const pickerRef = useRef(null);
  const c = theme.colors;

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
      className="fixed left-0 top-0 h-screen z-50 flex flex-col w-[220px]"
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
          <Atom size={22} strokeWidth={1.8} className="text-white relative z-10" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight">小九工作台</h1>
          <p className="text-[10px] text-white/60 font-medium flex items-center gap-1">
            <Sparkles size={9} /> XIAOJIU RESEARCH
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-hide relative">
        {primaryNavItems.map((item) => (
          <NavItemRow
            key={item.path}
            item={item}
          />
        ))}
        <div className="mt-3 pt-3 border-t border-white/[0.06]">
          <div className="px-3 pb-2 text-[10px] font-bold tracking-[0.16em] text-white/40">更多工具</div>
          <div className="space-y-0.5">
            {secondaryNavItems.map((item) => (
              <NavItemRow
                key={item.path}
                item={item}
              />
            ))}
          </div>
        </div>
      </nav>

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

      {/* User */}
      <div className="px-4 py-3 border-t border-white/[0.06]">
        <button
          onClick={() => setShowProfile(true)}
          className="w-full flex items-center gap-3 rounded-xl p-1.5 -m-1.5 hover:bg-white/[0.06] transition-colors text-left"
          aria-label="编辑个人资料"
        >
          <div className="relative shrink-0">
            <AvatarView user={user} size={36} className="ring-2 ring-white/20" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2"
              style={{ borderColor: c.sidebarFrom }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white/90 truncate">{user?.name || '我的账号'}</div>
            <div className="text-[10px] text-white/50">{user?.title || '个人账户'}</div>
          </div>
        </button>
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </aside>
  );
}

export default memo(WorkspaceSidebar);
