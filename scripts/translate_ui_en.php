<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Secret;
use App\Settings;

$input = $argv[1] ?? '';
$outJson = $argv[2] ?? '';
$outJs = $argv[3] ?? '';
$batchSize = (int) ($argv[4] ?? 18);
if ($input === '' || $outJson === '' || $outJs === '') {
    fwrite(STDERR, "usage: php translate_ui_en.php <input.json> <out.json> <out.js> [batch]\n");
    exit(2);
}
$strings = json_decode((string) file_get_contents($input), true);
if (!is_array($strings)) {
    fwrite(STDERR, "invalid input json\n");
    exit(2);
}

$provider = null;
foreach (Settings::aiProviders() as $candidate) {
    if (filter_var($candidate['enabled'] ?? true, FILTER_VALIDATE_BOOL)) {
        $provider = $candidate;
        break;
    }
}
if ($provider === null) {
    fwrite(STDERR, "no enabled AI provider\n");
    exit(3);
}
$base = rtrim((string) ($provider['base_url'] ?? ''), '/');
$key = Secret::decrypt((string) ($provider['api_key_enc'] ?? ''));
$model = (string) ($provider['default_model'] ?? ($provider['models'][0] ?? ''));
if ($base === '' || $key === '' || $model === '') {
    fwrite(STDERR, "provider configuration incomplete\n");
    exit(3);
}

$existing = [];
if (is_file($outJson)) {
    $decoded = json_decode((string) file_get_contents($outJson), true);
    if (is_array($decoded)) {
        $existing = $decoded;
    }
}

function callModel(string $base, string $key, string $model, array $messages, int $maxTokens = 8000): ?string
{
    $payload = json_encode([
        'model' => $model,
        'messages' => $messages,
        'temperature' => 0.1,
        'max_tokens' => $maxTokens,
    ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $ch = curl_init($base . (str_ends_with($base, '/chat/completions') ? '' : '/chat/completions'));
    if ($ch === false) {
        return null;
    }
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $key],
        CURLOPT_POSTFIELDS => $payload,
    ]);
    $response = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($response === false || $status < 200 || $status >= 300) {
        fwrite(STDERR, "HTTP $status\n");
        return null;
    }
    $data = json_decode((string) $response, true);
    $message = $data['choices'][0]['message'] ?? [];
    $text = trim((string) ($message['content'] ?? ''));
    if ($text === '') {
        $text = trim((string) ($message['reasoning_content'] ?? ''));
    }
    return $text === '' ? null : $text;
}

function extractMap(string $text): array
{
    $text = preg_replace('/^```(?:json)?|```$/m', '', trim($text)) ?? $text;
    $start = strpos($text, '{');
    $end = strrpos($text, '}');
    if ($start === false || $end === false || $end <= $start) {
        return [];
    }
    $decoded = json_decode(substr($text, $start, $end - $start + 1), true);
    if (is_array($decoded)) {
        return $decoded;
    }
    // Salvage individual "key": "value" pairs from truncated output.
    preg_match_all('/"(\d+)"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/u', $text, $matches, PREG_SET_ORDER);
    $out = [];
    foreach ($matches as $match) {
        $value = json_decode('"' . $match[2] . '"', true);
        if (is_string($value)) {
            $out[$match[1]] = $value;
        }
    }
    return $out;
}

$pending = [];
foreach ($strings as $value) {
    $value = trim((string) $value);
    if ($value === '' || isset($existing[$value])) {
        continue;
    }
    $pending[] = $value;
}
$total = count($pending);
fwrite(STDERR, "translating $total strings\n");
$done = 0;
for ($offset = 0; $offset < $total; $offset += $batchSize) {
    $batch = array_slice($pending, $offset, $batchSize);
    $items = [];
    foreach ($batch as $index => $value) {
        $items[(string) $index] = $value;
    }
    $system = 'You are a professional medical translator localizing an ECG education website from Simplified Chinese to English. '
        . 'Translate each UI string faithfully and concisely. Keep numbers, units, drug names, ECG abbreviations and symbols unchanged. '
        . 'Do not add explanations. Return ONLY a JSON object mapping the same numeric keys to English strings, no markdown fences.';
    $user = json_encode($items, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $text = callModel($base, $key, $model, [
        ['role' => 'system', 'content' => $system],
        ['role' => 'user', 'content' => $user],
    ]);
    $map = $text === null ? [] : extractMap($text);
    foreach ($batch as $index => $value) {
        $translated = $map[(string) $index] ?? null;
        if (is_string($translated) && trim($translated) !== '') {
            $existing[$value] = trim($translated);
        } else {
            fwrite(STDERR, "missing: $value\n");
        }
    }
    $done += count($batch);
    file_put_contents($outJson, json_encode($existing, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n");
    fwrite(STDERR, "progress $done / $total\n");
    usleep(250000);
}

ksort($existing, SORT_NATURAL);
file_put_contents($outJson, json_encode($existing, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . "\n");
$js = "// Generated by scripts/translate_ui_en.php. Source: data/i18n/ui-en.json.\nexport default " . json_encode($existing, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . ";\n";
file_put_contents($outJs, $js);
fwrite(STDERR, "wrote " . count($existing) . " translations\n");
