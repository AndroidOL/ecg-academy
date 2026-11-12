const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261112a10';
const { store } = await import(`../store.js${__asset}`);
const { api } = await import(`../api.js${__asset}`);
const { getByok, hasByok } = await import(`../byok.js${__asset}`);
const { directQuiz } = await import(`../ai-direct.js${__asset}`);
const { wrongReviews, weakDiagnosisIds, recordAttempt, questionSignature, wrongChoiceSummary, strongestRepeat, mistakeContext, groupReviewsByChapter } = await import(`../study-store.js${__asset}`);
const { icon, escapeHtml, toast, medicalDisclaimer } = await import(`../ui.js${__asset}`);
const { createAiChat } = await import(`./ai-chat.js${__asset}`);

export async function aiTutorView() {
  const el = document.createElement('div');
  el.className = 'page ai-tutor-page';
  if (store.user?.isGuest) {
    el.innerHTML = `<header class="page-head"><div><div class="page-eyebrow">${icon('sparkles', 14)} AI TUTOR</div><h1 class="page-title">AI 导师</h1><p class="page-sub">AI 导师仅对登录账号开放；游客的答案解析会自动使用本地知识库。</p></div></header>
      <div class="learn-empty"><b>登录后使用 AI 导师</b><span>你仍可使用全部学习、练习与急救内容；登录后还可获得流式问答与错题分析。</span><a class="btn btn-primary btn-sm" href="#/me" style="margin-top:12px">前往登录</a></div>${medicalDisclaimer()}`;
    return { el };
  }
  const ai = store.ai || {};
  if (ai.disabledUntil && !ai.admin) {
    el.innerHTML = `<header class="page-head"><div><div class="page-eyebrow">${icon('shield', 14)} AI TUTOR</div><h1 class="page-title">AI 导师</h1><p class="page-sub">AI 权限已被临时暂停，请联系管理员恢复。</p></div></header>
      <div class="learn-empty"><b>AI 权限暂停中</b><span>暂停至 ${escapeHtml(ai.disabledUntil)}。你仍可使用全部学习、练习与急救内容。</span><a class="btn btn-primary btn-sm" href="#/me" style="margin-top:12px">返回我的</a></div>${medicalDisclaimer()}`;
    return { el };
  }
  if (ai.levelUnlocked === false && !hasByok()) {
    el.innerHTML = `<header class="page-head"><div><div class="page-eyebrow">${icon('sparkles', 14)} AI TUTOR</div><h1 class="page-title">AI 导师</h1><p class="page-sub">AI 对话需要 Lv.${ai.levelRequired || 10}，并消耗每日挑战获得的次数。</p></div></header>
      <div class="learn-empty"><b>已达到 Lv.${ai.levelRequired || 10} 后解锁</b><span>你当前为 Lv.${ai.level || 1}。每日挑战每次奖励 ${ai.creditBase || 10} 次 + 答对题数，次数上限 ${ai.creditCap || 100} 次。</span><a class="btn btn-primary btn-sm" href="#/daily" style="margin-top:12px">前往每日挑战</a></div>${medicalDisclaimer()}`;
    return { el };
  }
  const entryMeta = (entry) => {
    const choice = wrongChoiceSummary(entry, 1)[0];
    const repeat = strongestRepeat(entry);
    return `错 ${Number(entry.wrong || 0)} · 慢 ${Number(entry.slow || 0)} · 遗忘 ${Number(entry.lapses || 0)}${choice ? ` · 常选 ${choice.name} ×${choice.count}` : ''}${repeat ? ` · 同题错 ${repeat.n} 次` : ''}`;
  };
  const entries = wrongReviews(24).filter((entry) => Number(entry.wrong || 0) > 0 || Number(entry.slow || 0) > 0);
  const chapterName = (id) => store.chapters?.find((chapter) => chapter.id === id)?.name || id || '未分类';
  const groups = groupReviewsByChapter(entries).map((group) => ({ ...group, name: chapterName(group.id) }));
  const chat = createAiChat({
    suggestions: ['帮我梳理一次完整的判读顺序', '为什么我的错题集中在这些诊断？', '给我一个三天复习计划'],
    welcome: '我只回答心电图与心血管电生理相关问题。可以从左侧选择一道错题开始，或直接提问。',
    placeholder: '问一个心电图相关问题…',
  });
  el.innerHTML = `<header class="page-head">
      <div><div class="page-eyebrow">${icon('sparkles', 14)} AI TUTOR</div><h1 class="page-title">AI 导师</h1><p class="page-sub">仅回答心电图、心血管电生理与判读相关问题；回答为教学用途，不替代临床判断。错题与复习数据会作为上下文，方便分析薄弱项。</p></div>
      <div class="row-wrap"><span class="badge badge-brand">${ai.admin ? '∞ 次' : hasByok() ? 'BYOK' : `${ai.credits} 次可用`}</span><span class="badge">错因分析 ${ai.analysisRemaining}/${ai.analysisLimit}</span><span class="badge">${ai.configured ? '在线' : '本地知识库'}</span></div>
    </header>
    ${!ai.admin && ai.credits <= 0 ? `<div class="callout brand" style="margin-bottom:12px">${icon('flame', 14)} 对话次数已用完。完成每日挑战可获得 ${ai.creditBase || 10} 次 + 答对题数，最多保留 ${ai.creditCap || 100} 次。<a href="#/daily">去打卡</a></div>` : ''}
    <div class="ai-tutor-layout">
      <aside class="stack">
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title" style="font-size:15px">从错题开始</h2><span class="badge">${entries.length} 条 · ${groups.length} 章</span></div>
          ${entries.length ? `<div class="ai-wrong-groups">${groups.map((group, index) => `<details class="ai-wrong-group" ${index === 0 ? 'open' : ''}><summary><span>${escapeHtml(group.name)}</span><b>${group.items.length}</b></summary><div class="ai-wrong-list">${group.items.map((entry) => `<button class="ai-wrong-chip" type="button" data-ai-wrong="${escapeHtml(entry.id)}" data-name="${escapeHtml(entry.name || entry.id)}"><b>${escapeHtml(entry.name || entry.id)}</b><span>${escapeHtml(entryMeta(entry))}</span></button>`).join('')}</div></details>`).join('')}</div>` : '<p class="muted" style="font-size:11.5px">还没有错题记录。完成一局判读练习后，这里会列出常错诊断。</p>'}
          <a class="btn btn-secondary btn-sm btn-block" href="#/review" style="margin-top:10px">${icon('target', 13)} 打开错题本</a>
        </section>
        <section class="card card-pad">
          <h2 class="section-title" style="font-size:15px">${icon('target', 14)} AI 出题</h2>
          <p class="muted" style="font-size:11px;margin-top:4px">按主题生成 4 选 1 单选题，提交后给出正确答案与详细解析。</p>
          <label class="field" style="margin-top:8px"><span class="label">主题</span><input class="input" data-quiz-topic maxlength="60" value="${escapeHtml(entries[0]?.name || '心电图判读基础')}"></label>
          <div class="row-wrap" style="margin-top:6px">
            <select class="select" data-quiz-difficulty aria-label="难度"><option value="1">基础</option><option value="2" selected>进阶</option><option value="3">挑战</option></select>
            <select class="select" data-quiz-count aria-label="题数"><option value="3" selected>3 题</option><option value="5">5 题</option></select>
          </div>
          <button class="btn btn-primary btn-sm btn-block" type="button" data-quiz-generate style="margin-top:8px">${icon('sparkles', 13)} 生成题目</button>
        </section>
      </aside>
      <section class="ai-tutor-main"><section class="card card-pad ai-quiz-panel" data-quiz-panel hidden></section></section>
    </div>
    ${medicalDisclaimer()}`;
  el.querySelector('.ai-tutor-main').appendChild(chat.el);
  const quizPanel = el.querySelector('[data-quiz-panel]');
  let quizData = null;
  const renderQuiz = () => {
    const questions = quizData?.questions || [];
    quizPanel.hidden = false;
    quizPanel.innerHTML = `<div class="section-head"><h3 style="margin:0;font-size:16px">AI 出题 · ${questions.length} 题</h3><span class="badge ${quizData.source === 'local' ? '' : 'badge-brand'}">${quizData.source === 'local' ? '本地题库' : 'AI 生成'}</span></div>
      <div class="stack" data-quiz-list style="margin-top:8px">${questions.map((question, qi) => `<div class="ai-quiz-q" data-qi="${qi}">
        <p class="ai-quiz-stem"><b>Q${qi + 1}.</b> ${escapeHtml(question.question)}</p>
        <div class="ai-quiz-options">${question.options.map((option, oi) => `<label class="ai-quiz-option"><input type="radio" name="aiq-${qi}" value="${oi}" data-q="${qi}"><span class="option-letter">${String.fromCharCode(65 + oi)}</span><span>${escapeHtml(option)}</span></label>`).join('')}</div>
        <div class="ai-quiz-explain" data-explain="${qi}" hidden></div>
      </div>`).join('')}</div>
      <div class="row-wrap" style="margin-top:10px"><button class="btn btn-primary btn-sm" type="button" data-quiz-submit>提交答案</button><button class="btn btn-secondary btn-sm" type="button" data-quiz-again>再来一组</button><button class="btn btn-ghost btn-sm" type="button" data-quiz-close>收起</button></div>
      <div class="muted" data-quiz-score style="margin-top:8px"></div>`;
    quizPanel.querySelector('[data-quiz-close]')?.addEventListener('click', () => { quizPanel.hidden = true; });
    quizPanel.querySelector('[data-quiz-again]')?.addEventListener('click', () => generateQuiz());
    quizPanel.querySelector('[data-quiz-submit]')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      let correctCount = 0;
      const items = store.diagnosesCache?.items || [];
      const byName = new Map(items.map((item) => [item.name, item]));
      questions.forEach((question, qi) => {
        const input = [...quizPanel.querySelectorAll(`input[name="aiq-${qi}"]`)].find((node) => node.checked);
        const selected = input ? Number(input.value) : -1;
        const isCorrect = selected === question.answerIndex;
        if (isCorrect) correctCount++;
        quizPanel.querySelectorAll(`input[name="aiq-${qi}"]`).forEach((node) => { node.disabled = true; });
        const explain = quizPanel.querySelector(`[data-explain="${qi}"]`);
        if (explain) {
          explain.hidden = false;
          explain.innerHTML = `<b style="color:${isCorrect ? 'var(--ok)' : 'var(--danger)'}">${isCorrect ? '回答正确' : '回答错误'}</b> · 正确答案：${escapeHtml(question.options[question.answerIndex] || '')}<p>${escapeHtml(question.explanation || '')}</p>`;
        }
        if (!isCorrect) {
          const correctItem = byName.get(question.options[question.answerIndex]);
          const selectedItem = selected >= 0 ? byName.get(question.options[selected]) : null;
          if (correctItem) {
            const names = { [correctItem.id]: correctItem.name };
            const chapters = { [correctItem.id]: correctItem.chapter || '' };
            const selectedIds = [];
            const pickedText = selected >= 0 ? String(question.options[selected] || '') : '';
            const picked = pickedText
              ? [{ id: selectedItem?.id || '', name: selectedItem?.name || pickedText, label: String.fromCharCode(65 + selected) }]
              : [];
            if (selectedItem) { names[selectedItem.id] = selectedItem.name; chapters[selectedItem.id] = selectedItem.chapter || ''; selectedIds.push(selectedItem.id); }
            recordAttempt({
              correct: false,
              correctIds: [correctItem.id],
              selectedIds,
              names,
              chapters,
              source: 'ai-quiz',
              wrongAttempts: [{
                entryId: correctItem.id,
                key: questionSignature(question.question, question.options),
                q: question.question,
                picked,
                correct: [{ id: correctItem.id, name: correctItem.name || String(question.options[question.answerIndex] || '') }],
              }],
            });
          }
        }
      });
      const score = quizPanel.querySelector('[data-quiz-score]');
      if (score) score.textContent = `得分 ${correctCount}/${questions.length}${quizData.source === 'local' ? ' · 本地题库' : quizData.source === 'byok' ? ' · BYOK 直连' : ''}${quizData.cost ? ` · ${quizData.cost.model || ''} ${quizData.cost.prompt || 0}→${quizData.cost.completion || 0} tokens` : ''}`;
    });
  };
  const generateQuiz = async () => {
    const topicInput = el.querySelector('[data-quiz-topic]');
    const difficulty = Number(el.querySelector('[data-quiz-difficulty]')?.value || 2);
    const count = Number(el.querySelector('[data-quiz-count]')?.value || 3);
    const topic = String(topicInput?.value || '').trim() || '心电图判读基础';
    const button = el.querySelector('[data-quiz-generate]');
    if (button) { button.disabled = true; button.textContent = '生成中…'; }
    quizPanel.hidden = false;
    quizPanel.innerHTML = `<h3 style="margin:0;font-size:16px">AI 出题</h3><p class="muted" style="margin-top:6px">正在生成 ${count} 道题（${escapeHtml(topic)}）…</p>`;
    try {
      const direct = getByok();
      if (direct) {
        const questions = await directQuiz(direct, { count, difficulty, topic });
        if (!questions.length) throw new Error('自有 AI 未返回有效题目');
        quizData = { source: 'byok', questions, cost: null };
      } else {
        quizData = await api.aiQuiz({ count, difficulty, topic });
      }
      renderQuiz();
    } catch (error) {
      quizPanel.innerHTML = `<div class="callout danger">${escapeHtml(error.message || '生成失败')}</div>`;
    } finally {
      if (button) { button.disabled = false; button.innerHTML = `${icon('sparkles', 13)} 生成题目`; }
    }
  };
  el.querySelector('[data-quiz-generate]')?.addEventListener('click', generateQuiz);
  el.querySelectorAll('[data-ai-wrong]').forEach((button) => button.addEventListener('click', () => {
    const entry = entries.find((item) => item.id === button.dataset.aiWrong);
    const name = button.dataset.name;
    const detail = entry ? mistakeContext(entry) : null;
    const recovered = detail?.choices?.length
      ? detail.choices
      : [...new Set((detail?.history || []).flatMap((item) => (item.picked || []).map((choice) => choice.name)).filter(Boolean))]
        .map((name) => ({ name, count: 1 }));
    const picked = recovered.slice(0, 3).map((choice) => `${choice.name}${choice.count > 1 ? `×${choice.count}` : ''}`).join('、');
    const repeat = detail?.repeat;
    let prompt = `请分析我在「${name}」上的错题。`;
    if (picked) prompt += `我实际错选的选项是：${picked}。请逐项解释每个干扰项为什么容易被误认为正确诊断。`;
    if (repeat) prompt += ` 同一道题已错 ${repeat.n} 次${repeat.picked?.length ? `，最常选「${repeat.picked[0]}」` : ''}。`;
    prompt += ' 请给出：1）每个错选项与正确诊断的关键鉴别线索（导联/间期/形态）；2）我为什么会漏掉决定性线索；3）下次固定排除顺序；4）一条下一次判读动作。';
    chat.ask(prompt, { diagnosisId: entry?.id || '', mistake: detail });
    chat.focus();
    toast('已把错题与错选记录带入对话', 'info');
  }));
  return { el };
}
