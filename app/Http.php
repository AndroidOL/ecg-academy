<?php
declare(strict_types=1);

namespace App;

final class Http
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        exit;
    }

    public static function ok(mixed $data = null, array $meta = []): never
    {
        $payload = ['ok' => true, 'data' => $data];
        if ($meta !== []) {
            $payload['meta'] = $meta;
        }
        self::json($payload);
    }

    public static function fail(int $status, string $code, string $message, array $details = []): never
    {
        self::json([
            'ok' => false,
            'error' => [
                'code' => $code,
                'message' => $message,
                'details' => $details,
            ],
        ], $status);
    }

    public static function input(): array
    {
        $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
        if ($contentType !== '' && !str_contains($contentType, 'application/json')) {
            throw new ApiError(415, 'unsupported_media_type', '请使用 application/json 提交');
        }
        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            return [];
        }
        if (strlen($raw) > 65536) {
            throw new ApiError(413, 'payload_too_large', '请求体过大');
        }
        try {
            $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiError(400, 'invalid_json', '请求体不是合法 JSON');
        }
        if (!is_array($data)) {
            throw new ApiError(400, 'invalid_json', '请求体必须是 JSON 对象');
        }
        return $data;
    }

    public static function clientIp(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    public static function requirePost(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
            throw new ApiError(405, 'method_not_allowed', '仅支持 POST');
        }
    }
}
