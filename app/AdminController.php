<?php
declare(strict_types=1);

namespace App;

final class AdminController
{
    public static function authConfig(array $params = []): void
    {
        Http::ok([
            'passwordLogin' => Settings::bool('admin.password_login_enabled', true),
            'passkeyLogin' => Settings::bool('admin.passkey_login_enabled', true),
            'hasPasskey' => (int) Db::pdo()->query('SELECT COUNT(*) FROM admin_passkeys')->fetchColumn() > 0,
            'registrationEnabled' => Settings::bool('auth.registration_enabled', true),
        ]);
    }

    public static function login(array $params = []): void
    {
        Http::ok(AdminAuth::login(Http::input()));
    }

    public static function passkeyLoginOptions(array $params = []): void
    {
        Http::ok(AdminAuth::passkeyLoginOptions());
    }

    public static function passkeyLogin(array $params = []): void
    {
        Http::ok(AdminAuth::passkeyLogin(Http::input()['credential'] ?? []));
    }

    public static function logout(array $params = []): void
    {
        AdminAuth::requireAdmin();
        Auth::logout();
        Http::ok(['ok' => true]);
    }

    public static function session(array $params = []): void
    {
        $admin = AdminAuth::requireAdmin();
        $userCount = (int) Db::pdo()->query('SELECT COUNT(*) FROM users')->fetchColumn();
        $guestCount = (int) Db::pdo()->query('SELECT COUNT(*) FROM users WHERE is_guest = 1')->fetchColumn();
        $passkeys = Db::pdo()->query('SELECT id, label, created_at, last_used_at, sign_count FROM admin_passkeys ORDER BY id ASC')->fetchAll();
        $audit = Db::pdo()->query('SELECT action, detail, ip, created_at FROM admin_audit ORDER BY id DESC LIMIT 20')->fetchAll();
        foreach ($audit as &$row) $row['detail'] = json_decode((string) ($row['detail'] ?? '{}'), true) ?: [];
        Http::ok([
            'admin' => AdminAuth::publicUser($admin),
            'settings' => AdminAuth::settingsPayload(),
            'passkeys' => $passkeys,
            'audit' => $audit,
            'stats' => [
                'users' => $userCount,
                'guests' => $guestCount,
                'articles' => Content::stats()['articles'],
                'chapters' => Content::stats()['chapters'],
                'scenarios' => count(SimEngine::scenarios()),
                'bank' => QuestionBank::stats()['total'],
                'aiUsedToday' => (int) Db::pdo()->query('SELECT COALESCE(SUM(used_count),0) FROM ai_usage WHERE usage_day = CURDATE()')->fetchColumn(),
            ],
            'version' => (string) Config::get('app.version', '1.1.0'),
        ]);
    }

    public static function saveSettings(array $params = []): void
    {
        Http::ok(AdminAuth::updateSettings(Http::input()));
    }

    public static function users(array $params = []): void
    {
        AdminAuth::requireAdmin();
        $q = trim((string) ($_GET['q'] ?? ''));
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $size = 30;
        $where = '';
        $bind = [];
        if ($q !== '') {
            $where = 'WHERE username LIKE ? OR display_name LIKE ? OR public_id LIKE ?';
            $like = '%' . $q . '%';
            $bind = [$like, $like, $like];
        }
        $countStmt = Db::pdo()->prepare('SELECT COUNT(*) FROM users ' . $where);
        $countStmt->execute($bind);
        $total = (int) $countStmt->fetchColumn();
        $stmt = Db::pdo()->prepare(
            'SELECT id, public_id, username, display_name, is_guest, is_admin, is_active, ai_daily_limit, xp, created_at, last_seen_at
             FROM users ' . $where . ' ORDER BY id DESC LIMIT ' . $size . ' OFFSET ' . (($page - 1) * $size)
        );
        $stmt->execute($bind);
        Http::ok(['items' => $stmt->fetchAll(), 'total' => $total, 'page' => $page, 'pageSize' => $size]);
    }

    public static function updateUser(array $params = []): void
    {
        $admin = AdminAuth::requireAdmin();
        $input = Http::input();
        $userId = (int) ($input['userId'] ?? 0);
        if ($userId <= 0) throw new ApiError(422, 'invalid_user', '用户 ID 无效');
        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        if (!$user) throw new ApiError(404, 'user_not_found', '用户不存在');
        $fields = [];
        $values = [];
        foreach (['is_active', 'is_admin'] as $field) {
            if (!array_key_exists($field, $input)) continue;
            $value = filter_var($input[$field], FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
            if ($value === null) throw new ApiError(422, 'invalid_user', $field . ' 需为布尔值');
            if ($field === 'is_admin' && !$value && (int) $user['is_admin'] === 1) {
                $count = (int) Db::pdo()->query('SELECT COUNT(*) FROM users WHERE is_admin = 1 AND is_active = 1')->fetchColumn();
                if ($count <= 1) throw new ApiError(422, 'last_admin', '不能移除最后一个可用管理员');
            }
            $fields[] = $field . ' = ?';
            $values[] = $value ? 1 : 0;
        }
        if (array_key_exists('display_name', $input)) {
            $name = trim((string) $input['display_name']);
            if ($name === '' || mb_strlen($name, 'UTF-8') > 32) throw new ApiError(422, 'invalid_display_name', '显示名需为 1–32 字');
            $fields[] = 'display_name = ?';
            $values[] = $name;
        }
        if (array_key_exists('ai_daily_limit', $input)) {
            $raw = $input['ai_daily_limit'];
            $limit = ($raw === null || $raw === '') ? null : max(0, min(10000, (int) $raw));
            $fields[] = 'ai_daily_limit = ?';
            $values[] = $limit;
        }
        if (array_key_exists('new_password', $input) && (string) $input['new_password'] !== '') {
            $password = (string) $input['new_password'];
            if (strlen($password) < 8 || strlen($password) > 72) throw new ApiError(422, 'invalid_password', '密码长度需为 8–72 位');
            $fields[] = 'password_hash = ?';
            $values[] = password_hash($password, PASSWORD_DEFAULT);
        }
        if ($fields === []) throw new ApiError(422, 'no_changes', '没有可保存的修改');
        $values[] = $userId;
        Db::pdo()->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($values);
        if ($userId === (int) $admin['id']) Auth::resetCache();
        AdminAuth::audit((int) $admin['id'], 'admin.user.update', ['userId' => $userId, 'fields' => array_keys($input)]);
        Http::ok(['ok' => true]);
    }

    public static function passkeyOptions(array $params = []): void
    {
        $admin = AdminAuth::requireAdmin();
        Http::ok(WebAuthn::registerOptions((int) $admin['id'], (string) $admin['username'], (string) $admin['display_name']));
    }

    public static function passkeyRegister(array $params = []): void
    {
        $admin = AdminAuth::requireAdmin();
        $input = Http::input();
        $credential = WebAuthn::verifyRegistration((array) ($input['credential'] ?? []), (int) $admin['id']);
        $label = mb_substr(trim((string) ($input['label'] ?? '管理后台 Passkey')), 0, 80, 'UTF-8') ?: '管理后台 Passkey';
        Db::pdo()->prepare('INSERT INTO admin_passkeys (user_id, credential_id, public_key, sign_count, label) VALUES (?, ?, ?, ?, ?)')
            ->execute([(int) $admin['id'], $credential['credentialId'], $credential['publicKey'], $credential['signCount'], $label]);
        AdminAuth::audit((int) $admin['id'], 'admin.passkey.register', ['label' => $label]);
        Http::ok(['ok' => true]);
    }

    public static function passkeyDelete(array $params = []): void
    {
        $admin = AdminAuth::requireAdmin();
        $id = (int) (Http::input()['id'] ?? 0);
        $stmt = Db::pdo()->prepare('DELETE FROM admin_passkeys WHERE id = ? AND user_id = ?');
        $stmt->execute([$id, (int) $admin['id']]);
        if ($stmt->rowCount() === 0) throw new ApiError(404, 'passkey_not_found', 'Passkey 不存在');
        if (!Settings::bool('admin.password_login_enabled', true)) {
            $count = (int) Db::pdo()->query('SELECT COUNT(*) FROM admin_passkeys')->fetchColumn();
            if ($count === 0) throw new ApiError(422, 'passkey_required', '密码登录已关闭，不能删除最后一个 Passkey');
        }
        AdminAuth::audit((int) $admin['id'], 'admin.passkey.delete', ['id' => $id]);
        Http::ok(['ok' => true]);
    }

    public static function aiProviderSave(array $params = []): void
    {
        $admin = AdminAuth::requireAdmin();
        $input = (array) (Http::input()['provider'] ?? []);
        $name = trim((string) ($input['name'] ?? ''));
        $baseUrl = rtrim(trim((string) ($input['base_url'] ?? '')), '/');
        $models = $input['models'] ?? [];
        if (is_string($models)) $models = array_values(array_filter(array_map('trim', explode(',', $models))));
        $models = array_values(array_unique(array_filter(array_map('strval', (array) $models))));
        $defaultModel = trim((string) ($input['default_model'] ?? ''));
        if ($name === '' || mb_strlen($name, 'UTF-8') > 80) throw new ApiError(422, 'invalid_provider', '供应商名称需为 1–80 字');
        if (!preg_match('#^https?://#i', $baseUrl)) throw new ApiError(422, 'invalid_provider', 'Base URL 需为 http/https');
        if ($models === []) throw new ApiError(422, 'invalid_provider', '至少填写一个模型');
        if ($defaultModel === '' || !in_array($defaultModel, $models, true)) $defaultModel = $models[0];
        $id = trim((string) ($input['id'] ?? ''));
        $providers = Settings::aiProviders();
        $found = false;
        foreach ($providers as &$provider) {
            if (($provider['id'] ?? '') !== $id) continue;
            $found = true;
            $provider['name'] = $name;
            $provider['base_url'] = $baseUrl;
            $provider['models'] = $models;
            $provider['default_model'] = $defaultModel;
            $provider['enabled'] = filter_var($input['enabled'] ?? true, FILTER_VALIDATE_BOOL);
            $provider['type'] = (string) ($input['type'] ?? 'openai-compatible');
            if (!empty($input['api_key'])) $provider['api_key_enc'] = Secret::encrypt((string) $input['api_key']);
            break;
        }
        unset($provider);
        if (!$found) {
            if (empty($input['api_key'])) throw new ApiError(422, 'invalid_provider', '新增供应商必须填写 API Key');
            $providers[] = [
                'id' => 'p_' . bin2hex(random_bytes(6)),
                'name' => $name,
                'base_url' => $baseUrl,
                'models' => $models,
                'default_model' => $defaultModel,
                'enabled' => filter_var($input['enabled'] ?? true, FILTER_VALIDATE_BOOL),
                'type' => (string) ($input['type'] ?? 'openai-compatible'),
                'api_key_enc' => Secret::encrypt((string) $input['api_key']),
                'created_at' => date('c'),
            ];
        }
        Settings::saveAiProviders($providers);
        if (Settings::get('ai.default_provider', '') === '') Settings::set('ai.default_provider', $providers[0]['id'] ?? '');
        AdminAuth::audit((int) $admin['id'], 'admin.ai.provider.save', ['name' => $name, 'id' => $id]);
        Http::ok(AdminAuth::settingsPayload());
    }

    public static function aiProviderDelete(array $params = []): void
    {
        $admin = AdminAuth::requireAdmin();
        $id = trim((string) (Http::input()['id'] ?? ''));
        $providers = array_values(array_filter(Settings::aiProviders(), static fn (array $p): bool => ($p['id'] ?? '') !== $id));
        Settings::saveAiProviders($providers);
        if (Settings::get('ai.default_provider', '') === $id) Settings::set('ai.default_provider', $providers[0]['id'] ?? '');
        AdminAuth::audit((int) $admin['id'], 'admin.ai.provider.delete', ['id' => $id]);
        Http::ok(AdminAuth::settingsPayload());
    }

    public static function aiTest(array $params = []): void
    {
        AdminAuth::requireAdmin();
        $id = trim((string) (Http::input()['id'] ?? ''));
        Http::ok(Ai::testProvider($id));
    }

    public static function audit(array $params = []): void
    {
        AdminAuth::requireAdmin();
        $rows = Db::pdo()->query('SELECT action, detail, ip, created_at FROM admin_audit ORDER BY id DESC LIMIT 100')->fetchAll();
        foreach ($rows as &$row) $row['detail'] = json_decode((string) ($row['detail'] ?? '{}'), true) ?: [];
        Http::ok($rows);
    }
}
