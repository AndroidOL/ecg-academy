<?php
declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));

spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'App\\')) {
        return;
    }
    $file = BASE_PATH . '/app/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($file)) {
        require_once $file;
    }
});

$config = require BASE_PATH . '/app/config.php';
if (is_file(BASE_PATH . '/app/config.local.php')) {
    $local = require BASE_PATH . '/app/config.local.php';
    if (is_array($local)) {
        $config = array_replace_recursive($config, $local);
    }
}

// 环境变量优先级高于文件，便于容器/临时演示注入密钥。
$envMap = [
    'ECG_AI_ENABLED' => ['ai', 'enabled', 'bool'],
    'ECG_AI_BASE_URL' => ['ai', 'base_url', 'string'],
    'ECG_AI_API_KEY' => ['ai', 'api_key', 'string'],
    'ECG_AI_MODEL' => ['ai', 'model', 'string'],
    'ECG_AI_DAILY_LIMIT' => ['ai', 'daily_limit', 'int'],
];
foreach ($envMap as $env => [$section, $key, $type]) {
    $raw = getenv($env);
    if ($raw === false || $raw === '') {
        continue;
    }
    $config[$section][$key] = match ($type) {
        'bool' => in_array(strtolower($raw), ['1', 'true', 'yes', 'on'], true),
        'int' => (int) $raw,
        default => $raw,
    };
}

\App\Config::init($config);
date_default_timezone_set('Asia/Shanghai');

$isCli = PHP_SAPI === 'cli';

if (!$isCli) {
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);
$logDir = BASE_PATH . '/storage/logs';
if (is_dir($logDir) && is_writable($logDir)) {
    ini_set('error_log', $logDir . '/php-error.log');
}
