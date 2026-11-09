<?php
declare(strict_types=1);

// 为 19 个章节生成确定性的学习/考试题库。
// 只从策展内容字段派生，避免编造新医学结论；同一板块目标 50 题，理论板块 30 题。
require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;

$chapters = Content::chapters();
$all = Content::all();
$byChapter = [];
foreach ($all as $item) $byChapter[$item['chapter']][] = $item;
$clean = static function (string $text): string {
    $text = trim(preg_replace('/\s+/u', ' ', preg_replace('/<(?=[a-zA-Z\/!])[^>]*>/u', '', $text)) ?? '');
    return mb_substr($text, 0, 260, 'UTF-8');
};
$chapterNames = [];
foreach ($chapters as $chapter) $chapterNames[$chapter['id']] = $chapter['name'];
$nameCounts = [];
foreach ($all as $candidate) {
    $rawName = (string) ($candidate['name'] ?? '');
    $nameCounts[$rawName] = ($nameCounts[$rawName] ?? 0) + 1;
}
$displayNameById = [];
foreach ($all as $id => $candidate) {
    $rawName = (string) ($candidate['name'] ?? $id);
    $displayNameById[$id] = $nameCounts[$rawName] > 1
        ? $rawName . '（' . ($chapterNames[$candidate['chapter']] ?? $candidate['chapter']) . '）'
        : $rawName;
}
$keyNumberText = static function (array $number): string {
    $value = trim((string) ($number['value'] ?? ''));
    $unit = trim((string) ($number['unit'] ?? ''));
    $label = trim((string) ($number['label'] ?? ''));
    return $value . ($unit !== '' ? $unit : '') . ($label !== '' ? '（' . $label . '）' : '');
};
$sourceTextById = [];
foreach ($all as $item) {
    $texts = [];
    if (!empty($displayNameById[$item['id']])) $texts[] = (string) $displayNameById[$item['id']];
    else if (!empty($item['name'])) $texts[] = (string) $item['name'];
    foreach (['en', 'oneLiner', 'specificity', 'definition', 'clinicalPearl'] as $field) {
        if (!empty($item[$field])) $texts[] = (string) $item[$field];
    }
    foreach (['criteria', 'reading', 'redFlags', 'management', 'pitfalls', 'pearls', 'keyPoints', 'objectives', 'mechanism'] as $field) {
        foreach (($item[$field] ?? []) as $line) if (is_string($line)) $texts[] = $line;
    }
    foreach (($item['sections'] ?? []) as $section) {
        if (!empty($section['title'])) $texts[] = (string) $section['title'];
        foreach (($section['body'] ?? []) as $line) if (is_string($line)) $texts[] = $line;
    }
    foreach (($item['keyNumbers'] ?? []) as $number) {
        if (is_array($number)) {
            $value = $keyNumberText($number);
            if ($value !== '') $texts[] = $value;
        }
    }
    foreach (($item['differential'] ?? []) as $diff) {
        $target = $all[$diff['id'] ?? ''] ?? null;
        if ($target) $texts[] = (string) ($displayNameById[$target['id']] ?? $target['name']);
        if (!empty($diff['why'])) $texts[] = (string) $diff['why'];
    }
    $sourceTextById[$item['id']] = array_values(array_unique(array_filter(array_map($clean, $texts))));
}


$stableShuffle = static function (array $values, string $salt): array {
    usort($values, static fn (string $a, string $b): int => crc32($salt . $a) <=> crc32($salt . $b));
    return $values;
};
$tooSimilar = static function (string $a, string $b) use ($clean): bool {
    $a = strtolower(preg_replace('/[^\p{Han}a-z0-9]+/u', '', $clean($a)) ?? '');
    $b = strtolower(preg_replace('/[^\p{Han}a-z0-9]+/u', '', $clean($b)) ?? '');
    if ($a === '' || $b === '') return false;
    if (str_contains($a, $b) || str_contains($b, $a)) return true;
    $grams = static function (string $text): array {
        $out = [];
        $len = mb_strlen($text, 'UTF-8');
        for ($i = 0; $i + 1 < $len; $i++) $out[mb_substr($text, $i, 2, 'UTF-8')] = true;
        return $out;
    };
    $ga = $grams($a); $gb = $grams($b);
    if ($ga === [] || $gb === []) return false;
    $intersection = count(array_intersect_key($ga, $gb));
    $union = count($ga) + count($gb) - $intersection;
    return $union > 0 && ($intersection / $union) >= 0.4;
};
$out = [];
$report = [];

foreach ($chapters as $chapter) {
    $cid = (string) $chapter['id'];
    $items = $byChapter[$cid] ?? [];
    $crossItems = array_values(array_filter($all, static fn (array $candidate): bool => $candidate['chapter'] !== $cid));
    $goal = $cid === 'theory' ? 80 : 100;
    $questions = [];
    $used = [];
    $globalPool = [];
    foreach ($all as $candidate) {
        foreach (['oneLiner', 'specificity', 'definition', 'clinicalPearl'] as $field) {
            if (!empty($candidate[$field])) $globalPool[] = $clean((string) $candidate[$field]);
        }
        foreach (['criteria', 'reading', 'redFlags', 'management', 'pitfalls', 'pearls', 'keyPoints', 'objectives'] as $field) {
            foreach (($candidate[$field] ?? []) as $line) $globalPool[] = $clean((string) $line);
        }
        foreach (($candidate['sections'] ?? []) as $section) {
            if (!empty($section['title'])) $globalPool[] = $clean((string) $section['title']);
            foreach (($section['body'] ?? []) as $line) $globalPool[] = $clean((string) $line);
        }
    }
    $globalPool = array_values(array_unique(array_filter($globalPool)));
    $sectionBodyPool = [];
    foreach ($crossItems as $candidate) {
        foreach (($candidate['sections'] ?? []) as $candidateSection) {
            foreach (($candidateSection['body'] ?? []) as $line) if (is_string($line)) $sectionBodyPool[] = $line;
        }
    }
    $sectionBodyPool = array_values(array_unique(array_filter($sectionBodyPool)));
    $crossNames = array_values(array_filter(array_map(static fn (array $candidate): string => (string) ($displayNameById[$candidate['id']] ?? ($candidate['name'] ?? '')), $crossItems)));
    $crossKeyNumbers = [];
    foreach ($crossItems as $candidate) foreach (($candidate['keyNumbers'] ?? []) as $number) if (is_array($number)) $crossKeyNumbers[] = $keyNumberText($number);
    $crossKeyNumbers = array_values(array_unique(array_filter($crossKeyNumbers)));
    $crossDiffWhy = [];
    foreach ($crossItems as $candidate) foreach (($candidate['differential'] ?? []) as $diff) if (!empty($diff['why'])) $crossDiffWhy[] = (string) $diff['why'];
    $crossDiffWhy = array_values(array_unique(array_filter($crossDiffWhy)));

    $add = static function (string $stem, string $correct, array $pool, string $sourceId, string $explanation, int $difficulty = 1) use (&$questions, &$used, $cid, $clean, $globalPool, $stableShuffle, $sourceTextById, $tooSimilar): void {
        $correct = $clean($correct);
        if ($correct === '' || isset($used[$stem])) return;
        $positive = !str_contains($stem, '英文名称') && !str_contains($stem, '哪个学习板块') && !str_contains($stem, '需要与');
        $forbidden = $positive ? ($sourceTextById[$sourceId] ?? []) : [];
        $isForbidden = static fn (string $text): bool => in_array($clean($text), $forbidden, true);
        $options = [$correct];
        foreach ($pool as $candidate) {
            $text = $clean((string) $candidate);
            if ($text !== '' && $text !== $correct && !in_array($text, $options, true) && !$isForbidden($text) && !$tooSimilar($text, $correct)) $options[] = $text;
            if (count($options) >= 4) break;
        }
        foreach ($globalPool as $candidate) {
            if (count($options) >= 4) break;
            $text = $clean((string) $candidate);
            if ($text !== '' && $text !== $correct && !in_array($text, $options, true) && !$isForbidden($text) && !$tooSimilar($text, $correct)) $options[] = $text;
        }
        if (count($options) < 4) return;
        $options = $stableShuffle(array_slice($options, 0, 4), $cid . '|' . $stem);
        $used[$stem] = true;
        $questions[] = [
            'id' => 'sec-' . $cid . '-' . str_pad((string) (count($questions) + 1), 3, '0', STR_PAD_LEFT),
            'chapter' => $cid,
            'sourceId' => $sourceId,
            'stem' => $stem,
            'options' => $options,
            'answerIndex' => array_search($correct, $options, true),
            'explanation' => $explanation,
            'difficulty' => max(1, min(3, $difficulty)),
        ];
    };

    $poolFor = static function (string $field) use ($crossItems, $clean): array {
        $pool = [];
        foreach ($crossItems as $item) {
            $value = $item[$field] ?? null;
            if (is_string($value)) $pool[] = $clean($value);
            elseif (is_array($value)) {
                foreach ($value as $entry) {
                    if (is_string($entry)) $pool[] = $clean($entry);
                    elseif (is_array($entry)) {
                        foreach (['why', 'title', 'name'] as $key) if (!empty($entry[$key])) $pool[] = $clean((string) $entry[$key]);
                    }
                }
            }
        }
        return array_values(array_unique(array_filter($pool)));
    };
    $crossPoolFor = $poolFor;
    $otherFieldPool = static function (string $excludeField) use ($crossItems, $clean): array {
        $fields = ['oneLiner', 'specificity', 'definition', 'clinicalPearl', 'criteria', 'reading', 'redFlags', 'management', 'pitfalls', 'pearls', 'keyPoints', 'objectives', 'mechanism'];
        $pool = [];
        foreach ($crossItems as $item) {
            foreach ($fields as $field) {
                if ($field === $excludeField) continue;
                $value = $item[$field] ?? null;
                if (is_string($value)) $pool[] = $clean($value);
                elseif (is_array($value)) {
                    foreach ($value as $entry) if (is_string($entry)) $pool[] = $clean($entry);
                }
            }
            foreach (($item['sections'] ?? []) as $section) {
                foreach (($section['body'] ?? []) as $line) if (is_string($line)) $pool[] = $clean($line);
            }
        }
        return array_values(array_unique(array_filter($pool)));
    };

    foreach ($items as $item) {
        $name = (string) ($displayNameById[$item['id']] ?? ($item['name'] ?? $item['id']));
        $difficulty = (int) ($item['difficulty'] ?? 1);
        foreach ([
            ['oneLiner', '一句话描述'],
            ['specificity', '最具特异性的线索'],
            ['definition', '定义'],
        ] as [$field, $label]) {
            if (!empty($item[$field])) {
                $add("按本站《{$name}》课程，以下哪项是{$label}？", (string) $item[$field], $poolFor($field), $item['id'], "《{$name}》的{$label}：" . $clean((string) $item[$field]), $difficulty);
            }
        }
        foreach (['oneLiner', 'specificity'] as $reverseField) {
            if (empty($item[$reverseField])) continue;
            $description = $clean((string) $item[$reverseField]);
            if ($description === '') continue;
            $add("按本站课程，以下描述最符合哪个主题？{$description}", $name, $crossNames, $item['id'], "该描述对应《{$name}》：{$description}", $difficulty);
        }
        foreach (($item['keyNumbers'] ?? []) as $number) {
            if (!is_array($number)) continue;
            $correctNumber = $keyNumberText($number);
            if ($correctNumber === '') continue;
            $add("按本站《{$name}》课程，以下哪项是其关键数值？", $correctNumber, $crossKeyNumbers, $item['id'], "《{$name}》关键数值：{$correctNumber}", $difficulty);
        }
        foreach ([
            ['criteria', '诊断标准'],
            ['reading', '判读步骤'],
            ['redFlags', '危险信号'],
            ['management', '处理原则'],
            ['pitfalls', '易错点'],
            ['pearls', '记忆点'],
            ['keyPoints', '关键点'],
            ['objectives', '学习目标'],
            ['mechanism', '发生机制'],
        ] as [$field, $label]) {
            $lines = $item[$field] ?? [];
            if (is_string($lines)) $lines = [$lines];
            foreach ($lines as $line) {
                if (!is_string($line) || trim($line) === '') continue;
                $add("按本站《{$name}》课程，以下哪项属于其{$label}？", $line, $crossPoolFor($field), $item['id'], "《{$name}》{$label}：" . $clean($line), $difficulty);
            }
        }
        foreach (($item['sections'] ?? []) as $section) {
            foreach (($section['body'] ?? []) as $line) {
                if (is_string($line) && trim($line) !== '') {
                    $add("按本站《{$name}》课程，以下哪项描述正确？", $line, $sectionBodyPool, $item['id'], "《{$name}》教学要点：" . $clean($line), $difficulty);
                }
            }
        }
        foreach (($item['differential'] ?? []) as $diff) {
            if (!empty($diff['id'])) {
                $target = $all[$diff['id']] ?? null;
                $targetName = $displayNameById[$target['id']] ?? ($target['name'] ?? $diff['id']);
                $correct = $targetName;
                $add("按本站课程，《{$name}》需要与以下哪个诊断重点鉴别？", $correct, array_values(array_filter(array_map(static fn (array $d): string => $d['name'] ?? '', $items))), $item['id'], "《{$name}》需与《{$targetName}》鉴别：" . $clean((string) ($diff['why'] ?? '')), $difficulty);
                if (!empty($diff['why'])) {
                    $why = $clean((string) $diff['why']);
                    $add("按本站课程，《{$name}》与《{$targetName}》的主要鉴别点是？", $why, $crossDiffWhy, $item['id'], "《{$name}》与《{$targetName}》的鉴别点：{$why}", $difficulty);
                }
            }
        }
        if (!empty($item['en'])) {
            $correct = (string) $item['en'];
            $add("按本站课程，《{$name}》的英文名称是？", $correct, array_values(array_filter(array_map(static fn (array $d): string => (string) ($d['en'] ?? ''), $items))), $item['id'], "{$name}：" . $clean($correct), 1);
        }
    }

    // 章节归类题：作为最后补充
    foreach ($items as $item) {
        $correct = $chapter['name'];
        $pool = array_values(array_filter(array_values($chapterNames), static fn (string $name): bool => $name !== $correct));
        $pool = $stableShuffle($pool, $cid . '|chapter');
        $add("按本站课程，《{$item['name']}》属于哪个学习板块？", $correct, $pool, $item['id'], "《{$item['name']}》属于“{$correct}”板块。", 1);
    }

    $questions = array_slice($questions, 0, $goal);
    $out = array_merge($out, $questions);
    $report[] = [$cid, count($items), count($questions), $goal];
}

$content = "<?php\ndeclare(strict_types=1);\n\n// 由 scripts/build_section_bank.php 生成；请勿手工编辑。\nreturn " . var_export($out, true) . ";\n";
$content = rtrim(preg_replace('/[ \t]+$/m', '', $content)) . "\n";
file_put_contents(BASE_PATH . '/data/section_bank.php', $content, LOCK_EX);
echo 'Section bank: ' . count($out) . " questions\n";
foreach ($report as [$id, $items, $count, $goal]) {
    echo sprintf(" - %-20s items=%2d questions=%2d target=%2d%s\n", $id, $items, $count, $goal, $count < $goal ? ' (content-limited)' : '');
}
