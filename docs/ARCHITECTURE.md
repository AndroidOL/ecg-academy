# 架构设计

## 总览

```text
Browser (mobile / tablet / desktop)
  ├─ SPA shell (hash router, ES Modules, no build step)
  ├─ ECGEngine   : 波形合成（P-QRS-T、节律、形态修饰、12 导联）
  ├─ ECGRenderer : Canvas 网格、描迹、标注、播放、测量
  └─ fetch('/api/...')
        │
nginx (new vhost, <your-host>)
  ├─ /static/*  → 静态缓存
  └─ /api/*, /  → PHP-FPM 8.4
        │
PHP application (app/)
  ├─ Router / ApiController
  ├─ Auth (PHP session, guest upgrade, CSRF)
  ├─ Content (46 articles / 40 quiz diagnoses, 9 chapters)
  ├─ Quiz (curated bank + seeded variants + server-side grading)
  ├─ SimEngine (authoritative ACLS state machine)
  ├─ Ai (OpenAI-compatible proxy + grounded prompts + fallback)
  └─ Db (PDO MySQL: users, progress, attempts, sim runs)
        │
MySQL 8.4  ecg_academy
```

## 关键决策

1. **零构建前端**：服务器资源有限、无 Node 在 PATH；原生 ES Modules 足够支撑路由、组件与 Canvas 引擎，部署只需复制文件。
2. **服务端权威**：练习答案、急救状态与评分均在服务端；前端只拿渲染参数与公开展示数据。刷分或篡改本地状态无效。
3. **同构波形规格**：学习示例、练习题、急救监护共用 `ecg` JSON 规格，由同一 JS 引擎渲染；规格描述“节律 + 形态 + 修饰”，不含诊断名称（练习接口剥离答案）。
4. **渐进增强**：AI 未配置时所有功能可用（本地解析/本地组卷/规则复盘）；配置后增加个性化与自然语言解释。
5. **独立部署**：新目录、新数据库、新 vhost；不改动同机任何现有站点目录或配置。

## 目录

```text
app/                 后端（Web 根之外）
  config.php         数据库/会话/AI 配置（含 local 覆盖）
  bootstrap.php      自动加载、会话、错误处理、安全头
  Db.php             PDO 单例
  Auth.php           游客、注册、登录、CSRF、限流
  Router.php         小型路由
  ApiController.php  全部 API
  Content.php        读取并缓存 46 篇课程（含 6 篇基本功/速查）
  Quiz.php           出题、选项、判分、XP
  SimEngine.php      ACLS 状态机与评分
  Ai.php             OpenAI 兼容客户端 + 提示词 + 降级
  Schema.php         MySQL DDL
data/
  diagnoses/*.php    9 个章节的内容文件（46 篇）
  chapters.php       章节元数据
  scenarios.php      6 个急救场景
public/
  index.php          SPA shell + API 前端控制器
  static/css/*.css   tokens / base / components / pages
  static/js/*.js     app, router, api, ecg-engine, ecg-renderer, views
  static/img/*       logo, favicon
scripts/             migrate, seed, export docs, tests, deploy
storage/             sessions, logs, cache, backups（Web 不可达）
docs/                项目/架构/设计/医学/API/数据库/测试/AI
```

## 前端路由

hash 路由，便于任意静态托管与无重写部署：

- `#/` 首页
- `#/learn` 课程库
- `#/learn/:id` 诊断详情
- `#/practice` 练习
- `#/sim` 急救场景
- `#/sim/:id` 急救推演
- `#/lab` 电解质实验室
- `#/me` 我的进度 / 排行榜 / 设置

## 数据流：练习

1. `GET /api/quiz/new?level=&chapter=&focus=`：服务端从策展题库选中诊断组合，生成种子与选项，写入 `quiz_attempts`（pending），返回剥离答案的 ECG 规格、题面、选项。
2. 前端 `ECGEngine.generate(spec)` → Canvas。
3. 用户提交 → `POST /api/quiz/answer`：服务端对比 `correct_ids`，计算得分、更新 XP 与进度，返回逐项解析。
4. “AI 解释错因” → `POST /api/ai/explain {attemptId}`：仅基于该题快照、知识库要点与用户选择生成，禁止凭空新增诊断标准；AI 不可用时返回本地规则解析。

## 数据流：急救

1. `POST /api/sim/start {scenarioId}`：创建 `sim_sessions`，初始化状态机。
2. 前端每 1 s `GET /api/sim/state`：服务端按真实时间推进恶化/灌注模型，返回心律、生命体征、事件、可执行操作及提示计时。
3. `POST /api/sim/action`：CPR 开始/暂停、除颤（能量/同步）、电复律、肾上腺素、胺碘酮、阿托品、起搏、镇静、补钙等；服务端校验适应证、能量、时序并写入事件流。
4. 结束（ROSC/稳定/失败/超时）→ `sim_runs` 持久化；本地规则复盘立即展示；“AI 复盘”可选。

## 安全

- PHP session 名 `ECGLABSESS`，独立 save path，HttpOnly + SameSite=Lax，HTTPS 时 Secure。
- 所有写接口校验 `X-CSRF-Token`（session 派生）；只接受 `application/json`。
- PDO 预处理，输出 JSON 不拼接 HTML；前端用 `textContent`/安全 DOM 构造。
- 登录限流：`auth_throttle` 按 key + IP 记录失败窗口；AI 每日配额 `ai_usage`。
- 安全响应头：CSP、X-Content-Type-Options、Referrer-Policy、Permissions-Policy；生产不显示堆栈。
- 上传功能不存在；无文件写入用户输入。

## 性能

- 静态资源版本号 `?v=`，nginx 长缓存；API 不缓存。
- 诊断内容 PHP opcache + 内存缓存；ECG 数据懒加载。
- Canvas 按 devicePixelRatio（上限 2）绘制；移动端只画 5 mm 主网格以降低密度；12 导联按需渲染。
- 无 Web 字体、无外部 CDN、无第三方脚本；首屏目标 < 300 KB。
- 浏览器调试仅在低负载时执行；生产不使用 Playwright/Puppeteer 常驻进程。

## AI 集成

详见 `docs/AI.md`。要点：

- 任何 OpenAI 兼容端点（OpenAI / DeepSeek / Moonshot / 通义 / Ollama）。
- 配置位于 `app/config.local.php` 或环境变量；密钥不下发浏览器。
- AI 只做**选择、解释、复盘、对话**，不生成诊断金标准、不生成 ECG 波形；练习答案始终由策展题库决定。
- 所有 AI 输出经过长度限制、纯文本/Markdown-Lite 渲染与免责声明包装；失败自动降级。
