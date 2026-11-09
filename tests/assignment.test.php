<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Db;
use App\Quiz;

$pdo = Db::pdo();
$code = 't' . substr(bin2hex(random_bytes(6)), 0, 11);
$publicId = bin2hex(random_bytes(8));
$stmt = $pdo->prepare('INSERT INTO users (public_id, display_name, is_guest) VALUES (?, ?, 1)');
$stmt->execute([$publicId, 'assignment-test']);
$userId = (int) $pdo->lastInsertId();
$adminId = $userId; // creator FK is not used for authorization in this fixture
$pdo->prepare('INSERT INTO assignments (code, title, class_name, level, chapter, focus, active, created_by) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
    ->execute([$code, '自动测试作业', '测试班', 1, 'tachy', '', $adminId]);
$assignmentId = (int) $pdo->lastInsertId();

$passed = 0;
$failed = 0;
function check(string $name, callable $fn): void {
    global $passed, $failed;
    try { $fn(); $passed++; echo "  ok  {$name}\n"; }
    catch (Throwable $e) { $failed++; echo "FAIL  {$name}: " . $e->getMessage() . "\n"; }
}

try {
    check('assignment metadata is public and hides answers', function () use ($code) {
        $meta = Quiz::assignment($code);
        assert($meta['title'] === '自动测试作业');
        assert(!isset($meta['correctIds']));
    });

    check('assignment quiz records anonymous device hash and score', function () use ($userId, $code, $pdo, $assignmentId) {
        $attempt = Quiz::newAttempt($userId, ['assignment' => $code, 'device' => 'deadbeef-0123456789abcdef']);
        assert($attempt['assignment']['code'] === $code);
        assert(count($attempt['options']) >= 2);
        $answer = Quiz::answer($userId, $attempt['attemptId'], [$attempt['options'][0]['id']], 1200);
        assert(isset($answer['score']));
        $stmt = $pdo->prepare('SELECT * FROM assignment_attempts WHERE assignment_id = ? LIMIT 1');
        $stmt->execute([$assignmentId]);
        $row = $stmt->fetch();
        assert($row !== false, 'assignment attempt should be stored');
        assert(strlen((string) $row['device_hash']) === 64);
    });

    check('inactive assignment cannot be opened', function () use ($code, $pdo) {
        $pdo->prepare('UPDATE assignments SET active = 0 WHERE code = ?')->execute([$code]);
        $blocked = false;
        try { Quiz::assignment($code); } catch (Throwable $e) { $blocked = true; }
        assert($blocked, 'inactive assignment should 404');
    });
} finally {
    $pdo->prepare('DELETE FROM assignments WHERE id = ?')->execute([$assignmentId]);
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
