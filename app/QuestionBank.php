<?php
declare(strict_types=1);

namespace App;

final class QuestionBank
{
    private static ?array $entries = null;

    public static function all(): array
    {
        if (self::$entries !== null) return self::$entries;
        $file = BASE_PATH . '/data/question_bank.php';
        $entries = is_file($file) ? require $file : [];
        self::$entries = is_array($entries) ? $entries : [];
        return self::$entries;
    }

    public static function stats(): array
    {
        $all = self::all();
        $byLevel = [1 => 0, 2 => 0, 3 => 0];
        $byChapter = [];
        foreach ($all as $entry) {
            $level = (int) ($entry['level'] ?? 1);
            if (isset($byLevel[$level])) $byLevel[$level] += 1;
            $chapter = (string) ($entry['chapter'] ?? '');
            if ($chapter !== '') $byChapter[$chapter] = ($byChapter[$chapter] ?? 0) + 1;
        }
        return [
            'total' => count($all),
            'byLevel' => $byLevel,
            'byChapter' => $byChapter,
        ];
    }

    public static function pick(int $level, string $chapter = 'all', array $focus = []): ?array
    {
        $all = self::all();
        if ($all === []) return null;
        $matches = static function (array $entry) use ($level, $chapter, $focus): bool {
            if ($level > 0 && (int) ($entry['level'] ?? 1) !== $level) return false;
            if ($chapter !== '' && $chapter !== 'all' && (string) ($entry['chapter'] ?? '') !== $chapter) return false;
            if ($focus !== []) {
                $ids = [(string) ($entry['primary'] ?? '')];
                if (!empty($entry['secondary'])) $ids[] = (string) $entry['secondary'];
                if (array_intersect($ids, $focus) === []) return false;
            }
            return true;
        };
        $pool = array_values(array_filter($all, $matches));
        if ($pool === []) {
            // 章节/专项没有匹配时，优先保住难度，再退回全库。
            $pool = array_values(array_filter($all, static fn (array $e): bool => (int) ($e['level'] ?? 1) === $level));
        }
        if ($pool === []) $pool = $all;
        return $pool[array_rand($pool)];
    }
}
