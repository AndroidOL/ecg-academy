const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108ay';
const { store } = await import(`../store.js${__asset}`);
const { wrongReviews, weakDiagnosisIds } = await import(`../study-store.js${__asset}`);
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
      <section class="ai-tutor-main"></section>
    </div>
    ${medicalDisclaimer()}`;
  el.querySelector('.ai-tutor-main').appendChild(chat.el);
  el.querySelectorAll('[data-ai-wrong]').forEach((button) => button.addEventListener('click', () => {
    const name = button.dataset.name;
    chat.ask(`请分析我在「${name}」上的常见错误：我最容易漏掉哪些线索？下一次判读应该按什么步骤进行？`);
    chat.focus();
    toast('已把错题带入对话', 'info');
  }));
  return { el };
}
