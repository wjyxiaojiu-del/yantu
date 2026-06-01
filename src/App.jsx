import { lazy, Suspense, useState, useEffect, useRef, memo } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Search, X, LayoutDashboard, Users, ClipboardList, CalendarCheck, Award, Trophy, Kanban, CalendarDays, BookOpen, FileBarChart, Bell, CalendarIcon, Clock, FolderOpen, Building2, ChevronDown, BarChart3, FileText, TrendingUp } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { ProjectProvider } from './context/ProjectContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TenantProvider, useTenant } from './context/TenantContext';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import MentorSidebar from './components/MentorSidebar';
import AIFloatingBubble from './components/AIFloatingBubble';
import api from './api';

// 按需加载页面组件，减少首屏 JS 体积
const MentorOverview = lazy(() => import('./pages/mentor/MentorOverview'));
const MentorDashboard = lazy(() => import('./pages/mentor/MentorDashboard'));
const StudentList = lazy(() => import('./pages/mentor/StudentList'));
const StudentDetail = lazy(() => import('./pages/mentor/StudentDetail'));
const TaskAssign = lazy(() => import('./pages/mentor/TaskAssign'));
const MeetingManager = lazy(() => import('./pages/mentor/MeetingManager'));
const ReviewStages = lazy(() => import('./pages/mentor/ReviewStages'));
const AchievementManager = lazy(() => import('./pages/mentor/AchievementManager'));
const ReportDashboard = lazy(() => import('./pages/mentor/ReportDashboard'));
const WeeklyReports = lazy(() => import('./pages/mentor/WeeklyReports'));
const StudentGrowth = lazy(() => import('./pages/mentor/StudentGrowth'));
const Papers = lazy(() => import('./pages/Papers'));
const NotificationCenter = lazy(() => import('./pages/common/NotificationCenter'));
const CalendarView = lazy(() => import('./pages/common/CalendarView'));
const AttendancePage = lazy(() => import('./pages/common/AttendancePage'));
const FileLibrary = lazy(() => import('./pages/common/FileLibrary'));
const TenantManagement = lazy(() => import('./pages/common/TenantManagement'));

const AgileDashboard = lazy(() => import('./pages/agile/Dashboard'));
const SprintBoard = lazy(() => import('./pages/agile/SprintBoard'));
const SprintPlan = lazy(() => import('./pages/agile/SprintPlan'));
const Backlog = lazy(() => import('./pages/agile/Backlog'));
const Standup = lazy(() => import('./pages/agile/Standup'));
const Risks = lazy(() => import('./pages/agile/Risks'));
const Literature = lazy(() => import('./pages/agile/Literature'));
const Report = lazy(() => import('./pages/agile/Report'));
const MyTasks = lazy(() => import('./pages/agile/MyTasks'));
const MyWeeklyReport = lazy(() => import('./pages/agile/MyWeeklyReport'));
const MyGrowth = lazy(() => import('./pages/agile/MyGrowth'));
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
  { path: '/tenant', label: '课题组管理', icon: Building2 },
];

const mentorPages = [
  { path: '/overview', label: '总览', icon: LayoutDashboard },
  { path: '/', label: '工作台', icon: LayoutDashboard },
  { path: '/students', label: '学生管理', icon: Users },
  { path: '/tasks', label: '任务指派', icon: ClipboardList },
  { path: '/meetings', label: '组会管理', icon: CalendarCheck },
  { path: '/reviews', label: '节点评审', icon: Award },
  { path: '/achievements', label: '学术成果', icon: Trophy },
  { path: '/report-dashboard', label: '数据大屏', icon: BarChart3 },
  { path: '/weekly-reports', label: '周报管理', icon: FileText },
  { path: '/student-growth', label: '成长档案', icon: TrendingUp },
  { path: '/papers', label: '论文审阅', icon: BookOpen },
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
  { path: '/agile/weekly-report', label: '我的周报', icon: FileText },
  { path: '/agile/growth', label: '成长档案', icon: TrendingUp },
  { path: '/papers', label: '我的论文', icon: BookOpen },
  ...commonPages,
];

const appRoutes = [
  { path: '/overview', component: MentorOverview },
  { path: '/', component: MentorDashboard },
  { path: '/students', component: StudentList },
  { path: '/students/:id', component: StudentDetail },
  { path: '/tasks', component: TaskAssign },
  { path: '/meetings', component: MeetingManager },
  { path: '/reviews', component: ReviewStages },
  { path: '/achievements', component: AchievementManager },
  { path: '/report-dashboard', component: ReportDashboard },
  { path: '/weekly-reports', component: WeeklyReports },
  { path: '/student-growth', component: StudentGrowth },
  { path: '/papers', component: Papers },
  { path: '/papers/:id', component: Papers },
  { path: '/notifications', component: NotificationCenter },
  { path: '/calendar', component: CalendarView },
  { path: '/attendance', component: AttendancePage },
  { path: '/files', component: FileLibrary },
  { path: '/tenant', component: TenantManagement },
  { path: '/agile/dashboard', component: AgileDashboard },
  { path: '/agile/board', component: SprintBoard },
  { path: '/agile/plan', component: SprintPlan },
  { path: '/agile/backlog', component: Backlog },
  { path: '/agile/standup', component: Standup },
  { path: '/agile/risks', component: Risks },
  { path: '/agile/literature', component: Literature },
  { path: '/agile/report', component: Report },
  { path: '/agile/my-tasks', component: MyTasks },
  { path: '/agile/weekly-report', component: MyWeeklyReport },
  { path: '/agile/growth', component: MyGrowth },
];

const memoizedRoutes = appRoutes.map(r => ({ ...r, MemoComponent: memo(r.component) }));

function AppRoutes({ routes, isLoggedIn }) {
  if (!isLoggedIn) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Routes>
      {routes.map(r => (
        <Route
          key={r.path}
          path={r.path}
          element={
            <Suspense fallback={<PageLoader />}>
              <r.MemoComponent />
            </Suspense>
          }
        />
      ))}
      <Route path="*" element={
        <Suspense fallback={<PageLoader />}>
          <DefaultPage />
        </Suspense>
      } />
    </Routes>
  );
}

// Default page when no route matches
const DefaultPage = memo(function DefaultPage() {
  const { user } = useAuth();
  const defaultPath = user?.role === 'mentor' ? '/overview' : '/agile/dashboard';
  const navigate = useNavigate();
  useEffect(() => { navigate(defaultPath, { replace: true }); }, [defaultPath, navigate]);
  return <PageLoader />;
});

function GlobalLoadingOverlay() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let showTimer = null;
    let hideTimer = null;
    const handler = (e) => {
      const count = e.detail.count;
      if (count > 0) {
        clearTimeout(hideTimer);
        showTimer = setTimeout(() => setVisible(true), 200);
      } else {
        clearTimeout(showTimer);
        hideTimer = setTimeout(() => setVisible(false), 200);
      }
    };
    window.addEventListener('apiloadingchange', handler);
    return () => {
      window.removeEventListener('apiloadingchange', handler);
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.06)', pointerEvents: 'none' }}>
      <div className="flex flex-col items-center gap-3 p-5 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
        <div className="w-5 h-5 border-2 border-slate-200 border-t-[var(--accent)] rounded-full animate-spin" />
        <span className="text-xs text-slate-400">加载中...</span>
      </div>
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoggedIn, isLoading } = useAuth();
  const { currentTenant, tenants, switchTenant } = useTenant();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [role, setRole] = useState(() => user?.role || localStorage.getItem('app-role') || 'mentor');
  const [unreadCount, setUnreadCount] = useState(0);
  const [tenantMenuOpen, setTenantMenuOpen] = useState(false);
  const handleRoleChange = (next) => { setRole(next); localStorage.setItem('app-role', next); };
  const searchRef = useRef(null);
  const tenantMenuRef = useRef(null);

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

  // 点击外部关闭租户菜单
  useEffect(() => {
    if (!tenantMenuOpen) return;
    const handler = (e) => {
      if (tenantMenuRef.current && !tenantMenuRef.current.contains(e.target)) {
        setTenantMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tenantMenuOpen]);

  const pages = role === 'mentor' ? mentorPages : studentPages;
  const defaultPath = role === 'mentor' ? '/overview' : '/agile/dashboard';

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

      <main className={`flex-1 relative z-10 ${isLoggedIn ? 'md:ml-[220px] p-4 md:p-6' : ''}`} style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
        {/* Desktop header */}
        {isLoggedIn && (
          <div className="hidden md:flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setSearchOpen(true)} className="btn-ghost p-2 rounded-lg text-slate-400 hover:text-slate-600">
                <Search className="w-4 h-4" />
              </button>
              {/* Tenant Switcher */}
              {tenants.length > 0 && (
                <div className="relative" ref={tenantMenuRef}>
                  <button
                    onClick={() => setTenantMenuOpen(v => !v)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="max-w-[140px] truncate">{currentTenant?.name || '选择课题组'}</span>
                    <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${tenantMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {tenantMenuOpen && (
                    <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50"
                      style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                      <div className="px-3 py-2 text-xs text-slate-400 font-medium">切换课题组</div>
                      {tenants.map(t => (
                        <button
                          key={t.id}
                          onClick={() => { switchTenant(t.id); setTenantMenuOpen(false); }}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-50 transition-colors ${String(t.id) === String(currentTenant?.id) ? 'bg-orange-50 text-orange-700' : 'text-slate-700'}`}
                        >
                          <span className="truncate">{t.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 capitalize">{t.tenant_role}</span>
                        </button>
                      ))}
                      <div className="border-t border-slate-100 mt-1 pt-1">
                        <button
                          onClick={() => { navigate('/tenant'); setTenantMenuOpen(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-orange-600 hover:bg-orange-50 transition-colors"
                        >
                          课题组管理 →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
            <h1 className="text-sm font-bold text-gradient-warm">科研工作台</h1>
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

        {isLoading ? (
          <div className="flex items-center justify-center h-[60vh]">
            <PageLoader />
          </div>
        ) : (
          <Suspense fallback={<PageLoader />}>
            <AppRoutes routes={memoizedRoutes} isLoggedIn={isLoggedIn} />
          </Suspense>
        )}
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
        <TenantProvider>
          <ProjectProvider>
            <ToastProvider>
              <ErrorBoundary>
                <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
                  <AppContent />
                </div>
              </ErrorBoundary>
            </ToastProvider>
          </ProjectProvider>
        </TenantProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
