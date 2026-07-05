/* ============================================================
   PERFECT WAFFLE — APPLICATION LOGIC
   Thermal model + timer state machine for charcoal-grill waffles
   ============================================================ */

// ─── Thermal Model ───────────────────────────────────────────
// Physics-inspired model calibrated to real-world data:
//   Reference: 1 Rapidfire unit, T_amb=20°C, d=5mm, doneness=1.0
//   → preheat ~8 min, first waffle ~90s/side, +~10s per subsequent waffle
//
// Coal temperature decays exponentially from peak.
// Iron temperature follows Newton's law of heating/cooling.
// Cook time per side is inversely proportional to (T_iron - T_waffle).

class ThermalModel {
  constructor(coalUnits, ambientTemp, ironThicknessMm, doneness) {
    this.N = coalUnits;
    this.T_amb = ambientTemp;
    this.d = ironThicknessMm;
    this.doneness = doneness;

    // ── Coal parameters ──
    // Peak temp above ambient scales sub-linearly with coal amount
    this.coalPeakDelta = 380 * Math.pow(this.N, 0.7);
    // Decay rate — more coal decays slower
    this.coalDecayRate = 0.00030 / Math.sqrt(this.N);

    // ── Iron heat-transfer coefficients ──
    // Thicker iron → slower heat exchange (proportional to 1/d)
    const dFactor = this.d / 5.0;
    this.hHeat = 0.0022 / dFactor; // heating on grill
    this.hCool = 0.0030 / dFactor; // cooling off grill

    // ── Cooking energy ──
    // Energy units needed for one side of a waffle to cook
    // Calibrated so first waffle ≈ 90s/side at reference conditions
    this.T_waffle = 100; // effective batter/steam temperature
    this.baseEnergy = 11500;

    // ── State ──
    this.T_iron = ambientTemp;
    this.elapsed = 0; // seconds since coals were spread

    // ── Ready threshold ──
    // Minimum iron temp to start cooking (ensures good browning)
    this.T_ready = 200;
  }

  /** Current coal-bed temperature */
  getCoalTemp() {
    return this.T_amb + this.coalPeakDelta * Math.exp(-this.coalDecayRate * this.elapsed);
  }

  /** Simulate iron ON the grill for `dt` seconds (1-second steps) */
  heatOnGrill(dt) {
    const steps = Math.max(1, Math.round(dt));
    const stepDt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.elapsed += stepDt;
      const Tc = this.getCoalTemp();
      this.T_iron += this.hHeat * (Tc - this.T_iron) * stepDt;
    }
  }

  /** Simulate iron OFF the grill for `dt` seconds */
  coolOffGrill(dt) {
    const steps = Math.max(1, Math.round(dt));
    const stepDt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.elapsed += stepDt;
      this.T_iron -= this.hCool * (this.T_iron - this.T_amb) * stepDt;
    }
  }

  /** Advance elapsed time only (iron on grill, passive update) */
  tick(dt) {
    this.heatOnGrill(dt);
  }

  /**
   * Estimate how many seconds until the iron reaches T_ready.
   * Returns the preheat countdown (non-destructive — uses a clone).
   */
  estimatePreheatSeconds() {
    let t = 0;
    let Ti = this.T_iron;
    const dt = 1;
    const maxT = 3600;
    while (Ti < this.T_ready && t < maxT) {
      const elap = this.elapsed + t;
      const Tc = this.T_amb + this.coalPeakDelta * Math.exp(-this.coalDecayRate * elap);
      Ti += this.hHeat * (Tc - Ti) * dt;
      t += dt;
    }
    return t;
  }

  /**
   * Estimate cook time for one side at the current iron temperature.
   * cook_time = baseEnergy / (T_iron - T_waffle) * doneness
   * With a floor to prevent absurd values when iron is barely warm.
   */
  estimateCookTimePerSide() {
    const effectiveTemp = Math.max(this.T_iron - this.T_waffle, 40);
    const raw = (this.baseEnergy / effectiveTemp) * this.doneness;
    return Math.max(30, Math.round(raw));
  }

  /**
   * Estimate cook time for the second side.
   * Iron is slightly hotter (it kept heating during side 1), but the
   * waffle is already partially set, so timing is similar. We add a
   * small correction.
   */
  estimateSecondSideTime(firstSideTime) {
    // After first side, iron is hotter → shorter raw time
    // But we compensate slightly for waffle inertia
    const rawSecond = this.estimateCookTimePerSide();
    // Blend toward first side time (waffle thermal resistance)
    return Math.max(30, Math.round(rawSecond * 0.85 + firstSideTime * 0.15));
  }

  /** Snapshot for UI display */
  getSnapshot() {
    return {
      coalTemp: Math.round(this.getCoalTemp()),
      ironTemp: Math.round(this.T_iron),
      elapsed: this.elapsed,
    };
  }
}


// ─── Audio Alarm ─────────────────────────────────────────────

class AlarmSound {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.intervalId = null;
  }

  /** Must be called from a user gesture to unlock AudioContext */
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  /** Play a pleasant chime pattern */
  play() {
    if (!this.ctx) this.init();
    if (this.playing) return;
    this.playing = true;

    const chime = () => {
      if (!this.playing) return;
      const notes = [880, 1100, 880, 660];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = this.ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.005, start + 0.16);
        osc.start(start);
        osc.stop(start + 0.18);
      });
    };

    chime();
    this.intervalId = setInterval(chime, 1800);

    // Vibrate on mobile
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
  }

  stop() {
    this.playing = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}


// ─── Ember Particles ─────────────────────────────────────────

class EmberParticles {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  spawn() {
    if (this.particles.length > 40) return;
    this.particles.push({
      x: Math.random() * this.canvas.width,
      y: this.canvas.height + 10,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -(0.4 + Math.random() * 1.2),
      size: 1 + Math.random() * 2.5,
      life: 1,
      decay: 0.002 + Math.random() * 0.004,
      hue: 15 + Math.random() * 25, // orange-red range
    });
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx + Math.sin(p.y * 0.01) * 0.3;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0 || p.y < -10) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const p of this.particles) {
      const alpha = p.life * 0.7;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${alpha})`;
      this.ctx.shadowColor = `hsla(${p.hue}, 100%, 50%, ${alpha * 0.5})`;
      this.ctx.shadowBlur = 6;
      this.ctx.fill();
    }
    this.ctx.shadowBlur = 0;
  }

  tick() {
    if (Math.random() < 0.25) this.spawn();
    this.update();
    this.draw();
  }
}


// ─── DOM Helpers ─────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function formatTime(seconds) {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.floor(Math.abs(seconds) % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function setRingProgress(ringEl, fraction) {
  const circumference = 2 * Math.PI * 90; // r=90
  const offset = circumference * (1 - Math.max(0, Math.min(1, fraction)));
  ringEl.style.strokeDashoffset = offset;
}

function showScreen(id) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $(`#screen-${id}`).classList.add('active');
}

function setStepActive(stepName) {
  const steps = ['load', 'side1', 'flip', 'side2', 'done'];
  const connectors = $$('.step-connector');
  const idx = steps.indexOf(stepName);

  $$('.step').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i < idx) el.classList.add('done');
    else if (i === idx) el.classList.add('active');
  });

  connectors.forEach((c, i) => {
    c.classList.toggle('done', i < idx);
  });
}


// ─── Application State Machine ──────────────────────────────

const AppState = {
  SETUP: 'setup',
  PREHEATING: 'preheating',
  READY_TO_LOAD: 'ready_to_load',
  GRILLING_SIDE1: 'grilling_side1',
  FLIP_ALARM: 'flip_alarm',
  GRILLING_SIDE2: 'grilling_side2',
  WAFFLE_DONE: 'waffle_done',
  SESSION_DONE: 'session_done',
};

class App {
  constructor() {
    this.state = AppState.SETUP;
    this.model = null;
    this.alarm = new AlarmSound();
    this.embers = new EmberParticles($('#embers-canvas'));
    this.wakeLock = null;

    // Timing
    this.sessionStartTime = null;
    this.timerTarget = 0;  // target seconds for current countdown
    this.timerElapsed = 0; // seconds elapsed in current countdown
    this.lastTick = null;

    // Waffle tracking
    this.waffleNumber = 0;
    this.waffleLog = []; // {number, side1, side2}
    this.currentSide1Time = 0;
    this.currentSide2Time = 0;
    this.ironOffGrillTime = null; // timestamp when iron left grill

    // Animation
    this.rafId = null;

    this.bindEvents();
    this.startLoop();
  }

  bindEvents() {
    // Setup sliders
    const sliders = [
      { id: 'coal-size', valId: 'coal-size-val', fmt: (v) => parseFloat(v).toFixed(v % 1 ? 2 : 1) },
      { id: 'outdoor-temp', valId: 'outdoor-temp-val', fmt: (v) => `${v}°C` },
      { id: 'iron-thickness', valId: 'iron-thickness-val', fmt: (v) => `${parseFloat(v).toFixed(1)} mm` },
      { id: 'doneness', valId: 'doneness-val', fmt: (v) => `${parseFloat(v).toFixed(2)}×` },
    ];

    sliders.forEach(({ id, valId, fmt }) => {
      const input = $(`#${id}`);
      const display = $(`#${valId}`);
      input.addEventListener('input', () => {
        display.textContent = fmt(input.value);
        if (id === 'doneness') this.updateDonenessLabel(parseFloat(input.value));
      });
    });

    // Start button
    $('#btn-start').addEventListener('click', () => this.startSession());

    // Restart button
    $('#btn-restart').addEventListener('click', () => this.restart());
  }

  updateDonenessLabel(val) {
    let label = 'Golden';
    if (val < 0.85) label = 'Light';
    else if (val < 1.05) label = 'Golden';
    else if (val < 1.25) label = 'Dark';
    else label = 'Crispy';
    $('#doneness-label').textContent = label;
  }

  // ── Session Start ──

  startSession() {
    // Attempt to acquire Wake Lock on load
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(lock => {
        this.wakeLock = lock;
        console.log('Screen wake lock acquired.');
      }).catch(err => {
        console.error('Failed to acquire screen wake lock:', err);
      });
    } else {
      console.warn('Wake Lock API not supported by this browser.');
    }
    this.alarm.init(); // unlock audio on user gesture

    const coalUnits = parseFloat($('#coal-size').value);
    const ambientTemp = parseFloat($('#outdoor-temp').value);
    const ironThickness = parseFloat($('#iron-thickness').value);
    const doneness = parseFloat($('#doneness').value);

    this.model = new ThermalModel(coalUnits, ambientTemp, ironThickness, doneness);
    this.sessionStartTime = Date.now();
    this.waffleNumber = 0;
    this.waffleLog = [];

    this.enterPreheat();
  }

  // ── Preheat Phase ──

  enterPreheat() {
    this.state = AppState.PREHEATING;
    showScreen('preheat');

    const preheatSec = this.model.estimatePreheatSeconds();
    this.timerTarget = preheatSec;
    this.timerElapsed = 0;
    this.lastTick = Date.now();

    $('#preheat-status').textContent = 'Heating the waffle iron…';
    $('#preheat-status').classList.remove('alarm');
    setRingProgress($('#preheat-ring'), 0);
    $('#preheat-ring').classList.remove('success');
  }

  updatePreheat(dt) {
    this.timerElapsed += dt;
    this.model.tick(dt);

    const remaining = Math.max(0, this.timerTarget - this.timerElapsed);
    const frac = this.timerTarget > 0 ? this.timerElapsed / this.timerTarget : 1;

    $('#preheat-timer').textContent = formatTime(remaining);
    setRingProgress($('#preheat-ring'), Math.min(frac, 1));

    // Update temps
    const snap = this.model.getSnapshot();
    $('#preheat-coal-temp').textContent = `${snap.coalTemp}°C`;
    $('#preheat-iron-temp').textContent = `${snap.ironTemp}°C`;
    const maxTemp = 450;
    $('#preheat-coal-bar').style.width = `${Math.min(100, (snap.coalTemp / maxTemp) * 100)}%`;
    $('#preheat-iron-bar').style.width = `${Math.min(100, (snap.ironTemp / maxTemp) * 100)}%`;

    // Elapsed session time
    $('#preheat-elapsed').textContent = formatTime((Date.now() - this.sessionStartTime) / 1000);

    // Check if ready
    if (remaining <= 0 && this.state === AppState.PREHEATING) {
      this.state = AppState.READY_TO_LOAD;
      this.alarm.play();
      $('#preheat-ring').classList.add('success');
      $('#preheat-timer').textContent = '0:00';
      $('#preheat-status').textContent = '🧇 Iron is ready! Load the first waffle!';
      $('#preheat-status').classList.add('alarm');
      document.body.classList.add('alarm-flash');

      // Wait for user tap on the screen to proceed
      const handler = () => {
        document.body.classList.remove('alarm-flash');
        this.alarm.stop();
        this.enterLoadBatter();
        document.removeEventListener('click', handler);
      };
      // Small delay to avoid immediate trigger from preheat screen
      setTimeout(() => document.addEventListener('click', handler), 300);
    }
  }

  // ── Load Batter Phase ──

  enterLoadBatter() {
    this.state = AppState.READY_TO_LOAD;
    this.waffleNumber++;
    // For the first waffle, iron leaves grill now. For subsequent waffles,
    // ironOffGrillTime was already set in enterWaffleDone().
    if (!this.ironOffGrillTime) {
      this.ironOffGrillTime = Date.now();
    }

    showScreen('cooking');
    setStepActive('load');

    $('#waffle-counter').textContent = `Waffle #${this.waffleNumber}`;
    $('#cook-timer').textContent = '--:--';
    $('#cook-timer-label').textContent = 'load batter & place on grill';
    setRingProgress($('#cook-ring'), 1);
    $('#cook-ring').classList.remove('success', 'warning');
    $('#cook-ring').classList.add('warning');

    // Estimate cook times for display
    const est1 = this.model.estimateCookTimePerSide();
    const est2 = this.model.estimateSecondSideTime(est1);
    $('#info-side1').textContent = `Side 1: ~${formatTime(est1)}`;
    $('#info-side2').textContent = `Side 2: ~${formatTime(est2)}`;
    $('#info-side1').classList.remove('active');
    $('#info-side2').classList.remove('active');

    this.renderActionButtons([
      { text: '🧇 Batter Loaded — On the Grill!', cls: 'btn-fire', action: () => this.startSide1() },
    ]);
  }

  // ── Grilling Side 1 ──

  startSide1() {
    // Calculate how long iron was off grill (cooling during loading)
    if (this.ironOffGrillTime) {
      const offDuration = (Date.now() - this.ironOffGrillTime) / 1000;
      this.model.coolOffGrill(offDuration);
      this.ironOffGrillTime = null;
    }

    this.state = AppState.GRILLING_SIDE1;
    setStepActive('side1');

    this.currentSide1Time = this.model.estimateCookTimePerSide();
    this.timerTarget = this.currentSide1Time;
    this.timerElapsed = 0;
    this.lastTick = Date.now();

    $('#cook-timer-label').textContent = 'grilling side 1';
    $('#cook-ring').classList.remove('success', 'warning');
    $('#info-side1').classList.add('active');

    // Also re-estimate side 2 now that we know current iron state
    const est2 = this.model.estimateSecondSideTime(this.currentSide1Time);
    $('#info-side2').textContent = `Side 2: ~${formatTime(est2)}`;

    this.renderActionButtons([]); // no buttons during grilling
  }

  updateSide1(dt) {
    this.timerElapsed += dt;
    this.model.tick(dt);

    const remaining = Math.max(0, this.timerTarget - this.timerElapsed);
    const frac = this.timerTarget > 0 ? this.timerElapsed / this.timerTarget : 1;

    $('#cook-timer').textContent = formatTime(remaining);
    setRingProgress($('#cook-ring'), Math.min(frac, 1));
    this.updateCookGauges();

    if (remaining <= 0 && this.state === AppState.GRILLING_SIDE1) {
      this.enterFlipAlarm();
    }
  }

  // ── Flip Alarm ──

  enterFlipAlarm() {
    this.state = AppState.FLIP_ALARM;
    this.alarm.play();
    document.body.classList.add('alarm-flash');
    setStepActive('flip');

    $('#cook-timer').textContent = 'FLIP!';
    $('#cook-timer-label').textContent = 'flip the waffle iron now';
    $('#cook-ring').classList.add('warning');
    setRingProgress($('#cook-ring'), 1);

    this.renderActionButtons([
      { text: '🔄 Flipped!', cls: 'btn-fire', action: () => this.startSide2() },
    ]);
  }

  // ── Grilling Side 2 ──

  startSide2() {
    this.alarm.stop();
    document.body.classList.remove('alarm-flash');
    this.state = AppState.GRILLING_SIDE2;
    setStepActive('side2');

    this.currentSide2Time = this.model.estimateSecondSideTime(this.currentSide1Time);
    this.timerTarget = this.currentSide2Time;
    this.timerElapsed = 0;
    this.lastTick = Date.now();

    $('#cook-timer-label').textContent = 'grilling side 2';
    $('#cook-ring').classList.remove('success', 'warning');
    $('#info-side1').classList.remove('active');
    $('#info-side2').classList.add('active');
    $('#info-side2').textContent = `Side 2: ${formatTime(this.currentSide2Time)}`;

    this.renderActionButtons([]);
  }

  updateSide2(dt) {
    this.timerElapsed += dt;
    this.model.tick(dt);

    const remaining = Math.max(0, this.timerTarget - this.timerElapsed);
    const frac = this.timerTarget > 0 ? this.timerElapsed / this.timerTarget : 1;

    $('#cook-timer').textContent = formatTime(remaining);
    setRingProgress($('#cook-ring'), Math.min(frac, 1));
    this.updateCookGauges();

    if (remaining <= 0 && this.state === AppState.GRILLING_SIDE2) {
      this.enterWaffleDone();
    }
  }

  // ── Waffle Done ──

  enterWaffleDone() {
    this.state = AppState.WAFFLE_DONE;
    this.alarm.play();
    document.body.classList.add('alarm-flash');
    setStepActive('done');

    // Iron is now off the grill — start tracking cooling time
    this.ironOffGrillTime = Date.now();

    // Log the waffle
    this.waffleLog.push({
      number: this.waffleNumber,
      side1: this.currentSide1Time,
      side2: this.currentSide2Time,
    });

    $('#cook-timer').textContent = 'DONE!';
    $('#cook-timer-label').textContent = 'waffle is ready — unload!';
    $('#cook-ring').classList.add('success');
    setRingProgress($('#cook-ring'), 1);

    this.renderActionButtons([
      { text: '🧇 Next Waffle', cls: 'btn-fire', action: () => this.nextWaffle() },
      { text: '✅ All Done — Finish Session', cls: 'btn-secondary', action: () => this.finishSession() },
    ]);
  }

  nextWaffle() {
    this.alarm.stop();
    document.body.classList.remove('alarm-flash');
    this.enterLoadBatter();
  }

  // ── Session Summary ──

  finishSession() {
    // Attempt to acquire Wake Lock on load
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    } else {
      console.warn('Wake Lock API not supported by this browser.');
    }
    this.alarm.stop();
    document.body.classList.remove('alarm-flash');
    this.state = AppState.SESSION_DONE;
    showScreen('summary');

    const totalSec = (Date.now() - this.sessionStartTime) / 1000;
    $('#summary-waffles').textContent = this.waffleLog.length;
    $('#summary-time').textContent = formatTime(totalSec);

    const list = $('#summary-list');
    list.innerHTML = '';
    this.waffleLog.forEach((w) => {
      const total = w.side1 + w.side2;
      const el = document.createElement('div');
      el.className = 'summary-item';
      el.innerHTML = `
        <span class="summary-item-label">Waffle #${w.number}</span>
        <span class="summary-item-value">${formatTime(w.side1)} + ${formatTime(w.side2)} = ${formatTime(total)}</span>
      `;
      list.appendChild(el);
    });
  }

  restart() {
    this.state = AppState.SETUP;
    this.model = null;
    this.waffleLog = [];
    this.waffleNumber = 0;
    showScreen('setup');
  }

  // ── UI Helpers ──

  renderActionButtons(buttons) {
    const container = $('#action-buttons');
    container.innerHTML = '';
    buttons.forEach(({ text, cls, action }) => {
      const btn = document.createElement('button');
      btn.className = `btn ${cls}`;
      btn.innerHTML = text;
      btn.addEventListener('click', action);
      container.appendChild(btn);
    });
  }

  updateCookGauges() {
    const snap = this.model.getSnapshot();
    const maxTemp = 450;
    $('#cook-coal-temp').textContent = `${snap.coalTemp}°C`;
    $('#cook-iron-temp').textContent = `${snap.ironTemp}°C`;
    $('#cook-coal-bar').style.width = `${Math.min(100, (snap.coalTemp / maxTemp) * 100)}%`;
    $('#cook-iron-bar').style.width = `${Math.min(100, (snap.ironTemp / maxTemp) * 100)}%`;
    $('#cook-elapsed').textContent = formatTime((Date.now() - this.sessionStartTime) / 1000);
  }

  // ── Main Loop ──

  startLoop() {
    const loop = () => {
      this.embers.tick();

      const now = Date.now();
      if (this.lastTick && this.model) {
        const dt = (now - this.lastTick) / 1000;

        switch (this.state) {
          case AppState.PREHEATING:
            this.updatePreheat(dt);
            break;
          case AppState.READY_TO_LOAD:
            // Iron is off the grill — don't tick model here;
            // cooling is applied in bulk when user presses "Batter Loaded".
            // But keep elapsed clock and gauges visible.
            if (this.sessionStartTime) {
              $('#cook-elapsed').textContent = formatTime((Date.now() - this.sessionStartTime) / 1000);
            }
            break;
          case AppState.GRILLING_SIDE1:
            this.updateSide1(dt);
            break;
          case AppState.GRILLING_SIDE2:
            this.updateSide2(dt);
            break;
          case AppState.FLIP_ALARM:
            // Iron is still on the grill while user flips
            this.model.tick(dt);
            this.updateCookGauges();
            break;
          case AppState.WAFFLE_DONE:
            // Iron is being unloaded — don't tick (cooling applied on next load)
            this.updateCookGauges();
            break;
        }
      }
      this.lastTick = now;

      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
