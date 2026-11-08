<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Ai;
use App\Db;
use App\Settings;

$passed = 0;
$failed = 0;
$saved = [
    'ai.pricing' => Settings::get('ai.pricing', []),
    'ai.discounts' => Settings::get('ai.discounts', []),
    'ai.currency' => Settings::get('ai.currency', '¥'),
    'ai.max_tokens' => Settings::get('ai.max_tokens', 1200),
];

function check(string $name, callable $fn): void
{
    global $passed, $failed;
    try {
        $fn();
        $passed++;
        echo "  ok  {$name}\n";
    } catch (Throwable $e) {
        $failed++;
        echo "  FAIL {$name}: {$e->getMessage()}\n";
    }
}

try {
    check('saves and normalizes pricing and discounts', function (): void {
        $settings = Ai::saveCostSettings([
            'pricing' => [
                'unit-test-model' => ['input' => 2.5, 'output' => 10],
                'bad' => ['input' => -5, 'output' => 9999999],
            ],
            'discounts' => [
                ['label' => '测试时段', 'from' => '00:00', 'to' => '23:59', 'ratio' => 0.5],
                ['label' => '无效', 'from' => '25:00', 'to' => '08:00', 'ratio' => 0.9],
            ],
            'currency' => '¥',
            'maxTokens' => 900,
        ]);
        assert($settings['pricing']['unit-test-model']['input'] === 2.5);
        assert($settings['pricing']['bad']['input'] === 0.0);
        assert($settings['pricing']['bad']['output'] === 1000000.0);
        assert(count($settings['discounts']) === 1);
        assert($settings['discounts'][0]['label'] === '测试时段');
        assert($settings['maxTokens'] === 900);
        assert($settings['activeDiscount'] === '测试时段');
    });

    check('summary aggregates logged cost and tokens', function (): void {
        $pdo = Db::pdo();
        $pdo->prepare("INSERT INTO ai_usage_log (user_id, provider, model, mode, prompt_tokens, completion_tokens, total_tokens, cost_micro, discount_label, discount_ratio, source) VALUES (NULL, '测试', 'unit-test-model', 'chat', 1000, 2000, 3000, 2500, '测试时段', 0.5, 'ai')")->execute();
        $summary = Ai::costSummary(30);
        assert($summary['today']['cost'] >= 0.0025);
        assert($summary['today']['prompt'] >= 1000);
        assert($summary['today']['completion'] >= 2000);
        $models = array_column($summary['models'], 'model');
        assert(in_array('unit-test-model', $models, true));
        assert(count($summary['series']) === 30);
        assert($summary['recent'] !== []);
        assert($summary['currency'] === '¥');
    });

    check('empty log yields zero totals without warnings', function (): void {
        Db::pdo()->exec("DELETE FROM ai_usage_log WHERE model = 'unit-test-model'");
        $summary = Ai::costSummary(7);
        assert($summary['today']['cost'] >= 0);
        assert(count($summary['series']) === 7);
        assert($summary['recent'] === []);
    });
} finally {
    Settings::setMany($saved);
    Db::pdo()->exec("DELETE FROM ai_usage_log WHERE model = 'unit-test-model'");
}

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
