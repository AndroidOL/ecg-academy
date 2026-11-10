import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', { url: 'http://127.0.0.1/', pretendToBeVisual: true });
const { window } = dom;

class FakeContext {
  constructor() { this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.globalAlpha = 1; this.font = ''; }
  measureText(text) { return { width: String(text).length * 6 }; }
  setTransform() {} clearRect() {} fillRect() {} strokeRect() {} beginPath() {} closePath() {} rect() {} clip() {}
  save() {} restore() {} moveTo() {} lineTo() {} stroke() {} fill() {} arc() {} arcTo() {} fillText() {}
  setLineDash() {} translate() {} rotate() {} scale() {} drawImage() {}
}
const contexts = new WeakMap();
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  if (!contexts.has(this)) contexts.set(this, new FakeContext());
  return contexts.get(this);
};
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 390; } });
window.HTMLElement.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
window.cancelAnimationFrame = clearTimeout;

Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  HTMLCanvasElement: window.HTMLCanvasElement,
  Node: window.Node,
  CustomEvent: window.CustomEvent,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame,
  cancelAnimationFrame: window.cancelAnimationFrame,
  ResizeObserver: window.ResizeObserver,
});
globalThis.window.devicePixelRatio = 1;

const { ECGViewer } = await import('../public/static/js/ecg-renderer.js');

const spec = {
  rhythm: 'sinus', rate: 72, atrialRate: 72, p: 'normal', pr: 0.16, qrs: 0.08,
  morphology: 'normal', axis: 'normal', st: { elevation: {}, depression: {}, shape: 'normal' },
  t: { shape: 'normal', amp: 1 }, qt: 0.38, duration: 8, seed: 11, annotations: [],
  show12Lead: true,
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ok  ${message}`);
}

try {
  const host = document.getElementById('host');
  const viewer = new ECGViewer(host, spec, { playbackMode: 'sweep', autoPlay: false });
  viewer.play(4);
  await wait(180);
  assert(viewer.playing === true, 'sweep playback starts');
  assert(viewer.progress > 0, 'sweep progress advances');
  assert(Boolean(viewer.sweepLayer), 'persistent sweep layer exists (old trace is not cleared)');
  viewer.pause();
  assert(viewer.playing === false, 'pause stops sweep');
  viewer.setPlayback('scroll');
  viewer.play(2);
  await wait(180);
  assert(viewer.playing === true, 'scroll playback starts');
  assert(viewer.scrollOffset > 0, 'scroll offset advances (waveform moves left)');
  viewer.pause();

  viewer.setMode('12lead');
  viewer.play(4);
  await wait(180);
  assert(viewer.playing === true, '12-lead playback starts');
  assert(viewer.twelveProgress > 0, '12-lead recording progress advances');
  viewer.setMode('rhythm');
  await wait(60);
  assert(viewer.playing === true, 'switching 12-lead back to rhythm keeps playback alive (no pause/replay needed)');
  viewer.setLead('V1');
  await wait(60);
  assert(viewer.playing === true, 'switching lead during playback keeps playing');
  assert(viewer.annotationLeads({ label: 'V1–V4 ST↑' }).join(',') === 'V1,V2,V3,V4', 'lead range expands for annotation filtering');
  assert(viewer.annotationLeads({ label: 'II、III、aVF 镜像 ST↓' }).join(',') === 'II,III,aVF', 'limb leads parse for annotation filtering');
  assert(viewer.annotationLeads({ label: 'QRS 0.10 s' }).length === 0, 'global interval annotation stays on all leads');
  const pSnap = viewer.snapAnnotation({ kind: 'arrow', t: 0.42, label: 'P' });
  const rSnap = viewer.snapAnnotation({ kind: 'arrow', t: 0.84, label: 'T' });
  assert(Math.abs(pSnap.t - 0.42) < 0.06, 'P annotation snaps to actual P wave');
  assert(Math.abs(rSnap.t - 0.831) < 0.06, 'T annotation snaps to actual T wave');
  viewer.pause();
  viewer.destroy();
  assert(!document.getElementById('host').querySelector('.ecg-canvas'), 'destroy removes canvas');
  console.log(`\nPlayback tests passed: ${passed}`);
  dom.window.close();
  process.exit(0);
} catch (error) {
  console.error('\nPlayback test FAILED:', error.message);
  dom.window.close();
  process.exit(1);
}
