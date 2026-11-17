<?php
declare(strict_types=1);

namespace App;

final class EcgDiagnoses
{
    // 从一张 ECG 的独立异常推导所有可同时成立的诊断；基础题目仍是主诊断，附加异常作为多选。
    public static function derive(array $spec, array $baseIds, array $all): array
    {
        $ids = array_values(array_unique(array_filter(array_map('strval', $baseIds), static fn (string $id): bool => isset($all[$id]))));
        $add = static function (string $id) use (&$ids, $all): void {
            if (isset($all[$id]) && !in_array($id, $ids, true)) $ids[] = $id;
        };
        $rhythm = (string) ($spec['rhythm'] ?? 'sinus');
        $pAbsent = in_array($rhythm, ['af', 'flutter', 'vf', 'vflutter', 'torsades'], true)
            || in_array((string) ($spec['p'] ?? ''), ['absent', 'hidden', 'sawtooth'], true);
        $pr = (float) ($spec['pr'] ?? 0);
        $qrs = (float) ($spec['qrs'] ?? 0);
        $morph = (string) ($spec['morphology'] ?? 'normal');
        $pRaw = (string) ($spec['p'] ?? 'normal');
        $pReliable = !in_array($pRaw, ['absent', 'hidden', 'sawtooth', 'flattened'], true);
        $av = is_array($spec['avBlock'] ?? null) ? $spec['avBlock'] : [];
        $degree = (string) ($av['degree'] ?? '');

        // 房室传导：二度/三度优先，不再额外添加一度。
        if (in_array($degree, ['2a', '2b', '3'], true)) {
            $add('av-block-' . $degree);
        } elseif (!$pAbsent && $pReliable && $morph !== 'hyperk' && $pr > 0.20) {
            $add('av-block-1');
        }

        // 束支/分支/预激/离子通道/心肌病：只在非起搏心律下由形态推导。
        if ($rhythm !== 'paced') {
            if ($qrs >= 0.12 && $morph === 'rbbb') $add('rbbb');
            if ($qrs >= 0.12 && $morph === 'lbbb') $add('lbbb');
            if ($morph === 'lafb') $add('lafb');
            if ($morph === 'wpw') $add('wpw');
            if ($morph === 'brugada') $add('brugada');
            if ($morph === 'hyperk') $add('hyperkalemia');
            if ($morph === 'lvh') $add('lvh');
        }
        return $ids;
    }

    public static function questionForMulti(string $question): string
    {
        $default = '该心电图最可能的诊断是？';
        return $question === $default ? '该心电图包含哪些诊断？（多选）' : $question;
    }
}
