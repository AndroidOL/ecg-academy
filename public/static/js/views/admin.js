const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261112a4';
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { icon, escapeHtml, toast, confirmDialog, openModal } = await import(`../ui.js${__asset}`);

const TABS = [
  ['overview', '概览'],
  ['settings', '站点设置'],
  ['traffic', '流量统计'],
  ['cost', 'AI 成本'],
  ['packs', '课程包'],
  ['users', '用户'],
  ['assignments', '班级作业'],
  ['ai', 'AI 供应商'],
  ['conversations', 'AI 对话'],
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
    <div class="section-head"><h2 class="section-title" style="font-size:17px">站点设置</h2><span class="badge">保存后立即生效</span></div>
    <form data-settings-form>
      <section class="admin-settings-section">
        <div class="admin-settings-title"><b>注册与登录</b><span>注册必须邮箱验证；每日名额与验证码频率见右侧邮件设置</span></div>
        <div class="admin-settings-grid">
          <label class="admin-check"><input type="checkbox" name="auth.registration_enabled" ${a.registration_enabled ? 'checked' : ''}> 允许新用户注册（邮箱验证）</label>
          <label class="admin-check"><input type="checkbox" name="auth.user_login_enabled" ${a.user_login_enabled ? 'checked' : ''}> 允许普通用户登录</label>
          <label class="admin-check"><input type="checkbox" name="admin.password_login_enabled" ${ad.password_login_enabled ? 'checked' : ''}> 允许管理员密码登录</label>
          <label class="admin-check"><input type="checkbox" name="admin.passkey_login_enabled" ${ad.passkey_login_enabled ? 'checked' : ''}> 允许管理员 Passkey 登录</label>
          <label class="field"><span>每日注册上限</span><input class="input" type="number" min="1" max="1000" name="auth.registration_daily_limit" value="${a.registration_daily_limit}"></label>
          <label class="field"><span>验证码有效期（秒）</span><input class="input" type="number" min="300" max="1800" name="auth.email_code_ttl" value="${a.email_code_ttl}"></label>
          <label class="field"><span>每邮箱每日验证码上限</span><input class="input" type="number" min="1" max="20" name="auth.email_daily_per_address" value="${a.email_daily_per_address}"></label>
          <label class="field"><span>每 IP 每日验证码上限</span><input class="input" type="number" min="1" max="50" name="auth.email_daily_per_ip" value="${a.email_daily_per_ip}"></label>
        </div>
      </section>
      <section class="admin-settings-section">
        <div class="admin-settings-title"><b>AI 使用策略</b><span>对话需 Lv.10 与每日挑战次数；错因分析对所有注册用户开放</span></div>
        <div class="admin-settings-grid">
          <label class="admin-check"><input type="checkbox" name="ai.enabled" ${ai.enabled ? 'checked' : ''}> 启用 AI 服务</label>
          <label class="admin-check"><input type="checkbox" name="ai.byok_enabled" ${ai.byok_enabled ? 'checked' : ''}> 允许 BYOK（自带密钥，仍受等级与次数限制）</label>
          <label class="admin-check"><input type="checkbox" name="ai.allow_guest" ${ai.allow_guest ? 'checked' : ''}> 允许未登录用户使用 AI（默认关闭）</label>
          <label class="field"><span>默认供应商</span><select class="select" name="ai.default_provider"><option value="">自动选择首个启用项</option>${providers.map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === ai.default_provider ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></label>
          <label class="field"><span>普通用户每日 AI 总调用上限</span><input class="input" type="number" min="0" max="10000" name="ai.daily_limit" value="${ai.daily_limit}"></label>
          <label class="field"><span>AI 对话解锁等级</span><input class="input" type="number" min="1" max="20" name="ai.level_required" value="${ai.level_required}"></label>
          <label class="field"><span>每日打卡基础对话次数</span><input class="input" type="number" min="0" max="100" name="ai.credit_base" value="${ai.credit_base}"></label>
          <label class="field"><span>对话次数上限</span><input class="input" type="number" min="1" max="100" name="ai.credit_cap" value="${ai.credit_cap}"></label>
          <label class="field"><span>错因分析每日上限</span><input class="input" type="number" min="1" max="100" name="ai.analysis_daily_limit" value="${ai.analysis_daily_limit}"></label>
          <label class="field"><span>提问最小间隔（秒）</span><input class="input" type="number" min="0" max="120" name="ai.min_interval_seconds" value="${ai.min_interval_seconds}"></label>
          <label class="field"><span>每 IP 每日 AI 上限</span><input class="input" type="number" min="1" max="1000" name="ai.ip_daily_limit" value="${ai.ip_daily_limit}"></label>
          <label class="field"><span>越界次数阈值</span><input class="input" type="number" min="1" max="20" name="ai.violation_limit" value="${ai.violation_limit}"></label>
          <label class="field"><span>越界统计窗口（小时）</span><input class="input" type="number" min="1" max="720" name="ai.violation_window_hours" value="${ai.violation_window_hours}"></label>
          <label class="field"><span>暂停时长（小时）</span><input class="input" type="number" min="1" max="720" name="ai.disabled_hours" value="${ai.disabled_hours}"></label>
          <label class="field" style="grid-column:1/-1"><span>补充系统提示词（可选，最多 1000 字）</span><textarea class="input" name="ai.system_prompt_append" rows="3" maxlength="1000">${escapeHtml(ai.system_prompt_append)}</textarea></label>
        </div>
      </section>
      <section class="admin-settings-section">
        <div class="admin-settings-title"><b>站点信息</b><span>显示在页脚与关于页</span></div>
        <div class="admin-settings-grid">
          <label class="field"><span>GitHub 链接</span><input class="input" name="site.github_url" maxlength="180" value="${escapeHtml(site.github_url || '')}" placeholder="https://github.com/AndroidOL/ecg-academy"></label>
          <label class="field"><span>许可证说明</span><input class="input" name="site.license" maxlength="180" value="${escapeHtml(site.license || '')}" placeholder="MIT（代码）· CC BY-SA 4.0（内容）"></label>
          <label class="field"><span>版权信息</span><input class="input" name="site.copyright" maxlength="180" value="${escapeHtml(site.copyright || '')}" placeholder="© 2026 Tianhao Wu 等"></label>
          <label class="field"><span>ICP 备案号</span><input class="input" name="site.icp" maxlength="180" value="${escapeHtml(site.icp || '')}" placeholder="例如：京ICP备xxxxxxxx号"></label>
        </div>
      </section>
      <div class="admin-settings-actions"><button class="btn btn-primary" type="submit">保存站点设置</button><span class="muted">关闭两种管理员登录方式会被拒绝。</span></div>
    </form>
  </div>`;
}

function smtpCard(session) {
  const smtp = session.settings.smtp || {};
  return `<div class="card card-pad">
    <div class="section-head"><h2 class="section-title" style="font-size:17px">邮件 / 注册验证</h2><span class="badge ${smtp.configured ? 'badge-ok' : 'badge-warn'}">${smtp.configured ? '已配置' : '未配置'}</span></div>
    <p class="muted" style="font-size:11px;line-height:1.7">注册必须验证邮箱。支持 SMTP（TLS/SSL），密码使用 AES-256-GCM 加密保存。每个邮箱每日 3 封、每个 IP 每日 5 次，可在上方调整。</p>
    <form data-smtp-form class="admin-settings-grid">
      <label class="admin-check"><input type="checkbox" name="smtp.enabled" ${smtp.enabled ? 'checked' : ''}> 启用邮件服务</label>
      <label class="field"><span>SMTP 主机</span><input class="input" name="smtp.host" value="${escapeHtml(smtp.host || '')}" placeholder="smtp.example.com"></label>
      <label class="field"><span>端口</span><input class="input" type="number" min="1" max="65535" name="smtp.port" value="${smtp.port || 587}"></label>
      <label class="field"><span>加密方式</span><select class="select" name="smtp.secure"><option value="tls" ${smtp.secure === 'tls' ? 'selected' : ''}>STARTTLS</option><option value="ssl" ${smtp.secure === 'ssl' ? 'selected' : ''}>SSL</option><option value="none" ${smtp.secure === 'none' ? 'selected' : ''}>无（不推荐）</option></select></label>
      <label class="field"><span>SMTP 用户名</span><input class="input" name="smtp.username" value="${escapeHtml(smtp.username || '')}" autocomplete="off"></label>
      <label class="field"><span>SMTP 密码（留空不修改）</span><input class="input" name="smtp.password" type="password" value="" autocomplete="new-password" placeholder="${escapeHtml(smtp.password || '')}"></label>
      <label class="field"><span>发件邮箱</span><input class="input" type="email" name="smtp.from_email" value="${escapeHtml(smtp.from_email || '')}" placeholder="noreply@example.com"></label>
      <label class="field"><span>发件人名称</span><input class="input" name="smtp.from_name" value="${escapeHtml(smtp.from_name || '')}" maxlength="80"></label>
      <div style="grid-column:1/-1" class="row-wrap"><button class="btn btn-primary" type="submit">保存邮件设置</button><button class="btn btn-secondary" type="button" data-mail-test>发送测试邮件</button><span class="muted" style="font-size:10px">测试邮件需先保存发件配置。</span></div>
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
        <option value="moonshot" data-base="https://api.moonshot.cn/v1" data-models="moonshot-v1-8k, moonshot-v1-32k">Moonshot / Kimi</option>
        <option value="zhipu" data-base="https://open.bigmodel.cn/api/paas/v4" data-models="glm-4-flash, glm-4-plus">智谱 GLM</option>
        <option value="groq" data-base="https://api.groq.com/openai/v1" data-models="llama-3.3-70b-versatile, mixtral-8x7b-32768">Groq</option>
        <option value="mistral" data-base="https://api.mistral.ai/v1" data-models="mistral-small-latest, mistral-large-latest">Mistral</option>
      </select></label>
      <label class="field"><span>名称</span><input class="input" name="name" required maxlength="80" placeholder="例如 DeepSeek"></label>
      <label class="field"><span>Base URL</span><input class="input" name="base_url" required placeholder="https://api.deepseek.com/v1"></label>
      <label class="field"><span>API Key（编辑时留空表示不修改）</span><input class="input" name="api_key" type="password" autocomplete="new-password" maxlength="300"></label>
      <label class="field"><span>模型（逗号分隔）</span><input class="input" name="models" required placeholder="deepseek-chat, deepseek-reasoner"></label>
      <label class="field"><span>默认模型</span><input class="input" name="default_model" placeholder="deepseek-chat"></label>
      <div class="admin-pricing-block">
        <div class="spread admin-pricing-head">
          <div><b>模型价格与折扣</b><span>单位：每百万 tokens；折扣按服务器本地时间生效</span></div>
          <div class="row-wrap"><button class="btn btn-xs btn-ghost" type="button" data-provider-discount-preset>套用 DeepSeek 示例（每天 00:30–08:30 五折）</button><button class="btn btn-xs btn-secondary" type="button" data-provider-pricing-build>按模型刷新</button></div>
        </div>
        <div class="admin-table-wrap admin-pricing-table"><table class="admin-table"><thead><tr><th>模型</th><th>输入</th><th>输出</th><th>折扣规则</th><th></th></tr></thead><tbody data-provider-pricing></tbody></table></div>
        <p class="muted admin-pricing-note">每百万 tokens；点“编辑规则”可配置多段规则、周一至周日、跨午夜与比例。DeepSeek 示例：工作日 09:00–12:00、14:00–18:00 为高峰期，其余时段与周末全天五折。</p>
      </div>
      <label class="admin-check"><input type="checkbox" name="enabled" checked> 启用该供应商</label>
      <div style="grid-column:1/-1"><button class="btn btn-primary" type="submit">保存供应商</button><button class="btn btn-ghost" type="reset">清空</button></div>
    </form>
  </div>`;
}

function conversationsCard() {
  return `<div class="card card-pad">
    <div class="section-head"><h2 class="section-title" style="font-size:17px">永久对话记录</h2><span class="badge">审计保留 · 不提供删除</span></div>
    <form class="row" data-conv-search><input class="input" name="q" placeholder="搜索问题或回答" style="min-height:34px;width:280px"><button class="btn btn-secondary btn-sm" type="submit">搜索</button></form>
    <div data-conv-list style="margin-top:12px"></div>
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
    });
    const drawTab = async (tab) => {
      el.querySelectorAll('[data-admin-tab]').forEach((b) => b.classList.toggle('active', b.dataset.adminTab === tab));
      content.innerHTML = tab === 'overview' ? overview(session)
        : tab === 'settings' ? settingsCard(session) + smtpCard(session)
        : tab === 'traffic' ? trafficCard()
          : tab === 'cost' ? costCard()
            : tab === 'packs' ? packsCard()
            : tab === 'users' ? usersCard()
              : tab === 'assignments' ? assignmentsCard()
                : tab === 'ai' ? aiCard(session)
              : tab === 'conversations' ? conversationsCard()
                  : tab === 'security' ? securityCard(session)
                    : auditCard(session);
      if (tab === 'users') await loadUsers();
      if (tab === 'traffic') await loadTraffic();
      if (tab === 'cost') await loadCost();
      if (tab === 'packs') await loadPacks();
      if (tab === 'settings') { bindSettings(); bindSmtp(); }
      if (tab === 'ai') bindProviderForm();
      if (tab === 'conversations') { bindConversations(); await loadConversations(); }
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
    content.addEventListener('click', (event) => {
      const jump = event.target.closest('[data-goto-tab]');
      if (!jump) return;
      event.preventDefault();
      activeTab = jump.dataset.gotoTab;
      drawTab(activeTab);
    });
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
        form.querySelectorAll('input[name],select[name],textarea[name]').forEach((input) => {
          if (input.type === 'checkbox') payload[input.name] = input.checked;
          else if (input.type === 'number') payload[input.name] = Number(input.value) || 0;
          else payload[input.name] = input.value;
        });
        try {
          await api.adminSaveSettings(payload);
          toast('设置已保存');
          await reloadSession();
        } catch (err) { toast(err.message || '保存失败', 'error'); }
      });
    };
    const bindSmtp = () => {
      content.querySelector('[data-smtp-form]')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const payload = {};
        form.querySelectorAll('input[name],select[name]').forEach((input) => {
          if (input.type === 'checkbox') payload[input.name] = input.checked;
          else if (input.type === 'number') payload[input.name] = Number(input.value) || 0;
          else if (input.name === 'smtp.password' && input.value === '') return;
          else payload[input.name] = input.value;
        });
        try {
          await api.adminSaveSettings(payload);
          toast('邮件设置已保存');
          await reloadSession();
        } catch (err) { toast(err.message || '保存失败', 'error'); }
      });
      content.querySelector('[data-mail-test]')?.addEventListener('click', async () => {
        const to = window.prompt('输入接收测试邮件的邮箱：');
        if (!to) return;
        try {
          const result = await api.adminMailTest(to);
          toast(result.message || (result.ok ? '测试邮件已发送' : '发送失败'), result.ok ? 'success' : 'error');
        } catch (err) { toast(err.message || '发送失败', 'error'); }
      });
    };
    const loadUsers = async (query = '') => {
      const host = content.querySelector('[data-users-list]');
      if (!host) return;
      try {
        const data = await api.adminUsers({ q: query });
        host.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>用户</th><th>等级 / 角色</th><th>状态</th><th>AI 次数</th><th>违规</th><th>最近活动</th><th></th></tr></thead><tbody>${(data.items || []).map((u) => `<tr>
          <td><b>${escapeHtml(u.display_name)}</b><div class="muted" style="font-size:10px">${u.username ? '@' + escapeHtml(u.username) : 'guest'} · ${escapeHtml(u.email || u.public_id)}</div></td>
          <td>Lv.${u.level || 1}${u.level_override ? ' · 手动' : ''}<div class="muted" style="font-size:9px">${u.is_admin ? '管理员' : u.is_guest ? '访客' : '用户'}</div></td>
          <td>${u.is_active ? badge('启用', 'badge-ok') : badge('停用', 'badge-danger')}</td>
          <td><b>${u.ai_credits || 0}</b> 次可用<div class="muted" style="font-size:9px">今日调用 ${u.ai_used_today || 0} · 记录 ${u.ai_conversation_count || 0}</div></td>
          <td>${u.ai_disabled_until ? `<span class="badge badge-danger">暂停至 ${escapeHtml(String(u.ai_disabled_until).slice(0, 16))}</span>` : `<span class="muted">${u.ai_violations || 0} 次</span>`}</td>
          <td class="muted" style="font-size:10px">${escapeHtml(u.last_seen_at || '')}</td>
          <td><div class="row-wrap" style="justify-content:flex-end;gap:3px"><button class="btn btn-xs btn-secondary" data-user-detail="${u.id}">详情</button><button class="btn btn-xs btn-ghost" data-user-ai-reset="${u.id}">恢复 AI</button>${u.is_admin ? '' : `<button class="btn btn-xs btn-ghost" data-user-active="${u.id}" data-value="${u.is_active ? 0 : 1}">${u.is_active ? '停用' : '启用'}</button><button class="btn btn-xs btn-ghost" data-user-admin="${u.id}" data-value="1">设为管理员</button>`}<button class="btn btn-xs btn-ghost" data-user-level="${u.id}">等级</button><button class="btn btn-xs btn-ghost" data-user-limit="${u.id}">上限</button><button class="btn btn-xs btn-ghost" data-user-credits="${u.id}" data-credits="${u.ai_credits || 0}">次数</button><button class="btn btn-xs btn-ghost" data-user-password="${u.id}">密码</button></div></td>
        </tr>`).join('')}</tbody></table></div><div class="pager-info" style="margin-top:8px">共 ${data.total} 个用户，显示第 ${data.page} 页</div>`;
        host.querySelectorAll('[data-user-active]').forEach((b) => b.addEventListener('click', async () => {
          try { await api.adminUpdateUser({ userId: Number(b.dataset.userActive), is_active: b.dataset.value === '1' }); toast('状态已更新'); await loadUsers(query); } catch (e) { toast(e.message, 'error'); }
        }));
        host.querySelectorAll('[data-user-admin]').forEach((b) => b.addEventListener('click', async () => {
          try { await api.adminUpdateUser({ userId: Number(b.dataset.userAdmin), is_admin: b.dataset.value === '1' }); toast('角色已更新'); await loadUsers(query); } catch (e) { toast(e.message, 'error'); }
        }));
        host.querySelectorAll('[data-user-detail]').forEach((b) => b.addEventListener('click', async () => {
          try {
            const detail = await api.adminUserDetail(Number(b.dataset.userDetail));
            const u = detail.user;
            const conv = (detail.conversations || []).map((row) => `<div class="settings-row" style="align-items:flex-start"><div><div class="settings-name">${escapeHtml(row.mode)} · ${escapeHtml(row.source)} · ${escapeHtml(row.created_at)}</div><div class="settings-sub" style="white-space:pre-wrap">问：${escapeHtml(row.question)}</div><details style="margin-top:4px"><summary class="muted" style="font-size:10px;cursor:pointer">查看回答</summary><div class="settings-sub" style="white-space:pre-wrap">${escapeHtml(row.answer)}</div></details></div></div>`).join('') || '<div class="muted" style="font-size:11px">暂无对话记录</div>';
            const usage = (detail.usage || []).map((row) => `<span class="badge">${escapeHtml(row.usage_day)} · ${row.used_count}</span>`).join('') || '<span class="muted">无</span>';
            const credits = (detail.credits || []).map((row) => `<div class="settings-sub">${escapeHtml(row.created_at)} · ${row.delta > 0 ? '+' : ''}${row.delta} → ${row.balance} · ${escapeHtml(row.reason)}</div>`).join('') || '<div class="muted" style="font-size:11px">无次数变动</div>';
            const violations = (detail.violations || []).map((row) => `<div class="settings-sub">${escapeHtml(row.created_at)} · ${escapeHtml(row.reason)} · ${escapeHtml(row.snippet)}</div>`).join('') || '<div class="muted" style="font-size:11px">无违规记录</div>';
            openModal({
              title: `用户详情 · ${u.display_name}`,
              sub: `${u.username ? '@' + u.username : '访客'} · ${u.email || '无邮箱'} · Lv.${u.level} · 今日调用 ${detail.todayUsed} 次`,
              content: `<div class="stack">
                <div class="row-wrap"><span class="badge badge-brand">可用 ${u.ai_credits} 次</span><span class="badge">违规 ${u.ai_violations} 次</span>${u.ai_disabled_until ? `<span class="badge badge-danger">暂停至 ${escapeHtml(u.ai_disabled_until)}</span>` : ''}<button class="btn btn-xs btn-secondary" type="button" data-detail-reset="${u.id}">恢复 AI 权限</button></div>
                <div><b>AI 每日调用</b><div class="row-wrap" style="margin-top:4px">${usage}</div></div>
                <div><b>次数变动（最近 50 条）</b><div style="max-height:150px;overflow:auto;margin-top:4px">${credits}</div></div>
                <div><b>违规记录</b><div style="max-height:150px;overflow:auto;margin-top:4px">${violations}</div></div>
                <div><b>永久对话记录（最近 100 条）</b><div style="max-height:320px;overflow:auto;margin-top:4px">${conv}</div></div>
              </div>`,
            }).el.querySelector('[data-detail-reset]')?.addEventListener('click', async () => {
              try { await api.adminUserAiReset(u.id); toast('AI 权限已恢复'); await loadUsers(query); } catch (e) { toast(e.message, 'error'); }
            });
          } catch (err) { toast(err.message || '加载失败', 'error'); }
        }));
        host.querySelectorAll('[data-user-ai-reset]').forEach((b) => b.addEventListener('click', async () => {
          try { await api.adminUserAiReset(Number(b.dataset.userAiReset)); toast('AI 权限已恢复'); await loadUsers(query); } catch (e) { toast(e.message, 'error'); }
        }));
        host.querySelectorAll('[data-user-credits]').forEach((b) => b.addEventListener('click', async () => {
          const raw = window.prompt('设置可用 AI 次数（0–100）：', b.dataset.credits);
          if (raw === null) return;
          try { await api.adminUpdateUser({ userId: Number(b.dataset.userCredits), ai_credits: Number(raw) }); toast('次数已更新'); await loadUsers(query); } catch (e) { toast(e.message, 'error'); }
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
    const loadConversations = async (q = '') => {
      const host = content.querySelector('[data-conv-list]');
      if (!host) return;
      try {
        const data = await api.adminAiConversations({ q, page: 1 });
        host.innerHTML = `<div class="muted" style="font-size:10px;margin-bottom:6px">共 ${data.total} 条 · 仅显示最近 30 条</div>${(data.items || []).map((row) => `<div class="settings-row" style="align-items:flex-start"><div style="min-width:0"><div class="settings-name">${escapeHtml(row.mode)} · ${escapeHtml(row.source)} · ${row.user_id || '—'} · ${escapeHtml(row.created_at)}</div><div class="settings-sub" style="white-space:pre-wrap">问：${escapeHtml(row.question)}</div><details style="margin-top:3px"><summary class="muted" style="font-size:10px;cursor:pointer">查看回答</summary><div class="settings-sub" style="white-space:pre-wrap">${escapeHtml(row.answer)}</div></details></div></div>`).join('') || '<div class="muted" style="font-size:11px">暂无记录</div>'}`;
      } catch (err) { host.innerHTML = `<div class="callout danger">${escapeHtml(err.message)}</div>`; }
    };
    const bindConversations = () => {
      content.querySelector('[data-conv-search]')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        await loadConversations((event.currentTarget.querySelector('[name="q"]')?.value || '').trim());
      });
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
        const currencyInput = content.querySelector('[data-cost-currency]');
        if (currencyInput) currencyInput.value = currency;
        const maxTokensInput = content.querySelector('[data-cost-maxtokens]');
        if (maxTokensInput) maxTokensInput.value = String(data.settings.maxTokens || 1200);
        const costSaveButton = content.querySelector('[data-cost-save]');
        if (costSaveButton) costSaveButton.onclick = async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          try {
            await api.adminAiSaveCost({
              currency: String(content.querySelector('[data-cost-currency]')?.value || '¥').trim() || '¥',
              maxTokens: Number(content.querySelector('[data-cost-maxtokens]')?.value || 1200),
            });
            toast('计费显示已保存', 'success');
            await loadCost();
          } catch (error) {
            toast(error.message || '保存失败', 'error');
          } finally {
            button.disabled = false;
          }
        };
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
      const discountState = {};
      const dayLabels = [['1', '一'], ['2', '二'], ['3', '三'], ['4', '四'], ['5', '五'], ['6', '六'], ['7', '日']];
      const deepseekRules = () => [
        { label: '工作日 00:00–09:00', days: [1, 2, 3, 4, 5], from: '00:00', to: '09:00', ratio: 0.5 },
        { label: '工作日 12:00–14:00', days: [1, 2, 3, 4, 5], from: '12:00', to: '14:00', ratio: 0.5 },
        { label: '工作日 18:00–23:59', days: [1, 2, 3, 4, 5], from: '18:00', to: '23:59', ratio: 0.5 },
        { label: '周末全天', days: [6, 7], from: '00:00', to: '23:59', ratio: 0.5 },
      ];
      const daySet = (days) => {
        const values = days instanceof Set ? [...days] : (Array.isArray(days) ? days : []);
        return new Set((values.length ? values : [1, 2, 3, 4, 5, 6, 7]).map(Number));
      };
      const dayText = (days) => {
        const set = daySet(days);
        if (set.size === 7) return '每天';
        if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return '工作日';
        if (set.size === 2 && set.has(6) && set.has(7)) return '周末';
        return [...set].sort().map((d) => `周${dayLabels[d - 1][1]}`).join('、');
      };
      const discountSummary = (windows) => {
        if (!Array.isArray(windows) || windows.length === 0) return '无折扣（原价）';
        return windows.map((w) => `${w.label || '规则'}（${dayText(w.days)} ${w.from}–${w.to} ×${Number(w.ratio)}）`).join('；');
      };
      const readRateValues = () => {
        const values = {};
        form?.querySelectorAll('[data-provider-pricing] tr').forEach((row) => {
          const model = String(row.querySelector('[data-price-model]')?.value || '').trim();
          if (!model) return;
          values[model] = {
            input: Number(row.querySelector('[data-price-input]')?.value || 0),
            output: Number(row.querySelector('[data-price-output]')?.value || 0),
            windows: discountState[model] || [],
          };
        });
        return values;
      };
      const openDiscountEditor = (model) => {
        const windows = (discountState[model] || []).map((w) => ({ ...w, days: daySet(w.days) }));
        const modal = openModal({
          className: 'modal-wide discount-modal',
          title: `折扣规则 · ${model}`,
          sub: '按服务器本地时间匹配；每条规则只在其选择的星期生效。跨午夜可设 22:00–08:00。',
          content: `<div class="discount-editor" data-discount-editor></div>`,
        });
        const host = modal.el.querySelector('[data-discount-editor]');
        const render = () => {
          host.innerHTML = `<div class="discount-rules">${windows.map((w, index) => `<div class="discount-rule" data-disc-index="${index}">
            <label class="field discount-label"><span>名称</span><input class="input" data-disc-label value="${escapeHtml(w.label || '')}" placeholder="例如 工作日夜间"></label>
            <div class="discount-days">${dayLabels.map(([value, label]) => `<label><input type="checkbox" data-disc-day value="${value}" ${w.days.has(Number(value)) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
            <label class="field"><span>开始</span><input class="input" data-disc-from value="${escapeHtml(w.from || '')}" placeholder="00:00" style="width:78px"></label>
            <label class="field"><span>结束</span><input class="input" data-disc-to value="${escapeHtml(w.to || '')}" placeholder="08:00" style="width:78px"></label>
            <label class="field"><span>比例</span><input class="input" type="number" min="0" max="1" step="0.05" data-disc-ratio value="${Number(w.ratio ?? 1)}" style="width:70px"></label>
            <button class="btn btn-xs btn-ghost" type="button" data-disc-remove="${index}">删除</button>
          </div>`).join('') || '<div class="muted" style="font-size:11px">还没有折扣规则；当前按原价计费。</div>'}</div>
          <div class="row-wrap" style="margin-top:10px"><button class="btn btn-secondary btn-sm" type="button" data-disc-add>添加规则</button><button class="btn btn-ghost btn-sm" type="button" data-disc-preset>套用 DeepSeek 规则</button></div>
          <div class="admin-settings-actions" style="margin-top:12px"><button class="btn btn-primary btn-sm" type="button" data-disc-save>保存规则</button><span class="muted">未选择星期时按每天生效；比例 1 = 原价，0.5 = 五折。</span></div>`;
          host.querySelectorAll('[data-disc-index]').forEach((row) => {
            const index = Number(row.dataset.discIndex);
            row.querySelectorAll('[data-disc-day]').forEach((input) => input.addEventListener('change', () => {
              const set = new Set(windows[index].days);
              if (input.checked) set.add(Number(input.value)); else set.delete(Number(input.value));
              windows[index].days = set;
            }));
            row.querySelector('[data-disc-label]')?.addEventListener('input', (event) => { windows[index].label = event.currentTarget.value; });
            row.querySelector('[data-disc-from]')?.addEventListener('input', (event) => { windows[index].from = event.currentTarget.value; });
            row.querySelector('[data-disc-to]')?.addEventListener('input', (event) => { windows[index].to = event.currentTarget.value; });
            row.querySelector('[data-disc-ratio]')?.addEventListener('input', (event) => { windows[index].ratio = Number(event.currentTarget.value || 1); });
            row.querySelector('[data-disc-remove]')?.addEventListener('click', () => { windows.splice(index, 1); render(); });
          });
          host.querySelector('[data-disc-add]')?.addEventListener('click', () => { windows.push({ label: '', days: daySet([1,2,3,4,5,6,7]), from: '', to: '', ratio: 1 }); render(); });
          host.querySelector('[data-disc-preset]')?.addEventListener('click', () => { windows.splice(0, windows.length, ...deepseekRules().map((w) => ({ ...w, days: daySet(w.days) }))); render(); });
          host.querySelector('[data-disc-save]')?.addEventListener('click', () => {
            discountState[model] = windows.map((w) => ({
              label: String(w.label || '').trim() || '规则',
              days: [...w.days].sort((a, b) => a - b),
              from: String(w.from || '').trim(),
              to: String(w.to || '').trim(),
              ratio: Math.max(0, Math.min(1, Number(w.ratio ?? 1))),
            })).filter((w) => w.from && w.to && /^\d{1,2}:\d{2}$/.test(w.from) && /^\d{1,2}:\d{2}$/.test(w.to));
            form?.querySelectorAll('[data-provider-pricing] tr').forEach((row) => {
              if (String(row.querySelector('[data-price-model]')?.value || '') !== model) return;
              const summary = row.querySelector('[data-discount-summary]');
              if (summary) summary.textContent = discountSummary(discountState[model]);
            });
            modal.close();
            toast('折扣规则已更新，记得保存供应商', 'success');
          });
        };
        render();
      };
      fillPricing = (pricing = {}) => {
        if (!form) return;
        const body = form.querySelector('[data-provider-pricing]');
        if (!body) return;
        const previous = readRateValues();
        Object.keys(discountState).forEach((model) => { delete discountState[model]; });
        const models = String(form.querySelector('[name="models"]')?.value || '').split(',').map((item) => item.trim()).filter(Boolean);
        body.innerHTML = models.map((model) => {
          const rate = pricing[model] || previous[model] || {};
          const rawWindows = Array.isArray(rate.windows) ? rate.windows : (Array.isArray(rate.discounts) ? rate.discounts : (rate.discount ? [rate.discount] : []));
          discountState[model] = rawWindows.map((w) => ({
            label: w.label || '规则',
            days: daySet(w.days).size ? daySet(w.days) : daySet([1, 2, 3, 4, 5, 6, 7]),
            from: w.from || '',
            to: w.to || '',
            ratio: Number(w.ratio ?? 1),
          }));
          return `<tr data-price-row="${escapeHtml(model)}">
            <td><input class="input" data-price-model value="${escapeHtml(model)}" readonly></td>
            <td><input class="input" type="number" min="0" step="0.0001" data-price-input value="${Number(rate.input ?? 0)}"></td>
            <td><input class="input" type="number" min="0" step="0.0001" data-price-output value="${Number(rate.output ?? 0)}"></td>
            <td><div class="discount-summary" data-discount-summary>${escapeHtml(discountSummary(discountState[model]))}</div></td>
            <td><button class="btn btn-xs btn-secondary" type="button" data-edit-discount="${escapeHtml(model)}">编辑规则</button></td>
          </tr>`;
        }).join('') || '<tr><td colspan="5" class="muted">先填写模型列表</td></tr>';
        body.querySelectorAll('[data-edit-discount]').forEach((button) => button.addEventListener('click', () => openDiscountEditor(button.dataset.editDiscount)));
      };
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const f = event.currentTarget;
        const val = (name) => (f.querySelector(`[name="${name}"]`)?.value || '').trim();
        const model_pricing = {};
        f.querySelectorAll('[data-provider-pricing] tr').forEach((row) => {
          const model = String(row.querySelector('[data-price-model]')?.value || '').trim();
          if (!model) return;
          const windows = (discountState[model] || []).filter((w) => w.from && w.to && /^\d{1,2}:\d{2}$/.test(w.from) && /^\d{1,2}:\d{2}$/.test(w.to));
          model_pricing[model] = {
            input: Number(row.querySelector('[data-price-input]')?.value || 0),
            output: Number(row.querySelector('[data-price-output]')?.value || 0),
            discounts: windows.map((w) => ({
              label: w.label || '规则',
              days: w.days.length ? w.days : [1, 2, 3, 4, 5, 6, 7],
              from: w.from,
              to: w.to,
              ratio: Math.max(0, Math.min(1, Number(w.ratio ?? 1))),
            })),
          };
        });
        const provider = { id: val('id'), name: val('name'), base_url: val('base_url'), api_key: f.querySelector('[name="api_key"]')?.value || '', models: val('models'), default_model: val('default_model'), model_pricing, enabled: Boolean(f.querySelector('[name="enabled"]')?.checked) };
        try { await api.adminProviderSave(provider); toast('供应商已保存'); await reloadSession(); } catch (err) { toast(err.message || '保存失败', 'error'); }
      });
      form?.querySelector('[data-provider-discount-preset]')?.addEventListener('click', () => {
        form.querySelectorAll('[data-provider-pricing] tr').forEach((row) => {
          const model = String(row.querySelector('[data-price-model]')?.value || '').trim();
          if (!model) return;
          discountState[model] = deepseekRules().map((w) => ({ ...w, days: daySet(w.days) }));
          const summary = row.querySelector('[data-discount-summary]');
          if (summary) summary.textContent = discountSummary(discountState[model]);
        });
        toast('已套用 DeepSeek 规则：工作日高峰外 + 周末全天五折', 'info');
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
    if (el.querySelector('[data-provider-form]')) { bindProviderForm(); fillPricing({}); }
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
    <p class="muted" style="font-size:10.5px;margin-top:6px">模型价格与折扣在「AI 供应商」中按供应商/模型配置，成本中心只负责统计。</p>
  </section>
  <section class="card card-pad" style="margin-bottom:12px">
    <h3 style="margin:0 0 6px;font-size:16px">30 天花费</h3>
    <div class="traffic-bars" data-cost-bars><div class="muted">加载中…</div></div>
  </section>
  <section class="card card-pad" style="margin-bottom:12px"><h3 style="margin:0 0 8px;font-size:16px">模型花费</h3><div data-cost-models></div></section>
  <section class="card card-pad" style="margin-bottom:12px"><h3 style="margin:0 0 8px;font-size:16px">最近调用</h3><div data-cost-recent></div></section>
  <section class="card card-pad">
    <div class="section-head"><h3 style="margin:0;font-size:16px">计费显示</h3><button class="btn btn-sm btn-secondary" type="button" data-goto-tab="ai">去 AI 供应商设置价格与折扣 →</button></div>
    <div class="admin-settings-grid" style="align-items:end;margin-top:8px">
      <label class="field" style="margin:0"><span class="label">币种符号</span><input class="input" data-cost-currency style="width:90px" value="¥"></label>
      <label class="field" style="margin:0"><span class="label">最大输出 tokens</span><input class="input" type="number" min="128" max="4000" data-cost-maxtokens style="width:140px" value="1200"></label>
      <button class="btn btn-primary btn-sm" type="button" data-cost-save>保存计费显示</button>
    </div>
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
