/*
 * 心迹 ECG Lab — 教学用心电图波形合成引擎
 * 输入为诊断数据中的 ecg 规格（JSON），输出 500 Hz 采样序列。
 * 波形为形态学近似，用于教学，不用于临床诊断。
 */

export const LEAD_NAMES = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

const BASE_PROFILE = {
  I: { p: 0.08, q: -0.04, r: 0.85, s: -0.10, t: 0.22 },
  II: { p: 0.145, q: -0.06, r: 1.15, s: -0.16, t: 0.32 },
  III: { p: 0.05, q: 0.00, r: 0.45, s: -0.08, t: 0.10 },
  aVR: { p: -0.08, q: 0.02, r: -0.85, s: 0.04, t: -0.24 },
  aVL: { p: 0.04, q: -0.03, r: 0.55, s: -0.08, t: 0.14 },
  aVF: { p: 0.115, q: -0.03, r: 1.00, s: -0.12, t: 0.28 },
  V1: { p: 0.065, q: 0.00, r: 0.18, s: -1.25, t: 0.16 },
  V2: { p: 0.07, q: 0.00, r: 0.32, s: -1.70, t: 0.38 },
  V3: { p: 0.08, q: 0.00, r: 0.85, s: -1.00, t: 0.45 },
  V4: { p: 0.10, q: -0.02, r: 1.45, s: -0.35, t: 0.50 },
  V5: { p: 0.10, q: -0.04, r: 1.50, s: -0.18, t: 0.42 },
  V6: { p: 0.08, q: -0.04, r: 1.15, s: -0.10, t: 0.32 },
};

const LIMB_LEADS = new Set(['I', 'II', 'III', 'aVR', 'aVL', 'aVF']);
const CHEST_LEADS = new Set(['V1', 'V2', 'V3', 'V4', 'V5', 'V6']);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeSpec(spec = {}) {
  const s = {
    rhythm: String(spec.rhythm || 'sinus'),
    rate: clamp(num(spec.rate, 72), 0, 320),
    atrialRate: clamp(num(spec.atrialRate, spec.rate || 72), 0, 400),
    irregularity: clamp(num(spec.irregularity, 0), 0, 0.45),
    p: String(spec.p || 'normal'),
    pr: clamp(num(spec.pr, 0.16), 0, 0.6),
    qrs: clamp(num(spec.qrs, 0.08), 0.04, 0.24),
    morphology: String(spec.morphology || 'normal'),
    axis: String(spec.axis || 'normal'),
    st: {
      elevation: Object.assign({}, spec.st?.elevation || {}),
      depression: Object.assign({}, spec.st?.depression || {}),
      shape: String(spec.st?.shape || 'normal'),
    },
    t: {
      shape: String(spec.t?.shape || 'normal'),
      amp: clamp(num(spec.t?.amp, 1), 0, 4),
    },
    u: clamp(num(spec.u, 0), -0.5, 0.8),
    qt: clamp(num(spec.qt, 0.4), 0.2, 0.75),
    ectopy: spec.ectopy || null,
    avBlock: spec.avBlock || null,
    pause: spec.pause || null,
    extras: Array.isArray(spec.extras) ? spec.extras.map(String) : [],
    leads: spec.leads && typeof spec.leads === 'object' ? spec.leads : {},
    annotations: Array.isArray(spec.annotations) ? spec.annotations : [],
    duration: clamp(num(spec.duration, 8), 3, 12),
    seed: Math.abs(Math.trunc(num(spec.seed, 11))) || 11,
    description: String(spec.description || ''),
    show12Lead: Boolean(spec.show12Lead),
    primaryLead: String(spec.primaryLead || (spec.morphology === 'brugada' ? 'V1' : 'II')),
    sineWave: Boolean(spec.sineWave),
    conduction: String(spec.conduction || ''),
  };
  if (s.rhythm === 'sinus' && s.rate === 0) s.rate = 72;
  if (!s.rate && !['vf', 'vflutter', 'torsades', 'asystole'].includes(s.rhythm)) {
    s.rate = 72;
  }
  if (!s.atrialRate) s.atrialRate = s.rate;
  return s;
}

function makeBeat(t, pTime, pr, qrsWidth, opts = {}) {
  return {
    t,
    pTime,
    pr,
    qrsWidth,
    type: opts.type || 'sinus',
    pMorph: opts.pMorph || 'normal',
    retrogradeP: Boolean(opts.retrogradeP),
    ectopic: Boolean(opts.ectopic),
    tDiscordant: Boolean(opts.tDiscordant),
    ampScale: opts.ampScale ?? 1,
  };
}

function buildSchedule(spec) {
  const s = normalizeSpec(spec);
  const rng = mulberry32(s.seed);
  const beats = [];
  const pWaves = [];
  const extras = new Set(s.extras);
  const rhythm = s.rhythm;
  const duration = s.duration;
  const special = ['vf', 'vflutter', 'torsades', 'asystole'].includes(rhythm) ? rhythm : null;
  if (special) {
    return { spec: s, beats, pWaves, special, rng };
  }

  const start = 0.58;
  const rr = s.rate > 0 ? 60 / s.rate : 1;
  const atrialRR = s.atrialRate > 0 ? 60 / s.atrialRate : rr;

  if (rhythm === 'af') {
    let t = start;
    while (t < duration - 0.12) {
      const jitter = 0.68 + rng() * 0.64;
      beats.push(makeBeat(t, null, 0, s.qrs, { type: 'af' }));
      t += rr * jitter;
    }
    return { spec: s, beats, pWaves, special, rng };
  }

  if (rhythm === 'flutter') {
    const ratio = s.conduction === '2:1' ? 2 : clamp(Math.round((s.atrialRate || 300) / Math.max(1, s.rate || 150)), 1, 8);
    const qrsRR = atrialRR * ratio;
    let t = start + atrialRR * 0.6;
    while (t < duration - 0.1) {
      beats.push(makeBeat(t, null, 0, s.qrs, { type: 'flutter' }));
      t += qrsRR;
    }
    return { spec: s, beats, pWaves, special, rng };
  }

  if (rhythm === 'vt') {
    let t = start;
    while (t < duration - 0.1) {
      beats.push(makeBeat(t, null, 0, Math.max(0.13, s.qrs), { type: 'vt', tDiscordant: true }));
      t += rr;
    }
    const pRate = s.atrialRate && s.atrialRate > 30 ? s.atrialRate : 75;
    let p = start + 0.2;
    while (p < duration) {
      pWaves.push({ t: p, ampScale: 0.35, morph: 'normal' });
      p += 60 / pRate;
    }
    return { spec: s, beats, pWaves, special, rng };
  }

  if (rhythm === 'svt') {
    let t = start;
    while (t < duration - 0.1) {
      beats.push(makeBeat(t, null, 0, s.qrs, { type: 'svt' }));
      t += rr;
    }
    return { spec: s, beats, pWaves, special, rng };
  }

  if (rhythm === 'junctional') {
    let t = start;
    while (t < duration - 0.1) {
      beats.push(makeBeat(t, null, 0, s.qrs, { type: 'junctional', retrogradeP: true }));
      t += rr;
    }
    return { spec: s, beats, pWaves, special, rng };
  }

  if (rhythm === 'ventricular_escape') {
    let t = start;
    while (t < duration - 0.1) {
      beats.push(makeBeat(t, null, 0, Math.max(0.14, s.qrs), { type: 'escape', tDiscordant: true }));
      t += rr;
    }
    return { spec: s, beats, pWaves, special, rng };
  }

  if (rhythm === 'aivr') {
    let t = start;
    while (t < duration - 0.1) {
      beats.push(makeBeat(t, null, 0, Math.max(0.12, s.qrs), { type: 'aivr', tDiscordant: true }));
      t += rr;
    }
    const pRate = s.atrialRate && s.atrialRate > 30 ? s.atrialRate : 75;
    let p = start + 0.12;
    while (p < duration) {
      pWaves.push({ t: p, ampScale: 0.3, morph: 'normal' });
      p += 60 / pRate;
    }
    return { spec: s, beats, pWaves, special, rng };
  }

  const block = s.avBlock;
  if (block && ['2a', '2b', '3'].includes(String(block.degree))) {
    if (String(block.degree) === '3') {
      let p = start;
      while (p < duration) {
        pWaves.push({ t: p, ampScale: 0.95, morph: 'normal' });
        p += atrialRR;
      }
      let t = start + 0.22;
      while (t < duration - 0.08) {
        beats.push(makeBeat(t, null, 0, Math.max(0.12, s.qrs), { type: 'block', tDiscordant: s.qrs >= 0.12 }));
        t += rr;
      }
      return { spec: s, beats, pWaves, special, rng };
    }
    const ratio = clamp(Math.round(num(block.ratio, 3)), 2, 8);
    let p = start;
    let index = 0;
    while (p < duration) {
      pWaves.push({ t: p, ampScale: 0.95, morph: 'normal' });
      const inCycle = index % ratio;
      const dropped = inCycle === ratio - 1;
      if (!dropped) {
        const pr = String(block.degree) === '2a'
          ? s.pr + inCycle * 0.085
          : s.pr;
        const qrsAt = p + pr;
        if (qrsAt < duration - 0.05) {
          beats.push(makeBeat(qrsAt, null, pr, s.qrs, { type: 'block' }));
        }
      }
      p += atrialRR;
      index += 1;
    }
    return { spec: s, beats, pWaves, special, rng };
  }

  // 窦性/房速/带早搏等：先生成基础搏动。
  let t = start;
  let beatIndex = 0;
  const baseType = rhythm === 'atrial_tach' ? 'atrial' : 'sinus';
  while (t < duration - 0.05) {
    let interval = rr;
    if (s.irregularity > 0.001) {
      interval *= 1 + s.irregularity * 0.55 * Math.sin(2 * Math.PI * 0.23 * t + 0.9);
    }
    const pMorph = baseType === 'atrial' ? 'prime' : 'normal';
    const pTime = (s.p === 'absent' || s.p === 'hidden' || s.p === 'sawtooth') ? null : t - s.pr;
    beats.push(makeBeat(t, pTime, s.pr, s.qrs, { type: baseType, pMorph }));
    t += interval;
    beatIndex += 1;
    if (beatIndex > 80) break;
  }

  if (s.pause && Number.isFinite(Number(s.pause.after))) {
    const from = Number(s.pause.after);
    const to = from + Math.max(0.5, num(s.pause.duration, 2.2));
    for (let i = beats.length - 1; i >= 0; i -= 1) {
      const beat = beats[i];
      const inPause = (beat.t >= from - 0.04 && beat.t <= to)
        || (beat.pTime != null && beat.pTime >= from - 0.04 && beat.pTime <= to);
      if (inPause) beats.splice(i, 1);
    }
  }

  if (s.ectopy) {
    const pattern = String(s.ectopy.pattern || 'isolated');
    const coupling = clamp(num(s.ectopy.coupling, 0.55), 0.25, 0.85);
    const type = String(s.ectopy.type || 'pvc');
    if (pattern === 'bigeminy' && type === 'pvc') {
      beats.length = 0;
      let n = start;
      while (n < duration - 0.2) {
        beats.push(makeBeat(n, n - s.pr, s.pr, s.qrs, { type: 'sinus' }));
        const pvcAt = n + coupling * rr;
        if (pvcAt < duration - 0.12) {
          beats.push(makeBeat(pvcAt, null, 0, Math.max(0.15, s.qrs), { type: 'pvc', ectopic: true, tDiscordant: true }));
        }
        n += 2 * rr;
      }
      return { spec: s, beats, pWaves, special, rng };
    }
    const targetIndex = beats.findIndex((b) => b.t > start + rr * 0.8);
    if (targetIndex >= 0) {
      const base = beats[targetIndex];
      const at = base.t + coupling * rr;
      beats.splice(targetIndex + 1, 1);
      if (type === 'pvc') {
        beats.push(makeBeat(at, null, 0, Math.max(0.15, s.qrs), { type: 'pvc', ectopic: true, tDiscordant: true }));
      } else if (type === 'pjc') {
        beats.push(makeBeat(at, null, 0, s.qrs, { type: 'pjc', retrogradeP: true }));
      } else {
        beats.push(makeBeat(at, at - 0.14, 0.14, s.qrs, { type: 'pac', pMorph: 'prime' }));
        for (let i = targetIndex + 1; i < beats.length; i += 1) {
          if (beats[i].type === 'sinus') beats[i].t -= 0.35 * rr;
        }
      }
      beats.sort((a, b) => a.t - b.t);
    }
  }

  return { spec: s, beats, pWaves, special, rng };
}

function profileFor(spec, lead) {
  const base = Object.assign({ st: 0 }, BASE_PROFILE[lead] || BASE_PROFILE.II);
  const overrides = spec.leads && spec.leads[lead] ? spec.leads[lead] : {};
  const prof = Object.assign({}, base, overrides);
  prof.tSigma = 0.052;
  prof.qrsScale = 1;
  prof.tSign = 1;
  prof.pScale = 1;
  prof.delta = false;
  prof.rPrime = 0;
  prof.rPrimeDelay = 0;
  prof.sWide = false;
  prof.stOverride = null;

  if (overrides.st !== undefined) prof.stOverride = Number(overrides.st);

  const m = spec.morphology;
  if (m === 'rbbb') {
    prof.qrsScale = 1.55;
    if (lead === 'V1' || lead === 'V2') {
      prof.q = 0;
      prof.r = 0.35;
      prof.s = -0.65;
      prof.rPrime = 0.9;
      prof.rPrimeDelay = 0.045;
      prof.t = -Math.abs(prof.t || 0.2);
    }
    if (lead === 'I' || lead === 'aVL' || lead === 'V5' || lead === 'V6') {
      prof.s = -0.38;
      prof.sWide = true;
    }
  } else if (m === 'lbbb') {
    prof.qrsScale = 1.75;
    if (lead === 'V1' || lead === 'V2') {
      prof.q = 0;
      prof.r = 0.1;
      prof.s = -1.45;
      prof.t = 0.28;
    }
    if (lead === 'I' || lead === 'aVL' || lead === 'V5' || lead === 'V6') {
      prof.q = 0;
      prof.r = Math.abs(prof.r) * 1.25;
      prof.s = -0.06;
      prof.t = -Math.abs(prof.t || 0.3) * 0.75;
    }
  } else if (m === 'lafb') {
    if (lead === 'I' || lead === 'aVL') {
      prof.q = -0.12;
      prof.r = Math.abs(prof.r) * 1.05;
      prof.s = -0.04;
    }
    if (lead === 'II' || lead === 'III' || lead === 'aVF') {
      prof.q = 0;
      prof.r = 0.18;
      prof.s = -0.95;
      prof.t = Math.abs(prof.t || 0.2) * 0.5;
    }
  } else if (m === 'lvh') {
    if (lead === 'V1' || lead === 'V2') prof.s = -Math.abs(prof.s) * 1.5;
    if (lead === 'V5' || lead === 'V6') prof.r = Math.abs(prof.r) * 1.55;
    if (lead === 'I' || lead === 'aVL') prof.r = Math.abs(prof.r) * 1.15;
    if (['I', 'aVL', 'V5', 'V6'].includes(lead)) {
      prof.st = -0.1;
      if (spec.t.shape === 'inverted' || spec.t.shape === 'strain') prof.t = -Math.abs(prof.t || 0.35) * 0.85;
    }
  } else if (m === 'wpw') {
    prof.qrsScale = 1.45;
    prof.delta = true;
    if (spec.leads?.[lead]?.t === undefined) prof.t = (prof.t >= 0 ? 1 : -1) * Math.abs(prof.t) * 0.9;
  } else if (m === 'brugada') {
    if (lead === 'V1' || lead === 'V2') {
      prof.r = 0.18;
      prof.s = -0.55;
      prof.stOverride = spec.st.elevation?.[lead] ?? 2.4;
      prof.t = -0.32;
      prof.qrsScale = 1.2;
    }
  } else if (m === 'hyperk') {
    prof.pScale = 0.28;
    prof.qrsScale = 1.45;
    prof.tSigma = 0.035;
    prof.tSign = 1;
    if (lead === 'V2' || lead === 'V3' || lead === 'V4') {
      prof.t = Math.abs(prof.t || 0.45) * 1.15;
    }
  } else if (m === 'wide' || m === 'pvc') {
    prof.qrsScale = 1.9;
    if (lead === 'II' || lead === 'III' || lead === 'aVF') {
      prof.q = 0;
      prof.r = -0.82;
      prof.s = 0.24;
    } else if (lead === 'V1') {
      prof.r = 0.85;
      prof.s = -0.18;
    } else if (lead === 'V6') {
      prof.r = -0.5;
      prof.s = 0.16;
    }
    prof.tSign = -1;
    prof.tSigma = 0.075;
  }

  if (spec.axis === 'left' && LIMB_LEADS.has(lead)) {
    if (lead === 'I' || lead === 'aVL') prof.r = Math.max(0.35, prof.r);
    if (lead === 'III' || lead === 'aVF') prof.s = Math.min(-0.3, prof.s);
  }

  return prof;
}

function addGaussian(samples, sampleRate, center, amp, sigma) {
  if (!amp || !sigma) return;
  const start = Math.max(0, Math.floor((center - 4 * sigma) * sampleRate));
  const end = Math.min(samples.length - 1, Math.ceil((center + 4 * sigma) * sampleRate));
  const twoSigma2 = 2 * sigma * sigma;
  for (let i = start; i <= end; i += 1) {
    const t = i / sampleRate;
    const d = t - center;
    samples[i] += amp * Math.exp(-(d * d) / twoSigma2);
  }
}

function addAsymGaussian(samples, sampleRate, center, amp, sigmaLeft, sigmaRight) {
  if (!amp) return;
  const sigma = Math.max(sigmaLeft, sigmaRight);
  const start = Math.max(0, Math.floor((center - 4 * sigma) * sampleRate));
  const end = Math.min(samples.length - 1, Math.ceil((center + 4 * sigma) * sampleRate));
  for (let i = start; i <= end; i += 1) {
    const t = i / sampleRate;
    const d = t - center;
    const sig = d < 0 ? sigmaLeft : sigmaRight;
    samples[i] += amp * Math.exp(-(d * d) / (2 * sig * sig));
  }
}

function addPlateau(samples, sampleRate, start, end, amp, edge = 0.012) {
  if (!amp || end <= start) return;
  const a = Math.max(0, Math.floor((start - 0.02) * sampleRate));
  const b = Math.min(samples.length - 1, Math.ceil((end + 0.02) * sampleRate));
  const smooth = (x) => {
    const u = clamp(x, 0, 1);
    return u * u * (3 - 2 * u);
  };
  for (let i = a; i <= b; i += 1) {
    const t = i / sampleRate;
    if (t < start) {
      samples[i] += amp * smooth((t - (start - edge)) / edge) * 0.5;
    } else if (t > end) {
      samples[i] += amp * smooth(((end + edge) - t) / edge) * 0.5;
    } else {
      const edgeIn = smooth((t - start) / edge);
      const edgeOut = smooth((end - t) / edge);
      samples[i] += amp * Math.min(1, Math.min(edgeIn, edgeOut) * 0.5 + 0.5);
    }
  }
}

function addScoop(samples, sampleRate, start, end, depth) {
  if (!depth || end <= start) return;
  const a = Math.max(0, Math.floor(start * sampleRate));
  const b = Math.min(samples.length - 1, Math.ceil(end * sampleRate));
  for (let i = a; i <= b; i += 1) {
    const u = (i / sampleRate - start) / (end - start);
    if (u > 0 && u < 1) samples[i] += depth * Math.sin(Math.PI * u);
  }
}

function addP(samples, sampleRate, p, prof, options = {}) {
  if (!p || p.amp === 0) return;
  const morph = p.morph || 'normal';
  const amp = p.amp * (options.ampScale ?? 1);
  if (morph === 'retrograde') {
    addGaussian(samples, sampleRate, p.t, -amp, 0.021);
    return;
  }
  addGaussian(samples, sampleRate, p.t, amp, 0.023);
  if (morph === 'prime') {
    addGaussian(samples, sampleRate, p.t + 0.028, amp * 0.32, 0.017);
  } else if (morph === 'peaked') {
    addGaussian(samples, sampleRate, p.t, amp * 0.7, 0.014);
  }
}

function addQRS(samples, sampleRate, beat, prof, spec) {
  const scale = prof.qrsScale || 1;
  const widthScale = Math.max(0.75, (beat.qrsWidth || spec.qrs) / 0.08);
  const sig = 0.0095 * widthScale;
  const rAmp = prof.r * (beat.ampScale || 1);
  const qAmp = prof.q * (beat.ampScale || 1);
  const sAmp = prof.s * (beat.ampScale || 1);

  if (prof.delta) {
    addGaussian(samples, sampleRate, beat.t - 0.04 * scale, Math.abs(rAmp) * 0.28, 0.026);
  }
  addGaussian(samples, sampleRate, beat.t - 0.018 * scale, qAmp, sig * 0.78);
  addAsymGaussian(samples, sampleRate, beat.t, rAmp, sig * 0.92, sig * 1.08);
  addGaussian(samples, sampleRate, beat.t + 0.022 * scale, sAmp, sig * 0.95);
  if (prof.rPrime) {
    addGaussian(samples, sampleRate, beat.t + (prof.rPrimeDelay || 0.04), prof.rPrime, sig * 1.05);
  }
  if (prof.sWide) {
    addGaussian(samples, sampleRate, beat.t + 0.045 * scale, sAmp * 0.5, sig * 1.8);
  }
}

function addSTT(samples, sampleRate, beat, prof, spec, lead) {
  const widthScale = Math.max(0.8, (beat.qrsWidth || spec.qrs) / 0.08);
  const j = beat.t + 0.024 * widthScale;
  const tCenter = beat.t + spec.qt * 0.66;
  const tSigma = clamp(prof.tSigma + (spec.qt - 0.4) * 0.05, 0.032, 0.115);
  const tEnd = beat.t + spec.qt;
  const stMm = prof.stOverride !== null
    ? Number(prof.stOverride)
    : Number(prof.st || 0)
      + Number(spec.st.elevation?.[lead] || 0)
      - Number(spec.st.depression?.[lead] || 0);
  const stAmp = stMm * 0.1;
  const shape = spec.st.shape;

  if (stAmp !== 0) {
    if (shape === 'scoop') {
      addPlateau(samples, sampleRate, j, tCenter, stAmp * 0.35, 0.02);
      addScoop(samples, sampleRate, j, tCenter, stAmp * 1.1);
    } else {
      addPlateau(samples, sampleRate, j, tCenter + 0.02, stAmp, 0.018);
    }
  }

  let amp = prof.t * spec.t.amp;
  if (beat.tDiscordant || spec.t.shape === 'discordant') {
    amp = -Math.sign(prof.r || 1) * Math.abs(amp);
  } else if (spec.t.shape === 'inverted') {
    amp = -Math.abs(amp);
  } else if (spec.t.shape === 'flat') {
    amp *= 0.14;
  } else if (spec.t.shape === 'peaked') {
    amp *= 1.1;
  }

  if (Math.abs(amp) > 0.002) {
    if (spec.t.shape === 'biphasic') {
      addAsymGaussian(samples, sampleRate, tCenter - 0.025, -Math.abs(amp) * 0.85, tSigma, tSigma);
      addAsymGaussian(samples, sampleRate, tCenter + 0.055, Math.abs(amp) * 0.5, tSigma * 0.7, tSigma * 0.7);
    } else {
      addAsymGaussian(samples, sampleRate, tCenter, amp, tSigma * 0.9, tSigma * 0.65);
    }
  }

  if (spec.u && Math.abs(spec.u) > 0.001) {
    addGaussian(samples, sampleRate, tEnd + 0.11, spec.u, 0.033);
  }
}

function addSpecialRhythm(samples, sampleRate, spec, lead, rng) {
  const n = samples.length;
  const leadFactor = lead === 'V1' ? 1.1 : lead === 'aVR' ? -0.8 : 1;
  if (spec.rhythm === 'vf') {
    const freqs = [3.2, 4.4, 5.6, 6.9, 8.1, 9.4];
    const phases = freqs.map(() => rng() * Math.PI * 2);
    for (let i = 0; i < n; i += 1) {
      const t = i / sampleRate;
      let v = 0;
      for (let k = 0; k < freqs.length; k += 1) {
        const mod = 1 + 0.18 * Math.sin(2 * Math.PI * (0.23 + k * 0.07) * t + phases[k]);
        v += 0.1 * mod * Math.sin(2 * Math.PI * freqs[k] * t + phases[k] + 0.4 * Math.sin(2 * Math.PI * 0.31 * t));
      }
      samples[i] = v * leadFactor + 0.02 * Math.sin(2 * Math.PI * 0.08 * t + 0.7) + (rng() - 0.5) * 0.01;
    }
    return;
  }
  if (spec.rhythm === 'vflutter') {
    const f = clamp(spec.rate > 0 ? spec.rate : 250, 200, 300) / 60;
    for (let i = 0; i < n; i += 1) {
      const t = i / sampleRate;
      samples[i] = 0.72 * Math.sin(2 * Math.PI * f * t + rng() * 0.02) * leadFactor + 0.015 * Math.sin(2 * Math.PI * 0.1 * t);
    }
    return;
  }
  if (spec.rhythm === 'torsades') {
    for (let i = 0; i < n; i += 1) {
      const t = i / sampleRate;
      const twist = Math.sin(2 * Math.PI * 0.22 * t + 0.5);
      const carrier = Math.sin(2 * Math.PI * 3.6 * t + 0.7 * Math.sin(2 * Math.PI * 0.19 * t));
      samples[i] = (0.62 * twist * carrier + 0.13 * Math.sin(2 * Math.PI * 7.3 * t + 0.3)) * leadFactor;
    }
    return;
  }
  if (spec.rhythm === 'asystole') {
    for (let i = 0; i < n; i += 1) {
      const t = i / sampleRate;
      samples[i] = 0.012 * Math.sin(2 * Math.PI * 0.09 * t) + (rng() - 0.5) * 0.006;
    }
  }
}

function addBaseline(samples, sampleRate, spec, rng) {
  const n = samples.length;
  const phase = rng() * Math.PI * 2;
  const phase2 = rng() * Math.PI * 2;
  const noisy = ['af', 'vf', 'vflutter', 'torsades'].includes(spec.rhythm);
  if (noisy) return;
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    samples[i] += 0.025 * Math.sin(2 * Math.PI * 0.075 * t + phase)
      + 0.012 * Math.sin(2 * Math.PI * 0.21 * t + phase2)
      + (rng() - 0.5) * 0.004;
  }
}

function addFibrillatory(samples, sampleRate, spec, lead, rng) {
  if (!spec.extras.includes('fibrillatory') && spec.rhythm !== 'af') return;
  const n = samples.length;
  const freqs = [4.8, 6.1, 7.3, 8.8];
  const phases = freqs.map(() => rng() * Math.PI * 2);
  const factor = lead === 'V1' ? 1.25 : lead === 'II' ? 1 : 0.8;
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    let v = 0;
    for (let k = 0; k < freqs.length; k += 1) {
      v += 0.022 * Math.sin(2 * Math.PI * freqs[k] * t + phases[k]);
    }
    samples[i] += v * factor;
  }
}

function addSawtooth(samples, sampleRate, spec, lead) {
  if (!spec.extras.includes('sawtooth') && spec.rhythm !== 'flutter') return;
  const n = samples.length;
  const rate = spec.atrialRate || 300;
  const f = rate / 60;
  const polarity = lead === 'aVR' ? -1 : (['II', 'III', 'aVF', 'V1'].includes(lead) ? 1 : 0.55);
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    const phase = (t * f) % 1;
    const saw = 1 - 2 * phase;
    samples[i] += 0.09 * saw * polarity;
  }
}

function addSineWave(samples, sampleRate, spec, lead) {
  if (!spec.sineWave) return;
  const f = 0.85;
  const factor = lead === 'V1' ? -0.9 : 1;
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / sampleRate;
    samples[i] = 0.55 * Math.sin(2 * Math.PI * f * t + 0.3) * factor;
  }
}

function synthesizeLead(schedule, lead) {
  const spec = schedule.spec;
  assertLead(lead);
  const sampleRate = 500;
  const n = Math.max(1, Math.round(spec.duration * sampleRate));
  const samples = new Float32Array(n);
  const rng = mulberry32(spec.seed + LEAD_NAMES.indexOf(lead) * 997 + 17);

  if (schedule.special) {
    addSpecialRhythm(samples, sampleRate, spec, lead, rng);
    addBaseline(samples, sampleRate, spec, rng);
    return finish(samples, spec, lead, schedule);
  }

  const prof = profileFor(spec, lead);
  addBaseline(samples, sampleRate, spec, rng);
  addFibrillatory(samples, sampleRate, spec, lead, rng);
  addSawtooth(samples, sampleRate, spec, lead);
  addSineWave(samples, sampleRate, spec, lead);

  for (const beat of schedule.beats) {
    const isEctopic = beat.ectopic;
    let bprof = prof;
    if (isEctopic) {
      bprof = Object.assign({}, prof, { qrsScale: 1.9, delta: false, rPrime: 0, sWide: false });
      if (lead === 'II' || lead === 'III' || lead === 'aVF') {
        Object.assign(bprof, { q: 0, r: -1.0, s: 0.22 });
      } else if (lead === 'V1') {
        Object.assign(bprof, { r: 0.9, s: -0.22 });
      } else if (lead === 'V6') {
        Object.assign(bprof, { r: -0.55, s: 0.18 });
      }
      bprof.tSign = -1;
      bprof.tSigma = 0.08;
    }

    if (beat.pTime !== null && beat.pTime !== undefined) {
      let pAmp = bprof.p * bprof.pScale;
      if (spec.p === 'flattened') pAmp *= 0.25;
      if (spec.p === 'peaked') pAmp *= 1.7;
      if (spec.p === 'absent' || spec.p === 'hidden' || spec.p === 'sawtooth') pAmp = 0;
      if (beat.pMorph === 'prime') pAmp *= 0.92;
      addP(samples, sampleRate, { t: beat.pTime, amp: pAmp, morph: beat.pMorph }, bprof);
    }
    if (beat.retrogradeP) {
      addP(samples, sampleRate, { t: beat.t + 0.055, amp: bprof.p * 0.85, morph: 'retrograde' }, bprof);
    }

    addQRS(samples, sampleRate, beat, bprof, spec);
    addSTT(samples, sampleRate, beat, bprof, spec, lead);
  }

  for (const p of schedule.pWaves) {
    let pAmp = prof.p * prof.pScale * (p.ampScale ?? 1);
    if (spec.p === 'flattened') pAmp *= 0.25;
    if (spec.p === 'peaked') pAmp *= 1.7;
    addP(samples, sampleRate, { t: p.t, amp: pAmp, morph: p.morph || 'normal' }, prof);
  }

  return finish(samples, spec, lead, schedule);
}

function assertLead(lead) {
  if (!LEAD_NAMES.includes(lead)) {
    throw new Error(`Unknown lead: ${lead}`);
  }
}

function finish(samples, spec, lead, schedule) {
  const summary = summarize(spec, schedule);
  return {
    lead,
    samples,
    sampleRate: 500,
    duration: spec.duration,
    annotations: spec.annotations,
    summary,
    description: spec.description,
  };
}

function summarize(spec, schedule) {
  const beats = schedule.beats;
  let hr = spec.rate || 0;
  if (beats.length >= 2) {
    const intervals = [];
    for (let i = 1; i < beats.length; i += 1) intervals.push(beats[i].t - beats[i - 1].t);
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    if (median > 0.12) hr = Math.round(60 / median);
  }
  const rateText = spec.rhythm === 'vf' || spec.rhythm === 'asystole' ? '无法计数' : `${Math.round(hr)} 次/分`;
  return {
    hr: Math.round(hr),
    rateText,
    pr: spec.pr,
    qrs: spec.qrs,
    qt: spec.qt,
    qtc: Number((spec.qt / Math.sqrt(60 / Math.max(30, hr || 60))).toFixed(3)),
    rhythm: spec.rhythm,
    description: spec.description,
  };
}

export class ECGSession {
  constructor(spec) {
    this.spec = normalizeSpec(spec);
    this.schedule = buildSchedule(this.spec);
    this.cache = new Map();
  }

  lead(name = 'II') {
    assertLead(name);
    if (!this.cache.has(name)) {
      this.cache.set(name, synthesizeLead(this.schedule, name));
    }
    return this.cache.get(name);
  }

  summary() {
    return summarize(this.spec, this.schedule);
  }

  annotations() {
    return this.spec.annotations;
  }

  get primaryLead() {
    return this.spec.primaryLead;
  }

  get duration() {
    return this.spec.duration;
  }

  get specData() {
    return this.spec;
  }
}

export function generateLead(spec, lead = 'II') {
  return new ECGSession(spec).lead(lead);
}

export function generateAllLeads(spec) {
  const session = new ECGSession(spec);
  return {
    session,
    leads: Object.fromEntries(LEAD_NAMES.map((lead) => [lead, session.lead(lead).samples])),
  };
}

export function sampleAt(result, seconds) {
  const index = clamp(Math.round(seconds * result.sampleRate), 0, result.samples.length - 1);
  return result.samples[index];
}

export function estimateHeartRate(result) {
  const { samples, sampleRate } = result;
  let threshold = 0;
  for (let i = 0; i < samples.length; i += 1) threshold = Math.max(threshold, Math.abs(samples[i]));
  threshold = Math.max(0.35, threshold * 0.55);
  const peaks = [];
  let last = -1;
  for (let i = 1; i < samples.length - 1; i += 1) {
    const value = Math.abs(samples[i]);
    if (value > threshold && value >= Math.abs(samples[i - 1]) && value > Math.abs(samples[i + 1])) {
      const t = i / sampleRate;
      if (last < 0 || t - last > 0.25) {
        peaks.push(t);
        last = t;
      }
    }
  }
  if (peaks.length < 2) return 0;
  const intervals = [];
  for (let i = 1; i < peaks.length; i += 1) intervals.push(peaks[i] - peaks[i - 1]);
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  return median > 0 ? Math.round(60 / median) : 0;
}
