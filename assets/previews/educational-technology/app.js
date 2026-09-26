(function () {
  'use strict';
  document.querySelectorAll('.ed-students button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.closest('li').classList.toggle('graded');
    });
  });
  var boxes = Array.prototype.slice.call(document.querySelectorAll('.ed-tasks input[type="checkbox"]'));
  var count = document.getElementById('task-count');
  function render() {
    var done = boxes.filter(function (b) { return b.checked; }).length;
    count.textContent = done + ' of ' + boxes.length + ' tasks done';
  }
  boxes.forEach(function (b) { b.addEventListener('change', render); });
  render();
})();
