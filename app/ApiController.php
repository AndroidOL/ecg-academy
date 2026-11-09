<?php
declare(strict_types=1);

namespace App;

final class ApiController
{
    public static function health(array $params = []): void
    {
        Http::ok(['status' => 'ok', 'time' => date(DATE_ATOM)]);
    }

    public static function version(array $params = []): void
    {
        Http::ok([
            'version' => (string) Config::get('app.version', ''),
            'assetVersion' => (string) Config::get('app.asset_version', ''),
        ]);
    }

    public static function bootstrap(array $params = []): void
    {
        $user = Auth::user(true);
        Auth::touch();
        $stats = Stats::forUser((int) $user['id']);
        Http::ok([
            'user' => Auth::publicUser($user),
            'level' => Level::forUser((int) $user['id']),
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
                'emailConfigured' => Mailer::configured(),
                'registrationDailyLimit' => max(1, Settings::int('auth.registration_daily_limit', 5)),
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
            'assignment' => (string) ($_GET['assignment'] ?? ''),
            'device' => (string) ($_GET['device'] ?? ''),
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
        Http::ok(Quiz::answer((int) $user['id'], $attemptId, $selected, $timeMs, (int) ($input['level'] ?? 0)));
    }

    public static function assignment(array $params = []): void
    {
        self::user();
        $code = mb_strtolower(trim((string) ($_GET['code'] ?? '')));
        Http::ok(Quiz::assignment($code));
    }

    public static function quizHistory(array $params = []): void
    {
        $user = self::user();
        Http::ok(Quiz::history((int) $user['id'], (int) ($_GET['limit'] ?? 12)));
    }

    public static function learningStatus(array $params = []): void
    {
        $user = self::user();
        Http::ok(Learning::status((int) $user['id']));
    }

    public static function learningStart(array $params = []): void
    {
        $user = self::user();
        Http::ok(Learning::startLearn((int) $user['id'], (string) ($_GET['chapter'] ?? '')));
    }

    public static function learningComplete(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        $answers = is_array($input['answers'] ?? null) ? $input['answers'] : [];
        Http::ok(Learning::submit((int) $user['id'], (string) ($input['token'] ?? ''), $answers, (int) ($input['level'] ?? 0)));
    }

    public static function examStart(array $params = []): void
    {
        $user = self::user();
        Http::ok(Learning::startExam((int) $user['id']));
    }

    public static function practiceStatus(array $params = []): void
    {
        $user = self::user();
        Http::ok(Learning::practiceStatus((int) $user['id']));
    }

    public static function practiceLeaderboard(array $params = []): void
    {
        $user = self::user();
        Http::ok(Learning::practiceLeaderboardData((int) $user['id'], (string) ($_GET['scope'] ?? 'today')));
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

    public static function registerCode(array $params = []): void
    {
        Http::ok(Registration::requestCode((string) (Http::input()['email'] ?? '')));
    }

    public static function register(array $params = []): void
    {
        $user = Registration::register(Http::input());
        Http::ok(['user' => Auth::publicUser($user), 'csrf' => Auth::csrf()]);
    }

    public static function login(array $params = []): void
    {
        $user = Auth::login(Http::input());
        Http::ok(['user' => Auth::publicUser($user), 'csrf' => Auth::csrf()]);
    }

    public static function passkeyLoginOptions(array $params = []): void
    {
        Http::ok(Auth::passkeyLoginOptions((string) ($_GET['username'] ?? '')));
    }

    public static function passkeyLogin(array $params = []): void
    {
        $credential = Http::input()['credential'] ?? [];
        $user = Auth::passkeyLogin(is_array($credential) ? $credential : []);
        Http::ok(['user' => Auth::publicUser($user), 'csrf' => Auth::csrf()]);
    }

    public static function meProfile(array $params = []): void
    {
        $user = self::user();
        Http::ok(Profile::update((int) $user['id'], Http::input()));
    }

    public static function mePassword(array $params = []): void
    {
        $user = self::user();
        Profile::changePassword((int) $user['id'], Http::input());
        Http::ok(['saved' => true]);
    }

    public static function mePasskeys(array $params = []): void
    {
        $user = self::user();
        Http::ok(['items' => Profile::passkeys((int) $user['id'])]);
    }

    public static function mePasskeyOptions(array $params = []): void
    {
        $user = self::user();
        Http::ok(Profile::passkeyOptions((int) $user['id']));
    }

    public static function mePasskeyRegister(array $params = []): void
    {
        $user = self::user();
        Profile::registerPasskey((int) $user['id'], Http::input());
        Http::ok(['registered' => true]);
    }

    public static function meStudy(array $params = []): void
    {
        $user = self::user();
        Http::ok(Study::get((int) $user['id']));
    }

    public static function meStudySave(array $params = []): void
    {
        $user = self::user();
        Http::ok(Study::save((int) $user['id'], Http::input()));
    }

    public static function mePasskeyDelete(array $params = []): void
    {
        $user = self::user();
        Profile::deletePasskey((int) $user['id'], (int) (Http::input()['id'] ?? 0));
        Http::ok(['deleted' => true]);
    }

    public static function visit(array $params = []): void
    {
        Traffic::record(Auth::user(false) ?: null, Http::input());
        Http::ok(['tracked' => true]);
    }

    public static function adminTraffic(array $params = []): void
    {
        AdminAuth::requireAdmin();
        Http::ok(Traffic::summary((int) ($_GET['days'] ?? 14)));
    }

    public static function adminCleanGuests(array $params = []): void
    {
        $admin = AdminAuth::requireAdmin();
        $days = max(0, min(365, (int) (Http::input()['days'] ?? 7)));
        $deleted = Traffic::cleanGuests($days);
        $expired = Traffic::cleanVisits(90);
        AdminAuth::audit((int) $admin['id'], 'admin.guests.clean', ['days' => $days, 'deleted' => $deleted, 'visitsExpired' => $expired]);
        Http::ok(['deleted' => $deleted, 'visitsExpired' => $expired]);
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
        $byok = is_array($input['byok'] ?? null) ? $input['byok'] : null;
        $mistake = is_array($input['mistake'] ?? null) ? $input['mistake'] : null;
        Http::ok(Ai::chat((int) $user['id'], (string) ($input['message'] ?? ''), $diagnosisId, $byok, $mistake));
    }

    public static function aiQuiz(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        $byok = is_array($input['byok'] ?? null) ? $input['byok'] : null;
        Http::ok(Ai::generateQuiz((int) $user['id'], $input, $byok));
    }

    public static function aiStream(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        $byok = is_array($input['byok'] ?? null) ? $input['byok'] : null;
        Ai::stream((int) $user['id'], (string) ($input['mode'] ?? 'chat'), $input, $byok);
    }

    public static function adminAiCost(array $params = []): void
    {
        AdminAuth::requireAdmin();
        Http::ok(Ai::costSummary((int) ($_GET['days'] ?? 30)));
    }

    public static function packs(array $params = []): void
    {
        self::user();
        Http::ok(['items' => CoursePack::listPublished()]);
    }

    public static function pack(array $params): void
    {
        self::user();
        Http::ok(CoursePack::publishedByPackId((string) ($params['id'] ?? '')));
    }

    public static function adminPacks(array $params = []): void
    {
        AdminAuth::requireAdmin();
        Http::ok(['items' => CoursePack::listAll()]);
    }

    public static function adminPackValidate(array $params = []): void
    {
        AdminAuth::requireAdmin();
        $pack = Http::input()['pack'] ?? null;
        if (!is_array($pack)) throw new ApiError(422, 'pack_invalid', '缺少课程包 JSON 对象');
        Http::ok(CoursePack::validate($pack));
    }

    public static function adminPackImport(array $params = []): void
    {
        $admin = AdminAuth::requireAdmin();
        $pack = Http::input()['pack'] ?? null;
        if (!is_array($pack)) throw new ApiError(422, 'pack_invalid', '缺少课程包 JSON 对象');
        $result = CoursePack::import($pack, (int) $admin['id']);
        AdminAuth::audit((int) $admin['id'], 'admin.coursepack.import', ['packId' => $result['summary']['id'], 'version' => $result['summary']['version'], 'id' => $result['id']]);
        Http::ok($result);
    }

    public static function adminPackStatus(array $params = []): void
    {
        $admin = AdminAuth::requireAdmin();
        $input = Http::input();
        $result = CoursePack::setStatus((int) ($input['id'] ?? 0), (string) ($input['status'] ?? ''));
        AdminAuth::audit((int) $admin['id'], 'admin.coursepack.status', $result);
        Http::ok($result);
    }

    public static function adminPackPreview(array $params = []): void
    {
        AdminAuth::requireAdmin();
        Http::ok(CoursePack::payload((int) ($_GET['id'] ?? 0)));
    }

    public static function adminAiSaveCost(array $params = []): void
    {
        $admin = AdminAuth::requireAdmin();
        $settings = Ai::saveCostSettings(Http::input());
        AdminAuth::audit((int) $admin['id'], 'admin.ai.cost.save', ['models' => array_keys($settings['pricing']), 'discounts' => count($settings['discounts'])]);
        Http::ok($settings);
    }

    public static function aiExplain(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        $byok = is_array($input['byok'] ?? null) ? $input['byok'] : null;
        Http::ok(Ai::explain((int) $user['id'], (int) ($input['attemptId'] ?? 0), (string) ($input['question'] ?? ''), $byok));
    }

    public static function aiStudyPlan(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        $byok = is_array($input['byok'] ?? null) ? $input['byok'] : null;
        Http::ok(Ai::studyPlan((int) $user['id'], $byok));
    }

    public static function aiSimReview(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        $byok = is_array($input['byok'] ?? null) ? $input['byok'] : null;
        Http::ok(Ai::simReview((int) $user['id'], (int) ($input['runId'] ?? 0), $byok));
    }

    public static function dailyStatus(array $params = []): void
    {
        $user = self::user();
        Http::ok(Daily::status((int) $user['id']));
    }

    public static function dailyStart(array $params = []): void
    {
        $user = self::user();
        Http::ok(Daily::start((int) $user['id']));
    }

    public static function dailyComplete(array $params = []): void
    {
        $user = self::user();
        $input = Http::input();
        $answers = is_array($input['answers'] ?? null) ? $input['answers'] : [];
        Http::ok(Daily::complete((int) $user['id'], (string) ($input['token'] ?? ''), $answers, (int) ($input['level'] ?? 0)));
    }

    private static function user(): array
    {
        $user = Auth::user(false);
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
