<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;
use App\QuestionBank;
use App\Quiz;
use App\SpecialQuestions;

$errors = [];
$seen = [];
$all = Content::all();
$poolChecks = [
    'bundle-block' => ['rbbb', 'lbbb', 'lafb'],
    'av-block' => ['av-block-1', 'av-block-2a', 'av-block-2b', 'av-block-3'],
    'mi' => ['stemi-anterior', 'stemi-inferior', 'stemi-posterior', 'stemi-rv', 'ischemia-st'],
];
foreach (SpecialQuestions::all() as $entry) {
    $id = (string) ($entry['id'] ?? '');
    $where = $id !== '' ? $id : 'special question';
    if ($id === '' || isset($seen[$id])) $errors[] = "{$where}: id 为空或重复";
    $seen[$id] = true;
    if (!isset($all[(string) ($entry['primary'] ?? '')])) $errors[] = "{$where}: primary 不存在";
    if (trim((string) ($entry['module'] ?? '')) === '') $errors[] = "{$where}: module 为空";
    if (trim((string) ($entry['question'] ?? '')) === '') $errors[] = "{$where}: question 为空";
    if (trim((string) ($entry['stem'] ?? '')) === '') $errors[] = "{$where}: stem 为空";
    $options = $entry['options'] ?? null;
    if (!is_array($options) || count($options) < 2) {
        $errors[] = "{$where}: 至少需要 2 个选项";
        continue;
    }
    $ids = [];
    foreach ($options as $option) {
        $oid = (string) ($option['id'] ?? '');
        if ($oid === '' || isset($ids[$oid])) $errors[] = "{$where}: 选项 id 为空或重复";
        $ids[$oid] = true;
        if (trim((string) ($option['name'] ?? '')) === '') $errors[] = "{$where}: 选项 {$oid} 缺少名称";
    }
    if (empty($entry['correctIds']) || array_diff((array) $entry['correctIds'], array_keys($ids))) {
        $errors[] = "{$where}: correctIds 不在选项中";
    }
    if (empty($entry['explanations'])) $errors[] = "{$where}: 缺少解析";
}
foreach ($poolChecks as $module => $pool) {
    $filtered = array_values(array_filter($all, static fn (array $d): bool => in_array($d['id'], $pool, true)));
    $primary = $filtered[0] ?? null;
    if (!$primary) {
        $errors[] = "{$module}: 选项池缺少诊断";
        continue;
    }
    $options = Quiz::buildOptions($primary, null, false, '', null, $pool);
    $ids = array_column($options, 'id');
    if (array_diff($ids, $pool)) $errors[] = "{$module}: 出现专项外干扰项";
    if (count($ids) < 2) $errors[] = "{$module}: 选项不足";
}
$special = QuestionBank::pick(3, 'all', [], 'posterior-rv');
if (!$special || (string) ($special['module'] ?? '') !== 'posterior-rv') {
    $errors[] = 'posterior-rv: 未返回专项病例';
}
if ($errors !== []) {
    fwrite(STDERR, "special questions 校验失败：\n- " . implode("\n- ", array_unique($errors)) . "\n");
    exit(1);
}
echo 'Special questions: ' . count(SpecialQuestions::all()) . " entries; option pools: " . count($poolChecks) . " ok\n";
