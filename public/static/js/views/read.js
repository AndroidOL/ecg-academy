const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261117a1';
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
const { buildReading, buildAdvancedReading, isStepCorrect, optionReviewState } = await import(`../read-interpret.js${__asset}`);

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
    mode: String(query?.get('advanced') || '') === '1' ? 'advanced' : 'basic',
    advancedChecks: {},
    advancedTotal: 0,
    measureReady: false,
    selections: {},
    results: {},
    submitted: false,
    result: null,
    startedAt: 0,
    viewer: null,
    timerId: 0,
  };

  el.innerHTML = `
    <header class="page-head read-head">
      <div>
        <div class="page-eyebrow">${icon('target', 14)} SYSTEMATIC READING</div>
        <h1 class="page-title">系统判读训练</h1>
        <p class="page-sub">用「五步基础」建立判读顺序，或切到「十步进阶」逐项完成完整读图；每一步即时反馈，最后再下诊断。</p>
      </div>
      <div class="read-head-side">
        <div class="read-mode-switch" role="tablist" aria-label="判读模式">
          <button class="read-mode-btn" type="button" role="tab" data-read-mode="basic">五步基础</button>
          <button class="read-mode-btn" type="button" role="tab" data-read-mode="advanced">十步进阶</button>
        </div>
        <div class="row-wrap read-head-meta">
          ${focus.length ? `<span class="badge badge-warn">专项 ${focus.length} 个诊断</span>` : ''}
          <span class="badge badge-brand" data-read-stats>${statsLabel()}</span>
          <span class="badge" data-read-key-hint>键盘 1–5 / Enter / N</span>
        </div>
      </div>
    </header>
    <div class="read-layout">
      <section class="quiz-card read-ecg-card">
        <div class="row-wrap" style="justify-content:space-between;margin-bottom:8px">
          <div class="row-wrap" data-levels>${LEVELS.map((level) => {
            const freePractice = Boolean(level.need && userLevel < level.need);
            return `<button class="btn btn-xs ${level.id === state.level ? 'btn-primary' : 'btn-ghost'}" type="button" data-read-level="${level.id}" title="${escapeHtml(level.note)}${freePractice ? ` · Lv.${level.need} 后计分` : ''}">${level.name}${freePractice ? ' · 自由' : ''}</button>`;
          }).join('')}<span class="muted" style="font-size:9.5px">未解锁难度自由练习，不计分/不扣分</span></div>
          <div class="row-wrap"><span class="badge" data-quiz-meta>加载中…</span><button class="btn btn-xs btn-ghost" type="button" data-read-new>${icon('refresh', 12)} 随机一例</button></div>
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
      <section class="read-measure-host is-hidden" data-measure-host></section>
      <section class="read-advanced-host" data-advanced-host></section>
      <section class="quiz-card read-conclusion" data-conclusion></section>
      <div class="read-feedback" data-read-feedback></div>
    </div>
    ${medicalDisclaimer()}
  `;

  const stepsHost = el.querySelector('[data-steps]');
  const advancedHost = el.querySelector('[data-advanced-host]');
  const measureHost = el.querySelector('[data-measure-host]');
  const modeButtons = [...el.querySelectorAll('[data-read-mode]')];
  const conclusionHost = el.querySelector('[data-conclusion]');
  const feedbackHost = el.querySelector('[data-read-feedback]');
  const loading = el.querySelector('[data-read-loading]');
  const metaBadge = el.querySelector('[data-quiz-meta]');

  function setMode(mode, { render = true } = {}) {
    state.mode = mode === 'advanced' ? 'advanced' : 'basic';
    modeButtons.forEach((button) => {
      const active = button.dataset.readMode === state.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    stepsHost.classList.toggle('is-hidden', state.mode !== 'basic');
    advancedHost.classList.toggle('is-hidden', state.mode !== 'advanced');
    measureHost.classList.toggle('is-hidden', state.mode !== 'basic' || !state.measureReady);
    const hint = el.querySelector('[data-read-key-hint]');
    if (hint) hint.textContent = state.mode === 'advanced' ? '十步进阶：逐项点击自检' : '键盘 1–5 / Enter / N';
    if (!render) return;
    if (state.mode === 'advanced') renderAdvanced();
    else advancedHost.innerHTML = '';
  }

  async function loadQuiz(level = state.level) {
    destroyViewer();
    state.level = level;
    state.quiz = null;
    state.reading = null;
    state.selections = {};
    state.results = {};
    state.advancedChecks = {};
    state.advancedTotal = 0;
    state.measureReady = false;
    state.submitted = false;
    state.result = null;
    loading.style.display = '';
    stepsHost.innerHTML = '';
    advancedHost.innerHTML = '';
    measureHost.innerHTML = '';
    measureHost.classList.add('is-hidden');
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
      setMode(state.mode, { render: false });
      if (state.mode === 'advanced') renderAdvanced();
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

  function measureLeadVoltages() {
    const session = state.viewer?.rhythmSession;
    if (!session || !state.quiz) return {};
    const spec = state.quiz.spec || {};
    const beat = Number(spec.start) || 0.58;
    const window = 0.12;
    const baselineFor = (result) => {
      const sr = result.sampleRate;
      const samples = [];
      for (let i = Math.round((beat - 0.07) * sr); i <= Math.round((beat - 0.055) * sr); i += 1) {
        if (samples.length < 40) samples.push(result.samples[i]);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)] || 0;
    };
    const extremes = (lead) => {
      const result = session.lead(lead);
      const sr = result.sampleRate;
      const lo = Math.max(0, Math.round((beat - 0.06) * sr));
      const hi = Math.min(result.samples.length - 1, Math.round((beat + window) * sr));
      const baseline = baselineFor(result);
      let min = 0;
      let max = 0;
      for (let i = lo; i <= hi; i += 1) {
        const value = result.samples[i] - baseline;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      return { min, max };
    };
    const v1 = extremes('V1');
    const v5 = extremes('V5');
    return { v1R: v1.max, v5S: v5.min };
  }

  function renderMeasurements() {
    if (!measureHost || !state.quiz) return;
    const session = state.viewer?.rhythmSession;
    if (!session) return;
    const spec = session.spec || state.quiz.spec || {};
    const beats = [...(session.schedule?.beats || [])].sort((a, b) => a.t - b.t);
    if (!beats.length) return;
    const normal = beats.filter((beat) => ['sinus', 'atrial', 'paced'].includes(String(beat.type)));
    const source = normal.length >= 2 ? normal : beats;
    const diffs = (values) => values.slice(1).map((value, index) => value - values[index]);
    const stats = (values) => {
      const finite = values.filter((value) => Number.isFinite(value) && value > 0);
      if (!finite.length) return null;
      return {
        mean: finite.reduce((sum, value) => sum + value, 0) / finite.length,
        min: Math.min(...finite),
        max: Math.max(...finite),
        count: finite.length,
      };
    };
    const rrs = stats(diffs(source.map((beat) => beat.t)));
    const pTimes = source.map((beat) => beat.pTime).filter((value) => value != null);
    const pps = stats(diffs(pTimes));
    const prs = stats(source
      .filter((beat) => beat.pOnset != null && beat.qrsOnset != null)
      .map((beat) => (beat.t + beat.qrsOnset) - beat.pOnset));
    const lead = spec.primaryLead || 'II';
    const qrss = stats(source
      .map((beat) => (beat.qrsEnds?.[lead] ?? beat.qrsEnd) - (beat.qrsOnsets?.[lead] ?? beat.qrsOnset))
      .filter((value) => Number.isFinite(value) && value > 0));
    const hr = rrs && rrs.mean > 0 ? 60 / rrs.mean : Number(spec.rate) || 0;
    const qt = Number(spec.qt) || 0;
    const qtc = rrs && rrs.mean > 0 ? qt / Math.sqrt(rrs.mean) : 0;
    const amps = measureLeadVoltages();
    const axisLabels = { normal: '正常', left: '左偏', right: '右偏', extreme: '极度右偏' };
    const range = (value, digits = 2) => value
      ? `<small>${value.min.toFixed(digits)}–${value.max.toFixed(digits)}</small>`
      : '';
    const item = (label, value, unit = '', note = '') => `<div class="read-measure-item"><span>${label}</span><b>${value}${unit ? `<em>${unit}</em>` : ''}</b>${note || ''}</div>`;
    const ppText = pps ? `${pps.mean.toFixed(2)} s` : '不可测';
    const ppNote = pps ? range(pps) : '<small>P 波消失/被 f–F 波取代</small>';
    const prText = prs ? `${prs.mean.toFixed(2)} s` : '不可测';
    const prNote = prs ? range(prs) : '<small>无 P 波或无法确认起点</small>';
    const irregular = (rrs && rrs.max - rrs.min > 0.12) || String(spec.rhythm) === 'af' || Number(spec.irregularity) > 0.06;
    measureHost.innerHTML = `<section class="quiz-card read-measure">
      <div class="read-measure-head">
        <div><div class="page-eyebrow">MACHINE MEASUREMENTS</div><h3>电脑判读 · 本例测量值</h3><p class="muted">五步完成后的自动测量，用于强化对间期和节律的印象；现代心电图机也是先自动测量，再由人复核。</p></div>
        <span class="badge badge-brand">自动测量</span>
      </div>
      <div class="read-measure-grid">
        ${item('心率', hr ? Math.round(hr) : '—', '次/分', irregular ? '<small>节律不规则</small>' : '<small>节律基本规则</small>')}
        ${item('RR 间期', rrs ? `${rrs.mean.toFixed(2)} s` : '—', '', range(rrs))}
        ${item('PP 间期', ppText, '', ppNote)}
        ${item('PR 间期', prText, '', prNote)}
        ${item('QRS 时限', qrss ? Math.round(qrss.mean * 1000) : '—', 'ms', `<small>${escapeHtml(lead)} 导联</small>`)}
        ${item('QT / QTc', qt ? `${qt.toFixed(2)} / ${qtc.toFixed(2)} s` : '—', '', '<small>Bazett 校正</small>')}
        ${item('额面电轴', axisLabels[spec.axis] || '—', '', '<small>按 I / aVF 主波</small>')}
        ${item('V1 R / V5 S', `${Number.isFinite(amps.v1R) ? amps.v1R.toFixed(2) : '—'} / ${Number.isFinite(amps.v5S) ? amps.v5S.toFixed(2) : '—'}`, 'mV', '<small>局部基线校正</small>')}
      </div>
      <section class="read-measure-quality">
        <div class="read-measure-quality-head"><h4>测量前先看波形质量</h4><p>基线漂移和伪差会让机器测错振幅、ST 段，甚至把伪差当成宽 QRS 或心律不齐。</p></div>
        <div class="read-measure-quality-grid">
          <figure>
            <svg class="read-quality-svg" viewBox="0 0 240 90" role="img" aria-label="基线漂移示意">
              <rect x="0" y="0" width="240" height="90" fill="var(--surface-2)"/>
              <path d="M0 48 C18 30 38 66 58 48 S98 30 118 48 S158 66 178 48 S218 30 240 48" fill="none" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="4 4"/>
              <path d="M0 48 C18 30 38 66 58 48 L64 48 L67 43 L70 53 L73 48 L78 48 L82 48 L85 24 L89 66 L93 48 L98 48 C108 39 112 57 118 48 L124 48 L127 43 L130 53 L133 48 L138 48 L142 48 L145 24 L149 66 L153 48 L158 48 C168 39 172 57 178 48 L184 48 L187 43 L190 53 L193 48 L198 48 L202 48 L205 24 L209 66 L213 48 L218 48 C228 39 232 57 240 48" fill="none" stroke="var(--danger)" stroke-width="1.8" stroke-linejoin="round"/>
              <text x="8" y="14" fill="var(--danger)" font-size="9" font-weight="700">基线漂移</text>
            </svg>
            <figcaption><b>基线漂移</b>：慢波起伏让 ST 段和振幅整体上下移动；机器测量前需要局部基线校正，不能用一个固定 0 mV 线硬测。</figcaption>
          </figure>
          <figure>
            <svg class="read-quality-svg" viewBox="0 0 240 90" role="img" aria-label="伪差示意">
              <rect x="0" y="0" width="240" height="90" fill="var(--surface-2)"/>
              <path d="M0 48 L8 44 L16 52 L24 46 L32 50 L40 45 L48 51 L56 47 L64 49 L72 45 L80 51 L88 47 L96 49 L104 45 L112 51 L120 47 L128 49 L136 45 L144 51 L152 47 L160 49 L168 45 L176 51 L184 47 L192 49 L200 45 L208 51 L216 47 L224 49 L232 45 L240 48" fill="none" stroke="var(--muted)" stroke-width="1.1"/>
              <path d="M0 48 L8 44 L16 52 L24 46 L32 50 L40 45 L48 51 L56 47 L64 49 L72 45 L80 51 L88 47 L96 49 L104 45 L112 51 L120 47 L124 47 L127 32 L130 62 L133 47 L138 47 L142 47 L145 30 L149 64 L153 47 L160 49 L168 45 L176 51 L184 47 L192 49 L200 45 L208 51 L216 47 L224 49 L232 45 L240 48" fill="none" stroke="var(--danger)" stroke-width="1.6" stroke-linejoin="round"/>
              <path d="M124 18 l4 -6 l4 6 l4 -6 l4 6 l4 -6" fill="none" stroke="var(--danger)" stroke-width="1" opacity=".7"/>
              <text x="8" y="14" fill="var(--danger)" font-size="9" font-weight="700">伪差</text>
            </svg>
            <figcaption><b>伪差</b>：肌电、交流电和电极接触不良会产生高频噪声或尖峰，可能被误读成房颤、早搏或宽 QRS；先看波形是否可信，再看数值。</figcaption>
          </figure>
        </div>
      </section>
      <p class="read-measure-note">本页数值由合成波形自动计算；振幅已做局部基线校正，间期按 P/QRS 起点与 T 终点计算。用于教学强化，不替代临床测量。</p>
    </section>`;
    measureHost.classList.remove('is-hidden');
  }

  function renderAdvanced() {
    if (!advancedHost) return;
    if (state.mode !== 'advanced' || !state.quiz) {
      advancedHost.innerHTML = '';
      return;
    }
    const reading = buildAdvancedReading(state.quiz.spec || {}, state.quiz.options || [], measureLeadVoltages(), Array.isArray(state.quiz.references) ? state.quiz.references : []);
    const totalChecks = reading.selfChecks.length;
    state.advancedTotal = totalChecks;
    const stepOfCheck = (id) => reading.steps.find((step) => (step.checks || []).some((check) => check.id === id));
    const ul = (items) => `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    const reviewHtml = (check, value) => `<div class="read-option-review-list">${check.options.filter((option) => option.id === check.answer || option.id === value).map((option) => {
      const state = optionReviewState(option.id, check.answer, value);
      const tag = state === 'ok' ? '正确' : state === 'bad' ? '你选' : '未选';
      return `<div class="read-option-review ${state}"><b>${tag}</b><span>${escapeHtml(option.label)}：${escapeHtml(state === 'ok' ? check.explanation : '该选项不符合本例的判断；请对照正确解析。')}</span></div>`;
    }).join('')}</div>`;
    const checkHtml = (check) => {
      const result = state.advancedChecks[check.id];
      return `<div class="read-ten-check ${result ? (result.correct ? 'is-correct' : 'is-wrong') : ''}" data-adv-card="${check.id}">
        <h5>${escapeHtml(check.question)}</h5>
        <div class="read-ten-options">${check.options.map((option) => {
          const state = result ? optionReviewState(option.id, check.answer, result.value) : '';
          const cls = state === 'ok' ? 'is-correct' : state === 'bad' ? 'is-wrong' : '';
          return `<button class="read-option ${cls}" type="button" data-adv-check="${check.id}" data-adv-value="${option.id}" ${result ? 'disabled' : ''}>${escapeHtml(option.label)}</button>`;
        }).join('')}</div>
        <div class="read-ten-note ${result ? 'show' : ''}" data-adv-card-note>${result ? `<b>${result.correct ? '判断正确' : '需要复习'}</b><p>${escapeHtml(check.explanation)}</p>${reviewHtml(check, result.value)}` : ''}</div>
      </div>`;
    };
    const stepHtml = (step, index) => {
      const checks = step.checks || [];
      const results = checks.map((check) => state.advancedChecks[check.id]).filter(Boolean);
      const complete = checks.length > 0 && results.length === checks.length;
      const cls = complete ? (results.every((result) => result.correct) ? 'is-correct' : 'is-wrong') : '';
      const status = checks.length ? `<span class="badge" data-ten-step-status>${results.length}/${checks.length} 自检</span>` : '<span class="badge">本例</span>';
      const reveal = checks.length === 0 || complete;
      const value = reveal ? escapeHtml(step.value) : '先根据心电图判断，再核对本例结果。';
      return `<article class="read-ten-step ${cls}" data-ten-step="${step.id}">
        <div class="read-ten-step-rail"><span>${String(index + 1).padStart(2, '0')}</span></div>
        <div class="read-ten-step-main">
          <div class="read-ten-step-head"><h4>${escapeHtml(step.title)}</h4>${status}</div>
          <p class="read-ten-step-value ${reveal ? '' : 'muted'}" data-ten-step-value>${value}</p>
          ${checks.map(checkHtml).join('')}
          <details class="read-ten-step-detail"><summary>本例解析与依据</summary><p>${escapeHtml(step.detail)}</p><p class="read-ten-step-tip">${icon('target', 11)} ${escapeHtml(step.tip)}</p></details>
        </div>
      </article>`;
    };
    const valuesHtml = `<details class="read-values"><summary>查看本例数值（建议先自行判断，再核对）</summary><div class="read-values-grid">
      <span>心率 <b>${reading.values.rate || '—'}</b> 次/分</span>
      <span>PR <b>${reading.values.pr === null ? '不可测' : `${reading.values.pr.toFixed(2)} s`}</b></span>
      <span>QRS <b>${reading.values.qrs === null ? '—' : `${Math.round(reading.values.qrs * 1000)} ms`}</b></span>
      <span>QT <b>${reading.values.qt === null ? '—' : `${reading.values.qt.toFixed(2)} s`}</b></span>
      <span>V1 R <b>${reading.values.v1R === null ? '未测' : `${reading.values.v1R.toFixed(2)} mV`}</b></span>
      <span>V5 S <b>${reading.values.v5S === null ? '未测' : `${reading.values.v5S.toFixed(2)} mV`}</b></span>
    </div><p class="read-values-note">参考范围：成人静息心率 60–100 次/分；PR 0.12–0.20 s；QRS &lt;0.12 s；QTc 需按心率/性别校正。数值为教学合成波形的标称值，不替代实测。</p></details>`;
    const summaryHtml = `<section class="read-summary-card">
      <div class="read-summary-head"><div><div class="page-eyebrow">CONCLUSION</div><h4>结论与下一步</h4></div><span class="badge">先描述，后诊断</span></div>
      <div class="read-summary-grid">
        <div class="read-summary-block"><h5>本例改变</h5>${ul(reading.changes)}</div>
        <div class="read-summary-block"><h5>危险信号 / 优先处理</h5>${ul(reading.danger)}</div>
        <div class="read-summary-block"><h5>本题候选诊断</h5>${ul(reading.candidateDiagnoses.map((item) => `${item.name}${item.chapter ? ` · ${item.chapter}` : ''}`))}</div>
        <div class="read-summary-block"><h5>完整结论模板</h5><p>${escapeHtml(reading.conclusion)}</p></div>
        <div class="read-summary-block wide"><h5>改变对应的鉴别诊断</h5>${reading.differentials.map((group) => `<div class="read-summary-diff"><b>${escapeHtml(group.title)}</b><span>${group.items.map((item) => escapeHtml(item)).join(' · ')}</span></div>`).join('')}</div>
        <div class="read-summary-block wide"><h5>下一步</h5>${ul(reading.next)}</div>
      </div>
    </section>`;
    const referencesHtml = `<details class="read-references"><summary>判读依据与权威文献</summary><p>${escapeHtml(reading.sourceNote)}</p>${reading.references.length ? `<ul>${reading.references.map((ref) => `<li><a href="${escapeHtml(ref.url || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(ref.title || ref.url || '参考文献')}</a><span>${escapeHtml([ref.authors, ref.journal, ref.year].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>` : ''}<p><a href="#/guidelines">打开指南规范与文献页 →</a></p></details>`;
    advancedHost.innerHTML = `<section class="quiz-card read-advanced">
      <div class="read-advanced-head">
        <div><div class="page-eyebrow">TEN-STEP INTERPRETATION</div><h3>十步法 · 完整判读</h3><p class="muted">按 1→10 的顺序逐项确认，每一步只回答一个问题；先自己判断，再展开解析。数值默认折叠。</p></div>
        <div class="read-advanced-actions"><a class="btn btn-xs btn-ghost" href="#/learn/systematic-ecg-reading">十步法原文</a><span class="badge badge-brand" data-advanced-score>0 / ${totalChecks} 项自检</span></div>
      </div>
      ${valuesHtml}
      <div class="read-ten-steps">${reading.steps.map(stepHtml).join('')}</div>
      ${summaryHtml}
      ${referencesHtml}
      <p class="read-advanced-source">${escapeHtml(reading.sourceNote)} <a href="#/guidelines">查看指南规范与文献 →</a></p>
    </section>`;
    const updateAdvancedScore = () => {
      const node = advancedHost.querySelector('[data-advanced-score]');
      if (!node) return;
      const correct = Object.values(state.advancedChecks).filter((item) => item.correct).length;
      node.textContent = `${correct} / ${totalChecks} 项自检`;
    };
    const updateStepState = (stepId) => {
      const step = reading.steps.find((item) => item.id === stepId);
      const card = advancedHost.querySelector(`[data-ten-step="${stepId}"]`);
      if (!step || !card) return;
      const checks = step.checks || [];
      const results = checks.map((check) => state.advancedChecks[check.id]).filter(Boolean);
      const complete = checks.length > 0 && results.length === checks.length;
      card.classList.toggle('is-correct', complete && results.every((result) => result.correct));
      card.classList.toggle('is-wrong', complete && !results.every((result) => result.correct));
      const status = card.querySelector('[data-ten-step-status]');
      if (status) status.textContent = `${results.length}/${checks.length} 自检`;
      const valueNode = card.querySelector('[data-ten-step-value]');
      if (valueNode && complete) {
        valueNode.textContent = step.value;
        valueNode.classList.remove('muted');
      }
    };
    advancedHost.querySelectorAll('[data-adv-check]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.advCheck;
        if (state.advancedChecks[id]) return;
        const check = reading.selfChecks.find((item) => item.id === id);
        if (!check) return;
        const value = button.dataset.advValue;
        const correct = value === check.answer;
        state.advancedChecks[id] = { value, correct };
        const card = button.closest('[data-adv-card]');
        const note = card?.querySelector('[data-adv-card-note]');
        card?.querySelectorAll('[data-adv-check]').forEach((option) => {
          option.disabled = true;
          const optionState = optionReviewState(option.dataset.advValue, check.answer, value);
          option.classList.toggle('is-correct', optionState === 'ok');
          option.classList.toggle('is-wrong', optionState === 'bad');
        });
        if (note) {
          note.classList.add('show');
          note.innerHTML = `<b>${correct ? '判断正确' : '需要复习'}</b><p>${escapeHtml(check.explanation)}</p>${reviewHtml(check, value)}`;
        }
        updateStepState(stepOfCheck(id)?.id);
        updateAdvancedScore();
      });
    });
    updateAdvancedScore();
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
    const answerIds = Array.isArray(reading[step.id].answer) ? reading[step.id].answer : [reading[step.id].answer];
    card.querySelectorAll('.read-option').forEach((node) => {
      const state = optionReviewState(node.dataset.value, answerIds, [...selection]);
      node.disabled = true;
      node.classList.toggle('is-correct', state === 'ok');
      node.classList.toggle('is-wrong', state === 'bad');
    });
    const confirm = card.querySelector('[data-step-confirm]');
    if (confirm) confirm.disabled = true;
    const note = card.querySelector(`[data-step-note="${step.id}"]`);
    const review = reading.options[step.id].filter((option) => answerIds.includes(option.id) || selection.has(option.id)).map((option) => {
      const state = optionReviewState(option.id, answerIds, [...selection]);
      const tag = state === 'ok' ? '正确' : state === 'bad' ? '你选' : '未选';
      return `<div class="read-option-review ${state}"><b>${tag}</b><span>${escapeHtml(option.label)}：${escapeHtml(state === 'ok' ? reading[step.id].explanation : '该选项不符合本例的判断；请对照上方正确解析。')}</span></div>`;
    }).join('');
    note.classList.add('show', correct ? 'ok' : 'bad');
    note.innerHTML = `<b>${correct ? '判断正确' : '再看一次'}</b><p>${escapeHtml(reading[step.id].explanation)}</p><div class="read-option-review-list">${review}</div>`;
    const done = STEPS.every((item) => state.results[item.id] !== undefined);
    if (done) {
      state.measureReady = true;
      renderMeasurements();
    }
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
        const advancedMode = state.mode === 'advanced';
        const advancedCorrect = Object.values(state.advancedChecks).filter((item) => item.correct).length;
        const stepTotal = advancedMode ? (state.advancedTotal || 0) : STEPS.length;
        const stepHits = advancedMode ? advancedCorrect : STEPS.filter((step) => state.results[step.id] === true).length;
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
    const advanced = state.mode === 'advanced';
    const advancedTotal = state.advancedTotal || 0;
    const advancedDone = Object.keys(state.advancedChecks).length;
    const advancedCorrect = Object.values(state.advancedChecks).filter((item) => item.correct).length;
    const scoreRow = advanced
      ? `<div class="read-score-row">
          <div class="read-score"><b>${advancedCorrect} / ${advancedTotal}</b><span>十步自检正确</span></div>
          <div class="read-score"><b>${advancedDone} / ${advancedTotal}</b><span>已完成自检</span></div>
          <div class="read-score"><b>${result.correct ? '✓' : '✗'}</b><span>最终诊断</span></div>
        </div>`
      : `<div class="read-score-row">
          <div class="read-score"><b>${stepCorrect} / ${stepIds.length}</b><span>结构化步骤正确</span></div>
          <div class="read-score"><b>${stepDone} / ${stepIds.length}</b><span>已完成步骤</span></div>
          <div class="read-score"><b>${result.correct ? '✓' : '✗'}</b><span>最终诊断</span></div>
        </div>`;
    const pendingNote = advanced
      ? (advancedDone < advancedTotal ? '<p class="muted" style="font-size:11px">还有自检项未完成；下一例建议按 1→10 的顺序完整读图。</p>' : '')
      : (stepDone < stepIds.length ? '<p class="muted" style="font-size:11px">还有步骤未作答；下一例建议按 1→5 的顺序完整读图。</p>' : '');
    const answer = (result.correctIds || []).map((id) => localizedName(quiz.options.find((option) => option.id === id))).filter(Boolean).join('、');
    const selectedNames = [...selected].map((id) => localizedName(quiz.options.find((option) => option.id === id))).filter(Boolean).join('、');
    const freePractice = result.unlocked === false;
    feedbackHost.innerHTML = `<div class="quiz-feedback ${result.correct ? '' : 'is-bad'}">
      <div class="feedback-head"><span class="feedback-icon ${result.correct ? '' : 'bad'}">${icon(result.correct ? 'check' : 'x', 16)}</span><div><div class="feedback-title">${result.correct ? '结论正确' : '结论需要修正'}${freePractice ? ' · 自由练习' : ''}</div><div class="muted" style="font-size:10px">${freePractice ? `自由练习：本题不计分、不扣分；Lv.${result.unlockLevel || '—'} 后按正常规则计分` : `本题得分 ${result.score ?? '—'}${result.correct && result.slow ? '（慢答 ×0.7）' : !result.correct && result.partial ? '（部分正确）' : !result.correct ? '（答错按 4× 扣分）' : ''}`} · 用时 ${Math.round((result.timeMs || 0) / 1000)} 秒${freePractice ? '' : ` · 经验 ${Number(result.xp) > 0 ? '+' : ''}${result.xp}`}${result.slow ? ' · 判读偏慢' : ''}</div></div></div>
      ${scoreRow}
      <p class="feedback-text">你的选择：${escapeHtml(selectedNames || '—')}${answer ? ` · 正确答案：${escapeHtml(answer)}` : ''}</p>
      <p class="feedback-text">${escapeHtml(result.localExplanation || '')}</p>
      ${pendingNote}
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
  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (state.mode === button.dataset.readMode) return;
      setMode(button.dataset.readMode);
    });
  });
  setMode(state.mode, { render: false });

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
    if (state.mode === 'basic' && /^[1-5]$/.test(event.key) && pending) {
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
