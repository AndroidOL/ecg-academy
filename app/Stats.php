<?php
declare(strict_types=1);

namespace App;

final class Stats
{
    public static function forUser(int $userId): array
    {
        $pdo = Db::pdo();
        $chapters = Content::chapters();
        $all = Content::all();

        $stmt = $pdo->prepare('SELECT diagnosis_id, status, updated_at FROM user_progress WHERE user_id = ?');
        $stmt->execute([$userId]);
        $progressRows = $stmt->fetchAll();
        $progress = [];
        foreach ($progressRows as $row) {
            $progress[$row['diagnosis_id']] = $row;
        }

        $chapterStats = [];
        foreach ($chapters as $chapter) {
            $items = array_filter($all, static fn (array $d): bool => $d['chapter'] === $chapter['id']);
            $total = count($items);
            $read = 0;
            $mastered = 0;
            foreach ($items as $item) {
                $p = $progress[$item['id']] ?? null;
                if ($p) {
                    $read += 1;
                    if (($p['status'] ?? '') === 'mastered') $mastered += 1;
                }
            }
            $chapterStats[] = [
                'id' => $chapter['id'],
                'name' => $chapter['name'],
                'color' => $chapter['color'],
                'total' => $total,
                'read' => $read,
                'mastered' => $mastered,
                'percent' => $total > 0 ? (int) round(($read / $total) * 100) : 0,
            ];
        }

        $stmt = $pdo->prepare('SELECT COUNT(*) AS total, COALESCE(SUM(is_correct),0) AS correct, COALESCE(AVG(score),0) AS avg_score FROM quiz_attempts WHERE user_id = ? AND status = "answered"');
        $stmt->execute([$userId]);
        $quizAgg = $stmt->fetch();

        $stmt = $pdo->prepare('SELECT COUNT(*) AS total, COALESCE(MAX(score),0) AS best FROM sim_runs WHERE user_id = ?');
        $stmt->execute([$userId]);
        $simAgg = $stmt->fetch();

        $stmt = $pdo->prepare('SELECT id, case_key, score, is_correct, time_ms, created_at FROM quiz_attempts WHERE user_id = ? AND status = "answered" ORDER BY id DESC LIMIT 8');
        $stmt->execute([$userId]);
        $recent = $stmt->fetchAll();

        $stmt = $pdo->prepare('SELECT scenario_id, score, grade, outcome, duration_s, created_at FROM sim_runs WHERE user_id = ? ORDER BY id DESC LIMIT 5');
        $stmt->execute([$userId]);
        $recentSim = $stmt->fetchAll();

        $chapterAccuracy = self::chapterAccuracy($userId);

        return [
            'chapters' => $chapterStats,
            'progress' => [
                'read' => count($progressRows),
                'mastered' => count(array_filter($progressRows, static fn (array $r): bool => $r['status'] === 'mastered')),
                'total' => count($all),
            ],
            'quiz' => [
                'attempts' => (int) ($quizAgg['total'] ?? 0),
                'correct' => (int) ($quizAgg['correct'] ?? 0),
                'accuracy' => (int) ($quizAgg['total'] ?? 0) > 0
                    ? (int) round(((int) $quizAgg['correct'] / (int) $quizAgg['total']) * 100)
                    : 0,
                'avgScore' => (int) round((float) ($quizAgg['avg_score'] ?? 0)),
            ],
            'sim' => [
                'runs' => (int) ($simAgg['total'] ?? 0),
                'best' => (int) ($simAgg['best'] ?? 0),
            ],
            'recent' => $recent,
            'recentSim' => $recentSim,
            'chapterAccuracy' => $chapterAccuracy,
            'weakChapters' => array_slice(array_values(array_filter($chapterAccuracy, static fn (array $c): bool => $c['attempts'] > 0)), 0, 3),
        ];
    }

    public static function chapterAccuracy(int $userId): array
    {
        $stmt = Db::pdo()->prepare(
            'SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, "$.chapter")) AS chapter,
                    COUNT(*) AS attempts,
                    SUM(is_correct) AS correct
             FROM quiz_attempts
             WHERE user_id = ? AND status = "answered"
             GROUP BY chapter'
        );
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll();
        $chapterMap = [];
        foreach (Content::chapters() as $chapter) $chapterMap[$chapter['id']] = $chapter;
        $out = [];
        foreach ($rows as $row) {
            $cid = (string) ($row['chapter'] ?? '');
            if (!isset($chapterMap[$cid])) continue;
            $attempts = (int) $row['attempts'];
            $correct = (int) $row['correct'];
            $out[] = [
                'id' => $cid,
                'name' => $chapterMap[$cid]['name'],
                'color' => $chapterMap[$cid]['color'],
                'attempts' => $attempts,
                'correct' => $correct,
                'accuracy' => $attempts > 0 ? (int) round(($correct / $attempts) * 100) : 0,
            ];
        }
        usort($out, static fn (array $a, array $b): int => $a['accuracy'] <=> $b['accuracy']);
        return $out;
    }

    public static function leaderboard(string $scope = 'week'): array
    {
        $pdo = Db::pdo();
        if ($scope === 'all') {
            $stmt = $pdo->query(
                'SELECT public_id, display_name, is_guest, xp, theme
                 FROM users
                 ORDER BY xp DESC, id ASC
                 LIMIT 10'
            );
            $rows = $stmt->fetchAll();
            return array_map(static fn (array $r): array => [
                'id' => $r['public_id'],
                'name' => $r['display_name'],
                'isGuest' => (int) $r['is_guest'] === 1,
                'points' => (int) $r['xp'],
            ], $rows);
        }

        $weekAgo = (new \DateTimeImmutable('-7 days'))->format('Y-m-d H:i:s');
        $stmt = $pdo->prepare(
            'SELECT u.public_id, u.display_name, u.is_guest,
                (SELECT COALESCE(SUM(q.score), 0) FROM quiz_attempts q
                  WHERE q.user_id = u.id AND q.status = "answered" AND q.answered_at >= ?) +
                (SELECT COALESCE(SUM(s.score), 0) FROM sim_runs s
                  WHERE s.user_id = u.id AND s.created_at >= ?) AS points
             FROM users u
             HAVING points > 0
             ORDER BY points DESC, u.id ASC
             LIMIT 10'
        );
        $stmt->execute([$weekAgo, $weekAgo]);
        return array_map(static fn (array $r): array => [
            'id' => $r['public_id'],
            'name' => $r['display_name'],
            'isGuest' => (int) $r['is_guest'] === 1,
            'points' => (int) $r['points'],
        ], $stmt->fetchAll());
    }

    public static function weakFocus(int $userId, int $limit = 3): array
    {
        $accuracy = self::chapterAccuracy($userId);
        $all = Content::all();
        $focus = [];
        $weakIds = [];
        foreach ($accuracy as $row) {
            if ($row['accuracy'] < 80) $weakIds[] = $row['id'];
        }
        if ($weakIds === []) {
            foreach (Content::chapters() as $chapter) $weakIds[] = $chapter['id'];
        }
        foreach ($weakIds as $chapterId) {
            foreach ($all as $diagnosis) {
                if ($diagnosis['chapter'] !== $chapterId) continue;
                if (!($diagnosis['quizEligible'] ?? true)) continue;
                if (isset($focus[$diagnosis['id']])) continue;
                $focus[$diagnosis['id']] = [
                    'id' => $diagnosis['id'],
                    'name' => $diagnosis['name'],
                    'chapter' => $chapterId,
                    'difficulty' => (int) ($diagnosis['difficulty'] ?? 1),
                    'oneLiner' => $diagnosis['oneLiner'] ?? '',
                ];
                if (count($focus) >= $limit) break 2;
            }
        }
        return array_values($focus);
    }
}
