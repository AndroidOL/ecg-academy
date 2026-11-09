<?php
declare(strict_types=1);

namespace App;

final class Level
{
    public const THRESHOLDS = [
        1 => 0, 2 => 120, 3 => 300, 4 => 600, 5 => 1050,
        6 => 1650, 7 => 2400, 8 => 3300, 9 => 4500, 10 => 6000,
        11 => 7800, 12 => 9900, 13 => 12300, 14 => 15000, 15 => 18000,
        16 => 21800, 17 => 26300, 18 => 31500, 19 => 37500, 20 => 45000,
    ];
    public const MAX = 20;
    public const ADVANCED_UNLOCK = 5;
    public const CHALLENGE_UNLOCK = 8;
    public const AI_UNLOCK = 10;

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
                'ai' => self::AI_UNLOCK,
                'advancedOpen' => $level >= self::ADVANCED_UNLOCK,
                'challengeOpen' => $level >= self::CHALLENGE_UNLOCK,
                'aiOpen' => $level >= self::AI_UNLOCK,
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
        // 所有难度均可自由练习；未达到解锁等级时由 Scoring 置为 0 分/0 XP。
        return true;
    }
}
