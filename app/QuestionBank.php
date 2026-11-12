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

    public static function pick(int $level, string $chapter = 'all', array $focus = [], string $special = ''): ?array
    {
        if ($special !== '') {
            $specialPool = SpecialQuestions::forModule($special);
            if ($specialPool !== []) {
                $sameLevel = array_values(array_filter($specialPool, static fn (array $entry): bool => (int) ($entry['level'] ?? 1) === $level));
                $pool = $sameLevel !== [] ? $sameLevel : $specialPool;
                return $pool[array_rand($pool)];
            }
        }
        $all = self::all();
        if ($all === []) return null;
        $matchesFocus = static function (array $entry) use ($focus): bool {
            $ids = [(string) ($entry['primary'] ?? '')];
            if (!empty($entry['secondary'])) $ids[] = (string) $entry['secondary'];
            return array_intersect($ids, $focus) !== [];
        };
        $matchesChapter = static function (array $entry) use ($chapter): bool {
            return $chapter === '' || $chapter === 'all' || (string) ($entry['chapter'] ?? '') === $chapter;
        };
        // A focused read must stay on the requested diagnosis. Try level+chapter
        // first, then the chapter, then the whole bank; never silently discard focus.
        if ($focus !== []) {
            $pools = [
                array_filter($all, static fn (array $e): bool => (int) ($e['level'] ?? 1) === $level && $matchesChapter($e) && $matchesFocus($e)),
                array_filter($all, static fn (array $e): bool => $matchesChapter($e) && $matchesFocus($e)),
                array_filter($all, $matchesFocus),
            ];
            foreach ($pools as $pool) {
                $pool = array_values($pool);
                if ($pool !== []) return $pool[array_rand($pool)];
            }
        }
        $matches = static function (array $entry) use ($level, $chapter): bool {
            if ($level > 0 && (int) ($entry['level'] ?? 1) !== $level) return false;
            return $chapter === '' || $chapter === 'all' || (string) ($entry['chapter'] ?? '') === $chapter;
        };
        $pool = array_values(array_filter($all, $matches));
        if ($pool === []) {
            // 章节没有匹配时，优先保住难度，再退回全库。
            $pool = array_values(array_filter($all, static fn (array $e): bool => (int) ($e['level'] ?? 1) === $level));
        }
        if ($pool === []) $pool = $all;
        return $pool[array_rand($pool)];
    }
}
