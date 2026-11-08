const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108ai';
const { icon, escapeHtml } = await import(`../ui.js${__asset}`);

const TOPICS = [
  {
    id: 'af', title: '心房颤动：CHA₂DS₂-VASc vs CHA₂DS₂-VA',
    us: 'ACC/AHA/ACCP/HRS 2023：使用 CHA₂DS₂-VASc，含性别类别；按评分与出血风险决定抗凝。',
    eu: 'ESC 2024 AF-CARE：使用 CHA₂DS₂-VA（去掉性别类别），强调合并症管理与动态再评估。',
    take: '两套评分不能直接互换。教学时先讲“卒中风险因素”，再说明不同地区采用不同积分；不要背一个阈值套所有患者。',
  },
  {
    id: 'af-pci', title: '房颤合并 PCI：三联治疗时程',
    us: '美国指南通常建议尽早停用阿司匹林、缩短三联抗栓时间，具体按缺血/出血风险。',
    eu: 'ESC 更强调围术期后尽快转为双联（DOAC + 氯吡格雷），以降低出血。',
    take: '具体天数与药物组合必须查当地指南与患者情况；本站只讲“为什么缩短三联”，不给处方。',
  },
  {
    id: 'acs', title: 'ACS / STEMI：再灌注与转运',
    us: 'AHA/ACC 体系强调区域胸痛中心网络、FMC-to-device 时间与转运策略。',
    eu: 'ESC 2023 ACS 指南同样强调及时再灌注，但院前溶栓/转运阈值与本地网络有关。',
    take: '把“相邻导联、镜像改变、后壁/右室扩展”讲清，比背某国分钟数更可迁移；时间目标以当地流程为准。',
  },
  {
    id: 'acls', title: 'ACLS：AHA 与 ERC/ILCOR',
    us: 'AHA ACLS 2020：高质量 CPR、尽早除颤、肾上腺素每 3–5 分钟；复苏后管理按流程。',
    eu: 'ERC 2021 与 ILCOR 在药物时序、气道策略、温度管理细节上可能不同。',
    take: '共同核心是按压质量、减少中断、可逆病因；具体能量/药物/温度目标按当地方案。',
  },
  {
    id: 'pediatric', title: '儿科：PALS 与欧洲儿科生命支持',
    us: 'AHA PALS：儿童心脏骤停常为呼吸源性，强调通气与氧合；能量按体重。',
    eu: '欧洲儿科生命支持在通气优先、药物剂量与团队角色上有自己的流程。',
    take: '儿科不能直接套成人 ACLS；心电图判读要结合年龄、右室优势与先心病史。',
  },
];

export async function guidelinesView() {
  const el = document.createElement('div');
  el.className = 'page guidelines-page';
  el.innerHTML = `
    <header class="page-head">
      <div><div class="page-eyebrow">${icon('compass', 14)} REGIONAL GUIDELINES</div><h1 class="page-title">区域指南差异</h1><p class="page-sub">同一条心电图，在不同地区可能对应不同的治疗阈值。先学可迁移的判读框架，再标注指南版本与适用人群。</p></div>
      <a class="btn btn-secondary btn-sm" href="https://github.com/AndroidOL/ecg-academy/blob/main/docs/GUIDELINES.md" target="_blank" rel="noopener noreferrer">完整文档 ${icon('arrowUpRight', 13)}</a>
    </header>
    <div class="vector-safety-note">${icon('info', 14)} <span>本页为教学摘要，不构成诊疗建议。药物剂量、电击能量、时间窗与抗凝方案必须以当地现行指南、药品说明书和设备为准。</span></div>
    <div class="guideline-grid">${TOPICS.map((topic) => `<article class="card card-pad guideline-card">
      <div class="page-eyebrow">${escapeHtml(topic.id.toUpperCase())}</div>
      <h2>${escapeHtml(topic.title)}</h2>
      <div class="guideline-sides"><div><b>美国 / AHA-ACC</b><p>${escapeHtml(topic.us)}</p></div><div><b>欧洲 / ESC-ERC</b><p>${escapeHtml(topic.eu)}</p></div></div>
      <div class="callout brand"><b>教学要点：</b>${escapeHtml(topic.take)}</div>
    </article>`).join('')}</div>
    <footer class="page-footer">指南会更新；发现表述过时请通过“关于 / 勘误”提交，并附版本与链接。</footer>`;
  return { el };
}
