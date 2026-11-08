const RHYTHM_LABELS = {
  sinus: '窦性心律',
  af: '心房颤动',
  flutter: '心房扑动',
  atrial_tach: '房性心动过速',
  svt: '室上性心动过速',
  vt: '室性心动过速',
  vf: '心室颤动',
  torsades: '尖端扭转型室速',
  aivr: '加速性室性自主心律',
  junctional: '交界性心律',
  ventricular_escape: '室性逸搏心律',
};

const RHYTHM_GROUPS = {
  sinus: { id: 'sinus', label: '窦性心律', note: 'P 波规律，每个 P 后跟随 QRS' },
  af: { id: 'atrial', label: '房性快速性心律失常', note: '房颤 / 房扑 / 房速，P 波消失或形态异常' },
  flutter: { id: 'atrial', label: '房性快速性心律失常', note: '房颤 / 房扑 / 房速，P 波消失或形态异常' },
  atrial_tach: { id: 'atrial', label: '房性快速性心律失常', note: '房颤 / 房扑 / 房速，P 波消失或形态异常' },
  svt: { id: 'svt', label: '室上性心动过速', note: '窄 QRS、突发突止' },
  vt: { id: 'ventricular', label: '室性心律失常', note: '宽 QRS / 室性节律' },
  vf: { id: 'ventricular', label: '室性心律失常', note: '宽 QRS / 室性节律' },
  torsades: { id: 'ventricular', label: '室性心律失常', note: '宽 QRS / 室性节律' },
  aivr: { id: 'ventricular', label: '室性心律失常', note: '宽 QRS / 室性节律' },
  junctional: { id: 'escape', label: '逸搏 / 交界性心律', note: '无正常窦性 P 波，由下级起搏点接管' },
  ventricular_escape: { id: 'escape', label: '逸搏 / 交界性心律', note: '无正常窦性 P 波，由下级起搏点接管' },
};

const AXIS_LABELS = {
  normal: '正常电轴',
  left: '电轴左偏',
  right: '电轴右偏',
  extreme: '极度右偏',
};

const T_SHAPE_LABELS = {
  peaked: 'T 波高尖',
  inverted: 'T 波倒置',
  flat: 'T 波低平',
  biphasic: 'T 波双向',
  discordant: 'T 波与 QRS 方向不一致',
  convex: 'T 波凸面向上',
  concave: 'T 波凹面向上',
  horizontal: 'ST-T 水平型改变',
  scoop: 'ST-T 鱼钩样改变',
};

const RHYTHM_OPTIONS = [
  RHYTHM_GROUPS.sinus,
  RHYTHM_GROUPS.af,
  RHYTHM_GROUPS.svt,
  RHYTHM_GROUPS.vt,
  RHYTHM_GROUPS.junctional,
];

function uniq(options) {
  const seen = new Set();
  return options.filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

function rateBand(rate) {
  if (rate <= 0) return null;
  if (rate < 60) return 'brady';
  if (rate > 100) return 'tachy';
  return 'normal';
}

function rhythmGroup(code) {
  return RHYTHM_GROUPS[code] || { id: 'other', label: '其他 / 起搏节律', note: '不属于常见窦性或异位节律' };
}

function intervalAbnormalities(spec) {
  const ids = [];
  const pr = Number(spec.pr) || 0;
  const qrs = Number(spec.qrs) || 0;
  const qt = Number(spec.qt) || 0;
  if (String(spec.avBlock?.degree || '') === '1' || pr > 0.2) ids.push('pr');
  if (qrs >= 0.12) ids.push('qrs');
  if (qt > 0.45) ids.push('qt');
  return { ids, pr, qrs, qt };
}

function sttAbnormalities(spec) {
  const ids = [];
  const elevation = Array.isArray(spec.st?.elevation) ? spec.st.elevation : [];
  const depression = Array.isArray(spec.st?.depression) ? spec.st.depression : [];
  if (elevation.length) ids.push('ste');
  if (depression.length) ids.push('std');
  if (String(spec.t?.shape || 'normal') !== 'normal') ids.push('t');
  if (Number(spec.u) > 0) ids.push('u');
  return { ids, elevation, depression };
}

export function buildReading(spec = {}) {
  const rate = Number(spec.rate) || 0;
  const rateAnswer = rateBand(rate);
  const rhythm = rhythmGroup(spec.rhythm);
  const axis = AXIS_LABELS[spec.axis] ? spec.axis : 'normal';
  const intervals = intervalAbnormalities(spec);
  const stt = sttAbnormalities(spec);

  const intervalLabels = {
    pr: 'PR 间期延长（>0.20 s）',
    qrs: 'QRS 增宽（≥0.12 s）',
    qt: 'QT / QTc 延长（>0.45 s）',
    none: '均无显著异常',
  };
  const sttLabels = {
    ste: 'ST 段抬高',
    std: 'ST 段压低',
    t: 'T 波形态改变',
    u: 'U 波显著',
    none: '无显著 ST-T 改变',
  };

  const intervalAnswer = intervals.ids.length ? intervals.ids : ['none'];
  const sttAnswer = stt.ids.length ? stt.ids : ['none'];

  const rhythmLabel = RHYTHM_LABELS[spec.rhythm] || rhythm.label;
  const axisLabel = AXIS_LABELS[axis];
  const sttParts = [];
  if (stt.elevation.length) sttParts.push(`ST 抬高：${stt.elevation.join('、')}`);
  if (stt.depression.length) sttParts.push(`ST 压低：${stt.depression.join('、')}`);
  const tShape = T_SHAPE_LABELS[spec.t?.shape];
  if (tShape) sttParts.push(tShape);
  if (Number(spec.u) > 0) sttParts.push('可见显著 U 波');
  const intervalText = [
    intervals.pr > 0 ? `PR ${intervals.pr.toFixed(2)} s` : 'PR 无法测量（P 波消失或房室分离）',
    `QRS ${intervals.qrs.toFixed(2)} s`,
    `QT ${intervals.qt.toFixed(2)} s`,
  ].join('、');

  return {
    rate: {
      answer: rateAnswer || 'normal',
      value: rate,
      explanation: `心室率约 ${rate || '—'} 次/分。${rateAnswer === 'brady' ? '低于 60 次/分，属于心动过缓。' : rateAnswer === 'tachy' ? '高于 100 次/分，属于心动过速。' : '位于 60–100 次/分的常用范围。'}`,
    },
    rhythm: {
      answer: rhythm.id,
      explanation: `节律为「${rhythmLabel}」。${rhythm.note}。`,
    },
    axis: {
      answer: axis,
      explanation: `额面电轴为「${axisLabel}」。正常电轴约 −30°～+90°，左偏常见于左前分支阻滞，右偏见于右室肥厚或左后分支阻滞。`,
    },
    intervals: {
      answer: intervalAnswer,
      explanation: `${intervalText}。${intervals.ids.length ? intervals.ids.map((id) => intervalLabels[id]).join('；') + '。' : '间期均在常用参考范围内。'}`,
    },
    stt: {
      answer: sttAnswer,
      explanation: sttParts.length ? `${sttParts.join('；')}。` : '未见明显 ST 段偏移、T 波形态改变或显著 U 波。',
    },
    options: {
      rate: [
        { id: 'brady', label: '心动过缓（<60 次/分）' },
        { id: 'normal', label: '正常范围（60–100 次/分）' },
        { id: 'tachy', label: '心动过速（>100 次/分）' },
      ],
      rhythm: uniq(RHYTHM_OPTIONS),
      axis: [
        { id: 'normal', label: '正常电轴' },
        { id: 'left', label: '电轴左偏' },
        { id: 'right', label: '电轴右偏' },
      ],
      intervals: [
        { id: 'pr', label: intervalLabels.pr },
        { id: 'qrs', label: intervalLabels.qrs },
        { id: 'qt', label: intervalLabels.qt },
        { id: 'none', label: intervalLabels.none },
      ],
      stt: [
        { id: 'ste', label: sttLabels.ste },
        { id: 'std', label: sttLabels.std },
        { id: 't', label: sttLabels.t },
        { id: 'u', label: sttLabels.u },
        { id: 'none', label: sttLabels.none },
      ],
    },
  };
}

export function isStepCorrect(step, selection) {
  const chosen = [...selection].sort();
  const answer = Array.isArray(step.answer) ? step.answer : [step.answer];
  const expected = [...answer].sort();
  return chosen.length === expected.length && chosen.every((id, index) => id === expected[index]);
}
