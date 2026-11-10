const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261110ad';
const { api } = await import(`../api.js${__asset}`);
const { store, applyTheme, getThemeMode } = await import(`../store.js${__asset}`);
const { navigate } = await import(`../router.js${__asset}`);
const { openAuth, logout } = await import(`../auth.js${__asset}`);
const { icon, escapeHtml, toast, medicalDisclaimer } = await import(`../ui.js${__asset}`);
const { reviewSummary } = await import(`../study-store.js${__asset}`);
const { isLowBandwidth, setLowBandwidth, installPrompt, clearInstallPrompt } = await import(`../bandwidth.js${__asset}`);
const { getLocale, setLocale, LOCALES } = await import(`../i18n.js${__asset}`);
const { byokSummary, getByok, setByok, clearByok } = await import(`../byok.js${__asset}`);
const { createPasskey } = await import(`../webauthn.js${__asset}`);
const { levelInfo, ADVANCED_UNLOCK, CHALLENGE_UNLOCK, AI_UNLOCK } = await import(`../levels.js${__asset}`);

function isPwaStandalone() {
  return (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)')?.matches) || window.navigator.standalone === true;
}

function isIOSDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function pwaActionMarkup() {
  const app = store.app || {};
  const version = `v${escapeHtml(app.version || '—')} · ${escapeHtml(app.assetVersion || '—')}`;
  if (isPwaStandalone()) {
    return `<div class="row-wrap"><span class="badge badge-ok">已安装并正在以应用运行</span></div><p class="muted pwa-note">应用版本 ${version}。新版本发布后打开应用会自动检查；如有更新提示，点击刷新即可。</p>`;
  }
  if (installPrompt()) {
    return `<div class="row-wrap"><button class="btn btn-primary btn-sm" type="button" data-install>${icon('download', 14)} 安装到设备</button><span class="badge">可离线打开</span></div><p class="muted pwa-note">应用版本 ${version}。安装后从桌面图标进入，全屏运行并缓存已访问页面。</p>`;
  }
  if (isIOSDevice()) {
    return `<div class="pwa-steps"><b>iPhone / iPad 安装步骤</b><ol><li>用 Safari 打开本页。</li><li>点击底部“分享”按钮。</li><li>选择“添加到主屏幕”，确认名称后添加。</li></ol></div><p class="muted pwa-note">应用版本 ${version}。iOS 不支持网页主动弹出安装框，需通过 Safari 分享菜单添加。</p>`;
  }
  return `<div class="pwa-steps"><b>当前浏览器没有提供自动安装按钮</b><ol><li>电脑端：使用 Chrome / Edge，点击地址栏右侧的安装图标。</li><li>手机端：Chrome 菜单 →“安装应用 / 添加到主屏幕”；iOS 使用 Safari 分享菜单。</li><li>必须通过 HTTPS 访问，且已加载过本站。</li></ol></div><p class="muted pwa-note">应用版本 ${version}。若你刚刚关闭了安装提示，刷新页面后重新尝试。</p>`;
}

function byokCard() {
  const config = byokSummary();
  return `<section class="card card-pad" data-byok-card>
    <div class="section-head"><h2 class="section-title" style="font-size:16px">自有 AI 配置</h2><span class="badge ${config ? 'badge-ok' : ''}">${config ? '已保存到本机' : '可选'}</span></div>
    <p class="muted" style="font-size:10.5px;line-height:1.7;margin:0 0 8px">仅保存在当前浏览器（勾选后 localStorage，否则 sessionStorage）；请求由浏览器直接发送到你填写的 Base URL，不经过本站服务器，也不会写入服务器数据库、成本日志或错误日志。BYOK 直连对话不进入服务端审计；请勿使用生产环境高权限密钥。${store.user?.isGuest ? '登录后才能使用自有配置对话。' : ''}</p>
    ${config ? `<div class="settings-row" style="padding:4px 0"><div><div class="settings-name">${escapeHtml(config.model)}</div><div class="settings-sub">${escapeHtml(config.baseUrl)} · ${escapeHtml(config.apiKey)}${config.remembered ? ' · 已记住' : ' · 仅当前标签页'}</div></div><span class="badge badge-brand">BYOK</span></div>` : ''}
    <div class="form-grid" style="margin-top:6px">
      <label class="field"><span>Base URL（必须 HTTPS）</span><input class="input" data-byok-base value="${escapeHtml(config?.baseUrl || '')}" placeholder="https://api.deepseek.com/v1" autocomplete="off"></label>
      <label class="field"><span>模型</span><input class="input" data-byok-model value="${escapeHtml(config?.model || '')}" placeholder="deepseek-chat" autocomplete="off"></label>
      <label class="field"><span>API Key</span><input class="input" type="password" data-byok-key value="" placeholder="${config ? '已保存，留空不修改' : 'sk-…'}" autocomplete="off"></label>
      <label class="admin-check"><input type="checkbox" data-byok-remember ${config?.remembered ? 'checked' : ''}> 记住到本设备（localStorage，公共电脑请勿勾选）</label>
    </div>
    <div class="row-wrap" style="margin-top:8px"><button class="btn btn-primary btn-sm" type="button" data-byok-save>保存到浏览器</button><button class="btn btn-ghost btn-sm" type="button" data-byok-clear ${config ? '' : 'disabled'}>清除</button></div>
  </section>`;
}

function accountCard(user) {
  return `<section class="card card-pad account-card">
    <div class="section-head"><h2 class="section-title">账号与安全</h2><span class="badge badge-brand">@${escapeHtml(user.username || '')}${user.isAdmin ? ' · 管理员' : ''}</span></div>
    ${user.email ? `<div class="settings-row" style="padding:4px 0"><div><div class="settings-name">${escapeHtml(user.email)}</div><div class="settings-sub">${user.emailVerified ? '邮箱已验证' : '邮箱未验证'}</div></div><span class="badge ${user.emailVerified ? 'badge-ok' : 'badge-warn'}">${user.emailVerified ? '已验证' : '未验证'}</span></div>` : ''}
    <div class="field"><label for="profile-name">昵称</label><div class="row-wrap"><input class="input" id="profile-name" data-profile-name maxlength="20" value="${escapeHtml(user.displayName || '')}" autocomplete="nickname"><button class="btn btn-secondary btn-sm" type="button" data-profile-save>保存昵称</button></div></div>
    <details class="account-details">
      <summary>修改密码</summary>
      <div class="form-grid" style="margin-top:8px">
        <div class="field"><label for="pw-current">当前密码</label><input class="input" id="pw-current" type="password" data-pw-current autocomplete="current-password"></div>
        <div class="field"><label for="pw-new">新密码（至少 8 位）</label><input class="input" id="pw-new" type="password" data-pw-new autocomplete="new-password"></div>
        <button class="btn btn-secondary btn-sm" type="button" data-pw-save>更新密码</button>
      </div>
    </details>
    <div class="account-passkey-head"><b>Passkey</b><span class="muted">免密码登录；管理员账号同样可用</span></div>
    <div class="account-passkeys" data-passkeys><p class="muted" style="font-size:11px">加载中…</p></div>
    <button class="btn btn-primary btn-sm" type="button" data-passkey-add style="margin-top:8px">${icon('fingerprint', 14)} 添加本机 Passkey</button>
  </section>`;
}

export async function meView() {
  const el = document.createElement('div');
  el.className = 'page';
  const stats = await api.stats('week');
  document.title = '我的 · 心迹 ECG Lab';
  const user = store.user || { displayName: '访客', isGuest: true, xp: 0 };
  const level = !user.isGuest && store.level
    ? { level: store.level.level, xp: store.level.xp, nextXp: store.level.nextXp, progress: store.level.progress }
    : levelInfo(Number(user.xp || 0));
  const canRegister = store.features?.registrationEnabled !== false;
  const canLogin = store.features?.userLoginEnabled !== false;
  if (user.isGuest) await store.getDiagnoses();
  const localStatus = user.isGuest ? store.localProgress || {} : {};
  const allItems = store.diagnosesCache?.items || [];
  const localRead = Object.keys(localStatus).length;
  const localMastered = Object.values(localStatus).filter((x) => x === 'mastered').length;
  const read = user.isGuest ? localRead : (stats.progress?.read || 0);
  const total = user.isGuest ? (store.content?.articles || stats.progress?.total || 40) : (stats.progress?.total || 40);
  const percent = total ? Math.round((read / total) * 100) : 0;
  const chapterStats = user.isGuest
    ? (store.chapters || []).map((chapter) => {
      const items = allItems.filter((item) => item.chapter === chapter.id);
      const chapterRead = items.filter((item) => Boolean(localStatus[item.id])).length;
      const chapterMastered = items.filter((item) => localStatus[item.id] === 'mastered').length;
      return { ...chapter, read: chapterRead, mastered: chapterMastered, total: items.length, percent: items.length ? Math.round((chapterRead / items.length) * 100) : 0 };
    })
    : (stats.chapters || []);
  const localReview = reviewSummary();
  const circumference = 2 * Math.PI * 48;
  const dash = (percent / 100) * circumference;

  el.innerHTML = `
    <header class="page-head">
      <div><div class="page-eyebrow">${icon('user', 14)} MY LAB</div><h1 class="page-title">我的学习</h1><p class="page-sub">${user.isGuest ? `当前为游客模式：学习进度保存在本设备浏览器。${canRegister || canLogin ? '注册或登录后可在服务器保存进度。' : ''}` : '进度、答题与急救记录保存在当前账号，错题与收藏会跨设备同步。'}</p></div>
      <div class="row-wrap"><span class="badge">v${escapeHtml(store.app?.version || '—')}</span><span class="badge badge-brand">${user.isGuest ? '访客模式' : '已登录'} · Lv.${level.level} · ${user.xp || 0} XP</span></div>
    </header>
    <div class="me-header" style="margin-bottom:14px">
      <div class="row"><span class="profile-avatar">${escapeHtml((user.displayName || '心迹').replace(/[·\s]/g, '').slice(0, 2))}</span><div><div class="profile-name">${escapeHtml(user.displayName || '访客')}</div><div class="profile-sub">${user.isGuest ? '访客模式 · 进度保存在当前设备浏览器' : `@${escapeHtml(user.username || '')}`}</div></div></div>
      <div class="me-actions">${user.isGuest
      ? (canRegister || canLogin ? `${canRegister ? `<button class="btn btn-primary btn-sm" type="button" data-register>${icon('lock', 14)} 注册保存进度</button>` : ''}${canLogin ? `<button class="btn btn-secondary btn-sm" type="button" data-login>登录</button>` : ''}` : `<span class="badge badge-ok">${icon('check', 12)} 进度已保存在本设备</span>`)
      : `<div class="row-wrap" style="gap:6px">${user.isAdmin ? `<a class="btn btn-primary btn-sm" href="#/admin">${icon('settings', 14)} 进入后台</a>` : ''}<button class="btn btn-ghost btn-sm" type="button" data-logout>${icon('logout', 14)} 退出登录</button></div>`}</div>
    </div>
    <div class="me-grid">
      <div class="stack-lg">
        <section class="card card-pad" data-pwa-card>
          <div class="section-head"><h2 class="section-title" style="font-size:16px">安装应用</h2><span class="badge ${isPwaStandalone() ? 'badge-ok' : 'badge-brand'}">${isPwaStandalone() ? '已安装' : 'PWA'}</span></div>
          <div data-pwa-action>${pwaActionMarkup()}</div>
        </section>
        ${user.isGuest ? '' : accountCard(user)}
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title">学习进度</h2><span class="badge">${read} / ${total} 篇</span></div>
          <div class="me-chart">
            <div class="ring-wrap"><svg class="progress-ring" viewBox="0 0 118 118" aria-label="阅读进度 ${percent}%"><circle class="track" cx="59" cy="59" r="48"></circle><circle class="value" cx="59" cy="59" r="48" stroke-dasharray="${dash} ${circumference}" stroke-dashoffset="0"></circle></svg><div class="ring-label"><b>${percent}%</b><span>已读</span></div></div>
            <div class="chapter-progress-list">
              ${chapterStats.map((chapter) => `<div class="chapter-progress-row"><span class="chapter-progress-name">${escapeHtml(chapter.name)}</span><span class="chapter-progress-meta">${chapter.read}/${chapter.total}</span><div class="progress"><div class="progress-bar" style="width:${chapter.percent}%"></div></div></div>`).join('')}
            </div>
          </div>
        </section>
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title">错题与复习</h2><a class="section-kicker" href="#/review">打开错题本 →</a></div>
          <div class="review-me-grid"><div><b>${localReview.due}</b><span>今日待复习</span></div><div><b>${localReview.wrong}</b><span>错题诊断</span></div><div><b>${localReview.favorites}</b><span>收藏章节</span></div></div>
          <p class="muted" style="font-size:11px;line-height:1.7;margin-top:8px">答错的诊断会自动进入错题本；按 1 → 3 → 8 → 20 天自适应间隔重现（封顶 90 天），记录${user.isGuest ? '只保存在本设备' : '已同步到你的账号'}。</p>
          <a class="btn btn-secondary btn-sm" href="#/review" style="margin-top:9px">${icon('target', 14)} 开始间隔复习</a>
        </section>
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title">判读记录</h2><a class="section-kicker" href="#/practice">去练习 →</a></div>
          ${(stats.history || []).length ? `<div class="stack">${stats.history.slice(0, 6).map((item) => `<div class="settings-row" style="padding:8px 0"><div><div class="settings-name">${escapeHtml((item.correctNames || []).join('、'))}</div><div class="settings-sub">${escapeHtml(item.createdAt || '')} · ${item.timeMs ? Math.round(item.timeMs / 1000) + ' 秒' : '—'}</div></div><span class="badge ${item.correct ? 'badge-ok' : 'badge-danger'}">${item.correct ? '正确' : '重读'}</span></div>`).join('')}</div>` : `<div class="learn-empty"><b>还没有判读记录</b><span>完成第一道题后，这里会显示你的诊断准确率与最近题目。</span><a class="btn btn-primary btn-sm" href="#/practice" style="margin-top:12px">开始练习</a></div>`}
        </section>
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title">急救记录</h2><a class="section-kicker" href="#/sim">去推演 →</a></div>
          ${(stats.recentSim || []).length ? `<div class="stack">${stats.recentSim.map((run) => `<div class="settings-row"><div><div class="settings-name">${escapeHtml(run.scenario_id)}</div><div class="settings-sub">${escapeHtml(run.outcome || '')} · ${run.duration_s}s</div></div><span class="badge badge-brand">${run.score} 分 · ${escapeHtml(run.grade || '')}</span></div>`).join('')}</div>` : `<p class="muted" style="font-size:12px">还没有完成急救场景。建议从“心室颤动 · 心脏骤停”开始。</p>`}
        </section>
        ${medicalDisclaimer()}
      </div>
      <aside class="stack">
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title" style="font-size:16px">成长等级</h2><span class="badge badge-brand">Lv.${level.level}</span></div>
          <div class="row-wrap" style="justify-content:space-between;margin-top:6px"><b>${level.xp || 0} XP</b><span class="muted" style="font-size:10.5px">${level.nextXp ? `距 Lv.${level.level + 1} 还差 ${Math.max(0, level.nextXp - (level.xp || 0))} XP` : '已达最高等级'}</span></div>
          <div class="progress" style="margin-top:6px"><div class="progress-bar" style="width:${level.progress || 0}%"></div></div>
          <p class="muted" style="font-size:10.5px;margin-top:8px;line-height:1.7">所有难度均可自由练习；Lv.${ADVANCED_UNLOCK} 起进阶计分、Lv.${CHALLENGE_UNLOCK} 起挑战计分，未达等级时不计分、不扣分；Lv.${AI_UNLOCK} 解锁 AI 导师。答错扣 XP 会降级；Lv.10 后基础题不再给 XP。</p>
        </section>
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title" style="font-size:16px">AI 导师</h2><span class="badge ${store.ai?.disabledUntil ? 'badge-danger' : 'badge-brand'}">${store.ai?.disabledUntil ? '暂停中' : `Lv.${store.ai?.level || level.level}`}</span></div>
          ${user.isGuest ? `<p class="muted" style="font-size:11px;line-height:1.7">注册并达到 Lv.${store.ai?.levelRequired || AI_UNLOCK} 后解锁 AI 对话；每日挑战可获得对话次数。</p><a class="btn btn-secondary btn-sm" href="#/daily" style="margin-top:8px">去每日挑战</a>` : store.ai?.levelUnlocked === false ? `<p class="muted" style="font-size:11px;line-height:1.7">达到 Lv.${store.ai?.levelRequired || AI_UNLOCK} 后解锁 AI 对话。每日挑战每次奖励基础次数 + 答对题数。</p><a class="btn btn-secondary btn-sm" href="#/daily" style="margin-top:8px">去每日挑战</a>` : `<div class="review-me-grid"><div><b>${store.ai?.admin ? '不限' : (store.ai?.credits ?? 0)}</b><span>对话次数</span></div><div><b>${store.ai?.analysisRemaining ?? 0}/${store.ai?.analysisLimit ?? 0}</b><span>今日错因分析</span></div><div><b>${store.ai?.creditCap ?? 100}</b><span>次数上限</span></div></div><p class="muted" style="font-size:10.5px;margin-top:8px">次数仅通过每日挑战获得；每日 ${store.ai?.creditBase ?? 10} 次 + 答对题数，最多保留 ${store.ai?.creditCap ?? 100} 次。</p><a class="btn btn-secondary btn-sm" href="#/ai" style="margin-top:8px">${icon('sparkles', 13)} 打开 AI 导师</a>`}
          ${store.ai?.disabledUntil ? `<p class="muted" style="font-size:10px;color:var(--danger)">暂停至 ${escapeHtml(store.ai.disabledUntil)}，请联系管理员恢复。</p>` : ''}
        </section>
        ${store.ai?.byokEnabled ? byokCard() : ''}
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title" style="font-size:16px">排行榜</h2><div class="segmented"><button class="segment active" type="button" data-scope="week">本周</button><button class="segment" type="button" data-scope="all">总榜</button></div></div>
          <div class="leaderboard" data-leaderboard>${renderLeaderboard(stats.leaderboard || [])}</div>
        </section>
        <section class="card card-pad">
          <h2 class="section-title" style="font-size:16px">外观主题</h2>
          <div class="segmented" style="margin-top:8px;width:100%"><button class="segment ${getThemeMode() === 'auto' ? 'active' : ''}" type="button" data-theme-set="auto">跟随系统</button><button class="segment ${getThemeMode() === 'light' ? 'active' : ''}" type="button" data-theme-set="light">浅色</button><button class="segment ${getThemeMode() === 'dark' ? 'active' : ''}" type="button" data-theme-set="dark">深色</button></div>
          <div class="row-wrap" style="margin-top:10px"><button class="btn btn-sm ${isLowBandwidth() ? 'btn-primary' : 'btn-secondary'}" type="button" data-low-bandwidth aria-pressed="${isLowBandwidth() ? 'true' : 'false'}">${icon('activity', 13)} ${isLowBandwidth() ? '低带宽已开启' : '低带宽模式'}</button></div>
          <p class="muted" style="font-size:10.5px;margin-top:8px">主题与低带宽设置保存在本机；安装后可离线打开已缓存页面。</p>
          <div class="row-wrap" style="margin-top:9px"><span class="muted" style="font-size:10px">语言 / Language</span>${LOCALES.map((locale) => `<button class="btn btn-xs ${getLocale() === locale.id ? 'btn-primary' : 'btn-ghost'}" type="button" data-locale="${locale.id}">${escapeHtml(locale.label)}${locale.id === 'en' ? ' beta' : ''}</button>`).join('')}<a class="btn btn-xs btn-ghost" href="#/glossary">${icon('bookOpen', 12)} ${getLocale() === 'en' ? 'Glossary' : '术语表'}</a></div>
        </section>
        ${store.ai?.allowed !== false ? `<section class="card card-pad">
          <h2 class="section-title" style="font-size:16px">${icon('sparkles', 14)} AI 导师</h2>
          <p class="muted" style="font-size:11px;line-height:1.7;margin-top:5px">${store.ai?.configured ? `已接入 ${escapeHtml(store.ai.model || '外部模型')}，今日剩余 ${store.ai.remaining} 次。` : '当前为本地知识库模式。管理员配置 OpenAI 兼容 API 后，可获得个性化组卷、错因解析与急救复盘。'}</p>
          <div class="row-wrap" style="margin-top:8px"><span class="badge ${store.ai?.configured ? 'badge-brand' : ''}">${store.ai?.configured ? 'ONLINE' : 'LOCAL'}</span><span class="badge">每日 ${store.ai?.dailyLimit || 30} 次</span></div>
        </section>` : ''}
        <section class="card card-pad">
          <h2 class="section-title" style="font-size:16px">快速开始</h2>
          <div class="quick-actions" style="margin-top:8px">
            <a class="quick-action" href="#/learn">${icon('bookOpen', 15)} 诊断图谱</a>
            <a class="quick-action" href="#/practice">${icon('target', 15)} 判读练习</a>
            <a class="quick-action" href="#/exam">${icon('trophy', 15)} 学习考试</a>
            <a class="quick-action" href="#/leaderboard">${icon('trophy', 15)} 测试排行</a>
            <a class="quick-action" href="#/review">${icon('bookOpen', 15)} 错题复习</a>
            <a class="quick-action" href="#/sim">${icon('zap', 15)} 急救推演</a>
            <a class="quick-action" href="#/lab">${icon('flask', 15)} 电解质</a>
          </div>
        </section>
      </aside>
    </div>
    ${user.isGuest ? '<footer class="page-footer">学习进度、主题与本地状态保存在当前设备浏览器；清除浏览器数据会同时清除这些本地记录。</footer>' : ''}`;

  el.querySelector('[data-register]')?.addEventListener('click', () => openAuth('register'));
  el.querySelector('[data-login]')?.addEventListener('click', () => openAuth('login'));
  el.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await logout();
    navigate('/me');
  });
  if (!user.isGuest) {
    const loadPasskeys = async () => {
      const host = el.querySelector('[data-passkeys]');
      if (!host) return;
      try {
        const data = await api.mePasskeys();
        const items = data.items || [];
        host.innerHTML = items.length
          ? items.map((item) => `<div class="passkey-row"><div><b>${escapeHtml(item.label)}</b><span>注册 ${escapeHtml(String(item.created_at || '').slice(0, 10))} · 最近使用 ${escapeHtml(item.last_used_at || '—')}</span></div><button class="btn btn-xs btn-ghost" type="button" data-passkey-del="${item.id}">删除</button></div>`).join('')
          : '<p class="muted" style="font-size:11px">尚未添加 Passkey。</p>';
        host.querySelectorAll('[data-passkey-del]').forEach((button) => button.addEventListener('click', async () => {
          if (!window.confirm('删除这个 Passkey？删除后需用密码或其他 Passkey 登录。')) return;
          try {
            await api.mePasskeyDelete(Number(button.dataset.passkeyDel));
            toast('Passkey 已删除', 'success');
            await loadPasskeys();
          } catch (error) { toast(error.message || '删除失败', 'error'); }
        }));
      } catch (error) {
        host.innerHTML = `<p class="muted" style="font-size:11px">${escapeHtml(error.message || 'Passkey 加载失败')}</p>`;
      }
    };
    el.querySelector('[data-profile-save]')?.addEventListener('click', async () => {
      const input = el.querySelector('[data-profile-name]');
      const name = String(input?.value || '').trim();
      if (!name) return toast('昵称不能为空', 'warn');
      try {
        const updated = await api.meProfile(name);
        store.setUser({ ...(store.user || {}), displayName: updated.displayName });
        window.dispatchEvent(new CustomEvent('auth:changed'));
        toast('昵称已保存', 'success');
      } catch (error) { toast(error.message || '保存失败', 'error'); }
    });
    el.querySelector('[data-pw-save]')?.addEventListener('click', async () => {
      const current = String(el.querySelector('[data-pw-current]')?.value || '');
      const next = String(el.querySelector('[data-pw-new]')?.value || '');
      if (!current || next.length < 8) return toast('请输入当前密码，新密码至少 8 位', 'warn');
      try {
        await api.mePassword(current, next);
        el.querySelectorAll('[data-pw-current], [data-pw-new]').forEach((input) => { input.value = ''; });
        toast('密码已更新', 'success');
      } catch (error) { toast(error.message || '更新失败', 'error'); }
    });
    el.querySelector('[data-passkey-add]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const options = await api.mePasskeyOptions();
        const credential = await createPasskey(options);
        const label = window.prompt('给这个 Passkey 起个名字：', '本机') || '本机';
        await api.mePasskeyRegister({ credential, label });
        toast('Passkey 已添加', 'success');
        await loadPasskeys();
      } catch (error) { toast(error.message || '添加失败', 'error'); }
      finally { button.disabled = false; }
    });
    loadPasskeys();
  }
  el.querySelectorAll('[data-locale]').forEach((button) => button.addEventListener('click', () => {
    setLocale(button.dataset.locale);
    toast(button.dataset.locale === 'en' ? 'English UI enabled. Course content remains Chinese for now.' : '已切换为中文界面', 'success');
    window.setTimeout(() => window.location.reload(), 350);
  }));

  el.querySelector('[data-low-bandwidth]')?.addEventListener('click', (event) => {
    const enabled = setLowBandwidth(!isLowBandwidth());
    const button = event.currentTarget;
    button.classList.toggle('btn-primary', enabled);
    button.classList.toggle('btn-secondary', !enabled);
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    button.innerHTML = `${icon('activity', 13)} ${enabled ? '低带宽已开启' : '低带宽模式'}`;
    toast(enabled ? '已开启低带宽模式：减少装饰动画' : '已恢复正常动画', 'success');
  });
  const bindInstall = () => {
    const installButton = el.querySelector('[data-install]');
    installButton?.addEventListener('click', async () => {
      const prompt = installPrompt();
      if (!prompt) return toast('当前浏览器不支持自动安装，请使用浏览器菜单“添加到主屏幕”', 'info');
      prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') {
        clearInstallPrompt();
        toast('已安装心迹，可从桌面图标打开', 'success');
        el.querySelector('[data-pwa-action]').innerHTML = pwaActionMarkup();
        bindInstall();
      }
    });
  };
  bindInstall();
  window.addEventListener('ecg-install-ready', () => {
    const action = el.querySelector('[data-pwa-action]');
    if (action) { action.innerHTML = pwaActionMarkup(); bindInstall(); }
  }, { once: true });

  const bindByok = () => {
    const card = el.querySelector('[data-byok-card]');
    if (!card) return;
    card.querySelector('[data-byok-save]')?.addEventListener('click', () => {
      const baseUrl = card.querySelector('[data-byok-base]').value.trim();
      const model = card.querySelector('[data-byok-model]').value.trim();
      const keyInput = card.querySelector('[data-byok-key]');
      const apiKey = keyInput.value.trim() || getByok()?.apiKey || '';
      const remember = Boolean(card.querySelector('[data-byok-remember]')?.checked);
      if (!baseUrl || !model || !apiKey) return toast('请填写 Base URL、模型和 API Key', 'warn');
      if (!setByok({ baseUrl, model, apiKey }, { remember })) return toast('配置无效：Base URL 必须为 HTTPS 公网地址，Key 长度 8–300', 'error');
      toast(remember ? '已保存在本设备浏览器（本地存储，未上传服务器），请勿在公共电脑使用' : '已保存在当前标签页，关闭后失效', 'success');
      card.outerHTML = byokCard();
      bindByok();
    });
    card.querySelector('[data-byok-clear]')?.addEventListener('click', () => {
      clearByok();
      toast('已清除本地 AI 配置', 'info');
      card.outerHTML = byokCard();
      bindByok();
    });
  };
  bindByok();

  el.querySelectorAll('[data-theme-set]').forEach((button) => {
    button.addEventListener('click', () => {
      applyTheme(button.dataset.themeSet, { syncServer: true, lock: button.dataset.themeSet !== 'auto' });
      el.querySelectorAll('[data-theme-set]').forEach((b) => b.classList.toggle('active', b === button));
    });
  });
  let scope = 'week';
  el.querySelectorAll('[data-scope]').forEach((button) => {
    button.addEventListener('click', async () => {
      scope = button.dataset.scope;
      el.querySelectorAll('[data-scope]').forEach((b) => b.classList.toggle('active', b === button));
      try {
        const result = await api.leaderboard(scope);
        el.querySelector('[data-leaderboard]').innerHTML = renderLeaderboard(result.items || []);
      } catch (error) {
        toast(error.message || '排行榜加载失败', 'error');
      }
    });
  });
  return { el };
}

function renderLeaderboard(items) {
  if (!items.length) return '<div class="muted" style="font-size:11px;padding:10px 0">本周还没有人上榜，完成一局练习即可留下记录。</div>';
  return items.map((item, index) => `<div class="leader-row"><span class="leader-rank">${String(index + 1).padStart(2, '0')}</span><span class="leader-name">${escapeHtml(item.name)} ${item.isGuest ? '<span class="badge" style="font-size:8px">访客</span>' : ''}</span><span class="leader-points">${item.points} pts</span></div>`).join('');
}
