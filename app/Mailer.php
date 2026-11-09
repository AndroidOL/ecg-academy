<?php
declare(strict_types=1);

namespace App;

final class Mailer
{
    public static function configured(): bool
    {
        return Settings::bool('smtp.enabled', false)
            && trim((string) Settings::get('smtp.host', '')) !== ''
            && filter_var((string) Settings::get('smtp.from_email', ''), FILTER_VALIDATE_EMAIL) !== false;
    }

    public static function send(string $to, string $subject, string $body): array
    {
        if (!self::configured()) return ['ok' => false, 'message' => '邮件服务尚未配置'];
        if (filter_var($to, FILTER_VALIDATE_EMAIL) === false) return ['ok' => false, 'message' => '收件邮箱无效'];
        $host = trim((string) Settings::get('smtp.host', ''));
        $port = max(1, min(65535, Settings::int('smtp.port', 587)));
        $secure = strtolower((string) Settings::get('smtp.secure', 'tls'));
        if (!in_array($secure, ['tls', 'ssl', 'none'], true)) $secure = 'tls';
        if (preg_match('/[\r\n]/', $host . $to . $subject)) return ['ok' => false, 'message' => '邮件头包含非法字符'];
        $username = (string) Settings::get('smtp.username', '');
        $password = Secret::decrypt((string) Settings::get('smtp.password_enc', ''));
        $from = (string) Settings::get('smtp.from_email', '');
        $fromName = trim((string) Settings::get('smtp.from_name', Config::get('app.name', 'ECG Lab')));
        $timeout = 12;
        $remote = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
        $errno = 0; $errstr = '';
        $fp = @stream_socket_client($remote, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT);
        if (!$fp) {
            error_log('[mail] connect failed: ' . $errno . ' ' . $errstr);
            return ['ok' => false, 'message' => '无法连接邮件服务器'];
        }
        stream_set_timeout($fp, $timeout);
        $read = static function () use ($fp): string {
            $data = '';
            while (($line = fgets($fp, 2048)) !== false) {
                $data .= $line;
                if (strlen($line) < 4 || $line[3] !== '-') break;
            }
            return $data;
        };
        $expect = static function (string $response, string $codes) use (&$fp): bool {
            $code = substr(trim($response), 0, 3);
            if (!in_array($code, explode(',', $codes), true)) {
                @fclose($fp);
                return false;
            }
            return true;
        };
        $cmd = static function (string $command, string $codes) use ($fp, $read, $expect): bool {
            fwrite($fp, $command . "\r\n");
            return $expect($read(), $codes);
        };
        try {
            if (!$expect($read(), '220')) return ['ok' => false, 'message' => '邮件服务器未就绪'];
            $ehlo = 'EHLO ' . (gethostname() ?: 'localhost');
            if (!$cmd($ehlo, '250')) return ['ok' => false, 'message' => 'EHLO 失败'];
            if ($secure === 'tls') {
                if (!$cmd('STARTTLS', '220')) return ['ok' => false, 'message' => 'STARTTLS 失败'];
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) return ['ok' => false, 'message' => 'TLS 握手失败'];
                if (!$cmd($ehlo, '250')) return ['ok' => false, 'message' => 'TLS 后 EHLO 失败'];
            }
            if ($username !== '') {
                if (!$cmd('AUTH LOGIN', '334')) return ['ok' => false, 'message' => 'SMTP AUTH 不可用'];
                if (!$cmd(base64_encode($username), '334')) return ['ok' => false, 'message' => 'SMTP 用户名被拒绝'];
                if (!$cmd(base64_encode($password), '235')) return ['ok' => false, 'message' => 'SMTP 密码被拒绝'];
            }
            if (!$cmd('MAIL FROM:<' . $from . '>', '250')) return ['ok' => false, 'message' => '发件人被拒绝'];
            if (!$cmd('RCPT TO:<' . $to . '>', '250,251')) return ['ok' => false, 'message' => '收件人被拒绝'];
            if (!$cmd('DATA', '354')) return ['ok' => false, 'message' => 'DATA 被拒绝'];
            $headers = [
                'From: =?UTF-8?B?' . base64_encode($fromName) . '?= <' . $from . '>',
                'To: <' . $to . '>',
                'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: base64',
                'Date: ' . date(DATE_RFC2822),
                'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . (parse_url('http://' . $host, PHP_URL_HOST) ?: 'localhost') . '>',
            ];
            $message = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($body), 76, "\r\n");
            if (!$cmd($message . '.', '250')) return ['ok' => false, 'message' => '邮件发送失败'];
            $cmd('QUIT', '221');
            return ['ok' => true, 'message' => '已发送'];
        } finally {
            if (is_resource($fp)) @fclose($fp);
        }
    }
}
