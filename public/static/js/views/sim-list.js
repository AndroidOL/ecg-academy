const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261112a13';
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { navigate } = await import(`../router.js${__asset}`);
const { icon, escapeHtml, setButtonLoading, toast, difficultyDots, medicalDisclaimer } = await import(`../ui.js${__asset}`);
const { getLocale, translate } = await import(`../i18n.js${__asset}`);

function patientLine(patient = {}) {
  const age = String(patient.age || '');
  const sex = getLocale() === 'en'
    ? (patient.sex === '男' ? 'M' : patient.sex === '女' ? 'F' : (patient.sex || ''))
    : (patient.sex || '');
  const prefix = getLocale() === 'en' ? `${age} y · ${sex}` : `${age} 岁 · ${sex}`;
  return `${escapeHtml(prefix)} · <span>${escapeHtml(translate(patient.complaint || ''))}</span>`;
}

export async function simListView() {
  const el = document.createElement('div');
  el.className = 'page';
  const scenarios = await store.getScenarios(true);
  el.innerHTML = `
    <header class="page-head">
      <div>
        <div class="page-eyebrow">${icon('zap', 14)} ACLS SIMULATION</div>
        <h1 class="page-title">急救推演</h1>
        <p class="page-sub">在实时监护中做决定：先高质量 CPR，再识别可除颤心律；判断是否需要电治疗并选择正确模式。药物、能量与按压中断都会被记录并复盘。</p>
      </div>
      <span class="badge badge-brand">${icon('timer', 11)} 1 秒 = 1 秒</span>
    </header>
    <section class="duo-entry">
      <div class="duo-entry-copy">
        <div class="page-eyebrow">${icon('users', 14)} DUAL RANDOM MODE</div>
        <h2>双人随机急救</h2>
        <p>两名危重症患者同时送达，一左一右。只给查体数据与心电图：<b>第一名患者 15 秒、第二名额外 15 秒</b> 完成诊断并开始处理；同一时间只能处置一名患者，CPR 与充电除外。坚持到两名患者都恢复窦性心律。</p>
        <div class="row-wrap">
          <span class="badge badge-danger">${icon('timer', 11)} A 15s · B 30s 诊断窗口</span>
          <span class="badge">${icon('users', 11)} 2 名患者</span>
          <span class="badge">${icon('lock', 11)} 串行操作</span>
        </div>
      </div>
      <button class="btn btn-accent btn-lg" type="button" data-start-duo>${icon('play', 16)} 开始双人随机模式</button>
    </section>
    <div class="sim-intro" style="margin-bottom:16px">
      <div class="sim-intro-grid">
        <div><div class="page-eyebrow">HOW IT WORKS</div><h2 class="section-title" style="font-size:20px">真实时钟 · 服务端状态机 · 可复现评分</h2><p class="muted" style="font-size:12px;margin-top:4px">每次操作都会改变患者状态；按指南执行关键动作，复盘会指出按压中断、能量选择、电治疗模式与药物时序。</p></div>
        <div class="row-wrap"><span class="badge">CPR 100–120/min</span><span class="badge">可除颤心律 120–200 J</span><span class="badge">不稳定心律电治疗</span></div>
      </div>
      <div class="sim-rules"><span>${icon('stethoscope', 13)} 先判断有无脉搏</span><span>${icon('zap', 13)} 可除颤心律立即除颤</span><span>${icon('heart', 13)} 按压中断 &lt;10 秒</span><span>${icon('timer', 13)} 每 2 分钟评估</span></div>
    </div>
    <div class="scenario-grid">
      ${scenarios.map((scenario) => `<article class="scenario-card">
        <div class="scenario-top"><span class="badge badge-brand">${escapeHtml(scenario.algorithm || 'ACLS')}</span>${difficultyDots(scenario.difficulty)}</div>
        <h2 class="scenario-name">${escapeHtml(scenario.name)}</h2>
        <p class="scenario-sub">${escapeHtml(scenario.subtitle)}</p>
        <div class="scenario-patient">${patientLine(scenario.patient)}</div>
        ${scenario.pearls?.[0] ? `<p class="scenario-pearl">${icon('sparkles', 11)} ${escapeHtml(scenario.pearls[0])}</p>` : ''}
        <div class="scenario-foot"><span class="muted" style="font-size:10px">${(scenario.guideline || []).length} 条关键提示</span><button class="btn btn-primary btn-sm" type="button" data-start-scenario="${escapeHtml(scenario.id)}">${icon('play', 13)} 开始推演</button></div>
      </article>`).join('')}
    </div>
    ${medicalDisclaimer()}
    <footer class="page-footer">模拟场景为教学虚构病例；操作与评分基于 ACLS 教学流程，不替代真实临床决策。</footer>`;

  el.querySelector('[data-start-duo]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    setButtonLoading(button, true, '两名患者送入');
    try {
      const state = await api.simDuoStart();
      navigate(`/sim/duo/${state.sessionId}`);
    } catch (error) {
      toast(error.message || '无法开始双人随机模式', 'error');
      setButtonLoading(button, false);
    }
  });

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
