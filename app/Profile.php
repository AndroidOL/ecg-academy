<?php
declare(strict_types=1);

namespace App;

final class Profile
{
    public static function update(int $userId, array $input): array
    {
        self::account($userId);
        $displayName = Auth::cleanDisplayName((string) ($input['displayName'] ?? ''));
        if ($displayName === '') throw new ApiError(422, 'invalid_display_name', '昵称不能为空');
        Db::pdo()->prepare('UPDATE users SET display_name = ? WHERE id = ?')->execute([$displayName, $userId]);
        Auth::resetCache();
        return Auth::publicUser(self::account($userId));
    }

    public static function changePassword(int $userId, array $input): void
    {
        $user = self::account($userId);
        if (empty($user['password_hash'])) throw new ApiError(422, 'password_not_set', '该账号尚未设置密码');
        $current = (string) ($input['currentPassword'] ?? '');
        $new = (string) ($input['newPassword'] ?? '');
        if (!password_verify($current, (string) $user['password_hash'])) {
            throw new ApiError(401, 'invalid_current_password', '当前密码不正确');
        }
        if (strlen($new) < 8 || strlen($new) > 72) {
            throw new ApiError(422, 'invalid_password', '新密码长度需为 8–72 位');
        }
        if ($new === $current) throw new ApiError(422, 'password_unchanged', '新密码不能与当前密码相同');
        Db::pdo()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), $userId]);
    }

    public static function passkeys(int $userId): array
    {
        $stmt = Db::pdo()->prepare('SELECT id, label, created_at, last_used_at, sign_count FROM admin_passkeys WHERE user_id = ? ORDER BY id ASC');
        $stmt->execute([$userId]);
        return $stmt->fetchAll();
    }

    public static function passkeyOptions(int $userId): array
    {
        $user = self::account($userId);
        if ((string) ($user['username'] ?? '') === '') throw new ApiError(422, 'username_required', '请先设置用户名');
        return WebAuthn::registerOptions($userId, (string) $user['username'], (string) $user['display_name']);
    }

    public static function registerPasskey(int $userId, array $input): void
    {
        self::account($userId);
        $credential = WebAuthn::verifyRegistration((array) ($input['credential'] ?? []), $userId);
        $label = mb_substr(trim((string) ($input['label'] ?? '本机 Passkey')), 0, 80, 'UTF-8') ?: '本机 Passkey';
        try {
            Db::pdo()->prepare('INSERT INTO admin_passkeys (user_id, credential_id, public_key, sign_count, label) VALUES (?, ?, ?, ?, ?)')
                ->execute([$userId, $credential['credentialId'], $credential['publicKey'], $credential['signCount'], $label]);
        } catch (\PDOException $e) {
            if ((string) $e->getCode() === '23000') throw new ApiError(409, 'passkey_exists', '该 Passkey 已注册');
            throw $e;
        }
    }

    public static function deletePasskey(int $userId, int $id): void
    {
        $stmt = Db::pdo()->prepare('DELETE FROM admin_passkeys WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, $userId]);
        if ($stmt->rowCount() === 0) throw new ApiError(404, 'passkey_not_found', 'Passkey 不存在');
    }

    private static function account(int $userId): array
    {
        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE id = ? AND is_guest = 0 LIMIT 1');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        if (!$user) throw new ApiError(403, 'account_required', '请先注册或登录正式账号');
        return $user;
    }
}
