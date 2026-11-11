<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\ApiError;
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
    }
}
function pauseFor(float $seconds): void {
    usleep((int) ($seconds * 1000000));
}

try {
    check('start VF arrest returns monitor state', function () use ($userId) {
        $view = SimEngine::start($userId, 'vf-arrest');
        assert($view['sessionId'] !== '');
        assert($view['scenario']['id'] === 'vf-arrest');
        assert($view['monitor']['rhythm'] === 'vf');
        assert($view['vitals']['pulse'] === false);
        $GLOBALS['vfSession'] = $view['sessionId'];
        $GLOBALS['vfSeed'] = $view['monitor']['seed'];
    });

    check('IV access takes time and blocks drugs while pending', function () use ($userId) {
        $id = $GLOBALS['vfSession'];
        SimEngine::action($userId, $id, 'iv', []);
        $view = SimEngine::state($userId, $id);
        assert($view['flags']['iv'] === false);
        assert($view['flags']['ivPending'] === true);
        $blocked = false;
        try { SimEngine::action($userId, $id, 'epi', []); } catch (ApiError $e) { $blocked = $e->errorCode === 'iv_pending'; }
        assert($blocked, 'drugs should be blocked during IV setup');
        pauseFor(6.5);
        $view = SimEngine::state($userId, $id);
        assert($view['flags']['iv'] === true, 'IV should become ready after ~6s');
        assert($view['monitor']['seed'] === $GLOBALS['vfSeed'], 'VF waveform seed must stay stable in a session to avoid jumps');
        $GLOBALS['vfReady'] = true;
    });

    check('shock requires CPR to be stopped; post-shock monitor changes', function () use ($userId) {
        $id = $GLOBALS['vfSession'];
        SimEngine::action($userId, $id, 'cpr_start', []);
        pauseFor(5.2);
        $blocked = false;
        try { SimEngine::action($userId, $id, 'shock', ['energy' => 200, 'sync' => false]); }
        catch (ApiError $e) { $blocked = $e->errorCode === 'stop_cpr_first'; }
        assert($blocked, 'shock should require stopping CPR');
        $view = SimEngine::state($userId, $id);
        assert($view['vitals']['hrSource'] === 'cpr', 'CPR should expose compression-rate artifact');
        assert($view['vitals']['hr'] >= 92 && $view['vitals']['hr'] <= 122, 'CPR rate should fluctuate in a physiologic range');
        assert($view['vitals']['pulse'] === false, 'compression artifact must not imply a pulse');
        $view = SimEngine::action($userId, $id, 'cpr_stop', []);
        assert($view['cpr'] === false);
        $notCharged = false;
        try { SimEngine::action($userId, $id, 'shock', ['energy' => 200, 'sync' => false]); }
        catch (ApiError $e) { $notCharged = $e->errorCode === 'not_charged'; }
        assert($notCharged, 'shock should require charging first');
        SimEngine::action($userId, $id, 'charge', ['energy' => 200, 'sync' => false]);
        $view = SimEngine::state($userId, $id);
        assert($view['flags']['chargeInProgress'] === true, 'charge should take time');
        pauseFor(3.3);
        $view = SimEngine::state($userId, $id);
        assert($view['flags']['chargeReady'] === true, 'charge should be ready after ~3s');
        $view = SimEngine::action($userId, $id, 'shock', ['energy' => 200, 'sync' => false]);
        assert($view['rhythm'] === 'post_shock', 'post-shock rhythm should be shown');
        assert($view['monitor']['rhythm'] === 'asystole', 'post-shock monitor should show transient pause');
        assert($view['cpr'] === false);
        pauseFor(3);
        $view = SimEngine::state($userId, $id);
        assert(in_array($view['status'], ['active', 'ended'], true));
        if ($view['status'] === 'active') SimEngine::action($userId, $id, 'finish', []);
        $GLOBALS['vfRunId'] = (int) ($view['runId'] ?? 0);
    });

    check('debrief returns review and events', function () use ($userId) {
        $id = $GLOBALS['vfSession'];
        $runId = (int) ($GLOBALS['vfRunId'] ?? 0);
        if ($runId <= 0) {
            $view = SimEngine::action($userId, $id, 'finish', []);
            $runId = (int) ($view['runId'] ?? 0);
        }
        assert($runId > 0);
        $debrief = SimEngine::debrief($userId, $runId);
        assert($debrief['run']['score'] >= 0 && $debrief['run']['score'] <= 100);
        assert(count($debrief['events']) > 0);
    });

    check('bradycardia: IV delay, atropine and pacing', function () use ($userId) {
        $view = SimEngine::start($userId, 'symptomatic-brady');
        $id = $view['sessionId'];
        SimEngine::action($userId, $id, 'iv', []);
        $blocked = false;
        try { SimEngine::action($userId, $id, 'atropine', []); } catch (ApiError $e) { $blocked = $e->errorCode === 'iv_pending'; }
        assert($blocked);
        pauseFor(6.5);
        $view = SimEngine::state($userId, $id);
        assert($view['flags']['iv'] === true);
        SimEngine::action($userId, $id, 'atropine', []);
        $view = SimEngine::action($userId, $id, 'pacing', []);
        assert($view['flags']['pacing'] === true);
        assert($view['monitor']['rhythm'] === 'paced', 'paced monitor should show capture spikes');
        assert($view['phaseLabel'] === '已稳定');
        assert($view['vitals']['hr'] >= 60);
        if ($view['status'] === 'active') SimEngine::action($userId, $id, 'finish', []);
    });

    check('hyperkalemia: IV, CPR, epinephrine and calcium', function () use ($userId) {
        $view = SimEngine::start($userId, 'hyperkalemia-asystole');
        $id = $view['sessionId'];
        SimEngine::action($userId, $id, 'iv', []);
        pauseFor(6.5);
        SimEngine::state($userId, $id);
        SimEngine::action($userId, $id, 'cpr_start', []);
        SimEngine::action($userId, $id, 'epi', []);
        $view = SimEngine::action($userId, $id, 'calcium', []);
        assert($view['metrics']['calcium'] >= 1);
        SimEngine::action($userId, $id, 'finish', []);
    });


    check('long inactivity changes bradycardia vitals and phase', function () use ($userId) {
        $view = SimEngine::start($userId, 'symptomatic-brady');
        $id = $view['sessionId'];
        $initialHr = $view['vitals']['hr'];
        $initialBp = $view['vitals']['bpSys'];
        $initialMonitorSeed = $view['monitor']['seed'];
        assert($initialHr === 32);
        assert($view['phaseLabel'] === '就诊评估');
        pauseFor(8.2);
        $view = SimEngine::state($userId, $id);
        assert($view['vitals']['hr'] < $initialHr, 'HR should drift down while untreated');
        assert($view['vitals']['bpSys'] < $initialBp, 'BP should drift down while untreated');
        assert($view['monitor']['rate'] === $view['vitals']['hr'], 'monitor rate should follow live HR');
        assert($view['monitor']['seed'] === $initialMonitorSeed, 'non-VF monitor waveform must stay stable while vitals change');
        assert($view['phase'] !== 'arrival');
        SimEngine::action($userId, $id, 'finish', []);
    });

    check('timeout/death caps the score and grade', function () use ($userId) {
        global $pdo;
        $view = SimEngine::start($userId, 'vf-arrest');
        $id = $view['sessionId'];
        $stmt = $pdo->prepare('SELECT state FROM sim_sessions WHERE id = ?');
        $stmt->execute([$id]);
        $state = json_decode((string) $stmt->fetchColumn(), true);
        $old = microtime(true) - 400;
        $state['startedAt'] = $old;
        $state['lastPhysiologyAt'] = $old;
        $pdo->prepare('UPDATE sim_sessions SET state = ?, started_at = FROM_UNIXTIME(?) WHERE id = ?')
            ->execute([json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $old, $id]);
        $view = SimEngine::state($userId, $id);
        assert($view['status'] === 'ended', 'timeout should end the session');
        assert($view['outcome'] === 'timeout');
        assert($view['score'] === 0, 'death/timeout must score zero');
        assert($view['grade'] === 'D');
        $debrief = SimEngine::debrief($userId, (int) $view['runId']);
        assert($debrief['run']['score'] === 0);
        assert($debrief['run']['grade'] === 'D');
    });

    check('charging locks configuration until disarm, and ventilation is visible', function () use ($userId) {
        $view = SimEngine::start($userId, 'vf-arrest');
        $id = $view['sessionId'];
        SimEngine::action($userId, $id, 'charge', ['energy' => 200, 'sync' => false]);
        pauseFor(3.2);
        $view = SimEngine::state($userId, $id);
        assert($view['flags']['chargeReady'] === true);
        $view = SimEngine::action($userId, $id, 'disarm', []);
        assert($view['flags']['chargeReady'] === false, 'disarm should clear charge and unlock configuration');
        SimEngine::action($userId, $id, 'charge', ['energy' => 150, 'sync' => false]);
        $view = SimEngine::state($userId, $id);
        assert($view['flags']['chargeInProgress'] === true);
        $view = SimEngine::action($userId, $id, 'oxygen', []);
        assert($view['flags']['ventilations'] === 1, 'bag-mask ventilation must register');
        assert((bool) array_filter($view['events'], static fn (array $e): bool => str_contains($e['label'], '胸廓起伏')));
        SimEngine::action($userId, $id, 'finish', []);
    });

    check('a short pause for shock is not flagged as prolonged no-CPR', function () use ($userId) {
        $view = SimEngine::start($userId, 'vf-arrest');
        $id = $view['sessionId'];
        SimEngine::action($userId, $id, 'cpr_start', []);
        SimEngine::action($userId, $id, 'cpr_stop', []);
        $view = SimEngine::state($userId, $id);
        $labels = implode(' | ', array_column($view['events'], 'label'));
        assert(!str_contains($labels, '超过 30 秒未进行有效胸外按压'), 'short pause must not trigger false no-CPR event');
        assert(!str_contains($labels, '长时间未进行胸外按压'), 'short pause must not trigger no-CPR penalty');
        SimEngine::action($userId, $id, 'finish', []);
    });

    check('prolonged pulseless arrest without CPR ends in death with SpO2 0', function () use ($userId) {
        global $pdo;
        $view = SimEngine::start($userId, 'vf-arrest');
        $id = $view['sessionId'];
        $stmt = $pdo->prepare('SELECT state FROM sim_sessions WHERE id = ?');
        $stmt->execute([$id]);
        $state = json_decode((string) $stmt->fetchColumn(), true);
        $old = microtime(true) - 100;
        $state['startedAt'] = $old;
        $state['lastPhysiologyAt'] = $old;
        $pdo->prepare('UPDATE sim_sessions SET state = ?, started_at = FROM_UNIXTIME(?) WHERE id = ?')
            ->execute([json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $old, $id]);
        $view = SimEngine::state($userId, $id);
        assert($view['status'] === 'ended');
        assert($view['outcome'] === 'timeout');
        assert($view['rhythm'] === 'asystole');
        assert($view['vitals']['spo2'] === 0);
        assert($view['score'] === 0);
    });

    check('shock on bradycardia is rejected with penalty event', function () use ($userId) {
        $view = SimEngine::start($userId, 'symptomatic-brady');
        $id = $view['sessionId'];
        $view = SimEngine::action($userId, $id, 'shock', ['energy' => 200, 'sync' => false]);
        $labels = array_column($view['events'], 'label');
        assert((bool) array_filter($labels, static fn (string $l): bool => str_contains($l, '电击')));
        SimEngine::action($userId, $id, 'finish', []);
    });
    check('CPR and IV setup are time-bound; shock interrupts IV setup', function () use ($userId): void {
        $view = SimEngine::start($userId, 'vf-arrest');
        $id = $view['sessionId'];
        SimEngine::action($userId, $id, 'cpr_start', []);
        $view = SimEngine::state($userId, $id);
        assert($view['cpr'] === false);
        assert($view['flags']['cprPending'] === true);
        assert($view['flags']['cprReadyIn'] >= 3 && $view['flags']['cprReadyIn'] <= 5);
        $blocked = false;
        try { SimEngine::action($userId, $id, 'shock', ['energy' => 200, 'sync' => false]); }
        catch (ApiError $e) { $blocked = $e->errorCode === 'cpr_pending'; }
        assert($blocked, 'shock must wait until CPR setup completes');
        pauseFor(5.2);
        $view = SimEngine::state($userId, $id);
        assert($view['cpr'] === true, 'CPR should become active after 3-5 seconds');
        SimEngine::action($userId, $id, 'iv', []);
        $view = SimEngine::state($userId, $id);
        assert($view['flags']['ivPending'] === true);
        assert($view['flags']['ivReadyIn'] >= 10, 'IV setup should be slower during CPR');
        SimEngine::action($userId, $id, 'cpr_stop', []);
        SimEngine::action($userId, $id, 'charge', ['energy' => 200, 'sync' => false]);
        pauseFor(3.3);
        $view = SimEngine::action($userId, $id, 'shock', ['energy' => 200, 'sync' => false]);
        assert($view['flags']['ivPending'] === false, 'shock during IV setup must reset the pending line');
        assert((bool) array_filter($view['events'], static fn (array $e): bool => str_contains((string) $e['label'], '中断了 IV/IO')));
        SimEngine::action($userId, $id, 'finish', []);
    });

    check('CPR preparation can be cancelled before compressions start', function () use ($userId): void {
        $view = SimEngine::start($userId, 'vf-arrest');
        $id = $view['sessionId'];
        SimEngine::action($userId, $id, 'cpr_start', []);
        $view = SimEngine::state($userId, $id);
        assert($view['flags']['cprPending'] === true);
        $view = SimEngine::action($userId, $id, 'cpr_stop', []);
        assert($view['cpr'] === false);
        assert($view['flags']['cprPending'] === false);
        assert((bool) array_filter($view['events'], static fn (array $e): bool => str_contains((string) $e['label'], '取消胸外按压准备')));
        SimEngine::action($userId, $id, 'finish', []);
    });

    check('checking rhythm stops CPR and wrong mode is penalized only after shock', function () use ($userId): void {
        $view = SimEngine::start($userId, 'vf-arrest');
        $id = $view['sessionId'];
        SimEngine::action($userId, $id, 'cpr_start', []);
        pauseFor(5.2);
        $view = SimEngine::action($userId, $id, 'check_rhythm', []);
        assert($view['cpr'] === false, 'checking rhythm must actually stop compressions');
        assert((bool) array_filter($view['events'], static fn (array $e): bool => str_contains((string) $e['label'], '已暂停按压')));
        SimEngine::action($userId, $id, 'finish', []);

        $view = SimEngine::start($userId, 'vf-arrest');
        $id = $view['sessionId'];
        SimEngine::action($userId, $id, 'charge', ['energy' => 200, 'sync' => true]);
        pauseFor(3.3);
        $view = SimEngine::action($userId, $id, 'shock', ['energy' => 200, 'sync' => true]);
        assert($view['rhythm'] === 'vf', 'wrong mode must not deliver a shock');
        assert((bool) array_filter($view['events'], static fn (array $e): bool => str_contains((string) $e['label'], '使用同步模式')));
        SimEngine::action($userId, $id, 'finish', []);
    });

    check('VF monitor seed differs between sessions and stays stable in-session', function () use ($userId): void {
        $first = SimEngine::start($userId, 'vf-arrest');
        $second = SimEngine::start($userId, 'vf-arrest');
        assert($first['monitor']['seed'] !== $second['monitor']['seed'], 'fresh VF sessions must not replay the same waveform');
        $id = $first['sessionId'];
        $seed = $first['monitor']['seed'];
        pauseFor(1.2);
        $view = SimEngine::state($userId, $id);
        assert($view['monitor']['seed'] === $seed, 'VF waveform seed should stay fixed while the session runs');
        assert($view['monitor']['vfAmplitude'] >= 0.35 && $view['monitor']['vfAmplitude'] <= 1.4);
        SimEngine::action($userId, $id, 'finish', []);
        SimEngine::action($userId, (string) $second['sessionId'], 'finish', []);
    });

    check('new reversible-cause scenarios expose and accept special action', function () use ($userId) {
        foreach (['pea-hypovolemia', 'hypothermia-vf', 'last-arrest', 'pregnancy-arrest', 'refractory-vf', 'stemi-vf'] as $scenarioId) {
            $view = SimEngine::start($userId, $scenarioId);
            $id = $view['sessionId'];
            $special = false;
            foreach ($view['actions'] as $group) {
                foreach ($group['actions'] as $action) {
                    if (($action['id'] ?? '') === 'special') $special = true;
                }
            }
            assert($special, $scenarioId . ' should expose special action');
            $view = SimEngine::action($userId, $id, 'special', []);
            assert((bool) array_filter($view['events'], static fn (array $e): bool => str_contains((string) $e['label'], '补液') || str_contains((string) $e['label'], '复温') || str_contains((string) $e['label'], '脂肪乳') || str_contains((string) $e['label'], '剖宫产') || str_contains((string) $e['label'], 'ECPR') || str_contains((string) $e['label'], '再灌注')));
            SimEngine::action($userId, $id, 'finish', []);
        }
    });

    check('PEA hypovolemia reaches ROSC after CPR, epinephrine, fluids and time', function () use ($userId, $pdo) {
        $view = SimEngine::start($userId, 'pea-hypovolemia');
        $id = $view['sessionId'];
        SimEngine::action($userId, $id, 'iv', []);
        pauseFor(6.5);
        SimEngine::action($userId, $id, 'cpr_start', []);
        pauseFor(5.2);
        SimEngine::action($userId, $id, 'epi', []);
        SimEngine::action($userId, $id, 'special', []);
        $stmt = $pdo->prepare('SELECT state FROM sim_sessions WHERE id = ?');
        $stmt->execute([$id]);
        $state = json_decode((string) $stmt->fetchColumn(), true);
        $state['specialAt'] = microtime(true) - 13;
        $pdo->prepare('UPDATE sim_sessions SET state = ? WHERE id = ?')->execute([json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $id]);
        $view = SimEngine::state($userId, $id);
        assert($view['status'] === 'ended');
        assert($view['outcome'] === 'rosc');
    });

} finally {
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
