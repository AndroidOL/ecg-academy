# API 文档

Base URL：`/api`（同源）。所有响应为 JSON；成功使用 `{"ok":true,"data":...}`，失败使用 `{"ok":false,"error":{"code","message","details"}}`。

## 会话与 CSRF

1. 首次请求 `GET /api/bootstrap`。服务端会创建游客用户，返回 `user` 与 `csrf`，并设置 `ECGLABSESS` HttpOnly 会话 Cookie。
2. 所有 **POST** 请求必须在请求头携带 `X-CSRF-Token`，值为 bootstrap 返回的 `csrf`。
3. 会话失效（419）时，前端会自动重新 bootstrap 并重试一次。
4. 游客可升级为注册用户；登录会合并当前访客的已读进度。

```bash
curl -c cookies.txt http://127.0.0.1:8791/api/bootstrap
# 取 data.csrf 后：
curl -b cookies.txt -H 'Content-Type: application/json' -H 'X-CSRF-Token: <csrf>' \
  -d '{"diagnosisId":"afib","status":"read"}' http://127.0.0.1:8791/api/progress
```

## 内容

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/bootstrap` | 当前用户、CSRF、内容统计、2000 题库统计、进度、AI 状态（含 `byokEnabled`）、本周排行榜、场景数、`features`（注册/登录开关）、`site`（GitHub/许可证/版权/ICP） |
| GET | `/api/admin/auth-config` | 管理后台登录方式与 Passkey 是否存在（公开只读） |
| POST | `/api/admin/login` | 管理员密码登录（受 `admin.password_login_enabled` 控制） |
| GET | `/api/admin/passkey/login/options` | 生成 WebAuthn 登录 challenge |
| POST | `/api/admin/passkey/login` | 校验 Passkey assertion 并建立管理员会话 |
| GET | `/api/admin/session` | 管理员会话、设置、统计、Passkey、审计 |
| POST | `/api/admin/settings` | 注册/登录/AI 开关与额度 |
| GET | `/api/admin/users` | 用户搜索与分页 |
| POST | `/api/admin/user` | 启停、角色、额度、密码重置 |
| POST | `/api/admin/user/create` | 管理员手动创建用户：用户名、显示名、初始密码、管理员标记、AI 额度 |
| GET/POST | `/api/admin/passkey/*` | 注册/删除管理员 Passkey |
| POST | `/api/admin/ai/provider` | 新增/更新 OpenAI-compatible 供应商与模型 |
| POST | `/api/admin/ai/provider/delete` | 删除供应商 |
| POST | `/api/admin/ai/test` | 测试供应商连接 |
| GET | `/api/admin/audit` | 最近管理审计 |
| GET | `/api/admin/assignments` | 作业列表与匿名统计（人数/次数/平均分/正确率） |
| POST | `/api/admin/assignment` | 创建/更新作业 `{title,className,level,chapter,focus,active}` |
| POST | `/api/admin/assignment/toggle` | 启用/关闭作业 |
| POST | `/api/admin/assignment/delete` | 删除作业（级联删除匿名成绩） |
| GET | `/api/health` | 健康检查 |
| GET | `/api/diagnoses?q=&chapter=` | 230 章课程摘要、章节、统计；支持搜索/章节过滤 |
| GET | `/api/diagnoses/{id}` | 诊断详情、完整文章、ECG 规格、上下篇、相关阅读、当前进度 |
| POST | `/api/progress` | `{diagnosisId, status:"read"|"mastered"}` |

## 练习

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/quiz/new?level=1|2|3&chapter=&focus=a,b&assignment=CODE&device=UUID` | 从 2000 道预生成病例中出题；level 3 为组合诊断；assignment 覆盖难度/章节/专项并记录匿名成绩；返回剥离答案的 ECG 规格、选项、attemptId、bankId |
| POST | `/api/quiz/answer` | `{attemptId, selected:["id"], timeMs, level?}`；服务端判分并返回解析；`level` 仅用于游客本地等级判断；未解锁难度返回 `unlocked:false`、score/xp=0；测试模式按难度计分、答错 4× 扣分并更新锁定 |
| GET | `/api/quiz/history` | 最近答题记录 |
| GET | `/api/learning/status` | 19 板块学习状态、最近 50 题评级、考试解锁、1735 题统计 |
| GET | `/api/learning/start?chapter=` | 随机 10 题学习关卡（返回题目与签名 token，不含答案） |
| POST | `/api/learning/complete` | `{token, answers, level?}` 结算学习关卡/考试；返回 `score`、`xp`、`details`（含 `unlocked/unlockLevel`）；≥8/10 标记已学习 |
| GET | `/api/exam/start` | 从已学习板块随机组卷；不足 8 个板块返回 403 `exam_locked` |
| GET | `/api/practice/status` | 今日测试分、正确/错误数、锁定时间、今日排行榜/个人名次 |
| GET | `/api/practice/leaderboard?scope=today\|week\|all` | 排行榜：`items`（前 50）、`me`（当前用户）、`total`、`updatedAt`；只含公开昵称/分数 |
| GET | `/api/daily/status` | `day/done/result/count/streak/bestStreak/totalDays/history`（28 天） |
| GET | `/api/daily/start` | 今日 10 题（全站同题、确定性选项顺序）与签名 token；已完成时返回 `done:true` 与结果 |
| POST | `/api/daily/complete` | `{token, answers:[{id,selected,timeMs}], level?}`；判分、写 `daily_results`、token 一次性核销；未解锁难度 0 分/0 XP；不进入测试分/排行榜 |
| GET | `/api/assignment?code=` | 公开作业元数据（标题/班级/难度/章节），不返回答案；停用即 404 |
| GET | `/api/stats?scope=week|all` | 进度、章节正确率、最近答题/急救、排行榜 |
| GET | `/api/leaderboard?scope=week|all` | 排行榜 |

出题响应示例：

```json
{
  "attemptId": 12,
  "spec": { "rhythm": "af", "rate": 96, "irregularity": 0.22, "...": "..." },
  "options": [{ "id": "afib", "name": "心房颤动", "chapter": "tachy" }],
  "multiple": false,
  "level": 1,
  "question": "该心电图最可能的诊断是？",
  "expiresIn": 7200
}
```

判分响应包含：`correct`、`partial`、`correctIds`、`correctNames`、`selectedNames`、`score`、`xp`、`baseScore`、`penalty`、`xpMultiplier`、`explanation`（逐诊断的特异性/标准/处理）、`localExplanation`、`aiAvailable`。

## 急救模拟

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/sim/scenarios` | 10 个场景列表（含 4 个可逆病因/特殊处理场景） |
| POST | `/api/sim/start` | `{scenarioId}`，创建 `sim_sessions`，返回监护状态 |
| GET | `/api/sim/state?id=` | 读取状态；服务端按真实时间推进动态生理、阶段、恶化与超时 |
| POST | `/api/sim/action` | `{sessionId, action, payload}` |
| GET | `/api/sim/debrief?runId=` | 评分、事件时间线、规则复盘 |

### 操作 action

| action | payload | 适应证/说明 |
|---|---|---|
| `cpr_start` / `cpr_stop` | `{rate?}` | 高质量 CPR；停止时记录频率 |
| `shock` | `{energy, sync}` | VF/pVT 用非同步 120–200 J；有脉不稳定用同步 50–200 J |
| `epi` | — | 1 mg IV/IO；可除颤心律通常在第二次除颤后 |
| `amio` | — | 300 mg，必要时 150 mg |
| `atropine` | — | 症状性心动过缓 1 mg，最大 3 mg |
| `pacing` | — | 经皮起搏 |
| `epi_infusion` | — | 肾上腺素 2–10 μg/min |
| `iv` / `oxygen` / `sedate` | — | 建立通路/吸氧/电复律前镇静 |
| `calcium` / `bicarb` / `insulin` | — | 高钾可逆病因处理 |
| `adenosine` / `vagal` | — | 稳定 SVT 的尝试 |
| `special` | — | 场景专属可逆病因/特殊处理：补液、复温、脂肪乳、围死亡期剖宫产 |
| `check_pulse` / `check_rhythm` | — | 评估（按压中会扣分） |
| `finish` | — | 提前结束并生成复盘 |

监护状态包含：`rhythm`、`monitor`（可直接传给前端 ECG 引擎）、`vitals`（HR/BP/SpO₂/ETCO₂/脉搏/反应）、`cpr`、`metrics`、`events`、`actions`、`hint`、`status`、`score/grade/runId`（结束后）。

## AI

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai/status` | `configured/allowed/byokEnabled/model/dailyLimit/used/remaining/mode` |
| POST | `/api/ai/chat` | `{message, diagnosisId?, byok?}`；`byok={baseUrl,model,apiKey}` 仅在管理员开启 BYOK 时接受 |
| POST | `/api/ai/stream` | SSE：`{mode:"chat"|"explain"|"review"|"mistake", ...}`；`mistake` 传 `{entryId, mistake:{choices,repeat,history}, question?}`；事件 `meta / delta / done`，`done` 含 usage 与 cost |
| POST | `/api/ai/explain` | `{attemptId, question?, byok?}` |
| POST | `/api/ai/study-plan` | `{byok?}` 生成薄弱诊断专项计划 |
| POST | `/api/ai/sim-review` | `{runId, byok?}` 急救复盘 |

错题讲解请求示例：`{"mode":"mistake","entryId":"afib","mistake":{"choices":[{"id":"atrial-tachy","name":"房性心动过速","count":2}],"repeat":{"n":3,"picked":["房性心动过速"]},"history":[{"q":"该心电图最可能的诊断是？","picked":[{"id":"atrial-tachy"}],"correct":[{"id":"afib"}]}]}}`。服务端只按诊断 ID 回查真实名称，未知 ID 丢弃；该模式计入每日错因分析额度。未配置密钥、超时或额度用尽时返回 `fallback:true` 与本地文本，HTTP 仍为 200，避免打断学习。BYOK 请求不消耗站点每日额度；密钥只在请求内存中使用，不写数据库/日志，且 Base URL 必须为 HTTPS 公网地址。

## 前端本地数据与离线

- 错题、收藏、间隔重复、游客进度/XP 在 localStorage；导入/导出 JSON 仅在浏览器执行。
- `/sw.js` 为 PWA 缓存入口，`/offline.html` 为离线回退页；自 1.6.1 起 `/api/*` 完全绕过 Service Worker（始终直接走网络，避免读到过期判分），静态资源采用缓存优先+后台刷新。
- `#/review`、`#/glossary`、`#/about` 为纯前端视图，不新增服务端接口。

## 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | `{username,password,displayName}`；用户名 3–24 位字母数字下划线；密码 ≥8 位 |
| POST | `/api/auth/login` | `{username,password}`；限流 6 次/10 分钟/IP+用户名 |
| GET | `/api/auth/passkey/options?username=` | 普通账号 Passkey 登录参数；无凭证 404 |
| POST | `/api/auth/passkey/login` | `{credential}`；验证断言后建立用户会话并合并游客进度 |
| POST | `/api/auth/logout` | 销毁会话；下一次 bootstrap 创建新访客 |
| POST | `/api/theme` | `{theme:"auto"|"light"|"dark"}` |
| POST | `/api/visit` | `{path,referer}`；记录访客事件（IP/UA 由服务端读取），路径归一化 |

## 后台运维（需管理员会话）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/traffic?days=14` | PV/UV 汇总、14 天序列、热门页面、来源站点、来源 IP、最近访问 |
| POST | `/api/admin/guests/clean` | `{days}`；删除闲置游客（0 = 全部），返回删除数并清理 90 天前访客事件 |
| GET | `/api/admin/ai/cost?days=30` | 费用汇总、30 天序列、模型花费、最近调用；含价格/折扣设置 |
| POST | `/api/admin/ai/cost` | `{pricing:{model:{input,output}}, discounts:[{label,from,to,ratio}], currency, maxTokens}` |

## 个人资料与 Passkey（需正式账号会话）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/me/profile` | `{displayName}`；1–20 字符 |
| POST | `/api/me/password` | `{currentPassword,newPassword}`；新密码 8–72 位 |
| GET | `/api/me/passkeys` | 当前账号的 Passkey 列表（不含公钥） |
| GET | `/api/me/passkey/options` | 注册参数（challenge/rp/user） |
| POST | `/api/me/passkey/register` | `{credential,label}`；重复凭证返回 409 |
| POST | `/api/me/passkey/delete` | `{id}`；仅能删除本人 Passkey |

## 错误码

| HTTP | code 示例 | 含义 |
|---|---|---|
| 400 | `invalid_json` | JSON 格式错误 |
| 401 | `invalid_credentials` | 登录失败 |
| 404 | `diagnosis_not_found` / `session_not_found` | 资源不存在 |
| 409 | `attempt_answered` / `username_taken` | 重复提交/用户名占用 |
| 410 | `attempt_expired` | 题目超过 2 小时 |
| 419 | `csrf_invalid` | CSRF 校验失败（前端自动刷新 token 重试） |
| 422 | `no_iv` / `invalid_action` | 操作不满足条件 |
| 423 | `practice_locked` / `exam_locked` | 测试分低于阈值 / 未完成 8 个板块 |
| 429 | `too_many_attempts` | 登录限流 |
| 500 | `server_error` | 服务端异常（不返回堆栈） |

## 设计原则

- 判分答案、急救状态、评分均在服务端；前端只拿渲染参数与展示数据。
- 练习返回的 `spec` 已移除答案与解析标注；伤害性/错误操作由服务端记录并评分。
- AI 只做解释与选择，不生成 ECG 波形、答案或药物剂量；所有 AI 输出以纯文本渲染。
