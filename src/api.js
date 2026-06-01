const BASE = '/api';

// GET 请求内存缓存：相同 URL 在 TTL 内直接复用响应，避免页面切换时重复请求
const _cache = new Map();
const _inflight = new Map();
const CACHE_TTL = 60_000; // 60秒

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
  const isGet = !options.method || options.method === 'GET';
  const fullUrl = `${BASE}${url}`;

  // GET 请求走缓存
  if (isGet) {
    const cached = _cache.get(fullUrl);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
    // 相同 URL 正在请求中，复用 Promise 避免重复发送
    if (_inflight.has(fullUrl)) return _inflight.get(fullUrl);
  }

  setLoading(1);
  const p = (async () => {
    try {
      const headers = { ...options.headers };
      if (!(options.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenant-id') : null;
      if (tenantId) headers['X-Tenant-Id'] = tenantId;
      const res = await fetch(fullUrl, { headers, ...options });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // 401 全局处理：清除 token 并通知应用层跳转
        if (res.status === 401 && typeof window !== 'undefined') {
          localStorage.removeItem('auth-token');
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
        throw new ApiError(res.status, body.error || `请求失败 (${res.status})`);
      }
      const data = await res.json();
      if (isGet) _cache.set(fullUrl, { data, ts: Date.now() });
      return data;
    } finally {
      setLoading(-1);
      if (isGet) _inflight.delete(fullUrl);
    }
  })();

  if (isGet) _inflight.set(fullUrl, p);
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

  // Calendar
  getCalendar: GET_PARAMS('/mentor/calendar'),

  // Attendance
  checkIn: POST('/mentor/attendance/check-in'),
  checkOut: POST('/mentor/attendance/check-out'),
  getAttendance: GET_PARAMS('/mentor/attendance'),
  getAttendanceStats: GET_PARAMS('/mentor/attendance/stats'),

  // CSV export (returns full URL; use Authorization header via fetch)
  exportStudentsCsvUrl: '/api/mentor/export/students.csv',
  exportTasksCsvUrl: '/api/mentor/export/tasks.csv',
  exportAchievementsCsvUrl: '/api/mentor/export/achievements.csv',
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
  getAgileProjectSprints: (id) => request(`/agile/projects/${id}/sprints`),
  getAgileProjectStories: (id) => request(`/agile/projects/${id}/stories`),

  // Agile Native APIs
  getProjects: GET('/projects'),
  getProject: GET_ID('/projects'),
  getProjectStats: (id) => request(`/projects?id=${id}&action=stats`),

  getStories: GET_PARAMS('/stories'),
  createStory: POST('/stories'),
  updateStory: PUT('/stories'),
  deleteStory: DEL('/stories'),

  getSprints: GET_PARAMS('/sprints'),
  getSprint: GET_ID('/sprints'),
  getSprintStats: (id) => request(`/sprints?id=${id}&action=stats`),
  createSprint: POST('/sprints'),
  updateSprint: PUT('/sprints'),
  deleteSprint: DEL('/sprints'),

  getStandups: GET_PARAMS('/standups'),
  createStandup: POST('/standups'),
  updateStandup: PUT('/standups'),
  deleteStandup: DEL('/standups'),

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

  // Auth
  login: (phone, password) => write('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
  loginSms: (phone, code) => write('/auth/login-sms', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  register: (data) => write('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getMe: GET('/auth/me'),
  logout: () => write('/auth/logout', { method: 'POST' }),

  // Reports
  getReportDashboard: () => request('/reports/dashboard'),
  getStudentReport: (id) => request(`/reports/student/${id}`),

  // Weekly Reports
  getWeeklyReports: (params = {}) => request(`/weekly-reports${qs(params)}`),
  getWeeklyReportStats: (params = {}) => request(`/weekly-reports/stats${qs(params)}`),
  getWeeklyReport: (id) => request(`/weekly-reports/${id}`),
  generateWeeklyReport: (data) => write('/weekly-reports/generate', { method: 'POST', body: JSON.stringify(data) }),
  submitWeeklyReport: (id) => write(`/weekly-reports/${id}/submit`, { method: 'PUT' }),
  deleteWeeklyReport: (id) => write(`/weekly-reports/${id}`, { method: 'DELETE' }),

  // Growth
  getGrowthStudents: () => request('/growth/students'),
  getGrowthStudent: (id) => request(`/growth/student/${id}`),

  // --- 论文审阅 ---
  uploadPaper: (data) => write('/papers', { method: 'POST', body: JSON.stringify(data) }),
  getPapers: (params = '') => request(`/papers${params ? '?' + params : ''}`),
  getPaper: (id) => request(`/papers/${id}`),
  getPaperFile: (id) => request(`/papers/${id}/file`),
  getPaperReviews: (id) => request(`/papers/${id}/reviews`),
  addPaperReview: (id, data) => write(`/papers/${id}/reviews`, { method: 'POST', body: JSON.stringify(data) }),
  analyzePaper: (id) => write(`/papers/${id}/analyze`, { method: 'POST' }),
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
    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth-token') || ''}` }
  }),

  clearCache: () => _cache.clear(),
};

export default api;

// Expose cache clear for tenant switching
if (typeof window !== 'undefined') {
  window.__apiClearCache = () => _cache.clear();
}
