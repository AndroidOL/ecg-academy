<?php
declare(strict_types=1);

namespace App;

final class Content
{
    private static ?array $chapters = null;
    private static ?array $diagnoses = null;

    public static function chapters(): array
    {
        if (self::$chapters === null) {
            $file = BASE_PATH . '/data/chapters.php';
            self::$chapters = is_file($file) ? require $file : [];
            usort(self::$chapters, static fn (array $a, array $b): int => ((int) ($a['order'] ?? 99)) <=> ((int) ($b['order'] ?? 99)));
        }
        return self::$chapters;
    }

    public static function chapter(string $id): ?array
    {
        foreach (self::chapters() as $chapter) {
            if ($chapter['id'] === $id) {
                return $chapter;
            }
        }
        return null;
    }

    public static function all(): array
    {
        if (self::$diagnoses !== null) {
            return self::$diagnoses;
        }

        $diagnoses = [];
        $files = array_merge(
            glob(BASE_PATH . '/data/diagnoses/*.php') ?: [],
            glob(BASE_PATH . '/data/topics/*.php') ?: [],
            glob(BASE_PATH . '/data/topics/*.json') ?: []
        );
        foreach ($files as $file) {
            $items = str_ends_with($file, '.json')
                ? json_decode((string) file_get_contents($file), true)
                : require $file;
            if (!is_array($items)) {
                continue;
            }
            foreach ($items as $item) {
                if (!isset($item['id'])) {
                    continue;
                }
                $diagnoses[$item['id']] = $item;
            }
        }
        self::$diagnoses = $diagnoses;
        return $diagnoses;
    }

    public static function find(string $id): ?array
    {
        return self::all()[$id] ?? null;
    }

    public static function summaries(): array
    {
        $chapters = self::chapters();
        $chapterMap = [];
        foreach ($chapters as $chapter) {
            $chapterMap[$chapter['id']] = $chapter;
        }

        $out = [];
        foreach (self::all() as $diagnosis) {
            $chapter = $chapterMap[$diagnosis['chapter']] ?? null;
            $out[] = [
                'id' => $diagnosis['id'],
                'name' => $diagnosis['name'],
                'en' => $diagnosis['en'] ?? '',
                'chapter' => $diagnosis['chapter'],
                'chapterName' => $chapter['name'] ?? '',
                'chapterColor' => $chapter['color'] ?? 'teal',
                'difficulty' => (int) ($diagnosis['difficulty'] ?? 1),
                'tags' => $diagnosis['tags'] ?? [],
                'oneLiner' => $diagnosis['oneLiner'] ?? '',
                'keyNumbers' => $diagnosis['keyNumbers'] ?? [],
                'preview' => self::previewSpec($diagnosis),
                'quizEligible' => (bool) ($diagnosis['quizEligible'] ?? true),
                'topic' => (bool) ($diagnosis['topic'] ?? false),
                'urgency' => (string) ($diagnosis['urgency'] ?? 'core'),
                'rarity' => (string) ($diagnosis['rarity'] ?? (in_array($diagnosis['chapter'], ['pacing','special','syndromes','pediatric','rhythm-competition','advanced'], true) ? 'uncommon' : 'common')),
                'hasEcg' => isset($diagnosis['ecg']) && is_array($diagnosis['ecg']),
            ];
        }
        usort($out, static function (array $a, array $b): int {
            $order = array_flip(array_column(self::chapters(), 'id'));
            $ca = $order[$a['chapter']] ?? 99;
            $cb = $order[$b['chapter']] ?? 99;
            return $ca <=> $cb ?: strcmp($a['id'], $b['id']);
        });
        return $out;
    }

    public static function detail(string $id): ?array
    {
        $diagnosis = self::find($id);
        if (!$diagnosis) {
            return null;
        }
        $chapter = self::chapter($diagnosis['chapter']);
        $related = [];
        foreach ($diagnosis['differential'] ?? [] as $diff) {
            $candidate = self::find($diff['id'] ?? '');
            if ($candidate) {
                $related[$candidate['id']] = [
                    'id' => $candidate['id'],
                    'name' => $candidate['name'],
                    'why' => $diff['why'] ?? '',
                ];
            }
        }
        foreach (self::all() as $candidate) {
            if (count($related) >= 4) {
                break;
            }
            if ($candidate['id'] !== $id && $candidate['chapter'] === $diagnosis['chapter'] && !isset($related[$candidate['id']])) {
                $related[$candidate['id']] = [
                    'id' => $candidate['id'],
                    'name' => $candidate['name'],
                    'why' => '同章节延伸阅读',
                ];
            }
        }

        $diagnosis['chapterMeta'] = $chapter;
        $diagnosis['related'] = array_values($related);
        $diagnosis['topic'] = (bool) ($diagnosis['topic'] ?? false);
        $diagnosis['urgency'] = (string) ($diagnosis['urgency'] ?? 'core');
        $diagnosis['rarity'] = (string) ($diagnosis['rarity'] ?? (in_array($diagnosis['chapter'], ['pacing','special','syndromes','pediatric','rhythm-competition','advanced'], true) ? 'uncommon' : 'common'));
        $diagnosis['hasEcg'] = isset($diagnosis['ecg']) && is_array($diagnosis['ecg']);
        $diagnosis['ecg'] = $diagnosis['hasEcg'] ? self::fullSpec($diagnosis) : null;
        return $diagnosis;
    }

    public static function previewSpec(array $diagnosis): array
    {
        if (!isset($diagnosis['ecg']) || !is_array($diagnosis['ecg'])) return [];
        $spec = $diagnosis['ecg'];
        $spec['duration'] = min(4.0, (float) ($spec['duration'] ?? 4.0));
        $spec['annotations'] = [];
        $spec['seed'] = 7;
        $spec['preview'] = true;
        return $spec;
    }

    public static function fullSpec(array $diagnosis): array
    {
        $spec = $diagnosis['ecg'] ?? [];
        $spec['duration'] = (float) ($spec['duration'] ?? 8.0);
        $spec['seed'] = (int) ($spec['seed'] ?? 11);
        return $spec;
    }

    public static function stats(): array
    {
        $all = self::all();
        $eligible = array_filter($all, static fn (array $d): bool => (bool) ($d['quizEligible'] ?? true));
        return [
            'articles' => count($all),
            'diagnoses' => count($eligible),
            'chapters' => count(self::chapters()),
            'quizEligible' => count($eligible),
            'topics' => count(array_filter($all, static fn (array $d): bool => (bool) ($d['topic'] ?? false))),
        ];
    }
}
