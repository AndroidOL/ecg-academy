const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108bf';
const { api } = await import(`./api.js${__asset}`);
const { snapshotStudy, mergeStudyData } = await import(`./study-store.js${__asset}`);

let pushTimer = null;

function signedIn() {
  if (typeof window === 'undefined') return false;
  const user = window.__ECG_STORE__?.user;
  return Boolean(user && !user.isGuest);
}

export async function pullStudy() {
  if (!signedIn()) return false;
  try {
    const remote = await api.meStudy();
    mergeStudyData(remote || {});
    await pushStudy();
    return true;
  } catch {
    return false;
  }
}

export async function pushStudy() {
  if (!signedIn()) return false;
  try {
    await api.meStudySave(snapshotStudy());
    return true;
  } catch {
    return false;
  }
}

export function scheduleStudyPush() {
  if (!signedIn()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; pushStudy(); }, 900);
}
