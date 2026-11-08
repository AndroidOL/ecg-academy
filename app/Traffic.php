<?php
declare(strict_types=1);

namespace App;

final class Traffic
{
    public static function record(?array $user, array $input): void
    {
        $path = self::normalizePath((string) ($input['path'] ?? ''));
        if ($path === '') return;
        $ip = Http::clientIp();
        if (in_array($ip, ['127.0.0.1', '::1'], true)) return;
        $ua = mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255, 'UTF-8');
        $referer = mb_substr(trim((string) ($input['referer'] ?? '')), 0, 255, 'UTF-8');
        if ($referer !== '' && !preg_match('#^https?://#i', $referer)) $referer = '';
        $isGuest = !$user || (int) ($user['is_guest'] ?? 1) === 1;
        Db::pdo()->prepare(
            'INSERT INTO visitor_events (day, path, ip, ip_hash, ua, referer, user_id, is_guest)
             VALUES (CURDATE(), ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $path,
            $ip,
            hash('sha256', $ip),
            $ua,
            $referer,
            $user ? (int) $user['id'] : null,
            $isGuest ? 1 : 0,
        ]);
        if (random_int(1, 200) === 1) self::cleanVisits(90);
    }

    public static function summary(int $days = 14): array
    {
        $days = max(1, min(90, $days));
        $start = date('Y-m-d', strtotime('-' . ($days - 1) . ' days'));
        $today = date('Y-m-d');
        $pdo = Db::pdo();

        $total = $pdo->prepare('SELECT COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv FROM visitor_events WHERE day >= ?');
        $total->execute([$start]);
        $totals = $total->fetch() ?: ['pv' => 0, 'uv' => 0];

        $todayStmt = $pdo->prepare('SELECT COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv FROM visitor_events WHERE day = ?');
        $todayStmt->execute([$today]);
        $todayRow = $todayStmt->fetch() ?: ['pv' => 0, 'uv' => 0];

        $seriesStmt = $pdo->prepare('SELECT day, COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv FROM visitor_events WHERE day >= ? GROUP BY day ORDER BY day ASC');
        $seriesStmt->execute([$start]);
        $byDay = [];
        foreach ($seriesStmt->fetchAll() as $row) $byDay[(string) $row['day']] = $row;
        $series = [];
        for ($i = 0; $i < $days; $i++) {
            $day = date('Y-m-d', strtotime('-' . ($days - 1 - $i) . ' days'));
            $series[] = [
                'day' => $day,
                'pv' => (int) ($byDay[$day]['pv'] ?? 0),
                'uv' => (int) ($byDay[$day]['uv'] ?? 0),
            ];
        }

        $pathsStmt = $pdo->prepare('SELECT path, COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv FROM visitor_events WHERE day >= ? GROUP BY path ORDER BY pv DESC LIMIT 12');
        $pathsStmt->execute([$start]);
        $paths = array_map(static fn (array $row): array => [
            'path' => (string) $row['path'],
            'pv' => (int) $row['pv'],
            'uv' => (int) $row['uv'],
        ], $pathsStmt->fetchAll());

        $ipsStmt = $pdo->prepare('SELECT ip, COUNT(*) AS pv, COUNT(DISTINCT day) AS activeDays, MAX(created_at) AS lastSeen, MAX(ua) AS ua FROM visitor_events WHERE day >= ? GROUP BY ip, ip_hash ORDER BY pv DESC LIMIT 12');
        $ipsStmt->execute([$start]);
        $ips = array_map(static fn (array $row): array => [
            'ip' => (string) $row['ip'],
            'pv' => (int) $row['pv'],
            'activeDays' => (int) $row['activeDays'],
            'lastSeen' => (string) $row['lastSeen'],
            'ua' => (string) $row['ua'],
        ], $ipsStmt->fetchAll());

        $refsStmt = $pdo->prepare("SELECT referer, COUNT(*) AS pv FROM visitor_events WHERE day >= ? AND referer <> '' GROUP BY referer ORDER BY pv DESC LIMIT 8");
        $refsStmt->execute([$start]);
        $referers = array_map(static fn (array $row): array => [
            'referer' => (string) $row['referer'],
            'pv' => (int) $row['pv'],
        ], $refsStmt->fetchAll());

        $recentStmt = $pdo->prepare('SELECT path, ip, ua, referer, is_guest, created_at FROM visitor_events ORDER BY id DESC LIMIT 30');
        $recentStmt->execute();
        $recent = array_map(static fn (array $row): array => [
            'path' => (string) $row['path'],
            'ip' => (string) $row['ip'],
            'ua' => (string) $row['ua'],
            'referer' => (string) $row['referer'],
            'isGuest' => (int) $row['is_guest'] === 1,
            'createdAt' => (string) $row['created_at'],
        ], $recentStmt->fetchAll());

        $guests = (int) $pdo->query('SELECT COUNT(*) FROM users WHERE is_guest = 1')->fetchColumn();
        $registered = (int) $pdo->query('SELECT COUNT(*) FROM users WHERE is_guest = 0')->fetchColumn();
        $newGuests = (int) $pdo->query('SELECT COUNT(*) FROM users WHERE is_guest = 1 AND created_at >= CURDATE()')->fetchColumn();
        $newEvents = (int) $pdo->query('SELECT COUNT(*) FROM visitor_events')->fetchColumn();

        return [
            'days' => $days,
            'start' => $start,
            'today' => $today,
            'totals' => ['pv' => (int) $totals['pv'], 'uv' => (int) $totals['uv']],
            'todayPv' => (int) $todayRow['pv'],
            'todayUv' => (int) $todayRow['uv'],
            'series' => $series,
            'topPaths' => $paths,
            'topIps' => $ips,
            'referers' => $referers,
            'recent' => $recent,
            'counts' => [
                'guests' => $guests,
                'registered' => $registered,
                'newGuestsToday' => $newGuests,
                'events' => $newEvents,
            ],
            'retentionDays' => 90,
        ];
    }

    public static function cleanGuests(int $days): int
    {
        $days = max(0, min(365, $days));
        $pdo = Db::pdo();
        if ($days === 0) {
            return (int) $pdo->exec('DELETE FROM users WHERE is_guest = 1');
        }
        $stmt = $pdo->prepare('DELETE FROM users WHERE is_guest = 1 AND last_seen_at < NOW() - INTERVAL ? DAY');
        $stmt->execute([$days]);
        return $stmt->rowCount();
    }

    public static function cleanVisits(int $retentionDays = 90): int
    {
        $retentionDays = max(1, min(365, $retentionDays));
        $stmt = Db::pdo()->prepare('DELETE FROM visitor_events WHERE created_at < NOW() - INTERVAL ? DAY');
        $stmt->execute([$retentionDays]);
        return $stmt->rowCount();
    }

    private static function normalizePath(string $path): string
    {
        $path = trim($path);
        if ($path === '' || mb_strlen($path, 'UTF-8') > 200) return '';
        if (!str_starts_with($path, '/')) $path = '/' . $path;
        $path = preg_split('/[?#]/', $path)[0] ?: '/';
        $parts = array_values(array_filter(explode('/', trim($path, '/')), static fn (string $part): bool => $part !== ''));
        if ($parts !== [] && in_array($parts[0], ['learn', 'sim'], true) && count($parts) >= 2) {
            $parts[1] = '*';
        }
        $path = '/' . implode('/', array_slice($parts, 0, 4));
        return mb_substr($path === '/' ? '/' : rtrim($path, '/'), 0, 160, 'UTF-8');
    }
}
