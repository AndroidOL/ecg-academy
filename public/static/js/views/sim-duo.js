const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261112a13';
const { api } = await import(`../api.js${__asset}`);
const { navigate } = await import(`../router.js${__asset}`);
const { mountECG } = await import(`../ecg-renderer.js${__asset}`);
const { icon, escapeHtml, toast, fmtDuration, confirmDialog, medicalDisclaimer, setButtonLoading } = await import(`../ui.js${__asset}`);
const { getLocale } = await import(`../i18n.js${__asset}`);

function demographics(caseData = {}) {
  const age = String(caseData.age || '—');
  const weight = String(caseData.weight || '—');
  if (getLocale() === 'en') {
    const sex = caseData.sex === '男' ? 'M' : caseData.sex === '女' ? 'F' : (caseData.sex || '—');
    return `${age} y · ${sex} · ${weight} kg`;
  }
  return `${age} 岁 · ${caseData.sex || '—'} · ${weight} kg`;
}

const OUTCOME_TEXT = {
  rosc: '两名患者均恢复窦性心律/自主循环',
  partial: '部分成功：一名患者恢复，另一名未恢复',
  failed: '抢救失败',
  aborted: '提前结束',
};

function outcomeText(outcome) {
  return OUTCOME_TEXT[outcome] || outcome || '';
}

function patientOutcomeText(outcome) {
  return {
    rosc: '恢复自主循环',
    stable: '恢复窦性心律',
    timeout: '抢救失败',
    aborted: '提前结束',
    failed: '抢救失败',
  }[outcome] || outcome || '抢救中';
}

export async function simDuoView({ params }) {
  const el = document.createElement('div');
  el.className = 'page duo-page';
  el.innerHTML = `<div class="loading-panel"><span class="spinner"></span><span>两名危重症患者正在送入…</span></div>`;

  const sessionId = params.sessionId;
  let state = null;
  let activePatient = 0;
  let pollTimer = 0;
  let busy = false;
  let destroyed = false;
  const viewers = [null, null];
  const monitorSigs = ['', ''];
  const actionsSigs = ['', ''];
  const cprSigs = ['', ''];
  const diagnosisBusy = [false, false];
  const shockEnergy = [120, 120];
  const shockPauses = [null, null];

  const clearPoll = () => {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = 0;
  };
  const destroyViewers = () => {
    viewers.forEach((viewer, index) => {
      if (viewer) viewer.destroy();
      viewers[index] = null;
    });
  };

  async function loadState(initial = false) {
    try {
      state = await api.simDuoState(sessionId);
      if (destroyed) return;
      if (initial) renderShell();
      else updateDynamic();
      if (state.status === 'ended') {
        clearPoll();
        updateDynamic();
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (state.runId) await showDebrief();
      }
    } catch (error) {
      if (initial) {
        el.innerHTML = `<div class="page"><div class="error-panel">${escapeHtml(error.message || '无法读取双人模拟状态')}</div><a class="btn btn-secondary" href="#/sim" style="margin-top:12px">返回急救模块</a></div>`;
      } else {
        toast(error.message || '状态更新失败', 'error');
      }
    }
  }

  function renderShell() {
    el.innerHTML = `
      <div class="duo-head">
        <div>
          <div class="page-eyebrow">${icon('users', 14)} DUAL RANDOM · ${state.status === 'active' ? '进行中' : '已结束'}</div>
          <h1 class="duo-title">双人随机急救</h1>
          <p class="duo-sub">两名危重症患者同时送达。只给查体数据与心电图：第一名患者 15 秒内完成诊断并开始处理，第二名额外 15 秒；同一时间只能处置一名患者，CPR 与充电除外。</p>
        </div>
        <div class="duo-head-meta">
          <div class="duo-window-chip" data-window>窗口 15s</div>
          <div class="duo-clock" data-elapsed>00:00</div>
          <button class="btn btn-ghost btn-sm" type="button" data-finish>${icon('check', 13)} 结束本局</button>
          <button class="btn btn-ghost btn-sm" type="button" data-exit>${icon('x', 13)} 退出</button>
        </div>
      </div>
      <div class="duo-lock" data-lock hidden></div>
      <div class="duo-mobile-tabs" data-duo-tabs>
        ${state.patients.map((patient, index) => `<button type="button" data-duo-tab="${index}" class="${index === activePatient ? 'active' : ''}">患者 ${escapeHtml(patient.code)}<span data-tab-state="${index}"></span></button>`).join('')}
      </div>
      <div class="duo-grid">
        ${state.patients.map((patient, index) => patientShell(patient, index)).join('')}
      </div>
      <section class="card card-pad duo-timeline">
        <div class="section-head" style="margin-bottom:8px"><h2 class="section-title" style="font-size:16px">全局事件</h2><span class="badge">实时</span></div>
        <div class="event-log" data-events></div>
      </section>
      ${medicalDisclaimer()}
      <footer class="page-footer">双人模式为教学模拟：病例、查体与波形均为虚构；处置与评分基于 ACLS 教学流程，不替代真实临床决策。</footer>`;

    bindShell();
    updateDynamic(true);
    state.patients.forEach((patient, index) => mountMonitor(index));
    clearPoll();
    if (state.status === 'active') {
      pollTimer = window.setInterval(() => {
        if (!busy && !destroyed) loadState(false);
      }, 1000);
    }
  }

  function patientShell(patient, index) {
    return `<section class="duo-patient" data-panel="${index}">
      <header class="duo-patient-head">
        <div class="duo-code">患者 ${escapeHtml(patient.code)}</div>
        <span class="badge" data-state="${index}">${escapeHtml(patientOutcomeText(patient.outcome))}</span>
      </header>
      <div class="duo-demographics">${escapeHtml(demographics(patient.case))}</div>
      <p class="duo-complaint">${escapeHtml(patient.case?.complaint || '')}</p>
      <div class="duo-exam">${(patient.case?.exam || []).map((item) => `<span>${icon('stethoscope', 11)} ${escapeHtml(item)}</span>`).join('')}</div>
      <div class="duo-monitor">
        <div class="duo-monitor-head"><span>ECG · II</span><span>25 mm/s · 10 mm/mV</span></div>
        <div class="duo-monitor-canvas" data-monitor="${index}"></div>
        <div class="duo-monitor-foot"><span class="badge ${patient.vitals?.pulse ? 'badge-ok' : 'badge-danger'}">${patient.vitals?.pulse ? '有脉' : '无脉'}</span><span>${escapeHtml(patient.phaseLabel || '就诊评估')}</span></div>
      </div>
      <div class="vitals-grid duo-vitals" data-vitals="${index}"></div>
      <div class="duo-cpr-slot" data-cpr-slot="${index}"></div>
      <div class="duo-diagnosis">
        <div class="duo-section-title"><span>诊断窗口</span><span data-diagnosis-timer="${index}"></span></div>
        <div class="duo-options" data-options="${index}">
          ${(patient.diagnosis?.options || []).map((option) => `<button type="button" class="duo-option" data-diagnosis-option="${escapeHtml(option)}" data-patient="${index}">${escapeHtml(option)}</button>`).join('')}
        </div>
        <div class="duo-diagnosis-status" data-diagnosis-status="${index}"></div>
      </div>
      <div class="duo-actions" data-actions="${index}"></div>
    </section>`;
  }

  function bindShell() {
    el.querySelector('[data-exit]')?.addEventListener('click', async () => {
      if (state?.status === 'active') {
        const ok = await confirmDialog({ title: '退出双人模式？', message: '当前会话会保留在服务端，但不会自动生成完整复盘。建议先结束本局。', confirmText: '保留并退出', danger: true });
        if (!ok) return;
      }
      navigate('/sim');
    });
    el.querySelector('[data-finish]')?.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: '结束并复盘？', message: '将按当前时间线结算两名患者并生成复盘，之后不能继续操作。', confirmText: '结束并复盘' });
      if (!ok) return;
      await act(0, 'finish');
    });
    el.querySelectorAll('[data-duo-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        activePatient = Number(button.dataset.duoTab);
        applyMobileTab(true);
      });
    });
    applyMobileTab(false);
  }

  function applyMobileTab(force = false) {
    el.querySelectorAll('[data-panel]').forEach((panel, index) => {
      panel.classList.toggle('is-mobile-active', index === activePatient);
    });
    el.querySelectorAll('[data-duo-tab]').forEach((button, index) => {
      button.classList.toggle('active', index === activePatient);
    });
    if (force) {
      if (viewers[activePatient]) {
        viewers[activePatient].destroy();
        viewers[activePatient] = null;
      }
      const host = el.querySelector(`[data-monitor="${activePatient}"]`);
      if (host) host.dataset.sig = '';
      window.requestAnimationFrame(() => mountMonitor(activePatient));
    }
  }

  function updateDynamic(initial = false) {
    if (!state) return;
    const windowChip = el.querySelector('[data-window]');
    if (windowChip) {
      const parts = state.patients.map((patient) => {
        const diagnosis = patient.diagnosis || {};
        const label = diagnosis.submitted ? '✓' : patient.status === 'ended' ? '未提交'
          : diagnosis.expired ? '超时' : `${diagnosis.deadlineLeft ?? 0}s`;
        return `${patient.code} ${label}`;
      });
      windowChip.textContent = parts.join(' · ');
      const anyOpen = state.patients.some((patient) => !patient.diagnosis?.submitted && !patient.diagnosis?.expired && patient.status === 'active');
      windowChip.className = `duo-window-chip ${anyOpen ? 'active' : 'expired'}`;
    }
    const clock = el.querySelector('[data-elapsed]');
    if (clock) clock.textContent = fmtDuration(state.elapsed);

    const lock = state.lock || {};
    const lockBox = el.querySelector('[data-lock]');
    if (lockBox) {
      if (lock.active) {
        lockBox.hidden = false;
        lockBox.innerHTML = `${icon('lock', 14)} <b>正在处置患者 ${escapeHtml(lock.code)}</b><span>· ${escapeHtml(lock.label || '处置中')} · 约 ${lock.remaining}s；除 CPR 与充电外，其余操作需等待。</span>`;
      } else {
        lockBox.hidden = true;
        lockBox.innerHTML = '';
      }
    }

    state.patients.forEach((patient, index) => updatePatient(patient, index, initial));
    if (state.patients[activePatient]?.status === 'ended') {
      const next = state.patients.findIndex((patient, index) => index !== activePatient && patient.status === 'active');
      if (next >= 0) {
        activePatient = next;
        applyMobileTab(true);
      }
    }

    const events = el.querySelector('[data-events]');
    if (events) {
      events.innerHTML = (state.events || []).map((event) => `<div class="event-item ${event.tone === 'good' ? 'good' : event.tone === 'bad' ? 'bad' : event.tone === 'warn' ? 'warn' : ''}"><span class="event-time">${fmtDuration(event.t)}</span><span>${event.patient ? `<b>${escapeHtml(event.patient)}</b> · ` : ''}${escapeHtml(event.label)}</span></div>`).join('') || '<div class="muted" style="font-size:10px">等待操作…</div>';
    }

    if (state.status === 'ended') {
      el.querySelectorAll('[data-actions] button, [data-diagnosis-option]').forEach((button) => { button.disabled = true; });
    }
  }

  function updatePatient(patient, index, initial) {
    const panel = el.querySelector(`[data-panel="${index}"]`);
    if (!panel) return;
    if (patient.status === 'ended' && shockPauses[index]) {
      window.clearInterval(shockPauses[index].timer);
      shockPauses[index] = null;
    }
    panel.classList.toggle('is-ended', patient.status === 'ended');
    panel.classList.toggle('is-stable', patient.status === 'ended' && ['rosc', 'stable'].includes(patient.outcome));
    panel.classList.toggle('is-lost', patient.status === 'ended' && !['rosc', 'stable'].includes(patient.outcome));
    panel.classList.toggle('is-locked', Boolean(patient.locked) && !patient.lockOwner);
    panel.classList.toggle('is-busy', Boolean(patient.lockOwner));

    const stateBadge = el.querySelector(`[data-state="${index}"]`);
    if (stateBadge) {
      const ended = patient.status === 'ended';
      const success = ended && ['rosc', 'stable'].includes(patient.outcome);
      stateBadge.textContent = ended ? (success ? '已恢复窦性心律' : '抢救失败') : (patient.lockOwner ? '处置中 · 仅 CPR/充电' : patient.locked ? '等待 · 可 CPR/充电' : '抢救中');
      stateBadge.className = `badge ${ended ? (success ? 'badge-ok' : 'badge-danger') : patient.locked ? 'badge-warn' : 'badge-brand'}`;
    }
    const tabState = el.querySelector(`[data-tab-state="${index}"]`);
    if (tabState) {
      const ended = patient.status === 'ended';
      const success = ended && ['rosc', 'stable'].includes(patient.outcome);
      tabState.textContent = ended ? (success ? '已恢复' : '失败') : patient.locked ? '等待' : '抢救';
    }

    const vitals = el.querySelector(`[data-vitals="${index}"]`);
    if (vitals) {
      const v = patient.vitals || {};
      vitals.innerHTML = `
        <div class="vital ${v.hr && v.hr < 50 ? 'danger' : v.hr > 130 ? 'warn' : ''}"><div class="vital-label">${escapeHtml(v.hrLabel || 'HR')}</div><div class="vital-value">${v.hr ? escapeHtml(String(v.hr)) : '—'} <small>bpm</small></div></div>
        <div class="vital ${v.bpSys && v.bpSys < 90 ? 'danger' : ''}"><div class="vital-label">NIBP</div><div class="vital-value">${v.bpSys ? `${v.bpSys}/${v.bpDia}` : '—'} <small>mmHg</small></div></div>
        <div class="vital ${v.spo2 && v.spo2 < 90 ? 'warn' : ''}"><div class="vital-label">SpO₂</div><div class="vital-value">${v.spo2 ? `${v.spo2}%` : '—'}</div></div>
        <div class="vital"><div class="vital-label">ETCO₂</div><div class="vital-value">${v.etco2 ?? '—'} <small>mmHg</small></div></div>`;
    }

    const timer = el.querySelector(`[data-diagnosis-timer="${index}"]`);
    if (timer) {
      const diagnosis = patient.diagnosis || {};
      timer.textContent = diagnosis.submitted ? '已提交' : diagnosis.expired ? '已超时' : `${diagnosis.deadlineLeft ?? 0}s`;
      timer.className = diagnosis.submitted ? 'ok' : diagnosis.expired ? 'bad' : '';
    }
    el.querySelectorAll(`[data-diagnosis-option][data-patient="${index}"]`).forEach((button) => {
      const diagnosis = patient.diagnosis || {};
      button.disabled = Boolean(diagnosis.submitted) || patient.status !== 'active' || Boolean(diagnosisBusy[index]);
      button.classList.toggle('selected', diagnosis.selected === button.dataset.diagnosisOption);
    });
    const diagnosisStatus = el.querySelector(`[data-diagnosis-status="${index}"]`);
    const optionsHost = el.querySelector(`[data-options="${index}"]`);
    if (optionsHost) optionsHost.hidden = Boolean(patient.diagnosis?.submitted);
    if (diagnosisStatus) {
      const diagnosis = patient.diagnosis || {};
      const treatment = patient.treatment || {};
      const ended = patient.status === 'ended';
      if (diagnosis.submitted) {
        const dxBadge = diagnosis.inTime
          ? '<span class="badge badge-ok">窗口内</span>'
          : '<span class="badge badge-warn">超时</span>';
        const txBadge = treatment.started
          ? `<span class="badge ${treatment.inTime ? 'badge-ok' : 'badge-warn'}">${treatment.inTime ? '窗口内' : '超时'}</span>`
          : '';
        const txValue = treatment.started ? fmtDuration(treatment.at) : '<span class="muted">未开始</span>';
        diagnosisStatus.innerHTML = `<div class="duo-dx-summary">
          <div class="duo-dx-row"><span class="duo-dx-label">诊断</span><b>${escapeHtml(diagnosis.selected || '')}</b>${dxBadge}</div>
          <div class="duo-dx-row"><span class="duo-dx-label">处置</span>${txValue}${txBadge}</div>
          ${ended && diagnosis.label ? `<div class="duo-dx-row ${diagnosis.correct ? 'is-correct' : 'is-wrong'}"><span class="duo-dx-label">正确诊断</span><b>${escapeHtml(diagnosis.label)}</b><span class="badge ${diagnosis.correct ? 'badge-ok' : 'badge-danger'}">${diagnosis.correct ? '匹配' : '不匹配'}</span></div>` : ''}
        </div>`;
      } else {
        const hint = diagnosis.expired ? '诊断窗口已过，仍可继续处置。' : '点击一个诊断选项即提交。';
        const tx = treatment.started
          ? `<b>${fmtDuration(treatment.at)}</b><span class="badge ${treatment.inTime ? 'badge-ok' : 'badge-warn'}">${treatment.inTime ? '窗口内' : '超时'}</span>`
          : '<span class="muted">未开始</span>';
        diagnosisStatus.innerHTML = `<div class="duo-dx-summary">
          <div class="duo-dx-row"><span class="duo-dx-label">诊断</span><span class="${diagnosis.expired ? 'bad' : 'muted'}">${hint}</span></div>
          <div class="duo-dx-row"><span class="duo-dx-label">处置</span>${tx}</div>
        </div>`;
      }
    }

    const cprSig = JSON.stringify({
      status: patient.status,
      cpr: patient.cpr,
      pending: patient.flags?.cprPending,
      readyIn: patient.flags?.cprReadyIn,
      shockPause: Boolean(shockPauses[index]),
    });
    if (initial || cprSig !== cprSigs[index]) {
      cprSigs[index] = cprSig;
      renderCpr(index);
    }

    const actionsSig = JSON.stringify({
      status: patient.status,
      locked: patient.locked,
      cpr: patient.cpr,
      flags: patient.flags,
      metrics: patient.metrics,
      actions: patient.actions,
      shockEnergy: shockEnergy[index],
      shockPause: Boolean(shockPauses[index]),
      shockPauseRemaining: shockPauses[index] ? Math.max(0, Math.ceil((shockPauses[index].until - Date.now()) / 1000)) : 0,
    });
    if (initial || actionsSig !== actionsSigs[index]) {
      actionsSigs[index] = actionsSig;
      renderActions(index);
    }

    const monitorSig = JSON.stringify({
      rhythm: patient.monitor?.rhythm,
      morphology: patient.monitor?.morphology,
      p: patient.monitor?.p,
      seed: patient.monitor?.seed,
      vfAmplitude: patient.monitor?.vfAmplitude,
      cprArtifact: patient.monitor?.cprArtifact,
      sineWave: patient.monitor?.sineWave,
      rate: patient.monitor?.rate,
    });
    if (monitorSig !== monitorSigs[index]) {
      monitorSigs[index] = monitorSig;
      mountMonitor(index);
    }
  }

  function renderActions(index) {
    const host = el.querySelector(`[data-actions="${index}"]`);
    const patient = state?.patients?.[index];
    if (!host || !patient) return;
    const flags = patient.flags || {};
    const ended = patient.status === 'ended';
    const locked = Boolean(patient.locked);
    const pause = Boolean(shockPauses[index]);
    const otherPause = shockPauses.some((entry, i) => Boolean(entry) && i !== index);
    const actionLocked = locked || pause || otherPause;
    const groups = patient.actions || [];

    const ivText = flags.iv ? 'IV/IO 已建立' : flags.ivPending ? `IV/IO 建立中 · ${flags.ivReadyIn ?? 0}s` : 'IV/IO 未建立';
    const ivClass = flags.iv ? 'ready' : flags.ivPending ? 'pending' : 'off';
    let html = `<div class="duo-iv ${ivClass}"><span>${escapeHtml(ivText)}</span>${locked ? `<small>${patient.lockOwner ? '本患者处置中' : '正在处置另一名患者'}，仅 CPR / 充电可用</small>` : ''}</div>`;

    for (const group of groups) {
      if ((group.actions || []).some((action) => action.id === 'shock')) {
        html += shockControls(patient, index, group, ended, locked || otherPause, flags);
        continue;
      }
      const actions = (group.actions || []).filter((action) => !['cpr_start', 'cpr_stop'].includes(action.id));
      if (actions.length === 0) continue;
      html += `<div class="duo-action-group"><div class="duo-action-title">${escapeHtml(group.label)}</div><div class="duo-action-grid">${actions.map((action) => {
        const needsIv = Boolean(action.requiresIv) && (!flags.iv || flags.ivPending);
        const ivPending = action.id === 'iv' && flags.ivPending;
        const ivDone = action.id === 'iv' && flags.iv;
        const disabled = ended || actionLocked || needsIv || ivPending || ivDone;
        const suffix = ivDone ? ' · 已建立' : ivPending ? ' · 建立中' : '';
        const title = needsIv ? ' title="请先完成 IV/IO 通路"' : (actionLocked ? ` title="${patient.lockOwner ? '本患者处置中' : '正在处置另一名患者'}，仅 CPR / 充电可用"` : '');
        return `<button type="button" class="duo-action ${action.tone === 'primary' ? 'primary' : action.tone === 'danger' ? 'danger' : action.tone === 'warn' ? 'warn' : ''}" data-duo-action="${escapeHtml(action.id)}" data-patient="${index}" ${disabled ? 'disabled' : ''}${title}>${escapeHtml(action.label)}${suffix}</button>`;
      }).join('')}</div></div>`;
    }

    host.innerHTML = html;

    host.querySelectorAll('[data-duo-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        await act(index, button.dataset.duoAction, {});
      });
    });
    host.querySelector(`[data-duo-energy="${index}"]`)?.addEventListener('change', (event) => {
      shockEnergy[index] = Number(event.target.value);
      renderActions(index);
    });
    host.querySelectorAll('[data-shock-charge]').forEach((button) => {
      button.addEventListener('click', async () => {
        const sync = button.dataset.shockCharge === 'sync';
        await act(index, 'charge', { energy: shockEnergy[index], sync });
      });
    });
    host.querySelector('[data-shock-discharge]')?.addEventListener('click', () => startShockPause(index));
    host.querySelector('[data-shock-disarm]')?.addEventListener('click', () => act(index, 'disarm', {}));
    host.querySelector('[data-shock-cancel]')?.addEventListener('click', () => cancelShockPause(index));
  }

  function renderCpr(index) {
    const slot = el.querySelector(`[data-cpr-slot="${index}"]`);
    const patient = state?.patients?.[index];
    if (!slot || !patient) return;
    const groups = patient.actions || [];
    const hasCpr = groups.some((group) => (group.actions || []).some((action) => action.id === 'cpr_start'));
    if (!hasCpr) {
      slot.hidden = true;
      slot.innerHTML = '';
      return;
    }
    slot.hidden = false;
    const flags = patient.flags || {};
    const pending = Boolean(flags.cprPending);
    const ended = patient.status === 'ended';
    const shockPause = Boolean(shockPauses[index]);
    const cprDisabled = ended || shockPause;
    const hasPulse = Boolean(patient.vitals?.pulse);
    slot.innerHTML = `<div class="duo-cpr ${patient.cpr ? 'active' : ''}">
      <div><span class="duo-cpr-label">HIGH-QUALITY CPR</span><b>${patient.cpr ? '按压进行中' : pending ? `准备按压 · ${flags.cprReadyIn ?? 0}s` : 'CPR 未开始'}</b><small>${patient.cpr ? '100–120 次/分；除颤前先停止。' : pending ? '正在确认环境与体位；可点击右侧取消准备。' : hasPulse ? '当前有脉搏：先评估心律与灌注，通常不需要胸外按压。' : '无脉时立即开始；CPR 不受串行限制。'}</small></div>
      <button type="button" class="btn ${patient.cpr ? 'btn-secondary' : 'btn-primary'} btn-sm" data-cpr-toggle data-patient="${index}" ${cprDisabled ? 'disabled' : ''}>${patient.cpr ? '停止 CPR' : pending ? `取消准备 ${flags.cprReadyIn ?? 0}s` : '开始 CPR'}</button>
    </div>`;
    slot.querySelector('[data-cpr-toggle]')?.addEventListener('click', async () => {
      const patientState = state.patients[index];
      await act(index, (patientState.cpr || patientState.flags?.cprPending) ? 'cpr_stop' : 'cpr_start', {});
    });
  }

  function shockControls(patient, index, group, ended, locked, flags) {
    const energies = [50, 100, 120, 150, 200];
    const chargeReady = Boolean(flags.chargeReady);
    const chargeProgress = Boolean(flags.chargeInProgress);
    const chargeLocked = chargeReady || chargeProgress;
    const pause = shockPauses[index];
    const remaining = pause ? Math.max(0, Math.ceil((pause.until - Date.now()) / 1000)) : 0;
    const paused = Boolean(pause);
    const shockBlocked = ended || paused || locked || !chargeReady
      || Boolean(patient.cpr) || Boolean(flags.cprPending) || Boolean(flags.postShock);
    const mode = flags.chargeSync === true ? '同步' : '非同步';

    let html = `<div class="duo-action-group"><div class="duo-action-title">${escapeHtml(group.label)}</div>
      <div class="duo-shock">
        <div class="duo-shock-row"><span>能量</span><select class="select" data-duo-energy="${index}" ${chargeLocked || ended || paused ? 'disabled' : ''}>${energies.map((energy) => `<option value="${energy}" ${energy === (flags.chargeEnergy ?? shockEnergy[index]) ? 'selected' : ''}>${energy} J</option>`).join('')}</select></div>`;

    if (!chargeReady && !chargeProgress) {
      html += `<div class="duo-charge-buttons">
        <button type="button" class="duo-charge-btn sync" data-shock-charge="sync" ${ended || paused ? 'disabled' : ''}>${icon('bolt', 13)} 同步模式充电</button>
        <button type="button" class="duo-charge-btn async" data-shock-charge="async" ${ended || paused ? 'disabled' : ''}>${icon('zap', 13)} 非同步模式充电</button>
      </div>
      <div class="duo-shock-hint">同步：有脉搏、需电复律；非同步：无脉 VF / 无脉性 VT。充电可直接进行，不需要等待其他操作完成。</div>`;
    } else {
      html += `<div class="duo-charged"><b>已充电 ${flags.chargeEnergy ?? shockEnergy[index]} J</b><span>${mode}模式</span></div>
        <div class="duo-shock-actions">
          <button type="button" class="btn btn-danger btn-sm" data-shock-discharge ${shockBlocked ? 'disabled' : ''}>${icon('zap', 14)} ${mode}放电</button>
          <button type="button" class="btn btn-ghost btn-sm" data-shock-disarm ${paused ? 'disabled' : ''}>解除充电</button>
        </div>`;
      if (paused) {
        html += `<div class="duo-shock-countdown"><b>电击准备 ${remaining}s</b><span>请确认无人接触患者；倒计时结束后自动放电。</span><button type="button" class="btn btn-ghost btn-sm" data-shock-cancel>取消电击</button></div>`;
      } else {
        html += `<div class="duo-shock-hint">${patient.cpr || flags.cprPending ? '先停止/取消按压准备，再放电。' : flags.postShock ? '电击后观察期，约 2 秒。' : locked ? '另一项处置进行中；可以先充电，结束后再放电。' : '确认无人接触患者后放电；按一下进入 3 秒停顿，再自动放电。'}</div>`;
      }
    }
    html += '</div></div>';
    return html;
  }

  function startShockPause(index) {
    const patient = state?.patients?.[index];
    if (!patient || shockPauses[index] || state.status !== 'active') return;
    const flags = patient.flags || {};
    if (!flags.chargeReady) return;
    const pause = {
      until: Date.now() + 3000,
      energy: flags.chargeEnergy ?? shockEnergy[index],
      sync: flags.chargeSync === true,
      timer: 0,
    };
    shockPauses[index] = pause;
    renderActions(index);
    renderCpr(index);
    renderActions(index === 0 ? 1 : 0);
    pause.timer = window.setInterval(() => {
      if (!shockPauses[index]) return;
      if (Date.now() >= shockPauses[index].until) {
        window.clearInterval(shockPauses[index].timer);
        const payload = { energy: shockPauses[index].energy, sync: shockPauses[index].sync };
        shockPauses[index] = null;
        renderCpr(index);
        renderActions(index);
        act(index, 'shock', payload);
      } else {
        renderActions(index);
      }
    }, 250);
  }

  function cancelShockPause(index) {
    const pause = shockPauses[index];
    if (!pause) return;
    window.clearInterval(pause.timer);
    shockPauses[index] = null;
    renderActions(index);
    renderCpr(index);
    renderActions(index === 0 ? 1 : 0);
  }

  function mountMonitor(index) {
    const host = el.querySelector(`[data-monitor="${index}"]`);
    const patient = state?.patients?.[index];
    if (!host || !patient?.monitor) return;
    const sig = JSON.stringify(patient.monitor);
    if (viewers[index] && host.dataset.sig === sig) return;
    const spec = { ...patient.monitor, duration: 4, annotations: [], seed: patient.monitor.seed ?? 19 };
    if (viewers[index]) {
      viewers[index].refreshSpec(spec);
      host.dataset.sig = sig;
      return;
    }
    host.innerHTML = '';
    host.dataset.sig = sig;
    viewers[index] = mountECG(host, spec, {
      mode: 'rhythm', lead: spec.primaryLead || 'II', speed: 1, showAnnotations: false, autoPlay: true,
      playbackMode: 'scroll', loop: true, scrollWindow: 4,
    });
  }

  async function act(index, action, payload = {}) {
    if (busy || !state || state.status !== 'active') return;
    busy = true;
    try {
      state = await api.simDuoAction(sessionId, index, action, payload);
      actionsSigs[index] = '';
      if (action === 'shock') {
        el.querySelector(`[data-panel="${index}"]`)?.classList.add('shock-flash');
        window.setTimeout(() => el.querySelector(`[data-panel="${index}"]`)?.classList.remove('shock-flash'), 600);
      }
      if (state.status === 'ended') {
        clearPoll();
        updateDynamic();
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (state.runId) await showDebrief();
      } else {
        updateDynamic();
        renderActions(index);
      }
    } catch (error) {
      toast(error.message || '操作失败', 'error');
    } finally {
      busy = false;
    }
  }

  async function submitDiagnosis(index, diagnosis) {
    if (diagnosisBusy[index] || !state || state.status !== 'active') return;
    diagnosisBusy[index] = true;
    try {
      state = await api.simDuoDiagnosis(sessionId, index, diagnosis);
      updateDynamic();
    } catch (error) {
      toast(error.message || '诊断提交失败', 'error');
    } finally {
      diagnosisBusy[index] = false;
      updateDynamic();
    }
  }

  el.addEventListener('click', (event) => {
    const option = event.target.closest('[data-diagnosis-option]');
    if (option && !option.disabled) {
      submitDiagnosis(Number(option.dataset.patient), option.dataset.diagnosisOption);
    }
  });

  async function showDebrief() {
    clearPoll();
    destroyViewers();
    let debrief = null;
    try {
      debrief = await api.simDebrief(state.runId);
    } catch (error) {
      toast(error.message || '复盘读取失败', 'error');
    }
    const duoPatients = debrief?.duo?.patients || state.patients.map((patient) => patient.result).filter(Boolean);
    const events = debrief?.events || state.events || [];
    const run = debrief?.run || { score: state.score, grade: state.grade, outcome: state.outcome };
    el.innerHTML = `
      <div class="duo-head">
        <div>
          <div class="page-eyebrow">${icon('trophy', 14)} DUAL DEBRIEF</div>
          <h1 class="duo-title">双人随机急救 · 复盘</h1>
          <p class="duo-sub">${escapeHtml(outcomeText(run.outcome))}</p>
        </div>
        <a class="btn btn-ghost btn-sm" href="#/sim">${icon('x', 13)} 返回急救</a>
      </div>
      <div class="debrief-hero duo-debrief-hero">
        <div><div class="page-eyebrow" style="color:var(--brand-ink)">TEAM SCORE</div><div class="debrief-score">${run.score ?? '—'}</div><div class="result-label" style="color:var(--brand-ink)">分 · ${escapeHtml(outcomeText(run.outcome))}</div></div>
        <span class="debrief-grade">GRADE ${escapeHtml(run.grade || '—')}</span>
      </div>
      <div class="duo-debrief-grid">
        ${duoPatients.map((patient) => `<section class="card card-pad duo-result">
          <div class="row-wrap" style="justify-content:space-between"><h2 class="section-title" style="font-size:18px">患者 ${escapeHtml(patient.code)}</h2><span class="badge ${patient.success ? 'badge-ok' : 'badge-danger'}">${escapeHtml(patientOutcomeText(patient.outcome))}</span></div>
          <dl class="duo-result-list">
            <div><dt>正确诊断</dt><dd>${escapeHtml(patient.diagnosis || '—')}</dd></div>
            <div><dt>你的诊断</dt><dd class="${patient.diagnosisCorrect ? 'ok' : 'bad'}">${escapeHtml(patient.diagnosisSelected || '未提交')}${patient.diagnosisCorrect ? ' ✓' : ''}</dd></div>
            <div><dt>诊断时间</dt><dd>${patient.diagnosisAt != null ? fmtDuration(patient.diagnosisAt) : '—'}${patient.diagnosisInTime ? ' · 窗口内' : patient.diagnosisAt != null ? ' · 超时' : ''}</dd></div>
            <div><dt>开始处理</dt><dd>${patient.treatmentAt != null ? fmtDuration(patient.treatmentAt) : '—'}${patient.treatmentInTime ? ' · 窗口内' : patient.treatmentAt != null ? ' · 超时' : ''}</dd></div>
            <div><dt>按压比例</dt><dd>${Math.round((patient.cprRatio || 0) * 100)}%</dd></div>
            <div><dt>个人得分</dt><dd>${patient.score ?? 0} 分 · ${escapeHtml(patient.grade || 'D')}</dd></div>
          </dl>
          ${(patient.penalties || []).length ? `<div class="duo-penalties"><b>扣分</b>${patient.penalties.map((penalty) => `<span>${fmtDuration(penalty.t)} · -${penalty.points} · ${escapeHtml(penalty.reason)}</span>`).join('')}</div>` : '<p class="muted" style="font-size:11px">无扣分。</p>'}
        </section>`).join('')}
      </div>
      <div class="practice-setup" style="margin-top:16px">
        <section class="card card-pad">
          <div class="section-head"><h2 class="section-title" style="font-size:18px">复盘要点</h2><span class="badge">${(debrief?.review || []).length} 条</span></div>
          ${(debrief?.review || []).map((item) => `<div class="review-item ${item.tone || ''}"><span class="review-dot"></span><div><b>${escapeHtml(item.title)}</b><div class="muted">${escapeHtml(item.detail)}</div></div></div>`).join('') || '<p class="muted">暂无复盘要点。</p>'}
          <div class="row-wrap" style="margin-top:16px"><button class="btn btn-primary btn-sm" type="button" data-again>${icon('rotate', 14)} 再来一局双人模式</button><a class="btn btn-secondary btn-sm" href="#/sim">${icon('arrowLeft', 14)} 返回急救模块</a></div>
        </section>
        <aside class="card card-pad">
          <h3 class="section-title" style="font-size:15px;margin-bottom:8px">全局时间线</h3>
          <div class="event-log" style="max-height:420px">${events.map((event) => `<div class="event-item ${event.tone === 'good' ? 'good' : event.tone === 'bad' ? 'bad' : event.tone === 'warn' ? 'warn' : ''}"><span class="event-time">${fmtDuration(event.t)}</span><span>${event.patient ? `<b>${escapeHtml(event.patient)}</b> · ` : ''}${escapeHtml(event.label)}</span></div>`).join('')}</div>
        </aside>
      </div>
      ${medicalDisclaimer()}`;
    el.querySelector('[data-again]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      setButtonLoading(button, true, '重新分诊');
      try {
        const next = await api.simDuoStart();
        navigate(`/sim/duo/${next.sessionId}`);
      } catch (error) {
        toast(error.message || '无法开始新一局', 'error');
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
      shockPauses.forEach((pause) => { if (pause?.timer) window.clearInterval(pause.timer); });
      destroyViewers();
    },
  };
}
