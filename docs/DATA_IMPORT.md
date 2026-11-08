# 真实设备波形导入（脱敏 MVP）

> 现状：支持 CSV 单导联导入；SCP-ECG/DICOM/WFDB 为后续适配器。导入数据默认 `unreviewed`，不会自动进入课程、题库或急救。

## 命令

```bash
php scripts/import_ecg_csv.php input.csv --lead=II --rate=500 --out=data/imports/case-001.json
```

CSV 要求：

- 表头至少包含时间列（`time`/`t`/`sec`/`seconds`/`timestamp`）与电压列（导联名/`mv`/`value`/`amplitude`）。
- 时间严格递增；单段 ≤120 秒；电压 |mV| ≤20；至少 10 个有效点。
- 若时间列为毫秒（跨度 >1000 且步长 ≥1），自动改为秒。
- 采样率默认 500 Hz，范围 100–2000 Hz；用线性插值重采样。

输出：

```json
{
  "schemaVersion": 1,
  "kind": "ecg-waveform-import",
  "anonymized": true,
  "lead": "II",
  "sampleRate": 500,
  "duration": 1.998,
  "units": "mV",
  "samples": [0.0, 0.1, "…"],
  "source": { "format": "csv", "file": "input.csv", "sha256": "…", "importedAt": "…" },
  "review": { "status": "unreviewed", "note": "…" }
}
```

## 去标识边界

- 只保留时间、电压、采样率、导联、来源文件名与哈希；**不保留**姓名、住院号、检查号、设备序列号、自由文本病史。
- 导入前请在本地完成脱敏；不要上传原始医院文件到公开仓库。
- 真实患者数据的使用需符合机构伦理/数据治理要求；本项目不提供法律或伦理审批。

## 质量核对

1. 导联标签与电极位置是否正确。
2. 定标（1 mV=10 mm）与纸速/采样率是否一致。
3. 波形是否有基线漂移、削顶、导联脱落或重复段。
4. 是否有可识别的患者信息（即使已删除列，波形本身也可能含起搏器序列号等）。
5. 审阅后把 `review.status` 改为 `clinical_reviewed` 或标注 `draft`，并记录审阅者/日期。

## 后续适配器

- WFDB（PhysioNet）：`.hea` + `.dat`，适合 PTB-XL 等公开数据集。
- SCP-ECG：ISO 11073-91064，二进制、信息完整但实现复杂。
- DICOM Waveform：进入 PACS 场景。
- HL7 aECG：XML，适合与医院系统交换。

适配器应作为独立 CLI/服务运行，不把二进制解析放进 Web 请求路径；导入后仍走同一套质量检查与审阅流程。
