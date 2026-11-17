<?php
declare(strict_types=1);

namespace App;

final class EcgFeatures
{
    private const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
    private const MORPHOLOGY = [
        'normal' => '正常/以 R 波为主',
        'rbbb' => 'RBBB 型（V1 rsR′，I/V6 宽 S）',
        'lbbb' => 'LBBB 型（V1 QS/rS，V5/V6 宽钝 R）',
        'lafb' => '左前分支阻滞型（I/aVL qR，下壁 rS）',
        'lpfb' => '左后分支阻滞型（I/aVL rS，下壁 qR）',
        'wpw' => 'WPW/预激（短 PR + δ 波）',
        'brugada' => 'Brugada 型（V1–V2 穹隆型 ST）',
        'hyperk' => '高钾型（T 波高尖，QRS 可增宽）',
        'lvh' => 'LVH 型（V1 深 S、V5/V6 高 R）',
        'wide' => '宽大畸形 QRS',
        'pvc' => '室性早搏型（宽大畸形、T 反向）',
        'paced' => '起搏心律（起搏钉后 QRS）',
    ];

    public static function fromSpec(array $spec): array
    {
        $rhythm = (string) ($spec['rhythm'] ?? 'sinus');
        $pRaw = (string) ($spec['p'] ?? 'normal');
        $pAbsent = in_array($rhythm, ['af', 'flutter', 'vf', 'vflutter', 'torsades'], true)
            || in_array($pRaw, ['absent', 'hidden', 'sawtooth'], true);
        $pSinus = $rhythm === 'sinus' && !$pAbsent && $pRaw === 'normal';
        $av = is_array($spec['avBlock'] ?? null) ? $spec['avBlock'] : [];
        $degree = (string) ($av['degree'] ?? '');
        $avText = $degree === '1' ? '一度（PR 延长，P 均下传）'
            : ($degree === '2a' ? '二度 I 型（PR 渐长后脱漏）'
                : ($degree === '2b' ? '二度 II 型（PR 恒定、突然脱漏）'
                    : ($degree === '3' ? '三度（P 与 QRS 分离）' : '无明确房室阻滞')));
        $irregular = (float) ($spec['irregularity'] ?? 0);
        $ectopy = is_array($spec['ectopy'] ?? null) ? $spec['ectopy'] : null;
        $rr = $rhythm === 'af' ? '不规则'
            : ($ectopy !== null ? '被提前搏动打断'
                : ($irregular > 0.06 ? '不完全规则' : '基本规则'));
        $pp = $rhythm === 'af' ? '不规则'
            : ($rhythm === 'flutter' ? '按固定/可变比例（需数 F 波）'
                : ($irregular > 0.06 || $ectopy !== null ? '不完全规则' : '基本规则'));
        $qrs = (float) ($spec['qrs'] ?? 0);
        $axis = (string) ($spec['axis'] ?? 'normal');
        $axisText = $axis === 'left' ? '电轴左偏' : ($axis === 'right' ? '电轴右偏' : ($axis === 'extreme' ? '极度右偏' : '正常电轴'));
        $morph = (string) ($spec['morphology'] ?? 'normal');
        $st = is_array($spec['st'] ?? null) ? $spec['st'] : [];
        $tv = is_array($spec['t'] ?? null) ? $spec['t'] : [];
        $stElev = self::leadValues($st['elevation'] ?? []);
        $stDep = self::leadValues($st['depression'] ?? []);
        $tShape = (string) ($tv['shape'] ?? 'normal');
        $tText = $tShape === 'normal' ? 'T 波形态未见明确异常' : $tShape;
        $leadNotes = [];
        foreach (self::LEADS as $lead) {
            $parts = [];
            $override = is_array($spec['leads'] ?? null) && is_array($spec['leads'][$lead] ?? null) ? $spec['leads'][$lead] : [];
            if ($override !== []) {
                foreach (['q', 'r', 's', 't'] as $key) {
                    if (array_key_exists($key, $override)) $parts[] = $key . '=' . $override[$key];
                }
            }
            if (in_array($lead, $stElev, true)) $parts[] = 'ST 抬高';
            if (in_array($lead, $stDep, true)) $parts[] = 'ST 压低';
            if ($parts !== []) $leadNotes[$lead] = implode('，', $parts);
        }
        return [
            'rhythm' => $rhythm,
            'rate' => $spec['rate'] ?? null,
            'atrialRate' => $spec['atrialRate'] ?? null,
            'p' => $pAbsent ? '消失/被 f-F 波取代' : ($pSinus ? '存在，窦性' : '存在，非典型窦性'),
            'pAbsent' => $pAbsent,
            'pSinus' => $pSinus,
            'pr' => $spec['pr'] ?? null,
            'pp' => $pp,
            'qrs' => $qrs,
            'qrsWide' => $qrs >= 0.12,
            'morphology' => self::MORPHOLOGY[$morph] ?? $morph,
            'rr' => $rr,
            'axis' => $axisText,
            'qt' => $spec['qt'] ?? null,
            'stElevation' => $stElev,
            'stDepression' => $stDep,
            't' => $tText,
            'u' => (float) ($spec['u'] ?? 0),
            'avBlock' => $avText,
            'ectopy' => $ectopy,
            'primaryLead' => $spec['primaryLead'] ?? 'II',
            'show12Lead' => (bool) ($spec['show12Lead'] ?? false),
            'description' => (string) ($spec['description'] ?? ''),
            'leadNotes' => $leadNotes,
        ];
    }

    public static function text(array $f): string
    {
        $leads = [];
        foreach ((array) ($f['leadNotes'] ?? []) as $lead => $note) $leads[] = $lead . '：' . $note;
        return implode("\n", [
            '节律：' . ($f['rhythm'] ?? '—') . '；心率：' . ($f['rate'] ?? '—') . ' 次/分；心房率：' . ($f['atrialRate'] ?? '—') . ' 次/分。',
            'P 波：' . ($f['p'] ?? '—') . '；PP：' . ($f['pp'] ?? '—') . '；PR：' . ($f['pr'] ?? '—') . ' s。',
            'QRS：' . ($f['qrs'] ?? '—') . ' s（' . (($f['qrsWide'] ?? false) ? '宽 QRS' : '窄 QRS') . '）；形态：' . ($f['morphology'] ?? '—') . '；电轴：' . ($f['axis'] ?? '—') . '；RR：' . ($f['rr'] ?? '—') . '。',
            'QT：' . ($f['qt'] ?? '—') . ' s；ST 抬高：' . (($f['stElevation'] ?? []) ? implode('、', $f['stElevation']) : '无') . '；ST 压低：' . (($f['stDepression'] ?? []) ? implode('、', $f['stDepression']) : '无') . '。',
            'T 波：' . ($f['t'] ?? '—') . '；U 波：' . ($f['u'] ?? 0) . '；房室关系：' . ($f['avBlock'] ?? '—') . '。',
            '默认导联：' . ($f['primaryLead'] ?? 'II') . '；12 导联：' . (($f['show12Lead'] ?? false) ? '是' : '否') . '。',
            $leads !== [] ? '逐导联备注：' . implode('；', $leads) . '。' : '逐导联备注：无额外导联覆盖，按基础形态与 ST 摘要判读。',
            '题库描述：' . ($f['description'] ?? '—'),
        ]);
    }

    private static function leadValues(mixed $value): array
    {
        if (is_array($value)) {
            if (array_is_list($value)) return array_values(array_filter(array_map('strval', $value)));
            $out = [];
            foreach ($value as $lead => $amount) if ((float) $amount !== 0.0) $out[] = (string) $lead;
            return $out;
        }
        return [];
    }
}
