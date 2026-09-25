// Classic (non-module) script loaded in <head> so the theme applies before first paint.
// Reads the same key ThemeToggle writes through Storage ("ict:" prefix + "pref:theme").
(function () {
  var theme = null;
  try {
    theme = JSON.parse(localStorage.getItem('ict:pref:theme'));
  } catch (e) { /* storage unavailable: fall back to the OS setting */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
