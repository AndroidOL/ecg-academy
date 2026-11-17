<?php
declare(strict_types=1);

$root = dirname(__DIR__);
$all = [];
foreach (glob($root . '/data/diagnoses/*.php') as $file) {
    foreach (include $file as $diagnosis) {
        if (!isset($diagnosis['ecg'])) {
            continue;
        }
        $all[$diagnosis['id']] = [
            'id' => $diagnosis['id'],
            'name' => $diagnosis['name'] ?? $diagnosis['id'],
            'ecg' => $diagnosis['ecg'],
            'source' => 'diagnosis',
        ];
    }
}
$combos = include $root . '/data/combos.php';
foreach ($combos as $combo) {
    $primary = $combo['primary'] ?? null;
    if (!$primary || !isset($all[$primary])) {
        continue;
    }
    $ecg = $all[$primary]['ecg'];
    foreach (($combo['overrides'] ?? []) as $key => $value) {
        if (is_array($value) && isset($ecg[$key]) && is_array($ecg[$key])) {
            $ecg[$key] = array_replace_recursive($ecg[$key], $value);
        } else {
            $ecg[$key] = $value;
        }
    }
    $id = $primary . '+' . ($combo['secondary'] ?? 'combo');
    $all[$id] = [
        'id' => $id,
        'name' => $combo['stem'] ?? $id,
        'ecg' => $ecg,
        'source' => 'combo',
    ];
}
echo json_encode(array_values($all), JSON_UNESCAPED_UNICODE);
