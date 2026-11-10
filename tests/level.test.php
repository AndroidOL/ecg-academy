<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\ApiError;
use App\Db;
use App\Level;
use App\QuestionBank;
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
    check('xp thresholds map to levels', function (): void {
        assert(Level::levelFrom(0) === 1);
        assert(Level::levelFrom(119) === 1);
        assert(Level::levelFrom(120) === 2);
        assert(Level::levelFrom(300) === 3);
        assert(Level::levelFrom(599) === 3);
        assert(Level::levelFrom(600) === 4);
        assert(Level::levelFrom(1049) === 4);
        assert(Level::levelFrom(1050) === 5);
        assert(Level::levelFrom(45000) === 20);
        assert(Level::levelFrom(999999) === 20);
    });

    check('level info exposes progress and unlocks', function (): void {
        $info = Level::forXp(150);
        assert($info['level'] === 2);
        assert($info['nextXp'] === 300);
        assert($info['progress'] === 17);
        assert($info['unlocks']['advancedOpen'] === false);
        $info = Level::forXp(1050);
        assert($info['level'] === 5);
        assert($info['unlocks']['advancedOpen'] === true);
        assert($info['unlocks']['challengeOpen'] === false);
        assert($info['unlocks']['aiOpen'] === false);
        $info = Level::forXp(3300);
        assert($info['level'] === 8);
        assert($info['unlocks']['challengeOpen'] === true);
        assert($info['unlocks']['aiOpen'] === false);
        $info = Level::forXp(6000);
        assert($info['level'] === 10);
        assert($info['unlocks']['aiOpen'] === true);
    });

    check('manual override wins and clamps', function (): void {
        assert(Level::levelFrom(0, 8) === 8);
        assert(Level::levelFrom(45000, 2) === 2);
        assert(Level::levelFrom(0, 99) === 20);
        assert(Level::levelFrom(0, 0) === 1);
    });

    check('all difficulties are accessible; scoring is gated separately', function (): void {
        $admin = ['id' => 999999, 'is_guest' => 0, 'is_admin' => 1];
        assert(Level::canUseQuizLevel($admin, 3) === true);
        $guest = ['id' => 999998, 'is_guest' => 1, 'is_admin' => 0];
        assert(Level::canUseQuizLevel($guest, 3) === true);
        $user = ['id' => 999997, 'is_guest' => 0, 'is_admin' => 0];
        assert(Level::canUseQuizLevel($user, 2) === true);
        assert(Level::canUseQuizLevel($user, 3) === true);
    });

    check('focused reading keeps the requested diagnosis regardless of level', function (): void {
        foreach (['lbbb', 'stemi-anterior', 'afib'] as $id) {
            $entry = QuestionBank::pick(1, 'all', [$id]);
            assert($entry !== null, $id . ' entry missing');
            $ids = [(string) ($entry['primary'] ?? ''), (string) ($entry['secondary'] ?? '')];
            assert(in_array($id, $ids, true), $id . ' focus was discarded');
        }
    });

    check('quiz endpoint allows every difficulty for registered users', function (): void {
        $pdo = Db::pdo();
        $stmt = $pdo->prepare('INSERT INTO users (public_id, username, password_hash, display_name, is_guest, xp) VALUES (?, ?, ?, ?, 0, 0)');
        $stmt->execute([bin2hex(random_bytes(10)), 't' . bin2hex(random_bytes(5)), password_hash('pw-123456', PASSWORD_DEFAULT), '等级测试']);
        $GLOBALS['userId'] = (int) $pdo->lastInsertId();
        $previous = $_SESSION['uid'] ?? null;
        $_SESSION['uid'] = $GLOBALS['userId'];
        try {
            $quiz = Quiz::newAttempt($GLOBALS['userId'], ['level' => 2]);
            assert((int) $quiz['level'] === 2);
            $stmt = $pdo->prepare('SELECT id, correct_ids FROM quiz_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 1');
            $stmt->execute([$GLOBALS['userId']]);
            $attempt = $stmt->fetch();
            $correct = json_decode((string) $attempt['correct_ids'], true);
            $answer = Quiz::answer($GLOBALS['userId'], (int) $attempt['id'], $correct, 3000);
            assert($answer['unlocked'] === false);
            assert($answer['score'] === 0);
            assert($answer['xp'] === 0);
            $scoreRow = $pdo->prepare('SELECT COUNT(*) FROM practice_daily_scores WHERE user_id = ?');
            $scoreRow->execute([$GLOBALS['userId']]);
            assert((int) $scoreRow->fetchColumn() === 0, 'locked difficulty must not write practice score');
            $quiz = Quiz::newAttempt($GLOBALS['userId'], ['level' => 2]);
            $stmt = $pdo->prepare('SELECT id, correct_ids, option_ids FROM quiz_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 1');
            $stmt->execute([$GLOBALS['userId']]);
            $attempt = $stmt->fetch();
            $correct = json_decode((string) $attempt['correct_ids'], true);
            $options = json_decode((string) $attempt['option_ids'], true);
            $wrong = array_values(array_diff($options, $correct));
            $answer = Quiz::answer($GLOBALS['userId'], (int) $attempt['id'], [$wrong[0]], 3000);
            assert($answer['unlocked'] === false);
            assert($answer['score'] === 0);
            assert($answer['xp'] === 0);
            $scoreRow->execute([$GLOBALS['userId']]);
            assert((int) $scoreRow->fetchColumn() === 0, 'locked difficulty wrong answer must not deduct');
            $quiz = Quiz::newAttempt($GLOBALS['userId'], ['level' => 3]);
            assert((int) $quiz['level'] === 3);
        } finally {
            if ($previous === null) unset($_SESSION['uid']); else $_SESSION['uid'] = $previous;
        }
    });
} finally {
    if ($userId > 0) Db::pdo()->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
