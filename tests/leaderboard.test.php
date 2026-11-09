<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Db;
use App\Learning;

$pdo = Db::pdo();
$ids = [];
$passed = 0;
$failed = 0;
function check(string $name, callable $fn): void {
    global $passed, $failed;
    try { $fn(); $passed++; echo "  ok  {$name}\n"; }
    catch (Throwable $e) { $failed++; echo "FAIL  {$name}: " . $e->getMessage() . "\n"; }
}

try {
    for ($i = 1; $i <= 3; $i++) {
        $pdo->prepare('INSERT INTO users (public_id, display_name, is_guest) VALUES (?, ?, 1)')
            ->execute([bin2hex(random_bytes(8)), '榜单测试' . $i]);
        $uid = (int) $pdo->lastInsertId();
        $ids[] = $uid;
        $pdo->prepare('INSERT INTO practice_daily_scores (user_id, day, score, correct, wrong) VALUES (?, CURDATE(), ?, ?, ?)')
            ->execute([$uid, [2000000000, 1999999999, 1999999998][$i - 1], [12, 6, 2][$i - 1], [2, 1, 8][$i - 1]]);
    }

    check('leaderboard ranks by score then correct answers', function () use ($ids) {
        $data = Learning::practiceLeaderboardData($ids[1], 'today');
        assert($data['total'] >= 3);
        assert($data['items'][0]['points'] === 2000000000);
        assert($data['items'][0]['rank'] === 1);
        assert($data['items'][1]['points'] === 1999999999);
        assert($data['me']['rank'] === 2);
        assert($data['me']['accuracy'] === 86);
    });

    check('week and all scopes include today', function () use ($ids) {
        $week = Learning::practiceLeaderboardData($ids[2], 'week');
        $all = Learning::practiceLeaderboardData($ids[2], 'all');
        assert($week['total'] >= 3);
        assert($all['total'] >= 3);
        assert($week['me']['rank'] >= 1);
        assert($all['me']['rank'] >= 1);
    });
} finally {
    foreach ($ids as $id) $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
