/* simulator.js — 2D/3D toio simulator with multi-cube support */

// Helper
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
window.sleep = sleep;

/* ── Cube colors ─────────────────────────────────────────────────────────── */
const CUBE_COLORS = ['#0078FF', '#18B86B', '#D97706', '#DC2626'];

/* ── Mat configurations ──────────────────────────────────────────────────── */
/*  Each entry: { xMin, yMin, xMax, yMax }
    Aspect ratio is derived from the coordinate range (not physical mm).      */
const MAT_CONFIGS = {
  simple: {
    xMin: 98,  yMin: 142, xMax: 402, yMax: 358,
    label: () => t('ui.matSimple'),
  },
  original: {
    xMin: 45,  yMin: 45,  xMax: 455, yMax: 455,
    name: 'トイコレマット(表)',
    label: () => 'トイコレマット(表)',
  },
};

/** Load custom mats from localStorage → array of { id, name, xMin, yMin, xMax, yMax } */
function loadCustomMats() {
  try { return JSON.parse(localStorage.getItem('customMats') || '[]'); }
  catch { return []; }
}

function saveCustomMats(mats) {
  localStorage.setItem('customMats', JSON.stringify(mats));
}

/** Get mat config by type string (built-in key or custom id) */
function getMatConfig(type) {
  if (MAT_CONFIGS[type]) return MAT_CONFIGS[type];
  const custom = loadCustomMats().find(m => m.id === type);
  if (custom) return custom;
  return MAT_CONFIGS.simple;
}

window.loadCustomMats = loadCustomMats;
window.saveCustomMats = saveCustomMats;
window.MAT_CONFIGS    = MAT_CONFIGS;

/* ── SimCubeBackend ──────────────────────────────────────────────────────── */
/* One per cube; implements the same method surface as ToioDevice */
class SimCubeBackend {
  constructor(sim, index) {
    this._sim   = sim;
    this.index  = index;
    this.name   = `Simulator ${index + 1}`;
    this._pendingButton = null;

    this._resetDefaults();
    this._led             = null;
    this._trail           = [];
    this.button           = false;
    this.showTrail        = true;
    this._buttonListeners = [];
    this.physicsY         = null;  // null = on mat; number = elevated (THREE units)
    this._rollX           = 0;     // radians, X-axis tilt from physics
    this._rollZ           = 0;     // radians, Z-axis tilt from physics
  }

  _resetDefaults() {
    const defaults = [
      { x: 200, y: 250, angle: 0 },
      { x: 300, y: 250, angle: 180 },
      { x: 250, y: 200, angle: 0 },
      { x: 250, y: 300, angle: 90 },
    ];
    const d = defaults[this.index] || { x: 250, y: 250, angle: 0 };
    this._x = d.x; this._y = d.y; this._angle = d.angle;
  }

  /* ── Snapshot for drawing ─────────────────────────────────────────────── */
  snapshot() {
    return {
      x: this._x, y: this._y, angle: this._angle,
      led: this._led, trail: this._trail,
      button: this.button, index: this.index,
      showTrail: this.showTrail,
    };
  }

  toggleTrail() { this.showTrail = !this.showTrail; }

  /* ── Motor ───────────────────────────────────────────────────────────────*/
  async move(leftSpeed, rightSpeed, durationMs = 0) {
    const dur   = Math.max(0, durationMs) / 1000;
    const steps = Math.max(1, Math.round(dur * 60));
    const dt    = dur / steps;
    const SCALE = 0.5;
    const cfg   = this._sim._matCfg;

    for (let i = 0; i < steps; i++) {
      if (this._sim._stopped) return;
      const avg  = (leftSpeed + rightSpeed) / 2;
      const diff = (leftSpeed - rightSpeed) / 2;
      const rad  = (this._angle - 90) * Math.PI / 180;

      this._trail.push({ x: this._x, y: this._y });
      if (this._trail.length > 2000) this._trail.shift();

      this._x    += Math.cos(rad) * avg * dt * SCALE;
      this._y    += Math.sin(rad) * avg * dt * SCALE;
      this._angle = ((this._angle + diff * dt * 3) % 360 + 360) % 360;
      this._x = Math.max(cfg.xMin, Math.min(cfg.xMax, this._x));
      this._y = Math.max(cfg.yMin, Math.min(cfg.yMax, this._y));

      this._sim._notifyUpdate();
      await sleep(dt * 1000);
    }
  }

  async stop() { /* no-op in sim */ }

  async moveTo(x, y, angle = 0, speed = 80, mode = 'NORMAL') {
    const dx = x - this._x, dy = y - this._y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Angle the cube should face while travelling to (x, y)
    // atan2(dy, dx) gives east=0; toio 0°=up (north), so +90°
    const faceAngle = dist > 1 ? (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360 : this._angle;

    // In POS_ONLY mode the cube faces the travel direction (differential drive)
    // In NORMAL/ROT_FIRST the target angle is the supplied angle parameter
    const keepAngle  = false;    // we always update angle in the simulator
    const targetAngle = (mode === 'POS_ONLY' || mode === 'ROT_FIRST' || angle === null)
      ? faceAngle
      : (angle ?? this._angle);

    const SCALE = 0.5;
    const durMs = (dist / (speed * SCALE)) * 1000 + 100;
    const steps = Math.max(10, Math.round(durMs / 16));

    const sx = this._x, sy = this._y, sa = this._angle;

    // ROT_FIRST / POS_ONLY: rotate to face destination first, then translate
    if ((mode === 'ROT_FIRST' || mode === 'POS_ONLY') && dist > 1) {
      const diff = ((faceAngle - sa + 540) % 360) - 180;
      const rotSteps = Math.max(5, Math.round(Math.abs(diff) / 5));
      for (let i = 1; i <= rotSteps; i++) {
        if (this._sim._stopped) return;
        this._angle = sa + diff * (i / rotSteps);
        this._sim._notifyUpdate();
        await sleep(16);
      }
      this._angle = faceAngle;
    }

    const sa2 = this._angle;
    for (let i = 1; i <= steps; i++) {
      if (this._sim._stopped) return;
      const tt = i / steps;
      this._trail.push({ x: this._x, y: this._y });
      if (this._trail.length > 2000) this._trail.shift();
      this._x = sx + (x - sx) * tt;
      this._y = sy + (y - sy) * tt;
      // NORMAL mode: interpolate to targetAngle during travel
      if (mode === 'NORMAL') {
        const d2 = ((targetAngle - sa2 + 540) % 360) - 180;
        this._angle = sa2 + d2 * tt;
      }
      this._sim._notifyUpdate();
      await sleep(16);
    }
    this._x = x; this._y = y;
    this._angle = ((targetAngle % 360) + 360) % 360;
  }

  async rotateTo(angle, speed = 80) {
    const sa = this._angle;
    const targetAngle = ((angle % 360) + 360) % 360;
    const diff = ((targetAngle - sa + 540) % 360) - 180;
    const steps = Math.max(5, Math.round(Math.abs(diff) * 0.5));
    for (let i = 1; i <= steps; i++) {
      if (this._sim._stopped) return;
      const tt = i / steps;
      this._angle = sa + diff * tt;
      this._sim._notifyUpdate();
      await sleep(16);
    }
    this._angle = targetAngle;
  }

  async moveRel(dist, speed = 80) {
    const angleRad = this._angle * Math.PI / 180;
    const nx = this._x + dist * Math.sin(angleRad);
    const ny = this._y - dist * Math.cos(angleRad);
    await this.moveTo(Math.round(nx), Math.round(ny), this._angle, speed);
  }

  async rotateRel(dAngle, speed = 80) {
    const newAngle = ((this._angle + Math.round(dAngle)) % 360 + 360) % 360;
    await this.rotateTo(newAngle, speed);
  }

  /* ── Light ───────────────────────────────────────────────────────────────*/
  async setLED(r, g, b, durationMs = 0) {
    this._led = { r, g, b };
    this._sim._notifyUpdate();
    if (durationMs > 0) {
      await sleep(durationMs);
      this._led = null;
      this._sim._notifyUpdate();
    }
  }

  async turnOffLED() { this._led = null; this._sim._notifyUpdate(); }

  /* ── Sound ───────────────────────────────────────────────────────────────*/
  async playSound(noteNo, durationMs = 500) {
    try {
      const ac  = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const gain= ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.frequency.value = 440 * Math.pow(2, (noteNo - 69) / 12);
      gain.gain.value = 0.2;
      osc.start();
      await sleep(durationMs);
      osc.stop(); ac.close();
    } catch(e) { await sleep(durationMs); }
  }

  async playSoundEffect(id) {
    const freqs = [523, 659, 523, 784, 988, 1047, 659, 400];
    try {
      const ac  = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const gain= ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.frequency.value = freqs[id % freqs.length] || 440;
      gain.gain.value = 0.18;
      osc.start(); await sleep(180); osc.stop(); ac.close();
    } catch(e) {}
  }

  async stopSound() {}

  /* ── Sensors ─────────────────────────────────────────────────────────────*/
  async getBattery() { return 80; }
  get position() { return { x: Math.round(this._x), y: Math.round(this._y), angle: Math.round(this._angle) }; }

  /* ── Button ──────────────────────────────────────────────────────────────*/
  async waitButton() {
    return new Promise(resolve => { this._pendingButton = resolve; });
  }

  pressButton() {
    this.button = true;
    if (this._pendingButton) { this._pendingButton(); this._pendingButton = null; }
    // Fire event-driven button listeners (toio_on_button block)
    if (this._buttonListeners && this._buttonListeners.length) {
      this._buttonListeners.forEach(fn => { try { fn(); } catch(e) { console.error(e); } });
    }
    setTimeout(() => { this.button = false; this._sim._notifyUpdate(); }, 200);
    this._sim._notifyUpdate();
  }

  resetState() {
    this._resetDefaults();
    this._led = null; this._trail = []; this.button = false;
    this._pendingButton = null;
    this._buttonListeners = [];
    this.physicsY = null;
    this._rollX = 0;
    this._rollZ = 0;
  }

  /** Reset position/LED/button only — trail is preserved intentionally. */
  resetPosition() {
    this._resetDefaults();
    this._led = null; this.button = false;
    this._pendingButton = null;
    this._buttonListeners = [];
    this.physicsY = null;
    this._rollX = 0;
    this._rollZ = 0;
  }
}

/* ── Landing-orientation helper ─────────────────────────────────────────── */
/**
 * Given a cube's current tilt (rollX, rollZ in radians) and yaw (angleDeg in
 * degrees), return the (rollX, rollZ) pair where the face that is currently
 * nearest to the ground ends up flat on the mat.
 *
 * Maths: THREE.js XYZ Euler order means the combined rotation is
 *   M = Rz(rz) * Ry(ry) * Rx(rx)
 * The world-Y component of M * n gives how far a face normal n points up.
 * We pick the n with minimum world-Y (most toward the ground) and return
 * the roll angles that put that face flat.
 */
function _nearestFlatOrientation(rollX, rollZ, angleDeg) {
  const rx = rollX || 0;
  const rz = rollZ || 0;
  // THREE.js sets mesh.rotation.y = -(angle_deg) * PI/180
  const ry = -((angleDeg || 0) * Math.PI / 180);

  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  // Row-1 of M = Rz*Ry*Rx gives the world-Y component of M*v
  // M[1,*] = [ sz*cy,  cz*cx+sz*sy*sx,  -cz*sx+sz*sy*cx ]
  const wyForN = (nx, ny, nz) =>
    sz*cy*nx + (cz*cx + sz*sy*sx)*ny + (-cz*sx + sz*sy*cx)*nz;

  const faces = [
    { wy: wyForN( 0,-1, 0), tRx: 0,            tRz: 0           }, // bottom
    { wy: wyForN( 0, 1, 0), tRx: Math.PI,       tRz: 0           }, // top
    { wy: wyForN( 0, 0, 1), tRx:  Math.PI / 2,  tRz: 0           }, // front
    { wy: wyForN( 0, 0,-1), tRx: -Math.PI / 2,  tRz: 0           }, // back
    { wy: wyForN( 1, 0, 0), tRx: 0,            tRz: -Math.PI / 2 }, // right
    { wy: wyForN(-1, 0, 0), tRx: 0,            tRz:  Math.PI / 2 }, // left
  ];

  let best = faces[0];
  for (const f of faces) if (f.wy < best.wy) best = f;
  return { rollX: best.tRx, rollZ: best.tRz };
}

/* ── ToioSimulator ───────────────────────────────────────────────────────── */
class ToioSimulator {
  constructor() {
    this._canvas2d  = null;
    this._div3d     = null;
    this._mode      = '2d';
    this._matType   = 'simple';
    this._cubes     = [];
    this._stopped   = false;
    this._statusFn  = null;
    this._rafId     = null;
    this._dirty     = true;

    // Three.js objects
    this._scene      = null;
    this._camera     = null;
    this._renderer   = null;
    this._controls   = null;
    this._meshes     = [];
    this._matMesh    = null;
    this._gridHelper = null;
    this._matBorder  = null;

    // 3D extras
    this._trailLines       = [];   // THREE.Line per cube for trail
    this._grabState        = null; // Grab mode interaction state
    this._grabHelper       = null; // BoxHelper for selected cube highlight
    this._grabRaycaster    = null; // Reusable raycaster
    this._interactMode     = 'orbit';
    this._3dModeToolbar    = null;
    this._grabListenersActive = false;

    // Resize observer
    this._ro = null;
  }

  /* ── Mat config (dynamic) ─────────────────────────────────────────────── */
  get _matCfg() { return getMatConfig(this._matType); }

  /* ── Init ─────────────────────────────────────────────────────────────── */
  init(canvas2d, div3d) {
    this._canvas2d = canvas2d;
    this._div3d    = div3d;
    this._ensureCube(0);

    this._ro = new ResizeObserver(() => {
      this._resizeCanvas();
      if (this._mode === '3d' && this._renderer) this._resize3D();
    });
    const inner = canvas2d.parentElement;
    if (inner) this._ro.observe(inner);
    this._resizeCanvas();
    this._startRaf();
    this._initDrag(canvas2d);
  }

  /* ── Mouse drag (position + angle handle) ─────────────────────────────── */
  _initDrag(canvas) {
    let dragging = null; // { cubeIdx, mode: 'pos'|'angle' }
    this._hoverInfo = null; // { cubeIdx, mode } for cursor

    const canvasCoord = (e) => {
      const rect = canvas.getBoundingClientRect();
      const dpr  = window.devicePixelRatio || 1;
      const W = canvas.width / dpr, H = canvas.height / dpr;
      return {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top)  * (H / rect.height),
        W, H,
      };
    };

    const hitTest = ({ x, y, W, H }) => {
      const PAD = Math.min(20, Math.min(W, H) * 0.04);
      const sz  = this._cubeSize(W, H, PAD);
      for (let i = this._cubes.length - 1; i >= 0; i--) {
        const s = this._cubes[i].snapshot();
        const { cx, cy } = this._matToCanvas(s.x, s.y, W, H, PAD);
        // Angle handle: small dot in front of cube
        const rad = (s.angle - 90) * Math.PI / 180;
        const hx  = cx + Math.cos(rad) * sz * 1.1;
        const hy  = cy + Math.sin(rad) * sz * 1.1;
        if (Math.hypot(x - hx, y - hy) < Math.max(5, sz * 0.32)) {
          return { cubeIdx: i, mode: 'angle' };
        }
        if (Math.hypot(x - cx, y - cy) < sz * 0.75) {
          return { cubeIdx: i, mode: 'pos' };
        }
      }
      return null;
    };

    canvas.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      const coord = canvasCoord(e);
      const hit   = hitTest(coord);
      if (hit) { dragging = hit; e.preventDefault(); canvas.style.cursor = hit.mode === 'angle' ? 'crosshair' : 'grabbing'; }
    });

    canvas.addEventListener('mousemove', e => {
      const coord = canvasCoord(e);
      const { x, y, W, H } = coord;
      const PAD = Math.min(20, Math.min(W, H) * 0.04);

      if (dragging) {
        const cube = this._cubes[dragging.cubeIdx];
        if (!cube) return;
        const cfg = this._matCfg;
        if (dragging.mode === 'pos') {
          const { offX, offY, areaW, areaH } = this._matArea(W, H, PAD);
          const mx = cfg.xMin + (x - offX) / areaW * (cfg.xMax - cfg.xMin);
          const my = cfg.yMin + (y - offY) / areaH * (cfg.yMax - cfg.yMin);
          cube._x = Math.max(cfg.xMin, Math.min(cfg.xMax, mx));
          cube._y = Math.max(cfg.yMin, Math.min(cfg.yMax, my));
        } else {
          const { cx, cy } = this._matToCanvas(cube._x, cube._y, W, H, PAD);
          cube._angle = ((Math.atan2(y - cy, x - cx) * 180 / Math.PI + 90) % 360 + 360) % 360;
        }
        this._notifyUpdate();
        e.preventDefault();
        return;
      }

      // Cursor hint
      const hit = hitTest(coord);
      this._hoverInfo = hit;
      canvas.style.cursor = hit ? (hit.mode === 'angle' ? 'crosshair' : 'grab') : 'default';
      if (hit) this._dirty = true; // re-draw handle highlight
    });

    const endDrag = () => {
      if (dragging) { dragging = null; canvas.style.cursor = 'default'; }
    };
    canvas.addEventListener('mouseup',    endDrag);
    canvas.addEventListener('mouseleave', endDrag);
  }

  _resizeCanvas() {
    const el = this._canvas2d;
    if (!el) return;
    const p = el.parentElement;
    if (!p) return;
    const w = p.clientWidth, h = p.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const tw = Math.round(w * dpr), th = Math.round(h * dpr);
    if (el.width !== tw || el.height !== th) {
      el.width  = tw;
      el.height = th;
      el.style.width  = w + 'px';
      el.style.height = h + 'px';
    }
    this._dirty = true;
  }

  /** Called from fullscreenchange event — forces layout recalc */
  resize() {
    setTimeout(() => {
      this._resizeCanvas();
      if (this._mode === '3d' && this._renderer) this._resize3D();
    }, 50);
  }

  _startRaf() {
    const tick = () => {
      if (this._mode === '2d' && this._dirty) {
        this._draw2D();
        this._dirty = false;
      }
      if (this._mode === '3d' && this._renderer) {
        this._update3D();
        this._renderer.render(this._scene, this._camera);
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _notifyUpdate() {
    this._dirty = true;
    if (this._mode === '3d') this._sync3DCubes();
    if (this._statusFn) this._statusFn(this._cubes);
  }

  /* ── Cube management ──────────────────────────────────────────────────── */
  _ensureCube(index) {
    while (this._cubes.length <= index) {
      this._cubes.push(new SimCubeBackend(this, this._cubes.length));
    }
    return this._cubes[index];
  }

  getCubeBackend(index) { return this._ensureCube(index); }
  get cubeCount() { return this._cubes.length; }

  setCubeCount(n) {
    while (this._cubes.length < n) this._ensureCube(this._cubes.length);
    if (n < this._cubes.length) this._cubes.length = n;
    this._dirty = true;
  }

  /* ── Reset ────────────────────────────────────────────────────────────── */
  reset() {
    this._cubes.forEach(c => c.resetState());
    this._dirty = true;
    if (this._statusFn) this._statusFn(this._cubes);
  }

  /** Reset cube positions/LED/buttons only — trails are preserved. */
  resetPosition() {
    this._cubes.forEach(c => c.resetPosition());
    this._dirty = true;
    if (this._statusFn) this._statusFn(this._cubes);
  }

  /* ── Mode / mat ───────────────────────────────────────────────────────── */
  setMode(mode) {
    this._mode = mode;
    if (mode === '3d') {
      this._canvas2d.style.display = 'none';
      this._div3d.style.display    = 'block';
      if (!this._renderer) this._init3D();
      else { this._resize3D(); this._sync3DCubes(); }
    } else {
      // Leaving 3D — stop any grab interaction, drop lifted cubes
      this._stopGrabListeners();
      this._cubes.forEach((c, i) => {
        if (c.physicsY !== null && c.physicsY !== undefined) c.physicsY = null;
        c._rollX = 0; c._rollZ = 0;
      });
      this._canvas2d.style.display = 'block';
      this._div3d.style.display    = 'none';
      this._dirty = true;
    }
  }

  setMatType(type) {
    this._matType = type;
    this._dirty = true;
    if (this._mode === '3d') this._redrawMatTexture();
  }

  onStatus(fn) { this._statusFn = fn; }
  stop()       { this._stopped = true; }
  resume()     { this._stopped = false; }

  pressButton(index = 0) {
    const c = this._cubes[index];
    if (c) c.pressButton();
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /* 2D DRAWING                                                               */
  /* ──────────────────────────────────────────────────────────────────────── */

  /**
   * Compute the drawable rect for the mat inside the canvas, preserving aspect ratio.
   * Returns { offX, offY, areaW, areaH } — the mat draw area in canvas pixels.
   */
  _matArea(W, H, PAD) {
    const cfg = this._matCfg;
    const matW = cfg.xMax - cfg.xMin;
    const matH = cfg.yMax - cfg.yMin;
    const matAspect  = matW / matH;
    const drawW = W - 2 * PAD;
    const drawH = H - 2 * PAD;
    const drawAspect = drawW / drawH;

    let areaW, areaH, offX, offY;
    if (matAspect > drawAspect) {
      // Mat is wider → fit width, letterbox top/bottom
      areaW = drawW;
      areaH = drawW / matAspect;
      offX  = PAD;
      offY  = PAD + (drawH - areaH) / 2;
    } else {
      // Mat is taller → fit height, letterbox left/right
      areaH = drawH;
      areaW = drawH * matAspect;
      offY  = PAD;
      offX  = PAD + (drawW - areaW) / 2;
    }
    return { offX, offY, areaW, areaH };
  }

  /** Convert mat coordinates to canvas pixels */
  _matToCanvas(mx, my, W, H, PAD) {
    const cfg = this._matCfg;
    const { offX, offY, areaW, areaH } = this._matArea(W, H, PAD);
    const cx = offX + (mx - cfg.xMin) / (cfg.xMax - cfg.xMin) * areaW;
    const cy = offY + (my - cfg.yMin) / (cfg.yMax - cfg.yMin) * areaH;
    return { cx, cy };
  }

  /** Cube visual size in pixels — physically accurate (32mm cube on mat) */
  _cubeSize(W, H, PAD) {
    const cfg = this._matCfg;
    const { areaW, areaH } = this._matArea(W, H, PAD);
    const xRange = cfg.xMax - cfg.xMin;
    const yRange = cfg.yMax - cfg.yMin;
    // 32mm cube on a mat where ~1.37mm ≈ 1 coordinate unit → ~23.4 units
    const CUBE_UNITS = 23.5;
    const pxPerUnit = (areaW / xRange + areaH / yRange) / 2;
    return Math.max(6, CUBE_UNITS * pxPerUnit);
  }

  _draw2D() {
    const cv  = this._canvas2d;
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = cv.width / dpr, H = cv.height / dpr;
    if (W === 0 || H === 0) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    const PAD = Math.min(20, Math.min(W, H) * 0.04);

    // Background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#F0F2F7';
    ctx.fillRect(0, 0, W, H);

    // Draw mat
    if (this._matType === 'original') {
      this._drawOriginalMat(ctx, W, H, PAD);
    } else if (MAT_CONFIGS[this._matType]) {
      this._drawSimpleMat(ctx, W, H, PAD);
    } else {
      this._drawCustomMat(ctx, W, H, PAD);
    }

    // Trails
    for (const cube of this._cubes) {
      const s = cube.snapshot();
      if (!cube.showTrail || s.trail.length < 2) continue;
      const color = CUBE_COLORS[s.index % CUBE_COLORS.length];
      ctx.beginPath();
      ctx.strokeStyle = color + '40';
      ctx.lineWidth = 1.5;
      const p0 = this._matToCanvas(s.trail[0].x, s.trail[0].y, W, H, PAD);
      ctx.moveTo(p0.cx, p0.cy);
      for (const p of s.trail) {
        const { cx, cy } = this._matToCanvas(p.x, p.y, W, H, PAD);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // Cubes
    const sz = this._cubeSize(W, H, PAD);
    for (const cube of this._cubes) {
      this._drawCube(ctx, cube.snapshot(), sz, W, H, PAD);
    }

    ctx.restore();
  }

  _drawCube(ctx, s, sz, W, H, PAD) {
    const { cx, cy } = this._matToCanvas(s.x, s.y, W, H, PAD);
    const color = CUBE_COLORS[s.index % CUBE_COLORS.length];

    // LED glow
    if (s.led) {
      const { r, g, b } = s.led;
      const grad = ctx.createRadialGradient(cx, cy, sz * 0.4, cx, cy, sz * 2.2);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, sz * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cube body
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s.angle * Math.PI / 180);

    const half = sz / 2, r2 = sz * 0.15;
    // Fill: white body; when LED is on, layer a translucent LED tint
    ctx.beginPath();
    ctx.roundRect(-half, -half, sz, sz, r2);
    ctx.fillStyle   = '#ffffff';
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.fill();
    ctx.stroke();
    // LED tint overlay
    if (s.led) {
      ctx.beginPath();
      ctx.roundRect(-half, -half, sz, sz, r2);
      ctx.fillStyle = `rgba(${s.led.r},${s.led.g},${s.led.b},0.35)`;
      ctx.fill();
    }

    // Front direction indicator — triangle in cube color
    ctx.beginPath();
    ctx.moveTo(0, -half + 2);
    ctx.lineTo(-sz * 0.16, -half + sz * 0.3);
    ctx.lineTo( sz * 0.16, -half + sz * 0.3);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    // Angle handle: small circle in the direction the cube is facing
    const radH = (s.angle - 90) * Math.PI / 180;
    const hx   = cx + Math.cos(radH) * sz * 1.1;
    const hy   = cy + Math.sin(radH) * sz * 1.1;
    const hr   = Math.max(4, sz * 0.28);
    const isHover = this._hoverInfo && this._hoverInfo.cubeIdx === s.index && this._hoverInfo.mode === 'angle';
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.fillStyle   = isHover ? color : 'rgba(255,255,255,0.85)';
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.fill(); ctx.stroke();

    // Label
    const labelX = cx + sz * 0.62;
    const labelY = cy - sz * 0.55;
    ctx.save();
    ctx.font = `bold ${Math.max(8, sz * 0.38)}px 'Fira Code', monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const label = `#${s.index + 1} (${Math.round(s.x)},${Math.round(s.y)}) ${Math.round(s.angle)}°`;
    const met = ctx.measureText(label);
    const lw  = met.width + 7, lh = Math.max(10, sz * 0.48) + 5;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath(); ctx.roundRect(labelX - 3, labelY - 2, lw, lh, 3); ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(label, labelX, labelY);
    ctx.restore();
  }

  /* ── Mat drawing helpers ──────────────────────────────────────────────── */

  _drawMatBase(ctx, W, H, PAD) {
    const { offX, offY, areaW, areaH } = this._matArea(W, H, PAD);
    ctx.shadowColor = 'rgba(0,0,0,0.10)';
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = '#FAFAF8';
    ctx.fillRect(offX, offY, areaW, areaH);
    ctx.shadowBlur  = 0;
    return { offX, offY, areaW, areaH };
  }

  _drawGrid(ctx, W, H, PAD, xStep, yStep = null, lineColor = 'rgba(180,185,215,0.35)') {
    if (yStep === null) yStep = xStep;
    const cfg = this._matCfg;
    const { offX, offY, areaW, areaH } = this._matArea(W, H, PAD);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 0.5;
    const xRange = cfg.xMax - cfg.xMin;
    const yRange = cfg.yMax - cfg.yMin;
    const cols = Math.round(xRange / xStep);
    const rows = Math.round(yRange / yStep);
    for (let c = 0; c <= cols; c++) {
      const mx = cfg.xMin + c * xRange / cols;
      const { cx } = this._matToCanvas(mx, cfg.yMin, W, H, PAD);
      ctx.beginPath(); ctx.moveTo(cx, offY); ctx.lineTo(cx, offY + areaH); ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      const my = cfg.yMin + r * yRange / rows;
      const { cy } = this._matToCanvas(cfg.xMin, my, W, H, PAD);
      ctx.beginPath(); ctx.moveTo(offX, cy); ctx.lineTo(offX + areaW, cy); ctx.stroke();
    }
  }

  _drawMatBorder(ctx, W, H, PAD) {
    const { offX, offY, areaW, areaH } = this._matArea(W, H, PAD);
    ctx.strokeStyle = '#9DA4B8';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(offX, offY, areaW, areaH);
  }

  _drawCornerLabels(ctx, W, H, PAD) {
    const cfg = this._matCfg;
    const { offX, offY, areaW, areaH } = this._matArea(W, H, PAD);
    ctx.font = `${Math.max(6, Math.min(8, areaW * 0.020))}px monospace`;
    ctx.fillStyle = '#AAB0C4';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`(${cfg.xMin},${cfg.yMin})`, offX + 3, offY + 3);
    ctx.textAlign = 'right';
    ctx.fillText(`(${cfg.xMax},${cfg.yMin})`, offX + areaW - 3, offY + 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`(${cfg.xMin},${cfg.yMax})`, offX + 3, offY + areaH - 3);
    ctx.textAlign = 'right';
    ctx.fillText(`(${cfg.xMax},${cfg.yMax})`, offX + areaW - 3, offY + areaH - 3);
  }

  _drawSimpleMat(ctx, W, H, PAD) {
    const { offX, offY, areaW, areaH } = this._drawMatBase(ctx, W, H, PAD);

    const cfg = this._matCfg;
    const xStep = (cfg.xMax - cfg.xMin) / 7;
    const yStep = (cfg.yMax - cfg.yMin) / 5;
    this._drawGrid(ctx, W, H, PAD, xStep, yStep);

    // Cross at center
    const cx0 = (cfg.xMin + cfg.xMax) / 2;
    const cy0 = (cfg.yMin + cfg.yMax) / 2;
    const center = this._matToCanvas(cx0, cy0, W, H, PAD);
    ctx.strokeStyle = '#BBC0CF';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(center.cx - 10, center.cy); ctx.lineTo(center.cx + 10, center.cy);
    ctx.moveTo(center.cx, center.cy - 10); ctx.lineTo(center.cx, center.cy + 10);
    ctx.stroke();
    ctx.setLineDash([]);

    this._drawMatBorder(ctx, W, H, PAD);
    this._drawCornerLabels(ctx, W, H, PAD);
  }

  _drawOriginalMat(ctx, W, H, PAD) {
    const cfg = this._matCfg;
    const xRange = cfg.xMax - cfg.xMin;
    const yRange = cfg.yMax - cfg.yMin;
    const aspect = xRange / yRange;
    const drawW = W - PAD * 2;
    const drawH = H - PAD * 2;
    let mw, mh, mx, my;
    if (drawW / drawH > aspect) {
      mh = drawH; mw = mh * aspect;
      mx = PAD + (drawW - mw) / 2; my = PAD;
    } else {
      mw = drawW; mh = mw / aspect;
      mx = PAD; my = PAD + (drawH - mh) / 2;
    }

    // White background
    ctx.fillStyle = '#fff';
    ctx.fillRect(mx, my, mw, mh);

    // 9x9 grid (thin, light)
    const cols = 9, rows = 9;
    ctx.strokeStyle = 'rgba(180,185,215,0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= cols; i++) {
      const x = mx + (mw * i / cols);
      ctx.beginPath(); ctx.moveTo(x, my); ctx.lineTo(x, my + mh); ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const y = my + (mh * j / rows);
      ctx.beginPath(); ctx.moveTo(mx, y); ctx.lineTo(mx + mw, y); ctx.stroke();
    }

    // Border
    ctx.strokeStyle = '#AAB0C4'; ctx.lineWidth = 1.5;
    ctx.strokeRect(mx, my, mw, mh);

    // Corner labels — small font, muted colour
    const fontSize = Math.max(6, Math.min(8, mw * 0.020));
    ctx.font = `${fontSize}px monospace`;
    ctx.fillStyle = '#AAB0C4';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`(${cfg.xMin},${cfg.yMin})`, mx + 3, my + 3);
    ctx.textAlign = 'right';
    ctx.fillText(`(${cfg.xMax},${cfg.yMin})`, mx + mw - 3, my + 3);
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText(`(${cfg.xMin},${cfg.yMax})`, mx + 3, my + mh - 3);
    ctx.textAlign = 'right';
    ctx.fillText(`(${cfg.xMax},${cfg.yMax})`, mx + mw - 3, my + mh - 3);
  }

  _drawCustomMat(ctx, W, H, PAD) {
    this._drawMatBase(ctx, W, H, PAD);
    this._drawGrid(ctx, W, H, PAD, 50, null, '#E0E3EA');
    this._drawMatBorder(ctx, W, H, PAD);
    this._drawCornerLabels(ctx, W, H, PAD);

    // Show mat name
    const { offX, offY, areaW } = this._matArea(W, H, PAD);
    const cfg = this._matCfg;
    const name = cfg.name || this._matType;
    ctx.font = `${Math.max(9, areaW * 0.04)}px sans-serif`;
    ctx.fillStyle = '#BBC0CF';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const { cx, cy } = this._matToCanvas(
      (cfg.xMin + cfg.xMax) / 2,
      (cfg.yMin + cfg.yMax) / 2,
      W, H, PAD
    );
    ctx.fillText(name, cx, cy);
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /* 3D (Three.js)                                                            */
  /* ──────────────────────────────────────────────────────────────────────── */

  _init3D() {
    if (!window.THREE) { console.warn('Three.js not loaded'); return; }
    const W = this._div3d.clientWidth  || 400;
    const H = this._div3d.clientHeight || 400;

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0xF0F2F7);

    this._camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
    const _cfg3 = this._matCfg;
    const _size3 = Math.max(_cfg3.xMax - _cfg3.xMin, _cfg3.yMax - _cfg3.yMin) / 10;
    const _dist3 = _size3 * 0.75;
    this._camera.position.set(0, _dist3, _dist3);
    this._camera.lookAt(0, 0, 0);

    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setSize(W, H);
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.shadowMap.enabled = false;   // shadows off — avoids artifacts
    this._div3d.appendChild(this._renderer.domElement);

    if (window.THREE.OrbitControls) {
      this._controls = new THREE.OrbitControls(this._camera, this._renderer.domElement);
      this._controls.enableDamping = true;
      this._controls.dampingFactor = 0.1;
    }

    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    this._scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(10, 20, 10);   // no castShadow
    this._scene.add(dir);

    this._buildMatPlane();
    this._meshes     = [];
    this._trailLines = [];
    this._grabRaycaster = new THREE.Raycaster();
    this._sync3DCubes();
    this._build3DToolbar();
  }

  _buildMatPlane() {
    if (!this._scene) return;

    // Remove old objects
    if (this._matMesh)    { this._scene.remove(this._matMesh);    this._matMesh.geometry.dispose();    this._matMesh    = null; }
    if (this._gridHelper) { this._scene.remove(this._gridHelper); if (this._gridHelper.geometry) this._gridHelper.geometry.dispose(); this._gridHelper = null; }
    if (this._matBorder)  { this._scene.remove(this._matBorder);  this._matBorder.geometry.dispose();  this._matBorder  = null; }
    // Clean up trail lines (rebuilt by _sync3DCubes after mat changes)
    for (const line of (this._trailLines || [])) { this._scene.remove(line); line.geometry.dispose(); }
    this._trailLines = [];

    const cfg    = this._matCfg;
    const xRange = cfg.xMax - cfg.xMin;   // coordinate units
    const yRange = cfg.yMax - cfg.yMin;
    const W3     = xRange / 10;           // THREE units width
    const H3     = yRange / 10;           // THREE units height

    // Mat surface
    const color = this._matType === 'original' ? 0xEEF5FF : 0xFAFAF8;
    const geo   = new THREE.PlaneGeometry(W3, H3);
    const mat   = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    this._matMesh = new THREE.Mesh(geo, mat);
    this._matMesh.rotation.x = -Math.PI / 2;
    this._scene.add(this._matMesh);

    // Rectangular grid — exactly matching mat bounds
    this._gridHelper = this._buildRectGrid(W3, H3, xRange, yRange);
    this._scene.add(this._gridHelper);

    // Mat border outline
    const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(W3, H3));
    const borderMat = new THREE.LineBasicMaterial({ color: 0xAAB0C4 });
    this._matBorder = new THREE.LineSegments(borderGeo, borderMat);
    this._matBorder.rotation.x = -Math.PI / 2;
    this._matBorder.position.y = 0.02;
    this._scene.add(this._matBorder);
  }

  /** Build rectangular grid lines that exactly match the mat dimensions */
  _buildRectGrid(W3, H3, xRange, yRange) {
    // Use physically correct divisions per mat type
    let xDivs, yDivs;
    if (this._matType === 'simple') {
      xDivs = 7; yDivs = 5;            // A3 play mat: 7 columns × 5 rows
    } else if (this._matType === 'original') {
      xDivs = 9; yDivs = 9;            // toio collection mat: 9 × 9
    } else {
      xDivs = Math.max(4, Math.round(xRange / 50));
      yDivs = Math.max(3, Math.round(yRange / 50));
    }
    const verts = [];
    const Y     = 0.015;   // sit just above the mat surface

    // Vertical lines (parallel to Z axis)
    for (let i = 0; i <= xDivs; i++) {
      const x = -W3 / 2 + (i / xDivs) * W3;
      verts.push(x, Y, -H3 / 2,  x, Y,  H3 / 2);
    }
    // Horizontal lines (parallel to X axis)
    for (let j = 0; j <= yDivs; j++) {
      const z = -H3 / 2 + (j / yDivs) * H3;
      verts.push(-W3 / 2, Y, z,  W3 / 2, Y, z);
    }

    const bufGeo = new THREE.BufferGeometry();
    bufGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xC8CDD8, transparent: true, opacity: 0.6 });
    return new THREE.LineSegments(bufGeo, lineMat);
  }

  _redrawMatTexture() { this._buildMatPlane(); }

  _resize3D() {
    if (!this._renderer) return;
    const W = this._div3d.clientWidth  || 400;
    const H = this._div3d.clientHeight || 400;
    this._camera.aspect = W / H;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(W, H);
  }

  _matTo3D(mx, my) {
    const cfg = this._matCfg;
    const cx  = (cfg.xMin + cfg.xMax) / 2;
    const cy  = (cfg.yMin + cfg.yMax) / 2;
    return { x: (mx - cx) / 10, z: (my - cy) / 10 };
  }

  _sync3DCubes() {
    if (!this._scene) return;
    const CW = 3.2, CH = 2.24;

    while (this._meshes.length < this._cubes.length) {
      const idx = this._meshes.length;
      const col = parseInt(CUBE_COLORS[idx % CUBE_COLORS.length].replace('#', ''), 16);

      // White body
      const geo = new THREE.BoxGeometry(CW, CH, CW);
      const mat = new THREE.MeshLambertMaterial({ color: 0xfafafa });
      const mesh = new THREE.Mesh(geo, mat);
      // Hover 2 mm above mat surface so bottom edges are clearly visible
      mesh.position.y = CH / 2 + 0.2;
      this._scene.add(mesh);
      this._meshes.push(mesh);

      // Colored outline via inverted-hull technique (reliable cross-platform thick edges)
      // A slightly larger back-face-only box — front white cube occludes it everywhere
      // except at the edges, creating a solid colored border of controllable thickness.
      const outlineGeo = new THREE.BoxGeometry(CW + 0.22, CH + 0.22, CW + 0.22);
      const outlineMat = new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide });
      const outline = new THREE.Mesh(outlineGeo, outlineMat);
      outline.name = 'cubeOutline';
      mesh.add(outline);

      // Direction arrow on top face (colored to match cube, not white)
      const arrowShape = new THREE.Shape();
      arrowShape.moveTo(0, CW * 0.38);
      arrowShape.lineTo(-CW * 0.16, CW * 0.14);
      arrowShape.lineTo( CW * 0.16, CW * 0.14);
      arrowShape.closePath();
      const arrowGeo = new THREE.ShapeGeometry(arrowShape);
      const arrowMat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.name = 'cubeArrow';
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.y = CH / 2 + 0.02;
      mesh.add(arrow);
    }

    while (this._meshes.length > this._cubes.length) {
      const m = this._meshes.pop(); this._scene.remove(m);
    }

    // Ensure trail line objects match cube count
    while (this._trailLines.length < this._cubes.length) {
      const geo  = new THREE.BufferGeometry();
      // Pre-allocate a minimal position attribute so the geometry is valid
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      geo.setDrawRange(0, 0);
      const mat  = new THREE.LineBasicMaterial({ vertexColors: false, transparent: true, opacity: 0.55 });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      this._scene.add(line);
      this._trailLines.push(line);
    }
    while (this._trailLines.length > this._cubes.length) {
      const l = this._trailLines.pop();
      this._scene.remove(l); l.geometry.dispose();
    }

    const grabIdx = this._grabState ? this._grabState.selectedIdx : -1;

    this._cubes.forEach((cube, i) => {
      const mesh = this._meshes[i];
      if (!mesh) return;
      const { x, z } = this._matTo3D(cube._x, cube._y);
      mesh.position.x = x;
      mesh.position.z = z;
      // Use physicsY (elevated) if set, otherwise hover 2 mm above mat
      mesh.position.y = (cube.physicsY !== null && cube.physicsY !== undefined)
        ? cube.physicsY : CH / 2 + 0.2;
      mesh.rotation.y = -(cube._angle) * Math.PI / 180;
      mesh.rotation.x = (cube._rollX || 0);   // radians from physics
      mesh.rotation.z = (cube._rollZ || 0);

      const outline = mesh.getObjectByName('cubeOutline');
      const arrow   = mesh.getObjectByName('cubeArrow');
      const baseCol = parseInt(CUBE_COLORS[i % CUBE_COLORS.length].replace('#', ''), 16);
      if (cube._led) {
        const { r, g, b } = cube._led;
        // LED: tint face slightly + color outline/arrow with LED color
        mesh.material.color.setRGB(0.92 + r / 3200, 0.92 + g / 3200, 0.92 + b / 3200);
        mesh.material.emissive.setRGB(r / 600, g / 600, b / 600);
        if (outline) outline.material.color.setRGB(r / 255, g / 255, b / 255);
        if (arrow)   arrow.material.color.setRGB(r / 255, g / 255, b / 255);
      } else {
        mesh.material.color.setHex(i === grabIdx ? 0xDDEEFF : 0xfafafa);
        mesh.material.emissive.setHex(0x000000);
        if (outline) outline.material.color.setHex(baseCol);
        if (arrow)   arrow.material.color.setHex(baseCol);
      }

      // 3D trail
      const line = this._trailLines[i];
      if (line) {
        if (cube.showTrail && cube._trail.length >= 2) {
          const col = parseInt(CUBE_COLORS[i % CUBE_COLORS.length].replace('#', ''), 16);
          line.material.color.set(col);
          line.visible = true;
          const pts = [];
          cube._trail.forEach(pt => {
            const p = this._matTo3D(pt.x, pt.y);
            pts.push(p.x, 0.04, p.z);
          });
          const buf = new Float32Array(pts);
          line.geometry.setAttribute('position', new THREE.BufferAttribute(buf, 3));
          line.geometry.setDrawRange(0, pts.length / 3);
          line.geometry.attributes.position.needsUpdate = true;
        } else {
          line.visible = false;
        }
      }
    });

    // Update grab BoxHelper if exists
    if (this._grabHelper) {
      if (grabIdx >= 0 && this._meshes[grabIdx]) {
        this._grabHelper.setFromObject(this._meshes[grabIdx]);
        this._grabHelper.visible = true;
      } else {
        this._grabHelper.visible = false;
      }
    }

    // Keep RPY panel cube selector in sync
    this._refreshRPYSelector();
  }

  /* ── 3D helper: find cube mesh index from a hit object (walks parent chain) ── */
  _findCubeIdx(obj) {
    if (!obj || !this._meshes) return -1;
    let cur = obj;
    for (let depth = 0; depth < 8; depth++) {
      const ki = this._meshes.indexOf(cur);
      if (ki >= 0) return ki;
      if (!cur.parent) break;
      cur = cur.parent;
    }
    return -1;
  }

  /* ── 3D mode toolbar ─────────────────────────────────────────────────────── */
  _build3DToolbar() {
    if (this._3dModeToolbar) this._3dModeToolbar.remove();

    const orbitSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const grabSvg  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9 11V6a1 1 0 0 1 2 0v5m0 0V5a1 1 0 0 1 2 0v6m0 0V6a1 1 0 0 1 2 0v5m0 0V8a1 1 0 0 1 2 0v6c0 3.31-2.69 6-6 6H9.5C7 20 5 18 5 15.5v-2.63c0-.48.19-.94.53-1.28L7 10l1 1v.5"/></svg>`;
    const trailSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 20 C6 14 10 16 13 11 S18 5 21 4"/></svg>`;

    const allTrailOn = this._cubes.length === 0 || this._cubes.every(c => c.showTrail !== false);

    const tb = document.createElement('div');
    tb.id = 'sim3d-toolbar';
    tb.innerHTML =
      `<div class="sim3d-toolbar-row">` +
        `<button class="sim3d-btn active" data-mode="orbit">${orbitSvg} ${t('sim3d.orbit')}</button>` +
        `<button class="sim3d-btn" data-mode="grab">${grabSvg} ${t('sim3d.grab')}</button>` +
        `<button class="sim3d-btn sim3d-btn-trail${allTrailOn ? ' active' : ''}" id="sim3d-trail-btn">${trailSvg} ${t('sim3d.trail')}</button>` +
      `</div>` +
      `<div class="sim3d-hint" id="sim3d-hint">${t('sim3d.hintOrbit')}</div>`;

    this._div3d.appendChild(tb);
    this._3dModeToolbar = tb;

    // ── Rotation handles overlay (always visible, works in both modes) ──────
    this._buildRotationHandles();

    // ── Cube Roll/Pitch/Yaw rotation panel ───────────────────────────────────
    this._buildRPYPanel();

    // Mode buttons (orbit / grab)
    tb.querySelectorAll('.sim3d-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        tb.querySelectorAll('.sim3d-btn[data-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._setInteractMode(btn.dataset.mode);
        const hint = document.getElementById('sim3d-hint');
        if (hint) {
          hint.textContent = btn.dataset.mode === 'orbit'
            ? t('sim3d.hintOrbit')
            : t('sim3d.hintGrab');
        }
      });
    });

    // Trail toggle — affects all cubes
    const trailBtn = document.getElementById('sim3d-trail-btn');
    if (trailBtn) {
      trailBtn.addEventListener('click', () => {
        // Toggle: if currently all-on → all-off; otherwise → all-on
        const allOn = this._cubes.length === 0 ||
                      this._cubes.every(c => c.showTrail !== false);
        const next = !allOn;
        this._cubes.forEach(c => {
          c.showTrail = next;
          if (!next) c._trail = [];
        });
        this._dirty = true;
        this._updateTrailBtnState();
        if (this._statusFn) this._statusFn(this._cubes);
      });
    }
  }

  /* ── 3D rotation handles (always-visible compass widget) ────────────────── */
  _buildRotationHandles() {
    if (this._rotHandles) this._rotHandles.remove();

    const rh = document.createElement('div');
    rh.className = 'sim3d-rot-handles';
    rh.innerHTML = `
      <button class="sim3d-rot-collapse" id="sim3d-rot-collapse" title="折りたたむ/展開">▼</button>
      <div class="sim3d-rot-body" id="sim3d-rot-body">
        <button class="sim3d-rot-btn" data-dt="-0.4"  data-dp="0"    title="左回転">◀</button>
        <div class="sim3d-rot-col">
          <button class="sim3d-rot-btn" data-dt="0"   data-dp="-0.3" title="上回転">▲</button>
          <div class="sim3d-rot-center" id="sim3d-rot-center" title="クリック: 視点リセット / ドラッグ: 自由回転">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <button class="sim3d-rot-btn" data-dt="0"   data-dp="0.3"  title="下回転">▼</button>
        </div>
        <button class="sim3d-rot-btn" data-dt="0.4"   data-dp="0"    title="右回転">▶</button>
      </div>`;

    // ── Collapse toggle ────────────────────────────────────────────────
    const collapseBtn = rh.querySelector('#sim3d-rot-collapse');
    const rotBody     = rh.querySelector('#sim3d-rot-body');
    collapseBtn.addEventListener('click', e => {
      e.stopPropagation();
      const collapsed = rotBody.style.display === 'none';
      rotBody.style.display  = collapsed ? '' : 'none';
      collapseBtn.textContent = collapsed ? '▼' : '▶';
    });

    // ── Click: rotate camera by fixed angle ───────────────────────────
    rh.querySelectorAll('.sim3d-rot-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const dTheta = parseFloat(btn.dataset.dt) || 0;
        const dPhi   = parseFloat(btn.dataset.dp) || 0;
        this._rotateCamera(dTheta, dPhi);
      });
      // Auto-repeat on hold
      let _hold = null;
      btn.addEventListener('mousedown', e => {
        e.stopPropagation();
        _hold = setInterval(() => {
          const dTheta = parseFloat(btn.dataset.dt) || 0;
          const dPhi   = parseFloat(btn.dataset.dp) || 0;
          this._rotateCamera(dTheta * 0.4, dPhi * 0.4);
        }, 50);
      });
      const _clearHold = () => { if (_hold) { clearInterval(_hold); _hold = null; } };
      btn.addEventListener('mouseup',    _clearHold);
      btn.addEventListener('mouseleave', _clearHold);
    });

    // ── Center icon: click = reset camera; drag = free orbit ─────────
    const center = rh.querySelector('#sim3d-rot-center');
    let _dragStart = null, _dragMoved = false;
    center.addEventListener('mousedown', e => {
      e.stopPropagation();
      _dragStart = { x: e.clientX, y: e.clientY };
      _dragMoved = false;
      center.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!_dragStart) return;
      const dx = e.clientX - _dragStart.x;
      const dy = e.clientY - _dragStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _dragMoved = true;
      if (_dragMoved) {
        this._rotateCamera(dx * 0.012, dy * 0.010);
        _dragStart = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener('mouseup', () => {
      if (_dragStart) {
        if (!_dragMoved) this._resetCamera(); // simple click → reset to default view
        _dragStart = null;
        center.style.cursor = '';
      }
    });

    this._div3d.appendChild(rh);
    this._rotHandles = rh;
  }

  /** Reset camera to the default position (overhead-ish view of the mat). */
  _resetCamera() {
    if (!this._camera) return;
    const cfg   = this._matCfg || { xMin: 45, yMin: 45, xMax: 455, yMax: 455 };
    const size3 = Math.max(cfg.xMax - cfg.xMin, cfg.yMax - cfg.yMin) / 10;
    const dist3 = size3 * 0.75;
    this._camera.position.set(0, dist3, dist3);
    this._camera.lookAt(0, 0, 0);
    if (this._controls) {
      this._controls.target.set(0, 0, 0);
      this._controls.update();
    }
    this._dirty = true;
  }

  /** Rotate camera around the OrbitControls target by (dTheta, dPhi) radians. */
  _rotateCamera(dTheta, dPhi) {
    if (!this._camera) return;
    const target = this._controls ? this._controls.target : new THREE.Vector3(0, 0, 0);
    const offset = this._camera.position.clone().sub(target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta += dTheta;
    sph.phi    = Math.max(0.05, Math.min(Math.PI * 0.92, sph.phi + dPhi));
    offset.setFromSpherical(sph);
    this._camera.position.copy(target).add(offset);
    this._camera.lookAt(target);
    if (this._controls) this._controls.update();
    this._dirty = true;
  }

  /* ── Cube Roll / Pitch / Yaw rotation panel ─────────────────────────────── */

  _buildRPYPanel() {
    if (this._rpyPanel) this._rpyPanel.remove();

    const DEG      = 15;                    // rotation step (degrees for yaw)
    const RAD      = DEG * Math.PI / 180;   // rotation step (radians for pitch/roll)
    const POS_STEP = 5;                     // mat-coordinate step per click
    const H_STEP   = 0.5;                   // THREE-unit height step
    const CH       = 2.24;                  // cube height constant (matches _sync3DCubes)

    const panel = document.createElement('div');
    panel.id        = 'sim3d-rpy';
    panel.className = 'sim3d-rpy';

    // Rebuild cube options helper
    const cubeOpts = () => this._cubes.map((_, i) =>
      `<option value="${i}">${t('ui.cube' + (i + 1)) || `Cube ${i + 1}`}</option>`
    ).join('');

    panel.innerHTML = `
      <div class="sim3d-rpy-hdr">
        <span class="sim3d-rpy-title">Cube</span>
        <select id="sim3d-rpy-sel" class="sim3d-rpy-sel">${cubeOpts()}</select>
        <button class="sim3d-rpy-toggle" id="sim3d-rpy-toggle" title="折りたたむ">▼</button>
      </div>
      <div class="sim3d-rpy-body" id="sim3d-rpy-body">
        <div class="sim3d-rpy-section-lbl">回転</div>
        <div class="sim3d-rpy-axes">
          <div class="sim3d-rpy-row" title="Yaw — 水平回転 (±${DEG}°)">
            <span class="sim3d-rpy-lbl">Yaw</span>
            <button class="sim3d-rpy-btn" data-action="yaw" data-dir="-1">↺</button>
            <button class="sim3d-rpy-btn" data-action="yaw" data-dir="1">↻</button>
          </div>
          <div class="sim3d-rpy-row" title="Pitch — 前後傾き (±${DEG}°)">
            <span class="sim3d-rpy-lbl">Pitch</span>
            <button class="sim3d-rpy-btn" data-action="pitch" data-dir="-1">↑</button>
            <button class="sim3d-rpy-btn" data-action="pitch" data-dir="1">↓</button>
          </div>
          <div class="sim3d-rpy-row" title="Roll — 左右傾き (±${DEG}°)">
            <span class="sim3d-rpy-lbl">Roll</span>
            <button class="sim3d-rpy-btn" data-action="roll" data-dir="-1">↰</button>
            <button class="sim3d-rpy-btn" data-action="roll" data-dir="1">↱</button>
          </div>
        </div>
        <button class="sim3d-rpy-reset" id="sim3d-rpy-reset" title="回転をリセット">Reset</button>
        <div class="sim3d-rpy-section-lbl" style="margin-top:5px">移動 / 高さ</div>
        <div class="sim3d-rpy-move-grid">
          <button class="sim3d-rpy-btn" data-action="move" data-dx="-1" data-dy="0"  title="左 (X-)">◀</button>
          <button class="sim3d-rpy-btn" data-action="move" data-dx="0"  data-dy="-1" title="前進 (Y-)">▲</button>
          <button class="sim3d-rpy-btn" data-action="move" data-dx="1"  data-dy="0"  title="右 (X+)">▶</button>
          <button class="sim3d-rpy-btn" data-action="height" data-dir="1"  title="上げる">↑</button>
          <span></span>
          <button class="sim3d-rpy-btn" data-action="move" data-dx="0"  data-dy="1"  title="後退 (Y+)">▼</button>
          <span></span>
          <button class="sim3d-rpy-btn" data-action="height" data-dir="-1" title="下げる (マットに置く)">↓</button>
        </div>
      </div>`;

    // ── Which cube to control ────────────────────────────────────────────
    const getCubeIdx = () => {
      const grabIdx = this._grabState?.selectedIdx ?? -1;
      if (grabIdx >= 0 && grabIdx < this._cubes.length) {
        const sel = panel.querySelector('#sim3d-rpy-sel');
        if (sel) sel.value = String(grabIdx);
        return grabIdx;
      }
      const sel = panel.querySelector('#sim3d-rpy-sel');
      return sel ? parseInt(sel.value) || 0 : 0;
    };

    // ── Collapse toggle ──────────────────────────────────────────────────
    const toggleBtn = panel.querySelector('#sim3d-rpy-toggle');
    const body      = panel.querySelector('#sim3d-rpy-body');
    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const collapsed = body.style.display === 'none';
      body.style.display  = collapsed ? '' : 'none';
      toggleBtn.textContent = collapsed ? '▼' : '▶';
    });

    // ── All action buttons ────────────────────────────────────────────────
    panel.querySelectorAll('.sim3d-rpy-btn').forEach(btn => {
      const apply = () => {
        const idx  = getCubeIdx();
        const cube = this._cubes[idx];
        if (!cube) return;
        const action = btn.dataset.action;
        const dir    = parseInt(btn.dataset.dir) || 0;

        if (action === 'yaw') {
          cube._angle = ((cube._angle + dir * DEG) % 360 + 360) % 360;

        } else if (action === 'pitch') {
          cube._rollX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
                          (cube._rollX || 0) + dir * RAD));

        } else if (action === 'roll') {
          cube._rollZ = Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
                          (cube._rollZ || 0) + dir * RAD));

        } else if (action === 'move') {
          const cfg = this._matCfg || { xMin: 45, yMin: 45, xMax: 455, yMax: 455 };
          const dx = parseInt(btn.dataset.dx) || 0;
          const dy = parseInt(btn.dataset.dy) || 0;
          cube._x  = Math.max(cfg.xMin - 100, Math.min(cfg.xMax + 100, (cube._x || 0) + dx * POS_STEP));
          cube._y  = Math.max(cfg.yMin - 100, Math.min(cfg.yMax + 100, (cube._y || 0) + dy * POS_STEP));

        } else if (action === 'height') {
          const cur  = (cube.physicsY !== null && cube.physicsY !== undefined)
                       ? cube.physicsY : CH / 2 + 0.2;
          const next = cur + dir * H_STEP;
          cube.physicsY = next <= CH / 2 + 0.25 ? null : next;
        }

        this._dirty = true;
        if (this._statusFn) this._statusFn(this._cubes);
      };

      btn.addEventListener('click', apply);

      // Auto-repeat on hold
      let _hold = null;
      btn.addEventListener('mousedown', e => {
        e.stopPropagation();
        _hold = setInterval(apply, 80);
      });
      const _clear = () => { if (_hold) { clearInterval(_hold); _hold = null; } };
      btn.addEventListener('mouseup',    _clear);
      btn.addEventListener('mouseleave', _clear);
    });

    // ── Reset rotation ────────────────────────────────────────────────────
    panel.querySelector('#sim3d-rpy-reset').addEventListener('click', () => {
      const idx  = getCubeIdx();
      const cube = this._cubes[idx];
      if (!cube) return;
      cube._rollX = 0;
      cube._rollZ = 0;
      this._dirty = true;
      if (this._statusFn) this._statusFn(this._cubes);
    });

    this._div3d.appendChild(panel);
    this._rpyPanel = panel;
  }

  /** Refresh the RPY panel's cube selector (call when cubes are added/removed). */
  _refreshRPYSelector() {
    const sel = this._rpyPanel?.querySelector('#sim3d-rpy-sel');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = this._cubes.map((_, i) =>
      `<option value="${i}">${t('ui.cube' + (i + 1)) || `Cube ${i + 1}`}</option>`
    ).join('');
    sel.value = cur; // restore selection if still valid
  }

  /** Sync all trail buttons (2D header + 3D toolbar) with current cube trail states */
  _updateTrailBtnState() {
    const n       = this._cubes.length;
    const onCount = this._cubes.filter(c => c.showTrail !== false).length;
    const allOn   = n === 0 || onCount === n;
    const partial = n > 0 && onCount > 0 && onCount < n;

    // 2D trail button (in sim panel header)
    const btn2d = document.getElementById('btn-2d-trail');
    if (btn2d) {
      btn2d.classList.toggle('active',  allOn);
      btn2d.classList.toggle('partial', partial);
    }

    // 3D toolbar trail button
    const btn = document.getElementById('sim3d-trail-btn');
    if (!btn) return;
    btn.classList.toggle('active',  allOn);
    btn.classList.toggle('partial', partial);
  }

  _setInteractMode(mode) {
    this._interactMode = mode;
    if (mode === 'orbit') {
      if (this._controls) this._controls.enabled = true;
      this._stopGrabListeners();
      // Drop any currently lifted cubes
      this._cubes.forEach((c, i) => {
        if (c.physicsY !== null && c.physicsY !== undefined && c.physicsY > 2.24 / 2) {
          this._dropCube(i);
        }
      });
      if (this._grabState) this._grabState.selectedIdx = -1;
    } else if (mode === 'grab') {
      if (this._controls) this._controls.enabled = false;
      this._startGrabListeners();
    }
  }

  _startGrabListeners() {
    if (this._grabListenersActive || !this._renderer) return;
    this._grabListenersActive = true;
    this._grabState = {
      selectedIdx: -1, dragging: false,
      downX: 0, downY: 0, lastX: 0, lastY: 0, wasDragging: false,
    };

    const canvas = this._renderer.domElement;
    const CH = 2.24;

    const toNDC = (e) => {
      const r = canvas.getBoundingClientRect();
      return new THREE.Vector2(
        ((e.clientX - r.left) / r.width)  * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
    };

    /* ── mousedown — immediately select cube under cursor ── */
    this._grabOnDown = (e) => {
      this._grabState.dragging = false;
      this._grabState.downX = e.clientX;
      this._grabState.downY = e.clientY;
      this._grabState.lastX = e.clientX;
      this._grabState.lastY = e.clientY;
      this._grabState.wasDragging = false;
      // Raycast immediately so dragging starts without requiring a prior click
      const ndc = toNDC(e);
      this._grabRaycaster.setFromCamera(ndc, this._camera);
      const hits = this._grabRaycaster.intersectObjects(this._meshes, true);
      if (hits.length > 0) {
        const idx = this._findCubeIdx(hits[0].object);
        if (idx >= 0) this._grabState.selectedIdx = idx;
      } else {
        this._grabState.selectedIdx = -1; // deselect on empty-area click
      }
    };

    /* ── mousemove — left=translate, right=rotate yaw+pitch ── */
    this._grabOnMove = (e) => {
      const dx = e.clientX - this._grabState.downX;
      const dy = e.clientY - this._grabState.downY;
      const mdx = e.clientX - this._grabState.lastX;  // incremental X
      const mdy = e.clientY - this._grabState.lastY;  // incremental Y
      this._grabState.lastX = e.clientX;
      this._grabState.lastY = e.clientY;

      if (!this._grabState.dragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        this._grabState.dragging = true;
        this._grabState.wasDragging = true;
      }
      if (!this._grabState.dragging) return;
      if (this._grabState.selectedIdx < 0) return;
      const cube = this._cubes[this._grabState.selectedIdx];
      if (!cube) return;

      // Right-button drag: plain = yaw rotation; Shift = tilt (rollX / rollZ)
      if (e.buttons & 2) {
        if (e.shiftKey) {
          // Shift + right-drag: pitch (up/down → rollX) + roll (left/right → rollZ)
          cube._rollX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
                          (cube._rollX || 0) + mdy * 0.022));
          cube._rollZ = Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
                          (cube._rollZ || 0) + mdx * 0.022));
        } else {
          // Plain right-drag: yaw only
          cube._angle = ((cube._angle - mdx * 1.8) % 360 + 360) % 360;
        }
        this._dirty = true;
        if (this._statusFn) this._statusFn(this._cubes);
        return;
      }

      // Left-button drag = translate on horizontal plane
      if (!(e.buttons & 1)) return;
      const liftY = (cube.physicsY !== null && cube.physicsY !== undefined)
        ? cube.physicsY : CH / 2;
      const ndc = toNDC(e);
      this._grabRaycaster.setFromCamera(ndc, this._camera);
      const plane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), -liftY);
      const target = new THREE.Vector3();
      if (this._grabRaycaster.ray.intersectPlane(plane, target)) {
        const cfg = this._matCfg;
        const cx  = (cfg.xMin + cfg.xMax) / 2;
        const cy  = (cfg.yMin + cfg.yMax) / 2;
        // Allow moving beyond mat but clamp to ±100 coord units outside
        cube._x = Math.max(cfg.xMin - 100, Math.min(cfg.xMax + 100, target.x * 10 + cx));
        cube._y = Math.max(cfg.yMin - 100, Math.min(cfg.yMax + 100, target.z * 10 + cy));
        this._dirty = true;
        if (this._statusFn) this._statusFn(this._cubes);
      }
    };

    /* ── mouseup — drag end; selection already handled in mousedown ── */
    this._grabOnUp = (e) => {
      this._grabState.dragging = false;
      this._notifyUpdate();
    };

    /* ── scroll — lift or lower selected cube ── */
    this._grabOnWheel = (e) => {
      const idx = this._grabState.selectedIdx;
      if (idx < 0) return;
      e.preventDefault();
      const cube = this._cubes[idx];
      if (!cube) return;
      const current = (cube.physicsY !== null && cube.physicsY !== undefined)
        ? cube.physicsY : CH / 2;
      const next = Math.max(CH / 2, current - e.deltaY * 0.025);
      cube.physicsY = next <= CH / 2 + 0.05 ? null : next;
      this._dirty = true;
    };

    /* ── dblclick — drop cube from current height ── */
    this._grabOnDblClick = (e) => {
      const ndc = toNDC(e);
      this._grabRaycaster.setFromCamera(ndc, this._camera);
      const hits = this._grabRaycaster.intersectObjects(this._meshes, true);
      let cubeIdx = this._grabState.selectedIdx;
      if (hits.length > 0) {
        const ki = this._findCubeIdx(hits[0].object);
        if (ki >= 0) cubeIdx = ki;
      }
      if (cubeIdx >= 0) this._dropCube(cubeIdx);
    };

    // Prevent browser context menu on right-drag (used for yaw rotation)
    this._grabOnCtxMenu = (e) => e.preventDefault();

    canvas.addEventListener('mousedown',   this._grabOnDown);
    canvas.addEventListener('mousemove',   this._grabOnMove);
    canvas.addEventListener('mouseup',     this._grabOnUp);
    canvas.addEventListener('wheel',       this._grabOnWheel, { passive: false });
    canvas.addEventListener('dblclick',    this._grabOnDblClick);
    canvas.addEventListener('contextmenu', this._grabOnCtxMenu);
  }

  _stopGrabListeners() {
    if (!this._grabListenersActive || !this._renderer) return;
    this._grabListenersActive = false;
    const canvas = this._renderer.domElement;
    if (this._grabOnDown)     canvas.removeEventListener('mousedown',   this._grabOnDown);
    if (this._grabOnMove)     canvas.removeEventListener('mousemove',   this._grabOnMove);
    if (this._grabOnUp)       canvas.removeEventListener('mouseup',     this._grabOnUp);
    if (this._grabOnWheel)    canvas.removeEventListener('wheel',       this._grabOnWheel);
    if (this._grabOnDblClick) canvas.removeEventListener('dblclick',    this._grabOnDblClick);
    if (this._grabOnCtxMenu)  canvas.removeEventListener('contextmenu', this._grabOnCtxMenu);
    this._grabOnDown = this._grabOnMove = this._grabOnUp =
      this._grabOnWheel = this._grabOnDblClick = this._grabOnCtxMenu = null;
  }

  /** Animate a cube falling from its current physicsY back to the mat */
  _dropCube(idx) {
    const cube = this._cubes[idx];
    if (!cube) return;
    const CH = 2.24;
    const startY  = (cube.physicsY !== null && cube.physicsY !== undefined) ? cube.physicsY : CH / 2;
    const targetY = CH / 2;
    if (startY <= targetY + 0.05) { cube.physicsY = null; return; }

    const liftH    = startY - targetY;
    const duration = Math.min(900, Math.max(250, liftH * 120));
    const startMs  = performance.now();

    // Deselect during fall
    if (this._grabState && this._grabState.selectedIdx === idx) {
      this._grabState.selectedIdx = -1;
    }

    // Capture start orientation and compute nearest-face-down landing target
    const startRx = cube._rollX || 0;
    const startRz = cube._rollZ || 0;
    const { rollX: targetRx, rollZ: targetRz } =
      _nearestFlatOrientation(startRx, startRz, cube._angle || 0);

    const animate = (now) => {
      const t = Math.min(1, (now - startMs) / duration);
      // Quadratic ease-in for vertical drop (gravity feel)
      const eased = t * t;
      const curY = startY + (targetY - startY) * eased;

      // Rotation settles in the second half of the fall (ease-out cubic)
      const rotT    = Math.max(0, (t - 0.4) / 0.6);
      const rotEase = 1 - Math.pow(1 - rotT, 3);
      cube._rollX = startRx + (targetRx - startRx) * rotEase;
      cube._rollZ = startRz + (targetRz - startRz) * rotEase;

      cube.physicsY = curY <= targetY + 0.05 ? null : curY;
      this._dirty = true;

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        cube.physicsY = null;
        cube._rollX   = targetRx;
        cube._rollZ   = targetRz;
        this._dirty   = true;
        if (this._statusFn) this._statusFn(this._cubes);
      }
    };

    requestAnimationFrame(animate);
  }

  _update3D() {
    if (this._controls) this._controls.update();
    this._sync3DCubes();
  }

  /* ── Status strip ─────────────────────────────────────────────────────── */
  buildStatusChips(container) {
    const label = document.createElement('span');
    label.style.cssText = 'font-size:.68rem;color:var(--text-light);flex-shrink:0;';
    label.textContent = t('ui.cubeStatus');
    container.innerHTML = '';
    container.appendChild(label);

    this._cubes.forEach((cube, i) => {
      const s = cube.snapshot();
      const color = CUBE_COLORS[i % CUBE_COLORS.length];
      const chip = document.createElement('div');
      chip.className = 'cube-chip';
      chip.style.setProperty('--chip-color', color);
      const led = s.led ? `background:rgb(${s.led.r},${s.led.g},${s.led.b})` : '';
      const trailActive = cube.showTrail ? 'active' : '';
      // Direction arrow: rotates according to cube angle
      const arrowDeg = Math.round(s.angle);
      chip.innerHTML =
        `<span class="chip-num">#${i + 1}</span>` +
        `<span class="led-dot ${s.led ? '' : 'off'}" style="${led}"></span>` +
        `<svg width="10" height="10" viewBox="0 0 10 10" style="transform:rotate(${arrowDeg}deg);flex-shrink:0;transition:transform .2s" title="${arrowDeg}°">` +
        `<polygon points="5,1 8.5,9 5,7 1.5,9" fill="${color}" opacity="0.9"/></svg>` +
        `<span>X:${Math.round(s.x)} Y:${Math.round(s.y)} ${Math.round(s.angle)}°</span>` +
        // Per-cube button press
        `<button class="chip-btn-press" data-idx="${i}" title="${t('ui.pressButtonSingle')||'ボタンを押す'}" ` +
        `style="background:none;border:1px solid ${color};color:${color};cursor:pointer;padding:1px 5px;border-radius:10px;font-size:.62rem;margin-left:2px;">` +
        `<svg width="8" height="8" viewBox="0 0 16 16" fill="${color}"><circle cx="8" cy="8" r="6" stroke="${color}" stroke-width="1.5" fill="none"/><circle cx="8" cy="8" r="3"/></svg>` +
        `</button>` +
        `<button class="trail-btn ${trailActive}" data-idx="${i}" title="${t('sim3d.trail')}" ` +
        `style="background:${cube.showTrail ? color : 'transparent'};border:1px solid ${color};color:${cube.showTrail ? '#fff' : color};` +
        `cursor:pointer;padding:1px 5px;border-radius:10px;font-size:.6rem;font-weight:700;font-family:inherit;transition:all .15s;">` +
        `${t('sim3d.trail')}` +
        `</button>`;
      chip.querySelector('.chip-btn-press').addEventListener('click', (e) => {
        e.stopPropagation();
        this.pressButton(i);
      });
      chip.querySelector('.trail-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        cube.toggleTrail();
        this._dirty = true;
        this._updateTrailBtnState();   // keep trail btns in sync
        if (this._statusFn) this._statusFn(this._cubes);
      });
      container.appendChild(chip);
    });
  }

  /** Toggle all-cube trail on/off. Returns the new state (true = all on). */
  toggleAllTrails() {
    const allOn = this._cubes.length === 0 ||
                  this._cubes.every(c => c.showTrail !== false);
    const next = !allOn;
    this._cubes.forEach(c => {
      c.showTrail = next;
      if (!next) c._trail = [];
    });
    this._dirty = true;
    this._updateTrailBtnState();
    if (this._statusFn) this._statusFn(this._cubes);
    return next;
  }
}

window.ToioSimulator  = ToioSimulator;
window.SimCubeBackend = SimCubeBackend;
window.CUBE_COLORS    = CUBE_COLORS;
