<?php
declare(strict_types=1);

namespace App;

use PDO;

final class Auth
{
    private static bool $started = false;
    private static ?array $user = null;

    public static function start(): void
    {
        if (self::$started || PHP_SAPI === 'cli') {
            return;
        }
        self::$started = true;

        $savePath = (string) Config::get('session.save_path');
        if ($savePath !== '' && is_dir($savePath) && is_writable($savePath)) {
            session_save_path($savePath);
        }
        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        session_set_cookie_params([
            'lifetime' => (int) Config::get('session.lifetime', 0),
            'path' => '/',
            'domain' => '',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_name((string) Config::get('session.name', 'ECGLABSESS'));
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(24));
        }
    }

    public static function user(bool $createGuest = false): ?array
    {
        self::start();
        if (self::$user !== null) {
            return self::$user;
        }
        if (!empty($_SESSION['uid'])) {
            $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([(int) $_SESSION['uid']]);
            $user = $stmt->fetch();
            if ($user && (int) ($user['is_active'] ?? 1) === 1) {
                self::$user = $user;
                return $user;
            }
            unset($_SESSION['uid']);
        }
        if ($createGuest) {
            self::$user = self::createGuest();
            return self::$user;
        }
        return null;
    }

    private static function createGuest(): array
    {
        $ip = Http::clientIp();
        self::throttleCheck('guest-create:' . $ip, 60, 600);
        $adjectives = ['安静', '专注', '好奇', '敏锐', '沉着', '清醒', '笃定', '温和', '坚定', '灵动'];
        $nouns = ['听诊器', '心电笔', '小示波器', '窦房结', '除颤仪', '心电图纸', '白大褂', '叩诊锤'];
        $name = $adjectives[array_rand($adjectives)] . $nouns[array_rand($nouns)] . '·' . random_int(100, 999);
        $publicId = bin2hex(random_bytes(8));
        $stmt = Db::pdo()->prepare(
            'INSERT INTO users (public_id, display_name, is_guest) VALUES (?, ?, 1)'
        );
        $stmt->execute([$publicId, $name]);
        $id = (int) Db::pdo()->lastInsertId();
        self::recordFailure('guest-create:' . $ip);
        $_SESSION['uid'] = $id;
        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$id]);
        return $stmt->fetch();
    }

    public static function resetCache(): void
    {
        self::$user = null;
    }

    public static function csrf(): string
    {
        self::start();
        return (string) ($_SESSION['csrf'] ?? '');
    }

    public static function requireCsrf(): void
    {
        self::start();
        $token = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
        $expected = (string) ($_SESSION['csrf'] ?? '');
        if ($token === '' || $expected === '' || !hash_equals($expected, $token)) {
            throw new ApiError(419, 'csrf_invalid', '会话校验失败，请刷新页面后重试');
        }
    }

    public static function register(array $input): array
    {
        self::requireCsrf();
        if (!Settings::bool('auth.registration_enabled', true)) {
            throw new ApiError(403, 'registration_disabled', '当前站点已关闭新用户注册');
        }
        $current = self::user(true);
        if (!$current || (int) $current['is_guest'] !== 1) {
            throw new ApiError(409, 'already_registered', '当前账号已注册，请直接登录');
        }

        $username = strtolower(trim((string) ($input['username'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $displayName = self::cleanDisplayName((string) ($input['displayName'] ?? ''));

        if (!preg_match('/^[a-z0-9_]{3,24}$/', $username)) {
            throw new ApiError(422, 'invalid_username', '用户名需为 3–24 位字母、数字或下划线');
        }
        if (strlen($password) < 8 || strlen($password) > 72) {
            throw new ApiError(422, 'invalid_password', '密码长度需为 8–72 位');
        }
        if ($displayName === '') {
            $displayName = $username;
        }

        self::throttleCheck('register:' . Http::clientIp(), 8, 900);

        try {
            $stmt = Db::pdo()->prepare(
                'UPDATE users SET username = ?, password_hash = ?, display_name = ?, is_guest = 0 WHERE id = ?'
            );
            $stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT), $displayName, (int) $current['id']]);
        } catch (\PDOException $e) {
            self::recordFailure('register:' . Http::clientIp());
            if ((string) $e->getCode() === '23000') {
                throw new ApiError(409, 'username_taken', '该用户名已被占用');
            }
            throw $e;
        }

        self::clearFailures('register:' . Http::clientIp());
        $_SESSION['uid'] = (int) $current['id'];
        session_regenerate_id(true);
        self::$user = null;
        return self::user() ?? [];
    }

    public static function login(array $input): array
    {
        self::requireCsrf();
        if (!Settings::bool('auth.user_login_enabled', true)) {
            throw new ApiError(403, 'user_login_disabled', '当前站点已关闭普通用户登录');
        }
        $username = strtolower(trim((string) ($input['username'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        if ($username === '' || $password === '') {
            throw new ApiError(422, 'missing_credentials', '请输入用户名和密码');
        }

        $throttleKey = 'login:' . Http::clientIp() . ':' . substr(hash('sha256', $username), 0, 16);
        self::throttleCheck($throttleKey, 6, 600);

        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE username = ? AND is_guest = 0 LIMIT 1');
        $stmt->execute([$username]);
        $account = $stmt->fetch();
        if (!$account || (int) ($account['is_active'] ?? 1) !== 1 || !password_verify($password, (string) $account['password_hash'])) {
            self::recordFailure($throttleKey);
            throw new ApiError(401, 'invalid_credentials', '用户名或密码不正确');
        }
        if ((int) ($account['is_admin'] ?? 0) === 1 && !Settings::bool('admin.password_login_enabled', true)) {
            throw new ApiError(403, 'admin_password_login_disabled', '管理员密码登录已关闭，请使用 Passkey');
        }

        $guest = self::user();
        if ($guest && (int) $guest['is_guest'] === 1 && (int) $guest['id'] !== (int) $account['id']) {
            self::mergeGuestProgress((int) $guest['id'], (int) $account['id']);
            Db::pdo()->prepare('DELETE FROM users WHERE id = ? AND is_guest = 1')->execute([(int) $guest['id']]);
        }

        self::clearFailures($throttleKey);
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $account['id'];
        Db::pdo()->prepare('UPDATE users SET last_seen_at = NOW() WHERE id = ?')->execute([(int) $account['id']]);
        self::$user = null;
        return self::user() ?? [];
    }

    public static function passkeyLoginOptions(string $username): array
    {
        self::start();
        if (!Settings::bool('auth.user_login_enabled', true)) {
            throw new ApiError(403, 'user_login_disabled', '当前站点已关闭普通用户登录');
        }
        $username = strtolower(trim($username));
        if ($username === '') throw new ApiError(422, 'missing_credentials', '请输入用户名');
        $stmt = Db::pdo()->prepare(
            'SELECT p.credential_id FROM admin_passkeys p JOIN users u ON u.id = p.user_id
             WHERE u.username = ? AND u.is_guest = 0 AND u.is_active = 1 ORDER BY p.id ASC LIMIT 20'
        );
        $stmt->execute([$username]);
        $rows = $stmt->fetchAll();
        if ($rows === []) throw new ApiError(404, 'passkey_not_found', '该账号尚未注册 Passkey');
        return WebAuthn::loginOptions($rows);
    }

    public static function passkeyLogin(array $credential): array
    {
        self::requireCsrf();
        if (!Settings::bool('auth.user_login_enabled', true)) {
            throw new ApiError(403, 'user_login_disabled', '当前站点已关闭普通用户登录');
        }
        $throttleKey = 'passkey_login:' . Http::clientIp();
        self::throttleCheck($throttleKey, 10, 600);
        try {
            $userId = WebAuthn::verifyAssertion($credential);
        } catch (ApiError $e) {
            self::recordFailure($throttleKey);
            throw $e;
        }
        $stmt = Db::pdo()->prepare('SELECT * FROM users WHERE id = ? AND is_guest = 0 LIMIT 1');
        $stmt->execute([$userId]);
        $account = $stmt->fetch();
        if (!$account || (int) ($account['is_active'] ?? 1) !== 1) {
            self::recordFailure($throttleKey);
            throw new ApiError(401, 'invalid_credentials', '账号不可用');
        }
        $guest = self::user();
        if ($guest && (int) $guest['is_guest'] === 1 && (int) $guest['id'] !== (int) $account['id']) {
            self::mergeGuestProgress((int) $guest['id'], (int) $account['id']);
            Db::pdo()->prepare('DELETE FROM users WHERE id = ? AND is_guest = 1')->execute([(int) $guest['id']]);
        }
        self::clearFailures($throttleKey);
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $account['id'];
        Db::pdo()->prepare('UPDATE users SET last_seen_at = NOW() WHERE id = ?')->execute([(int) $account['id']]);
        self::$user = null;
        return self::user() ?? [];
    }

    public static function logout(): void
    {
        self::start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => $params['samesite'] ?? 'Lax',
            ]);
        }
        session_destroy();
        self::$started = false;
        self::$user = null;
    }

    public static function touch(): void
    {
        $user = self::user(false);
        if (!$user) {
            return;
        }
        $last = $_SESSION['last_touch'] ?? 0;
        if (time() - (int) $last < 300) {
            return;
        }
        $_SESSION['last_touch'] = time();
        Db::pdo()->prepare('UPDATE users SET last_seen_at = NOW() WHERE id = ?')->execute([(int) $user['id']]);
    }

    public static function updateTheme(string $theme): void
    {
        if (!in_array($theme, ['auto', 'light', 'dark'], true)) {
            throw new ApiError(422, 'invalid_theme', '主题参数无效');
        }
        $user = self::user(true);
        Db::pdo()->prepare('UPDATE users SET theme = ? WHERE id = ?')->execute([$theme, (int) $user['id']]);
    }

    public static function publicUser(array $user): array
    {
        return [
            'id' => $user['public_id'],
            'displayName' => $user['display_name'],
            'username' => $user['username'],
            'isGuest' => (int) $user['is_guest'] === 1,
            'isAdmin' => (int) ($user['is_admin'] ?? 0) === 1,
            'xp' => (int) $user['xp'],
            'theme' => $user['theme'],
            'createdAt' => $user['created_at'],
        ];
    }

    public static function cleanDisplayName(string $name): string
    {
        $name = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '');
        if ($name === '') {
            return '';
        }
        return mb_substr($name, 0, 20, 'UTF-8');
    }

    private static function throttleCheck(string $key, int $max, int $window): void
    {
        $stmt = Db::pdo()->prepare('SELECT window_start, fail_count FROM auth_throttle WHERE throttle_key = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        if (!$row) {
            return;
        }
        $elapsed = time() - (int) $row['window_start'];
        if ($elapsed < $window && (int) $row['fail_count'] >= $max) {
            $wait = max(1, $window - $elapsed);
            throw new ApiError(429, 'too_many_attempts', '尝试次数过多，请在 ' . ceil($wait / 60) . ' 分钟后重试');
        }
    }

    private static function recordFailure(string $key): void
    {
        $stmt = Db::pdo()->prepare(
            'INSERT INTO auth_throttle (throttle_key, window_start, fail_count) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE
               fail_count = IF(window_start < ?, 1, fail_count + 1),
               window_start = IF(window_start < ?, ?, window_start)'
        );
        $now = time();
        $resetBefore = $now - 600;
        $stmt->execute([$key, $now, $resetBefore, $resetBefore, $now]);
    }

    private static function clearFailures(string $key): void
    {
        Db::pdo()->prepare('DELETE FROM auth_throttle WHERE throttle_key = ?')->execute([$key]);
    }

    private static function mergeGuestProgress(int $guestId, int $accountId): void
    {
        $stmt = Db::pdo()->prepare('SELECT diagnosis_id, status, read_at, mastered_at FROM user_progress WHERE user_id = ?');
        $stmt->execute([$guestId]);
        $rows = $stmt->fetchAll();
        if ($rows !== []) {
            $upsert = Db::pdo()->prepare(
                'INSERT INTO user_progress (user_id, diagnosis_id, status, read_at, mastered_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   status = IF(VALUES(status) = "mastered" OR status = "mastered", "mastered", "read"),
                   read_at = COALESCE(read_at, VALUES(read_at)),
                   mastered_at = COALESCE(mastered_at, VALUES(mastered_at))'
            );
            foreach ($rows as $row) {
                $upsert->execute([$accountId, $row['diagnosis_id'], $row['status'], $row['read_at'], $row['mastered_at']]);
            }
        }
        try {
            Db::pdo()->prepare(
                'INSERT IGNORE INTO daily_results (user_id, day, correct, total, score, xp, time_ms, details, created_at)
                 SELECT ?, day, correct, total, score, xp, time_ms, details, created_at FROM daily_results WHERE user_id = ?'
            )->execute([$accountId, $guestId]);
        } catch (\Throwable $e) {
            error_log('[auth] daily merge failed: ' . $e->getMessage());
        }
    }
}
