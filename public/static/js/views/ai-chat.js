import { api } from '../api.js';
import { store } from '../store.js';
import { icon, escapeHtml, toast } from '../ui.js';

export function createAiChat({ diagnosisId = null, suggestions = [], welcome = '', placeholder = '问一个关于这张心电图的问题…' } = {}) {
  const el = document.createElement('div');
  el.className = 'ai-panel';
  const chips = suggestions.length ? suggestions : ['最容易漏诊的点是什么？', '如何与相似诊断鉴别？', '给我一个记忆口诀'];
  el.innerHTML = `
    <div class="ai-panel-head">
      <span class="ai-spark">${icon('sparkles', 17)}</span>
      <div class="grow"><div class="ai-panel-title">AI 导师</div><div class="ai-panel-sub">${store.ai?.configured ? '在线 · 基于本页知识库' : '本地知识库 · 未配置外部模型'}</div></div>
      <span class="badge ${store.ai?.configured ? 'badge-brand' : ''}">${store.ai?.configured ? 'AI' : 'LOCAL'}</span>
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

  const submit = async (override = null) => {
    const message = (override ?? input.value).trim();
    if (!message || busy) return;
    input.value = '';
    addBubble(message, 'user');
    const loading = addBubble('正在整理知识库…', 'assistant');
    loading.classList.add('muted');
    busy = true;
    send.disabled = true;
    try {
      const result = await api.aiChat(message, diagnosisId);
      loading.remove();
      addBubble(result.text, 'assistant', result.fallback ? 'local' : '');
    } catch (error) {
      loading.remove();
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
  return { el, focus: () => input.focus() };
}
