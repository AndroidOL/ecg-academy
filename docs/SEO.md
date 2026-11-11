# SEO 与搜索引擎收录

交互产品是 hash 路由 SPA（`/#/learn/...`），搜索引擎（尤其百度）不会把 hash 当成独立 URL。因此站点另有一套**真实路径、服务端直出 HTML** 的公开内容页，二者共用同一份课程数据。

## 可抓取 URL

| 路径 | 内容 |
| --- | --- |
| `/sitemap.xml` | 动态站点地图（课程、导论、术语、指南、急救场景等） |
| `/robots.txt` | 抓取规则 + Sitemap 地址 |
| `/learn` | 心电图诊断图谱（217 篇，支持 `?q=` 搜索） |
| `/learn/{id}` | 单篇课程（定义、机制、标准、判读、危险信号、处理、鉴别、指南） |
| `/intro` | 心电图导论（21 篇理论） |
| `/glossary` | 双语术语表（62 个术语） |
| `/guidelines` | 区域指南差异（AHA/ACC vs ESC/ERC） |
| `/read` | 五步判读法（HowTo 结构化数据） |
| `/practice` | 判读练习介绍 |
| `/sim`、`/sim/{id}` | ACLS 总览（含双人随机模式）与 12 个场景页 |
| `/vectors` | 心脏向量实验室介绍 |
| `/lab` | 电解质实验室介绍 |
| `/about` | 关于 / 勘误 / 版本化勘误记录 |

这些页面由 `app/Seo.php` 渲染，`public/index.php` 在 API 与静态文件之后分发。新增课程只需在 `data/diagnoses`、`data/topics` 或 `data/imports` 中加入数据，`/learn/{id}` 与 sitemap 会自动出现。

`/` 仍是交互 SPA；它的 `<noscript>` 中包含站点简介和章节链接，供不执行 JS 的抓取器读取。

## 已内置的 SEO 要素

- 每页独立 `title`、`description`、`keywords`、`canonical`、`robots`
- Open Graph / Twitter Card，以及 `static/img/og-cover.png`（1200×630）
- JSON-LD：`WebSite` + `SearchAction`、`Article` / `MedicalWebPage`、`BreadcrumbList`、`DefinedTermSet`、`HowTo`、`LearningResource`
- 真实路径之间的面包屑、相关课程、上一篇/下一篇、章节互链
- 站长验证 meta（百度 / Google / Bing），在 `app/config.php` 的 `app.seo.verification` 填写后自动输出
- Bing IndexNow：填写 `app.seo.indexnow_key` 后，`/{key}.txt` 会自动返回 key

## 上线后的提交步骤

1. 部署并确认线上可访问：
   ```bash
   bash scripts/deploy-production.sh
   nginx -t && nginx -s reload
   curl -I https://ecg.tianhao.me/sitemap.xml
   ```
2. **百度搜索资源平台**（`ziyuan.baidu.com`）：
   - 添加站点 `https://ecg.tianhao.me`，选择 HTML 标签验证，把 `content` 值填入 `app.seo.verification.baidu`；
   - 在「普通收录 / sitemap」提交 `https://ecg.tianhao.me/sitemap.xml`；
   - 在「普通收录 / 手动提交」提交首页与重点课程；
   - 如有备案号，在后台设置 `site.icp`，页脚会展示。
3. **Google Search Console**：添加域资源，验证后提交同一个 sitemap。
4. **Bing Webmaster Tools**：导入 GSC 或验证后提交 sitemap；如使用 IndexNow，填写 32 位 key。
5. 收录不是即时生效：百度通常需要数天到数周；新域名先有 1–2 条收录再逐步放量属于正常。

## 中国大陆服务器注意事项

站点部署在上海阿里云。百度对未备案域名的收录和访问可能受限；如果域名没有 ICP 备案，优先完成备案，否则收录速度会明显落后于已备案站点。DNS 只解析了 `ecg.tianhao.me`（没有 `www`），canonical 固定使用该主机名。

## 验收

```bash
php tests/seo.test.php
php -S 127.0.0.1:8899 -t public scripts/dev-router.php
curl -s http://127.0.0.1:8899/sitemap.xml | grep -c '<loc>'
```

当前 sitemap 共 261 条 URL：首页、10 个栏目页、12 个急救场景、238 篇课程。
