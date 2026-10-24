import { lazy, Suspense, useState, useEffect, useRef, memo } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Search, X, LayoutDashboard, ClipboardList, CalendarCheck, Award, Kanban, BookOpen, Bell, CalendarIcon, Clock, Gauge, ChevronDown, Plus, Pencil, Trash2, LockKeyhole, Eye, EyeOff, Loader2, HeartPulse, Link2, ListChecks } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { ProjectProvider } from './context/ProjectContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TenantProvider, useTenant } from './context/TenantContext';
import { useProject } from './context/ProjectContext';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import WorkspaceSidebar from './components/WorkspaceSidebar';
import AIFloatingBubble from './components/AIFloatingBubble';
import Modal from './components/Modal';
import api from './api';
import useWorkspacePreferences from './hooks/useWorkspacePreferences';
import { useToast } from './components/Toast';

const MemoAIFloatingBubble = memo(AIFloatingBubble);

// Keep route chunks lazy for the login screen, then warm them while the
// authenticated workbench is idle so the first sidebar click is instant.
const pageLoaders = {
  papers: () => import('./pages/Papers'),
  notifications: () => import('./pages/common/NotificationCenter'),
  calendar: () => import('./pages/common/CalendarView'),
  attendance: () => import('./pages/common/AttendancePage'),
  dashboard: () => import('./pages/agile/Dashboard'),
  overview: () => import('./pages/agile/Overview'),
  board: () => import('./pages/agile/SprintBoard'),
  backlog: () => import('./pages/agile/Backlog'),
  standup: () => import('./pages/agile/Standup'),
  risks: () => import('./pages/agile/Risks'),
  literature: () => import('./pages/agile/Literature'),
  myTasks: () => import('./pages/agile/MyTasks'),
  weeklyReview: () => import('./pages/agile/WeeklyReview'),
  connectionHealth: () => import('./pages/agile/ConnectionHealth'),
  researchMap: () => import('./pages/agile/ResearchMap'),
  sop: () => import('./pages/agile/SopFlow'),
};

const Papers = lazy(pageLoaders.papers);
const NotificationCenter = lazy(pageLoaders.notifications);
const CalendarView = lazy(pageLoaders.calendar);
const AttendancePage = lazy(pageLoaders.attendance);
const AgileDashboard = lazy(pageLoaders.dashboard);
const Overview = lazy(pageLoaders.overview);
const TaskBoard = lazy(pageLoaders.board);
const Backlog = lazy(pageLoaders.backlog);
const Standup = lazy(pageLoaders.standup);
const Risks = lazy(pageLoaders.risks);
const Literature = lazy(pageLoaders.literature);
const MyTasks = lazy(pageLoaders.myTasks);
const WeeklyReview = lazy(pageLoaders.weeklyReview);
const ConnectionHealth = lazy(pageLoaders.connectionHealth);
const ResearchMap = lazy(pageLoaders.researchMap);
const SopFlow = lazy(pageLoaders.sop);

const primaryRouteLoaders = [
  pageLoaders.dashboard, pageLoaders.overview, pageLoaders.board, pageLoaders.literature, pageLoaders.backlog,
  pageLoaders.standup, pageLoaders.risks,
  pageLoaders.weeklyReview,
  pageLoaders.connectionHealth,
  pageLoaders.researchMap,
  pageLoaders.calendar, pageLoaders.attendance,
];

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
  { path: '/attendance', label: '专注记录', icon: Clock },
];

const personalPages = [
  { path: '/agile/overview', label: '科研总览', icon: Gauge },
  { path: '/agile/dashboard', label: '今日', icon: LayoutDashboard },
  { path: '/agile/board', label: '任务推进', icon: Kanban },
  { path: '/agile/backlog', label: '收集箱', icon: ClipboardList },
  { path: '/agile/standup', label: '每日记录', icon: CalendarCheck },
  { path: '/agile/weekly-review', label: '每周复盘', icon: ClipboardList },
  { path: '/agile/connection-health', label: '连接与恢复', icon: HeartPulse },
  { path: '/agile/research-map', label: '研究地图', icon: Link2 },
  { path: '/agile/risks', label: '风险管控', icon: Award },
  { path: '/agile/literature', label: '文献管理', icon: BookOpen },
  { path: '/agile/my-tasks', label: '我的任务', icon: ClipboardList },
  { path: '/agile/sop', label: 'SOP 流程', icon: ListChecks },
  { path: '/papers', label: '我的论文', icon: BookOpen },
  ...commonPages,
];

const searchResultIcons = {
  task: Kanban,
  inbox: ClipboardList,
  literature: BookOpen,
  daily_log: CalendarCheck,
  risk: Award,
  schedule: CalendarIcon,
  weekly_review: ClipboardList,
  research_node: Link2,
};

const appRoutes = [
  { path: '/papers', component: Papers },
  { path: '/papers/:id', component: Papers },
  { path: '/notifications', component: NotificationCenter },
  { path: '/calendar', component: CalendarView },
  { path: '/attendance', component: AttendancePage },
  { path: '/agile/dashboard', component: AgileDashboard },
  { path: '/agile/overview', component: Overview },
  { path: '/agile/board', component: TaskBoard },
  { path: '/agile/backlog', component: Backlog },
  { path: '/agile/standup', component: Standup },
  { path: '/agile/weekly-review', component: WeeklyReview },
  { path: '/agile/connection-health', component: ConnectionHealth },
  { path: '/agile/research-map', component: ResearchMap },
  { path: '/agile/risks', component: Risks },
  { path: '/agile/literature', component: Literature },
  { path: '/agile/my-tasks', component: MyTasks },
  { path: '/agile/sop', component: SopFlow },
];

const memoizedRoutes = appRoutes.map(r => ({ ...r, MemoComponent: memo(r.component) }));

function AppRoutes({ routes }) {
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
  const navigate = useNavigate();
  useEffect(() => { navigate('/agile/dashboard', { replace: true }); }, [navigate]);
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

function WorkspaceLogin() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!password) return;
    setSubmitting(true);
    setError('');
    try {
      await login(password);
    } catch (e) {
      setError(e.status === 429 ? '尝试次数过多，请稍后再试' : '密码不正确，请重新输入');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-5 py-10 bg-slate-50 relative overflow-hidden">
      <div className="absolute -top-40 -right-28 w-96 h-96 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="absolute -bottom-44 -left-24 w-96 h-96 rounded-full bg-cyan-100/50 blur-3xl" />
      <div className="w-full max-w-sm relative">
        <div className="text-center mb-7">
          <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center text-white shadow-lg shadow-blue-200" style={{ background: 'linear-gradient(135deg,#2563eb,#38bdf8)' }}>
            <LockKeyhole size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-4">进入小九工作台</h1>
          <p className="text-sm text-slate-400 mt-1">你的项目、任务与每日记录</p>
        </div>
        <form onSubmit={submit} className="bg-white/90 backdrop-blur-xl border border-white rounded-3xl p-6 shadow-xl shadow-slate-200/60">
          <label className="block text-xs font-semibold text-slate-500 mb-2" htmlFor="workspace-password">访问密码</label>
          <div className="relative">
            <input
              id="workspace-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(''); }}
              className={`input pr-11 ${error ? 'error' : ''}`}
              placeholder="请输入工作台密码"
              autoComplete="current-password"
              autoFocus
            />
            <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500" aria-label={showPassword ? '隐藏密码' : '显示密码'}>
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {error && <p className="field-error mt-2">{error}</p>}
          <button type="submit" disabled={!password || submitting} className="btn btn-primary w-full justify-center mt-5 py-3">
            {submitting ? <><Loader2 size={16} className="animate-spin" />正在验证</> : '进入工作台'}
          </button>
        </form>
        <p className="text-center text-[11px] text-slate-300 mt-5">研途启航 · Personal Workspace</p>
      </div>
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoggedIn, isLoading } = useAuth();
  const { currentTenant } = useTenant();
  const { projects, projectId, selectProject, createProject, updateProject, deleteProject } = useProject();
  const toast = useToast();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectModal, setProjectModal] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [projectSaving, setProjectSaving] = useState(false);
  const { getLastVisitedPath, recordVisit } = useWorkspacePreferences('personal');
  const searchRef = useRef(null);
  const projectMenuRef = useRef(null);

  // Poll unread notifications
  useEffect(() => {
    if (!isLoggedIn || !currentTenant?.id) return;
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
  }, [isLoggedIn, currentTenant?.id]);

  // 点击外部关闭项目菜单
  useEffect(() => {
    if (!projectMenuOpen) return;
    const handler = (e) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target)) {
        setProjectMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [projectMenuOpen]);

  const pages = personalPages;
  const defaultPath = '/agile/dashboard';

  // 本地会话恢复后回到上次访问页面。
  useEffect(() => {
    if (!isLoading && isLoggedIn && (location.pathname === '/login' || location.pathname === '/register')) {
      const lastPath = getLastVisitedPath();
      const validPaths = personalPages.map((p) => p.path);
      if (lastPath && validPaths.includes(lastPath)) {
        navigate(lastPath, { replace: true });
      } else {
        navigate(defaultPath, { replace: true });
      }
    }
  }, [isLoading, isLoggedIn, location.pathname, defaultPath, navigate, getLastVisitedPath]);

  // 记录有效页面访问，用于恢复页面和常用入口排序
  useEffect(() => {
    if (!isLoggedIn) return;
    const exactPage = pages.find((page) => page.path === location.pathname);
    const normalizedPath = exactPage?.path
      || (location.pathname.startsWith('/papers/') ? '/papers' : null);
    if (normalizedPath) recordVisit(normalizedPath);
  }, [isLoggedIn, location.pathname, pages, recordVisit]);



  // 旧版导师页面或无效地址统一回到个人工作区。
  useEffect(() => {
    if (!isLoggedIn) return;
    const currentInPages = pages.some(p => p.path === location.pathname)
      || location.pathname.startsWith('/papers/');
    if (!currentInPages && location.pathname !== defaultPath) {
      navigate(defaultPath, { replace: true });
    }
  }, [isLoggedIn, location.pathname, pages, defaultPath, navigate]);

  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(prev => !prev); }
      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setSearchOpen(false);
        navigate('/agile/backlog');
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('workspace:quick-capture')), 60);
      }
      if (e.altKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setSearchOpen(false);
        setSearchQuery('');
        navigate('/agile/standup');
      }
      if (e.key === 'Escape' && searchOpen) setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, searchOpen]);

  useEffect(() => { if (searchOpen && searchRef.current) searchRef.current.focus(); }, [searchOpen]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!searchOpen || query.length < 2 || !projectId) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError('');
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError('');
      try {
        const data = await api.searchWorkspace({ q: query, project_id: projectId, limit: 24 });
        if (!cancelled) setSearchResults(Array.isArray(data?.results) ? data.results : []);
      } catch (error) {
        if (!cancelled) setSearchError(error.message || '搜索失败');
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [projectId, searchOpen, searchQuery]);

  // Warm the only primary sidebar dataset that is not already loaded by the
  // dashboard. This runs while the browser is idle and reuses the API cache.
  useEffect(() => {
    if (!isLoggedIn || !projectId) return undefined;
    let cancelled = false;
    const warmSidebar = () => {
      if (cancelled) return;
      primaryRouteLoaders.forEach((loadRoute) => loadRoute().catch(() => {}));
      api.getInboxItems({ project_id: projectId }).catch(() => {});
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(warmSidebar, { timeout: 800 });
      return () => { cancelled = true; window.cancelIdleCallback(id); };
    }
    const id = window.setTimeout(warmSidebar, 300);
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [isLoggedIn, projectId]);

  const filteredPages = pages.filter(p => p.label.toLowerCase().includes(searchQuery.toLowerCase()));
  const currentProject = projects.find(project => project.id === projectId);
  const closeSearch = () => { setSearchOpen(false); setSearchQuery(''); };
  const openSearchResult = (result) => {
    navigate(result.path, { state: { searchResult: { type: result.type, id: result.id } } });
    closeSearch();
  };
  const openCapture = () => {
    closeSearch();
    navigate('/agile/backlog');
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('workspace:quick-capture')), 60);
  };

  const openProjectModal = (mode, project = null) => {
    setProjectModal({ mode, project });
    setProjectName(project?.name || '');
    setProjectMenuOpen(false);
  };

  const handleProjectSubmit = async (event) => {
    event.preventDefault();
    if (!projectName.trim()) return;
    setProjectSaving(true);
    try {
      if (projectModal.mode === 'create') {
        await createProject({ name: projectName.trim() });
        toast.success('项目已创建');
      } else {
        await updateProject(projectModal.project.id, { name: projectName.trim() });
        toast.success('项目名称已更新');
      }
      setProjectModal(null);
    } catch (error) {
      toast.error(error.message || '项目保存失败');
    } finally {
      setProjectSaving(false);
    }
  };

  const handleProjectDelete = async (project) => {
    setProjectMenuOpen(false);
    if (!window.confirm(`确定删除项目「${project.name}」及其全部数据吗？`)) return;
    try {
      await deleteProject(project.id);
      toast.success('项目已删除');
    } catch (error) {
      toast.error(error.message || '项目删除失败');
    }
  };

  if (isLoading) return <PageLoader />;
  if (!isLoggedIn) return <WorkspaceLogin />;

  return (
    <>
      {isLoggedIn && <WorkspaceSidebar />}

      <main className={`flex-1 min-w-0 relative z-10 ${isLoggedIn ? 'ml-[220px] p-6' : ''}`} style={{ background: 'var(--bg-page)', minHeight: '100vh', minWidth: isLoggedIn ? '1060px' : undefined }}>
        {isLoggedIn && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={() => setSearchOpen(true)} className="btn-ghost p-2 rounded-lg text-slate-400 hover:text-slate-600" aria-label="打开全局搜索">
                <Search className="w-4 h-4" />
              </button>
              {/* Project Switcher */}
              <div className="relative" ref={projectMenuRef}>
                <button
                  onClick={() => setProjectMenuOpen(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <Kanban className="w-4 h-4 text-slate-400" />
                  <span className="max-w-[180px] truncate">
                    {currentProject?.name || '选择项目'}
                  </span>
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${projectMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {projectMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-xl shadow-lg border border-slate-100 py-1 z-50"
                    style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                    <div className="px-3 py-2 text-xs text-slate-400 font-medium">切换项目</div>
                    {projects.map(project => (
                      <div
                        key={project.id}
                        className={`group flex items-center px-2 hover:bg-slate-50 ${project.id === projectId ? 'bg-orange-50 text-orange-700' : 'text-slate-700'}`}
                      >
                        <button
                          onClick={() => { selectProject(project.id); setProjectMenuOpen(false); }}
                          className="flex-1 min-w-0 text-left px-1 py-2 text-sm"
                        >
                          <span className="truncate block">{project.name}</span>
                        </button>
                        <button onClick={() => openProjectModal('edit', project)} className="p-1.5 text-slate-300 hover:text-slate-600" title="重命名">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleProjectDelete(project)} className="p-1.5 text-slate-300 hover:text-red-500" title="删除项目">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {projects.length === 0 && (
                      <div className="px-3 py-2 text-xs text-slate-400">暂无可用项目</div>
                    )}
                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <button
                        onClick={() => openProjectModal('create')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50"
                      >
                        <Plus size={14} /> 新建项目
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/calendar')} className="btn-ghost p-2 rounded-lg text-slate-400 hover:text-slate-600" aria-label="打开日程日历" title="日程日历">
                <CalendarIcon className="w-5 h-5" />
              </button>
              <button onClick={() => navigate('/notifications')} className="btn-ghost p-2 rounded-lg relative text-slate-400 hover:text-slate-600" aria-label="打开消息通知">
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

        {isLoading ? (
          <div className="flex items-center justify-center h-[60vh]">
            <PageLoader />
          </div>
        ) : (
          <Suspense fallback={<PageLoader />}>
            <AppRoutes routes={memoizedRoutes} />
          </Suspense>
        )}
      </main>

      <GlobalLoadingOverlay />
      {isLoggedIn && <MemoAIFloatingBubble />}

      {/* Global search modal */}
      {searchOpen && (
        <div className="modal-overlay items-start pt-[9vh]" onClick={closeSearch}>
          <div className="modal-panel w-full max-w-2xl overflow-hidden p-0" onClick={e => e.stopPropagation()}>
            <div className="relative border-b border-slate-100 px-5 py-4">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索任务、文献、复盘、风险或日程……"
                className="w-full border-0 bg-transparent py-2 pl-10 pr-24 text-[16px] font-medium text-slate-800 outline-none placeholder:text-slate-300"
              />
              <span className="absolute right-6 top-1/2 -translate-y-1/2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-400">ESC</span>
            </div>

            <div className="max-h-[62vh] overflow-y-auto px-3 py-3">
              {!searchQuery.trim() && (
                <>
                  <div className="px-3 pb-2 text-[10px] font-bold tracking-[0.16em] text-slate-400">快捷动作</div>
                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <button onClick={openCapture} className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-left transition-colors hover:bg-amber-50">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-white"><Plus size={15} /></span>
                      <span><b className="block text-xs text-slate-700">快速收集</b><small className="mt-0.5 block text-[10px] text-slate-400">记下当前念头</small></span>
                      <kbd className="ml-auto text-[9px] text-amber-700">Alt N</kbd>
                    </button>
                    <button onClick={() => { navigate('/agile/standup'); closeSearch(); }} className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-left transition-colors hover:bg-blue-50">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500 text-white"><CalendarCheck size={15} /></span>
                      <span><b className="block text-xs text-slate-700">写每日记录</b><small className="mt-0.5 block text-[10px] text-slate-400">复盘今天的推进</small></span>
                      <kbd className="ml-auto text-[9px] text-blue-700">Alt J</kbd>
                    </button>
                  </div>
                  <div className="px-3 pb-2 text-[10px] font-bold tracking-[0.16em] text-slate-400">打开页面</div>
                  <div className="grid grid-cols-2 gap-1">
                    {pages.map(page => {
                      const Icon = page.icon;
                      return <button key={page.path} onClick={() => { navigate(page.path); closeSearch(); }} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"><Icon className="h-4 w-4 text-slate-300" /><span>{page.label}</span></button>;
                    })}
                  </div>
                </>
              )}

              {searchQuery.trim().length === 1 && <div className="py-14 text-center text-xs text-slate-400">再输入一个字，开始搜索工作区内容</div>}

              {searchQuery.trim().length >= 2 && (
                <>
                  {filteredPages.length > 0 && (
                    <div className="mb-3">
                      <div className="px-3 pb-1.5 text-[10px] font-bold tracking-[0.16em] text-slate-400">页面</div>
                      {filteredPages.slice(0, 3).map(page => {
                        const Icon = page.icon;
                        return <button key={page.path} onClick={() => { navigate(page.path); closeSearch(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"><Icon className="h-4 w-4 text-slate-300" /><span>{page.label}</span><span className="ml-auto text-[10px] text-slate-300">打开页面</span></button>;
                      })}
                    </div>
                  )}
                  <div className="flex items-center px-3 pb-1.5 text-[10px] font-bold tracking-[0.16em] text-slate-400"><span>工作区内容</span>{searchLoading && <Loader2 size={12} className="ml-2 animate-spin" />}</div>
                  {searchError && <div className="mx-3 rounded-xl bg-red-50 px-3 py-3 text-xs text-red-600">{searchError}</div>}
                  {!searchLoading && !searchError && searchResults.map(result => {
                    const Icon = searchResultIcons[result.type] || Search;
                    return (
                      <button key={`${result.type}-${result.id}`} onClick={() => openSearchResult(result)} className="group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 group-hover:bg-white group-hover:text-[var(--accent)]"><Icon size={15} /></span>
                        <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><b className="truncate text-xs font-semibold text-slate-700">{result.title}</b><small className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-medium text-slate-400">{result.label}</small></span>{result.snippet && <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-slate-400">{result.snippet}</span>}</span>
                        <span className="mt-1 shrink-0 text-[9px] text-slate-300">{result.meta?.date || result.meta?.due_date || result.meta?.year || result.status || ''}</span>
                      </button>
                    );
                  })}
                  {!searchLoading && !searchError && searchResults.length === 0 && <div className="py-14 text-center"><Search className="mx-auto h-6 w-6 text-slate-200" /><p className="mt-2 text-xs text-slate-400">没有找到相关内容</p><button onClick={openCapture} className="mt-3 text-[11px] font-semibold text-amber-700">把它记进收集箱 →</button></div>}
                </>
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-2.5 text-[9px] text-slate-400"><span>Alt K 搜索</span><span>Alt N 收集</span><span>Alt J 复盘</span><span className="ml-auto">当前项目：{currentProject?.name || '未选择'}</span></div>
          </div>
        </div>
      )}

      {projectModal && (
        <Modal
          title={projectModal.mode === 'create' ? '新建项目' : '重命名项目'}
          onClose={() => setProjectModal(null)}
        >
          <form onSubmit={handleProjectSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">项目名称</label>
              <input
                autoFocus
                value={projectName}
                onChange={event => setProjectName(event.target.value)}
                className="input"
                placeholder="例如：个人成长计划"
                maxLength={80}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setProjectModal(null)} className="btn btn-secondary">取消</button>
              <button type="submit" disabled={!projectName.trim() || projectSaving} className="btn btn-primary">
                {projectSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </Modal>
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
