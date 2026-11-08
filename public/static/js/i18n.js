const KEY = 'ecg-locale';
const DICT = {
  zh: {
    'nav.home': '首页', 'nav.learn': '学习', 'nav.practice': '练习', 'nav.sim': '急救', 'nav.lab': '实验室', 'nav.me': '我的',
    'nav.exam': '考试', 'nav.leaderboard': '排行', 'nav.review': '错题复习', 'nav.glossary': '术语表', 'nav.daily': '每日挑战',
    'brand.sub': 'ECG LAB · 读懂每一次心跳',
    'footer.about': '关于 / 勘误', 'footer.github': 'GitHub',
    'common.language': '语言', 'common.chinese': '中文', 'common.english': 'English',
  },
  en: {
    'nav.home': 'Home', 'nav.learn': 'Learn', 'nav.practice': 'Practice', 'nav.sim': 'ACLS', 'nav.lab': 'Lab', 'nav.me': 'Profile',
    'nav.exam': 'Exam', 'nav.leaderboard': 'Ranks', 'nav.review': 'Review', 'nav.glossary': 'Glossary', 'nav.daily': 'Daily',
    'brand.sub': 'ECG LAB · Read every heartbeat',
    'footer.about': 'About / Corrections', 'footer.github': 'GitHub',
    'common.language': 'Language', 'common.chinese': '中文', 'common.english': 'English',
  },
};

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

export function navKey(path) {
  return `nav.${({ '/': 'home', '/learn': 'learn', '/practice': 'practice', '/daily': 'daily', '/exam': 'exam', '/leaderboard': 'leaderboard', '/sim': 'sim', '/lab': 'lab', '/me': 'me', '/review': 'review', '/glossary': 'glossary', '/guidelines': 'guidelines' })[path] || 'home'}`;
}
