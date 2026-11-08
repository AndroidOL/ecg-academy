// BYOK 演示密钥仅保存在当前标签页的 sessionStorage；关闭标签页即失效。
const KEY = 'ecg-byok-v1';

export function getByok() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.baseUrl || !parsed.model || !parsed.apiKey) return null;
    return { baseUrl: String(parsed.baseUrl), model: String(parsed.model), apiKey: String(parsed.apiKey) };
  } catch {
    return null;
  }
}

export function setByok(config) {
  const normalized = {
    baseUrl: String(config.baseUrl || '').trim().replace(/\/$/, ''),
    model: String(config.model || '').trim(),
    apiKey: String(config.apiKey || '').trim(),
  };
  if (!normalized.baseUrl || !normalized.model || !normalized.apiKey) return false;
  try { sessionStorage.setItem(KEY, JSON.stringify(normalized)); } catch { return false; }
  return true;
}

export function clearByok() {
  try { sessionStorage.removeItem(KEY); } catch { /* private mode */ }
}

export function byokPayload() {
  return getByok();
}

export function hasByok() {
  return Boolean(getByok());
}
