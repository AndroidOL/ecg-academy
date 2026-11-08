<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\AdminController;
use App\ApiController;
use App\ApiError;
use App\Auth;
use App\Config;
use App\Http;
use App\Router;
use App\SimEngine;

$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if (str_starts_with($path, '/api/')) {
    try {
        if ($method === 'POST') {
            Auth::requireCsrf();
        }
        $router = new Router();
        $router->get('/api/health', [ApiController::class, 'health']);
        $router->get('/api/admin/auth-config', [AdminController::class, 'authConfig']);
        $router->post('/api/admin/login', [AdminController::class, 'login']);
        $router->get('/api/admin/passkey/login/options', [AdminController::class, 'passkeyLoginOptions']);
        $router->post('/api/admin/passkey/login', [AdminController::class, 'passkeyLogin']);
        $router->post('/api/admin/logout', [AdminController::class, 'logout']);
        $router->get('/api/admin/session', [AdminController::class, 'session']);
        $router->post('/api/admin/settings', [AdminController::class, 'saveSettings']);
        $router->get('/api/admin/users', [AdminController::class, 'users']);
        $router->post('/api/admin/user', [AdminController::class, 'updateUser']);
        $router->get('/api/admin/passkey/options', [AdminController::class, 'passkeyOptions']);
        $router->post('/api/admin/passkey/register', [AdminController::class, 'passkeyRegister']);
        $router->post('/api/admin/passkey/delete', [AdminController::class, 'passkeyDelete']);
        $router->post('/api/admin/ai/provider', [AdminController::class, 'aiProviderSave']);
        $router->post('/api/admin/ai/provider/delete', [AdminController::class, 'aiProviderDelete']);
        $router->post('/api/admin/ai/test', [AdminController::class, 'aiTest']);
        $router->get('/api/admin/audit', [AdminController::class, 'audit']);
        $router->get('/api/bootstrap', [ApiController::class, 'bootstrap']);
        $router->get('/api/diagnoses', [ApiController::class, 'diagnoses']);
        $router->get('/api/diagnoses/{id}', [ApiController::class, 'diagnosis']);
        $router->post('/api/progress', [ApiController::class, 'progress']);
        $router->get('/api/quiz/new', [ApiController::class, 'quizNew']);
        $router->post('/api/quiz/answer', [ApiController::class, 'quizAnswer']);
        $router->get('/api/quiz/history', [ApiController::class, 'quizHistory']);
        $router->get('/api/stats', [ApiController::class, 'stats']);
        $router->get('/api/leaderboard', [ApiController::class, 'leaderboard']);
        $router->post('/api/auth/register', [ApiController::class, 'register']);
        $router->post('/api/auth/login', [ApiController::class, 'login']);
        $router->post('/api/auth/logout', [ApiController::class, 'logout']);
        $router->post('/api/theme', [ApiController::class, 'theme']);
        $router->get('/api/sim/scenarios', [ApiController::class, 'simScenarios']);
        $router->post('/api/sim/start', [ApiController::class, 'simStart']);
        $router->get('/api/sim/state', [ApiController::class, 'simState']);
        $router->post('/api/sim/action', [ApiController::class, 'simAction']);
        $router->get('/api/sim/debrief', [ApiController::class, 'simDebrief']);
        $router->get('/api/ai/status', [ApiController::class, 'aiStatus']);
        $router->post('/api/ai/chat', [ApiController::class, 'aiChat']);
        $router->post('/api/ai/explain', [ApiController::class, 'aiExplain']);
        $router->post('/api/ai/study-plan', [ApiController::class, 'aiStudyPlan']);
        $router->post('/api/ai/sim-review', [ApiController::class, 'aiSimReview']);

        $router->dispatch($method, $path);
    } catch (ApiError $e) {
        Http::fail($e->status, $e->errorCode, $e->getMessage(), $e->details);
    } catch (Throwable $e) {
        error_log('[api] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        $details = Config::get('app.debug', false) ? ['debug' => $e->getMessage()] : [];
        Http::fail(500, 'server_error', '服务器开小差了，请稍后重试', $details);
    }
    exit;
}

if (str_starts_with($path, '/static/')) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Not Found';
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
$version = htmlspecialchars((string) Config::get('app.asset_version', '1'), ENT_QUOTES, 'UTF-8');
$appName = htmlspecialchars((string) Config::get('app.name', '心迹 ECG Lab'), ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="zh-CN" data-theme="auto">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0e766e">
  <meta name="description" content="心迹 ECG Lab：面向医学生与住院医师的免费开源心电图学习、判读练习与 ACLS 急救推演。">
  <meta name="color-scheme" content="light dark">
  <title><?= $appName ?> · 读懂每一次心跳</title>
  <link rel="icon" href="/static/img/favicon.svg?v=<?= $version ?>" type="image/svg+xml">
  <link rel="manifest" href="/static/manifest.webmanifest?v=<?= $version ?>">
  <link rel="stylesheet" href="/static/css/tokens.css?v=<?= $version ?>">
  <link rel="stylesheet" href="/static/css/base.css?v=<?= $version ?>">
  <link rel="stylesheet" href="/static/css/components.css?v=<?= $version ?>">
  <link rel="stylesheet" href="/static/css/pages.css?v=<?= $version ?>">
  <link rel="stylesheet" href="/static/css/ecg.css?v=<?= $version ?>">
  <script src="/static/js/theme-init.js?v=<?= $version ?>"></script>
</head>
<body>
  <a class="skip-link" href="#main">跳到主要内容</a>
  <div id="app">
    <div class="boot-splash" role="status" aria-live="polite">
      <div class="boot-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="46" height="46"><path d="M4 26h8l4-9 6 18 5-22 5 13h12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <p class="boot-title">心迹 · ECG Lab</p>
      <p class="boot-sub">正在准备心电图纸…</p>
    </div>
  </div>
  <div id="modal-root"></div>
  <div id="toast-region" class="toast-region" aria-live="polite" aria-atomic="true"></div>
  <noscript><div class="noscript">本应用需要启用 JavaScript 才能显示交互式心电图。</div></noscript>
  <script type="module" src="/static/js/app.js?v=<?= $version ?>"></script>
</body>
</html>
