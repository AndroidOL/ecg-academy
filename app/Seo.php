<?php
declare(strict_types=1);

namespace App;

/**
 * Server-rendered, crawlable pages for search engines.
 *
 * The interactive product is a hash-routed SPA. Search engines (especially
 * Baidu) do not index hash routes reliably, so every public content page also
 * has a real path that returns complete HTML: title/description/canonical,
 * structured data, breadcrumbs and internal links. The SPA stays untouched at
 * "/" and behind "#/..." links; these pages send readers into it via CTA links.
 */
final class Seo
{
    private const SITE_NAME = '心迹 ECG Lab';
    private const SITE_ALT = '心迹 · ECG Lab';
    private const TAGLINE = '读懂每一次心跳';
    private const GITHUB = 'https://github.com/AndroidOL/ecg-academy';

    private const NAV = [
        ['/learn', '诊断图谱'],
        ['/intro', '导论'],
        ['/read', '判读训练'],
        ['/practice', '判读练习'],
        ['/sim', '急救推演'],
        ['/vectors', '向量实验室'],
        ['/glossary', '术语表'],
        ['/guidelines', '指南差异'],
    ];

    /** @var array<string, string>|null */
    private static ?array $chapterOrder = null;

    public static function handle(string $path, string $method): bool
    {
        $path = '/' . trim($path, '/');
        if ($path === '/') {
            return false;
        }

        $method = strtoupper($method);
        if ($method !== 'GET' && $method !== 'HEAD') {
            http_response_code(405);
            header('Allow: GET, HEAD');
            self::notFound('仅支持 GET 请求');
            return true;
        }

        if ($path === '/sitemap.xml') {
            self::sitemap();
            return true;
        }
        if ($path === '/learn') {
            self::learnIndex((string) ($_GET['q'] ?? ''));
            return true;
        }
        if (preg_match('#^/learn/([a-z0-9][a-z0-9-]*)$#', $path, $m)) {
            self::article($m[1]);
            return true;
        }
        if (preg_match('#^/sim/([a-z0-9][a-z0-9-]*)$#', $path, $m)) {
            self::scenario($m[1]);
            return true;
        }

        $simple = [
            '/intro' => 'introIndex',
            '/glossary' => 'glossary',
            '/guidelines' => 'guidelines',
            '/about' => 'about',
            '/read' => 'readGuide',
            '/practice' => 'practice',
            '/sim' => 'simIndex',
            '/vectors' => 'vectors',
            '/lab' => 'lab',
        ];
        if (isset($simple[$path])) {
            self::{$simple[$path]}();
            return true;
        }

        self::notFound('页面不存在');
        return true;
    }

    // ---------------------------------------------------------------- pages

    private static function learnIndex(string $q): void
    {
        $q = trim($q);
        $all = array_values(array_filter(
            Content::summaries(),
            static fn (array $item): bool => ($item['chapter'] ?? '') !== 'theory'
        ));
        $filtered = $all;
        if ($q !== '') {
            $needle = mb_strtolower($q, 'UTF-8');
            $filtered = array_values(array_filter($all, static function (array $item) use ($needle): bool {
                $haystack = mb_strtolower(implode(' ', [
                    (string) ($item['name'] ?? ''),
                    (string) ($item['en'] ?? ''),
                    (string) ($item['oneLiner'] ?? ''),
                    implode(' ', (array) ($item['tags'] ?? [])),
                ]), 'UTF-8');
                return str_contains($haystack, $needle);
            }));
        }

        $chapters = array_values(array_filter(
            Content::chapters(),
            static fn (array $chapter): bool => ($chapter['id'] ?? '') !== 'theory'
        ));
        $grouped = [];
        foreach ($filtered as $item) {
            $grouped[$item['chapter']][] = $item;
        }

        $blocks = '';
        foreach ($chapters as $chapter) {
            $items = $grouped[$chapter['id']] ?? [];
            if ($items === []) {
                continue;
            }
            $blocks .= '<section class="seo-chapter-block" id="chapter-' . self::e($chapter['id']) . '">'
                . '<div class="seo-chapter-head"><div><h2>' . self::e($chapter['name']) . '</h2>'
                . '<p>' . self::e((string) ($chapter['tagline'] ?? $chapter['description'] ?? '')) . '</p></div>'
                . '<span class="seo-count">' . count($items) . ' 篇</span></div>'
                . '<div class="seo-grid">';
            foreach ($items as $item) {
                $blocks .= self::card($item);
            }
            $blocks .= '</div></section>';
        }
        if ($blocks === '') {
            $blocks = '<div class="seo-empty"><b>没有匹配的课程</b><p>换个关键词，或浏览全部课程。</p>'
                . '<a class="seo-btn" href="/learn">查看全部</a></div>';
        }

        $title = $q === ''
            ? '心电图诊断图谱：' . count($all) . ' 篇判读课程与诊断标准 | ' . self::SITE_NAME
            : '搜索“' . $q . '”：心电图课程 | ' . self::SITE_NAME;
        $description = $q === ''
            ? '按章节系统学习心电图：窦性心律、肥大、期前收缩、快速与缓慢性心律失常、传导阻滞、缺血与梗死、电解质、起搏、综合征、儿科与危急值。每篇含定义、机制、诊断标准、判读步骤、危险信号与处理原则。'
            : '在心迹 ECG Lab 的 ' . count($all) . ' 篇心电图课程中搜索“' . $q . '”，返回 ' . count($filtered) . ' 个结果。';

        $body = '<div class="seo-wrap">'
            . self::pageHead(
                'DIAGNOSIS ATLAS',
                '心电图诊断图谱',
                '从解剖、离子通道与向量，到起搏、危急值、儿科与复杂心律失常。诊断篇配可逐搏测量的交互心电图；基础理论见 <a href="/intro">导论</a>。',
                [count($all) . ' 篇课程', count($chapters) . ' 个章节', '交互心电图']
            )
            . '<form class="seo-search" action="/learn" method="get" role="search">'
            . '<label class="seo-sr" for="seo-q">搜索心电图课程</label>'
            . '<input id="seo-q" name="q" type="search" value="' . self::e($q) . '" placeholder="搜索诊断、英文名或关键词，例如：房颤、ST 段抬高、高钾…">'
            . '<button type="submit">搜索</button>'
            . ($q !== '' ? '<a class="seo-search-clear" href="/learn">清除</a>' : '')
            . '</form>'
            . ($q !== '' ? '<p class="seo-result-note">“' . self::e($q) . '” 共 <b>' . count($filtered) . '</b> 个结果。</p>' : '')
            . $blocks
            . '<p class="seo-disclaimer">教学内容用于学习与讨论，不构成诊疗建议。诊断标准与处理原则需结合最新指南、设备与患者实际情况。</p>'
            . '</div>';

        $jsonLd = [
            [
                '@context' => 'https://schema.org',
                '@type' => 'CollectionPage',
                'name' => '心电图诊断图谱',
                'description' => $description,
                'url' => self::url('/learn'),
                'inLanguage' => 'zh-CN',
                'isPartOf' => ['@type' => 'WebSite', 'name' => self::SITE_NAME, 'url' => self::baseUrl()],
                'mainEntity' => [
                    '@type' => 'ItemList',
                    'numberOfItems' => count($all),
                    'itemListElement' => array_map(static fn (array $item, int $i): array => [
                        '@type' => 'ListItem',
                        'position' => $i + 1,
                        'url' => self::url('/learn/' . $item['id']),
                        'name' => $item['name'],
                    ], array_slice($all, 0, 100), array_keys(array_slice($all, 0, 100))),
                ],
            ],
            self::breadcrumbs([['心电图诊断图谱', '/learn']]),
        ];

        self::send(self::shell([
            'title' => $title,
            'description' => $description,
            'canonical' => self::url('/learn'),
            'robots' => $q === '' ? 'index,follow,max-image-preview:large' : 'noindex,follow',
            'keywords' => '心电图,心电图判读,心电图诊断,心电图学习,ECG,心律失常,心肌梗死,心电图图谱',
            'active' => '/learn',
            'jsonLd' => $jsonLd,
        ], $body));
    }

    private static function article(string $id): void
    {
        $detail = Content::detail($id);
        if ($detail === null) {
            self::notFound('没有找到这篇课程');
            return;
        }

        $isTopic = (bool) ($detail['topic'] ?? false);
        $chapter = $detail['chapterMeta'] ?? [];
        $chapterName = (string) ($chapter['name'] ?? '');
        $chapterId = (string) ($detail['chapter'] ?? '');
        // "topic" marks conceptual articles; only the theory chapter belongs to /intro.
        $isTheory = $chapterId === 'theory';
        $indexHref = $isTheory ? '/intro' : '/learn';
        $indexLabel = $isTheory ? '导论' : '诊断图谱';
        $name = (string) ($detail['name'] ?? '');
        $en = (string) ($detail['en'] ?? '');
        $oneLiner = (string) ($detail['oneLiner'] ?? '');
        $specificity = (string) ($detail['specificity'] ?? '');
        $url = self::url('/learn/' . $id);
        $modified = self::lastModified();

        $description = self::clip($specificity !== '' ? $specificity : $oneLiner, 118);
        if ($description === '') {
            $description = '心迹 ECG Lab 的心电图判读课程：' . $name . '。';
        }

        $keywords = array_filter(array_merge(
            [$name, $en],
            (array) ($detail['tags'] ?? []),
            [$chapterName, '心电图判读', '心电图诊断标准']
        ));

        $crumbs = [
            ['首页', '/'],
            [$indexLabel, $indexHref],
            [$chapterName, $indexHref . '#chapter-' . $chapterId],
            [$name, '/learn/' . $id],
        ];

        $toc = [];
        $sections = '';

        if ($isTopic) {
            $objectives = (array) ($detail['objectives'] ?? []);
            if ($objectives !== []) {
                $toc[] = ['objectives', '学习目标'];
                $sections .= self::section('objectives', '学习目标', self::ul($objectives, 'seo-list'));
            }
            foreach ((array) ($detail['sections'] ?? []) as $i => $topicSection) {
                if (!is_array($topicSection)) {
                    continue;
                }
                $secTitle = (string) ($topicSection['title'] ?? ('第 ' . ($i + 1) . ' 节'));
                $secId = 'sec-' . ($i + 1);
                $toc[] = [$secId, $secTitle];
                $inner = '';
                foreach ((array) ($topicSection['body'] ?? []) as $paragraph) {
                    $inner .= self::para((string) $paragraph);
                }
                $sections .= self::section($secId, $secTitle, $inner);
            }
            $keyPoints = (array) ($detail['keyPoints'] ?? []);
            if ($keyPoints !== []) {
                $toc[] = ['keypoints', '关键要点'];
                $sections .= self::section('keypoints', '关键要点', self::ul($keyPoints, 'seo-list seo-list-check'));
            }
            $pearl = (string) ($detail['clinicalPearl'] ?? '');
            if ($pearl !== '') {
                $toc[] = ['pearl', '临床提示'];
                $sections .= self::section('pearl', '临床提示', '<div class="seo-callout seo-callout-brand">' . self::e($pearl) . '</div>');
            }
        } else {
            $definition = (string) ($detail['definition'] ?? '');
            if ($definition !== '') {
                $toc[] = ['definition', '定义'];
                $sections .= self::section('definition', '定义', self::para($definition));
            }
            $mechanism = (array) ($detail['mechanism'] ?? []);
            if ($mechanism !== []) {
                $toc[] = ['mechanism', '发生机制'];
                $sections .= self::section('mechanism', '发生机制', self::ul($mechanism));
            }
            $criteria = (array) ($detail['criteria'] ?? []);
            if ($criteria !== []) {
                $toc[] = ['criteria', '诊断标准'];
                $sections .= self::section('criteria', '诊断标准', self::ul($criteria, 'seo-list-check'));
            }
            $reading = (array) ($detail['reading'] ?? []);
            if ($reading !== []) {
                $toc[] = ['reading', '判读步骤'];
                $sections .= self::section('reading', '判读步骤', self::ol($reading));
            }
            if (!empty($detail['hasEcg']) && is_array($detail['ecg'] ?? null)) {
                $toc[] = ['ecg-teaching', '教学心电图'];
                $sections .= self::ecgSection($detail, $id);
            }
            $redFlags = (array) ($detail['redFlags'] ?? []);
            if ($redFlags !== []) {
                $toc[] = ['redflags', '危险信号'];
                $sections .= self::section('redflags', '危险信号', '<div class="seo-callout seo-callout-danger"><b>需要立即处理或升级监护：</b>' . self::ul($redFlags) . '</div>');
            }
            $management = (array) ($detail['management'] ?? []);
            if ($management !== []) {
                $toc[] = ['management', '处理原则'];
                $sections .= self::section('management', '处理原则', '<div class="seo-callout seo-callout-brand">' . self::ul($management) . '</div>');
            }
            $pitfalls = (array) ($detail['pitfalls'] ?? []);
            if ($pitfalls !== []) {
                $toc[] = ['pitfalls', '易错点'];
                $sections .= self::section('pitfalls', '易错点', self::ul($pitfalls));
            }
            $related = (array) ($detail['related'] ?? []);
            if ($related !== []) {
                $toc[] = ['differential', '鉴别诊断'];
                $cards = '';
                foreach ($related as $item) {
                    if (!is_array($item) || empty($item['id'])) {
                        continue;
                    }
                    $cards .= '<a class="seo-related-card" href="/learn/' . self::e($item['id']) . '">'
                        . '<b>' . self::e($item['name'] ?? $item['id']) . '</b>'
                        . (($item['en'] ?? '') !== '' ? '<span>' . self::e($item['en']) . '</span>' : '')
                        . (($item['why'] ?? '') !== '' ? '<p>' . self::e($item['why']) . '</p>' : '')
                        . '</a>';
                }
                $sections .= self::section('differential', '鉴别诊断', '<div class="seo-related-grid">' . $cards . '</div>');
            }
            $pearls = (array) ($detail['pearls'] ?? []);
            if ($pearls !== []) {
                $toc[] = ['pearls', '记忆锦囊'];
                $sections .= self::section('pearls', '记忆锦囊', self::ul($pearls, 'seo-list'));
            }
            $guideline = $detail['guideline'] ?? null;
            if (is_array($guideline)) {
                $toc[] = ['guideline', '指南规范'];
                $sections .= self::guidelineSection($guideline);
            }
        }

        $keyNumbers = '';
        foreach ((array) ($detail['keyNumbers'] ?? []) as $number) {
            if (!is_array($number)) {
                continue;
            }
            $keyNumbers .= '<div class="seo-keynum"><b>' . self::e($number['value'] ?? '')
                . '<small>' . self::e($number['unit'] ?? '') . '</small></b>'
                . '<span>' . self::e($number['label'] ?? '') . '</span></div>';
        }

        $review = (array) ($detail['review'] ?? []);
        $reviewHtml = '<div class="seo-review">'
            . '<div><b>' . self::e($review['statusLabel'] ?? '编辑核对 · 待临床同行审阅') . '</b>'
            . '<span>最后核对 ' . self::e($review['lastChecked'] ?? '—')
            . ' · 整理 ' . self::e(implode('、', (array) ($review['reviewers'] ?? [])) ?: '—') . '</span></div>'
            . '<div><b>参考来源</b><span>' . self::e(implode(' · ', (array) ($review['sources'] ?? [])) ?: '见文末参考说明') . '</span></div>'
            . '<a href="/about">报告勘误</a>'
            . '</div>';

        $badges = '<span class="seo-badge seo-badge-brand">' . self::e($chapterName) . '</span>'
            . '<span class="seo-badge">' . self::difficultyLabel((int) ($detail['difficulty'] ?? 1)) . '</span>'
            . '<span class="seo-badge">' . self::urgencyLabel((string) ($detail['urgency'] ?? 'core')) . '</span>';
        foreach (array_slice((array) ($detail['tags'] ?? []), 0, 8) as $tag) {
            $badges .= '<span class="seo-badge seo-badge-soft">' . self::e($tag) . '</span>';
        }

        $tocHtml = '';
        foreach ($toc as [$anchor, $label]) {
            $tocHtml .= '<a href="#' . self::e($anchor) . '">' . self::e($label) . '</a>';
        }

        $prev = self::neighbour($id, -1);
        $next = self::neighbour($id, 1);
        $prevNext = '<nav class="seo-prevnext" aria-label="相邻课程">';
        $prevNext .= $prev !== null
            ? '<a href="/learn/' . self::e($prev['id']) . '"><span>上一篇</span><b>' . self::e($prev['name']) . '</b></a>'
            : '<span></span>';
        $prevNext .= $next !== null
            ? '<a class="seo-next" href="/learn/' . self::e($next['id']) . '"><span>下一篇</span><b>' . self::e($next['name']) . '</b></a>'
            : '<span></span>';
        $prevNext .= '</nav>';

        $chapterUrl = $indexHref . '#chapter-' . $chapterId;
        $chapterCard = '<aside class="seo-card seo-aside-card">'
            . '<div class="seo-aside-eyebrow">所属章节</div>'
            . '<h2><a href="' . self::e($chapterUrl) . '">' . self::e($chapterName) . '</a></h2>'
            . '<p>' . self::e((string) ($chapter['tagline'] ?? $chapter['description'] ?? '')) . '</p>'
            . '<a class="seo-textlink" href="' . self::e($chapterUrl) . '">查看本章全部课程 →</a>'
            . '</aside>';

        $body = '<div class="seo-wrap seo-article-wrap">'
            . self::crumbs($crumbs)
            . '<article class="seo-article">'
            . '<header class="seo-hero">'
            . '<div class="seo-eyebrow">' . self::e($indexLabel) . ' · ' . self::e($chapterName) . '</div>'
            . '<h1 class="seo-title">' . self::e($name) . '</h1>'
            . ($en !== '' ? '<p class="seo-en">' . self::e($en) . '</p>' : '')
            . ($oneLiner !== '' ? '<p class="seo-lead">' . self::e($oneLiner) . '</p>' : '')
            . '<div class="seo-badges">' . $badges . '</div>'
            . ($keyNumbers !== '' ? '<div class="seo-keynums">' . $keyNumbers . '</div>' : '')
            . '</header>'
            . $reviewHtml
            . self::chapterGuideSection(is_array($detail['chapterGuide'] ?? null) ? $detail['chapterGuide'] : null)
            . '<div class="seo-layout">'
            . '<div class="seo-prose">' . $sections
            . '<section class="seo-sec" id="interactive">'
            . '<h2>在交互版中练习</h2>'
            . '<p>交互版提供可播放的 12 导联波形、逐搏测量、标注与 AI 讲解；本页为便于搜索引擎与快速阅读的静态摘要。</p>'
            . '<p><a class="seo-btn seo-btn-primary" href="/#/learn/' . self::e($id) . '">打开交互课程 →</a></p>'
            . '</section>'
            . '</div>'
            . '<aside class="seo-aside">'
            . ($tocHtml !== '' ? '<nav class="seo-card seo-toc" aria-label="本页目录"><div class="seo-aside-eyebrow">本页目录</div>' . $tocHtml . '</nav>' : '')
            . '<div class="seo-card seo-aside-card seo-aside-cta">'
            . '<b>边读边练</b><p>用 5 步法读图，每一步即时反馈，最后再下诊断。</p>'
            . '<a class="seo-btn seo-btn-primary" href="/#/read">进入判读训练</a>'
            . '</div>'
            . $chapterCard
            . '</aside>'
            . '</div>'
            . $prevNext
            . '<p class="seo-disclaimer">本页为教学摘要，不构成诊疗建议。药物剂量、电击能量、时间窗与抗凝方案必须以当地现行指南、药品说明书和设备为准；发现错误请通过 <a href="/about">关于 / 勘误</a> 反馈。</p>'
            . '</article></div>';

        $jsonLd = [
            [
                '@context' => 'https://schema.org',
                '@type' => ['Article', 'MedicalWebPage'],
                'headline' => $name,
                'name' => $name,
                'description' => $description,
                'url' => $url,
                'mainEntityOfPage' => ['@type' => 'WebPage', '@id' => $url],
                'image' => [self::ogImage()],
                'inLanguage' => 'zh-CN',
                'datePublished' => $modified,
                'dateModified' => $modified,
                'author' => ['@type' => 'Organization', 'name' => self::SITE_NAME, 'url' => self::baseUrl()],
                'publisher' => [
                    '@type' => 'Organization',
                    'name' => self::SITE_NAME,
                    'url' => self::baseUrl(),
                    'logo' => ['@type' => 'ImageObject', 'url' => self::ogImage()],
                ],
                'about' => ['@type' => 'MedicalCondition', 'name' => $name],
                'isPartOf' => ['@type' => 'WebSite', 'name' => self::SITE_NAME, 'url' => self::baseUrl()],
                'learningResourceType' => '心电图判读课程',
                'educationalUse' => '教学',
                'audience' => ['@type' => 'EducationalAudience', 'educationalRole' => 'student'],
            ],
            self::breadcrumbs(array_map(static fn (array $crumb): array => [$crumb[0], $crumb[1]], $crumbs)),
        ];

        self::send(self::shell([
            'title' => $name . ($isTheory ? '：心电图基础理论' : ($isTopic ? '：心电图专题解析' : '：心电图表现、诊断标准与处理原则')) . ' | ' . self::SITE_NAME,
            'description' => $description,
            'canonical' => $url,
            'keywords' => implode(',', $keywords),
            'type' => 'article',
            'active' => $isTheory ? '/intro' : '/learn',
            'jsonLd' => $jsonLd,
        ], $body));
    }

    private static function introIndex(): void
    {
        $items = array_values(array_filter(
            Content::summaries(),
            static fn (array $item): bool => ($item['chapter'] ?? '') === 'theory'
        ));
        $chapter = null;
        foreach (Content::chapters() as $candidate) {
            if (($candidate['id'] ?? '') === 'theory') {
                $chapter = $candidate;
                break;
            }
        }

        $cards = '';
        foreach ($items as $item) {
            $cards .= self::card($item);
        }

        $title = '心电图导论：' . count($items) . ' 篇电生理、向量与判读基础 | ' . self::SITE_NAME;
        $description = '判读之前先懂机制：离子通道与动作电位、传导系统与激动顺序、向量与导联投影、正常变异与伪差。按“概念 → 判读 → 边界”组织的 ' . count($items) . ' 篇心电图基础课程。';

        $body = '<div class="seo-wrap">'
            . self::pageHead(
                'INTRODUCTION',
                '心电图导论',
                '判读之前先懂机制：离子通道与动作电位、传导系统与激动顺序、向量与导联投影、正常变异与伪差。按“概念 → 判读 → 边界”组织，配有自绘示意图与参考资料。',
                [count($items) . ' 篇导论', '电生理与向量', '正常变异与伪差']
            )
            . '<section class="seo-chapter-block" id="chapter-theory">'
            . '<div class="seo-chapter-head"><div><h2>' . self::e($chapter['name'] ?? '心电理论') . '</h2>'
            . '<p>' . self::e((string) ($chapter['tagline'] ?? $chapter['description'] ?? '')) . '</p></div>'
            . '<span class="seo-count">' . count($items) . ' 篇</span></div>'
            . '<div class="seo-grid">' . $cards . '</div></section>'
            . '<p class="seo-disclaimer">导论用于建立电生理与判读直觉；具体诊断标准与处理原则需结合最新指南与临床情境。</p>'
            . '</div>';

        self::send(self::shell([
            'title' => $title,
            'description' => $description,
            'canonical' => self::url('/intro'),
            'keywords' => '心电图导论,心电生理,动作电位,心电向量,导联,心电图基础',
            'active' => '/intro',
            'jsonLd' => [
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'CollectionPage',
                    'name' => '心电图导论',
                    'description' => $description,
                    'url' => self::url('/intro'),
                    'inLanguage' => 'zh-CN',
                ],
                self::breadcrumbs([['心电图导论', '/intro']]),
            ],
        ], $body));
    }

    private static function glossary(): void
    {
        $terms = is_file(BASE_PATH . '/data/glossary.php') ? (array) require BASE_PATH . '/data/glossary.php' : [];
        $grouped = [];
        foreach ($terms as $term) {
            if (!is_array($term) || count($term) < 4) {
                continue;
            }
            $grouped[(string) $term[0]][] = $term;
        }

        $nav = '';
        $sections = '';
        foreach ($grouped as $category => $items) {
            $anchor = 'cat-' . md5($category);
            $nav .= '<a href="#' . $anchor . '">' . self::e($category) . ' <small>' . count($items) . '</small></a>';
            $dl = '';
            foreach ($items as $term) {
                $dl .= '<div class="seo-term">'
                    . '<dt><dfn>' . self::e($term[2]) . '</dfn><span>' . self::e($term[1]) . '</span></dt>'
                    . '<dd>' . self::e($term[3]) . '</dd></div>';
            }
            $sections .= '<section class="seo-sec" id="' . $anchor . '"><h2>' . self::e($category) . '</h2><dl class="seo-terms">' . $dl . '</dl></section>';
        }

        $title = '心电图双语术语表：' . count($terms) . ' 个中英对照术语 | ' . self::SITE_NAME;
        $description = '中文—English 对照的心电图术语表，覆盖基础波形、导联与向量、节律、缺血与结构、急救与方法学，共 ' . count($terms) . ' 个术语，适合医学生与住院医师快速查阅。';

        $body = '<div class="seo-wrap">'
            . self::pageHead('BILINGUAL GLOSSARY', '心电图双语术语表', '中文—English 对照，覆盖基础波形、导联向量、节律、缺血/结构、急救与方法学。术语表用于学习与跨语言沟通；不同教材与地区对个别术语的用法可能不同。', [count($terms) . ' 个术语', count($grouped) . ' 个分类', '中英对照'])
            . '<nav class="seo-catnav" aria-label="术语分类">' . $nav . '</nav>'
            . $sections
            . '<p class="seo-disclaimer">术语表用于学习与沟通，不替代教材、指南或临床判断。</p>'
            . '</div>';

        $jsonLd = [
            [
                '@context' => 'https://schema.org',
                '@type' => 'DefinedTermSet',
                'name' => '心电图双语术语表',
                'description' => $description,
                'url' => self::url('/glossary'),
                'inLanguage' => ['zh-CN', 'en'],
                'hasDefinedTerm' => array_map(static fn (array $term): array => [
                    '@type' => 'DefinedTerm',
                    'name' => (string) $term[2],
                    'alternateName' => (string) $term[1],
                    'description' => (string) $term[3],
                    'inDefinedTermSet' => self::url('/glossary'),
                    'termCode' => (string) $term[0],
                ], $terms),
            ],
            self::breadcrumbs([['双语术语表', '/glossary']]),
        ];

        self::send(self::shell([
            'title' => $title,
            'description' => $description,
            'canonical' => self::url('/glossary'),
            'keywords' => '心电图术语,心电图英语,ECG glossary,心电图名词解释,PR间期,QRS波,QT间期',
            'active' => '/glossary',
            'jsonLd' => $jsonLd,
        ], $body));
    }

    private static function guidelines(): void
    {
        $topics = is_file(BASE_PATH . '/data/guidelines-areas.php') ? (array) require BASE_PATH . '/data/guidelines-areas.php' : [];
        $cards = '';
        foreach ($topics as $topic) {
            if (!is_array($topic)) {
                continue;
            }
            $cards .= '<article class="seo-card seo-guideline-card">'
                . '<div class="seo-aside-eyebrow">' . self::e(strtoupper((string) ($topic['id'] ?? ''))) . '</div>'
                . '<h2>' . self::e($topic['title'] ?? '') . '</h2>'
                . '<div class="seo-two"><div><b>美国 / AHA-ACC</b><p>' . self::e($topic['us'] ?? '') . '</p></div>'
                . '<div><b>欧洲 / ESC-ERC</b><p>' . self::e($topic['eu'] ?? '') . '</p></div></div>'
                . '<div class="seo-callout seo-callout-brand"><b>教学要点：</b>' . self::e($topic['take'] ?? '') . '</div>'
                . '</article>';
        }

        $title = '心电图与心血管区域指南差异：AHA/ACC 与 ESC 对照 | ' . self::SITE_NAME;
        $description = '同一条心电图，在不同地区可能对应不同的治疗阈值。对照美国 AHA/ACC 与欧洲 ESC/ERC 在房颤抗凝、ACS 再灌注、ACLS 与儿科复苏上的差异，先学可迁移的判读框架。';

        $body = '<div class="seo-wrap">'
            . self::pageHead('REGIONAL GUIDELINES', '区域指南差异', '同一条心电图，在不同地区可能对应不同的治疗阈值。先学可迁移的判读框架，再标注指南版本与适用人群。', [count($topics) . ' 个主题', 'AHA/ACC', 'ESC/ERC'])
            . '<div class="seo-callout seo-callout-warn"><b>教学摘要：</b>本页不构成诊疗建议。药物剂量、电击能量、时间窗与抗凝方案必须以当地现行指南、药品说明书和设备为准。</div>'
            . '<div class="seo-guideline-list">' . $cards . '</div>'
            . '<p class="seo-disclaimer">指南会更新；发现表述过时请通过 <a href="/about">关于 / 勘误</a> 提交，并附版本与链接。</p>'
            . '</div>';

        self::send(self::shell([
            'title' => $title,
            'description' => $description,
            'canonical' => self::url('/guidelines'),
            'keywords' => 'AHA指南,ESC指南,房颤抗凝,CHA2DS2-VASc,STEMI再灌注,ACLS,指南差异',
            'active' => '/guidelines',
            'jsonLd' => [
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'MedicalWebPage',
                    'name' => '心电图与心血管区域指南差异',
                    'description' => $description,
                    'url' => self::url('/guidelines'),
                    'inLanguage' => 'zh-CN',
                ],
                self::breadcrumbs([['区域指南差异', '/guidelines']]),
            ],
        ], $body));
    }

    private static function about(): void
    {
        $corrections = is_file(BASE_PATH . '/data/corrections.php') ? (array) require BASE_PATH . '/data/corrections.php' : [];
        $items = '';
        foreach (array_slice($corrections, 0, 12) as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $items .= '<article class="seo-correction"><div class="seo-correction-meta"><b>v' . self::e($entry['version'] ?? '') . '</b><span>' . self::e($entry['date'] ?? '') . '</span></div>'
                . '<div><h3>' . self::e($entry['title'] ?? '') . '</h3>' . self::ul((array) ($entry['items'] ?? [])) . '</div></article>';
        }

        $site = self::siteInfo();
        $github = $site['github'];
        $icpItem = $site['icp'] !== ''
            ? '<li><b>ICP 备案：</b><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">' . self::e($site['icp']) . '</a></li>'
            : '';

        $title = '关于心迹 ECG Lab：免费、开源、可勘误的心电图学习平台';
        $description = '心迹 ECG Lab 是面向医学生与住院医师的免费开源心电图学习平台：' . Content::stats()['articles'] . ' 篇结构化课程、' . Content::stats()['diagnoses'] . ' 个诊断、确定性命库与 ACLS 推演。区分编辑核对与临床同行审阅，公开版本化勘误。';

        $body = '<div class="seo-wrap">'
            . self::pageHead('ABOUT & CORRECTIONS', '关于心迹 · 勘误与参与', '一个面向医学生的免费、开源心电图学习基础设施。我们区分“编辑核对”和“临床同行审阅”，不把未审阅内容包装成临床指南。', ['MIT 代码', 'CC BY-SA 4.0 内容', '无广告'])
            . '<div class="seo-prose seo-about">'
            . '<section class="seo-sec"><h2>我们做什么</h2>'
            . '<p>心迹把心电图拆成可以反复练习的四个层次：电生理与向量、诊断图谱与判读路径、确定性题库、ACLS 动态推演。课程、题库、代码和向量模型全部开源，教学图形明确标注为示意，不替代患者实际情况。</p>'
            . '<p>站点提供游客模式，无需注册即可阅读全部课程、使用判读训练与急救推演；注册后可以同步进度、错题、每日挑战与排行榜。</p></section>'
            . '<section class="seo-sec"><h2>审阅工作流</h2><ol>'
            . '<li><b>编辑核对：</b>统一术语、单位、能量范围、适用场景和鉴别项；给出可追溯来源。</li>'
            . '<li><b>临床同行审阅：</b>由急诊/心内科/儿科等顾问逐章核对；目前仍在招募，未完成的章节明确标注“待审阅”。</li>'
            . '<li><b>版本化勘误：</b>每次修订记录版本、日期、问题与改动；公开 GitHub Issue 与本页。</li>'
            . '</ol></section>'
            . '<section class="seo-sec"><h2>参与方式</h2><ul>'
            . '<li><a href="' . self::e($github) . '/issues" rel="noopener">报告错误 / 提交勘误</a></li>'
            . '<li><a href="' . self::e($github) . '" rel="noopener">在 GitHub 查看源码与课程内容</a></li>'
            . '<li><a href="/glossary">双语术语表</a> · <a href="/guidelines">区域指南差异</a></li>'
            . '</ul></section>'
            . '<section class="seo-sec"><h2>站点信息</h2><ul>'
            . '<li><b>GitHub：</b><a href="' . self::e($github) . '" rel="noopener">' . self::e($github) . '</a></li>'
            . '<li><b>许可证：</b>' . self::e($site['license']) . '</li>'
            . '<li><b>版权：</b>' . self::e($site['copyright']) . '</li>'
            . $icpItem
            . '</ul></section>'
            . '<section class="seo-sec"><h2>版本化勘误</h2>' . $items . '</section>'
            . '<div class="seo-callout seo-callout-warn"><b>重要：</b>本项目不提供个体化诊疗指令；药物剂量、电击能量与临床决策必须结合当地指南、设备和患者情况。</div>'
            . '</div></div>';

        self::send(self::shell([
            'title' => $title,
            'description' => $description,
            'canonical' => self::url('/about'),
            'keywords' => '心迹 ECG Lab,心电图学习,开源医学教育,勘误,医学顾问',
            'active' => '/about',
            'jsonLd' => [
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'AboutPage',
                    'name' => '关于心迹 ECG Lab',
                    'description' => $description,
                    'url' => self::url('/about'),
                    'inLanguage' => 'zh-CN',
                    'mainEntity' => [
                        '@type' => 'EducationalOrganization',
                        'name' => self::SITE_NAME,
                        'url' => self::baseUrl(),
                        'sameAs' => [$github],
                    ],
                ],
                self::breadcrumbs([['关于 / 勘误', '/about']]),
            ],
        ], $body));
    }

    private static function readGuide(): void
    {
        $steps = [
            ['频率', '先看心室率：数 10 秒内 QRS 个数 × 6，或看节律条整体；同时判断心动过速、心动过缓或正常。'],
            ['节律', 'P 波是否存在？P 与 QRS 是否固定相关？节律是否整齐？先分清窦性、房性、交界性或室性。'],
            ['电轴', '看 I、aVF 导联主波方向：同向上为正常，相反为电轴偏移；再结合 II 导联细分。'],
            ['间期', '测量 PR、QRS 与 QT；注意房室阻滞、束支阻滞、预激与 QT 延长。'],
            ['ST-T 与 U 波', '逐导联寻找 ST 抬高/压低、T 波形态改变与 U 波；相邻导联与镜像改变一起看。'],
        ];
        $stepsHtml = '';
        foreach ($steps as $i => [$name, $text]) {
            $stepsHtml .= '<li id="step-' . ($i + 1) . '"><b>' . ($i + 1) . ' · ' . self::e($name) . '</b><p>' . self::e($text) . '</p></li>';
        }

        $title = '心电图五步判读法：频率、节律、电轴、间期、ST-T | ' . self::SITE_NAME;
        $description = '一套不遗漏的心电图判读顺序：频率 → 节律 → 电轴 → 间期 → ST-T 与 U 波 → 结论。解释每一步看什么、常见陷阱，并提供逐题反馈的系统判读训练。';

        $body = '<div class="seo-wrap">'
            . self::pageHead('SYSTEMATIC READING', '心电图五步判读法', '按「频率 → 节律 → 电轴 → 间期 → ST-T → 结论」的顺序读图，每一步即时反馈，最后再下诊断。用于建立不遗漏的判读习惯。', ['结构化 5 步', '即时反馈', '键盘操作'])
            . '<div class="seo-prose">'
            . '<section class="seo-sec"><h2>为什么需要固定顺序</h2>'
            . '<p>心电图信息密度高，最容易犯的错误不是“不会”，而是“漏看”。固定顺序把判读拆成可重复的检查清单：先确认频率与节律，再看电轴与间期，最后系统扫描 ST-T 与 U 波。每一步都留下可复核的结论，减少被第一个显眼异常“带跑”的风险。</p></section>'
            . '<section class="seo-sec"><h2>五个步骤</h2><ol class="seo-steps">' . $stepsHtml . '</ol></section>'
            . '<section class="seo-sec"><h2>常见陷阱</h2><ul>'
            . '<li>只看 QRS 宽度，忽略 P 波与房室关系。</li>'
            . '<li>把基线漂移、肌电干扰或导联脱落当成 ST 改变。</li>'
            . '<li>只盯一个导联，忽略相邻导联、镜像改变与后壁/右室扩展。</li>'
            . '<li>忘记结合年龄、性别、体型、药物与电解质。</li>'
            . '</ul></section>'
            . '<section class="seo-sec"><h2>开始训练</h2>'
            . '<p>交互版会生成真实形态的心电图，按步骤提问并即时反馈；完成后给出结论与错题分类。</p>'
            . '<p><a class="seo-btn seo-btn-primary" href="/#/read">进入系统判读训练 →</a> <a class="seo-btn" href="/learn">先读诊断图谱</a></p></section>'
            . '</div>'
            . '<p class="seo-disclaimer">判读顺序用于教学；真实临床决策需结合病史、体征、化验与影像，并遵循当地流程。</p>'
            . '</div>';

        self::send(self::shell([
            'title' => $title,
            'description' => $description,
            'canonical' => self::url('/read'),
            'keywords' => '心电图判读,心电图五步法,心电图怎么看,心电图测量,PR间期,QRS宽度,QT间期,ST段',
            'active' => '/read',
            'jsonLd' => [
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'HowTo',
                    'name' => '心电图五步判读法',
                    'description' => $description,
                    'url' => self::url('/read'),
                    'inLanguage' => 'zh-CN',
                    'totalTime' => 'PT5M',
                    'step' => array_map(static fn (array $step, int $i): array => [
                        '@type' => 'HowToStep',
                        'position' => $i + 1,
                        'name' => $step[0],
                        'text' => $step[1],
                        'url' => self::url('/read') . '#step-' . ($i + 1),
                    ], $steps, array_keys($steps)),
                ],
                self::breadcrumbs([['判读训练', '/read']]),
            ],
        ], $body));
    }

    private static function practice(): void
    {
        $stats = QuestionBank::stats();
        $total = (int) ($stats['total'] ?? 0);

        $title = '心电图判读练习：' . $total . ' 道确定性病例 | ' . self::SITE_NAME;
        $description = '由诊断 × 种子生成的 ' . $total . ' 道确定性心电图病例，答案与解析来自策展知识库并在服务端校验。支持经典判读、极速 60 秒、连击生存、专项组卷与错题复习。';

        $body = '<div class="seo-wrap">'
            . self::pageHead('READ & DECIDE', '心电图判读练习', '题库预置 ' . $total . ' 道确定性病例：由诊断 × 种子与组合诊断生成；答案与解析来自策展知识库，服务端校验。', [$total . ' 道病例', '3 种玩法', '服务端判分'])
            . '<div class="seo-prose">'
            . '<section class="seo-sec"><h2>三种玩法</h2><div class="seo-grid seo-grid-3">'
            . '<div class="seo-card"><h3>经典判读</h3><p>按题数完成一局，提交后立即解析；适合系统练习与错题复盘。</p></div>'
            . '<div class="seo-card"><h3>极速 60 秒</h3><p>60 秒内尽可能多答，训练快速识别与决策节奏。</p></div>'
            . '<div class="seo-card"><h3>连击生存</h3><p>3 条命，答错扣命；在压力下保持判读顺序。</p></div>'
            . '</div></section>'
            . '<section class="seo-sec"><h2>难度与解锁</h2>'
            . '<p>基础为单一诊断与常见图形；进阶包含不典型表现与鉴别；组合挑战要求一张图识别两个诊断。未解锁难度可以自由练习，但不计分、不扣分；达标后按难度计分，错题按学习、考试、测试与每日挑战的倍率扣分。</p>'
            . '<p>专项练习可按心梗定位、后壁/右室心梗、电解质、起搏与儿科等主题预选病例；“最常混淆”会锁定正确诊断并强制干扰项进入选项。</p></section>'
            . '<section class="seo-sec"><h2>错题与周报</h2>'
            . '<p>错题记录实际错选项、最近错题与同题重复，并按章节分类；本地 7 天学习周报只保存在本设备。注册后进度、错题与统计可跨设备同步。</p></section>'
            . '<section class="seo-sec"><h2>开始练习</h2><p><a class="seo-btn seo-btn-primary" href="/#/practice">进入判读练习 →</a> <a class="seo-btn" href="/read">先学五步判读法</a></p></section>'
            . '</div>'
            . '<p class="seo-disclaimer">练习题与解析用于教学，不替代临床诊断与处理。</p>'
            . '</div>';

        self::send(self::shell([
            'title' => $title,
            'description' => $description,
            'canonical' => self::url('/practice'),
            'keywords' => '心电图练习题,心电图判读练习,心电图题库,ECG quiz,心电图考试,心电图病例',
            'active' => '/practice',
            'jsonLd' => [
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'LearningResource',
                    'name' => '心电图判读练习',
                    'description' => $description,
                    'url' => self::url('/practice'),
                    'inLanguage' => 'zh-CN',
                    'learningResourceType' => '练习题库',
                    'educationalLevel' => ['基础', '进阶', '组合挑战'],
                    'numberOfItems' => $total,
                    'isPartOf' => ['@type' => 'WebSite', 'name' => self::SITE_NAME, 'url' => self::baseUrl()],
                ],
                self::breadcrumbs([['判读练习', '/practice']]),
            ],
        ], $body));
    }

    private static function simIndex(): void
    {
        $scenarios = self::scenarios();
        $cards = '';
        foreach ($scenarios as $scenario) {
            $cards .= '<a class="seo-card seo-scenario-card" href="/sim/' . self::e($scenario['id']) . '">'
                . '<div class="seo-badges"><span class="seo-badge seo-badge-brand">' . self::e($scenario['algorithm'] ?? 'ACLS') . '</span>'
                . '<span class="seo-badge">' . self::difficultyLabel((int) ($scenario['difficulty'] ?? 1)) . '</span></div>'
                . '<h2>' . self::e($scenario['name'] ?? '') . '</h2>'
                . '<p class="seo-card-one">' . self::e($scenario['subtitle'] ?? '') . '</p>'
                . '<p class="seo-card-en">' . self::e(self::patientLine($scenario)) . '</p>'
                . '<span class="seo-textlink">查看场景要点 →</span>'
                . '</a>';
        }

        $title = 'ACLS 急救推演：' . count($scenarios) . ' 个场景 + 双人随机模式 | ' . self::SITE_NAME;
        $description = '在实时监护中做决定：先高质量 CPR，再识别可除颤心律；判断是否需要电治疗并选择正确模式。' . count($scenarios) . ' 个 ACLS 教学场景，以及两名危重症同时送达、第一名 15 秒、第二名额外 15 秒完成诊断并开始处理的双人随机模式。';

        $body = '<div class="seo-wrap">'
            . self::pageHead('ACLS SIMULATION', '急救推演', '在实时监护中做决定：先高质量 CPR，再识别可除颤心律；判断是否需要电治疗并选择正确模式。药物、能量与按压中断都会被记录并复盘。', [count($scenarios) . ' 个场景', '双人随机模式', '可复现评分'])
            . '<div class="seo-rules"><span>先判断有无脉搏</span><span>可除颤心律立即除颤</span><span>按压中断 &lt;10 秒</span><span>每 2 分钟评估</span></div>'
            . '<section class="seo-sec"><h2>双人随机模式</h2>'
            . '<p>两名危重症患者同时送达抢救室，一左一右。只给有限的查体数据与心电图波形，要求第一名患者在 15 秒内、第二名在额外 15 秒内完成诊断并开始处理；同一时间只能处置一名患者，CPR 与充电除外。坚持到两名患者都恢复窦性心律/自主循环。</p>'
            . '<p>随机病例来自 12 个危重症模板，患者年龄、性别、主诉、查体、心电图种子与正确诊断均随机；诊断选项包含干扰项；个人窗口结束后仍可继续抢救，但会记录超时与扣分。</p>'
            . '<p><a class="seo-btn seo-btn-primary" href="/#/sim">进入双人随机急救 →</a> <a class="seo-btn" href="/sim/vf-arrest">先看 VF 场景要点</a></p></section>'
            . '<div class="seo-grid seo-grid-3">' . $cards . '</div>'
            . '<p class="seo-disclaimer">模拟场景为教学虚构病例；操作与评分基于 ACLS 教学流程，不替代真实临床决策。</p>'
            . '</div>';

        self::send(self::shell([
            'title' => $title,
            'description' => $description,
            'canonical' => self::url('/sim'),
            'keywords' => 'ACLS,急救模拟,心肺复苏,除颤,心室颤动,无脉性室速,心脏骤停,急救训练,双人随机急救,15秒诊断',
            'active' => '/sim',
            'jsonLd' => [
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'CollectionPage',
                    'name' => 'ACLS 急救推演',
                    'description' => $description,
                    'url' => self::url('/sim'),
                    'inLanguage' => 'zh-CN',
                    'mainEntity' => [
                        '@type' => 'ItemList',
                        'numberOfItems' => count($scenarios),
                        'itemListElement' => array_map(static fn (array $scenario, int $i): array => [
                            '@type' => 'ListItem',
                            'position' => $i + 1,
                            'url' => self::url('/sim/' . $scenario['id']),
                            'name' => $scenario['name'],
                        ], $scenarios, array_keys($scenarios)),
                    ],
                ],
                self::breadcrumbs([['急救推演', '/sim']]),
            ],
        ], $body));
    }

    private static function scenario(string $id): void
    {
        $scenario = null;
        foreach (self::scenarios() as $candidate) {
            if (($candidate['id'] ?? '') === $id) {
                $scenario = $candidate;
                break;
            }
        }
        if ($scenario === null) {
            self::notFound('没有找到这个急救场景');
            return;
        }

        $name = (string) ($scenario['name'] ?? '');
        $subtitle = (string) ($scenario['subtitle'] ?? '');
        $guideline = (array) ($scenario['guideline'] ?? []);
        $pearls = (array) ($scenario['pearls'] ?? []);
        $url = self::url('/sim/' . $id);

        $title = $name . '：ACLS 急救推演场景 | ' . self::SITE_NAME;
        $description = self::clip($subtitle . ' 按 ACLS 流程进行 CPR、除颤或电复律、用药与可逆病因排查；复盘会指出按压中断、能量选择与电治疗模式。', 118);

        $body = '<div class="seo-wrap seo-article-wrap">'
            . self::crumbs([['首页', '/'], ['急救推演', '/sim'], [$name, '/sim/' . $id]])
            . '<article class="seo-article">'
            . '<header class="seo-hero">'
            . '<div class="seo-eyebrow">ACLS · ' . self::e(strtoupper((string) ($scenario['algorithm'] ?? 'SIM'))) . '</div>'
            . '<h1 class="seo-title">' . self::e($name) . '</h1>'
            . '<p class="seo-lead">' . self::e($subtitle) . '</p>'
            . '<div class="seo-badges"><span class="seo-badge seo-badge-brand">' . self::e($scenario['algorithm'] ?? 'ACLS') . '</span>'
            . '<span class="seo-badge">' . self::difficultyLabel((int) ($scenario['difficulty'] ?? 1)) . '</span></div>'
            . '</header>'
            . '<div class="seo-layout"><div class="seo-prose">'
            . '<section class="seo-sec"><h2>病例设定</h2><p>' . self::e(self::patientLine($scenario)) . '</p>'
            . '<p>' . self::e($subtitle) . '</p></section>'
            . '<section class="seo-sec"><h2>关键流程</h2>' . self::ul($guideline, 'seo-list-check') . '</section>'
            . ($pearls !== [] ? '<section class="seo-sec"><h2>复盘要点</h2>' . self::ul($pearls) . '</section>' : '')
            . '<section class="seo-sec"><h2>开始推演</h2>'
            . '<p>交互版使用真实时钟与服务端状态机：每次操作都会改变患者状态，结束后按按压质量、电治疗与药物时序评分。</p>'
            . '<p><a class="seo-btn seo-btn-primary" href="/#/sim">进入急救推演 →</a> <a class="seo-btn" href="/sim">查看全部场景</a></p></section>'
            . '</div><aside class="seo-aside">'
            . '<div class="seo-card seo-aside-card seo-aside-cta"><b>ACLS 核心</b><p>先高质量 CPR，再识别可除颤心律；减少按压中断，按流程评估可逆病因。</p><a class="seo-btn seo-btn-primary" href="/#/sim">开始推演</a></div>'
            . '<div class="seo-card seo-aside-card"><div class="seo-aside-eyebrow">其他场景</div><ul class="seo-mini-list">';
        foreach (array_slice(self::scenarios(), 0, 6) as $other) {
            if (($other['id'] ?? '') === $id) {
                continue;
            }
            $body .= '<li><a href="/sim/' . self::e($other['id']) . '">' . self::e($other['name']) . '</a></li>';
        }
        $body .= '</ul></div></aside></div>'
            . '<p class="seo-disclaimer">模拟场景为教学虚构病例；操作与评分基于 ACLS 教学流程，不替代真实临床决策。药物剂量、能量与流程以当地现行指南和设备为准。</p>'
            . '</article></div>';

        self::send(self::shell([
            'title' => $title,
            'description' => $description,
            'canonical' => $url,
            'keywords' => $name . ',ACLS,急救模拟,心肺复苏,除颤,' . ($scenario['algorithm'] ?? ''),
            'type' => 'article',
            'active' => '/sim',
            'jsonLd' => [
                [
                    '@context' => 'https://schema.org',
                    '@type' => ['MedicalWebPage', 'LearningResource'],
                    'name' => $name,
                    'description' => $description,
                    'url' => $url,
                    'inLanguage' => 'zh-CN',
                    'learningResourceType' => '急救模拟场景',
                    'educationalUse' => '教学',
                    'isAccessibleForFree' => true,
                ],
                self::breadcrumbs([['急救推演', '/sim'], [$name, '/sim/' . $id]]),
            ],
        ], $body));
    }

    private static function vectors(): void
    {
        $title = '心脏向量实验室：P/QRS/T 向量环与导联投影 | ' . self::SITE_NAME;
        $description = '把“背图形”变成“看方向”：P/QRS/T 环、肢体与胸导联投影、激活顺序一次串起来。拖动旋转、切换额面/横面，理解心电图为什么长这样。';

        $body = '<div class="seo-wrap">'
            . self::pageHead('VECTOR & ELECTROPHYSIOLOGY', '心脏向量实验室', '把“背图形”变成“看方向”：P/QRS/T 环、肢体/胸导联投影、激活顺序一次串起来。', ['可旋转 3D 向量环', '额面/横面', '投影与波形同步'])
            . '<div class="seo-callout seo-callout-warn"><b>教学示意：</b>向量方向与导联投影用于理解“投影”和“向量大小”，不代表任何患者实际情况，不用于诊断或治疗。</div>'
            . '<div class="seo-prose">'
            . '<section class="seo-sec"><h2>P/QRS/T 向量环</h2><p>每一个瞬间的心电向量都可以看成一支箭头：方向表示除极/复极波前，长度表示电位大小。把整个周期的箭头尖端连起来，就得到 P、QRS、T 向量环。拖动旋转可以从不同角度观察环的形状与空间位置。</p></section>'
            . '<section class="seo-sec"><h2>肢体导联向量</h2><p>I、II、III、aVR、aVL、aVF 是额面上的六个观察角度。同一个向量在不同导联轴上的投影长度不同，投影方向决定波形正负。电轴偏移不是“图形变了”，而是主向量方向变了。</p></section>'
            . '<section class="seo-sec"><h2>胸导联定位</h2><p>V1 在右前，V5/V6 在左外侧。同一个 QRS 向量先向右前（室间隔），再向左后（左室游离壁），因此在 V1 与 V5/V6 上留下方向相反的波形。移行区反映 R/S 比例的转变。</p></section>'
            . '<section class="seo-sec"><h2>激活顺序</h2><p>QRS 不是一根固定的箭头，而是一串依次接力的瞬时向量：室间隔先向右前，随后左室游离壁向左后，最后基底部向左后上。拖动进度可以观察每一步的向量方向与胸导联投影。</p></section>'
            . '<section class="seo-sec"><h2>打开交互实验室</h2><p>交互版支持 0.1/0.25/0.5× 速度、轴心/惯性拖拽、正常范围自检与胸导联波形同步。</p><p><a class="seo-btn seo-btn-primary" href="/#/vectors">进入向量实验室 →</a> <a class="seo-btn" href="/learn/ecg-vector-waveform-theory">阅读向量理论</a></p></section>'
            . '</div>'
            . '<p class="seo-disclaimer">图形为教学示意，不替代真实患者 12 导联诊断。</p>'
            . '</div>';

        self::send(self::shell([
            'title' => $title,
            'description' => $description,
            'canonical' => self::url('/vectors'),
            'keywords' => '心电向量,向量环,心电轴,导联投影,胸导联,激活顺序,心电向量图',
            'active' => '/vectors',
            'jsonLd' => [
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'LearningResource',
                    'name' => '心脏向量实验室',
                    'description' => $description,
                    'url' => self::url('/vectors'),
                    'inLanguage' => 'zh-CN',
                    'learningResourceType' => '交互式教学工具',
                    'educationalUse' => '教学',
                    'isAccessibleForFree' => true,
                ],
                self::breadcrumbs([['心脏向量实验室', '/vectors']]),
            ],
        ], $body));
    }

    private static function lab(): void
    {
        $title = '电解质心电图实验室：钾、钙、镁与 QT | ' . self::SITE_NAME;
        $description = '拖动 K⁺、Ca²⁺、Mg²⁺ 滑杆，观察 T 波、U 波、QT、PR 与 QRS 的联动；配合透析前高钾、利尿剂低钾低镁、甲状腺术后低钙等病例与自测，把形态变成决策。';

        $body = '<div class="seo-wrap">'
            . self::pageHead('ELECTROLYTE LAB', '电解质实验室', '拖动 K⁺、Ca²⁺、Mg²⁺ 滑杆，观察 T 波、U 波、QT、PR 与 QRS 的联动；再用病例和自测把形态变成决策。', ['K⁺ / Ca²⁺ / Mg²⁺', '实时波形', '5 个病例'])
            . '<div class="seo-prose">'
            . '<section class="seo-sec"><h2>钾：T 波高尖与 QRS 增宽</h2><p>高钾时 T 波高尖、基底变窄；进一步升高会出现 P 波变平、PR 延长、QRS 增宽，严重时呈正弦波。低钾则表现为 T 波低平、U 波突出与 ST 压低，QT(U) 延长。</p></section>'
            . '<section class="seo-sec"><h2>钙：ST 段与 QT</h2><p>低钙使 ST 段延长、QT 延长，T 波形态多正常；高钙使 QT/ST 缩短，严重时可出现心动过缓与传导阻滞。白蛋白水平会影响总钙的解读。</p></section>'
            . '<section class="seo-sec"><h2>镁：难治性低钾与尖端扭转</h2><p>低镁常与低钾并存；不补镁时肾性丢钾与复极异常难以纠正。低镁导致 QT 延长、U 波与 T 波低平，是尖端扭转型室速的重要背景。高镁抑制房室结与传导，出现 PR/QRS 延长、心动过缓与低血压。</p></section>'
            . '<section class="seo-sec"><h2>病例与自测</h2><ul>'
            . '<li><b>透析前高钾：</b>少尿、乏力；QRS 增宽，P 波消失。先静脉钙剂稳定心肌，再降钾。</li>'
            . '<li><b>利尿剂低钾低镁：</b>U 波突出、QT 延长；补钾同时必须补镁。</li>'
            . '<li><b>甲状腺术后低钙：</b>口周麻木、手足抽搐；QT 延长，有症状低钙需静脉钙剂。</li>'
            . '<li><b>酒精性低镁 / TdP：</b>QT 明显延长，多形性室速；硫酸镁并纠正钾镁。</li>'
            . '<li><b>肾功能不全高镁：</b>PR 延长、QRS 宽、心动过缓；停药、补液并考虑透析。</li>'
            . '</ul><p>交互版可实时拖动滑杆观察波形变化，并完成 5 题自测。</p>'
            . '<p><a class="seo-btn seo-btn-primary" href="/#/lab">打开电解质实验室 →</a> <a class="seo-btn" href="/learn/hyperkalemia">阅读高钾血症课程</a></p></section>'
            . '</div>'
            . '<p class="seo-disclaimer">实验室为教学示意；真实电解质紊乱的处理必须结合化验、心电图、肾功能与临床情况，并遵循当地流程。</p>'
            . '</div>';

        self::send(self::shell([
            'title' => $title,
            'description' => $description,
            'canonical' => self::url('/lab'),
            'keywords' => '电解质心电图,高钾心电图,低钾U波,低钙QT延长,低镁,尖端扭转型室速,心电图实验室',
            'active' => '/lab',
            'jsonLd' => [
                [
                    '@context' => 'https://schema.org',
                    '@type' => 'LearningResource',
                    'name' => '电解质心电图实验室',
                    'description' => $description,
                    'url' => self::url('/lab'),
                    'inLanguage' => 'zh-CN',
                    'learningResourceType' => '交互式教学工具',
                    'educationalUse' => '教学',
                    'isAccessibleForFree' => true,
                ],
                self::breadcrumbs([['电解质实验室', '/lab']]),
            ],
        ], $body));
    }

    // -------------------------------------------------------------- sitemap

    private static function sitemap(): void
    {
        $lastmod = self::lastModified();
        $urls = [
            ['/', '1.0', 'daily'],
            ['/learn', '0.9', 'weekly'],
            ['/read', '0.9', 'monthly'],
            ['/practice', '0.9', 'monthly'],
            ['/sim', '0.8', 'monthly'],
            ['/vectors', '0.8', 'monthly'],
            ['/lab', '0.7', 'monthly'],
            ['/glossary', '0.8', 'monthly'],
            ['/guidelines', '0.7', 'monthly'],
            ['/intro', '0.8', 'monthly'],
            ['/about', '0.5', 'yearly'],
        ];
        foreach (self::scenarios() as $scenario) {
            $urls[] = ['/sim/' . $scenario['id'], '0.6', 'monthly'];
        }
        foreach (Content::summaries() as $item) {
            $urls[] = ['/learn/' . $item['id'], '0.8', 'monthly'];
        }

        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
        foreach ($urls as [$loc, $priority, $changefreq]) {
            $xml .= '  <url><loc>' . self::e(self::url($loc)) . '</loc>'
                . '<lastmod>' . $lastmod . '</lastmod>'
                . '<changefreq>' . $changefreq . '</changefreq>'
                . '<priority>' . $priority . '</priority></url>' . "\n";
        }
        $xml .= '</urlset>' . "\n";

        http_response_code(200);
        header('Content-Type: application/xml; charset=utf-8');
        header('Cache-Control: public, max-age=3600');
        header('X-Robots-Tag: noindex');
        if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'HEAD') {
            echo $xml;
        }
        exit;
    }

    private static function notFound(string $message): void
    {
        $body = '<div class="seo-wrap seo-nf">'
            . '<div class="seo-eyebrow">404</div>'
            . '<h1 class="seo-title">' . self::e($message) . '</h1>'
            . '<p class="seo-lead">链接可能已更新，或地址输入有误。你可以从下面的入口继续。</p>'
            . '<div class="seo-nf-links"><a class="seo-btn seo-btn-primary" href="/learn">诊断图谱</a>'
            . '<a class="seo-btn" href="/">返回首页</a>'
            . '<a class="seo-btn" href="/glossary">术语表</a></div>'
            . '</div>';
        self::send(self::shell([
            'title' => '页面不存在 | ' . self::SITE_NAME,
            'description' => '页面不存在。浏览心迹 ECG Lab 的心电图诊断图谱、术语表与判读训练。',
            'canonical' => self::url('/'),
            'robots' => 'noindex,follow',
            'active' => '',
        ], $body), 404);
    }

    // -------------------------------------------------------------- helpers

    private static function shell(array $meta, string $main): string
    {
        $title = (string) ($meta['title'] ?? self::SITE_NAME);
        $description = (string) ($meta['description'] ?? '');
        $canonical = (string) ($meta['canonical'] ?? self::baseUrl() . '/');
        $robots = (string) ($meta['robots'] ?? 'index,follow,max-image-preview:large,max-snippet:-1');
        $keywords = (string) ($meta['keywords'] ?? '心电图,心电图判读,心电图学习,ECG');
        $type = (string) ($meta['type'] ?? 'website');
        $active = (string) ($meta['active'] ?? '');
        $image = self::ogImage();
        $version = self::assetVersion();

        $nav = '';
        foreach (self::NAV as [$href, $label]) {
            $isActive = $active !== '' && ($active === $href || str_starts_with($active, $href . '/'));
            $nav .= '<a href="' . self::e($href) . '"' . ($isActive ? ' aria-current="page" class="is-active"' : '') . '>' . self::e($label) . '</a>';
        }

        $jsonLd = $meta['jsonLd'] ?? [];
        if (!is_array($jsonLd)) {
            $jsonLd = [];
        }
        array_unshift($jsonLd, self::websiteSchema());

        $scripts = '';
        foreach ($jsonLd as $schema) {
            if (!is_array($schema) || $schema === []) {
                continue;
            }
            $scripts .= '<script type="application/ld+json">'
                . json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
                . '</script>' . "\n";
        }

        $verify = '';
        $engines = ['baidu' => 'baidu-site-verification', 'google' => 'google-site-verification', 'bing' => 'msvalidate.01'];
        foreach ($engines as $key => $name) {
            $code = trim((string) Config::get('app.seo.verification.' . $key, ''));
            if ($code !== '') {
                $verify .= '<meta name="' . $name . '" content="' . self::e($code) . '">' . "\n";
            }
        }

        $head = '<!doctype html><html lang="zh-CN" data-theme="light">'
            . '<head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            . '<meta name="applicable-device" content="pc,mobile">'
            . '<meta name="renderer" content="webkit">'
            . '<title>' . self::e($title) . '</title>'
            . '<meta name="description" content="' . self::e($description) . '">'
            . '<meta name="keywords" content="' . self::e($keywords) . '">'
            . '<meta name="robots" content="' . self::e($robots) . '">'
            . '<meta name="author" content="' . self::SITE_NAME . '">'
            . '<meta name="theme-color" content="#0e766e" media="(prefers-color-scheme: light)">'
            . '<meta name="theme-color" content="#0b2b29" media="(prefers-color-scheme: dark)">'
            . '<meta name="color-scheme" content="light dark">'
            . '<link rel="canonical" href="' . self::e($canonical) . '">'
            . '<link rel="alternate" hreflang="zh-CN" href="' . self::e($canonical) . '">'
            . '<link rel="alternate" hreflang="x-default" href="' . self::e($canonical) . '">'
            . '<meta property="og:site_name" content="' . self::SITE_NAME . '">'
            . '<meta property="og:type" content="' . self::e($type) . '">'
            . '<meta property="og:title" content="' . self::e($title) . '">'
            . '<meta property="og:description" content="' . self::e($description) . '">'
            . '<meta property="og:url" content="' . self::e($canonical) . '">'
            . '<meta property="og:image" content="' . self::e($image) . '">'
            . '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
            . '<meta property="og:locale" content="zh_CN">'
            . '<meta name="twitter:card" content="summary_large_image">'
            . '<meta name="twitter:title" content="' . self::e($title) . '">'
            . '<meta name="twitter:description" content="' . self::e($description) . '">'
            . '<meta name="twitter:image" content="' . self::e($image) . '">'
            . $verify
            . '<link rel="icon" href="/static/img/favicon.svg?v=' . $version . '" type="image/svg+xml">'
            . '<link rel="icon" href="/static/img/icon-192.png?v=' . $version . '" type="image/png" sizes="192x192">'
            . '<link rel="apple-touch-icon" href="/static/img/apple-touch-icon.png?v=' . $version . '" sizes="180x180">'
            . '<link rel="manifest" href="/static/manifest.webmanifest?v=' . $version . '">'
            . '<link rel="stylesheet" href="/static/css/tokens.css?v=' . $version . '">'
            . '<link rel="stylesheet" href="/static/css/base.css?v=' . $version . '">'
            . '<link rel="stylesheet" href="/static/css/components.css?v=' . $version . '">'
            . '<link rel="stylesheet" href="/static/css/seo.css?v=' . $version . '">'
            . '<script src="/static/js/theme-init.js?v=' . $version . '"></script>'
            . $scripts
            . '</head>';

        $header = '<body class="seo-body">'
            . '<a class="seo-skip" href="#main">跳到主要内容</a>'
            . '<header class="seo-header"><div class="seo-header-inner">'
            . '<a class="seo-brand" href="/" aria-label="' . self::SITE_NAME . ' 首页">'
            . '<span class="seo-brand-mark" aria-hidden="true"><svg viewBox="0 0 48 48" width="26" height="26"><path d="M4 26h8l4-9 6 18 5-22 5 13h12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
            . '<span class="seo-brand-text"><b>心迹</b><small>ECG Lab</small></span></a>'
            . '<nav class="seo-nav" aria-label="主导航">' . $nav . '</nav>'
            . '<div class="seo-head-actions"><a class="seo-btn seo-btn-primary seo-btn-sm" href="/#/practice">开始练习</a></div>'
            . '</div></header>'
            . '<main id="main" class="seo-main">' . $main . '</main>';

        $site = self::siteInfo();
        $icpLink = $site['icp'] !== ''
            ? ' · <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">' . self::e($site['icp']) . '</a>'
            : '';

        $footer = '<footer class="seo-footer"><div class="seo-footer-inner">'
            . '<div class="seo-foot-brand"><b>' . self::SITE_ALT . '</b><p>' . self::TAGLINE . '。面向医学生与住院医师的免费开源心电图学习平台。</p></div>'
            . '<div class="seo-foot-col"><b>内容</b>'
            . '<a href="/learn">诊断图谱</a><a href="/intro">导论</a><a href="/glossary">双语术语表</a><a href="/guidelines">区域指南差异</a></div>'
            . '<div class="seo-foot-col"><b>训练</b>'
            . '<a href="/read">五步判读</a><a href="/practice">判读练习</a><a href="/sim">急救推演</a><a href="/vectors">向量实验室</a><a href="/lab">电解质实验室</a></div>'
            . '<div class="seo-foot-col"><b>关于</b>'
            . '<a href="/about">关于 / 勘误</a><a href="' . self::e($site['github']) . '" rel="noopener">GitHub</a><a href="/sitemap.xml">站点地图</a></div>'
            . '</div>'
            . '<p class="seo-foot-note">教学内容用于学习与讨论，不构成诊疗建议。' . self::e($site['license']) . ' · ' . self::e($site['copyright']) . $icpLink . '</p>'
            . '</footer>';

        return $head . $header . $footer . '</body></html>';
    }

    private static function pageHead(string $eyebrow, string $title, string $sub, array $stats = []): string
    {
        $statHtml = '';
        foreach ($stats as $stat) {
            $statHtml .= '<span class="seo-stat">' . self::e($stat) . '</span>';
        }
        return '<header class="seo-page-head"><div class="seo-eyebrow">' . self::e($eyebrow) . '</div>'
            . '<h1 class="seo-title">' . self::e($title) . '</h1>'
            . '<p class="seo-lead">' . $sub . '</p>'
            . ($statHtml !== '' ? '<div class="seo-stats">' . $statHtml . '</div>' : '')
            . '</header>';
    }

    private static function crumbs(array $items): string
    {
        $out = '<nav class="seo-crumbs" aria-label="面包屑">';
        $last = count($items) - 1;
        foreach ($items as $i => [$label, $href]) {
            if ($i === $last) {
                $out .= '<span aria-current="page">' . self::e($label) . '</span>';
            } else {
                $out .= '<a href="' . self::e($href) . '">' . self::e($label) . '</a><span aria-hidden="true">/</span>';
            }
        }
        return $out . '</nav>';
    }

    private static function card(array $item): string
    {
        $tags = '';
        foreach (array_slice((array) ($item['tags'] ?? []), 0, 4) as $tag) {
            $tags .= '<span>' . self::e($tag) . '</span>';
        }
        return '<a class="seo-card seo-course-card" href="/learn/' . self::e($item['id']) . '">'
            . '<div class="seo-card-top"><span class="seo-badge seo-badge-brand">' . self::e($item['chapterName'] ?? '') . '</span>'
            . '<span class="seo-badge">' . self::difficultyLabel((int) ($item['difficulty'] ?? 1)) . '</span></div>'
            . '<h3>' . self::e($item['name'] ?? '') . '</h3>'
            . (($item['en'] ?? '') !== '' ? '<p class="seo-card-en">' . self::e($item['en']) . '</p>' : '')
            . '<p class="seo-card-one">' . self::e($item['oneLiner'] ?? '') . '</p>'
            . '<div class="seo-card-tags">' . $tags . '<span class="seo-textlink">阅读全文 →</span></div>'
            . '</a>';
    }

    private static function section(string $id, string $title, string $inner): string
    {
        return '<section class="seo-sec" id="' . self::e($id) . '"><h2>' . self::e($title) . '</h2>' . $inner . '</section>';
    }

    private static function ecgSection(array $detail, string $id): string
    {
        $ecg = (array) ($detail['ecg'] ?? []);
        $metrics = [
            ['心率', (string) ($ecg['rate'] ?? '—') . ' 次/分'],
            ['PR 间期', (string) ($ecg['pr'] ?? '—') . ' s'],
            ['QRS', (string) ($ecg['qrs'] ?? '—') . ' s'],
            ['QT', (string) ($ecg['qt'] ?? '—') . ' s'],
        ];
        $html = '<div class="seo-ecg-box"><div class="seo-ecg-metrics">';
        foreach ($metrics as [$label, $value]) {
            $html .= '<div><b>' . self::e($value) . '</b><span>' . self::e($label) . '</span></div>';
        }
        $html .= '</div><p>本页展示关键测量值；可播放的节律条、12 导联、标注与逐搏测量在交互版中查看。</p>'
            . '<a class="seo-btn seo-btn-primary" href="/#/learn/' . self::e($id) . '">打开教学心电图 →</a></div>';
        return self::section('ecg-teaching', '教学心电图', $html);
    }

    private static function guidelineSection(array $guideline): string
    {
        $html = '';
        $markers = (array) ($guideline['markers'] ?? []);
        $workflow = (array) ($guideline['workflow'] ?? []);
        $safety = (array) ($guideline['safety'] ?? []);
        if ($markers !== []) {
            $html .= '<h3>关键检查 / 指标</h3>' . self::ul($markers);
        }
        if ($workflow !== []) {
            $html .= '<h3>处理流程</h3>' . self::ol($workflow);
        }
        if ($safety !== []) {
            $html .= '<h3>安全边界</h3>' . self::ul($safety);
        }
        $sources = (array) ($guideline['sources'] ?? []);
        $sourceText = $sources !== [] ? '参考指南：' . implode(' · ', array_map('strval', $sources)) : '';
        $html .= '<div class="seo-callout seo-callout-warn"><b>' . self::e($guideline['title'] ?? '指南规范与检查流程（教学）') . '</b>'
            . ($sourceText !== '' ? '<p>' . self::e($sourceText) . '</p>' : '')
            . '<p>本段为教学摘要，不替代当地指南与临床判断。</p></div>';
        return self::section('guideline', '指南规范与检查流程', $html);
    }

    private static function chapterGuideSection(?array $guide): string
    {
        if (!is_array($guide) || empty($guide['overview'])) return '';
        $html = '<p class="seo-lead">' . self::e((string) $guide['overview']) . '</p>';
        $html .= '<h3>判读与决策顺序</h3>' . self::ol((array) ($guide['checklist'] ?? []));
        $html .= '<h3>危险信号</h3>' . self::ul((array) ($guide['redFlags'] ?? []));
        $html .= '<h3>记忆与易错点</h3>' . self::ul((array) ($guide['pearls'] ?? []));
        $refs = (array) ($guide['references'] ?? []);
        if ($refs !== []) {
            $html .= '<h3>权威指南与文献</h3><ul class="seo-list">';
            foreach ($refs as $ref) {
                if (!is_array($ref)) continue;
                $title = self::e((string) ($ref['title'] ?? $ref['url'] ?? '参考文献'));
                $url = (string) ($ref['url'] ?? '');
                $meta = array_filter([
                    (string) ($ref['authors'] ?? ''),
                    (string) ($ref['journal'] ?? ''),
                    (string) ($ref['year'] ?? ''),
                    (string) ($ref['note'] ?? ''),
                ], static fn (string $part): bool => $part !== '');
                $link = $url !== '' ? '<a href="' . self::e($url) . '" target="_blank" rel="noopener noreferrer">' . $title . '</a>' : $title;
                $html .= '<li>' . $link . ($meta !== [] ? '<br><small>' . self::e(implode(' · ', $meta)) . '</small>' : '') . '</li>';
            }
            $html .= '</ul>';
        }
        return self::section('chapter-guide', '本章学习框架', $html);
    }

    private static function ul(array $items, string $class = 'seo-list'): string
    {
        if ($items === []) {
            return '';
        }
        $lis = '';
        foreach ($items as $item) {
            if (is_array($item)) {
                $title = (string) ($item['title'] ?? $item['name'] ?? '');
                $body = (string) ($item['body'] ?? $item['text'] ?? $item['why'] ?? '');
                $lis .= '<li>' . ($title !== '' ? '<b>' . self::e($title) . '</b> ' : '') . self::e($body) . '</li>';
            } else {
                $lis .= '<li>' . self::e((string) $item) . '</li>';
            }
        }
        return '<ul class="' . self::e($class) . '">' . $lis . '</ul>';
    }

    private static function ol(array $items): string
    {
        if ($items === []) {
            return '';
        }
        $lis = '';
        foreach ($items as $item) {
            $lis .= '<li>' . self::e(is_array($item) ? (string) ($item['text'] ?? $item['body'] ?? '') : (string) $item) . '</li>';
        }
        return '<ol class="seo-list seo-list-number">' . $lis . '</ol>';
    }

    private static function para(string $text): string
    {
        if (trim($text) === '') {
            return '';
        }
        return '<p>' . nl2br(self::e($text), false) . '</p>';
    }

    private static function scenarios(): array
    {
        if (!is_file(BASE_PATH . '/data/scenarios.php')) {
            return [];
        }
        $scenarios = require BASE_PATH . '/data/scenarios.php';
        return is_array($scenarios) ? $scenarios : [];
    }

    private static function patientLine(array $scenario): string
    {
        $patient = (array) ($scenario['patient'] ?? []);
        $parts = array_filter([
            isset($patient['age']) ? ((string) $patient['age'] . ' 岁') : '',
            (string) ($patient['sex'] ?? ''),
            (string) ($patient['complaint'] ?? ''),
        ]);
        return implode(' · ', $parts);
    }

    /** @return array{id:string,name:string}|null */
    private static function neighbour(string $id, int $delta): ?array
    {
        $list = Content::summaries();
        $index = null;
        foreach ($list as $i => $item) {
            if (($item['id'] ?? '') === $id) {
                $index = $i;
                break;
            }
        }
        if ($index === null) {
            return null;
        }
        $target = $list[$index + $delta] ?? null;
        return is_array($target) ? ['id' => (string) $target['id'], 'name' => (string) $target['name']] : null;
    }

    private static function difficultyLabel(int $difficulty): string
    {
        return $difficulty >= 3 ? '挑战' : ($difficulty === 2 ? '进阶' : '基础');
    }

    private static function urgencyLabel(string $urgency): string
    {
        return [
            'critical' => '危急优先',
            'urgent' => '急症相关',
            'core' => '核心课程',
            'advanced' => '进阶拓展',
        ][$urgency] ?? '核心课程';
    }

    private static function websiteSchema(): array
    {
        $site = self::siteInfo();
        return [
            '@context' => 'https://schema.org',
            '@type' => 'WebSite',
            'name' => self::SITE_NAME,
            'alternateName' => self::SITE_ALT,
            'url' => self::baseUrl() . '/',
            'inLanguage' => 'zh-CN',
            'description' => '面向医学生与住院医师的免费开源心电图学习、判读练习与 ACLS 急救推演平台。',
            'publisher' => [
                '@type' => 'EducationalOrganization',
                'name' => self::SITE_NAME,
                'url' => self::baseUrl() . '/',
                'sameAs' => [$site['github']],
            ],
            'potentialAction' => [
                '@type' => 'SearchAction',
                'target' => ['@type' => 'EntryPoint', 'urlTemplate' => self::baseUrl() . '/learn?q={search_term_string}'],
                'query-input' => 'required name=search_term_string',
            ],
        ];
    }

    private static function siteInfo(): array
    {
        return [
            'github' => trim((string) Settings::get('site.github_url', self::GITHUB)) ?: self::GITHUB,
            'license' => trim((string) Settings::get('site.license', 'MIT（代码）· CC BY-SA 4.0（教学内容）')),
            'copyright' => trim((string) Settings::get('site.copyright', '© 2026 Tianhao Wu 等')),
            'icp' => trim((string) Settings::get('site.icp', '')),
        ];
    }

    private static function breadcrumbs(array $items): array
    {
        $out = [];
        foreach ($items as $i => $item) {
            $out[] = [
                '@type' => 'ListItem',
                'position' => $i + 1,
                'name' => (string) ($item[0] ?? ''),
                'item' => self::url((string) ($item[1] ?? '/')),
            ];
        }
        return [
            '@context' => 'https://schema.org',
            '@type' => 'BreadcrumbList',
            'itemListElement' => $out,
        ];
    }

    private static function send(string $html, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Language: zh-CN');
        header('Cache-Control: public, max-age=600');
        if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'HEAD') {
            echo $html;
        }
        exit;
    }

    private static function url(string $path): string
    {
        $path = '/' . ltrim($path, '/');
        return self::baseUrl() . ($path === '/' ? '/' : $path);
    }

    public static function baseUrl(): string
    {
        $configured = trim((string) Config::get('app.base_url', ''));
        if ($configured !== '') {
            return rtrim($configured, '/');
        }
        $host = (string) ($_SERVER['HTTP_HOST'] ?? 'ecg.tianhao.me');
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (string) ($_SERVER['SERVER_PORT'] ?? '') === '443'
            || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
        return ($https ? 'https://' : 'http://') . $host;
    }

    private static function ogImage(): string
    {
        return self::baseUrl() . '/static/img/og-cover.png';
    }

    private static function assetVersion(): string
    {
        $version = (string) Config::get('app.asset_version', '1');
        return rawurlencode($version !== '' ? $version : '1');
    }

    private static function lastModified(): string
    {
        $max = 0;
        foreach (['data/diagnoses', 'data/topics', 'data/chapters.php', 'data/guidelines.php', 'data/scenarios.php', 'data/glossary.php'] as $relative) {
            $target = BASE_PATH . '/' . $relative;
            if (is_dir($target)) {
                foreach (glob($target . '/*') ?: [] as $file) {
                    $max = max($max, (int) filemtime($file));
                }
            } elseif (is_file($target)) {
                $max = max($max, (int) filemtime($target));
            }
        }
        return date('Y-m-d', $max > 0 ? $max : time());
    }

    private static function e(mixed $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private static function clip(string $text, int $max): string
    {
        $text = trim((string) preg_replace('/\s+/u', ' ', strip_tags($text)) ?? '');
        if ($text === '') {
            return '';
        }
        return mb_strlen($text, 'UTF-8') > $max
            ? mb_substr($text, 0, $max - 1, 'UTF-8') . '…'
            : $text;
    }
}
