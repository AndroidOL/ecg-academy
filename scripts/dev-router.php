<?php
declare(strict_types=1);

// 仅用于本地视觉/接口验收：静态文件直接交给 PHP 内置服务器，其余请求进入 SPA/API。
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$file = __DIR__ . '/../public' . $path;
if ($path !== '/' && is_file($file)) {
    return false;
}
require __DIR__ . '/../public/index.php';
