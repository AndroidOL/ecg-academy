# 可插拔课程包规范（草案 v1）

> 目标：让不同医学院/教学团队贡献课程包，而不破坏主课程、ID 与医学审阅边界。当前提供 JSON 校验器，尚未开放线上一键安装。

## 文件结构

```json
{
  "id": "demo-cardiology",
  "name": "示例课程包",
  "version": "1.0.0",
  "license": "CC BY-SA 4.0",
  "description": "一句话说明",
  "authors": ["姓名/团队"],
  "sources": ["指南/教材/论文"],
  "chapters": [
    { "id": "basics", "name": "基础", "order": 1 }
  ],
  "articles": [
    {
      "id": "normal-sinus",
      "chapter": "basics",
      "name": "正常窦性心律",
      "en": "Normal sinus rhythm",
      "difficulty": 1,
      "review": { "status": "editorial", "lastChecked": "2026-11-08" },
      "content": { "oneLiner": "…", "criteria": ["…"] }
    }
  ]
}
```

## 校验

```bash
php scripts/validate_course_pack.php path/to/pack.json
```

校验项：

- 必填字段：`id/name/version/license/authors/sources/chapters/articles`。
- `id`：2–64 位小写字母/数字/`._-`；`version`：语义化版本。
- 章节/文章 ID 唯一；文章必须引用已声明章节。
- 难度 1–3；审阅状态只能是 `editorial` / `clinical_reviewed` / `deprecated`。
- `sources` 与 `authors` 至少 1 条。
- 基础脚本注入检查（`<script>`、`onerror=`、`javascript:`）。

## 发布流程（规划）

1. 课程包作者提交 JSON + 许可证 + 来源。
2. 自动校验 + 人工内容/许可审阅。
3. 管理后台预览；通过后分配本地命名空间并发布。
4. 记录包版本、哈希、审阅状态；撤销时保留历史。
5. 课程包默认 `draft`，不自动进入题库或急救评分。

## ID 与冲突

- 推荐 `pack-id/article-id`；导入时生成本地映射，避免覆盖主课程。
- 同 ID 冲突时拒绝导入或生成别名，不静默覆盖。
- 课程包内引用（前置知识、鉴别）必须使用包内或显式外部 ID。

## 许可与医学责任

- 代码 MIT；课程内容必须允许再分发与改编，默认 CC BY-SA 4.0。
- 不含患者数据、盗版教材、未授权图片。
- 课程包作者与审阅者对医学表述负责；本站不因导入自动背书。
