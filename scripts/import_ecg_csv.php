<?php
declare(strict_types=1);

// 单导联/多导联 CSV → 脱敏教学波形 JSON。仅保留时间与电压，不写入患者身份字段。
// 用法：php scripts/import_ecg_csv.php input.csv [--lead=II] [--rate=500] [--out=data/imports/case.json]

require dirname(__DIR__) . '/app/bootstrap.php';

$args = array_slice($argv, 1);
$input = null;
$lead = 'II';
$rate = 500;
$out = null;
foreach ($args as $arg) {
    if (str_starts_with($arg, '--lead=')) $lead = strtoupper(substr($arg, 7));
    elseif (str_starts_with($arg, '--rate=')) $rate = max(100, min(2000, (int) substr($arg, 7)));
    elseif (str_starts_with($arg, '--out=')) $out = substr($arg, 6);
    elseif (!str_starts_with($arg, '--') && $input === null) $input = $arg;
}
if (!$input || !is_file($input)) {
    fwrite(STDERR, "用法: php scripts/import_ecg_csv.php <input.csv> [--lead=II] [--rate=500] [--out=data/imports/case.json]\n");
    exit(2);
}

$raw = file_get_contents($input);
if ($raw === false) {
    fwrite(STDERR, "无法读取输入文件\n");
    exit(2);
}
$raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
$lines = preg_split('/\r\n|\n|\r/', trim($raw));
if (!$lines || count($lines) < 3) {
    fwrite(STDERR, "CSV 至少需要表头和两行波形数据\n");
    exit(2);
}
$delimiter = ',';
$headerLine = $lines[0];
foreach ([',', ';', "\t"] as $candidate) {
    if (substr_count($headerLine, $candidate) >= 1) { $delimiter = $candidate; break; }
}
$header = array_map(static fn (string $x): string => strtolower(trim($x, " \t\"'")), str_getcsv($headerLine, $delimiter, '"', '\\'));
$timeIndex = null;
$valueIndex = null;
foreach ($header as $index => $name) {
    if (in_array($name, ['time', 't', 'sec', 'seconds', 'timestamp', 'time_s', '时间'], true)) $timeIndex = $index;
    if (in_array($name, [strtolower($lead), 'mv', 'value', 'amplitude', 'voltage', '电压'], true)) $valueIndex = $index;
}
if ($timeIndex === null || $valueIndex === null) {
    fwrite(STDERR, "未找到时间列（time/t/sec）或电压列（导联名/mv/value）\n");
    exit(2);
}

$points = [];
foreach (array_slice($lines, 1) as $line) {
    if (trim($line) === '') continue;
    $cols = str_getcsv($line, $delimiter, '"', '\\');
    $t = $cols[$timeIndex] ?? null;
    $v = $cols[$valueIndex] ?? null;
    if (!is_numeric($t) || !is_numeric($v)) continue;
    $t = (float) $t;
    $v = (float) $v;
    if (!is_finite($t) || !is_finite($v) || abs($v) > 20) continue;
    $points[] = [$t, $v];
}
if (count($points) < 10) {
    fwrite(STDERR, "有效波形点不足 10 个\n");
    exit(2);
}
foreach ($points as $i => $point) {
    if ($i > 0 && $point[0] <= $points[$i - 1][0]) {
        fwrite(STDERR, "时间列必须严格递增（发现重复或倒序）\n");
        exit(2);
    }
}
$start = $points[0][0];
$end = $points[count($points) - 1][0];
if ($end - $start > 120) {
    fwrite(STDERR, "单段波形超过 120 秒；请先切片\n");
    exit(2);
}
// 若时间列以毫秒给出，自动换算为秒。
if (($end - $start) > 1000 && ($points[1][0] - $points[0][0]) >= 1) {
    foreach ($points as &$point) { $point[0] /= 1000; }
    unset($point);
    $start /= 1000; $end /= 1000;
}
$duration = $end - $start;
$count = max(2, (int) round($duration * $rate) + 1);
$samples = [];
$cursor = 0;
for ($i = 0; $i < $count; $i += 1) {
    $t = $start + $i / $rate;
    while ($cursor < count($points) - 2 && $points[$cursor + 1][0] < $t) $cursor++;
    [$t0, $v0] = $points[$cursor];
    [$t1, $v1] = $points[$cursor + 1];
    $span = $t1 - $t0;
    $samples[] = round($span > 0 ? $v0 + (($t - $t0) / $span) * ($v1 - $v0) : $v0, 4);
}
$out = $out ?: ('data/imports/' . preg_replace('/[^a-zA-Z0-9._-]+/', '-', pathinfo($input, PATHINFO_FILENAME)) . '.json');
$outPath = str_starts_with($out, '/') ? $out : BASE_PATH . '/' . ltrim($out, '/');
$dir = dirname($outPath);
if (!is_dir($dir)) mkdir($dir, 0750, true);
$payload = [
    'schemaVersion' => 1,
    'kind' => 'ecg-waveform-import',
    'anonymized' => true,
    'lead' => $lead,
    'sampleRate' => $rate,
    'duration' => round($duration, 4),
    'units' => 'mV',
    'samples' => $samples,
    'source' => [
        'format' => 'csv',
        'file' => basename($input),
        'sha256' => hash('sha256', $raw),
        'importedAt' => date(DATE_ATOM),
    ],
    'review' => ['status' => 'unreviewed', 'note' => '教学研究导入；使用前需人工核对导联、定标与临床背景。'],
];
$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
file_put_contents($outPath, $json, LOCK_EX);
echo "imported: {$outPath}\n";
echo "lead={$lead} rate={$rate}Hz duration={$duration}s samples=" . count($samples) . " sha256=" . substr($payload['source']['sha256'], 0, 12) . "\n";
