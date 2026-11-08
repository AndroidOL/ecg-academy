import assert from 'node:assert/strict';
import { buildReading, isStepCorrect } from '../public/static/js/read-interpret.js';

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (error) {
    console.error('  FAIL ' + name + ': ' + error.message);
    process.exitCode = 1;
  }
}

check('normal sinus ECG reads within normal limits', () => {
  const reading = buildReading({
    rhythm: 'sinus', rate: 72, pr: 0.16, qrs: 0.08, qt: 0.40, axis: 'normal',
    st: { elevation: [], depression: [] }, t: { shape: 'normal', amp: 1 }, u: 0,
  });
  assert.equal(reading.rate.answer, 'normal');
  assert.equal(reading.rhythm.answer, 'sinus');
  assert.equal(reading.axis.answer, 'normal');
  assert.deepEqual(reading.intervals.answer, ['none']);
  assert.deepEqual(reading.stt.answer, ['none']);
  assert.ok(isStepCorrect(reading.rate, new Set(['normal'])));
});

check('bradycardia and first-degree AV block are detected', () => {
  const reading = buildReading({
    rhythm: 'sinus', rate: 48, pr: 0.30, qrs: 0.08, qt: 0.42, axis: 'normal',
    avBlock: { degree: '1' }, st: { elevation: [], depression: [] }, t: { shape: 'normal' }, u: 0,
  });
  assert.equal(reading.rate.answer, 'brady');
  assert.deepEqual(reading.intervals.answer, ['pr']);
  assert.match(reading.intervals.explanation, /PR 间期延长/);
});

check('anterior STEMI flags ST elevation and tachycardia', () => {
  const reading = buildReading({
    rhythm: 'sinus', rate: 118, pr: 0.16, qrs: 0.09, qt: 0.38, axis: 'normal',
    st: { elevation: ['V2', 'V3', 'V4'], depression: ['II', 'III', 'aVF'] },
    t: { shape: 'peaked', amp: 1.4 }, u: 0,
  });
  assert.equal(reading.rate.answer, 'tachy');
  assert.deepEqual(reading.stt.answer.sort(), ['std', 'ste', 't']);
  assert.match(reading.stt.explanation, /V2、V3、V4/);
  assert.ok(isStepCorrect(reading.stt, new Set(['ste', 't', 'std'])));
  assert.ok(!isStepCorrect(reading.stt, new Set(['ste'])));
});

check('LBBB classifies wide QRS and left axis', () => {
  const reading = buildReading({
    rhythm: 'sinus', rate: 70, pr: 0.18, qrs: 0.16, qt: 0.44, axis: 'left',
    st: { elevation: [], depression: [] }, t: { shape: 'discordant' }, u: 0,
  });
  assert.equal(reading.axis.answer, 'left');
  assert.deepEqual(reading.intervals.answer, ['qrs']);
  assert.deepEqual(reading.stt.answer, ['t']);
});

check('atrial fibrillation maps to atrial tachyarrhythmia group', () => {
  const reading = buildReading({
    rhythm: 'af', rate: 130, pr: 0, qrs: 0.08, qt: 0.35, axis: 'normal',
    st: { elevation: [], depression: [] }, t: { shape: 'normal' }, u: 0,
  });
  assert.equal(reading.rhythm.answer, 'atrial');
  assert.equal(reading.options.rhythm.length, 5);
  assert.match(reading.intervals.explanation, /PR 无法测量/);
});

check('hypokalemia flags U waves and QT-related options', () => {
  const reading = buildReading({
    rhythm: 'sinus', rate: 88, pr: 0.16, qrs: 0.08, qt: 0.48, axis: 'normal',
    st: { elevation: [], depression: [] }, t: { shape: 'flat' }, u: 0.3,
  });
  assert.deepEqual(reading.intervals.answer, ['qt']);
  assert.deepEqual(reading.stt.answer.sort(), ['t', 'u']);
});

console.log(`\nGuided reading tests passed: ${passed}`);
