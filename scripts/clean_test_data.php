<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Db;

$options = getopt('', ['yes']);
if (!in_array('--yes', $argv, true) && !isset($options['yes'])) {
    fwrite(STDERR, "Refusing to delete without --yes\n");
    exit(2);
}
$pdo = Db::pdo();
$admin = $pdo->query('SELECT id, username FROM users WHERE is_admin = 1 AND is_active = 1 ORDER BY id ASC LIMIT 1')->fetch();
if (!$admin) {
    fwrite(STDERR, "No active admin account; refusing cleanup\n");
    exit(3);
}
$adminId = (int) $admin['id'];
$backupDir = BASE_PATH . '/storage/backups';
if (!is_dir($backupDir)) mkdir($backupDir, 0700, true);
$tables = ['users', 'user_progress', 'quiz_attempts', 'sim_sessions', 'sim_runs', 'ai_usage', 'learning_events', 'learning_status', 'practice_daily_scores'];
$backup = ['created_at' => date(DATE_ATOM), 'admin_id' => $adminId, 'tables' => []];
foreach ($tables as $table) {
    $backup['tables'][$table] = $pdo->query("SELECT * FROM `{$table}`")->fetchAll();
}
$file = $backupDir . '/test-data-' . date('Ymd-His') . '.json';
file_put_contents($file, json_encode($backup, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), LOCK_EX);
chmod($file, 0600);
$pdo->beginTransaction();
try {
    $pdo->prepare('DELETE FROM users WHERE is_admin = 0')->execute();
    $pdo->exec('DELETE FROM user_progress');
    $pdo->exec('DELETE FROM quiz_attempts');
    $pdo->exec('DELETE FROM sim_sessions');
    $pdo->exec('DELETE FROM sim_runs');
    $pdo->exec('DELETE FROM ai_usage');
    $pdo->exec('DELETE FROM learning_events');
    $pdo->exec('DELETE FROM learning_status');
    $pdo->exec('DELETE FROM practice_daily_scores');
    $pdo->exec('DELETE FROM auth_throttle');
    $pdo->commit();
} catch (Throwable $e) {
    $pdo->rollBack();
    throw $e;
}
echo "backup: {$file}\n";
echo "remaining users: " . (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() . "\n";
echo "remaining progress: " . (int) $pdo->query('SELECT COUNT(*) FROM user_progress')->fetchColumn() . "\n";
echo "remaining quiz attempts: " . (int) $pdo->query('SELECT COUNT(*) FROM quiz_attempts')->fetchColumn() . "\n";
echo "remaining sim runs: " . (int) $pdo->query('SELECT COUNT(*) FROM sim_runs')->fetchColumn() . "\n";
echo "remaining learning events: " . (int) $pdo->query('SELECT COUNT(*) FROM learning_events')->fetchColumn() . "\n";
