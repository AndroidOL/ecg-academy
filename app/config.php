<?php
declare(strict_types=1);

return [
    'app' => [
        'name' => '心迹 ECG Lab',
        'version' => '1.6.2',
        'asset_version' => '20261108ap',
        'env' => 'production',
        'debug' => false,
        'base_path' => '',
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
        'lifetime' => 0,
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
