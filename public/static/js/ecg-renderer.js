const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261110ai';
const { ECGSession, LEAD_NAMES } = await import(`./ecg-engine.js${__asset}`);

const COLUMNS = [
  ['I', 'II', 'III'],
  ['aVR', 'aVL', 'aVF'],
  ['V1', 'V2', 'V3'],
  ['V4', 'V5', 'V6'],
];

function cssVar(el, name, fallback) {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || fallback;
}

function formatTime(t) {
  return `${t.toFixed(2)} s`;
}

export class ECGViewer {
  constructor(root, spec, options = {}) {
    if (!(root instanceof HTMLElement)) throw new Error('ECGViewer root must be an element');
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) spec = {};
    this.root = root;
    this.spec = spec;
    this.options = {
      mode: 'rhythm',
      lead: spec.primaryLead || 'II',
      speed: 1,
      showAnnotations: true,
      showSummary: true,
      mini: false,
      autoPlay: false,
      playbackMode: 'sweep',
      loop: true,
      textbook: false,
      ...options,
    };
    this.rhythmSession = new ECGSession(spec);
    this.twelveSession = null;
    this.playback = this.options.playbackMode === 'scroll' ? 'scroll' : 'sweep';
    this.loop = this.options.loop !== false;
    this.progress = null;
    this.twelveProgress = null;
    this.scrollSession = null;
    this.scrollOffset = 0;
    this.scrollLast = 0;
    this.sweepLayer = null;
    this.sweepLayerCtx = null;
    this.sweepLayerKey = '';
    this.playing = false;
    this.raf = 0;
    this.hover = null;
    this.destroyed = false;

    this.shell = document.createElement('div');
    this.shell.className = 'ecg-canvas-shell';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ecg-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', this.ariaLabel());
    this.shell.appendChild(this.canvas);
    this.root.appendChild(this.shell);

    this.ctx = this.canvas.getContext('2d');
    this.onResize = this.onResize.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.root);
    const MutationObserverClass = typeof window !== 'undefined' ? window.MutationObserver : undefined;
    if (MutationObserverClass) {
      this.themeObserver = new MutationObserverClass(() => {
        this.sweepLayer = null;
        this.sweepLayerCtx = null;
        this.sweepLayerKey = '';
        this.draw();
      });
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        this.togglePlay();
      }
    });
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.options.autoPlay = false;
    }
    this.resizeToParent();
    if (this.options.autoPlay) this.play();
  }

  ariaLabel() {
    const summary = this.rhythmSession.summary();
    const playback = this.options.mode === '12lead' ? '十二导联实时滚动' : this.playback === 'scroll' ? '连续滚动' : '循环覆盖';
    return `心电图演示，${this.options.mode === '12lead' ? '十二导联' : this.options.lead + ' 导联'}，${playback}。${summary.description || ''} 心率约 ${summary.rateText}。`;
  }

  resizeToParent() {
    const mini = this.options.mini;
    const mode = this.options.mode;
    const viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || 390;
    const measured = this.root.clientWidth
      || this.root.getBoundingClientRect?.().width
      || this.root.parentElement?.clientWidth
      || 0;
    const safeWidth = Math.max(260, viewportWidth - 24);
    const parentWidth = measured > 0 ? Math.min(measured, safeWidth) : Math.min(760, safeWidth);
    let width = Math.max(parentWidth, mini ? 120 : mode === '12lead' ? 780 : 320);
    let height;
    if (mini) height = 62;
    else if (mode === '12lead') {
      if (this.options.twelveLayout === 'rows') height = 12 * (88 + 6) + 14;
      else height = 3 * 116 + (this.options.twelveRhythm === false ? 0 : 128) + 14;
    } else height = parentWidth < 560 ? 196 : 248;
    this.cssWidth = width;
    this.cssHeight = height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const scrollable = mode === '12lead' && width > parentWidth;
    this.shell.style.overflowX = scrollable ? 'auto' : 'visible';
    // CSS has overflow-y:hidden; visible+hidden computes to auto and creates a
    // phantom horizontal scrollbar. Set both axes explicitly when not scrolling.
    this.shell.style.overflowY = scrollable ? 'hidden' : 'visible';
    if (mini) {
      this.shell.style.overflowX = 'visible';
      this.shell.style.overflowY = 'visible';
    }
    this.prepareCanvas();
    this.draw();
  }

  prepareCanvas() {
    const dprCap = window.matchMedia?.('(max-width: 719px)').matches ? 1.5 : 2;
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.cssWidth * dpr);
    this.canvas.height = Math.round(this.cssHeight * dpr);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sweepLayer = null;
    this.sweepLayerCtx = null;
    this.sweepLayerKey = '';
  }

  onResize() {
    this.resizeToParent();
  }

  onPointerMove(event) {
    if (this.options.mini) return;
    const rect = this.canvas.getBoundingClientRect();
    this.hover = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    this.scheduleDraw();
  }

  onPointerDown(event) {
    if (this.options.mini) return;
    this.onPointerMove(event);
  }

  onPointerLeave() {
    this.hover = null;
    this.scheduleDraw();
  }

  scheduleDraw() {
    if (this.drawScheduled || this.destroyed) return;
    this.drawScheduled = true;
    requestAnimationFrame(() => {
      this.drawScheduled = false;
      this.draw();
    });
  }

  setMode(mode) {
    if (mode === this.options.mode) return;
    const wasPlaying = this.playing;
    this.pause();
    this.options.mode = mode;
    this.progress = null;
    this.twelveProgress = null;
    this.resizeToParent();
    if (wasPlaying) this.play();
  }

  setTwelveLayout(layout) {
    this.options.twelveLayout = layout === 'rows' ? 'rows' : 'grid';
    this.resizeToParent();
  }

  setTwelveRhythm(show) {
    this.options.twelveRhythm = Boolean(show);
    if (this.options.mode === '12lead') this.resizeToParent();
  }

  setPlayback(mode) {
    const next = mode === 'scroll' ? 'scroll' : 'sweep';
    if (next === this.playback) return;
    const wasPlaying = this.playing;
    this.pause();
    this.playback = next;
    this.progress = null;
    this.scrollOffset = 0;
    this.sweepLayer = null;
    this.sweepLayerCtx = null;
    this.sweepLayerKey = '';
    this.canvas.setAttribute('aria-label', this.ariaLabel());
    this.draw();
    this.root.dispatchEvent(new CustomEvent('ecg:playbackchange', { bubbles: true, detail: { mode: next } }));
    if (wasPlaying) this.play();
  }

  setTextbook(show) {
    this.options.textbook = Boolean(show);
    this.draw();
  }

  refreshSpec(spec) {
    if (!spec || typeof spec !== 'object') return;
    const wasPlaying = this.playing;
    if (wasPlaying) {
      cancelAnimationFrame(this.raf);
      this.playing = false;
    }
    this.spec = spec;
    this.rhythmSession = new ECGSession(spec);
    this.scrollSession = null;
    this.twelveSession = null;
    this.sweepLayer = null;
    this.sweepLayerCtx = null;
    this.sweepLayerKey = '';
    this.canvas.setAttribute('aria-label', this.ariaLabel());
    this.draw();
    if (wasPlaying) this.play(this.options.speed);
  }

  setSpec(spec) {
    this.pause();
    this.spec = spec;
    this.rhythmSession = new ECGSession(spec);
    this.twelveSession = null;
    this.scrollSession = null;
    this.scrollOffset = 0;
    this.twelveProgress = null;
    this.sweepLayer = null;
    this.sweepLayerCtx = null;
    this.sweepLayerKey = '';
    this.options.lead = spec.primaryLead || 'II';
    this.progress = null;
    this.canvas.setAttribute('aria-label', this.ariaLabel());
    this.resizeToParent();
  }

  setLead(lead) {
    const wasPlaying = this.playing;
    this.pause();
    this.options.lead = lead;
    this.progress = null;
    this.scrollOffset = 0;
    this.sweepLayer = null;
    this.sweepLayerCtx = null;
    this.sweepLayerKey = '';
    this.canvas.setAttribute('aria-label', this.ariaLabel());
    this.draw();
    if (wasPlaying) this.play();
  }

  setSpeed(speed) {
    this.options.speed = Math.max(0.25, Math.min(4, Number(speed) || 1));
    this.scrollLast = performance.now();
  }

  setAnnotations(show) {
    this.options.showAnnotations = Boolean(show);
    this.draw();
  }

  windowSeconds() {
    const configured = Number(this.options.scrollWindow);
    if (configured > 0) return configured;
    return this.cssWidth < 600 ? 5 : 8;
  }

  getScrollSession() {
    if (!this.scrollSession) {
      this.scrollSession = new ECGSession({
        ...this.rhythmSession.spec,
        duration: 30,
        annotations: [],
        seed: (this.rhythmSession.spec.seed || 11) + 17,
      });
    }
    return this.scrollSession;
  }

  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }

  play(speed = this.options.speed) {
    if (this.options.mini) return;
    this.options.speed = Math.max(0.25, Math.min(4, Number(speed) || this.options.speed || 1));
    cancelAnimationFrame(this.raf);
    this.playing = true;
    this.scrollLast = performance.now();
    this.lastPaintAt = 0;
    if (this.options.mode === '12lead') {
      this.twelveProgress = 0;
      this.draw();
    } else if (this.playback === 'sweep') {
      if (this.progress == null) this.progress = 0;
      this.ensureSweepLayer();
    } else {
      const maxOffset = Math.max(0.1, this.getScrollSession().duration - this.windowSeconds());
      if (this.scrollOffset > maxOffset) this.scrollOffset = 0;
    }
    const frameInterval = 1000 / (this.options.fps || (window.matchMedia?.('(max-width: 719px)').matches ? 30 : 45));
    const tick = (now) => {
      if (!this.playing || this.destroyed) return;
      if (document.hidden) { this.raf = requestAnimationFrame(tick); return; }
      const dt = Math.min(0.12, Math.max(0, (now - this.scrollLast) / 1000));
      this.scrollLast = now;
      const speedNow = this.options.speed;
      if (this.options.mode === '12lead') {
        this.twelveProgress = ((this.twelveProgress ?? 0) + dt * speedNow) % 10;
      } else if (this.playback === 'scroll') {
        const bufferDuration = this.getScrollSession().duration;
        const maxOffset = Math.max(0.1, bufferDuration - this.windowSeconds());
        this.scrollOffset = (this.scrollOffset + dt * speedNow) % maxOffset;
      } else {
        const duration = Math.max(0.5, this.rhythmSession.duration);
        const previous = this.progress ?? 0;
        this.progress = (previous + dt * speedNow) % duration;
        this.paintSweepSegment(previous, this.progress);
        this.clearSweepGap(this.progress);
      }
      if (now - (this.lastPaintAt || 0) >= frameInterval) {
        this.lastPaintAt = now;
        this.draw();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.root.dispatchEvent(new CustomEvent('ecg:play', { bubbles: true }));
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.twelveProgress = null;
    if (this.playback === 'sweep') this.progress = null;
    this.draw();
    this.root.dispatchEvent(new CustomEvent('ecg:pause', { bubbles: true }));
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    if (this.themeObserver) this.themeObserver.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.shell.remove();
  }

  colors() {
    return {
      paper: cssVar(this.root, '--ecg-bg', '#fff8f4'),
      minor: cssVar(this.root, '--ecg-grid-minor', '#f3d4cd'),
      major: cssVar(this.root, '--ecg-grid-major', '#e7b2a8'),
      trace: cssVar(this.root, '--ecg-trace', '#143c3a'),
      glow: cssVar(this.root, '--ecg-glow', 'rgba(20,118,110,.2)'),
      text: cssVar(this.root, '--ink', '#14272b'),
      muted: cssVar(this.root, '--muted', '#6d8184'),
      brand: cssVar(this.root, '--brand', '#0e766e'),
      accent: cssVar(this.root, '--accent', '#df5a4f'),
      danger: cssVar(this.root, '--danger', '#c53b3b'),
      warn: cssVar(this.root, '--warn', '#b36b16'),
      gold: cssVar(this.root, '--gold', '#b98a3d'),
      surface: cssVar(this.root, '--surface', '#fffdf9'),
      line: cssVar(this.root, '--line', 'rgba(20,39,43,.12)'),
    };
  }

  toneColor(colors, tone) {
    const map = {
      brand: colors.brand,
      teal: colors.brand,
      gold: colors.gold,
      warn: colors.warn,
      danger: colors.danger,
      accent: colors.accent,
      muted: colors.muted,
    };
    return map[tone] || colors.brand;
  }

  draw() {
    if (this.destroyed) return;
    const ctx = this.ctx;
    const colors = this.colors();
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
    if (this.options.mini) {
      this.drawMini(colors);
      return;
    }
    if (this.options.mode === '12lead') {
      this.draw12Lead(colors);
    } else if (this.playback === 'scroll') {
      this.drawScroll(colors);
    } else {
      this.drawRhythm(colors);
      if (this.options.textbook) this.drawTextbook(colors);
    }
    this.drawHover(colors);
  }

  drawPaper(x, y, w, h, colors, pxPerMm) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const minorStep = pxPerMm;
    const majorStep = pxPerMm * 5;
    if (pxPerMm >= 1.6) {
      ctx.globalAlpha = 0.62;
      ctx.strokeStyle = colors.minor;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      for (let gx = x; gx <= x + w + 0.5; gx += minorStep) {
        ctx.moveTo(Math.round(gx) + 0.25, y);
        ctx.lineTo(Math.round(gx) + 0.25, y + h);
      }
      for (let gy = y; gy <= y + h + 0.5; gy += minorStep) {
        ctx.moveTo(x, Math.round(gy) + 0.25);
        ctx.lineTo(x + w, Math.round(gy) + 0.25);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = colors.major;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let gx = x; gx <= x + w + 0.5; gx += majorStep) {
      ctx.moveTo(Math.round(gx) + 0.5, y);
      ctx.lineTo(Math.round(gx) + 0.5, y + h);
    }
    for (let gy = y; gy <= y + h + 0.5; gy += majorStep) {
      ctx.moveTo(x, Math.round(gy) + 0.5);
      ctx.lineTo(x + w, Math.round(gy) + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawRhythm(colors) {
    const ctx = this.ctx;
    const padLeft = 38;
    const padRight = 14;
    const padTop = 26;
    const padBottom = 20;
    const plotW = this.cssWidth - padLeft - padRight;
    const plotH = this.cssHeight - padTop - padBottom;
    const duration = this.rhythmSession.duration;
    const pxPerMm = plotW / (duration * 25);
    const baseline = padTop + plotH * 0.58;
    const pxPerSec = plotW / duration;
    const lead = this.options.lead || this.rhythmSession.primaryLead;
    const result = this.rhythmSession.lead(lead);
    const mmToPx = pxPerMm;
    const yFor = (mv) => baseline - mv * 10 * mmToPx;

    this.drawPaper(padLeft, padTop, plotW, plotH, colors, pxPerMm);

    // 导联标签与校准
    ctx.fillStyle = colors.text;
    ctx.font = '700 13px "SF Mono", ui-monospace, monospace';
    ctx.fillText(lead, 10, padTop + 14);
    ctx.fillStyle = colors.muted;
    ctx.font = '500 9.5px "SF Mono", ui-monospace, monospace';
    ctx.fillText('25 mm/s · 10 mm/mV', padLeft + 4, this.cssHeight - 6);

    // 校准脉冲
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const calX = 9;
    const calY = this.cssHeight - 26;
    ctx.moveTo(calX, calY);
    ctx.lineTo(calX + 4, calY);
    ctx.lineTo(calX + 4, calY - 10 * mmToPx);
    ctx.lineTo(calX + 9, calY - 10 * mmToPx);
    ctx.lineTo(calX + 9, calY);
    ctx.lineTo(calX + 14, calY);
    ctx.stroke();

    // 覆盖模式：波形绘制在持久层上，旧迹不擦除，扫描点向右覆盖。
    if (this.playing && this.progress != null) {
      this.ensureSweepLayer();
      this.clearSweepGap(this.progress);
      if (this.sweepLayer) {
        ctx.drawImage(this.sweepLayer, 0, 0, this.cssWidth, this.cssHeight);
      }
      const x = padLeft + this.progress * pxPerSec;
      const idx = Math.min(result.samples.length - 1, Math.round(this.progress * result.sampleRate));
      const y = yFor(result.samples[idx]);
      ctx.save();
      ctx.beginPath();
      ctx.rect(padLeft, padTop, plotW, plotH);
      ctx.clip();
      ctx.fillStyle = colors.brand;
      ctx.globalAlpha = 0.07;
      ctx.fillRect(x - 7, padTop, 14, plotH);
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = colors.brand;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.brand;
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (this.options.showSummary !== false) {
        const summary = result.summary;
        ctx.fillStyle = colors.muted;
        ctx.font = '500 10.5px "SF Mono", ui-monospace, monospace';
        const text = `${summary.rateText}${summary.pr ? ` · PR ${summary.pr.toFixed(2)}s` : ''}${summary.qrs ? ` · QRS ${summary.qrs.toFixed(2)}s` : ''}`;
        ctx.textAlign = 'right';
        ctx.fillText(text, this.cssWidth - padRight, this.cssHeight - 6);
        ctx.textAlign = 'left';
      }
      return;
    }

    // 波形
    const progress = this.progress == null ? duration : this.progress;
    const showFull = this.options.reveal === false;
    const maxIndex = showFull ? result.samples.length - 1 : Math.min(result.samples.length - 1, Math.floor(progress * result.sampleRate));
    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();
    // 循环覆盖模式：保留上一轮完整波形作为淡影，当前扫描前沿逐点覆盖。
    if (this.progress != null && !showFull) {
      ctx.globalAlpha = 0.13;
      ctx.strokeStyle = colors.trace;
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      for (let i = 0; i < result.samples.length; i += 1) {
        const x = padLeft + (i / result.sampleRate) * pxPerSec;
        const y = yFor(result.samples[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (colors.glow && colors.glow !== 'rgba(0, 0, 0, 0)') {
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 7;
    }
    ctx.strokeStyle = colors.trace;
    ctx.lineWidth = 1.55;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= maxIndex; i += 1) {
      const x = padLeft + (i / result.sampleRate) * pxPerSec;
      const y = yFor(result.samples[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (progress < duration) {
      const x = padLeft + progress * pxPerSec;
      const idx = Math.min(result.samples.length - 1, Math.round(progress * result.sampleRate));
      const y = yFor(result.samples[idx]);
      ctx.fillStyle = colors.brand;
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.brand;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (this.options.showAnnotations && this.progress == null && !this.options.textbook) {
      this.drawAnnotations(colors, padLeft, padTop, plotW, plotH, pxPerSec, result, yFor);
    }

    // 小结
    if (this.options.showSummary !== false) {
      const summary = result.summary;
      ctx.fillStyle = colors.muted;
      ctx.font = '500 10.5px "SF Mono", ui-monospace, monospace';
      const text = `${summary.rateText}${summary.pr ? ` · PR ${summary.pr.toFixed(2)}s` : ''}${summary.qrs ? ` · QRS ${summary.qrs.toFixed(2)}s` : ''}`;
      ctx.textAlign = 'right';
      ctx.fillText(text, this.cssWidth - padRight, this.cssHeight - 6);
      ctx.textAlign = 'left';
    }
  }

  sweepGeometry() {
    const lead = this.options.lead || this.rhythmSession.primaryLead;
    const result = this.rhythmSession.lead(lead);
    const padLeft = 38;
    const padRight = 14;
    const padTop = 26;
    const padBottom = 20;
    const plotW = this.cssWidth - padLeft - padRight;
    const plotH = this.cssHeight - padTop - padBottom;
    const duration = this.rhythmSession.duration;
    const pxPerSec = plotW / duration;
    const pxPerMm = plotW / (duration * 25);
    const baseline = padTop + plotH * 0.58;
    return { lead, result, padLeft, padRight, padTop, padBottom, plotW, plotH, duration, pxPerSec, pxPerMm, baseline };
  }

  ensureSweepLayer() {
    const g = this.sweepGeometry();
    const key = [this.options.lead, this.rhythmSession.spec.seed, this.rhythmSession.spec.rhythm, this.rhythmSession.duration, this.cssWidth, this.cssHeight, this.dpr].join('|');
    if (this.sweepLayer && this.sweepLayerKey === key) return this.sweepLayer;
    const layer = document.createElement('canvas');
    layer.width = this.canvas.width;
    layer.height = this.canvas.height;
    const layerCtx = layer.getContext('2d');
    layerCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.sweepLayer = layer;
    this.sweepLayerCtx = layerCtx;
    this.sweepLayerKey = key;
    this.paintSweepGhost(g);
    return layer;
  }

  paintSweepGhost(g = this.sweepGeometry()) {
    const ctx = this.sweepLayerCtx;
    if (!ctx) return;
    const colors = this.colors();
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.padLeft, g.padTop, g.plotW, g.plotH);
    ctx.clip();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = colors.trace;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < g.result.samples.length; i += 1) {
      const x = g.padLeft + (i / g.result.sampleRate) * g.pxPerSec;
      const y = g.baseline - g.result.samples[i] * 10 * g.pxPerMm;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  paintSweepSegment(from, to) {
    this.ensureSweepLayer();
    const ctx = this.sweepLayerCtx;
    if (!ctx) return;
    const g = this.sweepGeometry();
    const colors = this.colors();
    const paintRange = (a, b) => {
      if (!Number.isFinite(a) || !Number.isFinite(b) || b - a <= 0.0005) return;
      const i0 = Math.max(0, Math.floor((a - 0.004) * g.result.sampleRate));
      const i1 = Math.min(g.result.samples.length - 1, Math.ceil((b + 0.004) * g.result.sampleRate));
      if (i1 < i0) return;
      ctx.beginPath();
      for (let i = i0; i <= i1; i += 1) {
        const x = g.padLeft + (i / g.result.sampleRate) * g.pxPerSec;
        const y = g.baseline - g.result.samples[i] * 10 * g.pxPerMm;
        if (i === i0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.padLeft, g.padTop, g.plotW, g.plotH);
    ctx.clip();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.trace;
    ctx.lineWidth = 1.55;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (this.sweepLayer && colors.glow && colors.glow !== 'rgba(0, 0, 0, 0)') {
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 5;
    }
    if (to < from) {
      paintRange(from, g.duration);
      paintRange(0, to);
    } else {
      paintRange(from, to);
    }
    ctx.restore();
  }

  resetSweepLayer() {
    this.sweepLayer = null;
    this.sweepLayerCtx = null;
    this.sweepLayerKey = '';
  }

  sampleInterpolated(result, seconds) {
    const duration = result.duration || result.samples.length / result.sampleRate;
    const wrapped = ((seconds % duration) + duration) % duration;
    const position = wrapped * result.sampleRate;
    const i0 = Math.max(0, Math.min(result.samples.length - 1, Math.floor(position)));
    const i1 = Math.min(result.samples.length - 1, i0 + 1);
    const fraction = position - i0;
    return result.samples[i0] * (1 - fraction) + result.samples[i1] * fraction;
  }

  clearSweepGap(progress) {
    if (!this.sweepLayerCtx || !Number.isFinite(progress)) return;
    const g = this.sweepGeometry();
    const x = g.padLeft + progress * g.pxPerSec;
    const gap = Math.max(12, Math.min(26, Math.round(g.pxPerSec * 0.12)));
    const start = Math.max(g.padLeft, Math.min(g.padLeft + g.plotW, x + 1));
    const width = Math.min(gap, g.padLeft + g.plotW - start);
    if (width > 0) this.sweepLayerCtx.clearRect(start, g.padTop, width, g.plotH);
  }

  drawScroll(colors) {
    const ctx = this.ctx;
    const padLeft = 38;
    const padRight = 14;
    const padTop = 26;
    const padBottom = 20;
    const plotW = this.cssWidth - padLeft - padRight;
    const plotH = this.cssHeight - padTop - padBottom;
    const session = this.getScrollSession();
    const lead = this.options.lead || this.rhythmSession.primaryLead;
    const result = session.lead(lead);
    const windowSeconds = this.windowSeconds();
    const bufferDuration = result.duration;
    const maxOffset = Math.max(0.1, bufferDuration - windowSeconds);
    if (!Number.isFinite(this.scrollOffset) || this.scrollOffset < 0) this.scrollOffset = 0;
    this.scrollOffset %= maxOffset;
    const offset = this.scrollOffset;
    const pxPerSec = plotW / windowSeconds;
    const pxPerMm = plotW / (windowSeconds * 25);
    const baseline = padTop + plotH * 0.58;
    const yFor = (mv) => baseline - mv * 10 * pxPerMm;

    this.drawPaper(padLeft, padTop, plotW, plotH, colors, pxPerMm);
    ctx.fillStyle = colors.text;
    ctx.font = '700 13px "SF Mono", ui-monospace, monospace';
    ctx.fillText(lead, 10, padTop + 14);
    ctx.fillStyle = colors.muted;
    ctx.font = '500 9.5px "SF Mono", ui-monospace, monospace';
    ctx.fillText('25 mm/s · 10 mm/mV', padLeft + 4, this.cssHeight - 6);
    ctx.textAlign = 'right';
    ctx.fillStyle = colors.brand;
    ctx.font = '600 9px "SF Mono", ui-monospace, monospace';
    ctx.fillText('LIVE · SCROLL', this.cssWidth - padRight, padTop + 12);
    ctx.textAlign = 'left';

    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();
    if (colors.glow && colors.glow !== 'rgba(0, 0, 0, 0)') {
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 7;
    }
    ctx.strokeStyle = colors.trace;
    ctx.lineWidth = 1.55;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const steps = Math.max(2, Math.ceil(plotW * 2));
    for (let i = 0; i <= steps; i += 1) {
      const t = offset + (i / steps) * windowSeconds;
      const x = padLeft + (i / steps) * plotW;
      const y = yFor(this.sampleInterpolated(result, t));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    const leadIdx = Math.max(0, Math.min(result.samples.length - 1, Math.round(((offset + windowSeconds) % bufferDuration) * result.sampleRate)));
    const leadY = yFor(result.samples[leadIdx]);
    ctx.fillStyle = colors.brand;
    ctx.beginPath();
    ctx.arc(padLeft + plotW - 2, leadY, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.brand;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(padLeft + plotW - 2, padTop);
    ctx.lineTo(padLeft + plotW - 2, padTop + plotH);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.options.showSummary !== false) {
      const summary = result.summary;
      ctx.fillStyle = colors.muted;
      ctx.font = '500 10.5px "SF Mono", ui-monospace, monospace';
      const text = `${summary.rateText}${summary.pr ? ` · PR ${summary.pr.toFixed(2)}s` : ''}${summary.qrs ? ` · QRS ${summary.qrs.toFixed(2)}s` : ''}`;
      ctx.textAlign = 'right';
      ctx.fillText(text, this.cssWidth - padRight, this.cssHeight - 6);
      ctx.textAlign = 'left';
    }
  }

  drawTextbook(colors) {
    const schedule = this.rhythmSession.schedule || {};
    const beats = (schedule.beats || []).filter((beat) => beat.t > 0.45);
    if (!beats.length) return;
    const spec = this.rhythmSession.spec;
    const beat = beats.find((b) => b.pTime != null) || beats[0];
    const padLeft = 38;
    const padRight = 14;
    const padTop = 26;
    const padBottom = 20;
    const plotW = this.cssWidth - padLeft - padRight;
    const plotH = this.cssHeight - padTop - padBottom;
    const duration = this.rhythmSession.duration;
    const pxPerSec = plotW / duration;
    const baseline = padTop + plotH * 0.58;
    const pxPerMm = plotW / (duration * 25);
    const yFor = (mv) => baseline - mv * 10 * pxPerMm;
    const qrsWidth = Math.max(0.06, spec.qrs || 0.08);
    const qt = spec.qt || 0.4;
    const qrsT = beat.t;
    const pT = beat.pTime;
    const tT = qrsT + qt * 0.66;
    const tEnd = qrsT + qt;
    const ctx = this.ctx;

    const bands = [];
    if (pT != null) bands.push({ x0: pT - 0.06, x1: pT + 0.065, color: colors.brand, alpha: 0.14, label: 'P', row: 0, anchor: pT });
    bands.push({ x0: qrsT - qrsWidth / 2 - 0.015, x1: qrsT + qrsWidth / 2 + 0.035, color: colors.accent, alpha: 0.16, label: 'QRS', row: 1, anchor: qrsT });
    bands.push({ x0: tT - 0.085, x1: tT + 0.085, color: colors.gold, alpha: 0.15, label: 'T', row: 2, anchor: tT });

    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();
    for (const band of bands) {
      const x0 = padLeft + band.x0 * pxPerSec;
      const x1 = padLeft + band.x1 * pxPerSec;
      if (x1 < padLeft || x0 > padLeft + plotW) continue;
      ctx.globalAlpha = band.alpha;
      ctx.fillStyle = band.color;
      ctx.fillRect(Math.max(padLeft, x0), padTop, Math.min(plotW, x1 - x0), plotH);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = band.color;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, padTop);
      ctx.lineTo(x0, padTop + plotH);
      ctx.moveTo(x1, padTop);
      ctx.lineTo(x1, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 在波形上方/下方放置教科书标签，短标签 + 分行避免文字互相覆盖。
    for (const band of bands) {
      const x = padLeft + band.anchor * pxPerSec;
      const idx = Math.max(0, Math.min(this.rhythmSession.lead(this.options.lead).samples.length - 1, Math.round(band.anchor * 500)));
      const waveY = yFor(this.rhythmSession.lead(this.options.lead).samples[idx]);
      const labelY = padTop + 15 + band.row * 16;
      ctx.strokeStyle = band.color;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(x, labelY + 4);
      ctx.lineTo(x, waveY - 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      this.drawLabel(band.label, Math.min(padLeft + plotW - 18, Math.max(padLeft + 18, x)), labelY, band.color, colors, 'center');
    }

    // 间期标尺：PR / QRS / QT，分行放置，数值由下方教科书面板解释。
    const bracketBase = padTop + plotH - 8;
    const drawInterval = (label, t0, t1, tone, row) => {
      const x0 = padLeft + t0 * pxPerSec;
      const x1 = padLeft + t1 * pxPerSec;
      const color = this.toneColor(colors, tone);
      const bracketY = bracketBase - row * 14;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, bracketY - 3);
      ctx.lineTo(x0, bracketY);
      ctx.lineTo(x1, bracketY);
      ctx.lineTo(x1, bracketY - 3);
      ctx.stroke();
      this.drawLabel(label, (x0 + x1) / 2, bracketY - 7, color, colors, 'center');
    };
    if (this.cssWidth >= 600) {
      if (pT != null) drawInterval('PR', pT, qrsT, 'brand', 0);
      drawInterval('QRS', qrsT - qrsWidth / 2, qrsT + qrsWidth / 2, 'accent', 1);
      drawInterval('QT', qrsT, tEnd, 'gold', 2);
    }
  }

  snapAnnotation(ann) {
    const schedule = this.rhythmSession.schedule || {};
    const beats = schedule.beats || [];
    const spec = this.rhythmSession.spec;
    const qt = spec.qt || 0.4;
    const qrs = spec.qrs || 0.08;
    const pTimes = [
      ...beats.filter((b) => b.pTime != null).map((b) => b.pTime),
      ...(schedule.pWaves || []).map((p) => p.t),
    ].filter((t) => Number.isFinite(t) && t >= 0);
    const qrsTimes = beats.map((b) => b.t);
    const tTimes = qrsTimes.map((t) => t + qt * 0.66);
    const uTimes = tTimes.map((t) => t + 0.11);
    const ectopicBeats = beats.filter((b) => b.ectopic || ['pvc', 'pac', 'pjc'].includes(b.type));
    const wideBeats = beats.filter((b) => b.ectopic || (b.qrsWidth || qrs) >= 0.12);
    const sinusBeats = beats.filter((b) => b.type === 'sinus' || b.type === 'atrial');
    const ectopicP = ectopicBeats.filter((b) => b.pTime != null).map((b) => b.pTime);
    const ectopicQrs = ectopicBeats.map((b) => b.t);
    const wideQrs = wideBeats.map((b) => b.t);
    const ectopicT = ectopicQrs.map((t) => t + qt * 0.66);
    const sinusQrs = sinusBeats.map((b) => b.t);
    const nearest = (times, target, maxDistance = 0.9) => {
      let best = null;
      let bestDistance = maxDistance;
      for (const t of times) {
        const d = Math.abs(t - target);
        if (d < bestDistance) {
          best = t;
          bestDistance = d;
        }
      }
      return best;
    };
    const label = String(ann.label || '');
    if (ann.kind === 'arrow') {
      let next = null;
      if (/PVC|室性/i.test(label)) next = nearest(wideQrs, ann.t) ?? nearest(ectopicQrs, ann.t);
      else if (/P′|P'|房性|房早/.test(label)) next = nearest(ectopicP, ann.t, 1.2);
      else if (/前无\s*P|逆行\s*P/.test(label)) next = nearest(ectopicQrs, ann.t);
      else if (/宽\s*QRS/i.test(label)) next = nearest(wideQrs, ann.t);
      else if (/窦性搏动/.test(label)) next = nearest(sinusQrs, ann.t);
      else if (!/PR|ST/i.test(label)) {
        if (/^P$|P\s*波|窦性\s*P|异常\s*P|P波/.test(label)) next = nearest(pTimes, ann.t);
        else if (/QRS|R\s*波|(^|\s)R(\s|$)/.test(label)) next = nearest(qrsTimes, ann.t);
        else if (/U\s*波|U波/.test(label)) next = nearest(uTimes, ann.t);
        else if (/^T$|T\s*波|T波/.test(label) && !/ST/i.test(label)) {
          next = /反向/.test(label) && ectopicT.length ? nearest(ectopicT, ann.t) : nearest(tTimes, ann.t);
        }
      }
      if (next != null) return { ...ann, t: next };
      if (/^P$|^T$|P\s*波|T\s*波|PVC|室性|宽\s*QRS|QRS|P′|P'|房性|窦性搏动|逆行\s*P|前无\s*P/i.test(label)) return null;
      return ann;
    }
    if (ann.kind === 'bracket') {
      const mid = (Number(ann.t0) + Number(ann.t1)) / 2;
      if (/代偿间歇/.test(label) && ectopicQrs.length) {
        const ect = ectopicQrs[0];
        const nextSinus = sinusQrs.find((t) => t > ect);
        if (nextSinus != null) return { ...ann, t0: ect, t1: nextSinus };
      }
      if (/PR|P-R/.test(label)) {
        const beat = beats.reduce((best, b) => (b.pTime != null && Math.abs(b.t - mid) < Math.abs((best?.t ?? Infinity) - mid) ? b : best), null);
        if (beat && beat.pTime != null) return { ...ann, t0: beat.pTime, t1: beat.t };
      }
      if (/QRS/.test(label) && !/脱漏/.test(label)) {
        const q = nearest(wideQrs, mid) ?? nearest(qrsTimes, mid);
        if (q != null) return { ...ann, t0: q - qrs / 2, t1: q + qrs / 2 };
      }
      if (/QT/.test(label)) {
        const q = nearest(qrsTimes, Number(ann.t0) || mid);
        if (q != null) return { ...ann, t0: q, t1: q + qt };
      }
      if (/RR|R-R/.test(label)) {
        for (let i = 1; i < qrsTimes.length; i += 1) {
          const pairMid = (qrsTimes[i - 1] + qrsTimes[i]) / 2;
          if (Math.abs(pairMid - mid) < 0.8) return { ...ann, t0: qrsTimes[i - 1], t1: qrsTimes[i] };
        }
      }
    }
    return ann;
  }

  annotationLeads(ann) {
    const explicit = ann?.leads;
    if (Array.isArray(explicit)) return explicit.map(String);
    if (typeof explicit === 'string') return explicit.split(/[,，、\s]+/).filter(Boolean);
    let text = String(ann?.label || '');
    const expanded = [];
    text = text.replace(/V([1-6])\s*[–-]\s*V([1-6])/gi, (_, a, b) => {
      const lo = Math.min(Number(a), Number(b));
      const hi = Math.max(Number(a), Number(b));
      for (let i = lo; i <= hi; i += 1) expanded.push(`V${i}`);
      return '';
    });
    const matches = text.match(/aVR|aVL|aVF|V[1-6]|III|II|I/g) || [];
    const parsed = [...new Set([...expanded, ...matches])];
    if (parsed.length) return parsed;
    const rules = [
      [/PR\s*段压低/i, ['II', 'aVF', 'V4', 'V5', 'V6']],
      [/Spodick/i, ['II']],
      [/窦性搏动|窦性\s*P|P′|P'|异常\s*P|P\s*波消失|P\s*波隐藏|前无\s*P|无窦性\s*P|P\s*波变平|PR/i, ['II', 'V1']],
      [/RR|心率|频率|窦速|心动过速|心动过缓|间歇|脱漏/, ['II']],
      [/QRS|宽\s*QRS|室性逸搏|PVC|T\s*波反向|T\s*波与主波反向|振幅扭转|多形性|1:1\s*交替|代偿间歇|混沌|无组织/i, ['II', 'V1']],
      [/U\s*波/, ['V2', 'V3']],
      [/勺状\s*ST/, ['II', 'V5', 'V6']],
      [/delta/i, ['V2', 'V5']],
      [/穹隆型|Brugada/i, ['V1', 'V2']],
      [/QT.*(延长|QTc)/i, ['II', 'V5']],
      [/QT.*缩短|ST\s*段缩短|QT\s*0\.2/i, ['II', 'V5']],
      [/T\s*波高尖|高尖对称\s*T|T\s*波高尖/i, ['V2', 'V3', 'V4']],
      [/T\s*波低平/, ['II', 'V5']],
      [/T\s*波双相|T\s*波切迹/, ['V2', 'V3']],
      [/侧壁\s*ST|侧壁.*T\s*倒置|侧壁.*ST\s*压低/i, ['I', 'aVL', 'V5', 'V6']],
      [/定标|纸速|校准|电轴/, ['II']],
    ];
    for (const [re, leads] of rules) if (re.test(text)) return leads;
    return [];
  }

  drawAnnotations(colors, left, top, plotW, plotH, pxPerSec, result, yFor) {
    const ctx = this.ctx;
    const annotations = result.annotations || [];
    const currentLead = String(result.lead || '');
    let row = 0;
    for (const raw of annotations) {
      const ann = this.snapAnnotation(raw);
      if (!ann) continue;
      const labelText = String(ann.label || '');
      const annotationLeadList = this.annotationLeads(ann);
      if (currentLead && annotationLeadList.length && !annotationLeadList.includes(currentLead)) continue;
      // 基础 P/R/T 箭头会与间期标尺打架；改由教科书模式/波形本身表达。
      if (ann.kind === 'arrow' && /^(P|R|T)$/.test(labelText)) continue;
      const tone = this.toneColor(colors, ann.tone);
      ctx.strokeStyle = tone;
      ctx.fillStyle = tone;
      ctx.lineWidth = 1;
      if (ann.kind === 'bracket' && Number.isFinite(ann.t0) && Number.isFinite(ann.t1)) {
        const x0 = left + ann.t0 * pxPerSec;
        const x1 = left + ann.t1 * pxPerSec;
        const y = top + 9 + (row % 3) * 15;
        row += 1;
        ctx.beginPath();
        ctx.moveTo(x0, y + 4);
        ctx.lineTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.lineTo(x1, y + 4);
        ctx.stroke();
        this.drawLabel(String(ann.label || ''), (x0 + x1) / 2, y - 2, tone, colors, 'center');
      } else if (ann.kind === 'arrow' && Number.isFinite(ann.t)) {
        const x = left + ann.t * pxPerSec;
        if (x < left || x > left + plotW) continue;
        const idx = Math.max(0, Math.min(result.samples.length - 1, Math.round(ann.t * result.sampleRate)));
        const wy = yFor(result.samples[idx]);
        const up = ann.dir !== 'down';
        const labelY = up ? Math.max(top + 14, wy - 22) : Math.min(top + plotH - 4, wy + 26);
        ctx.beginPath();
        ctx.moveTo(x, up ? labelY + 6 : labelY - 10);
        ctx.lineTo(x, wy + (up ? -3 : 3));
        ctx.stroke();
        ctx.beginPath();
        if (up) {
          ctx.moveTo(x - 3, wy - 2);
          ctx.lineTo(x + 3, wy - 2);
          ctx.lineTo(x, wy + 3);
        } else {
          ctx.moveTo(x - 3, wy + 2);
          ctx.lineTo(x + 3, wy + 2);
          ctx.lineTo(x, wy - 3);
        }
        ctx.closePath();
        ctx.fill();
        this.drawLabel(String(ann.label || ''), x, labelY, tone, colors, 'center');
      }
    }
  }

  drawLabel(text, x, y, color, colors, align = 'center') {
    if (!text) return;
    const ctx = this.ctx;
    ctx.font = '600 10px "SF Pro Text", "PingFang SC", system-ui, sans-serif';
    const width = ctx.measureText(text).width;
    const padding = 4;
    let boxX = x - width / 2 - padding;
    if (align === 'left') boxX = x - padding;
    const boxY = y - 10;
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = colors.paper;
    this.roundRect(boxX, boxY, width + padding * 2, 13, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(text, boxX + padding, y);
  }

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  draw12Lead(colors) {
    const ctx = this.ctx;
    const padLeft = 8;
    const padRight = 8;
    const top = 8;
    const rhythmH = 128;
    const rows = 3;
    const rowH = 116;
    const gap = 3;
    const plotW = this.cssWidth - padLeft - padRight;
    const cellW = (plotW - gap * 3) / 4;
    const duration = 10;
    const progress = this.twelveProgress;

    if (this.options.twelveLayout === 'rows') {
      const rowHeight = 88;
      const rowGap = 6;
      LEAD_NAMES.forEach((lead, index) => {
        this.draw12Cell(lead, padLeft, top + index * (rowHeight + rowGap), plotW, rowHeight, 0, colors, progress, true);
      });
      return;
    }

    for (let col = 0; col < 4; col += 1) {
      for (let row = 0; row < 3; row += 1) {
        const lead = COLUMNS[col][row];
        const x = padLeft + col * (cellW + gap);
        const y = top + row * (rowH + gap);
        this.draw12Cell(lead, x, y, cellW, rowH, col, colors, progress);
      }
    }

    if (this.options.twelveRhythm === false) return;
    const ry = top + rows * (rowH + gap) + 6;
    if (!this.twelveSession) {
      this.twelveSession = new ECGSession({ ...this.rhythmSession.spec, duration: 10, start: 0.08, annotations: [] });
    }
    const result = this.twelveSession.lead('II');
    const pxPerMm = (plotW - 30) / (duration * 25);
    const baseline = ry + rhythmH * 0.56;
    this.drawPaper(padLeft + 28, ry, plotW - 28, rhythmH - 22, colors, pxPerMm);
    ctx.fillStyle = colors.text;
    ctx.font = '700 12px "SF Mono", ui-monospace, monospace';
    ctx.fillText('II', padLeft + 2, ry + 12);
    ctx.fillStyle = colors.muted;
    ctx.font = '500 9px "SF Mono", ui-monospace, monospace';
    ctx.fillText('rhythm strip', padLeft + 2, ry + 26);
    const pxPerSec = (plotW - 28) / duration;
    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft + 28, ry, plotW - 28, rhythmH - 22);
    ctx.clip();
    ctx.strokeStyle = colors.trace;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    // 播放时整条节律条向左滚动，右侧持续进入新波形；暂停时展示完整 10 s。
    const stripW = plotW - 28;
    const points = Math.max(2, Math.ceil(stripW * 1.5));
    const windowStart = progress == null ? 0 : progress - duration;
    for (let i = 0; i <= points; i += 1) {
      const frac = i / points;
      const tRaw = windowStart + frac * duration;
      const t = ((tRaw % duration) + duration) % duration;
      const x = padLeft + 28 + frac * stripW;
      const idx = Math.min(result.samples.length - 1, Math.round(t * result.sampleRate));
      const yy = baseline - result.samples[idx] * 10 * pxPerMm;
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    if (points > 0) ctx.stroke();
    if (progress != null) {
      const idx = Math.min(result.samples.length - 1, Math.round((progress % duration) * result.sampleRate));
      const cursorY = baseline - result.samples[idx] * 10 * pxPerMm;
      const cursorX = padLeft + 28 + stripW;
      ctx.fillStyle = colors.brand;
      ctx.beginPath();
      ctx.arc(cursorX - 1, cursorY, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = colors.muted;
    ctx.font = '500 9px "SF Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    const progressLabel = progress == null
      ? '12 导联 · 10 s'
      : this.options.twelveLayout === 'rows'
        ? '播放中 · 各导联 10 s 实时滚动'
        : '播放中 · 各导联同步 2.5 s 滚动窗口';
    ctx.fillText(progressLabel, padLeft + 2, this.cssHeight - 3);
    // 1 mV 校准脉冲与纸速/增益标注（12 导联底边）
    const calH = Math.min(26, 10 * pxPerMm);
    const calX = this.cssWidth - 150;
    const calY = this.cssHeight - 4;
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(calX, calY);
    ctx.lineTo(calX + 5, calY);
    ctx.lineTo(calX + 5, calY - calH);
    ctx.lineTo(calX + 13, calY - calH);
    ctx.lineTo(calX + 13, calY);
    ctx.lineTo(calX + 18, calY);
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.font = '500 8px "SF Mono", ui-monospace, monospace';
    ctx.fillText('1 mV · 25 mm/s · 10 mm/mV', calX + 23, calY - 3);
  }

  draw12Cell(lead, x, y, w, h, col, colors, progress = null, fullDuration = false) {
    const ctx = this.ctx;
    const segment = 2.5;
    const duration = 10;
    const pxPerMm = fullDuration ? w / (duration * 25) : w / (segment * 25);
    if (!this.twelveSession) {
      this.twelveSession = new ECGSession({ ...this.rhythmSession.spec, duration: 10, start: 0.08, annotations: [] });
    }
    const result = this.twelveSession.lead(lead);
    const window = fullDuration ? duration : segment;
    const startT = fullDuration ? 0 : col * segment;
    const endT = fullDuration ? duration : startT + segment;
    const baseline = y + h * 0.60;
    this.drawPaper(x, y, w, h, colors, pxPerMm);
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = colors.text;
    ctx.font = '700 11px "SF Mono", ui-monospace, monospace';
    ctx.fillText(lead, x + 5, y + 13);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = colors.trace;
    ctx.lineWidth = 1.3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    // 暂停：按标准 12 导联分段显示；播放：每个导联同时向左滚动同一时间窗口。
    const windowStart = progress == null ? startT : progress - window;
    const points = Math.max(2, Math.ceil(w * 1.5));
    for (let i = 0; i <= points; i += 1) {
      const frac = i / points;
      const tRaw = windowStart + frac * window;
      const t = ((tRaw % duration) + duration) % duration;
      const idx = Math.min(result.samples.length - 1, Math.round(t * result.sampleRate));
      const px = x + frac * w;
      const py = baseline - result.samples[idx] * 10 * pxPerMm;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    if (points > 0) ctx.stroke();
    if (progress != null) {
      const idx = Math.min(result.samples.length - 1, Math.round((progress % duration) * result.sampleRate));
      const py = baseline - result.samples[idx] * 10 * pxPerMm;
      ctx.fillStyle = colors.brand;
      ctx.beginPath();
      ctx.arc(x + w - 1.5, py, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawMini(colors) {
    const ctx = this.ctx;
    const spec = this.rhythmSession.spec;
    const result = this.rhythmSession.lead(spec.primaryLead || 'II');
    const dpr = this.dpr;
    const w = this.cssWidth;
    const h = this.cssHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, w, h);
    const baseline = h * 0.58;
    const duration = result.duration;
    let maxAbs = 0.1;
    for (let i = 0; i < result.samples.length; i += 1) maxAbs = Math.max(maxAbs, Math.abs(result.samples[i]));
    const amp = (h * 0.42) / maxAbs;
    ctx.strokeStyle = colors.trace;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < result.samples.length; i += 1) {
      const x = (i / result.samples.length) * w;
      const y = baseline - result.samples[i] * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawHover(colors) {
    if (!this.hover || this.playing || this.options.mode === '12lead') return;
    const ctx = this.ctx;
    const padLeft = 38;
    const padRight = 14;
    const padTop = 26;
    const padBottom = 20;
    const plotW = this.cssWidth - padLeft - padRight;
    const plotH = this.cssHeight - padTop - padBottom;
    if (this.hover.x < padLeft || this.hover.x > padLeft + plotW || this.hover.y < padTop || this.hover.y > padTop + plotH) return;
    const lead = this.options.lead || this.rhythmSession.primaryLead;
    const scroll = this.playback === 'scroll';
    const windowSeconds = scroll ? this.windowSeconds() : this.rhythmSession.duration;
    const result = scroll ? this.getScrollSession().lead(lead) : this.rhythmSession.lead(lead);
    const bufferDuration = scroll ? result.duration : this.rhythmSession.duration;
    const pxPerSec = plotW / windowSeconds;
    const offset = scroll ? this.scrollOffset : 0;
    const t = offset + (this.hover.x - padLeft) / pxPerSec;
    const wrapped = scroll ? ((t % bufferDuration) + bufferDuration) % bufferDuration : t;
    const idx = Math.max(0, Math.min(result.samples.length - 1, Math.round(wrapped * result.sampleRate)));
    const mv = result.samples[idx];
    const pxPerMm = plotW / (windowSeconds * 25);
    const y = padTop + plotH * 0.58 - mv * 10 * pxPerMm;
    ctx.strokeStyle = colors.brand;
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(this.hover.x, padTop);
    ctx.lineTo(this.hover.x, padTop + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.brand;
    ctx.beginPath();
    ctx.arc(this.hover.x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    const label = `${formatTime(wrapped)}  ${mv >= 0 ? '+' : ''}${mv.toFixed(2)} mV`;
    ctx.font = '600 10px "SF Mono", ui-monospace, monospace';
    const width = ctx.measureText(label).width + 12;
    const bx = Math.min(this.cssWidth - width - 8, Math.max(8, this.hover.x - width / 2));
    ctx.fillStyle = colors.surface;
    ctx.globalAlpha = 0.96;
    this.roundRect(bx, padTop + 4, width, 17, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.line;
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.fillText(label, bx + 6, padTop + 16);
  }
}

export function mountECG(root, spec, options = {}) {
  return new ECGViewer(root, spec, options);
}

export function renderMiniECG(canvas, spec) {
  if (!(canvas instanceof HTMLCanvasElement) || !spec || typeof spec !== 'object') return null;
  const width = canvas.clientWidth || 240;
  const height = canvas.clientHeight || 62;
  const dprCap = window.matchMedia?.('(max-width: 719px)').matches ? 1.5 : 2;
  const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = {
    paper: cssVar(canvas, '--ecg-bg', '#fff8f4'),
    trace: cssVar(canvas, '--ecg-trace', '#143c3a'),
  };
  const session = new ECGSession({ ...spec, duration: 3, annotations: [] });
  const result = session.lead(spec.primaryLead || 'II');
  const baseline = height * 0.58;
  let maxAbs = 0.1;
  for (let i = 0; i < result.samples.length; i += 1) maxAbs = Math.max(maxAbs, Math.abs(result.samples[i]));
  const amp = (height * 0.42) / maxAbs;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = colors.trace;
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  for (let i = 0; i < result.samples.length; i += 1) {
    const x = (i / result.samples.length) * width;
    const y = baseline - result.samples[i] * amp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  return result;
}
