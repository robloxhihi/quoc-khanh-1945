/* ═══════════════════════════════════════════════════════════
   fx.js — một canvas duy nhất: sao trời, tàn lửa, pháo hoa.
   Không thư viện. Object pool + swap-remove. DPR chặn ở 2.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var COLORS = [
    [255, 201, 60],   // vàng sao
    [224, 27, 36],    // đỏ cờ
    [255, 61, 154],   // hồng cánh sen
    [53, 167, 255],   // azure
    [23, 201, 160],   // jade
    [255, 138, 61],   // hổ phách
    [150, 100, 255],  // tím
    [255, 246, 224]   // trắng nóng
  ];
  var MAX_SPARKS = 3400;
  var MAX_ROCKETS = 26;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function FX(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.w = 0; this.h = 0; this.dpr = 1;
    this.sparks = []; this.rockets = []; this.embers = []; this.stars = [];
    this.density = 0.7;
    this.mode = 'ambient';        // ambient | finale | off
    this.enabled = true;
    this.reduced = false;
    this.t = 0;
    this.spawnAcc = 0;
    this.emberAcc = 0;
    this.finaleAcc = 0;
    this.shake = 0;
    this.onBurst = null;          // (x, y, power, color) -> sound
    this.onLaunch = null;
    this._pool = [];
    this.resize();
  }

  FX.prototype.resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = global.innerWidth, h = global.innerHeight;
    if (w < 700) dpr = Math.min(dpr, 1.6);
    this.dpr = dpr; this.w = w; this.h = h;
    // màn nhỏ giữ mật độ nổ vừa đủ để chữ không bị chìm
    this.areaK = Math.max(0.32, Math.min(1, (w * h) / (1440 * 900)));
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seedStars();
  };

  FX.prototype.seedStars = function () {
    this.stars.length = 0;
    var n = Math.round((this.w * this.h) / 16000);
    n = Math.max(40, Math.min(190, n));
    for (var i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h * 0.78,
        r: rnd(0.35, 1.5),
        p: Math.random() * TAU,
        s: rnd(0.5, 1.9),
        c: Math.random() < 0.22 ? pick([COLORS[3], COLORS[4], COLORS[0]]) : COLORS[7]
      });
    }
  };

  FX.prototype.setDensity = function (v) { this.density = Math.max(0, Math.min(1, v)); };
  FX.prototype.setMode = function (m) {
    this.mode = m;
    if (m === 'off') { this.rockets.length = 0; }
  };
  FX.prototype.setEnabled = function (v) {
    this.enabled = !!v;
    if (!v) { this.sparks.length = 0; this.rockets.length = 0; this.embers.length = 0; this.ctx.clearRect(0, 0, this.w, this.h); }
  };

  FX.prototype._get = function () {
    return this._pool.pop() || {};
  };
  FX.prototype._put = function (p) { if (this._pool.length < 3000) this._pool.push(p); };

  /* ── phóng một quả pháo từ đáy lên ── */
  FX.prototype.launch = function (x, targetY, opts) {
    if (!this.enabled || this.reduced) return;
    if (this.rockets.length >= MAX_ROCKETS) return;
    opts = opts || {};
    var w = this.w, h = this.h;
    if (x == null) x = rnd(w * 0.08, w * 0.92);
    if (targetY == null) targetY = rnd(h * 0.12, h * 0.46);
    var flight = rnd(0.85, 1.35);
    var vy = -(h - targetY) / flight;
    this.rockets.push({
      x: x, y: h + 8,
      vx: rnd(-26, 26) + (opts.vx || 0),
      vy: vy,
      ty: targetY,
      life: flight + 0.35,
      age: 0,
      c: opts.color || pick(COLORS),
      type: opts.type || pick(['peony', 'peony', 'chrys', 'willow', 'ring', 'palm', 'crackle', 'double', 'strobe']),
      power: opts.power || rnd(0.75, 1.25),
      trail: 0
    });
    if (this.onLaunch) this.onLaunch(x / w);
  };

  /* ── nổ tại chỗ (bấm vào trời, hoặc slam chữ) ── */
  FX.prototype.burst = function (x, y, opts) {
    if (!this.enabled || this.reduced) return;
    opts = opts || {};
    var type = opts.type || 'peony';
    var power = opts.power || 1;
    var c = opts.color || pick(COLORS);
    this._explode(x, y, type, power, c, opts);
    if (this.onBurst) this.onBurst(x, y, power, c);
    this.shake = Math.min(9, this.shake + power * 2.6);
  };

  FX.prototype.volley = function (n, opts) {
    n = Math.max(1, Math.round(n * (this.areaK || 1)));
    for (var i = 0; i < n; i++) {
      var self = this;
      (function (k) {
        global.setTimeout(function () { self.launch(null, null, opts); }, k * rnd(90, 260));
      })(i);
    }
  };

  FX.prototype._spark = function (x, y, vx, vy, c, life, size, kind, drag, grav) {
    if (this.sparks.length >= MAX_SPARKS) return;
    var p = this._get();
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.c = c; p.life = life; p.max = life; p.size = size;
    p.kind = kind || 0;      // 0 dot, 1 trail, 2 crackle, 3 strobe
    p.drag = drag == null ? 0.982 : drag;
    p.grav = grav == null ? 108 : grav;
    p.px = x; p.py = y;
    p.seed = Math.random() * TAU;
    p.split = false;
    this.sparks.push(p);
  };

  FX.prototype._explode = function (x, y, type, power, c, opts) {
    var base = Math.round((type === 'palm' ? 52 : type === 'ring' ? 88 : 128) * power * (0.6 + this.density * 1.0));
    base = Math.min(base, 260);
    base = Math.max(26, Math.round(base * (this.areaK || 1)));
    var speed = rnd(140, 250) * power * (0.7 + this.density * 0.5);
    var i, a, s, c2;

    if (type === 'ring') {
      var tilt = rnd(0.28, 0.62), rot = rnd(0, TAU);
      for (i = 0; i < base; i++) {
        a = (i / base) * TAU;
        var rx = Math.cos(a) * speed, ry = Math.sin(a) * speed * tilt;
        var fx = rx * Math.cos(rot) - ry * Math.sin(rot);
        var fy = rx * Math.sin(rot) + ry * Math.cos(rot);
        this._spark(x, y, fx, fy, c, rnd(1.0, 1.5), rnd(1.5, 2.6), 1, 0.986, 74);
      }
    } else if (type === 'willow') {
      for (i = 0; i < base; i++) {
        a = Math.random() * TAU; s = speed * rnd(0.32, 0.86);
        this._spark(x, y, Math.cos(a) * s, Math.sin(a) * s - 18, COLORS[0], rnd(2.1, 3.0), rnd(1.4, 2.4), 1, 0.991, 126);
      }
    } else if (type === 'palm') {
      for (i = 0; i < base; i++) {
        a = Math.random() * TAU; s = speed * rnd(0.5, 1.05);
        this._spark(x, y, Math.cos(a) * s, Math.sin(a) * s, c, rnd(1.3, 1.9), rnd(2.6, 4.2), 1, 0.988, 96);
      }
    } else if (type === 'double') {
      c2 = pick(COLORS);
      for (i = 0; i < base; i++) {
        a = Math.random() * TAU;
        var inner = i % 2 === 0;
        s = speed * (inner ? rnd(0.24, 0.5) : rnd(0.72, 1.1));
        this._spark(x, y, Math.cos(a) * s, Math.sin(a) * s, inner ? c2 : c, rnd(1.0, 1.7), rnd(1.4, 2.5), 1, 0.984, 104);
      }
    } else if (type === 'crackle') {
      for (i = 0; i < base; i++) {
        a = Math.random() * TAU; s = speed * rnd(0.4, 1);
        this._spark(x, y, Math.cos(a) * s, Math.sin(a) * s, c, rnd(0.85, 1.35), rnd(1.4, 2.4), 2, 0.983, 112);
      }
    } else if (type === 'strobe') {
      for (i = 0; i < base; i++) {
        a = Math.random() * TAU; s = speed * rnd(0.35, 0.95);
        this._spark(x, y, Math.cos(a) * s, Math.sin(a) * s, i % 3 === 0 ? COLORS[7] : c, rnd(1.4, 2.1), rnd(1.6, 2.8), 3, 0.987, 92);
      }
    } else { // peony / chrys
      for (i = 0; i < base; i++) {
        a = Math.random() * TAU;
        s = speed * (type === 'chrys' ? rnd(0.55, 1.05) : Math.pow(Math.random(), 0.42));
        this._spark(x, y, Math.cos(a) * s, Math.sin(a) * s, Math.random() < 0.14 ? COLORS[7] : c,
          rnd(1.0, 1.75), rnd(1.4, 2.7), type === 'chrys' ? 1 : 0, 0.982, 108);
      }
    }
    // lõi sáng
    for (i = 0; i < 12; i++) {
      a = Math.random() * TAU; s = rnd(8, 60);
      this._spark(x, y, Math.cos(a) * s, Math.sin(a) * s, COLORS[7], rnd(0.2, 0.42), rnd(2.4, 4.6), 0, 0.94, 30);
    }
  };

  FX.prototype._ember = function () {
    var warm = [COLORS[0], COLORS[5], COLORS[1], COLORS[7]];
    this.embers.push({
      x: Math.random() * this.w,
      y: this.h + rnd(4, 60),
      vx: rnd(-13, 13),
      vy: rnd(-30, -12),
      r: rnd(0.6, 2.1),
      life: rnd(5, 11), max: 11,
      p: Math.random() * TAU,
      c: pick(warm)
    });
  };

  FX.prototype.tick = function (dt) {
    if (!this.enabled) return;
    var ctx = this.ctx, w = this.w, h = this.h, i, p;
    this.t += dt;
    dt = Math.min(dt, 0.05);

    /* tự bắn theo chế độ */
    if (!this.reduced && this.density > 0.02) {
      if (this.mode === 'finale') {
        this.finaleAcc += dt * (1.7 + this.density * 7.2) * (this.areaK || 1);
        while (this.finaleAcc >= 1) {
          this.finaleAcc -= 1;
          this.launch(null, null, { power: rnd(0.8, 1.45) });
          if (Math.random() < 0.24 * this.density) this.launch(null, null, { power: rnd(0.6, 1.0) });
        }
      } else if (this.mode === 'ambient') {
        this.spawnAcc += dt * (0.035 + this.density * 0.13);
        while (this.spawnAcc >= 1) { this.spawnAcc -= 1; this.launch(null, rnd(h * 0.1, h * 0.3), { power: rnd(0.4, 0.7) }); }
      }
      this.emberAcc += dt * (5 + this.density * 22);
      while (this.emberAcc >= 1) {
        this.emberAcc -= 1;
        if (this.embers.length < 190) this._ember();
      }
    }

    /* xoá mờ để tạo vệt */
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,' + (this.mode === 'finale' ? 0.14 : 0.24) + ')';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    /* sao trời */
    if (this.mode !== 'off') {
      for (i = 0; i < this.stars.length; i++) {
        var st = this.stars[i];
        var tw = 0.34 + 0.66 * Math.abs(Math.sin(this.t * st.s + st.p));
        ctx.fillStyle = rgba(st.c, tw * 0.5 * (0.3 + this.density * 0.7));
        ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, TAU); ctx.fill();
      }
    }

    /* tàn lửa bay lên */
    for (i = this.embers.length - 1; i >= 0; i--) {
      p = this.embers[i];
      p.life -= dt;
      if (p.life <= 0 || p.y < -20) { this.embers.splice(i, 1); continue; }
      p.x += (p.vx + Math.sin(this.t * 0.8 + p.p) * 13) * dt;
      p.y += p.vy * dt;
      var la = Math.min(1, p.life / 2.2) * 0.5;
      ctx.fillStyle = rgba(p.c, la);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }

    /* tên lửa */
    for (i = this.rockets.length - 1; i >= 0; i--) {
      var r = this.rockets[i];
      r.age += dt;
      r.vy += 168 * dt;
      r.x += r.vx * dt; r.y += r.vy * dt;
      r.trail += dt;
      if (r.trail > 0.012) {
        r.trail = 0;
        this._spark(r.x + rnd(-1.4, 1.4), r.y, rnd(-13, 13), rnd(16, 52), Math.random() < 0.4 ? COLORS[7] : COLORS[5], rnd(0.24, 0.5), rnd(1, 2), 0, 0.95, 26);
      }
      ctx.fillStyle = rgba(COLORS[7], 0.9);
      ctx.beginPath(); ctx.arc(r.x, r.y, 2.1, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(r.c, 0.34);
      ctx.beginPath(); ctx.arc(r.x, r.y, 5.4, 0, TAU); ctx.fill();

      if (r.y <= r.ty || r.vy >= -34 || r.age > r.life) {
        this.rockets.splice(i, 1);
        this._explode(r.x, r.y, r.type, r.power, r.c, {});
        this.shake = Math.min(10, this.shake + r.power * 2.1);
        if (this.onBurst) this.onBurst(r.x, r.y, r.power, r.c);
      }
    }

    /* tia pháo */
    for (i = this.sparks.length - 1; i >= 0; i--) {
      p = this.sparks[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.kind === 2 && !p.split && Math.random() < 0.5) {
          p.split = true;
          for (var k = 0; k < 5; k++) {
            var aa = Math.random() * TAU, ss = rnd(24, 88);
            this._spark(p.x, p.y, Math.cos(aa) * ss, Math.sin(aa) * ss, COLORS[7], rnd(0.14, 0.34), rnd(0.8, 1.5), 0, 0.93, 60);
          }
          if (this.onCrackle) this.onCrackle();
        }
        this.sparks[i] = this.sparks[this.sparks.length - 1];
        this.sparks.pop(); this._put(p);
        continue;
      }
      p.px = p.x; p.py = p.y;
      var d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;

      var lf = p.life / p.max;
      var alpha = lf > 0.72 ? 1 : lf / 0.72;
      if (p.kind === 3) alpha *= (Math.sin(this.t * 42 + p.seed) > -0.15 ? 1 : 0.12);
      alpha *= 0.92;

      if (p.kind === 1 || p.size > 2.6) {
        ctx.strokeStyle = rgba(p.c, alpha * 0.72);
        ctx.lineWidth = p.size * (0.4 + lf * 0.6);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      ctx.fillStyle = rgba(p.c, alpha);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.34 + lf * 0.66), 0, TAU); ctx.fill();
      if (lf > 0.6 && p.size > 1.8) {
        ctx.fillStyle = rgba(p.c, alpha * 0.13);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3.4, 0, TAU); ctx.fill();
      }
    }

    this.shake *= Math.pow(0.0016, dt);
    if (this.shake < 0.05) this.shake = 0;
  };

  FX.prototype.clear = function () {
    this.sparks.length = 0; this.rockets.length = 0; this.embers.length = 0;
    this.shake = 0;
    this.ctx.clearRect(0, 0, this.w, this.h);
  };

  global.FX = FX;
  global.FX_COLORS = COLORS;
})(window);