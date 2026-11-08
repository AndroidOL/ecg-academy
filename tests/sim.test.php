<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Db;
use App\SimEngine;

$pdo = Db::pdo();
$publicId = bin2hex(random_bytes(8));
$stmt = $pdo->prepare('INSERT INTO users (public_id, display_name, is_guest) VALUES (?, ?, 1)');
$stmt->execute([$publicId, 'sim-test']);
$userId = (int) $pdo->lastInsertId();

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
        echo "FAIL  {$name}: " . $e->getMessage() . "\n";
        echo $e->getTraceAsString() . "\n";
    }
}

try {
    check('start VF arrest returns monitor state', function () use ($userId) {
        $view = SimEngine::start($userId, 'vf-arrest');
        assert($view['sessionId'] !== '');
        assert($view['scenario']['id'] === 'vf-arrest');
        assert($view['monitor']['rhythm'] === 'vf');
        assert($view['vitals']['pulse'] === false);
        $GLOBALS['vfSession'] = $view['sessionId'];
    });

    check('IV, CPR, shock flow works', function () use ($userId) {
        $id = $GLOBALS['vfSession'];
        SimEngine::action($userId, $id, 'iv', []);
        SimEngine::action($userId, $id, 'cpr_start', []);
        $view = SimEngine::action($userId, $id, 'shock', ['energy' => 200, 'sync' => false]);
        assert(in_array($view['status'], ['active', 'ended'], true));
        if ($view['status'] === 'active') {
            SimEngine::action($userId, $id, 'cpr_start', []);
            $view = SimEngine::action($userId, $id, 'epi', []);
            assert($view['metrics']['epi'] >= 1);
            SimEngine::action($userId, $id, 'amio', []);
            $view = SimEngine::action($userId, $id, 'finish', []);
        }
        assert(isset($view['runId']) && (int) $view['runId'] > 0, 'runId missing');
        $GLOBALS['vfRunId'] = (int) $view['runId'];
    });

    check('debrief returns review and events', function () use ($userId) {
        $debrief = SimEngine::debrief($userId, (int) $GLOBALS['vfRunId']);
        assert($debrief['run']['score'] >= 0 && $debrief['run']['score'] <= 100);
        assert(is_array($debrief['review']));
        assert(count($debrief['events']) > 0);
    });

    check('bradycardia: atropine and pacing flow', function () use ($userId) {
        $view = SimEngine::start($userId, 'symptomatic-brady');
        $id = $view['sessionId'];
        SimEngine::action($userId, $id, 'iv', []);
        SimEngine::action($userId, $id, 'atropine', []);
        SimEngine::action($userId, $id, 'atropine', []);
        $view = SimEngine::action($userId, $id, 'pacing', []);
        assert($view['flags']['pacing'] === true);
        assert($view['status'] === 'ended' || $view['status'] === 'active');
        if ($view['status'] === 'active') {
            SimEngine::action($userId, $id, 'finish', []);
        }
    });

    check('hyperkalemia: calcium + CPR + epi does not error', function () use ($userId) {
        $view = SimEngine::start($userId, 'hyperkalemia-asystole');
        $id = $view['sessionId'];
        SimEngine::action($userId, $id, 'iv', []);
        SimEngine::action($userId, $id, 'cpr_start', []);
        SimEngine::action($userId, $id, 'epi', []);
        $view = SimEngine::action($userId, $id, 'calcium', []);
        assert($view['metrics']['calcium'] >= 1);
        SimEngine::action($userId, $id, 'finish', []);
    });

    check('shock on bradycardia is rejected with penalty event', function () use ($userId) {
        $view = SimEngine::start($userId, 'symptomatic-brady');
        $id = $view['sessionId'];
        $view = SimEngine::action($userId, $id, 'shock', ['energy' => 200, 'sync' => false]);
        $labels = array_column($view['events'], 'label');
        assert((bool) array_filter($labels, static fn (string $l): bool => str_contains($l, '电击禁忌') || str_contains($l, '电击')));
        SimEngine::action($userId, $id, 'finish', []);
    });
} finally {
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
