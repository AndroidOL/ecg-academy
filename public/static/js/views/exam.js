const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261109af';
const { localizedName } = await import(`../i18n.js${__asset}`);
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { navigate } = await import(`../router.js${__asset}`);
const { recordAttempt } = await import(`../study-store.js${__asset}`);
const { icon, escapeHtml, toast, medicalDisclaimer } = await import(`../ui.js${__asset}`);

const state = {
  status: null,
  mode: null,
  round: null,
  index: 0,
  answers: {},
  result: null,
  busy: false,
};

function levelTone(level) {
  return { '精通': 'ok', '熟练': 'brand', '掌握': 'warn', '生疏': 'danger', '样本不足': '' }[level] || '';
}

function statusTone(status) {
  return { learned: 'badge-ok', learning: 'badge-brand', relearning: 'badge-danger', not_started: '' }[status] || '';
}

function chapterCard(chapter) {
  const sample = Number(chapter.sample || 0);
  return `<article class="exam-chapter ${chapter.status}" data-chapter-card="${escapeHtml(chapter.id)}">
    <div class="exam-chapter-head"><span class="badge ${statusTone(chapter.status)}">${escapeHtml(chapter.statusLabel)}</span><span class="badge ${levelTone(chapter.level) ? 'badge-' + levelTone(chapter.level) : ''}">${escapeHtml(chapter.level)}</span></div>
    <h3>${escapeHtml(localizedName(chapter))}</h3>
    <div class="exam-chapter-meta"><span>最近 ${sample} 题</span><span>正确率 ${chapter.accuracy}%</span></div>
    <div class="progress"><div class="progress-bar" style="width:${Math.min(100, chapter.accuracy)}%"></div></div>
    <div class="exam-chapter-foot"><span class="muted">${chapter.status === 'learned' ? '完成一次 10 题学习可刷新评级' : sample ? '继续完成 10 题学习关卡' : '尚未开始'}</span><button class="btn btn-xs ${chapter.status === 'learned' ? 'btn-secondary' : 'btn-primary'}" type="button" data-learn="${escapeHtml(chapter.id)}">${chapter.status === 'learned' ? '再学一次' : '开始学习'}</button></div>
  </article>`;
}

function homeMarkup() {
  const status = state.status;
  const learned = Number(status?.learnedCount || 0);
  const unlockAt = Number(status?.examUnlockAt || 8);
  const percent = Math.min(100, Math.round((learned / unlockAt) * 100));
  return `<header class="page-head">
      <div><div class="page-eyebrow">${icon('trophy', 14)} LEARN & EXAM</div><h1 class="page-title">学习考试</h1><p class="page-sub">每个板块先完成 10 道随机学习题；通过 8 题记为“已学习”。至少 8 个板块已学习后解锁综合考试。评级来自最近 50 题，样本超过 10 题才显示等级。</p></div>
      <div class="row-wrap"><span class="badge ${status?.examUnlocked ? 'badge-ok' : 'badge-brand'}">${icon('target', 12)} 已学习 ${learned} / ${unlockAt}</span><span class="badge">${status?.bankTotal || 0} 道章节题</span><span class="badge">最近 ${status?.window || 50} 题评级</span></div>
    </header>
    <div class="exam-unlock card card-pad">
      <div><div class="page-eyebrow">EXAM UNLOCK</div><h2>${status?.examUnlocked ? '综合考试已解锁' : `再完成 ${unlockAt - learned} 个板块`}</h2><p>${status?.examUnlocked ? '考试题目从已学习板块随机抽取，只对当前账号可见，不进入排行榜。' : '完成学习关卡后，已学习板块会显示在左侧；不足 8 个时考试入口会保持锁定。'}</p></div>
      <div class="exam-unlock-right"><div class="exam-unlock-percent">${percent}%</div><div class="progress"><div class="progress-bar" style="width:${percent}%"></div></div><button class="btn ${status?.examUnlocked ? 'btn-primary' : 'btn-ghost btn-disabled'}" type="button" data-exam ${status?.examUnlocked ? '' : 'disabled'}>${icon('trophy', 15)} ${status?.examUnlocked ? '开始综合考试' : '考试未解锁'}</button></div>
    </div>
    <div class="exam-layout">
      <section class="exam-chapter-grid">${(status?.chapters || []).map(chapterCard).join('')}</section>
      <aside class="stack">
        <div class="practice-side-card"><h3>评级规则</h3><div class="exam-scale"><div><b>生疏</b><span>&lt;50%</span></div><div><b>掌握</b><span>50–69%</span></div><div><b>熟练</b><span>70–84%</span></div><div><b>精通</b><span>≥85%</span></div></div><p style="margin-top:8px">最近 50 题；样本 ≤10 显示“样本不足”。最近 5 题错 ≥3、最近 10 题错 ≥6，或最近 50 题正确率 &lt;60%，已学习状态会退回“重新学习”。</p></div>
        <div class="practice-side-card"><h3>学习关卡</h3><p>随机 10 题，答对 ≥${status?.learnPass || 8} 题通过。题目来自该板块的策展内容，答错会进入你的本地错题本。</p><a class="btn btn-secondary btn-sm" href="#/review" style="margin-top:8px">${icon('bookOpen', 13)} 打开错题本</a></div>
      </aside>
    </div>
    ${medicalDisclaimer()}`;
}

function runnerMarkup() {
  const round = state.round;
  const question = round.questions[state.index];
  const total = round.questions.length;
  const progress = Math.round((state.index / total) * 100);
  const selected = state.answers[question.id];
  return `<div class="quiz-shell exam-runner">
    <div class="quiz-top"><button class="btn btn-ghost btn-sm" type="button" data-exit>${icon('arrowLeft', 14)} 退出</button><div class="quiz-progress"><span>${state.mode === 'exam' ? '综合考试' : escapeHtml(round.chapterName || '学习关卡')}</span><span class="progress"><span class="progress-bar" style="width:${progress}%"></span></span><span>第 <b>${state.index + 1}</b> / ${total} 题</span></div></div>
    <div class="exam-runner-card card card-pad">
      <div class="row-wrap" style="justify-content:space-between"><span class="badge badge-brand">${state.mode === 'exam' ? 'EXAM' : 'LEARN'}</span><span class="badge">${round.questions[state.index].difficulty >= 2 ? '进阶' : '基础'}</span></div>
      <h2 class="exam-question">${escapeHtml(question.stem)}</h2>
      <div class="exam-option-list">${question.options.map((option, index) => `<button class="exam-option ${selected === index ? 'selected' : ''}" type="button" data-choice="${index}"><span class="option-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span></button>`).join('')}</div>
      <div class="quiz-actions"><span class="muted" style="font-size:11px">${Object.keys(state.answers).length} / ${total} 已作答</span><div class="row-wrap">${state.index > 0 ? '<button class="btn btn-ghost btn-sm" type="button" data-prev>上一题</button>' : ''}${state.index + 1 < total ? `<button class="btn btn-primary btn-sm" type="button" data-next ${selected === undefined ? 'disabled' : ''}>下一题</button>` : `<button class="btn btn-primary btn-sm" type="button" data-submit ${Object.keys(state.answers).length < total ? 'disabled' : ''}>提交本轮</button>`}</div></div>
    </div>
  </div>`;
}

function resultMarkup() {
  const result = state.result;
  const wrong = (result.details || []).filter((item) => !item.correct);
  const affected = new Set((result.chapterResults || []).map((item) => item.chapter));
  const affectedChapters = (result.status?.chapters || []).filter((chapter) => affected.has(chapter.id));
  return `<div class="quiz-shell exam-result-page">
    <div class="quiz-result card card-pad">
      <div class="page-eyebrow" style="justify-content:center">${icon('trophy', 14)} ROUND COMPLETE</div>
      <div class="result-score">${result.correct}/${result.total}</div>
      <div class="result-label">${result.mode === 'exam' ? '考试正确数' : result.passed ? '学习关卡通过' : '学习关卡未通过'}</div>
      <div class="result-stats"><div><b>${result.accuracy}%</b><span class="muted">正确率</span></div><div><b>${result.chapterResults?.length || 0}</b><span class="muted">涉及板块</span></div><div><b>${result.passed ? '通过' : '继续'}</b><span class="muted">状态</span></div></div>
      <p class="muted" style="font-size:12px;line-height:1.7">${result.mode === 'exam' ? '考试只对自己可见；各板块评级已按最近 50 题动态更新。' : result.passed ? '本板块已标记为“已学习”。继续完成至少 8 个板块即可解锁综合考试。' : '本板块暂未通过，建议先回到课程复习，再重新挑战 10 题。'}</p>
      <div class="row-wrap" style="justify-content:center;margin-top:16px"><button class="btn btn-primary" type="button" data-back>${icon('arrowLeft', 15)} 返回学习考试</button><a class="btn btn-secondary" href="#/review">${icon('bookOpen', 15)} 查看错题本</a></div>
    </div>
    ${affectedChapters.length ? `<section class="card card-pad exam-rating-update"><h2 class="section-title" style="font-size:16px">章节评级更新</h2><div class="exam-rating-grid">${affectedChapters.map((chapter) => `<div><b>${escapeHtml(localizedName(chapter))}</b><span>${escapeHtml(chapter.statusLabel)} · ${escapeHtml(chapter.level)}</span><small>最近 ${chapter.sample} 题 · ${chapter.accuracy}%</small></div>`).join('')}</div></section>` : ''}
    ${wrong.length ? `<section class="card card-pad exam-wrong-list"><h2 class="section-title" style="font-size:16px">本轮错题 ${wrong.length} 道</h2>${wrong.map((item) => `<div class="exam-wrong-item"><b>${escapeHtml(item.stem || '')}</b><p>你的选择：${escapeHtml(item.options[item.selected] || '未选')} · 正确：${escapeHtml(item.options[item.answer] || '')}</p><small>${escapeHtml(item.explanation || '')}</small></div>`).join('')}</section>` : ''}
    ${medicalDisclaimer()}`;
}

async function backHome(el) {
  state.round = null; state.result = null; state.answers = {}; state.index = 0; state.mode = null; state.busy = false;
  state.status = await api.learningStatus();
  el.innerHTML = homeMarkup();
  bindHome(el);
}

function bindHome(el) {
  el.querySelectorAll('[data-learn]').forEach((button) => button.addEventListener('click', async () => {
    const chapter = button.dataset.learn;
    button.disabled = true;
    try {
      const round = await api.learningStart(chapter);
      state.mode = 'learn'; state.round = round; state.index = 0; state.answers = {}; state.result = null;
      el.innerHTML = runnerMarkup(); bindRunner(el);
    } catch (error) { toast(error.message || '无法开始学习', 'error'); button.disabled = false; }
  }));
  el.querySelector('[data-exam]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const round = await api.examStart();
      state.mode = 'exam'; state.round = round; state.index = 0; state.answers = {}; state.result = null;
      el.innerHTML = runnerMarkup(); bindRunner(el);
    } catch (error) { toast(error.message || '无法开始考试', 'error'); button.disabled = false; }
  });
}

function bindRunner(el) {
  el.querySelector('[data-exit]')?.addEventListener('click', () => backHome(el));
  el.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => {
    state.answers[state.round.questions[state.index].id] = Number(button.dataset.choice);
    el.innerHTML = runnerMarkup(); bindRunner(el);
  }));
  el.querySelector('[data-prev]')?.addEventListener('click', () => { if (state.index > 0) { state.index--; el.innerHTML = runnerMarkup(); bindRunner(el); } });
  el.querySelector('[data-next]')?.addEventListener('click', () => { if (state.answers[state.round.questions[state.index].id] !== undefined && state.index + 1 < state.round.questions.length) { state.index++; el.innerHTML = runnerMarkup(); bindRunner(el); } });
  el.querySelector('[data-submit]')?.addEventListener('click', async (event) => {
    if (state.busy) return;
    state.busy = true;
    const button = event.currentTarget; button.disabled = true; button.textContent = '评分中…';
    try {
      const result = await api.learningComplete(state.round.token, state.answers);
      state.result = result;
      const cache = store.diagnosesCache?.items || [];
      const sourceMap = Object.fromEntries(cache.map((item) => [item.id, item]));
      const chapterMap = Object.fromEntries(cache.map((item) => [item.id, item.chapter]));
      const wrongSources = [...new Set((result.details || []).filter((item) => !item.correct).map((item) => item.sourceId).filter(Boolean))];
      if (wrongSources.length) {
        const names = Object.fromEntries(wrongSources.map((id) => [id, sourceMap[id]?.name || id]));
        const chapters = Object.fromEntries(wrongSources.map((id) => [id, chapterMap[id] || '']));
        recordAttempt({ correct: false, correctIds: wrongSources, selectedIds: [], names, chapters });
      }
      el.innerHTML = resultMarkup();
      bindResult(el);
    } catch (error) {
      toast(error.message || '提交失败', 'error');
      state.busy = false;
      if (button.isConnected) { button.disabled = false; button.textContent = '提交本轮'; }
    }
  });
}

function bindResult(el) {
  el.querySelector('[data-back]')?.addEventListener('click', () => backHome(el));
}

export async function examView({ query } = {}) {
  const el = document.createElement('div');
  el.className = 'page exam-page';
  try {
    try { await store.getDiagnoses(); } catch { /* offline: use IDs as fallback */ }
    state.status = await api.learningStatus();
    el.innerHTML = homeMarkup();
    bindHome(el);
    const requestedChapter = String(query?.get('chapter') || '').trim();
    if (requestedChapter) {
      const button = el.querySelector(`[data-learn="${requestedChapter.replace(/[^a-z0-9_-]/gi, '')}"]`);
      if (button && query?.get('start') === '1') button.click();
      else if (button) button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } catch (error) {
    el.innerHTML = `<div class="error-panel">${escapeHtml(error.message || '学习状态加载失败')}</div>`;
  }
  return { el };
}
