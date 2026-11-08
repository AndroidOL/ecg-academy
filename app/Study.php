<?php
declare(strict_types=1);

namespace App;

final class Study
{
    public static function get(int $userId): array
    {
        self::account($userId);
        $stmt = Db::pdo()->prepare('SELECT reviews, favorites, updated_at FROM user_study WHERE user_id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if (!$row) return ['reviews' => [], 'favorites' => [], 'updatedAt' => null];
        return [
            'reviews' => json_decode((string) $row['reviews'], true) ?: [],
            'favorites' => json_decode((string) $row['favorites'], true) ?: [],
            'updatedAt' => (string) $row['updated_at'],
        ];
    }

    public static function save(int $userId, array $input): array
    {
        self::account($userId);
        $reviews = self::normalizeReviews($input['reviews'] ?? []);
        $favorites = self::normalizeFavorites($input['favorites'] ?? []);
        $reviewsJson = json_encode($reviews, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $favoritesJson = json_encode($favorites, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        if (strlen($reviewsJson) + strlen($favoritesJson) > 524288) {
            throw new ApiError(413, 'study_too_large', '同步数据过大（上限 512KB）');
        }
        Db::pdo()->prepare(
            'INSERT INTO user_study (user_id, reviews, favorites) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE reviews = VALUES(reviews), favorites = VALUES(favorites)'
        )->execute([$userId, $reviewsJson, $favoritesJson]);
        return ['reviews' => count($reviews), 'favorites' => count($favorites), 'updatedAt' => date('Y-m-d H:i:s')];
    }

    private static function normalizeReviews(mixed $raw): array
    {
        if (!is_array($raw)) return [];
        $out = [];
        foreach ($raw as $id => $entry) {
            if (count($out) >= 1000) break;
            if (!is_array($entry)) continue;
            $id = mb_substr((string) ($entry['id'] ?? $id), 0, 64, 'UTF-8');
            if ($id === '') continue;
            $out[$id] = [
                'id' => $id,
                'name' => mb_substr((string) ($entry['name'] ?? $id), 0, 80, 'UTF-8'),
                'chapter' => mb_substr((string) ($entry['chapter'] ?? ''), 0, 64, 'UTF-8'),
                'wrong' => max(0, min(1000000, (int) ($entry['wrong'] ?? 0))),
                'correct' => max(0, min(1000000, (int) ($entry['correct'] ?? 0))),
                'slow' => max(0, min(1000000, (int) ($entry['slow'] ?? 0))),
                'lapses' => max(0, min(1000000, (int) ($entry['lapses'] ?? 0))),
                'ease' => max(1.0, min(5.0, (float) ($entry['ease'] ?? 2.5))),
                'interval' => max(0, min(3650, (int) ($entry['interval'] ?? 0))),
                'due' => max(0, (int) ($entry['due'] ?? 0)),
                'lastSeen' => max(0, (int) ($entry['lastSeen'] ?? 0)),
            ];
        }
        return $out;
    }

    private static function normalizeFavorites(mixed $raw): array
    {
        if (!is_array($raw)) return [];
        $out = [];
        foreach ($raw as $id => $entry) {
            if (count($out) >= 1000) break;
            if (!is_array($entry)) continue;
            $id = mb_substr((string) ($entry['id'] ?? $id), 0, 64, 'UTF-8');
            if ($id === '') continue;
            $out[$id] = [
                'id' => $id,
                'name' => mb_substr((string) ($entry['name'] ?? $id), 0, 80, 'UTF-8'),
                'chapter' => mb_substr((string) ($entry['chapter'] ?? ''), 0, 64, 'UTF-8'),
                'addedAt' => max(0, (int) ($entry['addedAt'] ?? 0)),
            ];
        }
        return $out;
    }

    private static function account(int $userId): void
    {
        $stmt = Db::pdo()->prepare('SELECT is_guest FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $isGuest = $stmt->fetchColumn();
        if ($isGuest === false || (int) $isGuest === 1) {
            throw new ApiError(403, 'account_required', '请先注册或登录正式账号');
        }
    }
}
