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

function leadValues(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item !== '');
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, amount]) => Number(amount) !== 0)
      .map(([lead]) => lead);
  }
  return [];
}

function sttAbnormalities(spec) {
  const ids = [];
  const elevation = leadValues(spec.st?.elevation);
  const depression = leadValues(spec.st?.depression);
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


const MORPHOLOGY_LABELS = {
  normal: '以 R 波为主（按导联可呈 Rs/rS）',
  rbbb: 'V1 rsR′，I/V6 宽钝 S',
  lbbb: 'V1 QS/rS，V5/V6 宽钝 R',
  lafb: 'I/aVL qR，II/III/aVF rS',
  lpfb: 'I/aVL rS，II/III/aVF qR',
  wpw: '短 PR + δ 波，QRS 增宽',
  brugada: 'V1–V2 穹隆型 ST 抬高',
  hyperk: 'T 波高尖，QRS 可增宽',
  lvh: 'V1 深 S、V5/V6 高 R',
  wide: '宽大畸形 QRS',
  pvc: '宽大畸形 QRS，T 波反向',
  paced: '起搏钉后 QRS',
};

function fmtLeadList(leads) {
  return leads.length ? leads.join('、') : '';
}

export function buildAdvancedReading(spec = {}, options = [], measures = {}) {
  const rhythm = String(spec.rhythm || 'sinus');
  const pRaw = String(spec.p || 'normal');
  const pAbsent = ['af', 'flutter', 'vf', 'vflutter', 'torsades'].includes(rhythm) || ['absent', 'hidden', 'sawtooth'].includes(pRaw);
  const pSinus = rhythm === 'sinus' && !pAbsent && pRaw === 'normal';
  const ppRegular = rhythm === 'af'
    ? '不规则（房颤的 PP/FF 间期不规则）'
    : rhythm === 'flutter'
      ? '按固定比例（需数 F 波确认）'
      : Number(spec.irregularity) > 0.06 || spec.ectopy
        ? '不完全规则（需标注早搏/窦性心律不齐）'
        : '基本规则';
  const avDegree = String(spec.avBlock?.degree || '');
  const pDropped = ['2a', '2b', '3'].includes(avDegree);
  const avText = avDegree === '1'
    ? 'PR 延长，但每个 P 后均有 QRS（一度）'
    : avDegree === '2a'
      ? 'PR 逐渐延长后出现 P 未下传（二度 I 型）'
      : avDegree === '2b'
        ? 'PR 恒定、突然出现 P 未下传（二度 II 型）'
        : avDegree === '3'
          ? 'P 与 QRS 完全分离（三度）'
          : '每个 P 后均有 QRS，PR 固定';
  const prText = pAbsent ? 'P 波消失/被 f/F 波取代，PR 无法测量' : `PR ${(Number(spec.pr) || 0).toFixed(2)} s`;
  const qrsWidth = Number(spec.qrs) || 0;
  const wideQrs = qrsWidth >= 0.12;
  const rrRegular = rhythm === 'af'
    ? '不规则'
    : spec.ectopy
      ? '被提前搏动打断'
      : Number(spec.irregularity) > 0.06
        ? '不完全规则'
        : '基本规则';
  const axis = AXIS_LABELS[spec.axis] || AXIS_LABELS.normal;
  const morphology = MORPHOLOGY_LABELS[String(spec.morphology || 'normal')] || '需逐导联描述';
  const elevation = leadValues(spec.st?.elevation);
  const depression = leadValues(spec.st?.depression);
  const tShape = T_SHAPE_LABELS[String(spec.t?.shape || 'normal')];
  const uWave = Number(spec.u) > 0;
  const v1r = Number.isFinite(Number(measures.v1R)) ? Number(measures.v1R) : null;
  const v5s = Number.isFinite(Number(measures.v5S)) ? Number(measures.v5S) : null;
  const stText = elevation.length
    ? `ST 段抬高：${fmtLeadList(elevation)}`
    : depression.length
      ? `ST 段压低：${fmtLeadList(depression)}`
      : 'ST 段无明显抬高/压低（仍需逐导联确认）';
  const tText = tShape || 'T 波形态未见明显异常（仍需逐导联确认）';
  const changes = [];
  const rate = Number(spec.rate) || 0;
  if (rate > 0 && rate < 60) changes.push('心率 <60 次/分（心动过缓）');
  if (rate > 100) changes.push('心率 >100 次/分（心动过速）');
  if (rhythm !== 'sinus') changes.push(`节律异常（${RHYTHM_LABELS[rhythm] || rhythm}）`);
  if (axis !== AXIS_LABELS.normal) changes.push(axis);
  if (Number(spec.pr) > 0.20) changes.push('PR 间期延长');
  if (qrsWidth >= 0.12) changes.push(`QRS 增宽（${(qrsWidth * 1000).toFixed(0)} ms）`);
  if (spec.avBlock) changes.push(`房室阻滞：${avText}`);
  if (elevation.length) changes.push(`ST 抬高（${fmtLeadList(elevation)}）`);
  if (depression.length) changes.push(`ST 压低（${fmtLeadList(depression)}）`);
  if (tShape) changes.push(tShape);
  if (uWave) changes.push('显著 U 波');
  if (spec.morphology && spec.morphology !== 'normal') changes.push(`QRS 形态：${morphology}`);
  if (changes.length === 0) changes.push('未见明确异常改变（仍需结合病史与旧图）');

  const danger = [];
  if (rate > 0 && rate < 40) danger.push('显著心动过缓（<40 次/分）');
  if (rate > 130) danger.push('显著心动过速（>130 次/分）');
  if (elevation.length) danger.push('ST 抬高：按 STEMI/ACS 流程评估再灌注');
  if (qrsWidth >= 0.12) danger.push('宽 QRS：按室速/束支阻滞/起搏/高钾逐项排除');
  if (['2a', '2b', '3'].includes(avDegree)) danger.push('高度/完全性房室阻滞：评估晕厥与起搏指征');
  if (['vt', 'vf', 'torsades'].includes(rhythm)) danger.push('室性快速性心律失常：先评估血流动力学');
  if (uWave && Number(spec.qt) > 0.45) danger.push('QT 延长 + U 波：排查低钾/药物/长 QT');
  if (!danger.length) danger.push('当前无明确危急值；仍需结合症状、生命体征与动态变化');

  const candidateDiagnoses = (Array.isArray(options) ? options : []).map((option) => ({
    id: String(option.id || ''),
    name: String(option.name || option.id || ''),
    chapter: String(option.chapter || ''),
  }));

  const differentials = [];
  if (elevation.length) differentials.push({ title: 'ST 抬高', items: ['STEMI/ACS', '心包炎', '早期复极', 'LVH/束支阻滞的继发改变', 'Brugada（V1–V2）'] });
  if (depression.length) differentials.push({ title: 'ST 压低', items: ['缺血/NSTEMI', 'LVH 劳损', '洋地黄效应', '低钾', '心动过速相关改变'] });
  if (qrsWidth >= 0.12) differentials.push({ title: '宽 QRS', items: ['LBBB/RBBB', '室性心动过速', '起搏心律', '高钾血症', 'WPW/预激'] });
  if (pAbsent) differentials.push({ title: 'P 波消失', items: ['心房颤动', '心房扑动', '交界性/室性心律', 'P 波隐藏于 QRS/T'] });
  if (uWave || Number(spec.qt) > 0.45) differentials.push({ title: 'QT 延长 / U 波', items: ['低钾/低镁/低钙', '药物（抗心律失常药、抗精神病药等）', '先天性长 QT', '心动过缓相关 QT 延长'] });
  if (!differentials.length) differentials.push({ title: '无明确异常改变', items: ['正常变异', '导联位置/技术因素', '需结合病史与旧图'] });

  const steps = [
    {
      id: 'p',
      title: 'P 波是否存在？是否窦性？',
      value: pAbsent ? 'P 波消失/被 f/F 波取代' : pSinus ? 'P 波存在，窦性形态' : 'P 波存在，但非典型窦性',
      detail: `${pAbsent ? '先在 II、V1 找 P；房颤看 f 波，房扑看 F 波，交界性/室性心律可能无 P。' : 'P 波在 I、II、aVF 直立、aVR 倒置提示窦性；注意 P′ 形态变化。'} ${prText}。`,
      tip: '先确认 P 波，再谈节律；没有 P 不一定是房颤，也可能是交界性/室性心律或 P 波隐藏。',
    },
    {
      id: 'pp',
      title: 'PP 间期是否整齐？',
      value: ppRegular,
      detail: '用分规或屏幕卡尺连续测量 3–5 个 PP；房颤绝对不规则，房扑多见固定比例，窦性心律不齐随呼吸变化。',
      tip: 'PP 与 RR 要分别看：PP 规则而 RR 不规则，提示房室传导比例变化或阻滞。',
    },
    {
      id: 'av',
      title: 'P 与 QRS 的关系？有无 P 波脱落？',
      value: avText,
      detail: `逐个 P 标记是否下传；${pDropped ? '本例存在 P 未下传/分离，需分型并评估症状与起搏指征。' : '本例每个 P 后均有 QRS，PR 关系固定。'}`,
      tip: '二度 I 型 PR 渐长后脱漏；II 型 PR 恒定、突然脱漏；三度 P 与 QRS 完全分离。',
    },
    {
      id: 'qrs',
      title: 'QRS 电轴、宽度与 RR 是否整齐？',
      value: `电轴：${axis}；QRS ${(qrsWidth * 1000).toFixed(0)} ms（${wideQrs ? '宽' : '窄'}）；RR ${rrRegular}`,
      detail: '电轴看 I/aVF 主波；QRS ≥120 ms 要分束支阻滞、室性心律、起搏与高钾；RR 规则性帮助区分房颤、早搏与传导比例。',
      tip: '宽 QRS 先按室速处理，直到有证据排除；不要只凭“有 P 波”排除室速。',
    },
    {
      id: 'morphology',
      title: 'QRS 类型、V1 R 与 V5 S、畸形 QRS',
      value: `类型/形态：${morphology}（逐导联标记 QS/qRs/Rs/rS）；V1 R ${v1r === null ? '需在 12 导联测量' : `${v1r.toFixed(2)} mV`}；V5 S ${v5s === null ? '需在 12 导联测量' : `${v5s.toFixed(2)} mV`}`,
      detail: '逐导联描述 QS、qRs、Rs、rS；V1 高 R 见于 RVH、后壁 MI、WPW、RBBB；V5 深 S 需结合电轴与右心负荷。病理性 Q：宽度 ≥0.04 s 或深度 >1/4 R。',
      tip: '形态不是诊断本身；把 QRS 类型、电压、电轴与 ST-T 放回同一导联组合。',
    },
    {
      id: 'q-wave',
      title: '是否存在病理性 Q 波？',
      value: '逐导联观察 Q 波宽度、深度与是否伴随 ST-T 改变（本例需在 12 导联确认）',
      detail: '病理性 Q：宽度 ≥0.04 s、深度 >1/4 R，或新出现并伴 ST-T 动态改变；下壁看 II/III/aVF，前壁看 V1–V4，侧壁看 I/aVL/V5–V6。',
      tip: 'Q 波不是心梗的同义词；导联位置、心肌病、预激与正常变异都可产生 Q 波。',
    },
    {
      id: 'st',
      title: 'ST 段是否正常？压低还是抬高？',
      value: stText,
      detail: elevation.length || depression.length ? `按相邻导联确认：${elevation.length ? `抬高 ${fmtLeadList(elevation)}` : ''}${elevation.length && depression.length ? '；' : ''}${depression.length ? `压低 ${fmtLeadList(depression)}` : ''}。` : '先定基线（TP/PR 段），再判断 J 点与 ST 形态；单导联改变先排除伪差。',
      tip: 'STEMI 看相邻导联 + 镜像；后壁看 V1–V3 镜像并加做 V7–V9；右室看 V4R。',
    },
    {
      id: 't',
      title: 'T 波与 U 波是否正常？',
      value: `${tText}${uWave ? '；可见显著 U 波' : ''}`,
      detail: 'T 波方向通常与 QRS 主波一致；倒置、高尖、低平、双向或与 QRS 不一致都要结合 ST 段、QT 与电解质。',
      tip: 'T 波倒置不一定是缺血；LBBB/RBBB 的继发改变、LVH 劳损、肺栓塞与电解质都可导致。',
    },
    {
      id: 'conclusion',
      title: '从 0 开始写出完整结论',
      value: '节律 → 频率 → 电轴 → 间期 → QRS 形态 → ST-T → 诊断 → 鉴别 → 下一步',
      detail: '按固定顺序写：基础节律与频率；PR/QRS/QT；电轴与 QRS 形态；ST-T/U；最可能诊断；需要排除的诊断；危急值与下一步。',
      tip: '先描述再诊断：例如“窦性心律，心率 72，PR 0.16，QRS 0.14，V1 深 S，V5 宽 R，ST-T 不一致，符合 LBBB”。',
    },
  ];

  const conclusion = [
    `${rate ? `${rate} 次/分` : '心率未知'}，${RHYTHM_LABELS[rhythm] || rhythm}`,
    `轴位：${axis}`,
    pAbsent ? 'P 波不可测' : `PR ${(Number(spec.pr) || 0).toFixed(2)} s`,
    `QRS ${(qrsWidth * 1000).toFixed(0)} ms${wideQrs ? '（宽）' : ''}`,
    elevation.length ? `ST 抬高 ${fmtLeadList(elevation)}` : depression.length ? `ST 压低 ${fmtLeadList(depression)}` : 'ST 无明显偏移',
    tShape || 'T 波形态未见明显异常',
  ].join('；') + '。';

  const next = [];
  if (elevation.length) next.push('按 STEMI/ACS 流程：动态心电图、hs-cTn、再灌注评估，并寻找镜像改变。');
  if (qrsWidth >= 0.12) next.push('对照 V1/V6 判断束支阻滞；宽 QRS 心动过速先按室速处理。');
  if (spec.avBlock) next.push('评估晕厥、药物与起搏指征；高度阻滞需监护。');
  if (uWave || Number(spec.qt) > 0.45) next.push('复查血钾、血镁、血钙与 QT 相关药物。');
  if (rhythm === 'af') next.push('评估卒中风险、抗凝与心室率控制。');
  if (next.length === 0) next.push('结合病史、生命体征、旧图与动态复查；单次 ECG 不能排除阵发性事件。');

  return {
    steps,
    changes,
    danger,
    conclusion,
    next,
    candidateDiagnoses,
    differentials,
    sourceNote: '判读顺序参照 AHA/ACCF/HRS 心电图标准化建议与相应 ESC/ACC/AHA 指南；最终诊断需结合 12 导联、病史与动态变化。',
  };
}

export function isStepCorrect(step, selection) {
  const chosen = [...selection].sort();
  const answer = Array.isArray(step.answer) ? step.answer : [step.answer];
  const expected = [...answer].sort();
  return chosen.length === expected.length && chosen.every((id, index) => id === expected[index]);
}
