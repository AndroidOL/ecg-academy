<?php
declare(strict_types=1);

// 教学用指南摘要：面向医学生理解“检查什么、按什么顺序处理”。
// 不包含个体化医嘱；真实患者必须由具备资质的医生评估、决策和指挥。
return [
    'disclaimer' => '以上为教学性指南摘要，不是临床经验、个体化医嘱或诊疗标准，也不能替代床旁评估。真实患者必须由具备资质的医生评估、决策和指挥，并严格遵循所在医院/地区的流程与药物说明书；如遇急症，请立即呼叫急救团队。',
    'groups' => [
        'acs' => [
            'title' => '急性冠脉综合征：指南化检查与处理流程（教学）',
            'markers' => [
                '10 分钟内完成 18/12 导联心电图；症状持续或变化时重复记录，并持续心电监护。',
                '高敏肌钙蛋白（hs-cTn）0h/1h 或 0h/2h 序列：超过第 99 百分位并有动态升高/下降支持心肌梗死；有 hs-cTn 时通常不再常规加做 CK-MB。',
                '血常规、钾/镁/钙、肌酐与 eGFR、血糖/HbA1c、血脂、凝血功能；休克或低氧时加血气与乳酸。',
                '呼吸困难或疑心衰时查 BNP/NT-proBNP；床旁超声看 LVEF、节段性室壁运动、机械并发症和右室受累。',
                '胸片用于鉴别与并发症；危险分层可参考 GRACE/TIMI，出血风险与肾功能用于抗栓决策。',
            ],
            'workflow' => [
                'STEMI：立即启动再灌注流程（首选直接 PCI，目标首次医疗接触至导丝通过 ≤120 分钟）；不能及时 PCI 且无禁忌时按本地流程考虑溶栓，随后转运。',
                'NSTE-ACS：按危险分层选择紧急/早期/择期侵入策略；持续缺血、血流动力学不稳定、恶性心律失常或急性心衰属高风险，需尽快评估。',
                '抗栓：阿司匹林负荷后维持；P2Y12 抑制剂与抗凝药按指南和出血风险选择，避免自行停药或叠加。',
                '氧疗仅用于 SpO₂ <90%（或按本地目标）；硝酸酯在右室梗死、低血压或近期 PDE5 抑制剂时禁用；镇痛与镇静需评估血流动力学。',
                '出院后：高强度他汀、ACEI/ARB、β 受体阻滞剂、必要时 MRA/SGLT2i、戒烟与心脏康复；按医嘱复查血脂、肾功能和心功能。',
            ],
            'safety' => [
                '不要为了等化验结果而延误 STEMI 再灌注；心电图、症状和血流动力学优先。',
                '不常规吸氧、不常规使用 NSAIDs；低血压、右室梗死、心动过缓时慎用硝酸酯/β 阻滞剂。',
                '所有抗栓药物均有出血风险；近期出血、血小板减少、严重肝肾功能不全需由医生个体化评估。',
            ],
            'sources' => [
                '2023 ESC Guidelines for the management of acute coronary syndromes',
                '2020 ESC Guidelines for the management of acute coronary syndromes in patients presenting without persistent ST-segment elevation',
                '2021 AHA/ACC Chest Pain Guideline',
            ],
        ],
        'af' => [
            'title' => '房颤/房扑：指南化检查与处理流程（教学）',
            'markers' => [
                '12 导联心电图确认节律；阵发性症状可做动态心电图/事件记录；评估心室率、QRS 宽度与预激。',
                '血常规、电解质、肌酐/eGFR、肝功能、凝血功能/INR、甲状腺功能；必要时查心肌损伤标志物和利钠肽。',
                '超声心动图评估左房大小、LVEF、瓣膜病与心包情况；疑房扑时注意下壁导联 F 波与 V1 形态。',
                '卒中风险使用 CHA₂DS₂-VASc（或当地采用的 CHA₂DS₂-VA）；同时评估可纠正的出血危险因素。',
            ],
            'workflow' => [
                '血流动力学不稳定（休克、持续胸痛、急性心衰、意识改变）：立即同步电复律，按本地镇静/复苏流程执行。',
                '心率控制：无心衰或 LVEF 保留时可选用 β 受体阻滞剂或非二氢吡啶类钙拮抗剂；初始静息目标常为 <110 次/分，症状明显时个体化。',
                '节律控制：症状明显、年轻、首次发作或心衰患者可由专科评估复律、抗心律失常药或导管消融；房扑典型折返可评估消融。',
                '抗凝：符合条件者优先 DOAC（机械瓣/中重度二尖瓣狭窄除外）；不单凭出血评分决定是否停用抗凝，应先纠正可逆出血因素。',
                '排查诱因：感染、甲亢、电解质紊乱、饮酒、睡眠呼吸暂停、未控制高血压和心衰。',
            ],
            'safety' => [
                '预激合并房颤/房扑时禁用单纯房室结阻滞剂，可能加速旁路传导；需按预激流程处理。',
                '复律前抗凝策略取决于房颤持续时间、血栓风险和食道超声结果，必须由医生决定。',
                '不要把所有房颤都归因于“老化”；新发房颤应查诱因和结构性心脏病。',
            ],
            'sources' => [
                '2023 ACC/AHA/ACCP/HRS Atrial Fibrillation Guideline',
                '2024 ESC/EACTS Atrial Fibrillation Guideline',
            ],
        ],
        'acls' => [
            'title' => '心脏骤停/恶性心律失常：ACLS 检查与处理流程（教学）',
            'markers' => [
                '同时评估反应、呼吸、脉搏；持续心电监护、血压、SpO₂、ETCO₂；尽快建立 IV/IO 通路。',
                '可逆病因筛查（5H5T）：低氧、低血容量、酸中毒、高/低钾、低体温、张力性气胸、心脏压塞、毒物、血栓（冠脉/肺）。',
                '床旁血糖、血气/乳酸、钾/镁/钙、肌酐、血常规、心肌损伤标志物；复苏后 12 导联心电图与床旁超声。',
            ],
            'workflow' => [
                'VF/无脉性 VT：立即高质量 CPR 并尽早除颤；除颤后继续 CPR，按本地 ACLS 流程使用肾上腺素，难治性 VF/pVT 可考虑胺碘酮或利多卡因。',
                'PEA/心搏停止：高质量 CPR，不做除颤；尽快使用肾上腺素并寻找可逆病因。',
                '尖端扭转型室速：纠正低钾/低镁，停用延长 QT 药物；按专科流程考虑硫酸镁、超速起搏或异丙肾上腺素。',
                'ROSC 后：气道与氧合、血流动力学支持、目标温度管理、12 导联心电图；STEMI 或高度怀疑冠脉闭塞时评估紧急冠脉造影。',
            ],
            'safety' => [
                '胸外按压中断时间越短越好；除颤前确认人员离开患者与病床。',
                '不要常规使用高剂量肾上腺素、钙剂或碳酸氢钠；均由病因和医生判断决定。',
                '所有药物剂量、除颤能量和气道操作必须遵循所在机构 ACLS 流程与医生指挥。',
            ],
            'sources' => [
                '2020 AHA Guidelines for CPR and Emergency Cardiovascular Care',
                '2023 AHA Focused Update on Adult Advanced Cardiovascular Life Support',
                '2025 AHA Guidelines for CPR and Emergency Cardiovascular Care (adult ALS update)',
            ],
        ],
        'hyperkalemia' => [
            'title' => '高钾血症：指南化检查与紧急处理（教学）',
            'markers' => [
                '立即 12 导联心电图并连续心电监护；观察高尖 T 波、P 波变小、PR 延长、QRS 增宽和正弦波。',
                '复查血钾（排除溶血/采血误差）、肌酐/eGFR、血糖、血气、血常规、CK；必要时查洋地黄浓度和酸碱状态。',
                '评估少尿/无尿、透析通路、保钾药物（ACEI/ARB、螺内酯、NSAIDs）和钾补充剂。',
            ],
            'workflow' => [
                '有心电图改变或严重高钾：优先静脉钙剂稳定心肌（10% 葡萄糖酸钙 30 mL 缓慢静注或按本地规范；氯化钙 10% 10 mL 仅用于复苏/中心静脉），并监测。',
                '促进钾进入细胞：胰岛素+葡萄糖是核心方案；可联合雾化沙丁胺醇；监测血糖至少数小时，防止迟发低血糖。',
                '促进钾排出：利尿剂（有尿量者）、钾结合剂；严重或肾功能衰竭者尽快评估血液透析。',
                '同时停用保钾药物、限制钾摄入，并治疗酸中毒、组织坏死、横纹肌溶解等诱因。',
            ],
            'safety' => [
                '钙剂只稳定心肌，不降低血钾；不能因为给了钙剂就停止降钾。',
                '胰岛素/葡萄糖可导致严重低血糖，需按血糖监测方案执行；肾功能不全者调整剂量。',
                '严重高钾的最终处理必须由急诊/肾内科/重症团队共同决策。',
            ],
            'sources' => [
                '2023 UK Kidney Association Clinical Practice Guideline: Treatment of Acute Hyperkalaemia in Adults',
                '2021/2023 acute hyperkalaemia management expert consensus',
            ],
        ],
        'pe' => [
            'title' => '急性肺栓塞：指南化检查与风险分层（教学）',
            'markers' => [
                '12 导联心电图（窦速、S1Q3T3、右心负荷）、血压/心率/SpO₂、血气；D-二聚体按临床可能性和年龄校正阈值解读。',
                '高敏肌钙蛋白和 BNP/NT-proBNP 用于风险分层；肌酐/eGFR、肝功能、血常规、凝血功能。',
                'CTPA 是首选确诊影像；血流动力学不稳定时床旁超声可先看右室扩大/功能不全。',
                '下肢静脉超声用于寻找 DVT；超声心动图评估 RV/LV 比、McConnell 征、肺动脉压和右心血栓。',
            ],
            'workflow' => [
                '高危（休克/持续低血压）：立即抗凝并启动再灌注评估（溶栓或导管/外科取栓），同时寻找禁忌证。',
                '非高危：按临床可能性选择 D-二聚体或 CTPA；确认后按风险分层选择 DOAC/低分子肝素等抗凝。',
                '中高危：密切监护右心功能与肌钙蛋白，评估是否恶化及补救再灌注。',
                '寻找诱因：近期手术/制动、肿瘤、妊娠、口服避孕药、遗传性易栓症。',
            ],
            'safety' => [
                '临床高度可能 PE 时，D-二聚体阴性不能排除，需直接影像评估。',
                '抗凝前评估出血风险、肾功能和妊娠状态；溶栓必须由有经验的团队按指南执行。',
                'S1Q3T3 特异性有限，不能单独诊断或排除 PE。',
            ],
            'sources' => [
                '2019 ESC Guidelines for the diagnosis and management of acute pulmonary embolism',

            ],
        ],
        'brady' => [
            'title' => '心动过缓/房室阻滞：指南化检查与处理（教学）',
            'markers' => [
                '12 导联心电图 + 长节律条，判断 P-QRS 关系、阻滞部位和逸搏频率；持续心电监护。',
                '血钾、肌酐/eGFR、血糖、血气、甲状腺功能；疑药物相关时查地高辛/β 阻滞剂/钙拮抗剂史。',
                '心肌损伤标志物排除缺血；超声心动图评估结构和心功能。',
            ],
            'workflow' => [
                '有症状或不稳定（低血压、意识改变、胸痛、急性心衰、休克）：按 ACLS 流程给阿托品，准备经皮起搏；必要时肾上腺素/多巴胺泵入。',
                '寻找并纠正可逆病因：高钾、药物、缺血、低氧、低体温、甲状腺功能减退。',
                '高度房室阻滞、莫氏 II 型、晕厥或进行性阻滞：请心内科评估临时/永久起搏。',
                '无症状且稳定者：监测、复查心电图、避免加重传导阻滞的药物。',
            ],
            'safety' => [
                '阿托品对希氏束以下阻滞可能无效，不能因此延误起搏。',
                '起搏前确认夺获（起搏钉后 QRS），并持续评估血压和灌注。',
                '所有药物与起搏参数必须按本地流程和医生指令执行。',
            ],
            'sources' => [
                '2020 AHA ACLS Guidelines',
                '2021 ESC Cardiac Pacing Guideline',
            ],
        ],
        'long-qt' => [
            'title' => 'QT 延长：指南化检查与处理（教学）',
            'markers' => [
                '测量 QT 并计算 QTc（注意心率、性别与导联）；评估 T 波形态、U 波和有无尖端扭转型室速。',
                '血钾、镁、钙、肌酐/eGFR、血糖、甲状腺功能；评估药物清单（抗心律失常药、抗生素、抗精神病药、止吐药等）。',
                '晕厥/家族史/先天性耳聋提示遗传性长 QT；必要时做基因检测与家系筛查。',
            ],
            'workflow' => [
                '停用或替换明确延长 QT 的药物；纠正低钾、低镁、低钙和心动过缓。',
                '尖端扭转型室速：按 ACLS/专科流程使用硫酸镁、纠正电解质、考虑超速起搏或异丙肾上腺素。',
                '先天性长 QT：β 受体阻滞剂为基础治疗；高危患者由专科评估 ICD。',
                '获得性长 QT：治疗诱因，复查心电图并监测 QTc。',
            ],
            'safety' => [
                'QTc 的自动读数可能误差，必须人工复核；心动过速/心动过缓时使用合适公式。',
                '不要自行停用抗癫痫/抗精神病等必需药物，应由医生权衡。',
                '晕厥伴 QTc 延长必须认真评估，不能仅归因于“体位性”。',
            ],
            'sources' => [
                '2022 ESC Guidelines for the management of patients with ventricular arrhythmias and the prevention of sudden cardiac death',
                '2020 AHA ACLS Guidelines (Torsades de Pointes)',
            ],
        ],
        'wpw' => [
            'title' => '预激综合征（WPW）：指南化检查与处理（教学）',
            'markers' => [
                '12 导联心电图：短 PR、delta 波、QRS 增宽；记录发作时心电图判断是否为预激合并房颤。',
                '动态心电图/事件记录捕捉阵发性心动过速；超声心动图排除结构性心脏病。',
                '电生理检查评估旁路前传不应期和风险；高危职业或运动人群需专科评估。',
            ],
            'workflow' => [
                '稳定窄 QRS 折返性心动过速：按 SVT 流程处理（迷走刺激/腺苷等），需在监护下进行。',
                '预激合并房颤/房扑：避免单纯房室结阻滞剂；不稳定时同步复律，稳定时按专科流程使用普罗帕酮/伊布利特等。',
                '反复症状性心动过速：导管消融是根治性选择；无症状低危患者可观察。',
                '避免诱发因素并复查心电图。',
            ],
            'safety' => [
                '预激合并房颤时使用地高辛、维拉帕米、地尔硫卓或 β 阻滞剂可能导致旁路快速下传，必须避免自行使用。',
                '所有抗心律失常药物和复律决策由心内科/急诊医生执行。',
            ],
            'sources' => [
                '2019 ESC Guidelines for the management of patients with supraventricular tachycardia',
                '2023 ACC/AHA/ACCP/HRS Atrial Fibrillation Guideline (pre-excited AF)',
            ],
        ],
        'brugada' => [
            'title' => 'Brugada 综合征：指南化检查与处理（教学）',
            'markers' => [
                '12 导联心电图：V1–V2 穹隆型 ST 抬高 ≥2 mm 或 2/3 型；高肋间导联可提高检出率。',
                '发热、电解质、药物史；排除缺血、右室病变和电解质紊乱。',
                '家族史与基因检测（SCN5A 等）；电生理检查用于高危评估。',
            ],
            'workflow' => [
                '发热时积极降温，避免诱发药物（部分抗心律失常药、抗抑郁药、可卡因等）。',
                '晕厥、心脏骤停或自发 1 型心电图的高危患者：专科评估 ICD。',
                '无症状患者：避免诱因、定期随访；是否电生理检查个体化。',
            ],
            'safety' => [
                'Brugada 心电图可间歇出现，单次正常不能排除；需结合病史和诱因。',
                '不要自行使用未核实的“抗心律失常药”；所有决策由专科医生完成。',
            ],
            'sources' => [
                '2022 ESC Guidelines for the management of patients with ventricular arrhythmias and the prevention of sudden cardiac death',
                'Brugada Syndrome Expert Consensus (HRS/EHRA/APHRS)',
            ],
        ],
        'pericarditis' => [
            'title' => '急性心包炎：指南化检查与处理（教学）',
            'markers' => [
                '12 导联心电图：弥漫性 ST 抬高、PR 段压低；动态观察排除心肌梗死。',
                '高敏肌钙蛋白（可轻度升高）、CRP/ESR、血常规、肾功能；疑感染时血培养。',
                '超声心动图评估心包积液、心脏压塞和心室功能；胸片/CT 用于鉴别。',
            ],
            'workflow' => [
                '首先排除 STEMI/主动脉夹层等致命病因；不要因“年轻、ECG 抬高”而漏诊。',
                '特发性/病毒性心包炎：NSAID/阿司匹林联合秋水仙碱是常用方案，需评估出血和肾功能。',
                '高危特征（发热、亚急性起病、大量积液、免疫抑制、抗凝、心肌受累）：住院评估并寻找病因。',
                '心脏压塞：紧急心包穿刺引流，由有经验的团队执行。',
            ],
            'safety' => [
                '心包炎与 STEMI 的治疗方向不同，必须结合肌钙蛋白、冠脉风险和超声。',
                '抗凝/抗血小板治疗可能增加心包出血风险，需由医生权衡。',
                '所有药物剂量与穿刺决策遵循本地流程和医生指令。',
            ],
            'sources' => [
                '2015 ESC Guidelines for the diagnosis and management of pericardial diseases',
            ],
        ],
    ],
    'map' => [
        'stemi-anterior' => 'acs',
        'stemi-inferior' => 'acs',
        'stemi-posterior' => 'acs',
        'stemi-rv' => 'acs',
        'ischemia-st' => 'acs',
        'afib' => 'af',
        'atrial-flutter' => 'af',
        'vt' => 'acls',
        'vf' => 'acls',
        'torsades' => 'acls',
        'hyperkalemia' => 'hyperkalemia',
        'pulmonary-embolism' => 'pe',
        'sinus-brady' => 'brady',
        'av-block-1' => 'brady',
        'av-block-2a' => 'brady',
        'av-block-2b' => 'brady',
        'av-block-3' => 'brady',
        'junctional-rhythm' => 'brady',
        'ventricular-escape' => 'brady',
        'long-qt' => 'long-qt',
        'wpw' => 'wpw',
        'brugada' => 'brugada',
        'pericarditis' => 'pericarditis',
    ],
];
