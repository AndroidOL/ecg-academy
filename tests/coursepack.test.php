<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\ApiError;
use App\CoursePack;
use App\Db;

$passed = 0;
$failed = 0;
$packId = 'test-pack-' . bin2hex(random_bytes(3));

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

function fixture(string $id): array
{
    return [
        'id' => $id,
        'name' => '测试课程包',
        'version' => '1.0.0',
        'license' => 'CC BY-SA 4.0',
        'description' => '用于单元测试',
        'authors' => ['Test Team'],
        'sources' => ['Example Guideline'],
        'chapters' => [['id' => 'basics', 'name' => '基础', 'order' => 1]],
        'articles' => [[
            'id' => 'normal-sinus',
            'chapter' => 'basics',
            'name' => '正常窦性心律',
            'difficulty' => 1,
            'review' => ['status' => 'editorial', 'lastChecked' => '2026-11-08'],
            'content' => ['oneLiner' => '测试用', 'criteria' => ['P 波']],
        ]],
    ];
}

try {
    check('valid pack passes validation', function () use ($packId): void {
        $result = CoursePack::validate(fixture($packId));
        assert($result['ok'] === true);
        assert($result['summary']['chapters'] === 1);
        assert($result['summary']['articles'] === 1);
    });

    check('invalid packs report reasons', function () use ($packId): void {
        $bad = fixture($packId);
        $bad['sources'] = [];
        $bad['articles'][] = $bad['articles'][0];
        $bad['articles'][0]['chapter'] = 'missing';
        $bad['name'] = '<script>alert(1)</script>';
        $result = CoursePack::validate($bad);
        assert($result['ok'] === false);
        $text = implode(' ', $result['errors']);
        assert(str_contains($text, 'sources'));
        assert(str_contains($text, '重复'));
        assert(str_contains($text, '不存在章节'));
        assert(str_contains($text, '脚本'));
    });

    check('import namespaces ids and stores a draft', function () use ($packId): void {
        $result = CoursePack::import(fixture($packId), 0);
        assert($result['summary']['id'] === $packId);
        assert(strlen($result['sha256']) === 64);
        $payload = CoursePack::payload($result['id']);
        assert($payload['namespace'] === $packId);
        assert($payload['articles'][0]['localId'] === $packId . ':normal-sinus');
        assert($payload['chapters'][0]['localId'] === $packId . ':basics');
        $published = array_column(CoursePack::listPublished(), 'packId');
        assert(!in_array($packId, $published, true));
        try {
            CoursePack::import(fixture($packId), 0);
            throw new RuntimeException('expected duplicate rejection');
        } catch (ApiError $e) {
            assert($e->status === 409 && $e->errorCode === 'pack_exists');
        }
    });

    check('publishing exposes the pack publicly, archiving hides it', function (): void {
        global $packId;
        $pdo = Db::pdo();
        $stmt = $pdo->prepare('SELECT id FROM course_packs WHERE pack_id = ? LIMIT 1');
        $stmt->execute([$packId]);
        $id = (int) $stmt->fetchColumn();
        CoursePack::setStatus($id, 'published');
        $published = array_column(CoursePack::listPublished(), 'packId');
        assert(in_array($packId, $published, true));
        $pack = CoursePack::publishedByPackId($packId);
        assert($pack['id'] === $packId);
        CoursePack::setStatus($id, 'archived');
        $published = array_column(CoursePack::listPublished(), 'packId');
        assert(!in_array($packId, $published, true));
    });
} finally {
    Db::pdo()->prepare('DELETE FROM course_packs WHERE pack_id = ?')->execute([$packId]);
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
