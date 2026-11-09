// BYOK 密钥只保存在浏览器（sessionStorage 或用户主动选择 localStorage）；
// 调用时经本站中转，但不写入数据库、成本日志或错误日志。
const SESSION_KEY = 'ecg-byok-v1';
const LOCAL_KEY = 'ecg-byok-persist-v1';

function normalize(config = {}) {
  return {
    baseUrl: String(config.baseUrl || '').trim().replace(/\/$/, ''),
    model: String(config.model || '').trim(),
    apiKey: String(config.apiKey || '').trim(),
  };
}

function read(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    const normalized = normalize(parsed);
    if (!normalized.baseUrl || !normalized.model || !normalized.apiKey) return null;
    return normalized;
  } catch {
    return null;
  }
}

export function getByok() {
  return read(sessionStorage, SESSION_KEY) || read(localStorage, LOCAL_KEY);
}

export function isRemembered() {
  return Boolean(read(localStorage, LOCAL_KEY));
}

export function setByok(config, { remember = false } = {}) {
  const normalized = normalize(config);
  if (!normalized.baseUrl || !normalized.model || !normalized.apiKey) return false;
  let url;
  try { url = new URL(normalized.baseUrl); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) && /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (normalized.apiKey.length < 8 || normalized.apiKey.length > 300) return false;
  try {
    if (remember) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(normalized));
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
      localStorage.removeItem(LOCAL_KEY);
    }
  } catch {
    return false;
  }
  return true;
}

export function clearByok() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
  try { localStorage.removeItem(LOCAL_KEY); } catch { /* private mode */ }
}

export function byokPayload() {
  return getByok();
}

export function hasByok() {
  return Boolean(getByok());
}

export function maskedKey(config = getByok()) {
  if (!config?.apiKey) return '';
  const key = config.apiKey;
  return key.length <= 8 ? '••••••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function byokSummary() {
  const config = getByok();
  if (!config) return null;
  return { ...config, apiKey: maskedKey(config), remembered: isRemembered() };
}
