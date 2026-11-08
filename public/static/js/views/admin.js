const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108w';
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { icon, escapeHtml, toast, confirmDialog } = await import(`../ui.js${__asset}`);

const TABS = [
  ['overview', '概览'],
  ['users', '用户'],
  ['ai', 'AI 供应商'],
  ['security', '安全与登录'],
  ['audit', '审计日志'],
];

function b64ToBuf(value) {
  const raw = atob(String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value).length / 4) * 4, '='));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function bufToB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function serializeCredential(credential) {
  const response = credential.response || {};
  const out = { id: credential.id, rawId: bufToB64(credential.rawId), type: credential.type, response: {} };
  ['clientDataJSON', 'attestationObject', 'authenticatorData', 'signature', 'userHandle'].forEach((key) => {
    if (response[key] instanceof ArrayBuffer) out.response[key] = bufToB64(response[key]);
    else if (typeof response[key] === 'string') out.response[key] = response[key];
  });
  return out;
}

async function passkeyLogin() {
  if (!window.PublicKeyCredential) throw new Error('当前浏览器不支持 Passkey');
  const options = await api.adminPasskeyLoginOptions();
  const publicKey = {
    ...options,
    challenge: b64ToBuf(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((item) => ({ ...item, id: b64ToBuf(item.id) })),
  };
  const credential = await navigator.credentials.get({ publicKey });
  if (!credential) throw new Error('未获得 Passkey');
  return api.adminPasskeyLogin(serializeCredential(credential));
}

function loginMarkup(config) {
  return `<div class="admin-login-wrap">
    <div class="admin-login card card-pad">
      <div class="admin-lock">${icon('shield', 28)}</div>
      <div class="page-eyebrow">ADMIN CONSOLE</div>
      <h1 class="page-title" style="font-size:28px">管理后台</h1>
      <p class="muted" style="font-size:12px;line-height:1.7;margin:8px 0 16px">仅站点管理员可进入。所有修改写入数据库并记录审计日志。</p>
      ${config.passwordLogin ? `<form data-admin-login>
        <label class="field"><span>管理员用户名</span><input class="input" name="username" autocomplete="username" required maxlength="24"></label>
        <label class="field"><span>密码</span><input class="input" name="password" type="password" autocomplete="current-password" required maxlength="72"></label>
        <button class="btn btn-primary" type="submit" style="width:100%;margin-top:10px">密码登录</button>
      </form>` : '<div class="callout warn">管理员密码登录已关闭。</div>'}
      ${config.passkeyLogin && config.hasPasskey ? `<button class="btn btn-secondary" type="button" data-passkey-login style="width:100%;margin-top:8px">${icon('fingerprint', 15)} 使用 Passkey 登录</button>` : ''}
      ${!config.passwordLogin && (!config.passkeyLogin || !config.hasPasskey) ? '<div class="callout danger" style="margin-top:10px">登录方式配置不可用。请由服务器管理员用 CLI 重置管理员密码或注册 Passkey。</div>' : ''}
      <div class="admin-login-foot">${icon('lock', 12)} 密码仅用于管理员账号；普通用户登录在站点设置中独立控制。</div>
    </div>
  </div>`;
}

function badge(value, tone = '') {
  return `<span class="badge ${tone}">${escapeHtml(String(value))}</span>`;
}

function overview(session) {
  const s = session.stats;
  return `<div class="admin-kpi-grid">
    <div class="admin-kpi"><span>用户总数</span><b>${s.users}</b><small>其中游客 ${s.guests}</small></div>
    <div class="admin-kpi"><span>课程</span><b>${s.articles}</b><small>${s.chapters} 个章节</small></div>
    <div class="admin-kpi"><span>题库</span><b>${s.bank}</b><small>${s.scenarios} 个急救场景</small></div>
    <div class="admin-kpi"><span>今日 AI 调用</span><b>${s.aiUsedToday}</b><small>版本 ${escapeHtml(session.version)}</small></div>
  </div>
  <div class="card card-pad" style="margin-top:12px">
    <h2 class="section-title" style="font-size:17px">运行原则</h2>
    <div class="admin-notes">
      <div>${icon('shield', 15)} 后台只对 <code>users.is_admin=1</code> 且启用的账号开放；所有写操作复核 CSRF 并写入审计。</div>
      <div>${icon('key', 15)} API Key 使用 AES-256-GCM 加密后保存在数据库；前端只显示掩码。</div>
      <div>${icon('activity', 15)} 关闭密码登录前必须先注册 Passkey，避免把管理员锁在门外。</div>
      <div>${icon('users', 15)} 普通用户注册/登录、AI 每日额度与供应商均可独立配置。</div>
    </div>
  </div>`;
}

function settingsCard(session) {
  const a = session.settings.auth;
  const ad = session.settings.admin;
  const ai = session.settings.ai;
  const providers = session.settings.providers;
  const site = session.settings.site || {};
  return `<div class="card card-pad">
    <h2 class="section-title" style="font-size:17px">站点开关与 AI 默认值</h2>
    <form data-settings-form class="admin-settings-grid">
      <label class="admin-check"><input type="checkbox" name="auth.registration_enabled" ${a.registration_enabled ? 'checked' : ''}> 允许新用户注册</label>
      <label class="admin-check"><input type="checkbox" name="auth.user_login_enabled" ${a.user_login_enabled ? 'checked' : ''}> 允许普通用户登录</label>
      <label class="admin-check"><input type="checkbox" name="admin.password_login_enabled" ${ad.password_login_enabled ? 'checked' : ''}> 允许管理员密码登录</label>
      <label class="admin-check"><input type="checkbox" name="admin.passkey_login_enabled" ${ad.passkey_login_enabled ? 'checked' : ''}> 允许管理员 Passkey 登录</label>
      <label class="admin-check"><input type="checkbox" name="ai.enabled" ${ai.enabled ? 'checked' : ''}> 启用 AI 服务</label>
      <label class="admin-check"><input type="checkbox" name="ai.allow_guest" ${ai.allow_guest ? 'checked' : ''}> 允许未登录用户使用 AI</label>
      <label class="field"><span>普通用户每日 AI 额度</span><input class="input" type="number" min="0" max="10000" name="ai.daily_limit" value="${ai.daily_limit}"></label>
      <label class="field"><span>默认供应商</span><select class="select" name="ai.default_provider"><option value="">自动选择首个启用项</option>${providers.map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === ai.default_provider ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></label>
      <label class="field" style="grid-column:1/-1"><span>补充系统提示词（可选，最多 1000 字）</span><textarea class="input" name="ai.system_prompt_append" rows="3" maxlength="1000">${escapeHtml(ai.system_prompt_append)}</textarea></label>
      <label class="field"><span>GitHub 链接</span><input class="input" name="site.github_url" maxlength="180" value="${escapeHtml(site.github_url || '')}" placeholder="https://github.com/AndroidOL/ecg-academy"></label>
      <label class="field"><span>许可证说明</span><input class="input" name="site.license" maxlength="180" value="${escapeHtml(site.license || '')}" placeholder="MIT（代码）· CC BY-SA 4.0（内容）"></label>
      <label class="field"><span>版权信息</span><input class="input" name="site.copyright" maxlength="180" value="${escapeHtml(site.copyright || '')}" placeholder="© 2026 Tianhao Wu 等"></label>
      <label class="field"><span>ICP 备案号</span><input class="input" name="site.icp" maxlength="180" value="${escapeHtml(site.icp || '')}" placeholder="例如：京ICP备xxxxxxxx号"></label>
      <div style="grid-column:1/-1"><button class="btn btn-primary" type="submit">保存设置</button><span class="muted" style="font-size:10px;margin-left:8px">关闭两种管理员登录方式会被拒绝。</span></div>
    </form>
  </div>`;
}

function aiCard(session) {
  const providers = session.settings.providers;
  const site = session.settings.site || {};
  return `<div class="card card-pad">
    <div class="section-head"><h2 class="section-title" style="font-size:17px">AI 供应商</h2><span class="badge">${providers.length} 个</span></div>
    <p class="muted" style="font-size:11px;line-height:1.7">支持 OpenAI、DeepSeek、通义千问兼容端点、OpenRouter、自建网关等任何 OpenAI-compatible <code>/chat/completions</code> 服务。密钥加密存储，不返回前端。</p>
    <div class="admin-provider-list">${providers.map((p) => `<div class="admin-provider">
      <div><b>${escapeHtml(p.name)}</b> ${p.enabled ? badge('启用', 'badge-ok') : badge('停用')} <span class="muted">${escapeHtml(p.base_url)}</span>
        <div class="muted" style="font-size:10px">模型：${(p.models || []).map((m) => escapeHtml(m)).join('、')} · 默认：${escapeHtml(p.default_model || '')} · Key：${escapeHtml(p.api_key || '未设置')}</div>
      </div>
      <div class="row-wrap"><button class="btn btn-xs btn-secondary" type="button" data-provider-edit="${escapeHtml(p.id)}">编辑</button><button class="btn btn-xs btn-ghost" type="button" data-provider-test="${escapeHtml(p.id)}">测试</button><button class="btn btn-xs btn-ghost" type="button" data-provider-delete="${escapeHtml(p.id)}">删除</button></div>
    </div>`).join('') || '<div class="muted" style="font-size:12px">还没有供应商。</div>'}</div>
    <form data-provider-form class="admin-settings-grid" style="margin-top:12px">
      <input type="hidden" name="id">
      <label class="field" style="grid-column:1/-1"><span>快速预设（可选）</span><select class="select" data-provider-preset>
        <option value="">自定义</option>
        <option value="openai" data-base="https://api.openai.com/v1" data-models="gpt-4o-mini, gpt-4.1-mini">OpenAI</option>
        <option value="deepseek" data-base="https://api.deepseek.com/v1" data-models="deepseek-chat, deepseek-reasoner">DeepSeek</option>
        <option value="openrouter" data-base="https://openrouter.ai/api/v1" data-models="openai/gpt-4o-mini, anthropic/claude-3.5-sonnet">OpenRouter</option>
        <option value="dashscope" data-base="https://dashscope.aliyuncs.com/compatible-mode/v1" data-models="qwen-plus, qwen-turbo">通义千问（兼容模式）</option>
        <option value="siliconflow" data-base="https://api.siliconflow.cn/v1" data-models="Qwen/Qwen2.5-7B-Instruct, deepseek-ai/DeepSeek-V3">硅基流动</option>
      </select></label>
      <label class="field"><span>名称</span><input class="input" name="name" required maxlength="80" placeholder="例如 DeepSeek"></label>
      <label class="field"><span>Base URL</span><input class="input" name="base_url" required placeholder="https://api.deepseek.com/v1"></label>
      <label class="field"><span>API Key（编辑时留空表示不修改）</span><input class="input" name="api_key" type="password" autocomplete="new-password" maxlength="300"></label>
      <label class="field"><span>模型（逗号分隔）</span><input class="input" name="models" required placeholder="deepseek-chat, deepseek-reasoner"></label>
      <label class="field"><span>默认模型</span><input class="input" name="default_model" placeholder="deepseek-chat"></label>
      <label class="admin-check"><input type="checkbox" name="enabled" checked> 启用该供应商</label>
      <div style="grid-column:1/-1"><button class="btn btn-primary" type="submit">保存供应商</button><button class="btn btn-ghost" type="reset">清空</button></div>
    </form>
  </div>`;
}

function securityCard(session) {
  return `<div class="card card-pad">
    <h2 class="section-title" style="font-size:17px">管理员 Passkey</h2>
    <p class="muted" style="font-size:11px;line-height:1.7">Passkey 使用 WebAuthn（ES256），需要 HTTPS 或 localhost。注册后可在关闭密码登录时使用。</p>
    <div class="admin-provider-list">${(session.passkeys || []).map((p) => `<div class="admin-provider"><div><b>${escapeHtml(p.label)}</b><div class="muted" style="font-size:10px">注册：${escapeHtml(p.created_at)} · 最近使用：${escapeHtml(p.last_used_at || '—')} · 计数器：${p.sign_count}</div></div><button class="btn btn-xs btn-ghost" type="button" data-passkey-delete="${p.id}">删除</button></div>`).join('') || '<div class="muted" style="font-size:12px">尚未注册 Passkey。</div>'}</div>
    <button class="btn btn-secondary" type="button" data-passkey-register style="margin-top:12px">${icon('fingerprint', 15)} 注册当前设备 Passkey</button>
  </div>`;
}

function usersCard() {
  return `<div class="card card-pad">
    <div class="section-head"><h2 class="section-title" style="font-size:17px">用户管理</h2><form class="row" data-user-search><input class="input" name="q" placeholder="搜索用户名 / 显示名 / public ID" style="min-height:34px;width:240px"><button class="btn btn-secondary btn-sm" type="submit">搜索</button></form></div>
    <div data-users-list><div class="muted">加载中…</div></div>
  </div>`;
}

function auditCard(session) {
  return `<div class="card card-pad"><div class="section-head"><h2 class="section-title" style="font-size:17px">审计日志</h2><button class="btn btn-ghost btn-sm" type="button" data-audit-refresh>刷新</button></div>
    <div class="admin-audit">${(session.audit || []).map((row) => `<div class="admin-audit-row"><span>${escapeHtml(row.created_at)}</span><b>${escapeHtml(row.action)}</b><span class="muted">${escapeHtml(row.ip || '')}</span><code>${escapeHtml(JSON.stringify(row.detail || {}).slice(0, 180))}</code></div>`).join('') || '<div class="muted">暂无审计记录。</div>'}</div>
    <p class="muted" style="font-size:10px;margin-top:10px">最多显示最近 100 条；敏感密钥不会写入审计详情。</p></div>`;
}

function dashboardShell(session) {
  return `<div class="admin-head"><div><div class="page-eyebrow">${icon('shield', 14)} ADMIN CONSOLE</div><h1 class="page-title">管理后台</h1><p class="page-sub">${escapeHtml(session.admin.displayName)} · @${escapeHtml(session.admin.username)}</p></div><div class="row-wrap"><a class="btn btn-ghost btn-sm" href="#/">返回站点</a><button class="btn btn-secondary btn-sm" type="button" data-admin-logout>退出后台</button></div></div>
    <div class="admin-tabs">${TABS.map(([id, label], i) => `<button class="chip ${i === 0 ? 'active' : ''}" type="button" data-admin-tab="${id}">${label}</button>`).join('')}</div>
    <div data-admin-content></div>`;
}

export async function adminView() {
  const el = document.createElement('div');
  el.className = 'page admin-page';
  let session = null;
  if (store.user?.isAdmin) {
    try {
      session = await api.adminSession();
    } catch (error) {
      if (![401, 403].includes(error.status)) throw error;
    }
  }
  if (!session) {
    const config = await api.adminAuthConfig();
    el.innerHTML = loginMarkup(config);
    el.querySelector('[data-admin-login]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await api.adminLogin({ username: form.querySelector('[name="username"]').value.trim(), password: form.querySelector('[name="password"]').value });
        window.location.reload();
      } catch (err) {
        toast(err.message || '登录失败', 'error');
        button.disabled = false;
      }
    });
    el.querySelector('[data-passkey-login]')?.addEventListener('click', async () => {
      try {
        await passkeyLogin();
        window.location.reload();
      } catch (err) {
        toast(err.message || 'Passkey 登录失败', 'error');
      }
    });
    return { el };
  }

  let activeTab = 'overview';
  const render = async (startTab = activeTab) => {
    el.innerHTML = dashboardShell(session);
    const content = el.querySelector('[data-admin-content]');
    const active = startTab;
    let registerPasskey = async () => {};
    let saveProvider = async () => {};
    content.addEventListener('click', async (event) => {
      const register = event.target.closest('[data-passkey-register]');
      if (register) { await registerPasskey(); return; }
      const delPasskey = event.target.closest('[data-passkey-delete]');
      if (delPasskey) {
        const ok = await confirmDialog({ title: '删除 Passkey？', message: '删除后该设备不能再用于后台登录。', confirmText: '删除', danger: true });
        if (!ok) return;
        try { await api.adminPasskeyDelete(Number(delPasskey.dataset.passkeyDelete)); toast('已删除'); await reloadSession(); } catch (err) { toast(err.message, 'error'); }
        return;
      }
      const edit = event.target.closest('[data-provider-edit]');
      if (edit) {
        const form = content.querySelector('[data-provider-form]');
        const p = (session.settings.providers || []).find((x) => x.id === edit.dataset.providerEdit);
        if (!p || !form) return;
        form.querySelector('[name="id"]').value = p.id;
        form.querySelector('[name="name"]').value = p.name;
        form.querySelector('[name="base_url"]').value = p.base_url;
        form.querySelector('[name="models"]').value = (p.models || []).join(', ');
        form.querySelector('[name="default_model"]').value = p.default_model || '';
        form.querySelector('[name="enabled"]').checked = Boolean(p.enabled);
        form.querySelector('[name="api_key"]').value = '';
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const test = event.target.closest('[data-provider-test]');
      if (test) {
        test.disabled = true;
        try { const result = await api.adminAiTest(test.dataset.providerTest); toast(result.ok ? '连接成功：' + result.message : '连接失败：' + result.message, result.ok ? 'success' : 'error'); } catch (err) { toast(err.message, 'error'); } finally { test.disabled = false; }
        return;
      }
      const delProvider = event.target.closest('[data-provider-delete]');
      if (delProvider) {
        const ok = await confirmDialog({ title: '删除供应商？', message: '删除后使用该供应商的 AI 请求会失败。', confirmText: '删除', danger: true });
        if (!ok) return;
        try { await api.adminProviderDelete(delProvider.dataset.providerDelete); toast('已删除'); await reloadSession(); } catch (err) { toast(err.message, 'error'); }
        return;
      }
      if (event.target.closest('[data-audit-refresh]')) await reloadSession();
    });
    content.addEventListener('change', (event) => {
      const preset = event.target.closest('[data-provider-preset]');
      if (!preset) return;
      const form = preset.closest('[data-provider-form]');
      if (!form) return;
      const option = preset.selectedOptions[0];
      if (!option?.dataset.base) return;
      form.querySelector('[name="base_url"]').value = option.dataset.base;
      form.querySelector('[name="models"]').value = option.dataset.models || '';
      form.querySelector('[name="default_model"]').value = (option.dataset.models || '').split(',')[0].trim();
      if (!form.querySelector('[name="name"]').value) form.querySelector('[name="name"]').value = option.textContent;
    });
    content.addEventListener('submit', async (event) => {
      const userSearch = event.target.closest('[data-user-search]');
      if (userSearch) {
        event.preventDefault();
        await loadUsers(userSearch.q.value.trim());
        return;
      }
      const providerForm = event.target.closest('[data-provider-form]');
      if (providerForm) {
        event.preventDefault();
        await saveProvider(providerForm);
      }
    });
    const drawTab = async (tab) => {
      el.querySelectorAll('[data-admin-tab]').forEach((b) => b.classList.toggle('active', b.dataset.adminTab === tab));
      content.innerHTML = tab === 'overview' ? overview(session) + settingsCard(session)
        : tab === 'users' ? usersCard()
          : tab === 'ai' ? aiCard(session)
            : tab === 'security' ? securityCard(session)
              : auditCard(session);
      if (tab === 'users') await loadUsers();
      if (tab === 'overview') bindSettings();
    };
    el.querySelectorAll('[data-admin-tab]').forEach((button) => button.addEventListener('click', () => { activeTab = button.dataset.adminTab; drawTab(activeTab); }));
    el.querySelector('[data-admin-logout]')?.addEventListener('click', async () => {
      await api.adminLogout();
      toast('已退出后台');
      window.location.reload();
    });
    const reloadSession = async () => {
      session = await api.adminSession();
      await render(activeTab);
    };
    const bindSettings = () => {
      content.querySelector('[data-settings-form]')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = {};
        form.querySelectorAll('input[type="checkbox"]').forEach((input) => { payload[input.name] = input.checked; });
        payload['ai.daily_limit'] = Number(form.querySelector('[name="ai.daily_limit"]').value) || 0;
        payload['ai.default_provider'] = form.querySelector('[name="ai.default_provider"]').value;
        payload['ai.system_prompt_append'] = form.querySelector('[name="ai.system_prompt_append"]').value;
        ['site.github_url','site.license','site.copyright','site.icp'].forEach((key) => {
          payload[key] = form.querySelector(`[name="${key}"]`)?.value || '';
        });
        try {
          await api.adminSaveSettings(payload);
          toast('设置已保存');
          await reloadSession();
        } catch (err) { toast(err.message || '保存失败', 'error'); }
      });
    };
    const loadUsers = async (query = '') => {
      const host = content.querySelector('[data-users-list]');
      if (!host) return;
      try {
        const data = await api.adminUsers({ q: query });
        host.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>用户</th><th>角色</th><th>状态</th><th>AI 额度</th><th>XP</th><th>最近活动</th><th></th></tr></thead><tbody>${(data.items || []).map((u) => `<tr>
          <td><b>${escapeHtml(u.display_name)}</b><div class="muted" style="font-size:10px">${u.username ? '@' + escapeHtml(u.username) : 'guest'} · ${escapeHtml(u.public_id)}</div></td>
          <td>${u.is_admin ? badge('管理员', 'badge-brand') : '用户'}</td>
          <td>${u.is_active ? badge('启用', 'badge-ok') : badge('停用', 'badge-danger')}</td>
          <td>${u.ai_daily_limit === null ? '默认' : u.ai_daily_limit}</td>
          <td>${u.xp}</td>
          <td class="muted" style="font-size:10px">${escapeHtml(u.last_seen_at || '')}</td>
          <td><div class="row-wrap" style="justify-content:flex-end;gap:3px"><button class="btn btn-xs btn-ghost" data-user-active="${u.id}" data-value="${u.is_active ? 0 : 1}">${u.is_active ? '停用' : '启用'}</button><button class="btn btn-xs btn-ghost" data-user-admin="${u.id}" data-value="${u.is_admin ? 0 : 1}">${u.is_admin ? '移除管理员' : '设为管理员'}</button><button class="btn btn-xs btn-ghost" data-user-limit="${u.id}">AI 额度</button><button class="btn btn-xs btn-ghost" data-user-password="${u.id}">重置密码</button></div></td>
        </tr>`).join('')}</tbody></table></div><div class="pager-info" style="margin-top:8px">共 ${data.total} 个用户，显示第 ${data.page} 页</div>`;
        host.querySelectorAll('[data-user-active]').forEach((b) => b.addEventListener('click', async () => {
          try { await api.adminUpdateUser({ userId: Number(b.dataset.userActive), is_active: b.dataset.value === '1' }); toast('状态已更新'); await loadUsers(query); } catch (e) { toast(e.message, 'error'); }
        }));
        host.querySelectorAll('[data-user-admin]').forEach((b) => b.addEventListener('click', async () => {
          try { await api.adminUpdateUser({ userId: Number(b.dataset.userAdmin), is_admin: b.dataset.value === '1' }); toast('角色已更新'); await loadUsers(query); } catch (e) { toast(e.message, 'error'); }
        }));
        host.querySelectorAll('[data-user-limit]').forEach((b) => b.addEventListener('click', async () => {
          const raw = window.prompt('每日 AI 额度（留空使用全局默认）：');
          if (raw === null) return;
          try { await api.adminUpdateUser({ userId: Number(b.dataset.userLimit), ai_daily_limit: raw === '' ? null : Number(raw) }); toast('额度已更新'); await loadUsers(query); } catch (e) { toast(e.message, 'error'); }
        }));
        host.querySelectorAll('[data-user-password]').forEach((b) => b.addEventListener('click', async () => {
          const password = window.prompt('输入新密码（8–72 位；不会显示在页面）：');
          if (!password) return;
          try { await api.adminUpdateUser({ userId: Number(b.dataset.userPassword), new_password: password }); toast('密码已重置'); } catch (e) { toast(e.message, 'error'); }
        }));
      } catch (err) { host.innerHTML = `<div class="callout danger">${escapeHtml(err.message)}</div>`; }
    };
    content.querySelector('[data-user-search]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      loadUsers(event.currentTarget.q.value.trim());
    });
    bindSettings();
    // AI provider forms
    const bindProviderForm = () => {
      const form = content.querySelector('[data-provider-form]');
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const f = event.currentTarget;
        const val = (name) => (f.querySelector(`[name="${name}"]`)?.value || '').trim();
        const provider = { id: val('id'), name: val('name'), base_url: val('base_url'), api_key: f.querySelector('[name="api_key"]')?.value || '', models: val('models'), default_model: val('default_model'), enabled: Boolean(f.querySelector('[name="enabled"]')?.checked) };
        try { await api.adminProviderSave(provider); toast('供应商已保存'); await reloadSession(); } catch (err) { toast(err.message || '保存失败', 'error'); }
      });
      form?.addEventListener('reset', () => { const idField = form.querySelector('[name="id"]'); if (idField) idField.value = ''; });
      content.querySelectorAll('[data-provider-edit]').forEach((b) => b.addEventListener('click', () => {
        const p = (session.settings.providers || []).find((x) => x.id === b.dataset.providerEdit);
        if (!p || !form) return;
        form.querySelector('[name="id"]').value = p.id;
        form.querySelector('[name="name"]').value = p.name;
        form.querySelector('[name="base_url"]').value = p.base_url;
        form.querySelector('[name="models"]').value = (p.models || []).join(', ');
        form.querySelector('[name="default_model"]').value = p.default_model || '';
        form.querySelector('[name="enabled"]').checked = Boolean(p.enabled);
        form.querySelector('[name="api_key"]').value = '';
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }));
      content.querySelectorAll('[data-provider-test]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        try { const result = await api.adminAiTest(b.dataset.providerTest); toast(result.ok ? '连接成功：' + result.message : '连接失败：' + result.message, result.ok ? 'success' : 'error'); } catch (err) { toast(err.message, 'error'); } finally { b.disabled = false; }
      }));
      content.querySelectorAll('[data-provider-delete]').forEach((b) => b.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: '删除供应商？', message: '删除后使用该供应商的 AI 请求会失败。', confirmText: '删除', danger: true });
        if (!ok) return;
        try { await api.adminProviderDelete(b.dataset.providerDelete); toast('已删除'); await reloadSession(); } catch (err) { toast(err.message, 'error'); }
      }));
    };
    if (el.querySelector('[data-provider-form]')) bindProviderForm();
    // Security passkey
    registerPasskey = async () => {
      try {
        if (!window.PublicKeyCredential) throw new Error('当前浏览器不支持 Passkey');
        const options = await api.adminPasskeyOptions();
        const publicKey = {
          ...options,
          challenge: b64ToBuf(options.challenge),
          user: { ...options.user, id: b64ToBuf(options.user.id) },
        };
        const credential = await navigator.credentials.create({ publicKey });
        if (!credential) throw new Error('未创建 Passkey');
        const label = window.prompt('给这个 Passkey 起个名字：', '当前设备') || '当前设备';
        await api.adminPasskeyRegister({ credential: serializeCredential(credential), label });
        toast('Passkey 已注册');
        await reloadSession();
      } catch (err) { toast(err.message || '注册失败', 'error'); }
    };
    saveProvider = async (form) => {
      const val = (name) => (form.querySelector(`[name="${name}"]`)?.value || '').trim();
      const provider = { id: val('id'), name: val('name'), base_url: val('base_url'), api_key: form.querySelector('[name="api_key"]')?.value || '', models: val('models'), default_model: val('default_model'), enabled: Boolean(form.querySelector('[name="enabled"]')?.checked) };
      try { await api.adminProviderSave(provider); toast('供应商已保存'); await reloadSession(); } catch (err) { toast(err.message || '保存失败', 'error'); }
    };
    await drawTab(active);
  };
  await render(activeTab);
  return { el };
}
