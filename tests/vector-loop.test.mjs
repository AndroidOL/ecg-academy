import assert from 'node:assert/strict';
import { LOOP_MAIN, LOOP_POINTS, loopPoint, normalLoopMetrics } from '../public/static/js/vector-loop-model.js';

let passed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('FAIL  ' + name + ': ' + error.message); process.exitCode = 1; }
}

const sample = (key, count = 720) => Array.from({ length: count }, (_, index) => loopPoint(key, (index / count) * Math.PI * 2));
const mag = (v) => Math.hypot(v[0], v[1], v[2]);
const maxMag = (key) => Math.max(...sample(key).map(mag));

function polyArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x * y2 - x2 * y;
  }
  return area / 2;
}

function inside(point, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > point[1]) !== (yj > point[1])) && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi)) hit = !hit;
  }
  return hit;
}

function principalRatio(key) {
  const points = sample(key, 360);
  const center = [0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  points.forEach((point) => {
    const d = [point[0] - center[0], point[1] - center[1], point[2] - center[2]];
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) cov[i][j] += (d[i] * d[j]) / points.length;
  });
  const a = cov.map((row) => row.slice());
  for (let iter = 0; iter < 40; iter += 1) {
    let p = 0; let q = 1; let max = Math.abs(a[p][q]);
    [[0, 2], [1, 2]].forEach(([i, j]) => { if (Math.abs(a[i][j]) > max) { max = Math.abs(a[i][j]); p = i; q = j; } });
    if (max < 1e-12) break;
    const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(phi); const s = Math.sin(phi);
    const app = a[p][p]; const aqq = a[q][q]; const apq = a[p][q];
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = 0; a[q][p] = 0;
    for (let k = 0; k < 3; k += 1) {
      if (k === p || k === q) continue;
      const akp = a[k][p]; const akq = a[k][q];
      a[k][p] = a[p][k] = c * akp - s * akq;
      a[k][q] = a[q][k] = s * akp + c * akq;
    }
  }
  const eigenvalues = [a[0][0], a[1][1], a[2][2]].sort((x, y) => y - x);
  return Math.sqrt(eigenvalues[0] / Math.max(1e-12, eigenvalues[1]));
}

check('loops are open curves with separate outbound and return limbs', () => {
  ['P', 'QRS', 'T'].forEach((key) => {
    const points = LOOP_POINTS[key];
    const first = points[0];
    const last = points[points.length - 1];
    const gap = mag([first[0] - last[0], first[1] - last[1], first[2] - last[2]]);
    assert.ok(gap > 0.005 && gap < 0.12, `${key} gap ${gap}`);
    assert.ok(points.length >= 8);
  });
});

check('normal axis and amplitude relationships', () => {
  const p = maxMag('P'); const qrs = maxMag('QRS'); const t = maxMag('T');
  assert.ok(p / qrs > 0.05 && p / qrs < 0.2, `P/QRS ${p / qrs}`);
  assert.ok(t / qrs > 0.3 && t / qrs < 0.6, `T/QRS ${t / qrs}`);
  assert.ok(LOOP_MAIN.QRS[0] > 0.7 && LOOP_MAIN.QRS[1] < -0.3, 'QRS main should be left/inferior');
  assert.ok(LOOP_MAIN.P[0] > 0 && LOOP_MAIN.T[0] > 0, 'P/T main should be leftward');
});

check('QRS horizontal plane matches anterior and right-posterior limits', () => {
  const points = sample('QRS');
  const horizontal = points.map(([x, , z]) => [x, z]);
  const minX = Math.min(...horizontal.map(([x]) => x));
  const maxX = Math.max(...horizontal.map(([x]) => x));
  const minZ = Math.min(...horizontal.map(([, z]) => z));
  const maxZ = Math.max(...horizontal.map(([, z]) => z));
  let total = 0; let anterior = 0; let rightPosterior = 0;
  for (let i = 0; i <= 260; i += 1) {
    for (let j = 0; j <= 260; j += 1) {
      const x = minX + ((maxX - minX) * i) / 260;
      const z = minZ + ((maxZ - minZ) * j) / 260;
      if (!inside([x, z], horizontal)) continue;
      total += 1;
      if (z > 0) anterior += 1;
      if (x < 0 && z < 0) rightPosterior += 1;
    }
  }
  assert.ok(total > 0);
  assert.ok(anterior / total <= 1 / 3, `anterior ${anterior / total}`);
  assert.ok(rightPosterior / total < 0.2, `right posterior ${rightPosterior / total}`);
  assert.ok(polyArea(horizontal) !== 0);
});

check('T loop length-to-width ratio is close to 2.5', () => {
  const ratio = principalRatio('T');
  assert.ok(ratio > 2.2 && ratio < 2.8, `T ratio ${ratio}`);
});

check('normal metrics match published vectorcardiogram ranges', () => {
  const m = normalLoopMetrics();
  assert.ok(m.qrsHorizontalAngle >= -40 && m.qrsHorizontalAngle <= 60, `horizontal ${m.qrsHorizontalAngle}`);
  assert.ok(m.qrsFrontalAngle >= 10 && m.qrsFrontalAngle <= 90, `frontal ${m.qrsFrontalAngle}`);
  assert.ok(m.qrsAnteriorArea < 33, `anterior ${m.qrsAnteriorArea}`);
  assert.ok(m.qrsRightPosteriorArea < 20, `right posterior ${m.qrsRightPosteriorArea}`);
  assert.ok(m.tLengthWidth >= 2.2 && m.tLengthWidth <= 2.8, `T ratio ${m.tLengthWidth}`);
  assert.ok(m.tQrsRatio < 4, `T/QRS ${m.tQrsRatio}`);
  assert.ok(m.pQrsRatio < 0.2, `P/QRS ${m.pQrsRatio}`);
});

check('limb-lead projection keeps normal P/QRS/T polarity', () => {
  const leads = { I: [1, 0, 0], II: [0.5, -0.866, 0], aVR: [-0.866, 0.5, 0], aVF: [0, -1, 0] };
  const sign = (key, vec) => {
    let best = 0;
    sample(key, 360).forEach((point) => {
      const dot = point[0] * vec[0] + point[1] * vec[1] + point[2] * vec[2];
      if (Math.abs(dot) > Math.abs(best)) best = dot;
    });
    return Math.sign(best);
  };
  assert.equal(sign('P', leads.II), 1);
  assert.equal(sign('QRS', leads.II), 1);
  assert.equal(sign('T', leads.II), 1);
  assert.equal(sign('QRS', leads.aVR), -1);
  assert.equal(sign('QRS', leads.aVF), 1);
  assert.equal(sign('P', leads.I), 1);
});

console.log(`\nVector loop model tests passed: ${passed}`);
