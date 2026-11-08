import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const BASE = 'http://127.0.0.1:8791';

const dom = new JSDOM(`<!doctype html><html lang="zh-CN" data-theme="light"><head></head><body>
  <a class="skip-link" href="#main">skip</a>
  <div id="app"><div class="boot-splash">boot</div></div>
  <div id="modal-root"></div>
  <div id="toast-region"></div>
  <div id="main"></div>
</body></html>`, {
  url: `${BASE}/`,
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});

const { window } = dom;
const cookieJar = new Map();

class FakeContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.font = '10px sans-serif';
    this.globalAlpha = 1;
    this.textAlign = 'left';
    this.shadowBlur = 0;
    this.shadowColor = 'transparent';
    this.lineJoin = 'miter';
    this.lineCap = 'butt';
  }
  measureText(text) { return { width: String(text).length * 6 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  setTransform() {}
  clearRect() {}
  fillRect() {}
  strokeRect() {}
  beginPath() {}
  closePath() {}
  rect() {}
  clip() {}
  save() {}
  restore() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}
  arc() {}
  arcTo() {}
  fillText() {}
  setLineDash() {}
  translate() {}
  rotate() {}
  scale() {}
  drawImage() {}
}

const ctxCache = new WeakMap();
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  if (!ctxCache.has(this)) ctxCache.set(this, new FakeContext(this));
  return ctxCache.get(this);
};
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.dataset && this.dataset.wide ? 900 : 390; } });
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 240; } });
window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
window.scrollTo = () => {};
window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent() { return false; },
});
window.ResizeObserver = class ResizeObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.IntersectionObserver = class IntersectionObserver {
  constructor(callback) { this.callback = callback; }
  observe(target) { this.callback([{ isIntersecting: true, target }]); }
  disconnect() {}
  unobserve() {}
};
window.confirm = () => true;

const nativeFetch = globalThis.fetch;
async function cookieFetch(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url, BASE);
  const headers = new Headers(init.headers || {});
  if (cookieJar.size) headers.set('cookie', [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
  const res = await nativeFetch(url, { ...init, headers });
  if (url.pathname.startsWith('/api/')) console.log('  api', init.method || 'GET', url.pathname, res.status);
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const line of setCookies) {
    const [pair] = line.split(';');
    const [key, value] = pair.split('=');
    if (key && value) cookieJar.set(key.trim(), value.trim());
  }
  return res;
}

globalThis.window = window;
globalThis.document = window.document;
globalThis.history = window.history;
globalThis.location = window.location;
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.Node = window.Node;
globalThis.CustomEvent = window.CustomEvent;
globalThis.HashChangeEvent = window.HashChangeEvent || class HashChangeEvent extends window.Event { constructor(type) { super(type); } };
globalThis.Event = window.Event;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.matchMedia = window.matchMedia;
globalThis.ResizeObserver = window.ResizeObserver;
globalThis.IntersectionObserver = window.IntersectionObserver;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.fetch = cookieFetch;
globalThis.Headers = globalThis.Headers || window.Headers;
globalThis.URL = globalThis.URL || window.URL;
globalThis.URLSearchParams = globalThis.URLSearchParams || window.URLSearchParams;

const errors = [];
const originalError = console.error;
console.error = (...args) => { errors.push(args.join(' ')); originalError(...args); };

function waitFor(check, timeout = 12000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const value = check();
        if (value) return resolve(value);
      } catch (error) {
        return reject(error);
      }
      if (Date.now() - started > timeout) return reject(new Error('timeout waiting for UI'));
      setTimeout(tick, 80);
    };
    tick();
  });
}

async function go(hash) {
  if (window.location.hash === hash) {
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
  await new Promise((resolve) => setTimeout(resolve, 30));
}

let passed = 0;
function ok(name) { passed += 1; console.log(`  ok  ${name}`); }

try {
  await import('../public/static/js/app.js');
  await waitFor(() => document.querySelector('.app-shell .hero-title'));
  if (!document.querySelector('.hero-title')?.textContent.includes('心跳')) throw new Error('hero title missing');
  ok('home renders app shell + hero');

  await go('#/learn');
  await waitFor(() => document.querySelectorAll('.diagnosis-card').length >= 5);
  if (document.querySelector('[data-level]')?.value !== '1') throw new Error('learn should default to basic level');
  if (!document.querySelector('[data-pager]')?.textContent.includes('页')) throw new Error('pagination missing');
  if (document.querySelectorAll('.diagnosis-card').length > 24) throw new Error('pagination rendered too many cards');
  const nextPage = document.querySelector('[data-page-next]');
  if (nextPage && !nextPage.disabled) {
    nextPage.click();
    await waitFor(() => document.querySelector('[data-pager]')?.textContent.includes('第 2'));
    if (document.querySelectorAll('.diagnosis-card').length === 0) throw new Error('page 2 rendered no cards');
  }
  ok(`learn renders ${document.querySelectorAll('.diagnosis-card').length} cards with working pagination`);

  await go('#/learn/normal-sinus');
  await waitFor(() => document.querySelector('.article-title'));
  if (!document.querySelector('.article-title')?.textContent.includes('正常窦性心律')) throw new Error('article title wrong');
  if (!document.querySelector('.ecg-canvas')) throw new Error('article ECG canvas missing');
  ok('article renders content + ECG viewer');

  const mode12 = document.querySelector('[data-ecg-mode="12lead"]');
  const playBtn = document.querySelector('[data-ecg-play]');
  mode12?.click();
  playBtn?.click();
  await new Promise((resolve) => setTimeout(resolve, 180));
  if (!playBtn?.textContent.includes('暂停')) throw new Error('12-lead play did not start');
  document.querySelector('[data-ecg-mode="rhythm"]')?.click();
  await new Promise((resolve) => setTimeout(resolve, 120));
  if (!playBtn?.textContent.includes('暂停')) throw new Error('switching 12-lead -> rhythm stopped playback');
  playBtn?.click();
  document.querySelector('[data-ecg-textbook]')?.click();
  const textbookPanel = document.querySelector('#textbook-panel');
  if (!textbookPanel || textbookPanel.hidden) throw new Error('textbook panel did not open');
  document.querySelector('[data-ecg-textbook]')?.click();
  ok('12-lead playback, lead/view switch and textbook mode work');

  await go('#/learn/heart-conduction-anatomy');
  await waitFor(() => document.querySelector('.article-title'));
  if (!document.querySelector('.article-title')?.textContent.includes('心脏传导系统解剖')) throw new Error('topic article title wrong');
  if (!document.querySelector('#topic-objectives')) throw new Error('topic sections missing');
  if (document.querySelector('#article-ecg-canvas canvas')) throw new Error('topic should not force an ECG canvas');
  ok('theory chapter renders sections without ECG');

  await go('#/practice');
  await waitFor(() => document.querySelector('[data-start]'));
  document.querySelector('[data-start]').click();
  await waitFor(() => document.querySelector('.quiz-question'), 15000);
  document.querySelector('.option-card')?.click();
  await waitFor(() => !document.querySelector('[data-submit]')?.disabled);
  document.querySelector('[data-submit]')?.click();
  await waitFor(() => document.querySelector('.quiz-feedback'), 15000);
  if (!document.querySelector('[data-next]')) throw new Error('next button missing after answer');
  ok('practice creates question, accepts selection, renders feedback');

  await go('#/lab');
  await waitFor(() => document.querySelector('[data-k-slider]'));
  const kSlider = document.querySelector('[data-k-slider]');
  kSlider.value = '6.9';
  kSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
  if (!document.querySelector('[data-k-value]')?.textContent.includes('6.9')) throw new Error('lab slider did not update');
  ok('lab renders two viewers and updates potassium state');

  await go('#/me');
  await waitFor(() => document.querySelector('.profile-name'));
  if (!document.querySelector('.profile-name')?.textContent) throw new Error('profile missing');
  ok('me page renders profile and stats');

  await go('#/sim');
  await waitFor(() => document.querySelectorAll('.scenario-card').length >= 5);
  ok(`simulation list renders ${document.querySelectorAll('.scenario-card').length} scenarios`);

  document.querySelector('[data-start-scenario]').click();
  await waitFor(() => document.querySelector('[data-cpr-toggle]'), 15000);
  if (!document.querySelector('[data-quick-iv-action]')) throw new Error('quick IV access missing');
  document.querySelector('[data-cpr-toggle]').click();
  await waitFor(() => document.querySelector('[data-cpr-label]')?.textContent.includes('按压中'), 8000);
  await waitFor(() => document.querySelector('[data-vital-hr] .vital-label')?.textContent.includes('按压频率'), 8000);
  document.querySelector('[data-action="finish"]').click();
  await waitFor(() => document.querySelector('.modal [data-ok]'), 4000);
  document.querySelector('.modal [data-ok]').click();
  await waitFor(() => document.querySelector('.debrief-score'), 15000);
  if (!document.querySelector('.debrief-score')?.textContent) throw new Error('debrief score missing');
  ok('simulation starts, quick IV visible, CPR shows compression-rate vitals, finish renders debrief');

  await go('#/admin');
  await waitFor(() => document.querySelector('.admin-login'));
  if (!document.querySelector('[data-admin-login]')) throw new Error('admin login form missing');
  ok('admin route protects console with login form');

  const relevantErrors = errors.filter((line) => !line.includes('Not implemented'));
  if (relevantErrors.length) throw new Error(`console errors: ${relevantErrors.slice(0, 4).join(' | ')}`);
  console.log(`\nUI smoke passed: ${passed} groups, 0 console errors`);
  dom.window.close();
  process.exit(0);
} catch (error) {
  console.error('\nUI smoke FAILED:', error.message);
  console.error('console errors:', errors.slice(0, 8));
  console.error('route text:', (document.querySelector('#view-root')?.textContent || '').slice(0, 800));
  console.error('error panel:', document.querySelector('.error-panel')?.textContent || '');
  console.error('toast:', document.querySelector('#toast-region')?.textContent || '');
  console.error('start button:', document.querySelector('[data-start]')?.outerHTML || 'none');
  console.error('cards:', document.querySelectorAll('.diagnosis-card').length, 'level:', document.querySelector('[data-level]')?.value);
  dom.window.close();
  process.exit(1);
}
