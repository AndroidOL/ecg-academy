const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261109ac';
const { api } = await import(`./api.js${__asset}`);
const { store } = await import(`./store.js${__asset}`);
const { openModal, icon, escapeHtml, setButtonLoading, toast } = await import(`./ui.js${__asset}`);
const { getPasskey } = await import(`./webauthn.js${__asset}`);

export function openAuth(mode = 'register') {
  if (store.user && !store.user.isGuest) {
    toast('当前已登录', 'info');
    return;
  }
  const isRegister = mode === 'register';
  const enabled = isRegister ? store.features?.registrationEnabled !== false : store.features?.userLoginEnabled !== false;
  if (!enabled) {
    const modal = openModal({
      title: '暂不开放账号功能',
      sub: '当前站点为开放学习模式',
      content: `<div class="auth-note">当前暂不开放${isRegister ? '注册' : '普通用户登录'}。你仍可使用全部学习、练习、实验室和急救内容；未登录学习进度保存在当前设备浏览器中，无需账号。</div><button class="btn btn-primary btn-block" type="button" data-close-notice>继续学习</button>`,
    });
    modal.el.querySelector('[data-close-notice]')?.addEventListener('click', modal.close);
    return;
  }
  const content = `
    <div class="form-grid">
      <div class="auth-note">${isRegister ? `当前为访客账号。注册需邮箱验证，注册后已读进度与答题记录会保留。${store.features?.emailConfigured === false ? ' 站点邮件服务尚未配置，请联系管理员。' : ''}` : '登录后会合并当前访客设备的已读进度。'}</div>
      ${isRegister ? `<div class="field"><label for="auth-email">邮箱</label><input class="input" id="auth-email" type="email" maxlength="190" autocomplete="email" placeholder="用于接收验证码"><div class="row-wrap" style="margin-top:6px"><button class="btn btn-secondary btn-sm" type="button" id="auth-send-code">发送验证码</button><span class="muted" style="font-size:10px">每个邮箱每日 3 封，每个网络每日 5 次</span></div></div>
      <div class="field"><label for="auth-code">邮箱验证码</label><input class="input" id="auth-code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 位数字"></div>
      <div class="field"><label for="auth-name">昵称（可选）</label><input class="input" id="auth-name" maxlength="20" autocomplete="nickname" placeholder="例如：心电图小白"></div>` : ''}
      <div class="field"><label for="auth-username">用户名</label><input class="input" id="auth-username" maxlength="24" autocomplete="username" placeholder="3–24 位字母、数字或下划线"></div>
      <div class="field"><label for="auth-password">密码</label><input class="input" id="auth-password" type="password" maxlength="72" autocomplete="${isRegister ? 'new-password' : 'current-password'}" placeholder="至少 8 位"></div>
      ${isRegister ? `<div class="field"><label for="auth-password2">确认密码</label><input class="input" id="auth-password2" type="password" maxlength="72" autocomplete="new-password" placeholder="再次输入密码"></div>` : ''}
      <div class="auth-note" id="auth-error" style="display:none;background:var(--danger-soft);color:var(--danger)"></div>
      <button class="btn btn-primary btn-block" type="button" id="auth-submit">${icon(isRegister ? 'lock' : 'arrowRight', 16)}${isRegister ? '保存进度并注册' : '登录'}</button>
      ${isRegister ? '' : `<button class="btn btn-secondary btn-block" type="button" id="auth-passkey">${icon('fingerprint', 16)} 使用 Passkey 登录</button>`}
      <div class="auth-switch">${isRegister ? '已有账号？' : '还没有账号？'}<button type="button" id="auth-toggle">${isRegister ? '去登录' : '注册并保存进度'}</button></div>
    </div>`;
  let modal;
  modal = openModal({
    title: isRegister ? '保存你的学习进度' : '登录心迹',
    sub: isRegister ? '免费开源 · 邮箱验证后保存进度' : '继续你的心电图学习',
    content,
    onClose: () => {},
  });
  const form = modal.el;
  const errorBox = form.querySelector('#auth-error');
  const submit = form.querySelector('#auth-submit');
  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
  };
  const doSubmit = async () => {
    const username = form.querySelector('#auth-username').value.trim().toLowerCase();
    const password = form.querySelector('#auth-password').value;
    const displayName = form.querySelector('#auth-name')?.value.trim() || '';
    const password2 = form.querySelector('#auth-password2')?.value;
    const email = form.querySelector('#auth-email')?.value.trim().toLowerCase() || '';
    const code = form.querySelector('#auth-code')?.value.trim() || '';
    errorBox.style.display = 'none';
    if (isRegister && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('请输入有效的邮箱地址');
    if (isRegister && !/^\d{6}$/.test(code)) return showError('请输入 6 位邮箱验证码');
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return showError('用户名需为 3–24 位字母、数字或下划线');
    if (password.length < 8) return showError('密码至少 8 位');
    if (isRegister && password !== password2) return showError('两次输入的密码不一致');
    setButtonLoading(submit, true, isRegister ? '正在保存' : '正在登录');
    try {
      if (isRegister) await api.register({ email, code, username, password, displayName });
      else await api.login({ username, password });
      await store.refresh();
      window.dispatchEvent(new CustomEvent('auth:changed'));
      toast(isRegister ? '账号已创建，进度已保存' : '登录成功', 'info');
      modal.close();
    } catch (error) {
      showError(error.message || '操作失败');
      setButtonLoading(submit, false);
    }
  };
  const sendCode = form.querySelector('#auth-send-code');
  if (sendCode) {
    let cooldown = 0;
    const tick = () => {
      if (cooldown <= 0) { sendCode.disabled = false; sendCode.textContent = '发送验证码'; return; }
      sendCode.disabled = true; sendCode.textContent = `${cooldown}s 后重发`; cooldown -= 1; setTimeout(tick, 1000);
    };
    sendCode.addEventListener('click', async () => {
      const email = form.querySelector('#auth-email').value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('请输入有效的邮箱地址');
      errorBox.style.display = 'none';
      setButtonLoading(sendCode, true, '发送中');
      try {
        const result = await api.registerCode(email);
        toast(result.message || '如果该邮箱可用，验证码已发送', 'info');
        cooldown = 60; tick();
      } catch (error) {
        showError(error.message || '验证码发送失败');
        setButtonLoading(sendCode, false);
      }
    });
  }
  submit?.addEventListener('click', doSubmit);
  form.querySelector('#auth-passkey')?.addEventListener('click', async () => {
    const username = form.querySelector('#auth-username').value.trim().toLowerCase();
    if (!username) return showError('请先输入用户名，再使用 Passkey 登录');
    errorBox.style.display = 'none';
    const button = form.querySelector('#auth-passkey');
    setButtonLoading(button, true, '等待验证');
    try {
      const options = await api.passkeyLoginOptions(username);
      const credential = await getPasskey(options);
      await api.passkeyLogin(credential);
      await store.refresh();
      window.dispatchEvent(new CustomEvent('auth:changed'));
      toast('登录成功', 'info');
      modal.close();
    } catch (error) {
      showError(error.message || 'Passkey 登录失败');
      setButtonLoading(button, false);
    }
  });
  form.querySelectorAll('input').forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') doSubmit();
    });
  });
  form.querySelector('#auth-toggle')?.addEventListener('click', () => {
    modal.close();
    openAuth(isRegister ? 'login' : 'register');
  });
}

export async function logout() {
  try {
    await api.logout();
    await store.refresh();
    window.dispatchEvent(new CustomEvent('auth:changed'));
    toast('已退出，当前为新的访客会话', 'info');
  } catch (error) {
    toast(error.message || '退出失败', 'error');
  }
}
