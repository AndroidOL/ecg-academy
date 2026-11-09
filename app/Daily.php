<?php
declare(strict_types=1);

namespace App;

final class Daily
{
    public const COUNT = 10;
    private const VERSION = 1;

    public static function status(int $userId): array
    {
        $day = date('Y-m-d');
        return [
            'day' => $day,
            'done' => self::resultFor($userId, $day) !== null,
            'result' => self::resultFor($userId, $day),
            'count' => self::COUNT,
            'streak' => self::streak($userId),
            'bestStreak' => self::bestStreak($userId),
            'totalDays' => self::totalDays($userId),
            'history' => self::history($userId, 28),
        ];
    }

    public static function start(int $userId): array
    {
        $day = date('Y-m-d');
        $existing = self::resultFor($userId, $day);
        if ($existing !== null) {
            return ['done' => true, 'day' => $day, 'result' => $existing, 'count' => self::COUNT];
        }
        $entries = self::entriesFor($day);
        $questions = [];
        $ids = [];
        foreach ($entries as $index => $entry) {
            $built = self::buildQuestion($day, $entry);
            if ($built === null) continue;
            $ids[] = $built['bankId'];
            $questions[] = [
                'id' => $built['bankId'],
                'index' => $index,
                'level' => $built['level'],
                'chapter' => $built['chapter'],
                'question' => $built['question'],
                'stem' => $built['stem'],
                'multiple' => count($built['correctIds']) > 1,
                'spec' => $built['spec'],
                'options' => $built['options'],
            ];
        }
        if (count($questions) < self::COUNT) {
            throw new ApiError(500, 'daily_bank_empty', '今日题库不足，请稍后再试');
        }
        $token = Secret::seal([
            'v' => self::VERSION,
            'uid' => $userId,
            'day' => $day,
            'mode' => 'daily',
            'ids' => $ids,
            'created' => time(),
        ]);
        return [
            'done' => false,
            'day' => $day,
            'count' => count($questions),
            'token' => $token,
            'questions' => $questions,
            'expiresIn' => 7200,
        ];
    }

    public static function complete(int $userId, string $token, array $answers): array
    {
        $round = Secret::open($token);
        if (!$round || ($round['mode'] ?? '') !== 'daily' || (int) ($round['uid'] ?? 0) !== $userId) {
            throw new ApiError(422, 'daily_invalid', '本轮题目已失效，请重新开始');
        }
        if (time() - (int) ($round['created'] ?? 0) > 7200) {
            throw new ApiError(410, 'daily_expired', '本轮已超过 2 小时，请重新开始');
        }
        $day = (string) ($round['day'] ?? '');
        if ($day !== date('Y-m-d')) {
            throw new ApiError(410, 'daily_expired', '每日挑战已跨天，请开始今天的挑战');
        }
        if (self::resultFor($userId, $day) !== null) {
            throw new ApiError(409, 'daily_done', '今日挑战已完成，明天再来');
        }
        $ids = array_values(array_map('strval', (array) ($round['ids'] ?? [])));
        if (count($ids) !== self::COUNT) {
            throw new ApiError(422, 'daily_invalid', '本轮题目异常，请重新开始');
        }
        self::consumeToken($token);

        $answerMap = [];
        foreach ($answers as $item) {
            if (!is_array($item)) continue;
            $id = (string) ($item['id'] ?? '');
            if ($id === '') continue;
            $selected = $item['selected'] ?? [];
            if (!is_array($selected)) continue;
            $answerMap[$id] = [
                'selected' => array_values(array_unique(array_map('strval', $selected))),
                'timeMs' => max(0, min(600000, (int) ($item['timeMs'] ?? 0))),
            ];
        }

        $entries = self::bankIndex();
        $all = Content::all();
        $correctCount = 0;
        $score = 0;
        $xp = 0;
        $totalMs = 0;
        $details = [];
        foreach ($ids as $id) {
            $entry = $entries[$id] ?? null;
            $built = $entry ? self::buildQuestion($day, $entry) : null;
            if ($built === null || $built['bankId'] !== $id) {
                throw new ApiError(500, 'daily_bank_missing', '题目数据缺失，请重新开始');
            }
            $answer = $answerMap[$id] ?? ['selected' => [], 'timeMs' => 0];
            $optionIds = array_column($built['options'], 'id');
            foreach ($answer['selected'] as $selectedId) {
                if (!in_array($selectedId, $optionIds, true)) {
                    throw new ApiError(422, 'invalid_option', '包含无效选项');
                }
            }
            $selected = $answer['selected'];
            $correctIds = $built['correctIds'];
            $sortedSelected = $selected;
            $sortedCorrect = $correctIds;
            sort($sortedSelected);
            sort($sortedCorrect);
            $isCorrect = $sortedSelected === $sortedCorrect;
            $partial = !$isCorrect && count($correctIds) > 1 && array_intersect($selected, $correctIds) !== [];
            $base = [1 => 100, 2 => 140, 3 => 180][$built['level']] ?? 100;
            $timeMs = $answer['timeMs'];
            $timeBonus = $isCorrect ? max(0, 40 - intdiv($timeMs, 1000) * 2) : 0;
            $slow = $isCorrect && $timeMs > 15000;
            $questionScore = $isCorrect ? $base + $timeBonus : ($partial ? (int) round($base * 0.25) : -5 * $base);
            $questionXp = $isCorrect ? 10 + $built['level'] * 5 : ($partial ? 3 : 1);
            if ($isCorrect) $correctCount++;
            $score += $questionScore;
            $xp += $questionXp;
            $totalMs += $timeMs;
            $names = [];
            foreach ($built['options'] as $option) $names[$option['id']] = $option['name'];
            $details[] = [
                'id' => $id,
                'level' => $built['level'],
                'question' => $built['question'],
                'stem' => $built['stem'],
                'correct' => $isCorrect,
                'partial' => $partial,
                'slow' => $slow,
                'selected' => $selected,
                'correctIds' => $correctIds,
                'selectedNames' => array_map(static fn (string $optId): string => $names[$optId] ?? $optId, $selected),
                'correctNames' => array_map(static fn (string $optId): string => $all[$optId]['name'] ?? $optId, $correctIds),
                'notes' => array_map(static fn (string $optId): array => [
                    'name' => $all[$optId]['name'] ?? $optId,
                    'oneLiner' => (string) ($all[$optId]['oneLiner'] ?? ''),
                ], $correctIds),
                'options' => array_map(static fn (array $option): array => ['id' => $option['id'], 'name' => $option['name'], 'nameEn' => $option['nameEn'] ?? $option['name']], $built['options']),
                'score' => $questionScore,
                'timeMs' => $timeMs,
            ];
        }

        $result = [
            'day' => $day,
            'correct' => $correctCount,
            'slow' => count(array_filter($details, static fn (array $d): bool => !empty($d['slow']))),
            'total' => self::COUNT,
            'score' => $score,
            'xp' => $xp,
            'timeMs' => $totalMs,
            'details' => $details,
        ];

        $stmt = Db::pdo()->prepare('SELECT is_guest FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $isGuest = (int) ($stmt->fetchColumn() ?: 0) === 1;
        try {
            Db::pdo()->prepare(
                'INSERT INTO daily_results (user_id, day, correct, total, score, xp, time_ms, details)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $userId,
                $day,
                $correctCount,
                self::COUNT,
                $score,
                $xp,
                $totalMs,
                json_encode($details, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ]);
        } catch (\PDOException $e) {
            if ((string) $e->getCode() === '23000') {
                throw new ApiError(409, 'daily_done', '今日挑战已完成，明天再来');
            }
            throw $e;
        }
        if (!$isGuest) {
            Db::pdo()->prepare('UPDATE users SET xp = xp + ? WHERE id = ?')->execute([$xp, $userId]);
            $baseCredit = max(0, Settings::int('ai.credit_base', 10));
            $grant = AiGuard::grant($userId, $baseCredit + $correctCount, 'daily-challenge', $day);
            $result['aiCreditsGranted'] = $grant['granted'];
            $result['aiCredits'] = $grant['credits'];
            $result['aiCreditRule'] = '每日挑战：基础 ' . $baseCredit . ' 次 + 答对题数；上限 ' . max(1, Settings::int('ai.credit_cap', 100)) . ' 次';
        }

        $result['streak'] = self::streak($userId);
        $result['bestStreak'] = self::bestStreak($userId);
        $result['totalDays'] = self::totalDays($userId);
        $result['history'] = self::history($userId, 28);
        $result['isGuest'] = $isGuest;
        return $result;
    }

    private static function entriesFor(string $day): array
    {
        $all = QuestionBank::all();
        if ($all === []) return [];
        $rank = static fn (array $entry): string => hash('sha256', 'ecg-daily-v1:' . $day . ':' . (string) ($entry['id'] ?? ''));
        $scored = [];
        foreach ($all as $entry) $scored[] = ['rank' => $rank($entry), 'entry' => $entry];
        usort($scored, static fn (array $a, array $b): int => strcmp($a['rank'], $b['rank']));
        $caps = [1 => 4, 2 => 4, 3 => 2];
        $counts = [1 => 0, 2 => 0, 3 => 0];
        $picked = [];
        foreach ($scored as $row) {
            $level = (int) ($row['entry']['level'] ?? 1);
            if (($counts[$level] ?? 0) >= ($caps[$level] ?? 4)) continue;
            $counts[$level] = ($counts[$level] ?? 0) + 1;
            $picked[] = $row['entry'];
            if (count($picked) >= self::COUNT) break;
        }
        if (count($picked) < self::COUNT) {
            $seen = [];
            foreach ($picked as $entry) $seen[(string) $entry['id']] = true;
            foreach ($scored as $row) {
                if (count($picked) >= self::COUNT) break;
                $id = (string) ($row['entry']['id'] ?? '');
                if (isset($seen[$id])) continue;
                $seen[$id] = true;
                $picked[] = $row['entry'];
            }
        }
        return array_slice($picked, 0, self::COUNT);
    }

    private static function buildQuestion(string $day, array $entry): ?array
    {
        $all = Content::all();
        $primary = $all[$entry['primary'] ?? ''] ?? null;
        $secondary = !empty($entry['secondary']) ? ($all[$entry['secondary']] ?? null) : null;
        if (!$primary || (!empty($entry['secondary']) && !$secondary)) return null;
        $combo = null;
        if (!empty($entry['combo'])) {
            foreach (require BASE_PATH . '/data/combos.php' as $candidate) {
                if (($candidate['id'] ?? '') === $entry['combo']) {
                    $combo = $candidate;
                    break;
                }
            }
        }
        $level = (int) ($entry['level'] ?? 1);
        $correctIds = [$primary['id']];
        if ($secondary) $correctIds[] = $secondary['id'];
        $correctIds = array_values(array_unique($correctIds));
        $spec = $primary['ecg'] ?? [];
        if ($combo) $spec = array_replace_recursive($spec, $combo['overrides'] ?? []);
        $spec['seed'] = (int) ($entry['seed'] ?? 1);
        if (!empty($entry['rate'])) {
            $spec['rate'] = (int) $entry['rate'];
            if (($spec['rhythm'] ?? '') === 'sinus') $spec['atrialRate'] = (int) $entry['rate'];
        }
        $spec['duration'] = 8;
        $spec['annotations'] = [];
        unset($spec['description'], $spec['preview']);
        if (($secondary['ecg']['show12Lead'] ?? false) || ($primary['ecg']['show12Lead'] ?? false)) {
            $spec['show12Lead'] = true;
        }
        $question = $combo ? '该心电图包含哪些诊断？（多选）' : (string) ($entry['question'] ?? '该心电图最可能的诊断是？');
        $stem = (string) ($combo['stem'] ?? $entry['stem'] ?? '');
        $options = Quiz::buildOptions($primary, $secondary, count($correctIds) > 1, 'ecg-daily-v1:' . $day . ':' . (string) ($entry['id'] ?? ''));
        return [
            'bankId' => (string) ($entry['id'] ?? ''),
            'level' => $level,
            'chapter' => (string) $primary['chapter'],
            'question' => $question,
            'stem' => $stem,
            'spec' => $spec,
            'options' => $options,
            'correctIds' => $correctIds,
        ];
    }

    private static function bankIndex(): array
    {
        $index = [];
        foreach (QuestionBank::all() as $entry) {
            $id = (string) ($entry['id'] ?? '');
            if ($id !== '') $index[$id] = $entry;
        }
        return $index;
    }

    private static function consumeToken(string $token): void
    {
        $pdo = Db::pdo();
        try {
            $pdo->prepare('INSERT INTO consumed_tokens (token_hash, expires_at) VALUES (?, DATE_ADD(NOW(), INTERVAL 2 HOUR))')
                ->execute([hash('sha256', $token)]);
        } catch (\PDOException $e) {
            if ((string) $e->getCode() === '23000') {
                throw new ApiError(409, 'daily_replay', '本轮已提交，请勿重复提交');
            }
            throw $e;
        }
        if (random_int(1, 20) === 1) {
            $pdo->exec('DELETE FROM consumed_tokens WHERE expires_at < NOW() - INTERVAL 1 DAY');
        }
    }

    private static function resultFor(int $userId, string $day): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT day, correct, total, score, xp, time_ms, details, created_at FROM daily_results WHERE user_id = ? AND day = ? LIMIT 1');
        $stmt->execute([$userId, $day]);
        $row = $stmt->fetch();
        if (!$row) return null;
        $details = json_decode((string) ($row['details'] ?? '[]'), true);
        return [
            'day' => (string) $row['day'],
            'correct' => (int) $row['correct'],
            'total' => (int) $row['total'],
            'score' => (int) $row['score'],
            'xp' => (int) $row['xp'],
            'timeMs' => (int) $row['time_ms'],
            'createdAt' => (string) $row['created_at'],
            'details' => is_array($details) ? $details : [],
        ];
    }

    private static function days(int $userId, int $limit = 2000): array
    {
        $limit = max(1, min(5000, $limit));
        $stmt = Db::pdo()->prepare('SELECT day FROM daily_results WHERE user_id = ? ORDER BY day DESC LIMIT ' . $limit);
        $stmt->execute([$userId]);
        return array_map(static fn (array $row): string => (string) $row['day'], $stmt->fetchAll());
    }

    private static function streak(int $userId): int
    {
        $days = self::days($userId);
        if ($days === []) return 0;
        $today = date('Y-m-d');
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        if ($days[0] !== $today && $days[0] !== $yesterday) return 0;
        $set = array_flip($days);
        $streak = 0;
        $cursor = strtotime($days[0]);
        while (isset($set[date('Y-m-d', $cursor)])) {
            $streak++;
            $cursor = strtotime('-1 day', $cursor);
        }
        return $streak;
    }

    private static function bestStreak(int $userId): int
    {
        $days = self::days($userId);
        if ($days === []) return 0;
        $days = array_reverse($days);
        $best = 1;
        $run = 1;
        for ($i = 1; $i < count($days); $i++) {
            $gap = (strtotime($days[$i]) - strtotime($days[$i - 1])) / 86400;
            if (abs($gap - 1) < 0.01) {
                $run++;
                $best = max($best, $run);
            } else {
                $run = 1;
            }
        }
        return $best;
    }

    private static function totalDays(int $userId): int
    {
        $stmt = Db::pdo()->prepare('SELECT COUNT(*) FROM daily_results WHERE user_id = ?');
        $stmt->execute([$userId]);
        return (int) $stmt->fetchColumn();
    }

    private static function history(int $userId, int $count): array
    {
        $start = date('Y-m-d', strtotime('-' . ($count - 1) . ' days'));
        $stmt = Db::pdo()->prepare('SELECT day, correct, total, score FROM daily_results WHERE user_id = ? AND day >= ? ORDER BY day ASC');
        $stmt->execute([$userId, $start]);
        $map = [];
        foreach ($stmt->fetchAll() as $row) $map[(string) $row['day']] = $row;
        $out = [];
        for ($i = 0; $i < $count; $i++) {
            $day = date('Y-m-d', strtotime('-' . ($count - 1 - $i) . ' days'));
            $row = $map[$day] ?? null;
            $out[] = [
                'day' => $day,
                'done' => $row !== null,
                'correct' => (int) ($row['correct'] ?? 0),
                'total' => (int) ($row['total'] ?? 0),
                'score' => (int) ($row['score'] ?? 0),
            ];
        }
        return $out;
    }
}
