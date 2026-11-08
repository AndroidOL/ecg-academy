<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Db;
use App\Learning;
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
        echo "  FAIL {$name}: {$e->getMessage()}\n";
    }
}

try {
    $pdo = Db::pdo();
    $stmt = $pdo->prepare('INSERT INTO users (public_id, username, password_hash, display_name, is_guest) VALUES (?, ?, ?, ?, 0)');
    $stmt->execute([bin2hex(random_bytes(10)), 't' . bin2hex(random_bytes(5)), password_hash('pw-123456', PASSWORD_DEFAULT), '慢速测试']);
    $userId = (int) $pdo->lastInsertId();

    $makeAttempt = function () use ($pdo, $userId): array {
        $quiz = Quiz::newAttempt($userId, ['level' => 1, 'chapter' => 'all']);
        $stmt = $pdo->prepare('SELECT id, payload, correct_ids, option_ids FROM quiz_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        $payload = json_decode((string) $row['payload'], true);
        return [
            'id' => (int) $row['id'],
            'correct' => json_decode((string) $row['correct_ids'], true),
            'options' => json_decode((string) $row['option_ids'], true),
            'base' => [1 => 100, 2 => 140, 3 => 180][(int) $payload['level']] ?? 100,
            'chapter' => (string) ($payload['chapter'] ?? ''),
        ];
    };

    check('slow correct answer is flagged and gets no time bonus', function () use ($makeAttempt, $userId): void {
        $attempt = $makeAttempt();
        $result = Quiz::answer($userId, $attempt['id'], $attempt['correct'], 20000);
        assert($result['correct'] === true);
        assert($result['slow'] === true);
        assert($result['speed'] === 'slow');
        assert($result['score'] === $attempt['base'], 'score=' . $result['score']);
        $stmt = Db::pdo()->prepare('SELECT time_ms, correct FROM learning_events WHERE user_id = ? ORDER BY id DESC LIMIT 1');
        $stmt->execute([$userId]);
        $event = $stmt->fetch();
        assert((int) $event['time_ms'] === 20000);
        $status = Learning::status($userId);
        $chapter = array_values(array_filter($status['chapters'], static fn (array $c): bool => $c['id'] === $attempt['chapter']))[0] ?? null;
        assert($chapter !== null);
        assert(($chapter['slow'] ?? 0) >= 1, 'chapter slow missing');
    });

    check('fast correct answer is fluent', function () use ($makeAttempt, $userId): void {
        $attempt = $makeAttempt();
        $result = Quiz::answer($userId, $attempt['id'], $attempt['correct'], 4000);
        assert($result['slow'] === false);
        assert($result['speed'] === 'fast');
        assert($result['score'] > $attempt['base']);
    });

    check('wrong answer deducts five times the base score', function () use ($makeAttempt, $userId): void {
        $attempt = $makeAttempt();
        $wrong = array_values(array_filter($attempt['options'], static fn (string $id): bool => !in_array($id, $attempt['correct'], true)));
        assert($wrong !== []);
        $result = Quiz::answer($userId, $attempt['id'], [$wrong[0]], 3000);
        assert($result['correct'] === false);
        assert($result['speed'] === 'wrong' || $result['speed'] === 'partial');
        if ($result['speed'] === 'wrong') {
            assert($result['score'] === -5 * $attempt['base'], 'score=' . $result['score'] . ' base=' . $attempt['base']);
        }
    });
} finally {
    if ($userId > 0) Db::pdo()->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
