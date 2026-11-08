// 理论文章内联 SVG 示意图（教学示意，随主题变量变色，无外部图片依赖）
export const FIGURES = {
  'ion-to-lead': {
    caption: '从离子流到体表波形：四层转换缺一不可。',
    legend: [
      { label: '离子通道', color: 'var(--brand)' },
      { label: '动作电位', color: 'var(--accent)' },
      { label: '空间向量', color: 'var(--gold)' },
      { label: '导联投影', color: 'var(--ink)' },
    ],
    svg: `<svg viewBox="0 0 720 150" role="img" aria-label="离子通道、动作电位、空间向量与导联投影四步链条">
      <defs><marker id="figArrow1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="var(--muted)"/></marker></defs>
      <g font-family="ui-monospace, monospace">
        <rect x="8" y="24" width="150" height="92" rx="12" fill="var(--surface-2)" stroke="var(--line-strong)"/>
        <text x="83" y="52" text-anchor="middle" font-size="13" font-weight="700" fill="var(--brand)">1 离子通道</text>
        <text x="83" y="74" text-anchor="middle" font-size="10" fill="var(--muted)">Na⁺ 内流 · Ca²⁺ 平台</text>
        <text x="83" y="90" text-anchor="middle" font-size="10" fill="var(--muted)">K⁺ 外流</text>
        <line x1="162" y1="70" x2="184" y2="70" stroke="var(--muted)" stroke-width="1.6" marker-end="url(#figArrow1)"/>
        <rect x="190" y="24" width="150" height="92" rx="12" fill="var(--surface-2)" stroke="var(--line-strong)"/>
        <text x="265" y="52" text-anchor="middle" font-size="13" font-weight="700" fill="var(--accent)">2 动作电位</text>
        <text x="265" y="74" text-anchor="middle" font-size="10" fill="var(--muted)">0–4 相</text>
        <text x="265" y="90" text-anchor="middle" font-size="10" fill="var(--muted)">除极 → 复极</text>
        <line x1="344" y1="70" x2="366" y2="70" stroke="var(--muted)" stroke-width="1.6" marker-end="url(#figArrow1)"/>
        <rect x="372" y="24" width="150" height="92" rx="12" fill="var(--surface-2)" stroke="var(--line-strong)"/>
        <text x="447" y="52" text-anchor="middle" font-size="13" font-weight="700" fill="var(--gold)">3 空间向量</text>
        <text x="447" y="74" text-anchor="middle" font-size="10" fill="var(--muted)">大量电偶叠加</text>
        <text x="447" y="90" text-anchor="middle" font-size="10" fill="var(--muted)">向量环随时间</text>
        <line x1="526" y1="70" x2="548" y2="70" stroke="var(--muted)" stroke-width="1.6" marker-end="url(#figArrow1)"/>
        <rect x="554" y="24" width="158" height="92" rx="12" fill="var(--surface-2)" stroke="var(--line-strong)"/>
        <text x="633" y="52" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink)">4 导联投影</text>
        <text x="633" y="74" text-anchor="middle" font-size="10" fill="var(--muted)">投影 = |V|·cosθ</text>
        <text x="633" y="90" text-anchor="middle" font-size="10" fill="var(--muted)">朝向为正 · 背离为负</text>
      </g>
    </svg>`,
  },

  'action-potential': {
    caption: '心肌细胞动作电位与体表心电图时相：0 相 ≈ QRS，2 相 ≈ ST 段，3 相 ≈ T 波。',
    legend: [
      { label: '膜电位', color: 'var(--brand)' },
      { label: '0 相（Na⁺）', color: 'var(--accent)' },
      { label: '2 相（Ca²⁺）', color: 'var(--gold)' },
      { label: '3 相（K⁺）', color: 'var(--ink)' },
    ],
    svg: `<svg viewBox="0 0 720 250" role="img" aria-label="心肌细胞动作电位曲线与 0 到 4 相">
      <g font-family="ui-monospace, monospace">
        <line x1="40" y1="205" x2="700" y2="205" stroke="var(--line-strong)" stroke-width="1"/>
        <line x1="40" y1="26" x2="40" y2="205" stroke="var(--line-strong)" stroke-width="1"/>
        <text x="22" y="58" text-anchor="end" font-size="10" fill="var(--muted)">+20</text>
        <text x="22" y="200" text-anchor="end" font-size="10" fill="var(--muted)">−90</text>
        <text x="14" y="120" text-anchor="middle" font-size="10" fill="var(--muted)" transform="rotate(-90 14 120)">mV</text>
        <path d="M46 196 H120 C128 196 133 178 138 128 L154 62 C196 52 240 70 300 78 C324 81 344 86 362 100 C378 130 392 172 428 196 H692" fill="none" stroke="var(--brand)" stroke-width="2.6" stroke-linejoin="round"/>
        <line x1="154" y1="62" x2="154" y2="205" stroke="var(--accent)" stroke-dasharray="3 4" opacity="0.55"/>
        <line x1="362" y1="100" x2="362" y2="205" stroke="var(--ink)" stroke-dasharray="3 4" opacity="0.4"/>
        <line x1="428" y1="196" x2="428" y2="205" stroke="var(--muted)" stroke-dasharray="2 4"/>
        <g font-size="11" font-weight="700">
          <text x="100" y="220" fill="var(--muted)">4 相</text>
          <text x="150" y="220" fill="var(--accent)">0 相</text>
          <text x="230" y="220" fill="var(--muted)">1 相</text>
          <text x="300" y="220" fill="var(--gold)">2 相</text>
          <text x="392" y="220" fill="var(--ink)">3 相</text>
          <text x="540" y="220" fill="var(--muted)">4 相</text>
        </g>
        <text x="162" y="40" font-size="10" fill="var(--accent)">Na⁺ 快速内流</text>
        <text x="300" y="62" font-size="10" fill="var(--gold)">Ca²⁺ 内流平台</text>
        <text x="410" y="150" font-size="10" fill="var(--ink)">K⁺ 外流复极</text>
        <text x="60" y="188" font-size="10" fill="var(--muted)">静息 / 自动除极</text>
        <text x="560" y="188" font-size="10" fill="var(--muted)">静息恢复</text>
      </g>
    </svg>`,
  },

  'conduction-sequence': {
    caption: '正常激动顺序：窦房结 → 心房 → 房室结 → 希氏束 → 左右束支 → 浦肯野纤维 → 心室肌。',
    legend: [
      { label: '起搏点 SA', color: 'var(--ok)' },
      { label: '房室结 AV', color: 'var(--warn)' },
      { label: '传导路径', color: 'var(--brand)' },
      { label: '心室肌', color: 'var(--accent)' },
    ],
    svg: `<svg viewBox="0 0 380 320" role="img" aria-label="心脏四腔与正常激动顺序示意">
      <g font-family="ui-monospace, monospace">
        <path d="M190 34 C128 28 86 72 92 134 C98 218 160 270 190 292 C220 270 282 218 288 134 C294 72 252 28 190 34Z" fill="var(--surface-2)" stroke="var(--line-strong)" stroke-width="2"/>
        <path d="M190 48 L190 270" stroke="var(--line-strong)" stroke-width="1" opacity=".5"/>
        <path d="M104 122 Q190 88 276 122" stroke="var(--line-strong)" fill="none" opacity=".6"/>
        <path d="M112 130 Q142 180 168 232 M268 130 Q238 180 212 232" stroke="var(--line-strong)" fill="none" opacity=".35"/>
        <text x="138" y="92" text-anchor="middle" font-size="12" font-weight="700" fill="var(--brand)">RA 右房</text>
        <text x="244" y="92" text-anchor="middle" font-size="12" font-weight="700" fill="var(--brand)">LA 左房</text>
        <text x="134" y="214" text-anchor="middle" font-size="12" font-weight="700" fill="var(--accent)">RV 右室</text>
        <text x="246" y="214" text-anchor="middle" font-size="12" font-weight="700" fill="var(--accent)">LV 左室</text>
        <path d="M172 72 Q186 100 190 144 Q196 174 190 196" fill="none" stroke="var(--brand)" stroke-width="2" stroke-dasharray="5 5"/>
        <path d="M190 196 Q164 218 142 246 M190 196 Q216 218 238 246" fill="none" stroke="var(--brand)" stroke-width="2" stroke-dasharray="5 5"/>
        <path d="M142 246 Q120 258 108 276 M238 246 Q260 258 272 276" fill="none" stroke="var(--brand)" stroke-width="1.6" stroke-dasharray="3 4" opacity=".8"/>
        <g font-size="10" font-weight="700">
          <circle cx="172" cy="72" r="10" fill="var(--ok)"/><text x="172" y="76" text-anchor="middle" fill="#fff">1</text>
          <circle cx="190" cy="144" r="10" fill="var(--warn)"/><text x="190" y="148" text-anchor="middle" fill="#fff">2</text>
          <circle cx="190" cy="196" r="10" fill="var(--brand)"/><text x="190" y="200" text-anchor="middle" fill="#fff">3</text>
          <circle cx="142" cy="246" r="10" fill="var(--brand)"/><text x="142" y="250" text-anchor="middle" fill="#fff">4</text>
          <circle cx="238" cy="246" r="10" fill="var(--brand)"/><text x="238" y="250" text-anchor="middle" fill="#fff">4</text>
        </g>
        <text x="190" y="308" text-anchor="middle" font-size="9" fill="var(--muted)">① 窦房结 ② 房室结 ③ 希氏束 ④ 左右束支 → 浦肯野</text>
      </g>
    </svg>`,
  },

  'mi-18lead': {
    caption: '18 导联 = 常规 12 导联 + V7–V9（后壁）+ V3R–V5R（右室）；后壁与右室梗死常与下壁梗死并存。',
    legend: [
      { label: '常规胸导联 V1–V6', color: 'var(--brand)' },
      { label: '后壁 V7–V9', color: 'var(--gold)' },
      { label: '右胸 V3R–V5R', color: 'var(--accent)' },
      { label: '后壁镜像（V1–V3）', color: 'var(--ink)' },
    ],
    svg: `<svg viewBox="0 0 720 320" role="img" aria-label="18 导联电极位置示意：前胸、右胸与背部">
      <g font-family="ui-monospace, monospace">
        <rect x="20" y="26" width="300" height="270" rx="26" fill="var(--surface-2)" stroke="var(--line-strong)"/>
        <text x="170" y="48" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">前胸</text>
        <text x="170" y="286" text-anchor="middle" font-size="9" fill="var(--muted)">胸骨左缘 → 左腋前线</text>
        <line x1="170" y1="62" x2="170" y2="262" stroke="var(--line-strong)" stroke-dasharray="4 4" opacity=".5"/>
        <g fill="var(--brand)">
          <circle cx="158" cy="90" r="7"/><text x="158" y="94" text-anchor="middle" font-size="8" fill="#fff">V1</text>
          <circle cx="182" cy="90" r="7"/><text x="182" y="94" text-anchor="middle" font-size="8" fill="#fff">V2</text>
          <circle cx="206" cy="112" r="7"/><text x="206" y="116" text-anchor="middle" font-size="8" fill="#fff">V3</text>
          <circle cx="228" cy="138" r="7"/><text x="228" y="142" text-anchor="middle" font-size="8" fill="#fff">V4</text>
          <circle cx="246" cy="168" r="7"/><text x="246" y="172" text-anchor="middle" font-size="8" fill="#fff">V5</text>
          <circle cx="246" cy="196" r="7"/><text x="246" y="200" text-anchor="middle" font-size="8" fill="#fff">V6</text>
        </g>
        <g fill="var(--surface)" stroke="var(--accent)" stroke-width="2">
          <circle cx="132" cy="112" r="7"/><text x="132" y="116" text-anchor="middle" font-size="7" fill="var(--accent)">R</text>
          <circle cx="114" cy="138" r="7"/><text x="114" y="142" text-anchor="middle" font-size="7" fill="var(--accent)">R</text>
          <circle cx="96" cy="168" r="7"/><text x="96" y="172" text-anchor="middle" font-size="7" fill="var(--accent)">R</text>
        </g>
        <text x="70" y="196" font-size="8" fill="var(--accent)">V3R–V5R</text>
        <rect x="380" y="26" width="300" height="270" rx="26" fill="var(--surface-2)" stroke="var(--line-strong)"/>
        <text x="530" y="48" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">背部</text>
        <text x="530" y="286" text-anchor="middle" font-size="9" fill="var(--muted)">左腋后线 → 左脊柱旁线</text>
        <line x1="530" y1="62" x2="530" y2="262" stroke="var(--line-strong)" stroke-dasharray="4 4" opacity=".5"/>
        <g fill="var(--gold)">
          <circle cx="560" cy="120" r="8"/><text x="560" y="124" text-anchor="middle" font-size="8" fill="#fff">V7</text>
          <circle cx="590" cy="140" r="8"/><text x="590" y="144" text-anchor="middle" font-size="8" fill="#fff">V8</text>
          <circle cx="616" cy="160" r="8"/><text x="616" y="164" text-anchor="middle" font-size="8" fill="#fff">V9</text>
        </g>
        <text x="470" y="200" font-size="9" fill="var(--muted)">后壁导联：V7–V9</text>
        <text x="470" y="216" font-size="9" fill="var(--muted)">右室导联：V3R–V5R（V4R 最常用）</text>
        <text x="470" y="232" font-size="9" fill="var(--muted)">均与 V4–V6 同一水平</text>
      </g>
    </svg>`,
  },

  'blocked-pac': {
    caption: '窦性 P-QRS-T 之后提前出现异位 P 波，其后没有 QRS，形成长间歇；提前 P 常落在前一个 T 波上。',
    legend: [
      { label: '窦性 P 波', color: 'var(--brand)' },
      { label: '异位提前 P 波', color: 'var(--accent)' },
      { label: 'QRS', color: 'var(--ink)' },
      { label: '未下传 / 长间歇', color: 'var(--muted)' },
    ],
    svg: `<svg viewBox="0 0 720 220" role="img" aria-label="未下传房性早搏时间轴">
      <g font-family="ui-monospace, monospace">
        <line x1="30" y1="150" x2="690" y2="150" stroke="var(--line-strong)"/>
        <g stroke="var(--brand)" stroke-width="2.4" fill="none">
          <path d="M60 150 q8 -22 16 0"/>
          <path d="M130 150 q8 -22 16 0"/>
          <path d="M250 150 q8 -22 16 0"/>
          <path d="M520 150 q8 -22 16 0"/>
          <path d="M620 150 q8 -22 16 0"/>
        </g>
        <g stroke="var(--ink)" stroke-width="2.4" fill="none">
          <path d="M92 150 l6 -6 l8 34 l8 -48 l8 20 l6 0"/>
          <path d="M162 150 l6 -6 l8 34 l8 -48 l8 20 l6 0"/>
          <path d="M282 150 l6 -6 l8 34 l8 -48 l8 20 l6 0"/>
          <path d="M552 150 l6 -6 l8 34 l8 -48 l8 20 l6 0"/>
          <path d="M652 150 l6 -6 l8 34 l8 -48 l8 20 l6 0"/>
        </g>
        <g fill="var(--muted)" font-size="9">
          <text x="60" y="118">P</text><text x="96" y="104">QRS</text>
          <text x="250" y="118">P</text><text x="286" y="104">QRS</text>
          <text x="520" y="118">P</text><text x="556" y="104">QRS</text>
        </g>
        <path d="M360 150 q10 -26 20 0" fill="none" stroke="var(--accent)" stroke-width="2.6"/>
        <text x="352" y="112" fill="var(--accent)" font-size="10" font-weight="700">提前异位 P</text>
        <line x1="368" y1="120" x2="368" y2="204" stroke="var(--accent)" stroke-dasharray="4 4"/>
        <text x="376" y="200" fill="var(--muted)" font-size="9">无 QRS 下传</text>
        <line x1="380" y1="190" x2="500" y2="190" stroke="var(--muted)" stroke-dasharray="2 4"/>
        <text x="406" y="184" fill="var(--muted)" font-size="9">长间歇 / 不完全代偿</text>
        <text x="30" y="28" fill="var(--muted)" font-size="9">发现未下传房早：先找提前且形态不同的 P 波，再看其后是否缺少 QRS</text>
      </g>
    </svg>`,
  },

  'mi-stages': {
    caption: '心梗心电图演变：超急性高尖 T → 急性 ST 抬高伴 Q 波 → 亚急性 T 波倒置 → 陈旧期遗留 Q 波。',
    legend: [
      { label: 'ST 段', color: 'var(--brand)' },
      { label: 'T 波', color: 'var(--accent)' },
      { label: '病理性 Q 波', color: 'var(--ink)' },
    ],
    svg: `<svg viewBox="0 0 720 300" role="img" aria-label="心肌梗死四个阶段的心电图演变">
      <g font-family="ui-monospace, monospace">
        <g>
          <rect x="16" y="40" width="160" height="200" rx="14" fill="var(--surface-2)" stroke="var(--line-strong)"/>
          <text x="96" y="62" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">超急性期</text>
          <text x="96" y="78" text-anchor="middle" font-size="9" fill="var(--muted)">数分钟–数小时</text>
          <line x1="28" y1="150" x2="164" y2="150" stroke="var(--line-strong)"/>
          <path d="M34 150 l8 -4 l10 20 l10 -34 l8 14 l6 0" fill="none" stroke="var(--ink)" stroke-width="2"/>
          <path d="M96 150 q10 -22 20 0" fill="none" stroke="var(--accent)" stroke-width="3"/>
          <text x="96" y="222" text-anchor="middle" font-size="9" fill="var(--accent)">T 高尖宽大</text>
        </g>
        <g>
          <rect x="188" y="40" width="160" height="200" rx="14" fill="var(--surface-2)" stroke="var(--line-strong)"/>
          <text x="268" y="62" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">急性期</text>
          <text x="268" y="78" text-anchor="middle" font-size="9" fill="var(--muted)">数小时–数天</text>
          <line x1="200" y1="160" x2="336" y2="160" stroke="var(--line-strong)"/>
          <path d="M206 160 l10 -2 l9 22 l10 -40 l8 20 l6 0" fill="none" stroke="var(--ink)" stroke-width="2"/>
          <path d="M249 160 l0 -18" stroke="var(--brand)" stroke-width="2.4"/>
          <path d="M249 142 q18 -14 40 -2" fill="none" stroke="var(--brand)" stroke-width="3"/>
          <text x="268" y="222" text-anchor="middle" font-size="9" fill="var(--brand)">ST 抬高 + Q 形成</text>
        </g>
        <g>
          <rect x="360" y="40" width="160" height="200" rx="14" fill="var(--surface-2)" stroke="var(--line-strong)"/>
          <text x="440" y="62" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">亚急性期</text>
          <text x="440" y="78" text-anchor="middle" font-size="9" fill="var(--muted)">数天–数周</text>
          <line x1="372" y1="150" x2="508" y2="150" stroke="var(--line-strong)"/>
          <path d="M378 150 l10 0 l10 24 l10 -40 l8 16 l6 0" fill="none" stroke="var(--ink)" stroke-width="2"/>
          <path d="M422 150 q16 22 40 0" fill="none" stroke="var(--accent)" stroke-width="3"/>
          <text x="440" y="222" text-anchor="middle" font-size="9" fill="var(--accent)">T 深倒置，ST 回落</text>
        </g>
        <g>
          <rect x="532" y="40" width="172" height="200" rx="14" fill="var(--surface-2)" stroke="var(--line-strong)"/>
          <text x="618" y="62" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">陈旧期</text>
          <text x="618" y="78" text-anchor="middle" font-size="9" fill="var(--muted)">数周–数月后</text>
          <line x1="544" y1="150" x2="692" y2="150" stroke="var(--line-strong)"/>
          <path d="M550 150 l12 0 l12 22 l12 -34 l10 12 l6 0" fill="none" stroke="var(--ink)" stroke-width="2"/>
          <path d="M596 150 q12 10 28 0" fill="none" stroke="var(--muted)" stroke-width="2"/>
          <text x="618" y="222" text-anchor="middle" font-size="9" fill="var(--muted)">遗留 Q/QS，ST 正常</text>
        </g>
        <text x="360" y="24" text-anchor="middle" font-size="10" fill="var(--muted)">同一导联随时间的典型演变（教学示意）</text>
      </g>
    </svg>`,
  },

  'bundle-block-patterns': {
    caption: 'RBBB：V1 rsR′、V6 宽钝 S；LBBB：V1 QS/rS、V6 宽 R 无 q；两者 QRS 均 ≥120 ms。',
    legend: [
      { label: 'RBBB', color: 'var(--brand)' },
      { label: 'LBBB', color: 'var(--accent)' },
      { label: '正常 QRS', color: 'var(--muted)' },
    ],
    svg: `<svg viewBox="0 0 720 320" role="img" aria-label="右束支与左束支阻滞的 V1 与 V6 形态对比">
      <g font-family="ui-monospace, monospace">
        <rect x="16" y="16" width="688" height="132" rx="14" fill="var(--surface-2)" stroke="var(--line-strong)"/>
        <text x="36" y="42" font-size="12" font-weight="700" fill="var(--brand)">完全性右束支阻滞 RBBB</text>
        <line x1="36" y1="100" x2="330" y2="100" stroke="var(--line-strong)"/>
        <path d="M46 100 l8 -4 l6 8 l10 26 l8 -42 l10 16 l8 -12 l6 8" fill="none" stroke="var(--brand)" stroke-width="2.4"/>
        <text x="180" y="84" font-size="10" fill="var(--muted)">V1：rsR′（兔耳征）</text>
        <line x1="380" y1="100" x2="674" y2="100" stroke="var(--line-strong)"/>
        <path d="M390 100 l8 -3 l8 20 l10 -36 l8 14 l12 0 l10 10" fill="none" stroke="var(--brand)" stroke-width="2.4"/>
        <text x="540" y="84" font-size="10" fill="var(--muted)">V6：宽钝 S 波</text>
        <rect x="16" y="164" width="688" height="132" rx="14" fill="var(--surface-2)" stroke="var(--line-strong)"/>
        <text x="36" y="190" font-size="12" font-weight="700" fill="var(--accent)">完全性左束支阻滞 LBBB</text>
        <line x1="36" y1="248" x2="330" y2="248" stroke="var(--line-strong)"/>
        <path d="M46 248 l10 0 l12 22 l14 -34 l12 12 l10 0" fill="none" stroke="var(--accent)" stroke-width="2.4"/>
        <text x="180" y="232" font-size="10" fill="var(--muted)">V1：QS 或 rS（深负向）</text>
        <line x1="380" y1="248" x2="674" y2="248" stroke="var(--line-strong)"/>
        <path d="M390 248 l10 0 l12 -6 l10 26 l14 -44 l12 24 l10 0" fill="none" stroke="var(--accent)" stroke-width="2.4"/>
        <text x="540" y="232" font-size="10" fill="var(--muted)">V6：宽 R，无 q 波</text>
        <text x="360" y="312" text-anchor="middle" font-size="9" fill="var(--muted)">QRS ≥120 ms；T 波方向常与 QRS 终末向量相反</text>
      </g>
    </svg>`,
  },

  'hexaxial-projection': {
    caption: '六轴系统：同一个向量在 II 与 aVF 上的投影为正、在 aVL 上较小，投影大小取决于夹角余弦。',
    legend: [
      { label: '当前向量', color: 'var(--brand)' },
      { label: '导联轴', color: 'var(--muted)' },
      { label: '投影', color: 'var(--accent)' },
    ],
    svg: `<svg viewBox="0 0 480 380" role="img" aria-label="额面六轴系统与向量投影示意">
      <g font-family="ui-monospace, monospace">
        <circle cx="240" cy="185" r="130" fill="none" stroke="var(--line-strong)" stroke-dasharray="3 5" opacity=".6"/>
        <line x1="240" y1="185" x2="370" y2="185" stroke="var(--muted)" stroke-width="1.2"/>
        <text x="378" y="189" font-size="11" font-weight="700" fill="var(--muted)">I 0°</text>
        <line x1="240" y1="185" x2="305" y2="298" stroke="var(--muted)" stroke-width="1.2"/>
        <text x="312" y="308" font-size="11" font-weight="700" fill="var(--muted)">II 60°</text>
        <line x1="240" y1="185" x2="175" y2="298" stroke="var(--muted)" stroke-width="1.2"/>
        <text x="130" y="308" font-size="11" font-weight="700" fill="var(--muted)">III 120°</text>
        <line x1="240" y1="185" x2="127" y2="120" stroke="var(--muted)" stroke-width="1.2"/>
        <text x="46" y="114" font-size="11" font-weight="700" fill="var(--muted)">aVR −150°</text>
        <line x1="240" y1="185" x2="353" y2="120" stroke="var(--muted)" stroke-width="1.2"/>
        <text x="360" y="114" font-size="11" font-weight="700" fill="var(--muted)">aVL −30°</text>
        <line x1="240" y1="185" x2="240" y2="315" stroke="var(--muted)" stroke-width="1.2"/>
        <text x="246" y="330" font-size="11" font-weight="700" fill="var(--muted)">aVF 90°</text>
        <line x1="240" y1="185" x2="346" y2="291" stroke="var(--brand)" stroke-width="2.6"/>
        <polygon points="346,291 332,288 338,280" fill="var(--brand)"/>
        <text x="330" y="312" font-size="10" font-weight="700" fill="var(--brand)">向量 45°</text>
        <line x1="346" y1="291" x2="312" y2="310" stroke="var(--accent)" stroke-dasharray="3 4" stroke-width="1.2"/>
        <circle cx="312" cy="310" r="3.4" fill="var(--accent)"/>
        <text x="262" y="324" font-size="10" fill="var(--accent)">II +0.97</text>
        <line x1="346" y1="291" x2="240" y2="291" stroke="var(--accent)" stroke-dasharray="3 4" stroke-width="1.2"/>
        <circle cx="240" cy="291" r="3.4" fill="var(--accent)"/>
        <text x="150" y="286" font-size="10" fill="var(--accent)">aVF +0.71</text>
        <line x1="346" y1="291" x2="274" y2="166" stroke="var(--gold)" stroke-dasharray="3 4" stroke-width="1.1" opacity=".85"/>
        <circle cx="274" cy="166" r="3" fill="var(--gold)"/>
        <text x="282" y="160" font-size="10" fill="var(--gold)">aVL +0.26</text>
        <text x="240" y="368" text-anchor="middle" font-size="9" fill="var(--muted)">投影 = |V| × cos(向量与导联轴的夹角)</text>
      </g>
    </svg>`,
  },
};
