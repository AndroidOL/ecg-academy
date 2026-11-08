# 内容审阅台账

> 目标不是“看起来权威”，而是让每一条教学主张都能追溯：谁整理、何时核对、依据什么、是否经过临床同行审阅。

## 当前状态

- 全部 230 章默认标注：**编辑核对 · 待临床同行审阅**。
- 审阅元数据位于 `data/review.php`，按“默认 → 章节 → 单篇覆盖”三级合并。
- 字段：`status`、`statusLabel`、`reviewers`、`clinicalReviewers`、`lastChecked`、`sources`。
- 文章页展示审阅状态、最后核对日期、整理者与参考来源；页脚链接“关于 / 勘误”。
- 版本化勘误见 `data/corrections.php`、`public/static/js/data/corrections.js` 与 `#/about`。

## 状态定义

| status | 含义 | 前台展示 |
|---|---|---|
| `editorial` | 已完成术语、单位、结构和来源编辑核对；未完成临床同行审阅 | 编辑核对 · 待临床同行审阅 |
| `clinical_reviewed` | 至少一位相关专科顾问核对机制、标准、剂量/能量与边界；记录姓名与日期 | 临床同行审阅 · 已记录顾问 |
| `deprecated` | 内容被新版本替代或发现重大问题，保留历史 | 已弃用 / 待替换 |

> 当前没有 `clinical_reviewed` 章节。不得把编辑核对写成“临床审阅通过”。

## 审阅流程

1. **编辑提交**：新增/修改内容时同时更新 `data/review.php` 的 `lastChecked` 与 `sources`；补充 `#/about` 勘误条目。
2. **自动校验**：`php scripts/validate_content.php`、`php scripts/validate_curriculum.php`；检查 ID、引用、字段和章节归属。
3. **医学审阅**：顾问逐条核对诊断标准、危险信号、处理原则、剂量/能量与适用场景；在 `clinicalReviewers` 记录姓名/机构/日期。
4. **发布**：更新 `CHANGELOG.md` 与勘误页；部署后清 PHP opcache。
5. **复审**：指南更新、发现错误或满 12 个月时重新核对。

## 参考来源选取

- 优先：现行指南、共识、系统综述、原始研究。
- 其次：权威教材与教学机构资料；需注明“教学整理”。
- 不使用无法追溯的二手问答、营销页或未署名总结作为唯一依据。
- 具体药物剂量、电击能量与操作阈值必须写明适用场景；网站不提供个体化诊疗指令。

## 审阅者招募

见 [`MEDICAL_ADVISORS.md`](MEDICAL_ADVISORS.md)。欢迎心内科、急诊科、儿科、重症医学与心电图技术人员参与；审阅者可要求匿名或只公开姓名缩写。
