const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261110ag';
const { mountECG } = await import(`../ecg-renderer.js${__asset}`);
const { icon, escapeHtml, medicalDisclaimer } = await import(`../ui.js${__asset}`);

function baseSpec() {
  return {
    rhythm: 'sinus', rate: 72, atrialRate: 72, p: 'normal', pr: 0.16, qrs: 0.08,
    morphology: 'normal', axis: 'normal',
    st: { elevation: {}, depression: {}, shape: 'normal' },
    t: { shape: 'normal', amp: 1 }, u: 0, qt: 0.4, duration: 6, seed: 31,
    extras: [], annotations: [], show12Lead: false,
  };
}

function kStage(k) {
  if (k < 2.5) return { name: '重度低钾', tone: 'danger', text: '显著 U 波、ST 压低、QT(U) 延长，室性心律失常风险高。' };
  if (k < 3.0) return { name: '中度低钾', tone: 'warn', text: 'T 波低平、U 波突出、ST 压低。' };
  if (k < 3.5) return { name: '轻度低钾', tone: 'warn', text: 'T 波振幅下降，U 波开始明显。' };
  if (k <= 5.0) return { name: '正常范围', tone: 'ok', text: 'T 波形态正常，无明显 U 波，QT 在正常范围。' };
  if (k <= 6.0) return { name: '轻度高钾', tone: 'warn', text: 'T 波高尖、基底变窄；P 波与 QRS 尚可。' };
  if (k <= 6.8) return { name: '中度高钾', tone: 'danger', text: 'P 波变平、PR 延长、QRS 增宽，需尽快处理。' };
  if (k <= 7.8) return { name: '重度高钾', tone: 'danger', text: 'P 波消失、QRS 明显增宽，濒临正弦波与停搏。' };
  return { name: '极重度高钾', tone: 'danger', text: '正弦波/极度宽 QRS，心脏骤停风险极高。' };
}

function caStage(ca) {
  if (ca < 1.7) return { name: '重度低钙', tone: 'danger', text: 'ST 明显延长、QT 延长，注意抽搐与尖端扭转。' };
  if (ca < 2.1) return { name: '低钙', tone: 'warn', text: 'ST 段延长导致 QT 延长，T 波形态多正常。' };
  if (ca <= 2.6) return { name: '正常范围', tone: 'ok', text: 'QT 与心率匹配。' };
  return { name: '高钙', tone: 'warn', text: 'QT/ST 缩短；严重时可心动过缓、传导阻滞。' };
}

function mgStage(mg) {
  if (mg < 0.5) return { name: '重度低镁', tone: 'danger', text: 'QT 延长、U 波、T 波低平；尖端扭转与难治性低钾风险。' };
  if (mg < 0.7) return { name: '低镁', tone: 'warn', text: 'QT/U 波改变，常与低钾并存；补钾不补镁往往难纠正。' };
  if (mg <= 1.1) return { name: '正常范围', tone: 'ok', text: '镁对复极影响较小，QT 在正常范围。' };
  if (mg <= 2.0) return { name: '高镁', tone: 'warn', text: 'PR 延长、QRS 增宽、心动过缓；见于肾功能不全/镁剂过量。' };
  return { name: '重度高镁', tone: 'danger', text: '明显心动过缓、低血压、呼吸抑制，需紧急处理。' };
}

function buildSpec(k, ca, mg) {
  const spec = baseSpec();
  if (k < 3.5) {
    spec.t = { shape: 'flat', amp: 0.35 };
    spec.u = k < 2.5 ? 0.4 : k < 3.0 ? 0.32 : 0.22;
    spec.st = { elevation: {}, depression: { II: 0.8, V4: 1, V5: 1, V6: 0.8 }, shape: 'horizontal' };
    spec.qt = 0.46;
    spec.rate = 82;
  } else if (k > 5.0) {
    const severe = k > 6.8;
    spec.t = { shape: 'peaked', amp: k > 7.8 ? 2.8 : k > 6.8 ? 2.5 : k > 6.0 ? 2.1 : 1.7 };
    spec.p = k >= 6.0 ? 'flattened' : 'normal';
    spec.pr = k >= 6.0 ? 0.22 : 0.16;
    spec.qrs = k > 7.8 ? 0.18 : k > 6.8 ? 0.14 : k > 6.0 ? 0.10 : 0.08;
    spec.rate = k > 7.8 ? 36 : k > 6.8 ? 48 : 58;
    spec.qt = 0.4;
    if (k > 7.8) spec.sineWave = true;
    if (severe) spec.extras = ['sine'];
  }
  if (ca < 2.1) {
    spec.qt = Math.min(0.66, spec.qt + (ca < 1.7 ? 0.14 : 0.08));
  } else if (ca > 2.6) {
    spec.qt = Math.max(0.24, spec.qt - 0.08);
  }
  if (mg < 0.7) {
    spec.qt = Math.min(0.7, spec.qt + (mg < 0.5 ? 0.1 : 0.05));
    spec.u = Math.max(spec.u, mg < 0.5 ? 0.32 : 0.16);
    spec.t = { shape: 'flat', amp: Math.min(spec.t.amp, 0.55) };
  } else if (mg > 1.5) {
    spec.pr = Math.min(0.28, spec.pr + (mg > 2.0 ? 0.05 : 0.02));
    spec.qrs = Math.min(0.16, spec.qrs + (mg > 2.0 ? 0.03 : 0.01));
    if (mg > 2.0) spec.rate = Math.min(spec.rate, 48);
  }
  const annotations = [];
  if (k > 5.0) annotations.push({ kind: 'arrow', t: 0.78, label: k > 7.8 ? 'T 波高尖 / 正弦波' : 'T 波高尖对称', tone: 'danger', dir: 'up' });
  if (k < 3.5) annotations.push({ kind: 'arrow', t: 0.92, label: 'U 波', tone: 'warn', dir: 'up' });
  if (ca < 2.1) annotations.push({ kind: 'bracket', t0: 0.55, t1: 0.55 + spec.qt, label: `QT ${spec.qt.toFixed(2)} s（延长）`, tone: 'danger' });
  if (ca > 2.6) annotations.push({ kind: 'bracket', t0: 0.55, t1: 0.55 + spec.qt, label: `QT ${spec.qt.toFixed(2)} s（缩短）`, tone: 'warn' });
  if (mg < 0.7) annotations.push({ kind: 'bracket', t0: 0.55, t1: 0.55 + spec.qt, label: 'QT/U 延长 · 低镁', tone: 'danger' });
  if (mg > 1.5) annotations.push({ kind: 'bracket', t0: 0.38, t1: 0.54, label: 'PR 延长 · 高镁', tone: 'warn' });
  spec.annotations = annotations.slice(0, 4);
  spec.description = `教学模拟：K⁺ ${k.toFixed(1)} mmol/L，Ca²⁺ ${ca.toFixed(2)} mmol/L，Mg²⁺ ${mg.toFixed(2)} mmol/L。`;
  return spec;
}

const PRESETS = {
  normal: [4.2, 2.35, 0.85],
  lowk: [2.4, 2.3, 0.6],
  highk: [6.9, 2.3, 0.85],
  lowca: [4.2, 1.6, 0.85],
  highca: [4.2, 3.0, 0.85],
  lowmg: [3.2, 2.3, 0.45],
  highmg: [4.2, 2.3, 2.3],
  dialysis: [7.2, 1.8, 1.5],
  torsades: [2.8, 2.2, 0.4],
};

const CASES = [
  { id: 'dialysis', title: '透析前高钾', k: 7.2, ca: 1.8, mg: 1.5, text: '少尿、乏力；QRS 增宽，P 波消失。先静脉钙剂稳定心肌，再胰岛素+葡萄糖/透析降钾。' },
  { id: 'diuretic', title: '利尿剂低钾低镁', k: 2.4, ca: 2.3, mg: 0.5, text: '呋塞米后乏力、心悸；U 波突出、QT 延长。补钾同时必须补镁，否则难纠正。' },
  { id: 'thyroid', title: '甲状腺术后低钙', k: 4.1, ca: 1.55, mg: 0.8, text: '口周麻木、手足抽搐；QT 延长。有症状低钙需静脉葡萄糖酸钙并监测。' },
  { id: 'torsades', title: '酒精性低镁 / TdP', k: 3.0, ca: 2.2, mg: 0.4, text: '晕厥，QT 明显延长，多形性室速。硫酸镁 + 纠正钾镁 + 停 QT 延长药。' },
  { id: 'renal-mg', title: '肾功能不全高镁', k: 5.0, ca: 2.15, mg: 2.4, text: '肾功能不全、误用镁剂；PR 延长、QRS 宽、心动过缓。停药、补液并考虑透析。' },
];

const QUIZ = [
  { q: '血钾 6.9 mmol/L，QRS 增宽、P 波消失。最优先的下一步是？', options: ['立即静脉钙剂', '先口服补钾', '单纯利尿', '等待复查'], answer: 0, why: '高钾伴心电图改变时，静脉钙剂先稳定心肌；钙剂不降钾，随后必须降钾。' },
  { q: '低钾伴 U 波、QT 延长，补钾后仍低。最应补充什么？', options: ['镁', '钠', '氯', '白蛋白'], answer: 0, why: '低镁常与低钾并存；不补镁时肾性丢钾与复极异常难以纠正。' },
  { q: '血钙 1.55 mmol/L、QT 延长并有手足抽搐，首选？', options: ['静脉葡萄糖酸钙', '口服钙片观察', 'β 受体阻滞剂', '补钾'], answer: 0, why: '有症状低钙需静脉钙剂，同时查白蛋白、镁、肾功能与病因。' },
  { q: '低镁 + 尖端扭转型室速，最关键的药物是？', options: ['硫酸镁', '维拉帕米', '地高辛', '硝酸甘油'], answer: 0, why: 'TdP 首选静脉硫酸镁；同时纠正钾、停 QT 延长药，必要时非同步除颤。' },
  { q: '高镁最常见的心电图表现是？', options: ['PR 延长、QRS 增宽、心动过缓', 'T 波高尖、QT 缩短', 'U 波突出', 'ST 段抬高'], answer: 0, why: '高镁抑制房室结与传导，出现 PR/QRS 延长、心动过缓与低血压。' },
];

function quizMarkup(answers) {
  return QUIZ.map((item, qi) => {
    const selected = answers[qi];
    const answered = selected !== undefined;
    return `<div class="lab-quiz-item ${answered ? (selected === item.answer ? 'right' : 'wrong') : ''}">
      <div class="lab-quiz-q"><b>${qi + 1}.</b> ${escapeHtml(item.q)}</div>
      <div class="lab-quiz-options">${item.options.map((option, oi) => `<button class="chip ${answered && oi === item.answer ? 'right' : ''} ${answered && oi === selected && oi !== item.answer ? 'wrong' : ''}" type="button" data-quiz-q="${qi}" data-quiz-option="${oi}" ${answered ? 'disabled' : ''}>${escapeHtml(option)}</button>`).join('')}</div>
      ${answered ? `<div class="lab-quiz-why">${selected === item.answer ? '正确。' : `正确答案：${escapeHtml(item.options[item.answer])}。`} ${escapeHtml(item.why)}</div>` : ''}
    </div>`;
  }).join('');
}

export async function labView() {
  const el = document.createElement('div');
  el.className = 'page';
  const state = { k: 4.2, ca: 2.35, mg: 0.85, lead: 'V3', answers: {} };
  let viewerII = null;
  let viewerV3 = null;
  let viewer12 = null;
  el.innerHTML = `
    <header class="page-head">
      <div>
        <div class="page-eyebrow">${icon('flask', 14)} ELECTROLYTE LAB</div>
        <h1 class="page-title">电解质实验室</h1>
        <p class="page-sub">拖动 K⁺、Ca²⁺、Mg²⁺ 滑杆，观察 T 波、U 波、QT、PR 与 QRS 的联动；再用病例和自测把形态变成决策。</p>
      </div>
      <span class="badge badge-brand">实时生成 · 教学形态近似</span>
    </header>
    <div class="lab-grid">
      <div class="lab-viewers">
        <div class="ecg-card">
          <div class="ecg-toolbar"><div class="ecg-toolbar-group"><span class="badge badge-brand">II 导联</span><span class="ecg-toolbar-label">节律条 · 25 mm/s</span></div><div class="row-wrap"><span class="badge" data-lab-k-label>K⁺ 4.2</span><button class="btn btn-xs btn-ghost" type="button" data-lab-play>${icon('play', 12)} 播放</button></div></div>
          <div id="lab-ecg-ii"></div>
        </div>
        <div class="ecg-card">
          <div class="ecg-toolbar"><div class="ecg-toolbar-group"><span class="badge badge-brand" data-lab-lead-label>V3 导联</span><span class="ecg-toolbar-label">观察 T 波、U 波与 QT</span></div><div class="row-wrap"><span class="badge" data-lab-ca-label>Ca²⁺ 2.35</span><span class="badge" data-lab-mg-label>Mg²⁺ 0.85</span><select class="select" data-lab-lead aria-label="选择胸导联" style="width:auto;min-height:28px;padding:2px 5px;font-size:9px"><option>V1</option><option>V2</option><option selected>V3</option><option>V4</option><option>V5</option><option>V6</option></select></div></div>
          <div id="lab-ecg-v3"></div>
        </div>
        <div class="ecg-card lab-12lead-card">
          <div class="ecg-toolbar"><div class="ecg-toolbar-group"><span class="badge badge-brand">标准 12 导联</span><span class="ecg-toolbar-label">播放时各导联同步滚动</span></div><div class="row-wrap"><button class="btn btn-xs btn-ghost" type="button" data-lab-play-12>${icon('play', 12)} 播放</button><select class="select" data-lab-view-mode aria-label="12导联显示模式" style="width:auto;min-height:28px;padding:2px 5px;font-size:9px"><option value="grid" selected>标准 12 导联</option><option value="snapshot">单图（无节律条）</option><option value="single">单导联</option><option value="rows">各导联横向</option></select><select class="select" data-lab-view-lead aria-label="单导联选择" style="width:auto;min-height:28px;padding:2px 5px;font-size:9px"><option>II</option><option>V1</option><option>V2</option><option>V3</option><option>V4</option><option>V5</option><option>V6</option></select></div></div>
          <div id="lab-ecg-12lead"></div>
          <div class="lab-stage" data-lab-stage></div>
        </div>
      </div>
      <aside class="stack">
        <section class="lab-controls">
          <div class="lab-slider">
            <div class="lab-slider-head"><span class="lab-slider-name">血钾 K⁺</span><span class="lab-slider-value"><span data-k-value>4.2</span><small> mmol/L</small></span></div>
            <input class="slider" type="range" min="2.0" max="8.5" step="0.1" value="4.2" data-k-slider aria-label="血钾">
            <div class="lab-range-labels"><span>2.0</span><span>3.5</span><span>5.0</span><span>6.5</span><span>8.5</span></div>
            <div class="range-badges"><span class="badge">低钾 &lt;3.5</span><span class="badge badge-warn">高钾 &gt;5.5</span><span class="badge badge-danger">危重 &gt;6.5</span></div>
          </div>
          <div class="lab-slider">
            <div class="lab-slider-head"><span class="lab-slider-name">血钙 Ca²⁺</span><span class="lab-slider-value"><span data-ca-value>2.35</span><small> mmol/L</small></span></div>
            <input class="slider" type="range" min="1.2" max="3.4" step="0.05" value="2.35" data-ca-slider aria-label="血钙">
            <div class="lab-range-labels"><span>1.2</span><span>2.1</span><span>2.6</span><span>3.4</span></div>
            <div class="range-badges"><span class="badge badge-warn">低钙 &lt;2.1</span><span class="badge">正常 2.1–2.6</span><span class="badge badge-warn">高钙 &gt;2.6</span></div>
          </div>
          <div class="lab-slider">
            <div class="lab-slider-head"><span class="lab-slider-name">血镁 Mg²⁺</span><span class="lab-slider-value"><span data-mg-value>0.85</span><small> mmol/L</small></span></div>
            <input class="slider" type="range" min="0.4" max="2.5" step="0.05" value="0.85" data-mg-slider aria-label="血镁">
            <div class="lab-range-labels"><span>0.4</span><span>0.7</span><span>1.1</span><span>2.5</span></div>
            <div class="range-badges"><span class="badge badge-danger">低镁 &lt;0.7</span><span class="badge">正常 0.7–1.1</span><span class="badge badge-warn">高镁 &gt;1.1</span></div>
          </div>
          <div class="preset-row">
            ${Object.keys(PRESETS).map((id) => `<button class="chip" type="button" data-preset="${id}">${{ normal: '正常', lowk: '低钾', highk: '高钾', lowca: '低钙', highca: '高钙', lowmg: '低镁', highmg: '高镁', dialysis: '透析高钾', torsades: 'TdP' }[id]}</button>`).join('')}
          </div>
        </section>
        <section class="lab-side-card">
          <h3>${icon('target', 13)} 当前心电图解释</h3>
          <div class="lab-stage" data-lab-summary style="margin-top:8px"></div>
        </section>
        <section class="lab-side-card">
          <h3>离子 / 正常值 / 心电图效应</h3>
          <div class="lab-ion-table">
            <div><b>K⁺</b><span>3.5–5.0</span><small>低：U 波、ST 低；高：T 高尖、QRS 增宽</small></div>
            <div><b>Ca²⁺</b><span>2.1–2.6</span><small>低：QT 长；高：QT 短</small></div>
            <div><b>Mg²⁺</b><span>0.7–1.1</span><small>低：QT/U、TdP；高：PR/QRS 宽、心动过缓</small></div>
          </div>
        </section>
        <section class="lab-side-card">
          <h3>高钾处理顺序</h3>
          <ul><li>有心电图改变或 K⁺ &gt;6.5：先静脉钙剂稳定心肌。</li><li>胰岛素+葡萄糖、β₂ 激动剂促钾转移。</li><li>碳酸氢钠用于合并酸中毒；透析清除。</li><li>持续监护，复查血钾与血糖。</li></ul>
        </section>
        <section class="lab-side-card">
          <h3>低钾 / 钙镁处理要点</h3>
          <ul><li>低钾：口服或静脉补钾，同时纠镁。</li><li>低钙：有症状时静脉葡萄糖酸钙。</li><li>低镁/TdP：静脉硫酸镁，停 QT 延长药。</li><li>高钙：补液扩容，严重时降钙素/双膦酸盐。</li></ul>
        </section>
      </aside>
    </div>
    <section class="lab-extra-grid">
      <div class="lab-side-card">
        <div class="section-head"><h3 class="section-title" style="font-size:17px">临床病例 · 点击加载</h3><span class="badge">${CASES.length} 例</span></div>
        <div class="lab-case-list">${CASES.map((c) => `<button type="button" class="lab-case" data-case="${c.id}"><b>${escapeHtml(c.title)}</b><span>${escapeHtml(c.text)}</span><small>K ${c.k} · Ca ${c.ca} · Mg ${c.mg}</small></button>`).join('')}</div>
      </div>
      <div class="lab-side-card">
        <div class="section-head"><h3 class="section-title" style="font-size:17px">5 题自测</h3><span class="badge" data-quiz-score>0 / ${QUIZ.length}</span></div>
        <div class="lab-quiz" data-lab-quiz>${quizMarkup(state.answers)}</div>
      </div>
    </section>
    ${medicalDisclaimer()}
    <footer class="page-footer">滑杆与病例只用于演示形态学趋势，不能据此调整真实患者的治疗。</footer>`;

  const kSlider = el.querySelector('[data-k-slider]');
  const caSlider = el.querySelector('[data-ca-slider]');
  const mgSlider = el.querySelector('[data-mg-slider]');
  const kValue = el.querySelector('[data-k-value]');
  const caValue = el.querySelector('[data-ca-value]');
  const mgValue = el.querySelector('[data-mg-value]');
  const stage = el.querySelector('[data-lab-stage]');
  const summary = el.querySelector('[data-lab-summary]');
  const leadSelect = el.querySelector('[data-lab-lead]');
  const viewMode = el.querySelector('[data-lab-view-mode]');
  const viewLead = el.querySelector('[data-lab-view-lead]');
  const playButton = el.querySelector('[data-lab-play]');
  const play12Button = el.querySelector('[data-lab-play-12]');
  const sync12Button = () => {
    if (play12Button) play12Button.innerHTML = viewer12?.playing ? `${icon('pause', 12)} 暂停` : `${icon('play', 12)} 播放`;
  };

  const render = () => {
    const spec = buildSpec(state.k, state.ca, state.mg);
    const ks = kStage(state.k);
    const cs = caStage(state.ca);
    const ms = mgStage(state.mg);
    kValue.textContent = state.k.toFixed(1);
    caValue.textContent = state.ca.toFixed(2);
    mgValue.textContent = state.mg.toFixed(2);
    el.querySelector('[data-lab-k-label]').textContent = `K⁺ ${state.k.toFixed(1)} mmol/L`;
    el.querySelector('[data-lab-ca-label]').textContent = `Ca²⁺ ${state.ca.toFixed(2)} mmol/L`;
    el.querySelector('[data-lab-mg-label]').textContent = `Mg²⁺ ${state.mg.toFixed(2)} mmol/L`;
    el.querySelector('[data-lab-lead-label]').textContent = `${state.lead} 导联`;
    stage.innerHTML = `<span class="stage-name" style="color:var(--${ks.tone === 'danger' ? 'danger' : ks.tone === 'warn' ? 'warn' : 'ok'})">${escapeHtml(ks.name)}</span><span>${escapeHtml(ks.text)}</span>`;
    summary.innerHTML = `<span class="stage-name">综合判读</span><span>钾：${escapeHtml(ks.name)}；钙：${escapeHtml(cs.name)}；镁：${escapeHtml(ms.name)}。${escapeHtml(spec.description)}</span>`;
    if (viewerII) viewerII.setSpec(spec);
    if (viewerV3) { viewerV3.setSpec(spec); viewerV3.setLead(state.lead); }
    if (viewer12) {
      viewer12.setSpec(spec);
      if (viewMode?.value === 'single') viewer12.setLead(viewLead?.value || 'II');
    }
  };

  const applyValues = (k, ca, mg) => {
    state.k = Number(k); state.ca = Number(ca); state.mg = Number(mg);
    kSlider.value = String(state.k); caSlider.value = String(state.ca); mgSlider.value = String(state.mg);
    render();
  };

  const iiHost = el.querySelector('#lab-ecg-ii');
  const v3Host = el.querySelector('#lab-ecg-v3');
  const initialSpec = buildSpec(state.k, state.ca, state.mg);
  viewerII = mountECG(iiHost, initialSpec, { mode: 'rhythm', lead: 'II', speed: 1, showAnnotations: true, autoPlay: false, reveal: false });
  viewerV3 = mountECG(v3Host, initialSpec, { mode: 'rhythm', lead: 'V3', speed: 1, showAnnotations: true, autoPlay: false, reveal: false });
  viewerV3.setLead('V3');
  const twelveHost = el.querySelector('#lab-ecg-12lead');
  viewer12 = mountECG(twelveHost, initialSpec, { mode: '12lead', speed: 1, showAnnotations: false, showSummary: false, autoPlay: false, twelveLayout: 'grid', twelveRhythm: true, reveal: false });

  kSlider.addEventListener('input', () => { state.k = Number(kSlider.value); render(); });
  caSlider.addEventListener('input', () => { state.ca = Number(caSlider.value); render(); });
  mgSlider.addEventListener('input', () => { state.mg = Number(mgSlider.value); render(); });
  leadSelect.addEventListener('change', () => { state.lead = leadSelect.value; render(); });
  const applyViewMode = () => {
    if (!viewer12) return;
    const mode = viewMode?.value || 'grid';
    if (mode === 'single') {
      viewer12.setMode('rhythm');
      viewer12.setLead(viewLead?.value || 'II');
    } else {
      viewer12.setMode('12lead');
      viewer12.setTwelveLayout(mode === 'rows' ? 'rows' : 'grid');
      viewer12.setTwelveRhythm(mode !== 'snapshot');
    }
  };
  viewMode?.addEventListener('change', applyViewMode);
  viewLead?.addEventListener('change', () => { if (viewMode?.value === 'single') viewer12?.setLead(viewLead.value); });
  playButton?.addEventListener('click', () => {
    const playing = viewerII?.playing;
    if (playing) { viewerII.pause(); viewerV3?.pause(); viewer12?.pause(); playButton.innerHTML = `${icon('play', 12)} 播放`; }
    else { viewerII?.play(1); viewerV3?.play(1); viewer12?.play(1); playButton.innerHTML = `${icon('pause', 12)} 暂停`; }
    sync12Button();
  });
  play12Button?.addEventListener('click', () => {
    if (viewer12?.playing) viewer12.pause();
    else viewer12?.play(1);
    sync12Button();
  });
  twelveHost.addEventListener('ecg:play', sync12Button);
  twelveHost.addEventListener('ecg:pause', sync12Button);
  el.addEventListener('click', (event) => {
    const preset = event.target.closest('[data-preset]');
    if (preset) {
      const values = PRESETS[preset.dataset.preset];
      if (values) applyValues(...values);
    }
    const caseButton = event.target.closest('[data-case]');
    if (caseButton) {
      const item = CASES.find((c) => c.id === caseButton.dataset.case);
      if (item) applyValues(item.k, item.ca, item.mg);
    }
    const option = event.target.closest('[data-quiz-option]');
    if (option) {
      const qi = Number(option.dataset.quizQ);
      const oi = Number(option.dataset.quizOption);
      if (state.answers[qi] === undefined) {
        state.answers[qi] = oi;
        const quiz = el.querySelector('[data-lab-quiz]');
        if (quiz) quiz.innerHTML = quizMarkup(state.answers);
        const correct = QUIZ.filter((q, i) => state.answers[i] === q.answer).length;
        const score = el.querySelector('[data-quiz-score]');
        if (score) score.textContent = `${correct} / ${QUIZ.length}`;
      }
    }
  });
  render();

  return {
    el,
    destroy() { if (viewerII) viewerII.destroy(); if (viewerV3) viewerV3.destroy(); if (viewer12) viewer12.destroy(); },
  };
}
