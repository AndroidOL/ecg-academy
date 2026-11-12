<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\ChapterGuides;
use App\Content;

$errors = [];
$chapters = Content::chapters();
$guides = ChapterGuides::references();
$chapterIds = array_column($chapters, 'id');
$guideFile = require BASE_PATH . '/data/chapter_guides.php';
if (!is_array($guideFile)) $guideFile = [];
foreach ($chapterIds as $id) {
    $guide = $guideFile[$id] ?? null;
    if (!is_array($guide)) {
        $errors[] = "{$id}: 缺少章节框架";
        continue;
    }
    foreach (['title', 'overview'] as $field) {
        if (trim((string) ($guide[$field] ?? '')) === '') $errors[] = "{$id}: {$field} 为空";
    }
    foreach (['checklist', 'redFlags', 'pearls'] as $field) {
        if (!is_array($guide[$field] ?? null) || count($guide[$field]) < 2) $errors[] = "{$id}: {$field} 不足";
    }
    foreach ((array) ($guide['references'] ?? []) as $rid) {
        if (!isset($guides[(string) $rid])) $errors[] = "{$id}: 参考文献不存在 {$rid}";
    }
}
foreach ($guides as $id => $ref) {
    if (trim((string) ($ref['url'] ?? '')) === '') $errors[] = "{$id}: 缺少 URL";
    if (trim((string) ($ref['title'] ?? '')) === '') $errors[] = "{$id}: 缺少标题";
}
if ($errors !== []) {
    fwrite(STDERR, "章节框架校验失败：\n- " . implode("\n- ", array_unique($errors)) . "\n");
    exit(1);
}
echo 'Chapter guides: ' . count($chapters) . ' chapters / ' . count($guides) . " references\n";
