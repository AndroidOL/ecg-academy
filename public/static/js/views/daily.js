
const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261109aj';
const { localizedName } = await import(`../i18n.js${__asset}`);
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { navigate } = await import(`../router.js${__asset}`);
const { icon, escapeHtml, toast, medicalDisclaimer } = await import(`../ui.js${__asset}`);
const { mountECG } = await import(`../ecg-renderer.js${__asset}`);

const state = {
  status: null,
  mode: 'home',
  round: null,
  index: 0,
  answers: {},
  times: {},
  questionStart: 0,
  viewMode: 'rhythm',
  result: null,
  viewer: null,
  timerId: null,
  busy: false,
};

function clearTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function destroyViewer() {
  if (state.viewer) {
    state.viewer.destroy();
    state.viewer = null;
  }
}

function fmtClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function calendarMarkup(history) {
  const cells = (history || []).map((day) => {
    const date = new Date(`${day.day}T00:00:00`);
    const isToday = day.day === state.status?.day || day.day === state.result?.day;
    const label = `${date.getMonth() + 1}月${date.getDate()}日 ${day.done ? `已完成 ${day.correct}/${day.total}` : '未完成'}`;
    return `<div class="day-cell ${day.done ? 'done' : ''} ${isToday ? 'today' : ''}" title="${escapeHtml(label)}">
      <span>${date.getDate()}</span>
      ${day.done ? `<i class="day-dot"></i>` : ''}
    </div>`;
  }).join('');
  return `<div class="daily-calendar-grid" role="list" aria-label="最近 28 天打卡记录">${cells}</div>
    <div class="daily-calendar-legend"><span><i class="day-dot"></i> 已完成</span><span>右端为今天</span></div>`;
}

function homeMarkup() {
  const status = state.status || {};
  const done = status.done === true;
  const result = status.result || null;
  const streak = Number(status.streak || 0);
  const best = Number(status.bestStreak || 0);
  const totalDays = Number(status.totalDays || 0);
  return `<header class="page-head">
      <div><div class="page-eyebrow">${icon('flame', 14)} DAILY CHALLENGE</div><h1 class="page-title">每日挑战</h1><p class="page-sub">每天 10 道心电图判读题，全站使用同一套题；每天只能完成一次，连续完成累计打卡。作答与判分在服务端完成，不占用每日练习的测试分。</p></div>
      <div class="row-wrap">
        <span class="badge badge-brand">${icon('flame', 12)} 连续 ${streak} 天</span>
        <span class="badge">最佳 ${best} 天</span>
        <span class="badge">累计 ${totalDays} 天</span>
      </div>
    </header>
    <section class="daily-hero card card-pad ${done ? 'is-done' : ''}">
      <div class="daily-hero-main">
        <div class="daily-flame" aria-hidden="true">${icon('flame', 34)}</div>
        <div>
          <div class="page-eyebrow">${done ? 'TODAY COMPLETE' : 'TODAY'}</div>
          <h2 class="daily-hero-title">${done ? '今日已打卡' : '今天的 10 题在等你'}</h2>
          <p class="muted">${done && result ? `答对 ${result.correct}/${result.total} · 得分 ${result.score} · +${result.xp} XP` : '坚持每天 10 分钟，保持判读手感。连续完成会累计打卡天数。'}</p>
          <div class="daily-hero-streak"><b>${streak}</b><span>连续打卡天数</span></div>
        </div>
      </div>
      <div class="daily-hero-actions">
        ${done
          ? `<button class="btn btn-secondary" type="button" data-review>${icon('bookOpen', 15)} 查看今日复盘</button>`
          : `<button class="btn btn-primary btn-lg" type="button" data-start>${icon('flame', 17)} 开始今日挑战</button>
             <span class="daily-hero-hint">10 题 · 约 5 分钟 · 每天一次</span>`}
      </div>
    </section>
    <section class="card card-pad daily-calendar-card">
      <div class="section-head"><div><div class="page-eyebrow">CHECK-IN</div><h2 class="section-title">最近 28 天</h2></div><span class="section-kicker">周末也不中断</span></div>
      ${calendarMarkup(status.history || [])}
    </section>
    ${done && result ? resultDetailMarkup(result) : ''}
    ${medicalDisclaimer()}`;
}

function resultDetailMarkup(result) {
  const items = (result.details || []).map((detail, index) => {
    const tone = detail.correct ? 'ok' : detail.partial ? 'warn' : 'bad';
    const chosen = (detail.selectedNames || []).join('、') || '未作答';
    const correct = (detail.correctNames || []).join('、');
    const notes = (detail.notes || []).map((note) => `${note.name}：${note.oneLiner}`).join(' ');
    return `<div class="daily-review-item ${tone}">
      <div class="daily-review-head"><span class="badge ${detail.correct ? 'badge-ok' : detail.partial ? 'badge-warn' : 'badge-danger'}">${detail.correct ? '正确' : detail.partial ? '部分正确' : '错误'}</span>${detail.slow ? '<span class="badge badge-warn">不熟练 · &gt;15s</span>' : ''}<span class="muted">第 ${index + 1} 题 · ${fmtClock(detail.timeMs || 0)}</span></div>
      <p class="daily-review-q">${escapeHtml(detail.stem || detail.question || '该心电图最可能的诊断是？')}</p>
      <p class="daily-review-a">你的答案：${escapeHtml(chosen)} · 正确答案：<b>${escapeHtml(correct)}</b></p>
      ${notes ? `<p class="daily-review-note">${escapeHtml(notes)}</p>` : ''}
    </div>`;
  }).join('');
  return `<section class="card card-pad daily-review-card">
      <div class="section-head"><div><div class="page-eyebrow">REVIEW</div><h2 class="section-title">今日复盘</h2></div><span class="badge badge-brand">${result.correct}/${result.total} · ${result.score} 分</span></div>
      ${items}
    </section>`;
}

function runnerMarkup() {
  const round = state.round;
  const question = round.questions[state.index];
  const total = round.questions.length;
  const multiple = question.multiple;
  const selected = new Set(state.answers[question.id] || []);
  const progress = Math.round((state.index / total) * 100);
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  return `<div class="quiz-shell daily-runner">
    <div class="quiz-top">
      <button class="btn btn-ghost btn-sm" type="button" data-exit>${icon('arrowLeft', 14)} 退出</button>
      <div class="quiz-progress"><span>每日挑战</span><span class="progress"><span class="progress-bar" style="width:${progress}%"></span></span><span>第 <b>${state.index + 1}</b> / ${total} 题</span><span class="timer">${icon('timer', 12)} <b data-timer>00:00</b></span></div>
    </div>
    <div class="practice-setup">
      <section class="quiz-card">
        <div class="row-wrap" style="justify-content:space-between;margin-bottom:8px">
          <span class="badge badge-brand">${question.level >= 3 ? '组合挑战' : question.level === 2 ? '进阶' : '基础'}</span>
          <span class="badge">${multiple ? '多选' : '单选'} · 全站同题</span>
        </div>
        <div class="ecg-card" id="daily-ecg">
          <div class="ecg-toolbar">
            <div class="ecg-toolbar-group"><span class="badge badge-brand">ECG</span><span class="ecg-toolbar-label">25 mm/s · 10 mm/mV</span></div>
            <div class="ecg-toolbar-group">${question.spec?.show12Lead ? '<button class="ecg-tab" type="button" data-daily-12lead>12 导联</button>' : ''}<button class="ecg-tab active" type="button" data-daily-rhythm>节律条</button><button class="btn btn-xs btn-secondary" type="button" data-daily-play>播放</button></div>
          </div>
          <div id="daily-ecg-canvas"></div>
          <div class="ecg-meta"><span>HR <b>—</b> 请自行测量</span><span>PR/QRS/QT 请结合图形判断</span></div>
        </div>
        <h2 class="quiz-question">${escapeHtml(question.question || '该心电图最可能的诊断是？')}</h2>
        ${question.stem ? `<p class="quiz-stem">${escapeHtml(question.stem)}</p>` : ''}
        <div class="option-list" data-options>
          ${question.options.map((option, i) => `<label class="option-card ${selected.has(option.id) ? 'selected' : ''}" data-option="${escapeHtml(option.id)}">
            <input type="${multiple ? 'checkbox' : 'radio'}" name="daily-option" value="${escapeHtml(option.id)}" ${selected.has(option.id) ? 'checked' : ''}>
            <span class="option-letter">${letters[i] || i + 1}</span>
            <span class="option-text">${escapeHtml(localizedName(option))}</span>
            <span class="option-note">${escapeHtml(option.chapter || '')}</span>
          </label>`).join('')}
        </div>
        <div class="quiz-actions">
          <span class="muted" style="font-size:11px">${multiple ? '选择所有符合的诊断后再继续。' : '选择一个最可能的诊断。'}</span>
          <div class="row-wrap">
            ${state.index > 0 ? '<button class="btn btn-ghost btn-sm" type="button" data-prev>上一题</button>' : ''}
            ${state.index + 1 < total
              ? `<button class="btn btn-primary btn-sm" type="button" data-next ${selected.size === 0 ? 'disabled' : ''}>下一题</button>`
              : `<button class="btn btn-primary btn-sm" type="button" data-submit ${selected.size === 0 || state.busy ? 'disabled' : ''}>提交今日挑战</button>`}
          </div>
        </div>
      </section>
      <aside class="stack">
        <div class="practice-side-card">
          <h3>今日进度</h3>
          <div class="practice-stats">
            <div class="practice-stat"><b>${state.index + 1}</b><span>当前题</span></div>
            <div class="practice-stat"><b>${Object.keys(state.answers).length}</b><span>已作答</span></div>
            <div class="practice-stat"><b>${Number(state.status?.streak || 0)}</b><span>连续天数</span></div>
          </div>
        </div>
        <div class="practice-side-card">
          <h3>规则</h3>
          <p>10 题，全部作答后提交。每题按难度计分，答得快有少量加成；多选支持部分分。提交后今天不能再次挑战。</p>
          <p class="muted" style="margin-top:6px;font-size:11px">每日挑战独立计分，不写入测试分与排行榜。</p>
        </div>
      </aside>
    </div>
  </div>`;
}

function mountQuestionViewer(el) {
  destroyViewer();
  const question = state.round?.questions?.[state.index];
  const root = el.querySelector('#daily-ecg-canvas');
  if (!question || !root) return;
  state.viewMode = 'rhythm';
  state.viewer = mountECG(root, question.spec, {
    mode: 'rhythm', speed: 1, showAnnotations: false, showSummary: false, autoPlay: false,
  });
  root.addEventListener('ecg:play', syncPlayControl);
  root.addEventListener('ecg:pause', syncPlayControl);
  root.addEventListener('ecg:ended', syncPlayControl);
  syncPlayControl();
}

function syncPlayControl() {
  const control = document.querySelector('[data-daily-play]');
  if (control) control.textContent = state.viewer?.playing ? '暂停' : '播放';
}

function bindRunner(el) {
  clearTimer();
  state.questionStart = performance.now();
  state.timerId = window.setInterval(() => {
    const node = el.querySelector('[data-timer]');
    if (node) node.textContent = fmtClock(performance.now() - state.questionStart);
  }, 1000);

  const options = [...el.querySelectorAll('[data-option]')];
  const question = state.round.questions[state.index];
  const multiple = question.multiple;
  const syncSelection = () => {
    const chosen = new Set(state.answers[question.id] || []);
    options.forEach((option) => {
      const id = option.dataset.option;
      const input = option.querySelector('input');
      option.classList.toggle('selected', chosen.has(id));
      if (input) input.checked = chosen.has(id);
    });
    const primary = el.querySelector('[data-next], [data-submit]');
    if (primary) primary.disabled = chosen.size === 0 || state.busy;
  };
  options.forEach((option) => {
    option.addEventListener('click', (event) => {
      event.preventDefault();
      const id = option.dataset.option;
      const current = new Set(state.answers[question.id] || []);
      if (multiple) {
        if (current.has(id)) current.delete(id);
        else current.add(id);
      } else {
        current.clear();
        current.add(id);
      }
      state.answers[question.id] = [...current];
      syncSelection();
    });
  });
  syncSelection();

  el.querySelector('[data-daily-play]')?.addEventListener('click', () => {
    if (!state.viewer) return;
    if (state.viewer.playing) state.viewer.pause();
    else state.viewer.play(1);
  });
  el.querySelector('[data-daily-12lead]')?.addEventListener('click', (event) => {
    state.viewMode = state.viewMode === '12lead' ? 'rhythm' : '12lead';
    state.viewer?.setMode(state.viewMode);
    event.currentTarget.classList.toggle('active', state.viewMode === '12lead');
    el.querySelector('[data-daily-rhythm]')?.classList.toggle('active', state.viewMode === 'rhythm');
  });
  el.querySelector('[data-daily-rhythm]')?.addEventListener('click', () => {
    state.viewMode = 'rhythm';
    state.viewer?.setMode('rhythm');
    el.querySelector('[data-daily-12lead]')?.classList.remove('active');
    el.querySelector('[data-daily-rhythm]')?.classList.add('active');
  });
  el.querySelector('[data-exit]')?.addEventListener('click', () => {
    if (!window.confirm('退出今日挑战？本轮进度不会保存（今天仍可重新开始）。')) return;
    state.mode = 'home';
    render(el);
  });
  el.querySelector('[data-prev]')?.addEventListener('click', () => {
    saveCurrentTime();
    if (state.index > 0) {
      state.index--;
      render(el);
    }
  });
  el.querySelector('[data-next]')?.addEventListener('click', () => {
    saveCurrentTime();
    if (state.index + 1 < state.round.questions.length) {
      state.index++;
      render(el);
    }
  });
  el.querySelector('[data-submit]')?.addEventListener('click', async (event) => {
    if (state.busy) return;
    saveCurrentTime();
    const missing = state.round.questions.filter((q) => (state.answers[q.id] || []).length === 0);
    if (missing.length > 0) {
      toast(`还有 ${missing.length} 题未作答`, 'warn');
      return;
    }
    state.busy = true;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '判分中…';
    try {
      const answers = state.round.questions.map((q) => ({
        id: q.id,
        selected: state.answers[q.id] || [],
        timeMs: Math.round(state.times[q.id] || 0),
      }));
      const result = await api.dailyComplete(state.round.token, answers);
      if (result.isGuest) store.addLocalXp(result.xp);
      state.result = result;
      state.status = {
        ...(state.status || {}),
        done: true,
        result,
        streak: result.streak,
        bestStreak: result.bestStreak,
        totalDays: result.totalDays,
        history: result.history,
        day: result.day,
      };
      state.mode = 'result';
      render(el);
      toast(`打卡成功，连续 ${result.streak} 天`, 'success');
    } catch (error) {
      state.busy = false;
      toast(error.message || '提交失败', 'error');
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = '提交今日挑战';
      }
    }
  });
}

function saveCurrentTime() {
  const id = state.round?.questions?.[state.index]?.id;
  if (!id) return;
  state.times[id] = (state.times[id] || 0) + (performance.now() - state.questionStart);
  state.questionStart = performance.now();
}

function resultMarkup() {
  const result = state.result;
  const wrong = (result.details || []).filter((detail) => !detail.correct).length;
  return `<header class="page-head">
      <div><div class="page-eyebrow">${icon('flame', 14)} DAILY COMPLETE</div><h1 class="page-title">今日挑战完成</h1><p class="page-sub">成绩已记录，明天 00:00 后刷新新题。每日挑战独立计分，不影响测试分与排行榜。</p></div>
    </header>
    <section class="daily-result card card-pad">
      <div class="daily-result-score">${result.correct}<span>/${result.total}</span></div>
      <div class="daily-result-meta">
        <div><b>${result.score}</b><span>得分</span></div>
        <div><b>+${result.xp}</b><span>XP${result.isGuest ? '（本地）' : ''}</span></div>
        <div><b>${wrong}</b><span>错题</span></div>
        <div><b>${result.slow || 0}</b><span>不熟练</span></div>
        <div><b>${fmtClock(result.timeMs || 0)}</b><span>总用时</span></div>
      </div>
      <div class="daily-result-streak">${icon('flame', 17)} 连续打卡 <b>${result.streak}</b> 天 · 最佳 <b>${result.bestStreak}</b> 天</div>
      ${Number.isFinite(Number(result.aiCreditsGranted)) ? `<div class="callout brand" style="margin-top:12px">${icon('sparkles', 14)} AI 对话次数 +${result.aiCreditsGranted}，当前可用 ${result.aiCredits} 次。${result.aiCreditRule ? `<span class="muted">${escapeHtml(result.aiCreditRule)}</span>` : ''} <a href="#/ai">去 AI 导师</a></div>` : (result.isGuest ? '<div class="muted" style="font-size:10px;margin-top:8px">注册且达到 Lv.10 后，每日挑战可累积 AI 对话次数。</div>' : '')}
      <div class="row-wrap" style="justify-content:center;margin-top:14px">
        <button class="btn btn-secondary" type="button" data-home>${icon('arrowLeft', 15)} 返回每日挑战</button>
        <button class="btn btn-ghost" type="button" data-share>${icon('sparkles', 15)} 分享成绩</button>
        <a class="btn btn-ghost" href="#/practice">${icon('activity', 15)} 去练习</a>
      </div>
    </section>
    <section class="card card-pad daily-calendar-card">
      <div class="section-head"><div><div class="page-eyebrow">CHECK-IN</div><h2 class="section-title">最近 28 天</h2></div><span class="badge badge-brand">已连续 ${result.streak} 天</span></div>
      ${calendarMarkup(result.history || [])}
    </section>
    ${resultDetailMarkup(result)}
    ${medicalDisclaimer()}`;
}

async function shareResult() {
  const result = state.result;
  if (!result) return;
  const text = `我在心迹 ECG Lab 每日挑战答对 ${result.correct}/${result.total}，连续打卡 ${result.streak} 天。`;
  const url = `${location.origin}${location.pathname}#/daily`;
  try {
    if (navigator.share) {
      await navigator.share({ title: '心迹 ECG Lab · 每日挑战', text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('分享文案已复制', 'success');
  } catch {
    toast('复制失败，请手动分享', 'warn');
  }
}

function render(el) {
  destroyViewer();
  clearTimer();
  if (state.mode === 'runner') {
    el.innerHTML = runnerMarkup();
    bindRunner(el);
    mountQuestionViewer(el);
    return;
  }
  if (state.mode === 'result') {
    el.innerHTML = resultMarkup();
    el.querySelector('[data-home]')?.addEventListener('click', () => {
      state.mode = 'home';
      render(el);
    });
    el.querySelector('[data-share]')?.addEventListener('click', shareResult);
    return;
  }
  el.innerHTML = homeMarkup();
  el.querySelector('[data-start]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '正在准备今日题目…';
    try {
      const round = await api.dailyStart();
      if (round.done) {
        state.result = round.result;
        state.status = { ...(state.status || {}), done: true, result: round.result };
        state.mode = 'result';
        render(el);
        return;
      }
      state.round = round;
      state.index = 0;
      state.answers = {};
      state.times = {};
      state.busy = false;
      state.mode = 'runner';
      render(el);
    } catch (error) {
      toast(error.message || '无法开始今日挑战', 'error');
      button.disabled = false;
      button.innerHTML = `${icon('flame', 17)} 开始今日挑战`;
    }
  });
  el.querySelector('[data-review]')?.addEventListener('click', () => {
    state.result = state.status?.result || null;
    if (state.result) {
      state.mode = 'result';
      render(el);
    }
  });
}

export async function dailyView() {
  const el = document.createElement('div');
  el.className = 'page daily-page';
  try {
    state.status = await api.dailyStatus();
    state.mode = 'home';
    render(el);
  } catch (error) {
    el.innerHTML = `<div class="error-panel">${escapeHtml(error.message || '每日挑战加载失败')}</div>`;
  }
  return {
    el,
    destroy() {
      destroyViewer();
      clearTimer();
    },
  };
}
