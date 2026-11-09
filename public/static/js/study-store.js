// Local-first study records. Guest mode never writes quiz_attempts to the database.
const REVIEW_KEY = 'ecg-review-v1';
const FAVORITE_KEY = 'ecg-favorites-v1';
const DAY = 86400000;
const WRONG_LOG_LIMIT = 12;
const WRONG_CHOICE_LIMIT = 8;
const REPEAT_LIMIT = 6;
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

function clampText(value, max) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function normalizePicked(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const id = clampText(item.id, 64);
    const name = clampText(item.name, 80);
    const label = clampText(item.label, 4);
    if (!id && !name) return null;
    return {
      ...(id ? { id } : {}),
      name: name || id,
      ...(label ? { label } : {}),
    };
  }).filter(Boolean).slice(0, 6);
}

function sortWrongChoices(choices) {
  return Object.values(choices || {})
    .filter((choice) => choice && typeof choice === 'object' && (choice.name || choice.id))
    .sort((a, b) => (Number(b.count || 0) - Number(a.count || 0)) || (Number(b.lastAt || 0) - Number(a.lastAt || 0)));
}

function trimWrongChoices(entry) {
  const sorted = sortWrongChoices(entry.wrongChoices).slice(0, WRONG_CHOICE_LIMIT);
  entry.wrongChoices = Object.fromEntries(sorted.map((choice) => [choice.id || `name:${choice.name}`, choice]));
}

function trimRepeatWrongs(entry) {
  const entries = Object.entries(entry.repeatWrongs || {});
  entries.sort((a, b) => Number(b[1]?.lastAt || 0) - Number(a[1]?.lastAt || 0));
  entry.repeatWrongs = Object.fromEntries(entries.slice(0, REPEAT_LIMIT));
}

function ensureEntry(reviews, id, names, chapters, now) {
  const entry = reviews[id] || {
    id, name: names[id] || id, chapter: chapters[id] || '',
    wrong: 0, correct: 0, slow: 0, lapses: 0, ease: 2.5, interval: 0, due: now, lastSeen: now,
  };
  entry.name = names[id] || entry.name;
  entry.chapter = chapters[id] || entry.chapter;
  entry.lastSeen = now;
  const choices = entry.wrongChoices && typeof entry.wrongChoices === 'object' && !Array.isArray(entry.wrongChoices) ? entry.wrongChoices : {};
  entry.wrongChoices = Object.fromEntries(Object.entries(choices).filter(([, value]) => value && typeof value === 'object'));
  entry.wrongLog = (Array.isArray(entry.wrongLog) ? entry.wrongLog : []).filter((item) => item && typeof item === 'object');
  const repeats = entry.repeatWrongs && typeof entry.repeatWrongs === 'object' && !Array.isArray(entry.repeatWrongs) ? entry.repeatWrongs : {};
  entry.repeatWrongs = Object.fromEntries(Object.entries(repeats).filter(([, value]) => value && typeof value === 'object'));
  return entry;
}

function recordWrongDetail(entry, attempt, now, source) {
  const key = clampText(attempt.key, 80) || 'attempt';
  const q = clampText(attempt.q, 120);
  const picked = normalizePicked(attempt.picked);
  const correct = normalizePicked(attempt.correct);

  picked.forEach((option) => {
    const choiceKey = option.id || `name:${option.name}`;
    const existing = entry.wrongChoices[choiceKey] || { id: option.id || '', name: option.name, count: 0, lastAt: 0 };
    existing.id = option.id || existing.id;
    existing.name = option.name || existing.name;
    existing.count = Math.min(1000000, Number(existing.count || 0) + 1);
    existing.lastAt = now;
    entry.wrongChoices[choiceKey] = existing;
  });

  const log = entry.wrongLog[entry.wrongLog.length - 1];
  const signature = `${key}|${picked.map((item) => item.name).join(',')}`;
  const lastSignature = log ? `${log.key}|${(log.picked || []).map((item) => item.name).join(',')}` : '';
  if (signature !== lastSignature || Number(log?.at || 0) + 2000 < now) {
    entry.wrongLog.push({
      at: now,
      key,
      ...(q ? { q } : {}),
      ...(source ? { src: source } : {}),
      picked,
      correct,
    });
  }
  entry.wrongLog = entry.wrongLog.slice(-WRONG_LOG_LIMIT);

  const repeat = entry.repeatWrongs[key] || { n: 0, lastAt: 0, picked: [], pickedCounts: {}, q: '' };
  repeat.n = Math.min(1000000, Number(repeat.n || 0) + 1);
  repeat.lastAt = now;
  repeat.q = q || repeat.q || '';
  repeat.pickedCounts = repeat.pickedCounts && typeof repeat.pickedCounts === 'object' ? repeat.pickedCounts : {};
  const pickedNames = picked.map((item) => item.name).filter(Boolean);
  pickedNames.forEach((name) => {
    repeat.pickedCounts[name] = Math.min(1000000, Number(repeat.pickedCounts[name] || 0) + 1);
  });
  repeat.picked = Object.entries(repeat.pickedCounts)
    .sort((a, b) => (Number(b[1]) - Number(a[1])) || String(a[0]).localeCompare(String(b[0])))
    .slice(0, 4)
    .map(([name]) => name);
  entry.repeatWrongs[key] = repeat;
  trimWrongChoices(entry);
  trimRepeatWrongs(entry);
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

export function questionSignature(...parts) {
  const raw = parts.map((part) => (Array.isArray(part) ? [...part].map(String).sort().join('|') : String(part ?? ''))).join('::');
  let hash = 5381;
  for (let index = 0; index < raw.length; index += 1) hash = ((hash * 33) ^ raw.charCodeAt(index)) >>> 0;
  return `q${hash.toString(36)}`;
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

export function recordAttempt({
  correct, slow = false, correctIds = [], selectedIds = [], names = {}, chapters = {},
  source = '', questionKey = '', questionText = '', wrongAttempts = null,
}) {
  const reviews = readReviews();
  const now = Date.now();
  const correctSet = new Set(correctIds.map(String));

  if (correct) {
    correctIds.forEach((rawId) => {
      const id = String(rawId);
      if (!id) return;
      const entry = ensureEntry(reviews, id, names, chapters, now);
      entry.correct += 1;
      if (slow) {
        entry.slow = (entry.slow || 0) + 1;
        entry.interval = 0;
        entry.due = now;
      } else {
        entry.interval = entry.interval > 0 ? Math.min(90, Math.max(1, Math.round(entry.interval * (entry.ease || 2.5)))) : 1;
        entry.due = now + entry.interval * DAY;
      }
      reviews[id] = entry;
    });
    safeWrite(REVIEW_KEY, reviews);
    return reviewSummary();
  }

  const correctOptions = correctIds.map((rawId) => ({ id: String(rawId), name: names[rawId] || String(rawId) }));
  const autoPicked = selectedIds
    .map(String)
    .filter((id) => id && !correctSet.has(id))
    .map((id) => ({ id, name: names[id] || id }));
  const attempts = Array.isArray(wrongAttempts) && wrongAttempts.length
    ? wrongAttempts
    : correctIds.map((rawId) => ({
      entryId: String(rawId),
      key: questionKey,
      q: questionText,
      picked: autoPicked,
      correct: correctOptions,
    }));

  const touched = new Set();
  attempts.forEach((attempt) => {
    if (!attempt || typeof attempt !== 'object') return;
    const id = String(attempt.entryId || '');
    if (!id) return;
    const entry = ensureEntry(reviews, id, names, chapters, now);
    entry.wrong += 1;
    entry.lapses += 1;
    entry.ease = Math.max(1.3, Number(entry.ease || 2.5) - 0.2);
    entry.interval = 0;
    entry.due = now;
    recordWrongDetail(entry, attempt, now, source);
    touched.add(id);
    reviews[id] = entry;
  });

  // Keep the correct diagnosis in the review queue even if the client omitted details.
  correctIds.forEach((rawId) => {
    const id = String(rawId);
    if (!id || touched.has(id)) return;
    const entry = ensureEntry(reviews, id, names, chapters, now);
    entry.wrong += 1;
    entry.lapses += 1;
    entry.ease = Math.max(1.3, Number(entry.ease || 2.5) - 0.2);
    entry.interval = 0;
    entry.due = now;
    recordWrongDetail(entry, { key: questionKey, q: questionText, picked: autoPicked, correct: correctOptions }, now, source);
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

export function wrongChoiceSummary(entry, limit = 3) {
  return sortWrongChoices(entry?.wrongChoices).slice(0, Math.max(1, limit)).map((choice) => ({
    id: choice.id || '',
    name: choice.name || choice.id || '',
    count: Number(choice.count || 0),
    lastAt: Number(choice.lastAt || 0),
  }));
}

export function strongestRepeat(entry) {
  let best = null;
  Object.entries(entry?.repeatWrongs || {}).forEach(([key, value]) => {
    const count = Number(value?.n || 0);
    if (count < 2) return;
    if (!best || count > best.n || (count === best.n && Number(value.lastAt || 0) > Number(best.lastAt || 0))) {
      best = {
        key,
        n: count,
        lastAt: Number(value.lastAt || 0),
        q: String(value.q || ''),
        picked: Array.isArray(value.picked) ? value.picked.slice(0, 4) : [],
      };
    }
  });
  return best;
}

export function mistakeContext(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    name: clampText(entry.name || entry.id, 80),
    chapter: clampText(entry.chapter, 64),
    wrong: Math.max(0, Number(entry.wrong || 0)),
    choices: wrongChoiceSummary(entry, 5).map((choice) => ({ id: choice.id, name: choice.name, count: choice.count })),
    repeat: strongestRepeat(entry),
    history: (Array.isArray(entry.wrongLog) ? entry.wrongLog : []).slice(-5).map((item) => ({
      at: Number(item.at || 0),
      key: clampText(item.key, 80),
      q: clampText(item.q, 120),
      src: clampText(item.src, 16),
      picked: normalizePicked(item.picked),
      correct: normalizePicked(item.correct),
    })),
  };
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

function wrongDetailScore(entry) {
  return Object.keys(entry?.wrongChoices || {}).length
    + (Array.isArray(entry?.wrongLog) ? entry.wrongLog.length : 0)
    + Object.keys(entry?.repeatWrongs || {}).length
    + Number(entry?.wrong || 0) * 2;
}

export function mergeStudyData(remote = {}) {
  const local = snapshotStudy();
  const reviews = { ...local.reviews };
  Object.entries(remote.reviews || {}).forEach(([id, entry]) => {
    if (!entry || typeof entry !== 'object') return;
    const existing = reviews[id];
    if (!existing) {
      reviews[id] = { ...entry, id };
      return;
    }
    if (Number(entry.lastSeen || 0) > Number(existing.lastSeen || 0)) {
      reviews[id] = { ...entry, id };
      return;
    }
    if (wrongDetailScore(entry) > wrongDetailScore(existing)) {
      reviews[id] = {
        ...existing,
        wrong: Math.max(Number(existing.wrong || 0), Number(entry.wrong || 0)),
        lapses: Math.max(Number(existing.lapses || 0), Number(entry.lapses || 0)),
        wrongChoices: entry.wrongChoices || existing.wrongChoices,
        wrongLog: entry.wrongLog || existing.wrongLog,
        repeatWrongs: entry.repeatWrongs || existing.repeatWrongs,
        lastSeen: Math.max(Number(existing.lastSeen || 0), Number(entry.lastSeen || 0)),
      };
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
    version: 2,
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
