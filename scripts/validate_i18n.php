<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

$root = dirname(__DIR__);
$catalogs = [
    'UI' => $root . '/data/i18n/ui-en.json',
    'Content' => $root . '/data/i18n/content-en.json',
];
$fatal = 0;
$warn = 0;
$total = 0;
$cjk = [];
$numberMismatch = [];
foreach ($catalogs as $label => $file) {
    if (!is_file($file)) {
        echo "MISSING {$file}\n";
        $fatal++;
        continue;
    }
    $data = json_decode((string) file_get_contents($file), true);
    if (!is_array($data)) {
        echo "INVALID JSON {$file}\n";
        $fatal++;
        continue;
    }
    $total += count($data);
    foreach ($data as $source => $target) {
        if (!is_string($target) || trim($target) === '') {
            $warn++;
            echo "EMPTY [{$label}] {$source}\n";
            continue;
        }
        if (preg_match('/\p{Han}/u', $target)) {
            $cjk[] = "[{$label}] {$source} => {$target}";
        }
        $sourceDigits = preg_match_all('/\d+/u', (string) $source, $m1);
        $targetDigits = preg_match_all('/\d+/u', $target, $m2);
        if ($sourceDigits > 0 && $targetDigits === 0) {
            $numberMismatch[] = "[{$label}] {$source} => {$target}";
        }
    }
}
$all = App\Content::all();
$missingEn = 0;
$cjkEn = 0;
foreach ($all as $item) {
    $en = trim((string) ($item['en'] ?? ''));
    if ($en === '') $missingEn++;
    elseif (preg_match('/\p{Han}/u', $en)) $cjkEn++;
}
echo "Catalogs: {$total} entries\n";
echo "CJK left in English values: " . count($cjk) . "\n";
foreach (array_slice($cjk, 0, 15) as $line) echo "  {$line}\n";
echo "Digit mismatches: " . count($numberMismatch) . "\n";
foreach (array_slice($numberMismatch, 0, 10) as $line) echo "  {$line}\n";
echo "Content titles: missing en={$missingEn}, CJK en={$cjkEn}\n";
exit($fatal > 0 ? 1 : 0);
