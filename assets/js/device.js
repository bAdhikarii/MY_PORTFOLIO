(function () {
  'use strict';

  // Shared device classifier: desktop / tablet / mobile.
  // Exposes: <html data-device="desktop|tablet|mobile"> + window.__device
  // Supports preview override: ?view=tablet | ?view=mobile | ?view=desktop
  function classify() {
    try {
      var q = new URLSearchParams(window.location.search).get('view');
      if (q === 'mobile' || q === 'tablet' || q === 'desktop') return q;
    } catch (e) {}
    try {
      if (window.matchMedia('(max-width: 700px)').matches) return 'mobile';
      if (window.matchMedia('(max-width: 1040px)').matches) return 'tablet';
    } catch (e) {}
    var w = window.innerWidth || 1280;
    if (w <= 700) return 'mobile';
    if (w <= 1040) return 'tablet';
    return 'desktop';
  }

  function apply() {
    var d = classify();
    document.documentElement.setAttribute('data-device', d);
    try { window.__device = d; } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent('devicechange', { detail: { device: d } }));
    } catch (e) {}
  }

  apply();
  var t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(apply, 150);
  });
})();
