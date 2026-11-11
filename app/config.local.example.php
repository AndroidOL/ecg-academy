<?php
declare(strict_types=1);

// 复制为 app/config.local.php 后填写。该文件被 .gitignore 忽略，且位于 Web 根之外。
return [
    'app' => [
        // 本地预览或独立域名部署时改成实际访问地址，SEO canonical/sitemap 会使用它。
        'base_url' => 'https://ecg.tianhao.me',
    ],
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'ecg_academy',
        'user' => 'ecg_app',
        'password' => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],
    'ai' => [
        'enabled' => true,
        // OpenAI 兼容端点，末尾不要带 /chat/completions
        'base_url' => 'https://api.openai.com/v1',
        'api_key' => 'sk-REPLACE_ME',
        'model' => 'gpt-4o-mini',
        'timeout' => 20,
        'daily_limit' => 30,
    ],
];
