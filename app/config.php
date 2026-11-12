<?php
declare(strict_types=1);

return [
    'app' => [
        'name' => '心迹 ECG Lab',
        'version' => '3.4.9',
        'asset_version' => '20261112a4',
        'env' => 'production',
        'debug' => false,
        'base_path' => '',
        // Canonical origin for SEO pages, sitemap and structured data.
        'base_url' => 'https://ecg.tianhao.me',
        'seo' => [
            // Paste the verification codes from Baidu / Google / Bing 站长平台 when available.
            'verification' => [
                'baidu' => '',
                'google' => '',
                'bing' => '',
            ],
            // Bing IndexNow key: /{key}.txt will echo the key automatically.
            'indexnow_key' => '',
        ],
    ],
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'ecg_academy',
        'user' => 'ecg_app',
        'password' => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],
    'session' => [
        'name' => 'ECGLABSESS',
        'save_path' => dirname(__DIR__) . '/storage/sessions',
        // 7-day idle window, sliding renewal, hard 15-day cap from login.
        'lifetime' => 604800,
        'idle_ttl' => 604800,
        'max_ttl' => 1296000,
        'renew_interval' => 3600,
    ],
    'security' => [
        'csrf' => true,
        'allow_origin' => '',
    ],
    'ai' => [
        'enabled' => false,
        'base_url' => 'https://api.openai.com/v1',
        'api_key' => '',
        'model' => 'gpt-4o-mini',
        'timeout' => 20,
        'daily_limit' => 30,
    ],
];
