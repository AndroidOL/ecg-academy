import { api } from '../api.js';
import { mountECG } from '../ecg-renderer.js';
import { navigate } from '../router.js';
import { icon, escapeHtml, toast, fmtDuration, confirmDialog, medicalDisclaimer, setButtonLoading } from '../ui.js';

const RHYTHM_LABELS = {
  vf: '心室颤动', pvt: '无脉性室速', svt: '室上性心动过速', af_fast: '快速心房颤动',
  brady: '严重心动过缓', asystole: '心搏停止', pea: '无脉电活动（PEA）', rosc: '自主循环恢复',
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
              <div class="row-wrap" style="justify-content:space-between"><span class="badge badge-danger">${escapeHtml(RHYTHM_LABELS[state.rhythm] || state.rhythm)}</span><span class="badge" data-pulse>${state.vitals?.pulse ? '有脉' : '无脉'}</span></div>
              <div class="vitals-grid" data-vitals></div>
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
        <div class="vital ${hrTone}"><div class="vital-label">HR</div><div class="vital-value">${escapeHtml(hr)} <small>bpm</small></div></div>
        <div class="vital ${v.bpSys && v.bpSys < 90 ? 'danger' : ''}"><div class="vital-label">NIBP</div><div class="vital-value">${escapeHtml(bp)} <small>mmHg</small></div></div>
        <div class="vital ${v.spo2 && v.spo2 < 90 ? 'warn' : ''}"><div class="vital-label">SpO₂</div><div class="vital-value">${escapeHtml(spo2)}</div></div>
        <div class="vital"><div class="vital-label">ETCO₂</div><div class="vital-value">${escapeHtml(String(etco2))} <small>mmHg</small></div></div>`;
    }
    const pulse = el.querySelector('[data-pulse]');
    if (pulse) pulse.textContent = state.vitals?.pulse ? '有脉' : '无脉';
    const cprLabel = el.querySelector('[data-cpr-label]');
    if (cprLabel) cprLabel.textContent = state.cpr ? '按压中' : '未按压';
    el.querySelector('.cpr-flag')?.classList.toggle('off', !state.cpr);
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
    const monitorSigNew = JSON.stringify({ rhythm: state.monitor?.rhythm, rate: state.monitor?.rate, qrs: state.monitor?.qrs, morphology: state.monitor?.morphology, p: state.monitor?.p, description: state.monitor?.description });
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
    destroyViewer();
    host.innerHTML = '';
    host.dataset.sig = sig;
    const spec = { ...state.monitor, duration: 4, annotations: [], seed: 19 };
    viewer = mountECG(host, spec, {
      mode: 'rhythm', lead: spec.primaryLead || 'II', speed: 1, showAnnotations: false, autoPlay: true,
      playbackMode: 'scroll', loop: true, scrollWindow: 4,
    });
    if (!host.dataset.loopBound) {
      host.dataset.loopBound = '1';
      host.addEventListener('ecg:ended', () => {
        if (!destroyed && viewer && state?.status === 'active') viewer.play(2);
      });
    }
  }

  function renderActions() {
    const host = el.querySelector('[data-actions]');
    if (!host || !state) return;
    const shockAction = state.actions?.flatMap((group) => group.actions || []).find((action) => action.id === 'shock');
    if (shockAction && !shockSyncTouched) shockSync = Boolean(shockAction.sync);
    const energies = state.rhythm === 'svt' ? [50, 100, 150, 200] : [120, 150, 200];
    if (!energies.includes(shockEnergy)) shockEnergy = energies[0];
    const groups = (state.actions || []).map((group) => {
      if (group.actions?.some((a) => a.id === 'shock')) {
        return `<div class="action-group"><div class="action-group-title">${escapeHtml(group.label)}</div>
          <div class="shock-controls">
            <div class="row"><span class="muted" style="font-size:10px">能量</span><select class="select" data-shock-energy>${energies.map((e) => `<option value="${e}" ${e === shockEnergy ? 'selected' : ''}>${e} J</option>`).join('')}</select></div>
            <div class="row" style="justify-content:space-between"><span class="muted" style="font-size:10px">模式</span><div class="sync-switch"><button type="button" class="${shockSync ? 'active' : ''}" data-sync="1">同步</button><button type="button" class="${!shockSync ? 'active danger' : ''}" data-sync="0">非同步</button></div></div>
            <button class="btn btn-danger btn-block btn-sm" type="button" data-action="shock" style="margin-top:7px">${icon('zap', 14)} 电击（${shockSync ? '同步' : '非同步'}）</button>
            <div class="hint" style="margin-top:4px">${shockSync ? '有脉、不稳定 → 同步电复律' : '无脉、可除颤 → 非同步除颤'}</div>
          </div>
        </div>`;
      }
      return `<div class="action-group"><div class="action-group-title">${escapeHtml(group.label)}</div><div class="action-grid">${(group.actions || []).map((action) => `<button class="action-btn ${action.tone === 'primary' ? 'primary' : action.tone === 'danger' ? 'danger' : ''}" type="button" data-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`).join('')}</div></div>`;
    }).join('');
    host.innerHTML = groups;
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
        await act(action, action === 'shock' ? { energy: shockEnergy, sync: shockSync } : {});
      });
    });
  }

  async function act(action, payload) {
    if (busy || !state || state.status !== 'active') return;
    busy = true;
    try {
      state = await api.simAction(sessionId, action, payload);
      lastActionsSig = '';
      if (state.status === 'ended') {
        clearPoll();
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
          <div class="row-wrap" style="margin-top:16px"><button class="btn btn-secondary btn-sm" type="button" data-ai-review>${icon('sparkles', 14)} AI 复盘</button><a class="btn btn-primary btn-sm" href="#/sim">${icon('rotate', 14)} 再来一次</a></div>
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
        const result = await api.aiSimReview(state.runId);
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
