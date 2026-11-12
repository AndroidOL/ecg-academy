<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;
use App\Db;
use App\Learning;
use App\SectionBank;
use App\Quiz;
use App\Secret;

$pdo = Db::pdo();
$publicId = bin2hex(random_bytes(8));
$pdo->prepare('INSERT INTO users (public_id, display_name, is_guest) VALUES (?, ?, 1)')->execute([$publicId, 'learning-test']);
$userId = (int) $pdo->lastInsertId();

$passed = 0;
$failed = 0;
function check(string $name, callable $fn): void {
    global $passed, $failed;
    try { $fn(); $passed++; echo "  ok  {$name}\n"; }
    catch (Throwable $e) { $failed++; echo "FAIL  {$name}: " . $e->getMessage() . "\n"; }
}
function answersFor(array $round): array {
    $answers = [];
    foreach ($round['questions'] as $question) {
        $full = SectionBank::find((string) $question['id']);
        if (!$full) throw new RuntimeException('missing question ' . $question['id']);
        $answers[(string) $question['id']] = (int) $full['answerIndex'];
    }
    return $answers;
}

try {
    check('section bank has enough questions and 4 options', function () {
        $counts = SectionBank::counts();
        assert(count($counts) === count(Content::chapters()));
        foreach ($counts as $chapter => $count) assert($count >= 30, $chapter . ' too few');
        $all = SectionBank::all();
        assert(count($all[0]['options']) === 4);
    });

    check('learning round passes at 8/10 and marks chapter learned', function () use ($userId) {
        $round = Learning::startLearn($userId, 'theory');
        assert(count($round['questions']) === Learning::LEARN_COUNT);
        $result = Learning::submit($userId, $round['token'], answersFor($round));
        assert($result['passed'] === true);
        assert($result['status']['learnedCount'] >= 1);
    });

    check('eight learned chapters unlock exam', function () use ($userId) {
        $chapters = Content::chapters();
        foreach ($chapters as $chapter) {
            if (count(Learning::learnedChapters($userId)) >= Learning::EXAM_UNLOCK) break;
            $round = Learning::startLearn($userId, (string) $chapter['id']);
            Learning::submit($userId, $round['token'], answersFor($round));
        }
        $status = Learning::status($userId);
        assert($status['learnedCount'] >= Learning::EXAM_UNLOCK);
        assert($status['examUnlocked'] === true);
    });

    check('exam returns chapter results and personal score', function () use ($userId) {
        $exam = Learning::startExam($userId);
        assert(count($exam['questions']) === Learning::EXAM_COUNT);
        $result = Learning::submit($userId, $exam['token'], answersFor($exam));
        assert($result['mode'] === 'exam');
        assert($result['accuracy'] === 100);
        assert(count($result['chapterResults']) > 0);
    });

    check('recent window >10 gives a level and repeated errors revoke learned', function () use ($userId) {
        $chapter = 'theory';
        for ($i = 0; $i < 2; $i++) Learning::recordPracticeAnswer($userId, true, $chapter, 'test-correct-' . $i, null, 10);
        $status = Learning::status($userId);
        $row = array_values(array_filter($status['chapters'], static fn (array $c): bool => $c['id'] === $chapter))[0];
        assert($row['sample'] > 10);
        assert($row['level'] === '精通');
        for ($i = 0; $i < 3; $i++) Learning::recordPracticeAnswer($userId, false, $chapter, 'test-wrong-' . $i, null, -40);
        $status = Learning::status($userId);
        $row = array_values(array_filter($status['chapters'], static fn (array $c): bool => $c['id'] === $chapter))[0];
        assert($row['status'] === 'relearning', 'repeated errors should revoke learned');
        assert($status['examUnlocked'] === false || $status['learnedCount'] < Learning::EXAM_UNLOCK);
    });

    check('practice score below threshold locks until next day', function () use ($userId) {
        for ($i = 0; $i < 10; $i++) Learning::recordPracticeAnswer($userId, false, 'theory', 'lock-' . $i, null, -40);
        $until = Learning::practiceLockedUntil($userId);
        assert($until !== null);
        assert(strtotime($until) > time());
        $blocked = false;
        try { Quiz::newAttempt($userId, ['level' => 1, 'chapter' => 'all', 'focus' => []]); }
        catch (Throwable $e) { $blocked = true; }
        assert($blocked, 'locked practice should reject new quiz');
    });

    check('tampered or reused round token is rejected', function () use ($userId) {
        $blocked = false;
        try { Learning::submit($userId, 'bad-token', []); } catch (Throwable $e) { $blocked = true; }
        assert($blocked);
        $round = Learning::startLearn($userId, 'theory');
        $answers = answersFor($round);
        Learning::submit($userId, $round['token'], $answers);
        $reused = false;
        try { Learning::submit($userId, $round['token'], $answers); } catch (Throwable $e) { $reused = true; }
        assert($reused);
    });
} finally {
    $pdo->prepare('DELETE FROM learning_events WHERE user_id = ?')->execute([$userId]);
    $pdo->prepare('DELETE FROM learning_status WHERE user_id = ?')->execute([$userId]);
    $pdo->prepare('DELETE FROM practice_daily_scores WHERE user_id = ?')->execute([$userId]);
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
