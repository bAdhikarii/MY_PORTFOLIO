(function () {
  'use strict';
  var bars = Array.prototype.slice.call(document.querySelectorAll('.bar i'));
  var counts = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
  function paint() {
    bars.forEach(function (b) {
      var row = b.closest('li');
      b.style.width = b.getAttribute('data-w') + '%';
      row.querySelector('b').textContent = b.getAttribute('data-w') + '%';
    });
  }
  function countUp(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var start = null;
    function tick(t) {
      if (!start) start = t;
      var p = Math.min((t - start) / 900, 1);
      el.textContent = Math.round(target * p);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  window.addEventListener('load', function () {
    setTimeout(paint, 150);
    counts.forEach(countUp);
  });
  document.getElementById('week').addEventListener('click', function () {
    bars.forEach(function (b) {
      var w = Math.min(parseInt(b.getAttribute('data-w'), 10) + 2 + Math.floor(Math.random() * 5), 99);
      b.setAttribute('data-w', w);
    });
    counts.forEach(function (el) {
      el.setAttribute('data-count', parseInt(el.getAttribute('data-count'), 10) + 1 + Math.floor(Math.random() * 3));
      countUp(el);
    });
    paint();
  });
})();
