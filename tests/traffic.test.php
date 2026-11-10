<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Db;
use App\Traffic;

$passed = 0;
$failed = 0;
$userIds = [];
$testIp = '203.0.113.' . random_int(1, 250);

function check(string $name, callable $fn): void
{
    global $passed, $failed;
    try {
        $fn();
        $passed++;
        echo "  ok  {$name}\n";
    } catch (Throwable $e) {
        $failed++;
        echo "  FAIL {$name}: {$e->getMessage()}\n";
    }
}

function makeUser(bool $guest): int
{
    global $userIds;
    $pdo = Db::pdo();
    $stmt = $pdo->prepare('INSERT INTO users (public_id, username, password_hash, display_name, is_guest) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([bin2hex(random_bytes(10)), $guest ? null : 't' . bin2hex(random_bytes(5)), $guest ? null : password_hash('pw-123456', PASSWORD_DEFAULT), $guest ? '流量游客' : '流量账号', $guest ? 1 : 0]);
    $id = (int) $pdo->lastInsertId();
    $userIds[] = $id;
    return $id;
}

$_SERVER['REMOTE_ADDR'] = $testIp;
$_SERVER['HTTP_USER_AGENT'] = 'TrafficTest/1.0 (unit)';

try {
    $guest = makeUser(true);
    $account = makeUser(false);

    check('records and normalizes paths', function () use ($guest, $account): void {
        Traffic::record(null, ['path' => '/learn/normal-sinus?chapter=theory', 'referer' => 'https://example.org/post']);
        Traffic::record(['id' => $guest, 'is_guest' => 1], ['path' => '/daily']);
        Traffic::record(['id' => $account, 'is_guest' => 0], ['path' => '/', 'referer' => 'not-a-url']);
        $stmt = Db::pdo()->prepare('SELECT path, referer, is_guest FROM visitor_events WHERE ip = ? ORDER BY id ASC');
        $stmt->execute([$GLOBALS['testIp']]);
        $rows = $stmt->fetchAll();
        assert(count($rows) === 3);
        assert($rows[0]['path'] === '/learn/*');
        assert($rows[0]['referer'] === 'https://example.org/post');
        assert((int) $rows[1]['is_guest'] === 1);
        assert($rows[2]['referer'] === '');
        assert((int) $rows[2]['is_guest'] === 0);
    });

    check('summary aggregates PV, UV, paths and IPs', function (): void {
        $data = Traffic::summary(14);
        assert($data['totals']['pv'] >= 3);
        assert($data['totals']['uv'] >= 1);
        assert($data['todayPv'] >= 3);
        assert(count($data['series']) === 14);
        assert($data['counts']['events'] >= 3);
        assert($data['topPaths'] !== []);
        assert($data['topIps'] !== []);
        assert($data['topIps'][0]['ua'] !== '');
        $stmt = Db::pdo()->prepare('SELECT COUNT(*) FROM visitor_events WHERE ip = ? AND path = ?');
        $stmt->execute([$GLOBALS['testIp'], '/daily']);
        assert((int) $stmt->fetchColumn() >= 1);
        $stmt = Db::pdo()->prepare('SELECT COUNT(*) FROM visitor_events WHERE ip = ?');
        $stmt->execute([$GLOBALS['testIp']]);
        assert((int) $stmt->fetchColumn() >= 3);
        assert($data['recent'] !== []);
        assert($data['retentionDays'] === 90);
    });

    check('empty or invalid paths are ignored', function (): void {
        $before = (int) Db::pdo()->query("SELECT COUNT(*) FROM visitor_events WHERE ip = '{$GLOBALS['testIp']}'")->fetchColumn();
        Traffic::record(null, ['path' => '']);
        Traffic::record(null, ['path' => '   ']);
        $after = (int) Db::pdo()->query("SELECT COUNT(*) FROM visitor_events WHERE ip = '{$GLOBALS['testIp']}'")->fetchColumn();
        assert($before === $after);
    });

    check('retention cleanup removes old events only', function () use ($testIp): void {
        Db::pdo()->prepare("INSERT INTO visitor_events (day, path, ip, ip_hash, ua, created_at) VALUES (DATE_SUB(CURDATE(), INTERVAL 100 DAY), '/old', ?, ?, '', DATE_SUB(NOW(), INTERVAL 100 DAY))")
            ->execute([$testIp, hash('sha256', 'old-' . $testIp)]);
        $removed = Traffic::cleanVisits(90);
        assert($removed >= 1);
        $stmt = Db::pdo()->prepare("SELECT COUNT(*) FROM visitor_events WHERE path = '/old' AND ip = ?");
        $stmt->execute([$testIp]);
        assert((int) $stmt->fetchColumn() === 0);
    });

    check('idle guest cleanup keeps active guests', function (): void {
        $idle = makeUser(true);
        Db::pdo()->prepare('UPDATE users SET last_seen_at = DATE_SUB(NOW(), INTERVAL 30 DAY) WHERE id = ?')->execute([$idle]);
        $active = makeUser(true);
        $removed = Traffic::cleanGuests(7);
        assert($removed >= 1);
        $stmt = Db::pdo()->prepare('SELECT COUNT(*) FROM users WHERE id = ?');
        $stmt->execute([$idle]);
        assert((int) $stmt->fetchColumn() === 0);
        $stmt->execute([$active]);
        assert((int) $stmt->fetchColumn() === 1);
    });
} finally {
    if ($userIds !== []) {
        $in = implode(',', array_fill(0, count($userIds), '?'));
        Db::pdo()->prepare("DELETE FROM users WHERE id IN ({$in})")->execute($userIds);
    }
    Db::pdo()->prepare('DELETE FROM visitor_events WHERE ip = ?')->execute([$GLOBALS['testIp']]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
