<?php
declare(strict_types=1);

namespace App;

final class AdminAuth
{
    public static function requireAdmin(): array
    {
        $user = Auth::user(false);
        if (!$user) throw new ApiError(401, 'admin_login_required', '请先登录管理后台');
        if ((int) ($user['is_admin'] ?? 0) !== 1) throw new ApiError(403, 'admin_required', '仅管理员可访问');
        if ((int) ($user['is_active'] ?? 1) !== 1) throw new ApiError(403, 'admin_disabled', '管理员账号已停用');
        return $user;
    }

    public static function optionalAdmin(): ?array
    {
        $user = Auth::user(false);
        return $user && (int) ($user['is_admin'] ?? 0) === 1 && (int) ($user['is_active'] ?? 1) === 1 ? $user : null;
    }

    public static function login(array $input): array
    {
        Auth::requireCsrf();
        if (!Settings::bool('admin.password_login_enabled', true)) {
            throw new ApiError(403, 'admin_password_login_disabled', '管理员密码登录已关闭，请使用 Passkey');
        }
        $username = strtolower(trim((string) ($input['username'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        if ($username === '' || $password === '') throw new ApiError(422, 'missing_credentials', '请输入管理员用户名和密码');
        $key = 'admin_login:' . Http::clientIp() . ':' . substr(hash('sha256', $username), 0, 16);
        self::throttle($key);
        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE username = ? AND is_admin = 1 AND is_active = 1 LIMIT 1');
        $stmt->execute([$username]);
        $account = $stmt->fetch();
        if (!$account || !password_verify($password, (string) $account['password_hash'])) {
            self::failure($key);
            throw new ApiError(401, 'invalid_credentials', '管理员用户名或密码不正确');
        }
        self::clear($key);
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $account['id'];
        Auth::resetCache();
        Db::pdo()->prepare('UPDATE users SET last_seen_at = NOW() WHERE id = ?')->execute([(int) $account['id']]);
        self::audit((int) $account['id'], 'admin.login.password');
        return self::publicUser($account);
    }

    public static function passkeyLoginOptions(): array
    {
        Auth::start();
        if (!Settings::bool('admin.passkey_login_enabled', true)) {
            throw new ApiError(403, 'passkey_login_disabled', 'Passkey 登录已关闭');
        }
        $rows = Db::pdo()->query('SELECT credential_id FROM admin_passkeys ORDER BY id ASC LIMIT 20')->fetchAll();
        return WebAuthn::loginOptions($rows);
    }

    public static function passkeyLogin(array $credential): array
    {
        Auth::requireCsrf();
        Auth::start();
        if (!Settings::bool('admin.passkey_login_enabled', true)) {
            throw new ApiError(403, 'passkey_login_disabled', 'Passkey 登录已关闭');
        }
        $userId = WebAuthn::verifyAssertion($credential);
        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE id = ? AND is_admin = 1 AND is_active = 1 LIMIT 1');
        $stmt->execute([$userId]);
        $account = $stmt->fetch();
        if (!$account) throw new ApiError(403, 'admin_required', 'Passkey 对应的管理员不可用');
        session_regenerate_id(true);
        $_SESSION['uid'] = $userId;
        Auth::resetCache();
        Db::pdo()->prepare('UPDATE users SET last_seen_at = NOW() WHERE id = ?')->execute([$userId]);
        self::audit($userId, 'admin.login.passkey');
        return self::publicUser($account);
    }

    public static function publicUser(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'username' => (string) ($user['username'] ?? ''),
            'displayName' => (string) $user['display_name'],
            'isAdmin' => true,
        ];
    }

    public static function audit(int $userId, string $action, array $detail = []): void
    {
        try {
            Db::pdo()->prepare('INSERT INTO admin_audit (user_id, action, detail, ip) VALUES (?, ?, ?, ?)')
                ->execute([$userId, $action, json_encode($detail, JSON_UNESCAPED_UNICODE), Http::clientIp()]);
        } catch (\Throwable $e) {
            error_log('[admin-audit] ' . $e->getMessage());
        }
    }

    public static function settingsPayload(): array
    {
        $settings = Settings::all();
        $providers = Settings::aiProviders();
        foreach ($providers as &$provider) {
            $provider['api_key'] = Secret::mask(Secret::decrypt((string) ($provider['api_key_enc'] ?? '')));
            unset($provider['api_key_enc']);
        }
        return [
            'auth' => [
                'registration_enabled' => (bool) $settings['auth.registration_enabled'],
                'user_login_enabled' => (bool) $settings['auth.user_login_enabled'],
            ],
            'admin' => [
                'password_login_enabled' => (bool) $settings['admin.password_login_enabled'],
                'passkey_login_enabled' => (bool) $settings['admin.passkey_login_enabled'],
            ],
            'ai' => [
                'enabled' => (bool) $settings['ai.enabled'],
                'daily_limit' => (int) $settings['ai.daily_limit'],
                'default_provider' => (string) $settings['ai.default_provider'],
                'system_prompt_append' => (string) $settings['ai.system_prompt_append'],
            ],
            'providers' => $providers,
        ];
    }

    public static function updateSettings(array $input): array
    {
        $admin = self::requireAdmin();
        $allowed = [
            'auth.registration_enabled', 'auth.user_login_enabled',
            'admin.password_login_enabled', 'admin.passkey_login_enabled',
            'ai.enabled', 'ai.daily_limit', 'ai.default_provider', 'ai.system_prompt_append',
        ];
        $updates = [];
        foreach ($allowed as $key) {
            if (!array_key_exists($key, $input)) continue;
            $value = $input[$key];
            if (in_array($key, ['auth.registration_enabled','auth.user_login_enabled','admin.password_login_enabled','admin.passkey_login_enabled','ai.enabled'], true)) {
                $value = filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
                if ($value === null) throw new ApiError(422, 'invalid_setting', $key . ' 需为布尔值');
            } elseif ($key === 'ai.daily_limit') {
                $value = max(0, min(10000, (int) $value));
            } elseif ($key === 'ai.system_prompt_append') {
                $value = mb_substr(trim((string) $value), 0, 1000, 'UTF-8');
            } else {
                $value = mb_substr(trim((string) $value), 0, 120, 'UTF-8');
            }
            $updates[$key] = $value;
        }
        $nextPassword = $updates['admin.password_login_enabled'] ?? Settings::bool('admin.password_login_enabled', true);
        $nextPasskey = $updates['admin.passkey_login_enabled'] ?? Settings::bool('admin.passkey_login_enabled', true);
        if (!$nextPassword && !$nextPasskey) {
            throw new ApiError(422, 'admin_lockout', '密码登录与 Passkey 不能同时关闭');
        }
        if (!$nextPassword) {
            $count = (int) Db::pdo()->query('SELECT COUNT(*) FROM admin_passkeys')->fetchColumn();
            if ($count === 0) throw new ApiError(422, 'passkey_required', '关闭密码登录前请先注册至少一个 Passkey');
        }
        Settings::setMany($updates);
        self::audit((int) $admin['id'], 'admin.settings.update', $updates);
        return self::settingsPayload();
    }

    private static function throttle(string $key): void
    {
        $stmt = Db::pdo()->prepare('SELECT window_start, fail_count FROM auth_throttle WHERE throttle_key = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        if (!$row) return;
        $elapsed = time() - (int) $row['window_start'];
        if ($elapsed < 600 && (int) $row['fail_count'] >= 6) {
            throw new ApiError(429, 'too_many_attempts', '尝试次数过多，请稍后再试');
        }
    }

    private static function failure(string $key): void
    {
        $stmt = Db::pdo()->prepare(
            'INSERT INTO auth_throttle (throttle_key, window_start, fail_count) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE fail_count = IF(window_start < ?, 1, fail_count + 1), window_start = IF(window_start < ?, ?, window_start)'
        );
        $now = time();
        $stmt->execute([$key, $now, $now - 600, $now - 600, $now]);
    }

    private static function clear(string $key): void
    {
        Db::pdo()->prepare('DELETE FROM auth_throttle WHERE throttle_key = ?')->execute([$key]);
    }
}
