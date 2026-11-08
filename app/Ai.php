<?php
declare(strict_types=1);

namespace App;

final class Ai
{
    public static function allowedForUser(int $userId, bool $byok = false): bool
    {
        $stmt = Db::pdo()->prepare('SELECT is_guest FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $isGuest = (int) ($stmt->fetchColumn() ?: 0) === 1;
        return !$isGuest || Settings::bool('ai.allow_guest', false) || ($byok && Settings::bool('ai.byok_enabled', false));
    }

    public static function configured(): bool
    {
        if (!Settings::bool('ai.enabled', (bool) Config::get('ai.enabled', false))) return false;
        $provider = self::provider();
        if ($provider !== null && trim((string) $provider['base_url']) !== '' && trim((string) $provider['api_key']) !== '') return true;
        return trim((string) Config::get('ai.api_key', '')) !== '';
    }

    public static function status(int $userId): array
    {
        $limit = self::limitFor($userId);
        $used = self::usedToday($userId);
        $allowed = self::allowedForUser($userId);
        $provider = self::provider();
        $model = $provider['default_model'] ?? ($provider['models'][0] ?? null);
        return [
            'configured' => self::configured() && $allowed,
            'allowed' => $allowed,
            'guestAllowed' => Settings::bool('ai.allow_guest', false),
            'byokEnabled' => Settings::bool('ai.byok_enabled', false),
            'model' => self::configured() && $allowed ? (string) ($model ?: Config::get('ai.model', '')) : null,
            'provider' => self::configured() && $allowed ? ($provider['name'] ?? '内置兼容接口') : null,
            'dailyLimit' => $limit,
            'used' => $used,
            'remaining' => max(0, $limit - $used),
            'mode' => self::configured() && $allowed ? 'ai' : 'local',
        ];
    }

    public static function testProvider(string $id): array
    {
        $provider = null;
        foreach (Settings::aiProviders() as $candidate) {
            if (($candidate['id'] ?? '') === $id) { $provider = $candidate; break; }
        }
        if ($provider === null) throw new ApiError(404, 'provider_not_found', '供应商不存在');
        $base = rtrim((string) ($provider['base_url'] ?? ''), '/');
        $key = Secret::decrypt((string) ($provider['api_key_enc'] ?? ''));
        $model = (string) ($provider['default_model'] ?? ($provider['models'][0] ?? ''));
        if ($base === '' || $key === '' || $model === '') return ['ok' => false, 'message' => '供应商配置不完整'];
        $payload = json_encode([
            'model' => $model,
            'messages' => [['role' => 'user', 'content' => '只回复 OK']],
            'temperature' => 0,
            'max_tokens' => 8,
        ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $ch = curl_init($base . (str_ends_with($base, '/chat/completions') ? '' : '/chat/completions'));
        if ($ch === false) return ['ok' => false, 'message' => '无法初始化 cURL'];
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $key],
            CURLOPT_POSTFIELDS => $payload,
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($response === false || $status < 200 || $status >= 300) {
            return ['ok' => false, 'message' => '连接失败（HTTP ' . $status . '）' . ($error ? ': ' . $error : '')];
        }
        $data = json_decode((string) $response, true);
        $text = $data['choices'][0]['message']['content'] ?? null;
        return ['ok' => is_string($text) && trim($text) !== '', 'message' => is_string($text) ? mb_substr(trim($text), 0, 80, 'UTF-8') : '返回格式不符合 OpenAI 兼容协议'];
    }

    private static function provider(): ?array
    {
        $providers = Settings::aiProviders();
        if ($providers === []) return null;
        $default = (string) Settings::get('ai.default_provider', '');
        foreach ($providers as $provider) {
            if (($provider['id'] ?? '') !== $default || !filter_var($provider['enabled'] ?? true, FILTER_VALIDATE_BOOL)) continue;
            $provider['api_key'] = Secret::decrypt((string) ($provider['api_key_enc'] ?? ''));
            return $provider;
        }
        foreach ($providers as $provider) {
            if (!filter_var($provider['enabled'] ?? true, FILTER_VALIDATE_BOOL)) continue;
            $provider['api_key'] = Secret::decrypt((string) ($provider['api_key_enc'] ?? ''));
            return $provider;
        }
        return null;
    }

    private static function limitFor(int $userId): int
    {
        $stmt = Db::pdo()->prepare('SELECT ai_daily_limit, is_admin FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if ($row && (int) ($row['is_admin'] ?? 0) === 1) return 1000000;
        $override = $row['ai_daily_limit'] ?? null;
        if ($override !== false && $override !== null && $override !== '') return max(0, (int) $override);
        return max(0, Settings::int('ai.daily_limit', (int) Config::get('ai.daily_limit', 30)));
    }

    public static function chat(int $userId, string $message, ?string $diagnosisId = null, ?array $byok = null): array
    {
        $byok = self::byokConfig($byok);
        if (!self::allowedForUser($userId, $byok !== null)) throw new ApiError(403, 'ai_guest_disabled', '当前站点未开放未登录用户使用 AI；如需使用自己的密钥，请先开启 BYOK。');
        $message = trim($message);
        if ($message === '' || mb_strlen($message, 'UTF-8') > 600) {
            throw new ApiError(422, 'invalid_message', '问题需为 1–600 字');
        }
        $built = self::chatMessages($message, $diagnosisId ? Content::find($diagnosisId) : null);
        if ($byok === null && !self::configured()) {
            return ['text' => $built['fallback'], 'source' => 'local', 'fallback' => true];
        }
        if ($byok === null && !self::consume($userId)) {
            return ['text' => $built['fallback'] . "\n\n（今日 AI 额度已用完，以上为本地知识库回答。）", 'source' => 'local', 'fallback' => true];
        }
        $result = self::call($built['messages'], 0.35, $byok);
        if ($result === null) {
            return ['text' => $built['fallback'] . "\n\n（AI 服务暂时不可用，以上为本地知识库回答。）", 'source' => 'local', 'fallback' => true];
        }
        self::recordUsage($userId, 'chat', $result, $byok !== null ? 'byok' : 'ai');
        return ['text' => $result['text'], 'source' => $byok !== null ? 'byok' : 'ai', 'fallback' => false];
    }

    private static function chatMessages(string $message, ?array $diagnosis): array
    {
        $context = $diagnosis ? self::diagnosisContext($diagnosis) : '未指定具体诊断。';
        return [
            'messages' => [
                ['role' => 'system', 'content' => self::systemPrompt()],
                ['role' => 'user', 'content' => "教学上下文：\n{$context}\n\n学生问题：{$message}\n\n请用中文回答：先给结论，再给 2–4 条依据，最后给一条下一次识别的动作；不超过 450 字；结尾提醒这是教学用途。"],
            ],
            'fallback' => self::localChatAnswer($message, $diagnosis),
        ];
    }

    public static function explain(int $userId, int $attemptId, string $userQuestion = '', ?array $byok = null): array
    {
        $byok = self::byokConfig($byok);
        if (!self::allowedForUser($userId, $byok !== null)) throw new ApiError(403, 'ai_guest_disabled', '当前站点未开放未登录用户使用 AI；如需使用自己的密钥，请先开启 BYOK。');
        $built = self::explainMessages($userId, $attemptId, $userQuestion);
        if ($byok === null && !self::configured()) {
            return ['text' => $built['fallback'], 'source' => 'local', 'fallback' => true];
        }
        if ($byok === null && !self::consume($userId)) {
            return ['text' => $built['fallback'] . "\n\n（今日 AI 额度已用完，以上为本地知识库回答。）", 'source' => 'local', 'fallback' => true];
        }
        $result = self::call($built['messages'], 0.3, $byok);
        if ($result === null) {
            return ['text' => $built['fallback'] . "\n\n（AI 服务暂时不可用，以上为本地知识库回答。）", 'source' => 'local', 'fallback' => true];
        }
        self::recordUsage($userId, 'explain', $result, $byok !== null ? 'byok' : 'ai');
        return ['text' => $result['text'], 'source' => $byok !== null ? 'byok' : 'ai', 'fallback' => false];
    }

    private static function explainMessages(int $userId, int $attemptId, string $userQuestion): array
    {
        $stmt = Db::pdo()->prepare('SELECT * FROM quiz_attempts WHERE id = ? AND user_id = ? AND status = "answered" LIMIT 1');
        $stmt->execute([$attemptId, $userId]);
        $attempt = $stmt->fetch();
        if (!$attempt) throw new ApiError(404, 'attempt_not_found', '答题记录不存在');
        $payload = json_decode((string) $attempt['payload'], true) ?: [];
        $correctIds = json_decode((string) $attempt['correct_ids'], true) ?: [];
        $selectedIds = json_decode((string) ($attempt['selected_ids'] ?? '[]'), true) ?: [];
        $all = Content::all();
        $correct = array_values(array_filter(array_map(static fn (string $id): ?array => $all[$id] ?? null, $correctIds)));
        $selectedNames = array_map(static fn (string $id): string => $all[$id]['name'] ?? $id, $selectedIds);
        $correctNames = array_map(static fn (string $id): string => $all[$id]['name'] ?? $id, $correctIds);
        $fallback = self::localExplain($correct, $selectedNames, $correctNames, (bool) $attempt['is_correct']);
        $context = [];
        foreach ($correct as $d) {
            $context[] = self::diagnosisContext($d);
        }
        $question = (string) ($payload['question'] ?? '该心电图最可能的诊断是？');
        $stem = (string) ($payload['stem'] ?? '');
        $optionIds = is_array($payload['optionIds'] ?? null) ? $payload['optionIds'] : [];
        $optionNames = array_map(static fn (string $id): string => $all[$id]['name'] ?? $id, $optionIds);
        $spec = is_array($payload['spec'] ?? null) ? $payload['spec'] : [];
        $ecgSummary = sprintf('节律 %s，心率 %s 次/分，QRS %s s，电轴 %s，ST 抬高 %s，ST 压低 %s，T 波 %s。',
            (string) ($spec['rhythm'] ?? '—'), (string) ($spec['rate'] ?? '—'), (string) ($spec['qrs'] ?? '—'), (string) ($spec['axis'] ?? '—'),
            json_encode($spec['st']['elevation'] ?? [], JSON_UNESCAPED_UNICODE), json_encode($spec['st']['depression'] ?? [], JSON_UNESCAPED_UNICODE), (string) ($spec['t']['shape'] ?? '—'));
        $userText = "当前心电图题目：{$question}\n"
            . ($stem !== '' ? "题干：{$stem}\n" : '')
            . '选项：' . implode('、', $optionNames) . "\n"
            . '学生选择：' . ($selectedNames ? implode('、', $selectedNames) : '未选') . "\n"
            . '正确答案：' . implode('、', $correctNames) . "\n"
            . '是否完全正确：' . ($attempt['is_correct'] ? '是' : '否') . "\n"
            . "心电图摘要：{$ecgSummary}\n"
            . "题目解析上下文：\n" . implode("\n---\n", $context)
            . ($userQuestion !== '' ? "\n学生追问：" . mb_substr(trim($userQuestion), 0, 120, 'UTF-8') : '');
        return [
            'messages' => [
                ['role' => 'system', 'content' => self::systemPrompt() . "\n你会收到题目、选项、学生选择和心电图摘要。先判断学生错在哪一步，再解释；不要只复述正确答案。若学生追问与本题无关，也要直接回答追问，再回到题目。可用简短 Markdown（小标题、粗体、编号列表）组织答案。"],
                ['role' => 'user', 'content' => $userText . "\n\n请针对学生的选择解释错因或确认正确思路；必须指出最关键的心电图线索，给出下一次识别的动作；追问优先回答；不超过 600 字。"],
            ],
            'fallback' => $fallback,
            'context' => [
                '题目：' . $question,
                '你的选择：' . ($selectedNames ? implode('、', $selectedNames) : '未选'),
                '正确答案：' . implode('、', $correctNames),
                '心电图：' . $ecgSummary,
            ],
        ];
    }

    public static function studyPlan(int $userId, ?array $byok = null): array
    {
        $byok = self::byokConfig($byok);
        if (!self::allowedForUser($userId, $byok !== null)) throw new ApiError(403, 'ai_guest_disabled', '当前站点未开放未登录用户使用 AI；如需使用自己的密钥，请先开启 BYOK。');
        $local = Quiz::localStudyPlan($userId);
        if ($byok === null && !self::configured()) {
            return ['plan' => $local, 'text' => implode(' ', $local['reasons']), 'source' => 'local', 'fallback' => true];
        }
        if ($byok === null && !self::consume($userId)) {
            return ['plan' => $local, 'text' => implode(' ', $local['reasons']), 'source' => 'local', 'fallback' => true];
        }
        $focusText = implode('、', array_column($local['focus'], 'name'));
        $reasons = implode(' ', $local['reasons']);
        $messages = [
            ['role' => 'system', 'content' => self::systemPrompt()],
            ['role' => 'user', 'content' => "学生薄弱点：{$reasons}\n候选专项诊断：{$focusText}\n请用 150 字以内给出一个可执行的训练计划（先看什么、练什么、如何自检）。不要推荐具体药物剂量。"],
        ];
        $result = self::call($messages, 0.4, $byok);
        if ($result !== null) self::recordUsage($userId, 'study-plan', $result, $byok !== null ? 'byok' : 'ai');
        return [
            'plan' => $local,
            'text' => $result['text'] ?? implode(' ', $local['reasons']),
            'source' => $result !== null ? ($byok !== null ? 'byok' : 'ai') : 'local',
            'fallback' => $result === null,
        ];
    }

    public static function simReview(int $userId, int $runId, ?array $byok = null): array
    {
        $byok = self::byokConfig($byok);
        if (!self::allowedForUser($userId, $byok !== null)) throw new ApiError(403, 'ai_guest_disabled', '当前站点未开放未登录用户使用 AI；如需使用自己的密钥，请先开启 BYOK。');
        $stmt = Db::pdo()->prepare('SELECT * FROM sim_runs WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$runId, $userId]);
        $run = $stmt->fetch();
        if (!$run) throw new ApiError(404, 'run_not_found', '复盘记录不存在');
        $debrief = SimEngine::debrief($userId, $runId);
        $fallback = implode(' ', array_map(static fn (array $r): string => $r['title'] . '：' . $r['detail'], $debrief['review']));
        if ($byok === null && !self::configured()) {
            return ['text' => $fallback, 'source' => 'local', 'fallback' => true];
        }
        if ($byok === null && !self::consume($userId)) {
            return ['text' => $fallback, 'source' => 'local', 'fallback' => true];
        }
        $events = array_map(static fn (array $e): string => sprintf('[%ss] %s%s', $e['t'] ?? '?', $e['label'] ?? '', isset($e['points']) && $e['points'] < 0 ? '（扣分）' : ''), $debrief['events']);
        $prompt = "急救场景：{$debrief['scenario']['name']}\n"
            . "结果：{$debrief['run']['outcome']}，评分 {$debrief['run']['score']}（{$debrief['run']['grade']}）\n"
            . "操作时间线：\n" . implode("\n", $events)
            . "\n\n请按“时间线 → 关键问题（按压中断/能量/同步模式/药物时序）→ 下一次演练目标”给出不超过 500 字的复盘；仅教学用途，不给真实患者指令。";
        $messages = [
            ['role' => 'system', 'content' => self::systemPrompt()],
            ['role' => 'user', 'content' => $prompt],
        ];
        $result = self::call($messages, 0.3, $byok);
        if ($result !== null) self::recordUsage($userId, 'sim-review', $result, $byok !== null ? 'byok' : 'ai');
        return [
            'text' => $result['text'] ?? $fallback,
            'source' => $result !== null ? ($byok !== null ? 'byok' : 'ai') : 'local',
            'fallback' => $result === null,
        ];
    }

    private static function call(array $messages, float $temperature, ?array $byok = null, int $maxTokens = 1200): ?array
    {
        $provider = self::provider();
        $base = rtrim((string) ($byok['base_url'] ?? $provider['base_url'] ?? Config::get('ai.base_url', '')), '/');
        if ($base === '') return null;
        $url = str_ends_with($base, '/chat/completions') ? $base : $base . '/chat/completions';
        $apiKey = (string) ($byok['api_key'] ?? $provider['api_key'] ?? Config::get('ai.api_key', ''));
        $model = (string) ($byok['model'] ?? $provider['default_model'] ?? ($provider['models'][0] ?? Config::get('ai.model', 'gpt-4o-mini')));
        $payload = [
            'model' => $model,
            'messages' => $messages,
            'temperature' => $temperature,
            'max_tokens' => max(64, min(4000, (int) Settings::get('ai.max_tokens', $maxTokens))),
        ];
        $ch = curl_init($url);
        if ($ch === false) return null;
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => max(5, (int) Config::get('ai.timeout', 45)),
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ] + (defined('CURLOPT_PROTOCOLS') ? [CURLOPT_PROTOCOLS => CURLPROTO_HTTPS] : []));
        if (!empty($byok['resolve'])) {
            curl_setopt($ch, CURLOPT_RESOLVE, [(string) $byok['resolve']]);
        }
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($response === false || $status < 200 || $status >= 300) {
            error_log('[ai] request failed status=' . $status . ' error=' . $error);
            return null;
        }
        if (strlen($response) > 524288) return null;
        $data = json_decode($response, true);
        $text = $data['choices'][0]['message']['content'] ?? null;
        if (!is_string($text) || trim($text) === '') return null;
        $text = trim($text);
        $usage = is_array($data['usage'] ?? null) ? [
            'prompt' => max(0, (int) ($data['usage']['prompt_tokens'] ?? 0)),
            'completion' => max(0, (int) ($data['usage']['completion_tokens'] ?? 0)),
        ] : ['prompt' => 0, 'completion' => 0];
        return [
            'text' => mb_substr($text, 0, 6000, 'UTF-8'),
            'usage' => $usage,
            'model' => $model,
            'provider' => $byok !== null ? 'BYOK' : (string) ($provider['name'] ?? '兼容接口'),
        ];
    }

    private static function byokConfig(?array $raw): ?array
    {
        if ($raw === null || $raw === []) return null;
        if (!Settings::bool('ai.byok_enabled', false)) {
            throw new ApiError(403, 'byok_disabled', '管理员未开启 BYOK 演示');
        }
        $base = rtrim(trim((string) ($raw['baseUrl'] ?? '')), '/');
        $key = trim((string) ($raw['apiKey'] ?? ''));
        $model = trim((string) ($raw['model'] ?? ''));
        if ($base === '' || $key === '' || $model === '') throw new ApiError(422, 'byok_incomplete', 'BYOK 需要 baseUrl、model 与 apiKey');
        if (strlen($key) < 8 || strlen($key) > 300) throw new ApiError(422, 'byok_key_invalid', 'API Key 长度不合法');
        if (mb_strlen($model, 'UTF-8') > 100) throw new ApiError(422, 'byok_model_invalid', '模型名称过长');
        $parts = parse_url($base);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])) {
            throw new ApiError(422, 'byok_url_invalid', 'BYOK Base URL 必须使用 HTTPS');
        }
        $host = strtolower((string) $parts['host']);
        if ($host === 'localhost' || str_ends_with($host, '.local') || str_ends_with($host, '.internal')) {
            throw new ApiError(422, 'byok_url_invalid', '不允许访问本地或内网地址');
        }
        $port = (int) ($parts['port'] ?? 443);
        if ($port < 1 || $port > 65535) {
            throw new ApiError(422, 'byok_url_invalid', 'BYOK Base URL 端口无效');
        }
        $ip = self::resolvePublicHost($host);
        return ['base_url' => $base, 'api_key' => $key, 'model' => $model, 'resolve' => $host . ':' . $port . ':' . $ip];
    }

    private static function resolvePublicHost(string $host): string
    {
        $literal = filter_var($host, FILTER_VALIDATE_IP);
        $ip = $literal !== false ? $literal : gethostbyname($host);
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw new ApiError(422, 'byok_url_invalid', '不允许访问私网、保留或无法解析的地址');
        }
        return $ip;
    }

    private static function consume(int $userId): bool
    {
        $limit = self::limitFor($userId);
        if ($limit <= 0) return false;
        $pdo = Db::pdo();
        $today = date('Y-m-d');
        $stmt = $pdo->prepare('SELECT used_count FROM ai_usage WHERE user_id = ? AND usage_day = ?');
        $stmt->execute([$userId, $today]);
        $used = (int) ($stmt->fetchColumn() ?: 0);
        if ($used >= $limit) return false;
        $stmt = $pdo->prepare(
            'INSERT INTO ai_usage (user_id, usage_day, used_count) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE used_count = used_count + 1'
        );
        $stmt->execute([$userId, $today]);
        return true;
    }

    private static function usedToday(int $userId): int
    {
        $stmt = Db::pdo()->prepare('SELECT used_count FROM ai_usage WHERE user_id = ? AND usage_day = ?');
        $stmt->execute([$userId, date('Y-m-d')]);
        return (int) ($stmt->fetchColumn() ?: 0);
    }

    private static function systemPrompt(): string
    {
        $append = trim((string) Settings::get('ai.system_prompt_append', ''));
        return '你是“心迹 ECG Lab”的中文心电图教学导师，服务医学生与住院医师。'
            . '只做教学解释，不提供针对真实患者的个体化诊疗指令，不替代临床医生。'
            . '必须基于给定的心电图知识与客观线索回答；不确定时明确说“不确定”，不要编造数字或指南。'
            . '用简体中文，先给结论，再给 2–4 条依据，最后给一条下一次识别的动作；可用简短 Markdown（小标题、粗体、编号列表）组织；不要输出 JSON 或代码块。'
            . '学生追问必须优先回答，即使与当前题目无关；若超出心电图教学范围，简短说明并建议咨询相应领域。'
            . '涉及急症时提醒按当地急救流程处理。'
            . ($append !== '' ? "
站点管理员补充要求：" . $append : '');
    }

    private static function diagnosisContext(array $d): string
    {
        $lines = [
            '诊断：' . $d['name'] . '（' . ($d['en'] ?? '') . '）',
            '一句话：' . ($d['oneLiner'] ?? ''),
            '特异性：' . ($d['specificity'] ?? ''),
            '诊断标准：' . implode('；', array_slice($d['criteria'] ?? [], 0, 4)),
            '处理：' . implode('；', array_slice($d['management'] ?? [], 0, 3)),
            '易错点：' . implode('；', array_slice($d['pitfalls'] ?? [], 0, 2)),
        ];
        return implode("\n", $lines);
    }

    private static function localChatAnswer(string $message, ?array $diagnosis): string
    {
        if ($diagnosis) {
            return '关于「' . $diagnosis['name'] . '」：' . ($diagnosis['oneLiner'] ?? '')
                . ' 最具特异性的线索是：' . ($diagnosis['specificity'] ?? '')
                . ' 判读时先看：' . implode('；', array_slice($diagnosis['reading'] ?? [], 0, 3))
                . '（本地知识库回答；AI 未配置或暂不可用。）';
        }
        return '请先选择一篇诊断文章，或在问题中描述心电图特征（频率、节律、P 波、QRS 宽度、ST-T）。'
            . '本地学习建议：按“节律 → 频率 → 间期 → 形态 → 鉴别”的顺序判读，并对照诊断标准逐条确认。'
            . '（本地知识库回答；AI 未配置或暂不可用。）';
    }

    private static function localExplain(array $correct, array $selectedNames, array $correctNames, bool $isCorrect): string
    {
        if ($correct === []) {
            return '未找到该题的诊断内容，请重新练习。';
        }
        $primary = $correct[0];
        $text = $isCorrect ? '判断正确。' : '正确答案是：' . implode('、', $correctNames) . '。';
        $text .= '最关键的特异性线索：' . ($primary['specificity'] ?? $primary['oneLiner'] ?? '');
        if (!$isCorrect && $selectedNames !== []) {
            $text .= ' 你选择了 ' . implode('、', $selectedNames) . '，请对照鉴别诊断逐条排除。';
        }
        $text .= ' 下一次先固定判读顺序：节律 → 频率 → PR/QRS/QT → ST-T → 鉴别。';
        return $text;
    }

    public static function stream(int $userId, string $mode, array $input, ?array $byok = null): never
    {
        set_time_limit(180);
        $byok = self::byokConfig($byok);
        if (!self::allowedForUser($userId, $byok !== null)) throw new ApiError(403, 'ai_guest_disabled', '当前站点未开放未登录用户使用 AI；如需使用自己的密钥，请先开启 BYOK。');
        if ($mode === 'chat') {
            $message = trim((string) ($input['message'] ?? ''));
            if ($message === '' || mb_strlen($message, 'UTF-8') > 600) throw new ApiError(422, 'invalid_message', '问题需为 1–600 字');
            $diagnosisId = isset($input['diagnosisId']) && $input['diagnosisId'] !== '' ? (string) $input['diagnosisId'] : null;
            $built = self::chatMessages($message, $diagnosisId ? Content::find($diagnosisId) : null);
            $context = $diagnosisId && Content::find($diagnosisId) ? ['基于文章：' . Content::find($diagnosisId)['name']] : ['未指定具体诊断'];
        } elseif ($mode === 'explain') {
            $built = self::explainMessages($userId, (int) ($input['attemptId'] ?? 0), (string) ($input['question'] ?? ''));
            $context = $built['context'] ?? [];
        } else {
            throw new ApiError(422, 'invalid_mode', '不支持的 AI 模式');
        }

        $localOnly = $byok === null && !self::configured();
        if (!$localOnly && $byok === null && !self::consume($userId)) $localOnly = true;
        $source = $localOnly ? 'local' : ($byok !== null ? 'byok' : 'ai');

        self::sseStart();
        self::sse('meta', ['source' => $source, 'fallback' => $localOnly, 'context' => $context]);

        if ($localOnly) {
            self::sseText($built['fallback'] . (self::configured() ? "\n\n（今日 AI 额度已用完，以上为本地知识库回答。）" : ''));
            self::sse('done', ['source' => 'local', 'fallback' => true]);
            exit;
        }

        $result = self::streamProvider($built['messages'], $mode === 'chat' ? 0.35 : 0.3, $byok);
        if (!$result['ok']) {
            $note = $result['text'] === ''
                ? $built['fallback'] . "\n\n（AI 服务暂时不可用，以上为本地知识库回答。）"
                : "\n\n（AI 流式输出中断，以上内容可能不完整。）";
            self::sseText($note);
            self::sse('done', ['source' => 'local', 'fallback' => true, 'interrupted' => true]);
            exit;
        }
        $cost = self::recordUsage($userId, $mode, $result, $source);
        self::sse('done', ['source' => $source, 'fallback' => false, 'usage' => $result['usage'], 'cost' => $cost]);
        exit;
    }

    private static function streamProvider(array $messages, float $temperature, ?array $byok): array
    {
        $provider = self::provider();
        $base = rtrim((string) ($byok['base_url'] ?? $provider['base_url'] ?? Config::get('ai.base_url', '')), '/');
        $apiKey = (string) ($byok['api_key'] ?? $provider['api_key'] ?? Config::get('ai.api_key', ''));
        $model = (string) ($byok['model'] ?? $provider['default_model'] ?? ($provider['models'][0] ?? Config::get('ai.model', 'gpt-4o-mini')));
        $providerName = $byok !== null ? 'BYOK' : (string) ($provider['name'] ?? '兼容接口');
        $result = ['ok' => false, 'usage' => ['prompt' => 0, 'completion' => 0], 'model' => $model, 'provider' => $providerName, 'text' => ''];
        if ($base === '') return $result;
        $url = str_ends_with($base, '/chat/completions') ? $base : $base . '/chat/completions';
        $maxTokens = max(64, min(4000, (int) Settings::get('ai.max_tokens', 1200)));

        $attempt = function (bool $withUsage) use ($url, $apiKey, $messages, $temperature, $model, $maxTokens, $byok, &$result): bool {
            $payload = [
                'model' => $model,
                'messages' => $messages,
                'temperature' => $temperature,
                'max_tokens' => $maxTokens,
                'stream' => true,
            ];
            if ($withUsage) $payload['stream_options'] = ['include_usage' => true];
            $buffer = '';
            $ch = curl_init($url);
            if ($ch === false) return false;
            $write = function ($ch, string $chunk) use (&$buffer, &$result): int {
                $buffer .= $chunk;
                while (($pos = strpos($buffer, "\n")) !== false) {
                    $line = trim(substr($buffer, 0, $pos));
                    $buffer = substr($buffer, $pos + 1);
                    if (!str_starts_with($line, 'data:')) continue;
                    $json = trim(substr($line, 5));
                    if ($json === '' || $json === '[DONE]') continue;
                    $data = json_decode($json, true);
                    if (!is_array($data)) continue;
                    if (is_array($data['usage'] ?? null)) {
                        $result['usage'] = [
                            'prompt' => max(0, (int) ($data['usage']['prompt_tokens'] ?? 0)),
                            'completion' => max(0, (int) ($data['usage']['completion_tokens'] ?? 0)),
                        ];
                    }
                    $delta = $data['choices'][0]['delta']['content'] ?? null;
                    if (is_string($delta) && $delta !== '') {
                        $result['text'] .= $delta;
                        self::sse('delta', ['t' => $delta]);
                    }
                }
                return strlen($chunk);
            };
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_RETURNTRANSFER => false,
                CURLOPT_CONNECTTIMEOUT => 6,
                CURLOPT_TIMEOUT => 120,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_HTTPHEADER => [
                    'Content-Type: application/json',
                    'Accept: text/event-stream',
                    'Authorization: Bearer ' . $apiKey,
                ],
                CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                CURLOPT_WRITEFUNCTION => $write,
            ] + (defined('CURLOPT_PROTOCOLS') ? [CURLOPT_PROTOCOLS => CURLPROTO_HTTPS] : []));
            if (!empty($byok['resolve'])) curl_setopt($ch, CURLOPT_RESOLVE, [(string) $byok['resolve']]);
            $ok = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $error = curl_error($ch);
            curl_close($ch);
            if ($ok === false || $status < 200 || $status >= 300) {
                error_log('[ai] stream failed status=' . $status . ' error=' . $error);
                return false;
            }
            return true;
        };

        $ok = $attempt(true);
        if (!$ok && $result['text'] === '') {
            // 部分供应商不接受 stream_options，退化为不带 usage 的流式请求
            $ok = $attempt(false);
        }
        $result['ok'] = $ok && trim($result['text']) !== '';
        return $result;
    }

    private static function sseStart(): void
    {
        while (ob_get_level() > 0) {
            @ob_end_flush();
        }
        header('Content-Type: text/event-stream; charset=utf-8');
        header('Cache-Control: no-cache, no-store');
        header('X-Accel-Buffering: no');
        header('Connection: keep-alive');
    }

    private static function sse(string $event, array $data): void
    {
        echo 'event: ' . $event . "\n";
        echo 'data: ' . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n\n";
        @ob_flush();
        @flush();
    }

    private static function sseText(string $text): void
    {
        $length = mb_strlen($text, 'UTF-8');
        for ($i = 0; $i < $length; $i += 40) {
            self::sse('delta', ['t' => mb_substr($text, $i, 40, 'UTF-8')]);
        }
    }

    private static function recordUsage(int $userId, string $mode, array $result, string $source): array
    {
        $usage = is_array($result['usage'] ?? null) ? $result['usage'] : ['prompt' => 0, 'completion' => 0];
        $prompt = max(0, (int) ($usage['prompt'] ?? 0));
        $completion = max(0, (int) ($usage['completion'] ?? 0));
        $model = (string) ($result['model'] ?? '');
        $provider = (string) ($result['provider'] ?? '');
        $pricing = self::pricing();
        $rate = $pricing[$model] ?? $pricing['*'] ?? ['input' => 0, 'output' => 0];
        $discount = self::discountNow();
        $ratio = $discount ? max(0.0, min(1.0, (float) ($discount['ratio'] ?? 1))) : 1.0;
        $cost = ((($prompt / 1000000) * (float) ($rate['input'] ?? 0)) + (($completion / 1000000) * (float) ($rate['output'] ?? 0))) * $ratio;
        $micro = (int) round($cost * 1000000);
        try {
            Db::pdo()->prepare(
                'INSERT INTO ai_usage_log (user_id, provider, model, mode, prompt_tokens, completion_tokens, total_tokens, cost_micro, discount_label, discount_ratio, source)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([$userId, $provider, $model, $mode, $prompt, $completion, $prompt + $completion, $micro, $discount['label'] ?? null, $ratio, $source]);
        } catch (\Throwable $e) {
            error_log('[ai] usage log failed: ' . $e->getMessage());
        }
        return [
            'cost' => round($cost, 6),
            'currency' => (string) Settings::get('ai.currency', '¥'),
            'discount' => $discount['label'] ?? null,
            'ratio' => $ratio,
            'prompt' => $prompt,
            'completion' => $completion,
            'model' => $model,
        ];
    }

    public static function pricing(): array
    {
        $pricing = Settings::get('ai.pricing', []);
        return is_array($pricing) ? $pricing : [];
    }

    private static function discountNow(): ?array
    {
        $discounts = Settings::get('ai.discounts', []);
        if (!is_array($discounts)) return null;
        $now = (int) date('G') * 60 + (int) date('i');
        foreach ($discounts as $discount) {
            $from = self::minutes((string) ($discount['from'] ?? ''));
            $to = self::minutes((string) ($discount['to'] ?? ''));
            if ($from === null || $to === null) continue;
            $match = $from <= $to ? ($now >= $from && $now < $to) : ($now >= $from || $now < $to);
            if ($match) return $discount;
        }
        return null;
    }

    private static function minutes(string $time): ?int
    {
        if (!preg_match('/^(\d{1,2}):(\d{2})$/', trim($time), $m)) return null;
        $h = (int) $m[1];
        $min = (int) $m[2];
        if ($h > 23 || $min > 59) return null;
        return $h * 60 + $min;
    }

    public static function costSettings(): array
    {
        $discount = self::discountNow();
        return [
            'currency' => (string) Settings::get('ai.currency', '¥'),
            'pricing' => self::pricing(),
            'discounts' => Settings::get('ai.discounts', []) ?: [],
            'maxTokens' => (int) Settings::get('ai.max_tokens', 1200),
            'activeDiscount' => $discount['label'] ?? null,
        ];
    }

    public static function saveCostSettings(array $input): array
    {
        $pricing = [];
        foreach ((array) ($input['pricing'] ?? []) as $model => $rate) {
            if (!is_array($rate)) continue;
            $model = trim((string) $model);
            if ($model === '' || mb_strlen($model, 'UTF-8') > 100) continue;
            $pricing[$model] = [
                'input' => max(0, min(1000000, (float) ($rate['input'] ?? 0))),
                'output' => max(0, min(1000000, (float) ($rate['output'] ?? 0))),
            ];
        }
        $discounts = [];
        foreach ((array) ($input['discounts'] ?? []) as $discount) {
            if (!is_array($discount)) continue;
            $from = (string) ($discount['from'] ?? '');
            $to = (string) ($discount['to'] ?? '');
            if (self::minutes($from) === null || self::minutes($to) === null) continue;
            $discounts[] = [
                'label' => mb_substr(trim((string) ($discount['label'] ?? '折扣')), 0, 20, 'UTF-8') ?: '折扣',
                'from' => $from,
                'to' => $to,
                'ratio' => max(0.0, min(1.0, (float) ($discount['ratio'] ?? 1))),
            ];
        }
        $currency = mb_substr(trim((string) ($input['currency'] ?? '¥')), 0, 8, 'UTF-8') ?: '¥';
        $maxTokens = max(128, min(4000, (int) ($input['maxTokens'] ?? 1200)));
        Settings::setMany([
            'ai.pricing' => $pricing,
            'ai.discounts' => $discounts,
            'ai.currency' => $currency,
            'ai.max_tokens' => $maxTokens,
        ]);
        return self::costSettings();
    }

    public static function costSummary(int $days = 30): array
    {
        $days = max(1, min(90, $days));
        $start = date('Y-m-d 00:00:00', strtotime('-' . ($days - 1) . ' days'));
        $pdo = Db::pdo();
        $tot = $pdo->prepare('SELECT COALESCE(SUM(cost_micro),0) cost, COALESCE(SUM(prompt_tokens),0) prompt, COALESCE(SUM(completion_tokens),0) completion, COUNT(*) calls FROM ai_usage_log WHERE created_at >= ?');
        $tot->execute([$start]);
        $totals = $tot->fetch() ?: [];
        $today = $pdo->prepare('SELECT COALESCE(SUM(cost_micro),0) cost, COALESCE(SUM(prompt_tokens),0) prompt, COALESCE(SUM(completion_tokens),0) completion, COUNT(*) calls FROM ai_usage_log WHERE created_at >= CURDATE()');
        $today->execute();
        $todayRow = $today->fetch() ?: [];
        $seriesStmt = $pdo->prepare('SELECT DATE(created_at) day, SUM(cost_micro) cost, COUNT(*) calls FROM ai_usage_log WHERE created_at >= ? GROUP BY DATE(created_at) ORDER BY day ASC');
        $seriesStmt->execute([$start]);
        $byDay = [];
        foreach ($seriesStmt->fetchAll() as $row) $byDay[(string) $row['day']] = $row;
        $series = [];
        for ($i = 0; $i < $days; $i++) {
            $day = date('Y-m-d', strtotime('-' . ($days - 1 - $i) . ' days'));
            $series[] = ['day' => $day, 'cost' => (int) ($byDay[$day]['cost'] ?? 0) / 1000000, 'calls' => (int) ($byDay[$day]['calls'] ?? 0)];
        }
        $modelsStmt = $pdo->prepare('SELECT provider, model, SUM(cost_micro) cost, SUM(prompt_tokens) prompt, SUM(completion_tokens) completion, COUNT(*) calls FROM ai_usage_log WHERE created_at >= ? GROUP BY provider, model ORDER BY cost DESC LIMIT 20');
        $modelsStmt->execute([$start]);
        $models = array_map(static fn (array $row): array => [
            'provider' => (string) $row['provider'],
            'model' => (string) $row['model'],
            'cost' => (int) $row['cost'] / 1000000,
            'prompt' => (int) $row['prompt'],
            'completion' => (int) $row['completion'],
            'calls' => (int) $row['calls'],
        ], $modelsStmt->fetchAll());
        $recentStmt = $pdo->prepare('SELECT l.created_at, l.user_id, l.provider, l.model, l.mode, l.prompt_tokens, l.completion_tokens, l.cost_micro, l.discount_label, l.discount_ratio, l.source, u.display_name FROM ai_usage_log l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 30');
        $recentStmt->execute();
        $recent = array_map(static fn (array $row): array => [
            'createdAt' => (string) $row['created_at'],
            'user' => (string) ($row['display_name'] ?? '未知'),
            'provider' => (string) $row['provider'],
            'model' => (string) $row['model'],
            'mode' => (string) $row['mode'],
            'prompt' => (int) $row['prompt_tokens'],
            'completion' => (int) $row['completion_tokens'],
            'cost' => (int) $row['cost_micro'] / 1000000,
            'discount' => (string) ($row['discount_label'] ?? ''),
            'source' => (string) $row['source'],
        ], $recentStmt->fetchAll());
        return [
            'days' => $days,
            'currency' => (string) Settings::get('ai.currency', '¥'),
            'settings' => self::costSettings(),
            'today' => [
                'cost' => (int) ($todayRow['cost'] ?? 0) / 1000000,
                'prompt' => (int) ($todayRow['prompt'] ?? 0),
                'completion' => (int) ($todayRow['completion'] ?? 0),
                'calls' => (int) ($todayRow['calls'] ?? 0),
            ],
            'totals' => [
                'cost' => (int) ($totals['cost'] ?? 0) / 1000000,
                'prompt' => (int) ($totals['prompt'] ?? 0),
                'completion' => (int) ($totals['completion'] ?? 0),
                'calls' => (int) ($totals['calls'] ?? 0),
            ],
            'series' => $series,
            'models' => $models,
            'recent' => $recent,
        ];
    }

    public static function billingNow(): array
    {
        $discount = self::discountNow();
        return ['label' => $discount['label'] ?? null, 'ratio' => $discount ? (float) ($discount['ratio'] ?? 1) : 1.0];
    }
}
