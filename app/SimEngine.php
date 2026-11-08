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
        $state = [
            'id' => bin2hex(random_bytes(12)),
            'userId' => $userId,
            'scenarioId' => $scenarioId,
            'startedAt' => $now,
            'updatedAt' => $now,
            'rhythm' => (string) $scenario['initialRhythm'],
            'status' => 'active',
            'outcome' => null,
            'endedAt' => null,
            'runId' => null,
            'cpr' => false,
            'cprStartedAt' => null,
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
            'insulin' => 0,
            'lastEpiAt' => null,
            'lastShockAt' => null,
            'lastAtropineAt' => null,
            'epiErrors' => 0,
            'iv' => false,
            'oxygen' => false,
            'sedated' => false,
            'pacing' => false,
            'pacingAt' => null,
            'epiInfusionAt' => null,
            'calciumAt' => null,
            'events' => [],
            'penalties' => [],
            'flags' => [],
            'rng' => random_int(100000, 2000000000),
            'dirty' => false,
        ];
        self::event($state, '场景开始：' . $scenario['name'], 'neutral');
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

        match ($action) {
            'cpr_start' => self::cprStart($state, $now),
            'cpr_stop' => self::cprStop($state, $payload, $now),
            'shock' => self::shock($state, $scenario, $payload, $now),
            'epi' => self::epi($state, $scenario, $now),
            'amio' => self::amio($state, $scenario, $now),
            'atropine' => self::atropine($state, $scenario, $now),
            'pacing' => self::pacing($state, $scenario, $now),
            'epi_infusion' => self::epiInfusion($state, $scenario, $now),
            'iv' => self::iv($state),
            'oxygen' => self::oxygen($state),
            'sedate' => self::sedate($state, $scenario),
            'calcium' => self::calcium($state, $scenario, $now),
            'bicarb' => self::bicarb($state, $scenario, $now),
            'insulin' => self::insulin($state, $scenario, $now),
            'adenosine' => self::adenosine($state, $scenario, $now),
            'vagal' => self::vagal($state, $scenario, $now),
            'check_pulse' => self::check($state, '检查脉搏', $now),
            'check_rhythm' => self::check($state, '检查心律', $now),
            'finish' => self::finalize($state, $scenario, 'aborted', $userId, 0),
            default => throw new ApiError(422, 'invalid_action', '未知操作'),
        };

        if ($state['status'] === 'active') {
            $state['updatedAt'] = $now;
            self::saveSession($sessionId, $state, 'active');
        }
        return self::view($state, $scenario, $userId);
    }

    public static function debrief(int $userId, int $runId): array
    {
        $stmt = Db::pdo()->prepare('SELECT * FROM sim_runs WHERE id = ? AND user_id = ? LIMIT 1');
        $stmt->execute([$runId, $userId]);
        $run = $stmt->fetch();
        if (!$run) throw new ApiError(404, 'run_not_found', '复盘记录不存在');
        $scenario = self::scenario($run['scenario_id']);
        $events = json_decode((string) $run['actions'], true) ?: [];
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
            'metrics' => $metrics,
            'review' => self::localReview($scenario, $events, (int) $run['score'], $run['outcome']),
            'aiAvailable' => Ai::configured(),
        ];
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

    private static function advance(array &$state, array $scenario, ?float $now = null): ?string
    {
        $now = $now ?? microtime(true);
        $elapsed = max(0, $now - (float) $state['startedAt']);
        $algorithm = $scenario['algorithm'];
        $cpr = (bool) $state['cpr'];

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
        $state['cpr'] = true;
        $state['cprStartedAt'] = $now;
        $state['cprEpisodes']++;
        if (!$state['firstCprAt']) $state['firstCprAt'] = $now;
        $state['lastCprEnd'] = null;
        unset($state['flags']['no_cpr_10'], $state['flags']['no_cpr_30']);
        self::event($state, '开始高质量胸外按压（100–120 次/分）', 'good');
        $state['dirty'] = true;
    }

    private static function cprStop(array &$state, array $payload, float $now): void
    {
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

    private static function shock(array &$state, array $scenario, array $payload, float $now): void
    {
        $energy = max(0, min(360, (int) ($payload['energy'] ?? 0)));
        $sync = (bool) ($payload['sync'] ?? false);
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
            self::stopCprForShock($state, $now);
            $state['shocks']++;
            $state['lastShockAt'] = $now;
            self::event($state, "非同步除颤 {$energy} J", 'good');
            $chance = [0.30, 0.55, 0.75, 0.86, 0.92][min(4, $state['shocks'] - 1)] ?? 0.92;
            if ($state['epi'] > 0) $chance += 0.04;
            if ($state['amio'] > 0) $chance += 0.04;
            if (self::random($state) < $chance) {
                $state['rhythm'] = 'rosc';
                self::event($state, '除颤成功，恢复自主循环（ROSC）', 'good');
                self::finalize($state, $scenario, 'rosc', (int) $state['userId'], 0);
            } else {
                self::event($state, '除颤未成功，立即恢复胸外按压', 'warn');
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
            $expected = $state['rhythm'] === 'svt' ? [50, 100] : [120, 200];
            if ($energy < $expected[0] || $energy > $expected[1]) {
                $state['energyErrors']++;
                self::penalty($state, 6, '同步电复律能量不在推荐范围');
            }
            if (!$state['sedated']) {
                self::penalty($state, 5, '有意识患者电复律前未镇静');
            }
            self::event($state, "同步电复律 {$energy} J", 'good');
            $chance = $state['shocks'] >= 2 ? 0.95 : 0.85;
            if (self::random($state) < $chance) {
                $state['rhythm'] = 'rosc';
                self::event($state, '电复律成功，转复为窦性心律', 'good');
                self::finalize($state, $scenario, 'stable', (int) $state['userId'], 0);
            } else {
                self::event($state, '电复律未成功，可再次同步电复律', 'warn');
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
            if ($state['shocks'] < 2) self::penalty($state, 5, '可除颤心律过早给予肾上腺素（通常第二次除颤后）');
            if ($state['lastEpiAt'] && $now - $state['lastEpiAt'] < 180) {
                $state['epiErrors']++;
                self::penalty($state, 5, '肾上腺素间隔 <3 分钟');
            }
            $state['epi']++;
            $state['lastEpiAt'] = $now;
            self::event($state, '肾上腺素 1 mg IV/IO', 'good');
        } elseif ($algorithm === 'hyperk') {
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
        self::event($state, '肾上腺素 2–10 μg/min 泵入', 'good');
        $state['dirty'] = true;
    }

    private static function iv(array &$state): void
    {
        if ($state['iv']) {
            self::event($state, '静脉通路已建立', 'neutral');
            return;
        }
        $state['iv'] = true;
        self::event($state, '建立静脉/骨内通路', 'good');
        $state['dirty'] = true;
    }

    private static function oxygen(array &$state): void
    {
        if ($state['oxygen']) return;
        $state['oxygen'] = true;
        self::event($state, '给予氧气/球囊面罩通气', 'good');
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
            self::finalize($state, $scenario, 'stable', (int) $state['userId'], 0);
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
            self::finalize($state, $scenario, 'stable', (int) $state['userId'], 0);
        } else {
            self::event($state, '未终止，需药物或电复律', 'warn');
        }
        $state['dirty'] = true;
    }

    private static function check(array &$state, string $label, float $now): void
    {
        if ($state['cpr']) {
            self::penalty($state, 5, '按压过程中不应停顿检查脉搏/心律');
            self::event($state, $label . '：按压中断', 'bad');
        } else {
            self::event($state, $label . '：无脉搏' . ($state['rhythm'] === 'vf' ? '，仍为 VF' : ''), 'neutral');
        }
        $state['dirty'] = true;
    }

    private static function requireIv(array &$state): void
    {
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
        $score = max(0, min(100, $score));
        $grade = $score >= 85 ? 'A' : ($score >= 70 ? 'B' : ($score >= 55 ? 'C' : 'D'));
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
            $pdo->prepare('UPDATE users SET xp = xp + ? WHERE id = ?')->execute([max(5, (int) round($score / 4)), $userId]);
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
            'monitor' => $rhythmSpec,
            'vitals' => $vitals,
            'cpr' => $cpr,
            'flags' => [
                'iv' => (bool) $state['iv'],
                'oxygen' => (bool) $state['oxygen'],
                'sedated' => (bool) $state['sedated'],
                'pacing' => (bool) $state['pacing'],
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

    private static function vitals(array $state, array $scenario, bool $cpr, bool $ended): array
    {
        if ($ended && in_array($state['outcome'], ['rosc', 'stable'], true)) {
            return ['hr' => 92, 'bpSys' => 108, 'bpDia' => 66, 'spo2' => 96, 'etco2' => 35, 'responsive' => true, 'pulse' => true];
        }
        if ($ended) {
            return ['hr' => 0, 'bpSys' => 0, 'bpDia' => 0, 'spo2' => 0, 'etco2' => 0, 'responsive' => false, 'pulse' => false];
        }
        $algorithm = $scenario['algorithm'];
        if ($algorithm === 'vf' || $algorithm === 'hyperk') {
            if ($cpr) {
                return ['hr' => 0, 'bpSys' => 82, 'bpDia' => 50, 'spo2' => 86, 'etco2' => 20, 'responsive' => false, 'pulse' => false];
            }
            return ['hr' => 0, 'bpSys' => 0, 'bpDia' => 0, 'spo2' => 62, 'etco2' => 0, 'responsive' => false, 'pulse' => false];
        }
        if ($algorithm === 'tachy') {
            $hr = $state['rhythm'] === 'af_fast' ? 152 : 190;
            return ['hr' => $hr, 'bpSys' => 82, 'bpDia' => 48, 'spo2' => 93, 'etco2' => 30, 'responsive' => true, 'pulse' => true];
        }
        if ($algorithm === 'brady') {
            $atropineBoost = $state['lastAtropineAt'] && microtime(true) - $state['lastAtropineAt'] < 300 ? $state['atropine'] * 8 : 0;
            $hr = 32 + $atropineBoost + ($state['pacing'] ? 38 : 0);
            $bp = 76 + $atropineBoost * 0.8 + ($state['pacing'] ? 28 : 0);
            return ['hr' => (int) $hr, 'bpSys' => (int) $bp, 'bpDia' => (int) max(30, $bp - 38), 'spo2' => 94, 'etco2' => 32, 'responsive' => $state['pacing'] || $atropineBoost >= 12, 'pulse' => true];
        }
        return ['hr' => 0, 'bpSys' => 0, 'bpDia' => 0, 'spo2' => 0, 'etco2' => 0, 'responsive' => false, 'pulse' => false];
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
        if ($state['status'] !== 'active' && in_array($state['outcome'], ['rosc', 'stable'], true)) {
            return array_replace($base, ['rate' => 92, 'atrialRate' => 92, 'description' => '恢复自主循环，窦性心律。']);
        }
        return match ($state['rhythm']) {
            'vf' => array_replace($base, ['rhythm' => 'vf', 'rate' => 0, 'p' => 'absent', 'extras' => ['fibrillatory'], 'description' => '心室颤动。']),
            'pvt' => array_replace($base, ['rhythm' => 'vt', 'rate' => 200, 'qrs' => 0.17, 'morphology' => 'wide', 'p' => 'absent', 't' => ['shape' => 'discordant', 'amp' => 1.1], 'description' => '宽 QRS 心动过速，无脉。']),
            'svt' => array_replace($base, ['rhythm' => 'svt', 'rate' => 190, 'atrialRate' => 190, 'p' => 'hidden', 'qrs' => 0.07, 'description' => '窄 QRS 规则心动过速。']),
            'af_fast' => array_replace($base, ['rhythm' => 'af', 'rate' => 152, 'atrialRate' => 400, 'irregularity' => 0.24, 'p' => 'absent', 'extras' => ['fibrillatory'], 'description' => '快速心房颤动。']),
            'brady' => array_replace($base, ['rate' => (int) (self::vitals($state, $scenario, false, false)['hr'] ?: 32), 'atrialRate' => 32, 'qt' => 0.46, 'description' => '显著心动过缓。']),
            'asystole' => array_replace($base, ['rhythm' => 'asystole', 'rate' => 0, 'p' => 'absent', 'qrs' => 0.16, 'description' => '心搏停止。']),
            'pea' => array_replace($base, ['rhythm' => 'aivr', 'rate' => 70, 'atrialRate' => 70, 'qrs' => 0.14, 'morphology' => 'wide', 'p' => 'absent', 'description' => '有组织电活动但无脉（PEA）。']),
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
                ['id' => 'epi', 'label' => '肾上腺素 1 mg', 'tone' => 'primary'],
                ['id' => 'amio', 'label' => '胺碘酮 300 mg', 'tone' => 'ghost'],
            ]];
        } elseif ($algorithm === 'tachy') {
            $groups[] = ['id' => 'assess', 'label' => '评估与准备', 'actions' => [
                ['id' => 'iv', 'label' => '建立 IV', 'tone' => 'ghost'],
                ['id' => 'oxygen', 'label' => '吸氧', 'tone' => 'ghost'],
                ['id' => 'sedate', 'label' => '镇静', 'tone' => 'ghost'],
                ['id' => 'vagal', 'label' => '迷走刺激', 'tone' => 'ghost'],
            ]];
            $groups[] = ['id' => 'shock', 'label' => '电治疗', 'actions' => [
                ['id' => 'shock', 'label' => '同步电复律', 'tone' => 'danger', 'requiresEnergy' => true, 'sync' => true],
            ]];
            $groups[] = ['id' => 'drugs', 'label' => '药物', 'actions' => [
                ['id' => 'adenosine', 'label' => 'Adenosine 6 mg', 'tone' => 'ghost'],
            ]];
        } elseif ($algorithm === 'brady') {
            $groups[] = ['id' => 'assess', 'label' => '评估与准备', 'actions' => [
                ['id' => 'iv', 'label' => '建立 IV', 'tone' => 'ghost'],
                ['id' => 'oxygen', 'label' => '吸氧', 'tone' => 'ghost'],
            ]];
            $groups[] = ['id' => 'drugs', 'label' => '药物', 'actions' => [
                ['id' => 'atropine', 'label' => '阿托品 1 mg', 'tone' => 'primary'],
                ['id' => 'epi_infusion', 'label' => '肾上腺素泵入', 'tone' => 'ghost'],
            ]];
            $groups[] = ['id' => 'pacing', 'label' => '起搏', 'actions' => [
                ['id' => 'pacing', 'label' => '经皮起搏', 'tone' => 'primary'],
            ]];
        } else {
            $groups[] = ['id' => 'bls', 'label' => '基础生命支持', 'actions' => [
                ['id' => 'cpr_start', 'label' => '开始胸外按压', 'tone' => 'primary'],
                ['id' => 'cpr_stop', 'label' => '暂停按压', 'tone' => 'ghost'],
                ['id' => 'oxygen', 'label' => '球囊面罩通气', 'tone' => 'ghost'],
                ['id' => 'iv', 'label' => '建立 IV/IO', 'tone' => 'ghost'],
            ]];
            $groups[] = ['id' => 'drugs', 'label' => '药物与可逆病因', 'actions' => [
                ['id' => 'epi', 'label' => '肾上腺素 1 mg', 'tone' => 'primary'],
                ['id' => 'calcium', 'label' => '静脉钙剂', 'tone' => 'danger'],
                ['id' => 'bicarb', 'label' => '碳酸氢钠', 'tone' => 'ghost'],
                ['id' => 'insulin', 'label' => '胰岛素+葡萄糖', 'tone' => 'ghost'],
            ]];
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
        if ($algorithm === 'vf') {
            if (!$state['cpr']) return '患者无脉。立即开始高质量胸外按压（100–120 次/分）。';
            if ($state['shocks'] === 0) return '可除颤心律：尽快非同步除颤（双相 120–200 J），除颤后立即恢复按压。';
            if ($state['shocks'] < 2) return '继续 CPR 2 分钟；第二次除颤后考虑肾上腺素 1 mg。';
            if ($state['epi'] === 0) return '可给予肾上腺素 1 mg IV/IO，每 3–5 分钟重复。';
            if ($state['amio'] === 0) return '难治性 VF 可加胺碘酮 300 mg，同时寻找可逆病因。';
            return '持续高质量 CPR，减少按压中断，评估可逆病因。';
        }
        if ($algorithm === 'tachy') {
            if (!$state['iv']) return '有脉但不稳定：先建立 IV、吸氧，并准备同步电复律。';
            if (!$state['sedated']) return '有意识患者电复律前应镇静。';
            return '选择同步模式电复律：窄 QRS 规则 50–100 J，房颤 120–200 J。';
        }
        if ($algorithm === 'brady') {
            if ($state['atropine'] === 0) return '症状性心动过缓：阿托品 1 mg IV，每 3–5 分钟可重复，最大 3 mg。';
            if ($state['atropine'] < 2) return '阿托品效果不足时可重复；准备经皮起搏或肾上腺素泵入。';
            return '阿托品无效：尽快经皮起搏或肾上腺素 2–10 μg/min。';
        }
        if ($state['calcium'] === 0) return '无脉电活动：CPR + 肾上腺素；结合透析病史考虑高钾，尽快静脉钙剂。';
        return '继续 CPR，纠正高钾（钙剂、胰岛素+葡萄糖、碳酸氢钠），尽早透析。';
    }

    private static function localReview(?array $scenario, array $events, int $score, string $outcome): array
    {
        $review = [];
        $actions = array_filter($events, static fn (array $e): bool => ($e['points'] ?? 0) < 0);
        foreach (array_slice($actions, 0, 6) as $event) {
            $review[] = ['tone' => 'bad', 'title' => '扣分操作', 'detail' => $event['label']];
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
