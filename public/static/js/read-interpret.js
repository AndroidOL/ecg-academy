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

const P_MORPHOLOGY_LABELS = {
  normal: '形态正常',
  flattened: '低平',
  peaked: '高尖（提示右房增大）',
  absent: '消失',
  hidden: '隐藏于 QRS/T',
  sawtooth: '被锯齿状 F 波取代',
  retrograde: '逆行 P 波',
  atrial: '房性异位 P 波',
  paced: '起搏心房波',
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

export function buildAdvancedReading(spec = {}, options = [], measures = {}, references = []) {
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
  const prText = pAbsent ? 'P 波消失/被 f/F 波取代，PR 无法测量' : 'PR 已记录（点击“查看数值”核对）';
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
  if (qrsWidth >= 0.12) changes.push('QRS 增宽');
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

  const conclusion = [
    '频率与节律（先写心率与基础节律）',
    '电轴与 PR/QRS/QT（数值需自行测量后填写）',
    `QRS 形态：${morphology}`,
    elevation.length ? `ST 抬高：${fmtLeadList(elevation)}` : depression.length ? `ST 压低：${fmtLeadList(depression)}` : 'ST 段未见明显偏移',
    tShape || 'T 波形态未见明显异常',
    '最后写最可能诊断、需要排除的诊断与下一步',
  ].join('；') + '。';

  const next = [];
  if (elevation.length) next.push('按 STEMI/ACS 流程：动态心电图、hs-cTn、再灌注评估，并寻找镜像改变。');
  if (qrsWidth >= 0.12) next.push('对照 V1/V6 判断束支阻滞；宽 QRS 心动过速先按室速处理。');
  if (spec.avBlock) next.push('评估晕厥、药物与起搏指征；高度阻滞需监护。');
  if (uWave || Number(spec.qt) > 0.45) next.push('复查血钾、血镁、血钙与 QT 相关药物。');
  if (rhythm === 'af') next.push('评估卒中风险、抗凝与心室率控制。');
  if (next.length === 0) next.push('结合病史、生命体征、旧图与动态复查；单次 ECG 不能排除阵发性事件。');

  const values = {
    rate,
    pr: pAbsent ? null : Number(spec.pr) || null,
    qrs: qrsWidth || null,
    qt: Number(spec.qt) || null,
    v1R: v1r,
    v5S: v5s,
  };

  const pMorphology = P_MORPHOLOGY_LABELS[String(spec.p || 'normal')] || '需逐导联描述';
  const v1Text = v1r === null ? '未测' : `${v1r.toFixed(2)} mV`;
  const v5Text = v5s === null ? '未测' : `${v5s.toFixed(2)} mV`;
  const rateCheck = rate > 0 ? {
    id: 'rate', question: '本例心率属于哪一档？',
    options: [{ id: 'brady', label: '<60 次/分' }, { id: 'normal', label: '60–100 次/分' }, { id: 'tachy', label: '>100 次/分' }],
    answer: rateBand(rate) || 'normal',
    explanation: `本例心率约 ${rate} 次/分。${rate < 60 ? '心动过缓；需结合症状、药物、传导阻滞与高钾。' : rate > 100 ? '心动过速；先分窄/宽 QRS 与规则/不规则。' : '在成人静息常用范围内；仍需结合年龄、症状与代谢状态。'}`,
  } : null;
  const pCheck = {
    id: 'p', question: 'P 波是否存在、是否窦性？',
    options: [{ id: 'present', label: '存在，形态正常' }, { id: 'abnormal', label: '存在，但形态异常' }, { id: 'absent', label: '消失/被 f/F 波取代' }],
    answer: pAbsent ? 'absent' : pRaw === 'normal' ? 'present' : 'abnormal',
    explanation: pAbsent ? 'P 波消失或被 f/F 波取代；先区分房颤、房扑、交界性/室性心律与 P 波隐藏。' : pRaw === 'normal' ? 'P 波在 I、II、aVF 直立、aVR 倒置，形态一致，符合窦性 P 波；每个 P 后固定下传。' : `P 波存在但形态异常（${pMorphology}），需考虑房性异位心律、导联位置或心房增大。`,
  };
  const ppCheck = {
    id: 'pp', question: 'PP 间期是否整齐？',
    options: [{ id: 'regular', label: '基本整齐' }, { id: 'irregular', label: '不整齐' }],
    answer: rhythm === 'af' || Number(spec.irregularity) > 0.06 || spec.ectopy ? 'irregular' : 'regular',
    explanation: `${rhythm === 'af' ? '房颤时 PP/FF 间期绝对不规则。' : spec.ectopy ? '提前搏动会打断 PP 间期。' : Number(spec.irregularity) > 0.06 ? '存在明显窦性心律不齐或传导变化。' : 'PP 间期基本规则。'} 本例 RR：${rrRegular}。`,
  };
  const avCheck = {
    id: 'av', question: 'P 与 QRS 的关系？',
    options: [{ id: 'normal', label: '每个 P 后均有 QRS' }, { id: 'dropped', label: '有 P 未下传' }, { id: 'dissociated', label: 'P 与 QRS 完全分离' }],
    answer: avDegree === '3' ? 'dissociated' : ['2a', '2b'].includes(avDegree) ? 'dropped' : 'normal',
    explanation: avText,
  };
  const axisCheck = {
    id: 'axis', question: '额面电轴大致方向？',
    options: [{ id: 'normal', label: '正常' }, { id: 'left', label: '左偏' }, { id: 'right', label: '右偏' }],
    answer: spec.axis === 'left' ? 'left' : spec.axis === 'right' ? 'right' : 'normal',
    explanation: `本例轴位：${axis}。正常约 −30°～+90°；左偏常见 LAFB，右偏见 RVH/PE/左后分支。`,
  };
  const widthCheck = {
    id: 'width', question: 'QRS 是否宽大？',
    options: [{ id: 'narrow', label: '窄 QRS（<0.12 s）' }, { id: 'wide', label: '宽 QRS（≥0.12 s）' }],
    answer: wideQrs ? 'wide' : 'narrow',
    explanation: `本例 QRS 标称 ${qrsWidth ? `${Math.round(qrsWidth * 1000)} ms` : '不可测'}（${wideQrs ? '≥' : '<'}120 ms）。${wideQrs ? '需分束支阻滞、室性心律、起搏与高钾。' : '仍要结合形态、电压与电轴。'}`,
  };
  const pMorphCheck = {
    id: 'p-morph', question: 'P 波形态是否正常？',
    options: [{ id: 'normal', label: '形态基本正常' }, { id: 'abnormal', label: '形态异常（高尖/低平/逆行等）' }, { id: 'absent', label: 'P 波不可见' }],
    answer: pRaw === 'normal' ? 'normal' : pAbsent ? 'absent' : 'abnormal',
    explanation: pRaw === 'normal' ? 'II 导联 P 波宽度与振幅在正常范围，形态一致。' : pAbsent ? 'P 波不可见，无法评价形态；先确认房颤、房扑或交界性/室性心律。' : `本例 P 波形态：${pMorphology}。II 导联高尖提示右房增大，V1 终末负向提示左房增大。`,
  };
  const morphologyCheck = {
    id: 'morphology', question: 'QRS 形态类型？',
    options: [{ id: 'normal', label: '正常 R 波为主' }, { id: 'rbbb', label: 'RBBB 型（V1 rsR′）' }, { id: 'lbbb', label: 'LBBB 型（V5/V6 宽 R）' }, { id: 'other', label: '其他形态（LAFB/WPW/高电压/宽大畸形等）' }],
    answer: ['normal', 'rbbb', 'lbbb'].includes(spec.morphology) ? spec.morphology : 'other',
    explanation: `本例形态：${morphology}。V1 R ${v1Text}，V5 S ${v5Text}。逐导联标记 QS、qRs、Rs、rS，不能只看一个导联。`,
  };
  const stCheck = elevation.length && depression.length ? 'both' : elevation.length ? 'elevation' : depression.length ? 'depression' : 'normal';
  const stCheckItem = {
    id: 'st', question: 'ST 段改变？',
    options: [{ id: 'normal', label: '无明显偏移' }, { id: 'elevation', label: '抬高' }, { id: 'depression', label: '压低' }, { id: 'both', label: '同时存在抬高与压低' }],
    answer: stCheck,
    explanation: stText,
  };
  const tCheck = {
    id: 't', question: 'T 波是否异常？',
    options: [{ id: 'normal', label: '形态基本正常' }, { id: 'abnormal', label: '异常（倒置/高尖/低平/双向）' }],
    answer: tShape || uWave ? 'abnormal' : 'normal',
    explanation: tText + (uWave ? '；可见显著 U 波。' : ''),
  };

  const steps = [
    {
      id: 'calibration',
      title: '定标、纸速与导联',
      value: '25 mm/s · 10 mm/mV；本图提供节律条与 12 导联视图。',
      detail: '一小格 0.04 s、一大格 0.20 s；1 mm = 0.1 mV。先确认定标脉冲高度、纸速和导联位置；肢体导联反接或胸导联位置错误会让后续判断失真。',
      tip: '怀疑导联错接时先重做心电图，不要在心梗/右室负荷的错误前提上治疗。',
      checks: [],
    },
    {
      id: 'rate',
      title: '心率',
      value: `本例心率约 ${rate || '—'} 次/分`,
      detail: '规则心律用 300 ÷ 相邻 R 波之间的大格数；不规则心律用 10 秒内 QRS 个数 × 6。心率必须结合年龄、症状、体温、药物与代谢状态。',
      tip: '心率 <40 或 >130 次/分属于需要优先评估的范围。',
      checks: rateCheck ? [rateCheck] : [],
    },
    {
      id: 'rhythm',
      title: '节律与 P 波',
      value: `P 波：${pAbsent ? '消失/被 f/F 波取代' : pSinus ? '存在，窦性形态' : '存在，但非典型窦性'}；PP ${ppRegular}；AV：${avText}；RR ${rrRegular}`,
      detail: '在 II、V1 找 P 波：P 波在 I、II、aVF 直立、aVR 倒置提示窦性；逐个 P 标记是否下传；PP 与 RR 分别看。',
      tip: 'P 波消失不一定是房颤，也可能是房扑、交界性/室性心律或 P 波隐藏。',
      checks: [pCheck, ppCheck, avCheck],
    },
    {
      id: 'axis',
      title: '额面电轴',
      value: `本例电轴：${axis}`,
      detail: '用 I 与 aVF 主波快速判断：同向上为正常；I 向上、aVF 向下为左偏；I 向下、aVF 向上为右偏。正常约 −30°～+90°。',
      tip: '电轴不是孤立诊断；先排除导联错接，再结合 QRS 形态与临床。',
      checks: [axisCheck],
    },
    {
      id: 'intervals',
      title: 'PR、QRS 与 QT 间期',
      value: `PR ${values.pr === null ? '不可测' : `${values.pr.toFixed(2)} s`}；QRS ${values.qrs === null ? '—' : `${Math.round(values.qrs * 1000)} ms`}；QT ${values.qt === null ? '—' : `${values.qt.toFixed(2)} s`}（标称值，点击“查看本例数值”核对）`,
      detail: 'PR 从 P 起点到 QRS 起点；QRS 从第一个偏转到回到基线；QT 从 QRS 起点到 T 终点。宽 QRS 时先按室速处理，直到有证据排除。',
      tip: '宽 QRS 心动过速先按室速处理；不要只凭“有 P 波”排除室速。',
      checks: [widthCheck],
    },
    {
      id: 'p-morphology',
      title: 'P 波形态与心房增大',
      value: `本例 P 波形态：${pMorphology}`,
      detail: 'II 导联 P 波宽度 <0.12 s、振幅 <0.25 mV；II 导联高尖提示右房增大，V1 终末负向提示左房增大。',
      tip: 'P 波形态要与窦性 P 电轴一起看；V1 终末负向与 II 导联高尖分别提示左右房增大。',
      checks: [pMorphCheck],
    },
    {
      id: 'qrs-morphology',
      title: 'QRS 形态、电压与病理性 Q',
      value: `本例形态：${morphology}；V1 R ${v1Text}；V5 S ${v5Text}`,
      detail: '逐导联描述 QS、qRs、Rs、rS；病理性 Q：宽度 ≥0.04 s 或深度 >1/4 R。V1 高 R 见于 RVH、后壁 MI、WPW、RBBB；V5 深 S 需结合电轴与右心负荷。',
      tip: '形态不是诊断本身；把 QRS 类型、电压、电轴与 ST-T 放回同一导联组合。',
      checks: [morphologyCheck],
    },
    {
      id: 'st',
      title: 'ST 段',
      value: stText,
      detail: '先定基线（TP/PR 段），再判断 J 点与 ST 形态；STEMI 看相邻导联 + 镜像，后壁加做 V7–V9，右室加做 V4R。',
      tip: 'ST 抬高先排除伪差与早期复极，再按相邻导联与镜像改变判断 STEMI。',
      checks: [stCheckItem],
    },
    {
      id: 'tu',
      title: 'T 波与 U 波',
      value: `${tText}${uWave ? '；可见显著 U 波' : ''}`,
      detail: 'T 波方向通常与 QRS 主波一致；倒置、高尖、低平、双向或与 QRS 不一致都要结合 ST 段、QT 与电解质。',
      tip: 'T 波倒置不一定是缺血；LBBB/RBBB 的继发改变、LVH 劳损、肺栓塞与电解质都可导致。',
      checks: [tCheck],
    },
    {
      id: 'clinical',
      title: '与旧图、症状和临床对照',
      value: '结合症状、生命体征、旧图与动态变化；单次 ECG 不能排除阵发性事件。',
      detail: conclusion,
      tip: '先描述再诊断；单次 ECG 不能排除阵发性事件，必须结合旧图与动态复查。',
      checks: [],
    },
  ];
  const selfChecks = steps.flatMap((step) => step.checks || []);

  return {
    steps,
    values,
    selfChecks,
    changes,
    danger,
    conclusion,
    next,
    candidateDiagnoses,
    differentials,
    references: Array.isArray(references) ? references : [],
    sourceNote: '判读顺序参照 AHA/ACCF/HRS 心电图标准化建议与相应 ESC/ACC/AHA 指南；最终诊断需结合 12 导联、病史与动态变化。',
  };
}

export function isStepCorrect(step, selection) {
  const chosen = [...selection].sort();
  const answer = Array.isArray(step.answer) ? step.answer : [step.answer];
  const expected = [...answer].sort();
  return chosen.length === expected.length && chosen.every((id, index) => id === expected[index]);
}

export function optionReviewState(optionId, answer, chosenId) {
  const answers = Array.isArray(answer) ? answer : [answer];
  const chosen = Array.isArray(chosenId) ? chosenId : [chosenId];
  if (answers.includes(optionId)) return 'ok';
  if (chosen.includes(optionId)) return 'bad';
  return 'neutral';
}
