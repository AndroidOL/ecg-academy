const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261109ai';
const { getLocale } = await import(`../i18n.js${__asset}`);
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

const CHEST_VECTOR = {
  V1: { x: -0.58, z: 0.82, dist: 0.95, note: '右胸第 4 肋间，胸骨右缘' },
  V2: { x: -0.18, z: 0.98, dist: 0.95, note: '左胸第 4 肋间，胸骨左缘' },
  V3: { x: 0.34, z: 0.94, dist: 0.98, note: 'V2 与 V4 连线中点' },
  V4: { x: 0.78, z: 0.60, dist: 1.00, note: '左锁骨中线第 5 肋间' },
  V5: { x: 0.97, z: 0.22, dist: 1.00, note: '左腋前线第 5 肋间' },
  V6: { x: 0.94, z: -0.18, dist: 1.50, note: '左腋中线第 5 肋间' },
};

const CHEST_VECTOR_KEYS = ['V1', 'V5', 'V6'];

const LEADS_12 = {
  I: { label: 'I', vec: [1, 0, 0], angle: 0 },
  II: { label: 'II', vec: [0.5, -0.866, 0], angle: 60 },
  III: { label: 'III', vec: [-0.5, -0.866, 0], angle: 120 },
  aVR: { label: 'aVR', vec: [-0.866, 0.5, 0], angle: -150 },
  aVL: { label: 'aVL', vec: [0.866, 0.5, 0], angle: -30 },
  aVF: { label: 'aVF', vec: [0, -1, 0], angle: 90 },
  V1: { label: 'V1', vec: [-0.58, 0, 0.82], angle: null },
  V2: { label: 'V2', vec: [-0.18, 0, 0.98], angle: null },
  V3: { label: 'V3', vec: [0.34, 0, 0.94], angle: null },
  V4: { label: 'V4', vec: [0.78, 0, 0.60], angle: null },
  V5: { label: 'V5', vec: [0.97, 0, 0.22], angle: null },
  V6: { label: 'V6', vec: [0.94, 0, -0.18], angle: null },
};

// 正常空间向量环的教学近似：起点/终点接近零点；P 环小、QRS 环最大、
// T 环长而窄（长宽比约 2.5:1），QRS 主向量指向左下略后，T 主向量指向左前下。
const LOOP_CONTROL_POINTS = {
  P: [
    [0, 0, 0], [0.055, 0.01, 0.025], [0.12, -0.035, 0.05], [0.15, -0.055, 0.035], [0.10, -0.045, -0.01], [0.035, -0.012, -0.012],
  ],
  QRS: [
    [0, 0, 0], [-0.24, 0.04, 0.40], [0.10, -0.25, 0.46], [0.42, -0.42, 0.30],
    [0.78, -0.52, -0.08], [0.95, -0.38, -0.42], [0.68, -0.14, -0.62], [0.28, 0.10, -0.44],
  ],
  T: [
    [0, 0, 0], [0.30, -0.10, 0.18], [0.52, -0.24, 0.28], [0.62, -0.26, 0.24], [0.40, -0.12, 0.12],
  ],
};

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1, 2].map((axis) => 0.5 * (
    (2 * p1[axis]) +
    (-p0[axis] + p2[axis]) * t +
    (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
    (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3
  ));
}

function loopPoint(key, angle) {
  const points = LOOP_CONTROL_POINTS[key] || LOOP_CONTROL_POINTS.QRS;
  const count = points.length;
  const wrapped = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
  const scaled = wrapped * count;
  const index = Math.floor(scaled);
  const t = scaled - index;
  return catmullRom(
    points[(index - 1 + count) % count],
    points[index % count],
    points[(index + 1) % count],
    points[(index + 2) % count],
    t,
  );
}

const LOOPS = {
  P: (a) => loopPoint('P', a),
  QRS: (a) => loopPoint('QRS', a),
  T: (a) => loopPoint('T', a),
};

function unitVector([x, y, z]) { const n = Math.hypot(x, y, z) || 1; return [x / n, y / n, z / n]; }
function dotVector(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function rotateForAxis(v, key, axes = {}) {
  const d = ((axes[key] ?? 60) - 60) * Math.PI / 180;
  return [v[0] * Math.cos(d) - v[1] * Math.sin(d), v[0] * Math.sin(d) + v[1] * Math.cos(d), v[2]];
}
function activeLoopAt(phase) {
  if (phase < 0.16) return 'P';
  if (phase < 0.42) return 'QRS';
  if (phase < 0.8) return 'T';
  return null;
}
const CHEST_VECTOR_COLORS = { V1: 'accent', V5: 'brand', V6: 'gold' };

// 水平面：x = 患者左，z = 前。QRS 由“向右前的小室间隔向量”过渡到“向左后的左室主向量”。
function chestQrsVector(u) {
  const g = (center, width) => Math.exp(-Math.pow((u - center) / width, 2));
  const edge = Math.max(0, Math.min(1, u / 0.045, (1 - u) / 0.045));
  const septal = g(0.13, 0.075) * 0.42;
  const main = g(0.44, 0.15);
  const late = g(0.70, 0.10) * 0.48;
  return {
    x: (-0.38 * septal + 0.82 * main + 0.50 * late) * edge,
    z: (0.56 * septal - 0.65 * main - 0.75 * late) * edge,
  };
}

function chestLeadProjection(id, v) {
  const lead = CHEST_VECTOR[id];
  const norm = Math.hypot(lead.x, lead.z) || 1;
  const dot = (v.x * lead.x + v.z * lead.z) / norm;
  return dot / Math.pow(lead.dist, 1.25);
}

// 激活顺序：四个教学步骤，关键帧 u 取自 chestQrsVector 的三个高斯锚点附近。
const ACTIVATION_STEPS = [
  { u: 0.10, region: 'septum', label: '室间隔', time: '0–20 ms', dir: '向右前', detail: '室间隔左室面中 1/3 最早除极，冲动自左向右扩布；初始向量向右前，V1 形成小 r，V5/V6 形成小 q。', leads: 'V1 小 r · V5/V6 小 q', article: 'heart-conduction-anatomy', articleLabel: '心脏传导系统解剖' },
  { u: 0.24, region: 'apex', label: '心尖 / 右室前壁', time: '20–40 ms', dir: '向前下', detail: '激动经浦肯野纤维快速扩布至心尖与右室前壁，向量转向前下；V1 的 r 波达峰，V5 的 q 波结束。', leads: 'V1 r 达峰 · V5 q', article: 'depolarization-repolarization-ecg', articleLabel: '除极、复极与心电图' },
  { u: 0.43, region: 'freewall', label: '左室游离壁', time: '40–70 ms', dir: '向左后下', detail: '左室游离壁自心内膜向心外膜除极，主向量指向左后下，背离 V1、朝向 V5，形成深 S 与高 R。', leads: 'V5 高 R · V1 深 S', article: 'horizontal-plane-chest-leads', articleLabel: '横面与胸导联投影' },
  { u: 0.62, region: 'lateral', label: '左室侧后壁', time: '70–90 ms', dir: '向左后', detail: '左室侧壁、后壁继续除极，向量进一步向左后；V5/V6 的 R 波接近峰值，I、aVL 也呈正向。', leads: 'V5/V6 R 峰 · I/aVL 正向', article: 'ecg-vector-waveform-theory', articleLabel: '心电向量与波形形成' },
  { u: 0.80, region: 'base', label: '基底部 / 流出道', time: '90–110 ms', dir: '向左后上', detail: '最后除极的是左室基底部、后侧壁与流出道，向量转向左后上并回到零点；V5/V6 的 R 波回落，形成终末 S 或回到基线。', leads: 'V5/V6 R 回基线', article: 'ecg-vector-waveform-theory', articleLabel: '心电向量与波形形成' },
];

function activationStepFor(u) {
  let index = 0;
  ACTIVATION_STEPS.forEach((step, i) => { if (u >= step.u - 0.07) index = i; });
  return { index, step: ACTIVATION_STEPS[index] };
}

function activationHalos(cx, cy, rx, ry) {
  return {
    septum: [cx + rx * 0.02, cy - ry * 0.05, rx * 0.17],
    apex: [cx + rx * 0.30, cy - ry * 0.20, rx * 0.16],
    freewall: [cx + rx * 0.38, cy + ry * 0.10, rx * 0.21],
    lateral: [cx + rx * 0.47, cy - ry * 0.02, rx * 0.18],
    base: [cx + rx * 0.04, cy - ry * 0.24, rx * 0.15],
  };
}

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

function cycleDuration(state) { return 1000 / (Number(state.speed) || 1); }

function limbAngleDegrees(state, t) { return Number(state.angle) || 0; }

function drawVectorCanvas(canvas, state, t) {
  const { ctx, width, height } = canvas2d(canvas);
  const c = palette();
  const cx = width / 2;
  const cy = height / 2 + 6;
  const scale = Math.min(width, height) * 0.23 * (Number(state.zoom) || 1);
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
  // 额面肢体导联轴：与向量环画在同一空间里，直接看出“环朝向哪个导联”
  ctx.font = '600 9px ui-monospace, monospace';
  Object.entries(LEADS).forEach(([id, lead]) => {
    const rad = lead.angle * Math.PI / 180;
    const tip = project([Math.cos(rad) * 1.12, -Math.sin(rad) * 1.12, 0]);
    const selected = state.lead === id;
    ctx.strokeStyle = selected ? c.brand : c.muted;
    ctx.globalAlpha = selected ? 0.95 : 0.35;
    ctx.lineWidth = selected ? 1.8 : 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...tip); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = selected ? c.brand : c.muted;
    ctx.fillText(id, tip[0] + 3, tip[1] - 3);
  });
  const loops = LOOPS;
  const loopColors = { P: c.brand, QRS: c.accent, T: c.gold };
  const loopAxes = state.axes || { P: 60, QRS: 60, T: 60 };
  const axisDelta = (key) => ((loopAxes[key] ?? 60) - 60) * Math.PI / 180;
  const rotateAxis = (key, [x, y, z]) => {
    const d = axisDelta(key);
    return [x * Math.cos(d) - y * Math.sin(d), x * Math.sin(d) + y * Math.cos(d), z];
  };
  const loopPoint = (key, a) => rotateAxis(key, loops[key](a));
  const cycle = state.phase ?? 0;
  const windows = { P: [0, 0.16], QRS: [0.2, 0.42], T: [0.55, 0.8] };
  let active = null;
  Object.entries(windows).forEach(([key, [start, end]]) => { if (cycle >= start && cycle < end) active = key; });
  Object.entries(loops).forEach(([key, fn]) => {
    if (state.loop !== 'all' && state.loop !== key) return;
    const isActive = key === active;
    ctx.strokeStyle = loopColors[key];
    ctx.lineWidth = key === state.loop ? 2.2 : 1.4;
    ctx.globalAlpha = state.loop === 'all' ? (isActive ? 1 : 0.38) : 1;
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
  const rotatedVec = rotateAxis(selected, vec);
  const p0 = project([0, 0, 0]);
  const p1 = project(rotatedVec);
  if (state.loop === 'all' ? (active && active === selected) : true) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(...p1, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  const main = rotateAxis(selected, loops[selected](0.8));
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
  const activeLabel = state.loop === 'all' ? (active ? `当前 ${active} 波 · ` : '等电位线 · ') : `单环观察 · `;
  const movingLabel = state.loop === 'all' ? (active === selected ? `${selected} 环在当前时间窗转动` : `${selected} 环静止（等待其时间窗）`) : `${selected} 环连续观察`;
  ctx.fillText(`${activeLabel}${movingLabel} · ${lead.name} 投影 ${dot >= 0 ? '+' : ''}${dot.toFixed(2)}`, 12, 18);
  ctx.fillStyle = c.muted;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('细轴 = 额面肢体导联方向；P/QRS/T 只在各自时间窗内转动；正常 QRS 主向量总体指向左下、略向后', 12, height - 10);
}

function gaussianAt(u, center, width) {
  return Math.exp(-Math.pow((u - center) / width, 2));
}

function leadAmplitudes(lead, axes) {
  const unit = unitVector(lead.vec);
  // Use the actual loop trajectory, not a single fixed vector. A lead can be
  // nearly perpendicular to the main vector but still has initial/terminal
  // loop components, so it must not become a perfectly flat line.
  const peak = (key) => {
    let best = 0;
    for (let i = 0; i < 180; i += 1) {
      const vector = rotateForAxis(loopPoint(key, (i / 180) * Math.PI * 2), key, axes);
      const value = dotVector(vector, unit);
      if (Math.abs(value) > Math.abs(best)) best = value;
    }
    return best;
  };
  return {
    P: peak('P') * 0.9,
    QRS: peak('QRS') * 1.4,
    T: peak('T') * 0.95,
  };
}

function leadWaveAt(lead, u, axes) {
  const amp = leadAmplitudes(lead, axes);
  let value = amp.P * gaussianAt(u, 0.18, 0.03);
  if (amp.QRS >= 0) {
    value += amp.QRS * (-0.12 * gaussianAt(u, 0.30, 0.009) + gaussianAt(u, 0.33, 0.012) - 0.18 * gaussianAt(u, 0.365, 0.012));
  } else {
    value += Math.abs(amp.QRS) * (0.16 * gaussianAt(u, 0.30, 0.010) - gaussianAt(u, 0.34, 0.014) + 0.06 * gaussianAt(u, 0.38, 0.010));
  }
  value += amp.T * gaussianAt(u, 0.64, 0.055);
  return value;
}

function draw12LeadCanvas(canvas, state) {
  const { ctx, width, height } = canvas2d(canvas);
  const c = palette();
  const columns = [['I', 'II', 'III'], ['aVR', 'aVL', 'aVF'], ['V1', 'V2', 'V3'], ['V4', 'V5', 'V6']];
  const left = 7; const right = 7; const top = 7; const bottom = 7; const gap = 4;
  const cellW = (width - left - right - gap * 3) / 4;
  const cellH = (height - top - bottom - gap * 2) / 3;
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = c.bg; ctx.fillRect(0, 0, width, height);
  const axes = state.axes || { P: 60, QRS: 60, T: 60 };
  const maxAmp = Math.max(0.18, ...Object.values(LEADS_12).map((lead) => {
      const amp = leadAmplitudes(lead, axes);
      return Math.max(Math.abs(amp.P), Math.abs(amp.QRS), Math.abs(amp.T));
    }));
  columns.forEach((column, col) => column.forEach((id, row) => {
    const lead = LEADS_12[id];
    const x = left + col * (cellW + gap);
    const y = top + row * (cellH + gap);
    const base = y + cellH * 0.61;
    const selected = state.lead === id;
    ctx.fillStyle = 'rgba(255,255,255,.025)'; ctx.fillRect(x, y, cellW, cellH);
    ctx.strokeStyle = selected ? c.brand : c.grid; ctx.lineWidth = selected ? 1.2 : .7;
    ctx.strokeRect(x + .5, y + .5, cellW - 1, cellH - 1);
    ctx.fillStyle = selected ? c.brand : c.muted; ctx.font = selected ? '700 9px ui-monospace, monospace' : '9px ui-monospace, monospace';
    ctx.fillText(id, x + 4, y + 10);
    ctx.strokeStyle = c.grid; ctx.globalAlpha = .42; ctx.beginPath(); ctx.moveTo(x + 2, base); ctx.lineTo(x + cellW - 2, base); ctx.stroke(); ctx.globalAlpha = 1;
    const scale = (cellH * .32) / maxAmp;
    ctx.strokeStyle = selected ? c.brand : c.trace; ctx.lineWidth = selected ? 1.5 : 1;
    ctx.beginPath();
    const points = 90;
    for (let i = 0; i <= points; i += 1) {
      const u = i / points;
      const v = leadWaveAt(lead, u, axes);
      const px = x + 4 + u * (cellW - 8);
      const py = base - v * scale;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    const cursorX = x + 4 + (state.phase ?? 0) * (cellW - 8);
    ctx.strokeStyle = '#fff'; ctx.globalAlpha = .48; ctx.beginPath(); ctx.moveTo(cursorX, y + 2); ctx.lineTo(cursorX, y + cellH - 2); ctx.stroke(); ctx.globalAlpha = 1;
  }));
  ctx.fillStyle = c.muted; ctx.font = '8px ui-monospace, monospace';
  ctx.fillText('V1–V6 为水平面近似示意；随三环电轴变化', left, height - 2);
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
  const loopAxes = state.axes || { P: 60, QRS: 60, T: 60 };
  const rot = (key, v) => { const d = ((loopAxes[key] ?? 60) - 60) * Math.PI / 180; return [v[0] * Math.cos(d) - v[1] * Math.sin(d), v[0] * Math.sin(d) + v[1] * Math.cos(d), v[2]]; };
  // 以“左下”为正方向：II/aVF 的主投影应明显为正，P/T 不能再被压成平线
  const ampP = dot(rot('P', [0.28, -0.16, 0.05])) * 0.9;
  const ampQ = dot(rot('QRS', [0.72, -0.32, -0.12])) * 1.4;
  const ampT = dot(rot('T', [0.58, -0.3, 0.1])) * 0.95;
  const phase = state.phase ?? 0;
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
  const cycle = state.phase ?? 0;
  const windows = { P: [0, 0.16], QRS: [0.2, 0.42], T: [0.55, 0.8] };
  let active = null;
  Object.entries(windows).forEach(([key, [start, end]]) => { if (cycle >= start && cycle < end) active = key; });
  const loop = state.loop === 'all' ? (active || 'QRS') : state.loop;
  const a = ((state.phase ?? 0) * Math.PI * 2);
  let point = loopPoint(loop, a);
  const loopAxes = state.axes || { P: 60, QRS: 60, T: 60 };
  const d = ((loopAxes[loop] ?? 60) - 60) * Math.PI / 180;
  point = [point[0] * Math.cos(d) - point[1] * Math.sin(d), point[0] * Math.sin(d) + point[1] * Math.cos(d), point[2]];
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
      <div class="vector-figure-note"><b>教学示意，不是真实心电向量</b><span>单箭头是用于理解导联投影的简化合成向量；真实向量是无数心肌细胞瞬时电偶向量的空间叠加。</span></div>
      <canvas data-vector-canvas data-height="360" aria-label="心电向量环三维投影动画"></canvas>
      <div class="vector-timeline" data-vector-timeline><span>P</span><span>QRS</span><span>T</span><i data-vector-timeline-cursor></i></div>
      <div class="vector-phase-status" data-vector-phase-state>当前时间：P 波</div>
      <div class="visual-sync"><div class="visual-sync-head"><span>同步导联波形</span><span data-vector-sync-label>II 导联 · 时间光标</span></div><canvas data-vector-ecg data-height="112" aria-label="向量环同步导联波形"></canvas></div>
      <div class="vector-projections" data-vector-projections>${Object.entries(LEADS).map(([id, lead]) => `<div data-projection-row="${id}"><b>${id}</b><div class="vector-projection-track"><i></i></div><span data-projection-value="${id}">+0.00</span></div>`).join('')}</div>
      <div class="visual-controls">
        <button class="btn btn-primary btn-sm" type="button" data-vector-play>${icon('pause', 13)} 暂停</button>
        <label class="visual-range">水平视角 <input type="range" min="-180" max="180" value="24" data-vector-rotate></label>
        <label class="visual-range">缩放 <input type="range" min="50" max="350" value="100" data-vector-zoom></label>
        <button class="btn btn-ghost btn-xs" type="button" data-vector-zoom-out aria-label="缩小">−</button><button class="btn btn-ghost btn-xs" type="button" data-vector-zoom-in aria-label="放大">＋</button>
        <label class="visual-range">俯仰视角 <input type="range" min="-89" max="89" value="18" data-vector-pitch></label>
        <label class="visual-range">速度 <select class="select" data-vector-speed><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×（1 秒/周期）</option><option value="2">2×</option></select></label>
        <label class="visual-range vector-phase-control">时间 <input type="range" min="0" max="1000" value="0" data-vector-phase><span data-vector-phase-label>0%</span></label>
        <select class="select" data-vector-loop aria-label="选择向量环"><option value="all" selected>P + QRS + T 全部</option><option value="P">P 环</option><option value="QRS">QRS 环</option><option value="T">T 环</option></select>
        <select class="select" data-vector-lead aria-label="选择投影导联">${Object.entries(LEADS).map(([id, l]) => `<option value="${id}" ${id === 'II' ? 'selected' : ''}>${l.name}</option>`).join('')}</select>
        <button class="chip" type="button" data-vector-reset-view>重置视角</button>
      </div>
      <div class="loop-axis-stack">
        ${[
          ['P', 'P 环电轴'],
          ['QRS', 'QRS 环电轴'],
          ['T', 'T 环电轴'],
        ].map(([key, label]) => `<div class="axis-scale loop-axis-row" data-loop-axis-row="${key}">
          <div class="axis-scale-head"><span>${label}</span><b data-vector-axis-value="${key}">+60°</b></div>
          <div class="axis-scale-zones" aria-hidden="true"><span class="zone-extreme">极度右偏 / 不确定</span><span class="zone-left">左偏</span><span class="zone-normal">正常</span><span class="zone-right">右偏</span></div>
          <input class="axis-range" type="range" min="-180" max="180" step="1" value="60" data-vector-axis="${key}" aria-label="${label}">
          <div class="axis-scale-ticks" aria-hidden="true"><span>-180°</span><span>-90°</span><span>-30°</span><span>0°</span><span>+90°</span><span>+180°</span></div>
        </div>`).join('')}
        <div class="vector-control-note"><span>拖动画布可水平旋转 −180°～+180°、俯仰 −85°～+85°，从前面、后面、左外侧和顶部观察三个环；使用上方三行分别调整 P/QRS/T 环电轴。</span></div>
      </div>
    </div>
    <aside class="visual-explain">
      <h3>先理解“环”，再看“波”</h3>
      <p>心室除极不是一根箭头，而是随时间变化的瞬时向量。把所有瞬时向量的尖端连起来，就得到 <b>QRS 向量环</b>；P 环和 T 环分别代表心房除极、心室复极。</p>
      <div class="visual-legend"><span><i style="background:var(--brand)"></i>P 环</span><span><i style="background:var(--accent)"></i>QRS 环</span><span><i style="background:var(--gold)"></i>T 环</span></div>
      <p class="muted">体表每个导联只记录该环在自身导联轴上的投影：投影为正，波形向上；投影为负，波形向下。向量环越“朝向”某个导联，该导联的波幅越大。</p>
      <p class="muted"><b>关于 P/T 电轴：</b>临床上说“电轴偏转”通常指 QRS 额面电轴，正常约 −30° 至 +90°；P 波电轴也可测量（正常约 0° 至 +75°，异常提示异位房律等），T 波电轴通常与 QRS 主向量大致一致，缺血、电解质紊乱、肥厚/劳损时可改变。本页三个环可分别调节，仅用于理解向量方向与投影，不把 P/T 偏转直接等同于 QRS 电轴诊断。</p>
      <div class="visual-tip">${icon('sparkles', 14)} 旋转模型，观察心电轴：正常 QRS 环主向量指向<b>左下、略向后</b>；电轴左偏 = 更朝上/左，电轴右偏 = 更朝下/右。把水平视角拖到 −180° 可从后方观察“向后”的分量。</div>
    </aside>
  </div>
  <div class="vector-extra-grid vector-extra-single">
    <div class="visual-card visual-card-dark">
      <div class="visual-sync-head"><span>12 导联投影图</span><span>P/QRS/T 同源 · 随三环电轴变化</span></div>
      <div class="vector-12lead-scroll"><canvas data-vector-12lead data-height="390" aria-label="由 P、QRS、T 向量环投影生成的十二导联示意图"></canvas></div><div class="vector-12lead-hint">左右滑动查看 12 导联</div>
      <div class="vector-mini-note">同一瞬时的空间向量投影到 12 个导联轴：朝向某导联为正，背离为负。V1–V6 为水平面教学近似，不是诊断图。</div>
    </div>
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
  const angleDeg = limbAngleDegrees(state, t);
  const angle = angleDeg * Math.PI / 180;
  const magnitude = Number(state.magnitude) || 1;
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
  const vx = cx + Math.cos(angle) * r * 0.9 * magnitude;
  const vy = cy + Math.sin(angle) * r * 0.9 * magnitude;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(vx, vy); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(vx, vy, 3.2, 0, Math.PI * 2); ctx.fill();
  // 向量箭头：强调这是一个有方向的合成向量，而不是一个标量
  const ux = Math.cos(angle); const uy = Math.sin(angle);
  const bx = vx - ux * 11; const by = vy - uy * 11;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(vx, vy);
  ctx.lineTo(bx - uy * 5, by + ux * 5);
  ctx.lineTo(bx + uy * 5, by - ux * 5);
  ctx.closePath();
  ctx.fill();
  const lead = LEADS[state.lead];
  const leadRad = lead.angle * Math.PI / 180;
  const projected = Math.cos(angle - leadRad) * magnitude;
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
  ctx.fillText(`方向 ${signedAngle}° · |V| ${magnitude.toFixed(2)} · ${lead.name} 投影 ${projected >= 0 ? '+' : ''}${projected.toFixed(2)}`, 12, 18);
  ctx.fillStyle = c.muted; ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('六轴系统：I/II/III + aVR/aVL/aVF', 12, height - 10);
}

function updateLimbReadout(host, state, t) {
  const angle = limbAngleDegrees(state, t);
    const rad = angle * Math.PI / 180;
  const magnitude = Number(state.magnitude) || 1;
  const values = {
    I: Math.cos(rad) * magnitude, II: Math.cos(rad - Math.PI / 3) * magnitude, III: Math.cos(rad - 2 * Math.PI / 3) * magnitude,
    aVR: Math.cos(rad + 5 * Math.PI / 6) * magnitude, aVL: Math.cos(rad + Math.PI / 6) * magnitude, aVF: Math.sin(rad) * magnitude,
  };
  Object.entries(values).forEach(([id, value]) => {
    const node = host.querySelector(`[data-limb-value="${id}"]`);
    const bar = host.querySelector(`[data-limb-projection="${id}"] i`);
    if (node) node.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
    if (bar) { bar.style.width = `${Math.min(100, Math.abs(value) * 70)}%`; bar.classList.toggle('negative', value < 0); }
  });
  const signedAngle = (((Math.round(angle) + 180) % 360 + 360) % 360) - 180;
  const slider = host.querySelector('[data-limb-angle]');
  if (slider) slider.value = String(signedAngle);
  const angleLabel = host.querySelector('[data-limb-angle-value]');
  if (angleLabel) angleLabel.textContent = `${signedAngle >= 0 ? '+' : ''}${signedAngle}°`;
  const magnitudeLabel = host.querySelector('[data-limb-magnitude-value]');
  if (magnitudeLabel) magnitudeLabel.textContent = `${magnitude.toFixed(1)}×`;
  const lead = LEADS[state.lead];
  const leadRad = lead.angle * Math.PI / 180;
  const selectedProjection = Math.cos(rad - leadRad) * magnitude;
  const readout = host.querySelector('[data-limb-readout]');
  if (readout) readout.innerHTML = `<b>投影量</b><span>向量方向 ${signedAngle}° · |V| ${magnitude.toFixed(2)} · 与 ${lead.name} 夹角 ${Math.round(((signedAngle - lead.angle + 540) % 360) - 180)}° · ${lead.name} 投影 ${selectedProjection >= 0 ? '+' : ''}${selectedProjection.toFixed(2)}</span><small>投影 = |V| × cosθ。正值表示朝向该导联，负值表示背离；改变方向或大小，观察六个导联振幅的变化。</small>`;
}

function drawLimbWaves(canvas, state, t) {
  const { ctx, width, height } = canvas2d(canvas);
  const c = palette();
  const left = 34; const right = 44; const top = 12; const bottom = 8;
  const plotW = width - left - right;
  const rowH = (height - top - bottom) / 6;
  const angle = limbAngleDegrees(state, t);
  const magnitude = Number(state.magnitude) || 1;
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = c.bg; ctx.fillRect(0, 0, width, height);
  ctx.font = '9px ui-monospace, monospace';
  Object.entries(LEADS).forEach(([id, lead], index) => {
    const y = top + index * rowH + rowH * 0.58;
    const projection = Math.cos((angle - lead.angle) * Math.PI / 180) * magnitude;
    if (id === state.lead) { ctx.fillStyle = 'rgba(255,255,255,.045)'; ctx.fillRect(left - 4, y - rowH * .45, plotW + 8, rowH * .9); }
    ctx.strokeStyle = id === state.lead ? c.brand : c.grid;
    ctx.globalAlpha = id === state.lead ? .45 : .25; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + plotW, y); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.strokeStyle = id === state.lead ? c.brand : c.muted;
    ctx.lineWidth = id === state.lead ? 1.5 : 1;
    ctx.beginPath();
    for (let i = 0; i <= plotW; i += 1) {
      const u = i / plotW;
      let v = 0.08 * Math.exp(-Math.pow((u - .17) / .018, 2));
      v += 0.95 * Math.exp(-Math.pow((u - .34) / .012, 2));
      v -= 0.22 * Math.exp(-Math.pow((u - .365) / .010, 2));
      v += 0.2 * Math.exp(-Math.pow((u - .62) / .045, 2));
      const yy = y - v * projection * rowH * 0.45;
      if (i === 0) ctx.moveTo(left + i, yy); else ctx.lineTo(left + i, yy);
    }
    ctx.stroke();
    ctx.fillStyle = id === state.lead ? c.brand : c.muted;
    ctx.font = id === state.lead ? '700 9px ui-monospace, monospace' : '9px ui-monospace, monospace';
    ctx.fillText(id, 8, y + 3);
    ctx.textAlign = 'right';
    ctx.fillStyle = projection >= 0 ? c.brand : c.accent;
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(`${projection >= 0 ? '+' : ''}${projection.toFixed(2)}`, width - 6, y + 3);
    ctx.textAlign = 'left';
  });
  ctx.fillStyle = c.muted; ctx.font = '8px ui-monospace, monospace';
  ctx.fillText('同一瞬时向量 → 六导联投影；角度改变时振幅与极性随之改变', left, height - 1);
}

function limbPanel() {
  return `<div class="visual-grid">
    <div class="visual-card visual-card-dark">
      <div class="vector-figure-note"><b>教学示意，不是真实心电向量</b><span>箭头是简化合成向量；真实方向/大小来自所有参与除极与复极心肌细胞的瞬时向量叠加。</span></div>
      <canvas data-limb-canvas data-height="340" aria-label="肢体导联六轴向量投影动画"></canvas>
      <div class="visual-controls">
        <button class="btn btn-primary btn-sm" type="button" data-limb-auto>${icon('pause', 13)} 暂停旋转</button>
        <div class="axis-scale" data-axis-scale>
          <div class="axis-scale-head"><span>向量方向（教学）</span><b data-limb-angle-value>60°</b></div>
          <div class="axis-scale-note">只用于观察方向与投影，不作电轴诊断</div>
          <input class="axis-range axis-range-neutral" type="range" min="-180" max="180" step="1" value="60" data-limb-angle aria-label="向量方向角度">
          <div class="axis-scale-ticks" aria-hidden="true"><span>-180°</span><span>-90°</span><span>0°</span><span>+90°</span><span>+180°</span></div>
          <label class="axis-magnitude"><span>向量大小</span><input type="range" min="0.3" max="1.6" step="0.05" value="1" data-limb-magnitude aria-label="向量大小"><b data-limb-magnitude-value>1.0×</b></label>
        </div>
        <select class="select" data-limb-lead>${Object.entries(LEADS).map(([id, l]) => `<option value="${id}" ${id === 'II' ? 'selected' : ''}>${l.name}</option>`).join('')}</select>
      </div>
      <div class="vector-projections axis-projections" data-limb-projections>${Object.entries(LEADS).map(([id, lead]) => `<div data-limb-projection="${id}"><b>${id}</b><div class="vector-projection-track"><i></i></div><span data-limb-value="${id}">+0.00</span></div>`).join('')}</div>
      <div class="axis-readout" data-limb-readout></div>
      <div class="limb-wave-panel"><div class="visual-sync-head"><span>各肢体导联投影波形</span><span>随向量方向实时变化</span></div><canvas data-limb-waves data-height="245" aria-label="六个肢体导联投影波形"></canvas></div>
    </div>
    <aside class="visual-explain">
      <h3>肢体导联是同一向量的不同投影</h3>
      <p>六个肢体导联位于额面，彼此相差固定角度。某个导联的振幅，等于心电向量在该导联轴上的投影：<b>投影 = |向量| × cos(夹角)</b>。下方的每个导联波形不是独立“偏转”，而是同一瞬时向量随时间投影到该导联轴的结果；要谈偏转，必须同时说明时间、导联和参考向量。</p>
      <div class="axis-table">${Object.entries(LEADS).map(([id, l]) => `<div><b>${l.name}</b><span>${l.angle}°</span><small>${l.note}</small></div>`).join('')}</div>
      <div class="visual-tip">${icon('target', 14)} 本页只讲两件事：<b>投影</b>（向量在导联轴上的分量）和<b>量的大小</b>（向量越长，各导联振幅通常越大）。旋转方向或改变向量大小，观察六个导联的波形与数值。</div>
      <div class="vector-disclaimer"><b>教学示意，不是真实心电向量</b><p>图中的单一箭头只是为了说明“导联如何投影”的简化合成向量。真实心电向量是所有正在除极/复极的心肌细胞电偶向量在同一瞬间的空间叠加，会随激动部位、时间、胸壁阻抗、呼吸和导联位置持续变化，其方向和大小不能由一根固定箭头完全代表。本页用于建立方向与投影的直觉，不用于逐搏定量或临床诊断。</p></div>
    </aside>
  </div>
  ${chestVectorSection()}`;
}

function drawChestVectorCanvas(canvas, state, options = {}) {
  const { ctx, width, height } = canvas2d(canvas);
  const c = palette();
  const cx = width * 0.5;
  const cy = height * 0.53;
  const rx = width * 0.36;
  const ry = height * 0.28;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, width, height);
  // 胸廓横截面：上=前，下=后，左=患者右，右=患者左
  ctx.fillStyle = 'rgba(255,255,255,.025)';
  ctx.strokeStyle = c.grid; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = c.muted; ctx.globalAlpha = .35;
  ctx.beginPath(); ctx.moveTo(cx - rx * .92, cy); ctx.lineTo(cx + rx * .92, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - ry * .92); ctx.lineTo(cx, cy + ry * .92); ctx.stroke();
  ctx.globalAlpha = 1;
  // 胸骨与脊柱
  ctx.fillStyle = c.muted; ctx.font = '9px ui-monospace, monospace';
  ctx.fillText('前 / 胸骨', cx - 22, cy - ry - 9);
  ctx.fillText('后 / 脊柱', cx - 22, cy + ry + 16);
  ctx.fillText('患者右', 8, cy + 3);
  ctx.textAlign = 'right'; ctx.fillText('患者左', width - 8, cy + 3); ctx.textAlign = 'left';
  // 心脏轮廓：RV 偏右前，LV 偏左后
  ctx.fillStyle = 'rgba(240,120,104,.12)'; ctx.strokeStyle = c.accent; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(cx - rx * .10, cy - ry * .10, rx * .20, ry * .30, -.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(20,184,166,.13)'; ctx.strokeStyle = c.brand;
  ctx.beginPath(); ctx.ellipse(cx + rx * .16, cy + ry * .08, rx * .25, ry * .34, .25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = c.muted; ctx.font = '9px ui-monospace, monospace';
  ctx.fillText('RV', cx - rx * .24, cy - ry * .42);
  ctx.fillText('LV', cx + rx * .18, cy + ry * .46);
  // 激活区域高亮（仅激活顺序页启用）
  if (options.highlight) {
    const halo = activationHalos(cx, cy, rx, ry)[options.highlight];
    if (halo) {
      const [hx, hy, hr] = halo;
      const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
      grad.addColorStop(0, 'rgba(245,158,11,.42)');
      grad.addColorStop(1, 'rgba(245,158,11,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c.gold; ctx.globalAlpha = .75; ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(hx, hy, hr * .82, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }
  // 电极位置与连线
  const point = (id) => {
    const p = CHEST_VECTOR[id];
    return [cx + p.x * rx * .84, cy - p.z * ry * .84];
  };
  ctx.strokeStyle = c.brand; ctx.globalAlpha = .28; ctx.setLineDash([3, 3]);
  ctx.beginPath();
  Object.keys(CHEST_VECTOR).forEach((id, i) => { const [x, y] = point(id); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  Object.entries(CHEST_VECTOR).forEach(([id, p]) => {
    const [x, y] = point(id);
    const active = CHEST_VECTOR_KEYS.includes(id);
    ctx.fillStyle = active ? c.bg : 'rgba(255,255,255,.03)';
    ctx.strokeStyle = active ? c[CHEST_VECTOR_COLORS[id]] : c.muted;
    ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath(); ctx.arc(x, y, active ? 11 : 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = active ? c[CHEST_VECTOR_COLORS[id]] : c.muted;
    ctx.font = active ? '700 10px ui-monospace, monospace' : '8px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.fillText(id, x, y + 3.5); ctx.textAlign = 'left';
  });
  // 当前 QRS 瞬时向量
  const v = chestQrsVector(state.qrsPhase ?? 0);
  const mag = Math.hypot(v.x, v.z);
  const vx = cx + v.x * rx * .72;
  const vy = cy - v.z * ry * .72;
  // 主向量参考虚线：左下、略向后
  ctx.strokeStyle = c.gold; ctx.globalAlpha = .45; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + .82 * rx * .72, cy + .65 * ry * .72); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(vx, vy); ctx.stroke();
  if (mag > .04) {
    const ux = (vx - cx) / (Math.hypot(vx - cx, vy - cy) || 1);
    const uy = (vy - cy) / (Math.hypot(vx - cx, vy - cy) || 1);
    const bx = vx - ux * 11; const by = vy - uy * 11;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(vx, vy);
    ctx.lineTo(bx - uy * 5, by + ux * 5); ctx.lineTo(bx + uy * 5, by - ux * 5); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = c.text; ctx.font = '600 10px ui-monospace, monospace';
  const phase = state.qrsPhase ?? 0;
  const activation = activationStepFor(phase).step;
  const phaseLabel = options.caption ?? `${activation.label}：${activation.dir}`;
  ctx.fillText(phaseLabel, 12, 18);
  ctx.fillStyle = c.muted; ctx.font = '9px ui-monospace, monospace';
  ctx.fillText('白色箭头 = 当前瞬时 QRS 向量；金色虚线 = 正常 QRS 主向量（左下、略向后）', 12, height - 10);
}

function drawChestVectorWaves(canvas, state) {
  const { ctx, width, height } = canvas2d(canvas);
  const c = palette();
  const left = 42; const right = 12; const top = 14; const bottom = 18;
  const plotW = width - left - right;
  const rowH = (height - top - bottom) / 3;
  const colors = { V1: c.accent, V5: c.brand, V6: c.gold };
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = c.bg; ctx.fillRect(0, 0, width, height);
  const series = {};
  let maxAbs = 0.2;
  CHEST_VECTOR_KEYS.forEach((id) => {
    series[id] = [];
    for (let i = 0; i <= 120; i += 1) {
      const u = i / 120;
      const value = chestLeadProjection(id, chestQrsVector(u));
      series[id].push(value);
      maxAbs = Math.max(maxAbs, Math.abs(value));
    }
  });
  const scale = rowH * .62 / maxAbs;
  CHEST_VECTOR_KEYS.forEach((id, row) => {
    const base = top + row * rowH + rowH * .57;
    ctx.strokeStyle = c.grid; ctx.globalAlpha = .4;
    ctx.beginPath(); ctx.moveTo(left, base); ctx.lineTo(left + plotW, base); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors[id]; ctx.lineWidth = 1.9;
    ctx.beginPath();
    series[id].forEach((value, i) => {
      const x = left + (i / 120) * plotW;
      const y = base - value * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = colors[id]; ctx.font = '700 9px ui-monospace, monospace';
    ctx.fillText(id, 8, base + 3);
    ctx.fillStyle = c.muted; ctx.font = '8px ui-monospace, monospace';
    ctx.fillText(id === 'V1' ? 'rS' : 'qRs', 24, base + 3);
  });
  const x = left + (state.qrsPhase ?? 0) * plotW;
  ctx.strokeStyle = '#fff'; ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, height - bottom); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = c.muted; ctx.font = '8px ui-monospace, monospace';
  ctx.fillText('0', left, height - 5); ctx.textAlign = 'right'; ctx.fillText('QRS 时间 →', left + plotW, height - 5); ctx.textAlign = 'left';
}

function updateChestVectorReadout(host, state) {
  const v = chestQrsVector(state.qrsPhase ?? 0);
  CHEST_VECTOR_KEYS.forEach((id) => {
    const value = chestLeadProjection(id, v);
    const node = host.querySelector(`[data-chest-vector-value="${id}"]`);
    if (node) {
      node.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
      node.classList.toggle('negative', value < 0);
      node.classList.toggle('positive', value > 0.15);
    }
  });
  const phase = host.querySelector('[data-chest-vector-phase]');
  const u = state.qrsPhase ?? 0;
  if (phase) phase.textContent = u < .25 ? '室间隔：向右前，V1 形成小 r；V5/V6 形成小 q' : u < .62 ? '左室主向量：向左后，远离 V1（深 S），朝向 V5（高 R）' : '基底部：继续向左后，V5/V6 的 R 波逐渐回到基线';
  const slider = host.querySelector('[data-chest-qrs-phase]');
  if (slider) slider.value = String(Math.round(u * 1000));
}

function chestVectorSection() {
  return `<section class="chest-vector-section">
    <div class="chest-vector-head">
      <div><div class="page-eyebrow">${icon('activity', 13)} HORIZONTAL PLANE</div><h2>胸导联向量：V1 为什么是 rS，V5 为什么是 qRs？</h2><p>把胸廓横截面看成一张地图：V1 在右前，V5/V6 在左外侧。同一个 QRS 向量先向右前（室间隔），再向左后（左室游离壁），因此在 V1 和 V5/V6 上留下方向相反的波形。</p></div>
      <div class="chest-vector-controls"><button class="btn btn-secondary btn-sm" type="button" data-chest-qrs-play>${icon('pause', 13)} 暂停</button><label class="visual-range">QRS 进度 <input type="range" min="0" max="1000" value="0" data-chest-qrs-phase aria-label="QRS 进度"></label></div>
    </div>
    <div class="chest-vector-grid">
      <div class="visual-card visual-card-dark">
        <canvas data-chest-vector-canvas data-height="350" aria-label="胸廓横截面与 QRS 向量动画"></canvas>
        <div class="chest-vector-phase" data-chest-vector-phase>室间隔：向右前，V1 形成小 r；V5/V6 形成小 q</div>
      </div>
      <div class="visual-card visual-card-dark">
        <div class="visual-sync-head"><span>V1 / V5 / V6 同步投影波形</span><span>同一向量，不同方向</span></div>
        <canvas data-chest-vector-waves data-height="210" aria-label="V1 V5 V6 胸导联投影波形"></canvas>
        <div class="chest-vector-values">
          ${CHEST_VECTOR_KEYS.map((id) => `<div><b>${id}</b><span>${id === 'V1' ? 'rS' : 'qRs'}</span><i data-chest-vector-value="${id}">+0.00</i></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="chest-vector-notes">
      <div><b>V1 为什么是 rS？</b><span>室间隔先从左向右除极，向量朝向 V1，形成小 r；随后左室主向量向左后，背离 V1，形成深 S。r 小、S 深，所以是 rS。</span></div>
      <div><b>V5 为什么是 qRs？</b><span>初始小向量背离 V5，形成小 q；左室主向量朝向 V5，形成高 R；基底部向量稍向后，形成小 s。</span></div>
      <div><b>为什么 V5 的 R 常大于 V6？</b><span>V5 更靠近左室，导联轴与左室主向量夹角更小；V6 更远、更偏外侧，距离衰减和角度差使 R 波通常略低。个体胸壁、心脏位置和肥厚会改变这一规律。</span></div>
    </div>
  </section>`;
}

function activationPanel() {
  return `<section class="chest-vector-section activation-section">
    <div class="chest-vector-head">
      <div><div class="page-eyebrow">${icon('activity', 13)} ACTIVATION SEQUENCE</div><h2>激活顺序：一次 QRS 从哪里开始，到哪里结束？</h2><p>QRS 不是一根固定的箭头，而是一串依次接力的瞬时向量：室间隔先向右前，随后左室游离壁向左后，最后基底部向左后上。拖动进度或点击下方步骤，观察每一步的向量方向与 V1/V5/V6 投影。</p></div>
      <div class="chest-vector-controls">
        <button class="btn btn-secondary btn-sm" type="button" data-activation-play>${icon('pause', 13)} 暂停</button>
        <label class="visual-range">QRS 进度 <input type="range" min="0" max="1000" value="0" data-activation-phase aria-label="QRS 进度"></label>
        <button class="btn btn-ghost btn-sm" type="button" data-activation-export>${icon('arrowUpRight', 13)} 导出 SVG</button>
      </div>
    </div>
    <div class="chest-vector-grid">
      <div class="visual-card visual-card-dark">
        <canvas data-activation-canvas data-height="350" aria-label="QRS 激活顺序与瞬时向量动画"></canvas>
        <div class="chest-vector-phase" data-activation-phase-label>室间隔：向右前</div>
      </div>
      <div class="visual-card visual-card-dark">
        <div class="visual-sync-head"><span>V1 / V5 / V6 同步投影波形</span><span>同一向量，不同方向</span></div>
        <canvas data-activation-waves data-height="210" aria-label="V1 V5 V6 激活顺序投影波形"></canvas>
        <div class="chest-vector-values">
          ${CHEST_VECTOR_KEYS.map((id) => `<div><b>${id}</b><span>${id === 'V1' ? 'rS' : 'qRs'}</span><i data-activation-value="${id}">+0.00</i></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="activation-steps" role="tablist" aria-label="QRS 激活步骤">
      ${ACTIVATION_STEPS.map((step, i) => `<button class="activation-step" type="button" role="tab" aria-selected="false" data-activation-step="${i}">
        <span class="activation-step-index">0${i + 1}</span>
        <b>${step.label}</b>
        <span class="activation-step-dir">${step.dir}</span>
        <small>${step.leads}</small>
      </button>`).join('')}
    </div>
    <div class="activation-timeline" aria-hidden="true">
      ${ACTIVATION_STEPS.map((step) => `<span>${step.label}</span>`).join('')}
      <i data-activation-cursor></i>
    </div>
    <div class="activation-detail">
      <b data-activation-title>室间隔</b>
      <p data-activation-desc>室间隔自左向右除极，向量朝向 V1，形成小 r；V5/V6 背离向量，形成小 q。</p>
      <span class="activation-detail-leads" data-activation-leads>V1 小 r · V5/V6 小 q</span>
      <a class="btn btn-xs btn-secondary" style="margin-top:8px;width:fit-content" data-activation-link href="#/learn/heart-conduction-anatomy">相关章节：心脏传导系统解剖</a>
      <p class="muted" style="font-size:9.5px;margin-top:8px">教学依据：Durrer 等（1970）离体心脏激动标测与常规心电向量图描述；正常顺序为室间隔 → 心尖/右室 → 左室游离壁 → 基底部。参考：Durrer D, et al. Total excitation of the isolated human heart. Circulation. 1970;41:899–912；Macfarlane PW, et al. Comprehensive Electrocardiology。</p>
    </div>
  </section>`;
}

function updateActivationUi(host, state) {
  const u = state.qrsPhase ?? 0;
  const { index, step } = activationStepFor(u);
  host.querySelectorAll('[data-activation-step]').forEach((node, i) => {
    node.classList.toggle('active', i === index);
    node.setAttribute('aria-selected', i === index ? 'true' : 'false');
  });
  const cursor = host.querySelector('[data-activation-cursor]');
  if (cursor) cursor.style.left = `${Math.max(0, Math.min(1, u)) * 100}%`;
  const slider = host.querySelector('[data-activation-phase]');
  if (slider && document.activeElement !== slider) slider.value = String(Math.round(u * 1000));
  const title = host.querySelector('[data-activation-title]');
  if (title) title.textContent = step.label;
  const desc = host.querySelector('[data-activation-desc]');
  if (desc) desc.textContent = step.detail;
  const link = host.querySelector('[data-activation-link]');
  if (link && step.article) {
    link.setAttribute('href', `#/learn/${step.article}`);
    link.textContent = `相关章节：${step.articleLabel || '阅读'}`;
  }
  const leads = host.querySelector('[data-activation-leads]');
  if (leads) leads.textContent = step.leads;
  const label = host.querySelector('[data-activation-phase-label]');
  if (label) label.textContent = `${step.label}：${step.dir}`;
  const v = chestQrsVector(u);
  CHEST_VECTOR_KEYS.forEach((id) => {
    const value = chestLeadProjection(id, v);
    const node = host.querySelector(`[data-activation-value="${id}"]`);
    if (node) {
      node.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
      node.classList.toggle('negative', value < 0);
      node.classList.toggle('positive', value > 0.15);
    }
  });
}

function activationSvgMarkup(state) {
  const W = 760;
  const H = 620;
  const cx = W * 0.5;
  const cy = H * 0.40;
  const rx = W * 0.34;
  const ry = H * 0.255;
  const paper = '#fffaf5';
  const ink = '#1f2430';
  const muted = '#6b7280';
  const line = '#d8d2cb';
  const brand = '#0e766e';
  const accent = '#c2410c';
  const gold = '#b45309';
  const u = state.qrsPhase ?? 0;
  const { index, step } = activationStepFor(u);
  const v = chestQrsVector(u);
  const vx = cx + v.x * rx * 0.72;
  const vy = cy - v.z * ry * 0.72;
  const mag = Math.hypot(vx - cx, vy - cy);
  const point = (id) => {
    const q = CHEST_VECTOR[id];
    return [cx + q.x * rx * 0.84, cy - q.z * ry * 0.84];
  };
  const halos = activationHalos(cx, cy, rx, ry);
  const halo = halos[step.region] || halos.freewall;
  const electrodePath = Object.keys(CHEST_VECTOR).map((id) => {
    const [x, y] = point(id);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  let arrow = '';
  if (mag > 3) {
    const ux = (vx - cx) / mag;
    const uy = (vy - cy) / mag;
    const bx = vx - ux * 12;
    const by = vy - uy * 12;
    arrow = `<line x1="${cx}" y1="${cy}" x2="${vx}" y2="${vy}" stroke="#111827" stroke-width="2.6" stroke-linecap="round"/>
      <polygon points="${vx},${vy} ${bx - uy * 5},${by + ux * 5} ${bx + uy * 5},${by - ux * 5}" fill="#111827"/>`;
  }
  const electrodes = CHEST_VECTOR_KEYS.map((id) => {
    const [x, y] = point(id);
    const tone = id === 'V1' ? accent : id === 'V5' ? brand : gold;
    return `<g><circle cx="${x}" cy="${y}" r="10" fill="${paper}" stroke="${tone}" stroke-width="2"/><text x="${x}" y="${y + 3.6}" text-anchor="middle" fill="${tone}" font-size="10" font-weight="700">${id}</text></g>`;
  }).join('');
  const values = CHEST_VECTOR_KEYS.map((id, i) => {
    const value = chestLeadProjection(id, v);
    const tone = id === 'V1' ? accent : id === 'V5' ? brand : gold;
    const y = H - 174 + i * 22;
    return `<text x="${W - 204}" y="${y}" fill="${muted}" font-size="12" font-family="ui-monospace, monospace">${id}</text>
      <text x="${W - 160}" y="${y}" fill="${tone}" font-size="13" font-weight="700" font-family="ui-monospace, monospace">${(value >= 0 ? '+' : '') + value.toFixed(2)}</text>`;
  }).join('');
  const zones = ACTIVATION_STEPS.map((item, i) => {
    const h = halos[item.region] || halos.freewall;
    const active = i === index;
    return `<g opacity="${active ? 1 : 0.45}"><circle cx="${h[0]}" cy="${h[1]}" r="${active ? Math.max(14, h[2] * .32) : 12}" fill="${active ? '#f59e0b' : '#ffffff'}" fill-opacity="${active ? .35 : .75}" stroke="${active ? gold : line}" stroke-width="${active ? 2 : 1.2}"/>
      <text x="${h[0]}" y="${h[1] + 4}" text-anchor="middle" fill="${active ? gold : muted}" font-size="11" font-weight="700">${i + 1}</text></g>`;
  }).join('');
  const timelineX = 24;
  const timelineW = W - 48;
  const segW = timelineW / ACTIVATION_STEPS.length;
  const timeline = ACTIVATION_STEPS.map((item, i) => {
    const active = i === index;
    return `<g><rect x="${timelineX + i * segW + 2}" y="${H - 78}" width="${segW - 4}" height="22" rx="5" fill="${active ? '#fef3c7' : '#f7f4ef'}" stroke="${active ? gold : line}"/>
      <text x="${timelineX + i * segW + 8}" y="${H - 63}" fill="${active ? gold : muted}" font-size="10" font-weight="700">${i + 1} · ${item.label}</text>
      <text x="${timelineX + i * segW + 8}" y="${H - 49}" fill="${muted}" font-size="8.5">${item.time}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="正常心室激活顺序教学示意">
  <rect width="${W}" height="${H}" fill="${paper}"/>
  <text x="24" y="32" fill="${ink}" font-size="16" font-weight="700">心迹 ECG Lab · 正常心室激活顺序</text>
  <text x="24" y="52" fill="${muted}" font-size="11">第 ${index + 1} 步：${step.label} · ${step.dir}（${step.time}） · 教学示意，不用于临床诊断</text>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="${line}" stroke-width="1.6"/>
  <line x1="${cx}" y1="${cy - ry * .92}" x2="${cx}" y2="${cy + ry * .92}" stroke="${line}" stroke-dasharray="4 4"/>
  <line x1="${cx - rx * .92}" y1="${cy}" x2="${cx + rx * .92}" y2="${cy}" stroke="${line}" stroke-dasharray="4 4"/>
  <ellipse cx="${cx - rx * 0.10}" cy="${cy - ry * 0.10}" rx="${rx * 0.20}" ry="${ry * 0.30}" transform="rotate(-14 ${cx - rx * 0.10} ${cy - ry * 0.10})" fill="#fde8e4" stroke="${accent}" stroke-width="1.2"/>
  <ellipse cx="${cx + rx * 0.16}" cy="${cy + ry * 0.08}" rx="${rx * 0.25}" ry="${ry * 0.34}" transform="rotate(14 ${cx + rx * 0.16} ${cy + ry * 0.08})" fill="#dcf5f0" stroke="${brand}" stroke-width="1.2"/>
  <text x="${cx - rx * .30}" y="${cy - ry * .50}" fill="${accent}" font-size="10" font-weight="700">RV</text>
  <text x="${cx + rx * .32}" y="${cy + ry * .53}" fill="${brand}" font-size="10" font-weight="700">LV</text>
  <text x="${cx - 18}" y="${cy + 4}" fill="${muted}" font-size="9">室间隔</text>
  ${zones}
  <circle cx="${halo[0]}" cy="${halo[1]}" r="${halo[2]}" fill="#f59e0b" fill-opacity="0.18" stroke="${gold}" stroke-dasharray="3 3"/>
  <polyline points="${electrodePath}" fill="none" stroke="${brand}" stroke-opacity="0.25" stroke-dasharray="3 3"/>
  ${electrodes}
  <line x1="${cx}" y1="${cy}" x2="${cx + 0.82 * rx * 0.72}" y2="${cy + 0.65 * ry * 0.72}" stroke="${gold}" stroke-opacity="0.55" stroke-dasharray="5 4"/>
  ${arrow}
  <text x="24" y="${H - 196}" fill="${ink}" font-size="13" font-weight="700">${step.label}</text>
  <text x="24" y="${H - 178}" fill="${muted}" font-size="11">${step.time} · ${step.dir} · ${step.leads}</text>
  <text x="24" y="${H - 156}" fill="${muted}" font-size="10">深色箭头 = 当前瞬时 QRS 向量（横面）；金色虚线 = 正常 QRS 主向量（左下、略向后）。</text>
  ${values}
  ${timeline}
  <text x="24" y="${H - 14}" fill="${muted}" font-size="9.5">参考：Durrer 等心室激动标测与常规心电向量图描述；正常顺序为室间隔 → 心尖/右室 → 左室游离壁 → 基底部。仅供教学理解。</text>
</svg>`;
}

function downloadSvgFile(markup, filename) {
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function drawActivationCanvas(canvas, state) {
  const { step } = activationStepFor(state.qrsPhase ?? 0);
  drawChestVectorCanvas(canvas, state, { highlight: step.region, caption: `${step.label}：${step.dir}` });
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

const TABS = [
  ['loops', 'P/QRS/T 向量环'],
  ['limb', '肢体导联向量'],
  ['chest', '胸导联定位'],
  ['activation', '激活顺序'],
];

export async function vectorLabView() {
  const el = document.createElement('div');
  el.className = 'page vector-page';
  let active = 'loops';
  let raf = 0;
  let cleanup = [];
  let start = performance.now();
  const state = { rotate: 24, pitch: 18, zoom: 1, playing: true, loop: 'all', lead: 'II', axes: { P: 60, QRS: 60, T: 60 }, axis: 60, angle: 60, magnitude: 1, auto: true, speed: 1, phase: 0, qrsPhase: 0, qrsPlaying: true };
  el.innerHTML = `<div class="page-eyebrow">${icon('compass', 14)} VECTOR & ELECTROPHYSIOLOGY</div>
    <div class="vector-head"><div><h1 class="page-title">心脏向量实验室</h1><p class="page-sub">把“背图形”变成“看方向”：P/QRS/T 环、肢体/胸导联投影、激活顺序一次串起来。</p></div><div class="row-wrap"><a class="btn btn-secondary btn-sm" href="#/learn/ecg-vector-waveform-theory">理论阅读 ${icon('bookOpen', 13)}</a><a class="btn btn-ghost btn-sm" href="#/learn/ecg-calibration-paper">${icon('arrowRight', 13)} 基础课程</a></div></div>
    <div class="vector-safety-note">${icon('info', 14)} <span>向量方向与导联投影仅供教学参考，用于理解“投影”和“向量大小”，<b>不代表任何患者实际情况</b>，不用于诊断或治疗。</span></div>
    <div class="visual-tabs">${TABS.map(([id, label], i) => `<button class="chip ${i === 0 ? 'active' : ''}" type="button" data-visual-tab="${id}">${label}</button>`).join('')}</div>
    <div data-visual-content></div>
    <div class="visual-footnote">${icon('info', 13)} 图形为教学示意：向量方向与导联关系用于理解投影，不替代真实患者 12 导联诊断。</div>`;

  const content = el.querySelector('[data-visual-content]');
  const stopAnim = () => { if (raf) cancelAnimationFrame(raf); raf = 0; cleanup.forEach((fn) => fn()); cleanup = []; };
  let lastFrame = 0;
  const renderLoopState = () => {
    const canvas = content.querySelector('[data-vector-canvas]');
    if (!canvas) return;
    drawVectorCanvas(canvas, state, 0);
    const projection = content.querySelector('[data-vector-ecg]');
    if (projection) drawProjectionCanvas(projection, state, 0);
    const twelve = content.querySelector('[data-vector-12lead]');
    if (twelve) draw12LeadCanvas(twelve, state);
    const syncLabel = content.querySelector('[data-vector-sync-label]');
    if (syncLabel) syncLabel.textContent = getLocale() === 'en' ? `Lead ${state.lead} · time cursor` : `${LEADS[state.lead].name} · 时间光标`;
    const bars = content.querySelector('[data-vector-projections]');
    if (bars) updateProjectionBars(bars, state, 0);
    const tc = state.phase ?? 0;
    const timeline = content.querySelector('[data-vector-timeline]');
    if (timeline) {
      const cursor = timeline.querySelector('[data-vector-timeline-cursor]');
      if (cursor) cursor.style.left = `${tc * 100}%`;
      const timelineActive = state.loop === 'all' ? (tc < 0.16 ? 'P' : tc < 0.42 ? 'QRS' : tc < 0.8 ? 'T' : null) : state.loop;
      timeline.querySelectorAll('span').forEach((node, i) => node.classList.toggle('active', timelineActive !== null && i === ({ P: 0, QRS: 1, T: 2 }[timelineActive])));
    }
    const phaseSlider = content.querySelector('[data-vector-phase]');
    if (phaseSlider) phaseSlider.value = String(Math.round(tc * 1000));
    const phaseLabel = content.querySelector('[data-vector-phase-label]');
    if (phaseLabel) phaseLabel.textContent = `${Math.round(tc * 100)}%`;
    const phaseState = content.querySelector('[data-vector-phase-state]');
    if (phaseState) {
      const active = tc < 0.16 ? 'P' : tc < 0.42 ? 'QRS' : tc < 0.8 ? 'T' : null;
      if (getLocale() === 'en') {
        phaseState.textContent = active
          ? `Current phase: ${active} wave · ${state.loop === 'all' ? `${active} loop active, other loops still` : `${state.loop} loop observation`}`
          : 'Current phase: baseline · all loops idle';
      } else {
        phaseState.textContent = active ? `当前时间：${active} 波 · ${state.loop === 'all' ? `${active} 环活动，其他环静止` : `${state.loop} 环观察`}` : '当前时间：等电位线 · 各环静止';
      }
    }
  };
  const drawLoopFrame = (now) => {
    if (!content.querySelector('[data-vector-canvas]')) return;
    if (state.playing) {
      const dt = lastFrame ? Math.min(0.12, (now - lastFrame) / 1000) : 0;
      state.phase = ((state.phase ?? 0) + dt / (cycleDuration(state) / 1000)) % 1;
    }
    lastFrame = now;
    renderLoopState();
    if (state.playing) raf = requestAnimationFrame(drawLoopFrame);
  };
  const drawLimbFrame = (now) => {
    const canvas = content.querySelector('[data-limb-canvas]');
    if (!canvas) return;
    if (state.auto) {
      const dt = state.lastLimbAt ? Math.min(0.12, (now - state.lastLimbAt) / 1000) : 0;
      state.angle = ((Number(state.angle) || 0) + dt * 11) % 360;
    }
    state.lastLimbAt = now;
    drawLimbCanvas(canvas, state, now);
    updateLimbReadout(content, state, now);
    const waves = content.querySelector('[data-limb-waves]');
    if (waves) drawLimbWaves(waves, state, now);
    const chestVector = content.querySelector('[data-chest-vector-canvas]');
    if (chestVector) {
      if (state.qrsPlaying) {
        const dt = state.lastQrsAt ? Math.min(0.12, (now - state.lastQrsAt) / 1000) : 0;
        state.qrsPhase = ((state.qrsPhase ?? 0) + dt / 4.2) % 1;
      }
      state.lastQrsAt = now;
      drawChestVectorCanvas(chestVector, state);
      const chestWaves = content.querySelector('[data-chest-vector-waves]');
      if (chestWaves) drawChestVectorWaves(chestWaves, state);
      updateChestVectorReadout(content, state);
    }
    raf = requestAnimationFrame(drawLimbFrame);
  };
  const drawActivationFrame = (now) => {
    const canvas = content.querySelector('[data-activation-canvas]');
    if (!canvas) return;
    if (state.qrsPlaying) {
      const dt = state.lastActivationAt ? Math.min(0.12, (now - state.lastActivationAt) / 1000) : 0;
      state.qrsPhase = ((state.qrsPhase ?? 0) + dt / 5.5) % 1;
    }
    state.lastActivationAt = now;
    drawActivationCanvas(canvas, state);
    const waves = content.querySelector('[data-activation-waves]');
    if (waves) drawChestVectorWaves(waves, state);
    updateActivationUi(content, state);
    raf = requestAnimationFrame(drawActivationFrame);
  };
  const bindLoops = () => {
    const play = content.querySelector('[data-vector-play]');
    play?.addEventListener('click', () => {
      state.playing = !state.playing;
      play.innerHTML = state.playing ? `${icon('pause', 13)} 暂停` : `${icon('play', 13)} 播放`;
      lastFrame = 0;
      if (state.playing) { stopAnim(); raf = requestAnimationFrame(drawLoopFrame); } else stopAnim();
    });
    content.querySelector('[data-vector-rotate]')?.addEventListener('input', (e) => { state.rotate = Number(e.target.value); });
    content.querySelector('[data-vector-pitch]')?.addEventListener('input', (e) => { state.pitch = Number(e.target.value); });
    const setZoom = (value) => {
      state.zoom = Math.max(0.5, Math.min(3.5, Number(value) || 1));
      const slider = content.querySelector('[data-vector-zoom]');
      if (slider) slider.value = String(Math.round(state.zoom * 100));
      renderLoopState();
    };
    content.querySelector('[data-vector-zoom]')?.addEventListener('input', (e) => setZoom(Number(e.target.value) / 100));
    content.querySelector('[data-vector-zoom-in]')?.addEventListener('click', () => setZoom(state.zoom * 1.2));
    content.querySelector('[data-vector-zoom-out]')?.addEventListener('click', () => setZoom(state.zoom / 1.2));
    content.querySelector('[data-vector-reset-view]')?.addEventListener('click', () => {
      state.rotate = 24; state.pitch = 18; state.zoom = 1;
      const rx = content.querySelector('[data-vector-rotate]'); const py = content.querySelector('[data-vector-pitch]'); const zm = content.querySelector('[data-vector-zoom]');
      if (zm) zm.value = '100';
      if (rx) rx.value = '24'; if (py) py.value = '18';
      renderLoopState();
    });
    content.querySelector('[data-vector-speed]')?.addEventListener('change', (e) => { state.speed = Number(e.target.value) || 1; lastFrame = 0; });
    content.querySelector('[data-vector-phase]')?.addEventListener('input', (e) => {
      state.playing = false;
      state.phase = Math.max(0, Math.min(1, Number(e.target.value) / 1000));
      lastFrame = 0;
      const play = content.querySelector('[data-vector-play]');
      if (play) play.innerHTML = `${icon('play', 13)} 播放`;
      stopAnim();
      renderLoopState();
    });
    const axisSlider = content.querySelector('[data-vector-axis="QRS"]');
    const setAxis = (key, value) => {
      const v = Math.max(-180, Math.min(180, Number(value) || 0));
      state.axes = { P: 60, QRS: 60, T: 60, ...(state.axes || {}), [key]: v };
      const slider = content.querySelector(`[data-vector-axis="${key}"]`);
      const label = content.querySelector(`[data-vector-axis-value="${key}"]`);
      if (slider) slider.value = String(v);
      if (label) label.textContent = `${v >= 0 ? '+' : ''}${Math.round(v)}°`;
      renderLoopState();
    };
    content.querySelectorAll('[data-vector-axis]').forEach((slider) => {
      slider.addEventListener('input', (e) => setAxis(e.target.dataset.vectorAxis, e.target.value));
    });
    content.querySelector('[data-vector-loop]')?.addEventListener('change', (e) => { state.loop = e.target.value; });
    content.querySelector('[data-vector-lead]')?.addEventListener('change', (e) => { state.lead = e.target.value; });
    const canvas = content.querySelector('[data-vector-canvas]');
    if (canvas) {
      let dragging = false;
      let dragStart = null;
      canvas.addEventListener('pointerdown', (e) => {
        dragStart = { x: e.clientX, y: e.clientY, rotate: state.rotate, pitch: state.pitch };
        dragging = true;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointerup', () => { dragging = false; dragStart = null; });
      canvas.addEventListener('pointercancel', () => { dragging = false; dragStart = null; });
      canvas.addEventListener('pointermove', (e) => {
        if (!dragging || !dragStart) return;
        const rx = content.querySelector('[data-vector-rotate]');
        const py = content.querySelector('[data-vector-pitch]');
        const nextRotate = Math.max(-180, Math.min(180, dragStart.rotate + (e.clientX - dragStart.x) * 0.55));
        const nextPitch = Math.max(-89, Math.min(89, dragStart.pitch - (e.clientY - dragStart.y) * 0.55));
        state.rotate = nextRotate; state.pitch = nextPitch;
        if (rx) rx.value = String(Math.round(nextRotate));
        if (py) py.value = String(Math.round(nextPitch));
        renderLoopState();
      });
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        setZoom(state.zoom * Math.exp(-e.deltaY * 0.0015));
      }, { passive: false });
    }
    raf = requestAnimationFrame(drawLoopFrame);
  };
  const bindLimb = () => {
    const auto = content.querySelector('[data-limb-auto]');
    auto?.addEventListener('click', () => {
      state.auto = !state.auto;
      state.lastLimbAt = 0;
      auto.innerHTML = state.auto ? `${icon('pause', 13)} 暂停旋转` : `${icon('rotate', 13)} 自动旋转`;
    });
    content.querySelector('[data-limb-angle]')?.addEventListener('input', (e) => { state.auto = false; state.angle = Number(e.target.value); });
    content.querySelector('[data-limb-lead]')?.addEventListener('change', (e) => { state.lead = e.target.value; });
    content.querySelector('[data-limb-magnitude]')?.addEventListener('input', (e) => {
      state.magnitude = Number(e.target.value) || 1;
    });
    const qrsPlay = content.querySelector('[data-chest-qrs-play]');
    qrsPlay?.addEventListener('click', () => {
      state.qrsPlaying = !state.qrsPlaying;
      state.lastQrsAt = 0;
      qrsPlay.innerHTML = state.qrsPlaying ? `${icon('pause', 13)} 暂停` : `${icon('play', 13)} 播放`;
    });
    content.querySelector('[data-chest-qrs-phase]')?.addEventListener('input', (e) => {
      state.qrsPlaying = false;
      state.qrsPhase = Math.max(0, Math.min(1, Number(e.target.value) / 1000));
      state.lastQrsAt = 0;
      const button = content.querySelector('[data-chest-qrs-play]');
      if (button) button.innerHTML = `${icon('play', 13)} 播放`;
    });
    const limbCanvas = content.querySelector('[data-limb-canvas]');
    if (limbCanvas) {
      let dragging = false;
      const setFromPointer = (e) => {
        const rect = limbCanvas.getBoundingClientRect();
        const cx = rect.width / 2; const cy = rect.height / 2 - 18;
        const deg = (Math.atan2(cy - (e.clientY - rect.top), e.clientX - rect.left - cx) * 180 / Math.PI + 360) % 360;
        state.auto = false;
        const signed = deg > 180 ? deg - 360 : deg;
        state.angle = signed;
        const slider = content.querySelector('[data-limb-angle]');
        if (slider) slider.value = String(Math.round(signed));
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
  const bindActivation = () => {
    const play = content.querySelector('[data-activation-play]');
    const pauseAt = () => {
      state.qrsPlaying = false;
      state.lastActivationAt = 0;
      if (play) play.innerHTML = `${icon('play', 13)} 播放`;
    };
    play?.addEventListener('click', () => {
      state.qrsPlaying = !state.qrsPlaying;
      state.lastActivationAt = 0;
      play.innerHTML = state.qrsPlaying ? `${icon('pause', 13)} 暂停` : `${icon('play', 13)} 播放`;
    });
    content.querySelector('[data-activation-phase]')?.addEventListener('input', (e) => {
      pauseAt();
      state.qrsPhase = Math.max(0, Math.min(1, Number(e.target.value) / 1000));
      updateActivationUi(content, state);
      const canvas = content.querySelector('[data-activation-canvas]');
      if (canvas) {
        drawActivationCanvas(canvas, state);
        const waves = content.querySelector('[data-activation-waves]');
        if (waves) drawChestVectorWaves(waves, state);
      }
    });
    content.querySelectorAll('[data-activation-step]').forEach((button) => {
      button.addEventListener('click', () => {
        const step = ACTIVATION_STEPS[Number(button.dataset.activationStep)];
        if (!step) return;
        pauseAt();
        state.qrsPhase = step.u;
        updateActivationUi(content, state);
        const canvas = content.querySelector('[data-activation-canvas]');
        if (canvas) {
          drawActivationCanvas(canvas, state);
          const waves = content.querySelector('[data-activation-waves]');
          if (waves) drawChestVectorWaves(waves, state);
        }
      });
    });
    content.querySelector('[data-activation-export]')?.addEventListener('click', () => {
      const stamp = new Date().toISOString().slice(0, 10);
      downloadSvgFile(activationSvgMarkup(state), `ecg-activation-${stamp}.svg`);
    });
    raf = requestAnimationFrame(drawActivationFrame);
  };

  const renderTab = (tab) => {
    stopAnim();
    active = tab;
    el.querySelectorAll('[data-visual-tab]').forEach((b) => b.classList.toggle('active', b.dataset.visualTab === tab));
    content.innerHTML = tab === 'loops' ? vectorLoopsPanel()
      : tab === 'limb' ? limbPanel()
        : tab === 'chest' ? chestPanel()
          : activationPanel();
    if (tab === 'loops') bindLoops();
    else if (tab === 'limb') bindLimb();
    else if (tab === 'chest') bindChest();
    else bindActivation();
  };
  el.querySelectorAll('[data-visual-tab]').forEach((button) => button.addEventListener('click', () => renderTab(button.dataset.visualTab)));
  renderTab(active);
  return { el, destroy: stopAnim };
}
