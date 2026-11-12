<?php
declare(strict_types=1);

namespace App;

final class ChapterGuides
{
    private static ?array $guides = null;
    private static ?array $references = null;

    public static function get(string $chapterId): ?array
    {
        if (self::$guides === null) {
            $file = BASE_PATH . '/data/chapter_guides.php';
            $guides = is_file($file) ? require $file : [];
            self::$guides = is_array($guides) ? $guides : [];
        }
        $guide = self::$guides[$chapterId] ?? null;
        if (!is_array($guide)) return null;

        $catalog = self::references();
        $refs = [];
        foreach ((array) ($guide['references'] ?? []) as $id) {
            $id = (string) $id;
            if (isset($catalog[$id])) $refs[] = $catalog[$id];
        }
        $guide['references'] = $refs;
        return $guide;
    }

    public static function references(): array
    {
        if (self::$references !== null) return self::$references;
        $file = BASE_PATH . '/data/references.php';
        $data = is_file($file) ? require $file : [];
        self::$references = is_array($data) ? $data : [];
        return self::$references;
    }
}
