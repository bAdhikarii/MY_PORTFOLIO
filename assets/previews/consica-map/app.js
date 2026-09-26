(function () {
  'use strict';
  var speedEl = document.getElementById('speed');
  var posEl = document.getElementById('pos');
  var lapEl = document.getElementById('lap');
  var speed = 42, lap = 1;
  // Test loop on Kathmandu's Ring Road corridor (real OSM streets below).
  var route = [
    [27.6939, 85.3056],
    [27.6939, 85.3290],
    [27.7066, 85.3355],
    [27.7172, 85.3290],
    [27.7172, 85.3056],
    [27.7066, 85.2990]
  ];
  function fail(msg) {
    document.getElementById('map').innerHTML =
      '<div class="map-fallback">' + msg + '<br>Check your connection and reload.</div>';
    posEl.textContent = '—';
  }
  if (typeof L === 'undefined') { fail('Map engine failed to load.'); return; }
  var map = L.map('map', { scrollWheelZoom: false, attributionControl: true });
  map.fitBounds(route, { padding: [24, 24] });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  var line = L.polyline(route.concat([route[0]]), { color: '#355fe5', weight: 4, opacity: 0.85 }).addTo(map);
  var trail = L.polyline([], { color: '#7ee2a8', weight: 3, opacity: 0.9 }).addTo(map);
  var marker = L.marker(route[0], {
    icon: L.divIcon({ className: '', html: '<div class="car-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
    zIndexOffset: 500
  }).addTo(map);
  // Segment lengths in metres for constant-speed travel.
  function dist(a, b) {
    var R = 6371000, dLa = (b[0] - a[0]) * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180;
    var s = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
      Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) *
      Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  var loop = route.concat([route[0]]);
  var segLen = [];
  var total = 0;
  for (var i = 0; i < loop.length - 1; i++) { var d = dist(loop[i], loop[i + 1]); segLen.push(d); total += d; }
  var travelled = 0, last = performance.now(), done = [];
  function pointAt(m) {
    var x = ((m % total) + total) % total;
    for (var i = 0; i < segLen.length; i++) {
      if (x <= segLen[i]) {
        var k = segLen[i] ? x / segLen[i] : 0;
        return [loop[i][0] + (loop[i + 1][0] - loop[i][0]) * k, loop[i][1] + (loop[i + 1][1] - loop[i][1]) * k];
      }
      x -= segLen[i];
    }
    return loop[0];
  }
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    var before = Math.floor(travelled / total);
    travelled += (speed * 1000 / 3600) * dt;
    var laps = Math.floor(travelled / total);
    if (laps > before) { lap = lap >= 5 ? 1 : lap + 1; if (lap === 1) done = []; }
    var p = pointAt(travelled);
    marker.setLatLng(p);
    done.push(p);
    if (done.length > 400) done.shift();
    trail.setLatLngs(done);
    speedEl.textContent = Math.round(speed);
    posEl.textContent = p[0].toFixed(4) + ', ' + p[1].toFixed(4);
    lapEl.textContent = lap;
    requestAnimationFrame(frame);
  }
  document.getElementById('faster').addEventListener('click', function () { speed = Math.min(speed + 10, 120); });
  document.getElementById('slower').addEventListener('click', function () { speed = Math.max(speed - 10, 0); });
  document.getElementById('reset').addEventListener('click', function () { travelled = 0; lap = 1; done = []; });
  requestAnimationFrame(frame);
})();
