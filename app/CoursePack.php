<?php
declare(strict_types=1);

namespace App;

final class CoursePack
{
    public static function validate(array $pack): array
    {
        $errors = [];
        foreach (['id', 'name', 'version', 'license', 'authors', 'sources', 'chapters', 'articles'] as $key) {
            if (!array_key_exists($key, $pack) || $pack[$key] === '' || $pack[$key] === []) $errors[] = "缺少字段 {$key}";
        }
        if (!preg_match('/^[a-z0-9][a-z0-9._-]{1,63}$/', (string) ($pack['id'] ?? ''))) $errors[] = 'id 需为 2–64 位小写字母/数字/._-';
        if (!preg_match('/^\d+\.\d+\.\d+$/', (string) ($pack['version'] ?? ''))) $errors[] = 'version 需为语义化版本，如 1.0.0';
        if (!is_array($pack['sources'] ?? null) || count((array) $pack['sources']) < 1) $errors[] = 'sources 至少 1 条';
        if (!is_array($pack['authors'] ?? null) || count((array) $pack['authors']) < 1) $errors[] = 'authors 至少 1 人';

        $chapters = [];
        foreach ((array) ($pack['chapters'] ?? []) as $index => $chapter) {
            if (!is_array($chapter) || empty($chapter['id']) || empty($chapter['name'])) { $errors[] = "chapters[{$index}] 缺 id/name"; continue; }
            if (isset($chapters[$chapter['id']])) $errors[] = "章节 id 重复：{$chapter['id']}";
            $chapters[$chapter['id']] = true;
        }
        $articleCount = 0;
        $ids = [];
        foreach ((array) ($pack['articles'] ?? []) as $index => $article) {
            if (!is_array($article) || empty($article['id']) || empty($article['name']) || empty($article['chapter'])) {
                $errors[] = "articles[{$index}] 缺 id/name/chapter"; continue;
            }
            if (isset($ids[$article['id']])) $errors[] = "文章 id 重复：{$article['id']}";
            $ids[$article['id']] = true;
            $articleCount++;
            if (!isset($chapters[$article['chapter']])) $errors[] = "文章 {$article['id']} 引用不存在章节 {$article['chapter']}";
            $difficulty = (int) ($article['difficulty'] ?? 0);
            if ($difficulty < 1 || $difficulty > 3) $errors[] = "文章 {$article['id']} difficulty 需为 1–3";
            if (!empty($article['review']) && !in_array(($article['review']['status'] ?? ''), ['editorial', 'clinical_reviewed', 'deprecated'], true)) {
                $errors[] = "文章 {$article['id']} review.status 无效";
            }
        }
        $raw = json_encode($pack, JSON_UNESCAPED_UNICODE) ?: '';
        if (preg_match('/<script|onerror\s*=|javascript:/i', $raw)) $errors[] = '内容含潜在脚本片段';

        return [
            'ok' => $errors === [],
            'errors' => array_values(array_unique($errors)),
            'summary' => [
                'id' => (string) ($pack['id'] ?? ''),
                'version' => (string) ($pack['version'] ?? ''),
                'name' => (string) ($pack['name'] ?? ''),
                'license' => (string) ($pack['license'] ?? ''),
                'chapters' => count($chapters),
                'articles' => $articleCount,
                'authors' => count((array) ($pack['authors'] ?? [])),
                'sources' => count((array) ($pack['sources'] ?? [])),
            ],
        ];
    }

    public static function import(array $pack, int $adminId): array
    {
        $checked = self::validate($pack);
        if (!$checked['ok']) {
            throw new ApiError(422, 'pack_invalid', '课程包校验失败：' . implode('；', array_slice($checked['errors'], 0, 5)));
        }
        $packId = strtolower((string) $pack['id']);
        $chapters = [];
        foreach ((array) $pack['chapters'] as $chapter) {
            $chapter['localId'] = $packId . ':' . $chapter['id'];
            $chapter['packId'] = $packId;
            $chapters[] = $chapter;
        }
        $articles = [];
        foreach ((array) $pack['articles'] as $article) {
            $article['localId'] = $packId . ':' . $article['id'];
            $article['localChapter'] = $packId . ':' . $article['chapter'];
            $article['packId'] = $packId;
            $articles[] = $article;
        }
        $normalized = array_merge($pack, [
            'id' => $packId,
            'chapters' => $chapters,
            'articles' => $articles,
            'namespace' => $packId,
        ]);
        $json = json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        if (strlen($json) > 4194304) throw new ApiError(413, 'pack_too_large', '课程包过大（上限 4MB）');
        $hash = hash('sha256', $json);
        $reviewStatus = 'editorial';
        foreach ($articles as $article) {
            if (($article['review']['status'] ?? '') === 'clinical_reviewed') { $reviewStatus = 'clinical_reviewed'; break; }
        }
        try {
            Db::pdo()->prepare(
                'INSERT INTO course_packs (pack_id, version, name, license, review_status, status, payload, sha256, chapter_count, article_count, imported_by)
                 VALUES (?, ?, ?, ?, ?, "draft", ?, ?, ?, ?, ?)'
            )->execute([
                $packId,
                (string) $pack['version'],
                mb_substr((string) $pack['name'], 0, 120, 'UTF-8'),
                mb_substr((string) $pack['license'], 0, 80, 'UTF-8'),
                $reviewStatus,
                $json,
                $hash,
                count($chapters),
                count($articles),
                $adminId > 0 ? $adminId : null,
            ]);
        } catch (\PDOException $e) {
            if ((string) $e->getCode() === '23000') throw new ApiError(409, 'pack_exists', '该课程包版本已存在');
            throw $e;
        }
        return ['id' => (int) Db::pdo()->lastInsertId(), 'summary' => $checked['summary'], 'sha256' => $hash, 'reviewStatus' => $reviewStatus];
    }

    public static function listAll(): array
    {
        $rows = Db::pdo()->query('SELECT id, pack_id, version, name, license, review_status, status, chapter_count, article_count, sha256, created_at, updated_at FROM course_packs ORDER BY id DESC LIMIT 100')->fetchAll();
        return array_map([self::class, 'publicRow'], $rows);
    }

    public static function listPublished(): array
    {
        $rows = Db::pdo()->query("SELECT id, pack_id, version, name, license, review_status, status, chapter_count, article_count, sha256, created_at, updated_at FROM course_packs WHERE status = 'published' ORDER BY updated_at DESC LIMIT 50")->fetchAll();
        return array_map([self::class, 'publicRow'], $rows);
    }

    public static function payload(int $id, bool $publishedOnly = false): array
    {
        $sql = 'SELECT payload, status FROM course_packs WHERE id = ?' . ($publishedOnly ? " AND status = 'published'" : '') . ' LIMIT 1';
        $stmt = Db::pdo()->prepare($sql);
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) throw new ApiError(404, 'pack_not_found', '课程包不存在或未发布');
        $payload = json_decode((string) $row['payload'], true);
        return is_array($payload) ? $payload : [];
    }

    public static function publishedByPackId(string $packId): array
    {
        $stmt = Db::pdo()->prepare("SELECT id FROM course_packs WHERE pack_id = ? AND status = 'published' ORDER BY id DESC LIMIT 1");
        $stmt->execute([strtolower($packId)]);
        $id = (int) ($stmt->fetchColumn() ?: 0);
        if ($id === 0) throw new ApiError(404, 'pack_not_found', '课程包不存在或未发布');
        return self::payload($id, true);
    }

    public static function setStatus(int $id, string $status): array
    {
        if (!in_array($status, ['draft', 'published', 'archived'], true)) {
            throw new ApiError(422, 'invalid_status', '状态无效');
        }
        $stmt = Db::pdo()->prepare('UPDATE course_packs SET status = ? WHERE id = ?');
        $stmt->execute([$status, $id]);
        if ($stmt->rowCount() === 0) throw new ApiError(404, 'pack_not_found', '课程包不存在');
        return ['id' => $id, 'status' => $status];
    }

    private static function publicRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'packId' => (string) $row['pack_id'],
            'version' => (string) $row['version'],
            'name' => (string) $row['name'],
            'license' => (string) $row['license'],
            'reviewStatus' => (string) $row['review_status'],
            'status' => (string) $row['status'],
            'chapters' => (int) $row['chapter_count'],
            'articles' => (int) $row['article_count'],
            'sha256' => (string) $row['sha256'],
            'createdAt' => (string) $row['created_at'],
            'updatedAt' => (string) $row['updated_at'],
        ];
    }
}
