const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261110ag';
const { renderMiniECG } = await import(`./ecg-renderer.js${__asset}`);

const paths = {
  home: '<path d="M3 11.4 12 4l9 7.4"/><path d="M5.5 10v9.5h13V10"/>',
  book: '<path d="M4 5.6A2.6 2.6 0 0 1 6.6 3H20v18H6.6A2.6 2.6 0 0 1 4 18.4z"/><path d="M4 17.5A2.6 2.6 0 0 1 6.6 15H20"/>',
  activity: '<path d="M3 12h4l2.2-6 4 12 2.2-6H21"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  flask: '<path d="M9 3h6"/><path d="M10 3v5l-5.2 9.2A2.1 2.1 0 0 0 6.7 21h10.6a2.1 2.1 0 0 0 1.9-3.8L14 8V3"/><path d="M7.5 14h9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4.3-4.3"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  stethoscope: '<path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 13v3a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="14" r="2"/>',
  sparkles: '<path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="m19 15 .8 1.8L21.5 18l-1.7.7L19 20.5l-.8-1.8L16.5 18l1.7-.7z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/>',
  alert: '<path d="M10.3 3.9 2.6 17.3A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.7L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3"/><path d="M12 13v4M9 21h6M10 17h4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  arrowUpRight: '<path d="M7 17 17 7M8 7h9v9"/>',
  bolt: '<path d="M13 2 3 14h8l-1 8 10-12h-8z"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M6 10h2l1.2-3 2 6 1.5-3H18"/>',
  bookOpen: '<path d="M12 6.5C10 4.5 7 4 3 4v15c4 0 7 .5 9 2.5 2-2 5-2.5 9-2.5V4c-4 0-7 .5-9 2.5z"/><path d="M12 6.5v15"/>',
  spark: '<path d="m12 2 2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  fingerprint: '<path d="M12 11a4 4 0 0 0-4 4c0 1.6-.3 3.2-1 4.6M16 15a4 4 0 0 0-4-4M12 7a8 8 0 0 1 8 8c0 1.5-.2 3-.7 4.4M4.7 16.7A14 14 0 0 0 6 12a6 6 0 0 1 6-5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M15 4h5v5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  github: '<path d="M9 19c-4 1.5-4-2.5-6-3m12 6v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.7 4.7 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.7 11.7 0 0 0-6.2 0C6.6 3.8 5.6 4.1 5.6 4.1a4.3 4.3 0 0 0-.1 3.2A4.7 4.7 0 0 0 4.2 10c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V22"/>',
  flame: '<path d="M12 2c.6 3.5-2.2 5-3.8 7.2A7.4 7.4 0 0 0 6 13.6C6 17.7 8.7 21 12 21s6-3.3 6-7.4c0-2-.9-3.6-2-5C14.4 6.8 12.6 5 12 2z"/><path d="M12 21c-1.7 0-3-1.4-3-3.2 0-1.6 1-2.7 1.9-3.8.5-.6.9-1.3 1.1-2 .8 1 1.5 2.2 2.2 3.2.5.8.8 1.6.8 2.6 0 1.8-1.3 3.2-3 3.2z"/>',
};

export function icon(name, size = 18, extra = '') {
  const body = paths[name] || paths.activity;
  return `<svg class="${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function logoMark() {
  return `<svg viewBox="0 0 48 48" width="28" height="28" fill="none" aria-hidden="true"><path d="M4 26h8l4-9 6 18 5-22 5 13h12" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function logo() {
  return `<span class="brand-mark">${logoMark()}</span><span><span class="brand-word">心迹</span><span class="brand-sub">ECG LAB · 读懂每一次心跳</span></span>`;
}

export const NAV_ITEMS = [
  { path: '/', label: '首页', icon: 'home' },
  { path: '/intro', label: '导论', icon: 'bookOpen' },
  { path: '/ai', label: 'AI 导师', icon: 'sparkles', bottom: false },
  { path: '/learn', label: '学习', icon: 'book' },
  { path: '/practice', label: '练习', icon: 'activity' },
  { path: '/read', label: '系统判读', icon: 'target', bottom: false },
  { path: '/daily', label: '每日', icon: 'flame' },
  { path: '/exam', label: '考试', icon: 'target' },
  { path: '/sim', label: '急救', icon: 'zap' },
  { path: '/lab', label: '实验室', icon: 'flask' },
  { path: '/me', label: '我的', icon: 'user' },
];

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function initials(name) {
  const text = String(name || '心迹').replace(/[·\s]/g, '');
  return text.slice(0, 2).toUpperCase();
}

export function fmtDuration(seconds) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtDate(value) {
  if (!value) return '';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function difficultyDots(level = 1) {
  const n = Math.max(1, Math.min(3, Number(level) || 1));
  return `<span class="difficulty" aria-label="难度 ${n} 级">${[1, 2, 3].map((i) => `<i class="difficulty-dot ${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
}

const CHAPTER_COLORS = {
  teal: 'var(--brand)',
  coral: 'var(--accent)',
  amber: 'var(--gold)',
  indigo: '#7080c4',
  blue: '#5489b5',
  rose: '#c66d83',
  violet: '#9a75c5',
  green: '#4f9a73',
  slate: '#71848e',
};

export function chapterColor(color) {
  return CHAPTER_COLORS[color] || 'var(--brand)';
}

export function toast(message, type = 'info', duration = 3400) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'warn' ? 'alert' : 'check', 16)}<span>${escapeHtml(message)}</span>`;
  region.appendChild(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  const timer = window.setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    window.setTimeout(() => el.remove(), 180);
  }, duration);
  el.addEventListener('click', () => {
    window.clearTimeout(timer);
    el.remove();
  });
}

export function emptyState(title, sub = '', iconName = 'activity') {
  return `<div class="empty"><div class="empty-icon">${icon(iconName, 22)}</div><div class="empty-title">${escapeHtml(title)}</div><div>${escapeHtml(sub)}</div></div>`;
}

export function loadingPanel(text = '正在加载…') {
  return `<div class="loading-panel"><span class="spinner"></span><span>${escapeHtml(text)}</span></div>`;
}

export function openModal({ title, sub = '', content = '', footer = '', onClose = null, className = '' }) {
  const root = document.getElementById('modal-root');
  if (!root) return { close() {} };
  const previous = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-head"><div><div class="modal-title" id="modal-title">${escapeHtml(title)}</div>${sub ? `<div class="modal-sub">${escapeHtml(sub)}</div>` : ''}</div><button class="icon-btn" type="button" data-close aria-label="关闭">${icon('x', 18)}</button></div>
    <div class="modal-body" data-body></div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  </div>`;
  const body = backdrop.querySelector('[data-body]');
  if (typeof content === 'string') body.innerHTML = content;
  else if (content instanceof Node) body.appendChild(content);
  root.appendChild(backdrop);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const close = () => {
    if (!backdrop.isConnected) return;
    backdrop.remove();
    document.body.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onKey);
    if (previous && typeof previous.focus === 'function') previous.focus();
    if (onClose) onClose();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const focusable = backdrop.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  backdrop.querySelector('[data-close]')?.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  window.setTimeout(() => {
    const focusTarget = backdrop.querySelector('input, textarea, button.btn-primary, button');
    focusTarget?.focus();
  }, 30);
  return { close, el: backdrop };
}

export function confirmDialog({ title, message, confirmText = '确认', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const modal = openModal({
      title,
      content: `<p class="muted" style="font-size:13px;line-height:1.7">${escapeHtml(message)}</p>`,
      footer: `<button class="btn btn-ghost" type="button" data-cancel>取消</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-ok>${escapeHtml(confirmText)}</button>`,
      onClose: () => {
        if (!settled) resolve(false);
      },
    });
    modal.el.querySelector('[data-cancel]')?.addEventListener('click', () => {
      settled = true;
      modal.close();
      resolve(false);
    });
    modal.el.querySelector('[data-ok]')?.addEventListener('click', () => {
      settled = true;
      modal.close();
      resolve(true);
    });
  });
}

export function setupMiniECG(canvas, spec) {
  if (!canvas || !spec || typeof spec !== 'object' || !spec.rhythm) return;
  const draw = () => {
    try {
      renderMiniECG(canvas, spec);
    } catch (error) {
      console.warn('mini ecg failed', error);
    }
  };
  if (!('IntersectionObserver' in window)) {
    draw();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        draw();
        observer.disconnect();
      }
    });
  }, { rootMargin: '120px' });
  observer.observe(canvas);
}

export function setButtonLoading(button, loading, text = '处理中') {
  if (!button) return;
  if (loading) {
    button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.classList.add('btn-loading');
    button.innerHTML = `<span class="spinner" style="width:14px;height:14px"></span>${escapeHtml(text)}`;
  } else {
    button.disabled = false;
    button.classList.remove('btn-loading');
    if (button.dataset.original) {
      button.innerHTML = button.dataset.original;
      delete button.dataset.original;
    }
  }
}

export function medicalDisclaimer() {
  return `<div class="disclaimer">${icon('info', 14)}<span><strong>教学用途声明：</strong>本页心电图与内容用于医学教育，不构成诊断或治疗建议；真实患者请结合病史、体检、化验与临床指南判断。波形为教学用途的形态学近似。</span></div>`;
}
