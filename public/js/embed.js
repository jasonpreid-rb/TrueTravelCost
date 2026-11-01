/* TrueTravelCost embed mode.
   Active only when the page is loaded as /?embed=1 (normally inside an iframe on a partner site).
   Strips the site chrome, adds a small credit line, reports the content height to the parent page,
   and tags analytics events with the partner name. Does nothing on normal page loads. */
(function () {
  'use strict';
  var params;
  try { params = new URLSearchParams(location.search); } catch (e) { return; }
  if (params.get('embed') !== '1') return;

  var root = document.documentElement;
  root.classList.add('ttc-embed');

  var partner = (params.get('partner') || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40) || 'unknown';

  // Optional ?theme=dark forces dark mode; otherwise the page default applies.
  if (params.get('theme') === 'dark') root.setAttribute('data-theme', 'dark');

  // Embedded copies must not be indexed (the canonical page is /).
  var robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, follow';
  document.head.appendChild(robots);

  // Styles are injected here (not a separate file) so the chrome never flashes before it is hidden.
  var css = [
    'html.ttc-embed, html.ttc-embed body { height: auto !important; min-height: 0 !important; }',
    'html.ttc-embed header.top,',
    'html.ttc-embed .hero h1,',
    'html.ttc-embed .hero p.lead,',
    'html.ttc-embed .hero .trust-strip,',
    'html.ttc-embed .capability-strip,',
    'html.ttc-embed .about-ttc,',
    'html.ttc-embed footer.legend,',
    'html.ttc-embed .mobile-total,',
    'html.ttc-embed #altTrips,',
    'html.ttc-embed #savedTripsPanel,',
    'html.ttc-embed #saveTripBtn { display: none !important; }',
    'html.ttc-embed .wrap { max-width: none !important; padding: 12px 14px 8px !important; }',
    'html.ttc-embed .hero { padding-top: 0 !important; margin-bottom: 12px !important; }',
    'html.ttc-embed .meter { position: static !important; }',
    'html.ttc-embed .ttc-embed-credit { margin: 14px 0 0; padding-top: 10px; border-top: 1px solid var(--line, #d9dfe3);',
    '  font-size: 12px; line-height: 1.5; text-align: center; color: var(--muted, #71808D); }',
    'html.ttc-embed .ttc-embed-credit a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }',
    'html.ttc-embed .ttc-embed-credit a:hover { color: var(--text, #071A2B); }'
  ].join('\n');
  var style = document.createElement('style');
  style.setAttribute('data-ttc-embed', '');
  style.textContent = css;
  document.head.appendChild(style);

  // Analytics: gtag() is defined by the inline snippet earlier in <head>.
  // Register embed_partner / embed_host as custom dimensions in GA4 to report on them.
  function track() {
    if (typeof gtag !== 'function') return;
    var host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { /* ignore */ }
    gtag('set', { embed_partner: partner, embed_host: host });
    gtag('event', 'embed_view', { embed_partner: partner, embed_host: host });
  }

  function addCredit() {
    var wrap = document.querySelector('.wrap');
    if (!wrap) return;
    var base = 'https://www.truetravelcost.com/';
    var utm = '?utm_source=embed&utm_medium=widget&utm_campaign=' + encodeURIComponent(partner);
    var div = document.createElement('div');
    div.className = 'ttc-embed-credit';
    div.innerHTML = 'Calculator by <a href="' + base + utm + '" target="_blank" rel="noopener">TrueTravelCost</a>' +
      ' &middot; <a href="' + base + 'methodology/' + utm + '" target="_blank" rel="noopener">How the numbers work</a>';
    wrap.appendChild(div);
  }

  // Tell the host page how tall the content is so it can resize the iframe.
  var lastHeight = 0;
  function postHeight() {
    if (window.parent === window) return;
    var h = Math.ceil(root.getBoundingClientRect().height);
    if (!h || h === lastHeight) return;
    lastHeight = h;
    window.parent.postMessage({ type: 'ttc-embed-height', height: h, partner: partner }, '*');
  }

  function init() {
    addCredit();
    track();
    postHeight();
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(postHeight);
      ro.observe(document.body);
      ro.observe(root);
    } else {
      setInterval(postHeight, 500);
    }
    window.addEventListener('load', postHeight);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(postHeight);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
