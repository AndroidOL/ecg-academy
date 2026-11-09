<?php
declare(strict_types=1);

namespace App;

final class AiGuard
{
    private const ECG_TERMS = [
        '心电', '窦性', '房颤', '心房颤动', '房扑', '室速', '室颤', '心动过速', '心动过缓', '早搏', '期前', '阻滞',
        '导联', '电轴', '向量', 'p波', 'pr', 'qrs', 'qt', 'st', 't波', 'u波', 'stemi', 'nstemi', '缺血', '梗死',
        '心肌', '肥厚', '电解质', '高钾', '低钾', '高钙', '低钙', '镁', '洋地黄', '起搏', '除颤', '复律', 'acls',
        'cpr', '心肺复苏', '心电图', 'ecg', 'ekg', 'wellens', 'brugada', 'wpw', '预激', 'qtc', '长qt', 'brugada',
        '读图', '判读', '波形', '间期', '心律', '心律失常', '房室', '束支', '分支', '逸搏', '交界性', '室上性',
        '胸前导联', '肢体导联', '18导联', '后壁', '右室', '前壁', '下壁', '侧壁', '心梗', 'acs', '胸痛', '晕厥',
        '心悸', '低血压', '急救', '复苏', '电生理', '动作电位', '复极', '除极', '向量环', '投影',
        '诊断', '错题', '复习', '学习', '鉴别', '机制', '处理', '治疗', '用药', '指南', '危急值', '临床',
    ];

    private const BLOCK_PATTERNS = [
        '/忽略.{0,12}(以上|之前|系统|提示|指令)/u',
        '/无视.{0,12}(规则|提示|指令|限制)/u',
        '/系统提示词|提示词|prompt|system prompt|开发者模式|developer mode|越狱|jailbreak|DAN|不受限制|绕过限制|绕过安全/u',
        '/扮演|角色扮演|act as|pretend to be|你现在是|假装/u',
        '/api.?key|密钥|密码|token|访问令牌|数据库|sql|shell|代码|编程|写一个程序|脚本/u',
        '/政治|选举|色情|暴力|赌博|股票|彩票|加密货币|翻译成|写诗|作文|情感|恋爱/u',
    ];

    public static function user(int $userId): array
    {
        $stmt = Db::pdo()->prepare('SELECT id, is_guest, is_admin, is_active, xp, level_override, ai_credits, ai_violations, ai_disabled_until, ai_last_request_at FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if (!$row || (int) ($row['is_active'] ?? 1) !== 1) throw new ApiError(403, 'account_disabled', '账号不可用');
        return $row;
    }

    public static function level(array $user): int
    {
        return Level::levelFrom((int) ($user['xp'] ?? 0), $user['level_override'] === null ? null : (int) $user['level_override']);
    }

    public static function isAdmin(array $user): bool
    {
        return (int) ($user['is_admin'] ?? 0) === 1;
    }

    public static function isChargeMode(string $mode): bool
    {
        return in_array($mode, ['chat', 'quiz'], true);
    }

    /**
     * Pre-flight checks. Returns a receipt used by finalize() after a successful call.
     */
    public static function check(int $userId, string $mode, string $message = '', ?string $diagnosisId = null, bool $byok = false): array
    {
        $user = self::user($userId);
        $admin = self::isAdmin($user);
        if ((int) $user['is_guest'] === 1) throw new ApiError(403, 'ai_login_required', 'AI 导师仅对注册用户开放，请先注册并登录');
        $level = self::level($user);
        $required = max(1, Settings::int('ai.level_required', 10));
        if (!$admin && !$byok && self::isChargeMode($mode) && $level < $required) {
            throw new ApiError(403, 'ai_level_required', "AI 导师对话需达到 Lv.{$required}；可先通过每日挑战积累经验与次数");
        }
        if (!$admin && !empty($user['ai_disabled_until'])) {
            throw new ApiError(403, 'ai_temporarily_disabled', 'AI 权限已被暂停，请联系管理员恢复');
        }
        // Validate the prompt before reserving credits/quota: a blocked request
        // must not consume a daily AI credit.
        if (!$admin && $message !== '') {
            $verdict = self::inspect($message, $diagnosisId);
            if ($verdict !== null) {
                $count = self::violation($user, $verdict['reason'], $message);
                $limit = max(1, Settings::int('ai.violation_limit', 5));
                $tail = $count >= $limit ? '已暂停 AI 权限，请联系管理员恢复。' : '连续越界将暂停 AI 权限。';
                throw new ApiError(403, 'ai_scope_blocked', 'AI 导师只回答心电图与心血管电生理教学问题。' . $tail, ['violations' => $count]);
            }
        }
        $receipt = [
            'user' => $user,
            'admin' => $admin,
            'mode' => $mode,
            'charge_credit' => !$admin && !$byok && self::isChargeMode($mode),
            'charge_analysis' => !$admin && !$byok && !self::isChargeMode($mode),
            'charge_account' => !$admin && !$byok,
            'ip_hash' => hash('sha256', Http::clientIp()),
            'credit_consumed' => false,
        ];
        if (!$admin) {
            $interval = max(0, Settings::int('ai.min_interval_seconds', 5));
            if ($interval > 0 && !empty($user['ai_last_request_at'])) {
                $elapsed = time() - strtotime((string) $user['ai_last_request_at']);
                if ($elapsed < $interval) {
                    $retry = $interval - $elapsed;
                    throw new ApiError(429, 'ai_interval', "提问过快，请 {$retry} 秒后再试", ['retryAfter' => $retry]);
                }
            }
            if (!$byok && $receipt['charge_credit']) {
                $reserve = Db::pdo()->prepare('UPDATE users SET ai_credits = ai_credits - 1 WHERE id = ? AND ai_credits > 0');
                $reserve->execute([$userId]);
                if ($reserve->rowCount() < 1) {
                    throw new ApiError(403, 'ai_no_credits', 'AI 对话次数已用完；完成每日挑战可获得次数（每日 10 次 + 答对题数）');
                }
                $receipt['credit_consumed'] = true;
            }
            if (!$byok && $receipt['charge_analysis']) {
                $limit = max(1, Settings::int('ai.analysis_daily_limit', 5));
                $stmt = Db::pdo()->prepare('SELECT used_count FROM ai_analysis_usage WHERE user_id = ? AND usage_day = CURDATE()');
                $stmt->execute([$userId]);
                if ((int) ($stmt->fetchColumn() ?: 0) >= $limit) {
                    throw new ApiError(429, 'ai_analysis_limit', '今日 AI 错因分析次数已用完');
                }
            }
            if (!$byok) self::consumeAccountAndIp($userId, $receipt['ip_hash']);
        }
        return $receipt;
    }

    public static function inspect(string $message, ?string $diagnosisId = null): ?array
    {
        $text = mb_strtolower(trim($message), 'UTF-8');
        if ($text === '') return null;
        foreach (self::BLOCK_PATTERNS as $pattern) {
            if (preg_match($pattern, $text)) return ['reason' => 'jailbreak_or_offtopic'];
        }
        $compact = preg_replace('/\s+/u', '', $text) ?? $text;
        foreach (self::ECG_TERMS as $term) {
            if (str_contains($compact, $term)) return null;
        }
        if ($diagnosisId !== null && $diagnosisId !== '' && mb_strlen($text, 'UTF-8') <= 80
            && preg_match('/为什么|怎么|如何|解释|区别|鉴别|机制|处理|治疗|危险|严重|用药|预后|下一步|复习|判断/u', $compact)) {
            return null;
        }
        return ['reason' => 'off_topic'];
    }

    public static function finalize(array $receipt, string $question, string $answer, string $source, array $usage = [], array $flags = []): void
    {
        $userId = (int) $receipt['user']['id'];
        $pdo = Db::pdo();
        if ($receipt['credit_consumed'] && !$receipt['charge_credit']) {
            // The request fell back to local knowledge; return the reserved credit.
            $pdo->prepare('UPDATE users SET ai_credits = LEAST(?, ai_credits + 1) WHERE id = ?')->execute([max(1, Settings::int('ai.credit_cap', 100)), $userId]);
            $receipt['credit_consumed'] = false;
        }
        if ($receipt['charge_analysis']) {
            $pdo->prepare(
                'INSERT INTO ai_analysis_usage (user_id, usage_day, used_count) VALUES (?, CURDATE(), 1)
                 ON DUPLICATE KEY UPDATE used_count = used_count + 1'
            )->execute([$userId]);
        }
        $pdo->prepare('UPDATE users SET ai_last_request_at = NOW() WHERE id = ?')->execute([$userId]);
        self::log($userId, (string) $receipt['mode'], $question, $answer, $source, $usage, (string) $receipt['ip_hash'], $flags + [
            'credit_consumed' => $receipt['credit_consumed'] ? 1 : 0,
            'admin' => $receipt['admin'] ? 1 : 0,
        ]);
    }

    public static function log(int $userId, string $mode, string $question, string $answer, string $source, array $usage = [], string $ipHash = '', array $flags = []): void
    {
        try {
            Db::pdo()->prepare(
                'INSERT INTO ai_conversations (user_id, ip_hash, mode, question, answer, source, account_charge, prompt_tokens, completion_tokens, cost_micro, flags)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $userId > 0 ? $userId : null,
                $ipHash,
                mb_substr($mode, 0, 24, 'UTF-8'),
                mb_substr($question, 0, 6000, 'UTF-8'),
                mb_substr($answer, 0, 12000, 'UTF-8'),
                mb_substr($source, 0, 8, 'UTF-8'),
                !empty($flags['credit_consumed']) ? 1 : 0,
                max(0, (int) ($usage['prompt'] ?? 0)),
                max(0, (int) ($usage['completion'] ?? 0)),
                max(0, (int) ($usage['cost_micro'] ?? 0)),
                json_encode($flags, JSON_UNESCAPED_UNICODE),
            ]);
        } catch (\Throwable $e) {
            error_log('[ai-log] ' . $e->getMessage());
        }
    }

    public static function violation(array $user, string $reason, string $snippet): int
    {
        $userId = (int) $user['id'];
        $pdo = Db::pdo();
        $ipHash = hash('sha256', Http::clientIp());
        $pdo->prepare('INSERT INTO ai_violation_log (user_id, ip_hash, reason, snippet) VALUES (?, ?, ?, ?)')
            ->execute([$userId, $ipHash, mb_substr($reason, 0, 80, 'UTF-8'), mb_substr($snippet, 0, 320, 'UTF-8')]);
        $pdo->prepare('UPDATE users SET ai_violations = ai_violations + 1 WHERE id = ?')->execute([$userId]);
        $window = max(1, Settings::int('ai.violation_window_hours', 24));
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM ai_violation_log WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)');
        $stmt->execute([$userId, $window]);
        $count = (int) $stmt->fetchColumn();
        $limit = max(1, Settings::int('ai.violation_limit', 5));
        if ($count >= $limit) {
            $hours = max(1, Settings::int('ai.disabled_hours', 24));
            $pdo->prepare('UPDATE users SET ai_disabled_until = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id = ?')->execute([$hours, $userId]);
        }
        return $count;
    }

    public static function reset(int $userId): void
    {
        Db::pdo()->prepare('UPDATE users SET ai_violations = 0, ai_disabled_until = NULL WHERE id = ?')->execute([$userId]);
    }

    public static function grant(int $userId, int $amount, string $reason, ?string $refDay = null): array
    {
        $user = self::user($userId);
        if (self::isAdmin($user)) return ['granted' => 0, 'credits' => (int) $user['ai_credits']];
        if (self::level($user) < max(1, Settings::int('ai.level_required', 10))) return ['granted' => 0, 'credits' => (int) $user['ai_credits']];
        $cap = max(1, Settings::int('ai.credit_cap', 100));
        $current = (int) $user['ai_credits'];
        $next = min($cap, $current + max(0, $amount));
        $granted = $next - $current;
        if ($granted > 0) {
            Db::pdo()->prepare('UPDATE users SET ai_credits = ? WHERE id = ?')->execute([$next, $userId]);
            Db::pdo()->prepare('INSERT INTO ai_credit_log (user_id, delta, balance, reason, ref_day) VALUES (?, ?, ?, ?, ?)')
                ->execute([$userId, $granted, $next, mb_substr($reason, 0, 80, 'UTF-8'), $refDay]);
        }
        return ['granted' => $granted, 'credits' => $next];
    }

    public static function status(int $userId): array
    {
        $user = self::user($userId);
        $level = self::level($user);
        $required = max(1, Settings::int('ai.level_required', 10));
        $disabledUntil = !empty($user['ai_disabled_until']) ? (string) $user['ai_disabled_until'] : null;
        $analysisLimit = max(1, Settings::int('ai.analysis_daily_limit', 5));
        $stmt = Db::pdo()->prepare('SELECT used_count FROM ai_analysis_usage WHERE user_id = ? AND usage_day = CURDATE()');
        $stmt->execute([$userId]);
        $analysisUsed = (int) ($stmt->fetchColumn() ?: 0);
        return [
            'registered' => (int) $user['is_guest'] === 0,
            'level' => $level,
            'levelRequired' => $required,
            'levelUnlocked' => self::isAdmin($user) || $level >= $required,
            'credits' => (int) $user['ai_credits'],
            'creditCap' => max(1, Settings::int('ai.credit_cap', 100)),
            'violations' => (int) $user['ai_violations'],
            'disabledUntil' => $disabledUntil,
            'analysisLimit' => $analysisLimit,
            'analysisUsed' => $analysisUsed,
            'analysisRemaining' => max(0, $analysisLimit - $analysisUsed),
            'admin' => self::isAdmin($user),
        ];
    }

    private static function consumeAccountAndIp(int $userId, string $ipHash): void
    {
        $limit = max(1, Settings::int('ai.daily_limit', 30));
        $stmt = Db::pdo()->prepare('SELECT used_count FROM ai_usage WHERE user_id = ? AND usage_day = CURDATE()');
        $stmt->execute([$userId]);
        if ((int) ($stmt->fetchColumn() ?: 0) >= $limit) throw new ApiError(429, 'ai_daily_limit', '今日 AI 使用次数已达上限');
        $ipLimit = max(1, Settings::int('ai.ip_daily_limit', 60));
        $stmt = Db::pdo()->prepare('SELECT used_count FROM ai_ip_usage WHERE ip_hash = ? AND usage_day = CURDATE()');
        $stmt->execute([$ipHash]);
        if ((int) ($stmt->fetchColumn() ?: 0) >= $ipLimit) throw new ApiError(429, 'ai_ip_limit', '当前网络今日 AI 使用次数已达上限');
        Db::pdo()->prepare(
            'INSERT INTO ai_usage (user_id, usage_day, used_count) VALUES (?, CURDATE(), 1)
             ON DUPLICATE KEY UPDATE used_count = used_count + 1'
        )->execute([$userId]);
        Db::pdo()->prepare(
            'INSERT INTO ai_ip_usage (ip_hash, usage_day, used_count) VALUES (?, CURDATE(), 1)
             ON DUPLICATE KEY UPDATE used_count = used_count + 1'
        )->execute([$ipHash]);
    }
}
