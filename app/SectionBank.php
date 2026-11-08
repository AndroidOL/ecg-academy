<?php
declare(strict_types=1);

namespace App;

final class SectionBank
{
    private static ?array $bank = null;

    public static function all(): array
    {
        if (self::$bank === null) {
            $file = BASE_PATH . '/data/section_bank.php';
            self::$bank = is_file($file) ? (require $file) : [];
        }
        return self::$bank;
    }

    public static function find(string $id): ?array
    {
        foreach (self::all() as $question) {
            if (($question['id'] ?? '') === $id) return $question;
        }
        return null;
    }

    public static function byChapter(string $chapter): array
    {
        return array_values(array_filter(self::all(), static fn (array $q): bool => ($q['chapter'] ?? '') === $chapter));
    }

    public static function pick(string $chapter, int $count = 10): array
    {
        $pool = self::byChapter($chapter);
        if ($pool === []) throw new ApiError(404, 'section_empty', '该板块暂无可用题目');
        shuffle($pool);
        return array_slice($pool, 0, max(1, min($count, count($pool))));
    }

    public static function pickExam(array $chapters, int $count = 10): array
    {
        $pool = [];
        foreach ($chapters as $chapter) {
            foreach (self::byChapter((string) $chapter) as $question) $pool[] = $question;
        }
        if ($pool === []) throw new ApiError(422, 'exam_empty', '已学习板块暂无可用题目');
        shuffle($pool);
        return array_slice($pool, 0, max(1, min($count, count($pool))));
    }

    public static function publicQuestion(array $question): array
    {
        return [
            'id' => (string) $question['id'],
            'chapter' => (string) $question['chapter'],
            'stem' => (string) $question['stem'],
            'options' => array_values($question['options']),
            'difficulty' => (int) ($question['difficulty'] ?? 1),
        ];
    }

    public static function counts(): array
    {
        $out = [];
        foreach (self::all() as $question) {
            $chapter = (string) ($question['chapter'] ?? '');
            $out[$chapter] = ($out[$chapter] ?? 0) + 1;
        }
        return $out;
    }
}
