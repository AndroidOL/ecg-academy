<?php
declare(strict_types=1);
require dirname(__DIR__) . '/app/bootstrap.php';
use App\Content;
use App\QuestionBank;

$all = QuestionBank::all();
$stats = QuestionBank::stats();
$errors = [];
$ids = [];
$comboMap = [];
foreach (require BASE_PATH . '/data/combos.php' as $combo) $comboMap[$combo['id']] = $combo;
foreach ($all as $entry) {
    $id = (string) ($entry['id'] ?? '');
    if ($id === '' || isset($ids[$id])) $errors[] = "重复或空 ID: $id";
    $ids[$id] = true;
    if (!Content::find((string) ($entry['primary'] ?? ''))) $errors[] = "$id: primary 不存在";
    if (!empty($entry['secondary']) && !Content::find((string) $entry['secondary'])) $errors[] = "$id: secondary 不存在";
    if (!empty($entry['combo']) && !isset($comboMap[$entry['combo']])) $errors[] = "$id: combo 不存在";
    if (!in_array((int) ($entry['level'] ?? 0), [1, 2, 3], true)) $errors[] = "$id: level 无效";
    if ((int) ($entry['seed'] ?? 0) < 1) $errors[] = "$id: seed 无效";
    if (empty($entry['question'])) $errors[] = "$id: 缺少 question";
    if (!is_null($entry['rate'] ?? null) && ((int) $entry['rate'] < 20 || (int) $entry['rate'] > 320)) $errors[] = "$id: rate 超出范围";
    if (empty($entry['chapter'])) $errors[] = "$id: 缺少 chapter";
    if (!empty($entry['secondary']) && (int) ($entry['level'] ?? 0) !== 3) $errors[] = "$id: 组合题 level 必须为 3";
    $primary = Content::find((string) ($entry['primary'] ?? ''));
    if ($primary && ($primary['quizEligible'] ?? true) === false) $errors[] = "$id: primary 不进入题库";
}
if ($stats['total'] < 1400) $errors[] = '题库少于 1400 道';
echo 'Question bank: ' . $stats['total'] . ' cases' . PHP_EOL;
echo 'By level: ' . json_encode($stats['byLevel'], JSON_UNESCAPED_UNICODE) . PHP_EOL;
echo 'By chapter: ' . json_encode($stats['byChapter'], JSON_UNESCAPED_UNICODE) . PHP_EOL;
echo 'Errors: ' . count($errors) . PHP_EOL;
foreach ($errors as $error) echo "ERROR $error" . PHP_EOL;
exit($errors === [] ? 0 : 1);
