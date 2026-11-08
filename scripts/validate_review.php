<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;

$review = require BASE_PATH . '/data/review.php';
$errors = [];
$warnings = [];
$default = $review['default'] ?? [];
$chapters = $review['chapters'] ?? [];
foreach (Content::chapters() as $chapter) {
    $meta = array_replace_recursive($default, $chapters[$chapter['id']] ?? []);
    if (empty($meta['sources'])) $errors[] = "章节 {$chapter['id']} 缺少参考来源";
    if (empty($meta['lastChecked'])) $warnings[] = "章节 {$chapter['id']} 缺少最后核对日期";
    if (($meta['status'] ?? 'editorial') === 'clinical_reviewed' && empty($meta['clinicalReviewers'])) {
        $errors[] = "章节 {$chapter['id']} 标记临床审阅但未记录审阅者";
    }
}
foreach (Content::all() as $article) {
    if (empty($article['chapter'])) continue;
    $meta = array_replace_recursive($default, $chapters[$article['chapter']] ?? [], $review['overrides'][$article['id']] ?? []);
    if (empty($meta['sources'])) $errors[] = "文章 {$article['id']} 缺少来源";
    if (($meta['status'] ?? 'editorial') === 'clinical_reviewed' && empty($meta['clinicalReviewers'])) {
        $errors[] = "文章 {$article['id']} 标记临床审阅但未记录审阅者";
    }
}
$clinical = 0;
foreach (array_merge([$default], array_values($chapters), array_values($review['overrides'] ?? [])) as $meta) {
    if (($meta['status'] ?? '') === 'clinical_reviewed') $clinical++;
}
echo 'Review ledger: ' . count(Content::chapters()) . ' chapters, ' . count(Content::all()) . " articles, {$clinical} clinically reviewed\n";
if ($warnings) echo "Warnings: " . count($warnings) . "\n";
if ($errors) {
    fwrite(STDERR, "Errors:\n- " . implode("\n- ", array_unique($errors)) . "\n");
    exit(1);
}
echo "Errors: 0\n";
