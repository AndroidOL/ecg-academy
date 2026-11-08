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
        $stmt = Db::pdo()->prepare('SELECT ai_daily_limit FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $override = $stmt->fetchColumn();
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
        $diagnosis = $diagnosisId ? Content::find($diagnosisId) : null;
        $fallback = self::localChatAnswer($message, $diagnosis);
        if ($byok === null && !self::configured()) {
            return ['text' => $fallback, 'source' => 'local', 'fallback' => true];
        }
        if ($byok === null && !self::consume($userId)) {
            return ['text' => $fallback . "\n\n（今日 AI 额度已用完，以上为本地知识库回答。）", 'source' => 'local', 'fallback' => true];
        }
        $context = $diagnosis ? self::diagnosisContext($diagnosis) : '未指定具体诊断。';
        $messages = [
            ['role' => 'system', 'content' => self::systemPrompt()],
            ['role' => 'user', 'content' => "教学上下文：\n{$context}\n\n学生问题：{$message}\n\n请用中文回答，先给结论，再给 2–4 条依据；不超过 450 字；结尾提醒这是教学用途。"],
        ];
        $text = self::call($messages, 0.35, $byok);
        if ($text === null) {
            return ['text' => $fallback . "\n\n（AI 服务暂时不可用，以上为本地知识库回答。）", 'source' => 'local', 'fallback' => true];
        }
        return ['text' => $text, 'source' => $byok !== null ? 'byok' : 'ai', 'fallback' => false];
    }

    public static function explain(int $userId, int $attemptId, string $userQuestion = '', ?array $byok = null): array
    {
        $byok = self::byokConfig($byok);
        if (!self::allowedForUser($userId, $byok !== null)) throw new ApiError(403, 'ai_guest_disabled', '当前站点未开放未登录用户使用 AI；如需使用自己的密钥，请先开启 BYOK。');
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
        if ($byok === null && !self::configured()) {
            return ['text' => $fallback, 'source' => 'local', 'fallback' => true];
        }
        if ($byok === null && !self::consume($userId)) {
            return ['text' => $fallback . "\n\n（今日 AI 额度已用完，以上为本地知识库回答。）", 'source' => 'local', 'fallback' => true];
        }
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
            . ($userQuestion !== '' ? "\n学生追问：" . mb_substr(trim($userQuestion), 0, 300, 'UTF-8') : '');
        $messages = [
            ['role' => 'system', 'content' => self::systemPrompt() . "\n你会收到题目、选项、学生选择和心电图摘要。先判断学生错在哪一步，再解释；不要只复述正确答案。"],
            ['role' => 'user', 'content' => $userText . "\n\n请针对学生的选择解释错因或确认正确思路；必须指出最关键的心电图线索，给出下一次识别的动作；不超过 450 字。"],
        ];
        $text = self::call($messages, 0.3, $byok);
        if ($text === null) {
            return ['text' => $fallback . "\n\n（AI 服务暂时不可用，以上为本地知识库回答。）", 'source' => 'local', 'fallback' => true];
        }
        return ['text' => $text, 'source' => $byok !== null ? 'byok' : 'ai', 'fallback' => false];
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
        $text = self::call($messages, 0.4, $byok);
        return [
            'plan' => $local,
            'text' => $text ?? implode(' ', $local['reasons']),
            'source' => $text !== null ? ($byok !== null ? 'byok' : 'ai') : 'local',
            'fallback' => $text === null,
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
        $text = self::call($messages, 0.3, $byok);
        return [
            'text' => $text ?? $fallback,
            'source' => $text !== null ? ($byok !== null ? 'byok' : 'ai') : 'local',
            'fallback' => $text === null,
        ];
    }

    private static function call(array $messages, float $temperature, ?array $byok = null): ?string
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
            'max_tokens' => 700,
        ];
        $ch = curl_init($url);
        if ($ch === false) return null;
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => max(5, (int) Config::get('ai.timeout', 20)),
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
        if (strlen($response) > 262144) return null;
        $data = json_decode($response, true);
        $text = $data['choices'][0]['message']['content'] ?? null;
        if (!is_string($text) || trim($text) === '') return null;
        $text = trim(strip_tags($text));
        return mb_substr($text, 0, 4000, 'UTF-8');
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
            . '回答先给结论，再给 2–4 条依据，最后给一条下一次识别的动作；使用简体中文；不超过 450 字。'
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
}
