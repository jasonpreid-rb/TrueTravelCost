/* TrueTravelCost embed: host-page helper.
   Resizes any TrueTravelCost iframe on the page to fit its content. Optional; without it the
   iframe simply keeps the min-height set in the snippet. */
(function () {
  'use strict';
  var ORIGINS = ['https://www.truetravelcost.com', 'https://truetravelcost.com'];
  window.addEventListener('message', function (e) {
    if (ORIGINS.indexOf(e.origin) === -1) return;
    var d = e.data;
    if (!d || d.type !== 'ttc-embed-height' || typeof d.height !== 'number') return;
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        frames[i].style.height = Math.min(Math.max(Math.round(d.height), 300), 4000) + 'px';
      }
    }
  });
})();
