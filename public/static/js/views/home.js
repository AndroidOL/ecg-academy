const __isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
const __asset = __isNode ? '' : '?v=20261112a13';
const { localizedName, getLocale } = await import(`../i18n.js${__asset}`);
const { api } = await import(`../api.js${__asset}`);
const { store } = await import(`../store.js${__asset}`);
const { mountECG } = await import(`../ecg-renderer.js${__asset}`);
const { icon, chapterColor, difficultyDots, escapeHtml, setupMiniECG, medicalDisclaimer } = await import(`../ui.js${__asset}`);

const FALLBACK_SPEC = {
  rhythm: 'sinus', rate: 72, atrialRate: 72, p: 'normal', pr: 0.16, qrs: 0.08,
  morphology: 'normal', st: { elevation: {}, depression: {}, shape: 'normal' },
  t: { shape: 'normal', amp: 1 }, qt: 0.38, duration: 8, seed: 11,
  annotations: [
    { kind: 'bracket', t0: 0.38, t1: 0.54, label: 'PR 0.16 s', tone: 'brand' },
    { kind: 'arrow', t: 0.58, label: 'R', tone: 'teal', dir: 'up' },
    { kind: 'arrow', t: 0.84, label: 'T', tone: 'gold', dir: 'up' },
  ],
  description: '正常窦性心律，心率约 72 次/分。',
};

export async function homeView() {
  const el = document.createElement('div');
  el.className = 'page';
  let diagnoses = { items: [], chapters: store.chapters };
  let heroDiagnosis = null;
  try {
    const [list, detail] = await Promise.all([
      store.getDiagnoses(),
      api.diagnosis('normal-sinus').catch(() => null),
    ]);
    diagnoses = list;
    heroDiagnosis = detail;
  } catch (error) {
    console.warn('home data failed', error);
  }
  const chapters = (store.chapters?.length ? store.chapters : diagnoses.chapters) || [];
  const items = diagnoses.items || [];
  const dailyPool = items.filter((item) => item.quizEligible !== false);
  const dailySource = dailyPool.length ? dailyPool : items;
  const daily = dailySource.length ? dailySource[(new Date().getDate() * 7 + 3) % dailySource.length] : null;
  const stats = store.content;
  const read = store.progress?.read || 0;
  const total = store.progress?.total || stats.diagnoses || 40;
  const percent = total ? Math.round((read / total) * 100) : 0;

  el.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <div class="hero-eyebrow">${icon('sparkles', 14)} FREE & OPEN · ECG ACADEMY</div>
        <h1 class="hero-title">把每一次心跳，<br><span class="accent">读成诊断。</span></h1>
        <p class="hero-sub">从窦性心律到心室颤动，从 ST-T 改变到电解质紊乱。用可交互的心电图、组合判读练习与 ACLS 推演，把书本上的标准变成床边的直觉。</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="#/learn">${icon('bookOpen', 18)} 开始学习</a>
          <a class="btn btn-accent btn-lg" href="#/daily">${icon('flame', 18)} 每日挑战</a>
          <a class="btn btn-secondary btn-lg" href="#/practice">${icon('activity', 18)} 判读练习</a>
          <a class="btn btn-ghost btn-lg" href="#/sim">${icon('zap', 18)} 急救模拟</a>
        </div>
        <div class="hero-stats">
          <div class="hero-stat"><b>${stats.quizEligible || stats.diagnoses || 40}</b><span>种判读诊断</span></div>
          <div class="hero-stat"><b>${stats.articles || 200}</b><span>章系统课程</span></div>
          <div class="hero-stat"><b>${stats.chapters || 9}</b><span>个系统章节</span></div>
          <div class="hero-stat"><b>${percent}%</b><span>我的学习进度</span></div>
        </div>
      </div>
      <div class="hero-visual">
        <div class="ecg-card" id="hero-ecg-card">
          <div class="ecg-toolbar">
            <div class="ecg-toolbar-group">
              <span class="badge badge-brand">II 导联</span>
              <span class="ecg-toolbar-label">25 mm/s · 10 mm/mV</span>
            </div>
            <div class="ecg-toolbar-group">
              <div class="ecg-tabs" role="group" aria-label="播放方式">
                <button class="ecg-tab active" type="button" data-hero-playback="sweep">循环覆盖</button>
                <button class="ecg-tab" type="button" data-hero-playback="scroll">连续滚动</button>
              </div>
              <button class="btn btn-xs btn-ghost" type="button" data-hero-play>${icon('play', 13)} 播放</button>
              <button class="btn btn-xs btn-ghost" type="button" data-hero-anno>标注</button>
            </div>
          </div>
          <div id="hero-ecg"></div>
          <div class="ecg-meta"><span>HR <b>72</b> bpm</span><span>PR <b>0.16</b> s</span><span>QRS <b>0.08</b> s</span><span>QT <b>0.38</b> s</span><span class="badge badge-ok">窦性</span></div>
        </div>
        <div class="hero-chips">
          <span class="hero-chip"><i class="dot"></i> P-QRS-T 顺序固定</span>
          <span class="hero-chip">${icon('target', 11)} 每条线索都可测量</span>
          <span class="hero-chip">${icon('monitor', 11)} 12 导联可切换</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><div class="page-eyebrow">CURRICULUM</div><h2 class="section-title">一条从基础到危重的判读路径</h2></div><a class="btn btn-ghost btn-sm" href="#/learn">查看全部 ${icon('arrowRight', 14)}</a></div>
      <div class="chapter-track">
        ${chapters.map((chapter, index) => {
          const pct = chapter.total ? Math.round((chapter.read / chapter.total) * 100) : 0;
          return `<a class="chapter-card" href="${chapter.id === 'theory' ? '#/intro' : `#/learn?chapter=${chapter.id}`}" style="--chapter-color:${chapterColor(chapter.color)}">
            <span class="chapter-index">CH ${String(index + 1).padStart(2, '0')} · ${pct}%</span>
            <span class="chapter-name">${escapeHtml(localizedName(chapter))}</span>
            <span class="chapter-desc">${escapeHtml(chapter.description || '')}</span>
            <span class="chapter-foot"><span class="progress grow"><span class="progress-bar" style="width:${pct}%"></span></span><span class="mono">${chapter.read}/${chapter.total}</span></span>
          </a>`;
        }).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div><div class="page-eyebrow">TODAY'S TRACING</div><h2 class="section-title">今日一图</h2></div><span class="section-kicker">先自己读 30 秒，再看解析</span></div>
      ${daily ? `<a class="daily-card" href="#/learn/${daily.id}">
        <div>
          <div class="row-wrap"><span class="badge badge-brand">${escapeHtml(daily.chapterName)}</span>${difficultyDots(daily.difficulty)}</div>
          <h3 style="margin-top:10px;font-size:22px;letter-spacing:-.03em">${escapeHtml(localizedName(daily))}</h3>
          ${getLocale() === 'zh' ? `<div class="muted" style="margin-top:3px;font-family:var(--font-mono);font-size:9px">${escapeHtml(daily.en || '')}</div>` : ''}
          <p class="muted" style="margin-top:8px;font-size:12.5px;max-width:480px">${escapeHtml(daily.oneLiner)}</p>
          <span class="feature-link">打开今日心电图 ${icon('arrowRight', 13)}</span>
        </div>
        <div class="mini-ecg"><canvas data-mini-id="${escapeHtml(daily.id)}"></canvas></div>
      </a>` : '<div class="learn-empty">内容加载中，请稍后刷新。</div>'}
    </section>

    <section class="section">
      <div class="section-head"><div><div class="page-eyebrow">TOOLS</div><h2 class="section-title">从系统判读到急救推演，同一套判读逻辑</h2></div></div>
      <div class="feature-grid">
        <a class="feature-card" href="#/daily">
          <div class="feature-icon" style="background:var(--accent-soft);color:var(--accent)">${icon('flame', 20)}</div><h3>每日挑战</h3><p>每天 10 道全站同题的心电图判读，连续完成累计打卡；独立计分，不占用测试分。</p><span class="feature-link">开始今日挑战 ${icon('arrowRight', 13)}</span>
        </a>
        <a class="feature-card" href="#/read">
          <div class="feature-icon" style="background:var(--brand-soft);color:var(--brand)">${icon('target', 20)}</div><h3>系统判读训练</h3><p>按频率 → 节律 → 电轴 → 间期 → ST-T → 结论六步读图，每一步即时反馈；最后提交诊断并进入错题本。</p><span class="feature-link">开始六步读图 ${icon('arrowRight', 13)}</span>
        </a>
        <a class="feature-card" href="#/vectors">
          <div class="feature-icon">${icon('compass', 20)}</div><h3>心脏向量实验室</h3><p>P/QRS/T 环、肢体/胸导联投影、动作电位与四腔瓣膜解剖；拖动旋转，理解心电图为什么长这样。</p><span class="feature-link">进入向量实验室 ${icon('arrowRight', 13)}</span>
        </a>
        <a class="feature-card" href="#/learn">
          <div class="feature-icon">${icon('bookOpen', 20)}</div><h3>诊断图谱</h3><p>${stats.articles || 200} 章结构化课程：从电生理、导联与向量，到肥厚、起搏、综合征、儿科和临床决策；诊断篇配可播放、可标注的心电图。</p><span class="feature-link">进入图谱 ${icon('arrowRight', 13)}</span>
        </a>
        <a class="feature-card" href="#/practice">
          <div class="feature-icon">${icon('target', 20)}</div><h3>判读练习</h3><p>从单诊断到组合诊断，服务端判分；错题可追问 AI，也可以按薄弱章节生成专项训练。</p><span class="feature-link">开始判读 ${icon('arrowRight', 13)}</span>
        </a>
        <a class="feature-card" href="#/sim">
          <div class="feature-icon" style="background:var(--accent-soft);color:var(--accent)">${icon('zap', 20)}</div><h3>急救推演</h3><p>CPR、非同步除颤、同步电复律、肾上腺素与起搏；按时间线与操作质量评分复盘。</p><span class="feature-link">进入急救 ${icon('arrowRight', 13)}</span>
        </a>
        <a class="feature-card" href="#/lab">
          <div class="feature-icon" style="background:var(--info-soft);color:var(--info)">${icon('flask', 20)}</div><h3>电解质实验室</h3><p>拖动钾、钙滑杆，实时观察 T 波、QT、QRS 与 U 波如何变化，并同步看到处理原则。</p><span class="feature-link">打开实验室 ${icon('arrowRight', 13)}</span>
        </a>
        ${store.ai?.allowed !== false ? `<div class="feature-card" style="cursor:default">
          <div class="feature-icon" style="background:var(--gold);color:#fff8f4">${icon('sparkles', 20)}</div><h3>AI 导师</h3><p>可接入 OpenAI 兼容 API；没有密钥时自动使用本地知识库回答，不影响学习与判分。支持错因解析、专项组卷与急救复盘。</p><span class="feature-link" style="color:var(--muted)">${store.ai?.configured ? 'AI 已接入' : '当前为本地模式'}</span>
        </div>` : ''}
      </div>
    </section>

    <section class="section">
      <div class="card card-pad" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;background:linear-gradient(120deg,var(--surface),var(--brand-soft))">
        <div><div class="page-eyebrow">NEXT STEP</div><h2 class="section-title">先读一张，再判一张。</h2><p class="muted" style="margin-top:4px;font-size:12.5px">学习进度保存在当前设备浏览器；本站暂不开放注册与普通用户登录。</p></div>
        <div class="row-wrap"><a class="btn btn-primary" href="#/practice">${icon('activity', 16)} 做一道题</a><a class="btn btn-secondary" href="#/me">${icon('user', 16)} ${store.user?.isGuest === false ? '查看我的进度' : '保存学习进度'}</a></div>
      </div>
    </section>
    ${medicalDisclaimer()}`;

  const spec = heroDiagnosis?.ecg || FALLBACK_SPEC;
  const viewerRoot = el.querySelector('#hero-ecg');
  let viewer = null;
  if (viewerRoot) {
    viewer = mountECG(viewerRoot, { ...spec, duration: 8, annotations: spec.annotations || FALLBACK_SPEC.annotations }, {
      mode: 'rhythm', speed: 1, showAnnotations: true, autoPlay: true,
      playbackMode: 'sweep', loop: true,
    });
    const playButton = el.querySelector('[data-hero-play]');
    const syncPlayButton = () => {
      if (playButton) playButton.innerHTML = viewer.playing ? `${icon('pause', 13)} 暂停` : `${icon('play', 13)} 播放`;
    };
    syncPlayButton();
    viewerRoot.addEventListener('ecg:play', syncPlayButton);
    viewerRoot.addEventListener('ecg:pause', syncPlayButton);
    viewerRoot.addEventListener('ecg:ended', syncPlayButton);
    playButton?.addEventListener('click', () => {
      if (viewer.playing) viewer.pause();
      else viewer.play(1);
      syncPlayButton();
    });
    el.querySelectorAll('[data-hero-playback]').forEach((button) => {
      button.addEventListener('click', () => {
        viewer.setPlayback(button.dataset.heroPlayback);
        el.querySelectorAll('[data-hero-playback]').forEach((b) => b.classList.toggle('active', b === button));
        syncPlayButton();
      });
    });
    let annotations = true;
    el.querySelector('[data-hero-anno]')?.addEventListener('click', (event) => {
      annotations = !annotations;
      viewer.setAnnotations(annotations);
      event.currentTarget.textContent = annotations ? '标注' : '隐藏标注';
    });
  }
  const dailyCanvas = el.querySelector('[data-mini-id]');
  if (dailyCanvas && daily) setupMiniECG(dailyCanvas, daily.preview);

  return {
    el,
    destroy() {
      if (viewer) viewer.destroy();
    },
  };
}
