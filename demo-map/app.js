'use strict';
/* =====================================================================
   BT RC MAP — standalone demo driving world (Canvas + vanilla JS).
   Sections: Config/RNG | Geo helpers | World data | Theme | Engine |
   Camera | Input | Vehicle + road query | Route | Renderer | Minimap |
   UI | Debug | Main loop. No dependencies, works offline.
   ===================================================================== */

/* ---------------- 1. Config, seed, RNG, math ---------------- */
const WORLD_W = 5000;
const WORLD_H = 5000;
const MAP_SEED = 20260926;

function mulberry32(seed) {
  let state = seed >>> 0;
  return function () {
    state |= 0; state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(MAP_SEED);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

function distPointSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t, cy = ay + dy * t;
  return { d: Math.hypot(px - cx, py - cy), cx, cy, t };
}

function segIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (t < 0.02 || t > 0.98 || u < 0.02 || u > 0.98) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

/* ---------------- 2. World data ---------------- */
const ROAD_STYLE = {
  primary:     { width: 34, sidewalk: true,  marking: 'center' },
  secondary:   { width: 24, sidewalk: true,  marking: 'center' },
  residential: { width: 14, sidewalk: false, marking: 'none' },
  alley:       { width: 9,  sidewalk: false, marking: 'none' }
};

// Continuous polylines — the renderer smooths them into curves.
const ROADS = [
  { id: 'sunset-ave', name: 'Sunset Ave', type: 'primary', points: [
    [200,2600],[900,2500],[1600,2700],[2400,2500],[2620,2560],[2690,2595],
    [2910,2595],[3050,2620],[3200,2700],[4000,2500],[4800,2600]] },
  { id: 'plaza-link-s', name: 'Plaza Link', type: 'secondary', points: [[2800,2705],[2800,3000],[2800,3300]] },
  { id: 'plaza-link-n', name: 'Plaza Link', type: 'secondary', points: [[2800,1900],[2800,2200],[2800,2440],[2800,2485]] },
  { id: 'plaza-link-u', name: 'Plaza Link', type: 'secondary', points: [[2800,1900],[2800,1650],[2800,1410]] },
  { id: 'market-st', name: 'Market St', type: 'secondary', points: [[1500,400],[1450,1200],[1550,2000],[1500,2700],[1500,3400],[1600,4400]] },
  { id: 'harbor-rd', name: 'Harbor Rd', type: 'secondary', points: [[3300,600],[3250,1500],[3350,2400],[3300,3300],[3400,4300]] },
  { id: 'university-ave', name: 'University Ave', type: 'secondary', points: [[400,1400],[1400,1350],[2400,1450],[3400,1350],[4400,1450]] },
  { id: 'station-rd', name: 'Station Rd', type: 'secondary', points: [[500,3600],[1500,3550],[2500,3650],[3500,3550],[4500,3650]] },
  { id: 'northway', name: 'Northway', type: 'secondary', points: [[600,600],[700,1400],[650,2200],[700,2560]] },
  { id: 'r1', type: 'residential', points: [[300,900],[1100,850],[1900,900]] },
  { id: 'r2', type: 'residential', points: [[300,1800],[1000,1750],[1800,1820]] },
  { id: 'r3', type: 'residential', points: [[2100,600],[2600,650],[3100,600]] },
  { id: 'r4', type: 'residential', points: [[3800,900],[4400,950]] },
  { id: 'r5', type: 'residential', points: [[3800,2200],[4300,2250],[4600,2400]] },
  { id: 'r6', type: 'residential', points: [[400,3000],[1200,3050],[2000,3000]] },
  { id: 'r7', type: 'residential', points: [[2200,3900],[2800,3950]] },
  { id: 'r8', type: 'residential', points: [[3600,3000],[4200,3050]] },
  { id: 'r9', type: 'residential', points: [[1100,2400],[1100,3000]] },
  { id: 'r10', type: 'residential', points: [[2400,3200],[2400,3450]] },
  { id: 'a1', type: 'alley', points: [[1700,1300],[1900,1320],[2100,1300]] },
  { id: 'a2', type: 'alley', points: [[3900,2700],[4100,2720]] },
  { id: 'parking-stub', type: 'residential', points: [[3300,1930],[3520,1930]] }
];

const ROUNDABOUT = { x: 2800, y: 2595, radius: 110, width: 22, name: 'Plaza Circle' };

// Junction discs (clean marking cut-outs) auto-detected from crossings.
const JUNCTIONS = (function detectJunctions() {
  const segs = [];
  ROADS.forEach((r) => {
    for (let i = 0; i < r.points.length - 1; i++) {
      segs.push({ ax: r.points[i][0], ay: r.points[i][1], bx: r.points[i + 1][0], by: r.points[i + 1][1], w: ROAD_STYLE[r.type].width });
    }
  });
  const hits = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const p = segIntersect(
        { x: segs[i].ax, y: segs[i].ay }, { x: segs[i].bx, y: segs[i].by },
        { x: segs[j].ax, y: segs[j].ay }, { x: segs[j].bx, y: segs[j].by });
      if (p) hits.push({ x: p.x, y: p.y, r: Math.max(segs[i].w, segs[j].w) / 2 + 8 });
    }
  }
  const discs = [];
  hits.forEach((h) => {
    const near = discs.find((d) => Math.hypot(d.x - h.x, d.y - h.y) < 46);
    if (near) { near.r = Math.max(near.r, h.r); }
    else discs.push(h);
  });
  return discs;
})();

const BUILDINGS = [
  // Commercial core (east of roundabout)
  { x: 3150, y: 2150, w: 220, h: 150, rot: 0, type: 'office', label: 'Tech Hub' },
  { x: 3500, y: 2150, w: 180, h: 130, rot: 0, type: 'commercial', label: 'Market' },
  { x: 3150, y: 2900, w: 200, h: 160, rot: 0, type: 'office', label: '' },
  { x: 3500, y: 2900, w: 160, h: 140, rot: 0, type: 'commercial', label: '' },
  // North high-street
  { x: 1000, y: 1150, w: 170, h: 120, rot: 0, type: 'commercial', label: 'Bazaar' },
  { x: 1250, y: 1150, w: 150, h: 120, rot: 0, type: 'residential', label: '' },
  { x: 1750, y: 1150, w: 170, h: 130, rot: 0, type: 'residential', label: '' },
  { x: 2000, y: 1150, w: 150, h: 110, rot: 0, type: 'office', label: '' },
  // West homes along Sunset
  { x: 500, y: 2280, w: 150, h: 110, rot: 0, type: 'residential', label: '' },
  { x: 750, y: 2280, w: 140, h: 100, rot: 0, type: 'residential', label: '' },
  { x: 1000, y: 2850, w: 160, h: 120, rot: 0, type: 'residential', label: '' },
  { x: 1300, y: 2850, w: 150, h: 110, rot: 0, type: 'residential', label: '' },
  // School campus
  { x: 1950, y: 3180, w: 320, h: 170, rot: 0, type: 'school', label: 'City School' },
  { x: 1950, y: 3400, w: 180, h: 110, rot: 0, type: 'school', label: '' },
  // South warehouses
  { x: 2700, y: 4100, w: 300, h: 170, rot: 0, type: 'warehouse', label: 'Depot' },
  { x: 3100, y: 4100, w: 240, h: 150, rot: 0, type: 'warehouse', label: '' },
  // Harbor offices
  { x: 3560, y: 1100, w: 190, h: 140, rot: 0, type: 'office', label: 'Harbor HQ' },
  { x: 3560, y: 1350, w: 170, h: 120, rot: 0, type: 'commercial', label: '' },
  { x: 3000, y: 1100, w: 160, h: 120, rot: 0, type: 'residential', label: '' },
  // Lakeside villas
  { x: 3400, y: 3600, w: 150, h: 110, rot: 0.1, type: 'residential', label: '' },
  { x: 3600, y: 3600, w: 140, h: 100, rot: -0.08, type: 'residential', label: '' },
  // Station row
  { x: 900, y: 3780, w: 170, h: 120, rot: 0, type: 'commercial', label: '' },
  { x: 1150, y: 3780, w: 150, h: 110, rot: 0, type: 'residential', label: '' },
  { x: 2900, y: 3450, w: 180, h: 120, rot: 0, type: 'office', label: '' },
  { x: 3900, y: 3300, w: 170, h: 130, rot: 0, type: 'residential', label: '' }
];
BUILDINGS.forEach((b) => {
  const cols = Math.max(1, Math.floor(b.w / 30)), rows = Math.max(1, Math.floor(b.h / 30));
  b.lit = [];
  for (let i = 0; i < cols * rows; i++) b.lit.push(rng() < 0.45);
  b.cols = cols; b.rows = rows;
});

function blobPath(cx, cy, rx, ry, wobble, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + (rng() - 0.5) * wobble;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}
const PARK = {
  name: 'Central Park', cx: 1150, cy: 880, blob: blobPath(1150, 880, 360, 260, 0.35, 12),
  paths: [[[830, 880], [1050, 830], [1300, 900], [1500, 860]], [[1000, 680], [1120, 880], [1180, 1100]]],
  trees: [], benches: [[980, 850], [1230, 905], [1120, 760], [1300, 830], [900, 900], [1400, 920]]
};
for (let i = 0; i < 70; i++) {
  const a = rng() * TAU, r = Math.sqrt(rng());
  PARK.trees.push({ x: PARK.cx + Math.cos(a) * 330 * r, y: PARK.cy + Math.sin(a) * 235 * r, s: 10 + rng() * 12 });
}
const LAKE = { name: 'Mirror Lake', blob: blobPath(3950, 3900, 330, 260, 0.4, 12) };
const RIVER = { points: [[3620, 3900], [3000, 4050], [2300, 3980], [1600, 4120], [1000, 4080], [600, 4250]], width: 80 };
const PARKING = { x: 3520, y: 1820, w: 360, h: 220, label: 'PARKING' };
const PARKED_CARS = [
  { x: 3590, y: 1860, c: '#7a8ba0' }, { x: 3680, y: 1860, c: '#a94442' }, { x: 3860, y: 1860, c: '#3e6b4f' },
  { x: 3590, y: 1960, c: '#c0a062' }, { x: 3770, y: 1960, c: '#4a6fa5' }, { x: 3860, y: 1960, c: '#8a8f98' }
];

const WAYPOINTS = [
  { id: 'start', name: 'START', x: 400, y: 2573 },
  { id: 'home', name: 'HOME', x: 880, y: 1120 },
  { id: 'garage', name: 'GARAGE', x: 3600, y: 1930 },
  { id: 'park', name: 'PARK', x: 1150, y: 880 },
  { id: 'dest', name: 'DESTINATION', x: 4300, y: 1400 }
];
// Predefined scenic route: Sunset Ave → roundabout → Plaza Link → University Ave.
const ROUTE = [
  [400, 2573], [1200, 2580], [2000, 2560], [2620, 2560],
  [2690, 2595], [2722, 2517], [2800, 2485],
  [2800, 2200], [2800, 1900], [2800, 1650], [2800, 1410],
  [3400, 1400], [4300, 1400]
];
const LABELS = [
  { x: 1500, y: 2640, text: 'Sunset Ave' }, { x: 760, y: 1600, text: 'Northway' },
  { x: 1620, y: 1600, text: 'Market St' }, { x: 3420, y: 1600, text: 'Harbor Rd' },
  { x: 1400, y: 1300, text: 'University Ave' }, { x: 1400, y: 3500, text: 'Station Rd' },
  { x: 1150, y: 880, text: 'Central Park' }, { x: 3950, y: 3900, text: 'Mirror Lake' },
  { x: 2800, y: 2820, text: 'Plaza Circle' }
];

/* ---------------- 3. Theme ---------------- */
const THEMES = {
  day: {
    terrain: '#e9e7e0', grid: 'rgba(18,18,20,0.05)', outside: '#d5d2c9',
    water: '#9ecfe0', waterLine: 'rgba(255,255,255,0.55)', bank: '#ded5bd',
    park: '#bfe3bd', parkRim: '#9cc79b', tree: '#4e8f56', treeDark: '#3a7044', trunk: '#7a5c3e',
    asphalt: '#4b4b51', sidewalk: '#d9d6cd', roadShadow: 'rgba(18,18,20,0.20)',
    marking: '#f7f4ea', building: '#c9c5bb', roof: '#a09c92', window: '#7e8a96', windowLit: '#e8d27a',
    route: '#355fe5', dest: '#a92431', car: '#c93a3a', carDark: '#7e1f1f',
    label: 'rgba(30,30,34,0.72)', lamp: 'rgba(240,200,90,0.9)'
  },
  night: {
    terrain: '#141417', grid: 'rgba(255,255,255,0.045)', outside: '#0b0b0d',
    water: '#0f2c40', waterLine: 'rgba(140,200,235,0.30)', bank: '#2a2a30',
    park: '#14301f', parkRim: '#1e4a2d', tree: '#1f5c33', treeDark: '#174527', trunk: '#4a3826',
    asphalt: '#26262c', sidewalk: '#3a3a41', roadShadow: 'rgba(0,0,0,0.5)',
    marking: '#c9c9c9', building: '#202027', roof: '#2c2c34', window: '#33333c', windowLit: '#ffd479',
    route: '#7ea0ff', dest: '#ff6b78', car: '#e05252', carDark: '#8c2424',
    label: 'rgba(235,235,240,0.75)', lamp: 'rgba(255,205,110,0.95)'
  }
};
let themeName = 'day';
const T = () => THEMES[themeName];

/* ---------------- 4. Engine (canvas) ---------------- */
const scene = document.getElementById('scene');
const ctx = scene.getContext('2d');
let viewW = 0, viewH = 0, dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewW = window.innerWidth; viewH = window.innerHeight;
  scene.width = Math.round(viewW * dpr); scene.height = Math.round(viewH * dpr);
  buildMinimapBase();
}
window.addEventListener('resize', resize);

/* ---------------- 5. Camera ---------------- */
const CAM_MODES = ['follow', 'cinematic', 'free'];
const camera = { x: 400, y: 2573, zoom: 1.0, mode: 'follow', tx: 400, ty: 2573 };
function worldToScreen(wx, wy) {
  return { x: (wx - camera.x) * camera.zoom + viewW / 2, y: (wy - camera.y) * camera.zoom + viewH / 2 };
}
function screenToWorld(sx, sy) {
  return { x: (sx - viewW / 2) / camera.zoom + camera.x, y: (sy - viewH / 2) / camera.zoom + camera.y };
}
function updateCamera(dt) {
  if (camera.mode === 'free') return;
  const look = camera.mode === 'cinematic' ? 0.55 : 0.22;
  camera.tx = car.x + Math.cos(car.angle) * car.speed * look;
  camera.ty = car.y + Math.sin(car.angle) * car.speed * look;
  const k = camera.mode === 'cinematic' ? 2.6 : 7;
  camera.x += (camera.tx - camera.x) * Math.min(k * dt, 1);
  camera.y += (camera.ty - camera.y) * Math.min(k * dt, 1);
}
function zoomAt(sx, sy, factor) {
  const before = screenToWorld(sx, sy);
  camera.zoom = clamp(camera.zoom * factor, 0.2, 3);
  const after = screenToWorld(sx, sy);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
}

/* ---------------- 6. Input ---------------- */
const keys = {};
const mouse = { down: false, sx: 0, sy: 0, moved: false, button: 0 };
window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') { e.preventDefault(); toggleDebug(); return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyR') resetCar();
  if (e.code === 'KeyC') cycleCamera();
  if (e.code === 'KeyN') toggleTheme();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
scene.addEventListener('contextmenu', (e) => e.preventDefault());
scene.addEventListener('pointerdown', (e) => {
  mouse.down = true; mouse.moved = false; mouse.sx = e.clientX; mouse.sy = e.clientY;
  mouse.button = e.button;
  scene.setPointerCapture(e.pointerId);
});
scene.addEventListener('pointermove', (e) => {
  if (!mouse.down) return;
  const dx = e.clientX - mouse.sx, dy = e.clientY - mouse.sy;
  if (Math.hypot(dx, dy) > 5) mouse.moved = true;
  if (mouse.moved) {
    if (camera.mode !== 'free') camera.mode = 'free';
    camera.x -= dx / camera.zoom; camera.y -= dy / camera.zoom;
    mouse.sx = e.clientX; mouse.sy = e.clientY;
    syncCameraUI();
  }
});
scene.addEventListener('pointerup', (e) => {
  if (mouse.down && !mouse.moved) handleClick(e.clientX, e.clientY);
  mouse.down = false;
});
scene.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });
// Pinch zoom.
let pinchD = 0;
scene.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (pinchD) zoomAt((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2, d / pinchD);
    pinchD = d;
  }
}, { passive: true });
scene.addEventListener('touchend', () => { pinchD = 0; });

/* ---------------- 7. Vehicle + road query ----------------
   vehicleState is the abstract telemetry interface: keyboard drives it
   now; a future ESP adapter can feed {x,y,angle,speed} via
   DemoMap.connectVehicle(fn) without touching the engine. */
const vehicleState = { x: 400, y: 2573, speed: 0, heading: 0, battery: 100, connected: false };
const car = {
  x: 400, y: 2573, angle: 0, speed: 0,
  maxSpeed: 430, accel: 300, braking: 540, reverseMax: 150,
  steering: 0, offroad: false, nearestRoad: null, nearestDist: Infinity
};
let telemetryFn = null;
function updateVehicle(dt) {
  if (telemetryFn) {
    const s = telemetryFn();
    if (s) { car.x = s.x; car.y = s.y; car.angle = s.heading; car.speed = s.speed; }
  } else {
    const fwd = keys.KeyW || keys.ArrowUp, back = keys.KeyS || keys.ArrowDown;
    const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
    if (fwd) car.speed += car.accel * dt;
    if (back) car.speed -= (car.speed > 0 ? car.braking : car.accel * 0.7) * dt;
    if (keys.Space) {
      const s = Math.sign(car.speed);
      car.speed -= s * 700 * dt;
      if (Math.sign(car.speed) !== s) car.speed = 0;
    }
    const target = (left ? -1 : 0) + (right ? 1 : 0);
    car.steering += (target - car.steering) * Math.min(7 * dt, 1);
    let vmax = car.maxSpeed;
    if (car.offroad) vmax *= 0.45;
    car.speed = clamp(car.speed, -car.reverseMax, vmax);
    car.speed -= car.speed * (car.offroad ? 2.4 : 0.35) * dt;
    if (!fwd && !back && Math.abs(car.speed) < 4) car.speed = 0;
    car.angle += car.steering * (car.speed / car.maxSpeed) * 2.7 * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 20, WORLD_W - 20);
    car.y = clamp(car.y, 20, WORLD_H - 20);
  }
  queryRoad();
  vehicleState.x = car.x; vehicleState.y = car.y;
  vehicleState.speed = car.speed; vehicleState.heading = car.angle;
}
function queryRoad() {
  let best = Infinity, bestRoad = null;
  for (const r of ROADS) {
    const p = r.points;
    for (let i = 0; i < p.length - 1; i++) {
      const q = distPointSeg(car.x, car.y, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]);
      if (q.d < best) { best = q.d; bestRoad = r; }
    }
  }
  // Roundabout ring counts as road.
  const ringD = Math.abs(Math.hypot(car.x - ROUNDABOUT.x, car.y - ROUNDABOUT.y) - ROUNDABOUT.radius);
  if (ringD < best) { best = ringD; bestRoad = { id: 'plaza-circle', name: 'Plaza Circle', type: 'secondary' }; }
  car.nearestDist = best;
  car.nearestRoad = bestRoad;
  const half = bestRoad ? ROAD_STYLE[bestRoad.type].width / 2 : 0;
  car.offroad = best > half + 10;
}
function resetCar() {
  car.x = 400; car.y = 2573; car.angle = 0; car.speed = 0; car.steering = 0;
  camera.x = car.x; camera.y = car.y; camera.tx = car.x; camera.ty = car.y;
}

/* ---------------- 8. Route ---------------- */
let routeProgress = 0;
const routeSegs = [];
(function buildRoute() {
  let total = 0;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const len = Math.hypot(ROUTE[i + 1][0] - ROUTE[i][0], ROUTE[i + 1][1] - ROUTE[i][1]);
    routeSegs.push({ len, acc: total });
    total += len;
  }
  routeSegs.total = total;
})();
function updateRoute() {
  let best = Infinity, bestAlong = 0;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const q = distPointSeg(car.x, car.y, ROUTE[i][0], ROUTE[i][1], ROUTE[i + 1][0], ROUTE[i + 1][1]);
    if (q.d < best) { best = q.d; bestAlong = routeSegs[i].acc + q.t * routeSegs[i].len; }
  }
  routeProgress = clamp(bestAlong / routeSegs.total, 0, 1);
}

/* ---------------- 9. Renderer ---------------- */
function traceSmooth(pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}
function traceBlob(pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= pts.length; i++) {
    const p = pts[i % pts.length], q = pts[(i + 1) % pts.length];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
}
function inView(x, y, pad) {
  const a = screenToWorld(0, 0), b = screenToWorld(viewW, viewH);
  return x > a.x - pad && x < b.x + pad && y > a.y - pad && y < b.y + pad;
}
function roadBBox(r) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  r.points.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  return { x0, y0, x1, y1 };
}
ROADS.forEach((r) => { r.bbox = roadBBox(r); });

function drawRoadSurface(r) {
  const st = ROAD_STYLE[r.type];
  const bb = r.bbox, m = st.width + 30;
  if (!inView((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2 + m)) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = T().roadShadow;
  ctx.lineWidth = st.width + 7;
  ctx.beginPath(); traceSmooth(r.points); ctx.stroke();
  if (st.sidewalk) {
    ctx.strokeStyle = T().sidewalk;
    ctx.lineWidth = st.width + 10;
    ctx.beginPath(); traceSmooth(r.points); ctx.stroke();
  }
  ctx.strokeStyle = T().asphalt;
  ctx.lineWidth = st.width;
  ctx.beginPath(); traceSmooth(r.points); ctx.stroke();
}
function drawRoadMarking(r) {
  const st = ROAD_STYLE[r.type];
  if (st.marking === 'none') return;
  ctx.lineCap = 'round';
  ctx.strokeStyle = T().marking;
  ctx.lineWidth = r.type === 'primary' ? 3 : 2.2;
  ctx.setLineDash(r.type === 'primary' ? [26, 20] : [16, 15]);
  ctx.beginPath(); traceSmooth(r.points); ctx.stroke();
  ctx.setLineDash([]);
}
function drawRoundabout() {
  const R = ROUNDABOUT, th = T();
  ctx.lineCap = 'round';
  ctx.strokeStyle = th.roadShadow; ctx.lineWidth = R.width + 7;
  ctx.beginPath(); ctx.arc(R.x, R.y, R.radius, 0, TAU); ctx.stroke();
  ctx.strokeStyle = th.sidewalk; ctx.lineWidth = R.width + 10;
  ctx.beginPath(); ctx.arc(R.x, R.y, R.radius, 0, TAU); ctx.stroke();
  ctx.strokeStyle = th.asphalt; ctx.lineWidth = R.width;
  ctx.beginPath(); ctx.arc(R.x, R.y, R.radius, 0, TAU); ctx.stroke();
  ctx.strokeStyle = th.marking; ctx.lineWidth = 2.2;
  ctx.setLineDash([14, 12]);
  ctx.beginPath(); ctx.arc(R.x, R.y, R.radius, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  // Center island.
  ctx.fillStyle = th.park;
  ctx.beginPath(); ctx.arc(R.x, R.y, R.radius - R.width / 2 - 5, 0, TAU); ctx.fill();
  ctx.strokeStyle = th.sidewalk; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(R.x, R.y, R.radius - R.width / 2 - 5, 0, TAU); ctx.stroke();
  ctx.fillStyle = th.treeDark;
  ctx.beginPath(); ctx.arc(R.x, R.y, 16, 0, TAU); ctx.fill();
}
function drawBuilding(b) {
  if (!inView(b.x, b.y, Math.max(b.w, b.h))) return;
  const th = T();
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.rot) ctx.rotate(b.rot);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(-b.w / 2 + 7, -b.h / 2 + 10, b.w, b.h);
  ctx.fillStyle = th.building;
  ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
  ctx.strokeStyle = th.roof; ctx.lineWidth = 3;
  ctx.strokeRect(-b.w / 2 + 7, -b.h / 2 + 7, b.w - 14, b.h - 14);
  const cw = b.w / b.cols, ch = b.h / b.rows;
  for (let i = 0; i < b.cols; i++) {
    for (let j = 0; j < b.rows; j++) {
      const lit = themeName === 'night' && b.lit[i * b.rows + j];
      ctx.fillStyle = lit ? th.windowLit : th.window;
      ctx.fillRect(-b.w / 2 + 8 + i * cw, -b.h / 2 + 9 + j * ch, Math.max(cw - 9, 3), Math.max(ch - 10, 3));
    }
  }
  ctx.restore();
}
function drawTree(x, y, s) {
  if (!inView(x, y, s + 8)) return;
  const th = T();
  ctx.fillStyle = th.trunk;
  ctx.fillRect(x - 1.5, y, 3, s * 0.5);
  ctx.fillStyle = th.treeDark;
  ctx.beginPath(); ctx.arc(x, y - s * 0.25, s * 0.55, 0, TAU); ctx.fill();
  ctx.fillStyle = th.tree;
  ctx.beginPath(); ctx.arc(x - s * 0.12, y - s * 0.38, s * 0.42, 0, TAU); ctx.fill();
}
function drawPark() {
  const th = T();
  ctx.fillStyle = th.parkRim;
  ctx.beginPath(); traceBlob(PARK.blob); ctx.fill();
  ctx.strokeStyle = th.parkRim; ctx.lineWidth = 10;
  ctx.beginPath(); traceBlob(PARK.blob); ctx.stroke();
  ctx.fillStyle = th.park;
  ctx.beginPath(); traceBlob(PARK.blob); ctx.fill();
  ctx.strokeStyle = 'rgba(120,100,70,0.55)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  PARK.paths.forEach((p) => { ctx.beginPath(); traceSmooth(p); ctx.stroke(); });
  PARK.benches.forEach((bn) => {
    ctx.fillStyle = '#7a5c3e';
    ctx.fillRect(bn[0] - 8, bn[1] - 3, 16, 6);
  });
  PARK.trees.forEach((t) => drawTree(t.x, t.y, t.s));
}
function drawWater() {
  const th = T();
  ctx.fillStyle = th.water;
  ctx.beginPath(); traceBlob(LAKE.blob); ctx.fill();
  ctx.strokeStyle = th.waterLine; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(LAKE.blob[0][0] - 120 + i * 60, LAKE.blob[0][1] + 40 + i * 36, 26 + i * 9, 0.3, Math.PI - 0.3);
    ctx.stroke();
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = th.bank; ctx.lineWidth = RIVER.width + 14;
  ctx.beginPath(); traceSmooth(RIVER.points); ctx.stroke();
  ctx.strokeStyle = th.water; ctx.lineWidth = RIVER.width;
  ctx.beginPath(); traceSmooth(RIVER.points); ctx.stroke();
}
function drawParking() {
  const p = PARKING, th = T();
  if (!inView(p.x + p.w / 2, p.y + p.h / 2, 300)) return;
  ctx.fillStyle = th.asphalt;
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.strokeStyle = th.marking; ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const x = p.x + 20 + i * ((p.w - 40) / 8);
    ctx.beginPath(); ctx.moveTo(x, p.y + 16); ctx.lineTo(x, p.y + p.h / 2 - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, p.y + p.h / 2 + 8); ctx.lineTo(x, p.y + p.h - 16); ctx.stroke();
  }
  PARKED_CARS.forEach((c) => {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(c.x - 22 + 3, c.y - 11 + 4, 44, 22);
    ctx.fillStyle = c.c;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(c.x - 22, c.y - 11, 44, 22, 6); else ctx.rect(c.x - 22, c.y - 11, 44, 22);
    ctx.fill();
  });
}
function drawRoute() {
  const dest = WAYPOINTS.find((w) => w.id === 'dest');
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = themeName === 'day' ? 'rgba(53,95,229,0.30)' : 'rgba(126,160,255,0.30)';
  ctx.lineWidth = 11;
  ctx.beginPath(); traceSmooth(ROUTE); ctx.stroke();
  ctx.strokeStyle = T().route;
  ctx.lineWidth = 4.5;
  ctx.setLineDash([16, 12]);
  ctx.beginPath(); traceSmooth(ROUTE); ctx.stroke();
  ctx.setLineDash([]);
  // Destination pin.
  const s = worldToScreen(dest.x, dest.y);
  if (s.x > -40 && s.x < viewW + 40 && s.y > -40 && s.y < viewH + 40) {
    ctx.fillStyle = T().dest;
    ctx.beginPath(); ctx.arc(s.x, s.y, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = T().dest; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(s.x, s.y + 11); ctx.lineTo(s.x, s.y + 24); ctx.stroke();
  }
}
function drawWaypoints() {
  ctx.textAlign = 'center';
  WAYPOINTS.forEach((w) => {
    const s = worldToScreen(w.x, w.y);
    if (s.x < -60 || s.x > viewW + 60 || s.y < -60 || s.y > viewH + 60) return;
    const sel = selected && selected.kind === 'waypoint' && selected.ref === w;
    ctx.fillStyle = sel ? '#355fe5' : 'rgba(20,20,24,0.85)';
    ctx.beginPath(); ctx.arc(s.x, s.y, sel ? 13 : 10, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = themeName === 'day' ? '#121214' : '#f4f3ef';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText(w.name, s.x, s.y - 18);
    if (w.id === 'dest') {
      ctx.fillStyle = T().dest;
      ctx.font = '700 10px Inter, sans-serif';
      ctx.fillText(Math.round(Math.hypot(car.x - w.x, car.y - w.y) / 10) + ' m', s.x, s.y + 30);
    }
  });
}
function drawVehicle() {
  const s = worldToScreen(car.x, car.y);
  const z = camera.zoom;
  const L = 34 * z, Wd = 20 * z;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(car.angle);
  if (themeName === 'night') {
    const g = ctx.createRadialGradient(L / 2, 0, 4, L / 2, 0, 130 * z);
    g.addColorStop(0, 'rgba(255,240,190,0.35)');
    g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(L / 2, -Wd * 0.4); ctx.lineTo(L / 2 + 130 * z, -Wd * 1.4);
    ctx.lineTo(L / 2 + 130 * z, Wd * 1.4); ctx.lineTo(L / 2, Wd * 0.4);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(2, 3, L / 2, Wd / 2, 0, 0, TAU); ctx.fill();
  // Wheels (front pair steers visually).
  ctx.fillStyle = '#151518';
  const ww = 8 * z, wh = 5 * z;
  [[L * 0.28, -Wd / 2 - 1, car.steering * 0.45], [L * 0.28, Wd / 2 + 1, car.steering * 0.45],
   [-L * 0.28, -Wd / 2 - 1, 0], [-L * 0.28, Wd / 2 + 1, 0]].forEach((wl) => {
    ctx.save(); ctx.translate(wl[0], wl[1]); ctx.rotate(wl[2]);
    ctx.fillRect(-ww / 2, -wh / 2, ww, wh);
    ctx.restore();
  });
  // Body.
  ctx.fillStyle = T().car;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-L / 2, -Wd / 2, L, Wd, 5 * z); else ctx.rect(-L / 2, -Wd / 2, L, Wd);
  ctx.fill();
  ctx.fillStyle = T().carDark;
  ctx.fillRect(-L * 0.1, -Wd / 2 + 2, L * 0.32, Wd - 4);
  ctx.fillStyle = 'rgba(180,220,255,0.85)';
  ctx.fillRect(L * 0.22, -Wd / 2 + 3, L * 0.16, Wd - 6);
  // Headlights + tail.
  ctx.fillStyle = themeName === 'night' ? '#fff6c9' : '#f5f0d0';
  ctx.beginPath(); ctx.arc(L / 2 - 1, -Wd * 0.28, 2.4 * z, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(L / 2 - 1, Wd * 0.28, 2.4 * z, 0, TAU); ctx.fill();
  ctx.fillStyle = '#a92431';
  ctx.fillRect(-L / 2 - 1, -Wd * 0.3, 2.5 * z, 3 * z);
  ctx.fillRect(-L / 2 - 1, Wd * 0.3 - 3 * z, 2.5 * z, 3 * z);
  // Steering indicator.
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(car.steering * 0.6) * 26 * z, Math.sin(car.steering * 0.6) * 26 * z);
  ctx.stroke();
  ctx.restore();
  // Direction vector (debug).
  if (debugOn) {
    ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(car.angle) * 60, s.y + Math.sin(car.angle) * 60); ctx.stroke();
  }
}
function drawLabels() {
  if (camera.zoom < 0.45) return;
  const size = clamp(14 / Math.sqrt(camera.zoom), 11, 20);
  ctx.font = '600 ' + size + 'px Inter, sans-serif';
  ctx.textAlign = 'center';
  LABELS.forEach((l) => {
    const s = worldToScreen(l.x, l.y);
    if (s.x < -80 || s.x > viewW + 80 || s.y < -40 || s.y > viewH + 40) return;
    ctx.fillStyle = T().label;
    ctx.fillText(l.text, s.x, s.y);
  });
  BUILDINGS.forEach((b) => {
    if (!b.label || camera.zoom < 0.55) return;
    const s = worldToScreen(b.x, b.y - b.h / 2 - 14);
    if (s.x < -80 || s.x > viewW + 80 || s.y < -30 || s.y > viewH + 30) return;
    ctx.fillStyle = T().label;
    ctx.fillText(b.label, s.x, s.y);
  });
}
function drawLamps() {
  if (themeName !== 'night') return;
  ctx.fillStyle = T().lamp;
  ROADS.forEach((r) => {
    if (r.type !== 'primary' && r.type !== 'secondary') return;
    for (let i = 0; i < r.points.length; i += 2) {
      const p = r.points[i];
      if (!inView(p[0], p[1], 20)) continue;
      ctx.beginPath(); ctx.arc(worldToScreen(p[0] + 26, p[1] - 26).x, worldToScreen(p[0] + 26, p[1] - 26).y, 2.4, 0, TAU); ctx.fill();
    }
  });
}
function render() {
  const th = T();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = th.outside;
  ctx.fillRect(0, 0, viewW, viewH);
  const o = worldToScreen(0, 0);
  ctx.fillStyle = th.terrain;
  ctx.fillRect(o.x, o.y, WORLD_W * camera.zoom, WORLD_H * camera.zoom);
  // Faint survey grid.
  ctx.strokeStyle = th.grid; ctx.lineWidth = 1;
  const step = 250;
  const a = screenToWorld(0, 0), b = screenToWorld(viewW, viewH);
  for (let gx = Math.floor(a.x / step) * step; gx < b.x; gx += step) {
    const s = worldToScreen(gx, 0);
    ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, viewH); ctx.stroke();
  }
  for (let gy = Math.floor(a.y / step) * step; gy < b.y; gy += step) {
    const s = worldToScreen(0, gy);
    ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(viewW, s.y); ctx.stroke();
  }
  ctx.save();
  ctx.translate(viewW / 2, viewH / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  drawWater();
  drawPark();
  BUILDINGS.forEach(drawBuilding);
  ROADS.forEach(drawRoadSurface);
  drawRoundabout();
  ROADS.forEach(drawRoadMarking);
  // Seamless junctions: asphalt discs erase marking overlaps.
  ctx.fillStyle = th.asphalt;
  JUNCTIONS.forEach((j) => { ctx.beginPath(); ctx.arc(j.x, j.y, j.r, 0, TAU); ctx.fill(); });
  drawParking();
  drawRoute();
  drawLamps();
  drawWaypoints();
  ctx.restore();
  // Screen-space passes.
  drawVehicle();
  drawLabels();
}

/* ---------------- 10. Minimap ---------------- */
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');
const miniBase = document.createElement('canvas');
miniBase.width = 172; miniBase.height = 172;
function buildMinimapBase() {
  const c = miniBase.getContext('2d');
  const k = 172 / WORLD_W;
  const th = T();
  c.fillStyle = th.terrain; c.fillRect(0, 0, 172, 172);
  c.fillStyle = th.water;
  c.beginPath(); traceBlobOn(c, LAKE.blob, k); c.fill();
  c.fillStyle = th.park;
  c.beginPath(); traceBlobOn(c, PARK.blob, k); c.fill();
  c.lineCap = 'round';
  ROADS.forEach((r) => {
    c.strokeStyle = th.asphalt;
    c.lineWidth = Math.max(ROAD_STYLE[r.type].width * k, 1);
    c.beginPath(); traceSmoothOn(c, r.points, k); c.stroke();
  });
  c.strokeStyle = th.asphalt; c.lineWidth = Math.max(ROUNDABOUT.width * k, 1.5);
  c.beginPath(); c.arc(ROUNDABOUT.x * k, ROUNDABOUT.y * k, ROUNDABOUT.radius * k, 0, TAU); c.stroke();
}
function traceSmoothOn(c, pts, k) {
  c.moveTo(pts[0][0] * k, pts[0][1] * k);
  for (let i = 1; i < pts.length - 1; i++) {
    c.quadraticCurveTo(pts[i][0] * k, pts[i][1] * k, (pts[i][0] + pts[i + 1][0]) / 2 * k, (pts[i][1] + pts[i + 1][1]) / 2 * k);
  }
  const l = pts[pts.length - 1];
  c.lineTo(l[0] * k, l[1] * k);
}
function traceBlobOn(c, pts, k) {
  c.moveTo(pts[0][0] * k, pts[0][1] * k);
  for (let i = 1; i <= pts.length; i++) {
    const p = pts[i % pts.length], q = pts[(i + 1) % pts.length];
    c.quadraticCurveTo(p[0] * k, p[1] * k, (p[0] + q[0]) / 2 * k, (p[1] + q[1]) / 2 * k);
  }
  c.closePath();
}
function drawMinimap() {
  const k = 172 / WORLD_W, th = T();
  mctx.clearRect(0, 0, 172, 172);
  mctx.drawImage(miniBase, 0, 0);
  mctx.strokeStyle = th.route; mctx.lineWidth = 1.6;
  mctx.beginPath(); traceSmoothOn(mctx, ROUTE, k); mctx.stroke();
  WAYPOINTS.forEach((w) => {
    mctx.fillStyle = w.id === 'dest' ? th.dest : '#fff';
    mctx.beginPath(); mctx.arc(w.x * k, w.y * k, w.id === 'dest' ? 3.4 : 2.2, 0, TAU); mctx.fill();
  });
  // Viewport rect.
  const a = screenToWorld(0, 0), b = screenToWorld(viewW, viewH);
  mctx.strokeStyle = 'rgba(255,255,255,0.75)'; mctx.lineWidth = 1;
  mctx.strokeRect(a.x * k, a.y * k, (b.x - a.x) * k, (b.y - a.y) * k);
  // Vehicle wedge.
  const vx = car.x * k, vy = car.y * k;
  mctx.fillStyle = '#ff4d4d';
  mctx.save();
  mctx.translate(vx, vy); mctx.rotate(Math.atan2(Math.sin(car.angle), Math.cos(car.angle)));
  mctx.beginPath(); mctx.moveTo(6, 0); mctx.lineTo(-4, -4); mctx.lineTo(-4, 4); mctx.closePath(); mctx.fill();
  mctx.restore();
}

/* ---------------- 11. UI ---------------- */
const el = (id) => document.getElementById(id);
const COMPASS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
let selected = null;
let lastUi = 0;
function headingCompass() {
  const idx = ((Math.round(car.angle / (Math.PI / 4)) % 8) + 8) % 8;
  return COMPASS[idx];
}
function updateUI(now) {
  if (now - lastUi < 150) return;
  lastUi = now;
  el('gps-x').textContent = Math.round(car.x);
  el('gps-y').textContent = Math.round(car.y);
  el('gps-road').textContent = car.nearestRoad ? (car.nearestRoad.name || car.nearestRoad.id) : '—';
  el('car-speed').textContent = Math.round(Math.abs(car.speed) * 0.12);
  el('car-heading').textContent = headingCompass();
  el('car-mode').textContent = car.offroad ? 'OFFROAD' : 'DRIVE';
  el('route-pct').textContent = Math.round(routeProgress * 100) + '%';
  el('offroad').hidden = !car.offroad;
  if (debugOn) {
    el('dbg-fps').textContent = fpsEMA.toFixed(0);
    el('dbg-wx').textContent = Math.round(car.x);
    el('dbg-wy').textContent = Math.round(car.y);
    el('dbg-cx').textContent = Math.round(camera.x);
    el('dbg-cy').textContent = Math.round(camera.y);
    el('dbg-zoom').textContent = camera.zoom.toFixed(2);
    el('dbg-speed').textContent = Math.round(car.speed);
    el('dbg-road').textContent = car.nearestRoad ? car.nearestRoad.id + ' ' + Math.round(car.nearestDist) + 'px' : '—';
    el('dbg-onroad').textContent = car.offroad ? 'no' : 'yes';
    el('dbg-route').textContent = Math.round(routeProgress * 100) + '%';
  }
}
function handleClick(sx, sy) {
  // Waypoints first.
  for (const w of WAYPOINTS) {
    const s = worldToScreen(w.x, w.y);
    if (Math.hypot(s.x - sx, s.y - sy) < 22) {
      const d = Math.round(Math.hypot(car.x - w.x, car.y - w.y) / 10);
      select('waypoint', w, w.name, d + ' m from car — click again to drive view');
      return;
    }
  }
  const s = worldToScreen(car.x, car.y);
  if (Math.hypot(s.x - sx, s.y - sy) < 30) {
    select('car', null, 'RC CAR', Math.round(Math.abs(car.speed) * 0.12) + ' km/h · ' + headingCompass());
    return;
  }
  const wpt = screenToWorld(sx, sy);
  for (const b of BUILDINGS) {
    const dx = wpt.x - b.x, dy = wpt.y - b.y;
    const c = Math.cos(-(b.rot || 0)), sn = Math.sin(-(b.rot || 0));
    const lx = dx * c - dy * sn, ly = dx * sn + dy * c;
    if (Math.abs(lx) < b.w / 2 && Math.abs(ly) < b.h / 2) {
      select('building', b, (b.label || b.type).toUpperCase(), b.type + ' · ' + b.w + '×' + b.h + ' m');
      return;
    }
  }
  select(null);
}
function select(kind, ref, name, meta) {
  selected = kind ? { kind, ref } : null;
  el('selected').hidden = !selected;
  if (selected) { el('selected-name').textContent = name; el('selected-meta').textContent = meta; }
}
el('selected-close').addEventListener('click', () => select(null));
function cycleCamera() {
  camera.mode = CAM_MODES[(CAM_MODES.indexOf(camera.mode) + 1) % CAM_MODES.length];
  syncCameraUI();
}
function syncCameraUI() {
  el('btn-camera').textContent = camera.mode === 'follow' ? '📷' : camera.mode === 'cinematic' ? '🎬' : '✋';
  el('btn-camera').title = 'Camera: ' + camera.mode;
}
function toggleTheme() {
  themeName = themeName === 'day' ? 'night' : 'day';
  el('btn-theme').textContent = themeName === 'day' ? '☾' : '☀';
  buildMinimapBase();
}
function resetMap() {
  resetCar();
  camera.zoom = 1.0;
  camera.mode = 'follow';
  select(null);
  syncCameraUI();
}
el('btn-zoom-in').addEventListener('click', () => zoomAt(viewW / 2, viewH / 2, 1.25));
el('btn-zoom-out').addEventListener('click', () => zoomAt(viewW / 2, viewH / 2, 1 / 1.25));
el('btn-recenter').addEventListener('click', () => { camera.mode = 'follow'; camera.x = car.x; camera.y = car.y; syncCameraUI(); });
el('btn-reset').addEventListener('click', resetMap);
el('btn-camera').addEventListener('click', cycleCamera);
el('btn-theme').addEventListener('click', toggleTheme);
// Touch drive pad (coarse pointers only).
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
  const pad = document.createElement('div');
  pad.className = 'hud hud-pad';
  pad.innerHTML = '<button data-k="ArrowLeft">◀</button><button data-k="ArrowUp">▲</button>' +
    '<button data-k="ArrowDown">▼</button><button data-k="ArrowRight">▶</button>';
  document.body.appendChild(pad);
  pad.querySelectorAll('button').forEach((b) => {
    const code = b.getAttribute('data-k');
    b.addEventListener('touchstart', (e) => { e.preventDefault(); keys[code] = true; }, { passive: false });
    b.addEventListener('touchend', () => { keys[code] = false; });
  });
  const st = document.createElement('style');
  st.textContent = '.hud-pad{left:50%;bottom:86px;transform:translateX(-50%);display:flex;gap:8px;pointer-events:auto;}' +
    '.hud-pad button{width:46px;height:46px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;font-size:18px;}' +
    '@media (pointer:fine){.hud-pad{display:none}}';
  document.head.appendChild(st);
}

/* ---------------- 12. Debug ---------------- */
let debugOn = false, fpsEMA = 60;
function toggleDebug() {
  debugOn = !debugOn;
  el('debug').hidden = !debugOn;
}

/* ---------------- 13. Main loop + boot ---------------- */
let lastT = performance.now();
function frame(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  dt = Math.min(dt, 0.05);
  fpsEMA = lerp(fpsEMA, 1 / Math.max(dt, 1e-4), 0.05);
  updateVehicle(dt);
  updateCamera(dt);
  updateRoute();
  render();
  drawMinimap();
  updateUI(now);
  requestAnimationFrame(frame);
}
resize();
resetCar();
syncCameraUI();
try {
  if (new URLSearchParams(window.location.search).get('embed') !== null) {
    document.body.classList.add('embed');
  }
} catch (err) { /* kiosk mode optional */ }
updateUI(performance.now());
requestAnimationFrame(frame);

/* Future ESP integration (no Bluetooth/Wi-Fi implemented here):
   DemoMap.connectVehicle(fn) hands the engine to live telemetry —
   fn() must return {x, y, heading, speed} in world px / rad / px-per-s. */
window.DemoMap = {
  vehicleState,
  camera,
  connectVehicle(fn) { telemetryFn = fn; vehicleState.connected = true; },
  disconnectVehicle() { telemetryFn = null; vehicleState.connected = false; }
};
