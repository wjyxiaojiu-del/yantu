const BASE = '/api';

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
  setLoading(1);
  try {
    const headers = { ...options.headers };
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${url}`, { headers, ...options });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error || `请求失败 (${res.status})`);
    }
    return res.json();
  } finally {
    setLoading(-1);
  }
}

const qs = (params) => {
  const s = new URLSearchParams(params).toString();
  return s ? '?' + s : '';
};

const GET = (path) => () => request(path);
const GET_ID = (path) => (id) => request(`${path}?id=${id}`);
const GET_PARAMS = (path) => (params = {}) => request(`${path}${qs(params)}`);
const POST = (path) => (data) => request(path, { method: 'POST', body: JSON.stringify(data) });
const PUT = (path) => (id, data) => request(`${path}?id=${id}`, { method: 'PUT', body: JSON.stringify(data) });
const DEL = (path) => (id) => request(`${path}?id=${id}`, { method: 'DELETE' });

const api = {
  // Dashboard
  getDashboard: GET('/mentor/dashboard'),
  seed: () => request('/mentor/seed', { method: 'POST' }),

  // Students
  getStudents: GET('/mentor/students'),
  getStudent: (id) => request(`/mentor/students/${id}`),
  createStudent: POST('/mentor/students'),
  updateStudent: (id, data) => request(`/mentor/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStudent: (id) => request(`/mentor/students/${id}`, { method: 'DELETE' }),

  // Tasks
  getTasks: GET_PARAMS('/mentor/tasks'),
  createTask: POST('/mentor/tasks'),
  updateTask: (id, data) => request(`/mentor/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id) => request(`/mentor/tasks/${id}`, { method: 'DELETE' }),

  // Reviews
  getReviews: GET('/mentor/reviews'),
  createReview: POST('/mentor/reviews'),
  updateReview: (id, data) => request(`/mentor/reviews/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReview: (id) => request(`/mentor/reviews/${id}`, { method: 'DELETE' }),

  // Meetings
  getMeetings: GET('/mentor/meetings'),
  createMeeting: POST('/mentor/meetings'),
  updateMeeting: (id, data) => request(`/mentor/meetings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMeeting: (id) => request(`/mentor/meetings/${id}`, { method: 'DELETE' }),

  // Achievements
  getAchievements: GET_PARAMS('/mentor/achievements'),
  createAchievement: POST('/mentor/achievements'),
  updateAchievement: (id, data) => request(`/mentor/achievements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAchievement: (id) => request(`/mentor/achievements/${id}`, { method: 'DELETE' }),

  // Notifications
  getNotifications: GET_PARAMS('/mentor/notifications'),
  getUnreadCount: GET_PARAMS('/mentor/notifications/unread-count'),
  markNotificationRead: (id) => request(`/mentor/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: (params = {}) => request(`/mentor/notifications/mark-all-read${qs(params)}`, { method: 'POST' }),
  deleteNotification: (id) => request(`/mentor/notifications/${id}`, { method: 'DELETE' }),

  // Calendar
  getCalendar: GET_PARAMS('/mentor/calendar'),

  // Attendance
  checkIn: POST('/mentor/attendance/check-in'),
  checkOut: POST('/mentor/attendance/check-out'),
  getAttendance: GET_PARAMS('/mentor/attendance'),
  getAttendanceStats: GET_PARAMS('/mentor/attendance/stats'),

  // Files
  uploadFile: (formData) => request('/mentor/files/upload', { method: 'POST', body: formData }),
  getFiles: GET_PARAMS('/mentor/files'),
  downloadFile: (id) => `/api/mentor/files/${id}/download`,
  updateFile: (id, data) => request(`/mentor/files/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFile: (id) => request(`/mentor/files/${id}`, { method: 'DELETE' }),

  // Activity Logs
  getActivityLogs: GET_PARAMS('/mentor/activity-logs'),
  createActivityLog: POST('/mentor/activity-logs'),

  // Task Comments
  getTaskComments: (id) => request(`/mentor/tasks/${id}/comments`),
  createTaskComment: (id, data) => request(`/mentor/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify(data) }),
  deleteTaskComment: (id, cid) => request(`/mentor/tasks/${id}/comments/${cid}`, { method: 'DELETE' }),

  // Student-Project Links
  getStudentProjects: (id) => request(`/mentor/students/${id}/projects`),
  linkStudentProject: (id, data) => request(`/mentor/students/${id}/projects`, { method: 'POST', body: JSON.stringify(data) }),
  unlinkStudentProject: (studentId, linkId) => request(`/mentor/students/${studentId}/projects/${linkId}`, { method: 'DELETE' }),

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
  login: (phone, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
  loginSms: (phone, code) => request('/auth/login-sms', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  getMe: GET('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // Backup
  downloadBackup: () => fetch('/api/backup', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth-token') || ''}` }
  }),
};

export default api;
