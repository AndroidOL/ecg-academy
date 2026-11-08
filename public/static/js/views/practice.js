import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { recordAttempt, reviewSummary, weakDiagnosisIds } from '../study-store.js';
import { byokPayload, hasByok } from '../byok.js';
const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108ad';
const { mountECG } = await import(`../ecg-renderer.js${__asset}`);
const { icon, escapeHtml, toast, setButtonLoading, fmtDuration, medicalDisclaimer } = await import(`../ui.js${__asset}`);

const LEVELS = [
  { id: 1, name: '基础', note: '单一诊断，常见图形' },
  { id: 2, name: '进阶', note: '不典型表现与鉴别' },
  { id: 3, name: '组合挑战', note: '一张图两诊断' },
];

const state = {
  level: 1,
  chapter: 'all',
  total: 5,
  focus: [],
  quiz: null,
  index: 0,
  correct: 0,
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
};

function aiUiAvailable() {
  return store.ai?.allowed !== false || (Boolean(store.ai?.byokEnabled) && hasByok());
}

function clearTimer() {
  if (state.timerId) window.clearInterval(state.timerId);
  state.timerId = 0;
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
  destroyViewer();
  state.quiz = null;
  state.selected = new Set();
  state.submitted = false;
  state.result = null;
  state.focus = [];
  const initialFocus = String(query?.get('focus') || '').split(',').map((x) => x.trim()).filter(Boolean);
  const initialLevel = Number(query?.get('level') || 1);
  const initialChapter = String(query?.get('chapter') || 'all');
  const autoStart = query?.get('auto') === '1' && initialFocus.length > 0;
  const shared = query?.get('share') === '1';
  if ([1, 2, 3].includes(initialLevel)) state.level = initialLevel;
  state.chapter = initialChapter;
  const summary = reviewSummary();

  const chapters = store.chapters || [];
  el.innerHTML = `
    <header class="page-head">
      <div>
        <div class="page-eyebrow">${icon('target', 14)} READ & DECIDE</div>
        <h1 class="page-title">判读练习</h1>
        <p class="page-sub">题库已预置 1920 道确定性病例：由 40 种诊断 × 40 个种子、8 组组合 × 40 个种子组成；答案与解析来自策展知识库，服务端校验。</p>
      </div>
      <div class="row-wrap"><span class="badge badge-brand">${icon('activity', 11)} 正确率 ${store.quiz?.accuracy || 0}%</span><span class="badge">${store.quiz?.attempts || 0} 次作答</span><span class="badge">题库 ${store.bank?.total || 1920} 道</span></div>
    </header>
    ${shared ? `<div class="callout brand" style="margin-bottom:14px">${icon('target', 14)} 这是一份只读练习分享链接：题目按分享者的难度与章节即时生成，不会修改原题或题库。</div>` : ''}
    <div class="practice-setup">
      <section class="quiz-card">
        <div class="page-eyebrow">SETUP</div>
        <h2 class="section-title" style="margin-bottom:10px">选择训练方式</h2>
        <div class="level-grid">
          ${LEVELS.map((level) => `<button class="level-card ${level.id === state.level ? 'active' : ''}" type="button" data-level="${level.id}"><b>${level.name}</b><span>${level.note}</span></button>`).join('')}
        </div>
        <div class="practice-config">
          <div class="field"><label for="practice-chapter">章节</label><select class="select" id="practice-chapter"><option value="all">全部章节</option>${chapters.map((chapter) => `<option value="${escapeHtml(chapter.id)}">${escapeHtml(chapter.name)}</option>`).join('')}</select></div>
          <div class="field"><label>本局题数</label><div class="segmented" data-count><button class="segment" type="button" data-total="1">1 题</button><button class="segment active" type="button" data-total="5">5 题</button></div></div>
        </div>
        <div class="row-wrap" style="margin-top:18px">
          <button class="btn btn-primary btn-lg" type="button" data-start>${icon('play', 17)} 开始判读</button>
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
          <h3>我的记录</h3>
          <div class="practice-stats">
            <div class="practice-stat"><b>${store.quiz?.accuracy || 0}%</b><span>正确率</span></div>
            <div class="practice-stat"><b>${store.quiz?.avgScore || 0}</b><span>平均分</span></div>
            <div class="practice-stat"><b>${store.quiz?.correct || 0}</b><span>答对题数</span></div>
            <div class="practice-stat"><b>${store.sim?.best || 0}</b><span>急救最高分</span></div>
          </div>
        </div>
        <div class="practice-side-card">
          <h3>${icon('target', 14)} 错题与间隔复习</h3>
          <p>${summary.due} 个诊断到期待复习，${summary.wrong} 个错题已记录。错题本保存在本设备，可自我评分安排下一次复习。</p>
          <div class="row-wrap" style="margin-top:10px"><a class="btn btn-secondary btn-block btn-sm" href="#/review">${icon('bookOpen', 14)} 打开错题本</a></div>
        </div>
        <div class="practice-side-card">
          <h3>${icon('sparkles', 14)} AI 专项计划</h3>
          <p>根据最近答题与章节正确率，选出 3 个最该巩固的诊断，生成一局专项练习。未配置 AI 时使用本地算法。</p>
          <button class="btn btn-secondary btn-block btn-sm" type="button" data-plan style="margin-top:10px">${icon('sparkles', 14)} 生成专项计划</button>
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
  countButtons.forEach((button) => button.addEventListener('click', () => {
    state.total = Number(button.dataset.total);
    countButtons.forEach((b) => b.classList.toggle('active', b === button));
  }));
  chapterSelect.addEventListener('change', () => { state.chapter = chapterSelect.value; });

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
      const result = await api.aiStudyPlan(byokPayload());
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
    state.focus = focus;
    const quiz = await api.quizNew({ level: state.level, chapter: state.chapter, focus });
    state.quiz = quiz;
    state.index = 0;
    state.correct = 0;
    state.score = 0;
    state.streak = 0;
    state.maxStreak = 0;
    renderQuestion(el);
  }

  if (autoStart) {
    try {
      await startQuiz(initialFocus);
    } catch (error) {
      toast(error.message || '出题失败', 'error');
    }
  }
  return {
    el,
    destroy() {
      clearTimer();
      destroyViewer();
    },
  };
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
  const total = state.total;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  el.innerHTML = `
    <div class="quiz-shell">
      <div class="quiz-top">
        <button class="btn btn-ghost btn-sm" type="button" data-exit>${icon('arrowLeft', 14)} 退出本局</button>
        <div class="quiz-progress"><span>第 <b>${index + 1}</b> / ${total} 题</span><span class="progress"><span class="progress-bar" style="width:${((index) / total) * 100}%"></span></span><span>正确 ${state.correct}</span><span class="timer">${icon('timer', 12)} <b data-timer>00:00</b></span></div>
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
              <span class="option-text">${escapeHtml(option.name)}</span>
              <span class="option-note">${escapeHtml(option.chapter || '')}</span>
            </label>`).join('')}
          </div>
          <div class="quiz-actions">
            <span class="muted" style="font-size:11px">${multiple ? '选择所有符合的诊断后再提交。' : '选择一个最可能的诊断。'}</span>
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
  state.viewer = mountECG(viewerRoot, quiz.spec, { mode: 'rhythm', speed: 2, showAnnotations: false, showSummary: false, autoPlay: false });
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
    else state.viewer.play(2);
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
      const result = await api.quizAnswer(quiz.attemptId, [...state.selected], Math.round(performance.now() - state.questionStart));
      state.result = result;
      if (result.correct) {
        state.correct += 1;
        state.streak += 1;
        state.maxStreak = Math.max(state.maxStreak, state.streak);
      } else {
        state.streak = 0;
      }
      state.score += result.score;
      if (store.user?.isGuest) store.addLocalXp(result.xp);
      const names = Object.fromEntries((quiz.options || []).map((option) => [option.id, option.name]));
      const chapterMap = Object.fromEntries((quiz.options || []).map((option) => [option.id, option.chapter]));
      recordAttempt({ correct: result.correct, correctIds: result.correctIds || [], selectedIds: [...state.selected], names, chapters: chapterMap });
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
      feedback.innerHTML = feedbackHtml(result, multiple);
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
      if (state.index + 1 >= state.total) {
        renderResults(el);
        return;
      }
      state.index += 1;
      setButtonLoading(next, true, '出题中');
      try {
        const newQuiz = await api.quizNew({ level: state.level, chapter: state.chapter, focus: state.focus });
        state.quiz = newQuiz;
        renderQuestion(el);
      } catch (error) {
        toast(error.message || '出题失败', 'error');
        setButtonLoading(next, false);
      }
    });
    const ask = async (questionText) => {
      if (!aiUiAvailable()) return;
      const panel = feedback.querySelector('[data-ai-explain-panel]');
      try {
        const result = await api.aiExplain(state.result.attemptId, questionText, byokPayload());
        panel.innerHTML = `<div class="explain-block"><h4>${result.source === 'ai' ? 'AI 回答' : '本地解析'}</h4><p data-ai-text></p></div>`;
        panel.querySelector('[data-ai-text]').textContent = result.text;
      } catch (error) {
        panel.innerHTML = `<div class="explain-block"><p style="color:var(--danger)">${escapeHtml(error.message || 'AI 解析失败')}</p></div>`;
      }
    };
    feedback.querySelector('[data-ai-ask]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (!aiUiAvailable()) return;
      setButtonLoading(button, true, 'AI 分析中');
      await ask(feedback.querySelector('[data-ai-question]')?.value || '');
      setButtonLoading(button, false);
    });
    feedback.querySelector('[data-ai-explain]')?.addEventListener('click', async (event) => { if (!aiUiAvailable()) return;
      const btn = event.currentTarget;
      const panel = feedback.querySelector('[data-ai-explain-panel]');
      setButtonLoading(btn, true, 'AI 分析中');
      try {
        const result = await api.aiExplain(state.result.attemptId, '', byokPayload());
        panel.innerHTML = `<div class="explain-block"><h4>${result.source === 'ai' ? 'AI 错因解析' : '本地错因解析'}</h4><p data-ai-text></p></div>`;
        panel.querySelector('[data-ai-text]').textContent = result.text;
      } catch (error) {
        panel.innerHTML = `<div class="explain-block"><p style="color:var(--danger)">${escapeHtml(error.message || 'AI 解析失败')}</p></div>`;
      } finally {
        setButtonLoading(btn, false);
      }
    });
  }

  updateSelection();
}

function feedbackHtml(result, multiple) {
  const tone = result.correct ? 'good' : 'bad';
  const title = result.correct ? '判断正确' : result.partial ? '部分正确，但诊断组合不完整' : '需要再读一遍';
  const answer = result.correctNames?.join('、') || '';
  return `<div class="quiz-feedback">
    <div class="feedback-head"><span class="feedback-icon ${tone === 'bad' ? 'bad' : ''}">${icon(result.correct ? 'check' : 'x', 16)}</span><div><div class="feedback-title">${title}</div><div class="muted" style="font-size:10px">得分 ${result.score} · 经验 +${result.xp}${answer ? ` · 正确答案：${escapeHtml(answer)}` : ''}</div></div></div>
    <p class="feedback-text">${escapeHtml(result.localExplanation || '')}</p>
    ${(result.explanation || []).map((item) => `<div class="explain-block"><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.specificity || item.oneLiner || '')}</p><ul>${(item.criteria || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul></div>`).join('')}
    ${aiUiAvailable() ? `<div class="ai-ask-row"><input class="input" data-ai-question maxlength="300" placeholder="追问 AI：为什么排除某个选项？"><button class="btn btn-secondary btn-sm" type="button" data-ai-ask>${icon('sparkles', 14)} 问 AI</button></div>` : ''}
    <div class="row-wrap" style="margin-top:12px">${aiUiAvailable() ? `<button class="btn btn-secondary btn-sm" type="button" data-ai-explain>${icon('sparkles', 14)} AI 解释错因</button>` : ''}<button class="btn btn-primary btn-sm" type="button" data-next>${icon('arrowRight', 14)} 下一题</button></div>
    <div data-ai-explain-panel></div>
  </div>`;
}

function renderResults(el) {
  clearTimer();
  destroyViewer();
  const total = state.total;
  const accuracy = total ? Math.round((state.correct / total) * 100) : 0;
  store.refresh().catch(() => {});
  el.innerHTML = `<div class="page" style="padding:0;max-width:none">
    <div class="quiz-result card card-pad">
      <div class="page-eyebrow" style="justify-content:center">${icon('trophy', 14)} ROUND COMPLETE</div>
      <div class="result-score">${state.score}</div>
      <div class="result-label">本局得分</div>
      <div class="result-stats"><div><b>${state.correct}/${total}</b><span class="muted">答对</span></div><div><b>${accuracy}%</b><span class="muted">正确率</span></div><div><b>${state.maxStreak}</b><span class="muted">最高连续</span></div></div>
      <p class="muted" style="font-size:12.5px">判读不是猜答案：把每一道错题还原成“哪一步看错了”，比刷更多题更有效。</p>
      <div class="row-wrap" style="justify-content:center;margin-top:18px"><button class="btn btn-primary" type="button" data-restart>${icon('rotate', 15)} 再来一局</button><a class="btn btn-secondary" href="#/review">${icon('target', 15)} 查看错题本</a><a class="btn btn-secondary" href="#/learn">${icon('bookOpen', 15)} 回到图谱</a></div>
    </div>
    ${medicalDisclaimer()}
  </div>`;
  el.querySelector('[data-restart]')?.addEventListener('click', () => {
    navigate('/practice');
  });
}
