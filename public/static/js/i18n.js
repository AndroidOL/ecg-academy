const KEY = 'ecg-locale';
let GENERATED = {};
let CONTENT = {};
try {
  if (typeof window !== 'undefined') {
    const version = new URL(import.meta.url).searchParams.get('v');
    const load = async (file) => {
      const url = new URL(file, import.meta.url);
      if (version) url.searchParams.set('v', version);
      return (await import(url.href)).default || {};
    };
    GENERATED = await load('./i18n.map.js');
    let stored = null;
    try { stored = localStorage.getItem(KEY); } catch { /* private mode */ }
    if (stored === 'en') CONTENT = await load('./i18n.content.js');
  }
} catch { /* generated catalogs are optional */ }

export const LOCALES = [
  { id: 'zh', label: '中文', short: '中' },
  { id: 'en', label: 'English', short: 'EN' },
];

const HTML_LANG = { zh: 'zh-CN', en: 'en' };

const DICT = {
  zh: {
    'nav.home': '首页', 'nav.learn': '学习', 'nav.intro': '导论', 'nav.ai': 'AI 导师', 'nav.practice': '练习', 'nav.read': '系统判读', 'nav.sim': '急救', 'nav.lab': '实验室', 'nav.me': '我的',
    'nav.exam': '考试', 'nav.leaderboard': '排行', 'nav.review': '错题复习', 'nav.glossary': '术语表', 'nav.daily': '每日挑战',
    'brand.sub': 'ECG LAB · 读懂每一次心跳',
    'footer.about': '关于 / 勘误', 'footer.github': 'GitHub',
    'common.language': '语言', 'common.chinese': '中文', 'common.english': 'English',
  },
  en: {
    'nav.home': 'Home', 'nav.learn': 'Learn', 'nav.intro': 'Intro', 'nav.ai': 'AI Tutor', 'nav.practice': 'Practice', 'nav.read': 'Guided Read', 'nav.sim': 'ACLS', 'nav.lab': 'Lab', 'nav.me': 'Profile',
    'nav.exam': 'Exam', 'nav.leaderboard': 'Ranks', 'nav.review': 'Review', 'nav.glossary': 'Glossary', 'nav.daily': 'Daily',
    'brand.sub': 'ECG LAB · Read every heartbeat',
    'footer.about': 'About / Corrections', 'footer.github': 'GitHub',
    'common.language': 'Language', 'common.chinese': '中文', 'common.english': 'English',
  },
};

// UI 文案翻译（课程正文、AI 回答、题目内容保持原文）
const EN_TEXT = {
  '首页': 'Home', '导论': 'Intro', '学习': 'Learn', '练习': 'Practice', '每日挑战': 'Daily Challenge', '系统判读': 'Guided Read',
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
  '请判读该心电图，选择最可能的诊断。': 'Interpret this ECG and choose the most likely diagnosis.',
  '该心电图最符合哪项诊断？': 'Which diagnosis best fits this ECG?',
  '该心电图包含哪些诊断？（多选）': 'Which diagnoses does this ECG show? (Select all)',
  '诊断标准': 'Diagnostic criteria', '鉴别诊断': 'Differential diagnosis', '记忆锦囊': 'Memory pearls',
  '该心电图最可能的诊断是？': 'What is the most likely diagnosis?',
  '选择所有符合的诊断后再提交。': 'Select all matching diagnoses before submitting.',
  '选择一个最可能的诊断。': 'Select the most likely diagnosis.',
  '选择一个最可能的诊断。 · 键盘 1–5 / Enter': 'Select the most likely diagnosis. · Keys 1–5 / Enter',
  '选择所有符合的诊断后再提交。 · 键盘 1–5 / Enter': 'Select all matching diagnoses before submitting. · Keys 1–5 / Enter',
  '已提交，查看下方解析。': 'Submitted — see the explanation below.',
  '退出本局': 'Exit round', '判分中': 'Scoring',
  '出题中': 'Loading question', '多选': 'Multiple choice', '单选 · 服务端判分': 'Single choice · server-scored',
  '本题得分': 'Score', '正确答案': 'Correct answer', '你的选择': 'Your selection',
  '免费开源心电图教学 · 内容持续迭代': 'Free open-source ECG education · continuously updated',
  '教学用途，不构成诊断或治疗建议。': 'For education only; not diagnostic or treatment advice.',
  '系统判读训练': 'Guided ECG reading', '频率': 'Rate', '节律': 'Rhythm', '电轴': 'Axis', '间期': 'Intervals', '结论': 'Conclusion',
  '1 · 频率': '1 · Rate', '2 · 节律': '2 · Rhythm', '3 · 电轴': '3 · Axis', '4 · 间期': '4 · Intervals', '5 · ST-T 与 U 波': '5 · ST-T & U wave', '6 · 结论': '6 · Conclusion',
  '结构化 5 步': '5 structured steps', '每题独立计分': 'Scored per case', '待作答': 'Pending', '需复习': 'Review',
  '确认本步': 'Confirm step', '开始六步读图': 'Start guided read', '提交诊断': 'Submit diagnosis', '下一例': 'Next case', '换一例': 'New case',
  '加载中…': 'Loading…', '正在生成病例…': 'Generating case…',
  '心动过缓（<60 次/分）': 'Bradycardia (<60 bpm)', '正常范围（60–100 次/分）': 'Normal (60–100 bpm)', '心动过速（>100 次/分）': 'Tachycardia (>100 bpm)',
  '窦性心律': 'Sinus rhythm', '房性快速性心律失常': 'Atrial tachyarrhythmia', '室上性心动过速': 'SVT', '室性心律失常': 'Ventricular arrhythmia', '逸搏 / 交界性心律': 'Escape / junctional',
  '正常电轴': 'Normal axis', '电轴左偏': 'Left axis deviation', '电轴右偏': 'Right axis deviation',
  '均无显著异常': 'No significant abnormality', 'ST 段抬高': 'ST elevation', 'ST 段压低': 'ST depression', 'T 波形态改变': 'T-wave change', 'U 波显著': 'Prominent U wave', '无显著 ST-T 改变': 'No significant ST-T change',
  '按顺序读图，再下结论': 'Read in order, then conclude',
  'AI 分析薄弱项': 'AI weakness analysis', '按薄弱诊断组卷': 'Quiz by weak diagnoses', '今日复习已清空': 'Today’s review is clear',
};

const OVERRIDES = {
  '种判读诊断': 'diagnoses', '章系统课程': 'chapters', '个系统章节': 'chapters', '篇已读': 'read',
  '篇课程': 'courses', '个章节': 'chapters', '个结果': 'results', '题': 'questions',
  '种判读诊断。': 'diagnoses.', '条线索': 'clues',
  '安静': 'Quiet', '专注': 'Focused', '好奇': 'Curious', '敏锐': 'Keen', '沉着': 'Calm',
  '清醒': 'Clear', '笃定': 'Steady', '温和': 'Gentle', '坚定': 'Firm', '灵动': 'Agile',
  '听诊器': 'Stethoscope', '心电笔': 'ECG Pen', '小示波器': 'Scope', '窦房结': 'SA Node',
  '除颤仪': 'Defibrillator', '心电图纸': 'ECG Paper', '白大褂': 'White Coat', '叩诊锤': 'Reflex Hammer',
  '等电位线 · 各环静止': 'Baseline · all loops idle',
  'P 波 · P 环活动，其他环静止': 'P wave · P loop active, other loops idle',
  'QRS 波 · QRS 环活动，其他环静止': 'QRS · QRS loop active, other loops idle',
  'T 波 · T 环活动，其他环静止': 'T wave · T loop active, other loops idle',
  '当前时间：T 波 · T 环活动，其他环静止': 'Current phase: T wave · T loop active, other loops still',
  'II 导联 · 时间光标': 'Lead II · time cursor',
  '心迹 ECG Lab': 'ECG Lab', '心迹 ECG Lab 首页': 'ECG Lab home',
  '12 导联': '12-lead', '12 导联较宽，可左右滑动查看。': 'The 12-lead view is wider; scroll horizontally to inspect.',
  'II 导联': 'Lead II', 'V1 导联': 'Lead V1', 'V5 导联': 'Lead V5',
  'P-QRS-T 与间期对照': 'P-QRS-T and interval reference',
  'PR 间期': 'PR interval', 'P 波': 'P wave', 'QRS 波群': 'QRS complex', 'QT 间期': 'QT interval', 'ST 段 / T 波': 'ST segment / T wave',
  '上一篇': 'Previous', '下一篇': 'Next', '临床连接': 'Clinical links', '判读步骤': 'Reading steps',
  '危险信号': 'Red flags', '参考来源': 'References', '参考资料': 'References', '发生机制': 'Mechanism',
  '处理原则': 'Management', '学习目标': 'Objectives', '定义': 'Definition', '已读': 'Read',
  '床旁速记': 'Bedside pearls', '异常标注': 'Annotations', '循环覆盖': 'Loop', '教科书': 'Textbook',
  '教学心电图': 'Teaching ECG', '易错点': 'Pitfalls', '暂无': 'None', '本例 HR': 'Case HR', '次/分': 'bpm',
  '正常对照': 'Normal reference', '波形解剖 · 间期测量 · 图文对应': 'Waveform anatomy · interval measurement · figure correlation',
  '相关阅读': 'Related reading', '纸速 25 mm/s · 增益 10 mm/mV': 'Paper speed 25 mm/s · gain 10 mm/mV',
  '节律条': 'Rhythm strip', '单周期放大 · 2.2 s 窗口': 'Single-cycle zoom · 2.2 s window',
  '可播放 · 可测量 · 可切换 12 导联': 'Playable · measurable · switchable 12-lead', '心率': 'Heart rate',
  '必须记住': 'Must remember', '窦性心律 · 72 次/分': 'Sinus rhythm · 72 bpm',
  '从 P 波起点到 QRS 起点，代表房室传导时间；正常 0.12–0.20 s。': 'From P-wave onset to QRS onset, representing AV conduction time; normal 0.12–0.20 s.',
  '从 QRS 起点到 T 波终点，反映电收缩总时间；需按心率校正为 QTc。': 'From QRS onset to T-wave end, reflecting total electrical systole; correct for heart rate as QTc.',
  '心房除极产生，位于 QRS 之前；II 导联通常直立，宽度 <0.12 s。': 'Generated by atrial depolarization, preceding QRS; usually upright in lead II and <0.12 s wide.',
  '心室除极产生，正常 <0.12 s；增宽提示束支阻滞、室性起源或电解质异常。': 'Generated by ventricular depolarization; normally <0.12 s. Widening suggests bundle branch block, ventricular origin, or electrolyte abnormality.',
  '心室复极；T 波方向通常与 QRS 主波一致，ST 段偏移需结合相邻导联与临床。': 'Ventricular repolarization; T-wave direction usually follows the QRS main vector. Interpret ST deviation with adjacent leads and clinical context.',
};
const ADJ_EN = { '安静': 'Quiet', '专注': 'Focused', '好奇': 'Curious', '敏锐': 'Keen', '沉着': 'Calm', '清醒': 'Clear', '笃定': 'Steady', '温和': 'Gentle', '坚定': 'Firm', '灵动': 'Agile' };
const NOUN_EN = { '听诊器': 'Stethoscope', '心电笔': 'ECG Pen', '小示波器': 'Scope', '窦房结': 'SA Node', '除颤仪': 'Defibrillator', '心电图纸': 'ECG Paper', '白大褂': 'White Coat', '叩诊锤': 'Reflex Hammer' };
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RULES = [
  [/^(\d+) 种判读诊断$/, (m) => `${m[1]} diagnoses`],
  [/^(\d+) 章系统课程$/, (m) => `${m[1]} chapters`],
  [/^(\d+) 个系统章节$/, (m) => `${m[1]} chapters`],
  [/^(\d+) 篇已读$/, (m) => `${m[1]} read`],
  [/^(\d+) 篇课程$/, (m) => `${m[1]} courses`],
  [/^(\d+) 个章节$/, (m) => `${m[1]} chapters`],
  [/^(\d+) 个结果$/, (m) => `${m[1]} results`],
  [/^已读 (\d+) \/ (\d+)$/, (m) => `Read ${m[1]} / ${m[2]}`],
  [/^已掌握 (\d+)$/, (m) => `Mastered ${m[1]}`],
  [/^继续：(.+)$/, (m) => `Continue: ${translatePhrase(m[1])}`],
  [/^第 (\d+) \/ (\d+) 题$/, (m) => `Question ${m[1]} / ${m[2]}`],
  [/^第 (\d+) 题$/, (m) => `Question ${m[1]}`],
  [/^(\d+) \/ (\d+) 页 · 共 (\d+) 章$/, (m) => `Page ${m[1]} / ${m[2]} · ${m[3]} chapters`],
  [/^第 (\d+) 页$/, (m) => `Page ${m[1]}`],
  [/^Lv\.(\d+) 解锁$/, (m) => `Unlocks at Lv.${m[1]}`],
  [/^难度 (\d+) 级$/, (m) => `Difficulty ${m[1]}`],
  [/^连续 (\d+) 天$/, (m) => `${m[1]}-day streak`],
  [/^最佳 (\d+) 天$/, (m) => `Best ${m[1]} days`],
  [/^累计 (\d+) 天$/, (m) => `Total ${m[1]} days`],
  [/^(\d+) 个待复习$/, (m) => `${m[1]} due`],
  [/^(\d+) 个错题$/, (m) => `${m[1]} wrong`],
  [/^(\d+) 个收藏$/, (m) => `${m[1]} saved`],
  [/^(\d+) 题$/, (m) => `${m[1]} questions`],
  [/^(\d+) 次作答$/, (m) => `${m[1]} attempts`],
  [/^正确率 (\d+)%$/, (m) => `Accuracy ${m[1]}%`],
  [/^题库 (\d+) 道$/, (m) => `Bank ${m[1]}`],
  [/^测试分 (-?\d+)$/, (m) => `Score ${m[1]}`],
  [/^已学习 (\d+) \/ (\d+)$/, (m) => `Learned ${m[1]} / ${m[2]}`],
  [/^(\d+) 道章节题$/, (m) => `${m[1]} section questions`],
  [/^已学习 (\d+) \/ (\d+)$/, (m) => `Learned ${m[1]} / ${m[2]}`],
  [/^当前时间：(.+)$/, (m) => `Current phase: ${translatePhrase(m[1]) || m[1]}`],
  [/^II 导联 · 时间光标$/, () => 'Lead II · time cursor'],
  [/^(\d+)月(\d+)日\s*(未完成|已完成)?$/, (m, text) => `${MONTHS_EN[(Number(m[1]) || 1) - 1]} ${Number(m[2])}${m[3] === '已完成' ? ' · Done' : m[3] === '未完成' ? ' · Missed' : ''}`, 'date'],
];
function translatePhrase(value) {
  const text = TEXT[getLocale()];
  if (!text) return value;
  if (OVERRIDES[value] !== undefined) return OVERRIDES[value];
  if (text[value] !== undefined) return text[value];
  for (const [re, fn, kind] of RULES) {
    const match = value.match(re);
    if (match) return kind === 'date' ? fn(match, value) : fn(match);
  }
  const guest = value.match(/^(.+?)(听诊器|心电笔|小示波器|窦房结|除颤仪|心电图纸|白大褂|叩诊锤)·(\d+)$/);
  if (guest && ADJ_EN[guest[1]] && NOUN_EN[guest[2]]) return `${ADJ_EN[guest[1]]} ${NOUN_EN[guest[2]]} · ${guest[3]}`;
  return null;
}
const TEXT = { en: { ...EN_TEXT, ...GENERATED, ...CONTENT, ...OVERRIDES } };

const SKIP = '.ai-bubble, .ai-stream-text, .ai-answer, .ai-quiz-panel, canvas, svg, script, style, [data-no-i18n]';

export function getLocale() {
  try {
    const stored = localStorage.getItem(KEY);
    if (LOCALES.some((locale) => locale.id === stored)) return stored;
  } catch { /* private mode */ }
  return 'zh';
}

export function setLocale(locale) {
  const normalized = LOCALES.some((item) => item.id === locale) ? locale : 'zh';
  try { localStorage.setItem(KEY, normalized); } catch { /* private mode */ }
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[normalized] || normalized;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ecg-locale-change', { detail: { locale: normalized } }));
  return normalized;
}

export function t(key, fallback = '') {
  const locale = getLocale();
  return DICT[locale]?.[key] || DICT.en?.[key] || DICT.zh[key] || fallback || key;
}

export function localizedName(item) {
  if (!item) return '';
  if (getLocale() === 'en') return item.nameEn || item.en || item.name || '';
  return item.name || '';
}

export function localeLabel(id) {
  return LOCALES.find((locale) => locale.id === id)?.label || id;
}

export function navKey(path) {
  return `nav.${({ '/': 'home', '/learn': 'learn', '/intro': 'intro', '/ai': 'ai', '/practice': 'practice', '/read': 'read', '/daily': 'daily', '/exam': 'exam', '/leaderboard': 'leaderboard', '/sim': 'sim', '/lab': 'lab', '/me': 'me', '/review': 'review', '/glossary': 'glossary', '/guidelines': 'guidelines' })[path] || 'home'}`;
}

let applying = false;

export function applyLocale(root) {
  if (typeof document === 'undefined') return;
  const text = TEXT[getLocale()];
  if (!text) return;
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
      const translated = translatePhrase(trimmed) || text[trimmed];
      if (translated) node.nodeValue = raw.replace(trimmed, translated);
    });
    host.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
      if (el.closest(SKIP)) return;
      ['placeholder', 'title', 'aria-label'].forEach((attr) => {
        const value = el.getAttribute(attr);
        if (!value) return;
        const trimmed = value.trim();
        const translated = translatePhrase(trimmed) || text[trimmed];
        if (translated) el.setAttribute(attr, value.replace(trimmed, translated));
      });
    });
  } finally {
    applying = false;
  }
}

export function startLocaleObserver() {
  if (typeof window === 'undefined' || !TEXT[getLocale()]) return;
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
