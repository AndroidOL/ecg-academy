import { api } from '../api.js';
import { store } from '../store.js';
const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261108t';
const { mountECG } = await import(`../ecg-renderer.js${__asset}`);
import { createAiChat } from './ai-chat.js';
const { icon, chapterColor, difficultyDots, escapeHtml, toast, medicalDisclaimer, setupMiniECG } = await import(`../ui.js${__asset}`);

const SECTIONS = [
  ['definition', '定义'],
  ['mechanism', '发生机制'],
  ['criteria', '诊断标准'],
  ['reading', '判读步骤'],
  ['redFlags', '危险信号'],
  ['management', '处理原则'],
  ['pitfalls', '易错点'],
  ['differential', '鉴别诊断'],
  ['pearls', '记忆锦囊'],
];

const NORMAL_SPEC = {
  rhythm: 'sinus', rate: 72, atrialRate: 72, p: 'normal', pr: 0.16, qrs: 0.08,
  morphology: 'normal', axis: 'normal', st: { elevation: {}, depression: {}, shape: 'normal' },
  t: { shape: 'normal', amp: 1 }, u: 0, qt: 0.38, duration: 3, seed: 11,
  extras: [], annotations: [], show12Lead: false,
};

function list(items = [], className = '') {
  return `<ul class="${className}">${items.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}</ul>`;
}

export async function articleView({ params }) {
  const el = document.createElement('div');
  el.className = 'page';
  const detail = await api.diagnosis(params.id);
  document.title = `${detail.name} · 心迹 ECG Lab`;
  const chapter = detail.chapterMeta || {};
  const color = chapterColor(chapter.color);
  const keyNumbers = detail.keyNumbers || [];
  const hasEcg = Boolean(detail.hasEcg && detail.ecg);
  const isTopic = Boolean(detail.topic);
  const urgency = detail.urgency || 'core';
  const urgencyLabel = { critical: '危急优先', urgent: '急症相关', core: '核心课程', advanced: '进阶拓展' }[urgency] || '核心课程';
  const status = store.user?.isGuest ? (store.localProgress?.[detail.id] || null) : detail.status;
  let viewer = null;
  let textbookViewer = null;
  let readTimer = 0;
  let mastered = status === 'mastered';

  el.innerHTML = `
    <div class="breadcrumb"><a href="#/learn">诊断图谱</a><span>/</span><a href="#/learn?chapter=${encodeURIComponent(detail.chapter)}">${escapeHtml(chapter.name || '')}</a><span>/</span><span>${escapeHtml(detail.name)}</span></div>
    <div class="article-layout">
      <article class="article-main">
        <header class="article-hero" style="--chapter-color:${color}">
          <div class="article-lead">
            <span class="badge badge-brand">${escapeHtml(chapter.name || '')}</span>
            ${difficultyDots(detail.difficulty)}
            <span class="badge">${detail.difficulty >= 3 ? '挑战' : detail.difficulty === 2 ? '进阶' : '基础'}</span>
            <span class="badge ${urgency === 'critical' ? 'badge-danger' : urgency === 'urgent' ? 'badge-warn' : 'badge-brand'}">${urgencyLabel}</span>
            ${mastered ? `<span class="badge badge-ok">${icon('check', 11)} 已掌握</span>` : status ? '<span class="badge">已读</span>' : ''}
          </div>
          <h1 class="article-title">${escapeHtml(detail.name)}</h1>
          <div class="article-en">${escapeHtml(detail.en || '')}</div>
          <p class="article-one">${escapeHtml(detail.oneLiner)}</p>
          <div class="article-tags">${(detail.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
          <div class="article-key-grid">
            ${keyNumbers.map((item) => `<div class="key-number"><div class="key-number-value">${escapeHtml(item.value)}<small>${escapeHtml(item.unit || '')}</small></div><div class="key-number-label">${escapeHtml(item.label)}</div></div>`).join('')}
          </div>
        </header>

        <div class="specificity-box">
          <div class="label">${icon('target', 12)} ${isTopic ? '本章要解决的问题' : '最具特异性的线索'}</div>
          <p>${escapeHtml(detail.specificity || detail.oneLiner)}</p>
        </div>

        <section class="section" id="ecg-viewer-section" ${hasEcg ? '' : 'hidden'}>
          <div class="section-head">
            <div><div class="page-eyebrow">TRACING</div><h2 class="section-title">教学心电图</h2></div>
            <span class="section-kicker">可播放 · 可测量 · 可切换 12 导联</span>
          </div>
          <div class="ecg-card" id="article-ecg">
            <div class="ecg-toolbar">
              <div class="ecg-toolbar-group">
                <div class="ecg-tabs" role="tablist" aria-label="心电图视图">
                  <button class="ecg-tab active" type="button" data-ecg-mode="rhythm" role="tab" aria-selected="true">节律条</button>
                  <button class="ecg-tab" type="button" data-ecg-mode="12lead" role="tab" aria-selected="false">12 导联</button>
                </div>
                <select class="select" data-ecg-lead aria-label="选择导联" style="width:auto;min-height:30px;padding:3px 7px;font-size:10px">
                  <option value="II">II 导联</option><option value="V1">V1 导联</option><option value="V5">V5 导联</option>
                </select>
              </div>
              <div class="ecg-toolbar-group" data-playback-group>
                <span class="ecg-toolbar-label">播放</span>
                <div class="ecg-tabs" role="group" aria-label="播放方式">
                  <button class="ecg-tab active" type="button" data-ecg-playback="sweep">循环覆盖</button>
                  <button class="ecg-tab" type="button" data-ecg-playback="scroll">连续滚动</button>
                </div>
              </div>
              <div class="ecg-toolbar-group">
                <button class="btn btn-xs btn-ghost" type="button" data-ecg-play>${icon('play', 12)} 播放</button>
                <select class="select" data-ecg-speed aria-label="播放速度" style="width:auto;min-height:30px;padding:3px 6px;font-size:10px"><option value="1">1×</option><option value="2" selected>2×</option><option value="4">4×</option></select>
                <button class="btn btn-xs btn-ghost" type="button" data-ecg-textbook>教科书</button>
                <button class="btn btn-xs btn-ghost" type="button" data-ecg-anno>隐藏标注</button>
              </div>
            </div>
            <div id="article-ecg-canvas"></div>
            <div class="ecg-meta" id="article-ecg-meta"></div>
            <div class="ecg-scroll-hint">12 导联较宽，可左右滑动查看。</div>
            <div class="ecg-legend"><span>P 波</span><span>QRS</span><span class="warn">ST-T</span><span class="danger">异常标注</span></div>
          </div>
          <div class="textbook-panel" id="textbook-panel" hidden>
            <div class="textbook-head"><span>${icon('bookOpen', 14)} 教科书模式</span><span>波形解剖 · 间期测量 · 图文对应</span></div>
            <div class="textbook-zoom">
              <div class="textbook-zoom-head"><span>单周期放大 · 2.2 s 窗口</span><span>P-QRS-T 与间期对照</span></div>
              <div data-textbook-zoom></div>
            </div>
            <div class="textbook-grid">
              <div class="textbook-card"><div class="textbook-card-title"><i class="textbook-dot" style="background:var(--brand)"></i>P 波</div><p>心房除极产生，位于 QRS 之前；II 导联通常直立，宽度 &lt;0.12 s。</p></div>
              <div class="textbook-card"><div class="textbook-card-title"><i class="textbook-dot" style="background:var(--accent)"></i>PR 间期</div><p>从 P 波起点到 QRS 起点，代表房室传导时间；正常 0.12–0.20 s。</p></div>
              <div class="textbook-card"><div class="textbook-card-title"><i class="textbook-dot" style="background:var(--accent)"></i>QRS 波群</div><p>心室除极产生，正常 &lt;0.12 s；增宽提示束支阻滞、室性起源或电解质异常。</p></div>
              <div class="textbook-card"><div class="textbook-card-title"><i class="textbook-dot" style="background:var(--gold)"></i>ST 段 / T 波</div><p>心室复极；T 波方向通常与 QRS 主波一致，ST 段偏移需结合相邻导联与临床。</p></div>
              <div class="textbook-card"><div class="textbook-card-title"><i class="textbook-dot" style="background:var(--muted)"></i>QT 间期</div><p>从 QRS 起点到 T 波终点，反映电收缩总时间；需按心率校正为 QTc。</p></div>
            </div>
            ${detail.id !== 'normal-sinus' ? `<div class="textbook-compare"><div class="textbook-compare-label"><b>正常对照</b><span>窦性心律 · 72 次/分</span></div><div class="mini-ecg"><canvas data-textbook-normal aria-label="正常窦性心律对照心电图片段"></canvas></div></div>` : ''}
            <div class="textbook-metrics">
              <span>本例 HR <b>${escapeHtml(String(detail.ecg?.rate || '—'))}</b> 次/分</span>
              <span>PR <b>${escapeHtml(String(detail.ecg?.pr ?? '—'))}</b> s</span>
              <span>QRS <b>${escapeHtml(String(detail.ecg?.qrs ?? '—'))}</b> s</span>
              <span>QT <b>${escapeHtml(String(detail.ecg?.qt ?? '—'))}</b> s</span>
              <span>纸速 25 mm/s · 增益 10 mm/mV</span>
            </div>
          </div>
        </section>

        <div ${isTopic ? 'hidden' : ''}>
        <section class="article-section" id="definition"><h2>定义</h2><p>${escapeHtml(detail.definition)}</p></section>
        <section class="article-section" id="mechanism"><h2>发生机制</h2>${list(detail.mechanism)}</section>
        <section class="article-section" id="criteria"><h2>诊断标准</h2>${list(detail.criteria, 'criteria-list')}</section>
        <section class="article-section" id="reading"><h2>判读步骤</h2>${list(detail.reading)}</section>
        <section class="article-section" id="redFlags"><h2>危险信号</h2><div class="callout danger"><strong>${icon('alert', 13)} 需要立即处理或升级监护：</strong>${list(detail.redFlags).replace('<ul', '<ul style="margin-top:6px"')}</div></section>
        <section class="article-section" id="management"><h2>处理原则</h2><div class="callout brand">${list(detail.management)}</div></section>
        <section class="article-section" id="pitfalls"><h2>易错点</h2>${list(detail.pitfalls)}</section>
        <section class="article-section" id="differential">
          <h2>鉴别诊断</h2>
          <div class="related-grid">
            ${(detail.differential || []).map((diff) => `<a class="related-card" href="#/learn/${encodeURIComponent(diff.id)}"><b>${escapeHtml(diff.name || diff.id)}</b><span>${escapeHtml(diff.why || '对照鉴别')}</span></a>`).join('')}
          </div>
        </section>
        <section class="article-section" id="pearls">
          <h2>记忆锦囊</h2>
          ${(detail.pearls || []).map((pearl) => `<div class="callout" style="margin-bottom:8px">${icon('sparkles', 13)} ${escapeHtml(pearl)}</div>`).join('')}
        </section>
        </div>

        ${isTopic ? `
          <section class="article-section" id="topic-objectives">
            <h2>学习目标</h2>
            ${list(detail.objectives || [])}
          </section>
          ${(detail.sections || []).map((section, index) => `
            <section class="article-section" id="topic-section-${index}">
              <h2>${escapeHtml(section.title || '')}</h2>
              ${(section.body || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
              ${section.list?.length ? list(section.list) : ''}
            </section>`).join('')}
          ${(detail.keyPoints || []).length ? `<section class="article-section" id="topic-keypoints"><h2>必须记住</h2><div class="callout brand">${list(detail.keyPoints)}</div></section>` : ''}
          ${detail.clinicalPearl ? `<section class="article-section" id="topic-clinical"><h2>临床连接</h2><div class="callout">${icon('stethoscope', 13)} ${escapeHtml(detail.clinicalPearl)}</div></section>` : ''}
        ` : ''}

        <div class="article-nav">
          ${detail.prev ? `<a class="card card-pad card-hover" href="#/learn/${encodeURIComponent(detail.prev.id)}"><span class="badge">上一篇</span><div style="margin-top:6px;font-weight:700">${escapeHtml(detail.prev.name)}</div></a>` : '<span></span>'}
          ${detail.next ? `<a class="card card-pad card-hover" style="text-align:right" href="#/learn/${encodeURIComponent(detail.next.id)}"><span class="badge">下一篇</span><div style="margin-top:6px;font-weight:700">${escapeHtml(detail.next.name)}</div></a>` : '<span></span>'}
        </div>
        ${medicalDisclaimer()}
        <footer class="page-footer">内容为教学整理，不作为个体化诊疗依据。发现错误欢迎在开源仓库提交修订。</footer>
      </article>

      <aside class="article-aside">
        <div class="toc">
          <div class="toc-title">ON THIS PAGE</div>
          ${isTopic
            ? `<a class="toc-link" href="#topic-objectives" data-toc="topic-objectives">学习目标</a>${(detail.sections || []).map((section, index) => `<a class="toc-link" href="#topic-section-${index}" data-toc="topic-section-${index}">${escapeHtml(section.title || '')}</a>`).join('')}`
            : SECTIONS.map(([id, name]) => `<a class="toc-link" href="#ecg-viewer-section" data-toc="${id}">${name}</a>`).join('')}
        </div>
        <div class="article-side-card">
          <h3>床旁速记</h3>
          <p class="muted" style="font-size:11px;line-height:1.7">${escapeHtml(detail.oneLiner)}</p>
          <div class="article-side-meta" style="margin-top:9px">
            <div><span>心率</span><b>${escapeHtml(keyNumbers[0]?.value || '—')} ${escapeHtml(keyNumbers[0]?.unit || '')}</b></div>
            <div><span>QRS</span><b>${escapeHtml(keyNumbers.find((k) => /QRS/i.test(k.label))?.value || '—')} s</b></div>
            <div><span>难度</span><b>${detail.difficulty >= 3 ? '挑战' : detail.difficulty === 2 ? '进阶' : '基础'}</b></div>
          </div>
          <div class="article-actions">
            <button class="btn btn-sm ${mastered ? 'btn-soft' : 'btn-primary'}" type="button" data-master ${mastered ? 'disabled' : ''}>${icon(mastered ? 'check' : 'target', 14)} ${mastered ? '已掌握' : '标记掌握'}</button>
            <a class="btn btn-sm btn-secondary" href="#/practice">${icon('activity', 14)} 去练习</a>
          </div>
        </div>
        <div id="article-ai"></div>
        <div class="article-side-card">
          <h3>相关阅读</h3>
          <div class="article-side-meta">
            ${(detail.related || []).slice(0, 4).map((item) => `<a href="#/learn/${encodeURIComponent(item.id)}" style="color:var(--ink-2);font-size:11px">${escapeHtml(item.name)} <span style="color:var(--muted)">→</span></a>`).join('') || '<span class="muted">暂无</span>'}
          </div>
        </div>
      </aside>
    </div>`;

  const viewerRoot = el.querySelector('#article-ecg-canvas');
  const meta = el.querySelector('#article-ecg-meta');
  const playButton = el.querySelector('[data-ecg-play]');
  const annoButton = el.querySelector('[data-ecg-anno]');
  const modeButtons = el.querySelectorAll('[data-ecg-mode]');
  const playbackButtons = el.querySelectorAll('[data-ecg-playback]');
  const playbackGroup = el.querySelector('[data-playback-group]');
  const leadSelect = el.querySelector('[data-ecg-lead]');
  const speedSelect = el.querySelector('[data-ecg-speed]');
  const textbookButton = el.querySelector('[data-ecg-textbook]');
  const textbookPanel = el.querySelector('#textbook-panel');
  let annotations = true;
  let textbook = false;

  if (viewerRoot && hasEcg) {
    const spec = detail.ecg;
    viewer = mountECG(viewerRoot, spec, {
      mode: 'rhythm', lead: spec.primaryLead || 'II', speed: 2, showAnnotations: true, autoPlay: false,
      playbackMode: 'sweep', loop: true,
    });
    const updateMeta = () => {
      const summary = viewer.rhythmSession.summary();
      meta.innerHTML = `<span>HR <b>${escapeHtml(summary.rateText)}</b></span><span>PR <b>${escapeHtml(String(summary.pr || '—'))}</b> s</span><span>QRS <b>${escapeHtml(String(summary.qrs || '—'))}</b> s</span><span>QT <b>${escapeHtml(String(summary.qt || '—'))}</b> s</span><span class="badge ${summary.rhythm === 'vf' ? 'badge-danger' : 'badge-brand'}">${escapeHtml(spec.description || '')}</span>`;
    };
    updateMeta();
    const syncPlayButton = () => {
      if (!playButton) return;
      playButton.innerHTML = viewer.playing ? `${icon('pause', 12)} 暂停` : `${icon('play', 12)} 播放`;
    };
    viewerRoot.addEventListener('ecg:play', syncPlayButton);
    viewerRoot.addEventListener('ecg:pause', syncPlayButton);
    viewerRoot.addEventListener('ecg:ended', syncPlayButton);
    playButton?.addEventListener('click', () => {
      if (viewer.playing) {
        viewer.pause();
      } else {
        if (textbook) {
          textbook = false;
          textbookPanel.hidden = true;
          textbookButton.classList.remove('active');
          viewer.setTextbook(false);
        }
        viewer.play(Number(speedSelect.value) || 2);
      }
      syncPlayButton();
    });
    playbackButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.ecgPlayback;
        if (mode === 'scroll' && textbook) {
          textbook = false;
          viewer.setTextbook(false);
          textbookPanel.hidden = true;
          textbookButton.classList.remove('active');
        }
        viewer.setPlayback(mode);
        playbackButtons.forEach((b) => b.classList.toggle('active', b === button));
        syncPlayButton();
      });
    });
    textbookButton?.addEventListener('click', () => {
      textbook = !textbook;
      viewer.pause();
      viewer.setTextbook(textbook);
      textbookPanel.hidden = !textbook;
      textbookButton.classList.toggle('active', textbook);
      if (textbook) {
        const zoomHost = textbookPanel.querySelector('[data-textbook-zoom]');
        if (zoomHost && !textbookViewer) {
          textbookViewer = mountECG(zoomHost, {
            ...detail.ecg,
            duration: 2.2,
            annotations: [],
            seed: (detail.ecg.seed || 11) + 31,
          }, {
            mode: 'rhythm', lead: detail.ecg.primaryLead || 'II', speed: 1,
            showAnnotations: false, showSummary: true, autoPlay: false,
            textbook: true, playbackMode: 'sweep', loop: false,
          });
        }
        const normalCanvas = textbookPanel.querySelector('[data-textbook-normal]');
        if (normalCanvas && !normalCanvas.dataset.ready) {
          setTimeout(() => {
            setupMiniECG(normalCanvas, NORMAL_SPEC);
            normalCanvas.dataset.ready = '1';
          }, 0);
        }
      } else {
        if (textbookViewer) {
          textbookViewer.destroy();
          textbookViewer = null;
        }
        const zoomHost = textbookPanel.querySelector('[data-textbook-zoom]');
        if (zoomHost) zoomHost.innerHTML = '';
      }
      syncPlayButton();
    });
    annoButton?.addEventListener('click', () => {
      annotations = !annotations;
      viewer.setAnnotations(annotations);
      annoButton.textContent = annotations ? '隐藏标注' : '显示标注';
    });
    modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.ecgMode;
        viewer.setMode(mode);
        modeButtons.forEach((b) => {
          b.classList.toggle('active', b === button);
          b.setAttribute('aria-selected', String(b === button));
        });
        leadSelect.style.display = mode === 'rhythm' ? '' : 'none';
        annoButton.style.display = mode === 'rhythm' ? '' : 'none';
        playbackGroup.style.display = mode === 'rhythm' ? '' : 'none';
        textbookButton.style.display = mode === 'rhythm' ? '' : 'none';
        if (mode === '12lead') {
          textbookPanel.hidden = true;
        } else if (textbook) {
          textbookPanel.hidden = false;
        }
        syncPlayButton();
      });
    });
    leadSelect.value = spec.primaryLead === 'V1' ? 'V1' : 'II';
    leadSelect?.addEventListener('change', () => viewer.setLead(leadSelect.value));
    speedSelect?.addEventListener('change', () => viewer.setSpeed(Number(speedSelect.value) || 2));
    const tocLinks = el.querySelectorAll('[data-toc]');
    tocLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        document.getElementById(link.dataset.toc)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  const masterButton = el.querySelector('[data-master]');
  masterButton?.addEventListener('click', async () => {
    if (mastered) {
      toast('已经是掌握状态，继续阅读即可', 'info');
      return;
    }
    window.clearTimeout(readTimer);
    try {
      if (store.user?.isGuest) store.setLocalProgress(detail.id, 'mastered');
      else await api.progress(detail.id, 'mastered');
      mastered = true;
      toast('已标记为掌握', 'info');
      masterButton.className = 'btn btn-sm btn-soft';
      masterButton.innerHTML = `${icon('check', 14)} 已掌握`;
      masterButton.disabled = true;
      store.setProgress(detail.id, 'mastered');
      store.progress.mastered = (store.progress.mastered || 0) + 1;
    } catch (error) {
      toast(error.message || '更新失败', 'error');
    }
  });

  if (!status) {
    readTimer = window.setTimeout(async () => {
      try {
        if (store.user?.isGuest) store.setLocalProgress(detail.id, 'read');
        else {
          await api.progress(detail.id, 'read');
          store.progress.read = (store.progress.read || 0) + 1;
          store.setProgress(detail.id, 'read');
        }
      } catch (error) {
        // silent: progress is a convenience, not a blocker
      }
    }, 1200);
  }

  const aiHost = el.querySelector('#article-ai');
  if (aiHost && store.ai?.allowed !== false) {
    const chat = createAiChat({
      diagnosisId: detail.id,
      welcome: `关于「${detail.name}」，你可以问我诊断标准、鉴别或处理。先记住这句话：${detail.oneLiner}`,
      suggestions: ['最容易漏诊的点是什么？', '和相似诊断怎么鉴别？', '给我一个床旁记忆法'],
    });
    aiHost.appendChild(chat.el);
  }

  return {
    el,
    destroy() {
      window.clearTimeout(readTimer);
      if (textbookViewer) textbookViewer.destroy();
      if (viewer) viewer.destroy();
    },
  };
}
