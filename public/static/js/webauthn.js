// 浏览器端 WebAuthn 转换与调用（管理后台与普通账号共用）
export function b64ToBuf(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export function bufToB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function serializeCredential(credential) {
  const response = credential.response || {};
  const out = { id: credential.id, rawId: bufToB64(credential.rawId), type: credential.type, response: {} };
  ['clientDataJSON', 'attestationObject', 'authenticatorData', 'signature', 'userHandle'].forEach((key) => {
    if (response[key] instanceof ArrayBuffer) out.response[key] = bufToB64(response[key]);
    else if (typeof response[key] === 'string') out.response[key] = response[key];
  });
  return out;
}

export async function createPasskey(options) {
  if (!window.PublicKeyCredential) throw new Error('当前浏览器不支持 Passkey');
  const publicKey = {
    ...options,
    challenge: b64ToBuf(options.challenge),
    user: { ...options.user, id: b64ToBuf(options.user.id) },
  };
  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) throw new Error('未创建 Passkey');
  return serializeCredential(credential);
}

export async function getPasskey(options) {
  if (!window.PublicKeyCredential) throw new Error('当前浏览器不支持 Passkey');
  const publicKey = {
    ...options,
    challenge: b64ToBuf(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((item) => ({ ...item, id: b64ToBuf(item.id) })),
  };
  const credential = await navigator.credentials.get({ publicKey });
  if (!credential) throw new Error('未获得 Passkey');
  return serializeCredential(credential);
}
