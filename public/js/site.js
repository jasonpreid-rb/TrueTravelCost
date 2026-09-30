/* TrueTravelCost - shared site behaviour: light/dark theme switch.
   The saved theme is applied before first paint by a tiny inline script in the head partial. */
(function () {
  var root = document.documentElement;
  var btn = document.getElementById('themeToggle');
  if (!btn) return;

  function sync() {
    btn.setAttribute('aria-checked', root.getAttribute('data-theme') === 'dark' ? 'true' : 'false');
  }
  sync();

  btn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('ttc-theme', next); } catch (e) {}
    sync();
  });
})();
