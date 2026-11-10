<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;

$passed = 0;
$failed = 0;

function check(string $name, callable $fn): void
{
    global $passed, $failed;
    try {
        $fn();
        $passed++;
        echo "  ok  {$name}\n";
    } catch (Throwable $e) {
        $failed++;
        echo "  FAIL {$name}: " . $e->getMessage() . "\n";
    }
}

try {
    check('guideline content is attached to high-yield diagnoses', function (): void {
        foreach (['stemi-anterior', 'stemi-inferior', 'afib', 'atrial-flutter', 'vt', 'vf', 'hyperkalemia', 'pulmonary-embolism', 'av-block-3', 'long-qt', 'wpw', 'brugada', 'pericarditis'] as $id) {
            $detail = Content::detail($id);
            assert(is_array($detail), $id . ' missing');
            assert(isset($detail['guideline']) && is_array($detail['guideline']), $id . ' guideline missing');
            assert(count($detail['guideline']['markers'] ?? []) >= 2, $id . ' markers');
            assert(count($detail['guideline']['workflow'] ?? []) >= 2, $id . ' workflow');
            assert(count($detail['guideline']['safety'] ?? []) >= 2, $id . ' safety');
            assert(($detail['guideline']['sources'] ?? []) !== [], $id . ' sources');
        }
    });

    check('guideline disclaimer tells learners to follow clinicians', function (): void {
        $detail = Content::detail('stemi-anterior');
        $disclaimer = (string) ($detail['guideline']['disclaimer'] ?? '');
        assert(str_contains($disclaimer, '医生'));
        assert(str_contains($disclaimer, '教学'));
        assert(str_contains($disclaimer, '不能替代'));
    });
} finally {
    echo "\n{$passed} passed, {$failed} failed\n";
}

exit($failed === 0 ? 0 : 1);
