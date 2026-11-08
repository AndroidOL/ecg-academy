const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108av';
const { store } = await import(`../store.js${__asset}`);
const { CORRECTIONS } = await import(`../data/corrections.js${__asset}`);
const { icon, escapeHtml } = await import(`../ui.js${__asset}`);

function parseCorrections() {
  return CORRECTIONS;
}

export async function aboutView() {
  const el = document.createElement('div');
  el.className = 'page about-page';
  const site = store.site || {};
  const items = parseCorrections();
  el.innerHTML = `
    <header class="page-head">
      <div><div class="page-eyebrow">${icon('heart', 14)} ABOUT & CORRECTIONS</div><h1 class="page-title">关于心迹 · 勘误与参与</h1><p class="page-sub">一个面向医学生的免费、开源心电图学习基础设施。我们区分“编辑核对”和“临床同行审阅”，不把未审阅内容包装成临床指南。</p></div>
      <a class="btn btn-secondary btn-sm" href="${escapeHtml(site.githubUrl || 'https://github.com/AndroidOL/ecg-academy')}" target="_blank" rel="noopener noreferrer">${icon('github', 14)} GitHub</a>
    </header>
    <div class="about-grid">
      <section class="card card-pad">
        <h2 class="section-title">我们做什么</h2>
        <p class="muted about-copy">心迹把心电图拆成可以反复练习的四个层次：电生理与向量、诊断图谱与判读路径、确定性题库、ACLS 动态推演。课程、题库、代码和向量模型全部开源，教学图形明确标注为示意，不替代患者实际情况。</p>
        <div class="about-tags"><span class="badge badge-brand">MIT 代码</span><span class="badge">CC BY-SA 4.0 教学内容</span><span class="badge">本地优先</span><span class="badge">无广告</span><span class="badge">游客可用</span></div>
        <h2 class="section-title" style="margin-top:18px">审阅工作流</h2>
        <ol class="about-list">
          <li><b>编辑核对：</b>统一术语、单位、能量范围、适用场景和鉴别项；给出可追溯来源。</li>
          <li><b>临床同行审阅：</b>由急诊/心内科/儿科等顾问逐章核对；目前仍在招募，未完成的章节明确标注“待审阅”。</li>
          <li><b>版本化勘误：</b>每次修订记录版本、日期、问题与改动；公开 GitHub Issue 与本页。</li>
        </ol>
        <div class="callout" style="margin-top:10px">${icon('alert', 13)} 本项目不提供个体化诊疗指令；药物剂量、电击能量与临床决策必须结合当地指南、设备和患者情况。</div>
      </section>
      <aside class="card card-pad">
        <h2 class="section-title">参与方式</h2>
        <div class="about-actions">
          <a class="quick-action" href="${escapeHtml((site.githubUrl || 'https://github.com/AndroidOL/ecg-academy').replace(/\/$/, ''))}/issues" target="_blank" rel="noopener noreferrer">${icon('alert', 15)} 报告错误 / 提交勘误</a>
          <a class="quick-action" href="${escapeHtml((site.githubUrl || 'https://github.com/AndroidOL/ecg-academy').replace(/\/$/, ''))}/blob/main/docs/CONTRIBUTOR_AGREEMENT.md" target="_blank" rel="noopener noreferrer">${icon('bookOpen', 15)} 贡献者协议</a>
          <a class="quick-action" href="${escapeHtml((site.githubUrl || 'https://github.com/AndroidOL/ecg-academy').replace(/\/$/, ''))}/blob/main/docs/MEDICAL_ADVISORS.md" target="_blank" rel="noopener noreferrer">${icon('stethoscope', 15)} 医学顾问名单</a>
          <a class="quick-action" href="#/glossary">${icon('compass', 15)} 双语术语表</a>
          <a class="quick-action" href="#/guidelines">${icon('compass', 15)} 区域指南差异</a>
          <a class="quick-action" href="${escapeHtml((site.githubUrl || 'https://github.com/AndroidOL/ecg-academy').replace(/\/$/, ''))}/blob/main/docs/A11Y.md" target="_blank" rel="noopener noreferrer">${icon('users', 15)} 无障碍说明</a>
        </div>
        <h2 class="section-title" style="margin-top:18px">医学顾问</h2>
        <p class="muted about-copy">当前为编辑整理版本，尚无已签约的临床顾问。我们公开列出缺口，欢迎心内科、急诊科、儿科与重症医学同行参与审阅；审阅者、日期和版本会写入章节元数据。</p>
      </aside>
    </div>
    <section class="card card-pad" style="margin-top:14px">
      <div class="section-head"><h2 class="section-title">版本化勘误</h2><span class="section-kicker">最近 ${items.length} 条</span></div>
      <div class="correction-list">${items.map((item) => `<article class="correction-item"><div class="correction-version"><b>v${escapeHtml(item.version)}</b><span>${escapeHtml(item.date)}</span></div><div><h3>${escapeHtml(item.title)}</h3><ul>${(item.items || []).map((text) => `<li>${escapeHtml(text)}</li>`).join('')}</ul></div></article>`).join('')}</div>
    </section>`;
  return { el };
}
