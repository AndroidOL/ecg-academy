<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Auth;
use App\Config;

$passed = 0;
$failed = 0;
function check(string $name, callable $fn): void {
    global $passed, $failed;
    try {
        $fn();
        $passed++;
        echo "  ok  {$name}\n";
    } catch (Throwable $e) {
        $failed++;
        echo "  FAIL {$name}: " . $e->getMessage() . "\n";
    }
}

try {
    $expired = new ReflectionMethod(Auth::class, 'sessionExpired');
    $expired->setAccessible(true);
    $now = 1_800_000_000;

    check('session policy is seven days idle and fifteen days absolute', function (): void {
        assert((int) Config::get('session.lifetime') === 604800);
        assert((int) Config::get('session.idle_ttl') === 604800);
        assert((int) Config::get('session.max_ttl') === 1296000);
        assert((int) Config::get('session.renew_interval') === 3600);
    });

    check('recent activity stays signed in', function () use ($expired, $now): void {
        assert($expired->invoke(null, $now - 10 * 86400, $now - 3600, $now) === false);
        assert($expired->invoke(null, $now - 6 * 86400, $now - 6 * 86400, $now) === false);
    });

    check('seven days without activity expires the session', function () use ($expired, $now): void {
        assert($expired->invoke(null, $now - 10 * 86400, $now - 604800, $now) === true);
        assert($expired->invoke(null, $now - 10 * 86400, $now - 604801, $now) === true);
    });

    check('fifteen days from login is a hard cap even with activity', function () use ($expired, $now): void {
        assert($expired->invoke(null, $now - 1296000, $now - 60, $now) === true);
        assert($expired->invoke(null, $now - 1295999, $now - 60, $now) === false);
    });
} finally {
    //
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
