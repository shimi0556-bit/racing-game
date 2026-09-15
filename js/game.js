(() => {
  "use strict";

  const LAPS = 3;
  const MAX_DT = 1 / 30;
  const STORAGE_BEST = "neon-racer-best";
  const STORAGE_LANG = "neon-racer-lang";
  const STORAGE_MUTE = "neon-racer-mute";

  const I18N = {
    he: {
      pos: "מיקום",
      lap: "הקפה",
      time: "זמן",
      best: "שיא",
      speed: "מהירות",
      standings: "דירוג",
      title: "ניאון רייסר",
      subtitle: "Neon Racer",
      eyebrow: "לילה על האספלט",
      lead: "שלוש הקפות במסלול לילי מול שלוש מכוניות יריבות. הישארו על הכביש, חתכו פניות בזהירות, ונצחו את השעון.",
      ctrl_kb: "מקלדת: חצים או WASD להגה · ↑/W האצה · Space בלם — הרכב נוסע גם בלי גז",
      ctrl_touch: "מובייל: כפתורי הגה וגז על המסך",
      ctrl_mute: "M להשתקה · R להתחלה מחדש אחרי סיום",
      start: "התחל מירוץ",
      mute: "השתק",
      finished: "סיום המירוץ",
      bestlap: "הקפה מהירה",
      new_record: "★ שיא חדש!",
      retry: "שחק שוב",
      menu: "תפריט",
      you: "אתה",
      go: "סע!",
      win: "ניצחת!",
      place: (n) => "מקום " + n,
      record_line: (t) => "שיא מקומי: " + t,
      no_record: "עדיין אין שיא — קבעו אותו.",
      finish_lead_win: "שלוש הקפות נקיות. האספלט שלך הלילה.",
      finish_lead_ok: "הגעתם לקו הסיום. עוד ניסיון והפודיום קרוב.",
      dir: "rtl",
      lang: "he",
      langBtn: "EN",
    },
    en: {
      pos: "Pos",
      lap: "Lap",
      time: "Time",
      best: "Best",
      speed: "Speed",
      standings: "Field",
      title: "Neon Racer",
      subtitle: "ניאון רייסר",
      eyebrow: "Night on the asphalt",
      lead: "Three laps on a neon circuit against three rival cars. Stay on the road, brake for corners, and beat the clock.",
      ctrl_kb: "Keyboard: arrows or WASD to steer · ↑/W boost · Space brake — the car rolls on its own",
      ctrl_touch: "Mobile: on-screen steer and throttle",
      ctrl_mute: "M to mute · R to restart after finish",
      start: "Start race",
      mute: "Mute",
      finished: "Race complete",
      bestlap: "Best lap",
      new_record: "★ New record!",
      retry: "Race again",
      menu: "Menu",
      you: "You",
      go: "GO!",
      win: "You won!",
      place: (n) => "P" + n,
      record_line: (t) => "Local best: " + t,
      no_record: "No record yet — set one.",
      finish_lead_win: "Three clean laps. The night is yours.",
      finish_lead_ok: "You made the line. One more run for the podium.",
      dir: "ltr",
      lang: "en",
      langBtn: "עב",
    },
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  const hypot = Math.hypot;

  function formatTime(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "--:--.-";
    const total = Math.max(0, ms);
    const m = Math.floor(total / 60000);
    const s = Math.floor((total % 60000) / 1000);
    const t = Math.floor((total % 1000) / 100);
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + "." + t;
  }

  function loadBest() {
    const n = Number(localStorage.getItem(STORAGE_BEST));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function saveBest(ms) {
    localStorage.setItem(STORAGE_BEST, String(ms));
  }

  /* ---------- audio (Web Audio, no assets) ---------- */
  const audio = {
    ctx: null,
    master: null,
    engine: null,
    engineGain: null,
    muted: localStorage.getItem(STORAGE_MUTE) === "1",
    ensure() {
      if (this.ctx) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.22;
      this.master.connect(this.ctx.destination);
      this.engine = this.ctx.createOscillator();
      this.engine.type = "sawtooth";
      this.engine.frequency.value = 48;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      this.engine.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engine.start();
    },
    resume() {
      this.ensure();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },
    setMuted(m) {
      this.muted = m;
      localStorage.setItem(STORAGE_MUTE, m ? "1" : "0");
      if (this.master) this.master.gain.value = m ? 0 : 0.22;
    },
    engineLevel(speed, racing) {
      if (!this.engine || !this.engineGain) return;
      const t = this.ctx.currentTime;
      const hz = 42 + speed * 0.55;
      this.engine.frequency.setTargetAtTime(hz, t, 0.05);
      this.engineGain.gain.setTargetAtTime(racing ? 0.045 + speed * 0.00012 : 0, t, 0.08);
    },
    beep(freq, dur, type) {
      if (!this.ctx || this.muted) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || "square";
      o.frequency.value = freq;
      g.gain.value = 0.12;
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g);
      g.connect(this.master);
      o.start();
      o.stop(this.ctx.currentTime + dur);
    },
    crash() {
      if (!this.ctx || this.muted) return;
      const n = Math.floor(this.ctx.sampleRate * 0.22);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 420;
      const g = this.ctx.createGain();
      g.gain.value = 0.35;
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start();
    },
    finish() {
      this.beep(523, 0.16, "triangle");
      setTimeout(() => this.beep(659, 0.16, "triangle"), 120);
      setTimeout(() => this.beep(784, 0.28, "triangle"), 240);
    },
  };

  /* ---------- track ---------- */
  function catmullRom(points, steps) {
    const out = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push({
          x:
            0.5 *
            (2 * p1.x +
              (-p0.x + p2.x) * t +
              (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
              (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y:
            0.5 *
            (2 * p1.y +
              (-p0.y + p2.y) * t +
              (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
              (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    return out;
  }

  function buildTrack() {
    const control = [
      { x: 0, y: 0 },
      { x: 260, y: 8 },
      { x: 540, y: 18 },
      { x: 820, y: -6 },
      { x: 1080, y: -70 },
      { x: 1288, y: -210 },
      { x: 1390, y: -390 },
      { x: 1340, y: -560 },
      { x: 1160, y: -650 },
      { x: 940, y: -620 },
      { x: 800, y: -500 },
      { x: 720, y: -360 },
      { x: 640, y: -500 },
      { x: 500, y: -630 },
      { x: 280, y: -670 },
      { x: 70, y: -590 },
      { x: -80, y: -420 },
      { x: -150, y: -230 },
      { x: -130, y: -50 },
      { x: -50, y: 10 },
    ];
    const raw = catmullRom(control, 10);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of raw) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = 220;
    const pts = raw.map((p) => ({
      x: p.x - minX + pad,
      y: p.y - minY + pad,
    }));
    const worldW = maxX - minX + pad * 2;
    const worldH = maxY - minY + pad * 2;
    const halfW = 70;
    const n = pts.length;
    const cum = new Array(n);
    const tangents = new Array(n);
    const normals = new Array(n);
    const angles = new Array(n);
    let length = 0;
    cum[0] = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = hypot(dx, dy) || 1;
      const tx = dx / len;
      const ty = dy / len;
      tangents[i] = { x: tx, y: ty };
      normals[i] = { x: -ty, y: tx };
      angles[i] = Math.atan2(ty, tx);
      if (i < n - 1) {
        length += len;
        cum[i + 1] = length;
      } else {
        length += len;
      }
    }

    function atDist(dist) {
      let d = ((dist % length) + length) % length;
      let i = 0;
      while (i < n - 1 && cum[i + 1] < d) i++;
      const i2 = (i + 1) % n;
      const span = i2 === 0 ? length - cum[i] : cum[i2] - cum[i];
      const t = span > 0 ? (d - cum[i]) / span : 0;
      return {
        x: lerp(pts[i].x, pts[i2].x, t),
        y: lerp(pts[i].y, pts[i2].y, t),
        tx: tangents[i].x,
        ty: tangents[i].y,
        nx: normals[i].x,
        ny: normals[i].y,
        angle: angles[i],
        dist: d,
        index: i,
      };
    }

    function nearest(x, y) {
      let bestI = 0;
      let bestD = Infinity;
      for (let i = 0; i < n; i += 1) {
        const dx = x - pts[i].x;
        const dy = y - pts[i].y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      const p = pts[bestI];
      const dx = x - p.x;
      const dy = y - p.y;
      const dist = Math.sqrt(bestD);
      const side = Math.sign(dx * normals[bestI].x + dy * normals[bestI].y) || 1;
      return {
        index: bestI,
        x: p.x,
        y: p.y,
        dist,
        signed: dist * side,
        nx: normals[bestI].x,
        ny: normals[bestI].y,
        tx: tangents[bestI].x,
        ty: tangents[bestI].y,
        angle: angles[bestI],
        progress: cum[bestI],
      };
    }

    function curvature(index) {
      const a = angles[index];
      const b = angles[(index + 6) % n];
      return Math.abs(wrapAngle(b - a));
    }

    const trees = [];
    for (let i = 0; i < 90; i++) {
      const x = pad * 0.3 + Math.random() * (worldW - pad * 0.6);
      const y = pad * 0.3 + Math.random() * (worldH - pad * 0.6);
      if (nearest(x, y).dist > halfW + 46) {
        trees.push({
          x,
          y,
          r: 10 + Math.random() * 16,
          hue: 150 + Math.random() * 40,
        });
      }
    }

    return { pts, n, cum, tangents, normals, angles, length, halfW, worldW, worldH, atDist, nearest, curvature, trees };
  }

  function paintTrack(track) {
    const c = document.createElement("canvas");
    c.width = Math.ceil(track.worldW);
    c.height = Math.ceil(track.worldH);
    const g = c.getContext("2d");
    g.fillStyle = "#0b1220";
    g.fillRect(0, 0, c.width, c.height);
    const grass = g.createRadialGradient(
      c.width * 0.5,
      c.height * 0.5,
      80,
      c.width * 0.5,
      c.height * 0.5,
      Math.max(c.width, c.height) * 0.7
    );
    grass.addColorStop(0, "#14301f");
    grass.addColorStop(1, "#0a1a14");
    g.fillStyle = grass;
    g.fillRect(0, 0, c.width, c.height);

    for (const t of track.trees) {
      g.fillStyle = "hsla(" + t.hue + ", 40%, 18%, 0.9)";
      g.beginPath();
      g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      g.fill();
    }

    const drawStrip = (width, stroke) => {
      g.beginPath();
      g.moveTo(track.pts[0].x, track.pts[0].y);
      for (let i = 1; i < track.n; i++) g.lineTo(track.pts[i].x, track.pts[i].y);
      g.closePath();
      g.lineJoin = "round";
      g.lineCap = "round";
      g.strokeStyle = stroke;
      g.lineWidth = width;
      g.stroke();
    };

    drawStrip(track.halfW * 2 + 28, "#1a2336");
    g.save();
    g.setLineDash([18, 14]);
    drawStrip(track.halfW * 2 + 22, "#f43f5e");
    g.restore();
    drawStrip(track.halfW * 2 + 10, "#0f172a");
    drawStrip(track.halfW * 2, "#1e293b");
    drawStrip(track.halfW * 2 - 8, "#334155");

    g.save();
    g.setLineDash([16, 22]);
    g.beginPath();
    g.moveTo(track.pts[0].x, track.pts[0].y);
    for (let i = 1; i < track.n; i++) g.lineTo(track.pts[i].x, track.pts[i].y);
    g.closePath();
    g.strokeStyle = "rgba(226, 232, 240, 0.7)";
    g.lineWidth = 3;
    g.stroke();
    g.restore();

    const start = track.atDist(0);
    g.save();
    g.translate(start.x, start.y);
    g.rotate(start.angle);
    const gw = track.halfW * 2 - 10;
    const gh = 16;
    const cells = 10;
    const cw = gw / cells;
    for (let i = 0; i < cells; i++) {
      g.fillStyle = i % 2 === 0 ? "#f8fafc" : "#0f172a";
      g.fillRect(-gh / 2, -gw / 2 + i * cw, gh, cw + 0.5);
    }
    g.restore();

    for (let i = 0; i < track.n; i += 7) {
      const p = track.pts[i];
      const nx = track.normals[i].x;
      const ny = track.normals[i].y;
      g.fillStyle = "rgba(34, 211, 238, 0.55)";
      g.beginPath();
      g.arc(p.x + nx * (track.halfW + 16), p.y + ny * (track.halfW + 16), 3.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(244, 114, 182, 0.4)";
      g.beginPath();
      g.arc(p.x - nx * (track.halfW + 16), p.y - ny * (track.halfW + 16), 3.2, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  /* ---------- cars ---------- */
  const CAR_DEFS = [
    { id: "player", color: "#22d3ee", accent: "#ecfeff", maxSpeed: 440, accel: 280, isPlayer: true },
    { id: "razer", color: "#f472b6", accent: "#fce7f3", maxSpeed: 408, accel: 225, isPlayer: false, skill: 0.92 },
    { id: "volt", color: "#fbbf24", accent: "#fef3c7", maxSpeed: 398, accel: 218, isPlayer: false, skill: 0.84 },
    { id: "nyx", color: "#a3e635", accent: "#ecfccb", maxSpeed: 388, accel: 210, isPlayer: false, skill: 0.76 },
  ];

  class Car {
    constructor(def, track, slot) {
      this.def = def;
      this.color = def.color;
      this.accent = def.accent;
      this.isPlayer = def.isPlayer;
      this.maxSpeed = def.maxSpeed;
      this.accel = def.accel;
      this.skill = def.skill || 1;
      this.w = 28;
      this.h = 16;
      this.radius = 15;
      this.reset(track, slot);
    }

    reset(track, slot) {
      const dist = -80 - slot * 52;
      const side = slot % 2 === 0 ? -18 : 18;
      const p = track.atDist(dist);
      this.x = p.x + p.nx * side;
      this.y = p.y + p.ny * side;
      this.angle = p.angle;
      const snap = track.nearest(this.x, this.y);
      if (snap.dist > track.halfW * 0.55) {
        this.x = snap.x + snap.nx * side;
        this.y = snap.y + snap.ny * side;
        this.angle = snap.angle;
      }
      this.speed = 0;
      this.steer = 0;
      this.throttle = 0;
      this.brake = 0;
      this.laps = 0;
      this.progress = p.dist;
      this.total = -slot * 48;
      this.finished = false;
      this.finishTime = null;
      this.lapStart = 0;
      this.bestLap = null;
      this.crashT = 0;
      this.onGrass = false;
      this.passedHalf = false;
      this.lastProgress = p.dist;
    }

    sample(track) {
      return track.nearest(this.x, this.y);
    }

    updateProgress(track, now) {
      const n = this.sample(track);
      const prev = this.lastProgress;
      let delta = n.progress - prev;
      if (delta > track.length * 0.5) delta -= track.length;
      if (delta < -track.length * 0.5) delta += track.length;
      this.progress = n.progress;
      this.lastProgress = n.progress;
      if (!this.finished) this.total += delta;
      const ratio = n.progress / track.length;
      if (ratio > 0.45 && ratio < 0.7) this.passedHalf = true;
      if (
        !this.finished &&
        this.passedHalf &&
        prev > track.length * 0.82 &&
        n.progress < track.length * 0.12 &&
        delta > 0
      ) {
        const lapMs = now - this.lapStart;
        if (this.lapStart > 0 && lapMs > 2000) {
          if (this.bestLap == null || lapMs < this.bestLap) this.bestLap = lapMs;
        }
        this.laps += 1;
        this.passedHalf = false;
        this.lapStart = now;
        if (this.laps >= LAPS) {
          this.finished = true;
          this.finishTime = now;
          this.laps = LAPS;
        }
      }
      return n;
    }

    physics(dt, track, hit) {
      if (this.crashT > 0) this.crashT -= dt;
      const n = this.sample(track);
      const shoulder = track.halfW - 4;
      const wall = track.halfW + 20;
      this.onGrass = n.dist > shoulder;
      const grassMul = this.onGrass ? 0.42 : 1;
      const maxV = this.maxSpeed * grassMul;
      if (this.finished) {
        this.throttle = 0;
        this.brake = 0.4;
        this.steer = 0;
      }
      const accel = this.accel * this.throttle * grassMul;
      const braking = 520 * this.brake;
      const drag = 38 + (this.onGrass ? 90 : 0);
      this.speed += (accel - braking) * dt;
      this.speed -= Math.sign(this.speed) * drag * dt;
      if (this.throttle < 0.1 && this.brake < 0.1) this.speed *= 1 - 0.55 * dt;
      this.speed = clamp(this.speed, -maxV * 0.25, maxV);
      const steerAuth = 2.55 * (0.35 + 0.65 * Math.min(1, Math.abs(this.speed) / 220));
      this.angle += this.steer * steerAuth * dt * Math.sign(this.speed || 1);
      this.x += Math.cos(this.angle) * this.speed * dt;
      this.y += Math.sin(this.angle) * this.speed * dt;

      const after = this.sample(track);
      if (after.dist > wall) {
        const dx = this.x - after.x;
        const dy = this.y - after.y;
        const d = hypot(dx, dy) || 1;
        const inside = track.halfW - 14;
        this.x = after.x + (dx / d) * inside;
        this.y = after.y + (dy / d) * inside;
        const impact = Math.abs(this.speed);
        this.angle = after.angle;
        this.speed = Math.abs(this.speed) * 0.35;
        if (this.crashT <= 0) {
          this.crashT = 0.4;
          if (impact > 70 && this.isPlayer) hit(impact);
        }
      }
    }

    driveAI(track, playerLead) {
      if (this.finished) return;
      const n = this.sample(track);
      const look = 90 + this.speed * 0.32;
      const target = track.atDist(n.progress + look);
      const desired = Math.atan2(target.y - this.y, target.x - this.x);
      const diff = wrapAngle(desired - this.angle);
      this.steer = clamp(diff * 1.6, -1, 1);
      const curve = track.curvature(n.index);
      const limit = this.maxSpeed * this.skill * (1 / (1 + curve * 2.4));
      const rubber = 1 + clamp((playerLead - this.total) / 1600, -0.08, 0.16);
      if (this.speed > limit * rubber) {
        this.throttle = 0.15;
        this.brake = 0.55;
      } else {
        this.throttle = 1;
        this.brake = 0;
      }
      if (this.onGrass) {
        this.steer = clamp(wrapAngle(n.angle - this.angle) * 2, -1, 1);
        this.throttle = 0.7;
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      if (this.isPlayer) {
        ctx.save();
        ctx.rotate(-this.angle);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(0, -28);
        ctx.lineTo(6, -18);
        ctx.lineTo(-6, -18);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 18;
      }
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(2, 5, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      roundRect(ctx, -16, -8, 32, 16, 5);
      ctx.fillStyle = this.color;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = this.accent;
      ctx.globalAlpha = 0.85;
      roundRect(ctx, 2, -6, 10, 12, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(-12, -9, 6, 3);
      ctx.fillRect(-12, 6, 6, 3);
      ctx.fillRect(8, -9, 6, 3);
      ctx.fillRect(8, 6, 6, 3);
      ctx.fillStyle = "#fef08a";
      ctx.fillRect(14, -5, 3, 3);
      ctx.fillRect(14, 2, 3, 3);
      if (this.crashT > 0) {
        ctx.strokeStyle = "rgba(248,250,252,0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function resolveCarHits(cars) {
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = hypot(dx, dy) || 0.0001;
        const min = a.radius + b.radius;
        if (d < min) {
          const overlap = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          const rel = (b.speed - a.speed) * 0.18;
          a.speed += rel;
          b.speed -= rel;
        }
      }
    }
  }

  /* ---------- input ---------- */
  const keys = new Set();
  const touch = { left: false, right: false, gas: false, brake: false, stickyGas: false };

  function rememberKey(e, down) {
    const tokens = [e.code, e.key, (e.key || "").toLowerCase()].filter(Boolean);
    tokens.forEach((t) => (down ? keys.add(t) : keys.delete(t)));
  }

  function held(list) {
    return list.some((k) => keys.has(k));
  }

  function paintTouch() {
    document.querySelectorAll("#touch [data-touch]").forEach((btn) => {
      const name = btn.getAttribute("data-touch");
      const on = !!touch[name] || (name === "gas" && touch.stickyGas);
      btn.classList.toggle("is-down", on);
    });
  }

  function bindInput() {
    canvas.tabIndex = 0;
    window.addEventListener("keydown", (e) => {
      rememberKey(e, true);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code) || e.key === " ") {
        e.preventDefault();
      }
      if (e.code === "KeyM" || e.key === "m" || e.key === "M") toggleMute();
      if ((e.code === "KeyR" || e.key === "r" || e.key === "R") && game.state === "finish") startRace();
      if ((e.code === "Enter" || e.code === "Space" || e.key === "Enter") && (game.state === "menu" || game.state === "finish")) {
        if (game.state === "menu") startRace();
      }
    });
    window.addEventListener("keyup", (e) => rememberKey(e, false));
    const layer = $("touch");
    const setBtn = (name, down) => {
      touch[name] = down;
      if (name === "gas" && down) touch.stickyGas = true;
      if (name === "brake" && down) touch.stickyGas = false;
      paintTouch();
    };
    const bindBtn = (btn) => {
      const name = btn.getAttribute("data-touch");
      btn.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        btn.setPointerCapture(ev.pointerId);
        setBtn(name, true);
      });
      btn.addEventListener("pointerup", (ev) => {
        ev.preventDefault();
        setBtn(name, false);
      });
      btn.addEventListener("pointercancel", () => setBtn(name, false));
    };
    layer.querySelectorAll("button").forEach(bindBtn);
    layer.hidden = false;
  }

  function playerControls() {
    const up = held(["ArrowUp", "KeyW", "w", "W"]) || touch.gas || touch.stickyGas;
    const down = held(["ArrowDown", "KeyS", "s", "S", "Space", " "]) || touch.brake;
    const left = held(["ArrowLeft", "KeyA", "a", "A"]) || touch.left;
    const right = held(["ArrowRight", "KeyD", "d", "D"]) || touch.right;
    return {
      throttle: down ? 0 : up ? 1 : 0.58,
      brake: down ? 1 : 0,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
    };
  }

  /* ---------- particles ---------- */
  const particles = [];
  function spark(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 120;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.35,
        color,
        r: 1.5 + Math.random() * 2,
      });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  /* ---------- game ---------- */
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const track = buildTrack();
  const trackBmp = paintTrack(track);

  const game = {
    state: "menu",
    cars: [],
    player: null,
    now: 0,
    raceStart: 0,
    countdown: 0,
    shake: 0,
    camX: track.worldW / 2,
    camY: track.worldH / 2,
    camScale: 0.42,
    lang: localStorage.getItem(STORAGE_LANG) === "en" ? "en" : "he",
    best: loadBest(),
    lastTs: 0,
    newRecord: false,
  };

  function t(key) {
    const pack = I18N[game.lang];
    return pack[key];
  }

  function applyLang() {
    const pack = I18N[game.lang];
    document.documentElement.lang = pack.lang;
    document.documentElement.dir = pack.dir;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      const val = pack[k];
      if (typeof val === "string") el.textContent = val;
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const k = el.getAttribute("data-i18n-title");
      el.title = pack[k];
    });
    $("btn-lang").textContent = pack.langBtn;
    $("btn-mute").textContent = audio.muted ? "🔇" : "♪";
    updateRecordLabel();
  }

  function updateRecordLabel() {
    $("menu-record").textContent = game.best ? t("record_line")(formatTime(game.best)) : t("no_record");
    $("best-value").textContent = game.best ? formatTime(game.best) : "--:--.-";
  }

  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnCars() {
    game.cars = CAR_DEFS.map((def, i) => new Car(def, track, i));
    game.player = game.cars[0];
  }

  function setOverlay(mode) {
    const overlay = $("overlay");
    const start = $("panel-start");
    const finish = $("panel-finish");
    if (mode === "hidden") {
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    start.hidden = mode !== "start";
    finish.hidden = mode !== "finish";
  }

  function showHud(on) {
    $("hud").hidden = !on;
    $("standings").hidden = !on;
  }

  function startRace() {
    audio.resume();
    spawnCars();
    particles.length = 0;
    game.state = "countdown";
    game.countdown = 3.2;
    game.now = 0;
    game.raceStart = 0;
    game.shake = 0;
    game.newRecord = false;
    touch.stickyGas = false;
    touch.gas = false;
    keys.clear();
    game.cars.forEach((c) => {
      c.lapStart = 0;
    });
    setOverlay("hidden");
    showHud(true);
    $("countdown").hidden = false;
    audio.beep(392, 0.18);
  }

  function beginRacing() {
    game.state = "race";
    game.raceStart = game.lastTs || performance.now();
    game.now = 0;
    game.cars.forEach((c) => {
      c.lapStart = game.raceStart;
      c.speed = 110;
    });
    touch.stickyGas = false;
    $("countdown").hidden = true;
    canvas.focus({ preventScroll: true });
    audio.beep(784, 0.28);
  }

  function raceTotal(player) {
    if (player.finishTime != null && game.raceStart) return player.finishTime - game.raceStart;
    return game.now;
  }

  function refreshFinishPanel() {
    const p = game.player;
    const total = raceTotal(p);
    const place = standingIndex(p) + 1;
    const pack = I18N[game.lang];
    $("finish-title").textContent = place === 1 ? pack.win : pack.place(place);
    $("finish-lead").textContent = place === 1 ? pack.finish_lead_win : pack.finish_lead_ok;
    $("finish-time").textContent = formatTime(total);
    $("finish-lap").textContent = formatTime(p.bestLap);
    $("finish-best").textContent = formatTime(game.best);
    $("finish-record").hidden = !game.newRecord;
    updateRecordLabel();
  }

  function finishRace() {
    game.state = "finish";
    audio.engineLevel(0, false);
    audio.finish();
    const p = game.player;
    const total = raceTotal(p);
    if (!game.best || total < game.best) {
      saveBest(total);
      game.best = total;
      game.newRecord = true;
    }
    refreshFinishPanel();
    setOverlay("finish");
    $("countdown").hidden = true;
  }

  function standingIndex(car) {
    const ranked = [...game.cars].sort((a, b) => {
      const ta = a.finished ? 1e9 + (1e8 - (a.finishTime || 0)) : a.total;
      const tb = b.finished ? 1e9 + (1e8 - (b.finishTime || 0)) : b.total;
      return tb - ta;
    });
    return ranked.indexOf(car);
  }

  function rankedCars() {
    return [...game.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.total - a.total;
    });
  }

  function names() {
    return game.lang === "he"
      ? { player: "אתה", razer: "רייזר", volt: "וולט", nyx: "ניקס" }
      : { player: "You", razer: "Razer", volt: "Volt", nyx: "Nyx" };
  }

  function updateHud() {
    if (game.state !== "race" && game.state !== "countdown") return;
    const p = game.player;
    const place = standingIndex(p) + 1;
    $("pos-value").textContent = String(place);
    $("lap-value").textContent = Math.min(p.laps + 1, LAPS) + " / " + LAPS;
    const elapsed = game.state === "race" ? game.now : 0;
    $("time-value").textContent = formatTime(elapsed);
    $("speed-value").textContent = String(Math.max(0, Math.round(p.speed * 0.62)));
    $("best-value").textContent = game.best ? formatTime(game.best) : "--:--.-";
    const nm = names();
    const list = $("standings-list");
    list.innerHTML = "";
    rankedCars().forEach((c, i) => {
      const li = document.createElement("li");
      const left = document.createElement("span");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = c.color;
      left.appendChild(dot);
      left.appendChild(document.createTextNode(i + 1 + ". " + nm[c.def.id]));
      const right = document.createElement("span");
      right.textContent = c.finished ? formatTime(c.finishTime - game.raceStart) : "L" + Math.min(c.laps + 1, LAPS);
      li.appendChild(left);
      li.appendChild(right);
      list.appendChild(li);
    });
  }

  function toggleMute() {
    audio.ensure();
    audio.setMuted(!audio.muted);
    $("btn-mute").textContent = audio.muted ? "🔇" : "♪";
  }

  function onPlayerCrash(impact) {
    game.shake = Math.min(18, 6 + impact * 0.02);
    audio.crash();
    spark(game.player.x, game.player.y, "#f8fafc", 14);
  }

  function overviewScale() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return Math.min(w / track.worldW, h / track.worldH) * 0.92;
  }

  function updateCamera(dt) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const menu = game.state === "menu";
    const targetScale = menu ? overviewScale() : 1.05;
    game.camScale = lerp(game.camScale, targetScale, 1 - Math.pow(0.001, dt));
    let tx;
    let ty;
    if (menu) {
      tx = track.worldW / 2;
      ty = track.worldH / 2;
    } else {
      const p = game.player;
      const look = 70;
      tx = p.x + Math.cos(p.angle) * look;
      ty = p.y + Math.sin(p.angle) * look;
    }
    const follow = menu ? 3 : 8;
    game.camX = lerp(game.camX, tx, 1 - Math.pow(0.02, dt * follow));
    game.camY = lerp(game.camY, ty, 1 - Math.pow(0.02, dt * follow));
    game._viewW = w;
    game._viewH = h;
  }

  function drawMinimap() {
    const w = 148;
    const h = 100;
    const x = window.innerWidth - w - 16;
    const y = window.innerHeight - h - ( $("touch").hidden ? 16 : 100);
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "rgba(7,11,20,0.75)";
    ctx.strokeStyle = "rgba(34,211,238,0.4)";
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();
    const sx = (w - 16) / track.worldW;
    const sy = (h - 16) / track.worldH;
    const s = Math.min(sx, sy);
    const ox = x + (w - track.worldW * s) / 2;
    const oy = y + (h - track.worldH * s) / 2;
    ctx.beginPath();
    ctx.moveTo(ox + track.pts[0].x * s, oy + track.pts[0].y * s);
    for (let i = 1; i < track.n; i++) ctx.lineTo(ox + track.pts[i].x * s, oy + track.pts[i].y * s);
    ctx.closePath();
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 3;
    ctx.stroke();
    for (const c of game.cars) {
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(ox + c.x * s, oy + c.y * s, c.isPlayer ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    const sx = game.shake ? (Math.random() - 0.5) * game.shake : 0;
    const sy = game.shake ? (Math.random() - 0.5) * game.shake : 0;
    ctx.translate(w / 2 + sx, h / 2 + sy);
    ctx.scale(game.camScale, game.camScale);
    ctx.translate(-game.camX, -game.camY);
    ctx.drawImage(trackBmp, 0, 0);
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const c of game.cars) c.draw(ctx);
    ctx.restore();
    if (game.state === "race" || game.state === "countdown") drawMinimap();
  }

  function tick(ts) {
    const dt = Math.min(MAX_DT, (ts - (game.lastTs || ts)) / 1000);
    game.lastTs = ts;
    updateCamera(dt);
    if (game.state === "countdown") {
      game.countdown -= dt;
      const n = Math.ceil(game.countdown);
      const label = n <= 0 ? t("go") : String(n);
      const el = $("countdown");
      if (el.textContent !== label) {
        el.textContent = label;
        if (n > 0) audio.beep(440, 0.12);
      }
      if (game.countdown <= 0) beginRacing();
    } else if (game.state === "race") {
      game.now = ts - game.raceStart;
      const ctl = playerControls();
      game.player.throttle = ctl.throttle;
      game.player.brake = ctl.brake;
      game.player.steer = ctl.steer;
      const playerLead = game.player.total;
      for (const c of game.cars) {
        if (!c.isPlayer) c.driveAI(track, playerLead);
        c.physics(dt, track, onPlayerCrash);
        if (c.onGrass && c.speed > 60 && Math.random() < 0.4) spark(c.x, c.y, "#84cc16", 1);
        c.updateProgress(track, ts);
      }
      resolveCarHits(game.cars);
      audio.engineLevel(Math.abs(game.player.speed), true);
      if (game.player.finished) finishRace();
    } else {
      audio.engineLevel(0, false);
    }
    if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 28);
    updateParticles(dt);
    updateHud();
    render();
    requestAnimationFrame(tick);
  }

  function boot() {
    spawnCars();
    fitCanvas();
    applyLang();
    bindInput();
    showHud(false);
    setOverlay("start");
    $("btn-start").addEventListener("click", (e) => {
      e.currentTarget.blur();
      startRace();
    });
    $("btn-retry").addEventListener("click", startRace);
    $("btn-menu").addEventListener("click", () => {
      game.state = "menu";
      showHud(false);
      setOverlay("start");
      $("countdown").hidden = true;
      spawnCars();
    });
    $("btn-lang").addEventListener("click", () => {
      game.lang = game.lang === "he" ? "en" : "he";
      localStorage.setItem(STORAGE_LANG, game.lang);
      applyLang();
      if (game.state === "finish" && game.player && game.player.finished) refreshFinishPanel();
    });
    $("btn-mute").addEventListener("click", () => {
      audio.resume();
      toggleMute();
    });
    window.addEventListener("resize", fitCanvas);
    window.NeonRacer = {
      state: () => game.state,
      snapshot: () => ({
        state: game.state,
        speed: game.player ? game.player.speed : 0,
        x: game.player ? game.player.x : 0,
        y: game.player ? game.player.y : 0,
        laps: game.player ? game.player.laps : 0,
        grass: game.player ? game.player.onGrass : false,
        time: game.now,
      }),
    };
    requestAnimationFrame(tick);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
