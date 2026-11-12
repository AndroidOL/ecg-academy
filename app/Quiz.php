<?php
declare(strict_types=1);

namespace App;

final class Quiz
{
    public static function newAttempt(int $userId, array $params): array
    {
        $lockedUntil = Learning::practiceLockedUntil($userId);
        if ($lockedUntil !== null && empty($params['assignment'])) {
            throw new ApiError(423, 'practice_locked', '今日测试分已低于阈值，需等到次日 00:00 后再使用测试模块（' . $lockedUntil . '）');
        }
        $level = max(1, min(3, (int) ($params['level'] ?? 1)));
        $chapter = (string) ($params['chapter'] ?? 'all');
        $focus = array_values(array_filter((array) ($params['focus'] ?? []), 'is_string'));
        $special = preg_replace('/[^a-z0-9-]/', '', strtolower(trim((string) ($params['special'] ?? ''))));
        $optionPool = array_values(array_filter(array_map('strval', (array) ($params['optionPool'] ?? [])), static fn (string $id): bool => Content::find($id) !== null));
        $confusionId = trim((string) ($params['confusion'] ?? ''));
        $assignment = null;
        $assignmentCode = trim((string) ($params['assignment'] ?? ''));
        if ($assignmentCode !== '') {
            if (!preg_match('/^[a-z0-9]{6,16}$/', $assignmentCode)) throw new ApiError(404, 'assignment_not_found', '作业链接无效');
            $stmt = Db::pdo()->prepare('SELECT * FROM assignments WHERE code = ? AND active = 1 LIMIT 1');
            $stmt->execute([$assignmentCode]);
            $assignment = $stmt->fetch() ?: null;
            if (!$assignment) throw new ApiError(404, 'assignment_not_found', '作业不存在或已关闭');
            $level = max(1, min(3, (int) ($assignment['level'] ?? 1)));
            $chapter = (string) ($assignment['chapter'] ?? 'all');
            $focus = array_values(array_filter(array_map('trim', explode(',', (string) ($assignment['focus'] ?? '')))));
            $focus = array_values(array_filter($focus, static fn (string $id): bool => Content::find($id) !== null));
        }
        $deviceHash = null;
        $rawDevice = trim((string) ($params['device'] ?? ''));
        if ($rawDevice !== '' && preg_match('/^[a-f0-9-]{16,64}$/i', $rawDevice)) $deviceHash = hash('sha256', $rawDevice);
        $combo = null;
        $primary = null;
        $secondary = null;
        $customOptions = null;
        $customExplanations = [];
        $question = '该心电图最可能的诊断是？';
        $stem = '';

        $all = Content::all();
        $bankSeed = null;
        $bankId = null;
        $entry = QuestionBank::pick($level, $chapter, $focus, $special);
        if ($entry) {
            $candidatePrimary = $all[$entry['primary']] ?? null;
            $candidateSecondary = !empty($entry['secondary']) ? ($all[$entry['secondary']] ?? null) : null;
            if ($candidatePrimary && (empty($entry['secondary']) || $candidateSecondary)) {
                $primary = $candidatePrimary;
                $secondary = $candidateSecondary;
                $level = (int) ($entry['level'] ?? $level);
                $bankSeed = (int) ($entry['seed'] ?? 0);
                $bankId = (string) ($entry['id'] ?? '');
                $question = (string) ($entry['question'] ?? $question);
                $stem = (string) ($entry['stem'] ?? '');
                if (isset($entry['options']) && is_array($entry['options'])) {
                    $customOptions = $entry['options'];
                    $customExplanations = array_values(array_filter((array) ($entry['explanations'] ?? []), 'is_array'));
                }
                if (!empty($entry['combo'])) {
                    foreach (require BASE_PATH . '/data/combos.php' as $comboCandidate) {
                        if (($comboCandidate['id'] ?? '') === $entry['combo']) {
                            $combo = $comboCandidate;
                            break;
                        }
                    }
                }
            } else {
                $primary = null;
            }
        }

        if (!$primary && $level === 3) {
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

        if ($customOptions !== null) {
            $correctIds = array_values(array_unique(array_map('strval', (array) ($entry['correctIds'] ?? []))));
        } else {
            $correctIds = [$primary['id']];
            if ($secondary) $correctIds[] = $secondary['id'];
            $correctIds = array_values(array_unique($correctIds));
        }

        $spec = $primary['ecg'] ?? [];
        if ($combo) {
            $spec = array_replace_recursive($spec, $combo['overrides'] ?? []);
        }
        if ($entry && !empty($entry['overrides']) && is_array($entry['overrides'])) {
            $spec = array_replace_recursive($spec, $entry['overrides']);
        }
        $spec['seed'] = $bankSeed ?? random_int(1, 99999);
        if ($entry && !empty($entry['rate'])) {
            $spec['rate'] = (int) $entry['rate'];
            if (($spec['rhythm'] ?? '') === 'sinus') $spec['atrialRate'] = (int) $entry['rate'];
        }
        $spec['duration'] = 8;
        $spec['annotations'] = [];
        unset($spec['description'], $spec['preview']);
        if (($secondary['ecg']['show12Lead'] ?? false) || ($primary['ecg']['show12Lead'] ?? false) || ($entry && !empty($entry['show12Lead']))) {
            $spec['show12Lead'] = true;
        }

        if ($confusionId !== '' && (!Content::find($confusionId) || in_array($confusionId, $correctIds, true))) $confusionId = '';
        $options = self::buildOptions($primary, $secondary, count($correctIds) > 1, '', $confusionId !== '' ? $confusionId : null, $optionPool !== [] ? $optionPool : null, $customOptions);
        $optionIds = array_column($options, 'id');
        $caseKey = $bankId ?? implode('+', $correctIds);
        $payload = [
            'spec' => $spec,
            'correctIds' => $correctIds,
            'optionIds' => $optionIds,
            'level' => $level,
            'chapter' => $entry['chapter'] ?? $primary['chapter'],
            'question' => $question,
            'stem' => $stem,
            'caseKey' => $caseKey,
            'primaryId' => $primary['id'],
            'bankId' => $bankId,
            'special' => $special,
            'optionNames' => array_column($options, 'name', 'id'),
            'customExplanations' => $customExplanations,
            'assignmentId' => $assignment ? (int) $assignment['id'] : null,
            'deviceHash' => $deviceHash,
            'createdAt' => time(),
        ];

        $pdo = Db::pdo();
        $guestStmt = $pdo->prepare('SELECT is_guest FROM users WHERE id = ? LIMIT 1');
        $guestStmt->execute([$userId]);
        $isGuest = (int) ($guestStmt->fetchColumn() ?: 0) === 1;
        if ($isGuest) {
            $attemptId = 'g_' . Secret::seal([
                'payload' => $payload,
                'correctIds' => $correctIds,
                'optionIds' => $optionIds,
                'created' => time(),
            ]);
            return [
                'attemptId' => $attemptId,
                'spec' => $spec,
                'options' => $options,
                'multiple' => count($correctIds) > 1,
                'level' => $level,
                'question' => $question,
                'stem' => $stem,
                'chapter' => $primary['chapter'],
                'assignment' => $assignment ? ['code' => $assignment['code'], 'title' => $assignment['title'], 'className' => $assignment['class_name']] : null,
                'expiresIn' => 7200,
            ];
        }
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
            'assignment' => $assignment ? ['code' => $assignment['code'], 'title' => $assignment['title'], 'className' => $assignment['class_name']] : null,
            'expiresIn' => 7200,
        ];
    }

    public static function assignment(string $code): array
    {
        if (!preg_match('/^[a-z0-9]{6,16}$/', $code)) throw new ApiError(404, 'assignment_not_found', '作业链接无效');
        $stmt = Db::pdo()->prepare('SELECT code, title, class_name, level, chapter, focus, active, created_at FROM assignments WHERE code = ? LIMIT 1');
        $stmt->execute([$code]);
        $assignment = $stmt->fetch();
        if (!$assignment || !(int) $assignment['active']) throw new ApiError(404, 'assignment_not_found', '作业不存在或已关闭');
        $assignment['focus'] = array_values(array_filter(explode(',', (string) ($assignment['focus'] ?? ''))));
        return $assignment;
    }

    private static function recordAssignmentAttempt(array $payload, bool $correct, int $score, int $timeMs): void
    {
        $assignmentId = (int) ($payload['assignmentId'] ?? 0);
        $deviceHash = (string) ($payload['deviceHash'] ?? '');
        if ($assignmentId <= 0 || !preg_match('/^[a-f0-9]{64}$/', $deviceHash)) return;
        try {
            $stmt = Db::pdo()->prepare('INSERT INTO assignment_attempts (assignment_id, device_hash, correct, score, time_ms) VALUES (?, ?, ?, ?, ?)');
            $stmt->execute([$assignmentId, $deviceHash, $correct ? 1 : 0, max(0, $score), max(0, min(600000, $timeMs))]);
        } catch (Throwable $e) {
            error_log('[assignment] record failed: ' . $e->getMessage());
        }
    }

    public static function buildOptions(array $primary, ?array $secondary, bool $multiple, string $salt = '', ?string $forcedDistractorId = null, ?array $optionPool = null, ?array $customOptions = null): array
    {
        $all = Content::all();
        if ($customOptions !== null) {
            $options = [];
            foreach ($customOptions as $option) {
                if (!is_array($option) || empty($option['id'])) continue;
                $options[] = [
                    'id' => (string) $option['id'],
                    'name' => (string) ($option['name'] ?? $option['id']),
                    'nameEn' => (string) ($option['nameEn'] ?? $option['name'] ?? $option['id']),
                    'chapter' => (string) ($option['chapter'] ?? ''),
                ];
            }
            if ($salt !== '') {
                $optRank = static fn (array $option): string => hash('sha256', $salt . '|o|' . $option['id']);
                usort($options, static fn (array $a, array $b): int => strcmp($optRank($a), $optRank($b)));
            } else {
                shuffle($options);
            }
            return $options;
        }
        $correct = [$primary];
        if ($secondary) $correct[] = $secondary;
        $correctIds = array_column($correct, 'id');
        $wanted = $multiple ? 6 : 5;
        $ids = $correctIds;
        $candidates = [];

        if ($optionPool !== null) {
            // 专项训练只允许本专项诊断作为干扰项；不足 5 项时宁可少选项。
            foreach ($optionPool as $id) {
                $id = (string) $id;
                if (isset($all[$id]) && !in_array($id, $ids, true)) $candidates[] = $id;
            }
        } else {
            foreach ($correct as $diagnosis) {
                foreach ($diagnosis['differential'] ?? [] as $diff) {
                    $id = $diff['id'] ?? '';
                    if ($id !== '' && isset($all[$id]) && !in_array($id, $ids, true)) {
                        $candidates[] = $id;
                    }
                }
            }
            if ($forcedDistractorId !== null && isset($all[$forcedDistractorId]) && !in_array($forcedDistractorId, $ids, true)) {
                array_unshift($candidates, $forcedDistractorId);
            }
            foreach ($all as $diagnosis) {
                if (!in_array($diagnosis['id'], $ids, true) && ($diagnosis['quizEligible'] ?? true)) {
                    $candidates[] = $diagnosis['id'];
                }
            }
        }
        $candidates = array_values(array_unique($candidates));
        if ($salt !== '') {
            $rank = static fn (string $id): string => hash('sha256', $salt . '|c|' . $id);
            usort($candidates, static fn (string $a, string $b): int => strcmp($rank($a), $rank($b)));
        } else {
            shuffle($candidates);
        }
        foreach ($candidates as $id) {
            if (count($ids) >= $wanted) break;
            if (!in_array($id, $ids, true)) $ids[] = $id;
        }
        if ($optionPool === null && $forcedDistractorId !== null && isset($all[$forcedDistractorId]) && !in_array($forcedDistractorId, $correctIds, true) && !in_array($forcedDistractorId, $ids, true)) {
            for ($i = count($ids) - 1; $i >= 0; $i -= 1) {
                if (!in_array($ids[$i], $correctIds, true)) { $ids[$i] = $forcedDistractorId; break; }
            }
            if (!in_array($forcedDistractorId, $ids, true)) $ids[] = $forcedDistractorId;
        }

        $options = [];
        foreach ($ids as $id) {
            $options[] = [
                'id' => $id,
                'name' => $all[$id]['name'] ?? $id,
                'nameEn' => $all[$id]['en'] ?? ($all[$id]['name'] ?? $id),
                'chapter' => $all[$id]['chapter'] ?? '',
            ];
        }
        if ($salt !== '') {
            $optRank = static fn (array $option): string => hash('sha256', $salt . '|o|' . $option['id']);
            usort($options, static fn (array $a, array $b): int => strcmp($optRank($a), $optRank($b)));
        } else {
            shuffle($options);
        }
        return $options;
    }

    public static function answer(int $userId, int|string $attemptId, array $selectedIds, int $timeMs, ?int $clientLevel = null): array
    {
        if (is_string($attemptId) && str_starts_with($attemptId, 'g_')) {
            return self::answerGuest($userId, $attemptId, $selectedIds, $timeMs, $clientLevel);
        }
        $attemptId = (int) $attemptId;
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
        $timeMs = max(0, min(600000, $timeMs));
        $scored = Scoring::evaluate([
            'correct' => $isCorrect,
            'partial' => $partial,
            'difficulty' => $level,
            'level' => Level::forUser($userId)['level'],
            'mode' => 'practice',
            'timeMs' => $timeMs,
            'forceUnlocked' => !empty($payload['assignmentId']),
        ]);
        $base = $scored['base'];
        $timeBonus = $scored['timeBonus'];
        $slow = $scored['slow'];
        $score = $scored['score'];
        $xp = $scored['xp'];

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

            if ($xp !== 0) $pdo->prepare('UPDATE users SET xp = GREATEST(0, xp + ?) WHERE id = ?')->execute([$xp, $userId]);

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
                if (!isset($all[$id])) continue;
                $progress->execute([$userId, $id, $isCorrect ? 'mastered' : 'read', $isCorrect ? date('Y-m-d H:i:s') : null]);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }

        self::recordAssignmentAttempt($payload, $isCorrect, $score, $timeMs);
        Learning::recordPracticeAnswer($userId, $isCorrect, (string) ($payload['chapter'] ?? ''), (string) (($payload['bankId'] ?? '') ?: ($payload['caseKey'] ?? 'practice')), $timeMs, $score, $scored['unlocked']);
        $all = Content::all();
        $optionNames = (array) ($payload['optionNames'] ?? []);
        $customExplanations = array_values(array_filter((array) ($payload['customExplanations'] ?? []), 'is_array'));
        $nameFor = static fn (string $id): string => $all[$id]['name'] ?? $optionNames[$id] ?? $id;
        $selectedNames = array_map($nameFor, $selectedIds);
        $explanation = [];
        if ($customExplanations !== []) {
            $explanation = $customExplanations;
        } else {
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
        }

        $localText = self::localExplanation($isCorrect, $partial, $correctIds, $selectedIds, $all, $optionNames, $customExplanations);
        return [
            'attemptId' => $attemptId,
            'correct' => $isCorrect,
            'partial' => $partial,
            'correctIds' => $correctIds,
            'correctNames' => array_map($nameFor, $correctIds),
            'selectedNames' => $selectedNames,
            'score' => $score,
            'xp' => $xp,
            'timeMs' => $timeMs,
            'baseScore' => $base,
            'timeBonus' => $timeBonus,
            'slow' => $slow,
            'speed' => $scored['speed'],
            'xpMultiplier' => $scored['xpMultiplier'],
            'penalty' => $scored['penalty'],
            'unlocked' => $scored['unlocked'],
            'unlockLevel' => $scored['unlockLevel'],
            'explanation' => $explanation,
            'localExplanation' => $localText,
            'aiAvailable' => Ai::configured(),
        ];
    }

    private static function consumeGuestToken(string $token): void
    {
        $pdo = Db::pdo();
        try {
            $pdo->prepare('INSERT INTO consumed_tokens (token_hash, expires_at) VALUES (?, DATE_ADD(NOW(), INTERVAL 2 HOUR))')
                ->execute([hash('sha256', $token)]);
        } catch (\PDOException $e) {
            if ((string) $e->getCode() === '23000') {
                throw new ApiError(409, 'attempt_already_answered', '该题已作答，请重新出题');
            }
            throw $e;
        }
        if (random_int(1, 20) === 1) {
            $pdo->exec('DELETE FROM consumed_tokens WHERE expires_at < NOW() - INTERVAL 1 DAY');
        }
    }

    private static function answerGuest(int $userId, string $token, array $selectedIds, int $timeMs, ?int $clientLevel = null): array
    {
        $data = Secret::open(substr($token, 2));
        if (!$data || (time() - (int) ($data['created'] ?? 0)) > 7200) {
            throw new ApiError(410, 'attempt_expired', '题目已过期，请重新出题');
        }
        $payload = (array) ($data['payload'] ?? []);
        $correctIds = array_values(array_map('strval', (array) ($data['correctIds'] ?? [])));
        $optionIds = array_values(array_map('strval', (array) ($data['optionIds'] ?? [])));
        $selectedIds = array_values(array_unique(array_filter(array_map('strval', $selectedIds))));
        foreach ($selectedIds as $id) {
            if (!in_array($id, $optionIds, true)) throw new ApiError(422, 'invalid_option', '包含无效选项');
        }
        if ($selectedIds === []) throw new ApiError(422, 'empty_answer', '请至少选择一个诊断');
        self::consumeGuestToken($token);
        $sortedCorrect = $correctIds; $sortedSelected = $selectedIds;
        sort($sortedCorrect); sort($sortedSelected);
        $isCorrect = $sortedCorrect === $sortedSelected;
        $partial = !$isCorrect && array_intersect($correctIds, $selectedIds) !== [];
        $level = (int) ($payload['level'] ?? 1);
        $timeMs = max(0, min(600000, $timeMs));
        $scored = Scoring::evaluate([
            'correct' => $isCorrect,
            'partial' => $partial,
            'difficulty' => $level,
            'level' => max(1, min(Level::MAX, (int) ($clientLevel ?? 1))),
            'mode' => 'practice',
            'timeMs' => $timeMs,
            'forceUnlocked' => !empty($payload['assignmentId']),
        ]);
        $base = $scored['base'];
        $timeBonus = $scored['timeBonus'];
        $slow = $scored['slow'];
        $score = $scored['score'];
        $xp = $scored['xp'];
        self::recordAssignmentAttempt($payload, $isCorrect, $score, $timeMs);
        Learning::recordPracticeAnswer($userId, $isCorrect, (string) ($payload['chapter'] ?? ''), (string) (($payload['bankId'] ?? '') ?: ($payload['caseKey'] ?? 'practice')), $timeMs, $score, $scored['unlocked']);
        $all = Content::all();
        $optionNames = (array) ($payload['optionNames'] ?? []);
        $customExplanations = array_values(array_filter((array) ($payload['customExplanations'] ?? []), 'is_array'));
        $nameFor = static fn (string $id): string => $all[$id]['name'] ?? $optionNames[$id] ?? $id;
        $selectedNames = array_map($nameFor, $selectedIds);
        $explanation = [];
        if ($customExplanations !== []) {
            $explanation = $customExplanations;
        } else {
            foreach ($correctIds as $id) {
                $d = $all[$id] ?? null;
                if (!$d) continue;
                $explanation[] = [
                    'id' => $d['id'], 'name' => $d['name'], 'oneLiner' => $d['oneLiner'] ?? '',
                    'specificity' => $d['specificity'] ?? '', 'keyNumbers' => $d['keyNumbers'] ?? [],
                    'criteria' => array_slice($d['criteria'] ?? [], 0, 3), 'management' => array_slice($d['management'] ?? [], 0, 2),
                    'description' => $d['ecg']['description'] ?? '',
                ];
            }
        }
        return [
            'attemptId' => $token, 'correct' => $isCorrect, 'partial' => $partial,
            'correctIds' => $correctIds,
            'correctNames' => array_map($nameFor, $correctIds),
            'selectedNames' => $selectedNames, 'score' => $score, 'xp' => $xp, 'timeMs' => $timeMs,
            'baseScore' => $base, 'timeBonus' => $timeBonus,
            'slow' => $slow, 'speed' => $scored['speed'],
            'xpMultiplier' => $scored['xpMultiplier'], 'penalty' => $scored['penalty'],
            'unlocked' => $scored['unlocked'], 'unlockLevel' => $scored['unlockLevel'],
            'explanation' => $explanation,
            'localExplanation' => self::localExplanation($isCorrect, $partial, $correctIds, $selectedIds, $all, $optionNames, $customExplanations),
            'aiAvailable' => false,
        ];
    }

    private static function localExplanation(bool $correct, bool $partial, array $correctIds, array $selectedIds, array $all, array $optionNames = [], array $customExplanations = []): string
    {
        $nameFor = static fn (string $id): string => $all[$id]['name'] ?? $optionNames[$id] ?? $id;
        $correctNames = array_map($nameFor, $correctIds);
        $custom = $customExplanations[0] ?? null;
        if ($correct) {
            $d = $all[$correctIds[0]] ?? $custom;
            return '判断正确。关键线索：' . ($d['specificity'] ?? $d['oneLiner'] ?? '') . ' 下一步可用“AI 导师”继续追问机制与鉴别。';
        }
        $parts = [];
        $parts[] = '正确答案是：' . implode('、', $correctNames) . '。';
        if ($partial) {
            $parts[] = '你选对了一部分，但诊断组合不完整。';
        } else {
            $parts[] = '你的选择与正确诊断不一致。';
        }
        $primary = $all[$correctIds[0]] ?? $custom;
        if ($primary) {
            $parts[] = '最关键的识别点是：' . ($primary['specificity'] ?? $primary['oneLiner'] ?? '');
            if (!empty($primary['criteria'][0])) {
                $parts[] = '再看一遍标准：' . $primary['criteria'][0];
            }
        }
        $selectedNames = array_map($nameFor, $selectedIds);
        if ($selectedNames !== []) {
            $parts[] = '你选择了 ' . implode('、', $selectedNames) . '，请对照解析逐条排除。';
        }
        return implode(' ', $parts);
    }

    public static function history(int $userId, int $limit = 12): array
    {
        $limit = max(1, min(30, $limit));
        $stmt = Db::pdo()->prepare(
            'SELECT id, case_key, score, is_correct, time_ms, correct_ids, selected_ids, payload, created_at, answered_at
             FROM quiz_attempts WHERE user_id = ? AND status = "answered" ORDER BY id DESC LIMIT ' . $limit
        );
        $stmt->execute([$userId]);
        $rows = $stmt->fetchAll();
        $all = Content::all();
        return array_map(static function (array $row) use ($all): array {
            $correct = json_decode((string) $row['correct_ids'], true) ?: [];
            $selected = json_decode((string) ($row['selected_ids'] ?? '[]'), true) ?: [];
            $payload = json_decode((string) ($row['payload'] ?? '{}'), true) ?: [];
            $optionNames = (array) ($payload['optionNames'] ?? []);
            $nameFor = static fn (string $id): string => $all[$id]['name'] ?? $optionNames[$id] ?? $id;
            return [
                'id' => (int) $row['id'],
                'caseKey' => $row['case_key'],
                'correct' => (int) $row['is_correct'] === 1,
                'score' => (int) $row['score'],
                'timeMs' => (int) $row['time_ms'],
                'correctNames' => array_map($nameFor, $correct),
                'selectedNames' => array_map($nameFor, $selected),
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
