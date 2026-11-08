const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108bb';
const { store } = await import(`../store.js${__asset}`);
const { api } = await import(`../api.js${__asset}`);
const { byokPayload } = await import(`../byok.js${__asset}`);
const { wrongReviews, weakDiagnosisIds, recordAttempt } = await import(`../study-store.js${__asset}`);
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
  const entries = wrongReviews(12).filter((entry) => Number(entry.wrong || 0) > 0 || Number(entry.slow || 0) > 0);
  const chat = createAiChat({
    suggestions: ['帮我梳理一次完整的判读顺序', '为什么我的错题集中在这些诊断？', '给我一个三天复习计划'],
    welcome: '我只回答心电图与心血管电生理相关问题。可以从左侧选择一道错题开始，或直接提问。',
    placeholder: '问一个心电图相关问题…',
  });
  el.innerHTML = `<header class="page-head">
      <div><div class="page-eyebrow">${icon('sparkles', 14)} AI TUTOR</div><h1 class="page-title">AI 导师</h1><p class="page-sub">仅回答心电图、心血管电生理与判读相关问题；回答为教学用途，不替代临床判断。错题与复习数据会作为上下文，方便分析薄弱项。</p></div>
      <span class="badge badge-brand">${store.ai?.configured ? '在线' : '本地知识库'}</span>
    </header>
    <div class="ai-tutor-layout">
      <aside class="stack">
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title" style="font-size:15px">从错题开始</h2><span class="badge">${entries.length} 条</span></div>
          ${entries.length ? `<div class="ai-wrong-list">${entries.map((entry) => `<button class="ai-wrong-chip" type="button" data-ai-wrong="${escapeHtml(entry.id)}" data-name="${escapeHtml(entry.name || entry.id)}"><b>${escapeHtml(entry.name || entry.id)}</b><span>错 ${Number(entry.wrong || 0)} · 慢 ${Number(entry.slow || 0)} · 遗忘 ${Number(entry.lapses || 0)}</span></button>`).join('')}</div>` : '<p class="muted" style="font-size:11.5px">还没有错题记录。完成一局判读练习后，这里会列出常错诊断。</p>'}
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
        <section class="card card-pad">
          <h2 class="section-title" style="font-size:15px">提问范围</h2>
          <ul class="ai-scope-list">
            <li>心电图波形、间期、电轴与导联</li>
            <li>心律失常与鉴别诊断</li>
            <li>电解质、药物与急救流程</li>
            <li>学习计划与判读路径</li>
          </ul>
          <p class="muted" style="font-size:10.5px;margin-top:8px">与心电图无关的问题会被礼貌拒绝。</p>
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
            if (selectedItem) { names[selectedItem.id] = selectedItem.name; chapters[selectedItem.id] = selectedItem.chapter || ''; selectedIds.push(selectedItem.id); }
            recordAttempt({ correct: false, correctIds: [correctItem.id], selectedIds, names, chapters });
          }
        }
      });
      const score = quizPanel.querySelector('[data-quiz-score]');
      if (score) score.textContent = `得分 ${correctCount}/${questions.length}${quizData.source === 'local' ? ' · 本地题库' : ''}${quizData.cost ? ` · ${quizData.cost.model || ''} ${quizData.cost.prompt || 0}→${quizData.cost.completion || 0} tokens` : ''}`;
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
      quizData = await api.aiQuiz({ count, difficulty, topic, byok: byokPayload() });
      renderQuiz();
    } catch (error) {
      quizPanel.innerHTML = `<div class="callout danger">${escapeHtml(error.message || '生成失败')}</div>`;
    } finally {
      if (button) { button.disabled = false; button.innerHTML = `${icon('sparkles', 13)} 生成题目`; }
    }
  };
  el.querySelector('[data-quiz-generate]')?.addEventListener('click', generateQuiz);
  el.querySelectorAll('[data-ai-wrong]').forEach((button) => button.addEventListener('click', () => {
    const name = button.dataset.name;
    chat.ask(`请分析我在「${name}」上的常见错误：我最容易漏掉哪些线索？下一次判读应该按什么步骤进行？`);
    chat.focus();
    toast('已把错题带入对话', 'info');
  }));
  return { el };
}
