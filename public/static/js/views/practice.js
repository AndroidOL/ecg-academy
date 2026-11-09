const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261109an';
const { localizedName, getLocale, translate } = await import(`../i18n.js${__asset}`);
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { navigate } = await import(`../router.js${__asset}`);
const { recordAttempt, reviewSummary, weakDiagnosisIds, deviceId, questionSignature } = await import(`../study-store.js${__asset}`);
const { hasByok } = await import(`../byok.js${__asset}`);
const { mountECG } = await import(`../ecg-renderer.js${__asset}`);
const { icon, escapeHtml, toast, setButtonLoading, fmtDuration, medicalDisclaimer } = await import(`../ui.js${__asset}`);
const { streamAi } = await import(`../ai-stream.js${__asset}`);
const { renderMarkdown } = await import(`../markdown.js${__asset}`);
const { levelFromXp, ADVANCED_UNLOCK, CHALLENGE_UNLOCK } = await import(`../levels.js${__asset}`);

const SPECIAL_PRACTICES = [
  {
    id: 'mi',
    label: '心梗定位专项',
    note: '前壁 / 下壁 / 侧壁 / 后壁 / 右室',
    level: 2,
    focus: ['stemi-anterior', 'stemi-inferior', 'stemi-posterior', 'stemi-rv', 'ischemia-st'],
  },
  {
    id: 'posterior-rv',
    label: '后壁与右室心梗',
    note: '可疑后壁 + 18 导联思路',
    level: 3,
    focus: ['stemi-posterior', 'stemi-rv', 'stemi-inferior'],
  },
  {
    id: 'av-block',
    label: '房室阻滞专项',
    note: '一度 / 二度 I、II / 三度',
    level: 2,
    focus: ['av-block-1', 'av-block-2a', 'av-block-2b', 'av-block-3'],
  },
  {
    id: 'bundle-block',
    label: '束支与分支阻滞',
    note: 'RBBB / LBBB / 左前分支',
    level: 2,
    focus: ['rbbb', 'lbbb', 'lafb'],
  },
];

const LEVELS = [
  { id: 1, name: '基础', note: '单一诊断，常见图形' },
  { id: 2, name: '进阶', note: '不典型表现与鉴别' },
  { id: 3, name: '组合挑战', note: '一张图两诊断' },
];

const GAME_MODES = [
  { id: 'classic', name: '经典判读', note: '按题数完成一局', icon: 'target' },
  { id: 'speed', name: '极速 60 秒', note: '60 秒内尽可能多答', icon: 'timer' },
  { id: 'survival', name: '连击生存', note: '3 条命，答错扣命', icon: 'heart' },
];

const state = {
  level: 1,
  chapter: 'all',
  total: 5,
  focus: [],
  quiz: null,
  index: 0,
  correct: 0,
  slow: 0,
  score: 0,
  streak: 0,
  maxStreak: 0,
  selected: new Set(),
  submitted: false,
  result: null,
  questionStart: 0,
  timerId: 0,
  viewer: null,
  aiPlan: null,
  practice: null,
  assignmentCode: '',
  assignmentMeta: null,
  gameMode: 'classic',
  roundTotal: 0,
  speedRemaining: 60,
  speedTimerId: 0,
  lives: 3,
  answeredCount: 0,
  roundOver: false,
};

function aiUiAvailable() {
  if (!store.user || store.user.isGuest) return false;
  return store.ai?.allowed !== false || (Boolean(store.ai?.byokEnabled) && hasByok());
}

function clearTimer() {
  if (state.timerId) window.clearInterval(state.timerId);
  state.timerId = 0;
}

function clearSpeedTimer() {
  if (state.speedTimerId) window.clearInterval(state.speedTimerId);
  state.speedTimerId = 0;
}

function destroyViewer() {
  if (state.viewer) {
    state.viewer.destroy();
    state.viewer = null;
  }
}

export async function practiceView({ query } = {}) {
  const el = document.createElement('div');
  el.className = 'page';
  clearTimer();
  clearSpeedTimer();
  destroyViewer();
  state.quiz = null;
  state.gameMode = 'classic';
  state.answeredCount = 0;
  state.roundOver = false;
  state.lives = 3;
  state.selected = new Set();
  state.submitted = false;
  state.result = null;
  state.focus = [];
  const initialFocus = String(query?.get('focus') || '').split(',').map((x) => x.trim()).filter(Boolean);
  const assignmentCode = String(query?.get('assignment') || '').trim().toLowerCase();
  let assignmentError = '';
  state.assignmentCode = assignmentCode;
  state.assignmentMeta = null;
  if (assignmentCode) {
    try {
      state.assignmentMeta = await api.assignment(assignmentCode);
      state.level = Number(state.assignmentMeta.level) || 1;
      state.chapter = String(state.assignmentMeta.chapter || 'all');
      state.focus = Array.isArray(state.assignmentMeta.focus) ? state.assignmentMeta.focus : [];
    } catch (error) {
      assignmentError = error.message || '作业链接无效或已关闭';
      state.assignmentCode = '';
    }
  }
  const initialLevel = Number(query?.get('level') || 1);
  const initialChapter = String(query?.get('chapter') || 'all');
  const autoStart = Boolean(state.assignmentMeta) || (query?.get('auto') === '1' && initialFocus.length > 0);
  const shared = query?.get('share') === '1';
  if (!state.assignmentMeta) {
    if ([1, 2, 3].includes(initialLevel)) state.level = initialLevel;
    state.chapter = initialChapter;
  }
  const summary = reviewSummary();
  let testStatus = { score: 0, correct: 0, wrong: 0, locked: false, lockedUntil: null, lockScore: -100, leaderboard: [] };
  try { testStatus = await api.practiceStatus(); } catch { /* offline / old API */ }
  state.practice = testStatus;

  const userLevel = levelFromXp(Number(store.user?.xp || 0));
  const chapters = store.chapters || [];
  el.innerHTML = `
    <header class="page-head">
      <div>
        <div class="page-eyebrow">${icon('target', 14)} READ & DECIDE</div>
        <h1 class="page-title">判读练习</h1>
        <p class="page-sub">题库已预置 1920 道确定性病例：由 40 种诊断 × 40 个种子、8 组组合 × 40 个种子组成；答案与解析来自策展知识库，服务端校验。</p>
      </div>
      <div class="row-wrap"><span class="badge badge-brand">${icon('activity', 11)} 正确率 ${store.quiz?.accuracy || 0}%</span><span class="badge">${store.quiz?.attempts || 0} 次作答</span><span class="badge">题库 ${store.bank?.total || 1920} 道</span><span class="badge ${testStatus.score < 0 ? 'badge-danger' : 'badge-brand'}">测试分 ${testStatus.score > 0 ? '+' : ''}${testStatus.score}</span></div>
    </header>
    ${testStatus.locked ? `<div class="callout danger" style="margin-bottom:14px">${icon('alert', 14)} 今日测试分已低于 ${testStatus.lockScore} 分，测试模块锁定至 ${escapeHtml(testStatus.lockedUntil || '次日 00:00')}。你仍可阅读课程、错题复习和急救推演。</div>` : ''}
    ${state.assignmentMeta ? `<div class="callout brand" style="margin-bottom:14px">${icon('target', 14)} <b>${escapeHtml(state.assignmentMeta.title || '班级作业')}</b>${state.assignmentMeta.className ? ` · ${escapeHtml(state.assignmentMeta.className)}` : ''}：共 ${state.assignmentMeta.level >= 3 ? '组合' : state.assignmentMeta.level === 2 ? '进阶' : '基础'}难度；提交后匿名记录成绩，不收集姓名或 IP。</div>` : ''}
    ${assignmentError ? `<div class="callout danger" style="margin-bottom:14px">${icon('alert', 14)} ${escapeHtml(assignmentError)}。可继续使用普通练习。</div>` : ''}
    ${shared ? `<div class="callout brand" style="margin-bottom:14px">${icon('target', 14)} 这是一份只读练习分享链接：题目按分享者的难度与章节即时生成，不会修改原题或题库。</div>` : ''}
    <div class="practice-setup">
      <section class="quiz-card">
        <div class="page-eyebrow">SETUP</div>
        <a class="read-entry" href="#/read"><span class="read-entry-icon">${icon('target', 16)}</span><span class="read-entry-text"><b>系统判读训练</b><span>按 频率 → 节律 → 电轴 → 间期 → ST-T → 结论 的顺序读图，每一步即时反馈。</span></span><span class="badge badge-brand">NEW</span></a>
        <h2 class="section-title" style="margin-bottom:10px">选择玩法</h2>
        <div class="game-mode-grid">${GAME_MODES.map((mode) => `<button class="game-mode-card ${mode.id === state.gameMode ? 'active' : ''}" type="button" data-game-mode="${mode.id}"><span class="game-mode-icon">${icon(mode.icon, 16)}</span><b>${mode.name}</b><small>${mode.note}</small></button>`).join('')}</div>
        <div class="section-head" style="margin:16px 0 8px"><h2 class="section-title" style="font-size:16px;margin:0">难度与范围</h2><span class="muted" style="font-size:10px">未解锁难度可自由练习 · 不计分 / 不扣分</span></div>
        <div class="level-grid">
          ${LEVELS.map((level) => {
            const need = level.id === 2 ? ADVANCED_UNLOCK : level.id === 3 ? CHALLENGE_UNLOCK : 0;
            const freePractice = need > 0 && userLevel < need;
            return `<button class="level-card ${level.id === state.level ? 'active' : ''}" type="button" data-level="${level.id}"><b>${level.name}</b><span>${level.note}${freePractice ? ` · Lv.${need} 后计分` : ''}</span></button>`;
          }).join('')}
        </div>
        <div class="section-head" style="margin:16px 0 6px;justify-content:space-between"><h2 class="section-title" style="font-size:15px;margin:0">专项练习</h2><span class="muted" style="font-size:10px">按定位主题预选病例</span></div>
        <div class="special-grid">
          ${SPECIAL_PRACTICES.map((item) => {
            const freePractice = userLevel < item.level;
            return `<button class="special-card" type="button" data-special="${item.id}">
              <b>${item.label}</b>
              <span>${item.note}</span>
              <small>${freePractice ? `Lv.${item.level} 后计分 · ` : ''}${item.focus.length} 个相关诊断</small>
            </button>`;
          }).join('')}
        </div>
        <div class="practice-config">
          <div class="field"><label for="practice-chapter">章节</label><select class="select" id="practice-chapter"><option value="all">全部章节</option>${chapters.map((chapter) => `<option value="${escapeHtml(chapter.id)}">${escapeHtml(chapter.name)}</option>`).join('')}</select></div>
          <div class="field" data-count-field><label>本局题数</label><div class="segmented" data-count><button class="segment" type="button" data-total="1">1 题</button><button class="segment active" type="button" data-total="5">5 题</button></div></div>
        </div>
        <div class="row-wrap" style="margin-top:18px">
          <button class="btn btn-primary btn-lg" type="button" data-start ${testStatus.locked ? 'disabled' : ''}>${icon('play', 17)} ${testStatus.locked ? '今日已锁定' : '开始判读'}</button>
          <button class="btn btn-secondary" type="button" data-share>${icon('arrowUpRight', 16)} 分享只读组卷</button>
          <span class="muted" style="font-size:11px">答案提交后立即解析；每题都有服务端答案与知识库解释。</span>
        </div>
        <div id="ai-plan-result" style="margin-top:16px"></div>
      </section>
      <aside>
        <div class="practice-side-card">
          <h3>先描述，再诊断</h3>
          <p>固定顺序能减少“看见一个特征就下结论”的错误。</p>
          <div class="stack" style="margin-top:10px">
            ${['定标与纸速', '节律与 P 波', '心率与 PR/QRS/QT', 'ST-T 与异常波', '结合病史与鉴别'].map((text, index) => `<div class="row" style="font-size:11.5px;color:var(--ink-2)"><span class="option-letter">${index + 1}</span>${text}</div>`).join('')}
          </div>
        </div>
        <div class="practice-side-card">
          <h3>测试积分与排行榜</h3>
          <div class="practice-stats">
            <div class="practice-stat"><b data-test-score>${testStatus.score > 0 ? '+' : ''}${testStatus.score}</b><span>今日测试分</span></div>
            <div class="practice-stat"><b>${testStatus.correct}</b><span>答对</span></div>
            <div class="practice-stat"><b>${testStatus.wrong}</b><span>答错</span></div>
            <div class="practice-stat"><b>${store.quiz?.accuracy || 0}%</b><span>历史正确率</span></div>
          </div>
          <p class="muted" style="font-size:10px;margin-top:7px">基础/进阶/挑战答对 +10/+15/+20，答错按 4× 基础分扣分；未达 Lv.5/Lv.8 的进阶/挑战为自由练习，不计分、不扣分；Lv10 后基础题不再给经验。低于 ${testStatus.lockScore} 分锁定至次日。${testStatus.leaderboardMe?.rank ? ` 今日名次 <b>#${testStatus.leaderboardMe.rank}</b>。` : ' 今日暂未上榜。'}</p>
          <div class="practice-leaderboard-head"><b>今日排行榜</b><div class="row-wrap" style="gap:2px"><a class="btn btn-xs btn-ghost" href="#/leaderboard">完整排行</a><button class="btn btn-xs btn-ghost" type="button" data-test-scope="all">总榜</button></div></div>
          <div class="practice-leaderboard" data-test-leaderboard>${renderMiniLeaderboard(testStatus.leaderboard)}</div>
        </div>
        <div class="practice-side-card">
          <h3>${icon('target', 14)} 错题与间隔复习</h3>
          <p>${summary.due} 个诊断到期待复习，${summary.wrong} 个错题已记录。错题本${store.user?.isGuest ? '保存在本设备' : '已同步到你的账号'}，可自我评分安排下一次复习。</p>
          <div class="row-wrap" style="margin-top:10px"><a class="btn btn-secondary btn-block btn-sm" href="#/review">${icon('bookOpen', 14)} 打开错题本</a><a class="btn btn-secondary btn-block btn-sm" href="#/exam">${icon('trophy', 14)} 学习考试</a></div>
        </div>
        <div class="practice-side-card">
          <h3>${icon('sparkles', 14)} AI 专项计划</h3>
          <p>根据最近答题与章节正确率，选出 3 个最该巩固的诊断，生成一局专项练习。未配置 AI 时使用本地算法。</p>
          <button class="btn btn-secondary btn-block btn-sm" type="button" data-plan style="margin-top:10px">${icon('sparkles', 14)} 生成专项计划</button>
          <a class="btn btn-ghost btn-block btn-sm" href="#/ai" style="margin-top:6px">${icon('target', 14)} 去 AI 导师出题</a>
        </div>
      </aside>
    </div>
    ${medicalDisclaimer()}`;

  const levelButtons = el.querySelectorAll('[data-level]');
  const countButtons = el.querySelectorAll('[data-total]');
  const chapterSelect = el.querySelector('#practice-chapter');
  chapterSelect.value = state.chapter;
  levelButtons.forEach((button) => button.addEventListener('click', () => {
    state.level = Number(button.dataset.level);
    levelButtons.forEach((b) => b.classList.toggle('active', b === button));
  }));
  el.querySelectorAll('[data-special]').forEach((button) => button.addEventListener('click', async () => {
    const item = SPECIAL_PRACTICES.find((x) => x.id === button.dataset.special);
    if (!item) return;
    state.level = item.level;
    levelButtons.forEach((b) => b.classList.toggle('active', Number(b.dataset.level) === item.level));
    button.disabled = true;
    try {
      await startQuiz(item.focus);
    } catch (error) {
      toast(error.message || '专项练习出题失败', 'error');
    } finally {
      button.disabled = false;
    }
  }));
  countButtons.forEach((button) => button.addEventListener('click', () => {
    state.total = Number(button.dataset.total);
    countButtons.forEach((b) => b.classList.toggle('active', b === button));
  }));
  chapterSelect.addEventListener('change', () => { state.chapter = chapterSelect.value; });  const gameModeButtons = el.querySelectorAll('[data-game-mode]');
  const countField = el.querySelector('[data-count-field]');
  gameModeButtons.forEach((button) => button.addEventListener('click', () => {
    state.gameMode = button.dataset.gameMode;
    gameModeButtons.forEach((b) => b.classList.toggle('active', b === button));
    if (countField) countField.style.display = state.gameMode === 'classic' ? '' : 'none';
  }));


  el.querySelector('[data-share]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const params = new URLSearchParams({ level: String(state.level), chapter: state.chapter, share: '1' });
    const url = `${location.origin}${location.pathname}#/practice?${params.toString()}`;
    try {
      if (navigator.share) await navigator.share({ title: '心迹 ECG Lab · 判读练习', text: '打开这份只读组卷，完成一局心电图判读。', url });
      else { await navigator.clipboard.writeText(url); toast('只读组卷链接已复制', 'success'); }
      button.innerHTML = `${icon('check', 14)} 已分享`;
      window.setTimeout(() => { button.innerHTML = `${icon('arrowUpRight', 16)} 分享只读组卷`; }, 1800);
    } catch (error) {
      toast('分享未完成，可手动复制地址栏链接', 'info');
    }
  });

  el.querySelector('[data-test-scope]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const host = el.querySelector('[data-test-leaderboard]');
    const scope = button.dataset.testScope === 'all' ? 'all' : 'today';
    try {
      const data = await api.practiceLeaderboard(scope);
      if (host) host.innerHTML = renderMiniLeaderboard(data.items || []);
      button.dataset.testScope = scope === 'all' ? 'today' : 'all';
      button.textContent = scope === 'all' ? '今日榜' : '总榜';
    } catch (error) { toast(error.message || '排行榜加载失败', 'error'); }
  });
  const startButton = el.querySelector('[data-start]');
  startButton.addEventListener('click', async () => {
    setButtonLoading(startButton, true, '正在出题');
    try {
      await startQuiz([]);
    } catch (error) {
      toast(error.message || '出题失败', 'error');
      setButtonLoading(startButton, false);
    }
  });

  const planButton = el.querySelector('[data-plan]');
  const planResult = el.querySelector('#ai-plan-result');
  planButton.addEventListener('click', async () => {
    setButtonLoading(planButton, true, '分析中');
    try {
      const result = await api.aiStudyPlan();
      state.aiPlan = result;
      state.focus = result.plan?.focus?.map((f) => f.id) || [];
      planResult.innerHTML = `<div class="callout brand"><div style="font-weight:700;margin-bottom:4px">${result.source === 'ai' ? 'AI 专项计划' : '本地专项计划'}</div><p data-plan-text></p><div class="row-wrap" style="margin-top:8px">${(result.plan?.focus || []).map((f) => `<span class="tag">${escapeHtml(f.name)}</span>`).join('')}</div><button class="btn btn-sm btn-primary" type="button" data-start-plan style="margin-top:9px">${icon('target', 13)} 按此计划开始</button></div>`;
      planResult.querySelector('[data-plan-text]').textContent = result.text || '';
      planResult.querySelector('[data-start-plan]')?.addEventListener('click', async (event) => {
        const btn = event.currentTarget;
        setButtonLoading(btn, true, '出题中');
        try {
          await startQuiz(state.focus);
        } catch (error) {
          toast(error.message || '出题失败', 'error');
          setButtonLoading(btn, false);
        }
      });
      setButtonLoading(planButton, false);
    } catch (error) {
      toast(error.message || '生成计划失败', 'error');
      setButtonLoading(planButton, false);
    }
  });

  async function startQuiz(focus = []) {
    clearSpeedTimer();
    state.focus = focus;
    state.answeredCount = 0;
    state.roundOver = false;
    state.lives = 3;
    state.speedRemaining = 60;
    state.roundTotal = state.gameMode === 'classic' ? state.total : 0;
    const quiz = await api.quizNew({ level: state.level, chapter: state.chapter, focus, assignment: state.assignmentCode, device: state.assignmentCode ? deviceId() : undefined });
    state.quiz = quiz;
    state.index = 0;
    state.correct = 0;
    state.score = 0;
    state.streak = 0;
    state.maxStreak = 0;
    renderQuestion(el);
    if (state.gameMode === 'speed') startSpeedTimer(el);
  }

  const onKey = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (document.getElementById('modal-root')?.children.length) return;
    if (event.key === 'Enter') {
      const submit = el.querySelector('[data-submit]');
      if (submit && submit.style.display !== 'none' && !submit.disabled) {
        event.preventDefault();
        submit.click();
        return;
      }
      const next = el.querySelector('[data-next]');
      if (next) {
        event.preventDefault();
        next.click();
        return;
      }
    }
    if (event.key === 'n' || event.key === 'N') {
      const next = el.querySelector('[data-next]');
      if (next) {
        event.preventDefault();
        next.click();
      }
      return;
    }
    const match = /^([1-6])$/.exec(event.key) || /^([a-fA-F])$/.exec(event.key);
    if (!match) return;
    const index = /^[0-9]$/.test(match[1]) ? Number(match[1]) - 1 : match[1].toLowerCase().charCodeAt(0) - 97;
    const options = [...el.querySelectorAll('[data-option]')];
    if (options[index] && !state.submitted) {
      event.preventDefault();
      options[index].click();
    }
  };
  document.addEventListener('keydown', onKey);

  if (autoStart) {
    try {
      await startQuiz(state.focus);
    } catch (error) {
      toast(error.message || '出题失败', 'error');
    }
  }
  return {
    el,
    destroy() {
      clearTimer();
      clearSpeedTimer();
      document.removeEventListener('keydown', onKey);
      destroyViewer();
    },
  };
}

function renderMiniLeaderboard(items = []) {
  if (!items.length) return '<div class="muted" style="font-size:10px;padding:6px 0">今日还没有测试记录。</div>';
  return items.slice(0, 6).map((item, index) => `<div class="practice-leader-row"><span>${String(index + 1).padStart(2, '0')}</span><b class="${item.id === store.user?.id ? 'is-me' : ''}">${escapeHtml(item.name || '游客')}</b><em>${item.points > 0 ? '+' : ''}${item.points}</em></div>`).join('');
}

function startSpeedTimer(el) {
  clearSpeedTimer();
  state.speedRemaining = 60;
  const tick = () => {
    if (state.roundOver) return;
    state.speedRemaining = Math.max(0, state.speedRemaining - 1);
    const clock = el.querySelector('[data-speed-clock]');
    if (clock) clock.textContent = `${state.speedRemaining}s`;
    if (state.speedRemaining <= 0) {
      state.roundOver = true;
      clearSpeedTimer();
      renderResults(el);
    }
  };
  state.speedTimerId = window.setInterval(tick, 1000);
}

function renderQuestion(el) {
  clearTimer();
  destroyViewer();
  state.selected = new Set();
  state.submitted = false;
  state.result = null;
  state.questionStart = performance.now();
  const quiz = state.quiz;
  const multiple = quiz.multiple;
  const index = state.index;
  const total = state.roundTotal || state.total;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const roundProgress = state.gameMode === 'classic' ? (index / total) * 100 : 0;
  const modeBadge = state.gameMode === 'speed' ? `<span class="badge badge-warn">极速 <b data-speed-clock>${state.speedRemaining}s</b></span>` : state.gameMode === 'survival' ? `<span class="badge ${state.lives <= 1 ? 'badge-danger' : 'badge-brand'}">生命 <b data-lives>${state.lives}</b> / 3</span>` : '<span class="badge badge-brand">经典</span>';

  el.innerHTML = `
    <div class="quiz-shell">
      <div class="quiz-top">
        <button class="btn btn-ghost btn-sm" type="button" data-exit>${icon('arrowLeft', 14)} 退出本局</button>
        ${state.assignmentMeta ? `<span class="badge badge-brand">${escapeHtml(state.assignmentMeta.title || '班级作业')}</span>` : ''}
        <div class="quiz-progress"><span>${state.gameMode === 'classic' ? `第 <b>${index + 1}</b> / ${total} 题` : `第 <b>${index + 1}</b> 题`}</span><span class="progress"><span class="progress-bar" style="width:${roundProgress}%"></span></span>${modeBadge}<span>正确 ${state.correct}</span><span>测试分 <b data-live-score>${state.practice?.score > 0 ? '+' : ''}${state.practice?.score || 0}</b></span><span class="timer">${icon('timer', 12)} <b data-timer>00:00</b></span></div>
      </div>
      <div class="practice-setup">
        <section class="quiz-card">
          <div class="row-wrap" style="justify-content:space-between;margin-bottom:8px">
            <span class="badge badge-brand">${quiz.level >= 3 ? '组合挑战' : quiz.level === 2 ? '进阶' : '基础'}</span>
            <span class="badge">${multiple ? '多选' : '单选'} · 服务端判分</span>
          </div>
          <div class="ecg-card" id="quiz-ecg">
            <div class="ecg-toolbar">
              <div class="ecg-toolbar-group"><span class="badge badge-brand">ECG</span><span class="ecg-toolbar-label">25 mm/s · 10 mm/mV</span></div>
              <div class="ecg-toolbar-group">${quiz.spec?.show12Lead ? '<button class="ecg-tab" type="button" data-quiz-12lead>12 导联</button>' : ''}<button class="ecg-tab active" type="button" data-quiz-rhythm>节律条</button><button class="btn btn-xs btn-secondary" type="button" data-quiz-play>播放</button></div>
            </div>
            <div id="quiz-ecg-canvas"></div>
            <div class="ecg-meta"><span>HR <b>—</b> 请自行测量</span><span>PR/QRS/QT 请结合图形判断</span></div>
          </div>
          <h2 class="quiz-question">${escapeHtml(quiz.question || '该心电图最可能的诊断是？')}</h2>
          ${quiz.stem ? `<p class="quiz-stem">${escapeHtml(quiz.stem)}</p>` : ''}
          <div class="option-list" data-options>
            ${quiz.options.map((option, i) => `<label class="option-card" data-option="${escapeHtml(option.id)}">
              <input type="${multiple ? 'checkbox' : 'radio'}" name="quiz-option" value="${escapeHtml(option.id)}" data-option-input>
              <span class="option-letter">${letters[i] || i + 1}</span>
              <span class="option-text">${escapeHtml(localizedName(option))}</span>
              <span class="option-note">${escapeHtml(option.chapter || '')}</span>
            </label>`).join('')}
          </div>
          <div class="quiz-actions">
            <span class="muted" style="font-size:11px">${multiple ? '选择所有符合的诊断后再提交。' : '选择一个最可能的诊断。'} · 键盘 1–5 / Enter</span>
            <button class="btn btn-primary" type="button" data-submit disabled>${icon('check', 15)} 提交答案</button>
          </div>
          <div id="quiz-feedback" role="status" aria-live="polite"></div>
        </section>
        <aside>
          <div class="practice-side-card">
            <h3>当前局面</h3>
            <div class="practice-stats">
              <div class="practice-stat"><b>${state.correct}</b><span>答对</span></div>
              <div class="practice-stat"><b>${state.score}</b><span>得分</span></div>
              <div class="practice-stat"><b>${state.streak}</b><span>连续答对</span></div>
              <div class="practice-stat"><b>${index + 1}</b><span>当前题号</span></div>
            </div>
          </div>
          <div class="practice-side-card">
            <h3>判读提示</h3>
            <p>先看节律是否规则；找 P 波；量 PR/QRS/QT；再看 ST-T。不要用单个特征代替完整诊断。</p>
          </div>
          <div class="practice-side-card">
            <h3>结果说明</h3>
            <p>正确答案可能是一个或多个诊断。只选对一部分也会显示为“部分正确”，但本局只统计完全正确。</p>
          </div>
        </aside>
      </div>
    </div>`;

  const viewerRoot = el.querySelector('#quiz-ecg-canvas');
  state.viewer = mountECG(viewerRoot, quiz.spec, { mode: 'rhythm', speed: 1, showAnnotations: false, showSummary: false, autoPlay: false });
  const playControl = el.querySelector('[data-quiz-play]');
  const syncPlayControl = () => {
    if (playControl) playControl.textContent = state.viewer?.playing ? '暂停' : '播放';
  };
  viewerRoot.addEventListener('ecg:play', syncPlayControl);
  viewerRoot.addEventListener('ecg:pause', syncPlayControl);
  viewerRoot.addEventListener('ecg:ended', syncPlayControl);
  playControl?.addEventListener('click', () => {
    if (!state.viewer) return;
    if (state.viewer.playing) state.viewer.pause();
    else state.viewer.play(1);
    syncPlayControl();
  });
  const feedback = el.querySelector('#quiz-feedback');
  const submit = el.querySelector('[data-submit]');
  const options = el.querySelectorAll('[data-option]');
  const timerEl = el.querySelector('[data-timer]');
  let mode = 'rhythm';

  const updateTimer = () => {
    if (timerEl) timerEl.textContent = fmtDuration((performance.now() - state.questionStart) / 1000);
  };
  updateTimer();
  state.timerId = window.setInterval(updateTimer, 500);

  el.querySelector('[data-exit]')?.addEventListener('click', async () => {
    if (state.submitted || state.index === 0) {
      navigate('/practice');
    } else if (window.confirm('退出本局？当前成绩不会保存。')) {
      navigate('/practice');
    }
  });

  const updateSelection = () => {
    options.forEach((option) => {
      const selected = state.selected.has(option.dataset.option);
      option.classList.toggle('selected', selected && !state.submitted);
    });
    submit.disabled = state.selected.size === 0 || state.submitted;
  };

  options.forEach((option) => {
    option.addEventListener('click', (event) => {
      if (state.submitted) {
        event.preventDefault();
        return;
      }
      const input = option.querySelector('input');
      const id = option.dataset.option;
      if (!multiple) {
        state.selected.clear();
        state.selected.add(id);
        options.forEach((o) => { const i = o.querySelector('input'); if (i) i.checked = o === option; });
      } else {
        if (state.selected.has(id)) state.selected.delete(id);
        else state.selected.add(id);
        if (input) input.checked = state.selected.has(id);
      }
      updateSelection();
    });
  });

  el.querySelector('[data-quiz-12lead]')?.addEventListener('click', (event) => {
    mode = mode === '12lead' ? 'rhythm' : '12lead';
    state.viewer.setMode(mode);
    event.currentTarget.classList.toggle('active', mode === '12lead');
    el.querySelector('[data-quiz-rhythm]')?.classList.toggle('active', mode === 'rhythm');
  });
  el.querySelector('[data-quiz-rhythm]')?.addEventListener('click', () => {
    mode = 'rhythm';
    state.viewer.setMode('rhythm');
    el.querySelector('[data-quiz-12lead]')?.classList.remove('active');
    el.querySelector('[data-quiz-rhythm]')?.classList.add('active');
  });

  submit.addEventListener('click', async () => {
    if (state.submitted || state.selected.size === 0) return;
    state.submitted = true;
    clearTimer();
    setButtonLoading(submit, true, '判分中');
    try {
      const result = await api.quizAnswer(quiz.attemptId, [...state.selected], Math.round(performance.now() - state.questionStart), levelFromXp(Number(store.user?.xp || 0)));
      if (getLocale() === 'en') {
        const localized = (id) => localizedName((quiz.options || []).find((option) => option.id === id) || {});
        result.correctNames = (result.correctIds || []).map(localized);
        result.selectedNames = [...state.selected].map(localized);
        const primary = (result.explanation || [])[0] || {};
        const clue = translate(primary.specificity || primary.oneLiner || '');
        const criterion = translate((primary.criteria || [])[0] || '');
        result.localExplanation = result.correct
          ? `Correct. Key clue: ${clue} Continue with the AI Tutor to explore the mechanism and differential.`
          : `Correct answer: ${result.correctNames.join(', ')}. ${result.partial ? 'You selected part of the correct combination.' : 'Your selection does not match the correct diagnosis.'} Key clue: ${clue}${criterion ? ` Review the criteria: ${criterion}` : ''}${result.selectedNames.length ? ` You selected: ${result.selectedNames.join(', ')}.` : ''}`;
      }
      state.result = result;
      if (result.correct) {
        state.correct += 1;
        state.streak += 1;
        state.maxStreak = Math.max(state.maxStreak, state.streak);
      } else {
        state.streak = 0;
      }
      state.score += result.score;
      if (result.slow) state.slow += 1;
      store.applyXp(result.xp);
      const names = Object.fromEntries((quiz.options || []).map((option) => [option.id, option.name]));
      const chapterMap = Object.fromEntries((quiz.options || []).map((option) => [option.id, option.chapter]));
      recordAttempt({
        correct: result.correct,
        slow: Boolean(result.slow),
        correctIds: result.correctIds || [],
        selectedIds: [...state.selected],
        names,
        chapters: chapterMap,
        source: 'practice',
        questionKey: questionSignature((quiz.options || []).map((option) => option.id), result.correctIds || []),
        questionText: quiz.stem || quiz.question || '',
      });
      state.answeredCount += 1;
      if (state.gameMode === 'survival' && !result.correct) {
        state.lives = Math.max(0, state.lives - 1);
        if (state.lives === 0) state.roundOver = true;
        const livesNode = el.querySelector('[data-lives]');
        if (livesNode) livesNode.textContent = String(state.lives);
      }
      try {
        state.practice = await api.practiceStatus();
        const scoreNode = el.querySelector('[data-live-score]');
        if (scoreNode) scoreNode.textContent = `${state.practice.score > 0 ? '+' : ''}${state.practice.score}`;
        if (state.practice.locked) {
          toast(`测试分已低于 ${state.practice.lockScore}，测试模块锁定至次日`, 'error');
        }
      } catch { /* score refresh is non-blocking */ }
      setButtonLoading(submit, false);
      submit.style.display = 'none';
      options.forEach((option) => {
        const id = option.dataset.option;
        const input = option.querySelector('input');
        if (input) input.disabled = true;
        option.classList.remove('selected');
        if (result.correctIds.includes(id)) option.classList.add('correct');
        else if (result.selectedNames && [...state.selected].includes(id)) option.classList.add('wrong');
      });
      const isLast = (state.gameMode === 'classic' && state.index + 1 >= state.roundTotal) || state.roundOver;
      feedback.innerHTML = feedbackHtml(result, multiple, isLast);
      if (state.roundOver) {
        const nextButton = feedback.querySelector('[data-next]');
        if (nextButton) nextButton.innerHTML = `${icon('trophy', 14)} 查看本轮结果`;
      }
      bindFeedback();
      const actionHint = el.querySelector('.quiz-actions > span.muted');
      if (actionHint) actionHint.textContent = '已提交，查看下方解析。';
    } catch (error) {
      state.submitted = false;
      setButtonLoading(submit, false);
      toast(error.message || '判分失败', 'error');
    }
  });

  function bindFeedback() {
    const next = feedback.querySelector('[data-next]');
    next?.addEventListener('click', async () => {
      if (state.gameMode !== 'classic' && state.roundOver) {
        renderResults(el);
        return;
      }
      if (state.gameMode === 'classic' && state.index + 1 >= state.roundTotal) {
        renderResults(el);
        return;
      }
      state.index += 1;
      setButtonLoading(next, true, '出题中');
      try {
        const newQuiz = await api.quizNew({ level: state.level, chapter: state.chapter, focus: state.focus, assignment: state.assignmentCode, device: state.assignmentCode ? deviceId() : undefined });
        state.quiz = newQuiz;
        state.submitted = false;
        state.selected = new Set();
        renderQuestion(el);
      } catch (error) {
        toast(error.message || '出题失败', 'error');
        setButtonLoading(next, false);
      }
    });
    const runAi = async (questionText, button, title) => {
      if (!aiUiAvailable() || !state.result?.attemptId) return;
      const panel = feedback.querySelector('[data-ai-explain-panel]');
      panel.innerHTML = `<div class="explain-block ai-answer"><h4>${escapeHtml(title)}</h4>${questionText ? `<p class="ai-question">你的追问：${escapeHtml(questionText)}</p>` : ''}<div class="ai-context" data-ai-context></div><div class="ai-stream-text ai-thinking" data-ai-stream>正在生成…</div><div class="ai-meta" data-ai-cost></div></div>`;
      const streamHost = panel.querySelector('[data-ai-stream]');
      const contextHost = panel.querySelector('[data-ai-context]');
      const costHost = panel.querySelector('[data-ai-cost]');
      setButtonLoading(button, true, '生成中');
      try {
        await streamAi({ mode: 'explain', attemptId: state.result.attemptId, question: questionText }, {
          onMeta: (meta) => {
            contextHost.innerHTML = (meta?.context || []).map((item) => `<span>${escapeHtml(item)}</span>`).join('');
          },
          onDelta: (chunk, text) => {
            streamHost.classList.remove('ai-thinking');
            streamHost.innerHTML = renderMarkdown(text);
          },
          onDone: (done, text) => {
            const block = panel.querySelector('.explain-block');
            const heading = block.querySelector('h4');
            if (heading) heading.textContent = done?.fallback ? '本地解析' : title;
            streamHost.remove();
            block.insertAdjacentHTML('beforeend', renderMarkdown(text));
            if (done?.cost) {
              costHost.textContent = `${done.cost.model || ''} · ${done.cost.prompt || 0}→${done.cost.completion || 0} tokens${done.cost.cost ? ` · ${done.cost.currency || ''}${done.cost.cost}` : ''}${done.cost.discount ? ` · ${done.cost.discount}` : ''}`;
            }
          },
        });
      } catch (error) {
        streamHost.classList.remove('ai-thinking');
        streamHost.textContent = error.message || 'AI 解析失败';
      } finally {
        setButtonLoading(button, false);
      }
    };
    feedback.querySelector('[data-ai-ask]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (!aiUiAvailable() || button.disabled) return;
      const input = feedback.querySelector('[data-ai-question]');
      const question = String(input?.value || '').trim();
      if (!question) return toast('请先输入一个简短追问', 'warn');
      if (input) input.value = '';
      await runAi(question.slice(0, 120), button, 'AI 回答');
    });
    feedback.querySelector('[data-ai-question]')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        feedback.querySelector('[data-ai-ask]')?.click();
      }
    });
    feedback.querySelector('[data-ai-explain]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (!aiUiAvailable() || button.disabled) return;
      await runAi('', button, 'AI 错因解析');
    });
  }

  updateSelection();
}

function feedbackHtml(result, multiple, isLast = false) {
  const tone = result.correct ? 'good' : 'bad';
  const freePractice = result.unlocked === false;
  const title = result.correct
    ? (result.slow ? '判断正确，但不熟练（用时超过 15 秒）' : '判断正确') + (freePractice ? ' · 自由练习' : '')
    : (result.partial ? '部分正确，但诊断组合不完整' : '需要再读一遍') + (freePractice ? ' · 自由练习' : '');
  const answer = result.correctNames?.join('、') || '';
  return `<div class="quiz-feedback">
    <div class="feedback-head"><span class="feedback-icon ${tone === 'bad' ? 'bad' : ''}">${icon(result.correct ? 'check' : 'x', 16)}</span><div><div class="feedback-title">${title}</div><div class="muted" style="font-size:10px">${freePractice ? `自由练习：本题不计分、不扣分；Lv.${result.unlockLevel || '—'} 后按正常规则计分` : `本题得分 ${result.score ?? '—'}${Number.isFinite(Number(result.baseScore)) ? (result.correct ? `（基础 ${result.baseScore}${result.slow ? ' · 慢答 ×0.7' : ` + 时间加成 ${result.timeBonus ?? 0}`}）` : result.partial ? `（部分正确 ${result.baseScore} ×0.25）` : `（答错扣 ${result.penalty || 4}× 基础分）`) : ''}`} · 用时 ${Math.round((result.timeMs || 0) / 1000)} 秒${freePractice ? '' : ` · 经验 ${Number(result.xp) > 0 ? '+' : ''}${result.xp}`}${answer ? ` · 正确答案：${escapeHtml(answer)}` : ''}</div></div></div>
    <p class="muted" style="font-size:10px;margin:4px 0 0">${freePractice ? '该难度尚未达到计分等级，可自由练习；答错不会扣测试分或 XP，错题仍会记录。' : '测试分按难度 10/15/20 计；答错按 4× 基础分扣分；慢答（>15 秒）正确只拿 70% 分数与 60% 经验；Lv10 后基础题不再给经验。用时超过 15 秒的答对题记为“不熟练”。'}</p>
    <p class="feedback-text">${escapeHtml(result.localExplanation || '')}</p>
    ${(result.explanation || []).map((item) => `<div class="explain-block"><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.specificity || item.oneLiner || '')}</p><ul>${(item.criteria || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul></div>`).join('')}
    ${aiUiAvailable() ? `<div class="ai-ask-row"><input class="input" data-ai-question maxlength="120" placeholder="简短追问（≤120 字）：为什么排除某个选项？"><button class="btn btn-secondary btn-sm" type="button" data-ai-ask>${icon('sparkles', 14)} 问 AI</button></div><div class="ai-ask-hint">追问限 120 字；复杂或跨主题问题请到文章页的「AI 导师」提问。</div>` : ''}
    <div class="row-wrap" style="margin-top:12px">${!result.correct && (result.correctIds || []).length ? `<a class="btn btn-secondary btn-sm" href="#/read?focus=${encodeURIComponent((result.correctIds || []).join(','))}">${icon('target', 14)} 用五步法重读</a>` : ''}${aiUiAvailable() ? `<button class="btn btn-secondary btn-sm" type="button" data-ai-explain>${icon('sparkles', 14)} AI 解释错因</button>` : ''}<button class="btn btn-primary btn-sm" type="button" data-next>${icon('arrowRight', 14)} ${isLast ? '查看本轮结果' : '下一题'}</button></div>
    <div data-ai-explain-panel></div>
  </div>`;
}

function renderResults(el) {
  state.roundOver = true;
  clearTimer();
  clearSpeedTimer();
  destroyViewer();
  const total = state.gameMode === 'classic' ? (state.roundTotal || state.total) : Math.max(1, state.answeredCount);
  const accuracy = total ? Math.round((state.correct / total) * 100) : 0;
  store.refresh().catch(() => {});
  el.innerHTML = `<div class="page" style="padding:0;max-width:none">
    <div class="quiz-result card card-pad">
      <div class="page-eyebrow" style="justify-content:center">${icon('trophy', 14)} ROUND COMPLETE</div>
      <div class="result-score">${state.score}</div>
      <div class="result-label">本局得分</div>
      <div class="result-stats"><div><b>${state.correct}/${total}</b><span class="muted">答对</span></div><div><b>${accuracy}%</b><span class="muted">正确率</span></div><div><b>${state.slow || 0}</b><span class="muted">不熟练（>15s）</span></div><div><b>${state.maxStreak}</b><span class="muted">最高连续</span></div></div>
      <p class="muted" style="font-size:12.5px">${state.gameMode === 'speed' ? '极速 60 秒：先保证节奏，再回头复盘漏掉的关键线索。' : state.gameMode === 'survival' ? '连击生存：3 条命用完即结束；错题已经进入复习队列。' : '判读不是猜答案：把每一道错题还原成“哪一步看错了”，比刷更多题更有效。'}</p>
      <div class="row-wrap" style="justify-content:center;margin-top:18px"><button class="btn btn-primary" type="button" data-restart>${icon('rotate', 15)} 再来一局</button><a class="btn btn-secondary" href="#/review">${icon('target', 15)} 查看错题本</a><a class="btn btn-secondary" href="#/learn">${icon('bookOpen', 15)} 回到图谱</a></div>
    </div>
    ${medicalDisclaimer()}
  </div>`;
  el.querySelector('[data-restart]')?.addEventListener('click', () => {
    navigate('/practice');
  });
}
