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
$chapterNames = [];
foreach ($chapters as $chapter) $chapterNames[$chapter['id']] = $chapter['name'];

$clean = static function (string $text): string {
    $text = trim(preg_replace('/\s+/u', ' ', strip_tags($text)) ?? '');
    return mb_substr($text, 0, 260, 'UTF-8');
};

$stableShuffle = static function (array $values, string $salt): array {
    usort($values, static fn (string $a, string $b): int => crc32($salt . $a) <=> crc32($salt . $b));
    return $values;
};
$out = [];
$report = [];

foreach ($chapters as $chapter) {
    $cid = (string) $chapter['id'];
    $items = $byChapter[$cid] ?? [];
    $goal = $cid === 'theory' ? 30 : 50;
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

    $add = static function (string $stem, string $correct, array $pool, string $sourceId, string $explanation, int $difficulty = 1) use (&$questions, &$used, $cid, $clean, $globalPool, $stableShuffle): void {
        $correct = $clean($correct);
        if ($correct === '' || isset($used[$stem])) return;
        $options = [$correct];
        foreach ($pool as $candidate) {
            $text = $clean((string) $candidate);
            if ($text !== '' && $text !== $correct && !in_array($text, $options, true)) $options[] = $text;
            if (count($options) >= 4) break;
        }
        foreach ($globalPool as $candidate) {
            if (count($options) >= 4) break;
            $text = $clean((string) $candidate);
            if ($text !== '' && $text !== $correct && !in_array($text, $options, true)) $options[] = $text;
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

    $poolFor = static function (string $field) use ($items, $clean): array {
        $pool = [];
        foreach ($items as $item) {
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

    foreach ($items as $item) {
        $name = (string) ($item['name'] ?? $item['id']);
        $difficulty = (int) ($item['difficulty'] ?? 1);
        foreach ([
            ['oneLiner', '一句话描述'],
            ['specificity', '最具特异性的线索'],
            ['definition', '定义'],
        ] as [$field, $label]) {
            if (!empty($item[$field])) {
                $add("关于《{$name}》，以下哪项是{$label}？", (string) $item[$field], $poolFor($field), $item['id'], "《{$name}》的{$label}：" . $clean((string) $item[$field]), $difficulty);
            }
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
                $add("关于《{$name}》的{$label}，以下哪项正确？", $line, $poolFor($field), $item['id'], "《{$name}》{$label}：" . $clean($line), $difficulty);
            }
        }
        foreach (($item['sections'] ?? []) as $section) {
            foreach (($section['body'] ?? []) as $line) {
                if (is_string($line) && trim($line) !== '') {
                    $add("《{$name}》中，以下哪项描述正确？", $line, $poolFor('sections'), $item['id'], "《{$name}》教学要点：" . $clean($line), $difficulty);
                }
            }
        }
        foreach (($item['differential'] ?? []) as $diff) {
            if (!empty($diff['id'])) {
                $target = $all[$diff['id']] ?? null;
                $targetName = $target['name'] ?? $diff['id'];
                $correct = $targetName;
                $options = ['id' => $diff['id']];
                $add("《{$name}》需要与以下哪个诊断重点鉴别？", $correct, array_values(array_filter(array_map(static fn (array $d): string => $d['name'] ?? '', $items))), $item['id'], "《{$name}》需与《{$targetName}》鉴别：" . $clean((string) ($diff['why'] ?? '')), $difficulty);
                unset($options);
            }
        }
        if (!empty($item['en'])) {
            $correct = (string) $item['en'];
            $add("《{$name}》的英文名称是？", $correct, array_values(array_filter(array_map(static fn (array $d): string => (string) ($d['en'] ?? ''), $items))), $item['id'], "{$name}：" . $clean($correct), 1);
        }
    }

    // 章节归类题：作为最后补充
    foreach ($items as $item) {
        $correct = $chapter['name'];
        $pool = array_values(array_filter(array_values($chapterNames), static fn (string $name): bool => $name !== $correct));
        $pool = $stableShuffle($pool, $cid . '|chapter');
        $add("《{$item['name']}》属于哪个学习板块？", $correct, $pool, $item['id'], "《{$item['name']}》属于“{$correct}”板块。", 1);
    }

    $questions = array_slice($questions, 0, $goal);
    $out = array_merge($out, $questions);
    $report[] = [$cid, count($items), count($questions), $goal];
}

$content = "<?php\ndeclare(strict_types=1);\n\n// 由 scripts/build_section_bank.php 生成；请勿手工编辑。\nreturn " . var_export($out, true) . ";\n";
file_put_contents(BASE_PATH . '/data/section_bank.php', $content, LOCK_EX);
echo 'Section bank: ' . count($out) . " questions\n";
foreach ($report as [$id, $items, $count, $goal]) {
    echo sprintf(" - %-20s items=%2d questions=%2d target=%2d%s\n", $id, $items, $count, $goal, $count < $goal ? ' (content-limited)' : '');
}
