<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\ApiError;
use App\Auth;
use App\Db;
use App\Profile;

$passed = 0;
$failed = 0;
$userIds = [];

function makeAccount(bool $guest = false): int
{
    global $userIds;
    $pdo = Db::pdo();
    $publicId = bin2hex(random_bytes(10));
    $username = $guest ? null : 't' . bin2hex(random_bytes(5));
    $stmt = $pdo->prepare('INSERT INTO users (public_id, username, password_hash, display_name, is_guest) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$publicId, $username, $guest ? null : password_hash('secret-pass-1', PASSWORD_DEFAULT), $guest ? '测试游客' : '测试账号', $guest ? 1 : 0]);
    $id = (int) $pdo->lastInsertId();
    $userIds[] = $id;
    return $id;
}

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

function expectApiError(callable $fn, int $status, string $code): void
{
    try {
        $fn();
        throw new RuntimeException('expected ApiError, none thrown');
    } catch (ApiError $e) {
        assert($e->status === $status, "status {$e->status} != {$status}");
        assert($e->errorCode === $code, "code {$e->errorCode} != {$code}");
    }
}

try {
    $account = makeAccount();
    $guest = makeAccount(true);

    check('display name updates and trims', function () use ($account): void {
        $user = Profile::update($account, ['displayName' => '  新昵称  ']);
        assert($user['displayName'] === '新昵称');
        $stmt = Db::pdo()->prepare('SELECT display_name FROM users WHERE id = ?');
        $stmt->execute([$account]);
        assert($stmt->fetchColumn() === '新昵称');
    });

    check('empty display name is rejected', function () use ($account): void {
        expectApiError(fn () => Profile::update($account, ['displayName' => '   ']), 422, 'invalid_display_name');
    });

    check('guest cannot edit profile', function () use ($guest): void {
        expectApiError(fn () => Profile::update($guest, ['displayName' => 'x']), 403, 'account_required');
    });

    check('password change requires the current password', function () use ($account): void {
        expectApiError(fn () => Profile::changePassword($account, ['currentPassword' => 'wrong', 'newPassword' => 'new-secret-2']), 401, 'invalid_current_password');
        expectApiError(fn () => Profile::changePassword($account, ['currentPassword' => 'secret-pass-1', 'newPassword' => 'short']), 422, 'invalid_password');
    });

    check('password change stores a new hash', function () use ($account): void {
        Profile::changePassword($account, ['currentPassword' => 'secret-pass-1', 'newPassword' => 'new-secret-2']);
        $stmt = Db::pdo()->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$account]);
        assert(password_verify('new-secret-2', (string) $stmt->fetchColumn()));
    });

    check('passkey list starts empty and delete is 404', function () use ($account): void {
        assert(Profile::passkeys($account) === []);
        expectApiError(fn () => Profile::deletePasskey($account, 999999), 404, 'passkey_not_found');
    });

    check('registration options carry challenge and account identity', function () use ($account): void {
        $options = Profile::passkeyOptions($account);
        assert(strlen((string) $options['challenge']) >= 40);
        assert($options['rp']['id'] !== '');
        assert(str_starts_with((string) $options['user']['name'], 't'));
        assert($options['pubKeyCredParams'][0]['alg'] === -7);
    });

    check('user passkey login options 404 when none registered', function (): void {
        $stmt = Db::pdo()->prepare('SELECT username FROM users WHERE id = ?');
        $stmt->execute([$GLOBALS['userIds'][0]]);
        $username = (string) $stmt->fetchColumn();
        expectApiError(fn () => Auth::passkeyLoginOptions($username), 404, 'passkey_not_found');
        expectApiError(fn () => Auth::passkeyLoginOptions('no-such-user-' . bin2hex(random_bytes(3))), 404, 'passkey_not_found');
    });
} finally {
    if ($userIds !== []) {
        $in = implode(',', array_fill(0, count($userIds), '?'));
        Db::pdo()->prepare("DELETE FROM users WHERE id IN ({$in})")->execute($userIds);
    }
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
