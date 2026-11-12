import {
  reviewEntries, favoriteEntries, reviewSummary, dueReviews, wrongReviews, weakDiagnosisIds,
  rateReview, toggleFavorite, exportStudyData, importStudyData, clearLocalStudyData,
  wrongChoiceSummary, strongestRepeat, mistakeContext, wrongConfusionPairs, groupReviewsByChapter,
  weeklyReport,
} from '../study-store.js';
const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261112a11';
const { store } = await import(`../store.js${__asset}`);
const { navigate } = await import(`../router.js${__asset}`);
const { icon, escapeHtml, toast, medicalDisclaimer } = await import(`../ui.js${__asset}`);
const { streamAi } = await import(`../ai-stream.js${__asset}`);
const { renderMarkdown } = await import(`../markdown.js${__asset}`);

function dueLabel(entry) {
  const due = Number(entry.due || 0);
  const delta = due - Date.now();
  if (delta <= 0) return '<span class="badge badge-danger">现在复习</span>';
  const days = Math.ceil(delta / 86400000);
  return `<span class="badge">${days} 天后</span>`;
}

const optionText = (list) => (list || [])
  .map((item) => (typeof item === 'string' ? item : `${item?.label ? `${item.label} ` : ''}${item?.name || ''}`.trim()))
  .filter(Boolean)
  .join('、');

function entryCard(entry, mode = 'due') {
  const favorite = mode === 'favorites';
  const canExplain = !favorite && Number(entry.wrong || 0) > 0;
  const choices = canExplain ? wrongChoiceSummary(entry, 3) : [];
  const repeat = canExplain ? strongestRepeat(entry) : null;
  const logs = canExplain && Array.isArray(entry.wrongLog) ? entry.wrongLog.slice(-3).reverse() : [];
  const meta = (store.diagnosesCache?.items || []).find((item) => item.id === entry.id);
  const canRead = !meta || (meta.hasEcg !== false && meta.quizEligible !== false);
  return `<div class="review-item" data-review-item="${escapeHtml(entry.id)}">
  <article class="review-card" data-entry="${escapeHtml(entry.id)}">
    <div class="review-card-main">
      <div class="review-card-top"><span class="badge badge-brand">${escapeHtml(entry.chapter || '复习')}</span>${favorite ? '<span class="badge">收藏</span>' : dueLabel(entry)}</div>
      <h3><a href="#/learn/${encodeURIComponent(entry.id)}">${escapeHtml(entry.name || entry.id)}</a></h3>
      <p class="review-card-meta">${favorite ? `收藏于 ${new Date(Number(entry.addedAt || Date.now())).toLocaleDateString('zh-CN')}` : `答错 ${Number(entry.wrong || 0)} 次 · 答对 ${Number(entry.correct || 0)} 次 · 间隔 ${Number(entry.interval || 0)} 天`}</p>
      ${choices.length ? `<p class="review-wrong-picks">常见错选：${choices.map((choice) => `${escapeHtml(choice.name)} ×${choice.count}`).join('、')}</p>` : ''}
      ${repeat ? `<p class="review-wrong-picks"><span class="badge badge-danger">同一题已错 ${repeat.n} 次</span>${repeat.picked?.[0] ? ` 最常选 ${escapeHtml(repeat.picked[0])}` : ''}</p>` : ''}
      ${logs.length ? `<details class="review-wrong-log"><summary>最近错选记录（${entry.wrongLog.length}）</summary><ul>${logs.map((item) => {
        const picked = optionText(item.picked) || '未记录具体选项（可能漏选）';
        const correct = optionText(item.correct);
        return `<li><span>${new Date(Number(item.at || Date.now())).toLocaleDateString('zh-CN')}</span>${item.q ? ` ${escapeHtml(item.q)}` : ''}<b>你选：${escapeHtml(picked)}</b>${correct ? `<em>正确：${escapeHtml(correct)}</em>` : ''}</li>`;
      }).join('')}</ul></details>` : ''}
    </div>
    <div class="review-card-actions">
      <a class="btn btn-sm btn-secondary" href="#/learn/${encodeURIComponent(entry.id)}">${icon('bookOpen', 13)} 重读</a>
      ${canRead ? `<a class="btn btn-sm btn-ghost" href="#/read?focus=${encodeURIComponent(entry.id)}">${icon('target', 13)} 五步重读</a>` : ''}
      ${canExplain ? `<button class="btn btn-sm btn-secondary" type="button" data-mistake-ai="${escapeHtml(entry.id)}">${icon('sparkles', 13)} AI 讲错因</button>` : ''}
      ${favorite ? `<button class="btn btn-sm btn-ghost" type="button" data-unfavorite="${escapeHtml(entry.id)}">${icon('star', 13)} 取消收藏</button>` : `<div class="review-rate" aria-label="复习评分"><button type="button" data-rate="0" data-id="${escapeHtml(entry.id)}">忘记</button><button type="button" data-rate="1" data-id="${escapeHtml(entry.id)}">模糊</button><button type="button" data-rate="2" data-id="${escapeHtml(entry.id)}">记得</button><button type="button" data-rate="3" data-id="${escapeHtml(entry.id)}">轻松</button></div>`}
    </div>
  </article>
  <div class="card card-pad ai-answer review-mistake-panel" data-mistake-panel hidden></div>
</div>`;
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
    const confusions = tab === 'wrong' ? wrongConfusionPairs(5) : [];
    const chapterName = (id) => store.chapters?.find((chapter) => chapter.id === id)?.name || id || '未分类';
    const groupedEntries = groupReviewsByChapter(entries);
    const report = weeklyReport(7);
    const maxDayAttempts = Math.max(1, ...report.byDay.map((day) => day.attempts));
    el.innerHTML = `
      <header class="page-head">
        <div><div class="page-eyebrow">${icon('target', 14)} SPACED REVIEW</div><h1 class="page-title">错题本与间隔复习</h1><p class="page-sub">错题按自适应间隔重现（首答 1 天，之后 1 → 3 → 8 → 20 天，封顶 90 天）；忘记会立即回到复习队列。系统会记录你每次错选的干扰项；同一道题反复错时，AI 讲解会针对该选项与正确诊断的鉴别点展开。${store.user?.isGuest ? '记录保存在本设备，不上传服务器。' : '记录已同步到你的账号，可跨设备继续复习。'}</p></div>
        <div class="row-wrap"><span class="badge badge-brand">${summary.due} 个待复习</span><span class="badge">${summary.wrong} 个错题</span><span class="badge">${summary.favorites} 个收藏</span></div>
      </header>
      ${report.attempts ? `<section class="card card-pad review-weekly">
        <div class="section-head"><h2 class="section-title" style="font-size:16px">本周学习概览</h2><span class="badge badge-brand">${report.attempts} 次 · ${report.accuracy}%</span></div>
        <div class="weekly-bars" aria-label="最近 7 天练习次数">${report.byDay.map((day) => `<div class="weekly-day"><i style="height:${day.attempts ? Math.max(8, Math.round((day.attempts / maxDayAttempts) * 100)) : 2}%"></i><b>${day.attempts || ''}</b><span>${day.label}</span></div>`).join('')}</div>
        <div class="weekly-summary"><span>答对 <b>${report.correct}</b> · 答错 <b>${report.wrong}</b></span>${report.weakChapters.length ? `<span>薄弱：${report.weakChapters.map((item) => `${escapeHtml(chapterName(item.chapter))} ×${item.count}`).join('、')}</span>` : '<span>本周没有记录到新的错题。</span>'}</div>
        <p class="muted" style="font-size:9.5px;margin-top:6px">基于本设备最近的练习记录；注册账号的错题与复习间隔会同步，但这份周报暂不跨设备合并。</p>
      </section>` : ''}
      <div class="review-toolbar">
        <div class="segmented" role="tablist" aria-label="复习分类"><button class="segment ${tab === 'due' ? 'active' : ''}" type="button" data-review-tab="due">今日待复习</button><button class="segment ${tab === 'wrong' ? 'active' : ''}" type="button" data-review-tab="wrong">错题本</button><button class="segment ${tab === 'favorites' ? 'active' : ''}" type="button" data-review-tab="favorites">收藏</button></div>
        <div class="row-wrap"><button class="btn btn-primary btn-sm" type="button" data-smart-quiz ${weak.length ? '' : 'disabled'}>${icon('sparkles', 14)} 按薄弱诊断组卷</button><a class="btn btn-secondary btn-sm" href="#/read${weak.length ? `?focus=${encodeURIComponent(weak.join(','))}` : ''}">${icon('target', 14)} 系统判读</a><button class="btn btn-secondary btn-sm" type="button" data-review-ai>${icon('sparkles', 14)} AI 分析薄弱项</button><button class="btn btn-secondary btn-sm" type="button" data-export>${icon('arrowUpRight', 13)} 导出本地记录</button><label class="btn btn-ghost btn-sm" for="review-import">导入</label><input id="review-import" type="file" accept="application/json" hidden></div>
      </div>
      <div class="card card-pad ai-answer" data-review-ai-panel hidden></div>
      ${confusions.length ? `<section class="card card-pad review-confusions">
        <div class="section-head"><h2 class="section-title" style="font-size:16px">最常混淆</h2><span class="badge badge-warn">${confusions.length} 组</span></div>
        <p class="muted" style="font-size:10.5px;margin:4px 0 8px">按你在判读练习中的实际错选项聚合；点“练这组”会围绕正确诊断与该干扰项重新组卷。</p>
        <div class="review-confusion-list">${confusions.map((pair) => `<div class="review-confusion-item">
          <div class="review-confusion-copy"><b>${escapeHtml(pair.correctName)}</b><span>常被误选为 ${escapeHtml(pair.wrongName)} ×${pair.count}</span></div>
          <div class="row-wrap"><a class="btn btn-xs btn-ghost" href="#/learn/${encodeURIComponent(pair.correctId)}">重读正确诊断</a><button class="btn btn-xs btn-secondary" type="button" data-confusion-practice="${escapeHtml(pair.correctId)},${escapeHtml(pair.wrongId)}">练这组</button></div>
        </div>`).join('')}</div>
      </section>` : ''}
      <div class="review-list">
        ${entries.length ? groupedEntries.map((group) => `<section class="review-group"><div class="review-group-head"><span>${escapeHtml(chapterName(group.id))}</span><b>${group.items.length}</b></div>${group.items.map((entry) => entryCard(entry, tab)).join('')}</section>`).join('') : `<div class="learn-empty"><b>${tab === 'favorites' ? '还没有收藏' : tab === 'due' ? '今日复习已清空' : '还没有错题'}</b><span>${tab === 'favorites' ? '在文章右侧点击“收藏”，把重要章节留在这里。' : tab === 'due' ? '完成一次错题自评或做一局练习，系统会安排下一次复习。' : '做一局判读练习，答错的诊断会自动进入错题本。'}</span><a class="btn btn-primary btn-sm" href="#/practice" style="margin-top:12px">开始练习</a></div>`}
      </div>
      ${summary.total ? `<div class="review-footer"><span class="muted">${store.user?.isGuest ? '复习记录仅存在当前浏览器；清除站点数据会丢失。' : '复习记录已同步到你的账号。'}</span><button class="btn btn-ghost btn-xs" type="button" data-clear>清空本地学习记录</button></div>` : ''}
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
    el.querySelectorAll('[data-confusion-practice]').forEach((button) => button.addEventListener('click', () => {
      const [correctId, wrongId] = String(button.dataset.confusionPractice || '').split(',').map((id) => id.trim()).filter(Boolean);
      if (!correctId) return;
      const params = new URLSearchParams({ focus: correctId, auto: '1' });
      if (wrongId) params.set('confusion', wrongId);
      navigate(`/practice?${params.toString()}`);
    }));
    el.querySelectorAll('[data-mistake-ai]').forEach((button) => button.addEventListener('click', async () => {
      if (store.user?.isGuest) return toast('登录后可使用 AI 错因分析', 'warn');
      const id = button.dataset.mistakeAi;
      const card = button.closest('[data-review-item]');
      const panel = card?.querySelector('[data-mistake-panel]');
      const entry = reviewEntries().find((item) => item.id === id);
      if (!panel || !entry) return;
      if (!panel.hidden) { panel.hidden = true; return; }
      const context = mistakeContext(entry);
      panel.hidden = false;
      panel.innerHTML = `<h4>AI 错因分析 · ${escapeHtml(entry.name || id)}</h4><div class="ai-context"><span>已附带 ${Number(entry.wrong || 0)} 次答错记录</span>${context?.choices?.[0] ? `<span>常见错选：${escapeHtml(context.choices[0].name)} ×${context.choices[0].count}</span>` : ''}${context?.repeat ? `<span>同题错 ${context.repeat.n} 次</span>` : ''}</div><div class="ai-stream-text ai-thinking">正在生成…</div><div class="ai-meta"></div>`;
      const streamHost = panel.querySelector('.ai-stream-text');
      const meta = panel.querySelector('.ai-meta');
      button.disabled = true;
      try {
        await streamAi({ mode: 'mistake', entryId: id, mistake: context }, {
          onDelta: (chunk, text) => { streamHost.classList.remove('ai-thinking'); streamHost.innerHTML = renderMarkdown(text); },
          onDone: (done, text) => {
            const heading = panel.querySelector('h4');
            if (heading) heading.textContent = done?.fallback ? `本地错因分析 · ${entry.name || id}` : `AI 错因分析 · ${entry.name || id}`;
            streamHost.remove();
            panel.insertAdjacentHTML('beforeend', renderMarkdown(text));
            if (done?.cost) meta.textContent = `${done.cost.model || ''} · ${done.cost.prompt || 0}→${done.cost.completion || 0} tokens`;
          },
        });
      } catch (error) {
        streamHost.classList.remove('ai-thinking');
        streamHost.textContent = error.message || '分析失败';
      } finally {
        button.disabled = false;
      }
    }));
    el.querySelector('[data-review-ai]')?.addEventListener('click', async (event) => {
      if (store.user?.isGuest) return toast('登录后可使用 AI 薄弱项分析', 'warn');
      const button = event.currentTarget;
      const panel = el.querySelector('[data-review-ai-panel]');
      const entries = reviewEntries(50).filter((entry) => Number(entry.wrong || 0) > 0 || Number(entry.slow || 0) > 0);
      if (!entries.length) return toast('还没有足够的错题记录，先做一局练习', 'warn');
      panel.hidden = false;
      panel.innerHTML = `<h4>AI 薄弱项分析</h4><div class="ai-context"><span>已附带 ${entries.length} 条错题统计</span></div><div class="ai-stream-text ai-thinking">正在生成…</div><div class="ai-meta"></div>`;
      const streamHost = panel.querySelector('[data-ai-stream-text]') || panel.querySelector('.ai-stream-text');
      const meta = panel.querySelector('.ai-meta');
      button.disabled = true;
      try {
        await streamAi({
          mode: 'review',
          items: entries.map((entry) => {
            const repeat = strongestRepeat(entry);
            return {
              name: entry.name,
              chapter: entry.chapter,
              wrong: entry.wrong,
              slow: entry.slow || 0,
              lapses: entry.lapses || 0,
              choices: wrongChoiceSummary(entry, 3).map((choice) => ({ name: choice.name, count: choice.count })),
              repeat: repeat ? { n: repeat.n, picked: repeat.picked } : null,
            };
          }),
        }, {
          onDelta: (chunk, text) => { streamHost.classList.remove('ai-thinking'); streamHost.innerHTML = renderMarkdown(text); },
          onDone: (done, text) => {
            const heading = panel.querySelector('h4');
            if (heading) heading.textContent = done?.fallback ? '本地薄弱项分析' : 'AI 薄弱项分析';
            streamHost.remove();
            panel.insertAdjacentHTML('beforeend', renderMarkdown(text));
            if (done?.cost) meta.textContent = `${done.cost.model || ''} · ${done.cost.prompt || 0}→${done.cost.completion || 0} tokens`;
          },
        });
      } catch (error) {
        streamHost.classList.remove('ai-thinking');
        streamHost.textContent = error.message || '分析失败';
      } finally {
        button.disabled = false;
      }
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
