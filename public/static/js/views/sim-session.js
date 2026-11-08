const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108bi';
const { api } = await import(`../api.js${__asset}`);
const { byokPayload, hasByok } = await import(`../byok.js${__asset}`);
const { navigate } = await import(`../router.js${__asset}`);
const { mountECG } = await import(`../ecg-renderer.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { icon, escapeHtml, toast, fmtDuration, confirmDialog, medicalDisclaimer, setButtonLoading } = await import(`../ui.js${__asset}`);

const RHYTHM_LABELS = {
  vf: '心室颤动', pvt: '无脉性室速', svt: '室上性心动过速', af_fast: '快速心房颤动',
  brady: '严重心动过缓', paced: '起搏心律', asystole: '心搏停止', pea: '无脉电活动（PEA）', rosc: '自主循环恢复', post_shock: '电击后短暂心室静止',
};

function outcomeText(outcome) {
  return {
    rosc: '恢复自主循环（ROSC）', stable: '血流动力学稳定', timeout: '超时未稳定', aborted: '提前结束', failed: '复苏失败',
  }[outcome] || outcome || '';
}

export async function simSessionView({ params }) {
  const el = document.createElement('div');
  el.className = 'page';
  el.innerHTML = `<div class="loading-panel"><span class="spinner"></span><span>正在连接监护仪…</span></div>`;
  const sessionId = params.sessionId;
  let state = null;
  let viewer = null;
  let pollTimer = 0;
  let busy = false;
  let destroyed = false;
  let monitorSig = '';
  let lastActionsSig = '';
  let shockEnergy = 200;
  let shockSync = false;
  let shockSyncTouched = false;

  const clearPoll = () => {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = 0;
  };
  const destroyViewer = () => {
    if (viewer) {
      viewer.destroy();
      viewer = null;
    }
  };

  async function loadState(initial = false) {
    try {
      state = await api.simState(sessionId);
      if (destroyed) return;
      if (initial) {
        renderShell();
      } else {
        updateDynamic();
      }
      if (state.status === 'ended') {
        clearPoll();
        updateDynamic();
        await new Promise((resolve) => setTimeout(resolve, 700));
        if (state.runId) await showDebrief();
      }
    } catch (error) {
      if (initial) {
        el.innerHTML = `<div class="page"><div class="error-panel">${escapeHtml(error.message || '无法读取模拟状态')}</div><a class="btn btn-secondary" href="#/sim" style="margin-top:12px">返回场景列表</a></div>`;
      } else {
        toast(error.message || '状态更新失败', 'error');
      }
    }
  }

  function scenarioMeta() {
    return state?.scenario || {};
  }

  function renderShell() {
    const scenario = scenarioMeta();
    const monitor = state.monitor || {};
    const defaultShock = state.actions?.flatMap((g) => g.actions || []).find((a) => a.id === 'shock');
    if (defaultShock && !shockSyncTouched) shockSync = Boolean(defaultShock.sync);
    el.innerHTML = `
      <div class="sim-session-head">
        <div><div class="page-eyebrow">${icon('zap', 14)} LIVE SIMULATION · ${escapeHtml(state.status === 'active' ? '进行中' : '已结束')}</div><h1 class="sim-session-title">${escapeHtml(scenario.name || '急救推演')}</h1><p class="sim-session-sub">${escapeHtml(scenario.subtitle || '')} · 患者 ${escapeHtml(String(scenario.patient?.age || ''))} 岁 ${escapeHtml(scenario.patient?.sex || '')}</p></div>
        <button class="btn btn-ghost btn-sm sim-exit" type="button" data-exit>${icon('x', 14)} 退出</button>
      </div>
      <div class="sim-layout">
        <div class="stack-lg">
          <section class="monitor-panel">
            <div class="monitor-head">
              <div class="monitor-title"><span class="monitor-live"></span> ECG · 连续滚动 · ${escapeHtml(monitor.description || '实时监护')}</div>
              <div class="monitor-timer" data-timer>00:00</div>
            </div>
            <div class="monitor-ecg ecg-dark-paper" id="monitor-ecg"></div>
            <div class="monitor-body">
              <div class="row-wrap" style="justify-content:space-between"><span class="badge badge-danger">${escapeHtml(RHYTHM_LABELS[state.rhythm] || state.rhythm)}</span><span class="badge" data-phase>${escapeHtml(state.phaseLabel || '就诊评估')}</span><span class="badge" data-pulse>${state.vitals?.pulse ? '有脉' : '无脉'}</span></div>
              <div class="vitals-grid" data-vitals></div>
              <div class="monitor-quick" data-quick-iv></div>
              <div class="monitor-foot"><span class="cpr-flag ${state.cpr ? '' : 'off'}">${icon('activity', 11)} <span data-cpr-label>${state.cpr ? '按压中' : '未按压'}</span></span><span>ETCO₂ <b data-etco2>${state.vitals?.etco2 ?? '—'}</b> mmHg</span><span>目标：${escapeHtml(scenario.success || '稳定患者')}</span></div>
            </div>
          </section>
          <div class="hint-card" data-hint>${icon('sparkles', 15)}<span>${escapeHtml(state.hint || '观察监护与生命体征，做出下一步决定。')}</span></div>
          <div class="card card-pad">
            <div class="section-head" style="margin-bottom:8px"><h2 class="section-title" style="font-size:16px">事件记录</h2><span class="badge">实时</span></div>
            <div class="event-log" data-events></div>
          </div>
        </div>
        <aside class="sim-side">
          <div class="cpr-dock" data-cpr-dock hidden></div>
          <div class="action-panel" data-actions></div>
          <div class="card card-pad" style="font-size:11px">
            <div class="row" style="gap:6px;margin-bottom:5px">${icon('info', 14)}<b>场景提示</b></div>
            <div class="muted" style="line-height:1.7">${(scenario.guideline || []).slice(0, 3).map((g) => `· ${escapeHtml(g)}`).join('<br>')}</div>
          </div>
        </aside>
      </div>`;
    bindShell();
    updateDynamic(true);
    mountMonitor();
    renderActions();
    clearPoll();
    if (state.status === 'active') {
      pollTimer = window.setInterval(() => {
        if (!busy && !destroyed) loadState(false);
      }, 1000);
    }
  }

  function bindShell() {
    el.addEventListener('click', (event) => {
      const quick = event.target.closest('[data-quick-iv-action]');
      if (quick && !quick.disabled) act('iv', {});
      const vent = event.target.closest('[data-quick-vent-action]');
      if (vent && !vent.disabled) act('oxygen', {});
    });
    el.querySelector('[data-exit]')?.addEventListener('click', async () => {
      if (state?.status === 'active') {
        const ok = await confirmDialog({ title: '退出模拟？', message: '当前模拟会保留在服务端，但不会自动生成完整复盘。建议完成或结束本局再离开。', confirmText: '保留并退出', danger: true });
        if (!ok) return;
      }
      navigate('/sim');
    });
  }

  function updateDynamic(initial = false) {
    if (!state) return;
    const scenario = scenarioMeta();
    const timer = el.querySelector('[data-timer]');
    if (timer) timer.textContent = fmtDuration(state.elapsed);
    const vitalsHost = el.querySelector('[data-vitals]');
    if (vitalsHost) {
      const v = state.vitals || {};
      const hr = v.hr ? String(v.hr) : '—';
      const bp = v.bpSys ? `${v.bpSys}/${v.bpDia}` : '—';
      const spo2 = v.spo2 ? `${v.spo2}%` : '—';
      const etco2 = v.etco2 ?? '—';
      const hrTone = v.hr && v.hr < 50 ? 'danger' : v.hr > 130 ? 'warn' : '';
      vitalsHost.innerHTML = `
        <div class="vital ${hrTone}" data-vital-hr><div class="vital-label">${escapeHtml(v.hrLabel || 'HR')}</div><div class="vital-value">${escapeHtml(hr)} <small>bpm</small></div></div>
        <div class="vital ${v.bpSys && v.bpSys < 90 ? 'danger' : ''}"><div class="vital-label">NIBP</div><div class="vital-value">${escapeHtml(bp)} <small>mmHg</small></div></div>
        <div class="vital ${v.spo2 && v.spo2 < 90 ? 'warn' : ''}"><div class="vital-label">SpO₂</div><div class="vital-value">${escapeHtml(spo2)}</div></div>
        <div class="vital"><div class="vital-label">ETCO₂</div><div class="vital-value">${escapeHtml(String(etco2))} <small>mmHg</small></div></div>`;
    }
    const quickIv = el.querySelector('[data-quick-iv]');
    if (quickIv) {
      const flags = state.flags || {};
      if (flags.iv) quickIv.innerHTML = `<span class="quick-iv ready">${icon('check', 12)} IV/IO 已建立</span>`;
      else if (flags.ivPending) quickIv.innerHTML = `<span class="quick-iv pending">${icon('activity', 12)} IV/IO 建立中 · ${flags.ivReadyIn ?? 0}s</span>`;
      else quickIv.innerHTML = `<button class="quick-iv-btn" type="button" data-quick-iv-action ${state.status !== 'active' ? 'disabled' : ''}>${icon('plus', 12)} 立即建立 IV/IO 通路</button>`;
      if (state.status === 'active') {
        quickIv.insertAdjacentHTML('beforeend', `<button class="quick-iv-btn" type="button" data-quick-vent-action>${icon('activity', 12)} 球囊通气${flags.ventilations ? ` · ${flags.ventilations} 次` : ''}</button>`);
      }
    }
    const phase = el.querySelector('[data-phase]');
    if (phase) {
      phase.textContent = state.phaseLabel || '就诊评估';
      phase.className = `badge ${['critical','arrest','peri-arrest','post-shock'].includes(state.phase) ? 'badge-danger' : ['decompensated','cpr','unstable'].includes(state.phase) ? 'badge-warn' : 'badge-ok'}`;
    }
    const pulse = el.querySelector('[data-pulse]');
    if (pulse) {
      pulse.textContent = state.vitals?.pulse ? '有脉' : '无脉';
      pulse.className = `badge ${state.vitals?.pulse ? 'badge-ok' : 'badge-danger'}`;
    }
    const cprLabel = el.querySelector('[data-cpr-label]');
    if (cprLabel) cprLabel.textContent = state.cpr ? '按压中' : '未按压';
    el.querySelector('.cpr-flag')?.classList.toggle('off', !state.cpr);
    renderCprDock();
    const etco2 = el.querySelector('[data-etco2]');
    if (etco2) etco2.textContent = String(state.vitals?.etco2 ?? '—');
    const hint = el.querySelector('[data-hint]');
    if (hint) hint.innerHTML = `${icon('sparkles', 15)}<span>${escapeHtml(state.hint || '观察监护与生命体征，做出下一步决定。')}</span>`;
    const events = el.querySelector('[data-events]');
    if (events) {
      events.innerHTML = (state.events || []).slice().reverse().map((event) => `<div class="event-item ${event.tone === 'good' ? 'good' : event.tone === 'bad' ? 'bad' : event.tone === 'warn' ? 'warn' : ''}"><span class="event-time">${fmtDuration(event.t)}</span><span>${escapeHtml(event.label)}</span></div>`).join('') || '<div class="muted" style="font-size:10px">等待操作…</div>';
    }
    const actionsSig = JSON.stringify({ status: state.status, cpr: state.cpr, m: state.metrics, flags: state.flags, rhythm: state.rhythm, hint: state.hint });
    if (!initial && actionsSig !== lastActionsSig) {
      renderActions();
    }
    const monitorSigNew = JSON.stringify({ rhythm: state.monitor?.rhythm, rate: state.monitor?.rate, qrs: state.monitor?.qrs, morphology: state.monitor?.morphology, p: state.monitor?.p, seed: state.monitor?.seed, vfAmplitude: state.monitor?.vfAmplitude, cprArtifact: state.monitor?.cprArtifact, description: state.monitor?.description });
    if (monitorSigNew !== monitorSig) {
      monitorSig = monitorSigNew;
      mountMonitor();
    }
    lastActionsSig = actionsSig;
    if (state.status === 'ended') {
      el.querySelectorAll('[data-actions] button').forEach((b) => { b.disabled = true; });
    }
  }

  function mountMonitor() {
    const host = el.querySelector('#monitor-ecg');
    if (!host || !state?.monitor) return;
    const sig = JSON.stringify(state.monitor);
    if (viewer && host.dataset.sig === sig) return;
    const spec = { ...state.monitor, duration: 4, annotations: [], seed: state.monitor.seed ?? 19 };
    if (viewer) {
      viewer.refreshSpec(spec);
      host.dataset.sig = sig;
      return;
    }
    host.innerHTML = '';
    host.dataset.sig = sig;
    viewer = mountECG(host, spec, {
      mode: 'rhythm', lead: spec.primaryLead || 'II', speed: 1, showAnnotations: false, autoPlay: true,
      playbackMode: 'scroll', loop: true, scrollWindow: 4,
    });
    if (!host.dataset.loopBound) {
      host.dataset.loopBound = '1';
      host.addEventListener('ecg:ended', () => {
        if (!destroyed && viewer && state?.status === 'active') viewer.play(1);
      });
    }
  }

  function renderCprDock() {
    const host = el.querySelector('[data-cpr-dock]');
    if (!host || !state) return;
    const hasCpr = state.actions?.some((group) => (group.actions || []).some((a) => a.id === 'cpr_start'));
    if (!hasCpr) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    host.classList.toggle('active', Boolean(state.cpr));
    const disabled = state.status !== 'active' ? 'disabled' : '';
    host.innerHTML = `<div class="cpr-dock-info"><span class="cpr-kicker"><i class="cpr-pulse"></i> HIGH-QUALITY CPR</span><strong>${state.cpr ? '按压进行中' : 'CPR 未开始'}</strong><span>${state.cpr ? '保持 100–120 次/分，深度 5–6 cm，完全回弹；除颤前先停止。' : '患者无脉？点击开始胸外按压；除颤前必须先停止。'}</span></div><button class="btn ${state.cpr ? 'btn-secondary' : 'btn-secondary'}" type="button" data-cpr-toggle ${disabled}>${state.cpr ? '停止 CPR' : '开始 CPR'}</button>`;
    host.querySelector('[data-cpr-toggle]')?.addEventListener('click', () => act(state.cpr ? 'cpr_stop' : 'cpr_start', {}));
  }

  function renderActions() {
    const host = el.querySelector('[data-actions]');
    if (!host || !state) return;
    const shockAction = state.actions?.flatMap((group) => group.actions || []).find((action) => action.id === 'shock');
    if (shockAction && !shockSyncTouched) shockSync = Boolean(shockAction.sync);
    const energies = state.rhythm === 'svt' ? [50, 100, 150, 200] : [120, 150, 200];
    if (!energies.includes(shockEnergy)) shockEnergy = energies[0];
    const flags = state.flags || {};
    const ivClass = flags.iv ? 'ready' : flags.ivPending ? 'pending' : 'off';
    const ivText = flags.iv ? 'IV/IO 已建立' : flags.ivPending ? `IV/IO 建立中 · ${flags.ivReadyIn ?? 0}s` : 'IV/IO 未建立';
    const ivStatus = `<div class="iv-status ${ivClass}"><span class="iv-dot"></span><span>${ivText}</span>${!flags.iv ? '<small>建立通路需要约 6 秒；完成前不能给静脉药</small>' : ''}</div>`;
    const groups = (state.actions || []).map((group) => {
      if (group.actions?.some((a) => a.id === 'shock')) {
        const chargeReady = Boolean(flags.chargeReady);
        const chargeProgress = Boolean(flags.chargeInProgress);
        const chargeLocked = chargeReady || chargeProgress;
        const blocked = Boolean(state.cpr) || Boolean(flags.postShock) || state.status !== 'active';
        const shockBlocked = blocked || !chargeReady;
        const reason = state.cpr
          ? '先停止按压，再放电'
          : flags.postShock
            ? '电击后观察期，约 2 秒'
            : chargeProgress
              ? `充电中 · 约 ${flags.chargeReadyIn ?? 0}s；需切换能量/同步模式请先解除充电`
              : chargeReady
                ? '已充电：能量/同步模式已锁定；确认无人接触后放电，或先解除充电再切换'
                : '先选择能量并充电';
        const chargeText = chargeReady ? `已充电 ${flags.chargeEnergy ?? shockEnergy} J` : chargeProgress ? `充电中 ${flags.chargeReadyIn ?? 0}s` : '充电';
        return `<div class="action-group"><div class="action-group-title">${escapeHtml(group.label)}</div>
          <div class="shock-controls">
            <div class="row"><span class="muted" style="font-size:10px">能量</span><select class="select" data-shock-energy ${chargeLocked || state.status !== 'active' ? 'disabled' : ''}>${energies.map((e) => `<option value="${e}" ${e === (flags.chargeEnergy ?? shockEnergy) ? 'selected' : ''}>${e} J</option>`).join('')}</select></div>
            <div class="row" style="justify-content:space-between"><span class="muted" style="font-size:10px">模式</span><div class="sync-switch"><button type="button" class="${(flags.chargeSync ?? shockSync) ? 'active' : ''}" data-sync="1" ${chargeLocked ? 'disabled' : ''}>同步</button><button type="button" class="${!(flags.chargeSync ?? shockSync) ? 'active danger' : ''}" data-sync="0" ${chargeLocked ? 'disabled' : ''}>非同步</button></div></div>
            <div class="charge-row">
              <button class="btn btn-secondary btn-sm" type="button" data-action="charge" ${chargeLocked || flags.postShock || state.status !== 'active' ? 'disabled' : ''}>${icon('bolt', 13)} ${chargeText}</button>
              <button class="btn btn-danger btn-sm" type="button" data-action="shock" ${shockBlocked ? 'disabled' : ''}>${icon('zap', 14)} 放电</button>
              ${chargeReady || chargeProgress ? `<button class="btn btn-ghost btn-sm" type="button" data-action="disarm">${icon('rotate', 13)} 解除充电</button>` : ''}
            </div>
            <div class="charge-meter ${chargeReady ? 'ready' : chargeProgress ? 'pending' : ''}"><span></span></div>
            <div class="hint" style="margin-top:4px">${reason}</div>
            <div class="hint" style="margin-top:2px;color:var(--faint)">真实除颤器充电后能量与同步模式通常锁定；改变设置需先解除充电/内部放电，再重新选择并充电。</div>
          </div>
        </div>`;
      }
      const actions = (group.actions || []).filter((action) => !['cpr_start', 'cpr_stop'].includes(action.id));
      if (actions.length === 0) return '';
      return `<div class="action-group"><div class="action-group-title">${escapeHtml(group.label)}</div><div class="action-grid">${actions.map((action) => {
        const needsIv = Boolean(action.requiresIv) && !flags.iv;
        const ivPending = Boolean(action.requiresIv) && Boolean(flags.ivPending);
        const ivActionPending = action.id === 'iv' && flags.ivPending;
        const ivDone = action.id === 'iv' && flags.iv;
        const disabled = state.status !== 'active' || needsIv || ivPending || ivActionPending || ivDone;
        const suffix = ivDone ? '已建立' : ivActionPending ? '建立中' : '';
        const reasonAttr = needsIv ? ' title="请先完成 IV/IO 通路"' : '';
        const toneClass = action.tone === 'primary' ? 'primary' : action.tone === 'danger' ? 'danger' : action.tone === 'warn' ? 'warn' : '';
        return `<button class="action-btn ${toneClass}" type="button" data-action="${escapeHtml(action.id)}" ${disabled ? 'disabled' : ''}${reasonAttr}>${escapeHtml(action.label)}${suffix ? ` · ${suffix}` : ''}</button>`;
      }).join('')}</div></div>`;
    }).join('');
    host.innerHTML = ivStatus + groups;
    renderCprDock();
    host.querySelectorAll('[data-sync]').forEach((button) => {
      button.addEventListener('click', () => {
        shockSync = button.dataset.sync === '1';
        shockSyncTouched = true;
        renderActions();
      });
    });
    host.querySelector('[data-shock-energy]')?.addEventListener('change', (event) => {
      shockEnergy = Number(event.target.value);
    });
    host.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.dataset.action;
        if (action === 'finish') {
          const ok = await confirmDialog({ title: '结束并复盘？', message: '将按当前时间线生成评分与复盘，之后不能继续操作。', confirmText: '结束并复盘' });
          if (!ok) return;
        }
        if (action === 'shock') {
          const ok = await confirmDialog({ title: '确认放电？', message: '确认所有人员已离开患者与病床，无人接触患者、导线或床沿；氧气源远离。', confirmText: '确认放电', danger: true });
          if (!ok) return;
        }
        await act(action, (action === 'shock' || action === 'charge') ? { energy: shockEnergy, sync: shockSync } : {});
      });
    });
  }

  async function act(action, payload) {
    if (busy || !state || state.status !== 'active') return;
    busy = true;
    try {
      state = await api.simAction(sessionId, action, payload);
      lastActionsSig = '';
      if (action === 'shock') {
        const panel = el.querySelector('.monitor-panel');
        panel?.classList.add('shock-flash');
        window.setTimeout(() => panel?.classList.remove('shock-flash'), 650);
      }
      if (state.status === 'ended') {
        clearPoll();
        updateDynamic();
        await new Promise((resolve) => setTimeout(resolve, 700));
        if (state.runId) await showDebrief();
      } else {
        updateDynamic();
        renderActions();
      }
    } catch (error) {
      toast(error.message || '操作失败', 'error');
    } finally {
      busy = false;
    }
  }

  async function showDebrief() {
    clearPoll();
    destroyViewer();
    let debrief = null;
    try {
      debrief = await api.simDebrief(state.runId);
    } catch (error) {
      toast(error.message || '复盘读取失败', 'error');
    }
    const review = debrief?.review || [];
    const events = debrief?.events || state.events || [];
    el.innerHTML = `
      <div class="sim-session-head">
        <div><div class="page-eyebrow">${icon('trophy', 14)} DEBRIEF</div><h1 class="sim-session-title">${escapeHtml(scenarioMeta().name || '急救复盘')}</h1><p class="sim-session-sub">${escapeHtml(outcomeText(debrief?.run?.outcome || state.outcome))}</p></div>
        <a class="btn btn-ghost btn-sm" href="#/sim">${icon('x', 14)} 返回场景</a>
      </div>
      <div class="debrief-hero" style="margin-bottom:16px">
        <div class="row-wrap" style="justify-content:space-between;align-items:flex-start">
          <div><div class="page-eyebrow" style="color:var(--brand-ink)">YOUR SCORE</div><div class="debrief-score">${debrief?.run?.score ?? state.score ?? '—'}</div><div class="result-label" style="color:var(--brand-ink)">分 · ${escapeHtml(outcomeText(debrief?.run?.outcome || state.outcome))}</div></div>
          <span class="debrief-grade">GRADE ${escapeHtml(debrief?.run?.grade || state.grade || '—')}</span>
        </div>
      </div>
      <div class="practice-setup">
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title" style="font-size:18px">复盘要点</h2><span class="badge">${review.length} 条</span></div>
          ${review.map((item) => `<div class="review-item ${item.tone || ''}"><span class="review-dot"></span><div><b>${escapeHtml(item.title)}</b><div class="muted">${escapeHtml(item.detail)}</div></div></div>`).join('') || '<p class="muted">暂无复盘要点。</p>'}
          <div class="row-wrap" style="margin-top:16px">${(store.ai?.allowed !== false || (store.ai?.byokEnabled && hasByok())) ? `<button class="btn btn-secondary btn-sm" type="button" data-ai-review>${icon('sparkles', 14)} AI 复盘</button>` : ''}<a class="btn btn-primary btn-sm" href="#/sim">${icon('rotate', 14)} 再来一次</a></div>
          <div data-ai-review-panel></div>
        </section>
        <aside class="card card-pad">
          <h3 class="section-title" style="font-size:15px;margin-bottom:8px">操作时间线</h3>
          <div class="event-log" style="max-height:360px">${events.map((event) => `<div class="event-item ${event.tone === 'good' ? 'good' : event.tone === 'bad' ? 'bad' : event.tone === 'warn' ? 'warn' : ''}"><span class="event-time">${fmtDuration(event.t)}</span><span>${escapeHtml(event.label)}</span></div>`).join('')}</div>
          <div class="muted" style="font-size:10px;margin-top:10px">${escapeHtml(scenarioMeta().success || '')}</div>
        </aside>
      </div>
      ${medicalDisclaimer()}`;
    el.querySelector('[data-ai-review]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const panel = el.querySelector('[data-ai-review-panel]');
      setButtonLoading(button, true, 'AI 复盘中');
      try {
        const result = await api.aiSimReview(state.runId, byokPayload());
        panel.innerHTML = `<div class="explain-block"><h4>${result.source === 'ai' ? 'AI 复盘' : '本地复盘'}</h4><p data-ai-text></p></div>`;
        panel.querySelector('[data-ai-text]').textContent = result.text;
      } catch (error) {
        panel.innerHTML = `<div class="explain-block"><p style="color:var(--danger)">${escapeHtml(error.message || 'AI 复盘失败')}</p></div>`;
      } finally {
        setButtonLoading(button, false);
      }
    });
  }

  await loadState(true);
  return {
    el,
    destroy() {
      destroyed = true;
      clearPoll();
      destroyViewer();
    },
  };
}
