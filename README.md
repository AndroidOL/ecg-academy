# 心迹 · ECG Lab

[![CI](https://github.com/AndroidOL/ecg-academy/actions/workflows/ci.yml/badge.svg)](https://github.com/AndroidOL/ecg-academy/actions/workflows/ci.yml)

> **读懂每一次心跳。** 面向医学生、住院医师与急救培训者的免费开源心电图学习站。

**在线访问：** 由实际部署环境提供（公开仓库不记录服务器地址）
**GitHub：** <https://github.com/AndroidOL/ecg-academy>
**项目目录：** `/www/wwwroot/ecg-academy`（独立新目录，未触碰任何既有生产站点）
**数据库：** MySQL 8.4 `ecg_academy`（连接信息见 [`docs/DATABASE.md`](docs/DATABASE.md)）

---

## 为什么做这个站

传统心电图学习往往停留在静态图片 + 长文：手机上看不清网格、不能逐搏测量、练习与学习割裂、急救流程只靠视频记忆。心迹把 **可交互波形、结构化课程、服务端判分和服务端 ACLS 状态机**放进同一个站点：

- **学习**：46 篇结构化课程，覆盖 40 种诊断 + 6 篇判读基本功/速查；每篇含机制、标准、判读步骤、危险信号、处理、易错点、鉴别与记忆锦囊。
- **可交互 ECG**：Canvas 生成 500 Hz 波形；支持节律条/12 导联、**循环覆盖**与**连续滚动**两种播放、12 导联录播放、标注开关、悬停测量、导联切换。移动端自适应网格疏密。
- **教科书模式**：在真实心电图上直接标注 P 波、PR、QRS、T 波、QT，并附正常值、机制说明与正常窦性心律对照图。
- **练习**：难度 1–3，支持章节筛选、单诊断与组合诊断多选；答案由服务端判定，记录 XP、正确率与错题解析。
- **急救推演**：6 个 ACLS 场景，服务端权威状态机；CPR、非同步除颤、同步电复律、肾上腺素/胺碘酮/阿托品、经皮起搏、高钾处理；按时间线与操作质量评分复盘。
- **电解质实验室**：拖动 K⁺/Ca²⁺ 滑杆，实时观察 T 波、U 波、QT、QRS 的变化与处理原则。
- **AI 导师（可选）**：兼容 OpenAI 的 API；支持错因解析、专项组卷、急救复盘与文章问答。**未配置密钥时自动降级到本地知识库**，全部功能仍可用。
- **双主题与响应式**：日光/监护两套主题；竖屏手机、平板/横屏折叠屏、桌面三档布局；移动端重排为满宽单列、44px+ 触控、16px 输入字号与安全区适配。
- **免费开源**：代码 MIT；教学内容 CC BY-SA 4.0（见 `LICENSE` 与文末说明）。

## 内容覆盖

| 章节 | 篇数 | 代表诊断 |
|---|---:|---|
| 窦性心律与基础 | 5 | 正常窦性、窦缓、窦速、窦性心律不齐、窦性停搏 |
| 期前收缩 | 4 | 房早、交界性早搏、室早、室早二联律 |
| 快速性心律失常 | 7 | 房速、房扑、房颤、PSVT、室速、室颤、尖端扭转 |
| 逸搏与缓慢性心律 | 3 | 交界性逸搏、室性逸搏、AIVR |
| 房室与束支传导阻滞 | 7 | 一度/二度 I/二度 II/三度、RBBB、LBBB、LAFB |
| 缺血、梗死与 ST-T | 4 | 前壁/下壁 STEMI、缺血性 ST 压低、心包炎 |
| 电解质、药物与 QT | 6 | 高/低钾、高/低钙、洋地黄效应、长 QT |
| 结构异常与综合征 | 4 | LVH、WPW、Brugada、肺栓塞 S1Q3T3 |
| 判读基本功与速查 | 6 | 测量、电轴、宽 QRS 鉴别、STEMI 定位、ACLS 速查、钾钙速查 |
| **合计** | **46 篇** | **40 种诊断进入判读题库** |

组合题库（8 组）示例：房颤 + RBBB、房颤 + LBBB、前壁 STEMI + RBBB、三度阻滞 + 室性逸搏、预激 + 房颤、长 QT + PVC、房扑 + RBBB、高钾 + 窦缓。

## 技术栈

- **前端**：原生 ES Modules + CSS 变量，零构建；Canvas ECG 引擎；hash 路由。
- **后端**：PHP 8.4 + PDO MySQL；独立 session；CSRF；登录限流；AI 服务端代理。
- **数据库**：MySQL 8.4；`users` / `user_progress` / `quiz_attempts` / `sim_sessions` / `sim_runs` / `auth_throttle` / `ai_usage`。
- **Web 服务器**：nginx（新增独立 vhost，按 IP 精确匹配）。
- **测试**：Node 22（ECG 引擎 / jsdom UI 冒烟）+ PHP CLI（急救状态机 / 内容校验）。

## 快速开始

### 生产（当前已部署）

```bash
# 站点地址由部署环境提供
# 数据库
mysql -u<local-user> -p ecg_academy
```

nginx vhost：`/www/server/panel/vhost/nginx/ecg-academy.conf`（新增文件）。
PHP-FPM：`unix:/tmp/php-cgi-84.sock`；Web 根：`/www/wwwroot/ecg-academy/public`。

### 本地开发

```bash
cd /www/wwwroot/ecg-academy
php scripts/migrate.php                 # 建表（可重复执行）
php -S 127.0.0.1:8791 -t public scripts/dev-router.php
# 浏览器打开 http://127.0.0.1:8791/
```

> 本机 Chrome 无头渲染在当前低配环境会卡在 SwiftShader，视觉验收使用 jsdom DOM 冒烟 + 静态检查；详见 `docs/TESTING.md`。

## AI 接入

复制 `app/config.local.example.php` 为 `app/config.local.php`，填写 OpenAI 兼容端点/密钥/模型；或使用环境变量：

```bash
ECG_AI_ENABLED=1
ECG_AI_BASE_URL=https://api.deepseek.com/v1   # 或 OpenAI/Ollama/其他兼容服务
ECG_AI_API_KEY=sk-...
ECG_AI_MODEL=deepseek-chat
```

- 密钥只在服务端，不下发浏览器。
- AI 只做选择、解释、复盘与对话，不生成 ECG 波形或判分答案。
- 超时/限流/失败自动降级到本地知识库。
- 每日配额 `ai_usage`，默认 30 次/人/天。

详见 [`docs/AI.md`](docs/AI.md)。

## 测试

```bash
# Node 22；本机若 node 不在 PATH，请使用部署环境中的 Node 22 绝对路径。
cd /www/wwwroot/ecg-academy

# 1. 内容结构与引用校验（46 篇）
php scripts/validate_content.php

# 2. 波形引擎单测（15 项）
node tests/engine.test.mjs

# 3. 播放器/12 导联/标注测试（13 项）
node tests/playback.test.mjs

# 4. ACLS 状态机测试（6 项）
php tests/sim.test.php

# 5. jsdom 全链路 UI 冒烟（9 组）
node tests/ui-smoke.mjs
```

最新结果见 [`docs/TESTING.md`](docs/TESTING.md)。

## 目录

```text
app/                 PHP 后端（Web 根之外）
  Auth.php           会话、游客注册升级、CSRF、限流
  Quiz.php           出题、选项、服务端判分
  SimEngine.php      ACLS 服务端状态机与评分
  Ai.php             OpenAI 兼容代理 + 本地降级
  Content.php        46 篇内容加载
data/
  chapters.php       9 个章节
  diagnoses/*.php    46 篇结构化课程 + ECG 规格
  combos.php         8 组组合题
  scenarios.php      6 个急救场景
public/
  index.php          SPA 入口 + API 路由
  static/js/         ECG 引擎、渲染器、路由、页面
  static/css/        双主题设计系统与响应式
docs/                医学手册、架构、API、测试、部署、数据库、AI
scripts/             迁移、导出、开发路由
tests/               引擎/状态机/UI 冒烟
storage/             独立 session、日志、缓存（Web 不可达）
```

## 文档索引

- [医学手册（46 篇完整内容 + ACLS）](docs/MEDICAL.md)
- [项目说明](docs/PROJECT.md)
- [架构设计](docs/ARCHITECTURE.md)
- [设计规范](docs/DESIGN.md)
- [API 文档](docs/API.md)
- [数据库与凭据](docs/DATABASE.md)
- [AI 接入](docs/AI.md)
- [测试报告](docs/TESTING.md)
- [部署与运维](docs/DEPLOYMENT.md)
- [进度与断点清单](docs/PROGRESS.md)
- [调研记录](docs/RESEARCH.md)

## 医学与安全声明

- 本站为**教学用途**，不构成诊断或治疗建议；不替代临床判断与当地急救流程。
- 波形为教学用途的形态学近似，关键间期与节律关系经过设计，但不等同于真实电生理记录。
- 急救评分基于 ACLS 教学流程；真实患者用药剂量、能量与操作需由具备资质的临床人员按指南执行。
- 数据库凭据仅用于本站独立库；不要把 `app/config.php`、`storage/` 或数据库密码暴露到公网。
- 建议正式长期运行时更换为仅授权 `ecg_academy` 的专用数据库账号。

## 开源协作

- 仓库：<https://github.com/AndroidOL/ecg-academy>
- 欢迎提交诊断内容修订、ECG 形态改进、移动端适配与测试。
- 医学内容需给出依据；禁止提交真实患者信息、数据库密码、API Key。
- 详细贡献流程见 [`CONTRIBUTING.md`](CONTRIBUTING.md)，安全问题见 [`SECURITY.md`](SECURITY.md)。

## 许可

- 代码：MIT License。
- 教学内容（`data/diagnoses`、`docs/MEDICAL.md`）：CC BY-SA 4.0。
- 引用与参考见 `docs/RESEARCH.md`；发现内容错误欢迎提交修订。
