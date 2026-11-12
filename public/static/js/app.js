// Cache-busted dynamic imports: keep Node tests query-free while forcing
// browsers with immutable 7-day static caching to load the current modules.
const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261112a11';
const [
  { api },
  { store, initTheme, applyTheme },
  { Router },
  { NAV_ITEMS, icon, logo, initials, escapeHtml },
  { applyLowBandwidth },
  { t, navKey, getLocale, setLocale, applyLocale, startLocaleObserver, loadContentCatalog, LOCALES },
  { pullStudy, scheduleStudyPush },
] = await Promise.all([
  import(`./api.js${__asset}`),
  import(`./store.js${__asset}`),
  import(`./router.js${__asset}`),
  import(`./ui.js${__asset}`),
  import(`./bandwidth.js${__asset}`),
  import(`./i18n.js${__asset}`),
  import(`./study-sync.js${__asset}`),
]);

const lazyView = (file, exportName) => async (ctx) => {
  const mod = await import(`./views/${file}${__asset}`);
  return mod[exportName](ctx);
};

const routes = [
  { path: '/', handler: lazyView('home.js', 'homeView') },
  { path: '/intro', handler: lazyView('intro.js', 'introView') },
  { path: '/packs', handler: lazyView('packs.js', 'packsView') },
  { path: '/ai', handler: lazyView('ai-tutor.js', 'aiTutorView') },
  { path: '/learn', handler: lazyView('learn.js', 'learnView') },
  { path: '/learn/:id', handler: lazyView('article.js', 'articleView') },
  { path: '/practice', handler: lazyView('practice.js', 'practiceView') },
  { path: '/read', handler: lazyView('read.js', 'readView') },
  { path: '/daily', handler: lazyView('daily.js', 'dailyView') },
  { path: '/review', handler: lazyView('review.js', 'reviewView') },
  { path: '/exam', handler: lazyView('exam.js', 'examView') },
  { path: '/leaderboard', handler: lazyView('leaderboard.js', 'leaderboardView') },
  { path: '/sim/duo/:sessionId', handler: lazyView('sim-duo.js', 'simDuoView') },
  { path: '/sim/:sessionId', handler: lazyView('sim-session.js', 'simSessionView') },
  { path: '/sim', handler: lazyView('sim-list.js', 'simListView') },
  { path: '/vectors', handler: lazyView('vector-lab.js', 'vectorLabView') },
  { path: '/lab', handler: lazyView('lab.js', 'labView') },
  { path: '/me', handler: lazyView('me.js', 'meView') },
  { path: '/about', handler: lazyView('about.js', 'aboutView') },
  { path: '/glossary', handler: lazyView('glossary.js', 'glossaryView') },
  { path: '/guidelines', handler: lazyView('guidelines.js', 'guidelinesView') },
  { path: '/admin', handler: lazyView('admin.js', 'adminView') },
];

applyLowBandwidth();
document.documentElement.lang = getLocale() === 'en' ? 'en' : 'zh-CN';
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); window.__ecgInstallPrompt = event; window.dispatchEvent(new CustomEvent('ecg-install-ready')); });
  let swReloading = false;
  let swWaiting = null;
  let updateDismissed = false;
  window.showVersionBanner = (latest = null) => {
    if (updateDismissed) return;
    let banner = document.getElementById('version-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'version-banner';
      banner.className = 'version-banner';
      banner.setAttribute('role', 'status');
      banner.innerHTML = `<div><b>发现新版本</b><span data-version-text>刷新后使用最新界面与修复。</span></div><div class="row-wrap"><button class="btn btn-primary btn-sm" type="button" data-version-refresh>立即刷新</button><button class="icon-btn" type="button" data-version-close aria-label="稍后提醒">${icon('x', 14)}</button></div>`;
      document.body.appendChild(banner);
      banner.querySelector('[data-version-refresh]').addEventListener('click', () => {
        if (swWaiting) {
          swWaiting.postMessage({ type: 'SKIP_WAITING' });
          setTimeout(() => { swReloading = true; window.location.reload(); }, 1200);
        } else {
          window.location.reload();
        }
      });
      banner.querySelector('[data-version-close]').addEventListener('click', () => {
        updateDismissed = true;
        banner.remove();
      });
    }
    const text = banner.querySelector('[data-version-text]');
    if (text && latest) text.textContent = `最新版本 ${latest.version || ''}（${latest.assetVersion || ''}）。刷新页面即可完成更新。`;
  };
  const checkAppVersion = async () => {
    try {
      const res = await fetch('/api/version', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      const latest = data?.data;
      if (latest?.assetVersion && store.app?.assetVersion && latest.assetVersion !== store.app.assetVersion) {
        window.showVersionBanner(latest);
      }
    } catch { /* offline */ }
  };
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!swReloading) return;
      swReloading = false;
      window.location.reload();
    });
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            swWaiting = worker;
            window.showVersionBanner();
          }
        });
      });
      window.setInterval(() => registration.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(() => {});
  }
  window.setTimeout(checkAppVersion, 8000);
  window.setInterval(checkAppVersion, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkAppVersion(); });
}

let router;

function sidebarNav(activePath) {
  return NAV_ITEMS.map((item) => {
    const active = item.path === '/' ? activePath === '/' : activePath.startsWith(item.path);
    return `<a class="nav-link ${active ? 'active' : ''}" href="#${item.path}" data-nav="${item.path}" ${active ? 'aria-current="page"' : ''}>
      ${icon(item.icon, 19)}<span>${t(navKey(item.path), item.label)}</span>${item.path === '/sim' && getLocale() !== 'en' ? '<span class="nav-badge">ACLS</span>' : ''}
    </a>`;
  }).join('');
}

function topbarLinks(activePath) {
  return NAV_ITEMS.filter((item) => item.path !== '/me').map((item) => {
    const active = item.path === '/' ? activePath === '/' : activePath.startsWith(item.path);
    return `<a class="${active ? 'active' : ''}" href="#${item.path}" ${active ? 'aria-current="page"' : ''}>${t(navKey(item.path), item.label)}</a>`;
  }).join('');
}

function bottomNav(activePath) {
  return NAV_ITEMS.filter((item) => item.path !== '/me' && item.bottom !== false).map((item) => {
    const active = item.path === '/' ? activePath === '/' : activePath.startsWith(item.path);
    return `<a class="bottom-link ${active ? 'active' : ''}" href="#${item.path}" ${active ? 'aria-current="page"' : ''}>${icon(item.icon, 21)}<span>${t(navKey(item.path), item.label)}</span></a>`;
  }).join('');
}

function shell(activePath = '/') {
  const user = store.user || { displayName: '访客', isGuest: true, xp: 0 };
  const read = store.progress?.read || 0;
  const total = store.progress?.total || store.content?.diagnoses || 40;
  const percent = total ? Math.round((read / total) * 100) : 0;
  return `<div class="app-shell">
    <aside class="app-sidebar">
      <a class="brand" href="#/" aria-label="心迹 ECG Lab 首页">${logo()}</a>
      <nav class="sidebar-nav" aria-label="主导航">${sidebarNav(activePath)}</nav>
      <div class="sidebar-foot">
        <div class="sidebar-card">
          <div class="sidebar-card-title"><span>学习进度</span><span class="mono" data-progress-percent>${percent}%</span></div>
          <div class="sidebar-card-meta"><span data-progress-read>${read}</span> / <span data-progress-total>${total}</span> 篇已读</div>
          <div class="progress" style="margin-top:8px"><div class="progress-bar" style="width:${percent}%" data-progress-bar></div></div>
        </div>
        <a class="sidebar-card sidebar-ai-link ${activePath.startsWith('/ai') ? 'active' : ''}" href="#/ai" style="padding:11px" aria-label="打开 AI 导师">
          <div class="sidebar-card-title"><span style="display:inline-flex;align-items:center;gap:5px">${icon('sparkles', 14)} AI 导师</span><span class="badge ${store.ai?.configured ? 'badge-brand' : ''}" data-ai-mode>${store.ai?.configured ? '在线' : '本地'}</span></div>
          <div class="sidebar-card-meta">${store.ai?.configured ? '个性化组卷 · 错因解析' : '本地知识库降级可用'}</div>
        </a>
        <div class="sidebar-card" style="padding:8px">
          <a class="sidebar-user" href="#/me">
            <span class="avatar" data-avatar>${initials(user.displayName)}</span>
            <span class="grow"><span class="sidebar-user-name" data-user-name>${escapeHtml(user.displayName)}</span><span class="sidebar-user-sub" data-user-sub>${user.isGuest ? '访客 · 点击保存进度' : `@${escapeHtml(user.username || '')} · ${user.xp} XP`}</span></span>
            ${icon('chevronRight', 15)}
          </a>
        </div>
      </div>
    </aside>
    <div class="app-main">
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="#/" aria-label="首页">${logo()}</a>
          <nav class="topbar-links" aria-label="顶部导航">${topbarLinks(activePath)}</nav>
          <div class="topbar-actions">
            <button class="icon-btn" type="button" data-locale-toggle aria-label="Language" title="Language">${nextLocale().short}</button>
            <a class="avatar" href="#/me" aria-label="我的账号" data-avatar>${initials(user.displayName)}</a>
          </div>
        </div>
      </header>
      <main id="main"><div id="view-root"></div></main>
      <footer class="site-footer">
        <div class="site-footer-inner">
          <div class="site-footer-brand">
            <b>心迹 ECG Lab</b>
            <span>${escapeHtml(store.site?.copyright || '© 2026 Tianhao Wu 等')}</span>
            <span class="site-footer-note">免费开源心电图教学 · 内容持续迭代</span>
            <span class="site-footer-version">v${escapeHtml(store.app?.version || '—')} · ${escapeHtml(store.app?.assetVersion || '—')}</span>
            <span class="site-footer-note">教学用途，不构成诊断或治疗建议。</span>
            ${getLocale() === 'en' ? '<span class="site-footer-note">English translations are machine-assisted and pending clinical review.</span>' : ''}
          </div>
          <div class="site-footer-links">
            ${store.site?.githubUrl ? `<a href="${escapeHtml(store.site.githubUrl)}" target="_blank" rel="noopener noreferrer">${icon('github', 13)} GitHub</a>` : ''}
            ${store.site?.license ? (store.site?.githubUrl ? `<a href="${escapeHtml(store.site.githubUrl.replace(/\/$/, ''))}/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">${escapeHtml(store.site.license)}</a>` : `<span>${escapeHtml(store.site.license)}</span>`) : ''}
            <a href="#/about">${t('footer.about', '关于 / 勘误')}</a>
            ${store.site?.icp ? `<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">${escapeHtml(store.site.icp)}</a>` : ''}
          </div>
        </div>
      </footer>
      <nav class="bottom-nav" aria-label="底部导航">${bottomNav(activePath)}</nav>
    </div>
  </div>`;
}

function nextLocale() {
  const index = LOCALES.findIndex((locale) => locale.id === getLocale());
  return LOCALES[(index + 1) % LOCALES.length] || LOCALES[0];
}

function navLabel(path) {
  if (path === '/') return { label: '首页', active: '/' };
  if (path.startsWith('/intro')) return { label: '导论', active: '/intro' };
  if (path.startsWith('/packs')) return { label: '课程包', active: '/packs' };
  if (path.startsWith('/glossary')) return { label: '术语表', active: '/glossary' };
  if (path.startsWith('/guidelines')) return { label: '指南差异', active: '/guidelines' };
  if (path.startsWith('/about')) return { label: '关于 / 勘误', active: '/about' };
  if (path.startsWith('/ai')) return { label: 'AI 导师', active: '/ai' };
  if (path.startsWith('/learn')) return { label: '学习', active: '/learn' };
  if (path.startsWith('/practice')) return { label: '练习', active: '/practice' };
  if (path.startsWith('/read')) return { label: '系统判读', active: '/read' };
  if (path.startsWith('/daily')) return { label: '每日挑战', active: '/daily' };
  if (path.startsWith('/exam')) return { label: '学习考试', active: '/exam' };
  if (path.startsWith('/leaderboard')) return { label: '测试排行榜', active: '/leaderboard' };
  if (path.startsWith('/review')) return { label: '错题复习', active: '/review' };
  if (path.startsWith('/sim')) return { label: '急救模拟', active: '/sim' };
  if (path.startsWith('/lab')) return { label: '电解质实验室', active: '/lab' };
  if (path.startsWith('/me')) return { label: '我的', active: '/me' };
  if (path.startsWith('/admin')) return { label: '管理后台', active: '/admin' };
  if (path.startsWith('/vectors')) return { label: '心脏向量实验室', active: '/vectors' };
  return { label: '心迹', active: '/' };
}

function bindShell() {
  document.querySelectorAll('[data-locale-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      setLocale(nextLocale().id);
      window.location.reload();
    });
  });
}

function updateShell() {
  const user = store.user || {};
  const read = store.progress?.read || 0;
  const total = store.progress?.total || store.content?.diagnoses || 40;
  const percent = total ? Math.round((read / total) * 100) : 0;
  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  };
  setText('[data-progress-read]', String(read));
  setText('[data-progress-total]', String(total));
  setText('[data-progress-percent]', `${percent}%`);
  const bar = document.querySelector('[data-progress-bar]');
  if (bar) bar.style.width = `${percent}%`;
  setText('[data-user-name]', user.displayName || '访客');
  setText('[data-user-sub]', user.isGuest === false ? `@${user.username || ''} · ${user.xp || 0} XP` : '访客 · 点击保存进度');
  document.querySelectorAll('[data-avatar]').forEach((el) => {
    el.textContent = initials(user.displayName || '心迹');
  });
  const aiBadge = document.querySelector('[data-ai-mode]');
  if (aiBadge) aiBadge.textContent = store.ai?.configured ? '在线' : '本地';
}

function updateNav(path) {
  const { label, active } = navLabel(path);
  const displayLabel = getLocale() === 'en' ? t(navKey(active), label) : label;
  document.title = `${displayLabel} · ${getLocale() === 'en' ? 'ECG Lab' : '心迹 ECG Lab'}`;
  document.querySelectorAll('.nav-link[data-nav]').forEach((link) => {
    const item = link.dataset.nav;
    const isActive = item === '/' ? path === '/' : path.startsWith(item);
    link.classList.toggle('active', isActive);
  });
  document.querySelectorAll('.topbar-links a, .bottom-link').forEach((link) => {
    const href = link.getAttribute('href')?.replace(/^#/, '') || '';
    const isActive = href === '/' ? path === '/' : path.startsWith(href);
    link.classList.toggle('active', isActive);
  });
}

async function boot() {
  const app = document.getElementById('app');
  // Paint the shell immediately; data and the route view load afterwards.
  app.innerHTML = shell('/');
  bindShell();
  try {
    const data = await api.bootstrap();
    store.setBootstrap(data);
    if (!localStorage.getItem('ecg-theme') && data.user?.theme) {
      applyTheme(data.user.theme, { persist: false });
    }
    initTheme();
    app.innerHTML = shell('/');
    bindShell();
    const mount = document.getElementById('view-root');
    let lastTracked = '';
    let lastTrackedAt = 0;
    router = new Router(routes, mount, ({ path }) => {
      if (!document.querySelector('.app-shell')) return;
      updateNav(path);
      if (getLocale() === 'en') setTimeout(() => applyLocale(document.body), 0);
      const now = Date.now();
      if ((path !== lastTracked || now - lastTrackedAt > 60000) && !path.startsWith('/admin')) {
        lastTracked = path;
        lastTrackedAt = now;
        api.visit(path, document.referrer).catch(() => {});
      }
    });
    router.start();
    startLocaleObserver();
    if (getLocale() === 'en') setTimeout(() => loadContentCatalog(), 120);
    store.subscribe((type) => {
      if (['user', 'progress', 'stats', 'bootstrap'].includes(type)) updateShell();
      if (type === 'theme') { /* theme is controlled from the profile page */ }
    });
    window.addEventListener('auth:changed', () => {
      updateShell();
      router?.render();
      pullStudy();
    });
    window.addEventListener('ecg-study-change', scheduleStudyPush);
    pullStudy();
  } catch (error) {
    console.error(error);
    app.innerHTML = `<div class="boot-splash" style="padding:20px;text-align:center">
      <div class="boot-mark" style="color:var(--accent)">${icon('alert', 28)}</div>
      <p class="boot-title">暂时无法连接服务器</p>
      <p class="boot-sub">${escapeHtml(error.message || '请稍后重试')}</p>
      <button class="btn btn-primary" type="button" id="boot-retry" style="margin-top:16px">重新加载</button>
    </div>`;
    document.getElementById('boot-retry')?.addEventListener('click', () => window.location.reload());
  }
}

boot();
