const KEY = 'ecg-locale';

export const LOCALES = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
];

const DICT = {
  zh: {
    'nav.home': '首页', 'nav.learn': '学习', 'nav.intro': '导论', 'nav.ai': 'AI 导师', 'nav.practice': '练习', 'nav.sim': '急救', 'nav.lab': '实验室', 'nav.me': '我的',
    'nav.exam': '考试', 'nav.leaderboard': '排行', 'nav.review': '错题复习', 'nav.glossary': '术语表', 'nav.daily': '每日挑战',
    'brand.sub': 'ECG LAB · 读懂每一次心跳',
    'footer.about': '关于 / 勘误', 'footer.github': 'GitHub',
    'common.language': '语言', 'common.chinese': '中文', 'common.english': 'English',
  },
  en: {
    'nav.home': 'Home', 'nav.learn': 'Learn', 'nav.intro': 'Intro', 'nav.ai': 'AI Tutor', 'nav.practice': 'Practice', 'nav.sim': 'ACLS', 'nav.lab': 'Lab', 'nav.me': 'Profile',
    'nav.exam': 'Exam', 'nav.leaderboard': 'Ranks', 'nav.review': 'Review', 'nav.glossary': 'Glossary', 'nav.daily': 'Daily',
    'brand.sub': 'ECG LAB · Read every heartbeat',
    'footer.about': 'About / Corrections', 'footer.github': 'GitHub',
    'common.language': 'Language', 'common.chinese': '中文', 'common.english': 'English',
  },
};

// UI 文案翻译（课程正文、AI 回答、题目内容保持原文）
const EN_TEXT = {
  '首页': 'Home', '导论': 'Intro', '学习': 'Learn', '练习': 'Practice', '每日挑战': 'Daily Challenge',
  '考试': 'Exam', '排行': 'Ranks', '急救': 'ACLS', '实验室': 'Lab', '我的': 'Profile', 'AI 导师': 'AI Tutor',
  '错题复习': 'Wrong-book Review', '错题本': 'Wrong Book', '术语表': 'Glossary', '课程包': 'Course Packs',
  '开始学习': 'Start learning', '判读练习': 'ECG practice', '急救模拟': 'ACLS simulation',
  '查看全部': 'View all', '阅读': 'Read', '开始判读': 'Start practice', '开始今日挑战': 'Start today’s challenge',
  '今日挑战': 'Daily Challenge', '查看今日复盘': 'Review today', '保存昵称': 'Save name', '更新密码': 'Update password',
  '添加本机 Passkey': 'Add this device Passkey', '删除': 'Delete', '进入后台': 'Admin console', '退出登录': 'Sign out',
  '登录': 'Sign in', '注册保存进度': 'Register & save', '保存进度并注册': 'Save progress & register', '去登录': 'Go to sign in',
  '发送': 'Send', '提交答案': 'Submit answer', '下一题': 'Next', '上一题': 'Previous', '查看本轮结果': 'See results',
  '再来一局': 'Play again', '查看错题本': 'Open wrong book', '回到图谱': 'Back to atlas', '刷新': 'Refresh',
  '清空本地学习记录': 'Clear local data', '导出本地记录': 'Export data', '导入': 'Import',
  '打开心脏向量实验室': 'Open vector lab', '理论阅读': 'Theory reading', '基础课程': 'Basics course',
  '诊断图谱': 'Diagnosis Atlas', '心脏向量实验室': 'Cardiac Vector Lab', '电解质实验室': 'Electrolyte Lab',
  '测试排行榜': 'Leaderboard', '学习考试': 'Learn & Exam', '我的学习': 'My Learning', '错题本与间隔复习': 'Wrong Book & Spaced Review',
  '双语术语表': 'Bilingual Glossary', '区域指南差异': 'Regional Guideline Differences', '关于心迹': 'About', '急救推演': 'ACLS Scenarios',
  '全部': 'All', '常见核心': 'Common core', '不常见/进阶': 'Uncommon / advanced', '全部类型': 'All types',
  '全部基础': 'All basic', '全部进阶': 'All advanced', '全部挑战': 'All challenge', '全部理论': 'All theory',
  '基础': 'Basic', '进阶': 'Advanced', '挑战': 'Challenge', '理论': 'Theory', '难度': 'Difficulty', '章节': 'Chapter',
  '本局题数': 'Questions', '选择玩法': 'Game mode', '专项练习': 'Focused practice', '学习进度': 'Learning progress',
  '成长等级': 'Level', '账号与安全': 'Account & security', '测试积分与排行榜': 'Practice score & leaderboard',
  '错题与间隔复习': 'Wrong book & review', 'AI 专项计划': 'AI study plan', '外观主题': 'Appearance',
  '排行榜': 'Leaderboard', '快速开始': 'Quick start', '今日榜': 'Today', '本周榜': 'This week', '总榜': 'All time',
  '正确率': 'Accuracy', '答对': 'Correct', '答错': 'Wrong', '测试分': 'Practice score', '连续打卡': 'Streak',
  '最佳': 'Best', '累计': 'Total', '已读': 'Read', '已掌握': 'Mastered', '收藏': 'Favorites', '待复习': 'Due',
  '今日待复习': 'Due today', '忘记': 'Forgot', '模糊': 'Unsure', '记得': 'Remembered', '轻松': 'Easy',
  '正确': 'Correct', '错误': 'Wrong', '部分正确': 'Partial', '不熟练': 'Not fluent', '用时': 'Time used',
  '得分': 'Score', '经验': 'XP', '总用时': 'Total time', '错题': 'Wrong', '每日一次': 'Once a day',
  '取消': 'Cancel', '确认': 'Confirm', '保存': 'Save', '返回': 'Back', '退出': 'Exit', '继续': 'Continue',
  '分享': 'Share', '分享成绩': 'Share result', '复制链接': 'Copy link', '打开课程包': 'Open pack',
  '开始': 'Start', '关闭': 'Close', '提交': 'Submit', '生成题目': 'Generate quiz', '生成专项计划': 'Generate plan',
  '去 AI 导师出题': 'Generate quiz with AI', '让 AI 出题': 'AI quiz', '主题': 'Topic', '题数': 'Questions',
  '全部章节': 'All chapters', '全部难度': 'All difficulties', '全部优先级': 'All priorities',
  '跟随系统': 'System', '浅色': 'Light', '深色': 'Dark', '语言 / Language': 'Language',
  '心迹': 'ECG Lab', '篇已读': 'read', '本地': 'Local', '本地知识库降级可用': 'Local knowledge base fallback',
  '外观': 'Appearance', '访客 · 点击保存进度': 'Guest · tap to save', '不常见 / 进阶': 'Uncommon / advanced',
  '危急优先': 'Critical first', '急症相关': 'Emergency-related', '核心课程': 'Core courses', '进阶拓展': 'Advanced extension',
  '按课程顺序': 'Course order', '按紧急程度': 'Urgency', '难度从低到高': 'Difficulty ↑', '难度从高到低': 'Difficulty ↓', '薄弱优先': 'Weak first',
  '经典判读': 'Classic round', '极速 60 秒': 'Speed 60s', '连击生存': 'Combo survival',
  '按题数完成一局': 'Fixed-length round', '60 秒内尽可能多答': 'Answer as many as you can in 60s', '3 条命，答错扣命': '3 lives, wrong answer costs one',
  '单一诊断，常见图形': 'Single diagnosis, common patterns', '不典型表现与鉴别 · Lv.3 解锁': 'Atypical patterns · unlocks at Lv.3',
  '组合挑战': 'Combo challenge', '一张图两诊断 · Lv.5 解锁': 'Two diagnoses per ECG · unlocks at Lv.5',
  '按定位主题预选病例': 'Focused case sets by localization',
  '心梗定位专项': 'MI localization', '后壁与右室心梗': 'Posterior & RV MI', '房室阻滞专项': 'AV block', '束支与分支阻滞': 'Bundle branch blocks',
  '前壁 / 下壁 / 侧壁 / 后壁 / 右室': 'Anterior / inferior / lateral / posterior / RV',
  '可疑后壁 + 18 导联思路': 'Suspected posterior + 18-lead approach',
  '一度 / 二度 I、II / 三度': '1st / 2nd I, II / 3rd degree', 'RBBB / LBBB / 左前分支': 'RBBB / LBBB / LAFB',
  '循环覆盖': 'Loop', '连续滚动': 'Scroll', '暂停': 'Pause', '标注': 'Annotate', '播放': 'Play',
  '节律条 · 25 mm/s': 'Rhythm strip · 25 mm/s', '标准 12 导联': 'Standard 12-lead', '可切换显示模式': 'Switch display',
  '单图（无节律条）': 'Single plot (no rhythm strip)', '单导联': 'Single lead', '各导联横向': 'Leads side by side',
  '正常范围': 'Normal range', '当前心电图解释': 'Current interpretation', '心电理论（独立）': 'ECG theory (standalone)',
  '错题与复习': 'Wrong book & review', '打开错题本 →': 'Open wrong book →', '错题诊断': 'Wrong questions',
  '收藏章节': 'Saved chapters', '开始间隔复习': 'Start spaced review', '判读记录': 'Practice history', '去练习 →': 'Practice →',
  '还没有判读记录': 'No practice records yet', '开始练习': 'Start practice', '急救记录': 'ACLS history',
  'AI 分析薄弱项': 'AI weakness analysis', '按薄弱诊断组卷': 'Quiz by weak diagnoses', '今日复习已清空': 'Today’s review is clear',
};

const SKIP = 'article, .article-main, .article-body, .ai-bubble, .ai-stream-text, .ai-answer, .quiz-question, .option-list, .quiz-stem, .feedback-text, .explain-block, .diagnosis-line, .glossary-item, .ai-quiz-panel, canvas, svg, script, style, [data-no-i18n]';

export function getLocale() {
  try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh'; } catch { return 'zh'; }
}

export function setLocale(locale) {
  const normalized = locale === 'en' ? 'en' : 'zh';
  try { localStorage.setItem(KEY, normalized); } catch { /* private mode */ }
  if (typeof document !== 'undefined') document.documentElement.lang = normalized === 'en' ? 'en' : 'zh-CN';
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ecg-locale-change', { detail: { locale: normalized } }));
  return normalized;
}

export function t(key, fallback = '') {
  return DICT[getLocale()]?.[key] || DICT.zh[key] || fallback || key;
}

export function localeLabel(id) {
  return LOCALES.find((locale) => locale.id === id)?.label || id;
}

export function navKey(path) {
  return `nav.${({ '/': 'home', '/learn': 'learn', '/intro': 'intro', '/ai': 'ai', '/practice': 'practice', '/daily': 'daily', '/exam': 'exam', '/leaderboard': 'leaderboard', '/sim': 'sim', '/lab': 'lab', '/me': 'me', '/review': 'review', '/glossary': 'glossary', '/guidelines': 'guidelines' })[path] || 'home'}`;
}

let applying = false;

export function applyLocale(root) {
  if (typeof document === 'undefined' || getLocale() !== 'en') return;
  const host = root || document.body;
  if (!host) return;
  applying = true;
  try {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest(SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const raw = node.nodeValue;
      const trimmed = raw.trim();
      const translated = EN_TEXT[trimmed];
      if (translated) node.nodeValue = raw.replace(trimmed, translated);
    });
    host.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
      if (el.closest(SKIP)) return;
      ['placeholder', 'title', 'aria-label'].forEach((attr) => {
        const value = el.getAttribute(attr);
        if (!value) return;
        const trimmed = value.trim();
        if (EN_TEXT[trimmed]) el.setAttribute(attr, value.replace(trimmed, EN_TEXT[trimmed]));
      });
    });
  } finally {
    applying = false;
  }
}

export function startLocaleObserver() {
  if (typeof window === 'undefined' || getLocale() !== 'en') return;
  if (window.__ECG_I18N_OBSERVER__) return;
  let timer = null;
  const schedule = () => {
    if (applying || timer) return;
    timer = window.setTimeout(() => {
      timer = null;
      applyLocale(document.body);
    }, 80);
  };
  const observer = new MutationObserver(schedule);
  ['#app', '#modal-root', '#toast-region'].forEach((selector) => {
    const node = document.querySelector(selector);
    if (node) observer.observe(node, { childList: true, subtree: true, characterData: true });
  });
  window.__ECG_I18N_OBSERVER__ = observer;
  applyLocale(document.body);
}
