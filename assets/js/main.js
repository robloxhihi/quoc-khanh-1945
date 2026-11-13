/* ═══════════════════════════════════════════════════════════
   main.js — trình chiếu chạm-để-chuyển-cảnh.
   Không nút điều khiển: chạm màn hình = sang cảnh, chạm ở cảnh
   cuối = chiếu lại. Một nút âm thanh duy nhất ở góc trên.
   Một vòng requestAnimationFrame duy nhất cho toàn bộ trang.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  /* march: cảnh Bác đọc Tuyên ngôn cử hành khúc giải phóng */
  var CFG = [
    { id: 's1', name: 'Mở màn',      dur: 9000,  fx: 'ambient', lvl: 0.40, duck: 0.94, wind: true,  step: 0 },
    { id: 's2', name: 'Bối cảnh',    dur: 10000, fx: 'ambient', lvl: 0.26, duck: 1.00, wind: true,  step: 0 },
    { id: 's3', name: 'Lễ đài',      dur: 10000, fx: 'ambient', lvl: 0.44, duck: 1.00, wind: false, step: 0 },
    { id: 's4', name: 'Hồ Chí Minh', dur: 10000, fx: 'ambient', lvl: 0.30, duck: 0.88, wind: false, step: 0, march: true },
    { id: 's5', name: 'Tuyên ngôn',  dur: 16000, fx: 'ambient', lvl: 0.10, duck: 0.32, wind: false, step: 145, march: true, kinetic: ['kinetic1'] },
    { id: 's6', name: 'Lời thề',     dur: 13000, fx: 'ambient', lvl: 0.20, duck: 0.48, wind: false, step: 100, march: true, kinetic: ['kinetic2', 'kinetic3'] },
    { id: 's7', name: 'Lá cờ',       dur: 10000, fx: 'ambient', lvl: 0.55, duck: 0.96, wind: false, step: 0, flag: true },
    { id: 's8', name: 'Pháo hoa',    dur: 17000, fx: 'finale',  lvl: 1.00, duck: 1.00, wind: false, step: 0, slam: true },
    { id: 's9', name: '81 năm',      dur: 0,     fx: 'ambient', lvl: 0.50, duck: 0.55, wind: false, step: 0, hold: true }
  ];

  var state = {
    started: false, idx: -1, inScene: 0,
    muted: false, hiddenPaused: false,
    timers: [], lastT: 0, raf: 0, advances: 0, lastTap: 0
  };

  var els = {};
  var fx, flag, audio, segs = [], scenes = [];
  var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── tiện ích ───────────────────────────────────────── */
  function later(fn, ms) { var t = global.setTimeout(fn, ms); state.timers.push(t); return t; }
  function clearTimers() { state.timers.forEach(global.clearTimeout); state.timers.length = 0; }

  /* ── tách chữ cho kinetic typography, giữ nguyên <mark> ── */
  function splitWords(root) {
    if (root.dataset.split === '1') return;
    var n = 0;
    function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (child) {
        if (child.nodeType === 3) {
          var parts = child.nodeValue.split(/(\s+)/);
          var frag = doc.createDocumentFragment();
          parts.forEach(function (tk) {
            if (!tk) return;
            if (/^\s+$/.test(tk)) { frag.appendChild(doc.createTextNode(' ')); return; }
            var s = doc.createElement('span');
            s.className = 'w';
            s.style.setProperty('--i', n++);
            s.textContent = tk;
            frag.appendChild(s);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          var before = n;
          walk(child);
          if (child.tagName === 'MARK' && n > before) child.style.setProperty('--mi', before);
        }
      });
    }
    walk(root);
    root.dataset.split = '1';
    root.dataset.words = String(n);
    return n;
  }

  /* ── vạch tiến độ 9 cảnh (chỉ hiển thị) ─────────────── */
  function buildProg() {
    els.progSegs.innerHTML = '';
    segs = [];
    CFG.forEach(function () {
      var i = doc.createElement('i');
      var b = doc.createElement('b');
      i.appendChild(b);
      els.progSegs.appendChild(i);
      segs.push({ el: i, fill: b });
    });
  }

  /* ── vào cảnh ───────────────────────────────────────── */
  function goTo(i) {
    i = Math.max(0, Math.min(CFG.length - 1, i));
    if (i === state.idx) return;
    clearTimers();

    var prev = state.idx;
    state.idx = i;
    state.inScene = 0;
    var c = CFG[i];

    scenes.forEach(function (sc, k) {
      sc.classList.toggle('active', k === i);
      sc.classList.toggle('leaving', k === prev && prev !== i);
      sc.setAttribute('aria-hidden', k === i ? 'false' : 'true');
    });
    if (prev >= 0 && prev !== i) {
      later(function () { scenes[prev].classList.remove('leaving'); }, 900);
    }

    $$('[data-kinetic]').forEach(function (q) { q.classList.remove('in'); });

    segs.forEach(function (s, k) {
      s.el.classList.toggle('current', k === i);
      s.el.classList.toggle('done', k < i);
      s.fill.style.transform = 'scaleX(' + (k < i ? 1 : 0) + ')';
    });

    els.nowIdx.textContent = ('0' + (i + 1)).slice(-2);
    els.nowName.textContent = c.name;
    els.tapHint.textContent = c.hold ? 'Chạm màn hình để xem lại từ đầu' : 'Chạm màn hình để tiếp tục';

    // hiệu ứng nền theo cảnh
    fx.setMode(c.fx);
    fx.setDensity(0.7 * c.lvl);
    if (c.fx === 'finale' && !reduced) fx.volley(i === 7 ? 5 : 3, { power: 1.2 });

    // nhạc: hành khúc giải phóng ở đoạn Tuyên ngôn, còn lại nhạc nền
    if (!c.march && prev >= 0 && CFG[prev].march && i >= 6) audio.seekScore(52);
    audio.setMarch(!!c.march);
    audio.setDuck(c.duck);
    audio.wind(c.wind && !state.muted);
    if (prev !== i) audio.whoosh();

    // chuyển cảnh có lớp quét màu
    if (prev !== i && !reduced) {
      els.wipe.classList.remove('go');
      void els.wipe.offsetWidth;
      els.wipe.classList.add('go');
    }

    // chữ lời Bác
    if (c.kinetic) {
      doc.documentElement.style.setProperty('--word-step', c.step + 'ms');
      c.kinetic.forEach(function (id) {
        var q = $('#' + id);
        if (!q) return;
        splitWords(q);
        var delay = parseInt(q.dataset.delay || '260', 10);
        later(function () {
          q.classList.add('in');
          $$('mark', q).forEach(function (m) {
            var mi = parseInt(m.style.getPropertyValue('--mi') || '0', 10);
            later(function () { audio.chime(660 + Math.random() * 620, 0.055); }, mi * c.step + 320);
          });
        }, delay);
      });
    }

    // cờ tung bay
    if (c.flag) later(function () { flag.resize(); }, 60);

    // pháo hoa + chữ đập
    if (c.slam) runSlam();

    // cảnh cuối: giữ, trời dịu lại, thỉnh thoảng một loạt pháo
    if (c.hold) {
      later(function () { fx.volley(4, { power: 1.1 }); }, 700);
      (function pulse() {
        later(function () { fx.volley(3, { power: 1.0 }); pulse(); }, 12000);
      })();
    }

    updateProgress();
  }

  function runSlam() {
    var words = $$('.slam-word');
    var seps = $$('.slam-sep');
    words.forEach(function (w) { w.classList.remove('hit'); });
    seps.forEach(function (s) { s.classList.remove('on'); });

    var spots = [[0.24, 0.34], [0.52, 0.26], [0.78, 0.36]];
    var times = [1000, 2750, 4500];
    words.forEach(function (w, k) {
      later(function () {
        w.classList.add('hit');
        if (seps[k - 1]) seps[k - 1].classList.add('on');
        audio.slam();
        var p = spots[k] || [0.5, 0.3];
        fx.burst(global.innerWidth * p[0], global.innerHeight * p[1], {
          power: 1.5, type: k === 1 ? 'double' : k === 2 ? 'chrys' : 'peony',
          color: global.FX_COLORS[k === 1 ? 2 : k === 2 ? 4 : 0]
        });
        popFlash();
        fx.volley(2, { power: 1.0 });
      }, times[k]);
    });

    later(function () { fx.volley(7, { power: 1.35 }); popFlash(); }, 6600);
    later(function () { fx.volley(5, { power: 1.2 }); }, 10200);
    later(function () { fx.volley(8, { power: 1.4 }); popFlash(); }, 13800);
  }

  function popFlash() {
    if (reduced) return;
    els.flash.classList.remove('go');
    void els.flash.offsetWidth;
    els.flash.classList.add('go');
  }

  /* ── tiến độ ────────────────────────────────────────── */
  function updateProgress() {
    var c = CFG[state.idx] || CFG[0];
    var p = c.dur > 0 ? Math.min(1, state.inScene / c.dur) : 1;
    if (segs[state.idx]) segs[state.idx].fill.style.transform = 'scaleX(' + p + ')';
  }

  /* ── chạm để sang cảnh ──────────────────────────────── */
  function next() {
    if (!state.started) { start(); return; }
    state.advances++;
    if (state.advances >= 3) els.tapHint.classList.add('dim');
    if (state.idx >= CFG.length - 1) restart();
    else goTo(state.idx + 1);
  }
  function prev() {
    if (state.started && state.idx > 0) goTo(state.idx - 1);
  }

  /* ── vòng lặp chính ─────────────────────────────────── */
  function frame(ts) {
    state.raf = global.requestAnimationFrame(frame);
    if (!state.lastT) state.lastT = ts;
    var dt = Math.min(0.05, (ts - state.lastT) / 1000);
    state.lastT = ts;
    if (dt <= 0) return;

    audio.tick(dt);

    if (state.started && !state.hiddenPaused) {
      fx.tick(dt);
      if (CFG[state.idx] && CFG[state.idx].flag) flag.tick(ts / 1000);

      var c = CFG[state.idx];
      if (c && c.dur > 0) {
        state.inScene = Math.min(c.dur, state.inScene + dt * 1000);
        updateProgress();
      }

      // rung ống kính rất nhẹ, chỉ ở cảnh pháo hoa
      if (fx.shake > 0.06 && state.idx === 7 && !reduced) {
        var a = fx.shake;
        els.stage.style.transform = 'translate3d(' + (Math.random() * a - a / 2).toFixed(2) + 'px,' + (Math.random() * a - a / 2).toFixed(2) + 'px,0)';
      } else if (els.stage.style.transform) {
        els.stage.style.transform = '';
      }
    }
  }

  /* ── bắt đầu ────────────────────────────────────────── */
  function start() {
    if (state.started) return;
    state.started = true;
    doc.body.classList.add('started');
    els.gate.setAttribute('aria-hidden', 'true');
    els.gate.removeAttribute('tabindex');

    audio.init();
    audio.setMuted(false);
    syncMute();
    audio.startMusic(0);
    audio.resume();
    goTo(0);
    state.lastT = 0;

    // tải trước ảnh các cảnh sau
    later(function () {
      $$('.scene-media img').forEach(function (im) {
        if (im.loading === 'lazy') { var p = new Image(); p.src = im.currentSrc || im.src; }
      });
    }, 1200);
  }

  function restart() {
    clearTimers();
    fx.clear();
    $$('[data-kinetic]').forEach(function (q) { q.classList.remove('in'); });
    $$('.slam-word').forEach(function (w) { w.classList.remove('hit'); });
    $$('.slam-sep').forEach(function (s) { s.classList.remove('on'); });
    audio.resetMarch();
    audio.startMusic(0);
    state.idx = -1;
    state.advances = 0;
    els.tapHint.classList.remove('dim');
    goTo(0);
  }

  /* ── âm thanh: một nút duy nhất ─────────────────────── */
  function syncMute() {
    els.btnMute.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
    els.muteLabel.textContent = state.muted ? 'Âm thanh: TẮT' : 'Âm thanh: BẬT';
    els.btnMute.title = state.muted ? 'Bật âm thanh (M)' : 'Tắt toàn bộ âm thanh (M)';
  }
  function toggleMute() {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
    if (state.muted) audio.wind(false);
    else if (CFG[state.idx]) audio.wind(CFG[state.idx].wind);
    syncMute();
    if (!state.muted) audio.click();
  }

  /* ── lắp ráp ────────────────────────────────────────── */
  function init() {
    els = {
      gate: $('#gate'), stage: $('#stage'), fx: $('#fx'), flash: $('#flash'), wipe: $('#wipe'),
      nowIdx: $('#nowIdx'), nowName: $('#nowName'),
      btnMute: $('#btnMute'), muteLabel: $('#muteLabel'),
      progSegs: $('#progSegs'), tapHint: $('#tapHint'),
      music: $('#music'), march: $('#march'), flagCanvas: $('#flagCanvas')
    };
    scenes = $$('.scene');

    fx = new global.FX(els.fx);
    fx.reduced = reduced;
    fx.setDensity(0.7 * 0.4);
    fx.setMode('ambient');
    fx.onBurst = function (x, y, power) {
      audio.boom(power, x);
      if (power > 1.15 && state.idx >= 7) popFlash();
    };
    fx.onLaunch = function (x) { audio.launch(x); };
    fx.onCrackle = function () { audio.crackle(); };

    flag = new global.WavingFlag(els.flagCanvas);
    audio = new global.AudioEngine(els.music, els.march);
    els.music.addEventListener('ended', function () {
      // hết bài: đoạn cao trào cho pháo hoa, còn lại chạy từ đầu
      audio.seekScore(state.idx >= 7 ? 52 : 0);
      if (state.started && !state.hiddenPaused && !audio.marchOn) audio.resumeMusic();
    });

    buildProg();
    scenes.forEach(function (s) { s.setAttribute('aria-hidden', 'true'); });

    /* chạm bất kỳ đâu: bắt đầu, rồi sang cảnh */
    doc.addEventListener('click', function (e) {
      if (e.target.closest('#btnMute')) return;   // nút âm thanh tự xử lý
      if (e.target.closest('a')) return;          // giữ liên kết nguồn tư liệu
      var now = Date.now();
      if (now - state.lastTap < 320) return;      // chặn chạm đúp nhảy hai cảnh
      state.lastTap = now;
      next();
    });

    els.btnMute.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMute();
    });

    /* bàn phím tối giản */
    doc.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': case ' ': case 'Enter':
          e.preventDefault(); next(); break;
        case 'ArrowLeft': case 'PageUp':
          e.preventDefault(); prev(); break;
        case 'm': case 'M': toggleMute(); break;
      }
    });

    /* resize */
    var rt = 0;
    global.addEventListener('resize', function () {
      global.clearTimeout(rt);
      rt = global.setTimeout(function () { fx.resize(); flag.resize(); }, 140);
    });
    global.addEventListener('orientationchange', function () {
      global.setTimeout(function () { fx.resize(); flag.resize(); }, 320);
    });

    /* rời tab thì tạm dừng, quay lại thì chạy tiếp */
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) {
        state.hiddenPaused = true;
        audio.suspendAll();
      } else {
        state.hiddenPaused = false;
        state.lastT = 0;
        audio.resumeAll();
      }
    });

    /* giảm chuyển động */
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-reduced-motion: reduce)');
      var onMq = function () {
        reduced = mq.matches;
        fx.reduced = reduced;
        if (reduced) fx.clear();
      };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }

    syncMute();
    state.raf = global.requestAnimationFrame(frame);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(window);