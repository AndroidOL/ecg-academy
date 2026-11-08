<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\ApiError;
use App\Daily;
use App\Db;
use App\QuestionBank;

$passed = 0;
$failed = 0;
$userIds = [];

function makeUser(string $name, bool $guest = true): int
{
    global $userIds;
    $pdo = Db::pdo();
    $publicId = bin2hex(random_bytes(8)) . substr(bin2hex(random_bytes(4)), 0, 4);
    $stmt = $pdo->prepare('INSERT INTO users (public_id, display_name, is_guest) VALUES (?, ?, ?)');
    $stmt->execute([$publicId, $name, $guest ? 1 : 0]);
    $id = (int) $pdo->lastInsertId();
    $userIds[] = $id;
    return $id;
}

function check(string $name, callable $fn): void
{
    global $passed, $failed;
    try {
        $fn();
        $passed++;
        echo "  ok  {$name}\n";
    } catch (Throwable $e) {
        $failed++;
        echo "  FAIL {$name}: {$e->getMessage()}\n";
    }
}

function expectApiError(callable $fn, int $status, string $code): void
{
    try {
        $fn();
        throw new RuntimeException('expected ApiError, none thrown');
    } catch (ApiError $e) {
        assert($e->status === $status, "status {$e->status} != {$status}");
        assert($e->errorCode === $code, "code {$e->errorCode} != {$code}");
    }
}

function bankEntry(string $id): array
{
    foreach (QuestionBank::all() as $entry) {
        if ((string) ($entry['id'] ?? '') === $id) return $entry;
    }
    throw new RuntimeException("bank entry {$id} missing");
}

function correctAnswersFor(array $round): array
{
    $method = new ReflectionMethod(Daily::class, 'buildQuestion');
    $method->setAccessible(true);
    $day = (string) $round['day'];
    $answers = [];
    foreach ($round['questions'] as $question) {
        $built = $method->invoke(null, $day, bankEntry((string) $question['id']));
        $answers[] = ['id' => $question['id'], 'selected' => $built['correctIds'], 'timeMs' => 3000];
    }
    return $answers;
}

try {
    $guest = makeUser('每日游客');
    $peer = makeUser('每日同伴');
    $registered = makeUser('每日注册', false);

    check('status starts empty with 28-day history', function () use ($guest): void {
        $status = Daily::status($guest);
        assert($status['done'] === false);
        assert($status['result'] === null);
        assert($status['streak'] === 0);
        assert($status['count'] === 10);
        assert(count($status['history']) === 28);
        assert($status['history'][27]['day'] === date('Y-m-d'));
    });

    check('daily set is deterministic across users', function () use ($guest, $peer): void {
        $a = Daily::start($guest);
        $b = Daily::start($peer);
        assert($a['done'] === false && $b['done'] === false);
        assert(count($a['questions']) === 10);
        $idsA = array_column($a['questions'], 'id');
        $idsB = array_column($b['questions'], 'id');
        assert($idsA === $idsB, 'question ids differ');
        foreach ($a['questions'] as $index => $question) {
            $ids = array_column($question['options'], 'id');
            $peerIds = array_column($b['questions'][$index]['options'], 'id');
            assert($ids === $peerIds, "option order differs at {$index}");
            assert(count($ids) >= 5, 'too few options');
            assert(!empty($question['spec']['seed']), 'spec seed missing');
            assert(($question['spec']['duration'] ?? 0) === 8, 'duration missing');
        }
    });

    check('all-correct submission scores full marks', function () use ($guest): void {
        $round = Daily::start($guest);
        $result = Daily::complete($guest, (string) $round['token'], correctAnswersFor($round));
        assert($result['correct'] === 10, 'correct=' . $result['correct']);
        assert($result['total'] === 10);
        assert($result['score'] >= 1000, 'score=' . $result['score']);
        assert($result['streak'] === 1);
        assert(count($result['details']) === 10);
        foreach ($result['details'] as $detail) {
            assert($detail['correct'] === true);
            assert($detail['correctNames'] !== []);
        }
    });

    check('same day cannot be started or answered twice', function () use ($guest): void {
        $status = Daily::status($guest);
        assert($status['done'] === true);
        assert($status['result']['correct'] === 10);
        $again = Daily::start($guest);
        assert($again['done'] === true);
        assert($again['result']['score'] === $status['result']['score']);
    });

    check('replayed token is rejected with 409', function () use ($peer): void {
        $round = Daily::start($peer);
        Daily::complete($peer, (string) $round['token'], []);
        expectApiError(fn () => Daily::complete($peer, (string) $round['token'], []), 409, 'daily_done');
    });

    check('guests write daily row but no practice/learning rows and no server xp', function () use ($guest): void {
        $pdo = Db::pdo();
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM daily_results WHERE user_id = ?');
        $stmt->execute([$guest]);
        assert((int) $stmt->fetchColumn() === 1);
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM practice_daily_scores WHERE user_id = ?');
        $stmt->execute([$guest]);
        assert((int) $stmt->fetchColumn() === 0, 'practice score polluted');
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM learning_events WHERE user_id = ?');
        $stmt->execute([$guest]);
        assert((int) $stmt->fetchColumn() === 0, 'learning events polluted');
        $stmt = $pdo->prepare('SELECT xp FROM users WHERE id = ?');
        $stmt->execute([$guest]);
        assert((int) $stmt->fetchColumn() === 0, 'guest server xp changed');
    });

    check('registered user gains xp from daily challenge', function () use ($registered): void {
        $round = Daily::start($registered);
        $result = Daily::complete($registered, (string) $round['token'], correctAnswersFor($round));
        assert($result['xp'] > 0);
        $stmt = Db::pdo()->prepare('SELECT xp FROM users WHERE id = ?');
        $stmt->execute([$registered]);
        assert((int) $stmt->fetchColumn() === $result['xp']);
    });

    check('streak counts consecutive days ending today', function () use ($peer): void {
        $pdo = Db::pdo();
        $insert = $pdo->prepare('INSERT INTO daily_results (user_id, day, correct, total, score, xp, time_ms) VALUES (?, ?, 8, 10, 800, 40, 60000)');
        for ($i = 2; $i >= 1; $i--) {
            $insert->execute([$peer, date('Y-m-d', strtotime("-{$i} day"))]);
        }
        $status = Daily::status($peer);
        assert($status['streak'] === 3, 'streak=' . $status['streak']);
        assert($status['bestStreak'] >= 3, 'best=' . $status['bestStreak']);
        assert($status['totalDays'] === 3);
        $done = array_values(array_filter($status['history'], static fn (array $day): bool => $day['done']));
        assert(count($done) === 3);
    });

    check('invalid answers are rejected before consuming the round', function () use ($guest): void {
        // guest already finished today, so use a fresh user
        $fresh = makeUser('每日校验');
        $round = Daily::start($fresh);
        $answers = [['id' => $round['questions'][0]['id'], 'selected' => ['not-a-real-option'], 'timeMs' => 1]];
        expectApiError(fn () => Daily::complete($fresh, (string) $round['token'], $answers), 422, 'invalid_option');
        $status = Daily::status($fresh);
        assert($status['done'] === false);
    });
} finally {
    if ($userIds !== []) {
        $in = implode(',', array_fill(0, count($userIds), '?'));
        Db::pdo()->prepare("DELETE FROM users WHERE id IN ({$in})")->execute($userIds);
    }
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
