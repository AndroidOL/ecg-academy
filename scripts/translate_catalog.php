<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Secret;
use App\Settings;

$inputFile = $argv[1] ?? '';
$outputFile = $argv[2] ?? '';
$limitChars = (int) ($argv[3] ?? 2200);
if ($inputFile === '' || $outputFile === '') {
    fwrite(STDERR, "usage: php translate_catalog.php <input.json> <output.json> [chars]\n");
    exit(2);
}
$sources = json_decode((string) file_get_contents($inputFile), true);
if (!is_array($sources)) {
    fwrite(STDERR, "invalid input\n");
    exit(2);
}
$provider = null;
foreach (Settings::aiProviders() as $candidate) {
    if (filter_var($candidate['enabled'] ?? true, FILTER_VALIDATE_BOOL)) { $provider = $candidate; break; }
}
if ($provider === null) { fwrite(STDERR, "no provider\n"); exit(3); }
$base = rtrim((string) $provider['base_url'], '/');
$key = Secret::decrypt((string) ($provider['api_key_enc'] ?? ''));
$model = (string) ($provider['default_model'] ?? ($provider['models'][0] ?? ''));
if ($base === '' || $key === '' || $model === '') { fwrite(STDERR, "provider incomplete\n"); exit(3); }

$out = [];
if (is_file($outputFile)) {
    $decoded = json_decode((string) file_get_contents($outputFile), true);
    if (is_array($decoded)) $out = $decoded;
}

function callModel(string $base, string $key, string $model, array $messages, int $maxTokens = 8000): ?string
{
    $payload = json_encode([
        'model' => $model, 'messages' => $messages, 'temperature' => 0.05, 'max_tokens' => $maxTokens,
    ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $ch = curl_init($base . (str_ends_with($base, '/chat/completions') ? '' : '/chat/completions'));
    if ($ch === false) return null;
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 150,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $key],
        CURLOPT_POSTFIELDS => $payload,
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($response === false || $status < 200 || $status >= 300) { fwrite(STDERR, "HTTP $status\n"); return null; }
    $data = json_decode((string) $response, true);
    $message = $data['choices'][0]['message'] ?? [];
    $text = trim((string) ($message['content'] ?? ''));
    if ($text === '') $text = trim((string) ($message['reasoning_content'] ?? ''));
    return $text === '' ? null : $text;
}

function parseItems(string $text): array
{
    $text = preg_replace('/^```(?:json)?|```$/m', '', trim($text)) ?? $text;
    $start = strpos($text, '[');
    $end = strrpos($text, ']');
    if ($start === false || $end === false || $end <= $start) return [];
    $decoded = json_decode(substr($text, $start, $end - $start + 1), true);
    if (!is_array($decoded)) return [];
    $map = [];
    foreach ($decoded as $item) {
        if (!is_array($item)) continue;
        $id = (string) ($item['id'] ?? '');
        $en = trim((string) ($item['en'] ?? ''));
        if ($id !== '' && $en !== '') $map[$id] = $en;
    }
    return $map;
}

$pending = array_values(array_filter(array_map('strval', $sources), static fn (string $s): bool => trim($s) !== '' && !isset($out[$s])));
$total = count($pending);
fwrite(STDERR, "translating $total strings\n");
$done = 0;
for ($i = 0; $i < $total;) {
    $batch = [];
    $chars = 0;
    while ($i < $total && count($batch) < 20) {
        $source = $pending[$i];
        $len = mb_strlen($source, 'UTF-8');
        if ($batch !== [] && $chars + $len > $limitChars) break;
        $batch[] = $source;
        $chars += $len;
        $i++;
    }
    $items = [];
    foreach ($batch as $index => $source) $items[] = ['id' => (string) $index, 'zh' => $source];
    $system = 'You are a professional medical translator localizing an ECG teaching website from Simplified Chinese to English. '
        . 'Translate every item faithfully; keep numbers, units, drug names, ECG abbreviations and symbols. '
        . 'Return ONLY a JSON array of objects {"id":"same id","en":"translation"} with exactly the same ids. No markdown, no explanations.';
    $text = callModel($base, $key, $model, [
        ['role' => 'system', 'content' => $system],
        ['role' => 'user', 'content' => json_encode($items, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)],
    ]);
    $map = $text === null ? [] : parseItems($text);
    foreach ($batch as $index => $source) {
        $en = $map[(string) $index] ?? '';
        if ($en === '') {
            // Retry the single item to avoid losing alignment.
            $textSingle = callModel($base, $key, $model, [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => json_encode([['id' => '0', 'zh' => $source]], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)],
            ]);
            $single = $textSingle === null ? [] : parseItems($textSingle);
            $en = $single['0'] ?? '';
        }
        if ($en !== '') $out[$source] = $en;
        else fwrite(STDERR, "missing: " . mb_substr($source, 0, 60, 'UTF-8') . "\n");
    }
    $done += count($batch);
    file_put_contents($outputFile, json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n");
    fwrite(STDERR, "progress $done / $total\n");
    usleep(200000);
}
file_put_contents($outputFile, json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n");
fwrite(STDERR, "wrote " . count($out) . "\n");
