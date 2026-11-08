import { getCsrf, ApiError } from './api.js';

export async function streamAi(body, handlers = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  const csrf = getCsrf();
  if (csrf) headers['X-CSRF-Token'] = csrf;
  let response;
  try {
    response = await fetch('/api/ai/stream', { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('网络连接失败，请检查网络后重试', 0, 'network');
  }
  if (!response.ok || !response.body) {
    let message = `AI 请求失败（${response.status}）`;
    try {
      const data = await response.json();
      message = data?.error?.message || message;
    } catch { /* non-json error */ }
    throw new ApiError(message, response.status);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let text = '';
  const dispatch = (event, data) => {
    if (event === 'meta') handlers.onMeta?.(data);
    else if (event === 'delta') {
      text += data.t || '';
      handlers.onDelta?.(data.t || '', text);
    } else if (event === 'done') handlers.onDone?.(data, text);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      let event = 'message';
      let dataText = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataText += line.slice(5).trim();
      }
      if (!dataText) continue;
      let data;
      try { data = JSON.parse(dataText); } catch { continue; }
      dispatch(event, data);
    }
  }
  return { text };
}
