<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Traffic;

$days = 7;
$dryRun = false;
foreach ($argv as $arg) {
    if (str_starts_with($arg, '--days=')) $days = max(0, min(365, (int) substr($arg, 7)));
    if ($arg === '--dry-run') $dryRun = true;
}

$pdo = \App\Db::pdo();
$stmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE is_guest = 1' . ($days > 0 ? ' AND last_seen_at < NOW() - INTERVAL ? DAY' : ''));
$stmt->execute($days > 0 ? [$days] : []);
$matched = (int) $stmt->fetchColumn();

if ($dryRun) {
    echo "dry-run: {$matched} guest(s) would be deleted (days={$days})\n";
    exit(0);
}

$deleted = Traffic::cleanGuests($days);
$expired = Traffic::cleanVisits(90);
echo "deleted {$deleted} guest(s) (days={$days}); expired {$expired} visitor event(s)\n";
