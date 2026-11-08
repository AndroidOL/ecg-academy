const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108bj';
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { icon, escapeHtml, toast, openModal } = await import(`../ui.js${__asset}`);
const { getByok, setByok, clearByok, byokPayload } = await import(`../byok.js${__asset}`);
const { streamAi } = await import(`../ai-stream.js${__asset}`);
const { renderMarkdown } = await import(`../markdown.js${__asset}`);

export function createAiChat({ diagnosisId = null, suggestions = [], welcome = '', placeholder = '问一个关于这张心电图的问题…' } = {}) {
  const el = document.createElement('div');
  el.className = 'ai-panel';
  const chips = suggestions.length ? suggestions : ['最容易漏诊的点是什么？', '如何与相似诊断鉴别？', '给我一个记忆口诀'];
  el.innerHTML = `
    <div class="ai-panel-head">
      <span class="ai-spark">${icon('sparkles', 17)}</span>
      <div class="grow"><div class="ai-panel-title">AI 导师</div><div class="ai-panel-sub">${store.ai?.configured ? '在线 · 基于本页知识库' : '本地知识库 · 未配置外部模型'}</div></div>
      ${store.ai?.byokEnabled ? `<button class="icon-btn" type="button" data-byok-config aria-label="配置 BYOK API 密钥" title="使用自己的 API Key">${icon('key', 16)}</button>` : ''}
      <span class="badge ${store.ai?.configured || store.ai?.byokEnabled ? 'badge-brand' : ''}">${store.ai?.byokEnabled && getByok() ? 'BYOK' : store.ai?.configured ? 'AI' : 'LOCAL'}</span>
    </div>
    <div class="ai-messages" data-ai-messages aria-live="polite">
      <div class="ai-bubble assistant">${escapeHtml(welcome || '我可以帮你把这张心电图的关键线索、鉴别点和处理原则串起来。仅用于教学。')}</div>
    </div>
    <div class="ai-suggestions">${chips.map((text) => `<button class="ai-suggestion" type="button" data-ai-suggestion="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('')}</div>
    <div class="ai-input-row">
      <input class="input" data-ai-input maxlength="600" placeholder="${escapeHtml(placeholder)}" aria-label="向 AI 导师提问">
      <button class="btn btn-primary btn-sm" type="button" data-ai-send>发送</button>
    </div>
    <div class="ai-disclaimer">AI 生成内容需结合教材与临床判断；急症按当地急救流程处理。</div>`;
  const messages = el.querySelector('[data-ai-messages]');
  const input = el.querySelector('[data-ai-input]');
  const send = el.querySelector('[data-ai-send]');
  let busy = false;

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
    const badge = el.querySelector('.ai-panel-head .badge');
    if (!badge) return;
    const configured = Boolean(store.ai?.configured);
    const active = Boolean(getByok());
    badge.textContent = active ? 'BYOK' : configured ? 'AI' : 'LOCAL';
    badge.classList.toggle('badge-brand', active || configured);
    const sub = el.querySelector('.ai-panel-sub');
    if (sub) sub.textContent = active ? `BYOK · ${getByok().model}` : configured ? '在线 · 基于本页知识库' : '本地知识库 · 可在设置中配置 BYOK';
  };
  el.querySelector('[data-byok-config]')?.addEventListener('click', () => {
    const current = getByok() || { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: '' };
    const modal = openModal({
      title: 'BYOK 演示 · 使用你的 API Key',
      sub: '密钥只保存在当前浏览器标签页的 sessionStorage，关闭标签页即失效；不会写入数据库或日志。',
      content: `<div class="form-grid">
        <div class="field"><label for="byok-base">Base URL（必须 HTTPS）</label><input class="input" id="byok-base" value="${escapeHtml(current.baseUrl)}" placeholder="https://api.openai.com/v1" autocomplete="off"></div>
        <div class="field"><label for="byok-model">模型</label><input class="input" id="byok-model" value="${escapeHtml(current.model)}" placeholder="gpt-4o-mini" autocomplete="off"></div>
        <div class="field"><label for="byok-key">API Key</label><input class="input" id="byok-key" type="password" value="" placeholder="sk-…（不会回显已保存密钥）" autocomplete="off"></div>
        <div class="auth-note">BYOK 仅适合个人演示；请求会经本站服务器转发，管理员可关闭此功能。不要使用生产环境高权限密钥。</div>
        <div class="row-wrap"><button class="btn btn-primary btn-sm" type="button" data-byok-save>保存到当前标签页</button><button class="btn btn-ghost btn-sm" type="button" data-byok-clear>清除</button></div>
      </div>`,
    });
    modal.el.querySelector('[data-byok-save]')?.addEventListener('click', () => {
      const apiKey = modal.el.querySelector('#byok-key').value.trim() || getByok()?.apiKey || '';
      const ok = setByok({ baseUrl: modal.el.querySelector('#byok-base').value, model: modal.el.querySelector('#byok-model').value, apiKey });
      if (!ok) return toast('请填写 Base URL、模型和 API Key', 'error');
      refreshByokLabel(); modal.close(); toast('BYOK 已保存到当前标签页', 'success');
    });
    modal.el.querySelector('[data-byok-clear]')?.addEventListener('click', () => { clearByok(); refreshByokLabel(); modal.close(); toast('已清除 BYOK 密钥', 'info'); });
  });

  const submit = async (override = null) => {
    const message = (override ?? input.value).trim();
    if (!message || busy) return;
    input.value = '';
    addBubble(message, 'user');
    const bubble = addBubble('', 'assistant', 'streaming');
    let contextHtml = contextLine(['已附带本页上下文']);
    bubble.innerHTML = `<div class="ai-context">${contextHtml}</div><div class="ai-stream-text ai-thinking">正在生成…</div>`;
    busy = true;
    send.disabled = true;
    try {
      await streamAi({ mode: 'chat', message, diagnosisId, byok: byokPayload() }, {
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
          bubble.classList.remove('streaming');
          bubble.classList.toggle('local', Boolean(done?.fallback));
          bubble.innerHTML = `${contextHtml ? `<div class="ai-context">${contextHtml}</div>` : ''}${renderMarkdown(text)}`;
          if (done?.cost) {
            const tail = document.createElement('div');
            tail.className = 'ai-meta';
            tail.textContent = `${done.cost.model || ''} · ${done.cost.prompt || 0}→${done.cost.completion || 0} tokens${done.cost.cost ? ` · ${done.cost.currency || ''}${done.cost.cost}` : ''}${done.cost.discount ? ` · ${done.cost.discount}` : ''}`;
            bubble.appendChild(tail);
          }
        },
      });
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
  return { el, focus: () => input.focus(), ask: (text) => submit(String(text || '')) };
}
