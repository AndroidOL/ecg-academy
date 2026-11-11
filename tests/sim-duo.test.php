<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\ApiError;
use App\Db;
use App\SimEngine;

$pdo = Db::pdo();
$publicId = bin2hex(random_bytes(8));
$stmt = $pdo->prepare('INSERT INTO users (public_id, display_name, is_guest) VALUES (?, ?, 1)');
$stmt->execute([$publicId, 'sim-duo-test']);
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

try {
    check('starts two hidden critical patients with diagnosis options', function () use ($userId) {
        $view = SimEngine::startDuo($userId);
        assert($view['mode'] === 'duo');
        assert($view['status'] === 'active');
        assert(count($view['patients']) === 2);
        assert($view['patients'][0]['code'] === 'A');
        assert($view['patients'][1]['code'] === 'B');
        assert($view['windowTotal'] === 30);
        assert($view['patients'][0]['diagnosis']['deadlineLeft'] >= 14 && $view['patients'][0]['diagnosis']['deadlineLeft'] <= 15);
        assert($view['patients'][1]['diagnosis']['deadlineLeft'] >= 29 && $view['patients'][1]['diagnosis']['deadlineLeft'] <= 30);
        foreach ($view['patients'] as $patient) {
            assert(!isset($patient['scenario']), 'scenario name must stay hidden');
            assert(!isset($patient['case']['diagnosis']), 'correct diagnosis must stay hidden');
            assert(count($patient['diagnosis']['options']) === 4, 'four diagnosis options expected');
            assert($patient['diagnosis']['label'] === null, 'diagnosis label must stay hidden while active');
            assert(is_array($patient['monitor']), 'ECG monitor expected');
            assert(is_array($patient['case']['exam']), 'bedside exam expected');
            $ids = array_column(array_merge(...array_map(static fn (array $g): array => $g['actions'], $patient['actions'])), 'id');
            foreach (['cpr_start', 'iv', 'shock', 'epi', 'calcium'] as $needed) {
                assert(in_array($needed, $ids, true), $needed . ' should be available');
            }
        }
        $GLOBALS['duoSession'] = $view['sessionId'];
        $GLOBALS['duoView'] = $view;
    });

    check('only one non-CPR procedure at a time, CPR is the exception', function () use ($userId) {
        $id = $GLOBALS['duoSession'];
        $view = SimEngine::duoAction($userId, $id, 0, 'iv', []);
        assert($view['lock']['active'] === true);
        assert($view['lock']['patient'] === 0);
        $blocked = false;
        try {
            SimEngine::duoAction($userId, $id, 1, 'iv', []);
        } catch (ApiError $e) {
            $blocked = $e->errorCode === 'procedure_busy';
            assert(str_contains($e->getMessage(), 'CPR'));
        }
        assert($blocked, 'second patient IV must be blocked while patient A IV is running');
        $sameBlocked = false;
        try {
            SimEngine::duoAction($userId, $id, 0, 'oxygen', []);
        } catch (ApiError $e) {
            $sameBlocked = $e->errorCode === 'procedure_busy';
        }
        assert($sameBlocked, 'a second non-CPR action on the same patient must also wait');
        $view = SimEngine::duoAction($userId, $id, 1, 'cpr_start', []);
        assert($view['patients'][1]['flags']['cprPending'] === true, 'CPR must be allowed on the other patient');
        assert($view['lock']['active'] === true, 'CPR must not clear the lock');
        assert($view['lock']['patient'] === 0, 'lock must stay on patient A');
    });

    check('diagnosis submission is accepted and hidden answer is scored at debrief', function () use ($userId, $pdo) {
        $id = $GLOBALS['duoSession'];
        $stmt = $pdo->prepare('SELECT state FROM sim_sessions WHERE id = ?');
        $stmt->execute([$id]);
        $state = json_decode((string) $stmt->fetchColumn(), true);
        $correct = (string) $state['patients'][0]['diagnosis'];
        $options = $state['patients'][0]['diagnosisOptions'];
        assert(in_array($correct, $options, true));
        $view = SimEngine::duoDiagnosis($userId, $id, 0, $correct);
        assert($view['patients'][0]['diagnosis']['submitted'] === true);
        assert($view['patients'][0]['diagnosis']['selected'] === $correct);
        assert($view['patients'][0]['diagnosis']['label'] === null, 'correct answer must not be revealed while active');
        $again = false;
        try { SimEngine::duoDiagnosis($userId, $id, 0, $correct); }
        catch (ApiError $e) { $again = $e->errorCode === 'diagnosis_done'; }
        assert($again, 'diagnosis must only be submitted once');
    });

    check('duo charging is instant and can run during another procedure', function () use ($userId, $pdo) {
        $view = SimEngine::startDuo($userId);
        $id = $view['sessionId'];
        $stmt = $pdo->prepare('SELECT state FROM sim_sessions WHERE id = ?');
        $stmt->execute([$id]);
        $state = json_decode((string) $stmt->fetchColumn(), true);
        foreach ([0, 1] as $index) {
            $state['patients'][$index]['scenarioId'] = 'vf-arrest';
            $state['patients'][$index]['state']['rhythm'] = 'vf';
            $state['patients'][$index]['state']['pulse'] = false;
            $state['patients'][$index]['state']['responsive'] = false;
        }
        $pdo->prepare('UPDATE sim_sessions SET state = ? WHERE id = ?')
            ->execute([json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $id]);
        $view = SimEngine::duoAction($userId, $id, 0, 'charge', ['energy' => 200, 'sync' => false]);
        assert($view['patients'][0]['flags']['chargeReady'] === true, 'duo charging must be immediate');
        assert($view['patients'][0]['flags']['chargeInProgress'] === false);
        $view = SimEngine::duoAction($userId, $id, 0, 'iv', []);
        assert($view['lock']['active'] === true);
        $view = SimEngine::duoAction($userId, $id, 1, 'charge', ['energy' => 150, 'sync' => true]);
        assert($view['patients'][1]['flags']['chargeReady'] === true, 'the second patient can charge while the first is being treated');
        assert($view['lock']['active'] === true, 'charging must not clear the existing lock');
        SimEngine::duoAction($userId, $id, 0, 'finish', []);
    });

    check('finish produces a duo debrief with both patients and one run', function () use ($userId) {
        $id = $GLOBALS['duoSession'];
        $view = SimEngine::duoAction($userId, $id, 0, 'finish', []);
        assert($view['status'] === 'ended');
        assert((int) $view['runId'] > 0);
        $debrief = SimEngine::debrief($userId, (int) $view['runId']);
        assert($debrief['run']['scenarioId'] === 'random-duo');
        assert(isset($debrief['duo']['patients']));
        assert(count($debrief['duo']['patients']) === 2);
        assert($debrief['scenario'] !== null);
        assert(count($debrief['events']) > 0);
        assert(in_array($debrief['run']['outcome'], ['aborted', 'failed', 'partial', 'rosc'], true));
    });

    check('one survivor is a partial success with a positive team score', function () use ($userId, $pdo) {
        $view = SimEngine::startDuo($userId);
        $id = $view['sessionId'];
        $stmt = $pdo->prepare('SELECT state FROM sim_sessions WHERE id = ?');
        $stmt->execute([$id]);
        $state = json_decode((string) $stmt->fetchColumn(), true);
        $start = (float) $state['startedAt'];
        $state['patients'][0]['state']['pendingOutcome'] = 'stable';
        $state['patients'][0]['diagnosisSubmitted'] = true;
        $state['patients'][0]['diagnosisCorrect'] = true;
        $state['patients'][0]['diagnosisAt'] = $start + 3;
        $state['patients'][0]['treatmentStarted'] = true;
        $state['patients'][0]['treatmentAt'] = $start + 4;
        $state['patients'][1]['state']['pendingOutcome'] = 'timeout';
        $pdo->prepare('UPDATE sim_sessions SET state = ? WHERE id = ?')
            ->execute([json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $id]);
        $view = SimEngine::duoState($userId, $id);
        assert($view['status'] === 'ended');
        assert($view['outcome'] === 'partial');
        assert($view['score'] > 0 && $view['score'] <= 100);
        $debrief = SimEngine::debrief($userId, (int) $view['runId']);
        $patients = $debrief['duo']['patients'];
        assert(count($patients) === 2);
        assert($patients[0]['success'] === true);
        assert($patients[1]['success'] === false);
        assert($patients[0]['diagnosisCorrect'] === true);
    });

    check('expired 15-second window applies penalties once per patient', function () use ($userId, $pdo) {
        $view = SimEngine::startDuo($userId);
        $id = $view['sessionId'];
        $stmt = $pdo->prepare('SELECT state FROM sim_sessions WHERE id = ?');
        $stmt->execute([$id]);
        $state = json_decode((string) $stmt->fetchColumn(), true);
        $past = microtime(true) - 1;
        foreach ([0, 1] as $index) {
            $state['patients'][$index]['diagnosisDeadline'] = $past;
            $state['patients'][$index]['windowScored'] = false;
        }
        $pdo->prepare('UPDATE sim_sessions SET state = ? WHERE id = ?')
            ->execute([json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $id]);
        $view = SimEngine::duoState($userId, $id);
        assert($view['windowLeft'] === 0);
        $stmt->execute([$id]);
        $saved = json_decode((string) $stmt->fetchColumn(), true);
        foreach ([0, 1] as $index) {
            $reasons = array_column($saved['patients'][$index]['state']['penalties'], 'reason');
            assert(in_array('诊断窗口内未提交诊断', $reasons, true), 'missing diagnosis timeout penalty for patient ' . $index);
            assert(in_array('诊断窗口内未开始处理', $reasons, true), 'missing treatment timeout penalty for patient ' . $index);
            assert($saved['patients'][$index]['windowScored'] === true);
        }
        SimEngine::duoAction($userId, $id, 0, 'finish', []);
    });

    check('both patients recovering ends in ROSC and sinus rhythm', function () use ($userId, $pdo) {        $view = SimEngine::startDuo($userId);
        $id = $view['sessionId'];
        $stmt = $pdo->prepare('SELECT state FROM sim_sessions WHERE id = ?');
        $stmt->execute([$id]);
        $state = json_decode((string) $stmt->fetchColumn(), true);
        $start = (float) $state['startedAt'];
        foreach ([0, 1] as $index) {
            $state['patients'][$index]['state']['pendingOutcome'] = 'stable';
            $state['patients'][$index]['diagnosisSubmitted'] = true;
            $state['patients'][$index]['diagnosisCorrect'] = true;
            $state['patients'][$index]['diagnosisAt'] = $start + 2 + $index;
            $state['patients'][$index]['treatmentStarted'] = true;
            $state['patients'][$index]['treatmentAt'] = $start + 5 + $index;
        }
        $pdo->prepare('UPDATE sim_sessions SET state = ? WHERE id = ?')
            ->execute([json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $id]);
        $view = SimEngine::duoState($userId, $id);
        assert($view['status'] === 'ended');
        assert($view['outcome'] === 'rosc');
        assert($view['score'] >= 80, 'both recovered should score high');
        foreach ($view['patients'] as $patient) {
            assert($patient['status'] === 'ended');
            assert(in_array($patient['outcome'], ['rosc', 'stable'], true));
            assert($patient['monitor']['rhythm'] === 'sinus');
        }
        $debrief = SimEngine::debrief($userId, (int) $view['runId']);
        assert($debrief['run']['outcome'] === 'rosc');
        assert(count(array_filter($debrief['duo']['patients'], static fn (array $p): bool => $p['success'])) === 2);
    });
} finally {
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
