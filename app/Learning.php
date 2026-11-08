<?php
declare(strict_types=1);

namespace App;

final class Learning
{
    public const LEARN_COUNT = 10;
    public const LEARN_PASS = 8;
    public const EXAM_UNLOCK = 8;
    public const EXAM_COUNT = 10;
    public const RECENT_WINDOW = 50;
    public const SAMPLE_MIN = 11;
    public const PRACTICE_LOCK_SCORE = -100;
    private const MAX_EVENT_WINDOW = 50;

    public static function chapterMap(): array
    {
        $map = [];
        foreach (Content::chapters() as $chapter) $map[$chapter['id']] = $chapter;
        return $map;
    }

    public static function startLearn(int $userId, string $chapterId): array
    {
        $chapters = self::chapterMap();
        if (!isset($chapters[$chapterId])) throw new ApiError(404, 'chapter_not_found', '板块不存在');
        $questions = SectionBank::pick($chapterId, self::LEARN_COUNT);
        $roundId = 'r_' . bin2hex(random_bytes(12));
        $token = Secret::seal([
            'v' => 1,
            'uid' => $userId,
            'mode' => 'learn',
            'chapter' => $chapterId,
            'chapters' => [$chapterId],
            'round' => $roundId,
            'questions' => array_column($questions, 'id'),
            'created' => time(),
        ]);
        return [
            'token' => $token,
            'round' => $roundId,
            'mode' => 'learn',
            'chapter' => $chapterId,
            'chapterName' => $chapters[$chapterId]['name'],
            'count' => count($questions),
            'pass' => self::LEARN_PASS,
            'questions' => array_map([SectionBank::class, 'publicQuestion'], $questions),
        ];
    }

    public static function startExam(int $userId): array
    {
        $learned = self::learnedChapters($userId);
        if (count($learned) < self::EXAM_UNLOCK) {
            throw new ApiError(403, 'exam_locked', '至少完成 ' . self::EXAM_UNLOCK . ' 个板块的学习后才能进入考试');
        }
        $ids = array_values(array_map(static fn (array $chapter): string => $chapter['id'], $learned));
        $questions = SectionBank::pickExam($ids, self::EXAM_COUNT);
        $roundId = 'e_' . bin2hex(random_bytes(12));
        $token = Secret::seal([
            'v' => 1,
            'uid' => $userId,
            'mode' => 'exam',
            'chapter' => '',
            'chapters' => $ids,
            'round' => $roundId,
            'questions' => array_column($questions, 'id'),
            'created' => time(),
        ]);
        return [
            'token' => $token,
            'round' => $roundId,
            'mode' => 'exam',
            'chapters' => $ids,
            'count' => count($questions),
            'questions' => array_map([SectionBank::class, 'publicQuestion'], $questions),
        ];
    }

    public static function submit(int $userId, string $token, array $answers): array
    {
        $round = Secret::open($token);
        if (!$round || (int) ($round['uid'] ?? 0) !== $userId) {
            throw new ApiError(422, 'round_invalid', '本轮题目已失效，请重新开始');
        }
        if (time() - (int) ($round['created'] ?? 0) > 7200) {
            throw new ApiError(410, 'round_expired', '本轮已超过 2 小时，请重新开始');
        }
        $mode = (string) ($round['mode'] ?? 'learn');
        if (!in_array($mode, ['learn', 'exam'], true)) throw new ApiError(422, 'round_invalid', '题型无效');
        $roundId = (string) ($round['round'] ?? '');
        if ($roundId === '') throw new ApiError(422, 'round_invalid', '轮次无效');
        $existing = Db::pdo()->prepare('SELECT COUNT(*) FROM learning_events WHERE user_id = ? AND round_id = ?');
        $existing->execute([$userId, $roundId]);
        if ((int) $existing->fetchColumn() > 0) throw new ApiError(409, 'round_submitted', '本轮已提交');

        $questionIds = array_values(array_map('strval', (array) ($round['questions'] ?? [])));
        if ($questionIds === []) throw new ApiError(422, 'round_invalid', '本轮题目为空');
        $answerMap = [];
        foreach ($answers as $questionId => $choice) {
            $questionId = (string) $questionId;
            if (in_array($questionId, $questionIds, true)) $answerMap[$questionId] = (int) $choice;
        }
        if (count($answerMap) < count($questionIds)) {
            throw new ApiError(422, 'answers_incomplete', '请完成全部题目后再提交');
        }

        $details = [];
        $correctCount = 0;
        $chapterCorrect = [];
        $chapterTotal = [];
        foreach ($questionIds as $questionId) {
            $question = SectionBank::find($questionId);
            if (!$question) throw new ApiError(500, 'question_missing', '题目数据缺失，请重新开始');
            $selected = (int) ($answerMap[$questionId] ?? -1);
            $answer = (int) ($question['answerIndex'] ?? -1);
            $isCorrect = $selected === $answer;
            $chapter = (string) ($question['chapter'] ?? '');
            $chapterTotal[$chapter] = ($chapterTotal[$chapter] ?? 0) + 1;
            if ($isCorrect) {
                $correctCount++;
                $chapterCorrect[$chapter] = ($chapterCorrect[$chapter] ?? 0) + 1;
            }
            self::recordEvent($userId, $chapter, $questionId, $mode, $roundId, $isCorrect);
            $details[] = [
                'id' => $questionId,
                'chapter' => $chapter,
                'sourceId' => (string) ($question['sourceId'] ?? ''),
                'stem' => (string) ($question['stem'] ?? ''),
                'selected' => $selected,
                'answer' => $answer,
                'correct' => $isCorrect,
                'explanation' => (string) ($question['explanation'] ?? ''),
                'options' => array_values($question['options']),
            ];
        }

        $total = count($questionIds);
        $accuracy = $total > 0 ? (int) round(($correctCount / $total) * 100) : 0;
        $passed = $mode === 'learn' && $correctCount >= self::LEARN_PASS;
        if ($mode === 'learn') {
            $chapter = (string) ($round['chapter'] ?? '');
            self::updateLearnStatus($userId, $chapter, $passed, $roundId);
        } else {
            foreach (array_keys($chapterTotal) as $chapter) self::evaluateChapter($userId, $chapter);
        }
        $status = self::status($userId);
        return [
            'mode' => $mode,
            'round' => $roundId,
            'correct' => $correctCount,
            'total' => $total,
            'accuracy' => $accuracy,
            'passed' => $passed,
            'score' => $mode === 'exam' ? $accuracy : null,
            'details' => $details,
            'chapterResults' => array_map(static fn (string $chapter): array => [
                'chapter' => $chapter,
                'correct' => $chapterCorrect[$chapter] ?? 0,
                'total' => $chapterTotal[$chapter],
            ], array_keys($chapterTotal)),
            'status' => $status,
        ];
    }

    public static function learnedChapters(int $userId): array
    {
        $stmt = Db::pdo()->prepare('SELECT chapter FROM learning_status WHERE user_id = ? AND status = "learned" ORDER BY learned_at ASC, chapter ASC');
        $stmt->execute([$userId]);
        $map = self::chapterMap();
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            if (isset($map[$row['chapter']])) $out[] = $map[$row['chapter']];
        }
        return $out;
    }

    public static function status(int $userId): array
    {
        $chapters = Content::chapters();
        $statusStmt = Db::pdo()->prepare('SELECT chapter, status, learned_at, last_round, updated_at FROM learning_status WHERE user_id = ?');
        $statusStmt->execute([$userId]);
        $statusMap = [];
        foreach ($statusStmt->fetchAll() as $row) $statusMap[$row['chapter']] = $row;
        $out = [];
        $learnedCount = 0;
        foreach ($chapters as $chapter) {
            $cid = (string) $chapter['id'];
            $stat = self::chapterWindow($userId, $cid);
            $stored = $statusMap[$cid] ?? null;
            $status = $stored['status'] ?? ($stat['sample'] > 0 ? 'learning' : 'not_started');
            if ($status === 'learned') {
                $evaluated = self::evaluateChapter($userId, $cid);
                $status = $evaluated['status'];
            }
            if ($status === 'learned') $learnedCount++;
            $out[] = [
                'id' => $cid,
                'name' => $chapter['name'],
                'color' => $chapter['color'] ?? 'teal',
                'status' => $status,
                'statusLabel' => [
                    'not_started' => '未开始',
                    'learning' => '学习中',
                    'learned' => '已学习',
                    'relearning' => '重新学习',
                ][$status] ?? '学习中',
                'learnedAt' => $stored['learned_at'] ?? null,
                'sample' => $stat['sample'],
                'correct' => $stat['correct'],
                'accuracy' => $stat['accuracy'],
                'level' => $stat['level'],
                'recentAt' => $stat['recentAt'],
            ];
        }
        return [
            'chapters' => $out,
            'learnedCount' => $learnedCount,
            'examUnlocked' => $learnedCount >= self::EXAM_UNLOCK,
            'examUnlockAt' => self::EXAM_UNLOCK,
            'learnPass' => self::LEARN_PASS,
            'learnCount' => self::LEARN_COUNT,
            'sampleMin' => self::SAMPLE_MIN,
            'window' => self::RECENT_WINDOW,
            'bankTotal' => count(SectionBank::all()),
            'sectionCounts' => SectionBank::counts(),
        ];
    }

    private static function chapterWindow(int $userId, string $chapter): array
    {
        $stmt = Db::pdo()->prepare(
            'SELECT correct, time_ms, created_at FROM learning_events
             WHERE user_id = ? AND chapter = ?
             ORDER BY id DESC LIMIT ' . self::MAX_EVENT_WINDOW
        );
        $stmt->execute([$userId, $chapter]);
        $rows = $stmt->fetchAll();
        $sample = count($rows);
        $correct = 0;
        $fastCorrect = 0;
        $slow = 0;
        foreach ($rows as $row) {
            if ((int) $row['correct'] !== 1) continue;
            $correct++;
            $timeMs = $row['time_ms'] === null ? null : (int) $row['time_ms'];
            if ($timeMs === null || $timeMs <= 15000) $fastCorrect++;
            else $slow++;
        }
        $accuracy = $sample > 0 ? (int) round(($fastCorrect / $sample) * 100) : 0;
        $level = '样本不足';
        if ($sample > 10) {
            if ($accuracy >= 85) $level = '精通';
            elseif ($accuracy >= 70) $level = '熟练';
            elseif ($accuracy >= 50) $level = '掌握';
            else $level = '生疏';
        }
        return [
            'sample' => $sample,
            'correct' => $correct,
            'fastCorrect' => $fastCorrect,
            'slow' => $slow,
            'accuracy' => $accuracy,
            'level' => $level,
            'recentAt' => $rows[0]['created_at'] ?? null,
            'recent' => $rows,
        ];
    }

    private static function updateLearnStatus(int $userId, string $chapter, bool $passed, string $roundId): void
    {
        $existing = Db::pdo()->prepare('SELECT status FROM learning_status WHERE user_id = ? AND chapter = ? LIMIT 1');
        $existing->execute([$userId, $chapter]);
        $current = (string) ($existing->fetchColumn() ?: '');
        if ($passed) {
            Db::pdo()->prepare(
                'INSERT INTO learning_status (user_id, chapter, status, last_round, learned_at)
                 VALUES (?, ?, "learned", ?, NOW())
                 ON DUPLICATE KEY UPDATE status = "learned", last_round = VALUES(last_round), learned_at = COALESCE(learned_at, NOW())'
            )->execute([$userId, $chapter, $roundId]);
            return;
        }
        $window = self::chapterWindow($userId, $chapter);
        $revoked = self::shouldRevoke($window);
        $status = $revoked ? 'relearning' : ($current === 'learned' ? 'learned' : ($current === 'relearning' ? 'relearning' : 'learning'));
        Db::pdo()->prepare(
            'INSERT INTO learning_status (user_id, chapter, status, last_round)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status), last_round = VALUES(last_round), learned_at = IF(VALUES(status) = "learned", learned_at, NULL)'
        )->execute([$userId, $chapter, $status, $roundId]);
    }

    public static function evaluateChapter(int $userId, string $chapter): array
    {
        $window = self::chapterWindow($userId, $chapter);
        $stmt = Db::pdo()->prepare('SELECT status FROM learning_status WHERE user_id = ? AND chapter = ? LIMIT 1');
        $stmt->execute([$userId, $chapter]);
        $status = (string) ($stmt->fetchColumn() ?: 'learning');
        if ($status === 'learned' && self::shouldRevoke($window)) {
            Db::pdo()->prepare('UPDATE learning_status SET status = "relearning", learned_at = NULL WHERE user_id = ? AND chapter = ?')
                ->execute([$userId, $chapter]);
            $status = 'relearning';
        }
        return ['status' => $status] + $window;
    }

    private static function shouldRevoke(array $window): bool
    {
        $recent = $window['recent'] ?? [];
        $sample = (int) ($window['sample'] ?? 0);
        if ($sample < 5) return false;
        $last5Wrong = 0;
        foreach (array_slice($recent, 0, 5) as $row) if ((int) $row['correct'] === 0) $last5Wrong++;
        if ($last5Wrong >= 3) return true;
        $last10Wrong = 0;
        foreach (array_slice($recent, 0, 10) as $row) if ((int) $row['correct'] === 0) $last10Wrong++;
        if ($last10Wrong >= 6) return true;
        return $sample >= 10 && (int) ($window['accuracy'] ?? 0) < 60;
    }

    private static function recordEvent(int $userId, string $chapter, string $questionId, string $mode, string $roundId, bool $correct, ?int $timeMs = null): void
    {
        Db::pdo()->prepare(
            'INSERT INTO learning_events (user_id, chapter, question_id, mode, round_id, correct, time_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$userId, $chapter, $questionId, $mode, $roundId, $correct ? 1 : 0, $timeMs]);
    }

    public static function practiceLockedUntil(int $userId): ?string
    {
        $stmt = Db::pdo()->prepare('SELECT locked_until FROM practice_daily_scores WHERE user_id = ? AND day = CURDATE() LIMIT 1');
        $stmt->execute([$userId]);
        $until = $stmt->fetchColumn();
        if (!$until || strtotime((string) $until) <= time()) return null;
        return (string) $until;
    }

    public static function recordPracticeAnswer(int $userId, bool $correct, string $chapter, string $questionId): array
    {
        $chapter = trim($chapter);
        if ($chapter !== '' && isset(self::chapterMap()[$chapter])) {
            self::recordEvent($userId, $chapter, $questionId !== '' ? $questionId : 'practice', 'practice', '', $correct);
            self::evaluateChapter($userId, $chapter);
        }
        return self::recordPractice($userId, $correct);
    }

    public static function recordPractice(int $userId, bool $correct): array
    {
        $pdo = Db::pdo();
        $scoreDelta = $correct ? 1 : -10;
        $pdo->prepare(
            'INSERT INTO practice_daily_scores (user_id, day, score, correct, wrong)
             VALUES (?, CURDATE(), ?, ?, ?)
             ON DUPLICATE KEY UPDATE score = score + VALUES(score), correct = correct + VALUES(correct), wrong = wrong + VALUES(wrong)'
        )->execute([$userId, $scoreDelta, $correct ? 1 : 0, $correct ? 0 : 1]);
        $stmt = $pdo->prepare('SELECT * FROM practice_daily_scores WHERE user_id = ? AND day = CURDATE() LIMIT 1');
        $stmt->execute([$userId]);
        $row = $stmt->fetch() ?: ['score' => $scoreDelta, 'correct' => $correct ? 1 : 0, 'wrong' => $correct ? 0 : 1, 'locked_until' => null];
        if ((int) $row['score'] <= self::PRACTICE_LOCK_SCORE) {
            $until = date('Y-m-d 00:00:00', strtotime('tomorrow'));
            $pdo->prepare('UPDATE practice_daily_scores SET locked_until = ? WHERE user_id = ? AND day = CURDATE()')
                ->execute([$until, $userId]);
            $row['locked_until'] = $until;
        }
        return $row;
    }

    public static function practiceStatus(int $userId): array
    {
        $stmt = Db::pdo()->prepare('SELECT * FROM practice_daily_scores WHERE user_id = ? AND day = CURDATE() LIMIT 1');
        $stmt->execute([$userId]);
        $row = $stmt->fetch() ?: ['score' => 0, 'correct' => 0, 'wrong' => 0, 'locked_until' => null];
        $lockedUntil = $row['locked_until'] && strtotime((string) $row['locked_until']) > time() ? (string) $row['locked_until'] : null;
        $leaderboard = self::practiceLeaderboardData($userId, 'today');
        return [
            'score' => (int) $row['score'],
            'correct' => (int) $row['correct'],
            'wrong' => (int) $row['wrong'],
            'locked' => $lockedUntil !== null,
            'lockedUntil' => $lockedUntil,
            'lockScore' => self::PRACTICE_LOCK_SCORE,
            'leaderboard' => $leaderboard['items'],
            'leaderboardMe' => $leaderboard['me'],
        ];
    }

    public static function practiceLeaderboard(string $scope = 'today'): array
    {
        return self::practiceLeaderboardData(0, $scope)['items'];
    }

    public static function practiceLeaderboardData(int $userId, string $scope = 'today'): array
    {
        $scope = in_array($scope, ['today', 'week', 'all'], true) ? $scope : 'today';
        $pdo = Db::pdo();
        $where = '';
        if ($scope === 'today') $where = 'WHERE p.day = CURDATE()';
        elseif ($scope === 'week') $where = 'WHERE p.day >= CURDATE() - INTERVAL 6 DAY';
        $stmt = $pdo->query(
            'SELECT u.public_id, u.display_name, u.is_guest,
                    SUM(p.score) AS score, SUM(p.correct) AS correct, SUM(p.wrong) AS wrong,
                    COUNT(*) AS active_days
             FROM practice_daily_scores p JOIN users u ON u.id = p.user_id
             ' . $where . '
             GROUP BY u.id
             ORDER BY score DESC, correct DESC, u.id ASC'
        );
        $rows = $stmt->fetchAll();
        $publicId = '';
        $me = null;
        if ($userId > 0) {
            $userStmt = $pdo->prepare('SELECT public_id, display_name, is_guest FROM users WHERE id = ? LIMIT 1');
            $userStmt->execute([$userId]);
            $user = $userStmt->fetch();
            if ($user) {
                $publicId = (string) $user['public_id'];
                $me = [
                    'rank' => null,
                    'id' => $user['public_id'],
                    'name' => $user['display_name'],
                    'isGuest' => (int) $user['is_guest'] === 1,
                    'points' => 0,
                    'correct' => 0,
                    'wrong' => 0,
                    'accuracy' => 0,
                    'activeDays' => 0,
                ];
            }
        }
        $items = [];
        foreach ($rows as $index => $row) {
            $accuracy = ((int) $row['correct'] + (int) $row['wrong']) > 0
                ? (int) round(((int) $row['correct'] / ((int) $row['correct'] + (int) $row['wrong'])) * 100)
                : 0;
            $item = [
                'rank' => $index + 1,
                'id' => $row['public_id'],
                'name' => $row['display_name'],
                'isGuest' => (int) $row['is_guest'] === 1,
                'points' => (int) $row['score'],
                'correct' => (int) $row['correct'],
                'wrong' => (int) $row['wrong'],
                'accuracy' => $accuracy,
                'activeDays' => (int) $row['active_days'],
            ];
            if (count($items) < 50) $items[] = $item;
            if ($publicId !== '' && (string) $row['public_id'] === $publicId) $me = $item;
        }
        return [
            'scope' => $scope,
            'items' => $items,
            'me' => $me,
            'total' => count($rows),
            'updatedAt' => date(DATE_ATOM),
        ];
    }

}
