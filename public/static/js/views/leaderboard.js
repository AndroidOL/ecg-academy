const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108as';
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { icon, escapeHtml, toast } = await import(`../ui.js${__asset}`);

const SCOPES = [
  ['today', '今日榜', '今日 00:00 起'],
  ['week', '本周榜', '最近 7 天'],
  ['all', '总榜', '全部记录'],
];

let scope = 'today';
let data = null;

function sign(value) {
  return Number(value) > 0 ? `+${value}` : String(value);
}

function medal(rank) {
  return rank === 1 ? '冠军' : rank === 2 ? '亚军' : rank === 3 ? '季军' : `#${rank}`;
}

function row(item, me = false) {
  return `<div class="lb-row ${me ? 'me' : ''}">
    <span class="lb-rank">${item.rank ? medal(item.rank) : '—'}</span>
    <span class="lb-name"><b>${escapeHtml(item.name || '游客')}</b>${item.isGuest ? '<i>游客</i>' : '<i>用户</i>'}</span>
    <span class="lb-accuracy">${item.accuracy}%</span>
    <span class="lb-record">${item.correct} / ${item.wrong}</span>
    <strong class="lb-points">${sign(item.points)}</strong>
  </div>`;
}

function render(el) {
  const items = data?.items || [];
  const me = data?.me;
  const podium = items.slice(0, 3);
  const rest = items.slice(3);
  const meInList = me && items.some((item) => item.id === me.id);
  el.innerHTML = `
    <header class="page-head">
      <div><div class="page-eyebrow">${icon('trophy', 14)} LEADERBOARD</div><h1 class="page-title">测试排行榜</h1><p class="page-sub">答对 +1、答错 −10；面向所有用户。榜单只展示公开昵称、正确/错误数与测试分，不展示答题内容或个人信息。</p></div>
      <button class="btn btn-secondary btn-sm" type="button" data-lb-refresh>${icon('rotate', 14)} 刷新</button>
    </header>
    <div class="lb-tabs segmented">${SCOPES.map(([id, label, note]) => `<button class="segment ${scope === id ? 'active' : ''}" type="button" data-lb-scope="${id}" title="${note}">${label}</button>`).join('')}</div>
    <div class="lb-meta"><span>${escapeHtml(data?.updatedAt ? new Date(data.updatedAt).toLocaleString('zh-CN') : '—')}</span><span>${data?.total ?? 0} 位参与者</span></div>
    ${me ? `<div class="lb-me card card-pad"><div><span class="page-eyebrow">MY RANK</span><b>${me.rank ? `第 ${me.rank} 名` : '暂未上榜'}</b><p>${escapeHtml(me.name)} · 正确 ${me.correct} · 错误 ${me.wrong} · 正确率 ${me.accuracy}%</p></div><strong>${sign(me.points)}</strong></div>` : ''}
    ${podium.length ? `<section class="lb-podium">${podium.map((item) => `<article class="lb-podium-card rank-${item.rank}"><span class="lb-podium-medal">${medal(item.rank)}</span><b>${escapeHtml(item.name)}</b><small>${item.isGuest ? '游客' : '用户'} · 正确率 ${item.accuracy}%</small><strong>${sign(item.points)}</strong></article>`).join('')}</section>` : '<div class="learn-empty"><b>还没有测试记录</b><span>完成一局判读练习，答对 +1、答错 −10，即可进入排行榜。</span><a class="btn btn-primary btn-sm" href="#/practice" style="margin-top:12px">去测试</a></div>'}
    ${rest.length ? `<section class="card card-pad lb-table"><div class="lb-row lb-head"><span>排名</span><span>参与者</span><span>正确率</span><span>对 / 错</span><span>测试分</span></div>${rest.map((item) => row(item, item.id === store.user?.id)).join('')}</section>` : ''}
    ${me && !meInList ? `<section class="card card-pad lb-table"><div class="lb-row lb-head"><span>排名</span><span>参与者</span><span>正确率</span><span>对 / 错</span><span>测试分</span></div>${row(me, true)}</section>` : ''}
    <div class="lb-rules"><span>${icon('info', 13)} 今日分每日重置；周榜/总榜按分数聚合。</span><span>同分时按正确题数排序。</span><a href="#/practice">${icon('target', 13)} 回到测试模块</a></div>`;
  el.querySelectorAll('[data-lb-scope]').forEach((button) => button.addEventListener('click', async () => {
    scope = button.dataset.lbScope;
    await load(el);
  }));
  el.querySelector('[data-lb-refresh]')?.addEventListener('click', () => load(el));
}

async function load(el) {
  try {
    data = await api.practiceLeaderboard(scope);
    render(el);
  } catch (error) {
    toast(error.message || '排行榜加载失败', 'error');
    if (!data) el.innerHTML = `<div class="error-panel">${escapeHtml(error.message || '排行榜加载失败')}</div>`;
  }
}

export async function leaderboardView() {
  const el = document.createElement('div');
  el.className = 'page leaderboard-page';
  await load(el);
  return { el };
}
