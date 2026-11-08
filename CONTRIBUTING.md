# 贡献指南

感谢你帮助心迹 ECG Lab 变得更好。本站面向医学生与急救培训者，内容准确性优先于数量。

## 可以贡献什么

- 心电图诊断标准、机制、鉴别与处理内容的修订（请附指南/教材依据）。
- ECG 引擎的形态、间期、节律模式与 12 导联表现改进。
- 移动端、无障碍、性能与可测试性改进。
- 新诊断、新 ACLS 场景、新题目变体。
- 翻译、错别字与文档改进。

## 相关协议与流程

- [贡献者协议（简版）](docs/CONTRIBUTOR_AGREEMENT.md)
- [内容审阅台账](docs/REVIEW.md)
- [勘误流程](docs/CORRECTIONS.md)
- [医学顾问招募](docs/MEDICAL_ADVISORS.md)
- [无障碍目标](docs/A11Y.md) / [i18n](docs/I18N.md)

## 医学内容规范

1. 不提交真实患者数据、可识别信息或 PHI。
2. 药物剂量、电复律/除颤能量必须注明适用场景与来源；不要把教学模拟写成个体化医嘱。
3. 诊断标准要区分“典型/常见”与“确诊金标准”；对争议内容使用限定词。
4. 新增/修改诊断必须同时提供结构化 ECG 规格、至少一条鉴别诊断与一个危险信号。
5. 涉及急救流程的改动，请在 PR 描述中列出参考指南版本。

## 数据与本地配置

```bash
cp app/config.local.example.php app/config.local.php
# 填入本地数据库和（可选）AI 配置；该文件不会进入 git
php scripts/migrate.php
php scripts/validate_content.php
```

严禁提交：

- `app/config.local.php`
- `docs/*.local.md`
- `.ssh/`
- 任何 `.env`、密钥、真实数据库密码、API Key
- `storage/` 下的会话/日志/备份

## 代码规范

- PHP 8.2+，PSR-12 风格，预处理 SQL，输出 JSON 前不拼 HTML。
- 前端零构建原生 ES Modules；不要引入运行时 CDN 或外部字体。
- 新增交互必须同时考虑键盘、触控与 `prefers-reduced-motion`。
- 修改静态资源后更新 `app/config.php` 的 `asset_version`，并同步 `public/sw.js` 的 `CACHE_VERSION`。
- ECG 引擎改动必须补充 `tests/engine.test.mjs` 或 `tests/playback.test.mjs`。

## 提交前检查

```bash
php -l <changed.php>
node tests/engine.test.mjs
node tests/playback.test.mjs
php tests/sim.test.php
node tests/ui-smoke.mjs
php scripts/validate_curriculum.php
php scripts/validate_bank.php
```

`tests/ui-smoke.mjs` 需要本地 PHP 开发服务器与 MySQL；如你的环境没有 Node/Chrome，请在 PR 描述中说明未执行的测试及原因。

## PR

- 一个 PR 聚焦一个主题；说明动机、改动、测试与医学依据。
- 不强制要求完美的设计，但必须诚实标注未验证的部分。
- 维护者可能要求医学审校后再合并。
