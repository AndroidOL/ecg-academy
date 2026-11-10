const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261109as';
const { store } = await import(`../store.js${__asset}`);
const { icon, chapterColor, difficultyDots, escapeHtml, emptyState, medicalDisclaimer } = await import(`../ui.js${__asset}`);

const PAGE_SIZE = 24;

export async function introView() {
  const el = document.createElement('div');
  el.className = 'page intro-page';
  const data = await store.getDiagnoses(true);
  const items = (data.items || []).filter((item) => item.chapter === 'theory');
  const chapterMap = new Map((data.chapters || store.chapters || []).map((chapter) => [chapter.id, chapter]));
  const theoryChapter = chapterMap.get('theory') || { name: '导论', color: 'teal' };
  const state = { q: '', sort: 'curriculum', page: 1 };
  const read = items.filter((item) => item.status).length;
  const mastered = items.filter((item) => item.status === 'mastered').length;

  el.innerHTML = `
    <section class="learn-hero">
      <div class="learn-hero-copy">
        <div class="page-eyebrow">${icon('bookOpen', 14)} INTRODUCTION</div>
        <h1 class="page-title">导论</h1>
        <p class="page-sub" style="margin-top:8px">判读之前先懂机制：离子通道与动作电位、传导系统与激动顺序、向量与导联投影、正常变异与伪差。按“概念 → 判读 → 边界”组织，配有自绘示意图与参考资料。</p>
        <div class="row-wrap" style="margin-top:14px">
          <a class="chip chip-brand" href="#/vectors">${icon('compass', 13)} 打开心脏向量实验室</a>
          <span class="chip chip-soft">${icon('check', 13)} 已读 ${read} / ${items.length}</span>
          <span class="chip">${icon('target', 13)} 已掌握 ${mastered}</span>
        </div>
      </div>
      <div class="learn-count">
        <div><b>${items.length}</b><span>篇导论</span></div>
        <div><b>${read ? Math.round((read / Math.max(1, items.length)) * 100) : 0}%</b><span>我的进度</span></div>
      </div>
    </section>

    <div class="filter-bar" style="margin-top:18px">
      <div class="search-box">${icon('search', 16)}<input class="input" type="search" placeholder="搜索导论主题、英文名或关键词…" data-intro-search aria-label="搜索导论"></div>
      <select class="select" style="flex:0 0 132px;min-height:36px" data-intro-sort aria-label="排序方式">
        <option value="curriculum">按课程顺序</option>
        <option value="difficulty">难度从低到高</option>
        <option value="difficulty-desc">难度从高到低</option>
      </select>
    </div>
    <div class="filter-summary"><b data-intro-count>${items.length}</b> 个结果 <span>·</span> 来自「${escapeHtml(theoryChapter.name)}」章节</div>
    <section class="card-grid" data-intro-grid aria-live="polite"></section>
    <div class="pager-bar" data-intro-pager aria-label="导论分页"></div>
    ${medicalDisclaimer()}
    <footer class="page-footer"><strong>说明：</strong>导论用于建立电生理与判读直觉；具体诊断标准与处理原则需结合最新指南与临床情境。</footer>`;

  const grid = el.querySelector('[data-intro-grid]');
  const count = el.querySelector('[data-intro-count]');
  const pager = el.querySelector('[data-intro-pager]');
  const search = el.querySelector('[data-intro-search]');
  const sortSelect = el.querySelector('[data-intro-sort]');

  const filtered = () => {
    const q = state.q.toLowerCase();
    const list = items.filter((item) => {
      if (!q) return true;
      const haystack = `${item.name} ${item.en} ${(item.tags || []).join(' ')} ${item.oneLiner}`.toLowerCase();
      return haystack.includes(q);
    });
    if (state.sort === 'difficulty') list.sort((a, b) => Number(a.difficulty) - Number(b.difficulty));
    if (state.sort === 'difficulty-desc') list.sort((a, b) => Number(b.difficulty) - Number(a.difficulty));
    return list;
  };

  const cardHtml = (item) => {
    const chapter = chapterMap.get(item.chapter);
    const status = item.status === 'mastered'
      ? `<span class="diagnosis-status">${icon('check', 12)} 已掌握</span>`
      : item.status === 'read'
        ? `<span class="diagnosis-status" style="color:var(--muted)">${icon('check', 12)} 已读</span>`
        : '';
    return `<a class="diagnosis-card" href="#/learn/${item.id}" style="--chapter-color:${chapterColor(chapter?.color || item.chapterColor)}">
      <div class="diagnosis-strip"></div>
      <div class="diagnosis-card-body">
        <div class="row-wrap" style="justify-content:space-between">
          <span class="badge">${escapeHtml(chapter?.name || theoryChapter.name)}</span>
          ${status}
        </div>
        <div class="diagnosis-name">${escapeHtml(item.name)}</div>
        <div class="diagnosis-en">${escapeHtml(item.en || '')}</div>
        <div class="row-wrap" style="justify-content:space-between;gap:5px"><span class="badge badge-brand" style="font-size:8.5px">理论</span>${(item.tags || []).slice(0, 2).map((tag) => `<span class="badge" style="font-size:8.5px">${escapeHtml(tag)}</span>`).join('')}</div>
        <div class="topic-glyph">${icon('bookOpen', 18)}<span>理论章 · 无波形</span></div>
        <div class="diagnosis-line">${escapeHtml(item.oneLiner)}</div>
        <div class="diagnosis-foot">
          <span class="badge">${difficultyDots(item.difficulty)} <span style="margin-left:4px">${item.difficulty >= 3 ? '挑战' : item.difficulty === 2 ? '进阶' : '基础'}</span></span>
          <span class="feature-link">阅读 ${icon('arrowRight', 12)}</span>
        </div>
      </div>
    </a>`;
  };

  const render = () => {
    const list = filtered();
    count.textContent = String(list.length);
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = list.slice(start, start + PAGE_SIZE);
    if (list.length === 0) {
      grid.innerHTML = emptyState('没有匹配的导论主题', '试试清空搜索或换一个关键词。', 'search');
      pager.innerHTML = '';
      return;
    }
    grid.innerHTML = pageItems.map(cardHtml).join('');
    pager.innerHTML = `<div class="pager-info">第 <b>${state.page}</b> / ${totalPages} 页 · 共 ${list.length} 篇</div><div class="row-wrap" style="gap:6px"><button class="btn btn-ghost btn-sm" type="button" data-intro-prev ${state.page <= 1 ? 'disabled' : ''}>上一页</button><button class="btn btn-ghost btn-sm" type="button" data-intro-next ${state.page >= totalPages ? 'disabled' : ''}>下一页</button></div>`;
    pager.querySelector('[data-intro-prev]')?.addEventListener('click', () => { state.page -= 1; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    pager.querySelector('[data-intro-next]')?.addEventListener('click', () => { state.page += 1; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  };

  search.addEventListener('input', () => {
    state.q = search.value.trim();
    state.page = 1;
    render();
  });
  sortSelect.addEventListener('change', () => {
    state.sort = sortSelect.value;
    state.page = 1;
    render();
  });
  render();
  return { el };
}
