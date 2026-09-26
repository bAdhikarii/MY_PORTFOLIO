(function () {
  'use strict';
  var canvas = document.getElementById('sim');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var stepsEl = document.getElementById('steps');
  var wpEl = document.getElementById('wp');
  var statusEl = document.getElementById('status');
  var playBtn = document.getElementById('play');
  var points = [
    [70, 200], [200, 80], [340, 190], [470, 70], [570, 180]
  ];
  var seg = 0, k = 0, steps = 0, playing = false;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = 'rgba(18,18,20,.08)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx <= W; gx += 32) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy <= H; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    // trail
    ctx.strokeStyle = 'rgba(53,95,229,.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i <= seg; i++) ctx.lineTo(points[i][0], points[i][1]);
    var a = points[seg], b = points[Math.min(seg + 1, points.length - 1)];
    ctx.lineTo(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k);
    ctx.stroke();
    // waypoints
    points.forEach(function (p, idx) {
      var reached = idx <= seg;
      ctx.fillStyle = reached ? '#0f7a3d' : '#fff';
      ctx.strokeStyle = reached ? '#0f7a3d' : '#8b8b8e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = reached ? '#fff' : '#67676a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), p[0], p[1] + 0.5);
    });
    // robot
    var rx = a[0] + (b[0] - a[0]) * k, ry = a[1] + (b[1] - a[1]) * k;
    ctx.fillStyle = '#355fe5';
    ctx.beginPath(); ctx.arc(rx, ry, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(rx, ry, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  function tick() {
    if (!playing) return;
    k += 0.02;
    steps += 2;
    if (k >= 1) {
      k = 0;
      if (seg < points.length - 2) { seg++; }
      else { seg = points.length - 1; playing = false; playBtn.textContent = 'Replay'; statusEl.textContent = 'Complete'; }
    }
    stepsEl.textContent = steps;
    wpEl.textContent = Math.min(seg + 1, 5);
    draw();
    if (playing) requestAnimationFrame(tick);
  }
  playBtn.addEventListener('click', function () {
    if (!playing && seg >= points.length - 1) { seg = 0; k = 0; steps = 0; }
    playing = !playing;
    playBtn.textContent = playing ? 'Pause' : 'Play';
    statusEl.textContent = playing ? 'Running' : 'Paused';
    if (playing) requestAnimationFrame(tick);
  });
  document.getElementById('reset').addEventListener('click', function () {
    seg = 0; k = 0; steps = 0; playing = false;
    playBtn.textContent = 'Play'; statusEl.textContent = 'Paused';
    stepsEl.textContent = '0'; wpEl.textContent = '1';
    draw();
  });
  draw();
})();
