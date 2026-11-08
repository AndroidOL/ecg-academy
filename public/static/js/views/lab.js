const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108f';
const { mountECG } = await import(`../ecg-renderer.js${__asset}`);
import { icon, escapeHtml, medicalDisclaimer } from '../ui.js';

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

function buildSpec(k, ca) {
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
  const annotations = [];
  if (k > 5.0) annotations.push({ kind: 'arrow', t: 0.78, label: k > 7.8 ? 'T 波高尖 / 正弦波' : 'T 波高尖对称', tone: 'danger', dir: 'up' });
  if (k < 3.5) annotations.push({ kind: 'arrow', t: 0.92, label: 'U 波', tone: 'warn', dir: 'up' });
  if (ca < 2.1) annotations.push({ kind: 'bracket', t0: 0.55, t1: 0.55 + spec.qt, label: `QT ${spec.qt.toFixed(2)} s（延长）`, tone: 'danger' });
  if (ca > 2.6) annotations.push({ kind: 'bracket', t0: 0.55, t1: 0.55 + spec.qt, label: `QT ${spec.qt.toFixed(2)} s（缩短）`, tone: 'warn' });
  spec.annotations = annotations.slice(0, 3);
  spec.description = `教学模拟：K⁺ ${k.toFixed(1)} mmol/L，Ca²⁺ ${ca.toFixed(1)} mmol/L。`;
  return spec;
}

export async function labView() {
  const el = document.createElement('div');
  el.className = 'page';
  const state = { k: 4.2, ca: 2.35 };
  let viewerII = null;
  let viewerV3 = null;
  el.innerHTML = `
    <header class="page-head">
      <div>
        <div class="page-eyebrow">${icon('flask', 14)} ELECTROLYTE LAB</div>
        <h1 class="page-title">电解质实验室</h1>
        <p class="page-sub">拖动滑杆，观察钾、钙如何改变 T 波、QT、QRS 与 U 波。先看形态变化，再读处理原则。</p>
      </div>
      <span class="badge badge-brand">实时生成 · 教学形态近似</span>
    </header>
    <div class="lab-grid">
      <div class="lab-viewers">
        <div class="ecg-card">
          <div class="ecg-toolbar"><div class="ecg-toolbar-group"><span class="badge badge-brand">II 导联</span><span class="ecg-toolbar-label">节律条 · 25 mm/s</span></div><span class="badge" data-lab-k-label>K⁺ 4.2</span></div>
          <div id="lab-ecg-ii"></div>
        </div>
        <div class="ecg-card">
          <div class="ecg-toolbar"><div class="ecg-toolbar-group"><span class="badge badge-brand">V3 导联</span><span class="ecg-toolbar-label">观察 T 波与 U 波</span></div><span class="badge" data-lab-ca-label>Ca²⁺ 2.35</span></div>
          <div id="lab-ecg-v3"></div>
        </div>
        <div class="lab-stage" data-lab-stage></div>
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
          <div class="preset-row">
            <button class="chip" type="button" data-preset="normal">正常</button>
            <button class="chip" type="button" data-preset="lowk">低钾</button>
            <button class="chip" type="button" data-preset="highk">高钾</button>
            <button class="chip" type="button" data-preset="lowca">低钙</button>
            <button class="chip" type="button" data-preset="highca">高钙</button>
          </div>
        </section>
        <section class="lab-side-card">
          <h3>${icon('target', 13)} 当前心电图解释</h3>
          <div class="lab-stage" data-lab-summary style="margin-top:8px"></div>
        </section>
        <section class="lab-side-card">
          <h3>高钾处理顺序</h3>
          <ul><li>有心电图改变或 K⁺ &gt;6.5：先静脉钙剂稳定心肌。</li><li>胰岛素+葡萄糖、β₂ 激动剂促钾转移。</li><li>碳酸氢钠用于合并酸中毒；透析清除。</li><li>持续监护，复查血钾与血糖。</li></ul>
        </section>
        <section class="lab-side-card">
          <h3>低钾 / 钙处理要点</h3>
          <ul><li>低钾：口服或静脉补钾，同时纠镁。</li><li>低钙：有症状时静脉葡萄糖酸钙。</li><li>高钙：补液扩容，严重时降钙素/双膦酸盐。</li></ul>
        </section>
      </aside>
    </div>
    ${medicalDisclaimer()}
    <footer class="page-footer">滑杆只用于演示形态学趋势，不能据此调整真实患者的治疗。</footer>`;

  const kSlider = el.querySelector('[data-k-slider]');
  const caSlider = el.querySelector('[data-ca-slider]');
  const kValue = el.querySelector('[data-k-value]');
  const caValue = el.querySelector('[data-ca-value]');
  const stage = el.querySelector('[data-lab-stage]');
  const summary = el.querySelector('[data-lab-summary]');

  const render = () => {
    const spec = buildSpec(state.k, state.ca);
    const ks = kStage(state.k);
    const cs = caStage(state.ca);
    kValue.textContent = state.k.toFixed(1);
    caValue.textContent = state.ca.toFixed(2);
    el.querySelector('[data-lab-k-label]').textContent = `K⁺ ${state.k.toFixed(1)} mmol/L`;
    el.querySelector('[data-lab-ca-label]').textContent = `Ca²⁺ ${state.ca.toFixed(2)} mmol/L`;
    stage.innerHTML = `<span class="stage-name" style="color:var(--${ks.tone === 'danger' ? 'danger' : ks.tone === 'warn' ? 'warn' : 'ok'})">${escapeHtml(ks.name)}</span><span>${escapeHtml(ks.text)}</span>`;
    summary.innerHTML = `<span class="stage-name">综合判读</span><span>钾：${escapeHtml(ks.name)}；钙：${escapeHtml(cs.name)}。${escapeHtml(spec.description)}</span>`;
    if (viewerII) viewerII.setSpec(spec);
    if (viewerV3) viewerV3.setSpec(spec);
    if (viewerV3) viewerV3.setLead('V3');
  };

  const iiHost = el.querySelector('#lab-ecg-ii');
  const v3Host = el.querySelector('#lab-ecg-v3');
  const initialSpec = buildSpec(state.k, state.ca);
  viewerII = mountECG(iiHost, initialSpec, { mode: 'rhythm', lead: 'II', speed: 2, showAnnotations: true, autoPlay: false });
  viewerV3 = mountECG(v3Host, initialSpec, { mode: 'rhythm', lead: 'V3', speed: 2, showAnnotations: true, autoPlay: false });
  viewerV3.setLead('V3');

  kSlider.addEventListener('input', () => {
    state.k = Number(kSlider.value);
    render();
  });
  caSlider.addEventListener('input', () => {
    state.ca = Number(caSlider.value);
    render();
  });
  el.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const presets = {
        normal: [4.2, 2.3], lowk: [2.4, 2.3], highk: [6.9, 2.3], lowca: [4.2, 1.6], highca: [4.2, 3.0],
      };
      const [k, ca] = presets[button.dataset.preset] || presets.normal;
      state.k = k;
      state.ca = ca;
      kSlider.value = String(k);
      caSlider.value = String(ca);
      render();
    });
  });
  render();

  return {
    el,
    destroy() {
      if (viewerII) viewerII.destroy();
      if (viewerV3) viewerV3.destroy();
    },
  };
}
