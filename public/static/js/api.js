export class ApiError extends Error {
  constructor(message, status = 0, code = 'error', details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const tokenState = (typeof window !== 'undefined' && window.__ECG_API_TOKEN__) || { value: '' };
if (typeof window !== 'undefined') window.__ECG_API_TOKEN__ = tokenState;

export function setCsrf(token) {
  tokenState.value = token || '';
}

export function getCsrf() {
  return tokenState.value;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ApiError('服务器返回了无法解析的数据', response.status, 'bad_response');
  }
}

async function bootstrapToken() {
  const res = await fetch('/api/bootstrap', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  const data = await parseResponse(res);
  if (!res.ok || !data?.ok) throw new ApiError('会话初始化失败', res.status, 'bootstrap_failed');
  setCsrf(data.data.csrf);
  return data.data;
}

async function request(path, { method = 'GET', body, retry = true } = {}) {
  const headers = { Accept: 'application/json' };
  const init = { method, credentials: 'same-origin', headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    if (tokenState.value) headers['X-CSRF-Token'] = tokenState.value;
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    throw new ApiError('网络连接失败，请检查网络后重试', 0, 'network');
  }
  const data = await parseResponse(response);
  if (response.status === 419 && retry) {
    await bootstrapToken();
    return request(path, { method, body, retry: false });
  }
  if (!response.ok || data?.ok === false) {
    const err = data?.error || {};
    throw new ApiError(err.message || `请求失败（${response.status}）`, response.status, err.code || 'request_failed', err.details || null);
  }
  return data?.data ?? null;
}

function qs(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) search.set(key, value.join(','));
    else search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  bootstrap: async () => {
    const data = await bootstrapToken();
    return data;
  },
  diagnoses: (params = {}) => request(`/api/diagnoses${qs(params)}`),
  diagnosis: (id) => request(`/api/diagnoses/${encodeURIComponent(id)}`),
  progress: (diagnosisId, status = 'read') => request('/api/progress', { method: 'POST', body: { diagnosisId, status } }),
  quizNew: (params = {}) => request(`/api/quiz/new${qs(params)}`),
  quizAnswer: (attemptId, selected, timeMs) => request('/api/quiz/answer', { method: 'POST', body: { attemptId, selected, timeMs } }),
  quizHistory: () => request('/api/quiz/history'),
  stats: (scope = 'week') => request(`/api/stats${qs({ scope })}`),
  leaderboard: (scope = 'week') => request(`/api/leaderboard${qs({ scope })}`),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: {} }),
  theme: (theme) => request('/api/theme', { method: 'POST', body: { theme } }),
  scenarios: () => request('/api/sim/scenarios'),
  simStart: (scenarioId) => request('/api/sim/start', { method: 'POST', body: { scenarioId } }),
  simState: (id) => request(`/api/sim/state${qs({ id })}`),
  simAction: (sessionId, action, payload = {}) => request('/api/sim/action', { method: 'POST', body: { sessionId, action, payload } }),
  simDebrief: (runId) => request(`/api/sim/debrief${qs({ runId })}`),
  adminAuthConfig: () => request('/api/admin/auth-config'),
  adminLogin: (payload) => request('/api/admin/login', { method: 'POST', body: payload }),
  adminPasskeyLoginOptions: () => request('/api/admin/passkey/login/options'),
  adminPasskeyLogin: (credential) => request('/api/admin/passkey/login', { method: 'POST', body: { credential } }),
  adminLogout: () => request('/api/admin/logout', { method: 'POST', body: {} }),
  adminSession: () => request('/api/admin/session'),
  adminSaveSettings: (payload) => request('/api/admin/settings', { method: 'POST', body: payload }),
  adminUsers: (params = {}) => request(`/api/admin/users${qs(params)}`),
  adminUpdateUser: (payload) => request('/api/admin/user', { method: 'POST', body: payload }),
  adminPasskeyOptions: () => request('/api/admin/passkey/options'),
  adminPasskeyRegister: (payload) => request('/api/admin/passkey/register', { method: 'POST', body: payload }),
  adminPasskeyDelete: (id) => request('/api/admin/passkey/delete', { method: 'POST', body: { id } }),
  adminProviderSave: (provider) => request('/api/admin/ai/provider', { method: 'POST', body: { provider } }),
  adminProviderDelete: (id) => request('/api/admin/ai/provider/delete', { method: 'POST', body: { id } }),
  adminAiTest: (id) => request('/api/admin/ai/test', { method: 'POST', body: { id } }),
  adminAudit: () => request('/api/admin/audit'),
  aiStatus: () => request('/api/ai/status'),
  aiChat: (message, diagnosisId) => request('/api/ai/chat', { method: 'POST', body: { message, diagnosisId } }),
  aiExplain: (attemptId) => request('/api/ai/explain', { method: 'POST', body: { attemptId } }),
  aiStudyPlan: () => request('/api/ai/study-plan', { method: 'POST', body: {} }),
  aiSimReview: (runId) => request('/api/ai/sim-review', { method: 'POST', body: { runId } }),
};
