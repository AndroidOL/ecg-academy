const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261110ah';
const { api, setCsrf } = await import(`./api.js${__asset}`);

const listeners = (typeof window !== 'undefined' && window.__ECG_STORE_LISTENERS__) || new Set();
if (typeof window !== 'undefined') window.__ECG_STORE_LISTENERS__ = listeners;

const baseStore = {
  user: null,
  app: { name: '心迹 ECG Lab', version: '1.1.0', assetVersion: '1' },
  content: { diagnoses: 0, chapters: 0, quizEligible: 0 },
  ai: { configured: false, allowed: false, mode: 'local', used: 0, dailyLimit: 30, remaining: 30 },
  progress: { read: 0, mastered: 0, total: 0 },
  features: { registrationEnabled: true, userLoginEnabled: true },
  site: { githubUrl: '', license: '', copyright: '', icp: '' },
  localProgress: {},
  localXp: 0,
  chapters: [],
  quiz: { attempts: 0, correct: 0, accuracy: 0, avgScore: 0 },
  sim: { runs: 0, best: 0 },
  leaderboard: [],
  scenarioCount: 0,
  level: null,
  bank: { total: 0, byLevel: { 1: 0, 2: 0, 3: 0 }, byChapter: {} },
  diagnosesCache: null,
  scenariosCache: null,

  setBootstrap(data) {
    this.user = data.user;
    if (data.user?.isGuest) {
      const storedXp = Number(localStorage.getItem('ecg-local-xp') || 0);
      this.localXp = Number.isFinite(storedXp) ? storedXp : 0;
      this.user = { ...data.user, xp: this.localXp };
    }
    setCsrf(data.csrf);
    this.app = data.app || this.app;
    this.content = data.content || this.content;
    this.ai = data.ai || this.ai;
    this.progress = data.progress || this.progress;
    this.chapters = data.chapters || this.chapters;
    this.features = data.features || this.features;
    this.site = data.site || this.site;
    if (data.user?.isGuest) this.syncLocalProgress(data.content?.articles || this.progress.total || 0);
    this.quiz = data.quiz || this.quiz;
    this.sim = data.sim || this.sim;
    this.leaderboard = data.leaderboard || this.leaderboard;
    this.scenarioCount = data.scenarioCount || 0;
    this.bank = data.bank || this.bank;
    this.level = data.level || this.level;
    this.emit('bootstrap', data);
  },

  setUser(user) {
    this.user = user;
    this.emit('user', user);
  },

  setProgress(diagnosisId, status) {
    if (this.user?.isGuest) {
      this.setLocalProgress(diagnosisId, status);
      return;
    }
    this.emit('progress', { diagnosisId, status });
  },

  loadLocalProgress() {
    try {
      const parsed = JSON.parse(localStorage.getItem('ecg-local-progress') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  },

  syncLocalProgress(total = 0) {
    this.localProgress = this.loadLocalProgress();
    const read = Object.keys(this.localProgress).length;
    const mastered = Object.values(this.localProgress).filter((x) => x === 'mastered').length;
    this.progress = { read, mastered, total: total || this.progress.total || 0 };
    return this.progress;
  },

  addLocalXp(amount) {
    if (!this.user?.isGuest) return;
    this.localXp = Math.max(0, (this.localXp || 0) + Math.max(0, Number(amount) || 0));
    try { localStorage.setItem('ecg-local-xp', String(this.localXp)); } catch { /* storage unavailable */ }
    this.user = { ...this.user, xp: this.localXp };
    this.emit('user', this.user);
  },

  applyXp(amount) {
    if (!this.user) return;
    if (this.user.isGuest) {
      const xp = Math.max(0, Number(this.localXp || this.user.xp || 0) + Number(amount || 0));
      this.localXp = xp;
      try { localStorage.setItem('ecg-local-xp', String(xp)); } catch { /* storage unavailable */ }
      this.user = { ...this.user, xp };
      this.emit('user', this.user);
      return;
    }
    const xp = Math.max(0, Number(this.user.xp || 0) + Number(amount || 0));
    this.user = { ...this.user, xp };
    this.level = null;
    this.emit('user', this.user);
  },

  setLocalProgress(diagnosisId, status) {
    this.localProgress = { ...this.localProgress, [diagnosisId]: status };
    try { localStorage.setItem('ecg-local-progress', JSON.stringify(this.localProgress)); } catch { /* storage unavailable */ }
    if (this.diagnosesCache?.items) {
      const item = this.diagnosesCache.items.find((x) => x.id === diagnosisId);
      if (item) item.status = status;
    }
    this.syncLocalProgress(this.content?.articles || this.progress.total || 0);
    this.emit('progress', { diagnosisId, status });
  },

  updateStats(partial) {
    Object.assign(this, partial);
    this.emit('stats', partial);
  },

  async refresh() {
    const data = await api.bootstrap();
    this.setBootstrap(data);
    return data;
  },

  async getDiagnoses(force = false) {
    if (this.diagnosesCache && !force) return this.diagnosesCache;
    const data = await api.diagnoses();
    if (this.user?.isGuest) {
      const local = this.loadLocalProgress();
      data.items = (data.items || []).map((item) => ({ ...item, status: local[item.id] || null }));
      this.syncLocalProgress(this.content?.articles || data.items.length);
    }
    this.diagnosesCache = data;
    if (this.chapters.length === 0) this.chapters = data.chapters || [];
    return data;
  },

  async getScenarios(force = false) {
    if (this.scenariosCache && !force) return this.scenariosCache;
    const data = await api.scenarios();
    this.scenariosCache = data.items || [];
    this.scenarioCount = this.scenariosCache.length;
    return this.scenariosCache;
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  emit(type, payload) {
    listeners.forEach((fn) => {
      try {
        fn(type, payload);
      } catch (error) {
        console.error(error);
      }
    });
  },
};

const existingStore = typeof window !== 'undefined' ? window.__ECG_STORE__ : null;
export const store = existingStore && typeof existingStore === 'object' ? existingStore : baseStore;
if (typeof window !== 'undefined') window.__ECG_STORE__ = store;

export function getThemeMode() {
  return localStorage.getItem('ecg-theme') || document.documentElement.dataset.themeMode || 'auto';
}

function effectiveTheme(mode) {
  if (mode === 'auto') {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export function applyTheme(mode, { persist = true, syncServer = false, lock } = {}) {
  const normalized = ['auto', 'light', 'dark'].includes(mode) ? mode : 'auto';
  const effective = effectiveTheme(normalized);
  if (persist) {
    try {
      if (normalized === 'auto') localStorage.removeItem('ecg-theme-lock');
      else if (lock === true) localStorage.setItem('ecg-theme-lock', '1');
      else if (lock === false) localStorage.removeItem('ecg-theme-lock');
    } catch { /* storage unavailable */ }
  }
  document.documentElement.dataset.theme = effective;
  document.documentElement.dataset.themeMode = normalized;
  document.documentElement.style.colorScheme = effective;
  if (persist) {
    localStorage.setItem('ecg-theme', normalized);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#071417' : '#0e766e');
  store.emit('theme', { mode: normalized, effective });
  if (syncServer && store.user) {
    api.theme(normalized).catch(() => {});
  }
  return effective;
}

export function initTheme() {
  applyTheme(getThemeMode(), { persist: false });
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', () => {
    if (getThemeMode() === 'auto') applyTheme('auto', { persist: false });
  });
  window.addEventListener('storage', (event) => {
    if (event.key === 'ecg-theme') applyTheme(event.newValue || 'auto', { persist: false });
  });
}

export function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  let locked = false;
  try { locked = localStorage.getItem('ecg-theme-lock') === '1'; } catch { /* storage unavailable */ }
  if (locked) return applyTheme(next, { syncServer: true, lock: true });
  const system = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  // 快速切换回到与系统一致的配色时，自动恢复“跟随系统”
  return applyTheme(next === system ? 'auto' : next, { syncServer: true });
}
