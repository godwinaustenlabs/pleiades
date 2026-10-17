/*
 * Runs before the app, so the first paint already has the right theme and the
 * standalone (installed app) class. Kept out of index.html so the Content-Security-
 * Policy in _headers can forbid inline scripts outright.
 */
(function () {
  var t = localStorage.getItem('theme') || 'system';
  var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
  // Installed standalone, the app is not a browser tab: `.standalone` is
  // what lets the stylesheet drop browser-only affordances and pick up the
  // safe-area padding a tab does not need.
  var standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true;
  if (standalone) document.documentElement.classList.add('standalone');
})();
