import { api, setCsrf } from './api.js';

const listeners = new Set();

export const store = {
  user: null,
  app: { name: '心迹 ECG Lab', version: '1.0.0', assetVersion: '1' },
  content: { diagnoses: 0, chapters: 0, quizEligible: 0 },
  ai: { configured: false, mode: 'local', used: 0, dailyLimit: 30, remaining: 30 },
  progress: { read: 0, mastered: 0, total: 0 },
  chapters: [],
  quiz: { attempts: 0, correct: 0, accuracy: 0, avgScore: 0 },
  sim: { runs: 0, best: 0 },
  leaderboard: [],
  scenarioCount: 0,
  diagnosesCache: null,
  scenariosCache: null,

  setBootstrap(data) {
    this.user = data.user;
    setCsrf(data.csrf);
    this.app = data.app || this.app;
    this.content = data.content || this.content;
    this.ai = data.ai || this.ai;
    this.progress = data.progress || this.progress;
    this.chapters = data.chapters || this.chapters;
    this.quiz = data.quiz || this.quiz;
    this.sim = data.sim || this.sim;
    this.leaderboard = data.leaderboard || this.leaderboard;
    this.scenarioCount = data.scenarioCount || 0;
    this.emit('bootstrap', data);
  },

  setUser(user) {
    this.user = user;
    this.emit('user', user);
  },

  setProgress(diagnosisId, status) {
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

export function getThemeMode() {
  return localStorage.getItem('ecg-theme') || document.documentElement.dataset.themeMode || 'auto';
}

function effectiveTheme(mode) {
  if (mode === 'auto') {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export function applyTheme(mode, { persist = true, syncServer = false } = {}) {
  const normalized = ['auto', 'light', 'dark'].includes(mode) ? mode : 'auto';
  const effective = effectiveTheme(normalized);
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
  return applyTheme(current === 'dark' ? 'light' : 'dark', { syncServer: true });
}
