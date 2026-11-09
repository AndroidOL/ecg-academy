<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Ai;
use App\Db;
use App\Settings;

$passed = 0;
$failed = 0;
$userId = 0;

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

try {
    $pdo = Db::pdo();
    $savedAi = Settings::get('ai.enabled', false);
    $savedInterval = Settings::get('ai.min_interval_seconds', 5);
    Settings::set('ai.enabled', false);
    Settings::set('ai.min_interval_seconds', 0);
    $stmt = $pdo->prepare('INSERT INTO users (public_id, username, password_hash, display_name, is_guest, xp, ai_credits) VALUES (?, ?, ?, ?, 0, 4000, 20)');
    $stmt->execute([bin2hex(random_bytes(10)), 'aiquiz' . bin2hex(random_bytes(4)), password_hash('pw-123456', PASSWORD_DEFAULT), 'AI 出题测试']);
    $userId = (int) $pdo->lastInsertId();

    check('guests are rejected from AI quiz', function (): void {
        $pdo = Db::pdo();
        $stmt = $pdo->prepare('INSERT INTO users (public_id, display_name, is_guest) VALUES (?, ?, 1)');
        $stmt->execute([bin2hex(random_bytes(10)), 'AI 游客']);
        $guestId = (int) $pdo->lastInsertId();
        try {
            Ai::generateQuiz($guestId, ['count' => 1]);
            throw new RuntimeException('expected ai_login_required');
        } catch (App\ApiError $e) {
            assert($e->errorCode === 'ai_login_required');
        } finally {
            $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$guestId]);
        }
    });

    check('registered users get a local bank quiz with four options each', function () use ($userId): void {
        $result = Ai::generateQuiz($userId, ['count' => 3, 'difficulty' => 1, 'topic' => '窦性心律']);
        assert($result['source'] === 'local');
        assert(count($result['questions']) === 3);
        foreach ($result['questions'] as $question) {
            assert(count($question['options']) === 4);
            assert($question['answerIndex'] >= 0 && $question['answerIndex'] <= 3);
            assert($question['explanation'] !== '');
            assert($question['question'] !== '');
            assert($question['topic'] !== '');
        }
    });

    check('question count and difficulty are clamped', function () use ($userId): void {
        $result = Ai::generateQuiz($userId, ['count' => 99, 'difficulty' => 9]);
        assert(count($result['questions']) <= 5);
        foreach ($result['questions'] as $question) assert(count($question['options']) === 4);
    });

    check('parser accepts fenced json and rejects malformed items', function (): void {
        $method = new ReflectionMethod(Ai::class, 'parseQuizJson');
        $method->setAccessible(true);
        $raw = "```json\n[{\"question\":\"正常窦性心律的P波方向？\",\"options\":[\"I、II、aVF直立\",\"全部倒置\",\"仅aVR直立\",\"仅V1直立\"],\"answerIndex\":0,\"explanation\":\"窦房结位于右房，向量向左下，I/II/aVF直立、aVR倒置。\",\"topic\":\"窦性心律\"},{\"question\":\"坏题\",\"options\":[\"A\",\"B\"],\"answerIndex\":9,\"explanation\":\"\"}]\n```";
        $questions = $method->invoke(null, $raw, 5);
        assert(count($questions) === 1);
        assert($questions[0]['answerIndex'] === 0);
        assert(str_starts_with($questions[0]['explanation'], '窦房结'));
    });
} finally {
    if (isset($savedAi)) Settings::set('ai.enabled', $savedAi);
    if (isset($savedInterval)) Settings::set('ai.min_interval_seconds', $savedInterval);
    if ($userId > 0) {
        Db::pdo()->prepare('DELETE FROM ai_conversations WHERE user_id = ?')->execute([$userId]);
        Db::pdo()->prepare('DELETE FROM ai_violation_log WHERE user_id = ?')->execute([$userId]);
        Db::pdo()->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
    }
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
