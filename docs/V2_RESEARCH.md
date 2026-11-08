# v2.0 路线图研究与可行性

> 目标：把心迹从“单站课程 + 练习”推进为可连接多中心课程包、真实设备波形与社区翻译的学习基础设施，同时保持低成本、可审计、无 PHI 的边界。

## 1. 研究范围与方法

- 竞品/学习科学：间隔重复、混合学习、ECG 判读训练软件。
- 数据互操作：SCP-ECG、DICOM Waveform、HL7 aECG、FHIR ECG、WFDB/PTB-XL。
- 教学扩展：多中心课程包、真实设备导入、电生理标测/数字孪生、社区翻译、区域指南差异、CME。
- 约束：低成本 PHP/静态前端、低带宽、医学内容需审阅、不能引入患者隐私风险。

## 2. 外部证据与启发

### 2.1 学习科学

- 间隔重复对临床问题解决与长期保持有证据支持；ECG 判读尤其适合“少而频繁”的重复而非一次性长文（见 PMC11186069 及其引用的 ECG spacing 研究）。
- ECG 判读软件研究强调自定进度、重复练习、即时反馈与混合学习优于单纯讲授（PMC11562660）。
- 启发：本站已实现本地错题本、1→3→7→14 天间隔、自我评分与薄弱诊断组卷；下一步应记录“为什么错”（线索/步骤）而不是只记诊断 ID。

### 2.2 数据标准

- SCP-ECG 是短程诊断 ECG 的欧洲/ISO 标准，擅长完整检查信息，但二进制、实现复杂（PMC9565220）。
- DICOM Waveform 可进入 PACS/医院影像链路；HL7 aECG 为 XML；MFER 为日本医疗波形标准；FHIR ECG 仍在发展，不能假设所有设备原生支持。
- PTB-XL 是公开的大规模 12 导联数据集，使用 SCP-ECG 语句体系，适合研究与算法验证（Nature s41597-020-0495-6）。
- 启发：本站不直接解析二进制 SCP/DICOM；先做 CSV/JSON 的脱敏导入与课程包校验，再通过适配器接入 WFDB/SCP。

### 2.3 产品空白

- 现有资源多为“病例图库 + 文章”或“题库”，少有三者合一的：向量/电生理直觉、判读路径、服务端状态机急救、间隔复习。
- 真实设备数据与课程内容之间缺少“脱敏、标注、审阅、许可”流水线；这是本站 v2.0 的差异化机会。
- 多中心课程包需要版本、来源、许可证、审阅状态与冲突解决，不只是 JSON 导入。

## 3. v2.0 功能研究与可行性

| 路线图项 | 研究结论 | 本站可行 MVP | 风险/边界 |
|---|---|---|---|
| 多中心课程包/可插拔课程仓库 | 需要 schema、语义版本、来源/许可证、审阅状态、ID 命名空间与冲突策略 | 已提供 `scripts/validate_course_pack.php`、`docs/COURSE_PACK.md`；下一步管理后台导入与只读预览 | 课程包不能自动获得医学背书；跨中心 ID 冲突；内容许可兼容 |
| 真实设备/监护仪数据导入（脱敏）与研究模式 | SCP/DICOM 实现成本高；CSV 是低门槛入口 | 已提供 `scripts/import_ecg_csv.php`：CSV → 500 Hz 单导联脱敏 JSON，保留 SHA-256、审阅状态 | 不能保证导联/定标正确；不得上传 PHI；研究模式需伦理/数据使用审查 |
| 心电向量、电生理标测与数字孪生 | 向量环/投影适合教学；完整数字孪生需细胞/组织模型与个体化影像，成本高 | 已扩展胸廓横截面 QRS 向量、V1/V5/V6 投影；下一步加入激动顺序时间轴与可导出 SVG | 不能把示意模型当个体化预测；避免“AI 诊断”暗示 |
| 社区翻译、区域指南差异与 CME | 翻译需医学审阅；指南差异必须标注地区/版本；CME 需认证机构 | 已提供 62 词双语术语、英文导航外壳 beta、`docs/GUIDELINES.md` | 半翻译/直译风险；CME 学分不能自行授予 |
| 无障碍与低带宽 | 低资源配置下 PWA 缓存与 reduced-motion 有效 | 已提供 service worker、离线回退、低带宽模式、A11y 自检 | 离线内容可能过期；Canvas 可读性需文字摘要 |

## 4. 推荐的 v2.0 架构

### 4.1 课程包

```text
pack.json
  id, name, version, license, authors[], sources[]
  review: {status, reviewers[], lastChecked}
  chapters[{id,name,order}]
  articles[{id, chapter, name, en, difficulty, content, ecg?, review}]
  assets/ (可选，需内容哈希)
```

- ID 使用命名空间：`pack-id/article-id`，导入时映射到本地 ID，避免冲突。
- 包签名/哈希 + 许可证白名单；导入前必须通过 schema 与内容安全检查。
- 课程包默认 `draft`，不直接进入主课程；管理员预览、审阅后才发布。
- 冲突策略：同 ID 不覆盖，生成 `local` 别名；保留来源与版本。

### 4.2 波形导入适配器

```text
CSV/JSON → 归一化（时间、mV、导联、采样率）
        → 去标识（仅保留技术元数据）
        → 质量检查（时长、幅度、导联数、缺失）
        → 波形 JSON + SHA-256 + review=unreviewed
        → 人工标注/审阅 → 课程或研究数据集
```

后续适配器：WFDB（PhysioNet）、SCP-ECG、DICOM Waveform。二进制解析应放在独立 CLI/服务，不进入 Web 请求路径。

### 4.3 数字孪生/标测教学

- 先做“激活顺序 + 向量环 + 导联投影”的确定性教学模型，不做个体化预测。
- 可加入：室间隔→左室游离壁→基底部的时间轴；每步的瞬时向量、投影和对应导联波形。
- 与真实数据导入结合时，只显示“教学重建”，并标注模型假设。

### 4.4 翻译与指南差异

- 术语表为 canonical glossary；课程翻译以句子为单元，保留原文版本与译者/审阅者。
- 区域指南差异单独页面/字段，不在正文里混用；每个临床主张有地区与年份。
- CME：若未来对接认证机构，需要评估学习时长、测评完整性、身份与数据保留；当前不做学分承诺。

## 5. 已实现（本轮）

- 胸廓横截面 QRS 向量与 V1/V5/V6 投影解释。
- 10 个 ACLS 场景与场景专属可逆病因操作。
- 本地错题/收藏/间隔重复/薄弱组卷；只读分享链接。
- PWA 离线缓存、低带宽、双语术语表、英文界面外壳 beta、BYOK 演示。
- 课程包校验器、CSV 脱敏导入器、审阅台账、版本化勘误、贡献者/顾问/无障碍文档。

## 6. 下一步优先级

1. **P1**：把课程包导入接到管理后台（预览、审阅、发布），并实现 ID 命名空间与冲突提示。
2. **P1**：为导入波形增加标注器（P/QRS/T 时间点、导联、质量评分），审阅后才能进入课程。
3. **P2**：SCP-ECG/WFDB 只读适配器与 PTB-XL 教学样例（遵守数据集许可）。
4. **P2**：激活顺序时间轴与 SVG 导出；把向量模型与课程章节双向链接。
5. **P3**：全站英文化、区域指南差异页面、CME 需求评估与无障碍真实用户测试。

## 7. 参考

- Spaced repetition for clinical problem solving（PMC11186069）：<https://pmc.ncbi.nlm.nih.gov/articles/PMC11186069/>
- Designing and evaluating ECG interpretation software（PMC11562660）：<https://pmc.ncbi.nlm.nih.gov/articles/PMC11562660/>
- ECG standards and formats for interoperability（PMC9565220）：<https://pmc.ncbi.nlm.nih.gov/articles/PMC9565220/>
- PTB-XL, a large publicly available ECG dataset（Nature）：<https://www.nature.com/articles/s41597-020-0495-6>
- 2024 ESC AF guideline review（PMC11865665）：<https://pmc.ncbi.nlm.nih.gov/articles/PMC11865665/>
- Triple antithrombotic therapy in AF（PMC11875729）：<https://pmc.ncbi.nlm.nih.gov/articles/PMC11875729/>

> 以上为工程与研究摘要，不构成临床指南或伦理审批意见；真实数据使用需遵守所在机构与地区法规。
