/* runtime.js — Program execution engine for real/simulated toio
   Supports multiple cubes via a Proxy-based `toio` API object. */

class Runtime {
  constructor() {
    this._sim      = null;    // ToioSimulator
    this._manager  = null;    // ToioManager (real BLE)
    this._running  = false;
    this._abortCtl = null;
    this._logFn    = console.log;
  }

  setSimulator(sim) { this._sim = sim; }
  setManager(mgr)   { this._manager = mgr; }
  onLog(fn)         { this._logFn = fn; }
  get isRunning()   { return this._running; }

  /* ── Build toio API proxy ─────────────────────────────────────────────── */
  /* The generated code uses:
       toio[n].move(...)         → individual cube by 0-based index
       toio.all(async t => ...) → run fn on every cube
       toio.wait(sec)           → sleep
       toio.waitButton(idx)     → wait for button press
       toio.getState(idx)       → { x, y, angle, button, horizontal }
       toio.getBattery(idx)     → number
       toio.log(msg)            → console log
  */
  _makeAPI(backends) {
    const log    = (...args) => this._logFn(args.map(String).join(' '));
    const signal = this._abortCtl.signal;

    const guard = fn => {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return fn();
    };

    /* Wrap a single backend into a safe API object */
    const wrapBackend = (bk) => ({
      move:           (l, r, durMs)    => guard(() => bk.move(l, r, durMs)),
      stop:           ()               => guard(() => bk.stop()),
      moveTo:         (x, y, a, s, m)  => guard(() => bk.moveTo(x, y, a, s, m)),
      rotateTo:       (a, s)           => guard(() => bk.rotateTo ? bk.rotateTo(a, s) : Promise.resolve()),
      moveRel:        (d, s)           => guard(() => bk.moveRel ? bk.moveRel(d, s) : Promise.resolve()),
      rotateRel:      (da, s)          => guard(() => bk.rotateRel ? bk.rotateRel(da, s) : Promise.resolve()),
      setLED:         (r, g, b, d)     => guard(() => bk.setLED(r, g, b, d)),
      turnOffLED:     ()               => guard(() => bk.turnOffLED()),
      playSound:      (n, d)           => guard(() => bk.playSound(n, d)),
      playSoundEffect:(id)             => guard(() => bk.playSoundEffect(id)),
      stopSound:      ()               => guard(() => bk.stopSound()),
    });

    const wrapped = backends.map(wrapBackend);

    /* Global helpers on the toio object */
    const globals = {
      all:        fn  => guard(() => Promise.all(backends.map((b, i) => fn(wrapped[i])))),
      wait:       sec => guard(() => sleep(sec * 1000)),
      waitButton: idx => guard(() => {
        const b = backends[idx] || backends[0];
        return b.waitButton ? b.waitButton() : sleep(500);
      }),
      getState:   idx => {
        const b = backends[idx] || backends[0];
        const pos = b.position || { x: 250, y: 250, angle: 0 };
        return { x: pos.x, y: pos.y, angle: pos.angle, button: b.button || false, horizontal: true };
      },
      getBattery: async idx => {
        const b = backends[idx] || backends[0];
        return b.getBattery ? await b.getBattery() : 80;
      },
      onButton: (idx, fn) => {
        // idx < 0 → listen on all cubes; otherwise listen on specific cube
        const targets = (idx < 0) ? backends : [backends[Math.max(0, idx)] || backends[0]];
        targets.forEach(b => {
          if (!b._buttonListeners) b._buttonListeners = [];
          b._buttonListeners.push(() => guard(() => fn()));
        });
      },
      onStart: (fn) => {
        // Register a handler to be triggered when the program starts.
        // All registered handlers run in parallel after registration completes.
        globals._startHandlers.push(() => guard(() => fn()));
      },
      _startHandlers: [],
      log,
    };

    /* Proxy for numeric index access: toio[0], toio[1], ... */
    return new Proxy(globals, {
      get(target, prop) {
        const n = Number(prop);
        if (!isNaN(n) && Number.isInteger(n)) {
          return wrapped[n] || wrapped[0];
        }
        return target[prop];
      }
    });
  }

  /* ── Run ─────────────────────────────────────────────────────────────── */
  async run(jsCode) {
    if (this._running) return;

    /* Choose backends: prefer real cubes if any connected */
    let backends;
    if (this._manager && this._manager.count > 0) {
      backends = this._manager.cubes;
    } else if (this._sim) {
      /* Use all active simulator cubes */
      const count = this._sim.cubeCount || 1;
      backends = Array.from({ length: count }, (_, i) => this._sim.getCubeBackend(i));
    } else {
      this._logFn('⚠ toioが接続されていません。');
      return;
    }

    this._running = true;
    this._abortCtl = new AbortController();
    this.stopAutoHandlers(); // Cancel any auto-registered listeners before full run
    // Clear any button listeners from a previous run
    backends.forEach(b => { b._buttonListeners = []; });
    if (this._sim) this._sim.resume();

    const toio = this._makeAPI(backends);

    const wrapped = `(async function(toio) {\n${jsCode}\n})`;

    try {
      this._logFn('▶ プログラムを開始します...');
      // eslint-disable-next-line no-eval
      const fn = eval(wrapped);
      await fn(toio);
      // If start-flag handlers were registered (toio_on_start blocks),
      // run them all in parallel — Scratch-style green-flag execution.
      if (toio._startHandlers && toio._startHandlers.length > 0) {
        await Promise.all(toio._startHandlers.map(h => h()));
      }
      this._logFn('✓ プログラムが完了しました。');
    } catch (e) {
      if (e.name === 'AbortError') {
        this._logFn('■ プログラムを停止しました。');
      } else {
        this._logFn(`✗ エラー: ${e.message}`);
        console.error(e);
      }
    } finally {
      this._running = false;
      /* Stop all motors */
      for (const b of backends) {
        try { await b.stop(); } catch {}
      }
    }
  }

  stop() {
    if (this._abortCtl) this._abortCtl.abort();
    if (this._sim) this._sim.stop();
    this._running = false;
    this.stopAutoHandlers();
    // Clear button listeners so they don't fire after program stops
    if (this._sim) {
      const count = this._sim.cubeCount || 1;
      for (let i = 0; i < count; i++) {
        const b = this._sim.getCubeBackend(i);
        if (b) b._buttonListeners = [];
      }
    }
  }

  /* ── Auto-register button handlers (runs hat blocks without pressing Run) ── */
  autoRegisterHandlers(hatCode) {
    if (this._running) return;   // Full program takes priority
    if (!hatCode || !hatCode.trim()) return;

    let backends;
    if (this._sim) {
      const count = this._sim.cubeCount || 1;
      backends = Array.from({ length: count }, (_, i) => this._sim.getCubeBackend(i));
    } else {
      return;  // No simulator available
    }

    // Abort any previous auto-session and create a fresh one
    if (this._autoCtl) this._autoCtl.abort();
    this._autoCtl = new AbortController();
    const signal = this._autoCtl.signal;

    const guard = fn => {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return fn();
    };

    // Clear existing listeners so re-registering on workspace change is clean
    backends.forEach(b => { b._buttonListeners = []; });

    /* Full API so callbacks can move/light/play etc. */
    const wrapBackend = (bk) => ({
      move:           (l, r, d)      => guard(() => bk.move(l, r, d)),
      stop:           ()             => guard(() => bk.stop()),
      moveTo:         (x, y, a, s, m)=> guard(() => bk.moveTo(x, y, a, s, m)),
      rotateTo:       (a, s)         => guard(() => bk.rotateTo ? bk.rotateTo(a, s) : Promise.resolve()),
      moveRel:        (d, s)         => guard(() => bk.moveRel ? bk.moveRel(d, s) : Promise.resolve()),
      rotateRel:      (da, s)        => guard(() => bk.rotateRel ? bk.rotateRel(da, s) : Promise.resolve()),
      setLED:         (r, g, b, d)   => guard(() => bk.setLED(r, g, b, d)),
      turnOffLED:     ()             => guard(() => bk.turnOffLED()),
      playSound:      (n, d)         => guard(() => bk.playSound(n, d)),
      playSoundEffect:(id)           => guard(() => bk.playSoundEffect(id)),
      stopSound:      ()             => guard(() => bk.stopSound()),
    });
    const wrapped = backends.map(wrapBackend);

    const globals = {
      all:        fn  => guard(() => Promise.all(backends.map((b, i) => fn(wrapped[i])))),
      wait:       sec => guard(() => sleep(sec * 1000)),
      waitButton: idx => guard(() => {
        const b = backends[idx] || backends[0];
        return b.waitButton ? b.waitButton() : sleep(500);
      }),
      getState:   idx => {
        const b = backends[idx] || backends[0];
        const pos = b.position || { x: 250, y: 250, angle: 0 };
        return { x: pos.x, y: pos.y, angle: pos.angle, button: b.button || false, horizontal: true };
      },
      getBattery: async idx => {
        const b = backends[idx] || backends[0];
        return b.getBattery ? await b.getBattery() : 80;
      },
      onButton: (idx, fn) => {
        const targets = (idx < 0) ? backends : [backends[Math.max(0, idx)] || backends[0]];
        targets.forEach(b => {
          if (!b._buttonListeners) b._buttonListeners = [];
          b._buttonListeners.push(() => fn().catch(() => {}));
        });
      },
      log: (...args) => this._logFn(args.map(String).join(' ')),
    };

    const toio = new Proxy(globals, {
      get(target, prop) {
        const n = Number(prop);
        if (!isNaN(n) && Number.isInteger(n)) return wrapped[n] || wrapped[0];
        return target[prop];
      }
    });

    const wrapped_code = `(async function(toio) {\n${hatCode}\n})`;
    try {
      // eslint-disable-next-line no-eval
      const fn = eval(wrapped_code);
      fn(toio).catch(() => {}); // Hat blocks register synchronously then return
    } catch (e) {
      // Silently ignore — may happen if code references variables not yet defined
      console.debug('autoRegisterHandlers:', e.message);
    }
  }

  stopAutoHandlers() {
    if (this._autoCtl) {
      this._autoCtl.abort();
      this._autoCtl = null;
    }
  }
}

window.Runtime = Runtime;
