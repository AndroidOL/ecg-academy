<?php
declare(strict_types=1);

namespace App;

final class Settings
{
    private static ?array $cache = null;

    private const DEFAULTS = [
        'auth.registration_enabled' => true,
        'auth.user_login_enabled' => true,
        'admin.password_login_enabled' => true,
        'admin.passkey_login_enabled' => true,
        'ai.enabled' => false,
        'ai.daily_limit' => 30,
        'ai.default_provider' => '',
        'ai.system_prompt_append' => '',
        'ai.allow_guest' => false,
        'ai.byok_enabled' => false,
        'site.github_url' => 'https://github.com/AndroidOL/ecg-academy',
        'site.license' => 'MIT（代码）· CC BY-SA 4.0（教学内容）',
        'site.copyright' => '© 2026 Tianhao Wu 等',
        'site.icp' => '',
    ];

    public static function all(): array
    {
        if (self::$cache !== null) return self::$cache;
        $out = self::DEFAULTS;
        try {
            foreach (Db::pdo()->query('SELECT setting_key, setting_value FROM app_settings') as $row) {
                $decoded = json_decode((string) $row['setting_value'], true);
                $out[(string) $row['setting_key']] = $decoded === null && $row['setting_value'] !== 'null'
                    ? (string) $row['setting_value']
                    : $decoded;
            }
        } catch (\Throwable $e) {
            // 数据库尚未迁移时保留默认值，前台仍可使用本地模式。
        }
        self::$cache = $out;
        return $out;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $all = self::all();
        return array_key_exists($key, $all) ? $all[$key] : $default;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        return filter_var(self::get($key, $default), FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? $default;
    }

    public static function int(string $key, int $default = 0): int
    {
        return (int) self::get($key, $default);
    }

    public static function set(string $key, mixed $value): void
    {
        if (!preg_match('/^[a-z0-9_.]{2,64}$/', $key)) {
            throw new ApiError(422, 'invalid_setting_key', '配置键无效');
        }
        $stmt = Db::pdo()->prepare(
            'INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES (?, ?, NOW())
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()'
        );
        $stmt->execute([$key, json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
        self::$cache = null;
    }

    public static function setMany(array $values): void
    {
        foreach ($values as $key => $value) self::set((string) $key, $value);
    }

    public static function aiProviders(): array
    {
        $providers = self::get('ai.providers', []);
        return is_array($providers) ? array_values(array_filter($providers, 'is_array')) : [];
    }

    public static function saveAiProviders(array $providers): void
    {
        self::set('ai.providers', array_values($providers));
    }
}
