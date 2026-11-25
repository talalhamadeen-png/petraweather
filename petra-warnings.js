/* تحذيرات سلطة إقليم البترا + النشرة المفصلة للواء البترا - تقرأ من ملف warnings.json */
(function () {
  'use strict';
  var LEVELS = {
    info:  { label: 'معلومة', color: '#38bdf8' },
    watch: { label: 'تنبيه',  color: '#fbbf24' },
    warn:  { label: 'تحذير',  color: '#ef4444' }
  };
  var REFRESH_MS = 5 * 60 * 1000;
  var FS_MIN = 17, FS_MAX = 34, FS_DEF = 22;
  var warnSec = null, bulSec = null;

  function css() {
    if (document.getElementById('pw-style')) return;
    var lk = document.createElement('link');
    lk.rel = 'stylesheet';
    lk.href = 'https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&display=swap';
    document.head.appendChild(lk);
    var st = document.createElement('style');
    st.id = 'pw-style';
    st.textContent =
      '#pwSection{margin:0 0 18px;direction:rtl}' +
      '#pwSection[hidden],#bulSection[hidden]{display:none}' +
      '#pwSection .pw-title{font-size:17px;font-weight:800;margin:0 0 10px;color:var(--text,#e7edf5)}' +
      '#pwSection .pw-item{background:var(--card,#111722);color:var(--text,#e7edf5);border:1px solid var(--border,rgba(148,163,184,.25));border-right:5px solid var(--pw-c,#fbbf24);border-radius:14px;padding:14px 16px;margin-bottom:10px}' +
      '#pwSection .pw-badge{display:inline-block;font-size:12px;font-weight:800;padding:3px 12px;border-radius:20px;color:#111;background:var(--pw-c,#fbbf24);margin-bottom:8px}' +
      '#pwSection .pw-text{font-size:15px;line-height:1.9;white-space:pre-wrap;word-break:break-word}' +
      '#pwSection .pw-meta{font-size:12px;opacity:.75;margin-top:8px;display:flex;flex-wrap:wrap;gap:6px 14px}' +
      '#pwSection .pw-meta a{color:inherit;font-weight:700;text-decoration:underline}' +
      '#pwSection .pw-note{font-size:11.5px;opacity:.7;margin:2px 0 0}' +
      /* النشرة المفصلة */
      '#bulSection{margin:0 0 20px;direction:rtl}' +
      '#bulSection .bul-box{background:linear-gradient(160deg,#0b3b3f 0%,#0f2f3d 100%);color:#e8fffb;border:1px solid #14b8a6;border-radius:18px;overflow:hidden;box-shadow:0 10px 28px rgba(20,184,166,.18);font-family:"Noto Naskh Arabic","Amiri","Traditional Arabic",serif}' +
      '#bulSection .bul-head{background:linear-gradient(90deg,#0d9488,#0e7490);padding:13px 18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}' +
      '#bulSection .bul-title{font-size:23px;font-weight:700;color:#fff;margin:0;line-height:1.5}' +
      '#bulSection .bul-date{font-size:14px;color:#ccfbf1;margin-right:auto}' +
      '#bulSection .bul-body{padding:18px 18px 8px;font-size:var(--bul-fs,22px)!important;line-height:2.1;position:relative}\n' +
      '#bulSection .bul-body *{font-size:inherit}' +
      '#bulSection .bul-p{margin:0 0 12px;white-space:pre-line;word-break:break-word}' +
      '#bulSection .bul-h{font-size:1.12em!important;font-weight:700;color:#5eead4;margin:16px 0 6px;padding-bottom:4px;border-bottom:1px dashed rgba(94,234,212,.4)}' +
      '#bulSection .bul-li{display:flex;gap:10px;margin:0 0 6px;align-items:flex-start}' +
      '#bulSection .bul-mk{color:#5eead4;font-weight:700;min-width:1.4em;text-align:center;flex:none}' +
      '#bulSection .bul-li span.bul-tx{flex:1;word-break:break-word;white-space:pre-line}' +
      '#bulSection .bul-fs{display:flex;gap:6px}' +
      '#bulSection .bul-fs button{min-width:42px;height:38px;border-radius:10px;border:1px solid rgba(255,255,255,.55);background:rgba(255,255,255,.14);color:#fff;font-size:17px;font-weight:700;cursor:pointer;font-family:inherit;line-height:1}' +
      '#bulSection .bul-foot{padding:0 18px 14px;font-size:14px;color:#99f6e4;opacity:.85}';
    document.head.appendChild(st);
  }

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  // يقبل 2026-11-09T18:00 (بتوقيت الأردن +03:00) أو تاريخاً كاملاً بمنطقته الزمنية
  function toMs(v) {
    if (!v) return 0;
    var s = String(v).trim();
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += '+03:00';
    var t = Date.parse(s);
    return isNaN(t) ? 0 : t;
  }

  function fmt(ms) {
    try {
      return new Date(ms).toLocaleString('ar-JO', { day: 'numeric', month: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true, timeZone: 'Asia/Amman' });
    } catch (e) { return ''; }
  }

  function safeUrl(u) { return typeof u === 'string' && /^https:\/\//i.test(u) ? u : ''; }

  function ensureSections() {
    warnSec = document.getElementById('pwSection');
    bulSec = document.getElementById('bulSection');
    if (warnSec && bulSec) return;
    var host = document.querySelector('.container') || document.body;
    if (!warnSec) {
      warnSec = document.createElement('section');
      warnSec.id = 'pwSection';
      warnSec.hidden = true;
      warnSec.setAttribute('aria-live', 'polite');
      host.insertBefore(warnSec, host.firstChild);
    }
    if (!bulSec) {
      bulSec = document.createElement('section');
      bulSec.id = 'bulSection';
      bulSec.hidden = true;
      warnSec.parentNode.insertBefore(bulSec, warnSec.nextSibling);
    }
  }

  function renderWarnings(items) {
    var now = Date.now();
    var list = (items || []).filter(function (it) {
      if (!it || !it.text) return false;
      var u = toMs(it.until);
      return !u || u > now;
    });
    warnSec.textContent = '';
    if (!list.length) { warnSec.hidden = true; return; }
    warnSec.appendChild(el('h2', 'pw-title', '⚠️ تحذيرات سلطة إقليم البترا (حالة الجو)'));
    list.forEach(function (it) {
      var lvl = LEVELS[it.level] ? it.level : 'info';
      var card = el('div', 'pw-item');
      card.style.setProperty('--pw-c', LEVELS[lvl].color);
      card.appendChild(el('span', 'pw-badge', LEVELS[lvl].label));
      card.appendChild(el('div', 'pw-text', String(it.text)));
      var meta = el('div', 'pw-meta');
      var at = toMs(it.at);
      if (at) meta.appendChild(el('span', null, 'نُشر: ' + fmt(at)));
      var un = toMs(it.until);
      if (un) meta.appendChild(el('span', null, 'ساري حتى: ' + fmt(un)));
      var u = safeUrl(it.url);
      if (u) {
        var a = el('a', null, 'المنشور الأصلي على فيسبوك');
        a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
        meta.appendChild(a);
      }
      if (meta.childNodes.length) card.appendChild(meta);
      warnSec.appendChild(card);
    });
    warnSec.appendChild(el('p', 'pw-note', 'التحذيرات منقولة عن الصفحة الرسمية لسلطة إقليم البترا، وتخص حالة الجو فقط.'));
    warnSec.hidden = false;
  }

  /* تحويل نص النشرة إلى عناصر منسّقة: عناوين فرعية وقوائم وفقرات */
  var BULLET = /^(?:[-–•*▪●◦‣✔✅🔹🔸▶◀➤←]|\d+[.)\-])\s*/u;
  function buildBody(text) {
    var body = el('div', 'bul-body');
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var para = [];
    function flush() {
      if (para.length) { body.appendChild(el('p', 'bul-p', para.join('\n'))); para = []; }
    }
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) { flush(); return; }
      var m = line.match(BULLET);
      if (m && line.length > m[0].length) {
        flush();
        var row = el('div', 'bul-li');
        var mk = m[0].trim();
        var isNum = /^\d/.test(mk);
        row.appendChild(el('span', 'bul-mk', isNum ? mk : '•'));
        row.appendChild(el('span', 'bul-tx', line.slice(m[0].length)));
        body.appendChild(row);
        return;
      }
      var wrapped = line.match(/^\*\*(.+)\*\*$/) || line.match(/^#{1,4}\s+(.+)$/);
      if (wrapped) { flush(); body.appendChild(el('div', 'bul-h', wrapped[1].trim())); return; }
      if (line.length <= 70 && /[:：]$/.test(line)) { flush(); body.appendChild(el('div', 'bul-h', line)); return; }
      para.push(line);
    });
    flush();
    return body;
  }

  function getFs() {
    try { var v = parseInt(localStorage.getItem('bulFs'), 10); if (v >= FS_MIN && v <= FS_MAX) return v; } catch (e) {}
    return FS_DEF;
  }
  function setFs(v) { try { localStorage.setItem('bulFs', String(v)); } catch (e) {} }

  function renderBulletin(b) {
    bulSec.textContent = '';
    var un = b ? toMs(b.until) : 0;
    if (!b || !b.text || (un && un <= Date.now())) { bulSec.hidden = true; return; }
    var box = el('div', 'bul-box');
    var head = el('div', 'bul-head');
    head.appendChild(el('h2', 'bul-title', '📋 ' + (b.title || 'النشرة المفصلة للواء البترا')));
    var at = toMs(b.at);
    if (at) head.appendChild(el('span', 'bul-date', fmt(at)));
    box.appendChild(head);
    var fs = getFs();
    var body = buildBody(b.text);
    body.style.setProperty('--bul-fs', fs + 'px');
    var ctl = el('div', 'bul-fs');
    var bigger = el('button', null, 'أ+'); bigger.type = 'button'; bigger.setAttribute('aria-label', 'تكبير الخط');
    var smaller = el('button', null, 'أ-'); smaller.type = 'button'; smaller.setAttribute('aria-label', 'تصغير الخط');
    function apply(delta) {
      fs = Math.max(FS_MIN, Math.min(FS_MAX, fs + delta));
      body.style.setProperty('--bul-fs', fs + 'px');
      setFs(fs);
    }
    bigger.addEventListener('click', function () { apply(2); });
    smaller.addEventListener('click', function () { apply(-2); });
    ctl.appendChild(smaller); ctl.appendChild(bigger);
    head.appendChild(ctl);
    box.appendChild(body);
    if (un) box.appendChild(el('div', 'bul-foot', 'ساريّة حتى: ' + fmt(un)));
    bulSec.appendChild(box);
    bulSec.hidden = false;
  }

  function load() {
    fetch('warnings.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        ensureSections();
        renderWarnings(d && Array.isArray(d.items) ? d.items : []);
        renderBulletin(d && d.bulletin ? d.bulletin : null);
      })
      .catch(function () { /* عند أي خطأ: تبقى الصفحة كما هي */ });
  }

  function start() { css(); load(); setInterval(load, REFRESH_MS); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
