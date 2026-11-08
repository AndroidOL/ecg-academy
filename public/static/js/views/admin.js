const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108ay';
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { icon, escapeHtml, toast, confirmDialog, openModal } = await import(`../ui.js${__asset}`);

const TABS = [
  ['overview', '概览'],
  ['traffic', '流量统计'],
  ['cost', 'AI 成本'],
  ['packs', '课程包'],
  ['users', '用户'],
  ['assignments', '班级作业'],
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
      <label class="admin-check"><input type="checkbox" name="ai.byok_enabled" ${ai.byok_enabled ? 'checked' : ''}> 允许 BYOK 演示（用户自带密钥，仅存当前浏览器）</label>
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
      <div style="grid-column:1/-1">
        <div class="spread"><span class="label">模型价格（每百万 tokens；可单独设置折扣时段）</span><button class="btn btn-xs btn-secondary" type="button" data-provider-pricing-build>按模型生成 / 刷新</button></div>
        <div class="admin-table-wrap" style="margin-top:6px;max-height:260px;overflow:auto"><table class="admin-table"><thead><tr><th>模型</th><th>输入</th><th>输出</th><th>折扣开始</th><th>结束</th><th>比例</th></tr></thead><tbody data-provider-pricing></tbody></table></div>
        <p class="muted" style="font-size:10px;margin-top:4px">价格留空按 0 计算；比例 1 = 原价，0.5 = 五折；折扣时段按服务器本地时间生效。</p>
      </div>
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
    <form data-admin-create-user class="admin-form-grid" style="margin:10px 0 14px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--bg-elev)">
      <label class="field"><span>用户名</span><input class="input" name="username" maxlength="24" placeholder="3–24 位小写字母/数字/_" required></label>
      <label class="field"><span>显示名</span><input class="input" name="displayName" maxlength="32" placeholder="例如：李医生"></label>
      <label class="field"><span>初始密码</span><input class="input" name="password" type="password" minlength="8" maxlength="72" placeholder="8–72 位" required></label>
      <label class="field"><span>AI 每日额度（留空默认）</span><input class="input" name="aiDailyLimit" type="number" min="0" max="10000"></label>
      <label class="admin-check" style="grid-column:1/-1"><input type="checkbox" name="isAdmin"> 设为管理员</label>
      <div class="row-wrap" style="grid-column:1/-1"><button class="btn btn-primary btn-sm" type="submit">${icon('plus', 13)} 手动创建用户</button><span class="muted" style="font-size:10px">创建后会写入审计；普通用户登录仍需在“安全与登录”中开启。</span></div>
    </form>
    <div data-users-list><div class="muted">加载中…</div></div>
  </div>`;
}

function assignmentsCard() {
  const chapters = store.chapters || [];
  return `<div class="card card-pad">
    <div class="section-head"><div><h2 class="section-title" style="font-size:17px">班级作业链接</h2><p class="muted" style="font-size:11px;line-height:1.6">学生无需登录；服务端只记录随机设备哈希、得分与用时，不记录姓名或 IP。关闭作业后链接立即失效。</p></div><span class="badge badge-brand">匿名</span></div>
    <form data-assignment-form class="admin-form-grid" style="margin-top:8px">
      <label class="field"><span>作业标题</span><input class="input" name="title" maxlength="120" required placeholder="例如：2026 临床 1 班 · 心律失常判读"></label>
      <label class="field"><span>班级/小组（可选）</span><input class="input" name="className" maxlength="80" placeholder="例如：临床 1 班"></label>
      <label class="field"><span>难度</span><select class="select" name="level"><option value="1">基础</option><option value="2">进阶</option><option value="3">组合挑战</option></select></label>
      <label class="field"><span>章节</span><select class="select" name="chapter"><option value="all">全部章节</option>${chapters.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}</select></label>
      <label class="field" style="grid-column:1/-1"><span>专项诊断 ID（逗号分隔，可选）</span><input class="input" name="focus" placeholder="例如：afib,vt,av-block-3"></label>
      <div class="row-wrap" style="grid-column:1/-1"><button class="btn btn-primary btn-sm" type="submit">生成作业链接</button><span class="muted" style="font-size:10px">分享链接格式：#/practice?assignment=CODE</span></div>
    </form>
    <div data-assignments-list style="margin-top:14px"><div class="muted">加载中…</div></div>
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
    let fillPricing = () => {};
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
        fillPricing(p.model_pricing || {});
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
      if (event.target.closest('[data-provider-pricing-build]')) {
        fillPricing({});
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
      fillPricing({});
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
        : tab === 'traffic' ? trafficCard()
          : tab === 'cost' ? costCard()
            : tab === 'packs' ? packsCard()
            : tab === 'users' ? usersCard()
              : tab === 'assignments' ? assignmentsCard()
                : tab === 'ai' ? aiCard(session)
                  : tab === 'security' ? securityCard(session)
                    : auditCard(session);
      if (tab === 'users') await loadUsers();
      if (tab === 'traffic') await loadTraffic();
      if (tab === 'cost') await loadCost();
      if (tab === 'packs') await loadPacks();
      if (tab === 'overview') bindSettings();
      if (tab === 'assignments') {
        content.querySelector('[data-assignment-form]')?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const value = (name) => (form.querySelector(`[name="${name}"]`)?.value || '').trim();
          try {
            const result = await api.adminAssignmentSave({ title: value('title'), className: value('className'), level: Number(value('level')), chapter: value('chapter'), focus: value('focus') });
            toast('作业已创建');
            form.reset();
            await loadAssignments();
            const code = result.assignment?.code;
            if (code) await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/practice?assignment=${encodeURIComponent(code)}`).catch(() => {});
          } catch (err) { toast(err.message || '创建失败', 'error'); }
        });
        await loadAssignments();
      }
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
        payload['ai.byok_enabled'] = form.querySelector('[name="ai.byok_enabled"]').checked;
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
          <td>${u.xp}<div class="muted" style="font-size:9px">Lv.${u.level || 1}${u.level_override ? ' · 手动' : ''}</div></td>
          <td class="muted" style="font-size:10px">${escapeHtml(u.last_seen_at || '')}</td>
          <td><div class="row-wrap" style="justify-content:flex-end;gap:3px"><button class="btn btn-xs btn-ghost" data-user-active="${u.id}" data-value="${u.is_active ? 0 : 1}">${u.is_active ? '停用' : '启用'}</button><button class="btn btn-xs btn-ghost" data-user-admin="${u.id}" data-value="${u.is_admin ? 0 : 1}">${u.is_admin ? '移除管理员' : '设为管理员'}</button><button class="btn btn-xs btn-ghost" data-user-level="${u.id}">设置等级</button><button class="btn btn-xs btn-ghost" data-user-limit="${u.id}">AI 额度</button><button class="btn btn-xs btn-ghost" data-user-password="${u.id}">重置密码</button></div></td>
        </tr>`).join('')}</tbody></table></div><div class="pager-info" style="margin-top:8px">共 ${data.total} 个用户，显示第 ${data.page} 页</div>`;
        host.querySelectorAll('[data-user-active]').forEach((b) => b.addEventListener('click', async () => {
          try { await api.adminUpdateUser({ userId: Number(b.dataset.userActive), is_active: b.dataset.value === '1' }); toast('状态已更新'); await loadUsers(query); } catch (e) { toast(e.message, 'error'); }
        }));
        host.querySelectorAll('[data-user-admin]').forEach((b) => b.addEventListener('click', async () => {
          try { await api.adminUpdateUser({ userId: Number(b.dataset.userAdmin), is_admin: b.dataset.value === '1' }); toast('角色已更新'); await loadUsers(query); } catch (e) { toast(e.message, 'error'); }
        }));
        host.querySelectorAll('[data-user-level]').forEach((b) => b.addEventListener('click', async () => {
          const raw = window.prompt('设置用户等级（1–20；留空恢复按 XP 自动计算）：');
          if (raw === null) return;
          try {
            await api.adminUpdateUser({ userId: Number(b.dataset.userLevel), level_override: raw === '' ? null : Number(raw) });
            toast('等级已更新');
            await loadUsers(query);
          } catch (e) { toast(e.message, 'error'); }
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
    const loadAssignments = async () => {
      const host = content.querySelector('[data-assignments-list]');
      if (!host) return;
      try {
        const data = await api.adminAssignments();
        host.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>作业</th><th>范围</th><th>作答</th><th>平均分</th><th>正确率</th><th>状态</th><th></th></tr></thead><tbody>${(data.items || []).map((a) => `<tr>
          <td><b>${escapeHtml(a.title)}</b><div class="muted" style="font-size:10px">${escapeHtml(a.class_name || '未分组')} · <code>${escapeHtml(a.code)}</code></div></td>
          <td>${a.level >= 3 ? '组合' : a.level === 2 ? '进阶' : '基础'} · ${escapeHtml(a.chapter)}</td>
          <td>${a.devices} 人 / ${a.attempts} 次</td>
          <td>${a.avg_score}</td>
          <td>${a.accuracy}%</td>
          <td>${a.active ? '启用' : '已关闭'}</td>
          <td><div class="row-wrap" style="justify-content:flex-end;gap:3px"><button class="btn btn-xs btn-secondary" data-assignment-copy="${escapeHtml(a.code)}">复制链接</button><button class="btn btn-xs btn-ghost" data-assignment-toggle="${a.id}" data-value="${a.active ? 0 : 1}">${a.active ? '关闭' : '启用'}</button><button class="btn btn-xs btn-ghost" data-assignment-delete="${a.id}">删除</button></div></td>
        </tr>`).join('')}</tbody></table></div><div class="pager-info" style="margin-top:8px">共 ${(data.items || []).length} 个作业</div>`;
        host.querySelectorAll('[data-assignment-copy]').forEach((b) => b.addEventListener('click', async () => {
          const url = `${location.origin}${location.pathname}#/practice?assignment=${encodeURIComponent(b.dataset.assignmentCopy)}`;
          try { await navigator.clipboard.writeText(url); toast('作业链接已复制', 'success'); } catch { toast(url, 'info'); }
        }));
        host.querySelectorAll('[data-assignment-toggle]').forEach((b) => b.addEventListener('click', async () => {
          try { await api.adminAssignmentToggle(Number(b.dataset.assignmentToggle), b.dataset.value === '1'); toast('状态已更新'); await loadAssignments(); } catch (e) { toast(e.message, 'error'); }
        }));
        host.querySelectorAll('[data-assignment-delete]').forEach((b) => b.addEventListener('click', async () => {
          const ok = await confirmDialog({ title: '删除作业？', message: '删除后链接失效，已提交的匿名成绩也会一并删除。', confirmText: '删除', danger: true });
          if (!ok) return;
          try { await api.adminAssignmentDelete(Number(b.dataset.assignmentDelete)); toast('已删除'); await loadAssignments(); } catch (e) { toast(e.message, 'error'); }
        }));
      } catch (err) { host.innerHTML = `<div class="callout danger">${escapeHtml(err.message)}</div>`; }
    };
    const loadTraffic = async () => {
      const host = content.querySelector('[data-traffic-kpis]');
      if (!host) return;
      try {
        const data = await api.adminTraffic(14);
        const kpis = content.querySelectorAll('[data-traffic-kpis] .stat-value');
        [data.todayPv, data.todayUv, data.totals.pv, data.totals.uv].forEach((value, index) => {
          if (kpis[index]) kpis[index].textContent = String(value);
        });
        const range = content.querySelector('[data-traffic-range]');
        if (range) range.textContent = `${data.start} ~ ${data.today} · 共 ${data.counts.events} 条记录 · 保留 ${data.retentionDays} 天`;
        const guestCount = content.querySelector('[data-guest-count]');
        if (guestCount) guestCount.textContent = String(data.counts.guests);
        const bars = content.querySelector('[data-traffic-bars]');
        const maxPv = Math.max(1, ...data.series.map((item) => item.pv));
        if (bars) bars.innerHTML = data.series.map((item) => `<div class="traffic-bar" title="${escapeHtml(item.day)} · PV ${item.pv} · UV ${item.uv}"><b>${item.pv || ''}</b><i style="height:${Math.max(2, Math.round((item.pv / maxPv) * 100))}%"></i><span>${escapeHtml(item.day.slice(5))}</span></div>`).join('');
        const paths = content.querySelector('[data-traffic-paths]');
        if (paths) paths.innerHTML = data.topPaths.length
          ? data.topPaths.map((item) => `<div class="traffic-row"><b>${escapeHtml(item.path)}</b><span>${item.pv} PV · ${item.uv} UV</span><i style="width:${Math.round((item.pv / Math.max(1, data.topPaths[0].pv)) * 100)}%"></i></div>`).join('')
          : '<div class="muted" style="font-size:12px">暂无数据</div>';
        const refs = content.querySelector('[data-traffic-referers]');
        if (refs) refs.innerHTML = data.referers.length
          ? data.referers.map((item) => `<div class="traffic-row"><b>${escapeHtml(item.referer)}</b><span>${item.pv} 次</span><i style="width:${Math.round((item.pv / Math.max(1, data.referers[0].pv)) * 100)}%"></i></div>`).join('')
          : '<div class="muted" style="font-size:12px">暂无外链来源</div>';
        const ips = content.querySelector('[data-traffic-ips]');
        if (ips) ips.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>IP</th><th>PV</th><th>活跃天数</th><th>最近访问</th><th>客户端</th></tr></thead><tbody>${data.topIps.map((item) => `<tr><td><b>${escapeHtml(item.ip)}</b></td><td>${item.pv}</td><td>${item.activeDays}</td><td class="muted" style="font-size:10px">${escapeHtml(item.lastSeen)}</td><td class="muted" style="font-size:10px">${escapeHtml(String(item.ua || '').slice(0, 70))}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">暂无数据</td></tr>'}</tbody></table></div>`;
        const recent = content.querySelector('[data-traffic-recent]');
        if (recent) recent.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>时间</th><th>页面</th><th>IP</th><th>来源</th><th>类型</th></tr></thead><tbody>${data.recent.map((item) => `<tr><td class="muted" style="font-size:10px">${escapeHtml(item.createdAt)}</td><td>${escapeHtml(item.path)}</td><td>${escapeHtml(item.ip)}</td><td class="muted" style="font-size:10px">${escapeHtml(item.referer || '—')}</td><td>${item.isGuest ? escapeHtml('游客') : escapeHtml('账号')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">暂无数据</td></tr>'}</tbody></table></div>`;
        content.querySelector('[data-clean-guests]')?.addEventListener('click', async (event) => {
          const button = event.currentTarget;
          const days = Math.max(0, Math.min(365, Number(content.querySelector('[data-clean-days]')?.value || 0)));
          const ok = await confirmDialog({
            title: '清理游客？',
            message: days === 0 ? '将删除全部游客账号及其练习、打卡等服务端记录（不影响正式账号）。' : `将删除闲置超过 ${days} 天的游客账号及其服务端记录。`,
            confirmText: '清理',
            danger: true,
          });
          if (!ok) return;
          button.disabled = true;
          try {
            const result = await api.adminCleanGuests(days);
            toast(`已清理 ${result.deleted} 个游客`, 'success');
            await loadTraffic();
          } catch (error) {
            toast(error.message || '清理失败', 'error');
          } finally {
            button.disabled = false;
          }
        });
      } catch (error) {
        host.innerHTML = `<div class="callout danger">${escapeHtml(error.message || '流量统计加载失败')}</div>`;
      }
    };
    const loadPacks = async () => {
      const listHost = content.querySelector('[data-pack-list]');
      if (!listHost) return;
      const readPack = () => {
        const raw = String(content.querySelector('[data-pack-json]')?.value || '').trim();
        if (!raw) { toast('请先粘贴或选择课程包 JSON', 'warn'); return null; }
        try { return JSON.parse(raw); } catch { toast('JSON 解析失败，请检查格式', 'error'); return null; }
      };
      const renderList = (items) => {
        listHost.innerHTML = items.length
          ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>课程包</th><th>许可</th><th>内容</th><th>审阅/状态</th><th></th></tr></thead><tbody>${items.map((item) => `<tr>
            <td><b>${escapeHtml(item.name)}</b><div class="muted" style="font-size:10px">${escapeHtml(item.packId)}@${escapeHtml(item.version)} · ${escapeHtml(String(item.sha256).slice(0, 10))}</div></td>
            <td>${escapeHtml(item.license)}</td>
            <td>${item.chapters} 章 · ${item.articles} 篇</td>
            <td>${escapeHtml(item.reviewStatus)} · ${item.status === 'published' ? badge('已发布', 'badge-ok') : item.status === 'draft' ? badge('草稿', 'badge-warn') : badge('归档', '')}</td>
            <td><div class="row-wrap" style="justify-content:flex-end;gap:3px"><button class="btn btn-xs btn-ghost" data-pack-preview="${item.id}">预览</button>${item.status === 'published' ? `<button class="btn btn-xs btn-ghost" data-pack-status="draft" data-pack-id="${item.id}">撤回</button>` : `<button class="btn btn-xs btn-secondary" data-pack-status="published" data-pack-id="${item.id}">发布</button>`}<button class="btn btn-xs btn-ghost" data-pack-status="archived" data-pack-id="${item.id}">归档</button></div></td>
          </tr>`).join('')}</tbody></table></div>`
          : '<div class="muted" style="font-size:12px">尚未导入课程包。</div>';
        listHost.querySelectorAll('[data-pack-preview]').forEach((button) => button.addEventListener('click', async () => {
          try {
            const pack = await api.adminPackPreview(Number(button.dataset.packPreview));
            openModal({
              title: `${pack.name} · ${pack.version}`,
              sub: `命名空间 ${pack.namespace} · ${escapeHtml(String(pack.license || ''))}`,
              content: `<div class="stack">${(pack.chapters || []).map((chapter) => `<div><b>${escapeHtml(chapter.name)}</b><div class="muted" style="font-size:10px">${escapeHtml(chapter.localId || '')}</div><div class="stack" style="margin-top:4px">${(pack.articles || []).filter((article) => article.chapter === chapter.id).map((article) => `<div class="settings-row" style="padding:5px 0"><div><div class="settings-name">${escapeHtml(article.name)}</div><div class="settings-sub">${escapeHtml(article.oneLiner || article.content?.oneLiner || '')}</div></div><span class="badge">${escapeHtml(article.localId || '')}</span></div>`).join('') || '<span class="muted" style="font-size:11px">暂无文章</span>'}</div></div>`).join('')}</div>`,
            });
          } catch (error) { toast(error.message || '预览失败', 'error'); }
        }));
        listHost.querySelectorAll('[data-pack-status]').forEach((button) => button.addEventListener('click', async () => {
          try {
            await api.adminPackStatus(Number(button.dataset.packId), button.dataset.packStatus);
            toast('状态已更新');
            await loadPacks();
          } catch (error) { toast(error.message, 'error'); }
        }));
      };
      try {
        const data = await api.adminPacks();
        renderList(data.items || []);
      } catch (error) {
        listHost.innerHTML = `<div class="callout danger">${escapeHtml(error.message)}</div>`;
      }
      const statusHost = content.querySelector('[data-pack-status]');
      const show = (text, danger = false) => { if (statusHost) { statusHost.textContent = text; statusHost.style.color = danger ? 'var(--danger)' : 'var(--muted)'; } };
      content.querySelector('[data-pack-file]')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          content.querySelector('[data-pack-json]').value = JSON.stringify(parsed, null, 2);
          show(`已读取 ${file.name}（${(file.size / 1024).toFixed(1)} KB）`);
        } catch {
          show('文件不是合法 JSON', true);
        }
      });
      content.querySelector('[data-pack-validate]')?.addEventListener('click', async () => {
        const pack = readPack();
        if (!pack) return;
        try {
          const result = await api.adminPackValidate(pack);
          show(result.ok ? `校验通过：${result.summary.id}@${result.summary.version} · ${result.summary.chapters} 章 · ${result.summary.articles} 篇` : `校验失败：${result.errors.join('；')}`, !result.ok);
        } catch (error) { show(error.message || '校验失败', true); }
      });
      content.querySelector('[data-pack-import]')?.addEventListener('click', async () => {
        const pack = readPack();
        if (!pack) return;
        const ok = await confirmDialog({ title: '导入课程包？', message: '导入后为草稿状态，需在列表中发布。ID 将加上包命名空间。', confirmText: '导入' });
        if (!ok) return;
        try {
          const result = await api.adminPackImport(pack);
          toast(`已导入 ${result.summary.id}@${result.summary.version}（草稿）`, 'success');
          await loadPacks();
        } catch (error) { show(error.message || '导入失败', true); }
      });
    };
    const loadCost = async () => {
      const host = content.querySelector('[data-cost-kpis]');
      if (!host) return;
      try {
        const data = await api.adminAiCost(30);
        const currency = data.currency || '¥';
        const money = (value) => `${currency}${Number(value || 0).toFixed(4)}`;
        const kpis = content.querySelectorAll('[data-cost-kpis] .stat-value');
        [money(data.today.cost), money(data.totals.cost), String(data.today.calls || 0), String((data.totals.prompt || 0) + (data.totals.completion || 0))].forEach((value, index) => {
          if (kpis[index]) kpis[index].textContent = value;
        });
        const range = content.querySelector('[data-cost-range]');
        if (range) range.textContent = `近 ${data.days} 天 · 今日 ${data.today.calls || 0} 次调用${data.settings.activeDiscount ? ' · 当前折扣：' + data.settings.activeDiscount : ''}`;
        const bars = content.querySelector('[data-cost-bars]');
        const maxCost = Math.max(0.000001, ...data.series.map((item) => item.cost));
        if (bars) bars.innerHTML = data.series.map((item) => `<div class="traffic-bar" title="${escapeHtml(item.day)} · ${money(item.cost)} · ${item.calls} 次"><b>${item.calls || ''}</b><i style="height:${Math.max(2, Math.round((item.cost / maxCost) * 100))}%"></i><span>${escapeHtml(item.day.slice(5))}</span></div>`).join('');
        const models = content.querySelector('[data-cost-models]');
        if (models) models.innerHTML = data.models.length
          ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>模型</th><th>花费</th><th>tokens</th><th>调用</th></tr></thead><tbody>${data.models.map((item) => `<tr><td><b>${escapeHtml(item.model || '—')}</b><div class="muted" style="font-size:10px">${escapeHtml(item.provider || '')}</div></td><td>${money(item.cost)}</td><td>${item.prompt} → ${item.completion}</td><td>${item.calls}</td></tr>`).join('')}</tbody></table></div>`
          : '<div class="muted" style="font-size:12px">暂无调用记录</div>';
        const recent = content.querySelector('[data-cost-recent]');
        if (recent) recent.innerHTML = data.recent.length
          ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>时间</th><th>用户</th><th>模型</th><th>模式</th><th>tokens</th><th>花费</th></tr></thead><tbody>${data.recent.map((item) => `<tr><td class="muted" style="font-size:10px">${escapeHtml(item.createdAt)}</td><td>${escapeHtml(item.user)}</td><td>${escapeHtml(item.model || '—')}<div class="muted" style="font-size:9px">${escapeHtml(item.provider || '')}</div></td><td>${escapeHtml(item.mode)}</td><td>${item.prompt} → ${item.completion}</td><td>${money(item.cost)}${item.discount ? `<div class="muted" style="font-size:9px">${escapeHtml(item.discount)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`
          : '<div class="muted" style="font-size:12px">暂无调用记录</div>';
        const pricingHost = content.querySelector('[data-cost-pricing]');
        const renderPricing = (pricing) => {
          const rows = Object.entries(pricing || {});
          pricingHost.innerHTML = (rows.length ? rows : [['', { input: 0, output: 0 }]]).map(([model, rate]) => `<tr>
            <td><input class="input" data-price-model value="${escapeHtml(model)}" placeholder="模型名（* 为默认价）"></td>
            <td><input class="input" type="number" min="0" step="0.0001" data-price-input value="${Number(rate.input || 0)}"></td>
            <td><input class="input" type="number" min="0" step="0.0001" data-price-output value="${Number(rate.output || 0)}"></td>
            <td><button class="btn btn-xs btn-ghost" type="button" data-price-remove>删除</button></td>
          </tr>`).join('');
        };
        const discountsHost = content.querySelector('[data-cost-discounts]');
        const renderDiscounts = (list) => {
          const rows = Array.isArray(list) ? list : [];
          discountsHost.innerHTML = (rows.length ? rows : [{ label: '夜间', from: '22:00', to: '08:00', ratio: 0.5 }]).map((item) => `<tr>
            <td><input class="input" data-disc-label value="${escapeHtml(item.label || '')}" placeholder="名称"></td>
            <td><input class="input" data-disc-from value="${escapeHtml(item.from || '')}" placeholder="22:00" style="width:90px"></td>
            <td><input class="input" data-disc-to value="${escapeHtml(item.to || '')}" placeholder="08:00" style="width:90px"></td>
            <td><input class="input" type="number" min="0" max="1" step="0.05" data-disc-ratio value="${Number(item.ratio ?? 1)}" style="width:90px"></td>
            <td><button class="btn btn-xs btn-ghost" type="button" data-disc-remove>删除</button></td>
          </tr>`).join('');
        };
        renderPricing(data.settings.pricing || {});
        renderDiscounts(data.settings.discounts || []);
        content.querySelector('[data-cost-currency]').value = currency;
        content.querySelector('[data-cost-maxtokens]').value = String(data.settings.maxTokens || 1200);
        content.querySelector('[data-cost-add-model]')?.addEventListener('click', () => {
          pricingHost.insertAdjacentHTML('beforeend', `<tr><td><input class="input" data-price-model placeholder="模型名"></td><td><input class="input" type="number" min="0" step="0.0001" data-price-input value="0"></td><td><input class="input" type="number" min="0" step="0.0001" data-price-output value="0"></td><td><button class="btn btn-xs btn-ghost" type="button" data-price-remove>删除</button></td></tr>`);
        });
        content.querySelector('[data-cost-add-discount]')?.addEventListener('click', () => {
          discountsHost.insertAdjacentHTML('beforeend', `<tr><td><input class="input" data-disc-label placeholder="名称"></td><td><input class="input" data-disc-from placeholder="22:00" style="width:90px"></td><td><input class="input" data-disc-to placeholder="08:00" style="width:90px"></td><td><input class="input" type="number" min="0" max="1" step="0.05" data-disc-ratio value="1" style="width:90px"></td><td><button class="btn btn-xs btn-ghost" type="button" data-disc-remove>删除</button></td></tr>`);
        });
        content.addEventListener('click', (event) => {
          if (event.target.closest('[data-price-remove]')) event.target.closest('tr')?.remove();
          if (event.target.closest('[data-disc-remove]')) event.target.closest('tr')?.remove();
        });
        content.querySelector('[data-cost-save]')?.addEventListener('click', async (event) => {
          const button = event.currentTarget;
          const pricing = {};
          pricingHost.querySelectorAll('tr').forEach((row) => {
            const model = String(row.querySelector('[data-price-model]')?.value || '').trim();
            if (!model) return;
            pricing[model] = {
              input: Number(row.querySelector('[data-price-input]')?.value || 0),
              output: Number(row.querySelector('[data-price-output]')?.value || 0),
            };
          });
          const discounts = [];
          discountsHost.querySelectorAll('tr').forEach((row) => {
            const from = String(row.querySelector('[data-disc-from]')?.value || '').trim();
            const to = String(row.querySelector('[data-disc-to]')?.value || '').trim();
            if (!from || !to) return;
            discounts.push({
              label: String(row.querySelector('[data-disc-label]')?.value || '').trim() || '折扣',
              from,
              to,
              ratio: Number(row.querySelector('[data-disc-ratio]')?.value || 1),
            });
          });
          button.disabled = true;
          try {
            await api.adminAiSaveCost({
              pricing,
              discounts,
              currency: String(content.querySelector('[data-cost-currency]')?.value || '¥').trim() || '¥',
              maxTokens: Number(content.querySelector('[data-cost-maxtokens]')?.value || 1200),
            });
            toast('价格与折扣已保存', 'success');
            await loadCost();
          } catch (error) {
            toast(error.message || '保存失败', 'error');
          } finally {
            button.disabled = false;
          }
        });
      } catch (error) {
        host.innerHTML = `<div class="callout danger">${escapeHtml(error.message || '成本数据加载失败')}</div>`;
      }
    };
    content.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-admin-create-user]');
      if (!form) return;
      event.preventDefault();
      const value = (name) => (form.querySelector(`[name="${name}"]`)?.value || '').trim();
      try {
        await api.adminCreateUser({ username: value('username'), password: form.querySelector('[name="password"]').value, displayName: value('displayName'), isAdmin: Boolean(form.querySelector('[name="isAdmin"]').checked), aiDailyLimit: value('aiDailyLimit') === '' ? null : Number(value('aiDailyLimit')) });
        toast('用户已创建');
        form.reset();
        await loadUsers();
      } catch (err) { toast(err.message || '创建用户失败', 'error'); }
    });
    content.querySelector('[data-user-search]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      loadUsers(event.currentTarget.q.value.trim());
    });
    bindSettings();
    // AI provider forms
    const bindProviderForm = () => {
      const form = content.querySelector('[data-provider-form]');
      fillPricing = (pricing = {}) => {
        if (!form) return;
        const body = form.querySelector('[data-provider-pricing]');
        if (!body) return;
        const models = String(form.querySelector('[name="models"]')?.value || '').split(',').map((item) => item.trim()).filter(Boolean);
        const previous = {};
        body.querySelectorAll('tr').forEach((row) => {
          const model = String(row.querySelector('[data-price-model]')?.value || '').trim();
          if (!model) return;
          previous[model] = {
            input: row.querySelector('[data-price-input]')?.value || 0,
            output: row.querySelector('[data-price-output]')?.value || 0,
            discount_from: row.querySelector('[data-price-from]')?.value || '',
            discount_to: row.querySelector('[data-price-to]')?.value || '',
            discount_ratio: row.querySelector('[data-price-ratio]')?.value || '',
          };
        });
        body.innerHTML = models.map((model) => {
          const rate = pricing[model] || previous[model] || {};
          const discount = rate.discount || {};
          return `<tr>
            <td><input class="input" data-price-model value="${escapeHtml(model)}" readonly></td>
            <td><input class="input" type="number" min="0" step="0.0001" data-price-input value="${Number(rate.input ?? 0)}"></td>
            <td><input class="input" type="number" min="0" step="0.0001" data-price-output value="${Number(rate.output ?? 0)}"></td>
            <td><input class="input" data-price-from value="${escapeHtml(discount.from || rate.discount_from || '')}" placeholder="22:00" style="width:80px"></td>
            <td><input class="input" data-price-to value="${escapeHtml(discount.to || rate.discount_to || '')}" placeholder="08:00" style="width:80px"></td>
            <td><input class="input" type="number" min="0" max="1" step="0.05" data-price-ratio value="${Number(discount.ratio ?? rate.discount_ratio ?? 1)}" style="width:70px"></td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" class="muted">先填写模型列表</td></tr>';
      };
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const f = event.currentTarget;
        const val = (name) => (f.querySelector(`[name="${name}"]`)?.value || '').trim();
        const model_pricing = {};
        f.querySelectorAll('[data-provider-pricing] tr').forEach((row) => {
          const model = String(row.querySelector('[data-price-model]')?.value || '').trim();
          if (!model) return;
          model_pricing[model] = {
            input: Number(row.querySelector('[data-price-input]')?.value || 0),
            output: Number(row.querySelector('[data-price-output]')?.value || 0),
            discount_from: String(row.querySelector('[data-price-from]')?.value || '').trim(),
            discount_to: String(row.querySelector('[data-price-to]')?.value || '').trim(),
            discount_ratio: Number(row.querySelector('[data-price-ratio]')?.value || 1),
          };
        });
        const provider = { id: val('id'), name: val('name'), base_url: val('base_url'), api_key: f.querySelector('[name="api_key"]')?.value || '', models: val('models'), default_model: val('default_model'), model_pricing, enabled: Boolean(f.querySelector('[name="enabled"]')?.checked) };
        try { await api.adminProviderSave(provider); toast('供应商已保存'); await reloadSession(); } catch (err) { toast(err.message || '保存失败', 'error'); }
      });
      form?.addEventListener('reset', () => { const idField = form.querySelector('[name="id"]'); if (idField) idField.value = ''; fillPricing({}); });
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
        fillPricing(p.model_pricing || {});
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

function trafficCard() {
  return `<section class="card card-pad" style="margin-bottom:12px">
    <div class="section-head"><h3 style="margin:0;font-size:16px">实时概况</h3><span class="muted" style="font-size:11px" data-traffic-range>加载中…</span></div>
    <div class="stat-grid" data-traffic-kpis>
      <div class="stat"><div class="stat-value">—</div><div class="stat-label">今日 PV</div></div>
      <div class="stat"><div class="stat-value">—</div><div class="stat-label">今日 UV</div></div>
      <div class="stat"><div class="stat-value">—</div><div class="stat-label">近 14 天 PV</div></div>
      <div class="stat"><div class="stat-value">—</div><div class="stat-label">近 14 天 UV</div></div>
    </div>
  </section>
  <section class="card card-pad" style="margin-bottom:12px">
    <h3 style="margin:0 0 6px;font-size:16px">近 14 天访问</h3>
    <div class="traffic-bars" data-traffic-bars><div class="muted">加载中…</div></div>
  </section>
  <div class="admin-two-col">
    <section class="card card-pad"><h3 style="margin:0 0 8px;font-size:16px">热门页面</h3><div data-traffic-paths></div></section>
    <section class="card card-pad"><h3 style="margin:0 0 8px;font-size:16px">来源站点</h3><div data-traffic-referers></div></section>
  </div>
  <section class="card card-pad" style="margin-top:12px"><h3 style="margin:0 0 8px;font-size:16px">来源 IP</h3><div data-traffic-ips></div></section>
  <section class="card card-pad" style="margin-top:12px"><h3 style="margin:0 0 8px;font-size:16px">最近访问</h3><div data-traffic-recent></div></section>
  <section class="card card-pad" style="margin-top:12px">
    <h3 style="margin:0 0 4px;font-size:16px">游客清理</h3>
    <p class="muted" style="font-size:11.5px;line-height:1.7">删除闲置游客账号及其练习、打卡等服务端记录，不影响正式账号与访客统计。当前游客 <b data-guest-count>—</b> 个；访客统计（含 IP）保留 90 天，超期自动清理。</p>
    <div class="row-wrap" style="margin-top:8px">
      <label class="field" style="margin:0"><span class="label">闲置天数（0 = 全部游客）</span><input class="input" type="number" min="0" max="365" value="7" data-clean-days style="width:130px"></label>
      <button class="btn btn-danger btn-sm" type="button" data-clean-guests>清理游客</button>
    </div>
  </section>`;
}

function costCard() {
  return `<section class="card card-pad" style="margin-bottom:12px">
    <div class="section-head"><h3 style="margin:0;font-size:16px">AI 成本</h3><span class="muted" style="font-size:11px" data-cost-range>加载中…</span></div>
    <div class="stat-grid" data-cost-kpis>
      <div class="stat"><div class="stat-value">—</div><div class="stat-label">今日花费</div></div>
      <div class="stat"><div class="stat-value">—</div><div class="stat-label">近 30 天花费</div></div>
      <div class="stat"><div class="stat-value">—</div><div class="stat-label">今日调用</div></div>
      <div class="stat"><div class="stat-value">—</div><div class="stat-label">30 天 tokens</div></div>
    </div>
    <p class="muted" style="font-size:10.5px;margin-top:6px">价格单位为“每百万 tokens”，由你自行填写，币种符号可配置；折扣按每日时间段自动套用到输入与输出费用。</p>
  </section>
  <section class="card card-pad" style="margin-bottom:12px">
    <h3 style="margin:0 0 6px;font-size:16px">30 天花费</h3>
    <div class="traffic-bars" data-cost-bars><div class="muted">加载中…</div></div>
  </section>
  <div class="admin-two-col">
    <section class="card card-pad"><h3 style="margin:0 0 8px;font-size:16px">模型花费</h3><div data-cost-models></div></section>
    <section class="card card-pad"><h3 style="margin:0 0 8px;font-size:16px">最近调用</h3><div data-cost-recent></div></section>
  </div>
  <section class="card card-pad" style="margin-top:12px">
    <div class="section-head"><h3 style="margin:0;font-size:16px">模型价格</h3><button class="btn btn-sm btn-secondary" type="button" data-cost-add-model>添加模型</button></div>
    <div class="admin-table-wrap" style="margin-top:8px"><table class="admin-table"><thead><tr><th>模型</th><th>输入 / 百万 tokens</th><th>输出 / 百万 tokens</th><th></th></tr></thead><tbody data-cost-pricing></tbody></table></div>
    <div class="row-wrap" style="margin-top:8px">
      <label class="field" style="margin:0"><span class="label">币种符号</span><input class="input" data-cost-currency style="width:90px" value="¥"></label>
      <label class="field" style="margin:0"><span class="label">最大输出 tokens</span><input class="input" type="number" min="128" max="4000" data-cost-maxtokens style="width:140px" value="1200"></label>
      <button class="btn btn-primary btn-sm" type="button" data-cost-save>保存价格与折扣</button>
    </div>
  </section>
  <section class="card card-pad" style="margin-top:12px">
    <div class="section-head"><h3 style="margin:0;font-size:16px">折扣时间段</h3><button class="btn btn-sm btn-secondary" type="button" data-cost-add-discount>添加时段</button></div>
    <div class="admin-table-wrap" style="margin-top:8px"><table class="admin-table"><thead><tr><th>名称</th><th>开始</th><th>结束</th><th>折扣比例</th><th></th></tr></thead><tbody data-cost-discounts></tbody></table></div>
    <p class="muted" style="font-size:10px;margin-top:6px">比例 1 = 不打折，0.5 = 五折；跨午夜时段可设 22:00–08:00。</p>
  </section>`;
}

function packsCard() {
  return `<section class="card card-pad">
    <div class="section-head"><h3 style="margin:0;font-size:16px">导入课程包</h3><div class="row-wrap"><label class="btn btn-secondary btn-sm" style="cursor:pointer">选择 JSON 文件<input type="file" accept=".json,application/json" data-pack-file hidden></label><button class="btn btn-secondary btn-sm" type="button" data-pack-validate>校验</button><button class="btn btn-primary btn-sm" type="button" data-pack-import>导入为草稿</button></div></div>
    <p class="muted" style="font-size:11px;line-height:1.7">规范见 docs/COURSE_PACK.md。导入时自动校验字段、章节引用与脚本注入，并为文章分配 <code>pack-id:article-id</code> 命名空间；发布前需人工审阅许可与医学内容。</p>
    <textarea class="textarea" data-pack-json rows="9" placeholder="粘贴课程包 JSON…" style="margin-top:8px;font-family:var(--font-mono);font-size:11px"></textarea>
    <div class="muted" style="font-size:11px;margin-top:6px" data-pack-status>未选择文件</div>
  </section>
  <section class="card card-pad" style="margin-top:12px">
    <div class="section-head"><h3 style="margin:0;font-size:16px">已导入课程包</h3><span class="muted" style="font-size:11px">草稿不会对学员可见</span></div>
    <div data-pack-list style="margin-top:8px"></div>
  </section>`;
}
