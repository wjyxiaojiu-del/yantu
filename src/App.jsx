import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Search, X, LayoutDashboard, Users, ClipboardList, CalendarCheck, Award, Trophy, Kanban, CalendarDays, BookOpen, FileBarChart, Bell, CalendarIcon, Clock, FolderOpen } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { ProjectProvider } from './context/ProjectContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import MentorSidebar from './components/MentorSidebar';
import AIFloatingBubble from './components/AIFloatingBubble';

const MentorDashboard = lazy(() => import('./pages/mentor/MentorDashboard'));
const StudentList = lazy(() => import('./pages/mentor/StudentList'));
const StudentDetail = lazy(() => import('./pages/mentor/StudentDetail'));
const TaskAssign = lazy(() => import('./pages/mentor/TaskAssign'));
const MeetingManager = lazy(() => import('./pages/mentor/MeetingManager'));
const ReviewStages = lazy(() => import('./pages/mentor/ReviewStages'));
const AchievementManager = lazy(() => import('./pages/mentor/AchievementManager'));
const NotificationCenter = lazy(() => import('./pages/common/NotificationCenter'));
const CalendarView = lazy(() => import('./pages/common/CalendarView'));
const AttendancePage = lazy(() => import('./pages/common/AttendancePage'));
const FileLibrary = lazy(() => import('./pages/common/FileLibrary'));

// Agile pages
const AgileDashboard = lazy(() => import('./pages/agile/Dashboard'));
const SprintBoard = lazy(() => import('./pages/agile/SprintBoard'));
const SprintPlan = lazy(() => import('./pages/agile/SprintPlan'));
const Backlog = lazy(() => import('./pages/agile/Backlog'));
const Standup = lazy(() => import('./pages/agile/Standup'));
const Risks = lazy(() => import('./pages/agile/Risks'));
const Literature = lazy(() => import('./pages/agile/Literature'));
const Report = lazy(() => import('./pages/agile/Report'));
const MyTasks = lazy(() => import('./pages/agile/MyTasks'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-[var(--accent)] rounded-full animate-spin" />
        <span className="text-sm text-slate-400">加载中...</span>
      </div>
    </div>
  );
}

const commonPages = [
  { path: '/calendar', label: '日程日历', icon: CalendarIcon },
  { path: '/attendance', label: '考勤打卡', icon: Clock },
  { path: '/files', label: '文件资料库', icon: FolderOpen },
  { path: '/notifications', label: '消息通知', icon: Bell },
];

const mentorPages = [
  { path: '/', label: '导师总览', icon: LayoutDashboard },
  { path: '/students', label: '学生管理', icon: Users },
  { path: '/tasks', label: '任务指派', icon: ClipboardList },
  { path: '/meetings', label: '组会管理', icon: CalendarCheck },
  { path: '/reviews', label: '节点评审', icon: Award },
  { path: '/achievements', label: '学术成果', icon: Trophy },
  ...commonPages,
];

const studentPages = [
  { path: '/agile/dashboard', label: '项目总览', icon: LayoutDashboard },
  { path: '/agile/board', label: '任务看板', icon: Kanban },
  { path: '/agile/plan', label: '迭代规划', icon: CalendarDays },
  { path: '/agile/backlog', label: '待办事项', icon: ClipboardList },
  { path: '/agile/standup', label: '每日日程', icon: CalendarCheck },
  { path: '/agile/risks', label: '风险管控', icon: Award },
  { path: '/agile/literature', label: '文献管理', icon: BookOpen },
  { path: '/agile/report', label: '项目报告', icon: FileBarChart },
  { path: '/agile/my-tasks', label: '我的任务', icon: ClipboardList },
  ...commonPages,
];

const appRoutes = [
  { path: '/', element: <MentorDashboard /> },
  { path: '/students', element: <StudentList /> },
  { path: '/students/:id', element: <StudentDetail /> },
  { path: '/tasks', element: <TaskAssign /> },
  { path: '/meetings', element: <MeetingManager /> },
  { path: '/reviews', element: <ReviewStages /> },
  { path: '/achievements', element: <AchievementManager /> },
  { path: '/notifications', element: <NotificationCenter /> },
  { path: '/calendar', element: <CalendarView /> },
  { path: '/attendance', element: <AttendancePage /> },
  { path: '/files', element: <FileLibrary /> },
  { path: '/agile/dashboard', element: <AgileDashboard /> },
  { path: '/agile/board', element: <SprintBoard /> },
  { path: '/agile/plan', element: <SprintPlan /> },
  { path: '/agile/backlog', element: <Backlog /> },
  { path: '/agile/standup', element: <Standup /> },
  { path: '/agile/risks', element: <Risks /> },
  { path: '/agile/literature', element: <Literature /> },
  { path: '/agile/report', element: <Report /> },
  { path: '/agile/my-tasks', element: <MyTasks /> },
];

function GlobalLoadingOverlay() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const handler = (e) => setCount(e.detail.count);
    window.addEventListener('apiloadingchange', handler);
    return () => window.removeEventListener('apiloadingchange', handler);
  }, []);
  if (count <= 0) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.08)', backdropFilter: 'blur(2px)', pointerEvents: 'none' }}>
      <div className="flex flex-col items-center gap-3 p-5 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div className="w-6 h-6 border-2 border-slate-200 border-t-[var(--accent)] rounded-full animate-spin" />
        <span className="text-xs text-slate-400">加载中...</span>
      </div>
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoggedIn, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [role, setRole] = useState(() => user?.role || localStorage.getItem('app-role') || 'mentor');
  const [unreadCount, setUnreadCount] = useState(0);
  const handleRoleChange = (next) => { setRole(next); localStorage.setItem('app-role', next); };
  const searchRef = useRef(null);

  // Poll unread notifications
  useEffect(() => {
    if (!isLoggedIn) return;
    let mounted = true;
    const fetchCount = async () => {
      try {
        const data = await api.getUnreadCount();
        if (mounted) setUnreadCount(data?.count || 0);
      } catch (e) { /* ignore */ }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, [isLoggedIn]);

  // 当用户登录态恢复后，同步角色
  useEffect(() => {
    if (user?.role && user.role !== role) {
      setRole(user.role);
      localStorage.setItem('app-role', user.role);
    }
  }, [user?.role, role]);

  const pages = role === 'mentor' ? mentorPages : studentPages;
  const defaultPath = role === 'mentor' ? '/' : '/agile/dashboard';

  // 未登录时重定向到登录页
  useEffect(() => {
    if (!isLoading && !isLoggedIn && location.pathname !== '/login' && location.pathname !== '/register') {
      navigate('/login', { replace: true });
    }
    if (!isLoading && isLoggedIn && (location.pathname === '/login' || location.pathname === '/register')) {
      navigate(defaultPath, { replace: true });
    }
  }, [isLoading, isLoggedIn, location.pathname, defaultPath, navigate]);

  // 角色切换时，若当前页面不在新角色导航中，则重定向
  useEffect(() => {
    if (!isLoggedIn) return;
    const currentInPages = pages.some(p => p.path === location.pathname);
    if (!currentInPages && location.pathname !== defaultPath) {
      navigate(defaultPath, { replace: true });
    }
  }, [role, location.pathname, pages, defaultPath, navigate]);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(prev => !prev); }
      if (e.key === 'Escape' && searchOpen) setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen]);

  useEffect(() => { if (searchOpen && searchRef.current) searchRef.current.focus(); }, [searchOpen]);

  const filteredPages = pages.filter(p => p.label.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <>
      <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <MentorSidebar role={role} onRoleChange={handleRoleChange} mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} unreadCount={unreadCount} />

      <main className={`flex-1 page-enter relative z-10 ${isLoggedIn ? 'md:ml-[220px] p-4 md:p-6' : ''}`} key={location.pathname}>
        {/* Desktop header */}
        {isLoggedIn && (
          <div className="hidden md:flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setSearchOpen(true)} className="btn-ghost p-2 rounded-lg text-slate-400 hover:text-slate-600">
                <Search className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/notifications')} className="btn-ghost p-2 rounded-lg relative text-slate-400 hover:text-slate-600">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-400 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Mobile top bar */}
        {isLoggedIn && (
          <div className="md:hidden flex items-center justify-between mb-4 -mt-1">
            <button onClick={() => setSidebarOpen(true)} className="btn-ghost p-2 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-sm font-bold text-gradient-warm">{role === 'mentor' ? '导师工作台' : '项目工作台'}</h1>
            <button onClick={() => navigate('/notifications')} className="btn-ghost p-2 rounded-lg relative">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 text-white text-[8px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        )}

        <Suspense fallback={<PageLoader />}>
          <Routes>
            {!isLoggedIn ? (
              <>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="*" element={<LoginPage />} />
              </>
            ) : (
              <>
                {appRoutes.map(r => <Route key={r.path} path={r.path} element={r.element} />)}
              </>
            )}
          </Routes>
        </Suspense>
      </main>

      <GlobalLoadingOverlay />
      <AIFloatingBubble />

      {/* Global search modal */}
      {searchOpen && (
        <div className="modal-overlay" onClick={() => setSearchOpen(false)}>
          <div className="modal-panel p-4 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索页面... (Ctrl+K)"
                className="input pl-10 pr-10 py-3"
              />
              <button onClick={() => setSearchOpen(false)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              {filteredPages.map(page => {
                const Icon = page.icon;
                return (
                  <button key={page.path} onClick={() => { navigate(page.path); setSearchOpen(false); setSearchQuery(''); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all text-left">
                    <Icon className="w-4 h-4 text-slate-300" />
                    <span>{page.label}</span>
                    <span className="ml-auto text-xs text-slate-300">{page.path}</span>
                  </button>
                );
              })}
              {filteredPages.length === 0 && <div className="text-center py-4 text-slate-300 text-sm">无匹配结果</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ProjectProvider>
          <ToastProvider>
            <ErrorBoundary>
              <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
                <AppContent />
              </div>
            </ErrorBoundary>
          </ToastProvider>
        </ProjectProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
