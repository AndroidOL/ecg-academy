import { store } from '../store.js';
import { navigate } from '../router.js';
import {
  reviewEntries, favoriteEntries, reviewSummary, dueReviews, wrongReviews, weakDiagnosisIds,
  rateReview, toggleFavorite, exportStudyData, importStudyData, clearLocalStudyData,
} from '../study-store.js';
const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108ai';
const { icon, escapeHtml, toast, medicalDisclaimer } = await import(`../ui.js${__asset}`);

function dueLabel(entry) {
  const due = Number(entry.due || 0);
  const delta = due - Date.now();
  if (delta <= 0) return '<span class="badge badge-danger">现在复习</span>';
  const days = Math.ceil(delta / 86400000);
  return `<span class="badge">${days} 天后</span>`;
}

function entryCard(entry, mode = 'due') {
  const favorite = mode === 'favorites';
  return `<article class="review-card" data-entry="${escapeHtml(entry.id)}">
    <div class="review-card-main">
      <div class="review-card-top"><span class="badge badge-brand">${escapeHtml(entry.chapter || '复习')}</span>${favorite ? '<span class="badge">收藏</span>' : dueLabel(entry)}</div>
      <h3><a href="#/learn/${encodeURIComponent(entry.id)}">${escapeHtml(entry.name || entry.id)}</a></h3>
      <p class="review-card-meta">${favorite ? `收藏于 ${new Date(Number(entry.addedAt || Date.now())).toLocaleDateString('zh-CN')}` : `答错 ${Number(entry.wrong || 0)} 次 · 答对 ${Number(entry.correct || 0)} 次 · 间隔 ${Number(entry.interval || 0)} 天`}</p>
    </div>
    <div class="review-card-actions">
      <a class="btn btn-sm btn-secondary" href="#/learn/${encodeURIComponent(entry.id)}">${icon('bookOpen', 13)} 重读</a>
      ${favorite ? `<button class="btn btn-sm btn-ghost" type="button" data-unfavorite="${escapeHtml(entry.id)}">${icon('star', 13)} 取消收藏</button>` : `<div class="review-rate" aria-label="复习评分"><button type="button" data-rate="0" data-id="${escapeHtml(entry.id)}">忘记</button><button type="button" data-rate="1" data-id="${escapeHtml(entry.id)}">模糊</button><button type="button" data-rate="2" data-id="${escapeHtml(entry.id)}">记得</button><button type="button" data-rate="3" data-id="${escapeHtml(entry.id)}">轻松</button></div>`}
    </div>
  </article>`;
}

export async function reviewView() {
  const el = document.createElement('div');
  el.className = 'page review-page';
  try { await store.getDiagnoses(); } catch { /* offline: local review entries still render */ }
  let tab = 'due';
  const render = () => {
    const summary = reviewSummary();
    const entries = tab === 'due' ? dueReviews(100) : tab === 'wrong' ? wrongReviews(100) : favoriteEntries();
    const weak = weakDiagnosisIds(8);
    el.innerHTML = `
      <header class="page-head">
        <div><div class="page-eyebrow">${icon('target', 14)} SPACED REVIEW</div><h1 class="page-title">错题本与间隔复习</h1><p class="page-sub">错题按 1 → 3 → 7 → 14 天的间隔重现；忘记会立即回到复习队列。记录保存在本设备，不上传服务器。</p></div>
        <div class="row-wrap"><span class="badge badge-brand">${summary.due} 个待复习</span><span class="badge">${summary.wrong} 个错题</span><span class="badge">${summary.favorites} 个收藏</span></div>
      </header>
      <div class="review-toolbar">
        <div class="segmented" role="tablist" aria-label="复习分类"><button class="segment ${tab === 'due' ? 'active' : ''}" type="button" data-review-tab="due">今日待复习</button><button class="segment ${tab === 'wrong' ? 'active' : ''}" type="button" data-review-tab="wrong">错题本</button><button class="segment ${tab === 'favorites' ? 'active' : ''}" type="button" data-review-tab="favorites">收藏</button></div>
        <div class="row-wrap"><button class="btn btn-primary btn-sm" type="button" data-smart-quiz ${weak.length ? '' : 'disabled'}>${icon('sparkles', 14)} 按薄弱诊断组卷</button><button class="btn btn-secondary btn-sm" type="button" data-export>${icon('arrowUpRight', 13)} 导出本地记录</button><label class="btn btn-ghost btn-sm" for="review-import">导入</label><input id="review-import" type="file" accept="application/json" hidden></div>
      </div>
      <div class="review-list">
        ${entries.length ? entries.map((entry) => entryCard(entry, tab)).join('') : `<div class="learn-empty"><b>${tab === 'favorites' ? '还没有收藏' : tab === 'due' ? '今日复习已清空' : '还没有错题'}</b><span>${tab === 'favorites' ? '在文章右侧点击“收藏”，把重要章节留在这里。' : tab === 'due' ? '完成一次错题自评或做一局练习，系统会安排下一次复习。' : '做一局判读练习，答错的诊断会自动进入错题本。'}</span><a class="btn btn-primary btn-sm" href="#/practice" style="margin-top:12px">开始练习</a></div>`}
      </div>
      ${summary.total ? `<div class="review-footer"><span class="muted">复习记录仅存在当前浏览器；清除站点数据会丢失。</span><button class="btn btn-ghost btn-xs" type="button" data-clear>清空本地学习记录</button></div>` : ''}
      ${medicalDisclaimer()}`;
    el.querySelectorAll('[data-review-tab]').forEach((button) => button.addEventListener('click', () => { tab = button.dataset.reviewTab; render(); }));
    el.querySelectorAll('[data-rate]').forEach((button) => button.addEventListener('click', () => {
      const entry = rateReview(button.dataset.id, Number(button.dataset.rate));
      toast(`${entry?.name || '该诊断'}已安排 ${entry?.interval || 0} 天后复习`, 'success');
      render();
    }));
    el.querySelectorAll('[data-unfavorite]').forEach((button) => button.addEventListener('click', () => {
      toggleFavorite({ id: button.dataset.unfavorite });
      toast('已取消收藏', 'success'); render();
    }));
    el.querySelector('[data-smart-quiz]')?.addEventListener('click', () => {
      const focus = weakDiagnosisIds(8);
      if (!focus.length) return toast('暂无可组卷的薄弱诊断', 'warn');
      navigate(`/practice?focus=${encodeURIComponent(focus.join(','))}&auto=1&level=2`);
    });
    el.querySelector('[data-export]')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(exportStudyData(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `ecg-study-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      URL.revokeObjectURL(url);
    });
    el.querySelector('#review-import')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!importStudyData(data)) throw new Error('文件格式不正确');
        toast('本地记录已导入', 'success'); render();
      } catch (error) {
        toast(error.message || '导入失败', 'error');
      }
    });
    el.querySelector('[data-clear]')?.addEventListener('click', () => {
      if (!window.confirm('确定清空本设备的错题、收藏和复习间隔吗？此操作不可撤销。')) return;
      clearLocalStudyData(); toast('本地学习记录已清空', 'success'); render();
    });
  };
  render();
  return { el };
}
