# 心电图时间轴与绘制模型

> 目的：把“规格数据 → 波形采样 → Canvas 像素”的换算关系固定下来。任何改动 QRS/PR/QT 的代码，必须同时通过本页列出的测试，不能只凭肉眼看图调参。

## 1. 单一时间与电压基准

| 项 | 值 | 代码位置 |
|---|---|---|
| 采样率 | 500 Hz（2 ms/点） | `ECG_TIMING.sampleRate`、`finish()` |
| 纸速 | 25 mm/s | `ECG_TIMING.paperSpeedMmPerSecond` |
| 增益 | 10 mm/mV | `ECG_TIMING.gainMmPerMv` |
| 小格 | 0.04 s / 1 mm | `ECG_TIMING.smallBoxSeconds` |
| 大格 | 0.20 s / 5 mm | `ECG_TIMING.largeBoxSeconds` |
| 像素换算 | `pxPerSec = plotW / duration`；`pxPerMm = pxPerSec / 25` | `ecg-renderer.js` 各绘制函数 |
| 幅度换算 | `10 * pxPerMm` 像素/mV | 波形、网格、hover 共用 |

12 导联节律条、单导联节律条、网格和 QRS 标注必须使用同一个 `pxPerMm`。12 导联网格与波形不一致会直接造成“看起来宽/窄”的错误。

## 2. 规格字段与临床间期

数据规格（`data/diagnoses/*.php`、`data/combos.php`）里的 `pr`、`qrs`、`qt` 是**临床目标值**：

- **PR**：P 波起点 → QRS 起点。
- **QRS**：第一个偏转 → 回到基线；宽度由 `spec.qrs` 或搏动的 `qrsWidth` 给出。
- **QT**：QRS 起点 → T 波终点。

引擎在生成波形前先计算每个搏动的 QRS 几何窗口：

1. `qrsComponentGeometry()` 按形态给出未缩放的分量起止。
2. `qrsTiming()` 把该窗口线性缩放到目标 `qrs`，返回 `k`、`onset`、`end`。
3. `finalizeSchedule()` 对 12 个导联分别计算 `qrsOnsets[lead]`、`qrsEnds[lead]`，并记录：
   - `beat.qrsOnset`：所有导联合并后的最早起点（用于 PR/QT 的临床起点）；
   - `beat.qrsEnd`：所有导联合并后的最晚终点；
   - `beat.pOnset`：P 波起点。
4. QRS 生成、ST 段、QRS 高亮带、QRS 括线全部使用上述窗口，不再使用固定的 0.018/0.022 秒偏移直接画图。

PR 与 QT 的计算：

```text
P onset      = QRS onset − PR
P center     = P onset + 0.0575 s        // 2.5 × P sigma(0.023)
T end        = QRS onset + QT
T center     = T end − 2.5 × T sigma
T sigma      = 0.14 × max(0.12, QT − QRS) × (形态 T sigma / 0.052)
```

`T sigma` 随可用复极时间缩短而变小，保证心率快时 T 波不会压到 QRS 上，同时 QT 仍等于“QRS 起点 → T 终点”。

## 3. QRS 形态

| 形态 | 生成方式 | 目标 |
|---|---|---|
| 正常/窄 QRS | q + R + S 三个高斯，整体缩放到目标宽度 | 默认 80 ms，实测核心约 55–80 ms |
| RBBB | V1 r-S-R′，侧壁宽 S；整体缩放到目标宽度 | 130 ms 左右 |
| LBBB | 侧壁两峰宽钝/切迹 R（`rBroad`），V1 深 QS；窗口固定为目标宽度 | 140 ms 左右 |
| 宽 QRS / VT / PVC | 宽 R/S 分量，整体缩放到目标宽度 | 150–200 ms |
| 高钾 | q/R/S 缩放 + 增宽系数，目标 `qrs` | 120 ms 左右 |

`qrsWiden`/`qrsScale` 只影响形态比例，最终时间窗口由 `qrsTiming()` 的目标宽度约束；不要再通过单独调大 `qrsWiden` 去“看起来更宽”。

## 4. 测试与验收

```bash
npm run test:engine   # 22 项：正常/宽 QRS、RBBB、LBBB、VT/PVC、节律与 PR 耦合
npm run test:qrs      # 全量：55 个非特殊节律规格的 QRS 窗口、PR、NaN
php scripts/validate_content.php
```

`tests/qrs-width.test.mjs` 的判定：

- 每个非 VF/室扑/尖端扭转/停搏规格都能生成波形且无 NaN；
- 窄 QRS 规格的合并窗口 ≤ 130 ms（允许不同导联起点/终点差异）；
- 宽 QRS 规格（`qrs≥0.12`、LBBB/RBBB/wide、VT、PVC）合并窗口 ≥ 110 ms；
- 有 P 的搏动，临床 PR（P 起点 → QRS 起点）与 `beat.pr` 误差 ≤ 15 ms；
- 新增诊断/组合病例必须自动进入该测试，不允许只改数据不跑测试。

## 5. 电脑判读测量卡

十步自检全部作答后（内部回退的五步模式则在五步完成后），前端从当前 `ECGSession` 自动计算并展示：心率、RR、PP、PR、QRS、QT/QTc、额面电轴、V1 R/V5 S。

- RR/PP/PR/QRS 使用 `schedule.beats` 的 R 峰、P 起点、QRS 起点/终点，不使用固定阈值从图像上“猜”。
- QT 使用校准后的标称 QT；QTc 采用 Bazett。
- V1 R/V5 S 在局部基线（QRS 前 55–70 ms 的中位数）校正后取极值，避免基线漂移把振幅整体抬高/压低。
- 测量卡同时展示基线漂移与伪差示意：慢波漂移会改变 ST/振幅，肌电/交流电伪差会制造假性宽 QRS 或心律不齐；自动测量必须先确认波形质量。

## 6. 已知边界

- 波形是教学合成图，不是诊断级心电图；临床同行审阅仍为 0。
- `beat.qrsOnset` 是 12 导联最早起点，用于 PR/QT；QRS 高亮带使用当前显示导联的 `qrsOnsets[lead]`/`qrsEnds[lead]`。
- 高斯波形在 10% 峰值处测得的核心宽度可能略小于几何窗口；以几何窗口/标注为准，不以单点阈值目测为准。
- 若未来改为真实滤波/非线性去极波形，必须重新校准 `qrsTiming`、`T sigma` 和全部测试，不能沿用当前系数。
