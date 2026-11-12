<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Db;
use App\Quiz;

$passed = 0;
$failed = 0;
$userId = 0;

function check(string $name, callable $fn): void
{
    global $passed, $failed;
    try {
        $fn();
        $passed++;
        echo "  ok  {$name}\n";
    } catch (Throwable $e) {
        $failed++;
        echo "  FAIL {$name}: " . $e->getMessage() . "\n";
    }
}

try {
    $pdo = Db::pdo();
    $stmt = $pdo->prepare('INSERT INTO users (public_id, username, password_hash, display_name, is_guest) VALUES (?, ?, ?, ?, 0)');
    $stmt->execute([bin2hex(random_bytes(8)), 'sp' . bin2hex(random_bytes(4)), password_hash('pw-123456', PASSWORD_DEFAULT), 'special-test']);
    $userId = (int) $pdo->lastInsertId();

    check('special option pool excludes unrelated diagnoses', function () use ($userId): void {
        $quiz = Quiz::newAttempt($userId, [
            'level' => 2,
            'focus' => ['rbbb', 'lbbb', 'lafb'],
            'special' => 'bundle-block',
            'optionPool' => ['rbbb', 'lbbb', 'lafb'],
        ]);
        $ids = array_column($quiz['options'], 'id');
        $allowed = ['rbbb', 'lbbb', 'lafb'];
        assert($ids !== [], 'no options');
        assert(array_diff($ids, $allowed) === [], 'unrelated option: ' . implode(',', array_diff($ids, $allowed)));
    });

    check('posterior/RV special returns a custom decision case', function () use ($userId): void {
        $quiz = Quiz::newAttempt($userId, [
            'level' => 3,
            'focus' => ['stemi-posterior', 'stemi-rv', 'stemi-inferior'],
            'special' => 'posterior-rv',
            'optionPool' => ['stemi-posterior', 'stemi-rv', 'stemi-inferior'],
        ]);
        assert($quiz['question'] !== '该心电图最可能的诊断是？', 'custom question missing');
        assert(str_contains($quiz['question'], '导联') || str_contains($quiz['question'], '下一步') || str_contains($quiz['question'], '诊断'), 'unexpected question');
        assert(count($quiz['options']) >= 2, 'not enough options');
        assert(($quiz['spec']['show12Lead'] ?? false) === true, '12-lead should be enabled');
    });

    check('custom decision answer returns custom explanation', function () use ($userId): void {
        $quiz = Quiz::newAttempt($userId, [
            'level' => 3,
            'special' => 'posterior-rv',
            'focus' => ['stemi-posterior', 'stemi-rv', 'stemi-inferior'],
            'optionPool' => ['stemi-posterior', 'stemi-rv', 'stemi-inferior'],
        ]);
        $stmt = Db::pdo()->prepare('SELECT id, correct_ids FROM quiz_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$userId]);
        $attempt = $stmt->fetch();
        $correct = json_decode((string) $attempt['correct_ids'], true) ?: [];
        assert($correct !== [], 'correct ids missing');
        $result = Quiz::answer($userId, (int) $attempt['id'], $correct, 2000);
        assert($result['correct'] === true, 'answer should be correct');
        assert(($result['explanation'][0]['name'] ?? '') !== '', 'custom explanation missing');
        assert(($result['correctNames'][0] ?? '') !== '', 'custom correct name missing');
    });
} finally {
    if ($userId > 0) {
        Db::pdo()->prepare('DELETE FROM quiz_attempts WHERE user_id = ?')->execute([$userId]);
        Db::pdo()->prepare('DELETE FROM user_progress WHERE user_id = ?')->execute([$userId]);
        Db::pdo()->prepare('DELETE FROM practice_daily_scores WHERE user_id = ?')->execute([$userId]);
        Db::pdo()->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
    }
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
