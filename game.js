/* ─── Canvas setup ───────────────────────────────────────────── */
const C   = document.getElementById('c');
const ctx = C.getContext('2d');

const dpr = window.devicePixelRatio || 1;
C.width  = 420 * dpr;
C.height = 580 * dpr;
C.style.width  = '420px';
C.style.height = '580px';
ctx.scale(dpr, dpr);

const W = 420, H = 580;
const ROAD_LEFT = 60, ROAD_RIGHT = 360, ROAD_W = 300;
const LANE_W = ROAD_W / 3;
const LANES = [
  ROAD_LEFT + LANE_W * 0.5,
  ROAD_LEFT + LANE_W * 1.5,
  ROAD_LEFT + LANE_W * 2.5,
];

/* ─── State ──────────────────────────────────────────────────── */
let state = 'idle';
let score = 0, best = 0;
try { best = parseInt(localStorage.getItem('td_best') || '0') || 0; } catch (_) {}

let phase, phaseProgress, lives, fuel, nitro;
let roadY, roadSpeed, tick;
let keys = {};
let playerX, playerY;
const playerW = 38, playerH = 68;
let playerHurt = 0, playerNitro = 0;
let enemies = [], powerups = [], particles = [], explosions = [];
let lastEnemy, lastPowerup, shakeX = 0, shakeTimer = 0;
let bgScroll1 = 0, bgScroll2 = 0;

/* gradient cache — rebuilt only on phase change */
let _rGrads = null, _rGradsPhase = -1;

/* ─── Phase color palettes ───────────────────────────────────── */
const PHASE_COLORS = [
  { road: '#1a1a1a', stripe: '#ff4400', line: '#ffaa00', sky1: '#0d0010', sky2: '#200030' },
  { road: '#0f1a0f', stripe: '#00ff88', line: '#00ccff', sky1: '#000d10', sky2: '#001a20' },
  { road: '#1a0f00', stripe: '#ffaa00', line: '#ff4400', sky1: '#100800', sky2: '#200f00' },
  { road: '#0a0a1a', stripe: '#8844ff', line: '#ff00cc', sky1: '#05000d', sky2: '#0d0020' },
];

function phaseCol() { return PHASE_COLORS[(phase - 1) % PHASE_COLORS.length]; }

/* ─── Enemy & powerup definitions ───────────────────────────── */
const ENEMY_TYPES = [
  { color: '#4488ff', color2: '#2255cc', roof: '#224488', name: 'Policia'  },
  { color: '#44bb44', color2: '#226622', roof: '#224422', name: 'Caminhão' },
  { color: '#ffcc22', color2: '#cc8800', roof: '#886600', name: 'Taxi'     },
  { color: '#cc44cc', color2: '#882288', roof: '#441144', name: 'Esportivo'},
  { color: '#888888', color2: '#444444', roof: '#222222', name: 'Sedan'    },
];

const PU_TYPES = [
  { id: 'fuel',   color: '#00ff88', glow: '#00ffaa', label: '⛽', score: 500  },
  { id: 'nitro',  color: '#00ccff', glow: '#00eeff', label: 'N',  score: 300  },
  { id: 'shield', color: '#ffaa00', glow: '#ffcc00', label: '🛡', score: 400  },
  { id: 'pts',    color: '#ff44ff', glow: '#ff88ff', label: '★',  score: 1000 },
];

/* ─── Drawing: player car ────────────────────────────────────── */
function drawPlayerCar(x, y, hurt, nitroOn) {
  ctx.save();
  ctx.translate(x, y);
  if (hurt > 0) ctx.globalAlpha = 0.5 + Math.sin(hurt * 0.5) * 0.5;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, playerH / 2 + 4, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // nitro flame
  if (nitroOn) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const fw = 6 + Math.random() * 6;
      const fh = 10 + Math.random() * 18;
      const fx = -8 + i * 8;
      const gy = ctx.createLinearGradient(fx, playerH / 2 - 4, fx, playerH / 2 + fh);
      gy.addColorStop(0, 'rgba(0,180,255,0.9)');
      gy.addColorStop(0.5, 'rgba(0,100,255,0.6)');
      gy.addColorStop(1, 'rgba(0,0,100,0)');
      ctx.fillStyle = gy;
      ctx.beginPath();
      ctx.moveTo(fx - fw / 2, playerH / 2 - 2);
      ctx.lineTo(fx, playerH / 2 + fh);
      ctx.lineTo(fx + fw / 2, playerH / 2 - 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // exhaust flames
  for (let i = 0; i < 2; i++) {
    const fx = -7 + i * 14;
    const fg = ctx.createLinearGradient(fx, playerH / 2 - 2, fx, playerH / 2 + 12);
    fg.addColorStop(0, nitroOn ? 'rgba(0,200,255,0.9)' : 'rgba(255,120,0,0.8)');
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(fx - 4, playerH / 2 - 2);
    ctx.lineTo(fx, playerH / 2 + 10 + Math.random() * 6);
    ctx.lineTo(fx + 4, playerH / 2 - 2);
    ctx.closePath();
    ctx.fill();
  }

  // body
  const bodyG = ctx.createLinearGradient(-playerW / 2, 0, playerW / 2, 0);
  bodyG.addColorStop(0,   '#cc2200');
  bodyG.addColorStop(0.3, '#ff4400');
  bodyG.addColorStop(0.7, '#ff4400');
  bodyG.addColorStop(1,   '#cc2200');
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.roundRect(-playerW / 2 + 2, -playerH / 2 + 8, playerW - 4, playerH - 16, 4);
  ctx.fill();

  // hood
  const hoodG = ctx.createLinearGradient(-12, -playerH / 2, 12, -playerH / 2 + 14);
  hoodG.addColorStop(0, '#ff6633');
  hoodG.addColorStop(1, '#cc2200');
  ctx.fillStyle = hoodG;
  ctx.beginPath();
  ctx.roundRect(-12, -playerH / 2, 24, 20, 3);
  ctx.fill();

  // trunk
  ctx.fillStyle = '#882200';
  ctx.beginPath();
  ctx.roundRect(-14, playerH / 2 - 22, 28, 14, 3);
  ctx.fill();

  // windshield
  ctx.fillStyle = 'rgba(100,200,255,0.6)';
  ctx.beginPath();
  ctx.roundRect(-10, -playerH / 2 + 10, 20, 16, 2);
  ctx.fill();
  // glare
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.roundRect(-8, -playerH / 2 + 12, 6, 5, 1);
  ctx.fill();

  // rear window
  ctx.fillStyle = 'rgba(60,120,180,0.5)';
  ctx.beginPath();
  ctx.roundRect(-8, playerH / 2 - 32, 16, 10, 2);
  ctx.fill();

  // wheels
  const wPos = [
    [-playerW / 2 + 1, -playerH / 2 + 18],
    [ playerW / 2 - 7, -playerH / 2 + 18],
    [-playerW / 2 + 1,  playerH / 2 - 30],
    [ playerW / 2 - 7,  playerH / 2 - 30],
  ];
  for (const [wx, wy] of wPos) {
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.roundRect(wx, wy, 10, 20, 3);
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.roundRect(wx + 2, wy + 2, 6, 16, 2);
    ctx.fill();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(wx + 5, wy + 10, 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // headlights
  ctx.fillStyle = 'rgba(255,240,180,0.9)';
  ctx.beginPath();
  ctx.ellipse(-8, -playerH / 2 + 6, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse( 8, -playerH / 2 + 6, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // glow
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#ffee88';
  ctx.fillStyle = 'rgba(255,240,100,0.6)';
  ctx.beginPath();
  ctx.ellipse(-8, -playerH / 2 + 6, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse( 8, -playerH / 2 + 6, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // taillights
  ctx.fillStyle = 'rgba(255,30,0,0.9)';
  ctx.beginPath();
  ctx.ellipse(-8, playerH / 2 - 16, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse( 8, playerH / 2 - 16, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ─── Drawing: enemy car ─────────────────────────────────────── */
function drawEnemyCar(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const t = ENEMY_TYPES[e.type % ENEMY_TYPES.length];
  const ew = 34, eh = 60;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, eh / 2 + 3, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyG = ctx.createLinearGradient(-ew / 2, 0, ew / 2, 0);
  bodyG.addColorStop(0,   t.color2);
  bodyG.addColorStop(0.4, t.color);
  bodyG.addColorStop(0.6, t.color);
  bodyG.addColorStop(1,   t.color2);
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.roundRect(-ew / 2 + 2, -eh / 2 + 8, ew - 4, eh - 16, 4);
  ctx.fill();

  ctx.fillStyle = t.roof;
  ctx.beginPath();
  ctx.roundRect(-10, -eh / 2, 20, 20, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-12, eh / 2 - 22, 24, 14, 3);
  ctx.fill();

  ctx.fillStyle = 'rgba(180,220,255,0.5)';
  ctx.beginPath();
  ctx.roundRect(-8, -eh / 2 + 10, 16, 14, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(150,190,220,0.4)';
  ctx.beginPath();
  ctx.roundRect(-7, eh / 2 - 32, 14, 10, 2);
  ctx.fill();

  // police lights
  if (e.type === 0) {
    ctx.fillStyle = 'rgba(0,100,255,0.8)';
    ctx.fillRect(-3, -eh / 2 - 4, 6, 4);
    if (Math.floor(tick / 5) % 2 === 0) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#0088ff';
      ctx.fillStyle = '#00aaff'; ctx.fillRect(-5, -eh / 2 - 4, 4, 3);
      ctx.fillStyle = '#ff2200'; ctx.fillRect( 1, -eh / 2 - 4, 4, 3);
      ctx.shadowBlur = 0;
    }
  }
  // taxi stripe
  if (e.type === 2) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-ew / 2 + 2, -2, ew - 4, 4);
  }

  const wp2 = [
    [-ew / 2 + 1, -eh / 2 + 16],
    [ ew / 2 - 7, -eh / 2 + 16],
    [-ew / 2 + 1,  eh / 2 - 28],
    [ ew / 2 - 7,  eh / 2 - 28],
  ];
  for (const [wx, wy] of wp2) {
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.roundRect(wx, wy, 9, 18, 3);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.roundRect(wx + 2, wy + 2, 5, 14, 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,60,0,0.8)';
  ctx.beginPath();
  ctx.ellipse(-7, eh / 2 - 16, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse( 7, eh / 2 - 16, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* ─── Drawing: powerup ───────────────────────────────────────── */
function drawPowerup(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  const t = PU_TYPES[p.type];
  const s = 12 + Math.sin(tick * 0.1) * 2;

  ctx.shadowBlur = 18;
  ctx.shadowColor = t.glow;
  ctx.strokeStyle = t.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 - Math.PI / 2;
    i === 0
      ? ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s)
      : ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = t.color + '33';
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = t.color;
  ctx.font = `bold ${s}px Orbitron`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t.label, 0, 0);
  ctx.restore();
}

/* ─── Drawing: explosion ─────────────────────────────────────── */
function drawExplosion(e) {
  ctx.save();
  for (let i = 0; i < e.shards; i++) {
    const d = e.speed[i] * e.maxLife * (1 - e.life / e.maxLife) * 8;
    const x = e.x + Math.cos(e.angles[i]) * d;
    const y = e.y + Math.sin(e.angles[i]) * d;
    const r = e.size[i] * (e.life / e.maxLife);
    ctx.globalAlpha = e.life / e.maxLife;
    ctx.fillStyle = e.colors[i];
    ctx.shadowBlur = 8;
    ctx.shadowColor = e.colors[i];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ─── Drawing: road ──────────────────────────────────────────── */
function drawRoad() {
  const col = phaseCol();

  // rebuild cached gradients on phase change
  if (_rGradsPhase !== phase) {
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.35);
    sky.addColorStop(0, col.sky1);
    sky.addColorStop(1, col.sky2);

    const eg = ctx.createLinearGradient(ROAD_LEFT, 0, ROAD_LEFT + 20, 0);
    eg.addColorStop(0, 'rgba(255,68,0,0.15)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');

    const eg2 = ctx.createLinearGradient(ROAD_RIGHT, 0, ROAD_RIGHT - 20, 0);
    eg2.addColorStop(0, 'rgba(255,68,0,0.15)');
    eg2.addColorStop(1, 'rgba(0,0,0,0)');

    _rGrads = { sky, eg, eg2 };
    _rGradsPhase = phase;
  }

  // sky
  ctx.fillStyle = _rGrads.sky;
  ctx.fillRect(0, 0, W, H * 0.35);

  // distant city silhouette
  ctx.fillStyle = 'rgba(255,68,0,0.06)';
  for (let i = 0; i < 12; i++) {
    const bx = 20 + i * 35;
    const bh = 20 + ((i * 137) % 50);
    ctx.fillRect(bx, H * 0.35 - bh, 22, bh);
  }

  // road surface
  ctx.fillStyle = col.road;
  ctx.beginPath();
  ctx.moveTo(ROAD_LEFT, 0);
  ctx.lineTo(ROAD_RIGHT, 0);
  ctx.lineTo(ROAD_RIGHT, H);
  ctx.lineTo(ROAD_LEFT, H);
  ctx.closePath();
  ctx.fill();

  // edge gradients (cached)
  ctx.fillStyle = _rGrads.eg;
  ctx.fillRect(ROAD_LEFT, 0, 20, H);
  ctx.fillStyle = _rGrads.eg2;
  ctx.fillRect(ROAD_RIGHT - 20, 0, 20, H);

  // pavement texture
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    const y = (roadY + i * 30) % H;
    ctx.beginPath();
    ctx.moveTo(ROAD_LEFT, y);
    ctx.lineTo(ROAD_RIGHT, y);
    ctx.stroke();
  }

  // side stripes
  ctx.fillStyle = col.stripe;
  ctx.fillRect(ROAD_LEFT, 0, 6, H);
  ctx.fillRect(ROAD_RIGHT - 6, 0, 6, H);

  // inner glow
  ctx.fillStyle = col.stripe + '44';
  ctx.fillRect(ROAD_LEFT + 6, 0, 4, H);
  ctx.fillRect(ROAD_RIGHT - 10, 0, 4, H);

  // center dashed line
  const dashH = 40, dashGap = 30, totalDash = dashH + dashGap;
  const offset = roadY % totalDash;
  ctx.fillStyle = col.line;
  for (let y = -totalDash + offset; y < H + totalDash; y += totalDash) {
    ctx.fillRect(W / 2 - 2, y, 4, dashH);
  }

  // lane dividers
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.setLineDash([20, 24]);
  ctx.lineDashOffset = -roadY;
  ctx.beginPath();
  ctx.moveTo(ROAD_LEFT + LANE_W, 0);
  ctx.lineTo(ROAD_LEFT + LANE_W, H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ROAD_LEFT + LANE_W * 2, 0);
  ctx.lineTo(ROAD_LEFT + LANE_W * 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  // sidewalks
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, ROAD_LEFT, H);
  ctx.fillRect(ROAD_RIGHT, 0, W - ROAD_RIGHT, H);

  // sidewalk lines
  bgScroll1 = (bgScroll1 + roadSpeed * 0.4) % 40;
  ctx.fillStyle = '#222';
  for (let y = -40 + bgScroll1; y < H + 40; y += 40) {
    ctx.fillRect(2, y, ROAD_LEFT - 4, 2);
    ctx.fillRect(ROAD_RIGHT + 2, y, W - ROAD_RIGHT - 4, 2);
  }

  // lamp posts
  bgScroll2 = (bgScroll2 + roadSpeed) % 160;
  ctx.strokeStyle = '#ff440044';
  ctx.lineWidth = 2;
  function drawLampPost(x, y) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 60); ctx.stroke();
    ctx.fillStyle = 'rgba(255,200,100,0.6)';
    ctx.shadowBlur = 15; ctx.shadowColor = '#ffaa00';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  for (let y = -160 + bgScroll2; y < H + 160; y += 160) {
    drawLampPost(45, y);
    drawLampPost(375, y);
  }
}

/* ─── Drawing: canvas HUD ────────────────────────────────────── */
function drawCanvasHUD() {
  const col = phaseCol();

  // nitro bar
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(ROAD_LEFT + 4, H - 18, 120, 10);
  ctx.fillStyle = col.stripe;
  ctx.fillRect(ROAD_LEFT + 4, H - 18, 120 * (nitro / 100), 10);
  ctx.strokeStyle = col.line; ctx.lineWidth = 1;
  ctx.strokeRect(ROAD_LEFT + 4, H - 18, 120, 10);
  ctx.fillStyle = '#fff'; ctx.font = '8px Orbitron';
  ctx.fillText('NITRO', ROAD_LEFT + 4, H - 22);

  // phase progress bar
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(ROAD_LEFT + 4, H - 36, 120, 8);
  ctx.fillStyle = col.line;
  ctx.fillRect(ROAD_LEFT + 4, H - 36, 120 * (phaseProgress / 1000), 8);
  ctx.strokeStyle = col.stripe; ctx.lineWidth = 1;
  ctx.strokeRect(ROAD_LEFT + 4, H - 36, 120, 8);
  ctx.fillStyle = '#aaa'; ctx.font = '7px Share Tech Mono';
  ctx.fillText(`FASE ${phase} — ${Math.floor(phaseProgress / 10)}%`, ROAD_LEFT + 4, H - 40);
}

/* ─── Spawn helpers ──────────────────────────────────────────── */
function spawnExplosion(x, y, big) {
  const n = big ? 24 : 12;
  const ex = {
    x, y,
    life: big ? 40 : 20, maxLife: big ? 40 : 20,
    shards: n, angles: [], speed: [], size: [], colors: [],
  };
  const palette = ['#ff4400', '#ff8800', '#ffcc00', '#ffffff', '#ff2200'];
  for (let i = 0; i < n; i++) {
    ex.angles.push(Math.random() * Math.PI * 2);
    ex.speed.push(0.5 + Math.random() * 1.5);
    ex.size.push(2 + Math.random() * (big ? 8 : 4));
    ex.colors.push(palette[Math.floor(Math.random() * palette.length)]);
  }
  explosions.push(ex);
}

function spawnParticle(x, y, vx, vy, color, life) {
  particles.push({ x, y, vx, vy, color, life, maxLife: life, r: 2 + Math.random() * 3 });
}

function spawnEnemy() {
  const lane = Math.floor(Math.random() * 3);
  const type = Math.floor(Math.random() * ENEMY_TYPES.length);
  enemies.push({
    x: LANES[lane], y: -40, lane, type,
    speed: roadSpeed * (0.3 + Math.random() * 0.7),
    w: 34, h: 60,
  });
}

function spawnPowerup() {
  const lane = Math.floor(Math.random() * 3);
  const type = Math.floor(Math.random() * PU_TYPES.length);
  powerups.push({ x: LANES[lane], y: -20, type, w: 28, h: 28 });
}

/* ─── Collision ──────────────────────────────────────────────── */
// 0.44 = slight forgiveness over true 0.5 AABB while remaining visually fair
function collides(ax, ay, aw, ah, bx, by, bw, bh) {
  return Math.abs(ax - bx) < (aw + bw) * 0.44
      && Math.abs(ay - by) < (ah + bh) * 0.44;
}

/* ─── UI helpers ─────────────────────────────────────────────── */
function flashScreen() {
  const fl = document.getElementById('phase-flash');
  fl.style.opacity = '1';
  setTimeout(() => fl.style.opacity = '0', 80);
}

function updateLives() {
  const hearts = ['❤ ❤ ❤', '❤ ❤', '❤', '💀'];
  document.getElementById('h-lives').textContent = hearts[Math.max(0, 3 - lives)];
}

/* ─── Game lifecycle ─────────────────────────────────────────── */
function initGame() {
  state = 'running';
  score = 0; phase = 1; phaseProgress = 0; lives = 3;
  fuel = 100; nitro = 0;
  roadY = 0; roadSpeed = 4; tick = 0;
  playerX = W / 2; playerY = H - 100;
  playerHurt = 0; playerNitro = 0;
  enemies = []; powerups = []; particles = []; explosions = [];
  lastEnemy = 80; lastPowerup = 200;
  shakeX = 0; shakeTimer = 0;

  document.getElementById('overlay').classList.add('hidden');
  updateLives();
  document.getElementById('h-phase').textContent = phase;
  document.getElementById('h-score').textContent = '0';
  loop();
}

function gameOver() {
  state = 'dead';
  if (score > best) {
    best = score;
    try { localStorage.setItem('td_best', best); } catch (_) {}
  }
  setTimeout(() => {
    const ov = document.getElementById('overlay');
    ov.classList.remove('hidden');
    document.getElementById('ovr-info').textContent = '';
    document.getElementById('ovr-stat').style.display = 'block';
    document.getElementById('ovr-stat').textContent = score.toLocaleString();
    document.getElementById('ovr-best').style.display = 'block';
    document.getElementById('ovr-best').textContent = 'RECORDE: ' + best.toLocaleString();
    document.getElementById('btn-start').textContent = 'Jogar Novamente';
    document.getElementById('ovr-tip').textContent = '[ espaço ] para recomeçar';
    document.querySelector('.ovr-logo').textContent = 'GAME';
    document.querySelectorAll('.ovr-logo')[1].textContent = 'OVER';
  }, 600);
}

/* ─── Update ─────────────────────────────────────────────────── */
function update() {
  tick++;
  phaseProgress += 0.5;

  if (phaseProgress >= 1000) {
    phaseProgress = 0;
    phase++;
    if (phase > 8) phase = 8;
    roadSpeed = Math.min(4 + phase * 0.8, 14);
    document.getElementById('h-phase').textContent = phase;
    flashScreen();
    spawnExplosion(W / 2, H / 2, true);
  }

  roadY = (roadY + roadSpeed) % H;

  // speed
  let targetSpeed = 4 + phase * 0.8;
  if (keys['ArrowUp']   || keys['w'] || keys['W']) targetSpeed = Math.min(14, targetSpeed + 4);
  if (keys['ArrowDown'] || keys['s'] || keys['S']) targetSpeed = Math.max(1,  targetSpeed - 3);
  roadSpeed += (targetSpeed - roadSpeed) * 0.05;
  roadSpeed = Math.max(1, Math.min(14, roadSpeed));

  // nitro
  if ((keys['z'] || keys['Z']) && nitro > 0 && playerNitro < 1) {
    playerNitro = 20;
    nitro = Math.max(0, nitro - 2);
  }
  if (playerNitro > 0) {
    playerNitro--;
    roadSpeed = Math.min(18, roadSpeed + 3);
    document.getElementById('nitro-fx').style.opacity = '0.8';
  } else {
    document.getElementById('nitro-fx').style.opacity = '0';
  }

  // movement
  const moveSpeed = 3.5 + roadSpeed * 0.2;
  if (keys['ArrowLeft']  || keys['a'] || keys['A'])
    playerX = Math.max(ROAD_LEFT  + playerW / 2 + 2, playerX - moveSpeed);
  if (keys['ArrowRight'] || keys['d'] || keys['D'])
    playerX = Math.min(ROAD_RIGHT - playerW / 2 - 2, playerX + moveSpeed);

  // fuel
  fuel = Math.max(0, fuel - 0.008 * (roadSpeed / 4));
  const fuelBar = document.getElementById('fuel-bar');
  fuelBar.style.width = fuel + '%';
  fuelBar.style.background = fuel > 30
    ? 'linear-gradient(90deg,#00ff88,#00ccff)'
    : fuel > 10
      ? 'linear-gradient(90deg,#ffaa00,#ff4400)'
      : 'linear-gradient(90deg,#ff0000,#ff4400)';
  document.getElementById('speed-bar').style.width = (roadSpeed / 18 * 100) + '%';
  document.getElementById('h-score').textContent = score.toLocaleString();

  if (fuel <= 0) { gameOver(); return; }

  // screen shake
  if (shakeTimer > 0) {
    shakeX = Math.sin(shakeTimer * 2) * (shakeTimer * 0.5);
    shakeTimer--;
  } else {
    shakeX = 0;
  }

  if (playerHurt > 0) playerHurt--;

  // spawn enemies
  lastEnemy--;
  const enemyGap = Math.max(30, 80 - phase * 5);
  if (lastEnemy <= 0) { spawnEnemy(); lastEnemy = enemyGap + Math.random() * 40; }

  // spawn powerups
  lastPowerup--;
  if (lastPowerup <= 0) { spawnPowerup(); lastPowerup = 180 + Math.random() * 120; }

  // update enemies
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.y += roadSpeed - e.speed;
    if (tick % 4 === 0) {
      spawnParticle(e.x - 4, e.y + e.h / 2, 0, 1 + (Math.random() - 0.5), 'rgba(150,150,150,0.5)', 12);
      spawnParticle(e.x + 4, e.y + e.h / 2, 0, 1 + (Math.random() - 0.5), 'rgba(150,150,150,0.5)', 12);
    }
    if (playerHurt <= 0 && collides(playerX, playerY, playerW, playerH, e.x, e.y, e.w, e.h)) {
      lives--; updateLives();
      playerHurt = 80; shakeTimer = 20;
      spawnExplosion(e.x, e.y, false);
      enemies.splice(i, 1);
      if (lives <= 0) { spawnExplosion(playerX, playerY, true); gameOver(); return; }
      continue;
    }
    if (e.y > H + 60) enemies.splice(i, 1);
    else score += Math.floor(roadSpeed * 0.1);
  }

  // update powerups
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.y += roadSpeed * 0.5;
    if (collides(playerX, playerY, playerW, playerH, p.x, p.y, p.w, p.h)) {
      const t = PU_TYPES[p.type];
      score += t.score;
      if (t.id === 'fuel')   fuel = Math.min(100, fuel + 30);
      if (t.id === 'nitro')  nitro = Math.min(100, nitro + 50);
      if (t.id === 'shield') playerHurt = 200;
      spawnExplosion(p.x, p.y, false);
      for (let k = 0; k < 8; k++)
        spawnParticle(p.x, p.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, t.color, 20);
      powerups.splice(i, 1);
      continue;
    }
    if (p.y > H + 40) powerups.splice(i, 1);
  }

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.05;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // explosions
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].life--;
    if (explosions[i].life <= 0) explosions.splice(i, 1);
  }
}

/* ─── Draw ───────────────────────────────────────────────────── */
function draw() {
  ctx.save();
  if (shakeX !== 0) ctx.translate(shakeX, 0);

  drawRoad();

  // particles (behind cars)
  for (const p of particles) {
    ctx.globalAlpha = p.life / p.maxLife * 0.7;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (p.life / p.maxLife), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const e  of enemies)    drawEnemyCar(e);
  for (const p  of powerups)   drawPowerup(p);
  for (const ex of explosions) drawExplosion(ex);

  drawPlayerCar(playerX, playerY, playerHurt, playerNitro > 0);
  drawCanvasHUD();

  // shield bubble
  if (playerHurt > 100) {
    ctx.save();
    ctx.strokeStyle = `rgba(0,200,255,${(Math.sin(tick * 0.4) * 0.5 + 0.5) * 0.8})`;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15; ctx.shadowColor = '#00ccff';
    ctx.beginPath();
    ctx.ellipse(playerX, playerY, playerW * 0.7, playerH * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // low fuel warning
  if (fuel < 15 && Math.floor(tick / 20) % 2 === 0) {
    ctx.fillStyle = 'rgba(255,0,0,0.8)';
    ctx.font = 'bold 14px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ COMBUSTÍVEL CRÍTICO', W / 2, 30);
  }

  ctx.restore();
}

/* ─── Game loop ──────────────────────────────────────────────── */
function loop() {
  if (state !== 'running') return;
  update();
  draw();
  requestAnimationFrame(loop);
}

/* ─── Idle screen ────────────────────────────────────────────── */
phase = 1; tick = 0; roadY = 0; roadSpeed = 4; bgScroll1 = 0; bgScroll2 = 0;
drawRoad();
drawPlayerCar(W / 2, H - 100, 0, false);

/* ─── Keyboard input ─────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (state === 'idle' || state === 'dead') initGame();
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
    e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key] = false; });
document.getElementById('btn-start').addEventListener('click', initGame);

/* ─── Touch input ────────────────────────────────────────────── */
let touchStartX = null, touchId = null;

C.addEventListener('touchstart', e => {
  e.preventDefault();
  if (state === 'idle' || state === 'dead') { initGame(); return; }
  if (touchId === null) {
    touchId     = e.changedTouches[0].identifier;
    touchStartX = e.changedTouches[0].clientX;
    keys['ArrowUp'] = true;
  }
}, { passive: false });

C.addEventListener('touchmove', e => {
  e.preventDefault();
  if (touchId === null) return;
  const touch = Array.from(e.touches).find(t => t.identifier === touchId);
  if (!touch) return;
  const dx = touch.clientX - touchStartX;
  keys['ArrowLeft']  = dx < -20;
  keys['ArrowRight'] = dx >  20;
}, { passive: false });

C.addEventListener('touchend', e => {
  e.preventDefault();
  const ended = Array.from(e.changedTouches).find(t => t.identifier === touchId);
  if (ended) {
    keys['ArrowLeft'] = keys['ArrowRight'] = keys['ArrowUp'] = false;
    touchStartX = null;
    touchId     = null;
  }
}, { passive: false });
