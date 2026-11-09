<?php
declare(strict_types=1);

namespace App;

final class Scoring
{
    public const BASE = [1 => 10, 2 => 15, 3 => 20];
    public const MODE_PENALTY = [
        'learn' => 2,
        'exam' => 3,
        'practice' => 4,
        'daily' => 5,
        'ai' => 2,
    ];
    public const SLOW_THRESHOLD_MS = 15000;
    public const SLOW_SCORE_RATIO = 0.7;
    public const SLOW_XP_RATIO = 0.6;
    public const PARTIAL_SCORE_RATIO = 0.25;
    public const PARTIAL_XP_RATIO = 0.2;

    public static function base(int $difficulty): int
    {
        return self::BASE[max(1, min(3, $difficulty))] ?? 10;
    }

    /**
     * Basic questions stop giving XP at Lv10; advanced/challenge retain value.
     * This prevents high-level players from farming basic questions.
     */
    public static function xpMultiplier(int $difficulty, int $level): float
    {
        $level = max(1, min(Level::MAX, $level));
        if ($difficulty <= 1) {
            if ($level >= 10) return 0.0;
            if ($level >= 8) return 0.3;
            if ($level >= 5) return 0.6;
            return 1.0;
        }
        if ($difficulty === 2) {
            if ($level >= 20) return 0.5;
            if ($level >= 15) return 0.65;
            if ($level >= 10) return 0.8;
            return 1.0;
        }
        if ($level >= 16) return 0.85;
        if ($level >= 11) return 1.0;
        return 1.1;
    }

    public static function unlockLevel(int $difficulty): int
    {
        if ($difficulty >= 3) return Level::CHALLENGE_UNLOCK;
        if ($difficulty === 2) return Level::ADVANCED_UNLOCK;
        return 1;
    }

    public static function unlocked(int $difficulty, int $level): bool
    {
        return max(1, $level) >= self::unlockLevel($difficulty);
    }

    public static function evaluate(array $input): array
    {
        $correct = (bool) ($input['correct'] ?? false);
        $partial = !$correct && (bool) ($input['partial'] ?? false);
        $difficulty = max(1, min(3, (int) ($input['difficulty'] ?? 1)));
        $level = max(1, min(Level::MAX, (int) ($input['level'] ?? 1)));
        $mode = (string) ($input['mode'] ?? 'practice');
        $timeMs = array_key_exists('timeMs', $input) && $input['timeMs'] !== null
            ? max(0, min(600000, (int) $input['timeMs']))
            : null;

        $base = self::base($difficulty);
        $multiplier = self::xpMultiplier($difficulty, $level);
        $penalty = self::MODE_PENALTY[$mode] ?? 4;
        $unlockLevel = self::unlockLevel($difficulty);
        $unlocked = !empty($input['forceUnlocked']) || $level >= $unlockLevel;
        $slow = $correct && $timeMs !== null && $timeMs > self::SLOW_THRESHOLD_MS;
        $timeBonus = 0;
        if ($correct && $timeMs !== null && !$slow) {
            $timeBonus = $timeMs <= 5000 ? 3 : ($timeMs <= 10000 ? 2 : 1);
        }

        if ($correct) {
            $score = $slow ? (int) round($base * self::SLOW_SCORE_RATIO) : $base + $timeBonus;
            $xp = (int) round($base * $multiplier * ($slow ? self::SLOW_XP_RATIO : 1.0));
        } elseif ($partial) {
            $score = (int) round($base * self::PARTIAL_SCORE_RATIO);
            $xp = (int) round($base * $multiplier * self::PARTIAL_XP_RATIO);
        } else {
            $score = -$penalty * $base;
            $xp = -(int) round($base * $multiplier);
        }

        if (!$unlocked) {
            $score = 0;
            $xp = 0;
        }
        return [
            'correct' => $correct,
            'partial' => $partial,
            'slow' => $slow,
            'speed' => $correct ? ($slow ? 'slow' : 'fast') : ($partial ? 'partial' : 'wrong'),
            'difficulty' => $difficulty,
            'level' => $level,
            'base' => $base,
            'timeBonus' => $timeBonus,
            'score' => $score,
            'xp' => $xp,
            'xpMultiplier' => $multiplier,
            'penalty' => $penalty,
            'mode' => $mode,
            'unlocked' => $unlocked,
            'unlockLevel' => $unlockLevel,
        ];
    }
}
