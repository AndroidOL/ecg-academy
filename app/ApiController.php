<?php
declare(strict_types=1);

namespace App;

final class ApiController
{
    public static function health(array $params = []): void
    {
        Http::ok(['status' => 'ok', 'time' => date(DATE_ATOM)]);
    }

    public static function bootstrap(array $params = []): void
    {
        $user = self::user();
        Auth::touch();
        $stats = Stats::forUser((int) $user['id']);
        Http::ok([
            'user' => Auth::publicUser($user),
            'csrf' => Auth::csrf(),
            'app' => [
                'name' => Config::get('app.name'),
                'version' => Config::get('app.version'),
                'assetVersion' => Config::get('app.asset_version'),
            ],
            'content' => Content::stats(),
            'ai' => Ai::status((int) $user['id']),
            'progress' => $stats['progress'],
            'chapters' => $stats['chapters'],
            'quiz' => $stats['quiz'],
            'sim' => $stats['sim'],
            'leaderboard' => Stats::leaderboard('week'),
            'scenarioCount' => count(SimEngine::scenarios()),
            'bank' => QuestionBank::stats(),
            'features' => [
                'registrationEnabled' => Settings::bool('auth.registration_enabled', true),
                'userLoginEnabled' => Settings::bool('auth.user_login_enabled', true),
            ],
            'site' => [
                'githubUrl' => (string) Settings::get('site.github_url', ''),
                'license' => (string) Settings::get('site.license', ''),
                'copyright' => (string) Settings::get('site.copyright', ''),
                'icp' => (string) Settings::get('site.icp', ''),
            ],
        ]);
    }

    public static function diagnoses(array $params = []): void
    {
        $user = self::user();
        $q = mb_strtolower(trim((string) ($_GET['q'] ?? '')), 'UTF-8');
        $chapter = (string) ($_GET['chapter'] ?? 'all');
        $items = Content::summaries();
        $progress = self::progressMap((int) $user['id']);

        if ($chapter !== 'all' && $chapter !== '') {
            $items = array_values(array_filter($items, static fn (array $d): bool => $d['chapter'] === $chapter));
        }
        if ($q !== '') {
            $items = array_values(array_filter($items, static function (array $d) use ($q): bool {
                $haystack = mb_strtolower($d['name'] . ' ' . $d['en'] . ' ' . implode(' ', $d['tags']) . ' ' . $d['oneLiner'], 'UTF-8');
                return str_contains($haystack, $q);
            }));
        }
        foreach ($items as &$item) {
            $item['status'] = $progress[$item['id']]['status'] ?? null;
        }
        unset($item);

        Http::ok([
            'items' => $items,
            'chapters' => Content::chapters(),
            'stats' => Content::stats(),
        ]);
    }

    public static function diagnosis(array $params): void
    {
        $user = self::user();
        $id = (string) ($params['id'] ?? '');
        $detail = Content::detail($id);
        if (!$detail) throw new ApiError(404, 'diagnosis_not_found', '未找到该诊断');
        $progressMap = self::progressMap((int) $user['id']);
        $detail['status'] = $progressMap[$id]['status'] ?? null;

        $summaries = Content::summaries();
        $ids = array_column($summaries, 'id');
        $index = array_search($id, $ids, true);
        $detail['prev'] = $index !== false && $index > 0
            ? ['id' => $summaries[$index - 1]['id'], 'name' => $summaries[$index - 1]['name']]
            : null;
        $detail['next'] = $index !== false && $index < count($summaries) - 1
            ? ['id' => $summaries[$index + 1]['id'], 'name' => $summaries[$index + 1]['name']]
            : null;

        Http::ok($detail);
    }

    public static function progress(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        $id = (string) ($input['diagnosisId'] ?? '');
        $status = (string) ($input['status'] ?? 'read');
        if (!Content::find($id)) throw new ApiError(404, 'diagnosis_not_found', '未找到该诊断');
        if (!in_array($status, ['read', 'mastered'], true)) {
            throw new ApiError(422, 'invalid_status', '进度状态无效');
        }
        $pdo = Db::pdo();
        $stmt = $pdo->prepare(
            'INSERT INTO user_progress (user_id, diagnosis_id, status, read_at, mastered_at)
             VALUES (?, ?, ?, NOW(), ?)
             ON DUPLICATE KEY UPDATE
               status = IF(VALUES(status) = "mastered" OR status = "mastered", "mastered", "read"),
               read_at = COALESCE(read_at, NOW()),
               mastered_at = IF(VALUES(status) = "mastered", COALESCE(mastered_at, NOW()), mastered_at)'
        );
        $stmt->execute([(int) $user['id'], $id, $status, $status === 'mastered' ? date('Y-m-d H:i:s') : null]);
        Http::ok(['diagnosisId' => $id, 'status' => $status]);
    }

    public static function quizNew(array $params = []): void
    {
        $user = self::user();
        $focus = [];
        if (!empty($_GET['focus'])) {
            $focus = array_values(array_filter(array_map('trim', explode(',', (string) $_GET['focus']))));
        }
        $payload = Quiz::newAttempt((int) $user['id'], [
            'level' => (int) ($_GET['level'] ?? 1),
            'chapter' => (string) ($_GET['chapter'] ?? 'all'),
            'focus' => $focus,
        ]);
        Http::ok($payload);
    }

    public static function quizAnswer(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        $attemptId = (string) ($input['attemptId'] ?? '');
        $selected = $input['selected'] ?? [];
        if (!is_array($selected)) throw new ApiError(422, 'invalid_selection', '答案格式错误');
        $timeMs = (int) ($input['timeMs'] ?? 0);
        Http::ok(Quiz::answer((int) $user['id'], $attemptId, $selected, $timeMs));
    }

    public static function quizHistory(array $params = []): void
    {
        $user = self::user();
        Http::ok(Quiz::history((int) $user['id'], (int) ($_GET['limit'] ?? 12)));
    }

    public static function stats(array $params = []): void
    {
        $user = self::user();
        $data = Stats::forUser((int) $user['id']);
        $data['leaderboard'] = Stats::leaderboard((string) ($_GET['scope'] ?? 'week'));
        $data['history'] = Quiz::history((int) $user['id'], 12);
        Http::ok($data);
    }

    public static function leaderboard(array $params = []): void
    {
        self::user();
        Http::ok(['items' => Stats::leaderboard((string) ($_GET['scope'] ?? 'week'))]);
    }

    public static function register(array $params = []): void
    {
        $user = Auth::register(Http::input());
        Http::ok(['user' => Auth::publicUser($user), 'csrf' => Auth::csrf()]);
    }

    public static function login(array $params = []): void
    {
        $user = Auth::login(Http::input());
        Http::ok(['user' => Auth::publicUser($user), 'csrf' => Auth::csrf()]);
    }

    public static function logout(array $params = []): void
    {
        Auth::logout();
        Http::ok(['loggedOut' => true]);
    }

    public static function theme(array $params = []): void
    {
        $input = Http::input();
        Auth::updateTheme((string) ($input['theme'] ?? 'auto'));
        Http::ok(['theme' => (string) ($input['theme'] ?? 'auto')]);
    }

    public static function simScenarios(array $params = []): void
    {
        self::user();
        Http::ok(['items' => SimEngine::scenarios()]);
    }

    public static function simStart(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        Http::ok(SimEngine::start((int) $user['id'], (string) ($input['scenarioId'] ?? '')));
    }

    public static function simState(array $params = []): void
    {
        $user = self::user();
        $id = (string) ($_GET['id'] ?? '');
        Http::ok(SimEngine::state((int) $user['id'], $id));
    }

    public static function simAction(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        $sessionId = (string) ($input['sessionId'] ?? '');
        $action = (string) ($input['action'] ?? '');
        $payload = is_array($input['payload'] ?? null) ? $input['payload'] : [];
        Http::ok(SimEngine::action((int) $user['id'], $sessionId, $action, $payload));
    }

    public static function simDebrief(array $params = []): void
    {
        $user = self::user();
        Http::ok(SimEngine::debrief((int) $user['id'], (int) ($_GET['runId'] ?? 0)));
    }

    public static function aiStatus(array $params = []): void
    {
        $user = self::user();
        Http::ok(Ai::status((int) $user['id']));
    }

    public static function aiChat(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        $diagnosisId = isset($input['diagnosisId']) ? (string) $input['diagnosisId'] : null;
        Http::ok(Ai::chat((int) $user['id'], (string) ($input['message'] ?? ''), $diagnosisId));
    }

    public static function aiExplain(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        Http::ok(Ai::explain((int) $user['id'], (int) ($input['attemptId'] ?? 0)));
    }

    public static function aiStudyPlan(array $params = []): void
    {
        $user = self::user();
        Http::ok(Ai::studyPlan((int) $user['id']));
    }

    public static function aiSimReview(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        Http::ok(Ai::simReview((int) $user['id'], (int) ($input['runId'] ?? 0)));
    }

    private static function user(): array
    {
        $user = Auth::user();
        if (!$user) throw new ApiError(401, 'unauthorized', '请先建立会话');
        return $user;
    }

    private static function progressMap(int $userId): array
    {
        $stmt = Db::pdo()->prepare('SELECT diagnosis_id, status FROM user_progress WHERE user_id = ?');
        $stmt->execute([$userId]);
        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $map[$row['diagnosis_id']] = $row;
        }
        return $map;
    }
}
