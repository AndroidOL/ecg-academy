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
    $stmt->execute([bin2hex(random_bytes(8)), 'md' . bin2hex(random_bytes(4)), password_hash('pw-123456', PASSWORD_DEFAULT), 'multi-diagnosis-test']);
    $userId = (int) $pdo->lastInsertId();

    check('2:1/2b ECG with RBBB becomes a multi-diagnosis question', function () use ($userId): void {
        $quiz = Quiz::newAttempt($userId, ['level' => 2, 'focus' => ['av-block-2b']]);
        assert($quiz['multiple'] === true, 'question must be multi-select');
        assert(str_contains((string) $quiz['question'], '包含哪些诊断'), 'multi question wording missing');
        $ids = array_column($quiz['options'], 'id');
        assert(in_array('av-block-2b', $ids, true), 'base diagnosis missing');
        assert(in_array('rbbb', $ids, true), 'derived RBBB missing');
        $stmt = Db::pdo()->prepare('SELECT correct_ids FROM quiz_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$userId]);
        $correct = json_decode((string) $stmt->fetchColumn(), true) ?: [];
        assert(in_array('av-block-2b', $correct, true));
        assert(in_array('rbbb', $correct, true));
    });

    check('hyperkalemia PR prolongation is not forced into AV block', function () use ($userId): void {
        $quiz = Quiz::newAttempt($userId, ['level' => 2, 'focus' => ['hyperkalemia']]);
        $ids = array_column($quiz['options'], 'id');
        if (in_array('av-block-1', $ids, true)) {
            $stmt = Db::pdo()->prepare('SELECT correct_ids FROM quiz_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 1');
            $stmt->execute([$userId]);
            $correct = json_decode((string) $stmt->fetchColumn(), true) ?: [];
            assert(!in_array('av-block-1', $correct, true), 'hyperkalemia PR must not be graded as AV block');
        }
    });
} finally {
    if ($userId > 0) {
        Db::pdo()->prepare('DELETE FROM quiz_attempts WHERE user_id = ?')->execute([$userId]);
        Db::pdo()->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
    }
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
