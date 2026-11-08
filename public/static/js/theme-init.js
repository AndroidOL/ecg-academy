(function () {
  try {
    var query = new URLSearchParams(window.location.search);
    var stored = query.get('theme') || localStorage.getItem('ecg-theme') || 'auto';
    if (!['auto', 'light', 'dark'].includes(stored)) stored = 'auto';
    var effective = stored;
    if (stored === 'auto') {
      effective = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = effective;
    document.documentElement.dataset.themeMode = stored;
    document.documentElement.style.colorScheme = effective;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effective === 'dark' ? '#071417' : '#0e766e');
  } catch (error) {
    document.documentElement.dataset.theme = 'light';
  }
})();
