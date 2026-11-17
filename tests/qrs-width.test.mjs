import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ECGSession } from '../public/static/js/ecg-engine.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const specs = JSON.parse(execFileSync('php', [join(root, 'scripts/export_ecg_specs.php')], { cwd: root, encoding: 'utf8' }));
const SPECIAL = new Set(['vf', 'vflutter', 'torsades', 'asystole', 'sinewave']);
const WIDE_MORPH = new Set(['lbbb', 'rbbb', 'wide', 'pvc']);
const WIDE_RHYTHM = new Set(['vt', 'aivr', 'ventricular_escape']);
let checked = 0;
let passed = 0;
const failures = [];

for (const item of specs) {
  const spec = item.ecg || {};
  if (SPECIAL.has(spec.rhythm)) continue;
  let session;
  try {
    session = new ECGSession(spec);
  } catch (error) {
    failures.push(`${item.id}: engine error ${error.message}`);
    continue;
  }
  const beats = session.schedule.beats || [];
  const wideBeat = beats.find((beat) => beat.type === 'pvc' || beat.type === 'ventricular_escape');
  const beat = wideBeat || beats.find((entry) => entry.t > 0.3) || beats[0];
  if (!beat) continue;
  checked += 1;
  let itemFailures = 0;
  const primary = session.lead(spec.primaryLead || 'II');
  const nan = primary.samples.findIndex((value) => !Number.isFinite(value));
  if (nan >= 0) { failures.push(`${item.id}: NaN sample ${nan}`); itemFailures += 1; }
  const width = beat.qrsEnd - beat.qrsOnset;
  const expectedWide = Number(beat.qrsWidth || spec.qrs || 0.08) >= 0.12
    || WIDE_MORPH.has(spec.morphology || '')
    || WIDE_RHYTHM.has(spec.rhythm || '')
    || beat.type === 'pvc'
    || beat.type === 'ventricular_escape';
  if (!(width > 0.03 && width < 0.36)) { failures.push(`${item.id}: implausible QRS ${(width * 1000).toFixed(0)} ms`); itemFailures += 1; }
  if (expectedWide && width < 0.11) { failures.push(`${item.id}: expected wide QRS, got ${(width * 1000).toFixed(0)} ms`); itemFailures += 1; }
  if (!expectedWide && width > 0.13) { failures.push(`${item.id}: expected narrow QRS, got ${(width * 1000).toFixed(0)} ms`); itemFailures += 1; }
  if (beat.pTime != null && Number(beat.pr) > 0) {
    const clinicalPr = (beat.t + beat.qrsOnset) - (beat.pOnset ?? (beat.pTime - 0.0575));
    if (Math.abs(clinicalPr - Number(beat.pr)) > 0.015) {
      failures.push(`${item.id}: PR ${clinicalPr.toFixed(3)} s vs spec ${Number(beat.pr).toFixed(3)} s`);
      itemFailures += 1;
    }
  }
  if (itemFailures === 0) passed += 1;
}

console.log(`  checked ${checked} ECG specs; ${passed} passed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
if (failures.length) process.exitCode = 1;
