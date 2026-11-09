<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\ApiError;
use App\Db;
use App\Study;

$passed = 0;
$failed = 0;
$ids = [];

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

function makeUser(bool $guest): int
{
    global $ids;
    $pdo = Db::pdo();
    $stmt = $pdo->prepare('INSERT INTO users (public_id, username, password_hash, display_name, is_guest) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([bin2hex(random_bytes(10)), $guest ? null : 't' . bin2hex(random_bytes(5)), $guest ? null : password_hash('pw-123456', PASSWORD_DEFAULT), $guest ? '同步游客' : '同步账号', $guest ? 1 : 0]);
    $id = (int) $pdo->lastInsertId();
    $ids[] = $id;
    return $id;
}

try {
    $account = makeUser(false);
    $guest = makeUser(true);

    check('empty study state before first sync', function () use ($account): void {
        $state = Study::get($account);
        assert($state['reviews'] === []);
        assert($state['favorites'] === []);
    });

    check('guests cannot use server study storage', function () use ($guest): void {
        try {
            Study::get($guest);
            throw new RuntimeException('expected account_required');
        } catch (ApiError $e) {
            assert($e->status === 403 && $e->errorCode === 'account_required');
        }
    });

    check('saves and normalizes reviews and favorites', function () use ($account): void {
        $saved = Study::save($account, [
            'reviews' => [
                'normal-sinus' => ['id' => 'normal-sinus', 'name' => '正常窦性心律', 'chapter' => 'foundation', 'wrong' => 2, 'correct' => 3, 'slow' => 1, 'lapses' => 1, 'ease' => 2.1, 'interval' => 8, 'due' => 123456789, 'lastSeen' => 123456700],
                'bad-entry' => 'not-an-array',
                '' => ['id' => '', 'name' => 'x'],
            ],
            'favorites' => [
                'af' => ['id' => 'af', 'name' => '心房颤动', 'chapter' => 'arrhythmia', 'addedAt' => 111],
                'junk' => 42,
            ],
        ]);
        assert($saved['reviews'] === 1);
        assert($saved['favorites'] === 1);
        $state = Study::get($account);
        assert($state['reviews']['normal-sinus']['interval'] === 8);
        assert($state['reviews']['normal-sinus']['slow'] === 1);
        assert($state['favorites']['af']['name'] === '心房颤动');
        assert($state['updatedAt'] !== null);
    });

    check('keeps wrong selections, recent logs and repeated-question counts', function () use ($account): void {
        Study::save($account, [
            'reviews' => [
                'afib' => [
                    'id' => 'afib', 'name' => '心房颤动', 'chapter' => 'arrhythmia', 'wrong' => 3, 'correct' => 1,
                    'slow' => 0, 'lapses' => 3, 'ease' => 2.1, 'interval' => 0, 'due' => 123, 'lastSeen' => 456,
                    'wrongChoices' => [
                        'svt' => ['id' => 'svt', 'name' => '室上速', 'count' => 2, 'lastAt' => 123],
                        'junk' => 'not-an-array',
                    ],
                    'wrongLog' => [
                        ['at' => 123, 'key' => 'q1', 'q' => '该心电图最可能的诊断是？', 'src' => 'practice',
                            'picked' => [['id' => 'svt', 'name' => '室上速']],
                            'correct' => [['id' => 'afib', 'name' => '心房颤动']]],
                        'not-an-array',
                    ],
                    'repeatWrongs' => [
                        'q1' => ['n' => 3, 'lastAt' => 123, 'q' => '同一道题', 'picked' => ['室上速'], 'pickedCounts' => ['室上速' => 2, '房性心动过速' => 1]],
                        'bad' => ['n' => 1],
                    ],
                ],
            ],
            'favorites' => [],
        ]);
        $entry = Study::get($account)['reviews']['afib'];
        assert($entry['wrongChoices']['svt']['count'] === 2);
        assert(count($entry['wrongChoices']) === 1);
        assert(count($entry['wrongLog']) === 1);
        assert($entry['wrongLog'][0]['picked'][0]['name'] === '室上速');
        assert($entry['repeatWrongs']['q1']['n'] === 3);
        assert($entry['repeatWrongs']['q1']['picked'][0] === '室上速');
        assert($entry['repeatWrongs']['q1']['pickedCounts']['室上速'] === 2);
    });

    check('second save replaces previous snapshot', function () use ($account): void {
        Study::save($account, ['reviews' => [], 'favorites' => ['only' => ['id' => 'only', 'name' => '仅一个', 'chapter' => 'x', 'addedAt' => 5]]]);
        $state = Study::get($account);
        assert($state['reviews'] === []);
        assert(array_keys($state['favorites']) === ['only']);
    });
} finally {
    if ($ids !== []) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        Db::pdo()->prepare("DELETE FROM users WHERE id IN ({$in})")->execute($ids);
    }
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
