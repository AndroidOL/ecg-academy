import { api } from '../api.js';
import { store, applyTheme, getThemeMode } from '../store.js';
import { navigate } from '../router.js';
import { openAuth, logout } from '../auth.js';
import { icon, escapeHtml, toast, medicalDisclaimer } from '../ui.js';

export async function meView() {
  const el = document.createElement('div');
  el.className = 'page';
  const stats = await api.stats('week');
  document.title = '我的 · 心迹 ECG Lab';
  const user = store.user || { displayName: '访客', isGuest: true, xp: 0 };
  const read = stats.progress?.read || 0;
  const total = stats.progress?.total || 40;
  const percent = total ? Math.round((read / total) * 100) : 0;
  const circumference = 2 * Math.PI * 48;
  const dash = (percent / 100) * circumference;

  el.innerHTML = `
    <header class="page-head">
      <div><div class="page-eyebrow">${icon('user', 14)} MY LAB</div><h1 class="page-title">我的学习</h1><p class="page-sub">进度、错题与急救记录都保存在当前账号；游客账号也可以先学习，再注册保存。</p></div>
      <span class="badge badge-brand">${user.isGuest ? '访客模式' : '已登录'} · ${user.xp || 0} XP</span>
    </header>
    <div class="me-header" style="margin-bottom:14px">
      <div class="row"><span class="profile-avatar">${escapeHtml((user.displayName || '心迹').replace(/[·\s]/g, '').slice(0, 2))}</span><div><div class="profile-name">${escapeHtml(user.displayName || '访客')}</div><div class="profile-sub">${user.isGuest ? '进度仅保存在当前设备 · 注册可跨设备' : `@${escapeHtml(user.username || '')}`}</div></div></div>
      <div class="me-actions">${user.isGuest ? `<button class="btn btn-primary btn-sm" type="button" data-register>${icon('lock', 14)} 注册保存进度</button><button class="btn btn-secondary btn-sm" type="button" data-login>登录</button>` : `<button class="btn btn-ghost btn-sm" type="button" data-logout>${icon('logout', 14)} 退出登录</button>`}</div>
    </div>
    <div class="me-grid">
      <div class="stack-lg">
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title">学习进度</h2><span class="badge">${read} / ${total} 篇</span></div>
          <div class="me-chart">
            <div class="ring-wrap"><svg class="progress-ring" viewBox="0 0 118 118" aria-label="阅读进度 ${percent}%"><circle class="track" cx="59" cy="59" r="48"></circle><circle class="value" cx="59" cy="59" r="48" stroke-dasharray="${dash} ${circumference}" stroke-dashoffset="0"></circle></svg><div class="ring-label"><b>${percent}%</b><span>已读</span></div></div>
            <div class="chapter-progress-list">
              ${(stats.chapters || []).map((chapter) => `<div class="chapter-progress-row"><span class="chapter-progress-name">${escapeHtml(chapter.name)}</span><span class="chapter-progress-meta">${chapter.read}/${chapter.total}</span><div class="progress"><div class="progress-bar" style="width:${chapter.percent}%"></div></div></div>`).join('')}
            </div>
          </div>
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
          <div class="section-head"><h2 class="section-title" style="font-size:16px">排行榜</h2><div class="segmented"><button class="segment active" type="button" data-scope="week">本周</button><button class="segment" type="button" data-scope="all">总榜</button></div></div>
          <div class="leaderboard" data-leaderboard>${renderLeaderboard(stats.leaderboard || [])}</div>
        </section>
        <section class="card card-pad">
          <h2 class="section-title" style="font-size:16px">外观主题</h2>
          <div class="segmented" style="margin-top:8px;width:100%"><button class="segment ${getThemeMode() === 'auto' ? 'active' : ''}" type="button" data-theme-set="auto">跟随系统</button><button class="segment ${getThemeMode() === 'light' ? 'active' : ''}" type="button" data-theme-set="light">浅色</button><button class="segment ${getThemeMode() === 'dark' ? 'active' : ''}" type="button" data-theme-set="dark">深色</button></div>
          <p class="muted" style="font-size:10.5px;margin-top:8px">主题会保存在本机；登录后同步到账号。</p>
        </section>
        <section class="card card-pad">
          <h2 class="section-title" style="font-size:16px">${icon('sparkles', 14)} AI 导师</h2>
          <p class="muted" style="font-size:11px;line-height:1.7;margin-top:5px">${store.ai?.configured ? `已接入 ${escapeHtml(store.ai.model || '外部模型')}，今日剩余 ${store.ai.remaining} 次。` : '当前为本地知识库模式。管理员配置 OpenAI 兼容 API 后，可获得个性化组卷、错因解析与急救复盘。'}</p>
          <div class="row-wrap" style="margin-top:8px"><span class="badge ${store.ai?.configured ? 'badge-brand' : ''}">${store.ai?.configured ? 'ONLINE' : 'LOCAL'}</span><span class="badge">每日 ${store.ai?.dailyLimit || 30} 次</span></div>
        </section>
        <section class="card card-pad">
          <h2 class="section-title" style="font-size:16px">快速开始</h2>
          <div class="quick-actions" style="margin-top:8px">
            <a class="quick-action" href="#/learn">${icon('bookOpen', 15)} 诊断图谱</a>
            <a class="quick-action" href="#/practice">${icon('target', 15)} 判读练习</a>
            <a class="quick-action" href="#/sim">${icon('zap', 15)} 急救推演</a>
            <a class="quick-action" href="#/lab">${icon('flask', 15)} 电解质</a>
          </div>
        </section>
      </aside>
    </div>
    <footer class="page-footer">数据保存在本项目独立 MySQL 数据库；游客账号仅用于持有进度，不要求邮箱。清除浏览器 Cookie 会创建新的访客账号。</footer>`;

  el.querySelector('[data-register]')?.addEventListener('click', () => openAuth('register'));
  el.querySelector('[data-login]')?.addEventListener('click', () => openAuth('login'));
  el.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await logout();
    navigate('/me');
  });
  el.querySelectorAll('[data-theme-set]').forEach((button) => {
    button.addEventListener('click', () => {
      applyTheme(button.dataset.themeSet, { syncServer: true });
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
