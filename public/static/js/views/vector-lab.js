const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108r';
const { icon, escapeHtml } = await import(`../ui.js${__asset}`);

const LEADS = {
  I:   { angle: 0,   vec: [1, 0, 0],     name: 'I 导联',   note: '左臂-右臂，观察左右方向' },
  II:  { angle: 60,  vec: [0.5, -0.866, 0], name: 'II 导联',  note: '左腿-右臂，下壁/节律常用' },
  III: { angle: 120, vec: [-0.5, -0.866, 0], name: 'III 导联', note: '左腿-左臂，下壁' },
  aVR: { angle: -150, vec: [-0.866, 0.5, 0], name: 'aVR 导联', note: '右上，正常 P/QRS/T 多倒置' },
  aVL: { angle: -30, vec: [0.866, 0.5, 0], name: 'aVL 导联', note: '左上，侧壁' },
  aVF: { angle: 90,  vec: [0, -1, 0],     name: 'aVF 导联', note: '正下，下壁' },
};

const CHEST = {
  V1: { x: 145, y: 112, name: 'V1', note: '右胸第 4 肋间，胸骨右缘；观察右室/室间隔，QRS 多呈 rS' },
  V2: { x: 170, y: 112, name: 'V2', note: '左胸第 4 肋间，胸骨左缘；观察室间隔/前壁' },
  V3: { x: 192, y: 124, name: 'V3', note: 'V2 与 V4 连线中点；移行区' },
  V4: { x: 214, y: 140, name: 'V4', note: '左锁骨中线第 5 肋间；前壁/心尖' },
  V5: { x: 236, y: 145, name: 'V5', note: '左腋前线第 5 肋间；侧壁' },
  V6: { x: 254, y: 148, name: 'V6', note: '左腋中线第 5 肋间；侧壁' },
};

const LOOP_LABELS = {
  P: { color: 'var(--brand)', text: 'P 环：心房除极，向量小、时间短' },
  QRS: { color: 'var(--accent)', text: 'QRS 环：心室除极，向量大、变化快' },
  T: { color: 'var(--gold)', text: 'T 环：心室复极，方向与 QRS 主向量大致相同' },
};

function canvas2d(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, Math.round(rect.width || canvas.parentElement?.clientWidth || 360));
  const height = Math.round(Number(canvas.dataset.height || 300));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function palette() {
  const css = getComputedStyle(document.documentElement);
  return {
    bg: css.getPropertyValue('--ecg-bg').trim() || '#07211f',
    grid: css.getPropertyValue('--ecg-grid-major').trim() || '#19413a',
    trace: css.getPropertyValue('--ecg-trace').trim() || '#64dcc5',
    text: css.getPropertyValue('--ink').trim() || '#e7f6f0',
    muted: css.getPropertyValue('--muted').trim() || '#90aaa5',
    brand: css.getPropertyValue('--brand').trim() || '#14b8a6',
    accent: css.getPropertyValue('--accent').trim() || '#f07868',
    gold: css.getPropertyValue('--gold').trim() || '#d4a45a',
  };
}

function drawVectorCanvas(canvas, state, t) {
  const { ctx, width, height } = canvas2d(canvas);
  const c = palette();
  const cx = width / 2;
  const cy = height / 2 + 6;
  const scale = Math.min(width, height) * 0.23;
  const yaw = state.rotate * Math.PI / 180;
  const pitch = (state.pitch || 0) * Math.PI / 180;
  const project = ([x, y, z]) => {
    const y1 = y * Math.cos(pitch) - z * Math.sin(pitch);
    const z1 = y * Math.sin(pitch) + z * Math.cos(pitch);
    const rx = x * Math.cos(yaw) - z1 * Math.sin(yaw);
    const rz = x * Math.sin(yaw) + z1 * Math.cos(yaw);
    return [cx + rx * scale, cy - y1 * scale + rz * scale * 0.28];
  };
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = c.grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4;
  for (let i = -4; i <= 4; i += 1) {
    const a = project([i / 4, -1, 0]);
    const b = project([i / 4, 1, 0]);
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
    const d = project([-1, i / 4, 0]);
    const e = project([1, i / 4, 0]);
    ctx.beginPath(); ctx.moveTo(...d); ctx.lineTo(...e); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const axes = [
    { label: '左', p: [1.25, 0, 0] }, { label: '右', p: [-1.25, 0, 0] },
    { label: '上', p: [0, 1.25, 0] }, { label: '下', p: [0, -1.25, 0] },
    { label: '前', p: [0, 0, 1.25] }, { label: '后', p: [0, 0, -1.25] },
  ];
  ctx.font = '10px ui-monospace, monospace';
  axes.forEach((axis) => {
    const p = project(axis.p);
    ctx.strokeStyle = c.muted;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...p); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.muted;
    ctx.fillText(axis.label, p[0] + 4, p[1] - 4);
  });
  const loops = {
    // x = 左，y = 上，z = 前。正常心室除极的主向量总体指向左下、略向后。
    P: (a) => [0.18 + 0.24 * Math.cos(a), -0.1 + 0.16 * Math.sin(a), 0.04 * Math.sin(a * 2)],
    QRS: (a) => [0.34 + 0.62 * Math.cos(a) + 0.1 * Math.cos(3 * a), -0.22 + 0.34 * Math.sin(a) + 0.09 * Math.sin(3 * a), -0.12 + 0.18 * Math.sin(a + 0.7)],
    T: (a) => [0.3 + 0.5 * Math.cos(a) + 0.03 * Math.cos(4 * a), -0.18 + 0.28 * Math.sin(a), -0.08 + 0.1 * Math.sin(a + 1.4)],
  };
  const loopColors = { P: c.brand, QRS: c.accent, T: c.gold };
  const axisDelta = ((state.axis ?? 60) - 60) * Math.PI / 180;
  const rotateAxis = ([x, y, z]) => [x * Math.cos(axisDelta) - y * Math.sin(axisDelta), x * Math.sin(axisDelta) + y * Math.cos(axisDelta), z];
  const loopPoint = (key, a) => (key === 'QRS' ? rotateAxis(loops.QRS(a)) : loops[key](a));
  const cycle = (t / 1800) % 1;
  const windows = { P: [0, 0.16], QRS: [0.2, 0.42], T: [0.55, 0.8] };
  let active = null;
  Object.entries(windows).forEach(([key, [start, end]]) => { if (cycle >= start && cycle < end) active = key; });
  Object.entries(loops).forEach(([key, fn]) => {
    if (state.loop !== 'all' && state.loop !== key) return;
    const isActive = key === active;
    ctx.strokeStyle = loopColors[key];
    ctx.lineWidth = key === state.loop ? 2.2 : 1.4;
    ctx.globalAlpha = state.loop === 'all' ? (isActive ? 1 : 0.12) : 1;
    if (isActive) { ctx.shadowColor = loopColors[key]; ctx.shadowBlur = 5; }
    ctx.beginPath();
    for (let i = 0; i <= 100; i += 1) {
      const a = (i / 100) * Math.PI * 2;
      const p = project(loopPoint(key, a));
      if (i === 0) ctx.moveTo(...p); else ctx.lineTo(...p);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  });
  const selected = state.loop === 'all' ? (active || 'QRS') : state.loop;
  const phase = active === selected ? (cycle - windows[selected][0]) / (windows[selected][1] - windows[selected][0]) : 0;
  const vec = loops[selected](Math.max(0, Math.min(1, phase)) * Math.PI * 2);
  const rotatedVec = selected === 'QRS' ? rotateAxis(vec) : vec;
  const p0 = project([0, 0, 0]);
  const p1 = project(rotatedVec);
  if (active && (state.loop === 'all' || state.loop === active)) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(...p1, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  const main = selected === 'QRS' ? rotateAxis(loops.QRS(0.8)) : loops[selected](0.8);
  const pm = project(main);
  ctx.strokeStyle = c.gold;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...pm); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = c.gold;
  ctx.font = '600 9.5px ui-monospace, monospace';
  ctx.fillText('主方向', pm[0] + 5, pm[1] - 4);
  const lead = LEADS[state.lead];
  const dot = rotatedVec[0] * lead.vec[0] + rotatedVec[1] * lead.vec[1] + rotatedVec[2] * lead.vec[2];
  ctx.fillStyle = c.text;
  ctx.font = '600 11px ui-monospace, monospace';
  const activeLabel = active ? `当前 ${active} 波 · ` : '等电位线 · ';
  const movingLabel = active === selected ? `${selected} 环在转动` : `${selected} 环静止`;
  ctx.fillText(`${activeLabel}${movingLabel} · ${lead.name} 投影 ${dot >= 0 ? '+' : ''}${dot.toFixed(2)}`, 12, 18);
  ctx.fillStyle = c.muted;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('P/QRS/T 只在各自时间窗内转动；主向量总体指向左下', 12, height - 10);
}

function drawProjectionCanvas(canvas, state, t) {
  const { ctx, width, height } = canvas2d(canvas);
  const c = palette();
  const padL = 34; const padR = 12; const top = 12; const bottom = 18;
  const plotW = width - padL - padR;
  const baseline = top + (height - top - bottom) * 0.62;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = c.grid; ctx.globalAlpha = .35;
  for (let i = 0; i <= 10; i += 1) {
    const x = padL + (i / 10) * plotW;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, height - bottom); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const lead = LEADS[state.lead];
  const dot = (v) => v[0] * lead.vec[0] + v[1] * lead.vec[1] + v[2] * lead.vec[2];
  const ampP = dot([0.28, 0.18, 0.05]) * 0.7;
  const ampQ = dot([0.72, 0.32, 0.12]) * 1.5;
  const ampT = dot([0.58, 0.3, 0.1]) * 0.9;
  const phase = (t / 1800) % 1;
  const yAt = (x) => {
    const u = x / plotW;
    let v = 0;
    v += ampP * Math.exp(-Math.pow((u - 0.18) / 0.022, 2));
    v -= ampQ * 0.55 * Math.exp(-Math.pow((u - 0.33) / 0.011, 2));
    v += ampQ * Math.exp(-Math.pow((u - 0.36) / 0.012, 2));
    v -= ampQ * 0.22 * Math.exp(-Math.pow((u - 0.39) / 0.012, 2));
    v += ampT * Math.exp(-Math.pow((u - 0.64) / 0.055, 2));
    return baseline - v * (height - top - bottom) * 0.5;
  };
  ctx.strokeStyle = c.trace; ctx.lineWidth = 1.7; ctx.beginPath();
  for (let i = 0; i <= plotW; i += 1) {
    const x = padL + i; const y = yAt(i);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const cx = padL + phase * plotW;
  const cy = yAt(phase * plotW);
  ctx.strokeStyle = '#fff'; ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, height - bottom); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.text; ctx.font = '600 9.5px ui-monospace, monospace';
  ctx.fillText(`${lead.name} 投影 · P ${ampP >= 0 ? '+' : ''}${ampP.toFixed(2)}  QRS ${ampQ >= 0 ? '+' : ''}${ampQ.toFixed(2)}  T ${ampT >= 0 ? '+' : ''}${ampT.toFixed(2)}`, padL, 13);
  ctx.fillStyle = c.muted; ctx.font = '9px ui-monospace, monospace';
  ctx.fillText('时间光标同步显示：同一瞬时向量 → 同一导联波形', padL, height - 5);
}

function updateProjectionBars(host, state, t) {
  const cycle = (t / 1800) % 1;
  const windows = { P: [0, 0.16], QRS: [0.2, 0.42], T: [0.55, 0.8] };
  let active = null;
  Object.entries(windows).forEach(([key, [start, end]]) => { if (cycle >= start && cycle < end) active = key; });
  const loop = active || (state.loop === 'all' ? 'QRS' : state.loop);
  const a = (((t / 1800) % 1) * Math.PI * 2);
  let point = loop === 'P'
    ? [0.18 + 0.24 * Math.cos(a), -0.1 + 0.16 * Math.sin(a), 0.04 * Math.sin(2 * a)]
    : loop === 'T'
      ? [0.3 + 0.5 * Math.cos(a), -0.18 + 0.28 * Math.sin(a), -0.08 + 0.1 * Math.sin(a + 1.4)]
      : [0.34 + 0.62 * Math.cos(a) + 0.1 * Math.cos(3 * a), -0.22 + 0.34 * Math.sin(a) + 0.09 * Math.sin(3 * a), -0.12 + 0.18 * Math.sin(a + 0.7)];
  if (loop === 'QRS') {
    const d = ((state.axis ?? 60) - 60) * Math.PI / 180;
    point = [point[0] * Math.cos(d) - point[1] * Math.sin(d), point[0] * Math.sin(d) + point[1] * Math.cos(d), point[2]];
  }
  Object.entries(LEADS).forEach(([id, lead]) => {
    const value = point[0] * lead.vec[0] + point[1] * lead.vec[1] + point[2] * lead.vec[2];
    const valueNode = host.querySelector(`[data-projection-value="${id}"]`);
    const bar = host.querySelector(`[data-projection-row="${id}"] i`);
    if (valueNode) valueNode.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
    if (bar) {
      bar.style.width = `${Math.min(100, Math.abs(value) * 100)}%`;
      bar.classList.toggle('negative', value < 0);
    }
  });
}

function vectorLoopsPanel() {
  return `<div class="visual-grid">
    <div class="visual-card visual-card-dark">
      <canvas data-vector-canvas data-height="360" aria-label="心电向量环三维投影动画"></canvas>
      <div class="vector-timeline" data-vector-timeline><span>P</span><span>QRS</span><span>T</span><i data-vector-timeline-cursor></i></div>
      <div class="visual-sync"><div class="visual-sync-head"><span>同步导联波形</span><span data-vector-sync-label>II 导联 · 时间光标</span></div><canvas data-vector-ecg data-height="112" aria-label="向量环同步导联波形"></canvas></div>
      <div class="vector-projections" data-vector-projections>${Object.entries(LEADS).map(([id, lead]) => `<div data-projection-row="${id}"><b>${id}</b><div class="vector-projection-track"><i></i></div><span data-projection-value="${id}">+0.00</span></div>`).join('')}</div>
      <div class="visual-controls">
        <button class="btn btn-primary btn-sm" type="button" data-vector-play>${icon('pause', 13)} 暂停</button>
        <label class="visual-range">旋转 <input type="range" min="-80" max="80" value="24" data-vector-rotate></label>
        <label class="visual-range">俯仰 <input type="range" min="-50" max="50" value="18" data-vector-pitch></label>
        <select class="select" data-vector-loop aria-label="选择向量环"><option value="all">P + QRS + T 全部</option><option value="P">P 环</option><option value="QRS" selected>QRS 环</option><option value="T">T 环</option></select>
        <select class="select" data-vector-lead aria-label="选择投影导联">${Object.entries(LEADS).map(([id, l]) => `<option value="${id}" ${id === 'II' ? 'selected' : ''}>${l.name}</option>`).join('')}</select>
      </div>
      <div class="axis-presets vector-axis-presets"><span class="muted" style="font-size:9px">快速主方向</span><button type="button" class="chip" data-qrs-axis="60">正常 +60°</button><button type="button" class="chip" data-qrs-axis="-45">左偏 −45°</button><button type="button" class="chip" data-qrs-axis="120">右偏 +120°</button><button type="button" class="chip" data-qrs-axis="-120">极度 −120°</button><button type="button" class="chip" data-qrs-axis="90">垂直 +90°</button></div>
    </div>
    <aside class="visual-explain">
      <h3>先理解“环”，再看“波”</h3>
      <p>心室除极不是一根箭头，而是随时间变化的瞬时向量。把所有瞬时向量的尖端连起来，就得到 <b>QRS 向量环</b>；P 环和 T 环分别代表心房除极、心室复极。</p>
      <div class="visual-legend"><span><i style="background:var(--brand)"></i>P 环</span><span><i style="background:var(--accent)"></i>QRS 环</span><span><i style="background:var(--gold)"></i>T 环</span></div>
      <p class="muted">体表每个导联只记录该环在自身导联轴上的投影：投影为正，波形向上；投影为负，波形向下。向量环越“朝向”某个导联，该导联的波幅越大。</p>
      <div class="visual-tip">${icon('sparkles', 14)} 旋转模型，观察心电轴：电轴左偏 = QRS 主向量更朝上/左；电轴右偏 = 更朝下/右。</div>
    </aside>
  </div>`;
}

function drawLimbCanvas(canvas, state, t) {
  const { ctx, width, height } = canvas2d(canvas);
  const c = palette();
  const cx = width / 2;
  const cy = height / 2 - 18;
  const r = Math.min(width, height) * 0.32;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = c.grid; ctx.globalAlpha = 0.45;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  const angle = (state.auto ? t / 35 : state.angle) * Math.PI / 180;
  Object.entries(LEADS).forEach(([id, l]) => {
    const a = l.angle * Math.PI / 180;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.strokeStyle = id === state.lead ? c.brand : c.muted;
    ctx.globalAlpha = id === state.lead ? 0.95 : 0.38;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = id === state.lead ? c.brand : c.muted;
    ctx.font = id === state.lead ? '700 11px ui-monospace, monospace' : '10px ui-monospace, monospace';
    ctx.fillText(id, x + 4, y - 4);
  });
  const vx = cx + Math.cos(angle) * r * 0.9;
  const vy = cy + Math.sin(angle) * r * 0.9;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(vx, vy); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(vx, vy, 4, 0, Math.PI * 2); ctx.fill();
  const lead = LEADS[state.lead];
  const leadRad = lead.angle * Math.PI / 180;
  const projected = Math.cos(angle - leadRad);
  const px = cx + Math.cos(leadRad) * projected * r * 0.9;
  const py = cy + Math.sin(leadRad) * projected * r * 0.9;
  // 淡色三角形：向量尖端 → 选中导联轴上的投影点 → 原点
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = c.accent;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(vx, vy); ctx.lineTo(px, py); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = c.accent;
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(px, py); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.accent;
  ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.muted;
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillText(`投影 ${projected >= 0 ? '+' : ''}${projected.toFixed(2)}`, px + 5, py + 10);
  ctx.fillStyle = c.text; ctx.font = '600 11px ui-monospace, monospace';
  const signedAngle = Math.round(((angle * 180 / Math.PI + 180) % 360 + 360) % 360 - 180);
  ctx.fillText(`主向量 ${signedAngle}° · ${lead.name} 投影 ${projected >= 0 ? '+' : ''}${projected.toFixed(2)}`, 12, 18);
  ctx.fillStyle = c.muted; ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('六轴系统：I/II/III + aVR/aVL/aVF', 12, height - 10);
}

function updateLimbReadout(host, state, t) {
  const angle = state.auto ? (t / 35) % 360 : state.angle;
  const rad = angle * Math.PI / 180;
  const values = {
    I: Math.cos(rad), II: Math.cos(rad - Math.PI / 3), III: Math.cos(rad - 2 * Math.PI / 3),
    aVR: Math.cos(rad + 5 * Math.PI / 6), aVL: Math.cos(rad + Math.PI / 6), aVF: Math.sin(rad),
  };
  Object.entries(values).forEach(([id, value]) => {
    const node = host.querySelector(`[data-limb-value="${id}"]`);
    const bar = host.querySelector(`[data-limb-projection="${id}"] i`);
    if (node) node.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
    if (bar) { bar.style.width = `${Math.min(100, Math.abs(value) * 100)}%`; bar.classList.toggle('negative', value < 0); }
  });
  const deg = ((Math.round(angle) % 360) + 360) % 360;
  const signed = deg > 180 ? deg - 360 : deg;
  let axis = '正常电轴';
  if (signed < -30 && signed >= -90) axis = '电轴左偏';
  else if (signed > 90) axis = '电轴右偏';
  else if (signed < -90) axis = '极度右偏/不确定电轴';
  const readout = host.querySelector('[data-limb-readout]');
  if (readout) readout.innerHTML = `<b>${axis}</b><span>额面电轴 ${signed}° · I ${values.I >= 0 ? '正' : '负'} · aVF ${values.aVF >= 0 ? '正' : '负'} · II ${values.II >= 0 ? '正' : '负'}</span><small>快速法：I 正 + aVF 正 ≈ 正常；I 正 + aVF 负 + II 负 ≈ 左偏；I 负 + aVF 正 ≈ 右偏。</small>`;
}

function limbPanel() {
  return `<div class="visual-grid">
    <div class="visual-card visual-card-dark">
      <canvas data-limb-canvas data-height="340" aria-label="肢体导联六轴向量投影动画"></canvas>
      <div class="visual-controls">
        <button class="btn btn-primary btn-sm" type="button" data-limb-auto>${icon('rotate', 13)} 自动旋转</button>
        <label class="visual-range">角度 <input type="range" min="0" max="359" value="60" data-limb-angle></label>
        <select class="select" data-limb-lead>${Object.entries(LEADS).map(([id, l]) => `<option value="${id}" ${id === 'II' ? 'selected' : ''}>${l.name}</option>`).join('')}</select>
      </div>
      <div class="axis-presets"><button type="button" class="chip" data-axis-preset="60">正常 +60°</button><button type="button" class="chip" data-axis-preset="-45">左偏 −45°</button><button type="button" class="chip" data-axis-preset="120">右偏 +120°</button><button type="button" class="chip" data-axis-preset="-120">极度 −120°</button></div>
      <div class="vector-projections axis-projections" data-limb-projections>${Object.entries(LEADS).map(([id, lead]) => `<div data-limb-projection="${id}"><b>${id}</b><div class="vector-projection-track"><i></i></div><span data-limb-value="${id}">+0.00</span></div>`).join('')}</div>
      <div class="axis-readout" data-limb-readout></div>
    </div>
    <aside class="visual-explain">
      <h3>肢体导联是同一向量的不同投影</h3>
      <p>六个肢体导联位于额面，彼此相差固定角度。某个导联的振幅，等于心电向量在该导联轴上的投影：<b>投影 = |向量| × cos(夹角)</b>。</p>
      <div class="axis-table">${Object.entries(LEADS).map(([id, l]) => `<div><b>${l.name}</b><span>${l.angle}°</span><small>${l.note}</small></div>`).join('')}</div>
      <div class="visual-tip">${icon('target', 14)} 电轴不是“猜”的：I 与 aVF 的净极性就能快速定位。拖动角度，观察 II 与 aVR 的投影如何相反。</div>
      <div class="vector-disclaimer"><b>教学示意，不是真实心电向量</b><p>图中的单一箭头只是为了说明“导联如何投影”的简化合成向量。真实心电向量是所有正在除极/复极的心肌细胞电偶向量在同一瞬间的空间叠加，会随激动部位、时间、胸壁阻抗、呼吸和导联位置持续变化，其方向和大小不能由一根固定箭头完全代表。本页用于建立方向与投影的直觉，不用于逐搏定量或临床诊断。</p></div>
    </aside>
  </div>`;
}

function chestPanel() {
  return `<div class="visual-grid">
    <div class="visual-card">
      <div class="chest-svg-wrap">
        <svg viewBox="0 0 360 310" class="chest-svg" role="img" aria-label="胸导联 V1 到 V6 电极位置示意图">
          <rect x="48" y="18" width="264" height="270" rx="44" fill="var(--surface)" stroke="var(--line)"/>
          <path d="M104 48 Q180 14 256 48 L278 148 Q266 254 180 278 Q94 254 82 148Z" fill="var(--bg-elev)" stroke="var(--line-strong)" opacity=".8"/>
          <path d="M180 88 C146 66 114 92 118 128 C122 172 162 204 180 224 C198 204 238 172 242 128 C246 92 214 66 180 88Z" fill="color-mix(in srgb, var(--accent) 16%, transparent)" stroke="var(--accent)" stroke-width="2"/>
          <path d="M180 98 L180 204 M136 128 L224 128" fill="none" stroke="var(--accent)" stroke-width="1" opacity=".45"/>
          ${Object.entries(CHEST).map(([id, p]) => `<g class="chest-lead" data-chest-lead="${id}" tabindex="0" role="button" aria-label="${id} 导联位置">
            <line x1="180" y1="150" x2="${p.x}" y2="${p.y}" stroke="var(--brand)" stroke-dasharray="3 3" opacity=".55"/>
            <circle cx="${p.x}" cy="${p.y}" r="10" fill="var(--surface)" stroke="var(--brand)" stroke-width="2"/>
            <text x="${p.x}" y="${p.y + 3.5}" text-anchor="middle" font-size="9" font-weight="700" fill="var(--brand)">${id}</text>
          </g>`).join('')}
          <text x="180" y="292" text-anchor="middle" font-size="9" fill="var(--muted)">点击电极查看位置、朝向与临床意义</text>
        </svg>
      </div>
    </div>
    <aside class="visual-explain" data-chest-detail>
      <h3>胸导联：从右前到左外的“横切面”</h3>
      <p>V1–V6 位于水平面，从右胸到左腋中线依次排列。它们不是“看同一块心肌”，而是从不同角度观察室间隔、前壁、侧壁与右室。</p>
      <div class="chest-list">${Object.entries(CHEST).map(([id, p]) => `<button type="button" data-chest-lead="${id}"><b>${id}</b><span>${escapeHtml(p.note)}</span></button>`).join('')}</div>
      <p class="muted">补充：右室加做 V3R–V5R（常看 V4R）；后壁加做 V7–V9。标准 V1–V6 看不到后壁，V1–V3 的 ST 压低可能是后壁梗死的“镜像”。</p>
    </aside>
  </div>`;
}

function drawWaveCanvas(canvas, state, t) {
  const { ctx, width, height } = canvas2d(canvas);
  const c = palette();
  const left = 44; const right = 18; const top = 22; const bottom = 26;
  const plotW = width - left - right;
  const half = (height - top - bottom) / 2;
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = c.bg; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = c.grid; ctx.globalAlpha = .4;
  for (let i = 0; i <= 8; i += 1) {
    const x = left + (i / 8) * plotW;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, height - bottom); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const phase = (t / 5200) % 1;
  const y1 = top + half * .55;
  const y2 = top + half * 1.65;
  // action potential
  ctx.strokeStyle = c.trace; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= plotW; i += 1) {
    const u = i / plotW;
    let v;
    if (u < .18) v = .02;
    else if (u < .24) v = .02 + (u - .18) / .06 * .95;
    else if (u < .38) v = .97 - (u - .24) / .14 * .35;
    else if (u < .52) v = .62 - (u - .38) / .14 * .5;
    else v = .12;
    const y = y1 - v * half * .7;
    if (i === 0) ctx.moveTo(left + i, y); else ctx.lineTo(left + i, y);
  }
  ctx.stroke();
  // ECG trace
  ctx.strokeStyle = c.brand; ctx.lineWidth = 1.8; ctx.beginPath();
  for (let i = 0; i <= plotW; i += 1) {
    const u = i / plotW;
    let v = 0;
    v += .10 * Math.exp(-Math.pow((u - .17) / .018, 2));
    v += .08 * Math.exp(-Math.pow((u - .25) / .010, 2));
    v -= 1.0 * Math.exp(-Math.pow((u - .34) / .012, 2));
    v += .35 * Math.exp(-Math.pow((u - .37) / .010, 2));
    v += .22 * Math.exp(-Math.pow((u - .52) / .040, 2));
    const y = y2 - v * half * .48;
    if (i === 0) ctx.moveTo(left + i, y); else ctx.lineTo(left + i, y);
  }
  ctx.stroke();
  // cursor
  const x = left + phase * plotW;
  ctx.strokeStyle = '#fff'; ctx.globalAlpha = .65; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, height - bottom); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = c.text; ctx.font = '600 10px ui-monospace, monospace';
  ctx.fillText('动作电位：离子通道 → 膜电位', left, 14);
  ctx.fillText('体表 ECG：所有向量 → 导联投影', left, y2 - half * .34);
  ctx.fillStyle = c.muted; ctx.font = '9px ui-monospace, monospace';
  ctx.fillText('0 相 Na⁺ 内流 · 2 相 Ca²⁺ 平台 · 3 相 K⁺ 外流 · 4 相泵/If', left, height - 8);
}

function waveformPanel() {
  return `<div class="visual-grid">
    <div class="visual-card visual-card-dark"><canvas data-wave-canvas data-height="350" aria-label="动作电位与体表心电图对应动画"></canvas></div>
    <aside class="visual-explain">
      <h3>波形不是“画出来的”，是电活动投影出来的</h3>
      <div class="visual-steps">
        <div><b>1. 离子通道</b><span>Na⁺ 快速内流 → 0 相；Ca²⁺ 内流/K⁺ 外流 → 2 相平台；K⁺ 外流 → 3 相复极。</span></div>
        <div><b>2. 细胞动作电位</b><span>心肌细胞除极—复极产生局部电位；不同区域时相差异形成电流。</span></div>
        <div><b>3. 空间向量</b><span>大量细胞电活动叠加为瞬时向量，向量环随心动周期变化。</span></div>
        <div><b>4. 导联投影</b><span>每个体表导联记录向量在自身轴上的投影：P、QRS、T 波由此产生。</span></div>
      </div>
      <div class="visual-tip">${icon('activity', 14)} 看到 ST 段抬高时，问：损伤电流的方向指向哪个导联？相邻导联是否一致？</div>
    </aside>
  </div>`;
}

function ionsPanel() {
  return `<div class="visual-grid">
    <div class="visual-card">
      <div class="ion-diagram">
        <div class="ion-cell"><div class="ion-membrane"></div><b>心肌细胞膜</b><span>磷脂双层 + 离子通道</span></div>
        <div class="ion-channel-row">
          <div class="ion-channel na"><b>Na⁺</b><span>0 相快速内流</span><small>QRS 上升支；钠通道阻滞 → QRS 增宽</small></div>
          <div class="ion-channel ca"><b>Ca²⁺</b><span>2 相平台 / 房室结传导</span><small>L 型钙通道；阻滞 → PR 延长、QT 缩短</small></div>
          <div class="ion-channel k"><b>K⁺</b><span>3 相复极</span><small>高钾 → T 高尖/QRS 宽；低钾 → U 波/QT 长</small></div>
        </div>
      </div>
    </div>
    <aside class="visual-explain">
      <h3>把“通道—电位—波形”串起来</h3>
      <div class="phase-list">
        <div><b>4 相</b><span>静息/自动除极：Na⁺/K⁺ 泵维持梯度，窦房结 If 缓慢内流。</span></div>
        <div><b>0 相</b><span>Na⁺ 快速内流，膜电位迅速上升；对应 QRS。</span></div>
        <div><b>1–2 相</b><span>K⁺ 短暂外流、Ca²⁺ 内流形成平台；对应 ST 段。</span></div>
        <div><b>3 相</b><span>K⁺ 外流复极；对应 T 波。</span></div>
        <div><b>4 相恢复</b><span>离子泵恢复梯度；下一次激动准备。</span></div>
      </div>
      <p class="muted">QT = 0 相到 3 相结束；血钾、钙、药物和心率都会改变这条曲线。</p>
    </aside>
  </div>`;
}

function anatomyPanel() {
  return `<div class="visual-grid">
    <div class="visual-card">
      <div class="anatomy-svg-wrap">
        <svg viewBox="0 0 380 320" class="anatomy-svg" role="img" aria-label="心脏四腔、瓣膜与传导系统示意图">
          <path d="M190 34 C128 28 86 72 92 134 C98 218 160 270 190 292 C220 270 282 218 288 134 C294 72 252 28 190 34Z" fill="var(--bg-elev)" stroke="var(--line-strong)" stroke-width="2"/>
          <path d="M190 48 L190 270" stroke="var(--line-strong)" stroke-width="1" opacity=".5"/>
          <path d="M104 122 Q190 88 276 122" stroke="var(--line-strong)" fill="none" opacity=".6"/>
          <path d="M112 130 Q142 180 168 232 M268 130 Q238 180 212 232" stroke="var(--line-strong)" fill="none" opacity=".4"/>
          <text x="138" y="92" text-anchor="middle" font-size="12" font-weight="700" fill="var(--brand)">RA 右房</text>
          <text x="244" y="92" text-anchor="middle" font-size="12" font-weight="700" fill="var(--brand)">LA 左房</text>
          <text x="134" y="214" text-anchor="middle" font-size="12" font-weight="700" fill="var(--accent)">RV 右室</text>
          <text x="246" y="214" text-anchor="middle" font-size="12" font-weight="700" fill="var(--accent)">LV 左室</text>
          <g class="anatomy-label" data-anatomy="tricuspid"><circle cx="166" cy="137" r="9" fill="var(--surface)" stroke="var(--gold)"/><text x="166" y="140" text-anchor="middle" font-size="8" fill="var(--gold)">三尖瓣</text></g>
          <g class="anatomy-label" data-anatomy="mitral"><circle cx="214" cy="137" r="9" fill="var(--surface)" stroke="var(--gold)"/><text x="214" y="140" text-anchor="middle" font-size="8" fill="var(--gold)">二尖瓣</text></g>
          <g class="anatomy-label" data-anatomy="aortic"><circle cx="226" cy="112" r="8" fill="var(--surface)" stroke="var(--brand)"/><text x="226" y="115" text-anchor="middle" font-size="7" fill="var(--brand)">主A</text></g>
          <g class="anatomy-label" data-anatomy="pulmonary"><circle cx="154" cy="108" r="8" fill="var(--surface)" stroke="var(--brand)"/><text x="154" y="111" text-anchor="middle" font-size="7" fill="var(--brand)">肺A</text></g>
          <g class="anatomy-label" data-anatomy="sa"><circle cx="172" cy="72" r="7" fill="var(--ok)" opacity=".9"/><text x="172" y="75" text-anchor="middle" font-size="7" fill="#fff">SA</text></g>
          <g class="anatomy-label" data-anatomy="av"><circle cx="190" cy="144" r="7" fill="var(--warn)" opacity=".9"/><text x="190" y="147" text-anchor="middle" font-size="7" fill="#fff">AV</text></g>
          <path d="M172 72 Q186 100 190 144 Q196 174 190 196" fill="none" stroke="var(--ok)" stroke-width="2" stroke-dasharray="5 5" class="conduction-path"/>
          <path d="M190 196 Q164 218 142 246 M190 196 Q216 218 238 246" fill="none" stroke="var(--ok)" stroke-width="2" stroke-dasharray="5 5" class="conduction-path"/>
          <text x="190" y="308" text-anchor="middle" font-size="9" fill="var(--muted)">点击瓣膜/起搏点查看说明</text>
        </svg>
      </div>
    </div>
    <aside class="visual-explain" data-anatomy-detail>
      <h3>心脏基础解剖：先找腔室，再看瓣膜与传导</h3>
      <p>右房接受上下腔静脉，经三尖瓣到右室，再经肺动脉瓣入肺；左房接受肺静脉，经二尖瓣到左室，再经主动脉瓣泵入体循环。</p>
      <div class="anatomy-facts">
        <div><b>三尖瓣</b><span>右房-右室；右心容量/压力负荷与右室肥厚相关。</span></div>
        <div><b>二尖瓣</b><span>左房-左室；左房增大、房颤、左室肥厚常见。</span></div>
        <div><b>V1–V6</b><span>从右胸到左腋中线，观察室间隔→前壁→侧壁。</span></div>
        <div><b>传导系统</b><span>窦房结 → 房室结 → 希氏束 → 左右束支 → 浦肯野纤维。</span></div>
      </div>
      <p class="muted">解剖位置决定导联“看到什么”：下壁 II/III/aVF，侧壁 I/aVL/V5/V6，前壁 V1–V4，右室 V3R–V4R，后壁 V7–V9。</p>
    </aside>
  </div>`;
}

const TABS = [
  ['loops', 'P/QRS/T 向量环'],
  ['limb', '肢体导联向量'],
  ['chest', '胸导联定位'],
  ['waveform', '波形成因'],
  ['ions', '离子与动作电位'],
  ['anatomy', '心脏解剖'],
];

export async function vectorLabView() {
  const el = document.createElement('div');
  el.className = 'page vector-page';
  let active = 'loops';
  let raf = 0;
  let cleanup = [];
  let start = performance.now();
  const state = { rotate: 24, pitch: 18, playing: true, loop: 'QRS', lead: 'II', axis: 60, angle: 60, auto: true };
  el.innerHTML = `<div class="page-eyebrow">${icon('compass', 14)} VECTOR & ELECTROPHYSIOLOGY</div>
    <div class="vector-head"><div><h1 class="page-title">心脏向量实验室</h1><p class="page-sub">把“背图形”变成“看方向”：P/QRS/T 环、肢体/胸导联投影、动作电位与解剖一次串起来。</p></div><a class="btn btn-secondary btn-sm" href="#/learn/ecg-calibration-paper">回到基础课程 ${icon('arrowRight', 13)}</a></div>
    <div class="visual-tabs">${TABS.map(([id, label], i) => `<button class="chip ${i === 0 ? 'active' : ''}" type="button" data-visual-tab="${id}">${label}</button>`).join('')}</div>
    <div data-visual-content></div>
    <div class="visual-footnote">${icon('info', 13)} 图形为教学示意：向量方向与导联关系用于理解投影，不替代真实患者 12 导联诊断。</div>`;

  const content = el.querySelector('[data-visual-content]');
  const stopAnim = () => { if (raf) cancelAnimationFrame(raf); raf = 0; cleanup.forEach((fn) => fn()); cleanup = []; };
  const drawLoopFrame = (now) => {
    const canvas = content.querySelector('[data-vector-canvas]');
    if (!canvas) return;
    drawVectorCanvas(canvas, state, now);
    const projection = content.querySelector('[data-vector-ecg]');
    if (projection) drawProjectionCanvas(projection, state, now);
    const syncLabel = content.querySelector('[data-vector-sync-label]');
    if (syncLabel) syncLabel.textContent = `${LEADS[state.lead].name} · 时间光标`;
    const bars = content.querySelector('[data-vector-projections]');
    if (bars) updateProjectionBars(bars, state, now);
    const timeline = content.querySelector('[data-vector-timeline]');
    if (timeline) {
      const cursor = timeline.querySelector('[data-vector-timeline-cursor]');
      if (cursor) cursor.style.left = `${((now / 1800) % 1) * 100}%`;
      timeline.querySelectorAll('span').forEach((node, i) => node.classList.toggle('active', i === ({ P: 0, QRS: 1, T: 2 }[state.loop === 'all' ? 'QRS' : state.loop])));
    }
    if (state.playing) raf = requestAnimationFrame(drawLoopFrame);
  };
  const drawLimbFrame = (now) => {
    const canvas = content.querySelector('[data-limb-canvas]');
    if (!canvas) return;
    drawLimbCanvas(canvas, state, now);
    updateLimbReadout(content, state, now);
    raf = requestAnimationFrame(drawLimbFrame);
  };
  const drawWaveFrame = (now) => {
    const canvas = content.querySelector('[data-wave-canvas]');
    if (!canvas) return;
    drawWaveCanvas(canvas, state, now);
    raf = requestAnimationFrame(drawWaveFrame);
  };
  const bindLoops = () => {
    const play = content.querySelector('[data-vector-play]');
    play?.addEventListener('click', () => {
      state.playing = !state.playing;
      play.innerHTML = state.playing ? `${icon('pause', 13)} 暂停` : `${icon('play', 13)} 播放`;
      if (state.playing) { stopAnim(); raf = requestAnimationFrame(drawLoopFrame); } else stopAnim();
    });
    content.querySelector('[data-vector-rotate]')?.addEventListener('input', (e) => { state.rotate = Number(e.target.value); });
    content.querySelector('[data-vector-pitch]')?.addEventListener('input', (e) => { state.pitch = Number(e.target.value); });
    content.querySelectorAll('[data-qrs-axis]').forEach((button) => button.addEventListener('click', () => {
      state.axis = Number(button.dataset.qrsAxis);
      state.loop = 'QRS';
      const select = content.querySelector('[data-vector-loop]');
      if (select) select.value = 'QRS';
    }));
    content.querySelector('[data-vector-loop]')?.addEventListener('change', (e) => { state.loop = e.target.value; });
    content.querySelector('[data-vector-lead]')?.addEventListener('change', (e) => { state.lead = e.target.value; });
    const canvas = content.querySelector('[data-vector-canvas]');
    if (canvas) {
      let dragging = false;
      canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointerup', () => { dragging = false; });
      canvas.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const rect = canvas.getBoundingClientRect();
        const rx = content.querySelector('[data-vector-rotate]');
        const py = content.querySelector('[data-vector-pitch]');
        if (rx) { const val = Math.max(-80, Math.min(80, (e.clientX - rect.left - rect.width / 2) / 2)); rx.value = String(val); state.rotate = val; }
        if (py) { const val = Math.max(-50, Math.min(50, (e.clientY - rect.top - rect.height / 2) / 2)); py.value = String(val); state.pitch = val; }
      });
    }
    raf = requestAnimationFrame(drawLoopFrame);
  };
  const bindLimb = () => {
    const auto = content.querySelector('[data-limb-auto]');
    auto?.addEventListener('click', () => { state.auto = !state.auto; auto.innerHTML = state.auto ? `${icon('pause', 13)} 暂停旋转` : `${icon('rotate', 13)} 自动旋转`; });
    content.querySelector('[data-limb-angle]')?.addEventListener('input', (e) => { state.auto = false; state.angle = Number(e.target.value); });
    content.querySelector('[data-limb-lead]')?.addEventListener('change', (e) => { state.lead = e.target.value; });
    content.querySelectorAll('[data-axis-preset]').forEach((button) => button.addEventListener('click', () => {
      state.auto = false;
      state.angle = Number(button.dataset.axisPreset);
      const slider = content.querySelector('[data-limb-angle]');
      if (slider) slider.value = String(((state.angle % 360) + 360) % 360);
      const auto = content.querySelector('[data-limb-auto]');
      if (auto) auto.innerHTML = `${icon('rotate', 13)} 自动旋转`;
    }));
    const limbCanvas = content.querySelector('[data-limb-canvas]');
    if (limbCanvas) {
      let dragging = false;
      const setFromPointer = (e) => {
        const rect = limbCanvas.getBoundingClientRect();
        const cx = rect.width / 2; const cy = rect.height / 2 - 18;
        const deg = (Math.atan2(cy - (e.clientY - rect.top), e.clientX - rect.left - cx) * 180 / Math.PI + 360) % 360;
        state.auto = false;
        state.angle = deg;
        const slider = content.querySelector('[data-limb-angle]');
        if (slider) slider.value = String(Math.round(deg));
      };
      limbCanvas.addEventListener('pointerdown', (e) => { dragging = true; limbCanvas.setPointerCapture(e.pointerId); setFromPointer(e); });
      limbCanvas.addEventListener('pointermove', (e) => { if (dragging) setFromPointer(e); });
      limbCanvas.addEventListener('pointerup', () => { dragging = false; });
    }
    raf = requestAnimationFrame(drawLimbFrame);
  };
  const bindChest = () => {
    const select = (id) => {
      const item = CHEST[id];
      if (!item) return;
      content.querySelectorAll('[data-chest-lead]').forEach((node) => node.classList.toggle('active', node.dataset.chestLead === id));
      const detail = content.querySelector('[data-chest-detail]');
      if (detail) {
        detail.insertAdjacentHTML('afterbegin', `<div class="chest-selected"><span>当前导联</span><b>${id}</b><p>${escapeHtml(item.note)}</p></div>`);
        detail.querySelectorAll('.chest-selected').forEach((node, i) => { if (i > 0) node.remove(); });
      }
    };
    content.addEventListener('click', (event) => { const target = event.target.closest('[data-chest-lead]'); if (target) select(target.dataset.chestLead); });
    content.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { const target = event.target.closest('[data-chest-lead]'); if (target) { event.preventDefault(); select(target.dataset.chestLead); } } });
    select('V1');
  };
  const bindWave = () => { raf = requestAnimationFrame(drawWaveFrame); };
  const bindAnatomy = () => {
    const facts = {
      tricuspid: '三尖瓣位于右房与右室之间；右心扩大、右室压力负荷时可出现右房增大/右室肥厚图形。',
      mitral: '二尖瓣位于左房与左室之间；二尖瓣病变常伴左房增大、房颤与左室肥厚。',
      aortic: '主动脉瓣位于左室与主动脉之间；主动脉瓣狭窄可致左室肥厚、劳损。',
      pulmonary: '肺动脉瓣位于右室与肺动脉之间；肺动脉高压/右室负荷可致右室肥厚。',
      sa: '窦房结位于上腔静脉与右房交界；正常起搏点，频率 60–100 次/分。',
      av: '房室结位于 Koch 三角；延迟并过滤心房冲动，形成 PR 段。',
    };
    content.addEventListener('click', (event) => {
      const target = event.target.closest('[data-anatomy]');
      if (!target) return;
      const id = target.dataset.anatomy;
      const detail = content.querySelector('[data-anatomy-detail]');
      if (!detail) return;
      detail.querySelectorAll('.anatomy-selected').forEach((n) => n.remove());
      detail.insertAdjacentHTML('afterbegin', `<div class="anatomy-selected"><b>${id.toUpperCase()}</b><p>${escapeHtml(facts[id] || '')}</p></div>`);
    });
  };

  const renderTab = (tab) => {
    stopAnim();
    active = tab;
    el.querySelectorAll('[data-visual-tab]').forEach((b) => b.classList.toggle('active', b.dataset.visualTab === tab));
    content.innerHTML = tab === 'loops' ? vectorLoopsPanel()
      : tab === 'limb' ? limbPanel()
        : tab === 'chest' ? chestPanel()
          : tab === 'waveform' ? waveformPanel()
            : tab === 'ions' ? ionsPanel()
              : anatomyPanel();
    if (tab === 'loops') bindLoops();
    else if (tab === 'limb') bindLimb();
    else if (tab === 'chest') bindChest();
    else if (tab === 'waveform') bindWave();
    else if (tab === 'anatomy') bindAnatomy();
  };
  el.querySelectorAll('[data-visual-tab]').forEach((button) => button.addEventListener('click', () => renderTab(button.dataset.visualTab)));
  renderTab(active);
  return { el, destroy: stopAnim };
}
