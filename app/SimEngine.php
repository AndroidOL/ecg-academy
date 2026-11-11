<?php
declare(strict_types=1);

namespace App;

final class SimEngine
{
    public static function scenarios(): array
    {
        $scenarios = require BASE_PATH . '/data/scenarios.php';
        return array_map(static function (array $s): array {
            unset($s['algorithm']);
            return $s;
        }, $scenarios);
    }

    public static function scenario(string $id): ?array
    {
        foreach (require BASE_PATH . '/data/scenarios.php' as $scenario) {
            if ($scenario['id'] === $id) return $scenario;
        }
        return null;
    }

    public static function start(int $userId, string $scenarioId): array
    {
        $scenario = self::scenario($scenarioId);
        if (!$scenario) {
            throw new ApiError(404, 'scenario_not_found', '急救场景不存在');
        }
        $now = microtime(true);
        $state = self::createState($userId, $scenario, null, $now);
        $pdo = Db::pdo();
        $stmt = $pdo->prepare(
            'INSERT INTO sim_sessions (id, user_id, scenario_id, state, status, started_at, updated_at)
             VALUES (?, ?, ?, ?, "active", NOW(3), NOW(3))'
        );
        $stmt->execute([$state['id'], $userId, $scenarioId, self::encode($state)]);
        return self::view($state, $scenario, $userId);
    }

    public static function state(int $userId, string $sessionId): array
    {
        $session = self::load($userId, $sessionId);
        $scenario = self::scenario($session['scenario_id']);
        if (!$scenario) throw new ApiError(404, 'scenario_not_found', '场景不存在');
        $state = self::decode($session['state']);
        if ($state['status'] === 'active') {
            $outcome = self::advance($state, $scenario);
            if ($outcome !== null) {
                self::finalize($state, $scenario, $outcome, $userId, 0);
            } elseif ($state['dirty']) {
                self::saveSession($sessionId, $state, 'active');
            }
        }
        return self::view($state, $scenario, $userId);
    }

    public static function action(int $userId, string $sessionId, string $action, array $payload): array
    {
        $session = self::load($userId, $sessionId);
        $scenario = self::scenario($session['scenario_id']);
        if (!$scenario) throw new ApiError(404, 'scenario_not_found', '场景不存在');
        $state = self::decode($session['state']);
        if ($state['status'] !== 'active') {
            return self::view($state, $scenario, $userId);
        }
        $now = microtime(true);
        $outcome = self::advance($state, $scenario, $now);
        if ($outcome !== null) {
            self::finalize($state, $scenario, $outcome, $userId, 0);
            return self::view($state, $scenario, $userId);
        }

        self::applyAction($state, $scenario, $action, $payload, $now, $userId);

        if ($state['status'] === 'active') {
            $state['updatedAt'] = $now;
            self::saveSession($sessionId, $state, 'active');
        }
        return self::view($state, $scenario, $userId);
    }

    private static function applyAction(array &$state, array $scenario, string $action, array $payload, float $now, int $userId): void
    {
        match ($action) {
            'cpr_start' => self::cprStart($state, $now),
            'cpr_stop' => self::cprStop($state, $payload, $now),
            'charge' => self::charge($state, $scenario, $payload, $now),
            'disarm' => self::disarm($state),
            'shock' => self::shock($state, $scenario, $payload, $now),
            'epi' => self::epi($state, $scenario, $now),
            'amio' => self::amio($state, $scenario, $now),
            'atropine' => self::atropine($state, $scenario, $now),
            'pacing' => self::pacing($state, $scenario, $now),
            'epi_infusion' => self::epiInfusion($state, $scenario, $now),
            'iv' => self::iv($state, $now),
            'oxygen' => self::oxygen($state, $scenario, $now),
            'sedate' => self::sedate($state, $scenario),
            'calcium' => self::calcium($state, $scenario, $now),
            'bicarb' => self::bicarb($state, $scenario, $now),
            'insulin' => self::insulin($state, $scenario, $now),
            'special' => self::specialAction($state, $scenario, $now),
            'adenosine' => self::adenosine($state, $scenario, $now),
            'vagal' => self::vagal($state, $scenario, $now),
            'check_pulse' => self::check($state, '检查脉搏', $now),
            'check_rhythm' => self::check($state, '检查心律', $now),
            'finish' => self::finalize($state, $scenario, 'aborted', $userId, 0),
            default => throw new ApiError(422, 'invalid_action', '未知操作'),
        };
    }

    public static function startDuo(int $userId): array
    {
        $pool = self::duoCasePool();
        $ids = array_keys($pool);
        if (count($ids) < 2) {
            throw new ApiError(500, 'duo_pool_empty', '随机病例池不足');
        }
        shuffle($ids);
        $chosen = array_slice($ids, 0, 2);
        $now = microtime(true);
        $sessionId = bin2hex(random_bytes(12));
        $patients = [];
        foreach ($chosen as $index => $scenarioId) {
            $scenario = self::scenario($scenarioId);
            if ($scenario === null) {
                continue;
            }
            $case = self::randomCase($scenario, $pool[$scenarioId], $index);
            $subState = self::createState(
                $userId,
                $scenario,
                bin2hex(random_bytes(12)),
                $now,
                '患者 ' . self::duoCode($index) . ' 送达：' . $case['complaint']
            );
            $subState['duoMode'] = true;
            $patients[] = [
                'scenarioId' => $scenarioId,
                'state' => $subState,
                'case' => $case,
                'diagnosis' => $case['diagnosis'],
                'diagnosisOptions' => $case['options'],
                'diagnosisSubmitted' => false,
                'diagnosisSelected' => null,
                'diagnosisCorrect' => null,
                'diagnosisAt' => null,
                'treatmentStarted' => false,
                'treatmentAt' => null,
                // First patient: 15 s; second patient gets an additional 15 s.
                'diagnosisDeadline' => $now + 15.0 * ($index + 1),
                'windowTotal' => 15,
                'windowScored' => false,
            ];
        }
        if (count($patients) < 2) {
            throw new ApiError(500, 'duo_case_failed', '随机病例生成失败');
        }

        $state = [
            'id' => $sessionId,
            'userId' => $userId,
            'mode' => 'duo',
            'scenarioId' => 'random-duo',
            'startedAt' => $now,
            'updatedAt' => $now,
            'status' => 'active',
            'outcome' => null,
            'endedAt' => null,
            'runId' => null,
            'score' => null,
            'grade' => null,
            'diagnosisDeadline' => $now + 30.0,
            'lockUntil' => null,
            'lockPatient' => null,
            'lockLabel' => null,
            'patients' => $patients,
            'events' => [],
            'dirty' => false,
        ];
        self::duoEvent($state, '双人随机模式：两名危重症患者同时送达。', 'warn');
        self::duoEvent($state, '15 秒内完成诊断并开始处理；同一时间只能处置一名患者，CPR 除外。', 'neutral');

        $stmt = Db::pdo()->prepare(
            'INSERT INTO sim_sessions (id, user_id, scenario_id, state, status, started_at, updated_at)
             VALUES (?, ?, "random-duo", ?, "active", NOW(3), NOW(3))'
        );
        $stmt->execute([$sessionId, $userId, self::encode($state)]);
        return self::duoView($state, $userId);
    }

    public static function duoState(int $userId, string $sessionId): array
    {
        $session = self::duoLoad($userId, $sessionId);
        $state = self::decode((string) $session['state']);
        if (($state['mode'] ?? '') !== 'duo') {
            throw new ApiError(404, 'duo_session_not_found', '双人模拟会话不存在');
        }
        if ($state['status'] === 'active') {
            self::duoAdvance($state, microtime(true));
            if ($state['dirty']) {
                self::duoSave($state);
            }
        }
        return self::duoView($state, $userId);
    }

    public static function duoAction(int $userId, string $sessionId, int $patientIndex, string $action, array $payload): array
    {
        $session = self::duoLoad($userId, $sessionId);
        $state = self::decode((string) $session['state']);
        if (($state['mode'] ?? '') !== 'duo') {
            throw new ApiError(404, 'duo_session_not_found', '双人模拟会话不存在');
        }
        if ($state['status'] !== 'active') {
            return self::duoView($state, $userId);
        }
        $now = microtime(true);
        self::duoAdvance($state, $now);
        if ($state['status'] !== 'active') {
            self::duoSave($state);
            return self::duoView($state, $userId);
        }
        if ($action === 'finish') {
            self::duoFinalize($state, 'aborted', $now);
            self::duoSave($state);
            return self::duoView($state, $userId);
        }
        if ($patientIndex < 0 || $patientIndex > count($state['patients']) - 1) {
            throw new ApiError(422, 'invalid_patient', '患者编号无效');
        }
        $patient = &$state['patients'][$patientIndex];
        if ($patient['state']['status'] !== 'active') {
            throw new ApiError(409, 'patient_ended', '该患者已恢复窦性心律或抢救结束');
        }

        $isParallel = in_array($action, ['cpr_start', 'cpr_stop', 'charge', 'disarm'], true);
        if (!$isParallel && !empty($state['lockUntil']) && $now < (float) $state['lockUntil']) {
            $remaining = max(1, (int) ceil((float) $state['lockUntil'] - $now));
            $other = self::duoCode((int) ($state['lockPatient'] ?? 0));
            throw new ApiError(409, 'procedure_busy', "正在处置患者 {$other}（{$state['lockLabel']}，约 {$remaining} 秒）；除 CPR 与充电外，同一时间只能进行一项操作");
        }

        $scenario = self::scenario((string) $patient['scenarioId']);
        if ($scenario === null) {
            throw new ApiError(500, 'scenario_missing', '病例数据缺失');
        }

        self::applyAction($patient['state'], $scenario, $action, $payload, $now, $userId);

        if (self::isDuoTreatment($action) && !$patient['treatmentStarted']) {
            $patient['treatmentStarted'] = true;
            $patient['treatmentAt'] = $now;
            $deadline = (float) ($patient['diagnosisDeadline'] ?? $state['diagnosisDeadline']);
            $inTime = $now <= $deadline;
            self::event(
                $patient['state'],
                $inTime ? '已开始处理（诊断窗口内）' : '已开始处理（超出诊断窗口）',
                $inTime ? 'good' : 'warn'
            );
        }

        self::duoAdvance($state, $now);
        if ($state['status'] !== 'active') {
            self::duoSave($state);
            return self::duoView($state, $userId);
        }

        $lockUntil = self::duoLockUntil($patient['state'], $action, $now);
        if (!$isParallel) {
            if ($lockUntil > $now) {
                $state['lockUntil'] = $lockUntil;
                $state['lockPatient'] = $patientIndex;
                $state['lockLabel'] = self::duoActionLabel($action);
                self::duoEvent(
                    $state,
                    '患者 ' . self::duoCode($patientIndex) . '：' . $state['lockLabel']
                    . '（约 ' . max(1, (int) ceil($lockUntil - $now)) . ' 秒）',
                    'neutral'
                );
            } else {
                $state['lockUntil'] = null;
                $state['lockPatient'] = null;
                $state['lockLabel'] = null;
            }
        }
        $state['updatedAt'] = $now;
        $state['dirty'] = true;
        self::duoSave($state);
        return self::duoView($state, $userId);
    }

    public static function duoDiagnosis(int $userId, string $sessionId, int $patientIndex, string $diagnosis): array
    {
        $session = self::duoLoad($userId, $sessionId);
        $state = self::decode((string) $session['state']);
        if (($state['mode'] ?? '') !== 'duo') {
            throw new ApiError(404, 'duo_session_not_found', '双人模拟会话不存在');
        }
        if ($state['status'] !== 'active') {
            return self::duoView($state, $userId);
        }
        $now = microtime(true);
        self::duoAdvance($state, $now);
        if ($state['status'] !== 'active') {
            self::duoSave($state);
            return self::duoView($state, $userId);
        }
        if ($patientIndex < 0 || $patientIndex > count($state['patients']) - 1) {
            throw new ApiError(422, 'invalid_patient', '患者编号无效');
        }
        $patient = &$state['patients'][$patientIndex];
        if ($patient['state']['status'] !== 'active') {
            throw new ApiError(409, 'patient_ended', '该患者的抢救已结束');
        }
        if ($patient['diagnosisSubmitted']) {
            throw new ApiError(422, 'diagnosis_done', '该患者的诊断已提交');
        }
        if (!in_array($diagnosis, $patient['diagnosisOptions'], true)) {
            throw new ApiError(422, 'invalid_diagnosis', '诊断选项无效');
        }
        $correct = $diagnosis === $patient['diagnosis'];
        $deadline = (float) ($patient['diagnosisDeadline'] ?? $state['diagnosisDeadline']);
        $inTime = $now <= $deadline;
        $patient['diagnosisSubmitted'] = true;
        $patient['diagnosisSelected'] = $diagnosis;
        $patient['diagnosisCorrect'] = $correct;
        $patient['diagnosisAt'] = $now;
        self::event($patient['state'], '诊断已提交：' . $diagnosis, $correct ? 'good' : 'neutral');
        if (!$correct) {
            self::penalty($patient['state'], 8, '诊断与病例不符（正确诊断见复盘）');
        } elseif (!$inTime) {
            self::event($patient['state'], '诊断正确，但已超出 15 秒窗口', 'warn');
        }
        $state['updatedAt'] = $now;
        $state['dirty'] = true;
        self::duoSave($state);
        return self::duoView($state, $userId);
    }

    public static function debrief(int $userId, int $runId): array
    {
        $stmt = Db::pdo()->prepare('SELECT * FROM sim_runs WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$runId, $userId]);
        $run = $stmt->fetch();
        if (!$run) throw new ApiError(404, 'run_not_found', '复盘记录不存在');
        $scenario = self::scenario($run['scenario_id']);
        $payload = json_decode((string) $run['actions'], true);
        $payload = is_array($payload) ? $payload : [];
        $isDuo = ($payload['mode'] ?? '') === 'duo';
        if ($isDuo && $scenario === null) {
            $scenario = [
                'id' => 'random-duo',
                'name' => '双人随机急救',
                'subtitle' => '两名危重症患者同时送达',
                'success' => '两名患者均恢复窦性心律/自主循环；部分成功按 55% 计分。',
            ];
        }
        $events = $isDuo ? (array) ($payload['events'] ?? []) : $payload;
        $metrics = self::metricsFromEvents($events);
        return [
            'run' => [
                'id' => (int) $run['id'],
                'scenarioId' => $run['scenario_id'],
                'score' => (int) $run['score'],
                'grade' => $run['grade'],
                'outcome' => $run['outcome'],
                'duration' => (int) $run['duration_s'],
                'createdAt' => $run['created_at'],
            ],
            'scenario' => $scenario ? array_diff_key($scenario, ['algorithm' => true]) : null,
            'events' => $events,
            'duo' => $isDuo ? ['patients' => (array) ($payload['patients'] ?? [])] : null,
            'metrics' => $metrics,
            'review' => self::localReview($scenario, $events, (int) $run['score'], $run['outcome']),
            'aiAvailable' => Ai::configured(),
        ];
    }

    private static function duoLoad(int $userId, string $sessionId): array
    {
        if (!preg_match('/^[a-f0-9]{24}$/', $sessionId)) {
            throw new ApiError(404, 'duo_session_not_found', '双人模拟会话不存在');
        }
        $stmt = Db::pdo()->prepare('SELECT * FROM sim_sessions WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$sessionId, $userId]);
        $session = $stmt->fetch();
        if (!$session || (string) ($session['scenario_id'] ?? '') !== 'random-duo') {
            throw new ApiError(404, 'duo_session_not_found', '双人模拟会话不存在');
        }
        return $session;
    }

    private static function duoSave(array &$state): void
    {
        $state['dirty'] = false;
        $status = $state['status'] === 'active' ? 'active' : 'ended';
        $stmt = Db::pdo()->prepare('UPDATE sim_sessions SET state = ?, status = ?, updated_at = NOW(3) WHERE id = ?');
        $stmt->execute([self::encode($state), $status, $state['id']]);
    }

    private static function duoAdvance(array &$state, ?float $now = null): void
    {
        if (($state['status'] ?? '') !== 'active') {
            return;
        }
        $now = $now ?? microtime(true);
        if (!empty($state['lockUntil']) && $now >= (float) $state['lockUntil']) {
            $state['lockUntil'] = null;
            $state['lockPatient'] = null;
            $state['lockLabel'] = null;
            self::duoEvent($state, '当前处置完成，可以切换患者。', 'neutral');
        }

        foreach ($state['patients'] as $index => &$patient) {
            $deadline = (float) ($patient['diagnosisDeadline'] ?? $state['diagnosisDeadline']);
            if (!$patient['windowScored'] && $now >= $deadline) {
                if (!$patient['diagnosisSubmitted']) {
                    self::penalty($patient['state'], 8, '诊断窗口内未提交诊断');
                }
                if (!$patient['treatmentStarted']) {
                    self::penalty($patient['state'], 8, '诊断窗口内未开始处理');
                }
                $patient['windowScored'] = true;
                self::duoEvent($state, '患者 ' . self::duoCode($index) . '：诊断/处置窗口已结束。', 'warn');
                $state['dirty'] = true;
            }
            if ($patient['state']['status'] !== 'active') {
                continue;
            }
            $scenario = self::scenario((string) $patient['scenarioId']);
            if ($scenario === null) {
                continue;
            }
            $pendingOutcome = $patient['state']['pendingOutcome'] ?? null;
            if ($pendingOutcome !== null) {
                $patient['state']['status'] = 'ended';
                $patient['state']['outcome'] = (string) $pendingOutcome;
                $patient['state']['endedAt'] = $now;
                $patient['state']['pendingOutcome'] = null;
                $patient['state']['dirty'] = false;
                $success = in_array($pendingOutcome, ['rosc', 'stable'], true);
                self::duoEvent(
                    $state,
                    '患者 ' . self::duoCode($index) . '：' . ($success ? '恢复窦性心律/自主循环' : '抢救失败'),
                    $success ? 'good' : 'bad'
                );
                $state['dirty'] = true;
                continue;
            }
            $outcome = self::advance($patient['state'], $scenario, $now);
            if ($outcome !== null) {
                $patient['state']['status'] = 'ended';
                $patient['state']['outcome'] = $outcome;
                $patient['state']['endedAt'] = $now;
                $patient['state']['dirty'] = false;
                $success = in_array($outcome, ['rosc', 'stable'], true);
                self::duoEvent(
                    $state,
                    '患者 ' . self::duoCode($index) . '：' . ($success ? '恢复窦性心律/自主循环' : '抢救失败'),
                    $success ? 'good' : 'bad'
                );
                $state['dirty'] = true;
            } elseif ($patient['state']['dirty']) {
                $state['dirty'] = true;
                $patient['state']['dirty'] = false;
            }
            if ((int) ($state['lockPatient'] ?? -1) === $index) {
                foreach (['ivPendingUntil', 'chargeReadyAt', 'postShockUntil'] as $pendingKey) {
                    if (!empty($patient['state'][$pendingKey]) && (float) $patient['state'][$pendingKey] > (float) ($state['lockUntil'] ?? 0)) {
                        $state['lockUntil'] = (float) $patient['state'][$pendingKey];
                    }
                }
            }
        }
        unset($patient);

        if ($now - (float) $state['startedAt'] > 600) {
            foreach ($state['patients'] as $index => &$patient) {
                if ($patient['state']['status'] === 'active') {
                    $patient['state']['status'] = 'ended';
                    $patient['state']['outcome'] = 'timeout';
                    $patient['state']['endedAt'] = $now;
                    $patient['state']['dirty'] = false;
                    self::duoEvent($state, '患者 ' . self::duoCode($index) . '：超过总时限，抢救失败。', 'bad');
                }
            }
            unset($patient);
        }

        $allEnded = true;
        foreach ($state['patients'] as $patient) {
            if ($patient['state']['status'] === 'active') {
                $allEnded = false;
                break;
            }
        }
        if ($allEnded) {
            self::duoFinalize($state, 'completed', $now);
        }
    }

    private static function duoFinalize(array &$state, string $reason, float $now): void
    {
        if (($state['status'] ?? '') !== 'active') {
            return;
        }
        foreach ($state['patients'] as $index => &$patient) {
            $deadline = (float) ($patient['diagnosisDeadline'] ?? $state['diagnosisDeadline']);
            if ($patient['state']['status'] === 'active') {
                $patient['state']['status'] = 'ended';
                $patient['state']['outcome'] = $reason === 'aborted' ? 'aborted' : 'timeout';
                $patient['state']['endedAt'] = $now;
                $patient['state']['dirty'] = false;
                self::duoEvent(
                    $state,
                    '患者 ' . self::duoCode($index) . '：' . ($reason === 'aborted' ? '提前结束' : '抢救失败'),
                    $reason === 'aborted' ? 'warn' : 'bad'
                );
            }
            if (!$patient['windowScored'] && $now >= $deadline) {
                if (!$patient['diagnosisSubmitted']) {
                    self::penalty($patient['state'], 8, '诊断窗口内未提交诊断');
                }
                if (!$patient['treatmentStarted']) {
                    self::penalty($patient['state'], 8, '诊断窗口内未开始处理');
                }
                $patient['windowScored'] = true;
            }
        }
        unset($patient);

        $results = [];
        $successCount = 0;
        $processSum = 0.0;
        $allDiagnosisInTime = true;
        $allTreatmentInTime = true;
        foreach ($state['patients'] as $index => $patient) {
            $result = self::duoScorePatient($patient, $state, $now, $index);
            $results[] = $result;
            if ($result['success']) {
                $successCount++;
                $processSum += $result['processScore'];
            }
            if (!($result['diagnosisCorrect'] && $result['diagnosisInTime'])) {
                $allDiagnosisInTime = false;
            }
            if (!($result['treatmentStarted'] && $result['treatmentInTime'])) {
                $allTreatmentInTime = false;
            }
        }

        if ($successCount === 2) {
            $score = (int) round($processSum / 2);
            $outcome = 'rosc';
        } elseif ($successCount === 1) {
            $score = (int) round($processSum * 0.55);
            $outcome = 'partial';
        } else {
            $score = 0;
            $outcome = $reason === 'aborted' ? 'aborted' : 'failed';
        }
        if ($successCount > 0) {
            if ($allDiagnosisInTime) {
                $score += 8;
            }
            if ($allTreatmentInTime) {
                $score += 5;
            }
        }
        $score = max(0, min(100, $score));
        $grade = self::gradeFor($score);
        $duration = max(1, (int) round($now - (float) $state['startedAt']));

        $events = $state['events'];
        foreach ($results as $result) {
            foreach ($result['events'] as $event) {
                $event['patient'] = $result['code'];
                $events[] = $event;
            }
        }
        usort($events, static fn (array $a, array $b): int => ((float) $a['t']) <=> ((float) $b['t']));
        $payload = ['mode' => 'duo', 'events' => $events, 'patients' => $results];

        $pdo = Db::pdo();
        $stmt = $pdo->prepare(
            'INSERT INTO sim_runs (user_id, scenario_id, score, grade, outcome, actions, duration_s)
             VALUES (?, "random-duo", ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            (int) $state['userId'],
            $score,
            $grade,
            $outcome,
            self::encode($payload),
            $duration,
        ]);
        $runId = (int) $pdo->lastInsertId();
        $xp = $outcome === 'rosc'
            ? max(5, (int) round($score / 4))
            : ($outcome === 'partial' ? max(3, (int) round($score / 8)) : 0);
        if ($xp > 0) {
            $pdo->prepare('UPDATE users SET xp = xp + ? WHERE id = ?')->execute([$xp, (int) $state['userId']]);
        }

        $state['status'] = 'ended';
        $state['outcome'] = $outcome;
        $state['endedAt'] = $now;
        $state['score'] = $score;
        $state['grade'] = $grade;
        $state['runId'] = $runId;
        $state['results'] = $results;
        $state['lockUntil'] = null;
        $state['lockPatient'] = null;
        $state['lockLabel'] = null;
        $state['dirty'] = false;
        self::saveSession((string) $state['id'], $state, 'ended');
    }

    private static function duoScorePatient(array $patient, array $state, float $now, int $index): array
    {
        $patientState = $patient['state'];
        $outcome = (string) ($patientState['outcome'] ?? 'timeout');
        $success = in_array($outcome, ['rosc', 'stable'], true);
        $startedAt = (float) $patientState['startedAt'];
        $endedAt = (float) ($patientState['endedAt'] ?? $now);
        $duration = max(1, (int) round($endedAt - $startedAt));
        $deadline = (float) ($patient['diagnosisDeadline'] ?? $state['diagnosisDeadline']);

        $score = 100;
        foreach ((array) ($patientState['penalties'] ?? []) as $penalty) {
            $score -= (int) ($penalty['points'] ?? 0);
        }
        $firstCpr = $patientState['firstCprAt'] ? (float) $patientState['firstCprAt'] - $startedAt : null;
        if ($firstCpr !== null && $firstCpr <= 10) {
            $score += 10;
        }
        $cprSeconds = (float) ($patientState['cprSeconds'] ?? 0);
        if (!empty($patientState['cpr']) && !empty($patientState['cprStartedAt'])) {
            $cprSeconds += max(0, $endedAt - (float) $patientState['cprStartedAt']);
        }
        $cprRatio = $duration > 0 ? $cprSeconds / $duration : 0;
        if ($cprRatio >= 0.5) {
            $score += 10;
        }
        if ($success) {
            $score += 20;
        }
        if ((int) ($patientState['syncErrors'] ?? 0) === 0) {
            $score += 5;
        }
        if ((int) ($patientState['energyErrors'] ?? 0) === 0) {
            $score += 5;
        }
        if ((int) ($patientState['epiErrors'] ?? 0) === 0) {
            $score += 5;
        }

        $diagnosisInTime = $patient['diagnosisAt'] !== null && (float) $patient['diagnosisAt'] <= $deadline;
        $treatmentInTime = $patient['treatmentAt'] !== null && (float) $patient['treatmentAt'] <= $deadline;
        if ($patient['diagnosisCorrect'] && $diagnosisInTime) {
            $score += 10;
        }
        if ($patient['treatmentStarted'] && $treatmentInTime) {
            $score += 5;
        }

        $processScore = max(0, min(100, $score));
        $finalScore = $success ? $processScore : 0;

        $events = [];
        foreach ((array) ($patientState['events'] ?? []) as $event) {
            $events[] = [
                't' => round((float) ($event['t'] ?? 0), 1),
                'label' => (string) ($event['label'] ?? ''),
                'tone' => (string) ($event['tone'] ?? 'neutral'),
                'points' => (int) ($event['points'] ?? 0),
            ];
        }
        $penalties = [];
        foreach ((array) ($patientState['penalties'] ?? []) as $penalty) {
            $penalties[] = [
                't' => round((float) ($penalty['t'] ?? 0), 1),
                'points' => (int) ($penalty['points'] ?? 0),
                'reason' => (string) ($penalty['reason'] ?? ''),
            ];
        }

        return [
            'index' => $index,
            'code' => self::duoCode($index),
            'diagnosis' => (string) $patient['diagnosis'],
            'diagnosisSelected' => $patient['diagnosisSelected'],
            'diagnosisCorrect' => (bool) $patient['diagnosisCorrect'],
            'diagnosisAt' => $patient['diagnosisAt'] !== null ? round((float) $patient['diagnosisAt'] - $startedAt, 1) : null,
            'diagnosisInTime' => $diagnosisInTime,
            'treatmentStarted' => (bool) $patient['treatmentStarted'],
            'treatmentAt' => $patient['treatmentAt'] !== null ? round((float) $patient['treatmentAt'] - $startedAt, 1) : null,
            'treatmentInTime' => $treatmentInTime,
            'outcome' => $outcome,
            'success' => $success,
            'processScore' => $processScore,
            'score' => $finalScore,
            'grade' => $success ? self::gradeFor($processScore) : 'D',
            'cprRatio' => round($cprRatio, 2),
            'penalties' => $penalties,
            'events' => $events,
        ];
    }

    private static function duoView(array $state, int $userId): array
    {
        $now = microtime(true);
        $start = (float) $state['startedAt'];
        $elapsed = max(0, (int) round($now - $start));
        $windowLeft = 0;
        $lockActive = !empty($state['lockUntil']) && $now < (float) $state['lockUntil'];

        $patients = [];
        foreach ($state['patients'] as $index => $patient) {
            $scenario = self::scenario((string) $patient['scenarioId']);
            if ($scenario === null) {
                continue;
            }
            $view = self::view($patient['state'], $scenario, $userId);
            unset($view['scenario'], $view['hint'], $view['events']);
            $view['index'] = $index;
            $view['code'] = self::duoCode($index);
            $case = $patient['case'];
            unset($case['diagnosis'], $case['options']);
            $view['case'] = $case;
            $view['actions'] = self::duoActionsFor((string) $patient['scenarioId']);
            $ended = $view['status'] === 'ended';
            $deadline = (float) ($patient['diagnosisDeadline'] ?? $state['diagnosisDeadline']);
            $patientWindowLeft = max(0, (int) ceil($deadline - $now));
            $windowLeft = max($windowLeft, $patientWindowLeft);
            $diagnosisInTime = $patient['diagnosisAt'] !== null && (float) $patient['diagnosisAt'] <= $deadline;
            $treatmentInTime = $patient['treatmentAt'] !== null && (float) $patient['treatmentAt'] <= $deadline;
            $view['diagnosis'] = [
                'options' => $patient['diagnosisOptions'],
                'submitted' => (bool) $patient['diagnosisSubmitted'],
                'selected' => $patient['diagnosisSelected'],
                'at' => $patient['diagnosisAt'] !== null ? round((float) $patient['diagnosisAt'] - $start, 1) : null,
                'inTime' => $diagnosisInTime,
                'correct' => $ended ? (bool) $patient['diagnosisCorrect'] : null,
                'label' => $ended ? (string) $patient['diagnosis'] : null,
                'deadlineLeft' => $patientWindowLeft,
                'windowTotal' => (int) ($patient['windowTotal'] ?? 15),
                'expired' => $now >= $deadline,
            ];
            $view['treatment'] = [
                'started' => (bool) $patient['treatmentStarted'],
                'at' => $patient['treatmentAt'] !== null ? round((float) $patient['treatmentAt'] - $start, 1) : null,
                'inTime' => $treatmentInTime,
            ];
            $view['locked'] = $lockActive;
            $view['lockOwner'] = $lockActive && (int) ($state['lockPatient'] ?? -1) === $index;
            if ($ended && isset($state['results'][$index])) {
                $view['result'] = $state['results'][$index];
            }
            $patients[] = $view;
        }

        $events = [];
        foreach ((array) $state['events'] as $event) {
            $event['patient'] = null;
            $events[] = $event;
        }
        foreach ($state['patients'] as $index => $patient) {
            foreach (self::duoSanitizeEvents((array) ($patient['state']['events'] ?? [])) as $event) {
                $event['patient'] = self::duoCode($index);
                $events[] = $event;
            }
        }
        usort($events, static fn (array $a, array $b): int => ((float) $b['t']) <=> ((float) $a['t']));

        return [
            'mode' => 'duo',
            'sessionId' => (string) $state['id'],
            'status' => (string) $state['status'],
            'outcome' => $state['outcome'] ?? null,
            'elapsed' => $elapsed,
            'remaining' => max(0, 600 - $elapsed),
            'windowLeft' => $windowLeft,
            'windowTotal' => 30,
            'lock' => [
                'active' => $lockActive,
                'patient' => $lockActive ? (int) $state['lockPatient'] : null,
                'code' => $lockActive ? self::duoCode((int) $state['lockPatient']) : null,
                'label' => $lockActive ? (string) $state['lockLabel'] : null,
                'remaining' => $lockActive ? max(1, (int) ceil((float) $state['lockUntil'] - $now)) : 0,
            ],
            'patients' => $patients,
            'events' => array_slice($events, 0, 40),
            'score' => $state['status'] === 'ended' ? ($state['score'] ?? null) : null,
            'grade' => $state['status'] === 'ended' ? ($state['grade'] ?? null) : null,
            'runId' => $state['runId'] ?? null,
            'aiAvailable' => Ai::configured(),
        ];
    }

    private static function duoActionsFor(string $scenarioId): array
    {
        $scenario = self::scenario($scenarioId);
        $groups = [
            ['id' => 'bls', 'label' => '基础生命支持', 'actions' => [
                ['id' => 'cpr_start', 'label' => '开始胸外按压', 'tone' => 'primary'],
                ['id' => 'cpr_stop', 'label' => '暂停按压', 'tone' => 'ghost'],
                ['id' => 'oxygen', 'label' => '球囊面罩通气 / 吸氧', 'tone' => 'ghost'],
                ['id' => 'iv', 'label' => '建立 IV/IO', 'tone' => 'ghost'],
            ]],
            ['id' => 'shock', 'label' => '电治疗', 'actions' => [
                ['id' => 'shock', 'label' => '电击 / 复律', 'tone' => 'danger', 'requiresEnergy' => true],
                ['id' => 'disarm', 'label' => '解除充电', 'tone' => 'ghost'],
            ]],
            ['id' => 'drugs', 'label' => '药物与操作', 'actions' => [
                ['id' => 'epi', 'label' => '肾上腺素 1 mg', 'tone' => 'warn', 'requiresIv' => true],
                ['id' => 'amio', 'label' => '胺碘酮 300 mg', 'tone' => 'ghost', 'requiresIv' => true],
                ['id' => 'atropine', 'label' => '阿托品 1 mg', 'tone' => 'ghost', 'requiresIv' => true],
                ['id' => 'adenosine', 'label' => 'Adenosine 6 mg', 'tone' => 'ghost', 'requiresIv' => true],
                ['id' => 'calcium', 'label' => '静脉钙剂', 'tone' => 'ghost', 'requiresIv' => true],
                ['id' => 'bicarb', 'label' => '碳酸氢钠', 'tone' => 'ghost', 'requiresIv' => true],
                ['id' => 'insulin', 'label' => '胰岛素+葡萄糖', 'tone' => 'ghost', 'requiresIv' => true],
                ['id' => 'epi_infusion', 'label' => '肾上腺素泵入', 'tone' => 'ghost', 'requiresIv' => true],
                ['id' => 'pacing', 'label' => '经皮起搏', 'tone' => 'primary'],
                ['id' => 'sedate', 'label' => '镇静', 'tone' => 'ghost', 'requiresIv' => true],
                ['id' => 'vagal', 'label' => '迷走刺激', 'tone' => 'ghost'],
            ]],
            ['id' => 'assess', 'label' => '评估', 'actions' => [
                ['id' => 'check_pulse', 'label' => '检查脉搏', 'tone' => 'ghost'],
                ['id' => 'check_rhythm', 'label' => '检查心律', 'tone' => 'ghost'],
            ]],
        ];
        if (!empty($scenario['specialAction'])) {
            $groups[] = ['id' => 'special', 'label' => '可逆病因 / 特殊处理', 'actions' => [[
                'id' => 'special',
                'label' => (string) $scenario['specialAction']['label'],
                'tone' => (string) ($scenario['specialAction']['tone'] ?? 'primary'),
            ]]];
        }
        return $groups;
    }

    private static function duoCasePool(): array
    {
        $file = BASE_PATH . '/data/random-cases.php';
        $pool = is_file($file) ? require $file : [];
        return is_array($pool) ? $pool : [];
    }

    private static function randomCase(array $scenario, array $meta, int $index): array
    {
        $ageRange = (array) ($meta['age'] ?? [30, 80]);
        $age = random_int((int) ($ageRange[0] ?? 30), (int) ($ageRange[1] ?? 80));
        $sexes = (array) ($meta['sex'] ?? ['男', '女']);
        $sex = (string) $sexes[array_rand($sexes)];
        $complaints = (array) ($meta['complaint'] ?? [$scenario['patient']['complaint'] ?? '突发意识丧失']);
        $complaint = (string) $complaints[array_rand($complaints)];
        $diagnosis = (string) ($meta['diagnosis'] ?? (string) $scenario['name']);
        $options = array_values(array_unique(array_filter(array_merge(
            [$diagnosis],
            array_map('strval', (array) ($meta['distractors'] ?? []))
        ))));
        $fallbacks = ['心搏停止', '心室颤动', '无脉性室性心动过速', '症状性心动过缓', '快速心房颤动'];
        foreach ($fallbacks as $fallback) {
            if (count($options) >= 4) {
                break;
            }
            if (!in_array($fallback, $options, true)) {
                $options[] = $fallback;
            }
        }
        shuffle($options);
        return [
            'code' => self::duoCode($index),
            'age' => $age,
            'sex' => $sex,
            'weight' => random_int(48, 95),
            'complaint' => $complaint,
            'exam' => array_values(array_map('strval', (array) ($meta['exam'] ?? []))),
            'diagnosis' => $diagnosis,
            'options' => $options,
        ];
    }

    private static function duoEvent(array &$state, string $label, string $tone): void
    {
        $state['events'][] = [
            't' => round(microtime(true) - (float) $state['startedAt'], 1),
            'label' => $label,
            'tone' => $tone,
            'points' => 0,
        ];
        if (count($state['events']) > 120) {
            $state['events'] = array_slice($state['events'], -120);
        }
        $state['dirty'] = true;
    }

    private static function duoCode(int $index): string
    {
        return $index === 0 ? 'A' : 'B';
    }

    private static function duoLockUntil(array $state, string $action, float $now): float
    {
        if (in_array($action, ['cpr_start', 'cpr_stop'], true)) {
            return 0.0;
        }
        foreach (['ivPendingUntil', 'chargeReadyAt', 'postShockUntil'] as $key) {
            if (!empty($state[$key]) && (float) $state[$key] > $now) {
                return (float) $state[$key];
            }
        }
        $seconds = match ($action) {
            'shock' => 2.0,
            'charge' => 3.0,
            'iv' => 6.0,
            'pacing' => 3.0,
            'special' => 2.5,
            'epi_infusion' => 2.5,
            'sedate' => 2.0,
            'oxygen' => 1.5,
            'disarm' => 1.5,
            'check_pulse', 'check_rhythm' => 1.0,
            default => 1.5,
        };
        return $now + $seconds;
    }

    private static function duoActionLabel(string $action): string
    {
        return [
            'iv' => 'IV/IO 建立中',
            'charge' => '除颤器充电中',
            'shock' => '电击后观察',
            'oxygen' => '球囊通气',
            'pacing' => '经皮起搏',
            'sedate' => '镇静',
            'epi' => '肾上腺素推注',
            'amio' => '胺碘酮推注',
            'atropine' => '阿托品推注',
            'adenosine' => 'Adenosine 推注',
            'calcium' => '静脉钙剂',
            'bicarb' => '碳酸氢钠',
            'insulin' => '胰岛素+葡萄糖',
            'epi_infusion' => '肾上腺素泵入',
            'vagal' => '迷走刺激',
            'special' => '特殊处理',
            'disarm' => '解除充电',
            'check_pulse' => '检查脉搏',
            'check_rhythm' => '检查心律',
        ][$action] ?? '处置中';
    }

    private static function isDuoTreatment(string $action): bool
    {
        return in_array($action, [
            'cpr_start', 'iv', 'oxygen', 'charge', 'shock', 'epi', 'amio', 'atropine',
            'pacing', 'epi_infusion', 'sedate', 'calcium', 'bicarb', 'insulin', 'special',
            'adenosine', 'vagal',
        ], true);
    }

    private static function duoSanitizeEvents(array $events): array
    {
        foreach ($events as &$event) {
            if (str_starts_with((string) ($event['label'] ?? ''), '扣分：')) {
                $event['label'] = '操作扣分（详见复盘）';
            }
        }
        unset($event);
        return $events;
    }

    private static function gradeFor(int $score): string
    {
        return $score >= 85 ? 'A' : ($score >= 70 ? 'B' : ($score >= 55 ? 'C' : 'D'));
    }

    private static function load(int $userId, string $sessionId): array
    {
        if (!preg_match('/^[a-f0-9]{24}$/', $sessionId)) {
            throw new ApiError(404, 'session_not_found', '模拟会话不存在');
        }
        $stmt = Db::pdo()->prepare('SELECT * FROM sim_sessions WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$sessionId, $userId]);
        $session = $stmt->fetch();
        if (!$session) throw new ApiError(404, 'session_not_found', '模拟会话不存在');
        return $session;
    }

    private static function saveSession(string $id, array $state, string $status): void
    {
        unset($state['dirty']);
        $stmt = Db::pdo()->prepare('UPDATE sim_sessions SET state = ?, status = ?, updated_at = NOW(3) WHERE id = ?');
        $stmt->execute([self::encode($state), $status, $id]);
    }

    private static function encode(array $data): string
    {
        return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    private static function decode(string $json): array
    {
        $state = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        $state['dirty'] = false;
        return $state;
    }

    private static function createState(int $userId, array $scenario, ?string $id = null, ?float $now = null, ?string $arrivalLabel = null): array
    {
        $now = $now ?? microtime(true);
        $state = [
            'id' => $id ?? bin2hex(random_bytes(12)),
            'userId' => $userId,
            'scenarioId' => (string) $scenario['id'],
            'startedAt' => $now,
            'updatedAt' => $now,
            'rhythm' => (string) $scenario['initialRhythm'],
            'status' => 'active',
            'outcome' => null,
            'endedAt' => null,
            'runId' => null,
            'cpr' => false,
            'cprStartedAt' => null,
            'cprPendingUntil' => null,
            'cprSeconds' => 0.0,
            'cprEpisodes' => 0,
            'firstCprAt' => null,
            'lastCprEnd' => null,
            'cprRate' => null,
            'shocks' => 0,
            'syncShocks' => 0,
            'energyErrors' => 0,
            'syncErrors' => 0,
            'epi' => 0,
            'amio' => 0,
            'atropine' => 0,
            'calcium' => 0,
            'bicarb' => 0,
            'special' => null,
            'specialAt' => null,
            'insulin' => 0,
            'lastEpiAt' => null,
            'lastShockAt' => null,
            'lastAtropineAt' => null,
            'epiErrors' => 0,
            'iv' => false,
            'ivPendingUntil' => null,
            'postShockUntil' => null,
            'postShockOutcome' => null,
            'postShockRhythm' => null,
            'chargeStartedAt' => null,
            'chargeReadyAt' => null,
            'chargeEnergy' => null,
            'chargeSync' => null,
            'chargeAnnounced' => false,
            'oxygen' => false,
            'ventilations' => 0,
            'lastVentAt' => null,
            'sedated' => false,
            'pacing' => false,
            'pacingAt' => null,
            'epiInfusionAt' => null,
            'calciumAt' => null,
            'events' => [],
            'penalties' => [],
            'flags' => [],
            'rng' => random_int(100000, 2000000000),
            'monitorSeed' => random_int(1000, 900000000),
            'vfScale' => 0.88 + random_int(0, 32) / 100,
            'hr' => 0, 'bpSys' => 0, 'bpDia' => 0, 'spo2' => 0, 'etco2' => 0,
            'responsive' => false, 'pulse' => false,
            'lastPhysiologyAt' => $now, 'phase' => 'arrival', 'stage' => 0, 'lastStageAt' => $now,
            'dirty' => false,
        ];
        foreach (self::initialVitals($scenario) as $key => $value) {
            $state[$key] = $value;
        }
        $state['lastPhysiologyAt'] = $now;
        $state['phase'] = 'arrival';
        $state['lastStageAt'] = $now;
        self::event($state, '场景开始：' . ($arrivalLabel ?? (string) $scenario['name']), 'neutral');
        return $state;
    }

    private static function initialVitals(array $scenario): array
    {
        return match ($scenario['algorithm']) {
            'vf' => ['hr' => 0, 'bpSys' => 0, 'bpDia' => 0, 'spo2' => 62, 'etco2' => 0, 'responsive' => false, 'pulse' => false],
            'tachy' => $scenario['initialRhythm'] === 'af_fast'
                ? ['hr' => 152, 'bpSys' => 82, 'bpDia' => 48, 'spo2' => 93, 'etco2' => 30, 'responsive' => true, 'pulse' => true]
                : ['hr' => 190, 'bpSys' => 82, 'bpDia' => 48, 'spo2' => 93, 'etco2' => 30, 'responsive' => true, 'pulse' => true],
            'brady' => ['hr' => 32, 'bpSys' => 76, 'bpDia' => 40, 'spo2' => 94, 'etco2' => 32, 'responsive' => false, 'pulse' => true],
            'hyperk' => ['hr' => 70, 'bpSys' => 0, 'bpDia' => 0, 'spo2' => 55, 'etco2' => 0, 'responsive' => false, 'pulse' => false],
            'pea' => ['hr' => 42, 'bpSys' => 0, 'bpDia' => 0, 'spo2' => 64, 'etco2' => 0, 'responsive' => false, 'pulse' => false],
            default => ['hr' => 0, 'bpSys' => 0, 'bpDia' => 0, 'spo2' => 70, 'etco2' => 0, 'responsive' => false, 'pulse' => false],
        };
    }

    private static function setPhase(array &$state, string $phase, string $label): void
    {
        if (($state['phase'] ?? '') === $phase) return;
        $state['phase'] = $phase;
        $state['dirty'] = true;
        self::event($state, '病情阶段：' . $label, in_array($phase, ['critical', 'arrest'], true) ? 'bad' : 'warn');
    }

    private static function evolve(array &$state, array $scenario, float $now): void
    {
        if (($state['status'] ?? '') !== 'active') return;
        $last = (float) ($state['lastPhysiologyAt'] ?? $state['startedAt']);
        if ($now <= $last) return;
        $state['lastPhysiologyAt'] = $now;
        $elapsed = max(0, $now - (float) $state['startedAt']);
        $algorithm = $scenario['algorithm'];

        if ($state['rhythm'] === 'post_shock') {
            $state['hr'] = 0;
            $state['bpSys'] = 0;
            $state['bpDia'] = 0;
            $state['spo2'] = 45;
            $state['etco2'] = 0;
            $state['responsive'] = false;
            $state['pulse'] = false;
            self::setPhase($state, 'post-shock', '电击后观察');
            $state['dirty'] = true;
            return;
        }

        if ($algorithm === 'brady') {
            if ($state['pacing']) {
                $state['hr'] = 70;
                $state['bpSys'] = 105;
                $state['bpDia'] = 65;
                $state['spo2'] = 96;
                $state['etco2'] = 35;
                $state['responsive'] = true;
                $state['pulse'] = true;
                self::setPhase($state, 'stabilized', '起搏后稳定');
            } elseif (!empty($state['epiInfusionAt'])) {
                $state['hr'] = 68;
                $state['bpSys'] = 102;
                $state['bpDia'] = 62;
                $state['spo2'] = 96;
                $state['etco2'] = 34;
                $state['responsive'] = true;
                $state['pulse'] = true;
                self::setPhase($state, 'stabilized', '药物支持后稳定');
            } else {
                $boost = 0;
                if (!empty($state['lastAtropineAt'])) {
                    $decay = max(0, 1 - ($now - (float) $state['lastAtropineAt']) / 90);
                    $boost = $state['atropine'] * 10 * $decay;
                }
                $state['hr'] = max(12, (int) round(32 - $elapsed * 0.18 + $boost));
                $state['bpSys'] = max(38, (int) round(76 - $elapsed * 0.35 + $boost * 0.8));
                $state['bpDia'] = max(24, (int) round(40 - $elapsed * 0.2 + $boost * 0.4));
                $state['spo2'] = max(70, (int) round(94 - max(0, $elapsed - 20) * 0.12));
                $state['etco2'] = max(16, (int) round(32 - $elapsed * 0.08));
                $state['responsive'] = $state['hr'] >= 45 && $state['bpSys'] >= 70;
                $state['pulse'] = true;
                if ($elapsed < 30) self::setPhase($state, 'compensated', '代偿期');
                elseif ($elapsed < 90) self::setPhase($state, 'decompensated', '失代偿：心率与血压下降');
                else self::setPhase($state, 'critical', '濒危：需立即起搏/药物支持');
                if ($elapsed > 45 && !isset($state['flags']['brady_worse'])) {
                    $state['flags']['brady_worse'] = true;
                    self::event($state, '患者意识模糊、血压进一步下降', 'bad');
                }
            }
            $state['dirty'] = true;
            return;
        }

        if ($algorithm === 'tachy') {
            $base = $state['rhythm'] === 'af_fast' ? 152 : 190;
            $state['hr'] = max(120, (int) round($base + sin($elapsed / 9) * 6 - $elapsed * 0.02));
            $state['bpSys'] = max(42, (int) round(82 - $elapsed * 0.18));
            $state['bpDia'] = max(26, (int) round(48 - $elapsed * 0.1));
            $state['spo2'] = max(76, (int) round(93 - max(0, $elapsed - 30) * 0.05));
            $state['etco2'] = 30;
            $state['responsive'] = $state['bpSys'] > 65;
            $state['pulse'] = true;
            if ($elapsed < 30) self::setPhase($state, 'unstable', '血流动力学不稳定');
            elseif ($elapsed < 90) self::setPhase($state, 'decompensated', '失代偿：低血压/意识改变');
            else self::setPhase($state, 'critical', '濒危：需立即起搏/药物支持');
            if ($elapsed > 45 && !isset($state['flags']['tachy_worse'])) {
                $state['flags']['tachy_worse'] = true;
                self::event($state, '患者出现意识模糊、末梢湿冷', 'bad');
            }
            $state['dirty'] = true;
            return;
        }

        if ($algorithm === 'pea') {
            $state['hr'] = max(16, (int) round(42 - $elapsed * 0.05));
            $state['bpSys'] = 0;
            $state['bpDia'] = 0;
            $state['etco2'] = 0;
            $state['responsive'] = false;
            $state['pulse'] = false;
            if ($state['cpr']) {
                $state['bpSys'] = 78;
                $state['bpDia'] = 46;
                $state['spo2'] = 82;
                $state['etco2'] = 17;
            } else {
                $state['spo2'] = max(18, (int) round(64 - $elapsed * 0.25));
            }
            self::setPhase($state, 'peri-arrest', 'PEA：有电活动但无有效灌注');
            $state['dirty'] = true;
            return;
        }

        if ($algorithm === 'hyperk') {
            $state['hr'] = max(18, (int) round(70 - $elapsed * 0.12));
            $state['spo2'] = max(20, (int) round(55 - $elapsed * 0.3));
            $state['bpSys'] = 0;
            $state['bpDia'] = 0;
            $state['etco2'] = 0;
            $state['responsive'] = false;
            $state['pulse'] = false;
            if ($state['cpr']) {
                $state['bpSys'] = 80;
                $state['bpDia'] = 48;
                $state['spo2'] = 84;
                $state['etco2'] = 18;
            }
            self::setPhase($state, 'peri-arrest', '围停搏期：高钾/无脉电活动');
            $state['dirty'] = true;
            return;
        }

        // VF/pVT 及默认心脏骤停场景
        $state['hr'] = 0;
        $state['responsive'] = false;
        $state['pulse'] = false;
        if ($state['cpr']) {
            $state['bpSys'] = 82;
            $state['bpDia'] = 50;
            $state['spo2'] = 86;
            $state['etco2'] = 20;
            self::setPhase($state, 'cpr', 'CPR 进行中');
        } else {
            $state['bpSys'] = 0;
            $state['bpDia'] = 0;
            $state['spo2'] = max(20, (int) round(62 - $elapsed * 0.35));
            $state['etco2'] = 0;
            self::setPhase($state, 'arrest', '心脏骤停');
            if ($elapsed > 30 && empty($state['flags']['vf_fine'])) {
                $state['flags']['vf_fine'] = true;
                self::event($state, 'VF 振幅逐渐降低，转为细颤；除颤成功率下降', 'bad');
            }
            if ($elapsed > 45 && empty($state['flags']['vf_critical'])) {
                $state['flags']['vf_critical'] = true;
                self::event($state, 'VF 持续 45 秒：心肌缺血、酸中毒加重，除颤成功率进一步下降', 'bad');
            }
        }
        $lastCprEnd = (float) ($state['lastCprEnd'] ?? $state['startedAt']);
        $noCprSeconds = $state['cpr'] ? 0 : max(0, $now - $lastCprEnd);
        if (!$state['cpr'] && $noCprSeconds > 30 && !isset($state['flags']['vf_hypoxia'])) {
            $state['flags']['vf_hypoxia'] = true;
            self::event($state, '已超过 30 秒未进行有效胸外按压，组织缺氧与酸中毒加重', 'bad');
        }
        if (!$state['cpr'] && $noCprSeconds > 60 && empty($state['flags']['patient_dead'])) {
            $state['flags']['patient_dead'] = true;
            $state['hr'] = 0;
            $state['bpSys'] = 0;
            $state['bpDia'] = 0;
            $state['spo2'] = 0;
            $state['etco2'] = 0;
            $state['pulse'] = false;
            $state['responsive'] = false;
            $state['rhythm'] = 'asystole';
            self::setPhase($state, 'arrest', '心脏骤停：无有效灌注');
            self::event($state, '持续无有效按压，患者死亡（模拟终止）', 'bad');
        }
        $state['dirty'] = true;
    }

    private static function advance(array &$state, array $scenario, ?float $now = null): ?string
    {
        $now = $now ?? microtime(true);
        $elapsed = max(0, $now - (float) $state['startedAt']);
        $algorithm = $scenario['algorithm'];
        $cpr = (bool) $state['cpr'];

        if (!empty($state['cprPendingUntil']) && $now >= (float) $state['cprPendingUntil']) {
            self::completeCprStart($state, $now);
        }

        if (!empty($state['ivPendingUntil']) && $now >= (float) $state['ivPendingUntil']) {
            $state['iv'] = true;
            $state['ivPendingUntil'] = null;
            self::event($state, 'IV/IO 通路已建立，可给予静脉药物', 'good');
            $state['dirty'] = true;
        }

        if (!empty($state['postShockUntil']) && $now >= (float) $state['postShockUntil']) {
            $outcome = $state['postShockOutcome'] ?? null;
            $restore = (string) ($state['postShockRhythm'] ?? 'vf');
            $state['postShockUntil'] = null;
            $state['postShockRhythm'] = null;
            $state['postShockOutcome'] = null;
            if ($outcome !== null) {
                $state['rhythm'] = 'rosc';
                $state['dirty'] = true;
                return $outcome;
            }
            $state['rhythm'] = $restore;
            self::event($state, '电击后心律恢复为 ' . $restore . '，立即恢复或继续 CPR', 'warn');
            $state['dirty'] = true;
        }

        if (!empty($state['chargeReadyAt']) && !$state['chargeAnnounced'] && $now >= (float) $state['chargeReadyAt']) {
            $state['chargeAnnounced'] = true;
            self::event($state, '除颤器充电完成，可放电（确认无人接触患者）', 'good');
            $state['dirty'] = true;
        }

        self::evolve($state, $scenario, $now);
        if (!empty($state['flags']['patient_dead'])) {
            return 'timeout';
        }
        if ($algorithm === 'pea' && $state['cpr'] && $state['epi'] >= 1 && !empty($state['specialAt']) && $now - (float) $state['specialAt'] > 12) {
            return 'rosc';
        }
        if (!empty($scenario['specialAction']) && empty($state['specialAt']) && $elapsed > 90 && !isset($state['flags']['late_special'])) {
            self::penalty($state, 8, '未及时处理可逆病因：' . $scenario['specialAction']['label']);
            $state['flags']['late_special'] = true;
        }
        if (in_array($algorithm, ['vf', 'hyperk', 'pea'], true) && !$state['cpr']) {
            $lastCpr = (float) ($state['lastCprEnd'] ?? $state['startedAt']);
            if ($now - $lastCpr > 60 && empty($state['flags']['patient_dead'])) {
                $state['flags']['patient_dead'] = true;
                $state['hr'] = 0;
                $state['bpSys'] = 0;
                $state['bpDia'] = 0;
                $state['spo2'] = 0;
                $state['etco2'] = 0;
                $state['pulse'] = false;
                $state['responsive'] = false;
                $state['rhythm'] = 'asystole';
                self::setPhase($state, 'arrest', '心脏骤停：无有效灌注');
                self::event($state, '持续无有效按压，患者死亡（模拟终止）', 'bad');
                return 'timeout';
            }
        }

        if ($algorithm === 'vf' || $algorithm === 'hyperk') {
            $last = $state['lastCprEnd'] ?? $state['startedAt'];
            if (!$cpr && $now - $last > 10 && !isset($state['flags']['no_cpr_10'])) {
                self::penalty($state, 8, '胸外按压中断超过 10 秒');
                $state['flags']['no_cpr_10'] = true;
            }
            if (!$cpr && $now - $last > 30 && !isset($state['flags']['no_cpr_30'])) {
                self::penalty($state, 10, '长时间未进行胸外按压');
                $state['flags']['no_cpr_30'] = true;
            }
            if ($algorithm === 'vf' && !$state['lastShockAt'] && $elapsed > 45 && !isset($state['flags']['late_shock'])) {
                self::penalty($state, 8, '可除颤心律未及时除颤');
                $state['flags']['late_shock'] = true;
            }
        }

        if ($algorithm === 'brady') {
            if (!$state['pacing'] && $state['atropine'] < 2 && $elapsed > 60 && !isset($state['flags']['late_brady'])) {
                self::penalty($state, 8, '症状性心动过缓未及时处理');
                $state['flags']['late_brady'] = true;
            }
            if ($state['pacing'] && $state['pacingAt'] && $now - $state['pacingAt'] > 10) {
                return 'stable';
            }
            if ($state['epiInfusionAt'] && $now - $state['epiInfusionAt'] > 10) {
                return 'stable';
            }
            if ($state['atropine'] >= 2 && $state['lastAtropineAt'] && $now - $state['lastAtropineAt'] > 35) {
                return 'stable';
            }
        }

        if ($algorithm === 'tachy' && !$state['sedated'] && $elapsed > 90 && !isset($state['flags']['late_unsedated'])) {
            self::penalty($state, 5, '不稳定快速心律未及时镇静/电复律');
            $state['flags']['late_unsedated'] = true;
        }

        if ($algorithm === 'hyperk') {
            if ($state['calcium'] < 1 && $elapsed > 60 && !isset($state['flags']['late_calcium'])) {
                self::penalty($state, 10, '疑似高钾未及时静脉钙剂稳定心肌');
                $state['flags']['late_calcium'] = true;
            }
            if ($state['calcium'] >= 1 && $state['epi'] >= 1 && $cpr && $state['calciumAt'] && $now - $state['calciumAt'] > 20) {
                return 'rosc';
            }
        }

        if ($elapsed >= (int) $scenario['maxDuration']) {
            return 'timeout';
        }
        return null;
    }

    private static function cprStart(array &$state, float $now): void
    {
        if ($state['cpr']) {
            throw new ApiError(422, 'cpr_active', '胸外按压已在进行');
        }
        if (!empty($state['cprPendingUntil'])) {
            $remaining = max(0, (int) ceil($state['cprPendingUntil'] - $now));
            throw new ApiError(422, 'cpr_pending', "正在准备胸外按压，约需 {$remaining} 秒");
        }
        if (!empty($state['pulse']) && !in_array($state['rhythm'], ['vf', 'pvt', 'pea', 'asystole', 'post_shock'], true)) {
            self::penalty($state, 8, '患者有脉搏时开始胸外按压');
            self::event($state, '当前有脉搏：不应开始胸外按压，应评估心律并处理病因', 'bad');
            $state['dirty'] = true;
            return;
        }
        $delay = random_int(3, 5);
        $state['cprPendingUntil'] = $now + $delay;
        self::event($state, "准备开始高质量胸外按压（约 {$delay} 秒，按压前确认环境与体位）", 'neutral');
        $state['dirty'] = true;
    }

    private static function completeCprStart(array &$state, float $now): void
    {
        $state['cprPendingUntil'] = null;
        $state['cpr'] = true;
        $state['cprStartedAt'] = $now;
        $state['cprEpisodes']++;
        if (!$state['firstCprAt']) $state['firstCprAt'] = $now;
        $state['lastCprEnd'] = null;
        unset($state['flags']['no_cpr_10'], $state['flags']['no_cpr_30'], $state['flags']['vf_hypoxia']);
        self::event($state, '高质量胸外按压开始（100–120 次/分）', 'good');
        if (!empty($state['ivPendingUntil'])) {
            $state['ivPendingUntil'] = max((float) $state['ivPendingUntil'], $now + 8);
            self::event($state, '按压开始后 IV/IO 建立变慢，通路预计还需约 8 秒', 'warn');
        }
        $state['dirty'] = true;
    }

    private static function cprStop(array &$state, array $payload, float $now): void
    {
        if (!empty($state['cprPendingUntil'])) {
            $state['cprPendingUntil'] = null;
            self::event($state, '取消胸外按压准备', 'neutral');
            $state['dirty'] = true;
            return;
        }
        if (!$state['cpr']) {
            throw new ApiError(422, 'cpr_inactive', '当前未在按压');
        }
        $duration = max(0, $now - (float) $state['cprStartedAt']);
        $state['cprSeconds'] = (float) $state['cprSeconds'] + $duration;
        $state['cpr'] = false;
        $state['cprStartedAt'] = null;
        $state['lastCprEnd'] = $now;
        $rate = isset($payload['rate']) ? (int) $payload['rate'] : null;
        if ($rate !== null) $state['cprRate'] = $rate;
        $label = '暂停按压';
        if ($rate !== null) $label .= "（按压频率约 {$rate} 次/分）";
        self::event($state, $label, 'neutral');
        $state['dirty'] = true;
    }

    private static function charge(array &$state, array $scenario, array $payload, float $now): void
    {
        if (!empty($state['postShockUntil'])) {
            throw new ApiError(422, 'post_shock', '电击后观察期，不能充电');
        }
        if (!empty($state['chargeReadyAt'])) {
            throw new ApiError(422, 'already_charged', '除颤器已充电；请停止按压后放电，或等待当前电击流程完成');
        }
        $algorithm = $scenario['algorithm'];
        if ($algorithm === 'vf') {
            if (!in_array($state['rhythm'], ['vf', 'pvt'], true)) {
                throw new ApiError(422, 'not_shockable', '当前心律不是可除颤心律');
            }
        } elseif ($algorithm === 'tachy') {
            if (!in_array($state['rhythm'], ['svt', 'af_fast'], true)) {
                throw new ApiError(422, 'not_tachy', '当前心律不是快速性心律失常');
            }
        } else {
            throw new ApiError(422, 'not_shockable', '当前场景不适合电击/复律');
        }
        $energy = max(0, min(360, (int) ($payload['energy'] ?? 0)));
        if ($energy < 20) {
            throw new ApiError(422, 'invalid_energy', '请选择有效能量');
        }
        $sync = (bool) ($payload['sync'] ?? false);
        $duo = !empty($state['duoMode']);
        $state['chargeStartedAt'] = $now;
        // In the dual-patient mode charging is a single button press; the
        // mandatory 3-second hands-off pause happens around the discharge.
        $state['chargeReadyAt'] = $duo ? $now : $now + 3.0;
        $state['chargeEnergy'] = $energy;
        $state['chargeSync'] = $sync;
        $state['chargeAnnounced'] = $duo;
        self::event(
            $state,
            $duo
                ? "除颤器已充电 {$energy} J（" . ($sync ? '同步' : '非同步') . '）'
                : "除颤器开始充电 {$energy} J（约 3 秒）",
            'neutral'
        );
        $state['dirty'] = true;
    }

    private static function clearCharge(array &$state): void
    {
        $state['chargeStartedAt'] = null;
        $state['chargeReadyAt'] = null;
        $state['chargeEnergy'] = null;
        $state['chargeSync'] = null;
        $state['chargeAnnounced'] = false;
    }

    private static function shock(array &$state, array $scenario, array $payload, float $now): void
    {
        if ($state['cpr']) {
            throw new ApiError(422, 'stop_cpr_first', '请先暂停胸外按压，再除颤/复律');
        }
        if (!empty($state['cprPendingUntil'])) {
            throw new ApiError(422, 'cpr_pending', '胸外按压准备中，暂缓电击');
        }
        if (!empty($state['postShockUntil'])) {
            throw new ApiError(422, 'post_shock', '电击后观察期，请等待心律稳定并立即恢复按压');
        }
        if (!empty($state['ivPendingUntil'])) {
            self::penalty($state, 8, 'IV/IO 建立过程中除颤，通路建立中断，需要重新建立');
            $state['ivPendingUntil'] = null;
            self::event($state, '除颤中断了 IV/IO 建立，静脉通路需从头重新建立', 'bad');
            $state['dirty'] = true;
        }
        $algorithm = $scenario['algorithm'];
        if (!in_array($algorithm, ['vf', 'tachy'], true)) {
            self::penalty($state, 18, '对不可除颤心律/心动过缓使用电击');
            self::event($state, '电击禁忌：当前心律不应除颤', 'bad');
            $state['dirty'] = true;
            return;
        }
        $energy = max(0, min(360, (int) ($payload['energy'] ?? 0)));
        $sync = (bool) ($payload['sync'] ?? false);
        if (empty($state['chargeReadyAt']) || $now < (float) $state['chargeReadyAt']) {
            $remaining = !empty($state['chargeReadyAt']) ? max(1, (int) ceil($state['chargeReadyAt'] - $now)) : 0;
            throw new ApiError(422, 'not_charged', $remaining > 0 ? "除颤器仍在充电，约需 {$remaining} 秒" : '请先给除颤器充电，再放电');
        }
        if ((int) ($state['chargeEnergy'] ?? 0) !== $energy || (bool) ($state['chargeSync'] ?? false) !== $sync) {
            self::clearCharge($state);
            throw new ApiError(422, 'charge_mismatch', '能量或同步模式已改变，请重新充电');
        }
        self::clearCharge($state);
        $algorithm = $scenario['algorithm'];

        if ($algorithm === 'vf') {
            if (!in_array($state['rhythm'], ['vf', 'pvt'], true)) {
                throw new ApiError(422, 'not_shockable', '当前心律不是可除颤心律');
            }
            if ($sync) {
                $state['syncErrors']++;
                self::penalty($state, 12, 'VF/无脉性 VT 使用同步模式（应非同步除颤）');
                return;
            }
            if ($energy < 120 || $energy > 200) {
                $state['energyErrors']++;
                self::penalty($state, 6, '双相除颤能量不在 120–200 J 范围');
            }
            $state['shocks']++;
            $state['lastShockAt'] = $now;
            $state['postShockRhythm'] = 'vf';
            $state['postShockUntil'] = $now + 2.2;
            $state['rhythm'] = 'post_shock';
            self::event($state, "非同步除颤 {$energy} J", 'good');
            self::event($state, '电击后短暂心室静止，观察约 2 秒；若未恢复立即恢复按压', 'warn');
            $chance = [0.30, 0.55, 0.75, 0.86, 0.92][min(4, $state['shocks'] - 1)] ?? 0.92;
            $elapsed = $now - (float) $state['startedAt'];
            if (!empty($state['flags']['vf_fine'])) $chance -= 0.12;
            if ($elapsed > 45) $chance -= 0.08;
            if ($elapsed > 60) $chance -= 0.08;
            if ($state['epi'] > 0) $chance += 0.04;
            if ($state['amio'] > 0) $chance += 0.04;
            if (!empty($state['specialAt'])) $chance += 0.08;
            if (self::random($state) < $chance) {
                $state['postShockOutcome'] = 'rosc';
                self::event($state, '除颤成功：电击后过渡心律，等待自主循环恢复', 'good');
            } else {
                $state['postShockOutcome'] = null;
                self::event($state, '除颤未成功：电击后短暂静止，准备立即恢复按压', 'warn');
            }
            $state['dirty'] = true;
            return;
        }

        if ($algorithm === 'tachy') {
            if (!in_array($state['rhythm'], ['svt', 'af_fast'], true)) {
                throw new ApiError(422, 'not_tachy', '当前心律不是快速性心律失常');
            }
            if (!$sync) {
                $state['syncErrors']++;
                self::penalty($state, 15, '有脉快速心律使用非同步电击（应同步电复律）');
                return;
            }
            $state['syncShocks']++;
            $state['shocks']++;
            $state['lastShockAt'] = $now;
            $expected = in_array($state['rhythm'], ['svt', 'atrial_tachy', 'atrial_flutter'], true)
                ? [50, 100]
                : (in_array($state['rhythm'], ['af', 'af_fast'], true) ? [120, 200] : ($state['rhythm'] === 'vt' ? [100, 200] : [120, 200]));
            if ($energy < $expected[0] || $energy > $expected[1]) {
                $state['energyErrors']++;
                self::penalty($state, 6, '同步电复律能量不在推荐范围');
            }
            if (!$state['sedated']) {
                self::penalty($state, 5, '有意识患者电复律前未镇静');
            }
            self::event($state, "同步电复律 {$energy} J", 'good');
            $previousRhythm = $state['rhythm'];
            $state['postShockRhythm'] = $previousRhythm;
            $state['postShockUntil'] = $now + 1.8;
            $state['rhythm'] = 'post_shock';
            $state['postShockOutcome'] = null;
            $chance = $state['shocks'] >= 2 ? 0.95 : 0.85;
            if (self::random($state) < $chance) {
                $state['postShockOutcome'] = 'stable';
                self::event($state, '电复律成功：短暂停搏后等待窦性心律恢复', 'good');
            } else {
                self::event($state, '电复律未成功：过渡 1.8 秒后评估原心律', 'warn');
            }
            $state['dirty'] = true;
            return;
        }

        self::penalty($state, 18, '对不可除颤心律/心动过缓使用电击');
        self::event($state, '电击禁忌：当前心律不应除颤', 'bad');
        $state['dirty'] = true;
    }

    private static function stopCprForShock(array &$state, float $now): void
    {
        if ($state['cpr']) {
            $state['cprSeconds'] = (float) $state['cprSeconds'] + max(0, $now - (float) $state['cprStartedAt']);
            $state['cpr'] = false;
            $state['cprStartedAt'] = null;
            $state['lastCprEnd'] = $now;
            self::event($state, '除颤前暂停按压（中断应 <10 s）', 'neutral');
        }
    }

    private static function epi(array &$state, array $scenario, float $now): void
    {
        self::requireIv($state);
        $algorithm = $scenario['algorithm'];
        if (in_array($algorithm, ['vf'], true)) {
            if ($state['shocks'] < 2) self::penalty($state, 5, '可除颤心律过早给予肾上腺素（应在初始除颤失败后）');
            if ($state['lastEpiAt'] && $now - $state['lastEpiAt'] < 180) {
                $state['epiErrors']++;
                self::penalty($state, 5, '肾上腺素间隔 <3 分钟');
            }
            $state['epi']++;
            $state['lastEpiAt'] = $now;
            self::event($state, '肾上腺素 1 mg IV/IO', 'good');
        } elseif (in_array($algorithm, ['hyperk', 'pea'], true)) {
            if ($state['lastEpiAt'] && $now - $state['lastEpiAt'] < 180) {
                $state['epiErrors']++;
                self::penalty($state, 4, '肾上腺素间隔 <3 分钟');
            }
            $state['epi']++;
            $state['lastEpiAt'] = $now;
            self::event($state, '肾上腺素 1 mg IV/IO', 'good');
        } else {
            self::penalty($state, 6, '该场景不推荐肾上腺素静推（考虑泵入）');
            self::event($state, '肾上腺素使用场景不匹配', 'warn');
        }
        $state['dirty'] = true;
    }

    private static function amio(array &$state, array $scenario, float $now): void
    {
        self::requireIv($state);
        if ($scenario['algorithm'] !== 'vf') {
            self::penalty($state, 6, '该场景不常规使用胺碘酮');
            return;
        }
        if ($state['shocks'] < 2) self::penalty($state, 6, '胺碘酮应在数次除颤/肾上腺素后考虑');
        if ($state['amio'] >= 2) {
            self::penalty($state, 8, '胺碘酮总量不宜超过 450 mg');
            return;
        }
        $state['amio']++;
        self::event($state, $state['amio'] === 1 ? '胺碘酮 300 mg IV' : '胺碘酮 150 mg IV', 'good');
        $state['dirty'] = true;
    }

    private static function atropine(array &$state, array $scenario, float $now): void
    {
        if ($scenario['algorithm'] !== 'brady') {
            self::penalty($state, 8, '该场景不适用阿托品');
            return;
        }
        self::requireIv($state);
        if ($state['atropine'] >= 3) {
            self::penalty($state, 6, '阿托品总量已达 3 mg');
            return;
        }
        if ($state['lastAtropineAt'] && $now - $state['lastAtropineAt'] < 180) {
            self::penalty($state, 4, '阿托品间隔 <3 分钟');
        }
        $state['atropine']++;
        $state['lastAtropineAt'] = $now;
        self::event($state, '阿托品 1 mg IV（第 ' . $state['atropine'] . ' 剂）', 'good');
        $state['dirty'] = true;
    }

    private static function pacing(array &$state, array $scenario, float $now): void
    {
        if ($scenario['algorithm'] !== 'brady') {
            self::penalty($state, 8, '该场景不适用经皮起搏');
            return;
        }
        $state['pacing'] = true;
        $state['pacingAt'] = $now;
        $state['hr'] = 70;
        $state['bpSys'] = 105;
        $state['bpDia'] = 65;
        $state['spo2'] = 96;
        $state['etco2'] = 35;
        $state['responsive'] = true;
        $state['pulse'] = true;
        self::setPhase($state, 'stabilized', '起搏后稳定');
        self::event($state, '开启经皮起搏（TCP）', 'good');
        $state['dirty'] = true;
    }

    private static function epiInfusion(array &$state, array $scenario, float $now): void
    {
        if ($scenario['algorithm'] !== 'brady') {
            self::penalty($state, 6, '该场景不适用肾上腺素泵入');
            return;
        }
        self::requireIv($state);
        $state['epiInfusionAt'] = $now;
        $state['hr'] = 68;
        $state['bpSys'] = 102;
        $state['bpDia'] = 62;
        $state['spo2'] = 96;
        $state['responsive'] = true;
        $state['pulse'] = true;
        self::event($state, '肾上腺素 2–10 μg/min 泵入', 'good');
        $state['dirty'] = true;
    }

    private static function iv(array &$state, float $now): void
    {
        if ($state['iv']) {
            self::event($state, '静脉通路已建立', 'neutral');
            return;
        }
        if (!empty($state['ivPendingUntil'])) {
            $remaining = max(0, (int) ceil($state['ivPendingUntil'] - $now));
            self::event($state, "IV/IO 正在建立，还需约 {$remaining} 秒", 'neutral');
            return;
        }
        $duringCpr = $state['cpr'] || !empty($state['cprPendingUntil']);
        $seconds = $duringCpr ? 12 : 6;
        $state['ivPendingUntil'] = $now + $seconds;
        self::event($state, $duringCpr ? '开始建立 IV/IO 通路（按压中约 12 秒，期间不能给静脉药）' : '开始建立 IV/IO 通路（约 6 秒，期间不能给静脉药）', 'neutral');
        $state['dirty'] = true;
    }

    private static function oxygen(array &$state, array $scenario, float $now): void
    {
        $last = (float) ($state['lastVentAt'] ?? 0);
        if ($last > 0 && $now - $last < 3) {
            self::penalty($state, 2, '球囊通气过频（应配合 30:2/每 6 秒一次）');
            self::event($state, '通气过频：上次通气后不足 3 秒', 'warn');
            return;
        }
        $state['oxygen'] = true;
        $state['ventilations'] = (int) ($state['ventilations'] ?? 0) + 1;
        $state['lastVentAt'] = $now;
        $label = $scenario['algorithm'] === 'vf' || $scenario['algorithm'] === 'hyperk'
            ? '球囊面罩通气：可见胸廓起伏（第 ' . $state['ventilations'] . ' 次）'
            : '给予吸氧，监测 SpO₂';
        self::event($state, $label, 'good');
        if (in_array($scenario['algorithm'], ['vf', 'hyperk'], true) && !$state['cpr']) {
            self::event($state, '当前没有胸外按压：单次通气不能产生有效循环，请立即开始 CPR', 'warn');
        }
        $state['dirty'] = true;
    }

    private static function disarm(array &$state): void
    {
        if (empty($state['chargeStartedAt']) && empty($state['chargeReadyAt'])) {
            self::event($state, '当前没有已充电的能量', 'neutral');
            return;
        }
        self::clearCharge($state);
        self::event($state, '解除充电（内部放电），能量/同步模式已解锁；请重新选择后充电', 'warn');
        $state['dirty'] = true;
    }

    private static function sedate(array &$state, array $scenario): void
    {
        if ($scenario['algorithm'] !== 'tachy') {
            self::penalty($state, 4, '该场景不需要镇静');
            return;
        }
        self::requireIv($state);
        if ($state['sedated']) return;
        $state['sedated'] = true;
        self::event($state, '电复律前镇静', 'good');
        $state['dirty'] = true;
    }

    private static function calcium(array &$state, array $scenario, float $now): void
    {
        if ($scenario['algorithm'] !== 'hyperk') {
            self::penalty($state, 8, '该场景不推荐静脉钙剂');
            return;
        }
        self::requireIv($state);
        if ($state['calcium'] >= 1) return;
        $state['calcium']++;
        $state['calciumAt'] = $now;
        self::event($state, '静脉钙剂稳定心肌（葡萄糖酸钙/氯化钙）', 'good');
        $state['dirty'] = true;
    }

    private static function bicarb(array &$state, array $scenario, float $now): void
    {
        if ($scenario['algorithm'] !== 'hyperk') {
            self::penalty($state, 4, '该场景暂不推荐碳酸氢钠');
            return;
        }
        self::requireIv($state);
        $state['bicarb']++;
        self::event($state, '碳酸氢钠（合并酸中毒时考虑）', 'neutral');
        $state['dirty'] = true;
    }

    private static function insulin(array &$state, array $scenario, float $now): void
    {
        if ($scenario['algorithm'] !== 'hyperk') {
            self::penalty($state, 4, '该场景不推荐胰岛素-葡萄糖');
            return;
        }
        self::requireIv($state);
        $state['insulin']++;
        self::event($state, '胰岛素 + 葡萄糖促钾转移', 'good');
        $state['dirty'] = true;
    }

    private static function adenosine(array &$state, array $scenario, float $now): void
    {
        if ($scenario['algorithm'] !== 'tachy') {
            self::penalty($state, 6, '该场景不适用 Adenosine');
            return;
        }
        self::requireIv($state);
        if ($state['rhythm'] !== 'svt') {
            self::penalty($state, 6, '房颤/宽 QRS 心律不宜仅用 Adenosine');
            return;
        }
        self::event($state, 'Adenosine 6 mg 快速静推', 'neutral');
        if (self::random($state) < 0.65) {
            $state['rhythm'] = 'rosc';
            self::event($state, 'Adenosine 终止心动过速', 'good');
            self::completeTransition($state, $scenario, 'stable');
        } else {
            self::event($state, 'Adenosine 未终止，考虑同步电复律', 'warn');
        }
        $state['dirty'] = true;
    }

    private static function vagal(array &$state, array $scenario, float $now): void
    {
        if ($scenario['algorithm'] !== 'tachy' || $state['rhythm'] !== 'svt') {
            self::event($state, '迷走刺激对该心律无效', 'warn');
            return;
        }
        self::event($state, '改良 Valsalva/迷走刺激', 'neutral');
        if (self::random($state) < 0.25) {
            $state['rhythm'] = 'rosc';
            self::event($state, '迷走刺激终止心动过速', 'good');
            self::completeTransition($state, $scenario, 'stable');
        } else {
            self::event($state, '未终止，需药物或电复律', 'warn');
        }
        $state['dirty'] = true;
    }

    private static function completeTransition(array &$state, array $scenario, string $outcome): void
    {
        if (!empty($state['duoMode'])) {
            $state['pendingOutcome'] = $outcome;
            $state['dirty'] = true;
            return;
        }
        self::finalize($state, $scenario, $outcome, (int) $state['userId'], 0);
    }

    private static function check(array &$state, string $label, float $now): void
    {
        if ($state['cpr']) {
            // 检查心律/脉搏必须先停止按压；不能只提示“中断”却继续按压。
            $state['cprSeconds'] = (float) $state['cprSeconds'] + max(0, $now - (float) $state['cprStartedAt']);
            $state['cpr'] = false;
            $state['cprStartedAt'] = null;
            $state['lastCprEnd'] = $now;
            self::penalty($state, 5, '按压过程中不应停顿检查脉搏/心律');
            self::event($state, $label . '：已暂停按压，检查后需重新开始 CPR', 'bad');
        } else {
            self::event($state, $label . '：无脉搏' . ($state['rhythm'] === 'vf' ? '，仍为 VF' : ''), 'neutral');
        }
        $state['dirty'] = true;
    }

    private static function requireIv(array &$state): void
    {
        if (!empty($state['ivPendingUntil'])) {
            $remaining = max(1, (int) ceil($state['ivPendingUntil'] - microtime(true)));
            throw new ApiError(422, 'iv_pending', "IV/IO 通路正在建立，还需约 {$remaining} 秒");
        }
        if (!$state['iv']) {
            throw new ApiError(422, 'no_iv', '请先建立静脉/骨内通路（IV/IO）');
        }
    }

    private static function penalty(array &$state, int $points, string $reason): void
    {
        $elapsed = microtime(true) - (float) $state['startedAt'];
        $state['penalties'][] = ['t' => round($elapsed, 1), 'points' => $points, 'reason' => $reason];
        self::event($state, '扣分：' . $reason, 'bad', -$points);
        $state['dirty'] = true;
    }

    private static function event(array &$state, string $label, string $tone, int $points = 0): void
    {
        $elapsed = microtime(true) - (float) $state['startedAt'];
        $state['events'][] = [
            't' => round($elapsed, 1),
            'label' => $label,
            'tone' => $tone,
            'points' => $points,
        ];
        if (count($state['events']) > 120) {
            $state['events'] = array_slice($state['events'], -120);
        }
    }

    private static function random(array &$state): float
    {
        $state['rng'] = (int) (($state['rng'] * 1103515245 + 12345) % 2147483648);
        return $state['rng'] / 2147483648;
    }

    private static function finalize(array &$state, array $scenario, string $outcome, int $userId, int $existingRun): void
    {
        if ($state['status'] !== 'active') return;
        if ($state['cpr'] && $state['cprStartedAt']) {
            $state['cprSeconds'] = (float) $state['cprSeconds'] + max(0, microtime(true) - (float) $state['cprStartedAt']);
            $state['cpr'] = false;
            $state['cprStartedAt'] = null;
        }
        $state['status'] = 'ended';
        $state['endedAt'] = microtime(true);
        $state['outcome'] = $outcome;
        $duration = max(1, (int) round($state['endedAt'] - (float) $state['startedAt']));

        $score = 100;
        foreach ($state['penalties'] as $penalty) $score -= (int) $penalty['points'];
        $firstCpr = $state['firstCprAt'] ? (float) $state['firstCprAt'] - (float) $state['startedAt'] : null;
        if ($firstCpr !== null && $firstCpr <= 10) $score += 10;
        $cprRatio = $duration > 0 ? (float) $state['cprSeconds'] / $duration : 0;
        if ($cprRatio >= 0.5) $score += 10;
        if (in_array($outcome, ['rosc', 'stable'], true)) $score += 20;
        if ($state['syncErrors'] === 0) $score += 5;
        if ($state['energyErrors'] === 0) $score += 5;
        if ($state['epiErrors'] === 0) $score += 5;
        $processScore = max(0, min(100, $score));
        $successfulOutcome = in_array($outcome, ['rosc', 'stable'], true);
        if ($successfulOutcome) {
            $score = $processScore;
            $grade = $score >= 85 ? 'A' : ($score >= 70 ? 'B' : ($score >= 55 ? 'C' : 'D'));
        } else {
            // 抢救失败/提前终止一律 0 分，不能用流程分“洗白”结局。
            $score = 0;
            $grade = 'D';
            self::event($state, $outcome === 'timeout' ? '结局：时限内未恢复自主循环，患者死亡（0 分）' : '结局：未恢复自主循环/提前终止（0 分）', 'bad');
        }
        $state['score'] = $score;
        $state['grade'] = $grade;
        $state['cprRatio'] = round($cprRatio, 2);
        $state['dirty'] = false;

        $pdo = Db::pdo();
        if ($existingRun > 0) {
            $stmt = $pdo->prepare('UPDATE sim_runs SET score = ?, grade = ?, outcome = ?, actions = ?, duration_s = ? WHERE id = ?');
            $stmt->execute([$score, $grade, $outcome, self::encode($state['events']), $duration, $existingRun]);
            $runId = $existingRun;
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO sim_runs (user_id, scenario_id, score, grade, outcome, actions, duration_s)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([
                $userId,
                $scenario['id'],
                $score,
                $grade,
                $outcome,
                self::encode($state['events']),
                $duration,
            ]);
            $runId = (int) $pdo->lastInsertId();
            $xp = $successfulOutcome ? max(5, (int) round($score / 4)) : 0;
            if ($xp > 0) $pdo->prepare('UPDATE users SET xp = xp + ? WHERE id = ?')->execute([$xp, $userId]);
        }
        $state['runId'] = $runId;
        self::saveSession($state['id'], $state, 'ended');
    }

    private static function view(array $state, array $scenario, int $userId): array
    {
        $now = microtime(true);
        $elapsed = min((int) $scenario['maxDuration'], max(0, (int) round($now - (float) $state['startedAt'])));
        $cpr = (bool) $state['cpr'];
        $ended = $state['status'] !== 'active';
        $vitals = self::vitals($state, $scenario, $cpr, $ended);
        $rhythmSpec = self::monitorSpec($state, $scenario);
        return [
            'sessionId' => $state['id'],
            'scenario' => array_diff_key($scenario, ['algorithm' => true]),
            'status' => $state['status'],
            'outcome' => $state['outcome'],
            'elapsed' => $elapsed,
            'remaining' => max(0, (int) $scenario['maxDuration'] - $elapsed),
            'maxDuration' => (int) $scenario['maxDuration'],
            'rhythm' => $state['rhythm'],
            'phase' => $state['phase'] ?? 'arrival',
            'phaseLabel' => self::phaseLabel((string) ($state['phase'] ?? 'arrival')),
            'monitor' => $rhythmSpec,
            'vitals' => $vitals,
            'cpr' => $cpr,
            'flags' => [
                'iv' => (bool) $state['iv'],
                'ivPending' => !empty($state['ivPendingUntil']),
                'ivReadyIn' => !empty($state['ivPendingUntil']) ? max(0, (int) ceil($state['ivPendingUntil'] - $now)) : 0,
                'cprPending' => !empty($state['cprPendingUntil']),
                'cprReadyIn' => !empty($state['cprPendingUntil']) ? max(0, (int) ceil($state['cprPendingUntil'] - $now)) : 0,
                'oxygen' => (bool) $state['oxygen'],
                'ventilations' => (int) ($state['ventilations'] ?? 0),
                'sedated' => (bool) $state['sedated'],
                'pacing' => (bool) $state['pacing'],
                'postShock' => !empty($state['postShockUntil']),
                'chargeReady' => !empty($state['chargeReadyAt']) && $now >= (float) $state['chargeReadyAt'],
                'chargeInProgress' => !empty($state['chargeReadyAt']) && $now < (float) $state['chargeReadyAt'],
                'chargeReadyIn' => !empty($state['chargeReadyAt']) ? max(0, (int) ceil((float) $state['chargeReadyAt'] - $now)) : 0,
                'chargeEnergy' => $state['chargeEnergy'] !== null ? (int) $state['chargeEnergy'] : null,
                'chargeSync' => $state['chargeSync'],
            ],
            'metrics' => [
                'shocks' => (int) $state['shocks'],
                'syncShocks' => (int) $state['syncShocks'],
                'epi' => (int) $state['epi'],
                'amio' => (int) $state['amio'],
                'atropine' => (int) $state['atropine'],
                'calcium' => (int) $state['calcium'],
                'cprSeconds' => (int) round((float) $state['cprSeconds'] + ($cpr && $state['cprStartedAt'] ? $now - $state['cprStartedAt'] : 0)),
                'cprEpisodes' => (int) $state['cprEpisodes'],
            ],
            'events' => array_slice($state['events'], -24),
            'actions' => self::actionsFor($scenario, $state),
            'hint' => $ended ? null : self::hint($scenario, $state, $elapsed),
            'score' => $ended ? ($state['score'] ?? null) : null,
            'grade' => $ended ? ($state['grade'] ?? null) : null,
            'runId' => $state['runId'] ?? null,
            'aiAvailable' => Ai::configured(),
        ];
    }

    private static function cprVitals(array $state, int $bpSys, int $bpDia, int $spo2, int $etco2): array
    {
        // 胸外按压会在监护仪上产生节律性伪差；这里的“心率”是按压频率估计，不是自主循环。
        $t = microtime(true);
        $base = 108;
        $jitter = (int) round(sin($t * 1.7) * 4 + sin($t * 0.83) * 3 + random_int(-1, 1));
        $etco2Jitter = (int) round(sin($t * 0.9) * 2);
        $lastVent = (float) ($state['lastVentAt'] ?? 0);
        $ventBoost = $lastVent > 0 && ($t - $lastVent) < 10 ? 1 : 0;
        return [
            'hr' => max(92, min(122, $base + $jitter)),
            'bpSys' => $bpSys + (int) round(sin($t * 0.7) * 2),
            'bpDia' => $bpDia + (int) round(sin($t * 0.6) * 1),
            'spo2' => max(70, min(96, $spo2 + $ventBoost * 4 + (int) round(sin($t * 0.5) * 2))),
            'etco2' => max(8, $etco2 + $ventBoost * 3 + $etco2Jitter),
            'responsive' => false,
            'pulse' => false,
            'hrSource' => 'cpr',
            'hrLabel' => '按压频率',
        ];
    }

    private static function vitals(array $state, array $scenario, bool $cpr, bool $ended): array
    {
        if ($ended && in_array($state['outcome'], ['rosc', 'stable'], true)) {
            return ['hr' => 92, 'bpSys' => 108, 'bpDia' => 66, 'spo2' => 96, 'etco2' => 35, 'responsive' => true, 'pulse' => true];
        }
        if ($ended) {
            return ['hr' => 0, 'bpSys' => 0, 'bpDia' => 0, 'spo2' => 0, 'etco2' => 0, 'responsive' => false, 'pulse' => false];
        }
        if ($state['rhythm'] === 'post_shock') {
            return $cpr
                ? self::cprVitals($state, 78, 42, 82, 14)
                : ['hr' => 0, 'bpSys' => 0, 'bpDia' => 0, 'spo2' => 55, 'etco2' => 0, 'responsive' => false, 'pulse' => false];
        }
        if ($cpr && in_array($scenario['algorithm'], ['vf', 'hyperk'], true)) {
            return self::cprVitals($state, 82, 50, 86, 20);
        }
        return [
            'hr' => (int) ($state['hr'] ?? 0),
            'bpSys' => (int) ($state['bpSys'] ?? 0),
            'bpDia' => (int) ($state['bpDia'] ?? 0),
            'spo2' => (int) ($state['spo2'] ?? 0),
            'etco2' => (int) ($state['etco2'] ?? 0),
            'responsive' => (bool) ($state['responsive'] ?? false),
            'pulse' => (bool) ($state['pulse'] ?? false),
        ];
    }

    private static function phaseLabel(string $phase): string
    {
        return [
            'arrival' => '就诊评估',
            'compensated' => '代偿期',
            'unstable' => '血流动力学不稳定',
            'decompensated' => '失代偿期',
            'critical' => '濒危',
            'stabilized' => '已稳定',
            'arrest' => '心脏骤停',
            'cpr' => 'CPR 进行中',
            'post-shock' => '电击后观察',
            'peri-arrest' => '围停搏期',
        ][$phase] ?? $phase;
    }

    private static function monitorSpec(array $state, array $scenario): array
    {
        $base = [
            'rhythm' => 'sinus', 'rate' => 72, 'atrialRate' => 72, 'p' => 'normal', 'pr' => 0.16,
            'qrs' => 0.08, 'morphology' => 'normal', 'axis' => 'normal',
            'st' => ['elevation' => [], 'depression' => [], 'shape' => 'normal'],
            't' => ['shape' => 'normal', 'amp' => 1], 'u' => 0, 'qt' => 0.38,
            'extras' => [], 'annotations' => [], 'duration' => 4, 'seed' => 5,
        ];
        $base['seed'] = 5 + ((int) ($state['monitorSeed'] ?? 0) % 500000);
        if ($state['status'] !== 'active' && in_array($state['outcome'], ['rosc', 'stable'], true)) {
            return array_replace($base, ['rate' => 92, 'atrialRate' => 92, 'description' => '恢复自主循环，窦性心律。']);
        }
        $elapsed = max(0, microtime(true) - (float) $state['startedAt']);
        $cprArtifact = !empty($state['cpr']) && in_array($scenario['algorithm'], ['vf', 'hyperk'], true) ? 1 : 0;
        if ($scenario['algorithm'] === 'hyperk') {
            $rate = max(16, (int) ($state['hr'] ?? 40));
            $qrs = min(0.20, 0.10 + $elapsed * 0.00025);
            $spec = array_replace($base, [
                'rhythm' => 'sinus', 'rate' => $rate, 'atrialRate' => $rate,
                'p' => 'flattened', 'pr' => 0.22, 'qrs' => $qrs, 'morphology' => 'hyperk',
                't' => ['shape' => 'peaked', 'amp' => 2.4], 'qt' => 0.4,
                'cprArtifact' => $cprArtifact,
                'description' => '高钾血症：QRS 增宽、P 波低平、T 波高尖；无脉电活动。',
            ]);
            if ($elapsed > 150) {
                $spec['sineWave'] = true;
                $spec['description'] = '极重度高钾：正弦波，濒临心搏停止。';
            }
            return $spec;
        }
        if ($scenario['algorithm'] === 'brady' && !empty($state['pacing'])) {
            return array_replace($base, [
                'rhythm' => 'paced', 'rate' => 70, 'atrialRate' => 70, 'p' => 'absent',
                'qrs' => 0.17, 'qt' => 0.44, 'description' => '经皮起搏心律：起搏钉后宽 QRS，确认夺获与机械收缩。',
            ]);
        }
        return match ($state['rhythm']) {
            'vf' => array_replace($base, ['rhythm' => 'vf', 'rate' => 0, 'p' => 'absent', 'extras' => ['fibrillatory'], 'seed' => ((int) ($state['monitorSeed'] ?? 37)) % 2000000000, 'cprArtifact' => $cprArtifact, 'vfAmplitude' => !empty($state['flags']['vf_fine']) ? 0.55 : (float) ($state['vfScale'] ?? 1), 'description' => !empty($state['flags']['vf_fine']) ? '细颤：振幅低、频率快，除颤成功率下降。' : '粗颤：振幅较高，立即 CPR 并尽快除颤。']),
            'pvt' => array_replace($base, ['rhythm' => 'vt', 'rate' => 200, 'qrs' => 0.17, 'morphology' => 'wide', 'p' => 'absent', 't' => ['shape' => 'discordant', 'amp' => 1.1], 'description' => '宽 QRS 心动过速，无脉。']),
            'svt' => array_replace($base, ['rhythm' => 'svt', 'rate' => (int) ($state['hr'] ?? 190), 'atrialRate' => (int) ($state['hr'] ?? 190), 'p' => 'hidden', 'qrs' => 0.07, 'seed' => $base['seed'] + 3, 'description' => '窄 QRS 规则心动过速。']),
            'af_fast' => array_replace($base, ['rhythm' => 'af', 'rate' => (int) ($state['hr'] ?? 152), 'atrialRate' => 400, 'irregularity' => 0.24, 'p' => 'absent', 'extras' => ['fibrillatory'], 'seed' => $base['seed'] + 7, 'description' => '快速心房颤动。']),
            'post_shock' => array_replace($base, ['rhythm' => 'asystole', 'rate' => 0, 'p' => 'absent', 'cprArtifact' => $cprArtifact, 'description' => '电击后短暂心室静止（约 2 秒），观察心律。']),
            'brady' => array_replace($base, ['rate' => (int) ($state['hr'] ?? 32), 'atrialRate' => (int) ($state['hr'] ?? 32), 'qt' => 0.46, 'description' => '症状性心动过缓，心率约 ' . (int) ($state['hr'] ?? 32) . ' 次/分。']),
            'asystole' => array_replace($base, ['rhythm' => 'asystole', 'rate' => 0, 'p' => 'absent', 'qrs' => 0.16, 'cprArtifact' => $cprArtifact, 'description' => '心搏停止。']),
            'pea' => array_replace($base, ['rhythm' => 'aivr', 'rate' => (int) ($state['hr'] ?? 70), 'atrialRate' => (int) ($state['hr'] ?? 70), 'qrs' => 0.14, 'morphology' => 'wide', 'p' => 'absent', 'description' => '有组织电活动但无脉（PEA）。']),
            default => $base,
        };
    }

    private static function actionsFor(array $scenario, array $state): array
    {
        $algorithm = $scenario['algorithm'];
        $groups = [];
        if ($algorithm === 'vf') {
            $groups[] = ['id' => 'bls', 'label' => '基础生命支持', 'actions' => [
                ['id' => 'cpr_start', 'label' => '开始胸外按压', 'tone' => 'primary'],
                ['id' => 'cpr_stop', 'label' => '暂停按压', 'tone' => 'ghost'],
                ['id' => 'oxygen', 'label' => '球囊面罩通气', 'tone' => 'ghost'],
                ['id' => 'iv', 'label' => '建立 IV/IO', 'tone' => 'ghost'],
            ]];
            $groups[] = ['id' => 'shock', 'label' => '电治疗', 'actions' => [
                ['id' => 'shock', 'label' => '非同步除颤', 'tone' => 'danger', 'requiresEnergy' => true, 'sync' => false],
            ]];
            $groups[] = ['id' => 'drugs', 'label' => '药物', 'actions' => [
                ['id' => 'epi', 'label' => '肾上腺素 1 mg', 'tone' => 'warn', 'requiresIv' => true],
                ['id' => 'amio', 'label' => '胺碘酮 300 mg', 'tone' => 'ghost', 'requiresIv' => true],
            ]];
        } elseif ($algorithm === 'tachy') {
            $groups[] = ['id' => 'assess', 'label' => '评估与准备', 'actions' => [
                ['id' => 'iv', 'label' => '建立 IV', 'tone' => 'ghost'],
                ['id' => 'oxygen', 'label' => '吸氧', 'tone' => 'ghost'],
                ['id' => 'sedate', 'label' => '镇静', 'tone' => 'ghost', 'requiresIv' => true],
                ['id' => 'vagal', 'label' => '迷走刺激', 'tone' => 'ghost'],
            ]];
            $groups[] = ['id' => 'shock', 'label' => '电治疗', 'actions' => [
                ['id' => 'shock', 'label' => '同步电复律', 'tone' => 'danger', 'requiresEnergy' => true, 'sync' => true],
            ]];
            $groups[] = ['id' => 'drugs', 'label' => '药物', 'actions' => [
                ['id' => 'adenosine', 'label' => 'Adenosine 6 mg', 'tone' => 'ghost', 'requiresIv' => true],
            ]];
        } elseif ($algorithm === 'brady') {
            $groups[] = ['id' => 'assess', 'label' => '评估与准备', 'actions' => [
                ['id' => 'iv', 'label' => '建立 IV', 'tone' => 'ghost'],
                ['id' => 'oxygen', 'label' => '吸氧', 'tone' => 'ghost'],
            ]];
            $groups[] = ['id' => 'drugs', 'label' => '药物', 'actions' => [
                ['id' => 'atropine', 'label' => '阿托品 1 mg', 'tone' => 'warn', 'requiresIv' => true],
                ['id' => 'epi_infusion', 'label' => '肾上腺素泵入', 'tone' => 'ghost', 'requiresIv' => true],
            ]];
            $groups[] = ['id' => 'pacing', 'label' => '起搏', 'actions' => [
                ['id' => 'pacing', 'label' => '经皮起搏', 'tone' => 'primary'],
            ]];
        } elseif ($algorithm === 'pea') {
            $groups[] = ['id' => 'bls', 'label' => '基础生命支持', 'actions' => [
                ['id' => 'cpr_start', 'label' => '开始胸外按压', 'tone' => 'primary'],
                ['id' => 'cpr_stop', 'label' => '暂停按压', 'tone' => 'ghost'],
                ['id' => 'oxygen', 'label' => '球囊面罩通气', 'tone' => 'ghost'],
                ['id' => 'iv', 'label' => '建立 IV/IO', 'tone' => 'ghost'],
            ]];
            $groups[] = ['id' => 'drugs', 'label' => '药物与可逆病因', 'actions' => [
                ['id' => 'epi', 'label' => '肾上腺素 1 mg', 'tone' => 'warn', 'requiresIv' => true],
            ]];
        } else {
            $groups[] = ['id' => 'bls', 'label' => '基础生命支持', 'actions' => [
                ['id' => 'cpr_start', 'label' => '开始胸外按压', 'tone' => 'primary'],
                ['id' => 'cpr_stop', 'label' => '暂停按压', 'tone' => 'ghost'],
                ['id' => 'oxygen', 'label' => '球囊面罩通气', 'tone' => 'ghost'],
                ['id' => 'iv', 'label' => '建立 IV/IO', 'tone' => 'ghost'],
            ]];
            $groups[] = ['id' => 'drugs', 'label' => '药物与可逆病因', 'actions' => [
                ['id' => 'epi', 'label' => '肾上腺素 1 mg', 'tone' => 'warn', 'requiresIv' => true],
                ['id' => 'calcium', 'label' => '静脉钙剂', 'tone' => 'warn', 'requiresIv' => true],
                ['id' => 'bicarb', 'label' => '碳酸氢钠', 'tone' => 'ghost', 'requiresIv' => true],
                ['id' => 'insulin', 'label' => '胰岛素+葡萄糖', 'tone' => 'ghost', 'requiresIv' => true],
            ]];
        }
        if (!empty($scenario['specialAction'])) {
            $groups[] = ['id' => 'special', 'label' => '可逆病因 / 特殊处理', 'actions' => [[
                'id' => 'special',
                'label' => (string) $scenario['specialAction']['label'],
                'tone' => (string) ($scenario['specialAction']['tone'] ?? 'primary'),
            ]]];
        }
        $groups[] = ['id' => 'assess', 'label' => '评估', 'actions' => [
            ['id' => 'check_pulse', 'label' => '检查脉搏', 'tone' => 'ghost'],
            ['id' => 'check_rhythm', 'label' => '检查心律', 'tone' => 'ghost'],
            ['id' => 'finish', 'label' => '结束并复盘', 'tone' => 'ghost'],
        ]];
        return $groups;
    }

    private static function hint(array $scenario, array $state, int $elapsed): string
    {
        $algorithm = $scenario['algorithm'];
        if ($algorithm === 'pea') {
            if (empty($state['cpr'])) return 'PEA：立即开始高质量 CPR；肾上腺素每 3–5 分钟，同时寻找低血容量等可逆病因。';
            if (empty($state['specialAt'])) return 'PEA 有电活动但无脉：快速补液/输血并控制出血，不要除颤。';
            return '可逆病因正在处理：继续 CPR，评估脉搏与心律，准备转送确定性止血。';
        }
        if (!empty($scenario['specialAction']) && empty($state['specialAt']) && $elapsed > 60) {
            return '本场景需同时处理特殊可逆病因：' . $scenario['specialAction']['label'] . '。';
        }
        if (!empty($state['postShockUntil'])) {
            return '电击后短暂心室静止：立即恢复高质量按压；约 2 秒后评估心律，准备下一次除颤。';
        }
        if (!empty($state['chargeReadyAt'])) {
            if ($state['cpr']) return '除颤器已充电：先停止胸外按压，确认无人接触患者，再放电。';
            return '除颤器已充电：确认无人接触患者，立即放电；放电后立即恢复按压。';
        }
        if (!empty($state['ivPendingUntil'])) {
            $remaining = max(1, (int) ceil($state['ivPendingUntil'] - microtime(true)));
            return "IV/IO 通路建立中，还需约 {$remaining} 秒；通路完成前不能给静脉药。";
        }
        if ($algorithm === 'brady' && empty($state['pacing']) && empty($state['epiInfusionAt'])) {
            $hr = (int) ($state['hr'] ?? 32);
            if ($hr <= 24) return '心率持续下降、灌注恶化：立即准备经皮起搏或肾上腺素泵入，不能继续等待。';
            if (!empty($state['lastAtropineAt']) && microtime(true) - $state['lastAtropineAt'] > 45) return '阿托品作用开始衰减：评估起搏或肾上腺素泵入。';
        }
        if ($algorithm === 'tachy' && (int) ($state['bpSys'] ?? 82) < 65) {
            return '低血压进行性加重：立即电复律，不要只等待药物起效。';
        }
        if ($algorithm === 'vf') {
            if (!$state['cpr']) return '患者无脉。立即开始高质量胸外按压；除颤前必须先停止按压。';
            $etco2 = (int) ($state['etco2'] ?? 0);
            if ($etco2 > 0 && $etco2 < 10) return 'ETCO₂ 偏低：检查按压深度/频率、回弹与通气，避免过度通气；按压质量差时除颤成功率下降。';
            if ($etco2 >= 40) return 'ETCO₂ 突然升高：立即检查脉搏与心律，可能是自主循环恢复（ROSC）的最早信号。';
            if ($state['shocks'] === 0) return '可除颤心律：尽快选择电治疗并充电，放电后立即恢复按压。';
            if ($state['shocks'] < 2) return '继续 CPR 2 分钟；初始除颤失败后（通常第二次除颤后）考虑肾上腺素 1 mg。';
            if ($state['epi'] === 0) return '可给予肾上腺素 1 mg IV/IO，每 3–5 分钟重复。';
            if ($state['amio'] === 0) return '难治性 VF 可加胺碘酮 300 mg，同时寻找可逆病因。';
            return '持续高质量 CPR，减少按压中断，评估可逆病因。';
        }
        if ($algorithm === 'tachy') {
            if (!$state['iv']) return '有脉但不稳定：先建立 IV、吸氧，并准备电复律。';
            if (!$state['sedated']) return '有意识患者电复律前应镇静。';
            return '有脉但不稳定：选择电复律并充电，注意有意识者先镇静。';
        }
        if ($algorithm === 'brady') {
            if ($state['atropine'] === 0) return '症状性心动过缓：阿托品 1 mg IV，每 3–5 分钟可重复，最大 3 mg。';
            if ($state['atropine'] < 2) return '阿托品效果不足时可重复；准备经皮起搏或肾上腺素泵入。';
            return '阿托品无效：尽快经皮起搏或肾上腺素 2–10 μg/min。';
        }
        if ($state['calcium'] === 0) return '无脉电活动：CPR + 肾上腺素；结合透析病史考虑高钾，尽快静脉钙剂。';
        return '继续 CPR，纠正高钾（钙剂、胰岛素+葡萄糖、碳酸氢钠），尽早透析。';
    }

    private static function specialAction(array &$state, array $scenario, float $now): void
    {
        $special = $scenario['specialAction'] ?? null;
        if (!$special) {
            throw new ApiError(422, 'no_special_action', '当前场景没有特殊处理');
        }
        if (!empty($state['specialAt'])) {
            throw new ApiError(422, 'special_done', '该特殊处理已完成');
        }
        if (($special['id'] ?? '') === 'cesarean' && $state['cpr'] === false) {
            self::penalty($state, 4, '围死亡期剖宫产前应持续 CPR');
        }
        $state['special'] = (string) ($special['id'] ?? 'special');
        $state['specialAt'] = $now;
        self::event($state, (string) ($special['label'] ?? '执行特殊处理'), 'good');
        $state['dirty'] = true;
    }

    private static function localReview(?array $scenario, array $events, int $score, string $outcome): array
    {
        $review = [];
        $actions = array_filter($events, static fn (array $e): bool => ($e['points'] ?? 0) < 0);
        foreach (array_slice($actions, 0, 6) as $event) {
            $detail = (string) ($event['label'] ?? '');
            if (str_starts_with($detail, '扣分：')) {
                $detail = mb_substr($detail, 3, null, 'UTF-8');
            }
            if (($event['patient'] ?? null) !== null && $event['patient'] !== '') {
                $detail = '[' . $event['patient'] . '] ' . $detail;
            }
            $review[] = ['tone' => 'bad', 'title' => '扣分操作', 'detail' => $detail];
        }
        $good = array_filter($events, static fn (array $e): bool => ($e['tone'] ?? '') === 'good');
        if ($good !== []) {
            $review[] = ['tone' => 'good', 'title' => '关键正确操作', 'detail' => implode('；', array_slice(array_column($good, 'label'), 0, 4))];
        }
        if ($outcome === 'timeout') {
            $review[] = ['tone' => 'warn', 'title' => '超时', 'detail' => '未在时限内稳定患者。优先识别心律并执行关键步骤。'];
        }
        if ($score >= 85) {
            $review[] = ['tone' => 'good', 'title' => '处置质量', 'detail' => '流程与关键动作完成度高。继续保持按压质量与团队沟通。'];
        } elseif ($score >= 70) {
            $review[] = ['tone' => 'warn', 'title' => '处置质量', 'detail' => '核心流程基本正确，注意减少按压中断与核对能量/同步模式。'];
        } else {
            $review[] = ['tone' => 'bad', 'title' => '处置质量', 'detail' => '优先复习对应 ACLS 流程：识别心律 → 关键动作 → 药物时序 → 可逆病因。'];
        }
        return array_slice($review, 0, 8);
    }

    private static function metricsFromEvents(array $events): array
    {
        $firstCpr = null;
        foreach ($events as $event) {
            if (($event['label'] ?? '') !== '' && str_contains((string) $event['label'], '开始高质量')) {
                $firstCpr = $event['t'] ?? null;
                break;
            }
        }
        return [
            'firstCprAt' => $firstCpr,
            'eventCount' => count($events),
            'lastEvent' => $events[count($events) - 1]['label'] ?? '',
        ];
    }
}
