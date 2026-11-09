<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Scoring;

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
        echo "  FAIL {$name}: {$e->getMessage()}\n";
    }
}

try {
    check('base values and level-relative XP multipliers', function (): void {
        assert(Scoring::base(1) === 10);
        assert(Scoring::base(2) === 15);
        assert(Scoring::base(3) === 20);
        assert(Scoring::xpMultiplier(1, 4) === 1.0);
        assert(Scoring::xpMultiplier(1, 5) === 0.6);
        assert(Scoring::xpMultiplier(1, 8) === 0.3);
        assert(Scoring::xpMultiplier(1, 10) === 0.0);
        assert(Scoring::xpMultiplier(2, 20) === 0.5);
        assert(Scoring::xpMultiplier(3, 8) === 1.1);
    });

    check('fast correct answer earns base, time bonus and full XP', function (): void {
        $r = Scoring::evaluate(['correct' => true, 'difficulty' => 1, 'level' => 1, 'mode' => 'practice', 'timeMs' => 3000]);
        assert($r['score'] === 13);
        assert($r['timeBonus'] === 3);
        assert($r['xp'] === 10);
        assert($r['slow'] === false);
    });

    check('slow correct answer gets 70% score and 60% XP', function (): void {
        $r = Scoring::evaluate(['correct' => true, 'difficulty' => 1, 'level' => 1, 'mode' => 'practice', 'timeMs' => 20000]);
        assert($r['score'] === 7);
        assert($r['xp'] === 6);
        assert($r['slow'] === true);
        assert($r['speed'] === 'slow');
    });

    check('partial answers keep a small reward without penalty', function (): void {
        $r = Scoring::evaluate(['correct' => false, 'partial' => true, 'difficulty' => 1, 'level' => 1, 'mode' => 'practice', 'timeMs' => 3000]);
        assert($r['score'] === 3);
        assert($r['xp'] === 2);
        assert($r['slow'] === false);
    });

    check('wrong penalties follow mode 2/3/4/5 while XP loss stays 1x', function (): void {
        $learn = Scoring::evaluate(['correct' => false, 'difficulty' => 1, 'level' => 1, 'mode' => 'learn']);
        $exam = Scoring::evaluate(['correct' => false, 'difficulty' => 1, 'level' => 1, 'mode' => 'exam']);
        $practice = Scoring::evaluate(['correct' => false, 'difficulty' => 1, 'level' => 1, 'mode' => 'practice']);
        $daily = Scoring::evaluate(['correct' => false, 'difficulty' => 1, 'level' => 1, 'mode' => 'daily']);
        assert($learn['score'] === -20 && $learn['xp'] === -10);
        assert($exam['score'] === -30 && $exam['xp'] === -10);
        assert($practice['score'] === -40 && $practice['xp'] === -10);
        assert($daily['score'] === -50 && $daily['xp'] === -10);
    });

    check('Lv10 basic questions give no XP but still affect test score', function (): void {
        $correct = Scoring::evaluate(['correct' => true, 'difficulty' => 1, 'level' => 10, 'mode' => 'practice', 'timeMs' => 3000]);
        $wrong = Scoring::evaluate(['correct' => false, 'difficulty' => 1, 'level' => 10, 'mode' => 'practice', 'timeMs' => 3000]);
        assert($correct['xp'] === 0);
        assert($correct['score'] === 13);
        assert($wrong['xp'] === 0);
        assert($wrong['score'] === -40);
        $advanced = Scoring::evaluate(['correct' => true, 'difficulty' => 2, 'level' => 10, 'mode' => 'practice', 'timeMs' => 3000]);
        assert($advanced['xp'] === 12);
    });

    check('locked difficulties are free practice with zero score and zero XP', function (): void {
        $advanced = Scoring::evaluate(['correct' => false, 'difficulty' => 2, 'level' => 4, 'mode' => 'practice', 'timeMs' => 3000]);
        assert($advanced['unlocked'] === false);
        assert($advanced['unlockLevel'] === 5);
        assert($advanced['score'] === 0);
        assert($advanced['xp'] === 0);
        $challenge = Scoring::evaluate(['correct' => true, 'difficulty' => 3, 'level' => 7, 'mode' => 'daily', 'timeMs' => 3000]);
        assert($challenge['unlocked'] === false);
        assert($challenge['unlockLevel'] === 8);
        assert($challenge['score'] === 0);
        assert($challenge['xp'] === 0);
        $unlocked = Scoring::evaluate(['correct' => true, 'difficulty' => 2, 'level' => 5, 'mode' => 'practice', 'timeMs' => 3000]);
        assert($unlocked['unlocked'] === true);
        assert($unlocked['score'] === 18);
        assert($unlocked['xp'] > 0);
        $assignment = Scoring::evaluate(['correct' => true, 'difficulty' => 3, 'level' => 1, 'mode' => 'practice', 'timeMs' => 3000, 'forceUnlocked' => true]);
        assert($assignment['unlocked'] === true);
        assert($assignment['score'] > 0);
        assert($assignment['xp'] > 0);
    });

    check('learning rounds do not get speed bonuses', function (): void {
        $r = Scoring::evaluate(['correct' => true, 'difficulty' => 2, 'level' => 5, 'mode' => 'learn', 'timeMs' => null]);
        assert($r['score'] === 15);
        assert($r['timeBonus'] === 0);
        assert($r['slow'] === false);
        assert($r['xp'] === 15);
    });
} finally {
    echo "\n{$passed} passed, {$failed} failed\n";
}

exit($failed === 0 ? 0 : 1);
