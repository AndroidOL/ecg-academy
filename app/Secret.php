<?php
declare(strict_types=1);

namespace App;

final class Secret
{
    private static function key(): string
    {
        $path = BASE_PATH . '/storage/master.key';
        if (is_file($path)) {
            $raw = file_get_contents($path);
            if (is_string($raw) && strlen($raw) >= 32) return substr($raw, 0, 32);
        }
        $raw = random_bytes(32);
        if (!is_dir(dirname($path))) @mkdir(dirname($path), 0700, true);
        if (@file_put_contents($path, $raw, LOCK_EX) === false) {
            throw new ApiError(500, 'secret_storage_unavailable', '无法初始化密钥存储');
        }
        @chmod($path, 0600);
        return $raw;
    }

    public static function fingerprint(string $value): string
    {
        return hash_hmac('sha256', $value, self::key());
    }

    public static function encrypt(string $plain): string
    {
        if ($plain === '') return '';
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) throw new ApiError(500, 'encryption_failed', '加密失败');
        return base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(string $blob): string
    {
        if ($blob === '') return '';
        $raw = base64_decode($blob, true);
        if ($raw === false || strlen($raw) < 29) return '';
        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $cipher = substr($raw, 28);
        $plain = openssl_decrypt($cipher, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        return is_string($plain) ? $plain : '';
    }

    public static function seal(array $data): string
    {
        $blob = self::encrypt(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        return rtrim(strtr(base64_encode($blob), '+/', '-_'), '=');
    }

    public static function open(string $token): ?array
    {
        $pad = strlen($token) % 4;
        if ($pad) $token .= str_repeat('=', 4 - $pad);
        $raw = base64_decode(strtr($token, '-_', '+/'), true);
        if ($raw === false) return null;
        $json = self::decrypt($raw);
        if ($json === '') return null;
        $data = json_decode($json, true);
        return is_array($data) ? $data : null;
    }

    public static function mask(string $value): string
    {
        if ($value === '') return '';
        if (strlen($value) <= 8) return '••••••••';
        return substr($value, 0, 4) . '••••' . substr($value, -4);
    }
}
