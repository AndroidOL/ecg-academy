const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261110ac';
const { localizedName, getLocale, translate } = await import(`../i18n.js${__asset}`);
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { recordAttempt, questionSignature } = await import(`../study-store.js${__asset}`);
const { streamAi } = await import(`../ai-stream.js${__asset}`);
const { renderMarkdown } = await import(`../markdown.js${__asset}`);
const { hasByok } = await import(`../byok.js${__asset}`);
const { mountECG } = await import(`../ecg-renderer.js${__asset}`);
const { icon, escapeHtml, toast, setButtonLoading, medicalDisclaimer } = await import(`../ui.js${__asset}`);
const { levelFromXp, ADVANCED_UNLOCK, CHALLENGE_UNLOCK } = await import(`../levels.js${__asset}`);
const { buildReading, isStepCorrect } = await import(`../read-interpret.js${__asset}`);

function aiUiAvailable() {
  if (!store.user || store.user.isGuest) return false;
  return store.ai?.allowed !== false || (Boolean(store.ai?.byokEnabled) && hasByok());
}

const STEPS = [
  { id: 'rate', title: '1 · 频率', hint: '先看心室率：数 10 秒内 QRS 个数 × 6，或看节律条整体。' },
  { id: 'rhythm', title: '2 · 节律', hint: 'P 波是否存在？P 与 QRS 是否固定相关？节律是否整齐？' },
  { id: 'axis', title: '3 · 电轴', hint: 'I、aVF 导联主波方向：同向上为正常，相反为偏移。' },
  { id: 'intervals', title: '4 · 间期', hint: '测量 PR、QRS 与 QT；可多选全部异常项。', multi: true },
  { id: 'stt', title: '5 · ST-T 与 U 波', hint: '逐导联寻找 ST 抬高/压低、T 波形态改变与 U 波。', multi: true },
];

const STATS_KEY = 'ecg-read-stats';

function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
    return {
      cases: Number(raw.cases) || 0,
      stepsCorrect: Number(raw.stepsCorrect) || 0,
      stepsTotal: Number(raw.stepsTotal) || 0,
    };
  } catch {
    return { cases: 0, stepsCorrect: 0, stepsTotal: 0 };
  }
}

function saveStats(stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch { /* private mode */ }
}

function statsLabel() {
  const stats = loadStats();
  const rate = stats.stepsTotal ? Math.round((stats.stepsCorrect / stats.stepsTotal) * 100) : 0;
  return `已完成 ${stats.cases} 例 · 步骤正确率 ${rate}%`;
}

const LEVELS = [
  { id: 1, name: '基础', note: '单一诊断，常见图形' },
  { id: 2, name: '进阶', note: '不典型表现与鉴别', need: ADVANCED_UNLOCK },
  { id: 3, name: '挑战', note: '组合诊断与复杂图形', need: CHALLENGE_UNLOCK },
];

export async function readView({ query } = {}) {
  const el = document.createElement('div');
  el.className = 'page read-page';
  const userLevel = levelFromXp(Number(store.user?.xp || 0));

  const focus = String(query?.get('focus') || '').split(',').map((id) => id.trim()).filter(Boolean).slice(0, 8);
  const state = {
    focus,
    quiz: null,
    reading: null,
    level: 1,
    selections: {},
    results: {},
    submitted: false,
    result: null,
    startedAt: 0,
    viewer: null,
    timerId: 0,
  };

  el.innerHTML = `
    <header class="page-head">
      <div>
        <div class="page-eyebrow">${icon('target', 14)} SYSTEMATIC READING</div>
        <h1 class="page-title">系统判读训练</h1>
        <p class="page-sub">按「频率 → 节律 → 电轴 → 间期 → ST-T → 结论」的顺序读图，每一步即时反馈，最后再下诊断。用于建立不遗漏的判读习惯。</p>
      </div>
      <div class="row-wrap">
        <span class="badge badge-brand">${icon('activity', 11)} 结构化 5 步</span>
        ${focus.length ? `<span class="badge badge-warn">专项 ${focus.length} 个诊断</span>` : ''}<span class="badge badge-brand" data-read-stats>${statsLabel()}</span><span class="badge">键盘 1–5 / Enter / N</span>
      </div>
    </header>
    <div class="read-layout">
      <section class="quiz-card read-ecg-card">
        <div class="row-wrap" style="justify-content:space-between;margin-bottom:8px">
          <div class="row-wrap" data-levels>${LEVELS.map((level) => {
            const freePractice = Boolean(level.need && userLevel < level.need);
            return `<button class="btn btn-xs ${level.id === state.level ? 'btn-primary' : 'btn-ghost'}" type="button" data-read-level="${level.id}" title="${escapeHtml(level.note)}${freePractice ? ` · Lv.${level.need} 后计分` : ''}">${level.name}${freePractice ? ' · 自由' : ''}</button>`;
          }).join('')}<span class="muted" style="font-size:9.5px">未解锁难度自由练习，不计分/不扣分</span></div>
          <div class="row-wrap"><span class="badge" data-quiz-meta>加载中…</span><button class="btn btn-xs btn-ghost" type="button" data-read-new>${icon('refresh', 12)} 换一例</button></div>
        </div>
        <div class="ecg-card" id="read-ecg">
          <div class="ecg-toolbar">
            <div class="ecg-toolbar-group"><span class="badge badge-brand">ECG</span><span class="ecg-toolbar-label">25 mm/s · 10 mm/mV</span></div>
            <div class="ecg-toolbar-group">
              <button class="ecg-tab active" type="button" data-read-rhythm>节律条</button>
              <button class="ecg-tab" type="button" data-read-12lead>12 导联</button>
              <button class="btn btn-xs btn-secondary" type="button" data-read-play>播放</button>
            </div>
          </div>
          <div id="read-ecg-canvas"></div>
          <div class="ecg-meta"><span>HR <b>—</b> 请自行测量</span><span>PR / QRS / QT 请结合图形判断</span></div>
        </div>
        <div class="read-loading" data-read-loading>${icon('activity', 14)} 正在生成病例…</div>
      </section>
      <div class="read-steps" data-steps></div>
      <section class="quiz-card read-conclusion" data-conclusion></section>
      <div class="read-feedback" data-read-feedback></div>
    </div>
    ${medicalDisclaimer()}
  `;

  const stepsHost = el.querySelector('[data-steps]');
  const conclusionHost = el.querySelector('[data-conclusion]');
  const feedbackHost = el.querySelector('[data-read-feedback]');
  const loading = el.querySelector('[data-read-loading]');
  const metaBadge = el.querySelector('[data-quiz-meta]');

  async function loadQuiz(level = state.level) {
    destroyViewer();
    state.level = level;
    state.quiz = null;
    state.reading = null;
    state.selections = {};
    state.results = {};
    state.submitted = false;
    state.result = null;
    loading.style.display = '';
    stepsHost.innerHTML = '';
    conclusionHost.innerHTML = '';
    feedbackHost.innerHTML = '';
    metaBadge.textContent = '加载中…';
    el.querySelectorAll('[data-read-level]').forEach((button) => {
      button.classList.toggle('btn-primary', Number(button.dataset.readLevel) === level);
      button.classList.toggle('btn-ghost', Number(button.dataset.readLevel) !== level);
    });
    try {
      const quiz = await api.quizNew({ level, ...(state.focus.length ? { focus: state.focus } : {}) });
      state.quiz = quiz;
      state.reading = buildReading(quiz.spec || {});
      state.startedAt = performance.now();
      metaBadge.textContent = `${quiz.level >= 3 ? '挑战' : quiz.level === 2 ? '进阶' : '基础'} · ${quiz.multiple ? '组合诊断' : '单一诊断'}`;
      loading.style.display = 'none';
      mountViewer(quiz);
      renderSteps();
      renderConclusion();
      startTimer();
    } catch (error) {
      loading.textContent = error.message || '病例加载失败';
      toast(error.message || '病例加载失败', 'error');
    }
  }

  function mountViewer(quiz) {
    const viewerRoot = el.querySelector('#read-ecg-canvas');
    state.viewer = mountECG(viewerRoot, quiz.spec, { mode: 'rhythm', speed: 1, showAnnotations: false, showSummary: false, autoPlay: false });
    const playControl = el.querySelector('[data-read-play]');
    viewerRoot.addEventListener('ecg:play', () => { playControl.textContent = '暂停'; });
    viewerRoot.addEventListener('ecg:pause', () => { playControl.textContent = '播放'; });
    viewerRoot.addEventListener('ecg:ended', () => { playControl.textContent = '播放'; });
    playControl.onclick = () => {
      if (!state.viewer) return;
      if (state.viewer.playing) state.viewer.pause(); else state.viewer.play(1);
      playControl.textContent = state.viewer.playing ? '暂停' : '播放';
    };
    el.querySelector('[data-read-rhythm]').onclick = () => {
      state.viewer?.setMode('rhythm');
      el.querySelector('#read-ecg').classList.remove('is-12lead');
      el.querySelector('[data-read-rhythm]').classList.add('active');
      el.querySelector('[data-read-12lead]').classList.remove('active');
    };
    el.querySelector('[data-read-12lead]').onclick = () => {
      state.viewer?.setMode('12lead');
      el.querySelector('#read-ecg').classList.add('is-12lead');
      el.querySelector('[data-read-12lead]').classList.add('active');
      el.querySelector('[data-read-rhythm]').classList.remove('active');
    };
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.timerId = window.setInterval(() => {
      if (state.submitted || !state.quiz) return;
      const node = el.querySelector('[data-read-elapsed]');
      if (node) node.textContent = `${Math.round((performance.now() - state.startedAt) / 1000)}s`;
    }, 1000);
  }

  function renderSteps() {
    const reading = state.reading;
    stepsHost.innerHTML = STEPS.map((step) => {
      const options = reading.options[step.id];
      return `<section class="quiz-card read-step" data-step-card="${step.id}">
        <div class="read-step-head"><div><div class="page-eyebrow">STEP ${step.id === 'rate' ? '1' : step.id === 'rhythm' ? '2' : step.id === 'axis' ? '3' : step.id === 'intervals' ? '4' : '5'}</div><h3>${step.title}</h3><p class="muted">${step.hint}</p></div><span class="badge" data-step-status="${step.id}">待作答</span></div>
        <div class="read-options" data-step-options="${step.id}">
          ${options.map((option) => `<button class="read-option" type="button" data-step="${step.id}" data-value="${escapeHtml(option.id)}"><span>${escapeHtml(option.label)}</span></button>`).join('')}
        </div>
        ${step.multi ? `<button class="btn btn-secondary btn-sm" type="button" data-step-confirm="${step.id}" disabled>${icon('check', 13)} 确认本步</button>` : ''}
        <div class="read-step-note" role="status" aria-live="polite" data-step-note="${step.id}"></div>
      </section>`;
    }).join('');

    stepsHost.querySelectorAll('.read-option').forEach((button) => {
      button.addEventListener('click', () => {
        if (state.submitted || state.results[button.dataset.step] !== undefined) return;
        const step = STEPS.find((item) => item.id === button.dataset.step);
        if (!step.multi) {
          state.selections[step.id] = new Set([button.dataset.value]);
          evaluateStep(step);
          return;
        }
        const set = state.selections[step.id] || new Set();
        if (set.has(button.dataset.value)) set.delete(button.dataset.value);
        else set.add(button.dataset.value);
        if (button.dataset.value === 'none') {
          if (set.has('none')) {
            set.clear();
            set.add('none');
          }
        } else {
          set.delete('none');
        }
        state.selections[step.id] = set;
        button.closest('.read-options').querySelectorAll('.read-option').forEach((node) => {
          node.classList.toggle('selected', set.has(node.dataset.value));
        });
        const confirm = stepsHost.querySelector(`[data-step-confirm="${step.id}"]`);
        if (confirm) confirm.disabled = set.size === 0;
      });
    });

    stepsHost.querySelectorAll('[data-step-confirm]').forEach((button) => {
      button.addEventListener('click', () => {
        const step = STEPS.find((item) => item.id === button.dataset.stepConfirm);
        if (!step || !state.selections[step.id]?.size) return;
        evaluateStep(step);
      });
    });
  }

  function evaluateStep(step) {
    const reading = state.reading;
    const selection = state.selections[step.id] || new Set();
    const correct = isStepCorrect(reading[step.id], selection);
    state.results[step.id] = correct;
    const card = stepsHost.querySelector(`[data-step-card="${step.id}"]`);
    const status = card.querySelector(`[data-step-status="${step.id}"]`);
    status.textContent = correct ? '正确' : '需复习';
    status.className = `badge ${correct ? 'badge-ok' : 'badge-danger'}`;
    card.querySelectorAll('.read-option').forEach((node) => {
      const expected = reading[step.id].answer.includes(node.dataset.value);
      const chosen = selection.has(node.dataset.value);
      node.disabled = true;
      node.classList.toggle('is-correct', expected);
      node.classList.toggle('is-wrong', chosen && !expected);
    });
    const confirm = card.querySelector('[data-step-confirm]');
    if (confirm) confirm.disabled = true;
    const note = card.querySelector(`[data-step-note="${step.id}"]`);
    note.classList.add('show', correct ? 'ok' : 'bad');
    note.innerHTML = `<b>${correct ? '判断正确' : '再看一次'}</b><p>${escapeHtml(reading[step.id].explanation)}</p>`;
  }

  function renderConclusion() {
    const quiz = state.quiz;
    conclusionHost.innerHTML = `<div class="read-conclusion-head"><div><div class="page-eyebrow">STEP 6</div><h3>6 · 结论</h3><p class="muted">综合前面五步，选择最可能的诊断。提交后由服务端判分并记录到练习数据。</p></div><span class="badge">已用时 <b data-read-elapsed>0s</b></span></div>
      <div class="option-list read-diagnosis" data-diagnosis-options>
        ${quiz.options.map((option, index) => `<label class="option-card" data-diagnosis="${escapeHtml(option.id)}">
          <input type="${quiz.multiple ? 'checkbox' : 'radio'}" name="read-diagnosis" value="${escapeHtml(option.id)}">
          <span class="option-letter">${'ABCDE'[index] || index + 1}</span>
          <span class="option-text">${escapeHtml(localizedName(option))}</span>
          <span class="option-note">${escapeHtml(option.chapter || '')}</span>
        </label>`).join('')}
      </div>
      <div class="quiz-actions"><span class="muted" style="font-size:11px">${quiz.multiple ? '可选择多个诊断。' : '选择一个最可能的诊断。'}</span><button class="btn btn-primary" type="button" data-read-submit disabled>${icon('check', 15)} 提交诊断</button></div>`;

    const selected = new Set();
    const submit = conclusionHost.querySelector('[data-read-submit]');
    conclusionHost.querySelectorAll('[data-diagnosis]').forEach((label) => {
      label.addEventListener('click', (event) => {
        if (state.submitted) { event.preventDefault(); return; }
        const input = label.querySelector('input');
        const id = label.dataset.diagnosis;
        if (!quiz.multiple) {
          selected.clear();
          selected.add(id);
          conclusionHost.querySelectorAll('[data-diagnosis]').forEach((node) => {
            node.classList.toggle('selected', node === label);
            const box = node.querySelector('input');
            if (box) box.checked = node === label;
          });
        } else {
          if (selected.has(id)) selected.delete(id); else selected.add(id);
          if (input) input.checked = selected.has(id);
          label.classList.toggle('selected', selected.has(id));
        }
        submit.disabled = selected.size === 0;
      });
    });
    conclusionHost.dataset.selection = '';
    submit.addEventListener('click', async () => {
      if (state.submitted || !selected.size) return;
      state.submitted = true;
      setButtonLoading(submit, true, '判分中');
      try {
        const result = await api.quizAnswer(quiz.attemptId, [...selected], Math.round(performance.now() - state.startedAt), levelFromXp(Number(store.user?.xp || 0)));
        const localized = (id) => localizedName((quiz.options || []).find((option) => option.id === id) || {});
        result.correctNames = (result.correctIds || []).map(localized);
        result.selectedNames = [...selected].map(localized);
        if (getLocale() === 'en') {
          const primary = (result.explanation || [])[0] || {};
          const clue = translate(primary.specificity || primary.oneLiner || '');
          const criterion = translate((primary.criteria || [])[0] || '');
          result.localExplanation = result.correct
            ? `Correct. Key clue: ${clue}`
            : `Correct answer: ${result.correctNames.join(', ')}. ${result.partial ? 'Your diagnosis combination is incomplete.' : 'Your selection does not match.'} Key clue: ${clue}${criterion ? ` Review the criteria: ${criterion}` : ''}`;
        }
        state.result = result;
        clearInterval(state.timerId);
        const names = Object.fromEntries((quiz.options || []).map((option) => [option.id, option.name]));
        const chapters = Object.fromEntries((quiz.options || []).map((option) => [option.id, option.chapter]));
        recordAttempt({
          correct: result.correct,
          slow: Boolean(result.slow),
          correctIds: result.correctIds || [],
          selectedIds: [...selected],
          names,
          chapters,
          source: 'read',
          questionKey: questionSignature((quiz.options || []).map((option) => option.id), result.correctIds || []),
          questionText: quiz.stem || quiz.question || '',
        });
        const stepTotal = STEPS.length;
        const stepHits = STEPS.filter((step) => state.results[step.id] === true).length;
        const stats = loadStats();
        stats.cases += 1;
        stats.stepsCorrect += stepHits;
        stats.stepsTotal += stepTotal;
        saveStats(stats);
        const statsNode = el.querySelector('[data-read-stats]');
        if (statsNode) statsNode.textContent = statsLabel();
        store.applyXp(result.xp);
        conclusionHost.querySelectorAll('[data-diagnosis]').forEach((label) => {
          const id = label.dataset.diagnosis;
          label.classList.remove('selected');
          label.querySelector('input').disabled = true;
          if ((result.correctIds || []).includes(id)) label.classList.add('correct');
          else if (selected.has(id)) label.classList.add('wrong');
        });
        setButtonLoading(submit, false);
        submit.style.display = 'none';
        renderFeedback(result, quiz, selected);
      } catch (error) {
        state.submitted = false;
        setButtonLoading(submit, false);
        toast(error.message || '判分失败', 'error');
      }
    });
  }

  function renderFeedback(result, quiz, selected) {
    const stepIds = STEPS.map((step) => step.id);
    const stepCorrect = stepIds.filter((id) => state.results[id] === true).length;
    const stepDone = stepIds.filter((id) => state.results[id] !== undefined).length;
    const answer = (result.correctIds || []).map((id) => localizedName(quiz.options.find((option) => option.id === id))).filter(Boolean).join('、');
    const selectedNames = [...selected].map((id) => localizedName(quiz.options.find((option) => option.id === id))).filter(Boolean).join('、');
    const freePractice = result.unlocked === false;
    feedbackHost.innerHTML = `<div class="quiz-feedback ${result.correct ? '' : 'is-bad'}">
      <div class="feedback-head"><span class="feedback-icon ${result.correct ? '' : 'bad'}">${icon(result.correct ? 'check' : 'x', 16)}</span><div><div class="feedback-title">${result.correct ? '结论正确' : '结论需要修正'}${freePractice ? ' · 自由练习' : ''}</div><div class="muted" style="font-size:10px">${freePractice ? `自由练习：本题不计分、不扣分；Lv.${result.unlockLevel || '—'} 后按正常规则计分` : `本题得分 ${result.score ?? '—'}${result.correct && result.slow ? '（慢答 ×0.7）' : !result.correct && result.partial ? '（部分正确）' : !result.correct ? '（答错按 4× 扣分）' : ''}`} · 用时 ${Math.round((result.timeMs || 0) / 1000)} 秒${freePractice ? '' : ` · 经验 ${Number(result.xp) > 0 ? '+' : ''}${result.xp}`}${result.slow ? ' · 判读偏慢' : ''}</div></div></div>
      <div class="read-score-row">
        <div class="read-score"><b>${stepCorrect} / ${stepIds.length}</b><span>结构化步骤正确</span></div>
        <div class="read-score"><b>${stepDone} / ${stepIds.length}</b><span>已完成步骤</span></div>
        <div class="read-score"><b>${result.correct ? '✓' : '✗'}</b><span>最终诊断</span></div>
      </div>
      <p class="feedback-text">你的选择：${escapeHtml(selectedNames || '—')}${answer ? ` · 正确答案：${escapeHtml(answer)}` : ''}</p>
      <p class="feedback-text">${escapeHtml(result.localExplanation || '')}</p>
      ${stepDone < stepIds.length ? '<p class="muted" style="font-size:11px">还有步骤未作答；下一例建议按 1→6 的顺序完整读图。</p>' : ''}
      <div class="row-wrap" style="margin-top:4px">${(result.correctIds || []).map((id) => `<a class="btn btn-secondary btn-sm" href="#/learn/${encodeURIComponent(id)}">${icon('book', 13)} 学习「${escapeHtml(localizedName(quiz.options.find((option) => option.id === id) || {}) || id)}」</a>`).join('')}</div>
      <div class="quiz-actions"><button class="btn btn-primary" type="button" data-read-next>${icon('arrowRight', 14)} 下一例</button>${aiUiAvailable() ? `<button class="btn btn-secondary" type="button" data-read-ai>${icon('sparkles', 14)} AI 解释本例</button>` : ''}<a class="btn btn-ghost" href="#/review">${icon('bookOpen', 14)} 查看错题本</a></div>
      <div data-read-ai-panel></div>
    </div>`;
    feedbackHost.querySelector('[data-read-next]')?.addEventListener('click', () => loadQuiz(state.level));
    feedbackHost.querySelector('[data-read-ai]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (button.disabled || !result.attemptId) return;
      const panel = feedbackHost.querySelector('[data-read-ai-panel]');
      panel.innerHTML = '<div class="explain-block ai-answer"><h4>AI 解析本例</h4><div class="ai-context" data-ai-context></div><div class="ai-stream-text ai-thinking" data-ai-stream>正在生成…</div><div class="ai-meta" data-ai-cost></div></div>';
      const streamHost = panel.querySelector('[data-ai-stream]');
      const contextHost = panel.querySelector('[data-ai-context]');
      const costHost = panel.querySelector('[data-ai-cost]');
      setButtonLoading(button, true, '生成中');
      try {
        await streamAi({ mode: 'explain', attemptId: result.attemptId }, {
          onMeta: (meta) => { contextHost.innerHTML = (meta?.context || []).map((item) => `<span>${escapeHtml(item)}</span>`).join(''); },
          onDelta: (chunk, text) => { streamHost.classList.remove('ai-thinking'); streamHost.innerHTML = renderMarkdown(text); },
          onDone: (done, text) => {
            const heading = panel.querySelector('h4');
            if (heading && done?.fallback) heading.textContent = '本地解析';
            streamHost.remove();
            panel.querySelector('.explain-block').insertAdjacentHTML('beforeend', renderMarkdown(text));
            if (done?.cost) costHost.textContent = `${done.cost.model || ''} · ${done.cost.prompt || 0}→${done.cost.completion || 0} tokens${done.cost.cost ? ` · ${done.cost.currency || ''}${done.cost.cost}` : ''}${done.cost.discount ? ` · ${done.cost.discount}` : ''}`;
          },
        });
      } catch (error) {
        streamHost.classList.remove('ai-thinking');
        streamHost.textContent = error.message || 'AI 解析失败';
      } finally {
        setButtonLoading(button, false);
      }
    });
    feedbackHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function destroyViewer() {
    try { state.viewer?.destroy?.(); } catch { /* already gone */ }
    state.viewer = null;
  }

  el.querySelectorAll('[data-read-level]').forEach((button) => {
    button.addEventListener('click', () => {
      const level = Number(button.dataset.readLevel);
      if (level === state.level) return;
      loadQuiz(level);
    });
  });
  el.querySelector('[data-read-new]')?.addEventListener('click', () => loadQuiz(state.level));

  const onKey = (event) => {
    if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (document.getElementById('modal-root')?.children.length) return;
    if (state.submitted) {
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        feedbackHost.querySelector('[data-read-next]')?.click();
      }
      return;
    }
    const pending = STEPS.find((step) => state.results[step.id] === undefined);
    if (/^[1-5]$/.test(event.key) && pending) {
      const options = stepsHost.querySelectorAll(`[data-step-options="${pending.id}"] .read-option`);
      const option = options[Number(event.key) - 1];
      if (option) {
        event.preventDefault();
        option.click();
      }
      return;
    }
    if (event.key === 'Enter') {
      if (pending?.multi) {
        const confirm = stepsHost.querySelector(`[data-step-confirm="${pending.id}"]`);
        if (confirm && !confirm.disabled) {
          event.preventDefault();
          confirm.click();
          return;
        }
      }
      const submit = conclusionHost.querySelector('[data-read-submit]');
      if (submit && !submit.disabled) {
        event.preventDefault();
        submit.click();
      }
    }
  };
  document.addEventListener('keydown', onKey);

  await loadQuiz(1);

  return {
    el,
    destroy() {
      clearInterval(state.timerId);
      document.removeEventListener('keydown', onKey);
      destroyViewer();
    },
  };
}
