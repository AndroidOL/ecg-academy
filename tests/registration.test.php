<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\ApiError;
use App\Db;
use App\Registration;
use App\Secret;
use App\Settings;

$passed = 0;
$failed = 0;
$userId = 0;
$saved = [
    'auth.registration_enabled' => Settings::get('auth.registration_enabled', true),
    'auth.registration_daily_limit' => Settings::get('auth.registration_daily_limit', 5),
];

function check(string $name, callable $fn): void
{
    global $passed, $failed;
    try { $fn(); $passed++; echo "  ok  {$name}\n"; }
    catch (Throwable $e) { $failed++; echo "  FAIL {$name}: {$e->getMessage()}\n"; }
}

try {
    Settings::setMany(['auth.registration_enabled' => true, 'auth.registration_daily_limit' => 50]);
    $pdo = Db::pdo();
    $stmt = $pdo->prepare('INSERT INTO users (public_id, display_name, is_guest) VALUES (?, ?, 1)');
    $stmt->execute([bin2hex(random_bytes(10)), '注册测试访客']);
    $userId = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT INTO user_progress (user_id, diagnosis_id, status) VALUES (?, ?, ?)')->execute([$userId, 'normal-sinus', 'read']);
    $_SESSION['uid'] = $userId;
    $_SESSION['csrf'] = 'test-csrf-token';
    $_SERVER['HTTP_X_CSRF_TOKEN'] = 'test-csrf-token';
    \App\Auth::resetCache();
    $email = 'unit' . bin2hex(random_bytes(4)) . '@example.test';
    $code = '123456';
    $pdo->prepare('INSERT INTO email_verification_codes (email, purpose, code_hash, ip_hash, expires_at) VALUES (?, "register", ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))')
        ->execute([$email, Secret::fingerprint($code), hash('sha256', '127.0.0.1')]);

    check('wrong code increments attempts and is rejected', function () use ($email): void {
        try {
            Registration::register(['email' => $email, 'code' => '000000', 'username' => 'regtest' . bin2hex(random_bytes(3)), 'password' => 'pw-123456']);
            throw new RuntimeException('expected code_invalid');
        } catch (ApiError $e) {
            assert($e->errorCode === 'code_invalid');
        }
        $attempts = (int) Db::pdo()->query('SELECT attempts FROM email_verification_codes WHERE email = ' . Db::pdo()->quote($email) . ' ORDER BY id DESC LIMIT 1')->fetchColumn();
        assert($attempts === 1);
    });

    check('verified email upgrades guest and preserves progress', function () use ($userId, $email, $code): void {
        $username = 'regtest' . bin2hex(random_bytes(3));
        $user = Registration::register(['email' => $email, 'code' => $code, 'username' => $username, 'password' => 'pw-123456', 'displayName' => '注册用户']);
        assert((int) $user['is_guest'] === 0);
        assert($user['email'] === $email);
        assert($user['email_verified_at'] !== null);
        assert((int) $user['id'] === $userId);
        $read = (int) Db::pdo()->query('SELECT COUNT(*) FROM user_progress WHERE user_id = ' . (int) $userId)->fetchColumn();
        assert($read === 1);
    });

    check('reused code is rejected', function () use ($email, $code): void {
        try {
            Registration::register(['email' => $email, 'code' => $code, 'username' => 'regtest' . bin2hex(random_bytes(3)), 'password' => 'pw-123456']);
            throw new RuntimeException('expected email_taken_or_code');
        } catch (ApiError $e) {
            assert(in_array($e->errorCode, ['email_taken', 'code_not_found'], true));
        }
    });
} finally {
    Settings::setMany($saved);
    unset($_SESSION['uid']);
    if ($userId > 0) {
        Db::pdo()->prepare('DELETE FROM email_verification_codes WHERE email LIKE "unit%@example.test"')->execute();
        Db::pdo()->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
    }
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
