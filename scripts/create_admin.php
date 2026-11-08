<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Db;
use App\Schema;

$options = getopt('', ['username::', 'password::', 'name::', 'write-local::']);
$username = strtolower(trim((string) ($options['username'] ?? 'admin')));
$name = trim((string) ($options['name'] ?? '站点管理员'));
$password = (string) ($options['password'] ?? getenv('ECG_ADMIN_PASSWORD') ?: '');
if (!preg_match('/^[a-z0-9_]{3,24}$/', $username)) {
    fwrite(STDERR, "username must be 3-24 lowercase letters, digits or underscores\n");
    exit(1);
}
if ($password === '') $password = rtrim(strtr(base64_encode(random_bytes(18)), '+/', 'Ab'), '=');
if (strlen($password) < 12) {
    fwrite(STDERR, "admin password must be at least 12 characters\n");
    exit(1);
}
Schema::up(Db::pdo());
$stmt = Db::pdo()->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
$stmt->execute([$username]);
$id = (int) ($stmt->fetchColumn() ?: 0);
if ($id > 0) {
    Db::pdo()->prepare('UPDATE users SET password_hash = ?, display_name = ?, is_admin = 1, is_active = 1, is_guest = 0 WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_DEFAULT), $name, $id]);
} else {
    Db::pdo()->prepare('INSERT INTO users (public_id, username, password_hash, display_name, is_guest, is_admin, is_active) VALUES (?, ?, ?, ?, 0, 1, 1)')
        ->execute([bin2hex(random_bytes(8)), $username, password_hash($password, PASSWORD_DEFAULT), $name]);
    $id = (int) Db::pdo()->lastInsertId();
}
if (in_array('--write-local', $argv, true) || isset($options['write-local'])) {
    $doc = "# 管理后台本地凭据（不提交到公开仓库）\n\n- 用户名：`{$username}`\n- 密码：`{$password}`\n- 入口：`/#/admin`\n- 首次登录后请在“安全”页注册 Passkey，并可在数据库中关闭密码登录。\n";
    file_put_contents(dirname(__DIR__) . '/docs/ADMIN.local.md', $doc);
}
echo "admin ready: {$username} (id={$id})\n";
if (!getenv('ECG_ADMIN_PASSWORD')) echo "password: {$password}\n";
