// Cache-busted dynamic imports: keep Node tests query-free while forcing
// browsers with immutable 7-day static caching to load the current modules.
const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108bd';
const { api } = await import(`./api.js${__asset}`);
const { store, initTheme, applyTheme, toggleTheme } = await import(`./store.js${__asset}`);
const { practiceView } = await import(`./views/practice.js${__asset}`);
const { simListView } = await import(`./views/sim-list.js${__asset}`);
const { meView } = await import(`./views/me.js${__asset}`);
const { Router } = await import(`./router.js${__asset}`);
const { NAV_ITEMS, icon, logo, initials, escapeHtml } = await import(`./ui.js${__asset}`);
const { homeView } = await import(`./views/home.js${__asset}`);
const { learnView } = await import(`./views/learn.js${__asset}`);
const { articleView } = await import(`./views/article.js${__asset}`);
const { simSessionView } = await import(`./views/sim-session.js${__asset}`);
const { labView } = await import(`./views/lab.js${__asset}`);
const { adminView } = await import(`./views/admin.js${__asset}`);
const { vectorLabView } = await import(`./views/vector-lab.js${__asset}`);
const { reviewView } = await import(`./views/review.js${__asset}`);
const { aboutView } = await import(`./views/about.js${__asset}`);
const { examView } = await import(`./views/exam.js${__asset}`);
const { leaderboardView } = await import(`./views/leaderboard.js${__asset}`);
const { glossaryView } = await import(`./views/glossary.js${__asset}`);
const { guidelinesView } = await import(`./views/guidelines.js${__asset}`);
const { dailyView } = await import(`./views/daily.js${__asset}`);
const { introView } = await import(`./views/intro.js${__asset}`);
const { packsView } = await import(`./views/packs.js${__asset}`);
const { aiTutorView } = await import(`./views/ai-tutor.js${__asset}`);
const { applyLowBandwidth } = await import(`./bandwidth.js${__asset}`);
const { t, navKey, getLocale, setLocale, applyLocale, startLocaleObserver } = await import(`./i18n.js${__asset}`);
const { pullStudy, scheduleStudyPush } = await import(`./study-sync.js${__asset}`);

const routes = [
  { path: '/', handler: homeView },
  { path: '/intro', handler: introView },
  { path: '/packs', handler: packsView },
  { path: '/ai', handler: aiTutorView },
  { path: '/learn', handler: learnView },
  { path: '/learn/:id', handler: articleView },
  { path: '/practice', handler: practiceView },
  { path: '/daily', handler: dailyView },
  { path: '/review', handler: reviewView },
  { path: '/exam', handler: examView },
  { path: '/leaderboard', handler: leaderboardView },
  { path: '/sim/:sessionId', handler: simSessionView },
  { path: '/sim', handler: simListView },
  { path: '/vectors', handler: vectorLabView },
  { path: '/lab', handler: labView },
  { path: '/me', handler: meView },
  { path: '/about', handler: aboutView },
  { path: '/glossary', handler: glossaryView },
  { path: '/guidelines', handler: guidelinesView },
  { path: '/admin', handler: adminView },
];

applyLowBandwidth();
document.documentElement.lang = getLocale() === 'en' ? 'en' : 'zh-CN';
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); window.__ecgInstallPrompt = event; window.dispatchEvent(new CustomEvent('ecg-install-ready')); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    let swRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (swRefreshing) return;
      swRefreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
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
        <div class="sidebar-card" style="padding:11px">
          <div class="sidebar-card-title"><span style="display:inline-flex;align-items:center;gap:5px">${icon('sparkles', 14)} AI 导师</span><span class="badge ${store.ai?.configured ? 'badge-brand' : ''}" data-ai-mode>${store.ai?.configured ? '在线' : '本地'}</span></div>
          <div class="sidebar-card-meta">${store.ai?.configured ? '个性化组卷 · 错因解析' : '本地知识库降级可用'}</div>
        </div>
        <div class="sidebar-card" style="padding:9px 12px">
          <div class="spread"><span class="sidebar-card-title" style="gap:6px">${icon('sun', 13)} 外观</span><button class="icon-btn" type="button" data-theme-toggle aria-label="切换深浅主题" title="切换主题" style="width:30px;height:30px">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 17)}</button></div>
        </div>
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
            <button class="icon-btn" type="button" data-locale-toggle aria-label="Language" title="Language">${getLocale() === 'en' ? '中' : 'EN'}</button>
            <button class="icon-btn" type="button" data-theme-toggle aria-label="切换深浅主题" title="切换主题">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 19)}</button>
            <a class="avatar" href="#/me" aria-label="我的账号" data-avatar>${initials(user.displayName)}</a>
          </div>
        </div>
      </header>
      <main id="main"><div id="view-root"></div></main>
      <footer class="site-footer">
        <div><b>心迹 ECG Lab</b><span>${escapeHtml(store.site?.copyright || '© 2026 Tianhao Wu 等')}</span></div>
        <div class="site-footer-links">
          ${store.site?.githubUrl ? `<a href="${escapeHtml(store.site.githubUrl)}" target="_blank" rel="noopener noreferrer">${icon('github', 13)} GitHub</a>` : ''}
          ${store.site?.license ? (store.site?.githubUrl ? `<a href="${escapeHtml(store.site.githubUrl.replace(/\/$/, ''))}/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">${escapeHtml(store.site.license)}</a>` : `<span>${escapeHtml(store.site.license)}</span>`) : ''}
          <a href="#/about">${t('footer.about', '关于 / 勘误')}</a>
          ${store.site?.icp ? `<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">${escapeHtml(store.site.icp)}</a>` : ''}
        </div>
      </footer>
      <nav class="bottom-nav" aria-label="底部导航">${bottomNav(activePath)}</nav>
    </div>
  </div>`;
}

function navLabel(path) {
  if (path === '/') return { label: '首页', active: '/' };
  if (path.startsWith('/intro')) return { label: '导论', active: '/intro' };
  if (path.startsWith('/packs')) return { label: '课程包', active: '/packs' };
  if (path.startsWith('/ai')) return { label: 'AI 导师', active: '/ai' };
  if (path.startsWith('/learn')) return { label: '学习', active: '/learn' };
  if (path.startsWith('/practice')) return { label: '练习', active: '/practice' };
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
      setLocale(getLocale() === 'en' ? 'zh' : 'en');
      window.location.reload();
    });
  });
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      toggleTheme();
      document.querySelectorAll('[data-theme-toggle]').forEach((el) => {
        el.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 19);
      });
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
  document.title = `${displayLabel} · 心迹 ECG Lab`;
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
    store.subscribe((type) => {
      if (['user', 'progress', 'stats', 'bootstrap'].includes(type)) updateShell();
      if (type === 'theme') {
        document.querySelectorAll('[data-theme-toggle]').forEach((el) => {
          el.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 19);
        });
      }
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
