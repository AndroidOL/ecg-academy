const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108az';
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { navigate } = await import(`../router.js${__asset}`);
const { icon, escapeHtml, setButtonLoading, toast, difficultyDots, medicalDisclaimer } = await import(`../ui.js${__asset}`);

export async function simListView() {
  const el = document.createElement('div');
  el.className = 'page';
  const scenarios = await store.getScenarios(true);
  el.innerHTML = `
    <header class="page-head">
      <div>
        <div class="page-eyebrow">${icon('zap', 14)} ACLS SIMULATION</div>
        <h1 class="page-title">急救推演</h1>
        <p class="page-sub">在实时监护中做决定：先高质量 CPR，再识别可除颤心律；有脉不稳定用同步，无脉用非同步。药物、能量与按压中断都会被记录并复盘。</p>
      </div>
      <span class="badge badge-brand">${icon('timer', 11)} 1 秒 = 1 秒</span>
    </header>
    <div class="sim-intro" style="margin-bottom:16px">
      <div class="sim-intro-grid">
        <div><div class="page-eyebrow">HOW IT WORKS</div><h2 class="section-title" style="font-size:20px">真实时钟 · 服务端状态机 · 可复现评分</h2><p class="muted" style="font-size:12px;margin-top:4px">每次操作都会改变患者状态；按指南执行关键动作，复盘会指出按压中断、能量选择、同步模式与药物时序。</p></div>
        <div class="row-wrap"><span class="badge">CPR 100–120/min</span><span class="badge">VF/pVT 非同步 120–200J</span><span class="badge">有脉不稳定 同步复律</span></div>
      </div>
      <div class="sim-rules"><span>${icon('stethoscope', 13)} 先判断有无脉搏</span><span>${icon('zap', 13)} 可除颤心律立即除颤</span><span>${icon('heart', 13)} 按压中断 &lt;10 秒</span><span>${icon('timer', 13)} 每 2 分钟评估</span></div>
    </div>
    <div class="scenario-grid">
      ${scenarios.map((scenario) => `<article class="scenario-card">
        <div class="scenario-top"><span class="badge badge-brand">${escapeHtml(scenario.algorithm || 'ACLS')}</span>${difficultyDots(scenario.difficulty)}</div>
        <h2 class="scenario-name">${escapeHtml(scenario.name)}</h2>
        <p class="scenario-sub">${escapeHtml(scenario.subtitle)}</p>
        <div class="scenario-patient">${escapeHtml(String(scenario.patient?.age || ''))} 岁 · ${escapeHtml(scenario.patient?.sex || '')} · ${escapeHtml(scenario.patient?.complaint || '')}</div>
        <div class="scenario-foot"><span class="muted" style="font-size:10px">${(scenario.guideline || []).length} 条关键提示</span><button class="btn btn-primary btn-sm" type="button" data-start-scenario="${escapeHtml(scenario.id)}">${icon('play', 13)} 开始推演</button></div>
      </article>`).join('')}
    </div>
    ${medicalDisclaimer()}
    <footer class="page-footer">模拟场景为教学虚构病例；操作与评分基于 ACLS 教学流程，不替代真实临床决策。</footer>`;

  el.querySelectorAll('[data-start-scenario]').forEach((button) => {
    button.addEventListener('click', async () => {
      const scenarioId = button.dataset.startScenario;
      setButtonLoading(button, true, '准备监护');
      try {
        const state = await api.simStart(scenarioId);
        navigate(`/sim/${state.sessionId}`);
      } catch (error) {
        toast(error.message || '无法开始场景', 'error');
        setButtonLoading(button, false);
      }
    });
  });
  return { el };
}
