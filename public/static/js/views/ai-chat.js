const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261112a12';
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { icon, escapeHtml, toast, openModal } = await import(`../ui.js${__asset}`);
const { getByok, isRemembered, setByok, clearByok } = await import(`../byok.js${__asset}`);
const { streamAi } = await import(`../ai-stream.js${__asset}`);
const { streamDirectChat, buildMessages } = await import(`../ai-direct.js${__asset}`);
const { renderMarkdown } = await import(`../markdown.js${__asset}`);
const { getLocale, translate } = await import(`../i18n.js${__asset}`);

export function createAiChat({ diagnosisId = null, suggestions = [], welcome = '', placeholder = '问一个关于这张心电图的问题…' } = {}) {
  const el = document.createElement('div');
  el.className = 'ai-panel';
  const en = getLocale() === 'en';
  const defaultChips = en
    ? ['What is the most easily missed point?', 'How do I differentiate similar diagnoses?', 'Give me a memory mnemonic']
    : ['最容易漏诊的点是什么？', '如何与相似诊断鉴别？', '给我一个记忆口诀'];
  const chips = (suggestions.length ? suggestions : defaultChips).map((text) => translate(text));
  const welcomeText = welcome || (en
    ? 'I can connect the key clues, differential points, and management principles of this ECG. For teaching only.'
    : '我可以帮你把这张心电图的关键线索、鉴别点和处理原则串起来。仅用于教学。');
  const placeholderText = translate(placeholder) || placeholder;
  el.innerHTML = `
    <div class="ai-panel-head">
      <span class="ai-spark">${icon('sparkles', 17)}</span>
      <div class="grow"><div class="ai-panel-title">AI 导师</div><div class="ai-panel-sub">${store.ai?.configured ? '在线 · 可追问心电图与判读' : '本地知识库 · 未配置外部模型'}</div></div>
      ${store.ai?.byokEnabled ? `<button class="icon-btn" type="button" data-byok-config aria-label="AI 设置 / BYOK" title="AI 设置（BYOK）">${icon('gear', 16)}</button>` : ''}
      <span class="badge badge-brand" data-ai-credits>${store.ai?.admin ? '∞ 次' : `${store.ai?.credits ?? 0} 次`}</span>
    </div>
    <div class="ai-messages" data-ai-messages aria-live="polite">
      <div class="ai-bubble assistant">${escapeHtml(welcomeText)}</div>
    </div>
    <div class="ai-suggestions">${chips.map((text) => `<button class="ai-suggestion" type="button" data-ai-suggestion="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('')}</div>
    <div class="ai-input-row">
      <input class="input" data-ai-input maxlength="600" placeholder="${escapeHtml(placeholderText)}" aria-label="向 AI 导师提问">
      <button class="btn btn-primary btn-sm" type="button" data-ai-send>发送</button>
    </div>
    <div class="ai-disclaimer">AI 生成内容需结合教材与临床判断；急症按当地急救流程处理。</div>`;
  const messages = el.querySelector('[data-ai-messages]');
  const input = el.querySelector('[data-ai-input]');
  const send = el.querySelector('[data-ai-send]');
  let busy = false;
  const history = [];
  const hasKey = Boolean(getByok());
  const locked = store.ai && store.ai.levelUnlocked === false && !store.ai.admin && !hasKey;
  const noCredits = store.ai && !store.ai.admin && !hasKey && Number(store.ai.credits || 0) <= 0;
  if (locked) {
    input.disabled = true;
    send.disabled = true;
    input.placeholder = translate(`AI 对话需 Lv.${store.ai.levelRequired || 10} 解锁`);
  } else if (noCredits) {
    input.disabled = true;
    send.disabled = true;
    input.placeholder = translate('对话次数已用完：完成每日挑战获得次数');
  }

  const addBubble = (text, type = 'assistant', extra = '') => {
    const bubble = document.createElement('div');
    bubble.className = `ai-bubble ${type} ${extra}`;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  };
  const contextLine = (context) => (context || []).map((item) => `<span>${escapeHtml(item)}</span>`).join('');

  const refreshByokLabel = () => {
    const configured = Boolean(store.ai?.configured);
    const active = Boolean(getByok());
    const sub = el.querySelector('.ai-panel-sub');
    if (sub) sub.textContent = active ? `BYOK · ${getByok().model}` : configured ? '在线 · 可追问心电图与判读' : '本地知识库 · 可在设置中配置 BYOK';
  };
  el.querySelector('[data-byok-config]')?.addEventListener('click', () => {
    const current = getByok() || { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' };
    const modal = openModal({
      title: '自有 AI 配置 · BYOK',
      sub: '密钥只保存在本浏览器；请求由浏览器直接发送到你填写的 Base URL，不经过本站服务器。',
      content: `<div class="form-grid">
        <div class="field"><label for="byok-base">Base URL（必须 HTTPS 公网地址）</label><input class="input" id="byok-base" value="${escapeHtml(current.baseUrl)}" placeholder="https://api.deepseek.com/v1" autocomplete="off"></div>
        <div class="field"><label for="byok-model">模型</label><input class="input" id="byok-model" value="${escapeHtml(current.model)}" placeholder="deepseek-chat" autocomplete="off"></div>
        <div class="field"><label for="byok-key">API Key</label><input class="input" id="byok-key" type="password" value="" placeholder="sk-…（不会回显已保存密钥）" autocomplete="off"></div>
        <label class="admin-check"><input type="checkbox" id="byok-remember" ${isRemembered() ? 'checked' : ''}> 记住到本设备（localStorage；公共电脑请勿勾选）</label>
        <div class="auth-note">使用自有配置时不消耗本站 AI 次数，但仍受越界检测、提问间隔与对话审计约束；请勿使用生产环境高权限密钥。</div>
        <div class="row-wrap"><button class="btn btn-primary btn-sm" type="button" data-byok-save>保存到浏览器</button><button class="btn btn-ghost btn-sm" type="button" data-byok-clear>清除</button></div>
      </div>`,
    });
    modal.el.querySelector('[data-byok-save]')?.addEventListener('click', () => {
      const apiKey = modal.el.querySelector('#byok-key').value.trim() || getByok()?.apiKey || '';
      const remember = Boolean(modal.el.querySelector('#byok-remember')?.checked);
      const ok = setByok({ baseUrl: modal.el.querySelector('#byok-base').value, model: modal.el.querySelector('#byok-model').value, apiKey }, { remember });
      if (!ok) return toast('配置无效：Base URL 必须为 HTTPS 公网地址，Key 长度 8–300', 'error');
      refreshByokLabel(); modal.close(); toast(remember ? '已保存在本设备浏览器' : '已保存在当前标签页，关闭后失效', 'success');
    });
    modal.el.querySelector('[data-byok-clear]')?.addEventListener('click', () => { clearByok(); refreshByokLabel(); modal.close(); toast('已清除 BYOK 密钥', 'info'); });
  });

  const submit = async (override = null, options = {}) => {
    const message = (override ?? input.value).trim();
    if (!message || busy) return;
    if (locked) return toast(`AI 对话需 Lv.${store.ai.levelRequired || 10} 解锁`, 'warn');
    if (noCredits) return toast('对话次数已用完，完成每日挑战可获得次数', 'warn');
    const activeDiagnosisId = options?.diagnosisId || diagnosisId;
    const mistake = options?.mistake && typeof options.mistake === 'object' ? options.mistake : null;
    const priorTurns = history.slice(-8);
    input.value = '';
    addBubble(message, 'user');
    const bubble = addBubble('', 'assistant', 'streaming');
    let contextHtml = contextLine(mistake
      ? ['已附带错题记录', ...(mistake.choices?.[0] ? [`常见错选：${mistake.choices[0].name}`] : []), ...(mistake.repeat ? [`同题重复错 ${mistake.repeat.n} 次`] : [])]
      : ['已附带本页上下文']);
    bubble.innerHTML = `<div class="ai-context">${contextHtml}</div><div class="ai-stream-text ai-thinking">正在生成…</div>`;
    busy = true;
    send.disabled = true;
    const direct = getByok();
    try {
      if (direct) {
        contextHtml = contextLine([`BYOK 本地直连 · ${direct.model}`]);
        const contextHost = bubble.querySelector('.ai-context');
        if (contextHost) contextHost.innerHTML = contextHtml;
        const directMessages = await buildMessages({ message, diagnosisId: activeDiagnosisId, mistake, history: priorTurns });
        const finalText = await streamDirectChat(direct, directMessages, {
          onDelta: (chunk, text) => {
            const host = bubble.querySelector('.ai-stream-text');
            if (host) { host.classList.remove('ai-thinking'); host.innerHTML = renderMarkdown(text); }
            messages.scrollTop = messages.scrollHeight;
          },
        });
        bubble.classList.remove('streaming');
        bubble.innerHTML = `<div class="ai-context">${contextHtml}</div><div class="ai-stream-text">${renderMarkdown(finalText)}</div>`;
        history.push({ role: 'user', content: message }, { role: 'assistant', content: String(finalText || '') });
      } else {
        await streamAi({ mode: 'chat', message, diagnosisId: activeDiagnosisId, ...(mistake ? { mistake } : {}), ...(priorTurns.length ? { history: priorTurns } : {}) }, {
          onMeta: (meta) => {
            bubble.classList.toggle('local', Boolean(meta?.fallback));
            contextHtml = contextLine(meta?.context || []);
            const host = bubble.querySelector('.ai-context');
            if (host) host.innerHTML = contextHtml;
          },
          onDelta: (chunk, text) => {
            const host = bubble.querySelector('.ai-stream-text');
            if (host) { host.classList.remove('ai-thinking'); host.innerHTML = renderMarkdown(text); }
            messages.scrollTop = messages.scrollHeight;
          },
          onDone: (done, text) => {
            if (done?.source === 'ai' && !store.ai?.admin) {
              store.ai.credits = Math.max(0, Number(store.ai?.credits || 0) - 1);
              const creditsBadge = el.querySelector('[data-ai-credits]');
              if (creditsBadge) creditsBadge.textContent = `${store.ai.credits} 次`;
            }
            bubble.classList.remove('streaming');
            bubble.classList.toggle('local', Boolean(done?.fallback));
            bubble.innerHTML = `${contextHtml ? `<div class="ai-context">${contextHtml}</div>` : ''}<div class="ai-stream-text">${renderMarkdown(text)}</div>`;
            if (String(text || '').trim()) history.push({ role: 'user', content: message }, { role: 'assistant', content: String(text) });
            if (done?.cost) {
              const tail = document.createElement('div');
              tail.className = 'ai-meta';
              tail.textContent = `${done.cost.model || ''} · ${done.cost.prompt || 0}→${done.cost.completion || 0} tokens${done.cost.cost ? ` · ${done.cost.currency || ''}${done.cost.cost}` : ''}${done.cost.discount ? ` · ${done.cost.discount}` : ''}`;
              bubble.appendChild(tail);
            }
          },
        });
      }
      messages.scrollTop = messages.scrollHeight;
    } catch (error) {
      bubble.remove();
      addBubble(error.message || 'AI 暂时不可用，请稍后重试。', 'assistant', 'local');
      toast(error.message || 'AI 请求失败', 'error');
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  };

  send.addEventListener('click', () => submit());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });
  el.querySelectorAll('[data-ai-suggestion]').forEach((button) => {
    button.addEventListener('click', () => submit(button.dataset.aiSuggestion));
  });
  return { el, focus: () => input.focus(), ask: (text, options = {}) => submit(String(text || ''), options) };
}
