<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

$chapters = require BASE_PATH . '/data/chapters.php';
$chapterIds = array_column($chapters, 'id');
$files = glob(BASE_PATH . '/data/diagnoses/*.php') ?: [];
$all = [];
$known = \App\Content::all();
$errors = [];
$warnings = [];

$required = [
    'id', 'name', 'en', 'chapter', 'difficulty', 'tags', 'oneLiner', 'definition',
    'keyNumbers', 'specificity', 'mechanism', 'criteria', 'reading', 'redFlags',
    'management', 'pitfalls', 'differential', 'pearls', 'ecg',
];
$rhythms = ['sinus', 'af', 'flutter', 'atrial_tach', 'svt', 'vt', 'vf', 'vflutter', 'torsades', 'junctional', 'ventricular_escape', 'aivr', 'asystole', 'paced'];
$morphologies = ['normal', 'rbbb', 'lbbb', 'lafb', 'lvh', 'wpw', 'brugada', 'hyperk', 'wide', 'pvc'];

foreach ($files as $file) {
    $items = require $file;
    if (!is_array($items)) {
        $errors[] = basename($file) . ': 未返回数组';
        continue;
    }
    foreach ($items as $item) {
        $id = $item['id'] ?? '(missing)';
        foreach ($required as $field) {
            if (!array_key_exists($field, $item)) {
                $errors[] = "$id: 缺少字段 $field";
            }
        }
        if (isset($all[$id])) {
            $errors[] = "$id: 重复 ID";
        }
        $all[$id] = $item;
        if (!in_array($item['chapter'] ?? '', $chapterIds, true)) {
            $errors[] = "$id: 章节不存在 " . ($item['chapter'] ?? '');
        }
        if (count($item['keyNumbers'] ?? []) !== 4) {
            $warnings[] = "$id: keyNumbers 不是 4 项";
        }
        foreach ($item['differential'] ?? [] as $diff) {
            if (!isset($diff['id'])) {
                $errors[] = "$id: differential 缺少 id";
            }
        }
        $ecg = $item['ecg'] ?? [];
        if (!in_array($ecg['rhythm'] ?? '', $rhythms, true)) {
            $errors[] = "$id: 非法 rhythm " . ($ecg['rhythm'] ?? '');
        }
        if (!in_array($ecg['morphology'] ?? 'normal', $morphologies, true)) {
            $errors[] = "$id: 非法 morphology " . ($ecg['morphology'] ?? '');
        }
        if (!is_array($ecg['st'] ?? null) || !is_array($ecg['st']['elevation'] ?? null) || !is_array($ecg['st']['depression'] ?? null)) {
            $errors[] = "$id: st 结构不完整";
        }
        if (!is_array($ecg['annotations'] ?? null)) {
            $errors[] = "$id: annotations 必须为数组";
        }
        if (isset($ecg['leads']) && !is_array($ecg['leads'])) {
            $errors[] = "$id: leads 必须为数组";
        }
        foreach (['rate', 'atrialRate', 'pr', 'qrs', 'qt'] as $numKey) {
            if (!is_numeric($ecg[$numKey] ?? null)) {
                $warnings[] = "$id: ecg.$numKey 非数字";
            }
        }
        if (mb_strlen($item['definition'] ?? '', 'UTF-8') < 50) {
            $warnings[] = "$id: definition 偏短";
        }
    }
}

foreach ($all as $id => $item) {
    foreach ($item['differential'] ?? [] as $diff) {
        if (isset($diff['id']) && !isset($all[$diff['id']]) && !isset($known[$diff['id']])) {
            $errors[] = "$id: differential 引用不存在 {$diff['id']}";
        }
    }
}

$guidelineFile = BASE_PATH . '/data/guidelines.php';
if (!is_file($guidelineFile)) {
    $errors[] = '缺少 data/guidelines.php';
} else {
    $guidelines = require $guidelineFile;
    $groups = is_array($guidelines) ? ($guidelines['groups'] ?? []) : [];
    $map = is_array($guidelines) ? ($guidelines['map'] ?? []) : [];
    if (!is_array($groups) || !is_array($map)) {
        $errors[] = 'guidelines.php 结构无效';
    } else {
        foreach ($map as $id => $groupKey) {
            if (!isset($all[$id])) $errors[] = "guideline map 引用不存在诊断 {$id}";
            if (!isset($groups[$groupKey])) $errors[] = "guideline map 引用不存在分组 {$groupKey}";
        }
        foreach ($groups as $groupKey => $group) {
            foreach (['title', 'markers', 'workflow', 'safety', 'sources'] as $field) {
                if (!isset($group[$field])) $errors[] = "guideline {$groupKey}: 缺少 {$field}";
            }
            foreach (['markers', 'workflow', 'safety'] as $field) {
                if (!is_array($group[$field] ?? null) || count((array) $group[$field]) < 2) {
                    $errors[] = "guideline {$groupKey}: {$field} 内容不足";
                }
            }
        }
        if (trim((string) ($guidelines['disclaimer'] ?? '')) === '') $errors[] = 'guideline 缺少免责声明';
    }
}

$byChapter = [];
foreach ($all as $item) {
    $byChapter[$item['chapter']] = ($byChapter[$item['chapter']] ?? 0) + 1;
}

echo "诊断总数: " . count($all) . PHP_EOL;
foreach ($chapterIds as $cid) {
    echo " - $cid: " . ($byChapter[$cid] ?? 0) . PHP_EOL;
}
echo "警告 " . count($warnings) . " 条，错误 " . count($errors) . " 条" . PHP_EOL;
foreach ($warnings as $w) echo "WARN $w" . PHP_EOL;
foreach ($errors as $e) echo "ERROR $e" . PHP_EOL;
exit($errors === [] ? 0 : 1);
