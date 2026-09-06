const BASE = '/api';

// GET 请求内存缓存：相同 URL 在 TTL 内直接复用响应，避免页面切换时重复请求
const _cache = new Map();
const _inflight = new Map();
// Read data stays warm between sidebar visits. Every write clears this cache,
// so a longer TTL improves navigation without leaving edited data stale.
const CACHE_TTL = 5 * 60_000;

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function setLoading(delta) {
  if (typeof window === 'undefined') return;
  window.__apiLoadingCount = (window.__apiLoadingCount || 0) + delta;
  window.dispatchEvent(new CustomEvent('apiloadingchange', {
    detail: { count: window.__apiLoadingCount }
  }));
}

async function request(url, options = {}) {
  const { cache: cacheOption = true, ...fetchOptions } = options;
  const isGet = !options.method || options.method === 'GET';
  const trackGlobalLoading = !isGet && fetchOptions.globalLoading !== false;
  const fullUrl = `${BASE}${url}`;

  // GET 请求走缓存
  if (isGet && cacheOption !== false) {
    const cached = _cache.get(fullUrl);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
    // 相同 URL 正在请求中，复用 Promise 避免重复发送
    if (_inflight.has(fullUrl)) return _inflight.get(fullUrl);
  }

  // Pages already own their local loading/skeleton state. Covering the entire
  // app for background GETs made sidebar navigation feel blocked.
  if (trackGlobalLoading) setLoading(1);
  const p = (async () => {
    try {
      const headers = { ...fetchOptions.headers };
      if (!(fetchOptions.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenant-id') : null;
      if (tenantId) headers['X-Tenant-Id'] = tenantId;
      const res = await fetch(fullUrl, { headers, ...fetchOptions });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // 401 全局处理：清除 token 并通知应用层跳转
        if (res.status === 401 && typeof window !== 'undefined') {
          localStorage.removeItem('auth-token');
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
        throw new ApiError(res.status, body.error || body.detail || `请求失败 (${res.status})`);
      }
      const data = await res.json();
      if (isGet && cacheOption !== false) _cache.set(fullUrl, { data, ts: Date.now() });
      return data;
    } finally {
      if (trackGlobalLoading) setLoading(-1);
      if (isGet && cacheOption !== false) _inflight.delete(fullUrl);
    }
  })();

  if (isGet && cacheOption !== false) _inflight.set(fullUrl, p);
  return p;
}

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? '?' + s : '';
};

const GET = (path) => () => request(path);
const GET_ID = (path) => (id) => request(`${path}?id=${id}`);
const GET_PARAMS = (path) => (params = {}) => request(`${path}${qs(params)}`);
const POST = (path) => async (data) => {
  const res = await request(path, { method: 'POST', body: JSON.stringify(data) });
  _cache.clear(); // 写操作后清除全部 GET 缓存
  return res;
};
const PUT = (path) => async (id, data) => {
  const res = await request(`${path}?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
  _cache.clear();
  return res;
};
const DEL = (path) => async (id) => {
  const res = await request(`${path}?id=${id}`, { method: 'DELETE' });
  _cache.clear();
  return res;
};

// 写操作辅助：请求后自动清缓存
async function write(url, options) {
  const res = await request(url, options);
  _cache.clear();
  return res;
}

const api = {
  // Dashboard
  getDashboard: GET('/mentor/dashboard'),
  seed: () => write('/mentor/seed', { method: 'POST' }),

  // Students
  getStudents: GET('/mentor/students'),
  getStudent: (id) => request(`/mentor/students/${id}`),
  getMyStudentProfile: () => request('/mentor/students/me'),
  createStudent: POST('/mentor/students'),
  updateStudent: (id, data) => write(`/mentor/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStudent: (id) => write(`/mentor/students/${id}`, { method: 'DELETE' }),

  // Tasks
  getTasks: GET_PARAMS('/mentor/tasks'),
  createTask: POST('/mentor/tasks'),
  updateTask: (id, data) => write(`/mentor/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id) => write(`/mentor/tasks/${id}`, { method: 'DELETE' }),

  // Reviews
  getReviews: GET('/mentor/reviews'),
  createReview: POST('/mentor/reviews'),
  updateReview: (id, data) => write(`/mentor/reviews/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReview: (id) => write(`/mentor/reviews/${id}`, { method: 'DELETE' }),

  // Meetings
  getMeetings: GET('/mentor/meetings'),
  createMeeting: POST('/mentor/meetings'),
  updateMeeting: (id, data) => write(`/mentor/meetings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMeeting: (id) => write(`/mentor/meetings/${id}`, { method: 'DELETE' }),

  // Achievements
  getAchievements: GET_PARAMS('/mentor/achievements'),
  createAchievement: POST('/mentor/achievements'),
  updateAchievement: (id, data) => write(`/mentor/achievements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAchievement: (id) => write(`/mentor/achievements/${id}`, { method: 'DELETE' }),

  // Notifications
  getNotifications: GET_PARAMS('/mentor/notifications'),
  getUnreadCount: GET_PARAMS('/mentor/notifications/unread-count'),
  markNotificationRead: (id) => write(`/mentor/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: (params = {}) => write(`/mentor/notifications/mark-all-read${qs(params)}`, { method: 'POST' }),
  deleteNotification: (id) => write(`/mentor/notifications/${id}`, { method: 'DELETE' }),
  sendPersonalReminder: (data) => write('/mentor/notifications/remind', { method: 'POST', body: JSON.stringify(data) }),

  // Calendar
  getCalendar: GET_PARAMS('/mentor/calendar'),

  // Attendance
  checkIn: POST('/mentor/attendance/check-in'),
  checkOut: POST('/mentor/attendance/check-out'),
  getAttendance: GET_PARAMS('/mentor/attendance'),
  getAttendanceStats: GET_PARAMS('/mentor/attendance/stats'),

  downloadCsv: async (path) => {
    const token = localStorage.getItem('auth-token') || '';
    const tenantId = localStorage.getItem('tenant-id') || '';
    const res = await fetch(path, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Id': tenantId,
      },
    });
    if (!res.ok) throw new ApiError(res.status, `导出失败 (${res.status})`);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename="?([^";]+)"?/.exec(disposition);
    const filename = match ? match[1] : 'export.csv';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // Files
  uploadFile: (formData) => write('/mentor/files/upload', { method: 'POST', body: formData }),
  getFiles: GET_PARAMS('/mentor/files'),
  downloadFile: (id) => `/api/mentor/files/${id}/download`,
  updateFile: (id, data) => write(`/mentor/files/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFile: (id) => write(`/mentor/files/${id}`, { method: 'DELETE' }),

  // Activity Logs
  getActivityLogs: GET_PARAMS('/mentor/activity-logs'),
  createActivityLog: POST('/mentor/activity-logs'),

  // Task Comments
  getTaskComments: (id) => request(`/mentor/tasks/${id}/comments`),
  createTaskComment: (id, data) => write(`/mentor/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify(data) }),
  deleteTaskComment: (id, cid) => write(`/mentor/tasks/${id}/comments/${cid}`, { method: 'DELETE' }),

  // Student-Project Links
  getStudentProjects: (id) => request(`/mentor/students/${id}/projects`),
  linkStudentProject: (id, data) => write(`/mentor/students/${id}/projects`, { method: 'POST', body: JSON.stringify(data) }),
  unlinkStudentProject: (studentId, linkId) => write(`/mentor/students/${studentId}/projects/${linkId}`, { method: 'DELETE' }),

  // Agile Project Proxy
  getAgileProjects: GET('/agile/projects'),
  getAgileProjectStats: (id) => request(`/agile/projects/${id}/stats`),
  getAgileProjectMilestones: (id) => request(`/agile/projects/${id}/milestones`),
  getAgileProjectStories: (id) => request(`/agile/projects/${id}/stories`),

  // Agile Native APIs
  getProjects: GET('/projects'),
  getProject: GET_ID('/projects'),
  getProjectStats: (id) => request(`/projects?id=${id}&action=stats`),
  createProject: POST('/projects'),
  updateProject: PUT('/projects'),
  deleteProject: DEL('/projects'),

  getStories: GET_PARAMS('/stories'),
  createStory: POST('/stories'),
  updateStory: PUT('/stories'),
  deleteStory: DEL('/stories'),

  getInboxItems: GET_PARAMS('/inbox-items'),
  createInboxItem: POST('/inbox-items'),
  updateInboxItem: PUT('/inbox-items'),
  deleteInboxItem: DEL('/inbox-items'),
  convertInboxItem: (id, data) => write(`/inbox-items/${id}/convert`, { method: 'POST', body: JSON.stringify(data) }),

  getScheduleItems: GET_PARAMS('/schedule-items'),
  createScheduleItem: POST('/schedule-items'),
  updateScheduleItem: PUT('/schedule-items'),
  deleteScheduleItem: DEL('/schedule-items'),

  searchWorkspace: GET_PARAMS('/search/global'),
  getResearchMapNodes: GET_PARAMS('/research-map/nodes'),
  createResearchMapNode: POST('/research-map/nodes'),
  updateResearchMapNode: PUT('/research-map/nodes'),
  deleteResearchMapNode: DEL('/research-map/nodes'),
  getResearchMapEdges: GET_PARAMS('/research-map/edges'),
  createResearchMapEdge: POST('/research-map/edges'),
  updateResearchMapEdge: PUT('/research-map/edges'),
  deleteResearchMapEdge: DEL('/research-map/edges'),
  getResearchMapSummary: GET_PARAMS('/research-map/summary'),

  getAgileTasks: GET_PARAMS('/tasks'),
  createAgileTask: POST('/tasks'),
  updateAgileTask: PUT('/tasks'),
  deleteAgileTask: DEL('/tasks'),

  getDailyLogs: GET_PARAMS('/daily-logs'),
  createDailyLog: POST('/daily-logs'),
  updateDailyLog: PUT('/daily-logs'),
  deleteDailyLog: DEL('/daily-logs'),

  getRisks: GET_PARAMS('/risks'),
  createRisk: POST('/risks'),
  updateRisk: PUT('/risks'),
  deleteRisk: DEL('/risks'),

  getMilestones: GET_PARAMS('/milestones'),
  createMilestone: POST('/milestones'),
  updateMilestone: PUT('/milestones'),
  deleteMilestone: DEL('/milestones'),

  getLiterature: GET_PARAMS('/literature'),
  createLiterature: POST('/literature'),
  updateLiterature: PUT('/literature'),
  deleteLiterature: DEL('/literature'),
  createCodexJob: (data) => write('/codex/jobs', { method: 'POST', body: JSON.stringify(data) }),
  getCodexJobs: (projectId) => request(`/codex/jobs${projectId ? `?projectId=${projectId}` : ''}`, { cache: false }),
  retryCodexJob: (id) => write(`/codex/jobs/${id}/retry`, { method: 'POST' }),
  getCodexWorkerStatus: () => request('/codex/workers/status', { cache: false }),
  getSystemHealth: () => request('/system/health', { cache: false }),
  getRecoveryBackups: () => request('/system/recovery-backups', { cache: false }),
  createRecoveryBackup: () => write('/system/backup', { method: 'POST' }),
  restoreRecoveryBackup: (file) => write('/system/restore', { method: 'POST', body: (() => { const data = new FormData(); data.append('file', file); return data; })() }),
  downloadRecoveryBackup: async (name) => {
    const res = await fetch(`/api/system/recovery-backups/${encodeURIComponent(name)}`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth-token') || ''}`,
        'X-Tenant-Id': localStorage.getItem('tenant-id') || '',
      },
    });
    if (!res.ok) throw new Error('下载恢复快照失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  },
  getWeeklyReviewSummary: (params = {}) => request(`/codex/weekly-reviews/summary${qs(params)}`, { cache: false }),
  getWeeklyReviews: (params = {}) => request(`/codex/weekly-reviews${qs(params)}`, { cache: false }),
  getWeeklyReview: (id) => request(`/codex/weekly-reviews/${id}`, { cache: false }),
  createWeeklyReview: (data) => write('/codex/weekly-reviews', { method: 'POST', body: JSON.stringify(data) }),
  updateWeeklyReview: (id, data) => write(`/codex/weekly-reviews?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Auth
  localSession: () => write('/auth/local-session', { method: 'POST' }),
  login: (phone, password) => write('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
  loginSms: (phone, code) => write('/auth/login-sms', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  register: (data) => write('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getMe: GET('/auth/me'),
  logout: () => write('/auth/logout', { method: 'POST' }),

  // --- 论文审阅 ---
  uploadPaper: (data) => write('/papers', { method: 'POST', body: JSON.stringify(data) }),
  getPapers: (params = '') => request(`/papers${params ? '?' + params : ''}`),
  getPaper: (id) => request(`/papers/${id}`),
  getPaperFile: (id) => request(`/papers/${id}/file`),
  getPaperReviews: (id) => request(`/papers/${id}/reviews`),
  addPaperReview: (id, data) => write(`/papers/${id}/reviews`, { method: 'POST', body: JSON.stringify(data) }),
  deletePaper: (id) => write(`/papers/${id}`, { method: 'DELETE' }),

  // Tenant
  getMyTenants: () => request('/tenants/my'),
  createTenant: (data) => write('/tenants', { method: 'POST', body: JSON.stringify(data) }),
  getTenant: (id) => request(`/tenants/${id}`),
  updateTenant: (id, data) => write(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  createInvite: (id, data) => write(`/tenants/${id}/invites`, { method: 'POST', body: JSON.stringify(data) }),
  getInvites: (id) => request(`/tenants/${id}/invites`),
  deleteInvite: (tenantId, inviteId) => write(`/tenants/${tenantId}/invites/${inviteId}`, { method: 'DELETE' }),
  joinTenant: (code) => write('/tenants/join', { method: 'POST', body: JSON.stringify({ code }) }),
  updateMemberRole: (tenantId, userId, data) => write(`/tenants/${tenantId}/members/${userId}`, { method: 'PUT', body: JSON.stringify(data) }),
  removeMember: (tenantId, userId) => write(`/tenants/${tenantId}/members/${userId}`, { method: 'DELETE' }),
  leaveTenant: (id) => write(`/tenants/${id}/leave`, { method: 'POST' }),

  // Backup
  downloadBackup: () => fetch('/api/backup', {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('auth-token') || ''}`,
      'X-Tenant-Id': localStorage.getItem('tenant-id') || '',
    }
  }),

  clearCache: () => _cache.clear(),
};

export default api;

// Expose cache clear for tenant switching
if (typeof window !== 'undefined') {
  window.__apiClearCache = () => _cache.clear();
}
