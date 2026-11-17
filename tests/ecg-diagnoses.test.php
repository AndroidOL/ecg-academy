<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;
use App\EcgDiagnoses;
use App\Quiz;

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
    $all = Content::all();
    check('second-degree 2b plus RBBB yields both diagnoses', function () use ($all): void {
        $d = $all['av-block-2b'];
        $ids = EcgDiagnoses::derive($d['ecg'], ['av-block-2b'], $all);
        assert(in_array('av-block-2b', $ids, true));
        assert(in_array('rbbb', $ids, true));
    });

    check('PR prolongation plus LBBB yields first-degree AV block and LBBB', function () use ($all): void {
        $ids = EcgDiagnoses::derive([
            'rhythm' => 'sinus', 'rate' => 70, 'p' => 'normal', 'pr' => 0.24,
            'qrs' => 0.14, 'morphology' => 'lbbb', 'axis' => 'left',
        ], ['normal-sinus'], $all);
        assert(in_array('av-block-1', $ids, true));
        assert(in_array('lbbb', $ids, true));
    });

    check('hyperkalemia PR prolongation is not mislabeled as AV block', function () use ($all): void {
        $d = $all['hyperkalemia'];
        $ids = EcgDiagnoses::derive($d['ecg'], ['hyperkalemia'], $all);
        assert(!in_array('av-block-1', $ids, true));
        assert(in_array('hyperkalemia', $ids, true));
    });

    check('paced LBBB morphology is not labeled as bundle branch block', function () use ($all): void {
        $d = $all['paced-vvi-rhythm'];
        $ids = EcgDiagnoses::derive($d['ecg'], ['paced-vvi-rhythm'], $all);
        assert(!in_array('lbbb', $ids, true));
    });

    check('option builder includes all derived correct diagnoses', function () use ($all): void {
        $options = Quiz::buildOptions($all['av-block-2b'], null, true, '', null, null, null, ['av-block-2b', 'rbbb']);
        $ids = array_column($options, 'id');
        assert(in_array('av-block-2b', $ids, true));
        assert(in_array('rbbb', $ids, true));
        assert(count($ids) <= 6);
    });

    check('multi-diagnosis question wording is explicit', function (): void {
        assert(EcgDiagnoses::questionForMulti('该心电图最可能的诊断是？') === '该心电图包含哪些诊断？（多选）');
        assert(EcgDiagnoses::questionForMulti('该心电图包含哪些诊断？（多选）') === '该心电图包含哪些诊断？（多选）');
    });
} finally {
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
