<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;
use App\Seo;

$passed = 0;
$failed = 0;

function check(string $name, callable $fn): void
{
    global $passed, $failed;
    try {
        $fn();
        $passed++;
        echo "  ok  {$name}\n";
    } catch (Throwable $e) {
        $failed++;
        echo "  FAIL {$name}: " . $e->getMessage() . "\n";
    }
}

try {
    check('every content id is a safe URL slug', function (): void {
        foreach (array_keys(Content::all()) as $id) {
            assert(preg_match('/^[a-z0-9][a-z0-9-]*$/', (string) $id) === 1, 'unsafe id: ' . $id);
        }
    });

    check('all content points at a known chapter', function (): void {
        $chapters = array_column(Content::chapters(), 'id');
        foreach (Content::summaries() as $item) {
            assert(in_array($item['chapter'], $chapters, true), 'unknown chapter: ' . $item['id']);
        }
    });

    check('content has theory and diagnosis pages', function (): void {
        $items = Content::summaries();
        $theory = array_filter($items, static fn (array $i): bool => $i['chapter'] === 'theory');
        assert(count($theory) > 0, 'theory missing');
        assert(count($items) - count($theory) > 0, 'learn pages missing');
    });

    check('seo base url is absolute and https', function (): void {
        $base = Seo::baseUrl();
        assert(str_starts_with($base, 'https://'), 'base url not https: ' . $base);
        assert(!str_ends_with($base, '/'), 'base url must not end with slash');
    });

    check('sitemap-critical assets exist', function (): void {
        assert(is_file(BASE_PATH . '/public/static/css/seo.css'), 'seo.css missing');
        assert(is_file(BASE_PATH . '/public/static/img/og-cover.png'), 'og-cover.png missing');
        assert(is_file(BASE_PATH . '/public/robots.txt'), 'robots.txt missing');
        $robots = (string) file_get_contents(BASE_PATH . '/public/robots.txt');
        assert(str_contains($robots, 'Sitemap: https://ecg.tianhao.me/sitemap.xml'), 'sitemap line missing');
    });

    check('spa shell advertises canonical and sitemap-friendly links', function (): void {
        $shell = (string) file_get_contents(BASE_PATH . '/public/index.php');
        assert(str_contains($shell, 'rel="canonical"'), 'canonical missing');
        assert(str_contains($shell, 'application/ld+json'), 'json-ld missing');
        assert(str_contains($shell, '/learn#chapter-'), 'noscript chapter links missing');
    });

    check('glossary and guideline data parse', function (): void {
        $glossary = (array) require BASE_PATH . '/data/glossary.php';
        $guidelines = (array) require BASE_PATH . '/data/guidelines-areas.php';
        assert(count($glossary) >= 50, 'glossary too small');
        assert(count($guidelines) >= 5, 'guidelines too small');
        foreach ($glossary as $term) {
            assert(is_array($term) && count($term) === 4, 'bad glossary row');
        }
    });
} finally {
    echo "\n{$passed} passed, {$failed} failed\n";
    if ($failed > 0) {
        exit(1);
    }
}
