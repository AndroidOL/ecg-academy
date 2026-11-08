// Local-first study records. Guest mode never writes quiz_attempts to the database.
const REVIEW_KEY = 'ecg-review-v1';
const FAVORITE_KEY = 'ecg-favorites-v1';
const DAY = 86400000;
const listeners = typeof window !== 'undefined' ? new Set() : new Set();

function safeRead(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / private mode */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ecg-study-change'));
}

function readReviews() {
  const value = safeRead(REVIEW_KEY, {});
  return value && !Array.isArray(value) ? value : {};
}

function readFavorites() {
  const value = safeRead(FAVORITE_KEY, {});
  return value && !Array.isArray(value) ? value : {};
}

export function deviceId() {
  const key = 'ecg-device-id';
  try {
    const existing = localStorage.getItem(key);
    if (existing && /^[a-f0-9-]{16,64}$/i.test(existing)) return existing;
    const generated = (globalThis.crypto?.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`)
      .replace(/[^a-f0-9-]/gi, '').slice(0, 64);
    localStorage.setItem(key, generated);
    return generated;
  } catch {
    return `dev-${Date.now()}`;
  }
}

export function reviewEntries() {
  return Object.values(readReviews()).map((entry) => ({ ...entry }));
}

export function favoriteEntries() {
  return Object.values(readFavorites()).map((entry) => ({ ...entry }));
}

export function isFavorite(id) {
  return Boolean(readFavorites()[id]);
}

export function toggleFavorite(meta = {}) {
  const id = String(meta.id || '');
  if (!id) return false;
  const favorites = readFavorites();
  if (favorites[id]) delete favorites[id];
  else favorites[id] = { id, name: String(meta.name || id), chapter: String(meta.chapter || ''), addedAt: Date.now() };
  safeWrite(FAVORITE_KEY, favorites);
  return Boolean(favorites[id]);
}

export function recordAttempt({ correct, slow = false, correctIds = [], selectedIds = [], names = {}, chapters = {} }) {
  const reviews = readReviews();
  const now = Date.now();
  const correctSet = new Set(correctIds.map(String));
  const touched = new Set([...correctIds, ...selectedIds].map(String).filter(Boolean));
  touched.forEach((id) => {
    const entry = reviews[id] || {
      id, name: names[id] || id, chapter: chapters[id] || '',
      wrong: 0, correct: 0, slow: 0, lapses: 0, ease: 2.5, interval: 0, due: now, lastSeen: now,
    };
    entry.name = names[id] || entry.name;
    entry.chapter = chapters[id] || entry.chapter;
    entry.lastSeen = now;
    if (correct && correctSet.has(id)) {
      entry.correct += 1;
      if (slow) {
        entry.slow = (entry.slow || 0) + 1;
        entry.interval = 0;
        entry.due = now;
      } else {
        entry.interval = entry.interval > 0 ? Math.min(90, Math.max(1, Math.round(entry.interval * (entry.ease || 2.5)))) : 1;
        entry.due = now + entry.interval * DAY;
      }
    } else {
      entry.wrong += 1;
      entry.lapses += 1;
      entry.ease = Math.max(1.3, Number(entry.ease || 2.5) - 0.2);
      entry.interval = 0;
      entry.due = now;
    }
    reviews[id] = entry;
  });
  safeWrite(REVIEW_KEY, reviews);
  return reviewSummary();
}

export function rateReview(id, rating) {
  const reviews = readReviews();
  const entry = reviews[String(id)];
  if (!entry) return;
  const now = Date.now();
  const score = Number(rating);
  if (score <= 0) {
    entry.wrong += 1;
    entry.lapses += 1;
    entry.ease = Math.max(1.3, Number(entry.ease || 2.5) - 0.2);
    entry.interval = 0;
    entry.due = now;
  } else if (score === 1) {
    entry.correct += 1;
    entry.interval = Math.max(1, Math.round((entry.interval || 1) * 1.2));
    entry.due = now + entry.interval * DAY;
  } else if (score === 2) {
    entry.correct += 1;
    entry.interval = Math.max(1, Math.round((entry.interval || 1) * (entry.ease || 2.5)));
    entry.due = now + entry.interval * DAY;
  } else {
    entry.correct += 1;
    entry.ease = Math.min(3.2, Number(entry.ease || 2.5) + 0.15);
    entry.interval = Math.max(2, Math.round((entry.interval || 1) * 3.2));
    entry.due = now + entry.interval * DAY;
  }
  entry.lastSeen = now;
  safeWrite(REVIEW_KEY, reviews);
  return entry;
}

export function reviewSummary() {
  const entries = reviewEntries();
  const now = Date.now();
  const due = entries.filter((entry) => Number(entry.due || 0) <= now).length;
  const wrong = entries.filter((entry) => Number(entry.wrong || 0) > 0).length;
  return { total: entries.length, due, wrong, favorites: favoriteEntries().length };
}

export function dueReviews(limit = 20) {
  const now = Date.now();
  return reviewEntries()
    .filter((entry) => Number(entry.due || 0) <= now)
    .sort((a, b) => (Number(a.due || 0) - Number(b.due || 0)) || (Number(b.wrong || 0) - Number(a.wrong || 0)))
    .slice(0, Math.max(1, limit));
}

export function wrongReviews(limit = 100) {
  return reviewEntries()
    .filter((entry) => Number(entry.wrong || 0) > 0)
    .sort((a, b) => (Number(b.wrong || 0) - Number(a.wrong || 0)) || (Number(b.lastSeen || 0) - Number(a.lastSeen || 0)))
    .slice(0, Math.max(1, limit));
}

export function weakDiagnosisIds(limit = 8) {
  const now = Date.now();
  return dueReviews(100)
    .concat(wrongReviews(100))
    .filter((entry, index, list) => list.findIndex((item) => item.id === entry.id) === index)
    .sort((a, b) => {
      const score = (entry) => (Number(entry.due || 0) <= now ? 20 : 0) + Number(entry.wrong || 0) * 3 - Number(entry.correct || 0);
      return score(b) - score(a);
    })
    .slice(0, limit)
    .map((entry) => entry.id);
}

export function clearLocalStudyData() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(REVIEW_KEY);
  localStorage.removeItem(FAVORITE_KEY);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ecg-study-change'));
}

export function snapshotStudy() {
  return { reviews: readReviews(), favorites: readFavorites() };
}

export function mergeStudyData(remote = {}) {
  const local = snapshotStudy();
  const reviews = { ...local.reviews };
  Object.entries(remote.reviews || {}).forEach(([id, entry]) => {
    if (!entry || typeof entry !== 'object') return;
    const existing = reviews[id];
    if (!existing || Number(entry.lastSeen || 0) > Number(existing.lastSeen || 0)) {
      reviews[id] = { ...entry, id };
    }
  });
  const favorites = { ...local.favorites };
  Object.entries(remote.favorites || {}).forEach(([id, entry]) => {
    if (!entry || typeof entry !== 'object') return;
    const existing = favorites[id];
    if (!existing || Number(entry.addedAt || 0) > Number(existing.addedAt || 0)) {
      favorites[id] = { ...entry, id };
    }
  });
  safeWrite(REVIEW_KEY, reviews);
  safeWrite(FAVORITE_KEY, favorites);
  return { reviews, favorites };
}

export function exportStudyData() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    reviews: readReviews(),
    favorites: readFavorites(),
  };
}

export function importStudyData(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.reviews && typeof data.reviews === 'object') safeWrite(REVIEW_KEY, data.reviews);
  if (data.favorites && typeof data.favorites === 'object') safeWrite(FAVORITE_KEY, data.favorites);
  return true;
}

export function onStudyChange(fn) {
  listeners.add(fn);
  if (typeof window !== 'undefined') window.addEventListener('ecg-study-change', fn);
  return () => {
    listeners.delete(fn);
    if (typeof window !== 'undefined') window.removeEventListener('ecg-study-change', fn);
  };
}
