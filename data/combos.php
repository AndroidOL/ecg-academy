<?php
declare(strict_types=1);

// 组合病例：用于进阶/挑战练习。primary 决定基础节律，secondary 作为附加诊断或形态修饰。
return [
    [
        'id' => 'afib-rbbb',
        'primary' => 'afib',
        'secondary' => 'rbbb',
        'level' => 3,
        'overrides' => ['morphology' => 'rbbb', 'qrs' => 0.13, 'show12Lead' => true, 'primaryLead' => 'V1'],
        'stem' => '患者 72 岁，心悸、乏力，既往高血压。心电图示 RR 绝对不规则，QRS 增宽。',
    ],
    [
        'id' => 'afib-lbbb',
        'primary' => 'afib',
        'secondary' => 'lbbb',
        'level' => 3,
        'overrides' => ['morphology' => 'lbbb', 'qrs' => 0.14, 't' => ['shape' => 'discordant', 'amp' => 1.0], 'show12Lead' => true, 'primaryLead' => 'V5'],
        'stem' => '患者 68 岁，活动后气促，既往扩张型心肌病。心电图示不规则窄/宽 QRS 节律。',
    ],
    [
        'id' => 'stemi-anterior-rbbb',
        'primary' => 'stemi-anterior',
        'secondary' => 'rbbb',
        'level' => 3,
        'overrides' => ['morphology' => 'rbbb', 'qrs' => 0.13, 'show12Lead' => true, 'primaryLead' => 'V1'],
        'stem' => '患者 61 岁，持续胸痛 1 小时。心电图示前壁导联 ST 抬高，QRS 增宽。',
    ],
    [
        'id' => 'av-block-3-ventricular-escape',
        'primary' => 'av-block-3',
        'secondary' => 'ventricular-escape',
        'level' => 3,
        'overrides' => [],
        'stem' => '患者 78 岁，反复黑矇。心电图示 P 波与 QRS 完全分离，心室率约 30 次/分。',
    ],
    [
        'id' => 'wpw-afib',
        'primary' => 'afib',
        'secondary' => 'wpw',
        'level' => 3,
        'overrides' => ['morphology' => 'wpw', 'qrs' => 0.13, 't' => ['shape' => 'discordant', 'amp' => 1.0]],
        'stem' => '患者 28 岁，突发心悸、头晕。心电图示宽 QRS、RR 绝对不规则、极快心室率。',
    ],
    [
        'id' => 'long-qt-pvc',
        'primary' => 'long-qt',
        'secondary' => 'pvc',
        'level' => 3,
        'overrides' => ['ectopy' => ['type' => 'pvc', 'pattern' => 'isolated', 'coupling' => 0.55, 'count' => 1]],
        'stem' => '患者 35 岁，反复晕厥，家族中有年轻猝死史。心电图示 QT 延长并见宽大畸形提前搏动。',
    ],
    [
        'id' => 'atrial-flutter-rbbb',
        'primary' => 'atrial-flutter',
        'secondary' => 'rbbb',
        'level' => 3,
        'overrides' => ['morphology' => 'rbbb', 'qrs' => 0.13, 'primaryLead' => 'V1'],
        'stem' => '患者 66 岁，心悸伴轻度气促。心电图示规则宽 QRS 心动过速，可见锯齿状心房波。',
    ],
    [
        'id' => 'hyperkalemia-sinus-brady',
        'primary' => 'hyperkalemia',
        'secondary' => 'sinus-brady',
        'level' => 3,
        'overrides' => ['rate' => 44, 'atrialRate' => 44],
        'stem' => '患者 70 岁，乏力、少尿，血钾 7.1 mmol/L。心电图示心动过缓、T 波高尖、QRS 增宽。',
    ],
];
