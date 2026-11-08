<?php
declare(strict_types=1);

namespace App;

final class Quiz
{
    public static function newAttempt(int $userId, array $params): array
    {
        $level = max(1, min(3, (int) ($params['level'] ?? 1)));
        $chapter = (string) ($params['chapter'] ?? 'all');
        $focus = array_values(array_filter((array) ($params['focus'] ?? []), 'is_string'));
        $combo = null;
        $primary = null;
        $secondary = null;
        $question = '该心电图最可能的诊断是？';
        $stem = '';

        $all = Content::all();

        if ($level === 3) {
            $combos = require BASE_PATH . '/data/combos.php';
            $pool = [];
            foreach ($combos as $candidate) {
                $p = $all[$candidate['primary']] ?? null;
                $s = $all[$candidate['secondary']] ?? null;
                if (!$p || !$s) continue;
                if ($chapter !== 'all' && $p['chapter'] !== $chapter) continue;
                if ($focus !== [] && !in_array($p['id'], $focus, true) && !in_array($s['id'], $focus, true)) continue;
                $pool[] = $candidate;
            }
            if ($pool === []) {
                $pool = $combos;
            }
            $combo = $pool[array_rand($pool)];
            $primary = $all[$combo['primary']] ?? null;
            $secondary = $all[$combo['secondary']] ?? null;
            if (!$primary || !$secondary) {
                $level = 2;
            } else {
                $question = '该心电图包含哪些诊断？（多选）';
                $stem = (string) ($combo['stem'] ?? '');
            }
        }

        if (!$primary) {
            $pool = [];
            foreach ($all as $diagnosis) {
                if (!($diagnosis['quizEligible'] ?? true)) continue;
                if ($chapter !== 'all' && $diagnosis['chapter'] !== $chapter) continue;
                $difficulty = (int) ($diagnosis['difficulty'] ?? 1);
                if ($level === 1 && $difficulty > 2) continue;
                if ($level === 2 && $difficulty < 2) continue;
                $pool[] = $diagnosis;
            }
            if ($pool === []) {
                $pool = array_values(array_filter($all, static fn (array $d): bool => (bool) ($d['quizEligible'] ?? true)));
            }
            if ($focus !== []) {
                $focused = array_values(array_filter($pool, static fn (array $d): bool => in_array($d['id'], $focus, true)));
                if ($focused !== []) $pool = $focused;
            }
            $primary = $pool[array_rand($pool)];
            $level = $level === 2 ? 2 : 1;
        }

        $correctIds = [$primary['id']];
        if ($secondary) $correctIds[] = $secondary['id'];
        $correctIds = array_values(array_unique($correctIds));

        $spec = $primary['ecg'] ?? [];
        if ($combo) {
            $spec = array_replace_recursive($spec, $combo['overrides'] ?? []);
        }
        $spec['seed'] = random_int(1, 99999);
        $spec['duration'] = 8;
        $spec['annotations'] = [];
        unset($spec['description'], $spec['preview']);
        if (($secondary['ecg']['show12Lead'] ?? false) || ($primary['ecg']['show12Lead'] ?? false)) {
            $spec['show12Lead'] = true;
        }

        $options = self::buildOptions($primary, $secondary, count($correctIds) > 1);
        $optionIds = array_column($options, 'id');
        $caseKey = implode('+', $correctIds);
        $payload = [
            'spec' => $spec,
            'correctIds' => $correctIds,
            'optionIds' => $optionIds,
            'level' => $level,
            'chapter' => $primary['chapter'],
            'question' => $question,
            'stem' => $stem,
            'caseKey' => $caseKey,
            'primaryId' => $primary['id'],
            'createdAt' => time(),
        ];

        $pdo = Db::pdo();
        if (random_int(1, 20) === 1) {
            $pdo->exec('DELETE FROM quiz_attempts WHERE status = "pending" AND created_at < NOW() - INTERVAL 2 HOUR');
        }

        $stmt = $pdo->prepare(
            'INSERT INTO quiz_attempts (user_id, case_key, payload, correct_ids, option_ids, status)
             VALUES (?, ?, ?, ?, ?, "pending")'
        );
        $stmt->execute([
            $userId,
            $caseKey,
            json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            json_encode($correctIds, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            json_encode($optionIds, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
        $attemptId = (int) $pdo->lastInsertId();

        return [
            'attemptId' => $attemptId,
            'spec' => $spec,
            'options' => $options,
            'multiple' => count($correctIds) > 1,
            'level' => $level,
            'question' => $question,
            'stem' => $stem,
            'chapter' => $primary['chapter'],
            'expiresIn' => 7200,
        ];
    }

    private static function buildOptions(array $primary, ?array $secondary, bool $multiple): array
    {
        $all = Content::all();
        $correct = [$primary];
        if ($secondary) $correct[] = $secondary;
        $correctIds = array_column($correct, 'id');
        $wanted = $multiple ? 6 : 5;
        $ids = $correctIds;
        $candidates = [];

        foreach ($correct as $diagnosis) {
            foreach ($diagnosis['differential'] ?? [] as $diff) {
                $id = $diff['id'] ?? '';
                if ($id !== '' && isset($all[$id]) && !in_array($id, $ids, true)) {
                    $candidates[] = $id;
                }
            }
        }
        foreach ($all as $diagnosis) {
            if (!in_array($diagnosis['id'], $ids, true) && ($diagnosis['quizEligible'] ?? true)) {
                $candidates[] = $diagnosis['id'];
            }
        }
        $candidates = array_values(array_unique($candidates));
        shuffle($candidates);
        foreach ($candidates as $id) {
            if (count($ids) >= $wanted) break;
            if (!in_array($id, $ids, true)) $ids[] = $id;
        }

        $options = [];
        foreach ($ids as $id) {
            $options[] = [
                'id' => $id,
                'name' => $all[$id]['name'] ?? $id,
                'chapter' => $all[$id]['chapter'] ?? '',
            ];
        }
        shuffle($options);
        return $options;
    }

    public static function answer(int $userId, int $attemptId, array $selectedIds, int $timeMs): array
    {
        $pdo = Db::pdo();
        $stmt = $pdo->prepare('SELECT * FROM quiz_attempts WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$attemptId, $userId]);
        $attempt = $stmt->fetch();
        if (!$attempt) {
            throw new ApiError(404, 'attempt_not_found', '题目不存在或不属于当前账号');
        }
        if ($attempt['status'] !== 'pending') {
            throw new ApiError(409, 'attempt_answered', '该题已提交，请开始新题');
        }
        if (strtotime((string) $attempt['created_at']) < time() - 7200) {
            $pdo->prepare('UPDATE quiz_attempts SET status = "expired" WHERE id = ?')->execute([$attemptId]);
            throw new ApiError(410, 'attempt_expired', '题目已过期，请重新出题');
        }

        $payload = json_decode((string) $attempt['payload'], true, 32, JSON_THROW_ON_ERROR);
        $correctIds = json_decode((string) $attempt['correct_ids'], true, 32, JSON_THROW_ON_ERROR);
        $optionIds = json_decode((string) $attempt['option_ids'], true, 32, JSON_THROW_ON_ERROR);
        $selectedIds = array_values(array_unique(array_filter(array_map('strval', $selectedIds))));

        foreach ($selectedIds as $id) {
            if (!in_array($id, $optionIds, true)) {
                throw new ApiError(422, 'invalid_option', '包含无效选项');
            }
        }
        if ($selectedIds === []) {
            throw new ApiError(422, 'empty_answer', '请至少选择一个诊断');
        }

        $sortedCorrect = $correctIds;
        $sortedSelected = $selectedIds;
        sort($sortedCorrect);
        sort($sortedSelected);
        $isCorrect = $sortedCorrect === $sortedSelected;
        $intersection = array_intersect($correctIds, $selectedIds);
        $partial = !$isCorrect && $intersection !== [];
        $level = (int) ($payload['level'] ?? 1);
        $base = [1 => 100, 2 => 140, 3 => 180][$level] ?? 100;
        $timeMs = max(0, min(600000, $timeMs));
        $timeBonus = $isCorrect ? max(0, 40 - (int) floor($timeMs / 1000) * 2) : 0;
        $score = $isCorrect ? $base + $timeBonus : ($partial ? (int) round($base * 0.25) : 0);
        $xp = $isCorrect ? 10 + $level * 5 : ($partial ? 3 : 1);

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'UPDATE quiz_attempts SET selected_ids = ?, is_correct = ?, score = ?, time_ms = ?, status = "answered", answered_at = NOW()
                 WHERE id = ? AND status = "pending"'
            );
            $stmt->execute([
                json_encode($selectedIds, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                $isCorrect ? 1 : 0,
                $score,
                $timeMs,
                $attemptId,
            ]);
            if ($stmt->rowCount() !== 1) {
                $pdo->rollBack();
                throw new ApiError(409, 'attempt_answered', '该题已提交，请开始新题');
            }

            $pdo->prepare('UPDATE users SET xp = xp + ? WHERE id = ?')->execute([$xp, $userId]);

            $all = Content::all();
            $progress = $pdo->prepare(
                'INSERT INTO user_progress (user_id, diagnosis_id, status, read_at, mastered_at)
                 VALUES (?, ?, ?, NOW(), ?)
                 ON DUPLICATE KEY UPDATE
                   status = IF(VALUES(status) = "mastered" OR status = "mastered", "mastered", "read"),
                   read_at = COALESCE(read_at, NOW()),
                   mastered_at = IF(VALUES(status) = "mastered", COALESCE(mastered_at, NOW()), mastered_at)'
            );
            foreach ($correctIds as $id) {
                $progress->execute([$userId, $id, $isCorrect ? 'mastered' : 'read', $isCorrect ? date('Y-m-d H:i:s') : null]);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }

        $all = Content::all();
        $selectedNames = [];
        foreach ($selectedIds as $id) {
            $selectedNames[] = $all[$id]['name'] ?? $id;
        }
        $explanation = [];
        foreach ($correctIds as $id) {
            $d = $all[$id] ?? null;
            if (!$d) continue;
            $explanation[] = [
                'id' => $d['id'],
                'name' => $d['name'],
                'oneLiner' => $d['oneLiner'] ?? '',
                'specificity' => $d['specificity'] ?? '',
                'keyNumbers' => $d['keyNumbers'] ?? [],
                'criteria' => array_slice($d['criteria'] ?? [], 0, 3),
                'management' => array_slice($d['management'] ?? [], 0, 2),
                'description' => $d['ecg']['description'] ?? '',
            ];
        }

        $localText = self::localExplanation($isCorrect, $partial, $correctIds, $selectedIds, $all);
        return [
            'attemptId' => $attemptId,
            'correct' => $isCorrect,
            'partial' => $partial,
            'correctIds' => $correctIds,
            'correctNames' => array_map(static fn (string $id): string => $all[$id]['name'] ?? $id, $correctIds),
            'selectedNames' => $selectedNames,
            'score' => $score,
            'xp' => $xp,
            'timeMs' => $timeMs,
            'explanation' => $explanation,
            'localExplanation' => $localText,
            'aiAvailable' => Ai::configured(),
        ];
    }

    private static function localExplanation(bool $correct, bool $partial, array $correctIds, array $selectedIds, array $all): string
    {
        $correctNames = array_map(static fn (string $id): string => $all[$id]['name'] ?? $id, $correctIds);
        if ($correct) {
            $d = $all[$correctIds[0]] ?? null;
            return '判断正确。关键线索：' . ($d['specificity'] ?? $d['oneLiner'] ?? '') . ' 下一步可用“AI 导师”继续追问机制与鉴别。';
        }
        $parts = [];
        $parts[] = '正确答案是：' . implode('、', $correctNames) . '。';
        if ($partial) {
            $parts[] = '你选对了一部分，但诊断组合不完整。';
        } else {
            $parts[] = '你的选择与正确诊断不一致。';
        }
        $primary = $all[$correctIds[0]] ?? null;
        if ($primary) {
            $parts[] = '最关键的识别点是：' . ($primary['specificity'] ?? $primary['oneLiner'] ?? '');
            if (!empty($primary['criteria'][0])) {
                $parts[] = '再看一遍标准：' . $primary['criteria'][0];
            }
        }
        $selectedNames = array_map(static fn (string $id): string => $all[$id]['name'] ?? $id, $selectedIds);
        if ($selectedNames !== []) {
            $parts[] = '你选择了 ' . implode('、', $selectedNames) . '，请对照“鉴别诊断”部分逐条排除。';
        }
        return implode(' ', $parts);
    }

    public static function history(int $userId, int $limit = 12): array
    {
        $limit = max(1, min(30, $limit));
        $stmt = Db::pdo()->prepare(
            'SELECT id, case_key, score, is_correct, time_ms, correct_ids, selected_ids, created_at, answered_at
             FROM quiz_attempts WHERE user_id = ? AND status = "answered" ORDER BY id DESC LIMIT ' . $limit
        );
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll();
        $all = Content::all();
        return array_map(static function (array $row) use ($all): array {
            $correct = json_decode((string) $row['correct_ids'], true) ?: [];
            $selected = json_decode((string) ($row['selected_ids'] ?? '[]'), true) ?: [];
            return [
                'id' => (int) $row['id'],
                'caseKey' => $row['case_key'],
                'correct' => (int) $row['is_correct'] === 1,
                'score' => (int) $row['score'],
                'timeMs' => (int) $row['time_ms'],
                'correctNames' => array_map(static fn (string $id): string => $all[$id]['name'] ?? $id, $correct),
                'selectedNames' => array_map(static fn (string $id): string => $all[$id]['name'] ?? $id, $selected),
                'createdAt' => $row['answered_at'] ?: $row['created_at'],
            ];
        }, $rows);
    }

    public static function localStudyPlan(int $userId): array
    {
        $focus = Stats::weakFocus($userId, 3);
        $accuracy = Stats::chapterAccuracy($userId);
        $weak = array_slice(array_values(array_filter($accuracy, static fn (array $c): bool => $c['attempts'] > 0)), 0, 3);
        $reasons = [];
        foreach ($weak as $row) {
            $reasons[] = sprintf('%s正确率 %d%%，建议优先巩固。', $row['name'], $row['accuracy']);
        }
        if ($reasons === []) {
            $reasons[] = '还没有足够的答题记录，先从基础章节建立判读顺序。';
        }
        return [
            'focus' => $focus,
            'reasons' => $reasons,
            'source' => 'local',
            'recommended' => [
                'level' => count($focus) >= 2 ? 2 : 1,
                'chapter' => 'all',
                'focusIds' => array_column($focus, 'id'),
            ],
        ];
    }
}
