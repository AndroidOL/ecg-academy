# 勘误与版本化修订

## 原则

- 发现错误优先修正，不删除历史。
- 每个修订记录版本、日期、影响范围、依据与修改内容。
- 医学内容修订需同时更新 `data/review.php` 的 `lastChecked` / `sources`，并运行内容校验。
- 公开勘误页：`/#/about`；数据源：`data/corrections.php` → `public/static/js/data/corrections.js`。

## 提交方式

1. GitHub Issue 使用标题：`[Correction] 章节/主题：一句话问题`。
2. 提供：页面链接、错误原文、正确表述、依据（指南/论文/教材页码）、是否为患者安全问题。
3. 不要在 Issue 中提交真实患者信息、数据库凭据或 API Key。
4. 维护者确认后提交修订与测试；涉及临床安全的问题优先处理。

## 修订模板

```text
版本：1.2.x
日期：YYYY-MM-DD
影响：章节/诊断 ID
问题：原表述与为什么错误
修订：新表述与依据
测试：validate_content / validate_curriculum / 浏览器回归
审阅：编辑/临床审阅者与日期
```

## 分级

| 级别 | 示例 | 处理 |
|---|---|---|
| P0 安全 | 错误剂量/能量、危险信号遗漏、可能造成伤害 | 立即下线或加显著警告，24 小时内修订 |
| P1 诊断 | 标准、鉴别、机制错误 | 优先修订并记录 |
| P2 编辑 | 术语、排版、链接、示例不清晰 | 正常迭代 |

## 当前记录

`data/corrections.php` 保存最近版本记录；完整历史见 git log 与 `CHANGELOG.md`。
