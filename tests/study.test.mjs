import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
globalThis.localStorage = local;
globalThis.sessionStorage = session;
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const study = await import('../public/static/js/study-store.js');
const byok = await import('../public/static/js/byok.js');

let passed = 0;
function check(name, fn) {
  try { local.clear(); fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('FAIL  ' + name + ': ' + error.message); process.exitCode = 1; }
}

const entryOf = (id) => study.reviewEntries().find((entry) => entry.id === id);

check('wrong answer keeps the correct diagnosis and records what the user picked', () => {
  study.recordAttempt({
    correct: false,
    correctIds: ['afib'],
    selectedIds: ['svt'],
    names: { afib: '心房颤动', svt: '室上速' },
    chapters: { afib: 'tachy', svt: 'tachy' },
    source: 'practice',
    questionKey: 'q-demo',
    questionText: '该心电图最可能的诊断是？',
  });
  const summary = study.reviewSummary();
  assert.equal(summary.wrong, 1);
  assert.equal(summary.due, 1);
  assert.ok(study.weakDiagnosisIds(5).includes('afib'));
  assert.equal(entryOf('svt'), undefined);
  const entry = entryOf('afib');
  assert.equal(entry.wrong, 1);
  assert.equal(entry.wrongChoices.svt.name, '室上速');
  assert.equal(entry.wrongChoices.svt.count, 1);
  assert.equal(entry.wrongLog.length, 1);
  assert.equal(entry.wrongLog[0].picked[0].id, 'svt');
  assert.equal(entry.wrongLog[0].picked[0].name, '室上速');
  assert.equal(entry.wrongLog[0].key, 'q-demo');
  assert.equal(entry.wrongLog[0].src, 'practice');
});

check('wrong choices are recovered from the recent log when the map is missing', () => {
  study.recordAttempt({
    correct: false,
    correctIds: ['afib'],
    selectedIds: ['svt'],
    names: { afib: '心房颤动', svt: '室上速' },
    chapters: { afib: 'tachy', svt: 'tachy' },
    source: 'practice',
    questionKey: 'q-recover',
    questionText: '恢复错选项测试',
  });
  const stored = JSON.parse(local.getItem('ecg-review-v1'));
  delete stored.afib.wrongChoices;
  local.setItem('ecg-review-v1', JSON.stringify(stored));
  const entry = entryOf('afib');
  const summary = study.wrongChoiceSummary(entry, 5);
  assert.equal(summary[0].name, '室上速');
  const context = study.mistakeContext(entry);
  assert.equal(context.choices[0].name, '室上速');
});

check('server merge keeps local wrong details when the remote snapshot is sparse', () => {
  study.recordAttempt({
    correct: false,
    correctIds: ['afib'],
    selectedIds: ['svt'],
    names: { afib: '心房颤动', svt: '室上速' },
    chapters: { afib: 'tachy', svt: 'tachy' },
    source: 'practice',
    questionKey: 'q-merge',
  });
  const localEntry = entryOf('afib');
  study.mergeStudyData({
    reviews: {
      afib: {
        ...localEntry,
        wrongChoices: {},
        wrongLog: [],
        repeatWrongs: {},
        lastSeen: Number(localEntry.lastSeen || 0) + 1000,
      },
    },
    favorites: {},
  });
  const merged = entryOf('afib');
  assert.equal(merged.wrongChoices.svt.name, '室上速');
  assert.equal(merged.wrongLog[0].picked[0].name, '室上速');
});

check('repeated wrong answers on the same question are counted per question', () => {
  const base = {
    correct: false,
    correctIds: ['afib'],
    selectedIds: ['svt'],
    names: { afib: '心房颤动', svt: '室上速' },
    chapters: { afib: 'tachy', svt: 'tachy' },
    source: 'practice',
    questionKey: 'q-repeat',
    questionText: '同一道心电图题',
  };
  study.recordAttempt(base);
  study.recordAttempt(base);
  study.recordAttempt({ ...base, selectedIds: ['atrial-tachy'], names: { ...base.names, 'atrial-tachy': '房性心动过速' } });
  const entry = entryOf('afib');
  assert.equal(entry.wrong, 3);
  assert.equal(entry.wrongChoices.svt.count, 2);
  assert.equal(entry.wrongChoices['atrial-tachy'].count, 1);
  const repeat = study.strongestRepeat(entry);
  assert.equal(repeat.n, 3);
  assert.equal(repeat.key, 'q-repeat');
  assert.ok(repeat.picked.includes('室上速'));
  const context = study.mistakeContext(entry);
  assert.equal(context.choices[0].name, '室上速');
  assert.equal(context.repeat.n, 3);
  assert.ok(context.history.length >= 2, `history length ${context.history.length}`);
});

check('confusion pairs aggregate the most frequent wrong choice per diagnosis', () => {
  const attempt = (selected) => study.recordAttempt({
    correct: false,
    correctIds: ['afib'],
    selectedIds: [selected],
    names: { afib: '心房颤动', svt: '室上速', 'atrial-tachy': '房性心动过速' },
    chapters: { afib: 'tachy' },
    source: 'practice',
    questionKey: 'q-confusion',
  });
  attempt('svt'); attempt('svt'); attempt('atrial-tachy');
  const pairs = study.wrongConfusionPairs(5);
  assert.equal(pairs[0].correctId, 'afib');
  assert.equal(pairs[0].wrongId, 'svt');
  assert.equal(pairs[0].count, 2);
  assert.equal(pairs[1].wrongId, 'atrial-tachy');
});

check('wrong entries group by chapter for the AI tutor', () => {
  const groups = study.groupReviewsByChapter([
    { id: 'a', chapter: 'tachy' },
    { id: 'b', chapter: 'tachy' },
    { id: 'c', chapter: 'block' },
    { id: 'd' },
  ]);
  assert.equal(groups.length, 3);
  assert.equal(groups.find((group) => group.id === 'tachy').items.length, 2);
  assert.equal(groups.find((group) => group.id === 'block').items.length, 1);
  assert.equal(groups.find((group) => group.id === 'uncategorized').items.length, 1);
});

check('exam-style attempts record option text and labels without catalog ids', () => {
  study.recordAttempt({
    correct: false,
    correctIds: ['hyperkalemia'],
    selectedIds: [],
    names: { hyperkalemia: '高钾血症' },
    chapters: { hyperkalemia: 'electrolyte' },
    source: 'exam',
    wrongAttempts: [{
      entryId: 'hyperkalemia',
      key: 'exam:42',
      q: '按本站课程，以下哪项最符合？',
      picked: [{ name: '低钾血症', label: 'B' }],
      correct: [{ name: '高钾血症', label: 'C' }],
    }],
  });
  const entry = entryOf('hyperkalemia');
  assert.equal(entry.wrong, 1);
  assert.equal(entry.wrongChoices['name:低钾血症'].count, 1);
  assert.equal(entry.wrongLog[0].picked[0].label, 'B');
  assert.equal(entry.wrongLog[0].correct[0].label, 'C');
});

check('question signatures are stable and ignore option order', () => {
  const first = study.questionSignature(['a', 'b', 'c'], ['x']);
  const second = study.questionSignature(['c', 'a', 'b'], ['x']);
  assert.equal(first, second);
  assert.notEqual(first, study.questionSignature(['a', 'b'], ['x']));
});

check('self rating moves entry into the future and increases interval', () => {
  study.recordAttempt({ correct: false, correctIds: ['afib'], selectedIds: ['svt'], names: { afib: '心房颤动', svt: '室上速' }, chapters: { afib: 'tachy' } });
  const entry = study.rateReview('afib', 2);
  assert.ok(entry.interval >= 1);
  assert.ok(entry.due > Date.now());
  const due = study.dueReviews(10).map((item) => item.id);
  assert.ok(!due.includes('afib'));
});

check('favorites toggle and export/import round-trip keeps wrong selections', () => {
  study.recordAttempt({ correct: false, correctIds: ['afib'], selectedIds: ['svt'], names: { afib: '心房颤动', svt: '室上速' }, chapters: { afib: 'tachy' } });
  assert.equal(study.toggleFavorite({ id: 'afib', name: '心房颤动', chapter: 'tachy' }), true);
  assert.equal(study.isFavorite('afib'), true);
  const data = study.exportStudyData();
  assert.equal(data.version, 3);
  assert.equal(data.reviews.afib.wrongChoices.svt.count, 1);
  local.clear();
  assert.equal(study.importStudyData(data), true);
  assert.equal(study.isFavorite('afib'), true);
  assert.equal(entryOf('afib').wrongChoices.svt.name, '室上速');
});

check('weekly report aggregates local attempts and weak chapters', () => {
  study.recordAttempt({ correct: true, correctIds: ['x'], names: { x: '正常窦性心律' }, chapters: { x: 'foundation' } });
  study.recordAttempt({ correct: false, correctIds: ['afib'], selectedIds: ['svt'], names: { afib: '心房颤动', svt: '室上速' }, chapters: { afib: 'tachy', svt: 'tachy' } });
  const report = study.weeklyReport(7);
  assert.equal(report.attempts, 2);
  assert.equal(report.correct, 1);
  assert.equal(report.wrong, 1);
  assert.equal(report.accuracy, 50);
  assert.equal(report.byDay.length, 7);
  assert.equal(report.weakChapters[0].chapter, 'tachy');
});

check('merge keeps newer reviews and unions favorites', () => {
  local.clear();
  study.toggleFavorite({ id: 'keep', name: '保留收藏', chapter: 'tachy' });
  study.recordAttempt({ correct: true, correctIds: ['x'], names: { x: '本地记录' }, chapters: { x: 'tachy' } });
  const base = study.snapshotStudy().reviews.x;
  study.mergeStudyData({
    reviews: {
      x: {
        ...base,
        name: '远程旧记录',
        lastSeen: (base.lastSeen || 0) - 5000,
        wrong: 2,
        wrongChoices: { svt: { id: 'svt', name: '室上速', count: 2, lastAt: 1 } },
        wrongLog: [{ at: 1, key: 'q1', picked: [{ id: 'svt', name: '室上速' }] }],
        repeatWrongs: { q1: { n: 2, lastAt: 1, picked: ['室上速'] } },
      },
      y: { id: 'y', name: '远程新增', chapter: 'tachy', lastSeen: 10 },
    },
    favorites: { f: { id: 'f', name: '远程收藏', chapter: 'tachy', addedAt: 10 } },
  });
  let snap = study.snapshotStudy();
  assert.equal(snap.reviews.x.name, '本地记录');
  assert.equal(snap.reviews.x.wrongChoices.svt.count, 2);
  assert.equal(snap.reviews.x.wrong, 2);
  assert.ok(snap.reviews.y);
  assert.ok(snap.favorites.f);
  assert.ok(snap.favorites.keep);
  study.mergeStudyData({ reviews: { x: { ...base, name: '远程新记录', lastSeen: (base.lastSeen || 0) + 5000 } }, favorites: {} });
  snap = study.snapshotStudy();
  assert.equal(snap.reviews.x.name, '远程新记录');
});

check('BYOK supports session/persistent local storage, validation and clearing', () => {
  assert.equal(byok.setByok({ baseUrl: 'https://api.example.com/v1', model: 'demo', apiKey: 'sk-test-1234' }), true);
  assert.equal(byok.hasByok(), true);
  assert.equal(local.getItem('ecg-byok-v1'), null);
  assert.ok(session.getItem('ecg-byok-v1'));
  assert.equal(byok.isRemembered(), false);
  byok.clearByok();
  assert.equal(byok.hasByok(), false);
  assert.equal(byok.setByok({ baseUrl: 'http://insecure.example.com/v1', model: 'demo', apiKey: 'sk-test-1234' }, { remember: true }), false);
  assert.equal(byok.setByok({ baseUrl: 'https://api.example.com/v1', model: 'demo', apiKey: 'sk-test-1234' }, { remember: true }), true);
  assert.equal(byok.isRemembered(), true);
  assert.equal(session.getItem('ecg-byok-v1'), null);
  assert.ok(local.getItem('ecg-byok-persist-v1'));
  assert.match(byok.maskedKey(), /^sk-t.*1234$/);
  byok.clearByok();
  assert.equal(byok.hasByok(), false);
});

console.log(`\nStudy/BYOK tests passed: ${passed}`);
