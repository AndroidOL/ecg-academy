# AI 导师接入说明

## 能力

1. **个性化组卷**：根据最近练习与掌握度，选出薄弱诊断，生成专项练习（题目仍来自策展题库，AI 只做选择与理由）。
2. **错因解析**：基于题目快照、用户选项、标准答案与知识库要点，用自然语言解释“为什么错、如何在下一次识别”。
3. **错题本针对性讲解**：读取错题本中用户实际错选的干扰项、错选次数和同题重复次数；针对该干扰项解释共享线索、决定性鉴别点与排除顺序。单题讲解用 `mode:"mistake"`，走每日错因分析额度，不消耗对话次数。
4. **急救复盘**：读取急救事件流，按 ACLS 时序/能量/同步模式/按压中断等维度点评。
5. **文章内问答**：围绕当前诊断回答机制、鉴别、处理问题。
6. **兜底**：未配置密钥、超时、限流或返回异常时，自动使用本地规则解析，功能不中断。

## 配置（服务端）

复制 `app/config.local.example.php` 为 `app/config.local.php`：

```php
<?php
return [
  'ai' => [
    'enabled'  => true,
    'base_url' => 'https://api.openai.com/v1',      // 兼容 /chat/completions
    'api_key'  => 'sk-...',
    'model'    => 'gpt-4o-mini',
    'timeout'  => 20,
    'daily_limit' => 30,
  ],
];
```

或使用环境变量（优先级更高）：

```bash
ECG_AI_ENABLED=1
ECG_AI_BASE_URL=https://api.deepseek.com/v1
ECG_AI_API_KEY=sk-...
ECG_AI_MODEL=deepseek-chat
```

兼容服务示例：OpenAI、DeepSeek、Moonshot、通义千问、智谱、Ollama（`http://127.0.0.1:11434/v1`，本地模型需评估服务器内存）。

配置后可在 `GET /api/ai/status` 查看 `configured: true`（不会返回密钥）。

## 安全与医学边界

- 站点密钥只在服务端；浏览器只访问本站 `/api/ai/*` 代理。
- 不把用户姓名、IP、账号 ID 发送给模型；只发送教学上下文与匿名统计。
- 系统提示词强制：仅用于心电图教学；不得给出个体化诊疗指令；不确定时明确说明；急症一律建议按当地急救流程与临床评估。
- AI **不生成**心电图波形、诊断金标准或选项答案；这些来自策展内容，避免模型臆造。
- AI 输出长度受限、纯文本渲染；前端不使用 `innerHTML` 注入模型内容。
- 每日配额（`ai_usage` 表）与 PHP session 双重限制；失败不扣配额。
- 页面显示“AI 生成内容，需结合教材与临床判断”。

## BYOK 演示（可选，默认关闭）

管理员在后台开启 `ai.byok_enabled` 后，用户可在 AI 面板点击钥匙图标，填入自己的 OpenAI-compatible Base URL、模型与 API Key。

- 密钥只保存当前标签页 `sessionStorage`，关闭标签页即失效；不写入数据库、不写日志。
- 请求级传给服务端用于本次代理调用，不落盘。
- Base URL 必须 HTTPS；拒绝 localhost、`.local`、`.internal`、私网/保留 IP，禁止跟随跨域跳转。
- BYOK 请求不消耗站点每日额度；失败仍回退本地知识库。
- 这是个人演示功能，不建议在生产环境使用高权限密钥；管理员可随时关闭。
- 访客只有在管理员开启 BYOK 且提供密钥时才可调用；不会借用站点密钥。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai/status` | 是否配置、模型名、剩余额度、`byokEnabled` |
| POST | `/api/ai/chat` | `{message, diagnosisId?, byok?}` 文章内问答 |
| POST | `/api/ai/explain` | `{attemptId, question?, byok?}` 错因解析 |
| POST | `/api/ai/study-plan` | `{byok?}` 基于进度生成 3 个薄弱诊断 + 训练建议 + 组卷参数 |
| POST | `/api/ai/sim-review` | `{runId, byok?}` 急救复盘 |

所有 POST 需要 CSRF token，返回统一结构：

```json
{ "ok": true, "data": { "text": "...", "source": "ai" }, "fallback": false }
```

失败时 HTTP 仍可为 200，但 `fallback: true` 并返回本地解析，避免打断学习。

## 提示词结构（摘要）

- 角色：中国临床心电图教学导师。
- 输入：诊断知识库摘要、ECG 客观描述、用户答案/事件流。
- 输出要求：先结论，再 2–4 条依据，最后一条“下一次识别”的动作；不编造数字；≤ 450 字。
- 急救复盘：按“时间线 → 关键错误 → 指南依据 → 下一次演练目标”输出。

## 运维

- 超时 20 s，最多 1 次重试；cURL 禁用跟随跨域跳转；响应上限 256 KB。
- 日志只记录状态码、耗时、token 用量，不记录密钥与完整对话。
- 如 API 不可用，前端无感降级，不阻塞答题与急救。
