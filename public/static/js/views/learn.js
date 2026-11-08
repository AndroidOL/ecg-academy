import { store } from '../store.js';
import { icon, chapterColor, difficultyDots, escapeHtml, setupMiniECG, emptyState, medicalDisclaimer } from '../ui.js';

export async function learnView({ query }) {
  const el = document.createElement('div');
  el.className = 'page';
  const data = await store.getDiagnoses(true);
  const items = data.items || [];
  const chapters = data.chapters?.length ? data.chapters : store.chapters;
  const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const initialChapter = query?.get('chapter') || 'all';
  const state = {
    q: '',
    chapter: chapterMap.has(initialChapter) ? initialChapter : 'all',
    level: 0,
  };
  const read = items.filter((item) => item.status).length;
  const mastered = items.filter((item) => item.status === 'mastered').length;
  const continueItem = items.find((item) => item.status !== 'mastered') || items[0] || null;

  el.innerHTML = `
    <section class="learn-hero">
      <div class="learn-hero-copy">
        <div class="page-eyebrow">${icon('bookOpen', 14)} DIAGNOSIS ATLAS</div>
        <h1 class="page-title">诊断图谱</h1>
        <p class="page-sub" style="margin-top:8px">从窦房结到离子通道。每篇都按“机制 → 标准 → 判读 → 鉴别 → 处理”组织，配一张可以逐搏测量、切换 12 导联的心电图。</p>
        <div class="row-wrap" style="margin-top:14px">
          <span class="chip chip-soft">${icon('check', 13)} 已读 ${read} / ${items.length}</span>
          <span class="chip">${icon('target', 13)} 已掌握 ${mastered}</span>
          ${continueItem ? `<a class="chip" href="#/learn/${continueItem.id}">继续：${escapeHtml(continueItem.name)} ${icon('arrowRight', 12)}</a>` : ''}
        </div>
      </div>
      <div class="learn-count">
        <div><b>${items.length}</b><span>篇课程</span></div>
        <div><b>${chapters.length}</b><span>个章节</span></div>
        <div><b>${read ? Math.round((read / Math.max(1, items.length)) * 100) : 0}%</b><span>我的进度</span></div>
      </div>
    </section>

    <div class="filter-bar" style="margin-top:18px">
      <div class="search-box">${icon('search', 16)}<input class="input" type="search" placeholder="搜索诊断、英文名或关键词…" data-learn-search aria-label="搜索诊断"></div>
      <div class="row-wrap" data-chapter-chips>
        <button class="chip active" type="button" data-chapter="all">全部</button>
        ${chapters.map((chapter) => `<button class="chip" type="button" data-chapter="${escapeHtml(chapter.id)}">${escapeHtml(chapter.name)}</button>`).join('')}
      </div>
      <select class="select" style="flex:0 0 112px;min-height:36px" data-level aria-label="难度筛选">
        <option value="0">全部难度</option>
        <option value="1">基础</option>
        <option value="2">进阶</option>
        <option value="3">挑战</option>
      </select>
    </div>
    <div class="filter-summary"><b data-learn-count>${items.length}</b> 个结果 <span>·</span> 点击卡片查看完整解析与 ECG 标注</div>
    <section class="card-grid" data-learn-grid aria-live="polite"></section>
    ${medicalDisclaimer()}
    <footer class="page-footer"><strong>说明：</strong>心电图波形为教学用途的形态学近似；诊断标准与处理原则需结合最新指南与临床情境。</footer>`;

  const grid = el.querySelector('[data-learn-grid]');
  const count = el.querySelector('[data-learn-count]');
  const search = el.querySelector('[data-learn-search]');
  const levelSelect = el.querySelector('[data-level]');
  const chapterChips = el.querySelector('[data-chapter-chips]');

  const filtered = () => {
    const q = state.q.toLowerCase();
    return items.filter((item) => {
      if (state.chapter !== 'all' && item.chapter !== state.chapter) return false;
      if (state.level && Number(item.difficulty) !== state.level) return false;
      if (q) {
        const haystack = `${item.name} ${item.en} ${(item.tags || []).join(' ')} ${item.oneLiner}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
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
          <span class="badge">${escapeHtml(chapter?.name || item.chapterName || '')}</span>
          ${status}
        </div>
        <div class="diagnosis-name">${escapeHtml(item.name)}</div>
        <div class="diagnosis-en">${escapeHtml(item.en || '')}</div>
        <div class="mini-ecg"><canvas data-mini-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)} 心电图缩略图"></canvas></div>
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
    if (list.length === 0) {
      grid.innerHTML = emptyState('没有匹配的诊断', '试试清空搜索或切换到“全部”章节。', 'search');
      return;
    }
    grid.innerHTML = list.map(cardHtml).join('');
    grid.querySelectorAll('canvas[data-mini-id]').forEach((canvas) => {
      const item = itemMap.get(canvas.dataset.miniId);
      if (item) setupMiniECG(canvas, item.preview);
    });
  };

  search.addEventListener('input', () => {
    state.q = search.value.trim();
    render();
  });
  levelSelect.addEventListener('change', () => {
    state.level = Number(levelSelect.value) || 0;
    render();
  });
  chapterChips.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chapter]');
    if (!button) return;
    state.chapter = button.dataset.chapter;
    chapterChips.querySelectorAll('[data-chapter]').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.chapter === state.chapter);
    });
    const hash = state.chapter === 'all' ? '#/learn' : `#/learn?chapter=${encodeURIComponent(state.chapter)}`;
    history.replaceState(null, '', hash);
    render();
  });
  chapterChips.querySelectorAll('[data-chapter]').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.chapter === state.chapter);
  });
  render();
  return { el };
}
