<?php
declare(strict_types=1);

namespace App;

final class Level
{
    public const THRESHOLDS = [
        1 => 0, 2 => 80, 3 => 200, 4 => 400, 5 => 700,
        6 => 1100, 7 => 1600, 8 => 2200, 9 => 3000, 10 => 4000,
        11 => 5200, 12 => 6600, 13 => 8200, 14 => 10000, 15 => 12000,
        16 => 14500, 17 => 17500, 18 => 21000, 19 => 25000, 20 => 30000,
    ];
    public const MAX = 20;
    public const ADVANCED_UNLOCK = 3;
    public const CHALLENGE_UNLOCK = 5;

    public static function levelFrom(int $xp, ?int $override = null): int
    {
        $xp = max(0, $xp);
        $level = 1;
        foreach (self::THRESHOLDS as $candidate => $threshold) {
            if ($xp >= $threshold) $level = $candidate;
        }
        if ($override !== null && $override > 0) $level = max(1, min(self::MAX, $override));
        return $level;
    }

    public static function forXp(int $xp, ?int $override = null): array
    {
        $xp = max(0, $xp);
        $level = self::levelFrom($xp, $override);
        $start = self::THRESHOLDS[$level] ?? 0;
        $next = $level < self::MAX ? (self::THRESHOLDS[$level + 1] ?? null) : null;
        $progress = $next === null ? 100 : (int) round((($xp - $start) / max(1, $next - $start)) * 100);
        return [
            'level' => $level,
            'xp' => $xp,
            'levelStart' => $start,
            'nextXp' => $next,
            'progress' => max(0, min(100, $progress)),
            'isMax' => $next === null,
            'override' => $override,
            'unlocks' => [
                'advanced' => self::ADVANCED_UNLOCK,
                'challenge' => self::CHALLENGE_UNLOCK,
                'advancedOpen' => $level >= self::ADVANCED_UNLOCK,
                'challengeOpen' => $level >= self::CHALLENGE_UNLOCK,
            ],
        ];
    }

    public static function forUser(int $userId): array
    {
        $stmt = Db::pdo()->prepare('SELECT xp, level_override FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if (!$row) return self::forXp(0);
        $override = $row['level_override'] === null ? null : (int) $row['level_override'];
        return self::forXp((int) $row['xp'], $override);
    }

    public static function canUseQuizLevel(array $user, int $requested): bool
    {
        if ((int) ($user['is_admin'] ?? 0) === 1) return true;
        // 游客 XP 存在浏览器本地，由前端按同一阈值解锁；服务端不阻断。
        if ((int) ($user['is_guest'] ?? 1) === 1) return true;
        if ($requested < 2) return true;
        $level = self::forUser((int) $user['id'])['level'];
        if ($requested === 2 && $level < self::ADVANCED_UNLOCK) return false;
        if ($requested >= 3 && $level < self::CHALLENGE_UNLOCK) return false;
        return true;
    }
}
