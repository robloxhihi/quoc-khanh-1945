/* ═══════════════════════════════════════════════════════════
   main.js — bộ máy trình chiếu: 9 cảnh, timeline, chữ động,
   pháo hoa đồng bộ, điều khiển, bàn phím, vuốt, toàn màn hình.
   Một vòng requestAnimationFrame duy nhất cho toàn bộ trang.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  var CFG = [
    { id: 's1', name: 'Mở màn',      dur: 9000,  fx: 'ambient', lvl: 0.40, duck: 0.94, wind: true,  step: 0 },
    { id: 's2', name: 'Bối cảnh',    dur: 10000, fx: 'ambient', lvl: 0.26, duck: 1.00, wind: true,  step: 0 },
    { id: 's3', name: 'Lễ đài',      dur: 10000, fx: 'ambient', lvl: 0.44, duck: 1.00, wind: false, step: 0 },
    { id: 's4', name: 'Hồ Chí Minh', dur: 10000, fx: 'ambient', lvl: 0.30, duck: 0.88, wind: false, step: 0 },
    { id: 's5', name: 'Tuyên ngôn',  dur: 16000, fx: 'ambient', lvl: 0.10, duck: 0.32, wind: false, step: 145, kinetic: ['kinetic1'] },
    { id: 's6', name: 'Lời thề',     dur: 13000, fx: 'ambient', lvl: 0.20, duck: 0.48, wind: false, step: 100, kinetic: ['kinetic2', 'kinetic3'] },
    { id: 's7', name: 'Lá cờ',       dur: 10000, fx: 'ambient', lvl: 0.55, duck: 0.96, wind: false, step: 0, flag: true },
    { id: 's8', name: 'Pháo hoa',    dur: 17000, fx: 'finale',  lvl: 1.00, duck: 1.00, wind: false, step: 0, slam: true },
    { id: 's9', name: '81 năm',      dur: 0,     fx: 'ambient', lvl: 0.50, duck: 0.55, wind: false, step: 0, hold: true }
  ];
  var TOTAL = CFG.reduce(function (a, c) { return a + c.dur; }, 0);

  var state = {
    started: false, playing: false, idx: -1,
    inScene: 0, speed: 1, auto: true,
    fxDensity: 0.7, muted: false,
    timers: [], hiddenWasPlaying: false, lastT: 0, raf: 0
  };

  var els = {};
  var fx, flag, audio, segs = [], scenes = [];
  var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── tiện ích ───────────────────────────────────────── */
  function fmt(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function later(fn, ms) { var t = global.setTimeout(fn, ms); state.timers.push(t); return t; }
  function clearTimers() { state.timers.forEach(global.clearTimeout); state.timers.length = 0; }
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    global.clearTimeout(toast._t);
    toast._t = global.setTimeout(function () { els.toast.classList.remove('show'); }, 2400);
  }

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

  /* ── thanh phân cảnh ────────────────────────────────── */
  function buildSegs() {
    els.segbar.innerHTML = '';
    segs = [];
    CFG.forEach(function (c, i) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'seg';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', 'Cảnh ' + (i + 1) + ': ' + c.name);
      b.innerHTML = '<span class="seg-fill"></span><span class="seg-tip">' +
        ('0' + (i + 1)).slice(-2) + ' · ' + c.name + '</span>';
      b.addEventListener('click', function () { audio.click(); goTo(i, true); });
      els.segbar.appendChild(b);
      segs.push({ el: b, fill: $('.seg-fill', b) });
    });
  }

  /* ── vào cảnh ───────────────────────────────────────── */
  function goTo(i, manual) {
    i = Math.max(0, Math.min(CFG.length - 1, i));
    if (i === state.idx && !manual) return;
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

    // kinetic: gỡ rồi bật lại để lần xem sau vẫn chạy
    $$('[data-kinetic]').forEach(function (q) { q.classList.remove('in'); });

    segs.forEach(function (s, k) {
      s.el.classList.toggle('current', k === i);
      s.el.classList.toggle('done', k < i);
      s.el.setAttribute('aria-selected', k === i ? 'true' : 'false');
      s.fill.style.transform = 'scaleX(' + (k < i ? 1 : 0) + ')';
    });

    els.nowIdx.textContent = ('0' + (i + 1)).slice(-2);
    els.nowName.textContent = c.name;

    // hiệu ứng nền theo cảnh
    fx.setMode(c.fx);
    fx.setDensity(state.fxDensity * c.lvl);
    if (c.fx === 'finale' && !reduced) { fx.volley(i === 7 ? 5 : 3, { power: 1.2 }); }
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
          // chuông nhẹ đúng lúc eachmark sáng lên
          $$('mark', q).forEach(function (m) {
            var mi = parseInt(m.style.getPropertyValue('--mi') || '0', 10);
            later(function () { audio.chime(660 + Math.random() * 620, 0.055); }, mi * c.step + 320);
          });
        }, delay);
      });
    }

    // cờ tung bay
    if (c.flag) { later(function () { flag.resize(); }, 60); }

    // pháo hoa + chữ đập
    if (c.slam) runSlam();

    // cảnh cuối: giữ, không tự trôi; trời dịu lại để đọc nguồn tư liệu
    if (c.hold) {
      state.playing = true;
      syncPlayBtn();
      later(function () { fx.volley(4, { power: 1.1 }); }, 700);
      (function pulse() {
        later(function () { fx.volley(3, { power: 1.0 }); pulse(); }, 12000);
      })();
    }

    if (manual && !state.playing) { state.playing = true; syncPlayBtn(); audio.resumeMusic(); }
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
    if (seps[2]) later(function () { seps[2].classList.add('on'); }, 4500);

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
    var before = 0;
    for (var k = 0; k < state.idx; k++) before += CFG[k].dur;
    els.tElapsed.textContent = fmt(before + Math.min(state.inScene, c.dur || 0));
  }

  function syncPlayBtn() {
    els.btnPlay.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
    els.btnPlay.title = state.playing ? 'Tạm dừng (Space)' : 'Tiếp tục (Space)';
  }

  function setPlaying(v) {
    state.playing = !!v;
    syncPlayBtn();
    if (state.playing) { audio.resumeAll(); }
    else { audio.pauseMusic(); }
  }

  /* ── vòng lặp chính ─────────────────────────────────── */
  function frame(ts) {
    state.raf = global.requestAnimationFrame(frame);
    if (!state.lastT) state.lastT = ts;
    var dt = Math.min(0.05, (ts - state.lastT) / 1000);
    state.lastT = ts;
    if (dt <= 0) return;

    audio.tick(dt);

    if (state.playing && state.started) {
      fx.tick(dt);
      if (CFG[state.idx] && CFG[state.idx].flag) flag.tick(ts / 1000);

      var c = CFG[state.idx];
      if (c && c.dur > 0) {
        state.inScene += dt * 1000 * state.speed;
        if (state.inScene >= c.dur) {
          if (state.auto) { goTo(state.idx + 1, false); }
          else { state.inScene = c.dur; }
        }
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
  function start(muted) {
    if (state.started) return;
    state.started = true;
    state.muted = !!muted;
    doc.body.classList.add('started');
    els.gate.setAttribute('aria-hidden', 'true');

    audio.init();
    audio.setMuted(state.muted);
    syncMute();
    audio.startMusic(0);
    audio.resume();

    state.playing = true;
    syncPlayBtn();
    goTo(0, true);
    state.lastT = 0;

    // tải trước ảnh các cảnh sau
    later(function () {
      $$('.scene-media img').forEach(function (im) {
        if (im.loading === 'lazy') { var p = new Image(); p.src = im.currentSrc || im.src; }
      });
    }, 1200);

    later(function () { toast('Dùng ← → để chuyển cảnh · Space để tạm dừng'); }, 2600);
  }

  function restart() {
    clearTimers();
    fx.clear();
    $$('[data-kinetic]').forEach(function (q) { q.classList.remove('in'); });
    $$('.slam-word').forEach(function (w) { w.classList.remove('hit'); });
    $$('.slam-sep').forEach(function (s) { s.classList.remove('on'); });
    try { audio.music.currentTime = 0; } catch (e) {}
    audio.startMusic(0);
    state.idx = -1;
    state.playing = true;
    syncPlayBtn();
    goTo(0, true);
    toast('Về đầu trình chiếu');
  }

  /* ── âm thanh ───────────────────────────────────────── */
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
    toast(state.muted ? 'Đã tắt toàn bộ âm thanh' : 'Đã bật âm thanh');
  }

  /* ── toàn màn hình ──────────────────────────────────── */
  function toggleFull() {
    var d = doc, el = d.documentElement;
    var isFull = d.fullscreenElement || d.webkitFullscreenElement;
    if (!isFull) {
      var fn = el.requestFullscreen || el.webkitRequestFullscreen;
      if (fn) { try { fn.call(el); } catch (e) { toast('Trình duyệt không cho toàn màn hình'); } }
      else toast('Trình duyệt không hỗ trợ toàn màn hình');
    } else {
      var ex = d.exitFullscreen || d.webkitExitFullscreen;
      if (ex) { try { ex.call(d); } catch (e) {} }
    }
  }

  /* ── bảng nguồn ─────────────────────────────────────── */
  function openSheet() {
    els.sheet.hidden = false;
    $('.sheet-x', els.sheet).focus();
    audio.click();
  }
  function closeSheet() {
    if (els.sheet.hidden) return;
    els.sheet.hidden = true;
    els.btnCredits.focus();
  }

  /* ── chia sẻ ────────────────────────────────────────── */
  function share() {
    var url = global.location.href.split('#')[0];
    var data = { title: '02.09.1945 — Đêm Ba Đình', text: 'Một buổi chiều ở Ba Đình, một quốc gia bắt đầu.', url: url };
    if (navigator.share) {
      navigator.share(data).catch(function () {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast('Đã chép liên kết vào clipboard'); },
        function () { toast(url); });
    } else { toast(url); }
  }

  /* ── lắp ráp ────────────────────────────────────────── */
  function init() {
    els = {
      gate: $('#gate'), stage: $('#stage'), fx: $('#fx'), flash: $('#flash'), wipe: $('#wipe'),
      topbar: $('#topbar'), transport: $('#transport'), segbar: $('#segbar'),
      nowIdx: $('#nowIdx'), nowName: $('#nowName'),
      btnMute: $('#btnMute'), muteLabel: $('#muteLabel'), btnFull: $('#btnFull'), btnCredits: $('#btnCredits'),
      btnStart: $('#btnStart'), btnStartMuted: $('#btnStartMuted'),
      btnPrev: $('#btnPrev'), btnNext: $('#btnNext'), btnPlay: $('#btnPlay'), btnRestart: $('#btnRestart'),
      btnReplay: $('#btnReplay'), btnShare: $('#btnShare'), btnFull2: $('#btnFull2'),
      chkAuto: $('#chkAuto'), selSpeed: $('#selSpeed'), rngFx: $('#rngFx'), fxOut: $('#fxOut'),
      tElapsed: $('#tElapsed'), tTotal: $('#tTotal'),
      sheet: $('#sheet'), toast: $('#toast'), music: $('#music'),
      flagCanvas: $('#flagCanvas')
    };
    scenes = $$('.scene');

    fx = new global.FX(els.fx);
    fx.reduced = reduced;
    fx.setDensity(state.fxDensity * 0.4);
    fx.setMode('ambient');
    fx.onBurst = function (x, y, power) {
      audio.boom(power, x);
      if (power > 1.15 && state.idx >= 7) popFlash();
    };
    fx.onLaunch = function (x) { audio.launch(x); };
    fx.onCrackle = function () { audio.crackle(); };

    flag = new global.WavingFlag(els.flagCanvas);
    audio = new global.AudioEngine(els.music);
    audio.music.loop = false;
    els.music.addEventListener('ended', function () {
      // hết bài: cảnh cuối thì lặp đoạn cao trào, còn lại chạy lại từ đầu
      var at = state.idx >= 7 ? 52 : 0;
      try { audio.music.currentTime = at; } catch (e) {}
      if (state.playing) audio.resumeMusic();
    });

    els.tTotal.textContent = fmt(TOTAL);
    buildSegs();
    scenes.forEach(function (s) { s.setAttribute('aria-hidden', 'true'); });

    /* cổng vào */
    els.btnStart.addEventListener('click', function () { start(false); });
    els.btnStartMuted.addEventListener('click', function () { start(true); });
    $('#brandLink').addEventListener('click', function (e) {
      e.preventDefault();
      if (state.started) { audio.click(); restart(); }
    });

    /* điều khiển */
    els.btnPrev.addEventListener('click', function () { audio.click(); goTo(state.idx - 1, true); });
    els.btnNext.addEventListener('click', function () { audio.click(); goTo(state.idx + 1, true); });
    els.btnPlay.addEventListener('click', function () { audio.click(); setPlaying(!state.playing); });
    els.btnRestart.addEventListener('click', function () { audio.click(); restart(); });
    els.btnReplay.addEventListener('click', function () { audio.click(); restart(); });
    els.btnShare.addEventListener('click', function () { audio.click(); share(); });
    els.btnFull.addEventListener('click', function () { audio.click(); toggleFull(); });
    els.btnFull2.addEventListener('click', function () { audio.click(); toggleFull(); });
    els.btnMute.addEventListener('click', toggleMute);
    els.btnCredits.addEventListener('click', openSheet);
    $$('[data-sheet-close]', els.sheet).forEach(function (n) { n.addEventListener('click', closeSheet); });

    els.chkAuto.addEventListener('change', function () {
      state.auto = els.chkAuto.checked;
      audio.click();
      toast(state.auto ? 'Tự động chuyển cảnh' : 'Giữ cảnh hiện tại');
    });
    els.selSpeed.addEventListener('change', function () {
      state.speed = parseFloat(els.selSpeed.value) || 1;
      audio.click();
      toast('Tốc độ ' + els.selSpeed.value + '×');
    });
    els.rngFx.addEventListener('input', function () {
      state.fxDensity = parseInt(els.rngFx.value, 10) / 100;
      els.fxOut.textContent = els.rngFx.value;
      var c = CFG[state.idx] || CFG[0];
      fx.setDensity(state.fxDensity * c.lvl);
    });

    /* bàn phím */
    doc.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (!state.started) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(false); }
        return;
      }
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': e.preventDefault(); goTo(state.idx + 1, true); break;
        case 'ArrowLeft': case 'PageUp': e.preventDefault(); goTo(state.idx - 1, true); break;
        case ' ': case 'k': e.preventDefault(); setPlaying(!state.playing); break;
        case 'm': case 'M': toggleMute(); break;
        case 'f': case 'F': toggleFull(); break;
        case 'r': case 'R': restart(); break;
        case 'Escape': if (!els.sheet.hidden) closeSheet(); break;
        case 'Home': e.preventDefault(); goTo(0, true); break;
        case 'End': e.preventDefault(); goTo(CFG.length - 1, true); break;
        default:
          if (/^[1-9]$/.test(e.key)) goTo(parseInt(e.key, 10) - 1, true);
      }
    });

    /* vuốt trên cảm ứng */
    var tx = 0, ty = 0, tt = 0, swiping = false;
    els.stage.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = Date.now(); swiping = true;
    }, { passive: true });
    els.stage.addEventListener('touchend', function (e) {
      if (!swiping) return;
      swiping = false;
      var t = e.changedTouches[0];
      var dx = t.clientX - tx, dy = t.clientY - ty;
      if (Date.now() - tt > 700) return;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        goTo(state.idx + (dx < 0 ? 1 : -1), true);
      }
    }, { passive: true });

    /* bấm lên trời để bắn pháo hoa */
    els.stage.addEventListener('click', function (e) {
      if (state.idx < 7) return;
      if (e.target.closest('button, a, input, select, label')) return;
      fx.burst(e.clientX, e.clientY, { power: 1.25, type: ['peony', 'chrys', 'ring', 'double', 'willow'][(Math.random() * 5) | 0] });
      popFlash();
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
        state.hiddenWasPlaying = state.playing;
        if (state.playing) setPlaying(false);
        audio.suspendAll();
      } else {
        state.lastT = 0;
        audio.resumeAll();
        if (state.hiddenWasPlaying && state.started) setPlaying(true);
      }
    });

    /* trạng thái toàn màn hình */
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
      doc.addEventListener(ev, function () {
        var on = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
        els.btnFull.setAttribute('aria-pressed', on ? 'true' : 'false');
        global.setTimeout(function () { fx.resize(); flag.resize(); }, 120);
      });
    });

    /* giảm chuyển động */
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-reduced-motion: reduce)');
      var onMq = function () {
        reduced = mq.matches;
        fx.reduced = reduced;
        if (reduced) { fx.clear(); toast('Đã giảm hiệu ứng theo cài đặt hệ thống'); }
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