const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261109at';
const { api } = await import(`../api.js${__asset}`);
const { icon, escapeHtml, toast, openModal, medicalDisclaimer, emptyState } = await import(`../ui.js${__asset}`);

function packCard(item) {
  return `<article class="card card-pad pack-card" data-pack="${escapeHtml(item.packId)}" role="button" tabindex="0">
    <div class="row-wrap" style="justify-content:space-between"><span class="badge badge-brand">${escapeHtml(item.version)}</span><span class="badge">${escapeHtml(item.license)}</span></div>
    <h3 style="margin:10px 0 4px;font-size:19px">${escapeHtml(item.name)}</h3>
    <div class="muted" style="font-size:10.5px;font-family:var(--font-mono)">${escapeHtml(item.packId)}</div>
    <p class="muted" style="font-size:12px;margin-top:8px">${item.chapters} 章 · ${item.articles} 篇 · ${item.reviewStatus === 'clinical_reviewed' ? '含临床审阅' : '编辑核对'}</p>
    <span class="feature-link">打开课程包 ${icon('arrowRight', 12)}</span>
  </article>`;
}

export async function packsView() {
  const el = document.createElement('div');
  el.className = 'page packs-page';
  el.innerHTML = `<header class="page-head">
      <div><div class="page-eyebrow">${icon('book', 14)} COURSE PACKS</div><h1 class="page-title">课程包</h1><p class="page-sub">来自不同教学团队的可插拔课程内容。课程包独立命名空间、独立版本与许可，经人工审阅后发布；不自动并入主课程或题库。</p></div>
    </header>
    <div class="card-grid" data-pack-grid aria-live="polite"><div class="muted">加载中…</div></div>
    ${medicalDisclaimer()}`;
  const grid = el.querySelector('[data-pack-grid]');
  try {
    const data = await api.packs();
    const items = data.items || [];
    if (!items.length) {
      grid.innerHTML = emptyState('暂无已发布课程包', '课程包由管理员在后台校验并发布后显示在这里。', 'book');
    } else {
      grid.innerHTML = items.map(packCard).join('');
      const openPack = async (packId) => {
        try {
          const pack = await api.pack(packId);
          openModal({
            title: `${pack.name} · ${pack.version}`,
            sub: `许可 ${pack.license || '—'} · 命名空间 ${pack.namespace || packId}`,
            content: `<div class="stack-lg">${(pack.chapters || []).map((chapter) => `<section><h3 style="font-size:15px">${escapeHtml(chapter.name)}</h3><div class="stack" style="margin-top:6px">${(pack.articles || []).filter((article) => article.chapter === chapter.id).map((article) => `<div class="card card-pad" style="padding:10px 12px"><div class="row-wrap" style="justify-content:space-between"><b>${escapeHtml(article.name)}</b><span class="badge">${escapeHtml(article.localId || '')}</span></div><div class="muted" style="font-size:11px;margin-top:4px">${escapeHtml(article.content?.oneLiner || article.oneLiner || '')}</div>${(article.content?.criteria || article.criteria || []).length ? `<ul style="margin:6px 0 0 16px;font-size:11px;color:var(--muted)">${((article.content?.criteria || article.criteria) || []).slice(0, 4).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}</div>`).join('') || '<div class="muted" style="font-size:12px">该章节暂无文章</div>'}</div></section>`).join('')}</div><p class="muted" style="font-size:10.5px;margin-top:10px">课程包内容由第三方团队提供，许可与医学表述以包内声明为准；本站不自动为其背书。</p>`,
          });
        } catch (error) {
          toast(error.message || '课程包加载失败', 'error');
        }
      };
      grid.querySelectorAll('[data-pack]').forEach((card) => {
        card.addEventListener('click', () => openPack(card.dataset.pack));
        card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPack(card.dataset.pack); } });
      });
    }
  } catch (error) {
    grid.innerHTML = `<div class="callout danger">${escapeHtml(error.message || '课程包加载失败')}</div>`;
  }
  return { el };
}
