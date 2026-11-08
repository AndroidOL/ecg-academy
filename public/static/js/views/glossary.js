const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108at';
const { icon, escapeHtml } = await import(`../ui.js${__asset}`);

const TERMS = [
  ['基础', 'Electrocardiogram (ECG)', '心电图', '在体表记录心脏电活动随时间变化的电位差。'],
  ['基础', 'Action potential', '动作电位', '单个心肌细胞膜电位随离子通道开放发生的快速变化。'],
  ['基础', 'Depolarization', '除极', '细胞膜电位变正的过程；心室除极形成 QRS。'],
  ['基础', 'Repolarization', '复极', '细胞恢复静息膜电位的过程；心室复极形成 T 波。'],
  ['基础', 'P wave', 'P 波', '心房除极产生的波；窦性心律时 II 导联直立。'],
  ['基础', 'PR interval', 'PR 间期', 'P 波起点到 QRS 起点，代表房室传导时间。'],
  ['基础', 'QRS complex', 'QRS 波群', '心室除极产生的波群；正常宽度 <0.12 s。'],
  ['基础', 'ST segment', 'ST 段', 'QRS 终点到 T 波起点之间的段；抬高/压低需结合导联与临床。'],
  ['基础', 'T wave', 'T 波', '心室复极波；方向通常与 QRS 主波一致。'],
  ['基础', 'QT interval', 'QT 间期', 'QRS 起点到 T 波终点；需按心率校正。'],
  ['基础', 'U wave', 'U 波', 'T 波后的小波；明显时考虑低钾、心动过缓等。'],
  ['基础', 'Calibration', '定标', '标准 1 mV = 10 mm；纸速 25 mm/s 时 1 mm = 0.04 s。'],
  ['基础', 'Artifact', '伪差', '非心脏电活动造成的波形干扰，如基线漂移、肌电、导联脱落。'],
  ['导联/向量', 'Lead', '导联', '记录两点间电位差的电极组合；决定观察心脏电活动的角度。'],
  ['导联/向量', 'Limb leads', '肢体导联', 'I、II、III、aVR、aVL、aVF，反映额面电活动。'],
  ['导联/向量', 'Precordial leads', '胸导联', 'V1–V6，位于水平面，从右胸到左腋中线。'],
  ['导联/向量', 'Electrical axis', '电轴', 'QRS 主向量在额面的方向，常用 I 与 aVF 判断。'],
  ['导联/向量', 'Vector loop', '向量环', '瞬时心电向量尖端随时间连接形成的环。'],
  ['导联/向量', 'Projection', '投影', '向量在导联轴上的分量；决定该导联振幅与极性。'],
  ['导联/向量', 'Transition zone', '移行区', '胸导联 R/S 比例由以 S 为主转为以 R 为主的区域，常在 V3–V4。'],
  ['节律', 'Sinus rhythm', '窦性心律', '由窦房结主导，P 波在 I/II 直立，频率 60–100 次/分。'],
  ['节律', 'Sinus bradycardia', '窦性心动过缓', '窦性心律且频率 <60 次/分。'],
  ['节律', 'Sinus tachycardia', '窦性心动过速', '窦性心律且频率 >100 次/分。'],
  ['节律', 'Premature atrial contraction (PAC)', '房性期前收缩', '心房异位起搏点提前激动，P 波形态常不同。'],
  ['节律', 'Premature ventricular contraction (PVC)', '室性期前收缩', '心室异位起搏点提前激动，QRS 宽大畸形。'],
  ['节律', 'Atrial fibrillation (AF)', '心房颤动', 'P 波消失，代之以 f 波，RR 绝对不规则。'],
  ['节律', 'Atrial flutter', '心房扑动', '规则锯齿状 F 波，常见 2:1、3:1 房室传导。'],
  ['节律', 'AV block', '房室传导阻滞', '房室结/希氏束传导延迟或中断，分一度、二度、三度。'],
  ['节律', 'Bundle branch block (BBB)', '束支传导阻滞', 'QRS 增宽并呈特征性形态；分左/右束支阻滞。'],
  ['节律', 'Supraventricular tachycardia (SVT)', '室上性心动过速', '起源在心室以上的快速心动过速，常为窄 QRS。'],
  ['节律', 'Ventricular tachycardia (VT)', '室性心动过速', '宽 QRS 心动过速，可伴或不伴脉搏。'],
  ['节律', 'Ventricular fibrillation (VF)', '心室颤动', '心室电活动混乱，无有效输出，需立即除颤。'],
  ['节律', 'Torsades de pointes', '尖端扭转型室速', 'QT 延长背景下的多形性室速，电轴围绕基线扭转。'],
  ['节律', 'Asystole', '心搏停止', '无可见心室电活动；需 CPR、肾上腺素并寻找可逆病因。'],
  ['节律', 'Pulseless electrical activity (PEA)', '无脉电活动', '有组织电活动但无有效脉搏；治疗可逆病因。'],
  ['缺血/结构', 'Ischemia', '缺血', '心肌供氧不足，可引起 ST 压低、T 波改变。'],
  ['缺血/结构', 'Injury', '损伤', '更严重的缺血导致 ST 段抬高，提示透壁性损伤。'],
  ['缺血/结构', 'Infarction', '梗死', '心肌坏死，出现病理性 Q 波、ST-T 演变。'],
  ['缺血/结构', 'STEMI', 'ST 段抬高型心肌梗死', '相邻导联 ST 抬高，需紧急再灌注。'],
  ['缺血/结构', 'NSTEMI', '非 ST 段抬高型心肌梗死', '心肌损伤标志物升高但无持续 ST 抬高。'],
  ['缺血/结构', 'Hypertrophy', '肥厚', '心房或心室肥厚导致电压、电轴和复极改变。'],
  ['缺血/结构', 'Bundle branch', '束支', '希氏束分出的左/右束支，负责快速激动心室。'],
  ['缺血/结构', 'Accessory pathway', '旁路', '连接心房与心室的异常通路，可致预激与折返。'],
  ['缺血/结构', 'WPW syndrome', 'WPW 综合征', '预激伴心动过速；短 PR、delta 波、宽 QRS。'],
  ['急救', 'Cardiopulmonary resuscitation (CPR)', '心肺复苏', '胸外按压与通气，维持重要器官灌注。'],
  ['急救', 'Defibrillation', '除颤', '非同步电击终止 VF/无脉性 VT。'],
  ['急救', 'Synchronized cardioversion', '同步电复律', '与 QRS 同步放电，用于有脉不稳定快速心律。'],
  ['急救', 'Return of spontaneous circulation (ROSC)', '自主循环恢复', '心脏骤停后恢复有效自主循环。'],
  ['急救', 'Reversible causes (Hs & Ts)', '可逆病因', '低血容量、缺氧、酸中毒、低/高钾、低体温、张力性气胸、心包填塞、毒素、血栓。'],
  ['急救', 'Epinephrine', '肾上腺素', '心脏骤停的一线血管活性药；按流程每 3–5 分钟。'],
  ['急救', 'Amiodarone', '胺碘酮', '难治性 VF/VT 的抗心律失常药；注意总量与场景。'],
  ['急救', 'Adenosine', '腺苷', '用于稳定窄 QRS 规则室上速的诊断/终止。'],
  ['急救', 'Local anesthetic systemic toxicity (LAST)', '局麻药全身毒性', '局麻药误入血管导致抽搐、心脏骤停；脂肪乳救援。'],
  ['急救', 'Perimortem cesarean delivery', '围死亡期剖宫产', '孕 20 周以上母体心脏骤停复苏未恢复时考虑，改善静脉回流。'],
  ['方法学', 'Sensitivity', '敏感度', '有病者中检测阳性的比例；用于排除/筛查。'],
  ['方法学', 'Specificity', '特异度', '无病者中检测阴性的比例；用于确认。'],
  ['方法学', 'Differential diagnosis', '鉴别诊断', '解释同一表现的其他可能诊断。'],
  ['方法学', 'Red flag', '危险信号', '提示高危、需立即处理或升级监护的线索。'],
  ['方法学', 'Paper speed', '纸速', '标准 25 mm/s；50 mm/s 可展开快速波形。'],
  ['方法学', 'Gain', '增益', '标准 10 mm/mV；增益改变会影响振幅判断。'],
  ['方法学', 'Spaced repetition', '间隔重复', '按遗忘曲线安排复习，提高长期记忆。'],
  ['方法学', 'Peer review', '同行审阅', '由同领域专业人员核对内容、证据与表述。'],
];

const CATS = ['全部', ...new Set(TERMS.map((term) => term[0]))];

export async function glossaryView() {
  const el = document.createElement('div');
  el.className = 'page glossary-page';
  let query = '';
  let cat = '全部';

  el.innerHTML = `
    <header class="page-head">
      <div><div class="page-eyebrow">${icon('compass', 14)} BILINGUAL GLOSSARY</div><h1 class="page-title">心电图双语术语表</h1><p class="page-sub">中文—English 对照，覆盖基础波形、导联向量、节律、缺血/结构、急救与方法学。英文界面为外壳级 beta，课程正文以中文为主。</p></div>
      <div class="row-wrap"><a class="btn btn-secondary btn-sm" href="#/guidelines">${icon('compass', 13)} 区域指南差异</a><span class="badge badge-brand">${TERMS.length} 个术语</span></div>
    </header>
    <div class="glossary-toolbar">
      <input class="input" type="search" data-glossary-search placeholder="搜索中文 / English / 定义…" aria-label="搜索术语">
      <div class="glossary-cats">${CATS.map((item) => `<button class="chip ${item === cat ? 'active' : ''}" type="button" data-glossary-cat="${item}">${item}</button>`).join('')}</div>
    </div>
    <div class="glossary-list"></div>
    <footer class="page-footer">术语表用于学习与跨语言沟通；不同教材/地区对个别术语的用法可能不同。</footer>`;

  const listEl = el.querySelector('.glossary-list');
  const renderList = () => {
    const q = query.trim().toLowerCase();
    const items = TERMS.filter(([category, en, zh, def]) => (cat === '全部' || category === cat) && (!q || `${en} ${zh} ${def}`.toLowerCase().includes(q)));
    listEl.innerHTML = items.map(([category, en, zh, def]) => `<article class="glossary-item"><div class="glossary-term"><b>${escapeHtml(zh)}</b><span>${escapeHtml(en)}</span></div><span class="badge">${escapeHtml(category)}</span><p>${escapeHtml(def)}</p></article>`).join('') || '<div class="learn-empty"><b>没有匹配术语</b><span>换个关键词或分类试试。</span></div>';
  };

  el.querySelector('[data-glossary-search]').addEventListener('input', (event) => { query = event.target.value; renderList(); });
  el.querySelectorAll('[data-glossary-cat]').forEach((button) => button.addEventListener('click', () => {
    cat = button.dataset.glossaryCat;
    el.querySelectorAll('[data-glossary-cat]').forEach((item) => item.classList.toggle('active', item.dataset.glossaryCat === cat));
    renderList();
  }));
  renderList();
  return { el };
}
