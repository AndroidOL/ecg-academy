const KEY = 'ecg-low-bandwidth';

export function isLowBandwidth() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch { /* private mode */ }
  return Boolean(navigator.connection?.saveData);
}

export function applyLowBandwidth(enabled = isLowBandwidth()) {
  if (typeof document === 'undefined') return enabled;
  document.documentElement.dataset.lowBandwidth = enabled ? '1' : '0';
  return enabled;
}

export function setLowBandwidth(enabled) {
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* private mode */ }
  applyLowBandwidth(enabled);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ecg-bandwidth-change', { detail: { enabled } }));
  return enabled;
}

export function installPrompt() {
  return typeof window !== 'undefined' ? window.__ecgInstallPrompt : null;
}

export function clearInstallPrompt() {
  if (typeof window !== 'undefined') window.__ecgInstallPrompt = null;
}
