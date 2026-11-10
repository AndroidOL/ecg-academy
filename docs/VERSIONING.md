# 版本与发布策略

版本号采用 `MAJOR.MINOR.PATCH`，但按“发布批次”管理，不再为每个小修复递增 `3.0.x`。

## 规则

- **MAJOR**：破坏性变更，例如数据库/API 不兼容、项目架构重写。仅在确有迁移成本时升级，例如 `4.0.0`。
- **MINOR**：一批用户可见功能或内容体系升级，例如学习系统、AI 能力、指南体系。一次发布可以包含多个修复，按批次升级，例如 `3.1.0 → 3.2.0`。
- **PATCH**：只用于生产热修复、安全修复或单个阻断性缺陷，例如 `3.1.1`；不要用 PATCH 承载常规功能。
- **预发布**：必要时使用 `3.2.0-beta.1`，验证完成后再发布正式版本。
- **资源版本**：`asset_version`（`YYYYMMDD+字母`）独立于应用版本，每次静态资源发布都要递增，并同步 `public/sw.js` 的 `CACHE_VERSION`。
- **文档**：每个正式版本写一条 `docs/CHANGELOG.md`；同一批次内的小改动合并描述，不逐条制造补丁版本。
- **禁止**：不要因为单个 CSS/文案调整就发 `3.0.18`；也不要无规律跳到 `3.3 / 3.6 / 5.6`。

## 版本映射（计划）

| 版本 | 主题 |
|---|---|
| 3.1.x | AI 导师与错题学习体验；本轮 |
| 3.2.0 | 自适应复习、混淆项训练、学习报告与能力评估 |
| 3.3.0 | 急救/临床推理模拟、团队角色与复盘量表 |
| 3.4.0 | 指南版本治理、临床审阅工作流、区域指南差异 |
| 3.5.0 | 低端设备/离线/PWA、无障碍与多语言 |
| 4.0.0 | 机构版、LMS/CME 集成、公开 API 等破坏性平台升级 |

## 发布检查

```bash
php scripts/validate_content.php
php scripts/validate_curriculum.php
php scripts/validate_bank.php
php scripts/validate_section_bank.php
php scripts/audit_section_bank.php
for f in tests/*.test.php; do php -d zend.assertions=1 -d assert.exception=1 "$f"; done
node tests/engine.test.mjs && node tests/read.test.mjs && node tests/study.test.mjs && node tests/vector-loop.test.mjs
```

发布前同步 `app/config.php` 的 `version/asset_version`、所有静态模块的 `?v=`、`public/sw.js`，再执行 `scripts/deploy-production.sh`。
