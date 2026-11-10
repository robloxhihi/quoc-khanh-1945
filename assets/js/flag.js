/* ═══════════════════════════════════════════════════════════
   flag.js — cờ đỏ sao vàng tung bay, dựng bằng mesh lát dọc.
   Nguồn cờ vẽ một lần vào canvas ẩn; mỗi khung chỉ dịch/tô bóng.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;

  function starPath(ctx, cx, cy, R, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rad = i % 2 === 0 ? R : r;
      var a = -Math.PI / 2 + (i * Math.PI) / 5;
      var x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function buildSource() {
    var W = 720, H = 480;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var x = c.getContext('2d');

    // nền đỏ có chiều sâu
    var g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#F02A2E');
    g.addColorStop(0.42, '#DA251D');
    g.addColorStop(1, '#A8101A');
    x.fillStyle = g; x.fillRect(0, 0, W, H);

    // vân vải
    x.globalAlpha = 0.05;
    for (var i = 0; i < 260; i++) {
      x.strokeStyle = i % 2 ? '#000' : '#fff';
      x.lineWidth = Math.random() * 1.6 + 0.3;
      x.beginPath();
      var y = Math.random() * H;
      x.moveTo(0, y); x.lineTo(W, y + (Math.random() * 8 - 4));
      x.stroke();
    }
    x.globalAlpha = 1;

    // sao vàng
    var R = H * 0.255, cx = W / 2, cy = H / 2;
    x.save();
    x.shadowColor = 'rgba(255,205,0,.55)'; x.shadowBlur = 34;
    var sg = x.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    sg.addColorStop(0, '#FFF0A8');
    sg.addColorStop(0.45, '#FFCD00');
    sg.addColorStop(1, '#E5A800');
    x.fillStyle = sg;
    starPath(x, cx, cy, R, R * 0.382);
    x.fill();
    x.restore();

    // viền sao cho nét
    x.strokeStyle = 'rgba(120,70,0,.28)'; x.lineWidth = 1.6;
    starPath(x, cx, cy, R, R * 0.382); x.stroke();

    // tối dần phía cán cờ
    var hg = x.createLinearGradient(0, 0, W * 0.16, 0);
    hg.addColorStop(0, 'rgba(40,0,6,.42)');
    hg.addColorStop(1, 'rgba(40,0,6,0)');
    x.fillStyle = hg; x.fillRect(0, 0, W * 0.16, H);

    return c;
  }

  function WavingFlag(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.src = buildSource();
    this.w = 0; this.h = 0; this.dpr = 1;
    this.wind = 1;
    this.resize();
  }

  WavingFlag.prototype.resize = function () {
    var rect = this.cv.getBoundingClientRect();
    var cw = Math.max(120, rect.width || this.cv.clientWidth || 420);
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = cw; this.h = cw * 2 / 3;
    this.cv.width = Math.round(this.w * dpr);
    this.cv.height = Math.round(this.h * dpr);
    this.cv.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  WavingFlag.prototype.tick = function (t) {
    if (!this.w) return;
    var ctx = this.ctx, w = this.w, h = this.h, src = this.src;
    var sw = src.width, sh = src.height;
    ctx.clearRect(0, 0, w, h);

    var N = Math.max(46, Math.min(104, Math.round(w / 5.5)));
    var slice = w / N;
    var amp = h * 0.062 * this.wind;
    var speed = 2.35;
    var i, u, phase, grow, dy, sy, dx, light, top;

    for (i = 0; i < N; i++) {
      u = i / N;
      phase = u * Math.PI * 3.15 - t * speed;
      grow = Math.pow(u, 1.22);
      dy = Math.sin(phase) * amp * grow + Math.sin(phase * 0.52 + 1.1) * amp * 0.42 * grow;
      sy = 1 + Math.cos(phase) * 0.058 * grow;
      dx = -Math.cos(phase) * amp * 0.3 * grow;
      top = dy + (h - h * sy) / 2;

      ctx.drawImage(src, u * sw, 0, sw / N + 1.4, sh,
        i * slice + dx, top, slice + 1.25, h * sy);

      light = Math.cos(phase + 0.55);
      if (light > 0) ctx.fillStyle = 'rgba(255,226,178,' + (light * 0.17 * grow + 0.015).toFixed(4) + ')';
      else ctx.fillStyle = 'rgba(26,0,12,' + (-light * 0.36 * grow).toFixed(4) + ')';
      ctx.fillRect(i * slice + dx, top, slice + 1.25, h * sy);
    }

    // bóng mép dưới cho cờ dày mình
    var bg = ctx.createLinearGradient(0, h * 0.72, 0, h);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,.16)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
  };

  global.WavingFlag = WavingFlag;
})(window);