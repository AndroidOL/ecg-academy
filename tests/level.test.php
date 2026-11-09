<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\ApiError;
use App\Db;
use App\Level;
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
        assert(Level::levelFrom(79) === 1);
        assert(Level::levelFrom(80) === 2);
        assert(Level::levelFrom(200) === 3);
        assert(Level::levelFrom(699) === 4);
        assert(Level::levelFrom(700) === 5);
        assert(Level::levelFrom(30000) === 20);
        assert(Level::levelFrom(999999) === 20);
    });

    check('level info exposes progress and unlocks', function (): void {
        $info = Level::forXp(150);
        assert($info['level'] === 2);
        assert($info['nextXp'] === 200);
        assert($info['progress'] === 58);
        assert($info['unlocks']['advancedOpen'] === false);
        $info = Level::forXp(700);
        assert($info['level'] === 5);
        assert($info['unlocks']['advancedOpen'] === true);
        assert($info['unlocks']['challengeOpen'] === false);
        assert($info['unlocks']['aiOpen'] === false);
        $info = Level::forXp(2200);
        assert($info['level'] === 8);
        assert($info['unlocks']['challengeOpen'] === true);
        assert($info['unlocks']['aiOpen'] === false);
        $info = Level::forXp(4000);
        assert($info['level'] === 10);
        assert($info['unlocks']['aiOpen'] === true);
    });

    check('manual override wins and clamps', function (): void {
        assert(Level::levelFrom(0, 8) === 8);
        assert(Level::levelFrom(30000, 2) === 2);
        assert(Level::levelFrom(0, 99) === 20);
        assert(Level::levelFrom(0, 0) === 1);
    });

    check('registered users must unlock advanced and challenge', function (): void {
        $pdo = Db::pdo();
        $stmt = $pdo->prepare('INSERT INTO users (public_id, username, password_hash, display_name, is_guest, xp) VALUES (?, ?, ?, ?, 0, 0)');
        $stmt->execute([bin2hex(random_bytes(10)), 't' . bin2hex(random_bytes(5)), password_hash('pw-123456', PASSWORD_DEFAULT), '等级测试']);
        $GLOBALS['userId'] = (int) $pdo->lastInsertId();
        $user = ['id' => $GLOBALS['userId'], 'is_guest' => 0, 'is_admin' => 0];
        assert(Level::canUseQuizLevel($user, 1) === true);
        assert(Level::canUseQuizLevel($user, 2) === false);
        assert(Level::canUseQuizLevel($user, 3) === false);
        $pdo->prepare('UPDATE users SET xp = 200 WHERE id = ?')->execute([$GLOBALS['userId']]);
        assert(Level::canUseQuizLevel($user, 2) === true);
        assert(Level::canUseQuizLevel($user, 3) === false);
        $pdo->prepare('UPDATE users SET xp = 2200 WHERE id = ?')->execute([$GLOBALS['userId']]);
        assert(Level::canUseQuizLevel($user, 3) === true);
        $admin = ['id' => 999999, 'is_guest' => 0, 'is_admin' => 1];
        assert(Level::canUseQuizLevel($admin, 3) === true);
        $guest = ['id' => 999998, 'is_guest' => 1, 'is_admin' => 0];
        assert(Level::canUseQuizLevel($guest, 3) === true);
    });

    check('quiz endpoint rejects locked difficulty for registered users', function (): void {
        $pdo = Db::pdo();
        $pdo->prepare('UPDATE users SET xp = 0 WHERE id = ?')->execute([$GLOBALS['userId']]);
        $previous = $_SESSION['uid'] ?? null;
        $_SESSION['uid'] = $GLOBALS['userId'];
        try {
            try {
                Quiz::newAttempt($GLOBALS['userId'], ['level' => 2]);
                throw new RuntimeException('expected level_locked');
            } catch (ApiError $e) {
                assert($e->status === 403);
                assert($e->errorCode === 'level_locked');
            }
            $pdo->prepare('UPDATE users SET xp = 700 WHERE id = ?')->execute([$GLOBALS['userId']]);
            $quiz = Quiz::newAttempt($GLOBALS['userId'], ['level' => 2]);
            assert((int) $quiz['level'] === 2);
        } finally {
            if ($previous === null) unset($_SESSION['uid']); else $_SESSION['uid'] = $previous;
        }
    });
} finally {
    if ($userId > 0) Db::pdo()->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
