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
| GET | `/api/bootstrap` | 当前用户、CSRF、内容统计、1200 题库统计、进度、AI 状态、本周排行榜、场景数 |
| GET | `/api/admin/auth-config` | 管理后台登录方式与 Passkey 是否存在（公开只读） |
| POST | `/api/admin/login` | 管理员密码登录（受 `admin.password_login_enabled` 控制） |
| GET | `/api/admin/passkey/login/options` | 生成 WebAuthn 登录 challenge |
| POST | `/api/admin/passkey/login` | 校验 Passkey assertion 并建立管理员会话 |
| GET | `/api/admin/session` | 管理员会话、设置、统计、Passkey、审计 |
| POST | `/api/admin/settings` | 注册/登录/AI 开关与额度 |
| GET | `/api/admin/users` | 用户搜索与分页 |
| POST | `/api/admin/user` | 启停、角色、额度、密码重置 |
| GET/POST | `/api/admin/passkey/*` | 注册/删除管理员 Passkey |
| POST | `/api/admin/ai/provider` | 新增/更新 OpenAI-compatible 供应商与模型 |
| POST | `/api/admin/ai/provider/delete` | 删除供应商 |
| POST | `/api/admin/ai/test` | 测试供应商连接 |
| GET | `/api/admin/audit` | 最近管理审计 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/diagnoses?q=&chapter=` | 229 章课程摘要、章节、统计；支持搜索/章节过滤 |
| GET | `/api/diagnoses/{id}` | 诊断详情、完整文章、ECG 规格、上下篇、相关阅读、当前进度 |
| POST | `/api/progress` | `{diagnosisId, status:"read"|"mastered"}` |

## 练习

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/quiz/new?level=1|2|3&chapter=&focus=a,b` | 从 1200 道预生成病例中出题；level 3 为组合诊断；返回剥离答案的 ECG 规格、选项、attemptId、bankId |
| POST | `/api/quiz/answer` | `{attemptId, selected:["id"], timeMs}`；服务端判分并返回解析 |
| GET | `/api/quiz/history` | 最近答题记录 |
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

判分响应包含：`correct`、`partial`、`correctIds`、`correctNames`、`selectedNames`、`score`、`xp`、`explanation`（逐诊断的特异性/标准/处理）、`localExplanation`、`aiAvailable`。

## 急救模拟

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/sim/scenarios` | 6 个场景列表 |
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
| `check_pulse` / `check_rhythm` | — | 评估（按压中会扣分） |
| `finish` | — | 提前结束并生成复盘 |

监护状态包含：`rhythm`、`monitor`（可直接传给前端 ECG 引擎）、`vitals`（HR/BP/SpO₂/ETCO₂/脉搏/反应）、`cpr`、`metrics`、`events`、`actions`、`hint`、`status`、`score/grade/runId`（结束后）。

## AI

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai/status` | `configured/model/dailyLimit/used/remaining/mode` |
| POST | `/api/ai/chat` | `{message, diagnosisId?}` |
| POST | `/api/ai/explain` | `{attemptId}` |
| POST | `/api/ai/study-plan` | 生成薄弱诊断专项计划 |
| POST | `/api/ai/sim-review` | `{runId}` 急救复盘 |

未配置密钥、超时或额度用尽时返回 `fallback:true` 与本地文本，HTTP 仍为 200，避免打断学习。

## 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | `{username,password,displayName}`；用户名 3–24 位字母数字下划线；密码 ≥8 位 |
| POST | `/api/auth/login` | `{username,password}`；限流 6 次/10 分钟/IP+用户名 |
| POST | `/api/auth/logout` | 销毁会话；下一次 bootstrap 创建新访客 |
| POST | `/api/theme` | `{theme:"auto"|"light"|"dark"}` |

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
| 429 | `too_many_attempts` | 登录限流 |
| 500 | `server_error` | 服务端异常（不返回堆栈） |

## 设计原则

- 判分答案、急救状态、评分均在服务端；前端只拿渲染参数与展示数据。
- 练习返回的 `spec` 已移除答案与解析标注；伤害性/错误操作由服务端记录并评分。
- AI 只做解释与选择，不生成 ECG 波形、答案或药物剂量；所有 AI 输出以纯文本渲染。
