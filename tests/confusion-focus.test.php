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
    $stmt->execute([bin2hex(random_bytes(10)), 'focus' . bin2hex(random_bytes(4)), password_hash('pw-123456', PASSWORD_DEFAULT), '专注组卷测试']);
    $userId = (int) $pdo->lastInsertId();

    check('confusion focus keeps the correct diagnosis and forces the selected distractor', function () use ($userId): void {
        $quiz = Quiz::newAttempt($userId, ['level' => 1, 'focus' => ['lbbb'], 'confusion' => 'rbbb']);
        $options = array_column($quiz['options'], 'id');
        $stmt = Db::pdo()->prepare('SELECT correct_ids, option_ids, payload FROM quiz_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        $correct = json_decode((string) $row['correct_ids'], true) ?: [];
        assert(in_array('lbbb', $correct, true), 'correct diagnosis missing');
        assert(in_array('rbbb', $options, true), 'forced distractor missing from options');
        assert(!in_array('rbbb', $correct, true), 'distractor must not be correct');
        $payload = json_decode((string) $row['payload'], true) ?: [];
        assert(in_array('lbbb', [$payload['primaryId'] ?? '', $payload['caseKey'] ?? ''], true) || in_array('lbbb', $correct, true));
    });
} finally {
    if ($userId > 0) Db::pdo()->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
