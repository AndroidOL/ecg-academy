<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\AdminController;
use App\ApiController;
use App\ApiError;
use App\Auth;
use App\Config;
use App\Content;
use App\Http;
use App\Router;
use App\Seo;
use App\SimEngine;

$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

// Canonical URLs never carry a trailing slash (except "/").
if ($path !== '/' && str_ends_with($path, '/')) {
    $query = (string) ($_SERVER['QUERY_STRING'] ?? '');
    header('Location: ' . rtrim($path, '/') . ($query !== '' ? '?' . $query : ''), true, 301);
    exit;
}
$path = rawurldecode($path);

if (str_starts_with($path, '/api/')) {
    try {
        if ($method === 'POST') {
            Auth::requireCsrf();
        }
        $router = new Router();
        $router->get('/api/health', [ApiController::class, 'health']);
        $router->get('/api/version', [ApiController::class, 'version']);
        $router->get('/api/admin/auth-config', [AdminController::class, 'authConfig']);
        $router->post('/api/admin/login', [AdminController::class, 'login']);
        $router->get('/api/admin/passkey/login/options', [AdminController::class, 'passkeyLoginOptions']);
        $router->post('/api/admin/passkey/login', [AdminController::class, 'passkeyLogin']);
        $router->post('/api/admin/logout', [AdminController::class, 'logout']);
        $router->get('/api/admin/session', [AdminController::class, 'session']);
        $router->post('/api/admin/settings', [AdminController::class, 'saveSettings']);
        $router->post('/api/admin/mail/test', [AdminController::class, 'mailTest']);
        $router->get('/api/admin/user/detail', [AdminController::class, 'userDetail']);
        $router->post('/api/admin/user/ai-reset', [AdminController::class, 'userAiReset']);
        $router->get('/api/admin/ai/conversations', [AdminController::class, 'aiConversations']);
        $router->get('/api/admin/users', [AdminController::class, 'users']);
        $router->post('/api/admin/user', [AdminController::class, 'updateUser']);
        $router->post('/api/admin/user/create', [AdminController::class, 'createUser']);
        $router->get('/api/admin/passkey/options', [AdminController::class, 'passkeyOptions']);
        $router->post('/api/admin/passkey/register', [AdminController::class, 'passkeyRegister']);
        $router->post('/api/admin/passkey/delete', [AdminController::class, 'passkeyDelete']);
        $router->post('/api/admin/ai/provider', [AdminController::class, 'aiProviderSave']);
        $router->post('/api/admin/ai/provider/delete', [AdminController::class, 'aiProviderDelete']);
        $router->post('/api/admin/ai/test', [AdminController::class, 'aiTest']);
        $router->get('/api/admin/ai/cost', [ApiController::class, 'adminAiCost']);
        $router->get('/api/admin/packs', [ApiController::class, 'adminPacks']);
        $router->post('/api/admin/coursepack/validate', [ApiController::class, 'adminPackValidate']);
        $router->post('/api/admin/coursepack/import', [ApiController::class, 'adminPackImport']);
        $router->post('/api/admin/coursepack/status', [ApiController::class, 'adminPackStatus']);
        $router->get('/api/admin/coursepack', [ApiController::class, 'adminPackPreview']);
        $router->post('/api/admin/ai/cost', [ApiController::class, 'adminAiSaveCost']);
        $router->get('/api/admin/audit', [AdminController::class, 'audit']);
        $router->get('/api/admin/assignments', [AdminController::class, 'assignments']);
        $router->post('/api/admin/assignment', [AdminController::class, 'assignmentSave']);
        $router->post('/api/admin/assignment/toggle', [AdminController::class, 'assignmentToggle']);
        $router->post('/api/admin/assignment/delete', [AdminController::class, 'assignmentDelete']);
        $router->get('/api/admin/traffic', [ApiController::class, 'adminTraffic']);
        $router->post('/api/admin/guests/clean', [ApiController::class, 'adminCleanGuests']);
        $router->get('/api/bootstrap', [ApiController::class, 'bootstrap']);
        $router->get('/api/diagnoses', [ApiController::class, 'diagnoses']);
        $router->get('/api/diagnoses/{id}', [ApiController::class, 'diagnosis']);
        $router->post('/api/progress', [ApiController::class, 'progress']);
        $router->get('/api/quiz/new', [ApiController::class, 'quizNew']);
        $router->get('/api/assignment', [ApiController::class, 'assignment']);
        $router->post('/api/quiz/answer', [ApiController::class, 'quizAnswer']);
        $router->get('/api/quiz/history', [ApiController::class, 'quizHistory']);
        $router->get('/api/learning/status', [ApiController::class, 'learningStatus']);
        $router->get('/api/learning/start', [ApiController::class, 'learningStart']);
        $router->post('/api/learning/complete', [ApiController::class, 'learningComplete']);
        $router->get('/api/exam/start', [ApiController::class, 'examStart']);
        $router->get('/api/practice/status', [ApiController::class, 'practiceStatus']);
        $router->get('/api/practice/leaderboard', [ApiController::class, 'practiceLeaderboard']);
        $router->get('/api/packs', [ApiController::class, 'packs']);
        $router->get('/api/packs/{id}', [ApiController::class, 'pack']);
        $router->get('/api/daily/status', [ApiController::class, 'dailyStatus']);
        $router->get('/api/daily/start', [ApiController::class, 'dailyStart']);
        $router->post('/api/daily/complete', [ApiController::class, 'dailyComplete']);
        $router->get('/api/stats', [ApiController::class, 'stats']);
        $router->get('/api/leaderboard', [ApiController::class, 'leaderboard']);
        $router->post('/api/auth/register/code', [ApiController::class, 'registerCode']);
        $router->post('/api/auth/register', [ApiController::class, 'register']);
        $router->post('/api/auth/login', [ApiController::class, 'login']);
        $router->get('/api/auth/passkey/options', [ApiController::class, 'passkeyLoginOptions']);
        $router->post('/api/auth/passkey/login', [ApiController::class, 'passkeyLogin']);
        $router->post('/api/auth/logout', [ApiController::class, 'logout']);
        $router->post('/api/me/profile', [ApiController::class, 'meProfile']);
        $router->post('/api/me/password', [ApiController::class, 'mePassword']);
        $router->get('/api/me/study', [ApiController::class, 'meStudy']);
        $router->post('/api/me/study', [ApiController::class, 'meStudySave']);
        $router->get('/api/me/passkeys', [ApiController::class, 'mePasskeys']);
        $router->get('/api/me/passkey/options', [ApiController::class, 'mePasskeyOptions']);
        $router->post('/api/me/passkey/register', [ApiController::class, 'mePasskeyRegister']);
        $router->post('/api/me/passkey/delete', [ApiController::class, 'mePasskeyDelete']);
        $router->post('/api/theme', [ApiController::class, 'theme']);
        $router->post('/api/visit', [ApiController::class, 'visit']);
        $router->get('/api/sim/scenarios', [ApiController::class, 'simScenarios']);
        $router->post('/api/sim/start', [ApiController::class, 'simStart']);
        $router->get('/api/sim/state', [ApiController::class, 'simState']);
        $router->post('/api/sim/action', [ApiController::class, 'simAction']);
        $router->get('/api/sim/debrief', [ApiController::class, 'simDebrief']);
        $router->post('/api/sim/duo/start', [ApiController::class, 'simDuoStart']);
        $router->get('/api/sim/duo/state', [ApiController::class, 'simDuoState']);
        $router->post('/api/sim/duo/action', [ApiController::class, 'simDuoAction']);
        $router->post('/api/sim/duo/diagnosis', [ApiController::class, 'simDuoDiagnosis']);
        $router->get('/api/ai/status', [ApiController::class, 'aiStatus']);
        $router->post('/api/ai/chat', [ApiController::class, 'aiChat']);
        $router->post('/api/ai/stream', [ApiController::class, 'aiStream']);
        $router->post('/api/ai/quiz', [ApiController::class, 'aiQuiz']);
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

// Bing/Yandex IndexNow verification: /{key}.txt echoes the configured key.
$indexNowKey = trim((string) Config::get('app.seo.indexnow_key', ''));
if ($indexNowKey !== '' && $path === '/' . $indexNowKey . '.txt') {
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: public, max-age=86400');
    if ($method !== 'HEAD') {
        echo $indexNowKey;
    }
    exit;
}

// Server-rendered SEO pages (real paths, full HTML, canonical + JSON-LD).
// Returns false only for "/" so the interactive SPA keeps the home page.
if (Seo::handle($path, $method)) {
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
$version = htmlspecialchars((string) Config::get('app.asset_version', '1'), ENT_QUOTES, 'UTF-8');
$appName = htmlspecialchars((string) Config::get('app.name', '心迹 ECG Lab'), ENT_QUOTES, 'UTF-8');
$baseUrl = Seo::baseUrl();
$homeCanonical = $baseUrl . '/';
$siteDescription = '心迹 ECG Lab：面向医学生与住院医师的免费开源心电图学习、判读练习与 ACLS 急救推演。' . count(Content::summaries()) . ' 篇结构化课程、确定性命库、五步判读训练与 12 个 ACLS 场景。';
$verifyMeta = '';
foreach (['baidu' => 'baidu-site-verification', 'google' => 'google-site-verification', 'bing' => 'msvalidate.01'] as $engine => $metaName) {
    $code = trim((string) Config::get('app.seo.verification.' . $engine, ''));
    if ($code !== '') {
        $verifyMeta .= '  <meta name="' . $metaName . '" content="' . htmlspecialchars($code, ENT_QUOTES, 'UTF-8') . '">' . "\n";
    }
}
$siteJsonLd = json_encode([
    '@context' => 'https://schema.org',
    '@type' => 'WebSite',
    'name' => '心迹 ECG Lab',
    'alternateName' => '心迹 · ECG Lab',
    'url' => $homeCanonical,
    'inLanguage' => 'zh-CN',
    'description' => $siteDescription,
    'publisher' => [
        '@type' => 'EducationalOrganization',
        'name' => '心迹 ECG Lab',
        'url' => $homeCanonical,
        'sameAs' => ['https://github.com/AndroidOL/ecg-academy'],
    ],
    'potentialAction' => [
        '@type' => 'SearchAction',
        'target' => ['@type' => 'EntryPoint', 'urlTemplate' => $baseUrl . '/learn?q={search_term_string}'],
        'query-input' => 'required name=search_term_string',
    ],
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$chapterLinks = '';
foreach (Content::chapters() as $chapter) {
    $chapterBase = ($chapter['id'] ?? '') === 'theory' ? '/intro' : '/learn';
    $chapterLinks .= '<li><a href="' . $chapterBase . '#chapter-' . htmlspecialchars((string) $chapter['id'], ENT_QUOTES, 'UTF-8') . '">'
        . htmlspecialchars((string) $chapter['name'], ENT_QUOTES, 'UTF-8') . '</a></li>';
}
?>
<!doctype html>
<html lang="zh-CN" data-theme="auto">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="applicable-device" content="pc,mobile">
  <meta name="renderer" content="webkit">
  <meta name="theme-color" content="#0e766e" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0b2b29" media="(prefers-color-scheme: dark)">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="<?= $appName ?>">
  <meta name="description" content="<?= htmlspecialchars($siteDescription, ENT_QUOTES, 'UTF-8') ?>">
  <meta name="keywords" content="心电图,心电图判读,心电图学习,心电图练习,ACLS,心电向量,ECG,心电图诊断,心电图课程">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">
  <meta name="author" content="心迹 ECG Lab">
  <meta name="color-scheme" content="light dark">
  <link rel="canonical" href="<?= htmlspecialchars($homeCanonical, ENT_QUOTES, 'UTF-8') ?>">
  <link rel="alternate" hreflang="zh-CN" href="<?= htmlspecialchars($homeCanonical, ENT_QUOTES, 'UTF-8') ?>">
  <link rel="alternate" hreflang="x-default" href="<?= htmlspecialchars($homeCanonical, ENT_QUOTES, 'UTF-8') ?>">
  <meta property="og:site_name" content="心迹 ECG Lab">
  <meta property="og:type" content="website">
  <meta property="og:title" content="心迹 ECG Lab · 读懂每一次心跳">
  <meta property="og:description" content="<?= htmlspecialchars($siteDescription, ENT_QUOTES, 'UTF-8') ?>">
  <meta property="og:url" content="<?= htmlspecialchars($homeCanonical, ENT_QUOTES, 'UTF-8') ?>">
  <meta property="og:image" content="<?= htmlspecialchars($baseUrl . '/static/img/og-cover.png', ENT_QUOTES, 'UTF-8') ?>">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="zh_CN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="心迹 ECG Lab · 读懂每一次心跳">
  <meta name="twitter:description" content="<?= htmlspecialchars($siteDescription, ENT_QUOTES, 'UTF-8') ?>">
  <meta name="twitter:image" content="<?= htmlspecialchars($baseUrl . '/static/img/og-cover.png', ENT_QUOTES, 'UTF-8') ?>">
<?= $verifyMeta ?>  <script type="application/ld+json"><?= $siteJsonLd ?></script>
  <title><?= $appName ?> · 读懂每一次心跳</title>
  <link rel="icon" href="/static/img/favicon.svg?v=<?= $version ?>" type="image/svg+xml">
  <link rel="icon" href="/static/img/icon-192.png?v=<?= $version ?>" type="image/png" sizes="192x192">
  <link rel="apple-touch-icon" href="/static/img/apple-touch-icon.png?v=<?= $version ?>" sizes="180x180">
  <link rel="manifest" href="/static/manifest.webmanifest?v=<?= $version ?>">
  <link rel="stylesheet" href="/static/css/tokens.css?v=<?= $version ?>">
  <link rel="stylesheet" href="/static/css/base.css?v=<?= $version ?>">
  <link rel="stylesheet" href="/static/css/components.css?v=<?= $version ?>">
  <link rel="stylesheet" href="/static/css/pages.css?v=<?= $version ?>">
  <link rel="stylesheet" href="/static/css/ecg.css?v=<?= $version ?>">
  <link rel="stylesheet" href="/static/css/seo.css?v=<?= $version ?>">
  <link rel="modulepreload" href="/static/js/api.js?v=<?= $version ?>">
  <link rel="modulepreload" href="/static/js/store.js?v=<?= $version ?>">
  <link rel="modulepreload" href="/static/js/router.js?v=<?= $version ?>">
  <link rel="modulepreload" href="/static/js/ui.js?v=<?= $version ?>">
  <link rel="modulepreload" href="/static/js/i18n.js?v=<?= $version ?>">
  <link rel="modulepreload" href="/static/js/bandwidth.js?v=<?= $version ?>">
  <link rel="modulepreload" href="/static/js/study-sync.js?v=<?= $version ?>">
  <link rel="modulepreload" href="/static/js/views/home.js?v=<?= $version ?>">
  <script src="/static/js/theme-init.js?v=<?= $version ?>"></script>
</head>
<body>
  <a class="skip-link" href="#app">跳到主要内容</a>
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
  <noscript>
    <div class="seo-noscript">
      <h1>心迹 ECG Lab：免费心电图学习、判读练习与 ACLS 急救推演</h1>
      <p>从窦性心律到心室颤动，从 ST-T 改变到电解质紊乱。用可交互的心电图、组合判读练习与 ACLS 推演，把书本上的标准变成床边的直觉。交互功能需要启用 JavaScript；你可以先阅读完整课程与术语表。</p>
      <p class="seo-noscript-actions"><a href="/learn">心电图诊断图谱</a> · <a href="/intro">心电图导论</a> · <a href="/read">五步判读法</a> · <a href="/practice">判读练习</a> · <a href="/sim">急救推演</a> · <a href="/glossary">双语术语表</a> · <a href="/guidelines">区域指南差异</a></p>
      <h2>按章节浏览</h2>
      <ul class="seo-noscript-chapters"><?= $chapterLinks ?></ul>
      <p>本站为教学用途，不构成诊疗建议。</p>
    </div>
  </noscript>
  <script type="module" src="/static/js/app.js?v=<?= $version ?>"></script>
</body>
</html>
