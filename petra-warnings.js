/* تحذيرات سلطة إقليم البترا (حالة الجو) - تقرأ من ملف warnings.json */
(function () {
  'use strict';
  var LEVELS = {
    info:  { label: 'معلومة', color: '#38bdf8' },
    watch: { label: 'تنبيه',  color: '#fbbf24' },
    warn:  { label: 'تحذير',  color: '#ef4444' }
  };
  var REFRESH_MS = 5 * 60 * 1000;
  var sec = null;

  function css() {
    if (document.getElementById('pw-style')) return;
    var st = document.createElement('style');
    st.id = 'pw-style';
    st.textContent =
      '#pwSection{margin:0 0 18px;direction:rtl}' +
      '#pwSection[hidden]{display:none}' +
      '#pwSection .pw-title{font-size:17px;font-weight:800;margin:0 0 10px;color:var(--text,#e7edf5)}' +
      '#pwSection .pw-item{background:var(--card,#111722);color:var(--text,#e7edf5);border:1px solid var(--border,rgba(148,163,184,.25));border-right:5px solid var(--pw-c,#fbbf24);border-radius:14px;padding:14px 16px;margin-bottom:10px}' +
      '#pwSection .pw-badge{display:inline-block;font-size:12px;font-weight:800;padding:3px 12px;border-radius:20px;color:#111;background:var(--pw-c,#fbbf24);margin-bottom:8px}' +
      '#pwSection .pw-text{font-size:15px;line-height:1.9;white-space:pre-wrap;word-break:break-word}' +
      '#pwSection .pw-meta{font-size:12px;opacity:.75;margin-top:8px;display:flex;flex-wrap:wrap;gap:6px 14px}' +
      '#pwSection .pw-meta a{color:inherit;font-weight:700;text-decoration:underline}' +
      '#pwSection .pw-note{font-size:11.5px;opacity:.7;margin:2px 0 0}';
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

  function ensureSection() {
    if (sec && document.body.contains(sec)) return sec;
    sec = document.getElementById('pwSection');
    if (sec) return sec;
    sec = document.createElement('section');
    sec.id = 'pwSection';
    sec.hidden = true;
    sec.setAttribute('aria-live', 'polite');
    var host = document.querySelector('.container') || document.body;
    host.insertBefore(sec, host.firstChild);
    return sec;
  }

  function render(items) {
    var box = ensureSection();
    var now = Date.now();
    var list = (items || []).filter(function (it) {
      if (!it || !it.text) return false;
      var u = toMs(it.until);
      return !u || u > now;
    });
    box.textContent = '';
    if (!list.length) { box.hidden = true; return; }
    box.appendChild(el('h2', 'pw-title', '⚠️ تحذيرات سلطة إقليم البترا (حالة الجو)'));
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
      box.appendChild(card);
    });
    box.appendChild(el('p', 'pw-note', 'التحذيرات منقولة عن الصفحة الرسمية لسلطة إقليم البترا، وتخص حالة الجو فقط.'));
    box.hidden = false;
  }

  function load() {
    fetch('warnings.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { render(d && Array.isArray(d.items) ? d.items : []); })
      .catch(function () { /* عند أي خطأ: تبقى الصفحة كما هي بدون قسم التحذيرات */ });
  }

  function start() { css(); load(); setInterval(load, REFRESH_MS); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
