<?php
declare(strict_types=1);

namespace App;

final class WebAuthn
{
    public static function rpId(): string
    {
        $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
        $host = preg_replace('/:\d+$/', '', $host) ?: 'localhost';
        return $host;
    }

    public static function origin(): string
    {
        $configured = trim((string) Config::get('webauthn.origin', ''));
        if ($configured !== '') return rtrim($configured, '/');
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        return ($https ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }

    public static function b64urlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    public static function b64urlDecode(string $value): string
    {
        $pad = strlen($value) % 4;
        if ($pad) $value .= str_repeat('=', 4 - $pad);
        $raw = base64_decode(strtr($value, '-_', '+/'), true);
        if ($raw === false) throw new ApiError(422, 'invalid_webauthn', 'Passkey 数据格式无效');
        return $raw;
    }

    public static function challenge(): string
    {
        return self::b64urlEncode(random_bytes(32));
    }

    public static function registerOptions(int $userId, string $username, string $displayName): array
    {
        $challenge = self::challenge();
        $_SESSION['webauthn'] = ['type' => 'register', 'challenge' => $challenge, 'uid' => $userId, 'expires' => time() + 300];
        return [
            'challenge' => $challenge,
            'rp' => ['name' => '心迹 ECG Lab', 'id' => self::rpId()],
            'user' => ['id' => self::b64urlEncode('admin-' . $userId), 'name' => $username, 'displayName' => $displayName],
            'pubKeyCredParams' => [['type' => 'public-key', 'alg' => -7]],
            'timeout' => 60000,
            'attestation' => 'none',
            'authenticatorSelection' => ['residentKey' => 'preferred', 'userVerification' => 'preferred'],
        ];
    }

    public static function loginOptions(array $credentials): array
    {
        $challenge = self::challenge();
        $_SESSION['webauthn'] = ['type' => 'login', 'challenge' => $challenge, 'expires' => time() + 300];
        return [
            'challenge' => $challenge,
            'rpId' => self::rpId(),
            'timeout' => 60000,
            'userVerification' => 'preferred',
            'allowCredentials' => array_map(static fn (array $c): array => ['type' => 'public-key', 'id' => $c['credential_id']], $credentials),
        ];
    }

    public static function verifyRegistration(array $credential, int $userId): array
    {
        $pending = self::pending('register');
        $clientData = self::clientData($credential, 'webauthn.create', $pending['challenge']);
        $attestation = self::cbor(self::b64decodeField($credential, 'attestationObject'));
        if (!is_array($attestation)) throw new ApiError(422, 'invalid_webauthn', '注册数据无效');
        $authData = $attestation['authData'] ?? null;
        if (!is_string($authData)) throw new ApiError(422, 'invalid_webauthn', '缺少 authData');
        $parsed = self::parseAuthData($authData);
        if (!hash_equals(hash('sha256', self::rpId(), true), $parsed['rpIdHash'])) {
            throw new ApiError(422, 'invalid_webauthn', 'Passkey 域名不匹配');
        }
        if (($parsed['flags'] & 0x01) === 0) throw new ApiError(422, 'invalid_webauthn', '用户未完成验证');
        if (($parsed['flags'] & 0x40) === 0 || $parsed['credentialId'] === '') throw new ApiError(422, 'invalid_webauthn', '缺少凭证公钥');
        $key = self::coseToPem($parsed['coseKey']);
        // 若携带 packed self-attestation，则验证签名；none 格式由已登录管理员会话保障。
        $fmt = (string) ($attestation['fmt'] ?? 'none');
        if (isset($attestation['attStmt']['sig'], $attestation['attStmt']['alg']) && $fmt === 'packed') {
            $signed = $authData . hash('sha256', $clientData, true);
            if (!openssl_verify($signed, (string) $attestation['attStmt']['sig'], $key, OPENSSL_ALGO_SHA256)) {
                throw new ApiError(422, 'invalid_webauthn', 'Passkey 注册签名无效');
            }
        }
        return ['credentialId' => self::b64urlEncode($parsed['credentialId']), 'publicKey' => $key, 'signCount' => $parsed['signCount']];
    }

    public static function verifyAssertion(array $credential): int
    {
        $pending = self::pending('login');
        $credentialId = (string) ($credential['id'] ?? '');
        if ($credentialId === '') throw new ApiError(422, 'invalid_webauthn', '缺少凭证 ID');
        $stmt = Db::pdo()->prepare('SELECT * FROM admin_passkeys WHERE credential_id = ? LIMIT 1');
        $stmt->execute([$credentialId]);
        $passkey = $stmt->fetch();
        if (!$passkey) throw new ApiError(401, 'passkey_unknown', '未识别的 Passkey');
        $clientDataRaw = self::b64decodeField($credential, 'clientDataJSON');
        self::clientData($credential, 'webauthn.get', $pending['challenge']);
        $authData = self::b64decodeField($credential, 'authenticatorData');
        $parsed = self::parseAuthData($authData);
        if (!hash_equals(hash('sha256', self::rpId(), true), $parsed['rpIdHash'])) {
            throw new ApiError(401, 'passkey_invalid', 'Passkey 域名不匹配');
        }
        if (($parsed['flags'] & 0x01) === 0) throw new ApiError(401, 'passkey_invalid', '用户验证未完成');
        $signature = self::b64decodeField($credential, 'signature');
        $signed = $authData . hash('sha256', $clientDataRaw, true);
        if (!openssl_verify($signed, $signature, (string) $passkey['public_key'], OPENSSL_ALGO_SHA256)) {
            throw new ApiError(401, 'passkey_invalid', 'Passkey 签名无效');
        }
        if ($parsed['signCount'] > 0 && $parsed['signCount'] < (int) $passkey['sign_count']) {
            throw new ApiError(401, 'passkey_replay', 'Passkey 计数器异常，请重新注册');
        }
        Db::pdo()->prepare('UPDATE admin_passkeys SET sign_count = ?, last_used_at = NOW() WHERE id = ?')
            ->execute([$parsed['signCount'], (int) $passkey['id']]);
        return (int) $passkey['user_id'];
    }

    public static function pending(string $type): array
    {
        $pending = $_SESSION['webauthn'] ?? null;
        if (!is_array($pending) || ($pending['type'] ?? '') !== $type || (int) ($pending['expires'] ?? 0) < time()) {
            throw new ApiError(422, 'webauthn_expired', 'Passkey 验证已过期，请重试');
        }
        unset($_SESSION['webauthn']);
        return $pending;
    }

    private static function clientData(array $credential, string $type, string $challenge): string
    {
        $raw = self::b64decodeField($credential, 'clientDataJSON');
        $data = json_decode($raw, true);
        if (!is_array($data) || ($data['type'] ?? '') !== $type) {
            throw new ApiError(422, 'invalid_webauthn', 'Passkey 响应类型无效');
        }
        if (!hash_equals((string) ($data['challenge'] ?? ''), $challenge)) {
            throw new ApiError(422, 'invalid_webauthn', 'Passkey challenge 不匹配');
        }
        if (rtrim((string) ($data['origin'] ?? ''), '/') !== self::origin()) {
            throw new ApiError(422, 'invalid_webauthn', 'Passkey 来源不匹配');
        }
        return $raw;
    }

    private static function b64decodeField(array $credential, string $field): string
    {
        $value = (string) ($credential['response'][$field] ?? '');
        if ($value === '') throw new ApiError(422, 'invalid_webauthn', '缺少 ' . $field);
        return self::b64urlDecode($value);
    }

    private static function parseAuthData(string $data): array
    {
        if (strlen($data) < 37) throw new ApiError(422, 'invalid_webauthn', 'authData 过短');
        $offset = 37;
        $flags = ord($data[32]);
        $credentialId = '';
        $cose = null;
        if (($flags & 0x40) !== 0) {
            if (strlen($data) < 55) throw new ApiError(422, 'invalid_webauthn', 'authData 缺少凭证');
            $credLen = unpack('n', substr($data, 53, 2))[1] ?? 0;
            $credentialId = substr($data, 55, $credLen);
            $offset = 55 + $credLen;
            $cose = self::cborAt($data, $offset);
        }
        return [
            'rpIdHash' => substr($data, 0, 32),
            'flags' => $flags,
            'signCount' => unpack('N', substr($data, 33, 4))[1] ?? 0,
            'credentialId' => $credentialId,
            'coseKey' => $cose,
        ];
    }

    private static function coseToPem(mixed $cose): string
    {
        if (!is_array($cose) || (int) ($cose[1] ?? 0) !== 2 || (int) ($cose[3] ?? 0) !== -7 || (int) ($cose[-1] ?? 0) !== 1) {
            throw new ApiError(422, 'passkey_unsupported', '仅支持 ES256 平台 Passkey');
        }
        $x = $cose[-2] ?? '';
        $y = $cose[-3] ?? '';
        if (!is_string($x) || !is_string($y) || strlen($x) !== 32 || strlen($y) !== 32) {
            throw new ApiError(422, 'passkey_unsupported', 'Passkey 公钥无效');
        }
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . "\x04" . $x . $y;
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    private static function cbor(string $data): mixed
    {
        $offset = 0;
        return self::cborAt($data, $offset);
    }

    private static function cborAt(string $data, int &$offset): mixed
    {
        if ($offset >= strlen($data)) throw new ApiError(422, 'invalid_webauthn', 'CBOR 截断');
        $initial = ord($data[$offset++]);
        $major = $initial >> 5;
        $add = $initial & 0x1f;
        if ($add < 24) $len = $add;
        elseif ($add === 24) { $len = ord($data[$offset++] ?? "\0"); }
        elseif ($add === 25) { $len = unpack('n', substr($data, $offset, 2))[1] ?? 0; $offset += 2; }
        elseif ($add === 26) { $len = unpack('N', substr($data, $offset, 4))[1] ?? 0; $offset += 4; }
        else throw new ApiError(422, 'invalid_webauthn', 'CBOR 长度格式不支持');
        return match ($major) {
            0 => $len,
            1 => -1 - $len,
            2 => self::take($data, $offset, $len),
            3 => self::take($data, $offset, $len),
            4 => self::cborArray($data, $offset, $len),
            5 => self::cborMap($data, $offset, $len),
            6 => self::cborAt($data, $offset),
            7 => $len === 20 ? false : ($len === 21 ? true : ($len === 22 ? null : $len)),
            default => throw new ApiError(422, 'invalid_webauthn', 'CBOR 类型不支持'),
        };
    }

    private static function take(string $data, int &$offset, int $len): string
    {
        if ($len < 0 || $offset + $len > strlen($data)) throw new ApiError(422, 'invalid_webauthn', 'CBOR 数据截断');
        $value = substr($data, $offset, $len);
        $offset += $len;
        return $value;
    }

    private static function cborArray(string $data, int &$offset, int $len): array
    {
        $out = [];
        for ($i = 0; $i < $len; $i++) $out[] = self::cborAt($data, $offset);
        return $out;
    }

    private static function cborMap(string $data, int &$offset, int $len): array
    {
        $out = [];
        for ($i = 0; $i < $len; $i++) {
            $key = self::cborAt($data, $offset);
            $out[$key] = self::cborAt($data, $offset);
        }
        return $out;
    }
}
