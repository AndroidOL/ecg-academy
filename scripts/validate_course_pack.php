<?php
declare(strict_types=1);

// 校验可插拔课程包（JSON），用于多中心/社区课程仓库的准入。
// 用法：php scripts/validate_course_pack.php path/to/pack.json

$file = $argv[1] ?? '';
if ($file === '' || !is_file($file)) {
    fwrite(STDERR, "用法: php scripts/validate_course_pack.php <pack.json>\n");
    exit(2);
}
$raw = file_get_contents($file);
$data = json_decode((string) $raw, true);
if (!is_array($data)) {
    fwrite(STDERR, "不是合法 JSON\n");
    exit(2);
}
$errors = [];
$required = ['id', 'name', 'version', 'license', 'authors', 'sources', 'chapters', 'articles'];
foreach ($required as $key) {
    if (!array_key_exists($key, $data) || $data[$key] === '' || $data[$key] === []) $errors[] = "缺少字段 {$key}";
}
if (!preg_match('/^[a-z0-9][a-z0-9._-]{1,63}$/', (string) ($data['id'] ?? ''))) $errors[] = 'id 需为 2–64 位小写字母/数字/._-';
if (!preg_match('/^\d+\.\d+\.\d+$/', (string) ($data['version'] ?? ''))) $errors[] = 'version 需为语义化版本，如 1.0.0';
if (!is_array($data['sources'] ?? null) || count((array) $data['sources']) < 1) $errors[] = 'sources 至少 1 条';
if (!is_array($data['authors'] ?? null) || count((array) $data['authors']) < 1) $errors[] = 'authors 至少 1 人';

$chapters = [];
foreach ((array) ($data['chapters'] ?? []) as $index => $chapter) {
    if (!is_array($chapter) || empty($chapter['id']) || empty($chapter['name'])) { $errors[] = "chapters[{$index}] 缺 id/name"; continue; }
    if (isset($chapters[$chapter['id']])) $errors[] = "章节 id 重复：{$chapter['id']}";
    $chapters[$chapter['id']] = true;
}
$articleIds = [];
foreach ((array) ($data['articles'] ?? []) as $index => $article) {
    if (!is_array($article) || empty($article['id']) || empty($article['name']) || empty($article['chapter'])) {
        $errors[] = "articles[{$index}] 缺 id/name/chapter"; continue;
    }
    if (isset($articleIds[$article['id']])) $errors[] = "文章 id 重复：{$article['id']}";
    $articleIds[$article['id']] = true;
    if (!isset($chapters[$article['chapter']])) $errors[] = "文章 {$article['id']} 引用不存在章节 {$article['chapter']}";
    $difficulty = (int) ($article['difficulty'] ?? 0);
    if ($difficulty < 1 || $difficulty > 3) $errors[] = "文章 {$article['id']} difficulty 需为 1–3";
    if (!empty($article['review']) && !in_array(($article['review']['status'] ?? ''), ['editorial', 'clinical_reviewed', 'deprecated'], true)) {
        $errors[] = "文章 {$article['id']} review.status 无效";
    }
}
foreach (['name', 'license', 'description'] as $key) {
    if (isset($data[$key]) && preg_match('/<script|onerror\s*=|javascript:/i', (string) $data[$key])) $errors[] = "{$key} 含潜在脚本内容";
}
if ($errors !== []) {
    fwrite(STDERR, "课程包校验失败：\n- " . implode("\n- ", array_unique($errors)) . "\n");
    exit(1);
}
echo "课程包校验通过：{$data['id']}@{$data['version']} · " . count($chapters) . ' 章 · ' . count($articleIds) . " 篇\n";
