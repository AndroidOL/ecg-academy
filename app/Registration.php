<?php
declare(strict_types=1);

namespace App;

final class Registration
{
    public static function normalizeEmail(string $email): string
    {
        return mb_strtolower(trim($email), 'UTF-8');
    }

    public static function requestCode(string $rawEmail): array
    {
        Auth::requireCsrf();
        if (!Settings::bool('auth.registration_enabled', false)) {
            throw new ApiError(403, 'registration_disabled', '当前站点已关闭新用户注册');
        }
        $email = self::normalizeEmail($rawEmail);
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || mb_strlen($email, 'UTF-8') > 190) {
            throw new ApiError(422, 'invalid_email', '请输入有效的邮箱地址');
        }
        if (!Mailer::configured()) {
            throw new ApiError(503, 'mail_not_configured', '站点邮件服务尚未配置，请联系管理员');
        }
        $ipHash = hash('sha256', Http::clientIp());
        $pdo = Db::pdo();
        $today = (int) $pdo->query('SELECT COUNT(*) FROM users WHERE is_guest = 0 AND email_verified_at IS NOT NULL AND created_at >= CURDATE()')->fetchColumn();
        if ($today >= max(1, Settings::int('auth.registration_daily_limit', 5))) {
            throw new ApiError(429, 'registration_daily_limit', '今日注册名额已满，请明天再试');
        }
        $taken = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = ? AND is_guest = 0');
        $taken->execute([$email]);
        if ((int) $taken->fetchColumn() > 0) {
            // Do not reveal registration status; still enforce rate limits and return generic success.
            return ['sent' => true, 'message' => '如果该邮箱可用，验证码已发送'];
        }
        $perEmail = $pdo->prepare('SELECT COUNT(*) FROM email_verification_codes WHERE email = ? AND created_at >= CURDATE()');
        $perEmail->execute([$email]);
        if ((int) $perEmail->fetchColumn() >= max(1, Settings::int('auth.email_daily_per_address', 3))) {
            throw new ApiError(429, 'email_daily_limit', '该邮箱今日发送次数已达上限');
        }
        $perIp = $pdo->prepare('SELECT COUNT(*) FROM email_verification_codes WHERE ip_hash = ? AND created_at >= CURDATE()');
        $perIp->execute([$ipHash]);
        if ((int) $perIp->fetchColumn() >= max(1, Settings::int('auth.email_daily_per_ip', 5))) {
            throw new ApiError(429, 'ip_email_limit', '当前网络今日发送次数已达上限');
        }
        $cooldown = $pdo->prepare('SELECT created_at FROM email_verification_codes WHERE email = ? ORDER BY id DESC LIMIT 1');
        $cooldown->execute([$email]);
        $last = $cooldown->fetchColumn();
        if ($last && time() - strtotime((string) $last) < 60) {
            throw new ApiError(429, 'email_cooldown', '请 60 秒后再获取验证码');
        }
        $code = (string) random_int(100000, 999999);
        $ttl = max(300, min(1800, Settings::int('auth.email_code_ttl', 600)));
        $stmt = $pdo->prepare(
            'INSERT INTO email_verification_codes (email, purpose, code_hash, ip_hash, expires_at)
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))'
        );
        $stmt->execute([$email, 'register', Secret::fingerprint($code), $ipHash, $ttl]);
        $body = "您好，\n\n您正在注册心迹 ECG Lab 账号。本次验证码：{$code}\n\n验证码 " . (int) ceil($ttl / 60) . " 分钟内有效，仅可使用一次。\n如果这不是您的操作，请忽略本邮件。\n\n心迹 ECG Lab";
        $result = Mailer::send($email, '心迹 ECG Lab 注册验证码', $body);
        if (!$result['ok']) {
            $pdo->prepare('UPDATE email_verification_codes SET used_at = NOW() WHERE id = ?')->execute([(int) $pdo->lastInsertId()]);
            throw new ApiError(503, 'mail_failed', '验证码邮件发送失败，请稍后重试或联系管理员');
        }
        return ['sent' => true, 'message' => '如果该邮箱可用，验证码已发送'];
    }

    public static function register(array $input): array
    {
        Auth::requireCsrf();
        if (!Settings::bool('auth.registration_enabled', false)) {
            throw new ApiError(403, 'registration_disabled', '当前站点已关闭新用户注册');
        }
        $email = self::normalizeEmail((string) ($input['email'] ?? ''));
        $code = trim((string) ($input['code'] ?? ''));
        $username = strtolower(trim((string) ($input['username'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $displayName = Auth::cleanDisplayName((string) ($input['displayName'] ?? ''));
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false || mb_strlen($email, 'UTF-8') > 190) {
            throw new ApiError(422, 'invalid_email', '请输入有效的邮箱地址');
        }
        if (!preg_match('/^\d{6}$/', $code)) throw new ApiError(422, 'invalid_code', '验证码需为 6 位数字');
        if (!preg_match('/^[a-z0-9_]{3,24}$/', $username)) throw new ApiError(422, 'invalid_username', '用户名需为 3–24 位字母、数字或下划线');
        if (strlen($password) < 8 || strlen($password) > 72) throw new ApiError(422, 'invalid_password', '密码长度需为 8–72 位');
        if ($displayName === '') $displayName = $username;
        self::throttle('register:' . Http::clientIp(), 8, 900);

        $pdo = Db::pdo();
        $dailyLimit = max(1, Settings::int('auth.registration_daily_limit', 5));
        $today = (int) $pdo->query('SELECT COUNT(*) FROM users WHERE is_guest = 0 AND email_verified_at IS NOT NULL AND created_at >= CURDATE()')->fetchColumn();
        if ($today >= $dailyLimit) throw new ApiError(429, 'registration_daily_limit', '今日注册名额已满，请明天再试');

        $emailUsed = $pdo->prepare('SELECT COUNT(*) FROM users WHERE email = ? AND is_guest = 0');
        $emailUsed->execute([$email]);
        if ((int) $emailUsed->fetchColumn() > 0) throw new ApiError(409, 'email_taken', '该邮箱已注册');

        $stmt = $pdo->prepare('SELECT * FROM email_verification_codes WHERE email = ? AND purpose = "register" AND used_at IS NULL ORDER BY id DESC LIMIT 1');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        if (!$row) throw new ApiError(422, 'code_not_found', '请先获取验证码');
        if (strtotime((string) $row['expires_at']) < time()) throw new ApiError(422, 'code_expired', '验证码已过期，请重新获取');
        if ((int) $row['attempts'] >= 5) throw new ApiError(429, 'code_too_many_attempts', '验证码尝试次数过多，请重新获取');
        if (!hash_equals((string) $row['code_hash'], Secret::fingerprint($code))) {
            $pdo->prepare('UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?')->execute([(int) $row['id']]);
            throw new ApiError(422, 'code_invalid', '验证码不正确');
        }

        $current = Auth::user(false);
        if ($current && (int) $current['is_guest'] !== 1) throw new ApiError(409, 'already_registered', '当前账号已注册');
        $isGuest = $current && (int) $current['is_guest'] === 1;
        $checkName = $pdo->prepare('SELECT COUNT(*) FROM users WHERE username = ? AND id <> ?');
        $checkName->execute([$username, $isGuest ? (int) $current['id'] : 0]);
        if ((int) $checkName->fetchColumn() > 0) throw new ApiError(409, 'username_taken', '该用户名已被占用');
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE email_verification_codes SET used_at = NOW() WHERE id = ?')->execute([(int) $row['id']]);
            if ($isGuest) {
                $pdo->prepare('UPDATE users SET username = ?, password_hash = ?, display_name = ?, email = ?, email_verified_at = NOW(), is_guest = 0 WHERE id = ?')
                    ->execute([$username, password_hash($password, PASSWORD_DEFAULT), $displayName, $email, (int) $current['id']]);
                $userId = (int) $current['id'];
            } else {
                $pdo->prepare('INSERT INTO users (public_id, username, password_hash, display_name, email, email_verified_at, is_guest) VALUES (?, ?, ?, ?, ?, NOW(), 0)')
                    ->execute([bin2hex(random_bytes(8)), $username, password_hash($password, PASSWORD_DEFAULT), $displayName, $email]);
                $userId = (int) $pdo->lastInsertId();
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            if ((string) $e->getCode() === '23000') throw new ApiError(409, 'account_taken', '用户名或邮箱已被占用');
            throw $e;
        }
        self::clearThrottle('register:' . Http::clientIp());
        if (session_status() === PHP_SESSION_ACTIVE) session_regenerate_id(true);
        $_SESSION['uid'] = $userId;
        Auth::markLoggedIn();
        Auth::resetCache();
        return Auth::user() ?? [];
    }

    private static function throttle(string $key, int $max, int $window): void
    {
        $stmt = Db::pdo()->prepare('SELECT window_start, fail_count FROM auth_throttle WHERE throttle_key = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        if (!$row) return;
        $elapsed = time() - (int) $row['window_start'];
        if ($elapsed < $window && (int) $row['fail_count'] >= $max) {
            throw new ApiError(429, 'too_many_attempts', '尝试次数过多，请稍后再试');
        }
    }

    private static function clearThrottle(string $key): void
    {
        Db::pdo()->prepare('DELETE FROM auth_throttle WHERE throttle_key = ?')->execute([$key]);
    }
}
