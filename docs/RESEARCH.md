# 调研记录

调研时间：2026-11-07。目标：确定技术栈、信息架构、医学口径与视觉方向。

## 1. 运行环境

| 项 | 结果 | 决策 |
|---|---|---|
| Web 服务器 | nginx 1.30.6，已占用 80/443/888 | 新增独立 vhost，按公网 IP 精确匹配，避免影响现有域名 |
| 后端 | PHP 8.4.27 + PHP-FPM（`/tmp/php-cgi-84.sock`） | 采用 PHP，零额外运行时 |
| 数据库 | MySQL 8.4.13，仅回环 | 新建独立库 `ecg_academy` |
| 前端构建 | 无 Node 在 PATH，服务器内存紧张 | 零构建：原生 ES Modules + CSS，无 npm 依赖 |
| 浏览器 | Chrome 可用，但资源有限 | 仅在最终验收时逐个启动无头 Chrome，限制并发 |

## 2. 医学口径

- 成人高级生命支持（ACLS）以 AHA 2020/2025 指南及 2025 中国恶性心律失常急救共识为基线：
  - 高质量 CPR：100–120 次/分，深度 5–6 cm，完全回弹，中断 <10 s。
  - 可电击心律（VF/无脉性 VT）：立即除颤，双相 120–200 J（按厂商），单相 360 J；除颤后立即恢复按压，2 分钟再评估。
  - 肾上腺素 1 mg IV/IO，每 3–5 分钟；可电击心律通常在第二次除颤后给药，不可电击心律尽早给药。
  - 难治性 VF/pVT：胺碘酮 300 mg（必要时追加 150 mg）或利多卡因 1–1.5 mg/kg。
  - 有脉不稳定快速心律：同步电复律；房颤 120–200 J，房扑/SVT 50–100 J，单形性 VT 100 J；有意识者镇静。
  - 症状性心动过缓：阿托品 1 mg 每 3–5 分钟（最大 3 mg），无效则经皮起搏或肾上腺素 2–10 μg/min 泵入。
  - 心搏停止/PEA：CPR + 肾上腺素，禁止除颤，排查可逆病因（Hs & Ts）。
- 宽 QRS 心动过速鉴别采用 Brugada 四步法为主要教学框架：文献报告敏感性约 98.7%、特异性约 96.5%；其中“胸前导联均无 RS 型”特异性 100%、敏感性约 21%，需结合 RS 间期 >100 ms、房室分离与形态学标准综合判断。
- STEMI 标准采用第四版心肌梗死全球定义：相邻导联新发 ST 段抬高，除 V2–V3 外 ≥0.1 mV；V2–V3 按年龄/性别采用 ≥0.15–0.25 mV 阈值；同时强调 OMI（闭塞性心肌梗死）概念，STEMI 标准敏感性有限，需结合症状、动态变化与高敏肌钙蛋白。
- 电解质：高钾从 T 波高尖 → P 波变平/PR 延长 → QRS 增宽 → 正弦波 → 停搏；低钾表现为 ST 压低、T 波低平、U 波、QT(U) 延长。高钙缩短 QT/ST，低钙延长 ST/QT。
- 所有内容标注“教学用途，不替代临床判断”。

## 3. 竞品与交互模式（归纳）

- 传统心电图学习站以静态图片 + 长文为主，移动端阅读与检索差；本项目用 Canvas 生成可缩放、可标注、可播放的 ECG，并用同一引擎驱动练习与急救监护。
- 心电图判读练习普遍只做单选；本项目支持多诊断组合（如房颤 + 完全性右束支阻滞），并按“章节/难度”组卷。
- 急救培训多为视频；本项目做成服务端权威状态机的实时推演，操作时序、能量选择、同步/非同步会被评分与复盘。
- 电解质变化适合用连续滑杆而非静态图；作为独立实验室模块，强化“机制—形态—处理”的因果链。

## 4. 信息架构

```text
首页
├─ 学习（章节 → 诊断详情 → ECG 查看器/12 导联）
├─ 练习（配置 → 判读 → 解析 → 成绩）
├─ 急救（场景 → 实时监护 → 操作 → 复盘）
├─ 实验室（钾/钙滑杆 → 实时 ECG → 处理）
└─ 我的（进度、排行榜、账号、主题）
```

## 5. 视觉方向

- 医疗专业感 + 编辑设计感：暖白纸感浅色主题、深墨绿监护仪风格深色主题。
- 心电图红棕网格与青绿色描迹形成品牌记忆；大字号诊断名、等宽数字、克制的珊瑚色警示。
- 手机端像“口袋监护仪”，桌面端像“心电图谱 + 工作台”。

## 6. 参考资料

- American Heart Association. 2020/2025 Guidelines for CPR and ECC（成人高级心血管生命支持算法）。
- 中国成人恶性心律失常急救诊疗专家共识（2025 版）。
- Brugada P, et al. A new approach to the differential diagnosis of a regular tachycardia with a wide QRS complex. Circulation. 1991.
- Fourth Universal Definition of Myocardial Infarction (2018).
- 2022 ESC Guidelines for the management of patients with ventricular arrhythmias and the prevention of sudden cardiac death.
- 心电图诊断标准与间期测量参考：AHA/ACCF/HRS Recommendations for the Standardization and Interpretation of the Electrocardiogram.
