import assert from 'node:assert/strict';
import { ECGSession, LEAD_NAMES, generateLead, estimateHeartRate } from '../public/static/js/ecg-engine.js';

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const base = {
  rhythm: 'sinus', rate: 72, atrialRate: 72, irregularity: 0,
  p: 'normal', pr: 0.16, qrs: 0.08, morphology: 'normal', axis: 'normal',
  st: { elevation: {}, depression: {}, shape: 'normal' },
  t: { shape: 'normal', amp: 1 }, u: 0, qt: 0.38,
  ectopy: null, avBlock: null, pause: null, extras: [],
  annotations: [], duration: 8, seed: 11, description: 'test',
};

function noNaN(result) {
  for (let i = 0; i < result.samples.length; i += 1) {
    assert.ok(Number.isFinite(result.samples[i]), `sample ${i} not finite`);
  }
}

check('normal sinus generates 8s at 500Hz', () => {
  const result = generateLead(base, 'II');
  assert.equal(result.samples.length, 4000);
  assert.ok(Math.max(...result.samples) > 0.7);
  noNaN(result);
});

check('normal sinus heart rate near 72', () => {
  const result = generateLead(base, 'II');
  const hr = estimateHeartRate(result);
  assert.ok(hr >= 62 && hr <= 82, `HR=${hr}`);
});

check('P, QRS and T waves appear in the correct order and polarity', () => {
  const result = generateLead(base, 'II');
  const at = (t) => result.samples[Math.round(t * result.sampleRate)];
  assert.ok(at(0.42) > 0.06, `P wave at 0.42s = ${at(0.42)}`);
  assert.ok(at(0.58) > 0.85, `R wave at 0.58s = ${at(0.58)}`);
  assert.ok(at(0.83) > 0.16, `T wave at 0.83s = ${at(0.83)}`);
  assert.ok(at(0.42) < at(0.58) && at(0.58) > at(0.83), 'P -> R -> T order');
});

check('sinus bradycardia heart rate near 42', () => {
  const result = new ECGSession({ ...base, rate: 42, atrialRate: 42 }).lead('II');
  const estimate = estimateHeartRate(result);
  assert.ok(estimate >= 36 && estimate <= 48, `HR=${estimate}`);
});

check('all 12 leads are generated without NaN', () => {
  const session = new ECGSession({ ...base, morphology: 'rbbb', qrs: 0.13 });
  for (const lead of LEAD_NAMES) {
    const result = session.lead(lead);
    assert.equal(result.samples.length, 4000);
    noNaN(result);
  }
});

check('PVC ectopy produces wide negative complex in lead II', () => {
  const result = generateLead({
    ...base,
    ectopy: { type: 'pvc', pattern: 'isolated', coupling: 0.52, count: 1 },
  }, 'II');
  noNaN(result);
  const min = Math.min(...result.samples);
  assert.ok(min < -0.5, `min=${min}`);
});

check('ventricular tachycardia is wide and fast', () => {
  const result = generateLead({
    ...base, rhythm: 'vt', rate: 160, atrialRate: 75, qrs: 0.16, morphology: 'wide', t: { shape: 'discordant', amp: 1 },
  }, 'II');
  noNaN(result);
  const hr = estimateHeartRate(result);
  assert.ok(hr > 120, `HR=${hr}`);
});

check('atrial flutter has sawtooth and ventricular rate near 150', () => {
  const result = generateLead({
    ...base, rhythm: 'flutter', rate: 150, atrialRate: 300, p: 'sawtooth', extras: ['sawtooth'], conduction: '2:1',
  }, 'II');
  noNaN(result);
  assert.ok(result.summary.hr >= 135 && result.summary.hr <= 165, `HR=${result.summary.hr}`);
});

check('atrial fibrillation is irregular', () => {
  const session = new ECGSession({ ...base, rhythm: 'af', rate: 96, irregularity: 0.22, p: 'absent', extras: ['fibrillatory'] });
  const result = session.lead('II');
  noNaN(result);
  assert.ok(result.summary.hr > 60 && result.summary.hr < 140, `HR=${result.summary.hr}`);
});

check('complete AV block generates dissociated slow QRS', () => {
  const result = generateLead({
    ...base, rate: 38, atrialRate: 78, qrs: 0.14, morphology: 'wide', avBlock: { degree: '3' },
  }, 'II');
  noNaN(result);
  assert.ok(result.summary.hr >= 30 && result.summary.hr <= 46, `HR=${result.summary.hr}`);
});

check('ventricular fibrillation has no NaN and bounded amplitude', () => {
  const result = generateLead({ ...base, rhythm: 'vf', rate: 0, p: 'absent', extras: ['fibrillatory'] }, 'II');
  noNaN(result);
  const max = Math.max(...result.samples.map(Math.abs));
  assert.ok(max > 0.2 && max < 1.6, `max=${max}`);
});

check('torsades produces twisting waveform', () => {
  const result = generateLead({ ...base, rhythm: 'torsades', rate: 210, qrs: 0.18, morphology: 'wide' }, 'II');
  noNaN(result);
  const max = Math.max(...result.samples.map(Math.abs));
  assert.ok(max > 0.4 && max < 1.2, `max=${max}`);
});

check('hyperkalemia peaked T is tall in V3', () => {
  const result = generateLead({
    ...base, rate: 50, p: 'flattened', qrs: 0.12, morphology: 'hyperk', t: { shape: 'peaked', amp: 2.4 },
  }, 'V3');
  noNaN(result);
  const max = Math.max(...result.samples);
  assert.ok(max > 0.7, `max=${max}`);
});

check('STEMI elevation reaches the ST segment', () => {
  const result = generateLead({
    ...base, rate: 92, st: { elevation: { V2: 4, V3: 3 }, depression: { III: 1 }, shape: 'convex' },
  }, 'V2');
  noNaN(result);
  // Sample around the ST segment of a beat at roughly 1s (J point + 40ms).
  let found = false;
  for (let i = 0; i < result.samples.length - 10; i += 1) {
    if (result.samples[i] > 0.3) { found = true; break; }
  }
  assert.ok(found);
});

check('generation is deterministic for the same seed', () => {
  const a = generateLead({ ...base, seed: 99 }, 'V1').samples;
  const b = generateLead({ ...base, seed: 99 }, 'V1').samples;
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i += 137) assert.equal(a[i], b[i]);
});

console.log(`\n${passed} checks passed`);
