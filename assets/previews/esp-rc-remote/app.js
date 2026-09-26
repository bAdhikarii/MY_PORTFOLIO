(function () {
  'use strict';
  var stick = document.getElementById('stick');
  var knob = document.getElementById('knob');
  var steerVal = document.getElementById('steer-val');
  var speedEl = document.getElementById('speed');
  var speedBar = document.getElementById('speed-bar');
  var battEl = document.getElementById('batt');
  var battBar = document.getElementById('batt-bar');
  var sigEl = document.getElementById('sig');
  var driveBtn = document.getElementById('drive');
  var lightsBtn = document.getElementById('lights');
  var powerBtn = document.getElementById('power');
  var dot = document.getElementById('link-dot');
  var steer = 0, speed = 0, batt = 87, on = true, driving = false, lights = false;
  function render() {
    steerVal.textContent = Math.round(steer) + '°';
    speedEl.textContent = Math.round(speed);
    speedBar.style.width = Math.min(speed / 60 * 100, 100) + '%';
    battEl.textContent = Math.round(batt);
    battBar.style.width = batt + '%';
    sigEl.textContent = !on ? 'Offline' : speed > 40 ? 'Good' : 'Excellent';
  }
  function setKnob(dx) {
    var max = 33;
    dx = Math.max(-max, Math.min(max, dx));
    knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), -50%)';
    steer = dx / max * 35;
    render();
  }
  var dragging = false;
  function move(e) {
    if (!dragging || !on) return;
    var r = stick.getBoundingClientRect();
    var x = (e.touches ? e.touches[0].clientX : e.clientX) - (r.left + r.width / 2);
    setKnob(x);
  }
  stick.addEventListener('pointerdown', function (e) { dragging = true; stick.setPointerCapture(e.pointerId); move(e); });
  stick.addEventListener('pointermove', move);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    stick.addEventListener(ev, function () { dragging = false; setKnob(0); });
  });
  function hold(fn) {
    return function (e) { e.preventDefault(); driving = fn; };
  }
  driveBtn.addEventListener('pointerdown', hold(true));
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { driveBtn.addEventListener(ev, hold(false)); });
  lightsBtn.addEventListener('click', function () {
    lights = !lights;
    lightsBtn.textContent = 'Lights: ' + (lights ? 'on' : 'off');
    lightsBtn.setAttribute('aria-pressed', String(lights));
  });
  powerBtn.addEventListener('click', function () {
    on = !on;
    powerBtn.textContent = 'Power: ' + (on ? 'on' : 'off');
    dot.classList.toggle('off', !on);
    if (!on) { speed = 0; driving = false; }
    render();
  });
  setInterval(function () {
    if (driving && on && batt > 0) {
      speed = Math.min(speed + 2.4, 60);
      batt = Math.max(batt - 0.06, 0);
    } else {
      speed = Math.max(speed - 3.2, 0);
    }
    render();
  }, 90);
  render();
})();
