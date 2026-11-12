<?php
declare(strict_types=1);

namespace App;

final class SpecialQuestions
{
    private static ?array $entries = null;

    public static function all(): array
    {
        if (self::$entries !== null) return self::$entries;
        $file = BASE_PATH . '/data/special_questions.php';
        $entries = is_file($file) ? require $file : [];
        self::$entries = is_array($entries) ? $entries : [];
        return self::$entries;
    }

    public static function forModule(string $module): array
    {
        if ($module === '') return [];
        return array_values(array_filter(self::all(), static fn (array $entry): bool => (string) ($entry['module'] ?? '') === $module));
    }
}
