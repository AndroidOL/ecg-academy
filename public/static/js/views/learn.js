const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261109ar';
const { localizedName } = await import(`../i18n.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { icon, chapterColor, difficultyDots, escapeHtml, setupMiniECG, emptyState, medicalDisclaimer } = await import(`../ui.js${__asset}`);

export async function learnView({ query }) {
  const el = document.createElement('div');
  el.className = 'page';
  const data = await store.getDiagnoses(true);
  const items = (data.items || []).filter((item) => item.chapter !== 'theory');
  const chapters = (data.chapters?.length ? data.chapters : store.chapters).filter((chapter) => chapter.id !== 'theory');
  const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem('ecg-learn-state-v1') || '{}') || {}; } catch { saved = {}; }
  const savedLevel = Number(localStorage.getItem('ecg-learn-level') || saved.level || 1);
  const initialChapter = query?.get('chapter') || saved.chapter || 'all';
  if (initialChapter === 'theory') {
    try {
      sessionStorage.setItem('ecg-learn-state-v1', JSON.stringify({ ...saved, chapter: 'all' }));
      localStorage.setItem('ecg-learn-level', String(savedLevel));
    } catch { /* ignore */ }
    location.hash = '#/intro';
  }
  const state = {
    q: String(saved.q || ''),
    chapter: chapterMap.has(initialChapter) ? initialChapter : 'all',
    level: [1, 2, 3, 4].includes(savedLevel) ? savedLevel : 1,
    urgency: ['critical', 'urgent', 'core', 'advanced', 'all'].includes(saved.urgency) ? saved.urgency : 'all',
    sort: ['curriculum', 'urgency', 'difficulty', 'difficulty-desc', 'weak'].includes(saved.sort) ? saved.sort : 'difficulty',
    scope: ['common', 'uncommon', 'all'].includes(saved.scope) ? saved.scope : 'common',
    page: Math.max(1, Number(saved.page) || 1),
    pageSize: 24,
  };
  const savedScroll = Number(saved.scroll || 0) || 0;
  let firstRender = true;
  const saveState = () => {
    try {
      sessionStorage.setItem('ecg-learn-state-v1', JSON.stringify({
        q: state.q, chapter: state.chapter, level: state.level, urgency: state.urgency,
        sort: state.sort, scope: state.scope, page: state.page, scroll: window.scrollY || 0,
      }));
      localStorage.setItem('ecg-learn-level', String(state.level));
    } catch { /* storage unavailable */ }
  };
  const URGENCY = {
    critical: ['危急优先', 'badge-danger', 0],
    urgent: ['急症相关', 'badge-warn', 1],
    core: ['核心课程', 'badge-brand', 2],
    advanced: ['进阶拓展', 'badge', 3],
  };
  const urgencyMeta = (item) => URGENCY[item.urgency] || URGENCY.core;
  const read = items.filter((item) => item.status).length;
  const mastered = items.filter((item) => item.status === 'mastered').length;
  const continueItem = items.find((item) => item.status !== 'mastered') || items[0] || null;

  el.innerHTML = `
    <section class="learn-hero">
      <div class="learn-hero-copy">
        <div class="page-eyebrow">${icon('bookOpen', 14)} DIAGNOSIS ATLAS</div>
        <h1 class="page-title">诊断图谱</h1>
        <p class="page-sub" style="margin-top:8px">从解剖、离子通道与向量，到起搏、危急值、儿科与复杂心律失常。诊断篇配可逐搏测量的交互心电图；基础理论（动作电位、传导、向量与导联）已独立为「导论」。</p>
        <div class="row-wrap" style="margin-top:14px">
          <a class="chip chip-brand" href="#/vectors">${icon('compass', 13)} 打开心脏向量实验室</a>
          <a class="chip" href="#/packs">${icon('book', 13)} 课程包</a>
          <span class="chip chip-soft">${icon('check', 13)} 已读 ${read} / ${items.length}</span>
          <span class="chip">${icon('target', 13)} 已掌握 ${mastered}</span>
          ${continueItem ? `<a class="chip" href="#/learn/${continueItem.id}">继续：${escapeHtml(localizedName(continueItem))} ${icon('arrowRight', 12)}</a>` : ''}
        </div>
      </div>
      <div class="learn-count">
        <div><b>${items.length}</b><span>篇课程</span></div>
        <div><b>${chapters.length}</b><span>个章节</span></div>
        <div><b>${read ? Math.round((read / Math.max(1, items.length)) * 100) : 0}%</b><span>我的进度</span></div>
      </div>
    </section>

    <div class="filter-bar" style="margin-top:18px">
      <div class="search-box">${icon('search', 16)}<input class="input" type="search" value="${escapeHtml(state.q)}" placeholder="搜索诊断、英文名或关键词…" data-learn-search aria-label="搜索诊断"></div>
      <div class="row-wrap" data-scope-chips style="flex:0 0 auto">
        <button class="chip ${state.scope === 'common' ? 'active' : ''}" type="button" data-scope="common">常见核心</button>
        <button class="chip ${state.scope === 'uncommon' ? 'active' : ''}" type="button" data-scope="uncommon">不常见 / 进阶</button>
        <button class="chip ${state.scope === 'all' ? 'active' : ''}" type="button" data-scope="all">全部</button>
      </div>
      <div class="row-wrap" data-chapter-chips>
        <button class="chip ${state.chapter === 'all' ? 'active' : ''}" type="button" data-chapter="all">全部</button>
        ${chapters.map((chapter) => `<button class="chip ${state.chapter === chapter.id ? 'active' : ''}" type="button" data-chapter="${escapeHtml(chapter.id)}">${escapeHtml(localizedName(chapter))}</button>`).join('')}
      </div>
      <select class="select" style="flex:0 0 128px;min-height:36px" data-level aria-label="类型与难度筛选">
        <option value="all">全部类型</option>
        <option value="1">全部基础</option>
        <option value="2">全部进阶</option>
        <option value="3">全部挑战</option>
        <option value="4">全部理论</option>
      </select>
      <select class="select" style="flex:0 0 118px;min-height:36px" data-urgency aria-label="紧急程度筛选">
        <option value="all">全部优先级</option>
        <option value="critical" ${state.urgency === 'critical' ? 'selected' : ''}>危急优先</option>
        <option value="urgent" ${state.urgency === 'urgent' ? 'selected' : ''}>急症相关</option>
        <option value="core" ${state.urgency === 'core' ? 'selected' : ''}>核心课程</option>
        <option value="advanced" ${state.urgency === 'advanced' ? 'selected' : ''}>进阶拓展</option>
      </select>
      <select class="select" style="flex:0 0 132px;min-height:36px" data-sort aria-label="排序方式">
        <option value="curriculum" ${state.sort === 'curriculum' ? 'selected' : ''}>按课程顺序</option>
        <option value="urgency" ${state.sort === 'urgency' ? 'selected' : ''}>按紧急程度</option>
        <option value="difficulty" ${state.sort === 'difficulty' ? 'selected' : ''}>难度从低到高</option>
        <option value="difficulty-desc" ${state.sort === 'difficulty-desc' ? 'selected' : ''}>难度从高到低</option>
        <option value="weak" ${state.sort === 'weak' ? 'selected' : ''}>薄弱优先</option>
      </select>
    </div>
    <div class="filter-summary"><b data-learn-count>${items.length}</b> 个结果 <span>·</span> 每页 24 章，按难度排序；点击卡片查看完整解析</div>
    <section class="card-grid" data-learn-grid aria-live="polite"></section>
    <div class="pager-bar" data-pager aria-label="课程分页"></div>
    ${medicalDisclaimer()}
    <footer class="page-footer"><strong>说明：</strong>心电图波形为教学用途的形态学近似；诊断标准与处理原则需结合最新指南与临床情境。</footer>`;

  const grid = el.querySelector('[data-learn-grid]');
  const count = el.querySelector('[data-learn-count]');
  const search = el.querySelector('[data-learn-search]');
  const levelSelect = el.querySelector('[data-level]');
  levelSelect.value = state.level === 0 ? 'all' : String(state.level);
  const urgencySelect = el.querySelector('[data-urgency]');
  const sortSelect = el.querySelector('[data-sort]');
  const chapterChips = el.querySelector('[data-chapter-chips]');
  const scopeChips = el.querySelector('[data-scope-chips]');
  const pager = el.querySelector('[data-pager]');

  const filtered = () => {
    const q = state.q.toLowerCase();
    const list = items.filter((item) => {
      if (state.scope !== 'all' && (item.rarity || 'common') !== state.scope) return false;
      if (state.chapter !== 'all' && item.chapter !== state.chapter) return false;
      if (state.level === 4) {
        if (!item.topic) return false;
      } else if (state.level && (item.topic || Number(item.difficulty) !== state.level)) {
        return false;
      }
      if (state.urgency !== 'all' && (item.urgency || 'core') !== state.urgency) return false;
      if (q) {
        const haystack = `${item.name} ${item.en} ${(item.tags || []).join(' ')} ${item.oneLiner}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    if (state.sort === 'urgency') {
      list.sort((a, b) => (urgencyMeta(a)[2] - urgencyMeta(b)[2]) || (Number(a.difficulty) - Number(b.difficulty)));
    } else if (state.sort === 'difficulty') {
      list.sort((a, b) => Number(a.difficulty) - Number(b.difficulty));
    } else if (state.sort === 'difficulty-desc') {
      list.sort((a, b) => Number(b.difficulty) - Number(a.difficulty));
    } else if (state.sort === 'weak') {
      const rank = (x) => x.status === 'mastered' ? 2 : x.status === 'read' ? 1 : 0;
      list.sort((a, b) => (rank(a) - rank(b)) || (Number(b.difficulty) - Number(a.difficulty)));
    }
    return list;
  };

  const cardHtml = (item) => {
    const chapter = chapterMap.get(item.chapter);
    const status = item.status === 'mastered'
      ? `<span class="diagnosis-status">${icon('check', 12)} 已掌握</span>`
      : item.status === 'read'
        ? `<span class="diagnosis-status" style="color:var(--muted)">${icon('check', 12)} 已读</span>`
        : '';
    const u = urgencyMeta(item);
    const preview = item.hasEcg && item.preview?.rhythm
      ? `<div class="mini-ecg"><canvas data-mini-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(localizedName(item))} ECG thumbnail"></canvas></div>`
      : `<div class="topic-glyph">${icon('bookOpen', 18)}<span>理论章 · 无波形</span></div>`;
    return `<a class="diagnosis-card" href="#/learn/${item.id}" style="--chapter-color:${chapterColor(chapter?.color || item.chapterColor)}">
      <div class="diagnosis-strip"></div>
      <div class="diagnosis-card-body">
        <div class="row-wrap" style="justify-content:space-between">
          <span class="badge">${escapeHtml(chapter ? localizedName(chapter) : (item.chapterName || ''))}</span>
          ${status}
        </div>
        <div class="diagnosis-name">${escapeHtml(localizedName(item))}</div>
        <div class="diagnosis-en">${escapeHtml(item.en || '')}</div>
        <div class="row-wrap" style="justify-content:space-between;gap:5px"><span class="badge ${u[1]}" style="font-size:8.5px">${u[0]}</span>${item.topic ? '<span class="badge" style="font-size:8.5px">理论</span>' : ''}</div>
        ${preview}
        <div class="diagnosis-line">${escapeHtml(item.oneLiner)}</div>
        <div class="diagnosis-foot">
          <span class="badge">${item.topic ? '理论' : `${difficultyDots(item.difficulty)} <span style="margin-left:4px">${item.difficulty >= 3 ? '挑战' : item.difficulty === 2 ? '进阶' : '基础'}</span>`}</span>
          <span class="feature-link">阅读 ${icon('arrowRight', 12)}</span>
        </div>
      </div>
    </a>`;
  };

  const render = () => {
    const list = filtered();
    count.textContent = String(list.length);
    const totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * state.pageSize;
    const pageItems = list.slice(start, start + state.pageSize);
    if (list.length === 0) {
      grid.innerHTML = emptyState('没有匹配的诊断', '试试清空搜索、切换难度或查看“全部”。', 'search');
      pager.innerHTML = '';
      return;
    }
    grid.innerHTML = pageItems.map(cardHtml).join('');
    grid.querySelectorAll('canvas[data-mini-id]').forEach((canvas) => {
      const item = itemMap.get(canvas.dataset.miniId);
      if (item && item.preview?.rhythm) setupMiniECG(canvas, item.preview);
    });
    pager.innerHTML = `<div class="pager-info">第 <b>${state.page}</b> / ${totalPages} 页 · 共 ${list.length} 章</div><div class="row-wrap" style="gap:6px"><button class="btn btn-ghost btn-sm" type="button" data-page-prev ${state.page <= 1 ? 'disabled' : ''}>上一页</button><button class="btn btn-ghost btn-sm" type="button" data-page-next ${state.page >= totalPages ? 'disabled' : ''}>下一页</button></div>`;
    pager.querySelector('[data-page-prev]')?.addEventListener('click', () => { state.page -= 1; saveState(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    pager.querySelector('[data-page-next]')?.addEventListener('click', () => { state.page += 1; saveState(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    saveState();
    if (firstRender) {
      firstRender = false;
      if (savedScroll > 0) requestAnimationFrame(() => window.scrollTo({ top: savedScroll, behavior: 'auto' }));
    }
  };
  const resetPage = () => { state.page = 1; saveState(); };

  search.addEventListener('input', () => {
    state.q = search.value.trim();
    resetPage();
    render();
  });
  levelSelect.addEventListener('change', () => {
    const raw = levelSelect.value;
    state.level = raw === 'all' ? 0 : Number(raw) || 0;
    // “全部基础/进阶/挑战/类型”都表示跨全部类型筛选
    state.chapter = 'all';
    chapterChips.querySelectorAll('[data-chapter]').forEach((chip) => chip.classList.toggle('active', chip.dataset.chapter === 'all'));
    history.replaceState(null, '', '#/learn');
    try { localStorage.setItem('ecg-learn-level', String(state.level)); } catch { /* ignore */ }
    resetPage();
    render();
  });
  urgencySelect.addEventListener('change', () => {
    state.urgency = urgencySelect.value;
    resetPage();
    render();
  });
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    resetPage();
    render();
  });
  scopeChips.addEventListener('click', (event) => {
    const button = event.target.closest('[data-scope]');
    if (!button) return;
    state.scope = button.dataset.scope;
    scopeChips.querySelectorAll('[data-scope]').forEach((chip) => chip.classList.toggle('active', chip === button));
    resetPage();
    render();
  });
  chapterChips.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chapter]');
    if (!button) return;
    state.chapter = button.dataset.chapter;
    chapterChips.querySelectorAll('[data-chapter]').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.chapter === state.chapter);
    });
    // 选择具体类型后，难度自动回到“全部类型”
    state.level = 0;
    levelSelect.value = 'all';
    try { localStorage.setItem('ecg-learn-level', '0'); } catch { /* ignore */ }
    const hash = state.chapter === 'all' ? '#/learn' : `#/learn?chapter=${encodeURIComponent(state.chapter)}`;
    history.replaceState(null, '', hash);
    resetPage();
    render();
  });
  chapterChips.querySelectorAll('[data-chapter]').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.chapter === state.chapter);
  });
  grid.addEventListener('click', (event) => {
    if (event.target.closest('a.diagnosis-card')) saveState();
  });
  render();
  return { el };
}
