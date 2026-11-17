<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;
use App\EcgFeatures;

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
    check('anterior STEMI exposes contiguous ST elevation and reciprocal depression', function (): void {
        $features = EcgFeatures::fromSpec(Content::find('stemi-anterior')['ecg']);
        assert(array_values(array_intersect(['V1', 'V2', 'V3', 'V4'], $features['stElevation'])) === ['V1', 'V2', 'V3', 'V4']);
        assert(array_values(array_intersect(['II', 'III', 'aVF'], $features['stDepression'])) === ['II', 'III', 'aVF']);
        assert($features['qrsWide'] === false);
        assert($features['pSinus'] === true);
    });

    check('LBBB is wide with V1 QS and V5/V6 broad R', function (): void {
        $features = EcgFeatures::fromSpec(Content::find('lbbb')['ecg']);
        assert($features['qrsWide'] === true);
        assert(str_contains($features['morphology'], 'LBBB'));
        assert($features['primaryLead'] === 'V5');
    });

    check('AF has absent P and irregular RR', function (): void {
        $features = EcgFeatures::fromSpec(Content::find('afib')['ecg']);
        assert($features['pAbsent'] === true);
        assert($features['rr'] === '不规则');
    });

    check('PE exposes right axis and S1Q3T3 lead notes', function (): void {
        $features = EcgFeatures::fromSpec(Content::find('pulmonary-embolism')['ecg']);
        assert($features['axis'] === '电轴右偏');
        assert(isset($features['leadNotes']['I']) && str_contains($features['leadNotes']['I'], 's='));
        assert(isset($features['leadNotes']['III']) && str_contains($features['leadNotes']['III'], 'q='));
    });
} finally {
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
