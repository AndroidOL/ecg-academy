<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;

$chapters = array_column(Content::chapters(), 'id');
$all = Content::all();
$errors = [];
$ids = [];
$topicCount = 0;
$ecgCount = 0;
foreach ($all as $item) {
    $id = (string) ($item['id'] ?? '');
    if ($id === '' || isset($ids[$id])) $errors[] = '重复或空 ID: ' . $id;
    $ids[$id] = true;
    if (!in_array((string) ($item['chapter'] ?? ''), $chapters, true)) $errors[] = "$id: 章节不存在";
    if (empty($item['name'])) $errors[] = "$id: 缺少 name";
    if (empty($item['oneLiner'])) $errors[] = "$id: 缺少 oneLiner";
    if (!in_array((int) ($item['difficulty'] ?? 0), [1, 2, 3], true)) $errors[] = "$id: 难度无效";
    if (empty($item['tags']) || !is_array($item['tags'])) $errors[] = "$id: 缺少 tags";
    if (!empty($item['ecg'])) $ecgCount++;
    if (!empty($item['topic'])) {
        $topicCount++;
        if (!in_array((string) ($item['urgency'] ?? ''), ['critical', 'urgent', 'core', 'advanced'], true)) $errors[] = "$id: urgency 无效";
        if (empty($item['objectives']) || !is_array($item['objectives'])) $errors[] = "$id: 缺少 objectives";
        if (empty($item['sections']) || !is_array($item['sections'])) $errors[] = "$id: 缺少 sections";
        foreach (($item['sections'] ?? []) as $i => $section) {
            if (empty($section['title'])) $errors[] = "$id: section[$i] 缺少标题";
            if (empty($section['body']) && empty($section['list'])) $errors[] = "$id: section[$i] 没有内容";
        }
        if (empty($item['keyPoints']) || !is_array($item['keyPoints'])) $errors[] = "$id: 缺少 keyPoints";
    }
}
if (count($all) < 200) $errors[] = '课程总数少于 200';
if (!isset($ids['normal-sinus'])) $errors[] = '缺少 normal-sinus';
if (!isset($ids['heart-conduction-anatomy'])) $errors[] = '缺少基础理论章';
echo 'Curriculum: ' . count($all) . ' chapters / ' . count($chapters) . ' sections' . PHP_EOL;
echo 'Theory topics: ' . $topicCount . ' · ECG articles: ' . $ecgCount . PHP_EOL;
echo 'Errors: ' . count($errors) . PHP_EOL;
foreach ($errors as $error) echo 'ERROR ' . $error . PHP_EOL;
exit($errors === [] ? 0 : 1);
