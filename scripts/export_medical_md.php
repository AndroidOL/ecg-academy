<?php
declare(strict_types=1);

require dirname(__DIR__) . '/app/bootstrap.php';

use App\Content;

$chapters = Content::chapters();
$all = Content::all();
$scenarios = require BASE_PATH . '/data/scenarios.php';
$byChapter = [];
foreach ($all as $diagnosis) {
    $byChapter[$diagnosis['chapter']][] = $diagnosis;
}

$md = [];
$md[] = '# 心迹 ECG Lab · 医学手册';
$md[] = '';
$md[] = '> 面向医学生、住院医师与急救培训者的心电图学习手册。';
$md[] = '> 本手册由站内策展内容自动导出，与站内课程保持同源；波形为教学用途的形态学近似。';
$md[] = '> **教学用途声明：** 不构成个体化诊断或治疗建议；真实患者请结合病史、体检、化验、影像与当地指南。';
$md[] = '';
$md[] = '## 目录';
$md[] = '';
$md[] = '- [一、如何使用本手册](#一如何使用本手册)';
foreach ($chapters as $index => $chapter) {
    $md[] = sprintf('- [%d. %s](#%d-%s)', $index + 1, $chapter['name'], $index + 1, preg_replace('/[^\p{Han}a-zA-Z0-9]+/u', '-', $chapter['name']));
}
$md[] = '- [附：ACLS 急救场景](#附acls-急救场景)';
$md[] = '- [附：快速测量与判读顺序](#附快速测量与判读顺序)';
$md[] = '';
$md[] = '## 一、如何使用本手册';
$md[] = '';
$md[] = '诊断篇按“节律 → 频率 → PR/QRS/QT → ST-T → 鉴别”的固定顺序组织；理论篇按“学习目标 → 核心概念 → 判读应用 → 边界与陷阱 → 必须记住”组织。医学内容仅供教学，具体诊疗需结合患者、最新指南与本地流程。';
$md[] = '';
$md[] = '- 站内学习：`/#/learn`';
$md[] = '- 判读练习：`/#/practice`';
$md[] = '- ACLS 推演：`/#/sim`';
$md[] = '- 电解质实验室：`/#/lab`';
$md[] = '';
$md[] = '---';
$md[] = '';

$chapterIndex = 1;
foreach ($chapters as $chapter) {
    $items = $byChapter[$chapter['id']] ?? [];
    $md[] = sprintf('## %d. %s', $chapterIndex, $chapter['name']);
    $md[] = '';
    $md[] = ($chapter['description'] ?? '') . '（' . count($items) . ' 篇）';
    $md[] = '';
    $itemIndex = 1;
    foreach ($items as $item) {
        $md[] = sprintf('### %d.%d %s（%s）', $chapterIndex, $itemIndex, $item['name'], $item['en'] ?? '');
        $md[] = '';
        if (!empty($item['topic'])) {
            $md[] = '**一句话：** ' . ($item['oneLiner'] ?? '');
            $md[] = '';
            $md[] = '**难度：** ' . str_repeat('●', (int) ($item['difficulty'] ?? 1)) . str_repeat('○', 3 - min(3, max(1, (int) ($item['difficulty'] ?? 1)))) . ' · **优先级：** ' . ($item['urgency'] ?? 'core') . ' · **标签：** ' . implode(' · ', $item['tags'] ?? []);
            $md[] = '';
            if (!empty($item['objectives'])) {
                $md[] = '**学习目标：**';
                foreach ($item['objectives'] as $line) $md[] = '- ' . $line;
                $md[] = '';
            }
            foreach ($item['sections'] ?? [] as $section) {
                $md[] = '**' . ($section['title'] ?? '') . '**';
                $md[] = '';
                foreach ($section['body'] ?? [] as $line) { $md[] = $line; $md[] = ''; }
                foreach ($section['list'] ?? [] as $line) $md[] = '- ' . $line;
                if (!empty($section['list'])) $md[] = '';
            }
            if (!empty($item['keyPoints'])) {
                $md[] = '**必须记住：**';
                foreach ($item['keyPoints'] as $line) $md[] = '- ' . $line;
                $md[] = '';
            }
            if (!empty($item['clinicalPearl'])) {
                $md[] = '**临床连接：** ' . $item['clinicalPearl'];
                $md[] = '';
            }
            $md[] = '*理论/病例专题；站内可交互阅读。*';
            $md[] = '';
            $md[] = '---';
            $md[] = '';
            $itemIndex++;
            continue;
        }
        $md[] = '**一句话识别：** ' . ($item['oneLiner'] ?? '');
        $md[] = '';
        $md[] = '**难度：** ' . str_repeat('●', (int) ($item['difficulty'] ?? 1)) . str_repeat('○', 3 - min(3, max(1, (int) ($item['difficulty'] ?? 1)))) . ' · **标签：** ' . implode(' · ', $item['tags'] ?? []);
        $md[] = '';
        $md[] = '| 指标 | 数值 | 单位 |';
        $md[] = '|---|---|---|';
        foreach ($item['keyNumbers'] ?? [] as $number) {
            $md[] = '| ' . str_replace('|', '\\|', (string) $number['label']) . ' | ' . str_replace('|', '\\|', (string) $number['value']) . ' | ' . str_replace('|', '\\|', (string) ($number['unit'] ?? '')) . ' |';
        }
        $md[] = '';
        $md[] = '**最具特异性的线索：** ' . ($item['specificity'] ?? '');
        $md[] = '';
        $md[] = '**定义：** ' . ($item['definition'] ?? '');
        $md[] = '';
        $md[] = '**发生机制：**';
        foreach ($item['mechanism'] ?? [] as $line) $md[] = '- ' . $line;
        $md[] = '';
        $md[] = '**诊断标准：**';
        foreach ($item['criteria'] ?? [] as $line) $md[] = '- ' . $line;
        $md[] = '';
        $md[] = '**判读步骤：**';
        foreach ($item['reading'] ?? [] as $line) $md[] = '- ' . $line;
        $md[] = '';
        $md[] = '**危险信号：**';
        foreach ($item['redFlags'] ?? [] as $line) $md[] = '- ' . $line;
        $md[] = '';
        $md[] = '**处理原则：**';
        foreach ($item['management'] ?? [] as $line) $md[] = '- ' . $line;
        $md[] = '';
        $md[] = '**易错点：**';
        foreach ($item['pitfalls'] ?? [] as $line) $md[] = '- ' . $line;
        $md[] = '';
        $md[] = '**鉴别诊断：**';
        foreach ($item['differential'] ?? [] as $diff) {
            $other = $all[$diff['id']] ?? null;
            $md[] = '- **' . ($other['name'] ?? $diff['id']) . '**：' . ($diff['why'] ?? '');
        }
        $md[] = '';
        $md[] = '**记忆锦囊：**';
        foreach ($item['pearls'] ?? [] as $line) $md[] = '- ' . $line;
        $md[] = '';
        $ecg = $item['ecg'] ?? [];
        $md[] = '**教学心电图：** ' . ($ecg['description'] ?? '');
        $md[] = '';
        $md[] = sprintf(
            '> 规格：节律 `%s`，心率 %s 次/分，PR %s s，QRS %s s，QT %s s，形态 `%s`，12 导联 %s。',
            $ecg['rhythm'] ?? '—',
            $ecg['rate'] ?? '—',
            $ecg['pr'] ?? '—',
            $ecg['qrs'] ?? '—',
            $ecg['qt'] ?? '—',
            $ecg['morphology'] ?? '—',
            !empty($ecg['show12Lead']) ? '可用' : '仅节律条'
        );
        $md[] = '';
        if (!empty($item['quizEligible']) || !array_key_exists('quizEligible', $item)) {
            $md[] = '*本篇进入判读题库。*';
            $md[] = '';
        } else {
            $md[] = '*本篇为基本功/速查资料，不进入判读题库。*';
            $md[] = '';
        }
        $md[] = '---';
        $md[] = '';
        $itemIndex++;
    }
    $chapterIndex++;
}

$md[] = '## 附：ACLS 急救场景';
$md[] = '';
foreach ($scenarios as $scenario) {
    $md[] = '### ' . $scenario['name'];
    $md[] = '';
    $md[] = '- 场景：' . $scenario['subtitle'];
    $md[] = '- 患者：' . $scenario['patient']['age'] . ' 岁，' . $scenario['patient']['sex'] . '；' . $scenario['patient']['complaint'];
    $md[] = '- 目标：' . $scenario['success'];
    $md[] = '';
    $md[] = '关键提示：';
    foreach ($scenario['guideline'] as $line) $md[] = '- ' . $line;
    $md[] = '';
}

$md[] = '## 附：快速测量与判读顺序';
$md[] = '';
$md[] = '1. 定标：25 mm/s、10 mm/mV；一小格 0.04 s，一大格 0.20 s。';
$md[] = '2. 节律：是否有 P？P 与 QRS 是否固定？RR 是否规则？';
$md[] = '3. 频率：300 ÷ RR 大格数；不规则时数 10 秒 QRS × 6。';
$md[] = '4. 间期：PR 0.12–0.20 s；QRS <0.12 s；QTc 男 <450 ms、女 <460 ms。';
$md[] = '5. 形态：电轴、R 波递增、Q 波、ST-T、U 波。';
$md[] = '6. 鉴别：用“最特异线索 + 相邻导联 + 动态变化 + 临床背景”排除相似诊断。';
$md[] = '';
$md[] = '---';
$md[] = '';
$md[] = '> 本手册内容持续迭代；如发现错误，请在开源仓库提交修订。';
$md[] = '';

$output = implode(PHP_EOL, $md);
$target = BASE_PATH . '/docs/MEDICAL.md';
file_put_contents($target, $output);
echo "Wrote docs/MEDICAL.md: " . number_format(strlen($output)) . " bytes, " . count($all) . " articles" . PHP_EOL;
