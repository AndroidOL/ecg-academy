// Normal Frank vectorcardiogram teaching approximation.
// Literature constraints used here:
// - QRS horizontal-plane loop: left/ posterior body, anterior area < 1/3,
//   right-posterior area < 20%, maximum vector about -40° to +60°.
// - QRS frontal plane: left/ inferior body, maximum vector +10° to +90°.
// - P loop: small ellipse, left/ inferior, < 0.12 mV.
// - T loop: long and narrow (length:width about 2.5:1), same rotation as QRS,
//   QRS/T maximum vector ratio < 4.
// Each loop is open: the centrifugal (outbound) and centripetal (return)
// limbs are separate, so the loop is not a single symmetric spline and can
// end slightly away from the origin (small ST/Ta vector).
export const LOOP_POINTS = {
  P: [
    [0, 0, 0], [0.03, -0.01, 0.01], [0.08, -0.03, 0.02], [0.13, -0.05, 0.02],
    [0.10, -0.04, 0.00], [0.06, -0.02, -0.01], [0.02, -0.01, -0.01], [0.01, 0, -0.005],
  ],
  QRS: [
    [0, 0, 0],
    [-0.12, -0.04, 0.22], [-0.02, -0.14, 0.30], [0.30, -0.30, 0.30], [0.62, -0.44, 0.13],
    [0.88, -0.50, -0.06], [0.96, -0.44, -0.28], [0.78, -0.28, -0.48], [0.48, -0.02, -0.55],
    [0.20, 0.16, -0.48],
    [0.06, 0.12, -0.30], [0.01, 0.04, -0.12], [0.02, 0.03, -0.02],
  ],
  T: [
    [0, 0, 0], [0.11, -0.04, 0.06], [0.24, -0.10, 0.12], [0.37, -0.14, 0.15],
    [0.38, -0.22, 0.10], [0.31, -0.27, 0.02], [0.20, -0.18, -0.03], [0.09, -0.09, -0.03],
    [0.02, -0.02, -0.01], [0.01, 0, -0.005],
  ],
};

export const LOOP_MAIN = {
  P: [0.13, -0.05, 0.02],
  QRS: [0.88, -0.50, -0.06],
  T: [0.38, -0.22, 0.10],
};

export const LOOP_WINDOWS = { P: [0, 0.16], QRS: [0.2, 0.42], T: [0.55, 0.8] };

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1, 2].map((axis) => 0.5 * (
    (2 * p1[axis]) +
    (-p0[axis] + p2[axis]) * t +
    (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
    (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3
  ));
}

function openPoint(points, t) {
  const scaled = t * (points.length - 1);
  const index = Math.min(points.length - 2, Math.max(0, Math.floor(scaled)));
  const u = Math.min(1, Math.max(0, scaled - index));
  return catmullRom(
    points[Math.max(0, index - 1)],
    points[index],
    points[index + 1],
    points[Math.min(points.length - 1, index + 2)],
    u,
  );
}

export function loopPoint(key, angle) {
  const points = LOOP_POINTS[key] || LOOP_POINTS.QRS;
  const wrapped = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
  return openPoint(points, wrapped);
}

export const LOOPS = {
  P: (angle) => loopPoint('P', angle),
  QRS: (angle) => loopPoint('QRS', angle),
  T: (angle) => loopPoint('T', angle),
};

function sampleLoop(key, count = 720) {
  return Array.from({ length: count }, (_, index) => loopPoint(key, (index / count) * Math.PI * 2));
}

function polygonArea(points) {
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

function maxMagnitude(key) {
  return Math.max(...sampleLoop(key).map((point) => Math.hypot(point[0], point[1], point[2])));
}

function principalRatio(key) {
  const points = sampleLoop(key, 360);
  const center = [0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  points.forEach((point) => {
    const d = [point[0] - center[0], point[1] - center[1], point[2] - center[2]];
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) cov[i][j] += (d[i] * d[j]) / points.length;
  });
  const a = cov.map((row) => row.slice());
  for (let iter = 0; iter < 32; iter += 1) {
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

export function normalLoopMetrics() {
  const qrs = sampleLoop('QRS');
  const horizontal = qrs.map(([x, , z]) => [x, z]);
  const minX = Math.min(...horizontal.map(([x]) => x));
  const maxX = Math.max(...horizontal.map(([x]) => x));
  const minZ = Math.min(...horizontal.map(([, z]) => z));
  const maxZ = Math.max(...horizontal.map(([, z]) => z));
  let total = 0; let anterior = 0; let rightPosterior = 0;
  for (let i = 0; i <= 180; i += 1) {
    for (let j = 0; j <= 180; j += 1) {
      const x = minX + ((maxX - minX) * i) / 180;
      const z = minZ + ((maxZ - minZ) * j) / 180;
      if (!inside([x, z], horizontal)) continue;
      total += 1;
      if (z > 0) anterior += 1;
      if (x < 0 && z < 0) rightPosterior += 1;
    }
  }
  const maxPoint = qrs.reduce((best, point) => (Math.hypot(...point) > Math.hypot(...best) ? point : best), [0, 0, 0]);
  const p = maxMagnitude('P'); const q = maxMagnitude('QRS'); const t = maxMagnitude('T');
  return {
    qrsHorizontalAngle: Math.round((Math.atan2(maxPoint[2], maxPoint[0]) * 180) / Math.PI),
    qrsFrontalAngle: Math.round((Math.atan2(-maxPoint[1], maxPoint[0]) * 180) / Math.PI),
    qrsAnteriorArea: total > 0 ? Math.round((anterior / total) * 100) : 0,
    qrsRightPosteriorArea: total > 0 ? Math.round((rightPosterior / total) * 100) : 0,
    pQrsRatio: q > 0 ? p / q : 0,
    tQrsRatio: q > 0 ? t / q : 0,
    tLengthWidth: principalRatio('T'),
    qrsArea: polygonArea(horizontal),
  };
}

export function activeLoopAt(phase) {
  if (phase >= LOOP_WINDOWS.P[0] && phase < LOOP_WINDOWS.P[1]) return 'P';
  if (phase >= LOOP_WINDOWS.QRS[0] && phase < LOOP_WINDOWS.QRS[1]) return 'QRS';
  if (phase >= LOOP_WINDOWS.T[0] && phase < LOOP_WINDOWS.T[1]) return 'T';
  return null;
}
