<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;

$bank = require BASE_PATH . '/data/section_bank.php';
if (!is_array($bank)) {
    fwrite(STDERR, "section_bank.php 必须返回数组\n");
    exit(2);
}
$errors = [];
$ids = [];
$stems = [];
$counts = [];
$chapters = [];
foreach (Content::chapters() as $chapter) $chapters[$chapter['id']] = $chapter;
foreach ($bank as $index => $q) {
    $where = "第 {$index} 题";
    if (!is_array($q)) { $errors[] = "{$where} 不是数组"; continue; }
    $id = (string) ($q['id'] ?? '');
    $chapter = (string) ($q['chapter'] ?? '');
    if ($id === '' || isset($ids[$id])) $errors[] = "{$where} id 为空或重复：{$id}";
    $ids[$id] = true;
    if (!isset($chapters[$chapter])) $errors[] = "{$where} 章节不存在：{$chapter}";
    $counts[$chapter] = ($counts[$chapter] ?? 0) + 1;
    $stem = trim((string) ($q['stem'] ?? ''));
    if ($stem === '') $errors[] = "{$where} 题干为空";
    if (isset($stems[$stem])) $errors[] = "{$where} 题干重复：{$stem}";
    $stems[$stem] = true;
    $options = $q['options'] ?? null;
    if (!is_array($options) || count($options) !== 4) $errors[] = "{$where} 必须有 4 个选项";
    else {
        $unique = array_values(array_unique(array_map('trim', $options)));
        if (count($unique) !== 4) $errors[] = "{$where} 选项重复";
        foreach ($options as $option) if (trim((string) $option) === '' || mb_strlen((string) $option, 'UTF-8') > 320) $errors[] = "{$where} 选项为空或过长";
    }
    $answer = (int) ($q['answerIndex'] ?? -1);
    if ($answer < 0 || $answer > 3) $errors[] = "{$where} answerIndex 无效";
    if (empty($q['explanation'])) $errors[] = "{$where} 缺少解析";
    if (empty($q['sourceId']) || !Content::find((string) $q['sourceId'])) $errors[] = "{$where} 来源主题不存在";
}
foreach ($chapters as $cid => $chapter) {
    if (($counts[$cid] ?? 0) < 10) $errors[] = "章节 {$cid} 题量不足 10（{$counts[$cid]}）";
}
if ($errors !== []) {
    fwrite(STDERR, "section bank 校验失败：\n- " . implode("\n- ", array_slice(array_unique($errors), 0, 50)) . "\n");
    exit(1);
}
echo 'Section bank: ' . count($bank) . ' questions / ' . count($chapters) . " chapters\n";
foreach ($counts as $cid => $count) echo " - {$cid}: {$count}\n";
echo "Errors: 0\n";
