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
