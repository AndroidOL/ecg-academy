<?php
declare(strict_types=1);

// 章节题库答案准确性审计：
// 1) 正确答案必须能在来源主题的策展字段中找到；
// 2) 正向题的干扰项不能同时出现在来源主题内容中（避免“两个都对”）；
// 3) 英文名/章节归类/鉴别题单独核对。
require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;

$bank = require BASE_PATH . '/data/section_bank.php';
$all = Content::all();
$chapters = [];
foreach (Content::chapters() as $chapter) $chapters[$chapter['id']] = $chapter;
$nameCounts = [];
foreach ($all as $candidate) {
    $rawName = (string) ($candidate['name'] ?? '');
    $nameCounts[$rawName] = ($nameCounts[$rawName] ?? 0) + 1;
}
$displayNameById = [];
foreach ($all as $id => $candidate) {
    $rawName = (string) ($candidate['name'] ?? $id);
    $displayNameById[$id] = $nameCounts[$rawName] > 1
        ? $rawName . '（' . ($chapters[$candidate['chapter']]['name'] ?? $candidate['chapter']) . '）'
        : $rawName;
}
$keyNumberText = static function (array $number): string {
    $value = trim((string) ($number['value'] ?? ''));
    $unit = trim((string) ($number['unit'] ?? ''));
    $label = trim((string) ($number['label'] ?? ''));
    return $value . ($unit !== '' ? $unit : '') . ($label !== '' ? '（' . $label . '）' : '');
};

$norm = static function (string $text): string {
    $text = trim(preg_replace('/\s+/u', ' ', preg_replace('/<(?=[a-zA-Z\/!])[^>]*>/u', '', $text)) ?? '');
    return mb_substr($text, 0, 260, 'UTF-8');
};

$sourceTexts = static function (array $item) use ($norm, $displayNameById, $keyNumberText): array {
    $out = [];
    $out[] = $norm((string) ($displayNameById[$item['id']] ?? ($item['name'] ?? '')));
    foreach (['en', 'oneLiner', 'specificity', 'definition', 'clinicalPearl'] as $field) {
        if (!empty($item[$field])) $out[] = $norm((string) $item[$field]);
    }
    foreach (['criteria', 'reading', 'redFlags', 'management', 'pitfalls', 'pearls', 'keyPoints', 'objectives', 'mechanism'] as $field) {
        foreach (($item[$field] ?? []) as $line) if (is_string($line)) $out[] = $norm($line);
    }
    foreach (($item['sections'] ?? []) as $section) {
        if (!empty($section['title'])) $out[] = $norm((string) $section['title']);
        foreach (($section['body'] ?? []) as $line) if (is_string($line)) $out[] = $norm($line);
    }
    foreach (($item['keyNumbers'] ?? []) as $number) {
        if (is_array($number)) {
            $value = $keyNumberText($number);
            if ($value !== '') $out[] = $norm($value);
        }
    }
    foreach (($item['differential'] ?? []) as $diff) {
        $target = $all[$diff['id'] ?? ''] ?? null;
        if ($target) $out[] = $norm((string) ($displayNameById[$target['id']] ?? $target['name']));
        if (!empty($diff['why'])) $out[] = $norm((string) $diff['why']);
    }
    return array_values(array_unique(array_filter($out)));
};

$issues = [];
$stats = ['questions' => 0, 'positive' => 0, 'english' => 0, 'chapter' => 0, 'differential' => 0];
foreach ($bank as $q) {
    $stats['questions']++;
    $id = (string) ($q['id'] ?? '');
    $item = $all[$q['sourceId'] ?? ''] ?? null;
    if (!$item) { $issues[] = [$id, 'source_missing', (string) ($q['sourceId'] ?? '')]; continue; }
    $correct = (int) ($q['answerIndex'] ?? -1);
    $options = array_values((array) ($q['options'] ?? []));
    if ($correct < 0 || !isset($options[$correct])) { $issues[] = [$id, 'answer_index', '']; continue; }
    $stem = (string) ($q['stem'] ?? '');
    $correctText = $norm((string) $options[$correct]);
    $texts = $sourceTexts($item);
    if (str_contains($stem, '英文名称')) {
        $stats['english']++;
        if ($correctText !== $norm((string) ($item['en'] ?? ''))) $issues[] = [$id, 'english_mismatch', $correctText];
    } elseif (str_contains($stem, '哪个学习板块')) {
        $stats['chapter']++;
        $expected = $norm((string) ($chapters[$item['chapter']]['name'] ?? ''));
        if ($correctText !== $expected) $issues[] = [$id, 'chapter_mismatch', $correctText];
    } elseif (str_contains($stem, '需要与')) {
        $stats['differential']++;
        $targets = [];
        foreach (($item['differential'] ?? []) as $diff) {
            $target = $all[$diff['id'] ?? ''] ?? null;
            if ($target) $targets[] = $norm((string) ($displayNameById[$target['id']] ?? $target['name']));
        }
        if (!in_array($correctText, $targets, true)) $issues[] = [$id, 'differential_mismatch', $correctText];
    } else {
        $stats['positive']++;
        if (!in_array($correctText, $texts, true)) $issues[] = [$id, 'correct_not_in_source', $correctText];
        foreach ($options as $index => $option) {
            if ($index === $correct) continue;
            $distractor = $norm((string) $option);
            if (in_array($distractor, $texts, true)) $issues[] = [$id, 'distractor_also_in_source', $distractor];
        }
    }
}

$byKind = [];
foreach ($issues as $issue) $byKind[$issue[1]] = ($byKind[$issue[1]] ?? 0) + 1;
echo 'Audited: ' . $stats['questions'] . " questions\n";
echo 'Positive=' . $stats['positive'] . ' English=' . $stats['english'] . ' Chapter=' . $stats['chapter'] . ' Differential=' . $stats['differential'] . "\n";
echo 'Issues: ' . count($issues) . "\n";
foreach ($byKind as $kind => $count) echo " - {$kind}: {$count}\n";
foreach (array_slice($issues, 0, 40) as [$id, $kind, $text]) echo "  {$id} {$kind} " . mb_substr($text, 0, 120, 'UTF-8') . "\n";
if ($issues !== []) exit(1);
