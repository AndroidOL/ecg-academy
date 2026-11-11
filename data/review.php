<?php
declare(strict_types=1);

// 版本化内容审阅台账：默认状态为“编辑核对”，不冒充已完成临床同行审阅。
return [
    'default' => [
        'status' => 'editorial',
        'statusLabel' => '编辑核对 · 待临床同行审阅',
        'reviewers' => ['Tianhao Wu（内容整理）'],
        'clinicalReviewers' => [],
        'lastChecked' => '2026-11-08',
        'sources' => [
            'AHA/ACC/HRS 2023 心电图与心律失常教学框架（教学整理）',
            'ESC 2022 室性心律失常与心脏骤停管理指南（教学摘要）',
        ],
    ],
    'chapters' => [
        'foundation' => [
            'lastChecked' => '2026-11-08',
            'sources' => ['AHA/ACCF/HRS 心电图标准化与判读建议（教学整理）', 'Bayés de Luna《Clinical Electrocardiography》'],
        ],
        'premature' => [
            'lastChecked' => '2026-11-11',
            'sources' => ['ESC 2019 室上性心动过速管理指南（教学摘要）', 'AHA/ACCF/HRS 心电图标准化建议'],
        ],
        'tachy' => [
            'lastChecked' => '2026-11-11',
            'sources' => ['ESC 2019 室上性心动过速管理指南', 'AHA ACLS 2020 成人高级生命支持', 'AHA 2025 CPR/ECC 成人 ALS 更新（教学摘要）'],
        ],
        'brady' => [
            'sources' => ['AHA ACLS 2020 成人高级生命支持', 'AHA 2025 CPR/ECC 成人 ALS 更新（教学摘要）', 'ACC/AHA/HRS 2018 心动过缓与心脏传导延迟指南'],
        ],
        'block' => [
            'sources' => ['ACC/AHA/HRS 2018 心动过缓与心脏传导延迟指南', 'AHA/ACCF/HRS 心电图标准化建议'],
        ],
        'ischemia' => [
            'lastChecked' => '2026-11-11',
            'sources' => ['ESC 2023 急性冠脉综合征指南（教学摘要）', 'Fourth Universal Definition of Myocardial Infarction (2018)'],
        ],
        'electrolyte' => [
            'lastChecked' => '2026-11-11',
            'sources' => [
                'UK Kidney Association 2023 成人急性高钾血症治疗指南（教学摘要）',
                'ESC 2022 室性心律失常与心脏骤停管理指南',
                'AHA/ACCF/HRS 心电图标准化建议',
            ],
        ],
        'structural' => [
            'sources' => [
                'ESC 2019 室上性心动过速管理指南（WPW/预激，教学摘要）',
                'HRS/EHRA/APHRS 2013 Brugada 综合征专家共识（教学摘要）',
                'ESC 2022 心脏肿瘤学与心肌病相关心电图共识（教学摘要）',
                'Bayés de Luna《Clinical Electrocardiography》',
            ],
        ],
        'skills' => [
            'lastChecked' => '2026-11-11',
            'sources' => ['AHA/ACCF/HRS 心电图标准化与判读建议', 'AHA ACLS 2020 成人高级生命支持', 'AHA 2025 CPR/ECC 成人 ALS 更新（教学摘要）'],
        ],
        'theory' => [
            'lastChecked' => '2026-11-11',
            'sources' => ['AHA/ACCF/HRS 心电图标准化与判读建议', 'Braunwald《Heart Disease》电生理章节'],
        ],
        'hypertrophy' => [
            'sources' => ['AHA/ACCF/HRS 心电图标准化建议', 'ESC 2023 心肌病指南（教学摘要）'],
        ],
        'pacing' => [
            'sources' => ['HRS/ACC/AHA 起搏器与 ICD 心电图判读共识（教学摘要）', 'AHA/ACCF/HRS 心电图标准化建议'],
        ],
        'special' => [
            'sources' => ['AHA/ACCF/HRS 心电图标准化建议', 'ESC 2022 室性心律失常管理指南'],
        ],
        'syndromes' => [
            'sources' => ['ESC 2022 室性心律失常与心脏骤停管理指南', 'HRS/EHRA 遗传性心律失常综合征共识（教学摘要）'],
        ],
        'clinical' => [
            'sources' => ['AHA ACLS 2020 成人高级生命支持', 'AHA 2025 CPR/ECC 成人 ALS 更新（教学摘要）', 'ESC 2023 急性冠脉综合征指南（教学摘要）'],
        ],
        'pediatric' => [
            'sources' => ['AHA 2020 儿童高级生命支持（PALS）', 'AHA 2025 CPR/ECC 儿童 ALS 更新（教学摘要）', 'AHA/ACCF/HRS 儿童心电图判读建议（教学摘要）'],
        ],
        'rhythm-competition' => [
            'sources' => ['AHA/ACCF/HRS 心电图标准化建议', 'Bayés de Luna《Clinical Electrocardiography》'],
        ],
        'artifact' => [
            'sources' => ['AHA/ACCF/HRS 心电图标准化与伪差识别建议', '设备厂商公开教学资料（教学整理）'],
        ],
        'advanced' => [
            'sources' => ['ESC 2022 室性心律失常管理指南', 'HRS 2023 电生理标测与消融教学共识（教学摘要）'],
        ],
    ],
    'editorialPolicy' => '先讲机制与判读路径，再讲记忆口诀；药物剂量与能量范围必须注明适用场景；线索与诊断标准均需可追溯；不提供个体化诊疗指令。',
];
