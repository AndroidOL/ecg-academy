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

export function activeLoopAt(phase) {
  if (phase >= LOOP_WINDOWS.P[0] && phase < LOOP_WINDOWS.P[1]) return 'P';
  if (phase >= LOOP_WINDOWS.QRS[0] && phase < LOOP_WINDOWS.QRS[1]) return 'QRS';
  if (phase >= LOOP_WINDOWS.T[0] && phase < LOOP_WINDOWS.T[1]) return 'T';
  return null;
}
