/* ═══════════════════════════════════════════════════════════
   audio.js — hai track nhạc (score CC BY 4.0 + hành khúc
   Quốc tế ca PD) crossfade theo cảnh, cùng hiệu ứng dựng
   bằng Web Audio: tiếng phóng, tiếng nổ, lép bép, chuông,
   gió nền, va chạm chữ. Mọi âm thanh gắn với thứ nhìn thấy.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function AudioEngine(musicEl, marchEl) {
    this.music = musicEl;
    this.march = marchEl || null;
    this.marchOn = false;
    this.marchVol = 0;
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.started = false;
    this.baseVol = 0.82;
    this.duck = 1;
    this.curVol = 0;
    this.sfxLevel = 0.9;
    this._lastBoom = 0;
    this._lastCrackle = 0;
    this._wind = null;
    this.noise = null;
    /* chống đua tranh seek/play: play() khi seek đang chờ sẽ huỷ seek */
    this._scoreSeeking = false; this._scorePending = false; this._scoreSeekTimer = 0;
    this._marchSeeking = false; this._marchPending = false; this._marchSeekTimer = 0;
    var self = this;
    if (musicEl) musicEl.addEventListener('seeked', function () { self._scoreSeeking = false; });
    if (marchEl) marchEl.addEventListener('seeked', function () { self._marchSeeking = false; });
  }

  AudioEngine.prototype.init = function () {
    if (this.ready) return true;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); } catch (e) { return false; }
    var ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxLevel;
    this.sfx.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // vọng âm dựng sẵn
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(2.4, 2.6);
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.34;
    this.verb.connect(this.verbGain);
    this.verbGain.connect(this.comp);

    this.noise = this._noiseBuffer(2.2);
    this.ready = true;
    return true;
  };

  AudioEngine.prototype._noiseBuffer = function (secs) {
    var ctx = this.ctx, len = Math.floor(ctx.sampleRate * secs);
    var b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };

  AudioEngine.prototype._impulse = function (secs, decay) {
    var ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * secs);
    var b = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return b;
  };

  AudioEngine.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} }
  };

  AudioEngine.prototype.startMusic = function (offset) {
    this.started = true;
    this.resume();
    var m = this.music;
    if (!m) return;
    var self = this;
    try {
      if (offset != null && isFinite(offset)) {
        if (Math.abs(m.currentTime - offset) > 0.05) {
          this._scoreSeeking = true;
          clearTimeout(this._scoreSeekTimer);
          this._scoreSeekTimer = setTimeout(function () { self._scoreSeeking = false; }, 2000);
        }
        m.currentTime = offset;
      }
      m.volume = 0;
      this.curVol = 0;
      this._scorePending = false;
      /* tick sẽ play sau khi seek xong — không play() trực tiếp ở đây */
    } catch (e) { this._scoreSeeking = false; }
  };

  AudioEngine.prototype.pauseMusic = function () {
    if (this.music) { try { this.music.pause(); } catch (e) {} }
    if (this.march) { try { this.march.pause(); } catch (e) {} }
  };
  AudioEngine.prototype.resumeMusic = function () {
    if (!this.started) return;
    this.resume();
    var marchActive = this.marchOn && this.march;
    var el = marchActive ? this.march : this.music;
    var seeking = marchActive ? this._marchSeeking : this._scoreSeeking;
    if (el && !seeking) { try { var p = el.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
  };

  AudioEngine.prototype.setMuted = function (v) {
    this.muted = !!v;
    if (this.ready) {
      var t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    }
    if (this.music) this.music.muted = this.muted;
    if (this.march) this.march.muted = this.muted;
  };

  AudioEngine.prototype.setDuck = function (v) { this.duck = Math.max(0, Math.min(1, v)); };

  /* ── hành khúc giải phóng: crossfade với nhạc nền ──
     Bật ở cảnh Bác đọc Tuyên ngôn (4–6), tắt khi sang cảnh cờ. */
  AudioEngine.prototype.setMarch = function (on) {
    on = !!on;
    if (this.marchOn === on) return;
    this.marchOn = on;
    if (!this.march) return;
    if (on) {
      var self = this;
      try {
        if (this.march.currentTime > 0.05) {
          this._marchSeeking = true;
          clearTimeout(this._marchSeekTimer);
          this._marchSeekTimer = setTimeout(function () { self._marchSeeking = false; }, 2000);
        }
        this.march.currentTime = 0;
        this.march.volume = 0;
        this.marchVol = 0;
        /* không play() ở đây — tick sẽ play sau khi seek xong */
      } catch (e) { this._marchSeeking = false; }
    }
    /* tắt: tick sẽ fade marchVol về 0 rồi tự pause */
  };

  AudioEngine.prototype.seekScore = function (sec) {
    if (!this.music || !isFinite(sec)) return;
    var self = this;
    this._scoreSeeking = true;
    clearTimeout(this._scoreSeekTimer);
    this._scoreSeekTimer = setTimeout(function () { self._scoreSeeking = false; }, 2000);
    try { this.music.currentTime = sec; } catch (e) { this._scoreSeeking = false; }
  };

  AudioEngine.prototype.resetMarch = function () {
    this.marchOn = false;
    this.marchVol = 0;
    this._marchSeeking = false;
    clearTimeout(this._marchSeekTimer);
    if (this.march) { try { this.march.pause(); this.march.currentTime = 0; this.march.volume = 0; } catch (e) {} }
  };

  /* nội suy âm lượng hai track mỗi khung — crossfade mượt, không giật.
     Track nào chìm về 0 thì tự pause, track nào nổi lên thì tự play.
     play() chỉ gọi MỘT lần và không gọi khi seek đang chờ — tránh đua
     tranh khiến Chrome huỷ seek, nhảy về 0. */
  AudioEngine.prototype._autoPlay = function (el, seekingKey, pendingKey) {
    if (el.paused && !this[seekingKey] && !this[pendingKey]) {
      this[pendingKey] = true;
      var self = this, p = el.play();
      if (p && p.then) p.then(function () { self[pendingKey] = false; }, function () { self[pendingKey] = false; });
      else this[pendingKey] = false;
    }
  };

  AudioEngine.prototype.tick = function (dt) {
    var k = Math.min(1, dt * 5.5);
    if (this.music) {
      var st = (this.started && !this.marchOn && !this.muted) ? this.baseVol * this.duck : 0;
      this.curVol += (st - this.curVol) * k;
      if (Math.abs(this.curVol - st) < 0.002) this.curVol = st;
      try {
        this.music.volume = Math.max(0, Math.min(1, this.curVol));
        if (st > 0.02 && this.started) this._autoPlay(this.music, '_scoreSeeking', '_scorePending');
        else if (st === 0 && this.curVol < 0.02 && !this.music.paused) this.music.pause();
      } catch (e) {}
    }
    if (this.march) {
      var mt = (this.started && this.marchOn && !this.muted) ? this.baseVol * 0.98 : 0;
      this.marchVol += (mt - this.marchVol) * k;
      if (Math.abs(this.marchVol - mt) < 0.002) this.marchVol = mt;
      try {
        this.march.volume = Math.max(0, Math.min(1, this.marchVol));
        if (mt > 0.02 && this.started) this._autoPlay(this.march, '_marchSeeking', '_marchPending');
        else if (mt === 0 && this.marchVol < 0.02 && !this.march.paused) this.march.pause();
      } catch (e) {}
    }
  };

  AudioEngine.prototype._pan = function (node, x) {
    if (!this.ctx.createStereoPanner) return node;
    var p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, (x == null ? 0.5 : x) * 2 - 1)) * 0.72;
    node.connect(p);
    return p;
  };

  AudioEngine.prototype._env = function (gain, t, a, peak, d) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };

  /* ── tiếng pháo nổ ── */
  AudioEngine.prototype.boom = function (power, x) {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, t = ctx.currentTime;
    if (t - this._lastBoom < 0.05) return;
    this._lastBoom = t;
    power = Math.max(0.3, Math.min(1.6, power || 1));
    var out = this._pan(this.sfx, x == null ? 0.5 : x / (global.innerWidth || 1));

    // sub
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(118 * power, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.42);
    this._env(g, t, 0.006, 0.62 * power, 0.62);
    o.connect(g); g.connect(out); g.connect(this.verb);
    o.start(t); o.stop(t + 0.72);

    // thân nổ
    var n = ctx.createBufferSource(); n.buffer = this.noise;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1500, t);
    lp.frequency.exponentialRampToValueAtTime(190, t + 0.4);
    var ng = ctx.createGain();
    this._env(ng, t, 0.004, 0.4 * power, 0.44);
    n.connect(lp); lp.connect(ng); ng.connect(out); ng.connect(this.verb);
    n.start(t, Math.random() * 1.2); n.stop(t + 0.55);

    // tiếng vọng xa
    var n2 = ctx.createBufferSource(); n2.buffer = this.noise;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 0.7;
    var g2 = ctx.createGain();
    this._env(g2, t + 0.05, 0.03, 0.1 * power, 1.05);
    n2.connect(bp); bp.connect(g2); g2.connect(out); g2.connect(this.verb);
    n2.start(t + 0.05, Math.random()); n2.stop(t + 1.25);
  };

  /* ── tiếng phóng lên ── */
  AudioEngine.prototype.launch = function (x) {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var out = this._pan(this.sfx, x);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(1480, t + 0.85);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.16);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.92);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.95);

    var n = ctx.createBufferSource(); n.buffer = this.noise;
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
    var ng = ctx.createGain();
    this._env(ng, t, 0.12, 0.05, 0.8);
    n.connect(hp); hp.connect(ng); ng.connect(out);
    n.start(t, Math.random()); n.stop(t + 1);
  };

  /* ── lép bép ── */
  AudioEngine.prototype.crackle = function () {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, t = ctx.currentTime;
    if (t - this._lastCrackle < 0.09) return;
    this._lastCrackle = t;
    for (var i = 0; i < 7; i++) {
      var dt = Math.random() * 0.34;
      var n = ctx.createBufferSource(); n.buffer = this.noise;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2800 + Math.random() * 2600;
      var g = ctx.createGain();
      this._env(g, t + dt, 0.002, 0.055 + Math.random() * 0.05, 0.045);
      n.connect(hp); hp.connect(g); g.connect(this.sfx);
      n.start(t + dt, Math.random() * 1.5); n.stop(t + dt + 0.07);
    }
  };

  /* ── chuyển cảnh ── */
  AudioEngine.prototype.whoosh = function () {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var n = ctx.createBufferSource(); n.buffer = this.noise;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(280, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.34);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.78);
    var g = ctx.createGain();
    this._env(g, t, 0.14, 0.13, 0.62);
    n.connect(bp); bp.connect(g); g.connect(this.sfx); g.connect(this.verb);
    n.start(t, Math.random()); n.stop(t + 0.85);
  };

  /* ── chuông cho chữ hiện ── */
  AudioEngine.prototype.chime = function (freq, vol) {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, t = ctx.currentTime;
    freq = freq || 880;
    var g = ctx.createGain();
    this._env(g, t, 0.008, vol == null ? 0.075 : vol, 1.5);
    g.connect(this.sfx); g.connect(this.verb);
    [1, 2.01, 3.02].forEach(function (m, i) {
      var o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = freq * m;
      var og = ctx.createGain(); og.gain.value = i === 0 ? 1 : 0.24 / i;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + 1.6);
    }, this);
  };

  /* ── chữ đập vào (ĐỘC LẬP / TỰ DO / HẠNH PHÚC) ── */
  AudioEngine.prototype.slam = function () {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.55);
    this._env(g, t, 0.004, 0.85, 0.85);
    o.connect(g); g.connect(this.sfx); g.connect(this.verb);
    o.start(t); o.stop(t + 0.95);

    var n = ctx.createBufferSource(); n.buffer = this.noise;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    var ng = ctx.createGain();
    this._env(ng, t, 0.003, 0.34, 0.42);
    n.connect(lp); lp.connect(ng); ng.connect(this.sfx); ng.connect(this.verb);
    n.start(t, Math.random()); n.stop(t + 0.5);

    this.chime(1320, 0.06);
  };

  /* ── bấm nút ── */
  AudioEngine.prototype.click = function () {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1180, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.06);
    this._env(g, t, 0.002, 0.05, 0.07);
    o.connect(g); g.connect(this.sfx);
    o.start(t); o.stop(t + 0.1);
  };

  /* ── gió / không khí nền rất nhẹ cho cảnh tư liệu ── */
  AudioEngine.prototype.wind = function (on) {
    if (!this.ready) return;
    var ctx = this.ctx;
    if (on && !this._wind) {
      var n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.4;
      var g = ctx.createGain(); g.gain.value = 0;
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.09; lg.gain.value = 0.011;
      lfo.connect(lg); lg.connect(g.gain);
      n.connect(lp); lp.connect(g); g.connect(this.sfx);
      n.start(); lfo.start();
      g.gain.setTargetAtTime(0.02, ctx.currentTime, 1.4);
      this._wind = { n: n, g: g, lfo: lfo };
    } else if (!on && this._wind) {
      var w = this._wind, t = ctx.currentTime;
      w.g.gain.setTargetAtTime(0, t, 0.5);
      try { w.n.stop(t + 2.2); w.lfo.stop(t + 2.2); } catch (e) {}
      this._wind = null;
    }
  };

  AudioEngine.prototype.suspendAll = function () {
    this.pauseMusic();
    if (this.ctx && this.ctx.state === 'running') { try { this.ctx.suspend(); } catch (e) {} }
  };
  AudioEngine.prototype.resumeAll = function () {
    this.resume();
    if (this.started) this.resumeMusic();
  };

  global.AudioEngine = AudioEngine;
})(window);