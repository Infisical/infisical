/* @ds-bundle: {"format":4,"namespace":"Infisical","components":[{"name":"Button"},{"name":"ButtonGroup"},{"name":"DropdownMenu"},{"name":"Field"},{"name":"Input"},{"name":"InputGroup"},{"name":"Select"},{"name":"Combobox"},{"name":"MultiSelect"},{"name":"Checkbox"},{"name":"Switch"},{"name":"Badge"},{"name":"Avatar"},{"name":"Card"},{"name":"Item"},{"name":"List"},{"name":"Table"},{"name":"DataGrid"},{"name":"Separator"},{"name":"Icon"},{"name":"Kbd"},{"name":"Tabs"},{"name":"Breadcrumb"},{"name":"Pagination"},{"name":"FileTree"},{"name":"Tooltip"},{"name":"Popover"},{"name":"Dialog"},{"name":"AlertDialog"},{"name":"Sheet"},{"name":"Alert"},{"name":"Toast"},{"name":"Progress"},{"name":"Spinner"},{"name":"Loader"},{"name":"Skeleton"},{"name":"EmptyState"},{"name":"Code"},{"name":"CodeBlock"},{"name":"Json"},{"name":"Snippet"},{"name":"MiddleTruncate"},{"name":"AnimatedCollapse"},{"name":"CommandMenu"},{"name":"Sidebar"},{"name":"TopBar"},{"name":"PageHeader"},{"name":"SettingsCard"},{"name":"FloatingActionBar"},{"name":"MultiStep"},{"name":"Announcements"}]} */
(function () {
  'use strict';
  var React = window.React;
  var h = React.createElement;
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef, useCallback = React.useCallback;
  var ICONS = {"search":"<circle cx=\"11\" cy=\"11\" r=\"6.5\"></circle><path d=\"m20 20-4.2-4.2\"></path>","key":"<circle cx=\"8\" cy=\"15\" r=\"4\"></circle><path d=\"m11 12 8.5-8.5M16.5 6.5 19 9M14 9l2 2\"></path>","plus":"<path d=\"M12 5v14M5 12h14\"></path>","minus":"<path d=\"M6 12h12\"></path>","check":"<path d=\"m5 12.5 4.5 4.5L19 7.5\"></path>","x":"<path d=\"M6.5 6.5l11 11M17.5 6.5l-11 11\"></path>","chev-down":"<path d=\"m6.5 9.5 5.5 5.5 5.5-5.5\"></path>","chev-right":"<path d=\"m9.5 6.5 5.5 5.5-5.5 5.5\"></path>","chev-left":"<path d=\"m14.5 6.5-5.5 5.5 5.5 5.5\"></path>","chev-ud":"<path d=\"m8 9.5 4-4 4 4M8 14.5l4 4 4-4\"></path>","more":"<path d=\"M5.5 12h.01M12 12h.01M18.5 12h.01\" style=\"stroke-width: 2.6\"></path>","copy":"<rect x=\"8.5\" y=\"8.5\" width=\"11\" height=\"11\" rx=\"1.5\"></rect><path d=\"M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5\"></path>","eye":"<path d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z\"></path><circle cx=\"12\" cy=\"12\" r=\"2.8\"></circle>","history":"<path d=\"M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5V8H8\"></path><path d=\"M12 8.5V12l2.8 1.8\"></path>","trash":"<path d=\"M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5\"></path>","lock":"<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"10\" rx=\"1.5\"></rect><path d=\"M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5\"></path>","info":"<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"M12 11v5.5M12 7.8v.01\"></path>","alert":"<path d=\"M12 4 2.8 19.5h18.4z\"></path><path d=\"M12 10v4.5M12 17.2v.01\"></path>","alert-c":"<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"M12 7.5v5.5M12 16.2v.01\"></path>","check-c":"<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"m8.5 12.3 2.4 2.4 4.8-5\"></path>","agent":"<rect x=\"5\" y=\"8\" width=\"14\" height=\"11\" rx=\"3\"></rect><path d=\"M12 4v4M9.5 13v1.5M14.5 13v1.5\"></path>","machine":"<rect x=\"4\" y=\"4.5\" width=\"16\" height=\"6\" rx=\"1.5\"></rect><rect x=\"4\" y=\"13.5\" width=\"16\" height=\"6\" rx=\"1.5\"></rect><path d=\"M7.5 7.5h.01M7.5 16.5h.01\"></path>","cert":"<path d=\"M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z\"></path><path d=\"m9 12 2 2 4-4\"></path>","terminal":"<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"15\" rx=\"2\"></rect><path d=\"m7 9.5 3 2.5-3 2.5M13 15h4\"></path>","user":"<circle cx=\"12\" cy=\"8.5\" r=\"3.5\"></circle><path d=\"M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5\"></path>","external":"<path d=\"M14 4.5h5.5V10M19.5 4.5 11 13M17 13.5v5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5\"></path>","sync":"<path d=\"M19.5 9A8 8 0 0 0 5 7.5M4.5 15A8 8 0 0 0 19 16.5\"></path><path d=\"M19.5 4v5h-5M4.5 20v-5h5\"></path>","upload":"<path d=\"M12 15.5V4.5M7.5 9 12 4.5 16.5 9M5 15v4.5h14V15\"></path>","clock":"<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"M12 7.5V12l3 2\"></path>","folder":"<path d=\"M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z\"></path>","link":"<path d=\"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1\"></path>","settings":"<path d=\"M4 7h9M17 7h3M4 17h3M11 17h9\"></path><circle cx=\"15\" cy=\"7\" r=\"2\"></circle><circle cx=\"9\" cy=\"17\" r=\"2\"></circle>","bell":"<path d=\"M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z\"></path><path d=\"M10 20.5a2 2 0 0 0 4 0\"></path>","globe":"<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z\"></path>","inbox":"<path d=\"M4 13.5 6.5 5h11l2.5 8.5V19H4z\"></path><path d=\"M4 13.5h4.5l1 2h5l1-2H20\"></path>","home":"<path d=\"M4 10.5 12 4l8 6.5V20h-5v-5.5H9V20H4z\"></path>","arrow-down":"<path d=\"M12 5v14M6.5 13.5 12 19l5.5-5.5\"></path>","git":"<circle cx=\"6.5\" cy=\"6\" r=\"2\"></circle><circle cx=\"6.5\" cy=\"18\" r=\"2\"></circle><circle cx=\"17.5\" cy=\"8\" r=\"2\"></circle><path d=\"M6.5 8v8M17.5 10c0 4-4 4-9 6.5\"></path>","calendar":"<rect x=\"4\" y=\"5.5\" width=\"16\" height=\"14\" rx=\"1.5\"></rect><path d=\"M4 10h16M8.5 3.5v4M15.5 3.5v4\"></path>","arrow-up":"<path d=\"M12 19V5M6.5 10.5 12 5l5.5 5.5\"></path>","file":"<path d=\"M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z\"></path><path d=\"M13.5 3.5v5h5\"></path>","folder-open":"<path d=\"M3.5 17.5V7A1.5 1.5 0 0 1 5 5.5h4.2l2 2.5H17.5A1.5 1.5 0 0 1 19 9.5v1\"></path><path d=\"M3.6 18.4 6 12.1a1.5 1.5 0 0 1 1.4-1h13a.8.8 0 0 1 .75 1.1l-2.3 6.3a1.5 1.5 0 0 1-1.4 1H5a1.5 1.5 0 0 1-1.4-1.1z\"></path>","download":"<path d=\"M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M5 15v4.5h14V15\"></path>"};
  ICONS["sidebar"] = "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"1.5\"></rect><path d=\"M9.5 4.5v15\"></path>";
  ICONS["user-plus"] = "<circle cx=\"10\" cy=\"8.5\" r=\"3.5\"></circle><path d=\"M3 19.5c1.2-3.3 3.8-5 7-5 1.6 0 3 .4 4.2 1.2M18.5 13v6M15.5 16h6\"></path>";
  ICONS["apps"] = "<rect x=\"4\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.2\"></rect><rect x=\"13.5\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.2\"></rect><rect x=\"4\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.2\"></rect><rect x=\"13.5\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.2\"></rect>";
  ICONS["building"] = "<path d=\"M3.5 20.5h17M5.5 20.5v-15a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M14.5 9.5h3a1 1 0 0 1 1 1v10M8.5 8h3M8.5 11.5h3M8.5 15h3\"></path>";
  ICONS["sun"] = "<circle cx=\"12\" cy=\"12\" r=\"3.8\"></circle><path d=\"M12 3.5v1.8M12 18.7v1.8M3.5 12h1.8M18.7 12h1.8M6 6l1.3 1.3M16.7 16.7 18 18M6 18l1.3-1.3M16.7 7.3 18 6\"></path>";
  ICONS["moon"] = "<path d=\"M19.5 14.2A7.5 7.5 0 0 1 9.8 4.5a7.5 7.5 0 1 0 9.7 9.7z\"></path>";
  ICONS["monitor"] = "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"11.5\" rx=\"1.5\"></rect><path d=\"M9 20h6M12 16v4\"></path>";
  ICONS["megaphone"] = "<path d=\"M3.5 10v4a1 1 0 0 0 1 1H7l8.5 5V4L7 9H4.5a1 1 0 0 0-1 1z\"></path><path d=\"M19 8.5a4.5 4.5 0 0 1 0 7M7.5 15.5l1.5 4.5\"></path>";
  var seq = 0;
  var useId = React.useId || function () { var r = useRef(null); if (!r.current) { seq += 1; r.current = 'ifs' + seq; } return r.current; };

  function cx() { var out = []; for (var i = 0; i < arguments.length; i++) { if (arguments[i]) out.push(arguments[i]); } return out.join(' '); }
  function omit(o, keys) { var r = {}; for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k) && keys.indexOf(k) < 0) r[k] = o[k]; } return r; }
  function chain(a, b) { return function (e) { if (a) a(e); if (b) b(e); }; }
  function fmt(n) { return typeof n === 'number' ? n.toLocaleString('en-US') : n; }
  function focusEl(el) { if (el && el.focus) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } } }
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function useControllable(value, defaultValue, onChange) {
    var st = useState(defaultValue);
    var controlled = value !== undefined;
    var current = controlled ? value : st[0];
    var set = useCallback(function (next) { if (!controlled) st[1](next); if (onChange) onChange(next); }, [controlled, onChange]);
    return [current, set];
  }

  function useDismiss(ref, open, onClose) {
    var cb = useRef(onClose);
    cb.current = onClose;
    useEffect(function () {
      if (!open) return undefined;
      function down(e) { if (ref.current && !ref.current.contains(e.target)) cb.current(e); }
      function key(e) { if (e.key === 'Escape') cb.current(e); }
      document.addEventListener('mousedown', down);
      document.addEventListener('keydown', key);
      return function () { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
    }, [open]);
  }

  /* ------------------------------------------------------------ Icon, Kbd */
  function Icon(p) {
    var size = p.size || 16;
    return h('svg', {
      className: cx('ifs-icon', p.className), width: size, height: size, viewBox: '0 0 24 24',
      role: p.label ? 'img' : undefined, 'aria-label': p.label, 'aria-hidden': p.label ? undefined : true,
      style: Object.assign({ strokeWidth: p.strokeWidth || 1.7, width: size, height: size }, p.style),
      dangerouslySetInnerHTML: { __html: ICONS[p.name] || '' },
    });
  }

  /* Kbd: a key hint drawn as flat caps. `keys` (or string children) takes a shortcut string or an array: "⌘C", "mod+K",
     "Ctrl+Shift+P", "G then S", ['mod', 'K']. Modifier symbols split into their own caps; `mod` is ⌘ on Apple platforms and
     Ctrl elsewhere. The caps are hidden from screen readers, which hear the key names instead ("Command C"). */
  var KEY_NAMES = { '⌘': 'Command', '⇧': 'Shift', '⌥': 'Option', '⌃': 'Control', '↵': 'Enter', '⌫': 'Backspace', '↑': 'Up arrow', '↓': 'Down arrow', '←': 'Left arrow', '→': 'Right arrow', '/': 'Slash', '.': 'Period', ',': 'Comma', '?': 'Question mark', Esc: 'Escape', Del: 'Delete' };
  function isApple() {
    try { var pf = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || ''; return /mac|iphone|ipad|ipod/i.test(pf); } catch (e) { return false; }
  }
  function keyGlyph(k, apple) {
    var s = String(k).trim(), l = s.toLowerCase();
    var map = {
      mod: apple ? '⌘' : 'Ctrl', cmd: '⌘', command: '⌘', meta: apple ? '⌘' : 'Win',
      ctrl: apple ? '⌃' : 'Ctrl', control: apple ? '⌃' : 'Ctrl', shift: apple ? '⇧' : 'Shift',
      alt: apple ? '⌥' : 'Alt', opt: '⌥', option: '⌥', enter: '↵', return: '↵',
      esc: 'Esc', escape: 'Esc', backspace: '⌫', del: 'Del', delete: 'Del', tab: 'Tab', space: 'Space',
      up: '↑', down: '↓', left: '←', right: '→',
    };
    if (map[l]) return map[l];
    return s.length === 1 ? s.toUpperCase() : s;
  }
  function parseKeys(keys, apple) {
    if (keys == null || keys === '') return [];
    function g(k) { return keyGlyph(k, apple); }
    if (Array.isArray(keys)) {
      if (keys.some(Array.isArray)) return keys.map(function (st) { return (Array.isArray(st) ? st : [st]).map(g); });
      return [keys.map(g)];
    }
    return String(keys).split(/\s+then\s+/i).map(function (step) {
      var parts = [];
      if (step.length > 1 && /[^+]\+[^+]/.test(step)) parts = step.split('+').filter(Boolean);
      else {
        var m = /^[⌘⇧⌥⌃]+/.exec(step);
        if (m) { parts = m[0].split(''); step = step.slice(m[0].length); }
        if (step) parts.push(step);
      }
      return parts.map(g);
    });
  }
  function Kbd(p) {
    var cls = cx('ifs-kbd', p.size === 'sm' && 'ifs-kbd--sm', p.className);
    var src = p.keys != null ? p.keys : (typeof p.children === 'string' || Array.isArray(p.children) ? p.children : null);
    if (src == null) return h('kbd', { className: cls }, h('kbd', { className: 'ifs-kbd__key' }, p.children));
    var apple = p.platform === 'mac' ? true : p.platform === 'other' ? false : isApple();
    var steps = parseKeys(src, apple), kids = [];
    steps.forEach(function (st, i) {
      if (i) kids.push(h('span', { key: 't' + i, className: 'ifs-kbd__then', 'aria-hidden': true }, 'then'));
      st.forEach(function (k, j) { kids.push(h('kbd', { key: i + '.' + j, className: cx('ifs-kbd__key', /^[\u2318\u21e7\u2325\u2303\u21b5\u232b]$/.test(k) && 'ifs-kbd__key--sym'), 'aria-hidden': true }, k)); });
    });
    var spoken = steps.map(function (st) { return st.map(function (k) { return KEY_NAMES[k] || k; }).join(' '); }).join(', then ');
    kids.push(h('span', { key: 'sr', className: 'ifs-sr' }, spoken));
    return h('kbd', { className: cls, title: p.title }, kids);
  }

  /* ------------------------------------------------------------ Spinner, Loader */
  // Spinner is the infinity. `inline` (the default) is two pixels that trade size against each other, an abstract infinity
  // for toasts, rows, status text and link buttons. `base` and `page` draw the mark on a pixel grid, and a lit run of pixels
  // loops the figure eight; `page` assembles first. Loader wraps a Spinner with its label as a status.
  var SPINNER_GRIDS = {
    base: { pitch: 3, dot: 2, period: 1.6, steps: 24, rows: ['..####....####..', '.######..######.', '##....####....##', '##.....##.....##', '##.....##.....##', '##....####....##', '.######..######.', '..####....####..'] },
    page: { pitch: 5, dot: 4, period: 2.4, steps: 40, assemble: 0.95, rows: ['.....######..........######.....', '...##########......##########...', '..############....############..', '.##############..##############.', '.####......##########......####.', '####........########........####', '####.........######.........####', '####..........####..........####', '####..........####..........####', '####.........######.........####', '####........########........####', '.####......##########......####.', '.##############..##############.', '..############....############..', '...##########......##########...', '.....######..........######.....'] }
  };
  function spinnerRand(n) { var x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }
  function spinnerBuild(g) {
    if (g.px) return g;
    var R = g.rows.length, C = g.rows[0].length, xL = C * 0.2724, xR = C * 0.7276, yc = R / 2, mid = C / 2, deg = 180 / Math.PI, px = [], i = 0, maxD = 0;
    for (var r = 0; r < R; r++) for (var q = 0; q < C; q++) {
      if (g.rows[r].charAt(q) !== '#') continue;
      var x = q + 0.5, y = r + 0.5, a, u;
      // Position along the figure eight: up and around the right loop, through the crossing, around the left loop.
      if (x > mid) { a = Math.atan2(y - yc, x - xR) * deg; u = (((a - 180) % 360) + 360) % 360 / 720; }
      else { a = Math.atan2(y - yc, x - xL) * deg; u = 0.5 + ((((-a) % 360) + 360) % 360) / 720; }
      u = Math.floor(u * g.steps) / g.steps;
      var d = Math.sqrt((x - mid) * (x - mid) + (y - yc) * (y - yc)); if (d > maxD) maxD = d;
      px.push({ x: q * g.pitch, y: r * g.pitch, u: u, d: d, i: i++ });
    }
    px.forEach(function (p) {
      var s = function (v) { return Math.round(v * 1000) / 1000 + 's'; };
      if (g.assemble) {
        var ang = spinnerRand(p.i * 3 + 1) * Math.PI * 2, rad = (0.35 + spinnerRand(p.i * 3 + 2) * 0.65) * C * g.pitch * 0.55;
        p.style = { '--dx': Math.round(Math.cos(ang) * rad) + 'px', '--dy': Math.round(Math.sin(ang) * rad) + 'px', animationDelay: s((p.d / maxD) * 0.3 + spinnerRand(p.i * 3 + 3) * 0.1) + ', ' + s(g.assemble + p.u * g.period) };
      } else p.style = { animationDelay: s(-(1 - p.u) * g.period) };
    });
    g.px = px; g.w = (C - 1) * g.pitch + g.dot; g.h = (R - 1) * g.pitch + g.dot;
    return g;
  }
  function Spinner(p) {
    var size = SPINNER_GRIDS[p.size] ? p.size : 'inline';
    var a = {
      className: cx('ifs-spinner', 'ifs-spinner--' + size, p.className), focusable: 'false',
      role: p.label ? 'status' : undefined, 'aria-label': p.label, 'aria-hidden': p.label ? undefined : true,
    };
    // Two 6px pixels, 8px apart; they step between 6, 4 and 2px so their sizes always add up to 8.
    if (size === 'inline') return h('svg', Object.assign(a, { width: 16, height: 8, viewBox: '0 0 16 8' }), h('rect', { x: 1, y: 1, width: 6, height: 6 }), h('rect', { x: 9, y: 1, width: 6, height: 6 }));
    var g = spinnerBuild(SPINNER_GRIDS[size]);
    return h('svg', Object.assign(a, { width: g.w, height: g.h, viewBox: '0 0 ' + g.w + ' ' + g.h }),
      g.px.map(function (q) { return h('rect', { key: q.i, x: q.x, y: q.y, width: g.dot, height: g.dot, style: q.style }); }));
  }
  function Loader(p) {
    var size = p.size === 'page' || p.size === 'inline' ? p.size : 'base';
    var st = useState(!(p.delay > 0)), shown = st[0], setShown = st[1];
    useEffect(function () {
      if (!(p.delay > 0)) { setShown(true); return undefined; }
      setShown(false);
      var t = setTimeout(function () { setShown(true); }, p.delay);
      return function () { clearTimeout(t); };
    }, [p.delay]);
    var cls = cx('ifs-loader', 'ifs-loader--' + size, p.className);
    var label = p.label || 'Loading';
    return h(size === 'inline' ? 'span' : 'div', { className: cls, role: 'status', 'aria-live': 'polite' },
      shown ? h(Spinner, { size: size }) : null,
      shown && p.label ? h('span', { className: 'ifs-loader__label' }, p.label) : h('span', { className: 'ifs-sr' }, label),
      shown && size === 'page' && p.description ? h('span', { className: 'ifs-loader__desc' }, p.description) : null);
  }

  /* ------------------------------------------------------------ Button */
  var Button = React.forwardRef(function Button(p, ref) {
    var variant = p.variant || 'secondary', size = p.size || 'md', ic = size === 'sm' ? 14 : 16;
    var rest = omit(p, ['variant', 'size', 'icon', 'iconRight', 'loading', 'iconOnly', 'full', 'selected', 'className', 'children']);
    var kids = [];
    // A busy button keeps its icon, label and width, wrapped in .ifs-btn__body; bundle.css sweeps a halftone band across it
    // (above the content on filled buttons, as a mask over the body on ghost ones). Links have no box, so they take the inline Spinner.
    if (p.loading && variant === 'link') kids.push(h(Spinner, { key: 'sp' }));
    if (p.icon) kids.push(h(Icon, { key: 'il', name: p.icon, size: ic }));
    if (!p.iconOnly && p.children != null) kids.push(h('span', { key: 't' }, p.children));
    if (p.iconRight) kids.push(h(Icon, { key: 'ir', name: p.iconRight, size: ic }));
    if (p.loading) kids = [h('span', { key: 'body', className: 'ifs-btn__body' }, kids)];
    var tag = p.href ? 'a' : 'button';
    return h(tag, Object.assign({
      ref: ref, type: tag === 'button' ? (p.type || 'button') : undefined,
      className: cx('ifs-btn', 'ifs-btn--' + variant, size !== 'md' && 'ifs-btn--' + size, p.iconOnly && 'ifs-btn--icon', p.full && 'ifs-btn--full', p.className),
      'aria-pressed': p.selected === undefined ? undefined : !!p.selected, 'aria-busy': p.loading || undefined,
    }, rest), kids);
  });

  function ButtonGroup(p) {
    var v = p.variant || 'attached';
    return h('div', {
      role: v === 'toolbar' ? 'toolbar' : 'group', 'aria-label': p.label,
      className: cx('ifs-btngroup', v === 'attached' && 'ifs-btngroup--attached', v === 'toolbar' && 'ifs-btngroup--toolbar', p.className),
    }, p.children);
  }

  /* Deprecated. ToggleGroup drew the same track as Tabs variant="segmented", so it now renders one. Kept so older pages keep working. */
  function ToggleGroup(p) {
    return h(Tabs, { variant: 'segmented', tabs: p.options || [], value: p.value, defaultValue: p.defaultValue, onChange: p.onChange, label: p.label, orientation: p.orientation, className: p.className });
  }

  /* ------------------------------------------------------------ list navigation shared by menus and listboxes */
  function nextIndex(from, dir, list, isDisabled) {
    var n = list.length; if (!n) return -1;
    var i = from;
    for (var k = 0; k < n; k++) {
      i = i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n;
      if (!isDisabled(i)) return i;
    }
    return from;
  }

  /* ------------------------------------------------------------ DropdownMenu */
  // True when an ancestor would clip or mask a popup: a scroll box, overflow hidden, or a mask (a table's edge fade).
  function clipsIn(el) {
    for (var n = el && el.parentElement; n && n !== document.body; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || (cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none')) return true;
    }
    return false;
  }
  function DropdownMenu(p) {
    var s = useControllable(p.open, !!p.defaultOpen, p.onOpenChange), open = s[0], setOpen = s[1];
    var wrap = useRef(null), trig = useRef(null), menu = useRef(null), byUser = useRef(false);
    var id = useId();
    var items = p.items || [];
    var act = [];
    items.forEach(function (it, i) { if (!it.type || it.type === 'item' || it.type === 'checkbox' || it.type === 'radio') act.push(i); });
    var a = useState(-1), active = a[0], setActive = a[1];
    function close(refocus) { setOpen(false); setActive(-1); if (refocus) focusEl(trig.current); }
    useDismiss(wrap, open, function (e) { if (e && e.type === 'mousedown' && menu.current && menu.current.contains(e.target)) return; close(false); });
    // Inside anything that clips (a table's scroll box, a sheet body) the menu floats: it renders into document.body at fixed
    // coordinates beside its trigger, follows it on scroll, and flips above when there is no room below. `portal` forces it.
    var fl = useState(null), float = fl[0], setFloat = fl[1], floating = !!float;
    (React.useLayoutEffect || useEffect)(function () {
      if (!open) { setFloat(null); return undefined; }
      var w = wrap.current;
      if (!w || p.portal === false || (p.portal !== true && !clipsIn(w))) return undefined;
      function place() {
        var r = (trig.current || w).getBoundingClientRect(), m = menu.current, mh = m ? m.offsetHeight : 0, W = p.width || 220;
        var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
        var below = r.bottom + 6 + mh <= vh - 8, above = r.top - 6 - mh >= 8;
        var up = p.side === 'top' ? above || !below : !below && above;
        var left = Math.max(8, Math.min(p.align === 'end' ? r.right - W : r.left, vw - W - 8));
        var th = w.closest('[data-theme]');
        setFloat({ top: Math.round(up ? r.top - 6 - mh : r.bottom + 6), left: Math.round(left), theme: th ? th.getAttribute('data-theme') : null });
      }
      place();
      window.addEventListener('scroll', place, true);
      window.addEventListener('resize', place);
      return function () { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
    }, [open]);
    useEffect(function () { if (open && byUser.current) focusEl(menu.current); if (!open) byUser.current = false; }, [open, floating]);
    function pick(i) {
      var it = items[i]; if (!it || it.disabled) return;
      if (it.onSelect) it.onSelect(it);
      if (it.type !== 'checkbox' && it.type !== 'radio') close(true);
    }
    function move(dir) {
      var pos = act.indexOf(active);
      var np = nextIndex(pos, dir, act, function (k) { return !!items[act[k]].disabled; });
      if (np >= 0) setActive(act[np]);
    }
    function onKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(-1); move(1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (active >= 0) pick(active); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'Tab') close(false);
    }
    var t = p.trigger;
    var trigger = t && React.cloneElement(t, {
      ref: trig, 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': open ? id : undefined,
      onClick: chain(t.props.onClick, function () { byUser.current = true; if (open) close(false); else { setActive(-1); setOpen(true); } }),
      onKeyDown: chain(t.props.onKeyDown, function (e) { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); byUser.current = true; setOpen(true); setActive(act[0] != null ? act[0] : -1); } }),
    });
    function renderItem(it, i) {
      if (it.type === 'separator') return h('div', { key: i, role: 'separator', className: 'ifs-menu-sep' });
      if (it.type === 'label') return h('div', { key: i, role: 'presentation', className: 'ifs-menu-label' }, it.label);
      var role = it.type === 'checkbox' ? 'menuitemcheckbox' : it.type === 'radio' ? 'menuitemradio' : 'menuitem';
      var lead = null;
      if (it.type === 'checkbox') lead = h('span', { className: 'ifs-option__lead' }, it.checked ? h(Icon, { name: 'check', size: 15, strokeWidth: 2.2 }) : null);
      else if (it.type === 'radio') lead = h('span', { className: 'ifs-option__lead' }, it.checked ? h('span', { className: 'ifs-option__radio' }) : null);
      else if (it.icon) lead = h(Icon, { name: it.icon, size: 16 });
      var trail = null;
      if (it.shortcut) trail = h('span', { className: 'ifs-option__meta ifs-option__meta--kbd' }, h(Kbd, { keys: it.shortcut, size: 'sm' }));
      else if (it.meta) trail = h('span', { className: 'ifs-option__meta' }, it.meta);
      else if (it.submenu) trail = h('span', { className: 'ifs-option__meta', style: { display: 'inline-flex' } }, h(Icon, { name: 'chev-right', size: 15 }));
      return h('div', {
        key: i, id: id + '-' + i, role: role, 'aria-checked': it.type === 'checkbox' || it.type === 'radio' ? !!it.checked : undefined,
        'aria-disabled': it.disabled || undefined, 'aria-haspopup': it.submenu ? 'menu' : undefined,
        className: cx('ifs-option', i === active && 'ifs-option--active', it.danger && 'ifs-option--danger'),
        onMouseEnter: function () { if (!it.disabled) setActive(i); }, onMouseDown: function (e) { e.preventDefault(); },
        onClick: function () { pick(i); },
      }, lead, h('span', { className: 'ifs-option__label' }, it.label), trail);
    }
    var list = open ? h('div', {
      ref: menu, id: id, role: 'menu', 'aria-label': p.label, tabIndex: -1, 'aria-activedescendant': active >= 0 ? id + '-' + active : undefined, 'data-theme': float && float.theme ? float.theme : undefined,
      className: cx('ifs-pop', !float && p.align === 'end' && 'ifs-pop--end', !float && p.side === 'top' && 'ifs-pop--up', float && 'ifs-pop--float'),
      style: float ? { position: 'fixed', top: float.top, left: float.left, width: p.width || 220, minWidth: 0 } : { width: p.width || 220, minWidth: 0 }, onKeyDown: onKey,
    }, items.map(renderItem)) : null;
    var RD = window.ReactDOM;
    if (list && float && RD && RD.createPortal) list = RD.createPortal(list, document.body);
    return h('div', { ref: wrap, className: cx('ifs-anchor', p.className) }, trigger, list);
  }

  /* ------------------------------------------------------------ Field */
  function Field(p) {
    var gen = useId(), cid = p.id || gen, msgId = cid + '-m';
    var hasMsg = !!(p.error || p.description);
    var control = p.children;
    if (React.isValidElement(control) && control.type && control.type.ifsControl) {
      var extra = { id: control.props.id || cid };
      if (hasMsg) extra['aria-describedby'] = msgId;
      if (p.error) extra.invalid = true;
      control = React.cloneElement(control, extra);
    }
    var labelKids = [p.label, p.optional ? h('span', { key: 'o', className: 'ifs-label__optional' }, 'Optional') : null];
    var label = p.group
      ? h('span', { id: cid + '-l', className: 'ifs-label' }, labelKids)
      : h('label', { id: cid + '-l', htmlFor: cid, className: 'ifs-label' }, labelKids);
    var msg = p.error
      ? h('p', { id: msgId, className: 'ifs-error' }, h(Icon, { name: 'alert-c', size: 14, strokeWidth: 1.9 }), h('span', null, p.error))
      : p.description ? h('p', { id: msgId, className: 'ifs-help' }, p.description) : null;
    var groupProps = p.group ? { role: 'group', 'aria-labelledby': cid + '-l', 'aria-describedby': hasMsg ? msgId : undefined } : {};
    if (p.orientation === 'horizontal') {
      return h('div', Object.assign({ className: cx('ifs-field ifs-field--horizontal', p.className) }, groupProps), h('div', { className: 'ifs-field__text' }, label, msg), control);
    }
    return h('div', Object.assign({ className: cx('ifs-field', p.className), style: p.style }, groupProps), label, control, msg);
  }

  /* ------------------------------------------------------------ Input, SecretInput, InputGroup */
  function controlClass(p, extra) {
    return cx('ifs-control', p.size === 'sm' && 'ifs-control--sm', p.size === 'lg' && 'ifs-control--lg', p.mono && 'ifs-control--mono', p.invalid && 'ifs-control--invalid',
      p.disabled && 'ifs-control--disabled', p.readOnly && !p.disabled && 'ifs-control--readonly', extra);
  }

  /* Nested items: icon buttons, shortcut hints and clear buttons inside a field sit in one group at its end. Each takes a square slot
     of --nested (28px in a 36px field, 24px in a small one, 32px in a large one), 4px from the field's outer edge on every side, so the
     field's end padding drops to 3px beside the group. Slots are 4px apart; the group and the field's text stay 8px apart like any
     neighbors in the field. A Kbd, or anything else 18px tall, centers in its slot with the same space on every side. */
  function nestedGroup(items) {
    var slots = items.filter(function (x) { return x != null && x !== false; }).map(function (x, i) { return h('span', { key: i, className: 'ifs-control__slot' }, x); });
    return slots.length ? h('span', { className: 'ifs-control__actions' }, slots) : null;
  }

  var Input = React.forwardRef(function Input(p, ref) {
    var rest = omit(p, ['size', 'mono', 'icon', 'invalid', 'trailing', 'className', 'style', 'kbd', 'multiline']);
    var lead = p.icon ? h(Icon, { name: p.icon, size: 16, strokeWidth: 1.8 }) : p.readOnly ? h(Icon, { name: 'lock', size: 15, strokeWidth: 1.8 }) : null;
    var el = p.multiline
      ? h('textarea', Object.assign({ ref: ref, spellCheck: false, 'aria-invalid': p.invalid || undefined }, rest))
      : h('input', Object.assign({ ref: ref, type: 'text', autoComplete: 'off', spellCheck: false, 'aria-invalid': p.invalid || undefined }, rest));
    var group = p.multiline ? null : nestedGroup([p.kbd ? h(Kbd, { keys: p.kbd, size: 'sm' }) : null].concat(p.trailing == null ? [] : React.Children.toArray(p.trailing)));
    return h('div', { className: controlClass(p, cx(p.multiline && 'ifs-control--textarea', group && 'ifs-control--trail', p.className)), style: p.style }, lead, el, group, p.multiline ? p.trailing : null);
  });
  Input.ifsControl = true;

  function CopyButton(p) {
    var s = useState(false), copied = s[0], setCopied = s[1];
    var t = useRef(null);
    useEffect(function () { return function () { clearTimeout(t.current); }; }, []);
    function copy() {
      try { if (navigator.clipboard) navigator.clipboard.writeText(String(p.value)); } catch (e) { /* clipboard blocked */ }
      setCopied(true); clearTimeout(t.current); t.current = setTimeout(function () { setCopied(false); }, 1200);
      if (p.onCopy) p.onCopy(p.value);
    }
    var label = copied ? 'Copied' : (p.label || 'Copy value');
    var btn = h('button', { type: 'button', className: cx('ifs-iconbtn', p.className), 'aria-label': label, onClick: copy }, h(Icon, { name: copied ? 'check' : 'copy', size: 16 }));
    // the status sits beside the button so "Copied" is announced; ifs-sr takes it out of the layout
    return h(React.Fragment, null, p.tooltip ? h(Tooltip, { content: label }, btn) : btn, h('span', { className: 'ifs-sr', role: 'status' }, copied ? 'Copied' : ''));
  }

  function SecretInput(p) {
    var s = useState(!!p.defaultRevealed), shown = s[0], setShown = s[1];
    var val = p.value == null ? '' : String(p.value);
    var masked = new Array((p.maskLength || 18) + 1).join('\u2022');
    return h('div', { id: p.id, className: cx('ifs-control ifs-control--trail', p.size === 'sm' && 'ifs-control--sm', p.size === 'lg' && 'ifs-control--lg', p.invalid && 'ifs-control--invalid', p.className) },
      h('span', { role: 'textbox', 'aria-readonly': true, 'aria-label': p['aria-label'] || 'Secret value', 'aria-describedby': p['aria-describedby'], className: shown ? 'ifs-control__value' : 'ifs-control__masked' }, shown ? val : masked),
      nestedGroup([h('button', { type: 'button', className: 'ifs-iconbtn', 'aria-label': shown ? 'Hide value' : 'Reveal value', 'aria-pressed': shown, onClick: function () { setShown(!shown); } }, h(Icon, { name: 'eye', size: 16 })),
        p.copyable === false ? null : h(CopyButton, { value: val, onCopy: p.onCopy })]));
  }
  SecretInput.ifsControl = true;

  var InputGroup = React.forwardRef(function InputGroup(p, ref) {
    var rest = omit(p, ['prefix', 'suffix', 'icon', 'kbd', 'action', 'copyValue', 'size', 'mono', 'invalid', 'className', 'style']);
    var group = nestedGroup([p.kbd ? h(Kbd, { keys: p.kbd, size: 'sm' }) : null, p.copyValue != null ? h(CopyButton, { value: p.copyValue }) : null]);
    var ctl = h('div', { className: controlClass(p, cx(group && 'ifs-control--trail', !p.action && p.className)), style: p.action ? undefined : p.style },
      p.prefix != null ? h('span', { className: 'ifs-control__addon ifs-control__addon--start' }, p.prefix) : null,
      p.icon ? h(Icon, { name: p.icon, size: 16, strokeWidth: 1.8 }) : null,
      h('input', Object.assign({ ref: ref, type: 'text', autoComplete: 'off', spellCheck: false, 'aria-invalid': p.invalid || undefined }, rest)),
      group,
      p.suffix != null ? h('span', { className: 'ifs-control__addon ifs-control__addon--end' }, p.suffix) : null);
    if (!p.action) return ctl;
    return h('div', { className: cx('ifs-inputgroup', p.className), style: p.style }, ctl, p.action);
  });
  InputGroup.ifsControl = true;

  /* ------------------------------------------------------------ Select */
  function Select(p) {
    var opts = p.options || [];
    var s = useControllable(p.value, p.defaultValue, p.onChange), val = s[0], setVal = s[1];
    var o = useState(!!p.defaultOpen), open = o[0], setOpen = o[1];
    var a = useState(-1), active = a[0], setActive = a[1];
    var wrap = useRef(null), trig = useRef(null), list = useRef(null), byUser = useRef(false);
    var gen = useId(), cid = p.id || gen;
    var cur = null;
    opts.forEach(function (x) { if (x.value === val) cur = x; });
    function dis(i) { return !!opts[i].disabled; }
    useDismiss(wrap, open, function () { setOpen(false); });
    useEffect(function () { if (open && byUser.current) focusEl(list.current); if (!open) byUser.current = false; }, [open]);
    useEffect(function () {
      if (!open) return;
      var i = -1; opts.forEach(function (x, k) { if (x.value === val) i = k; });
      setActive(i >= 0 ? i : nextIndex(-1, 1, opts, dis));
    }, [open]);
    function openList() { if (p.disabled) return; byUser.current = true; setOpen(true); }
    function pick(i) { var x = opts[i]; if (!x || x.disabled) return; setVal(x.value); setOpen(false); focusEl(trig.current); }
    function onTrigKey(e) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].indexOf(e.key) >= 0) { e.preventDefault(); openList(); } }
    function onListKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(nextIndex(active, 1, opts, dis)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(nextIndex(active, -1, opts, dis)); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(nextIndex(-1, 1, opts, dis)); }
      else if (e.key === 'End') { e.preventDefault(); setActive(nextIndex(-1, -1, opts, dis)); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); focusEl(trig.current); }
      else if (e.key === 'Tab') setOpen(false);
    }
    var shownLabel = cur ? cur.label : (p.placeholder || 'Choose');
    var content = p.label
      ? h('span', { className: 'ifs-select-trigger__stack' }, h('small', null, p.label), h('span', { className: cur ? undefined : 'ifs-select-trigger__placeholder' }, shownLabel))
      : h('span', { className: cx('ifs-select-trigger__value', !cur && 'ifs-select-trigger__placeholder') }, shownLabel);
    var trigger = h('button', {
      ref: trig, type: 'button', id: cid, disabled: p.disabled,
      className: cx('ifs-control ifs-select-trigger', p.size === 'sm' && 'ifs-control--sm', p.label && 'ifs-control--lg', open && 'ifs-control--open', p.disabled && 'ifs-control--disabled', p.invalid && 'ifs-control--invalid'),
      'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': open ? cid + '-list' : undefined,
      'aria-label': p['aria-label'], 'aria-describedby': p['aria-describedby'],
      onClick: function () { if (open) setOpen(false); else openList(); }, onKeyDown: onTrigKey,
    }, content, h(Icon, { name: 'chev-ud', size: 16, strokeWidth: 1.8, style: { color: 'var(--muted)' } }));
    var rows = [], lastGroup;
    opts.forEach(function (x, i) {
      if (x.group && x.group !== lastGroup) { rows.push(h('div', { key: 'g' + i, role: 'presentation', className: 'ifs-menu-label' }, x.group)); lastGroup = x.group; }
      var sel = x.value === val;
      rows.push(h('div', {
        key: String(x.value), id: cid + '-o' + i, role: 'option', 'aria-selected': sel, 'aria-disabled': x.disabled || undefined,
        className: cx('ifs-option', i === active && 'ifs-option--active'),
        onMouseEnter: function () { if (!x.disabled) setActive(i); }, onMouseDown: function (e) { e.preventDefault(); }, onClick: function () { pick(i); },
      }, h('span', { className: 'ifs-option__label' }, x.label), x.description ? h('span', { className: 'ifs-option__meta' }, x.description) : null,
        sel ? h(Icon, { name: 'check', size: 15, strokeWidth: 2.2, className: 'ifs-option__check', style: { marginLeft: x.description ? 0 : 'auto' } }) : null));
    });
    return h('div', { ref: wrap, className: cx('ifs-anchor ifs-anchor--block', p.className), style: p.style }, trigger, open && h('div', {
      ref: list, id: cid + '-list', role: 'listbox', tabIndex: -1, 'aria-activedescendant': active >= 0 ? cid + '-o' + active : undefined,
      className: cx('ifs-pop', p.align === 'end' && 'ifs-pop--end'), onKeyDown: onListKey, style: p.menuWidth ? { width: p.menuWidth } : undefined,
    }, rows));
  }
  Select.ifsControl = true;

  /* ------------------------------------------------------------ Combobox */
  function Combobox(p) {
    var multiple = !!p.multiple, opts = p.options || [];
    var s = useControllable(p.value, p.defaultValue !== undefined ? p.defaultValue : (multiple ? [] : null), p.onChange), val = s[0], setVal = s[1];
    var q0 = useState(p.defaultQuery || ''), query = q0[0], setQuery = q0[1];
    var o = useState(!!p.defaultOpen), open = o[0], setOpen = o[1];
    var a = useState(0), active = a[0], setActive = a[1];
    var wrap = useRef(null), input = useRef(null);
    var gen = useId(), cid = p.id || gen;
    useDismiss(wrap, open, function () { setOpen(false); });
    var q = query.trim().toLowerCase();
    var shown = opts.filter(function (x) { return !q || String(x.label).toLowerCase().indexOf(q) >= 0; });
    var exact = opts.some(function (x) { return String(x.label).toLowerCase() === q; });
    var rows = shown.map(function (x) { return { kind: 'opt', o: x }; });
    if (p.onCreate && q && !exact) rows.push({ kind: 'create' });
    var selArr = multiple ? (val || []) : [];
    function isSel(x) { return multiple ? selArr.indexOf(x.value) >= 0 : val === x.value; }
    function labelOf(v) { var f = null; opts.forEach(function (x) { if (x.value === v) f = x.label; }); return f == null ? v : f; }
    function choose(r) {
      if (!r) return;
      if (r.kind === 'create') { p.onCreate(query.trim()); setQuery(''); return; }
      var x = r.o;
      if (multiple) { var cur = selArr.slice(), k = cur.indexOf(x.value); if (k >= 0) cur.splice(k, 1); else cur.push(x.value); setVal(cur); setQuery(''); }
      else { setVal(x.value); setQuery(String(x.label)); setOpen(false); }
    }
    function onKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setActive(Math.min(active + 1, rows.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, 0)); }
      else if (e.key === 'Enter') { if (open && rows[active]) { e.preventDefault(); choose(rows[active]); } }
      else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); } else if (query) setQuery(''); }
      else if (e.key === 'Backspace' && multiple && !query && selArr.length) { setVal(selArr.slice(0, -1)); }
    }
    function mark(label) {
      var str = String(label); if (!q) return str;
      var i = str.toLowerCase().indexOf(q); if (i < 0) return str;
      return [str.slice(0, i), h('mark', { key: 'm' }, str.slice(i, i + q.length)), str.slice(i + q.length)];
    }
    var inputEl = h('input', {
      ref: input, id: cid, role: 'combobox', type: 'text', autoComplete: 'off', spellCheck: false, value: query, placeholder: p.placeholder,
      'aria-expanded': open, 'aria-controls': cid + '-list', 'aria-autocomplete': 'list', 'aria-label': p['aria-label'], 'aria-describedby': p['aria-describedby'],
      'aria-activedescendant': open && rows[active] ? cid + '-r' + active : undefined, disabled: p.disabled,
      onChange: function (e) { setQuery(e.target.value); setActive(0); setOpen(true); }, onFocus: function () { setOpen(true); }, onKeyDown: onKey,
    });
    var control = multiple
      ? h('div', { className: cx('ifs-control ifs-chips', p.invalid && 'ifs-control--invalid'), onClick: function () { focusEl(input.current); } },
        selArr.map(function (v) {
          return h('span', { key: String(v), className: 'ifs-chip' }, labelOf(v), h('button', { type: 'button', 'aria-label': 'Remove ' + labelOf(v), onClick: function (e) { e.stopPropagation(); setVal(selArr.filter(function (z) { return z !== v; })); } }, h(Icon, { name: 'x', size: 12, strokeWidth: 2 })));
        }), inputEl)
      : h('div', { className: cx('ifs-control', p.invalid && 'ifs-control--invalid', query && 'ifs-control--trail') }, h(Icon, { name: p.icon || 'search', size: 16, strokeWidth: 1.8 }), inputEl,
        nestedGroup([query ? h('button', { type: 'button', className: 'ifs-iconbtn', 'aria-label': 'Clear', onClick: function () { setQuery(''); if (!multiple) setVal(null); focusEl(input.current); } }, h(Icon, { name: 'x', size: 15, strokeWidth: 1.9 })) : null]));
    var list = open ? h('div', { id: cid + '-list', role: 'listbox', 'aria-multiselectable': multiple || undefined, className: 'ifs-pop' },
      rows.length === 0 ? h('div', { className: 'ifs-option', 'aria-disabled': true, role: 'presentation' }, p.emptyText || 'No matches') :
        rows.map(function (r, i) {
          var common = { key: r.kind === 'opt' ? String(r.o.value) : '__create', id: cid + '-r' + i, className: cx('ifs-option', i === active && 'ifs-option--active'), onMouseEnter: function () { setActive(i); }, onMouseDown: function (e) { e.preventDefault(); }, onClick: function () { choose(r); } };
          if (r.kind === 'create') return h('div', Object.assign({ role: 'option', 'aria-selected': false }, common), h(Icon, { name: 'plus', size: 16 }), h('span', { className: 'ifs-option__label' }, 'Create ', h('span', { className: 'ifs-mono' }, query.trim())));
          var sel = isSel(r.o);
          return h('div', Object.assign({ role: 'option', 'aria-selected': sel }, common),
            multiple ? h('span', { className: 'ifs-checkbox', 'aria-hidden': true, 'aria-checked': sel ? 'true' : 'false', style: { cursor: 'inherit' } }, sel ? h(Icon, { name: 'check', size: 13, strokeWidth: 2.6 }) : null) : null,
            h('span', { className: cx('ifs-option__label', p.mono && 'ifs-mono') }, mark(r.o.label)),
            r.o.meta != null ? h('span', { className: 'ifs-option__meta ifs-option__meta--mono' }, r.o.meta) : null);
        })) : null;
    return h('div', { ref: wrap, className: cx('ifs-anchor ifs-anchor--block', p.className), style: p.style }, control, list);
  }
  Combobox.ifsControl = true;

  /* ------------------------------------------------------------ MultiSelect */
  /* Pick several values (or one) from a known list, without typing. The trigger is a button, never an input: by default it looks
     like a Select and summarizes the picks ("Production +2", or `allLabel` when everything is on), and `renderValue` or a custom
     `trigger` element can show anything else. The list is a listbox with a check per option and, when several can be picked, a bar
     with the count and quick Select all and Deselect all. Picks apply at once and the list stays open until Escape, a click
     outside or Tab. */
  function MultiSelect(p) {
    var multiple = p.multiple !== false, opts = p.options || [];
    var s = useControllable(p.value, p.defaultValue !== undefined ? p.defaultValue : (multiple ? [] : null), p.onChange), val = s[0], setVal = s[1];
    var os = useControllable(p.open, !!p.defaultOpen, p.onOpenChange), open = os[0], setOpenState = os[1];
    var a = useState(-1), active = a[0], setActive = a[1];
    var wrap = useRef(null), trig = useRef(null), list = useRef(null), byUser = useRef(false), typed = useRef({ q: '', t: 0 });
    var gen = useId(), cid = p.id || gen;
    useEdgeFade(list, [open]);
    var sel = multiple ? (Array.isArray(val) ? val : []) : (val == null ? [] : [val]);
    function on(x) { return sel.indexOf(x.value) >= 0; }
    function dis(i) { return !!opts[i].disabled; }
    var enabled = opts.filter(function (x) { return !x.disabled; });
    var nOn = opts.filter(on).length;
    var allOn = enabled.length > 0 && enabled.every(on), noneOn = !enabled.some(on);

    function close(refocus) { setOpenState(false); if (refocus) focusEl(trig.current); }
    useDismiss(wrap, open, function () { close(false); });
    useEffect(function () { if (open && byUser.current) focusEl(list.current); if (!open) byUser.current = false; }, [open]);
    useEffect(function () {
      if (!open) return;
      var i = -1; opts.forEach(function (x, k) { if (i < 0 && on(x)) i = k; });
      setActive(i >= 0 ? i : nextIndex(-1, 1, opts, dis));
    }, [open]);
    useEffect(function () {
      if (!open || active < 0 || !list.current) return;
      var el = document.getElementById(cid + '-o' + active);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

    // values keep the options' order, so summaries and chips read the same way every time
    function commit(test) { var next = opts.filter(test).map(function (x) { return x.value; }); setVal(multiple ? next : (next[0] != null ? next[0] : null)); }
    function toggle(i) {
      var x = opts[i]; if (!x || x.disabled) return;
      if (!multiple) { setVal(on(x) && p.clearable ? null : x.value); close(true); return; }
      var was = on(x);
      commit(function (o) { return o.value === x.value ? !was : on(o); });
    }
    function selectAll() { commit(function (o) { return o.disabled ? on(o) : true; }); }
    function deselectAll() { commit(function (o) { return o.disabled ? on(o) : false; }); }
    function openList() { if (p.disabled) return; byUser.current = true; setOpenState(true); }

    function onTrigKey(e) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].indexOf(e.key) >= 0) { e.preventDefault(); openList(); } }
    function onListKey(e) {
      var k = e.key;
      if (k === 'ArrowDown') setActive(nextIndex(active, 1, opts, dis));
      else if (k === 'ArrowUp') setActive(nextIndex(active, -1, opts, dis));
      else if (k === 'Home') setActive(nextIndex(-1, 1, opts, dis));
      else if (k === 'End') setActive(nextIndex(-1, -1, opts, dis));
      else if (k === 'Enter' || k === ' ') { if (active >= 0) toggle(active); }
      else if (k === 'Escape') { e.stopPropagation(); close(true); }
      else if (multiple && (k === 'a' || k === 'A') && (e.metaKey || e.ctrlKey)) { if (allOn) deselectAll(); else selectAll(); }
      else if (k.length === 1 && /\S/.test(k) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        var now = Date.now(), tq = typed.current;
        tq.q = now - tq.t < 600 ? tq.q + k.toLowerCase() : k.toLowerCase(); tq.t = now;
        var from = active < 0 ? 0 : active + (tq.q.length > 1 ? 0 : 1), hit = -1;
        for (var n = 0; n < opts.length && hit < 0; n++) {
          var j = (from + n) % opts.length;
          if (!opts[j].disabled && String(opts[j].label).toLowerCase().indexOf(tq.q) === 0) hit = j;
        }
        if (hit < 0) return;
        setActive(hit);
      } else return;
      e.preventDefault();
    }
    // Tab (or Shift+Tab past the bar) moves focus out and closes the list
    function onBlur(e) { if (open && wrap.current && !wrap.current.contains(e.relatedTarget)) close(false); }

    var chosen = opts.filter(on);
    function summary() {
      if (p.renderValue) return p.renderValue(chosen.map(function (x) { return x.value; }), chosen);
      if (!chosen.length) return h('span', { className: 'ifs-select-trigger__value ifs-select-trigger__placeholder' }, p.placeholder || 'Choose');
      if (multiple && allOn && p.allLabel) return h('span', { className: 'ifs-select-trigger__value' }, p.allLabel);
      return h('span', { className: 'ifs-mselect__summary' }, h('span', { className: 'ifs-select-trigger__value' }, chosen[0].label),
        chosen.length > 1 ? h('span', { className: 'ifs-mselect__more', 'aria-label': chosen.length - 1 + ' more' }, '+' + (chosen.length - 1)) : null);
    }
    var trigProps = {
      ref: trig, 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': open ? cid + '-list' : undefined,
    };
    var trigger;
    if (p.trigger) {
      var t = p.trigger;
      trigger = React.cloneElement(t, Object.assign(trigProps, {
        id: t.props.id || p.id, disabled: p.disabled || t.props.disabled,
        onClick: chain(t.props.onClick, function () { if (open) close(false); else openList(); }),
        onKeyDown: chain(t.props.onKeyDown, function (e) { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) { e.preventDefault(); openList(); } }),
      }));
    } else {
      var inner = summary();
      trigger = h('button', Object.assign(trigProps, {
        type: 'button', id: cid, disabled: p.disabled, 'aria-label': p['aria-label'], 'aria-describedby': p['aria-describedby'],
        className: cx('ifs-control ifs-select-trigger', p.size === 'sm' && 'ifs-control--sm', p.label && 'ifs-control--lg', open && 'ifs-control--open', p.disabled && 'ifs-control--disabled', p.invalid && 'ifs-control--invalid'),
        onClick: function () { if (open) close(false); else openList(); }, onKeyDown: onTrigKey,
      }), p.label ? h('span', { className: 'ifs-select-trigger__stack' }, h('small', null, p.label), inner) : inner,
        h(Icon, { name: 'chev-ud', size: 16, strokeWidth: 1.8, style: { color: 'var(--muted)' } }));
    }

    var rows = [], lastGroup;
    opts.forEach(function (x, i) {
      if (x.group && x.group !== lastGroup) { rows.push(h('div', { key: 'g' + i, role: 'presentation', className: 'ifs-menu-label' }, x.group)); lastGroup = x.group; }
      var picked = on(x);
      rows.push(h('div', {
        key: String(x.value), id: cid + '-o' + i, role: 'option', 'aria-selected': picked, 'aria-disabled': x.disabled || undefined,
        className: cx('ifs-option', i === active && 'ifs-option--active'),
        onMouseEnter: function () { if (!x.disabled) setActive(i); }, onMouseDown: function (e) { e.preventDefault(); }, onClick: function () { setActive(i); toggle(i); },
      },
        multiple ? h('span', { className: 'ifs-checkbox', 'aria-hidden': true, 'aria-checked': picked ? 'true' : 'false', style: { cursor: 'inherit' } }, picked ? h(Icon, { name: 'check', size: 13, strokeWidth: 2.6 }) : null) : null,
        h('span', { className: cx('ifs-option__label', p.mono && 'ifs-mono') }, x.label),
        x.description != null ? h('span', { className: cx('ifs-option__meta', p.mono && 'ifs-option__meta--mono') }, x.description) : null,
        !multiple && picked ? h(Icon, { name: 'check', size: 15, strokeWidth: 2.2, className: 'ifs-option__check', style: { marginLeft: x.description != null ? 0 : 'auto' } }) : null));
    });
    var bar = null;
    if (multiple && p.quickActions !== false) {
      bar = h('div', { className: 'ifs-mselect__bar' },
        h('span', { className: 'ifs-mselect__status', 'aria-live': 'polite' }, nOn + ' of ' + opts.length + ' selected'),
        h('button', { type: 'button', className: 'ifs-mselect__quick', disabled: allOn, onMouseDown: function (e) { e.preventDefault(); }, onClick: selectAll }, 'Select all'),
        h('button', { type: 'button', className: 'ifs-mselect__quick', disabled: noneOn, onMouseDown: function (e) { e.preventDefault(); }, onClick: deselectAll }, 'Deselect all'));
    } else if (!multiple && p.clearable) {
      bar = h('div', { className: 'ifs-mselect__bar' }, h('span', { className: 'ifs-mselect__status' }, chosen.length ? '1 selected' : 'None selected'),
        h('button', { type: 'button', className: 'ifs-mselect__quick', disabled: !chosen.length, onMouseDown: function (e) { e.preventDefault(); }, onClick: function () { setVal(null); } }, 'Clear'));
    }
    return h('div', { ref: wrap, className: cx('ifs-anchor', !p.trigger && 'ifs-anchor--block', p.className), style: p.style, onBlur: onBlur }, trigger, open && h('div', {
      className: cx('ifs-pop ifs-mselect__pop', p.align === 'end' && 'ifs-pop--end', p.side === 'top' && 'ifs-pop--up'), style: p.menuWidth ? { width: p.menuWidth } : undefined,
    }, bar, h('div', {
      ref: list, id: cid + '-list', role: 'listbox', tabIndex: -1, 'aria-multiselectable': multiple || undefined, 'aria-label': p.listLabel || p['aria-label'] || p.label,
      'aria-activedescendant': active >= 0 ? cid + '-o' + active : undefined, className: 'ifs-mselect__list ifs-fade-y', onKeyDown: onListKey,
    }, rows)));
  }
  MultiSelect.ifsControl = true;

  /* ------------------------------------------------------------ Checkbox, Switch */
  var Checkbox = React.forwardRef(function Checkbox(p, ref) {
    var s = useControllable(p.checked, !!p.defaultChecked, p.onChange), checked = s[0], setChecked = s[1];
    var state = p.indeterminate ? 'mixed' : checked ? 'true' : 'false';
    var box = h('button', {
      ref: ref, type: 'button', role: 'checkbox', id: p.id, 'aria-checked': state, disabled: p.disabled,
      'aria-label': p.label ? undefined : p['aria-label'], 'aria-labelledby': p.label ? undefined : p['aria-labelledby'], 'aria-describedby': p['aria-describedby'],
      className: cx('ifs-checkbox', !p.label && p.className), onClick: function () { setChecked(p.indeterminate ? true : !checked); },
    }, state === 'true' ? h(Icon, { name: 'check', size: 13, strokeWidth: 2.6 }) : state === 'mixed' ? h(Icon, { name: 'minus', size: 13, strokeWidth: 2.6 }) : null);
    if (!p.label) return box;
    return h('label', { className: cx('ifs-choice', p.disabled && 'ifs-choice--disabled', p.className) }, box,
      h('span', { className: 'ifs-choice__text' }, h('span', { className: 'ifs-choice__label' }, p.label), p.description ? h('span', { className: 'ifs-choice__desc' }, p.description) : null));
  });

  var Switch = React.forwardRef(function Switch(p, ref) {
    var s = useControllable(p.checked, !!p.defaultChecked, p.onChange), checked = s[0], setChecked = s[1];
    var sw = h('button', {
      ref: ref, type: 'button', role: 'switch', id: p.id, 'aria-checked': !!checked, disabled: p.disabled,
      'aria-label': p.label ? undefined : p['aria-label'], 'aria-describedby': p['aria-describedby'],
      className: cx('ifs-switch', p.size === 'sm' && 'ifs-switch--sm', !p.label && p.className), onClick: function () { setChecked(!checked); },
    }, h('span', { className: 'ifs-switch__knob' }));
    if (!p.label) return sw;
    var text = h('span', { className: 'ifs-choice__text' }, h('span', { className: 'ifs-choice__label', style: p.layout === 'row' ? { fontWeight: 600 } : undefined }, p.label), p.description ? h('span', { className: 'ifs-choice__desc' }, p.description) : null);
    if (p.layout === 'row') return h('label', { className: cx('ifs-choice ifs-setting', p.disabled && 'ifs-choice--disabled', p.className) }, text, sw);
    return h('label', { className: cx('ifs-choice', p.disabled && 'ifs-choice--disabled', p.className) }, sw, text);
  });

  /* ------------------------------------------------------------ Badge, Count */
  function Badge(p) {
    var tone = p.tone || 'outline';
    return h('span', { className: cx('ifs-badge', tone !== 'outline' && 'ifs-badge--' + tone, p.size === 'sm' && 'ifs-badge--sm', p.mono && 'ifs-badge--mono', p.className) },
      p.dot ? h('span', { className: 'ifs-badge__dot', 'aria-hidden': true }) : null, p.children);
  }
  function Count(p) { return h('span', { className: cx('ifs-count', p.tone === 'ink' && 'ifs-count--ink', p.className), 'aria-label': p['aria-label'] }, p.children); }

  /* ------------------------------------------------------------ Avatar */
  function initialsOf(name) { if (!name) return ''; return String(name).split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  function Avatar(p) {
    var kind = p.kind || 'person', s = p.size || 32, ic = Math.max(12, Math.round(s * 0.55));
    var inner = kind === 'machine' ? h(Icon, { name: 'machine', size: ic }) : kind === 'agent' ? h(Icon, { name: 'agent', size: ic }) : kind === 'fallback' ? h(Icon, { name: 'user', size: ic }) : (p.initials || initialsOf(p.name));
    var label = p.label || p.name;
    return h('span', {
      role: label ? 'img' : undefined, 'aria-label': label, 'aria-hidden': label ? undefined : true,
      className: cx('ifs-avatar', kind !== 'person' && 'ifs-avatar--' + kind, p.ring && 'ifs-avatar--ring', p.className), style: { '--s': s + 'px' },
    }, inner, p.status ? h('span', { className: 'ifs-avatar__status ifs-avatar__status--' + p.status, 'aria-hidden': true }) : null);
  }
  function AvatarGroup(p) {
    var kids = React.Children.toArray(p.children), max = p.max || kids.length, size = p.size || 32;
    var shown = kids.slice(0, max).map(function (c) { return React.isValidElement(c) ? React.cloneElement(c, { ring: true, size: c.props.size || size }) : c; });
    if (kids.length > max) shown.push(h(Avatar, { key: 'more', kind: 'more', size: size, ring: true, initials: '+' + (kids.length - max), label: (kids.length - max) + ' more' }));
    return h('span', { role: 'group', 'aria-label': p.label, className: cx('ifs-avatars', p.className) }, shown);
  }
  // `media` replaces the Avatar (the organization's avatar beside your name in the Sidebar); `title` replaces the name as the first line.
  function Identity(p) {
    return h(ItemLayout, { as: 'span', className: cx('ifs-identity', p.className), rootProps: { onMouseOver: peekTruncated, 'aria-hidden': p['aria-hidden'] },
      media: p.media != null ? p.media : h(Avatar, { kind: p.kind, name: p.name, initials: p.initials, size: p.size || 32, status: p.status }),
      title: p.title != null ? p.title : p.name, titleClass: p.mono ? 'ifs-mono' : null, description: p.description });
  }

  /* ------------------------------------------------------------ Card, Tile, Media, DataList */
  function Media(p) {
    var size = p.size || 36;
    return h('span', { className: cx('ifs-media', p.tone && 'ifs-media--' + p.tone, p.className), style: { '--s': size + 'px' }, 'aria-hidden': true },
      p.icon ? h(Icon, { name: p.icon, size: size <= 28 ? 14 : 18 }) : p.children);
  }
  // Cards, tiles and items handle overflow the way tables do: text keeps a floor (size-text-min), buttons and badges keep their
  // width and wrap to the next line instead of squeezing it, and anything truncated shows its full text on hover (peekTruncated).
  // A plain card's header and a tile are Items (the layout) inside the card's own box.
  function Card(p) {
    if (p.variant === 'plain') {
      return h('section', { className: cx('ifs-card ifs-card--plain', p.className), 'aria-label': typeof p.title === 'string' ? p.title : undefined, onMouseOver: peekTruncated },
        (p.title || p.media) ? h('div', { className: 'ifs-card__head' },
          h(ItemLayout, { className: 'ifs-card__item', media: p.media, title: p.title, description: p.description, meta: p.action, truncate: false })) : null,
        p.children != null ? h('div', { className: 'ifs-card__content' }, p.children) : null,
        p.footer ? h('div', { className: 'ifs-card__footer' }, p.footer) : null);
    }
    var headless = !p.title && !p.action;
    return h('section', { className: cx('ifs-card', headless && 'ifs-card--headless', p.className), 'aria-label': typeof p.title === 'string' ? p.title : undefined, onMouseOver: peekTruncated },
      headless ? null : h('div', { className: 'ifs-card__head' }, h('span', { className: 'ifs-card__title' }, p.title), p.action ? h('span', { className: 'ifs-card__action' }, p.action) : null),
      h('div', { className: cx('ifs-card__body', p.flush && 'ifs-card__body--flush') }, p.children));
  }
  function Tile(p) {
    return h(ItemLayout, { as: 'button', className: cx('ifs-tile', p.className),
      rootProps: { type: 'button', 'aria-pressed': !!p.selected, onClick: p.onClick, disabled: p.disabled, onMouseOver: peekTruncated },
      media: p.media, title: p.title, description: p.description,
      actions: p.selected ? h('span', { className: 'ifs-checkbox', 'aria-hidden': true, 'aria-checked': 'true', style: { cursor: 'inherit', marginTop: 0 } }, h(Icon, { name: 'check', size: 13, strokeWidth: 2.6 }))
        : h(Icon, { name: 'chev-right', size: 16, strokeWidth: 1.8 }) });
  }
  function DataList(p) {
    var items = p.items || [];
    if (p.variant === 'props') {
      return h('dl', { className: cx('ifs-props', p.className) }, items.map(function (it, i) { return h('div', { key: i, className: 'ifs-props__row' }, h('dt', null, it[0]), h('dd', null, it[1])); }));
    }
    if (p.variant === 'meta') {
      return h('dl', { className: cx('ifs-meta', p.className), onMouseOver: peekTruncated }, items.map(function (it, i) { return h(React.Fragment, { key: i }, h('dt', null, it[0]), h('dd', null, it[1])); }));
    }
    return h('dl', { className: cx('ifs-dl', p.className), onMouseOver: peekTruncated }, items.map(function (it, i) { return h('div', { key: i, className: 'ifs-dl__row' }, h('dt', null, it[0]), h('dd', null, it[1])); }));
  }

  /* ------------------------------------------------------------ Item, the layout
     Item lays out one object: a lead (media); the text, whose first line holds the title, an optional badge and the quiet meta at its
     end, then a description, an error line and extra body; and the actions. It owns spacing, alignment and the overflow rules and
     nothing else, and it never draws a box: the text keeps size-text-min (160px); media, badges, meta and buttons keep their width; the
     title truncates before the meta, and the actions drop under the text when they cannot share its line. Card's plain header, Tile and Identity are Items inside their own boxes. Inside a List an Item becomes
     a row and takes the list's behavior (link or button rows, current, checked, disabled). */
  var ListCtx = React.createContext(null);
  function ItemLayout(p) {
    var size = p.size === 'sm' ? 'sm' : 'md';
    var Root = p.as || 'div';
    var box = Root === 'button' || Root === 'span' || Root === 'a' ? 'span' : 'div';
    var sm = size === 'sm';
    var kids = [p.unread ? h('span', { key: 'u', className: 'ifs-sr' }, 'Unread, ') : null, h(React.Fragment, { key: 't' }, p.title)];
    var title = p.link
      ? h(p.link.href != null ? 'a' : 'button', Object.assign({ className: cx('ifs-item__title ifs-item__target', p.titleClass), id: p.titleId }, p.link.props), kids)
      : h('span', { className: cx('ifs-item__title', p.titleClass), id: p.titleId }, kids);
    var meta = p.meta == null || p.meta === false ? null
      : h('span', { className: 'ifs-item__meta' }, typeof p.meta === 'string' || typeof p.meta === 'number' ? h('span', { className: 'ifs-item__meta-text' }, p.meta) : p.meta);
    return h(Root, Object.assign({ className: cx('ifs-item', 'ifs-item--' + size, p.truncate === false && 'ifs-item--wrap', p.unread && 'ifs-item--unread', !sm && p.actions && p.actionsBelow && 'ifs-item--actions-below', p.className) }, p.rootProps),
      p.check || null,
      p.media != null ? h('span', { className: 'ifs-item__lead' }, p.media) : null,
      h(box, { className: 'ifs-item__main' },
        h(box, { className: 'ifs-item__text' },
          h('span', { className: 'ifs-item__head' }, p.unread ? h('span', { className: 'ifs-item__dot', 'aria-hidden': true }) : null, title,
            p.badge != null ? h('span', { className: 'ifs-item__badge' }, p.badge) : null, meta),
          !sm && p.description != null ? h('span', { className: 'ifs-item__desc' }, p.description) : null,
          !sm && p.error != null ? h('span', { className: 'ifs-item__error', role: 'status' }, h(Icon, { name: 'alert-c', size: 14 }), h('span', null, p.error)) : null,
          !sm && p.body != null ? h(box, { className: 'ifs-item__body' }, p.body) : null),
        p.actions ? h(box, { className: 'ifs-item__actions' }, p.actions) : null));
  }
  function Item(p) {
    var ctx = React.useContext(ListCtx);
    var size = p.size || (p.variant === 'compact' ? 'sm' : ctx && ctx.size) || 'md';
    var titleId = useId();
    var value = p.value;
    var checkable = !!(ctx && ctx.selection === 'multiple' && value != null);
    var locked = !!p.disabled || p.selectable === false;
    var checked = checkable && ctx.isChecked(value);
    var register = ctx && ctx.register;
    useEffect(function () { if (checkable && !locked && register) return register(value); return undefined; }, [checkable, value, locked]);
    var current = !!(p.current || p.selected);
    var clickable = p.href != null || !!p.onClick;
    var link = null;
    if (clickable) {
      var tp = { onClick: p.disabled ? undefined : p.onClick };
      if (p.href != null) {
        if (p.disabled) tp['aria-disabled'] = 'true';
        else { tp.href = p.href; if (p.target) tp.target = p.target; if (p.rel) tp.rel = p.rel; }
        if (current) tp['aria-current'] = p.currentType || 'page';
      } else {
        tp.type = 'button'; tp.disabled = p.disabled;
        if (current) tp['aria-current'] = p.currentType || 'true';
      }
      link = { href: p.href, props: tp };
    }
    // selectable: false keeps a row openable but out of the selection (an owner who cannot be removed); its checkbox stays, disabled
    var stretch = checkable && !clickable && !locked;
    var check = checkable ? h('span', { className: cx('ifs-item__check', stretch && 'ifs-item__check--stretch') },
      h(Checkbox, { checked: checked, disabled: locked, 'aria-labelledby': titleId, onChange: function () { ctx.toggle(value); } })) : null;
    var media = p.media != null ? p.media : p.icon ? h(Media, { icon: p.icon, size: size === 'sm' ? 24 : 40, tone: p.tone }) : null;
    // earlier names keep working: trail is meta; a compact row's children are its badge; selected is current
    var badge = p.badge != null ? p.badge : size === 'sm' ? p.children : null;
    // actionsPlacement: 'end' puts actions beside the text (under it when they cannot share a line); 'below' always gives them their own row
    var placement = p.actionsPlacement || (ctx && ctx.actionsPlacement) || 'end';
    var props = { size: size, check: check, media: media, title: p.title, titleId: titleId, link: link, badge: badge, description: p.description, error: p.error,
      body: size === 'sm' ? null : p.children, meta: p.meta != null ? p.meta : p.trail, actions: p.actions, actionsBelow: placement === 'below', truncate: p.truncate, unread: p.unread };
    if (!ctx) {
      return h(ItemLayout, Object.assign(props, { as: p.as, className: cx('ifs-item--standalone', clickable && 'ifs-item--linked', p.className),
        rootProps: { onMouseOver: peekTruncated, 'aria-current': !clickable && current ? 'true' : undefined } }));
    }
    return h('li', { className: cx('ifs-list__row', 'ifs-list__row--' + size, (clickable || stretch) && !p.disabled && 'ifs-list__row--interactive', current && 'ifs-list__row--current',
        checked && 'ifs-list__row--checked', p.resolved && 'ifs-list__row--resolved', p.disabled && 'ifs-list__row--disabled', p.className),
      'aria-current': !clickable && current ? 'true' : undefined }, h(ItemLayout, props));
  }

  /* ------------------------------------------------------------ List, the behavior
     List owns how its rows behave, the way Table does for its rows: framed, plain or bare; md or sm rows; rows that are links (href)
     or buttons (onClick), with one current row; multiple selection with a checkbox per row (a row with no link toggles anywhere);
     disabled and resolved rows; sections; loading rows; an empty state; a footer. Arrow keys, Home and End move between the rows'
     primary targets; Tab still reaches every row action. A link or button row stretches its title over the row, so the row is one
     target while its badge, meta and actions stay separately clickable. */
  var LIST_PRIMARY = '.ifs-item__target, .ifs-item__check--stretch .ifs-checkbox';
  function listKeys(e) {
    var k = e.key;
    if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Home' && k !== 'End') return;
    var t = e.target;
    if (!t || !t.matches || !t.matches(LIST_PRIMARY)) return;
    var all = Array.prototype.filter.call(e.currentTarget.querySelectorAll(LIST_PRIMARY), function (el) { return !el.disabled && el.getAttribute('aria-disabled') !== 'true'; });
    var i = all.indexOf(t);
    if (i < 0) return;
    var n = k === 'Home' ? 0 : k === 'End' ? all.length - 1 : k === 'ArrowDown' ? Math.min(all.length - 1, i + 1) : Math.max(0, i - 1);
    e.preventDefault();
    if (all[n] !== t) all[n].focus();
  }
  var SKEL_W = [184, 132, 212, 156, 176];
  function skeletonRows(n, size) {
    var out = [], sm = size === 'sm';
    for (var i = 0; i < n; i++) {
      out.push(h('li', { key: 'sk' + i, className: 'ifs-list__row ifs-list__row--' + size + ' ifs-list__row--loading', 'aria-hidden': true },
        h(ItemLayout, { size: size, media: h(Skeleton, { width: sm ? 24 : 40, height: sm ? 24 : 40 }), title: h(Skeleton, { width: SKEL_W[i % 5], height: 12, style: { maxWidth: '100%' } }),
          description: sm ? null : h(Skeleton, { width: Math.round(SKEL_W[(i + 2) % 5] * 1.25), height: 10, style: { maxWidth: '100%' } }) })));
    }
    return out;
  }
  function List(p) {
    var size = p.size === 'sm' ? 'sm' : 'md';
    var variant = p.variant === 'plain' || p.variant === 'bare' ? p.variant : 'framed';
    var multiple = p.selection === 'multiple';
    var s = useControllable(p.selectedIds, p.defaultSelectedIds || [], p.onSelectionChange), ids = s[0] || [], setIds = s[1];
    var regRef = useRef(null);
    if (!regRef.current) regRef.current = new Map();
    var rv = useState(0), bump = rv[1];
    var register = useCallback(function (id) {
      var m = regRef.current;
      m.set(id, (m.get(id) || 0) + 1); bump(function (x) { return x + 1; });
      return function () { var c = (m.get(id) || 1) - 1; if (c <= 0) m.delete(id); else m.set(id, c); bump(function (x) { return x + 1; }); };
    }, []);
    var ctx = { size: size, actionsPlacement: p.actionsPlacement === 'below' ? 'below' : 'end', selection: multiple ? 'multiple' : 'none', register: register,
      isChecked: function (id) { return ids.indexOf(id) >= 0; },
      toggle: function (id) { setIds(ids.indexOf(id) >= 0 ? ids.filter(function (x) { return x !== id; }) : ids.concat([id])); } };
    var titleId = useId();
    var kids = React.Children.toArray(p.children);
    var rows = kids;
    if (p.loading) rows = rows.concat(skeletonRows(p.loadingRows || 3, size));
    if (!kids.length && !p.loading && p.empty != null) rows = [h('li', { key: 'empty', className: 'ifs-list__empty' }, p.empty)];
    var headed = variant === 'framed' && (p.title != null || p.action != null);
    var selectAll = null;
    if (multiple && headed) {
      var every = Array.from(regRef.current.keys());
      var on = every.filter(function (id) { return ids.indexOf(id) >= 0; }).length;
      selectAll = h(Checkbox, { checked: every.length > 0 && on === every.length, indeterminate: on > 0 && on < every.length, disabled: !every.length, 'aria-label': 'Select all',
        onChange: function () { setIds(on === every.length ? ids.filter(function (x) { return every.indexOf(x) < 0; }) : ids.concat(every.filter(function (x) { return ids.indexOf(x) < 0; }))); } });
    }
    return h(ListCtx.Provider, { value: ctx },
      h('div', { className: cx('ifs-list', 'ifs-list--' + variant, 'ifs-list--' + size, headed && 'ifs-list--headed', p.className), onMouseOver: peekTruncated },
        headed ? h('div', { className: cx('ifs-list__head', selectAll && 'ifs-list__head--select') }, selectAll,
          p.title != null ? h('span', { className: 'ifs-list__title', id: titleId }, p.title) : null,
          p.action != null ? h('span', { className: 'ifs-list__action' }, p.action) : null) : null,
        h('div', { className: 'ifs-list__inner' },
          h('ul', { role: 'list', className: 'ifs-list__rows', 'aria-label': p.label, 'aria-labelledby': !p.label && headed && p.title != null ? titleId : undefined,
            'aria-busy': p.loading ? 'true' : undefined, onKeyDown: listKeys }, rows),
          p.footer != null ? h('div', { className: 'ifs-list__footer' }, p.footer) : null)));
  }
  function ListSection(p) {
    var id = useId();
    return h('li', { className: cx('ifs-list__section', p.className) },
      h('div', { className: 'ifs-list__section-head', id: id }, h('span', { className: 'ifs-list__section-label' }, p.label),
        p.meta != null ? h('span', { className: 'ifs-list__section-meta' }, p.meta) : null),
      h('ul', { role: 'list', className: 'ifs-list__rows', 'aria-labelledby': id }, p.children));
  }
  // ItemGroup is the earlier name for List: variant "compact" is a plain list of sm rows.
  function ItemGroup(p) {
    return h(List, Object.assign({}, p, { variant: p.variant === 'compact' ? 'plain' : p.variant, size: p.size || (p.variant === 'compact' ? 'sm' : undefined) }));
  }

  /* ------------------------------------------------------------ Table */
  // Columns fit their content. The header and every row are subgrids of one grid, so each column is one shared track, as
  // wide as its widest cell and never under the base floor (--size-cell-min, 64px) or the column's own minWidth. `maxWidth`
  // caps a column: its text truncates with an ellipsis and shows in full on hover. `width` fixes a track. When the tracks add
  // up to more than the container, the table scrolls sideways inside its shell instead of squeezing cells.
  // The row inset is two empty edge tracks (--ifs-edge), not row padding: a subgrid's padding is taken out of its first and
  // last tracks, which squeezed fixed edge columns (a 32px actions track left its button 17px). An `actions` column fits its
  // buttons, skips the text floor, and pins to the right edge while the table scrolls sideways.
  var useIsoLayout = React.useLayoutEffect || useEffect;
  var CELL_MIN = 'var(--size-cell-min, 64px)';
  function px(v) { return typeof v === 'number' ? v + 'px' : v; }
  function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }
  function track(c, grow, fixed) {
    if (fixed != null) return px(fixed);
    if (c.width != null) return px(c.width);
    var min = c.minWidth != null ? px(c.minWidth) : CELL_MIN;
    return grow ? 'minmax(' + min + ', 1fr)' : 'minmax(' + min + ', max-content)';
  }
  function asText(v, cls) { return typeof v === 'string' || typeof v === 'number' ? h('span', { className: cls || 'ifs-table__text' }, v) : v; }
  // Truncated text gets its full value as a title while the pointer is on it, so an ellipsis never hides a key for good.
  // Tables and grids use it, and so do cards, tiles, data lists and items.
  var PEEK = '.ifs-table__text, .ifs-table__primary, .ifs-grid__text, .ifs-item__title, .ifs-item__desc, .ifs-item__meta-text, .ifs-card__title, .ifs-list__title, .ifs-list__section-label, .ifs-dl dd, .ifs-meta dd';
  function peekTruncated(e) {
    var el = e.target;
    if (!el || !el.closest) return;
    el = el.closest(PEEK);
    if (!el) return;
    // a tile's name clamps to two lines, so it is cut when taller than its box
    var cut = el.scrollWidth > el.clientWidth + 1 || (!!el.closest('.ifs-tile') && el.scrollHeight > el.clientHeight + 1), t = el.getAttribute('title');
    if (cut && !t) el.setAttribute('title', el.textContent);
    else if (!cut && t != null && t === el.textContent) el.removeAttribute('title');
  }
  // Scroll position, viewport size and scrollbar sizes of a scroll box; updated on scroll and resize.
  function useScrollBox(ref, dep) {
    var st = useState({ top: 0, h: 0, end: true, sbw: 0, sbh: 0, l: false, r: false }), box = st[0], setBox = st[1];
    var measure = useCallback(function () {
      var el = ref.current;
      if (!el) return;
      var n = { top: el.scrollTop, h: el.clientHeight, end: el.scrollTop + el.clientHeight >= el.scrollHeight - 2, sbw: el.offsetWidth - el.clientWidth, sbh: el.offsetHeight - el.clientHeight,
        l: el.scrollLeft > 1, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 };
      setBox(function (b) { for (var k in n) { if (n[k] !== b[k]) return n; } return b; });
    }, []);
    useEffect(function () {
      var el = ref.current;
      if (!el) return undefined;
      measure();
      el.addEventListener('scroll', measure, { passive: true });
      var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
      if (ro) { ro.observe(el); if (el.firstChild) ro.observe(el.firstChild); }
      return function () { el.removeEventListener('scroll', measure); if (ro) ro.disconnect(); };
    }, []);
    useEffect(measure, [dep]);
    return box;
  }
  // The rows a virtual list renders: the ones in view plus `over` on each side.
  function windowOf(count, rowH, box, offset, over) {
    var viewH = box.h || 640, top = Math.max(0, box.top - offset);
    var first = clamp(Math.floor(top / rowH) - over, 0, count);
    return [first, clamp(Math.ceil((top + viewH) / rowH) + over, first, count)];
  }

  function EnvMark(p) {
    return h('span', { role: 'img', 'aria-label': (p.env ? p.env + ': ' : '') + (p.present ? 'set' : 'missing'), className: cx('ifs-env', p.present ? 'ifs-env--ok' : 'ifs-env--miss') },
      h(Icon, { name: p.present ? 'check' : 'minus', size: 12, strokeWidth: 2.4 }));
  }
  function Table(p) {
    var cols = p.columns || [], rows = p.rows || [];
    var getId = p.getRowId || function (r) { return r.id; };
    var sel = !!p.selectable;
    var s = useControllable(p.selectedIds, p.defaultSelectedIds || [], p.onSelectionChange), selected = s[0] || [], setSelected = s[1];
    var variant = p.variant === 'striped' || p.variant === 'bordered' ? p.variant : 'basic';
    var scroll = p.height != null;
    var virtual = !!p.virtual && scroll;
    var rowH = p.rowHeight || 48;
    var more = scroll && p.loadMore ? p.loadMore : null;
    var scRef = useRef(null), headRef = useRef(null);
    var box = useScrollBox(scRef, rows.length);
    // The first column without a fixed width takes spare width, unless a column asks for it with `grow`.
    var growAt = -1;
    if (!cols.some(function (c) { return c.grow; })) cols.some(function (c, i) { if (c.width == null && c.grow !== false && !c.actions) { growAt = i; return true; } return false; });
    var last = cols[cols.length - 1];
    var pinned = !!last && (last.pin != null ? !!last.pin : !!last.actions);
    var tpl = 'var(--ifs-edge) ' + (sel ? 'max-content ' : '') + cols.map(function (c, i) {
      if (c.actions && c.width == null) return 'max-content';
      return track(c, c.grow === true || i === growAt);
    }).join(' ') + ' var(--ifs-edge)';

    var ids = rows.map(getId);
    var n = ids.filter(function (i) { return selected.indexOf(i) >= 0; }).length;
    var all = n > 0 && n === ids.length, mixed = n > 0 && !all;
    function toggle(id) { var cur = selected.slice(), k = cur.indexOf(id); if (k >= 0) cur.splice(k, 1); else cur.push(id); setSelected(cur); }
    function toggleAll() { if (all) setSelected(selected.filter(function (i) { return ids.indexOf(i) < 0; })); else setSelected(selected.concat(ids.filter(function (i) { return selected.indexOf(i) < 0; }))); }
    function capStyle(c) { return c.maxWidth != null && !c.actions ? { maxWidth: px(c.maxWidth) } : undefined; }
    function cellClass(c, i) { return cx('ifs-table__cell', c.align && 'ifs-table__cell--' + c.align, c.actions && 'ifs-table__cell--actions', pinned && i === cols.length - 1 && 'ifs-table__cell--pin'); }
    var sort = p.sort;
    var head = h('div', { ref: headRef, role: 'row', 'aria-rowindex': 1, className: 'ifs-table__row ifs-table__head' },
      sel ? h('span', { role: 'columnheader', className: 'ifs-table__cell ifs-table__cell--check' }, h(Checkbox, { checked: all, indeterminate: mixed, onChange: toggleAll, 'aria-label': 'Select all rows' })) : null,
      cols.map(function (c, ci) {
        var on = sort && sort.key === c.key;
        var inner = asText(c.header);
        if (c.hideHeader || (c.actions && c.hideHeader !== false)) inner = h('span', { className: 'ifs-sr' }, c.header != null ? c.header : 'Actions');
        else if (c.sortable) {
          inner = h('button', { type: 'button', className: 'ifs-table__sort', 'data-active': on ? 'true' : 'false', onClick: function () { if (p.onSortChange) p.onSortChange({ key: c.key, dir: on && sort.dir === 'asc' ? 'desc' : 'asc' }); } },
            asText(c.header), on ? h(Icon, { name: sort.dir === 'desc' ? 'arrow-up' : 'arrow-down', size: 13, strokeWidth: 2 }) : null);
        }
        return h('span', { key: c.key, role: 'columnheader', 'aria-sort': on ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined, className: cellClass(c, ci), style: capStyle(c) }, inner);
      }));
    function renderRow(r, i) {
      var id = getId(r), on = selected.indexOf(id) >= 0;
      return h('div', { key: id, role: 'row', 'aria-rowindex': i + 2, 'aria-selected': sel ? on : undefined, className: cx('ifs-table__row', i % 2 === 1 && 'ifs-table__row--alt'), style: virtual ? { height: rowH } : p.rowHeight ? { minHeight: rowH } : undefined },
        sel ? h('span', { role: 'cell', className: 'ifs-table__cell ifs-table__cell--check' }, h(Checkbox, { checked: on, onChange: function () { toggle(id); }, 'aria-label': 'Select ' + (p.rowLabel ? p.rowLabel(r) : id) })) : null,
        cols.map(function (c, ci) {
          var v = c.render ? c.render(r, i) : r[c.key];
          v = c.primary && !c.render ? h('span', { className: 'ifs-table__primary' }, v) : asText(v);
          return h('span', { key: c.key, role: 'cell', className: cellClass(c, ci), style: capStyle(c) }, v);
        }));
    }
    var kids = [];
    if (!rows.length) kids.push(h('div', { key: 'empty', className: 'ifs-table__empty' }, p.empty || 'Nothing here yet'));
    else {
      var range = virtual ? windowOf(rows.length, rowH, box, headRef.current ? headRef.current.offsetHeight : 40, 6) : [0, rows.length];
      if (range[0] > 0) kids.push(h('div', { key: 'top', className: 'ifs-table__spacer', 'aria-hidden': true, style: { height: range[0] * rowH } }));
      for (var i = range[0]; i < range[1]; i++) kids.push(renderRow(rows[i], i));
      if (range[1] < rows.length) kids.push(h('div', { key: 'end', className: 'ifs-table__spacer', 'aria-hidden': true, style: { height: (rows.length - range[1]) * rowH } }));
    }
    // The viewport fades at an edge where content continues past it: sideways at either end, and at the bottom when
    // rows sit below it or loadMore offers more. A pinned column never fades: content passing under it gets a rule instead.
    var fade = scroll && (!!more || !box.end);
    var scStyle = { height: p.height, '--sbw': box.sbw + 'px', '--sbh': box.sbh + 'px' };
    return h('div', {
      role: 'table', 'aria-label': p.label, 'aria-rowcount': rows.length + 1, 'aria-colcount': cols.length + (sel ? 1 : 0),
      className: cx('ifs-table', variant !== 'basic' && 'ifs-table--' + variant, scroll && 'ifs-table--scroll', more && 'ifs-table--more', fade && 'ifs-table--fade', box.l && 'ifs-table--fade-start', box.r && !pinned && 'ifs-table--fade-end', box.r && pinned && 'ifs-table--under-pin', p.className),
      onMouseOver: peekTruncated,
    },
      h('div', { ref: scRef, className: 'ifs-table__scroll', style: scStyle, tabIndex: scroll ? 0 : undefined, 'aria-label': scroll ? (p.label ? p.label + ', scrollable' : 'Scrollable table') : undefined },
        h('div', { className: 'ifs-table__grid', style: { gridTemplateColumns: tpl } }, head, h('div', { role: 'rowgroup', className: 'ifs-table__body' }, kids))),
      more ? h('div', { className: 'ifs-table__more' }, h(Button, { variant: 'secondary', icon: more.icon || 'arrow-down', loading: more.loading, onClick: more.onClick }, more.label || 'Load more')) : null);
  }

  /* ------------------------------------------------------------ DataGrid */
  // A spreadsheet over rows from a database: typed columns, a row number gutter, one active cell and a rectangular range,
  // keyboard navigation, inline editing, NULL, copy and paste as TSV, resizable columns, and virtual rows. Columns size like
  // Table's: fit their content, floor at --size-cell-min, cap at maxWidth with an ellipsis. A dragged column keeps its width
  // until its edge is double-clicked, which fits it to its content again.
  var GRID_NUM = /^(int2|int4|int8|smallint|integer|bigint|serial|bigserial|numeric|decimal|real|float4|float8|double precision|money)(\(.*\))?$/i;
  var GRID_INT = /^(int2|int4|int8|smallint|integer|bigint|serial|bigserial)$/i;
  var GRID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function gridAlign(c) { return c.align || (GRID_NUM.test(c.type || '') ? 'end' : 'start'); }
  function gridText(c, v, row) {
    if (c.format) return c.format(v, row);
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function gridParse(c, text, row) {
    if (c.parse) return c.parse(text, row);
    var t = String(text), type = (c.type || 'text').toLowerCase().replace(/\(.*\)$/, '');
    if (t === '' && c.nullable && type !== 'text' && type !== 'varchar') return { value: null };
    if (/^null$/i.test(t) && c.nullable) return { value: null };
    if (type === 'bool' || type === 'boolean') {
      if (/^(true|t|yes|y|1)$/i.test(t)) return { value: true };
      if (/^(false|f|no|n|0)$/i.test(t)) return { value: false };
      return { error: 'Use true or false' };
    }
    if (GRID_INT.test(type)) return /^-?\d+$/.test(t.trim()) ? { value: parseInt(t, 10) } : { error: 'Use a whole number' };
    if (GRID_NUM.test(type)) return t.trim() !== '' && isFinite(Number(t)) ? { value: Number(t) } : { error: 'Use a number' };
    if (type === 'uuid') return GRID_UUID.test(t.trim()) ? { value: t.trim().toLowerCase() } : { error: 'Use a UUID' };
    if (type === 'json' || type === 'jsonb') { try { return { value: JSON.parse(t) }; } catch (e) { return { error: 'Use valid JSON' }; } }
    return { value: t };
  }
  function DataGrid(p) {
    var cols = p.columns || [], rows = p.rows || [];
    var getId = p.getRowId || function (r) { return r.id; };
    var rowH = p.rowHeight || 32, R = rows.length - 1, C = cols.length - 1;
    var gid = useId();
    var scRef = useRef(null), headRef = useRef(null), inputRef = useRef(null);
    var box = useScrollBox(scRef, rows.length);
    var a0 = useState(null), active = a0[0], setActiveRaw = a0[1];
    var an = useState(null), anchor = an[0], setAnchor = an[1];
    var e0 = useState(null), editing = e0[0], setEditing = e0[1];
    var w0 = useState({}), widths = w0[0], setWidths = w0[1];
    var drag = useRef(null), follow = useRef(false);
    var selRef = useRef(null), edRef = useRef(null);
    edRef.current = editing;
    function canEdit(c) { return !!p.editable && (c.editable != null ? c.editable : !c.primaryKey); }
    function cellId(r, c) { return gid + '-' + r + '-' + c; }
    var rng = active ? { r0: Math.min(anchor.r, active.r), r1: Math.max(anchor.r, active.r), c0: Math.min(anchor.c, active.c), c1: Math.max(anchor.c, active.c) } : null;
    var multi = !!rng && (rng.r0 !== rng.r1 || rng.c0 !== rng.c1);
    selRef.current = { rng: rng, active: active };
    useEffect(function () {
      if (p.onSelectionChange) p.onSelectionChange(rng ? { rows: [rng.r0, rng.r1], columns: [rng.c0, rng.c1], active: { row: active.r, column: active.c } } : null);
    }, [rng && rng.r0, rng && rng.r1, rng && rng.c0, rng && rng.c1, active && active.r, active && active.c]);
    // Keep the selection inside the rows that exist.
    useEffect(function () {
      if (!active) return;
      if (R < 0) { setActiveRaw(null); setAnchor(null); return; }
      if (active.r > R || anchor.r > R) { setActiveRaw({ r: Math.min(active.r, R), c: active.c }); setAnchor({ r: Math.min(anchor.r, R), c: anchor.c }); }
    }, [R]);
    function select(r, c, extend) {
      if (R < 0) return;
      var cell = { r: clamp(r, 0, R), c: clamp(c, 0, C) };
      if (!extend || !anchor) setAnchor(cell);
      setActiveRaw(cell);
      follow.current = true;
    }
    function selectBlock(r0, c0, r1, c1) { setAnchor({ r: r0, c: c0 }); setActiveRaw({ r: r1, c: c1 }); }
    function focusGrid() { focusEl(scRef.current); }
    // Bring the active cell into view, below the sticky header and right of the sticky gutter.
    useIsoLayout(function () {
      if (!follow.current || !active) return;
      follow.current = false;
      var sc = scRef.current, hh = headRef.current ? headRef.current.offsetHeight : 36;
      if (!sc) return;
      var top = hh + active.r * rowH, bot = top + rowH;
      if (top - hh < sc.scrollTop) sc.scrollTop = top - hh;
      else if (bot > sc.scrollTop + sc.clientHeight) sc.scrollTop = bot - sc.clientHeight;
      var el = document.getElementById(cellId(active.r, active.c)), gut = headRef.current && headRef.current.firstChild;
      if (el) {
        var gw = gut ? gut.offsetWidth : 0, l = el.offsetLeft, rr = l + el.offsetWidth;
        if (l - gw < sc.scrollLeft) sc.scrollLeft = l - gw;
        else if (rr > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = rr - sc.clientWidth;
      }
    });
    function change(list) { if (list.length && p.onCellsChange) p.onCellsChange(list); }
    function changeOf(r, c, value) { var row = rows[r], col = cols[c]; return { rowId: getId(row), rowIndex: r, row: row, key: col.key, value: value, previous: row[col.key] }; }
    function startEdit(r, c, text) {
      var col = cols[c];
      if (!col || !canEdit(col)) return;
      var el = document.getElementById(cellId(r, c));
      var cur = gridText(col, rows[r][col.key], rows[r]);
      var ed = { r: r, c: c, text: text != null ? text : (cur == null ? '' : cur), w: el ? el.offsetWidth : null, error: null };
      edRef.current = ed;
      setEditing(ed);
    }
    // Reads the edit from a ref: the input's blur can fire after a commit or cancel already ended it.
    function commit(move) {
      var ed = edRef.current;
      if (!ed) return true;
      var col = cols[ed.c], row = rows[ed.r];
      var res = gridParse(col, ed.text, row);
      if (res.error) { var bad = Object.assign({}, ed, { error: res.error }); edRef.current = bad; setEditing(bad); if (inputRef.current) inputRef.current.focus(); return false; }
      edRef.current = null;
      setEditing(null);
      if (gridText(col, res.value, row) !== gridText(col, row[col.key], row)) change([changeOf(ed.r, ed.c, res.value)]);
      if (move) select(ed.r + move[0], ed.c + move[1]);
      focusGrid();
      return true;
    }
    function cancel() { edRef.current = null; setEditing(null); focusGrid(); }
    function clearRange() {
      if (!rng || !p.editable) return;
      var list = [];
      for (var r = rng.r0; r <= rng.r1; r++) for (var c = rng.c0; c <= rng.c1; c++) {
        var col = cols[c];
        if (!canEdit(col)) continue;
        var t = (col.type || 'text').toLowerCase();
        var v = col.nullable ? null : (t === 'text' || t === 'varchar' ? '' : undefined);
        if (v !== undefined && rows[r][col.key] !== v) list.push(changeOf(r, c, v));
      }
      change(list);
    }
    function tsv() {
      var out = [];
      for (var r = rng.r0; r <= rng.r1; r++) {
        var line = [];
        for (var c = rng.c0; c <= rng.c1; c++) { var t = gridText(cols[c], rows[r][cols[c].key], rows[r]); line.push(t == null ? '' : t.replace(/[\t\n]/g, ' ')); }
        out.push(line.join('\t'));
      }
      return out.join('\n');
    }
    function paste(text) {
      if (!active || !p.editable) return;
      var lines = String(text).replace(/\r/g, '').replace(/\n$/, '').split('\n'), list = [];
      lines.forEach(function (line, i) {
        line.split('\t').forEach(function (cellText, j) {
          var r = active.r + i, c = active.c + j;
          if (r > R || c > C || !canEdit(cols[c])) return;
          var res = gridParse(cols[c], cellText, rows[r]);
          if (!res.error) list.push(changeOf(r, c, res.value));
        });
      });
      change(list);
      if (list.length) selectBlock(active.r, active.c, Math.min(R, active.r + lines.length - 1), Math.min(C, active.c + lines[0].split('\t').length - 1));
    }
    // Copy and paste go through the document's clipboard events, so they need no clipboard permission.
    useEffect(function () {
      function mine() { return document.activeElement === scRef.current; }
      function onCopy(e) {
        if (!mine() || !selRef.current.rng || !e.clipboardData) return;
        var text = tsv(), cr = selRef.current.rng;
        e.clipboardData.setData('text/plain', text); e.preventDefault();
        if (p.onCopy) p.onCopy(text, (cr.r1 - cr.r0 + 1) * (cr.c1 - cr.c0 + 1));
      }
      function onPaste(e) { if (!mine() || !e.clipboardData) return; e.preventDefault(); paste(e.clipboardData.getData('text/plain')); }
      document.addEventListener('copy', onCopy);
      document.addEventListener('paste', onPaste);
      return function () { document.removeEventListener('copy', onCopy); document.removeEventListener('paste', onPaste); };
    });
    function onKey(e) {
      if (editing || e.target !== scRef.current) return;
      var mod = e.metaKey || e.ctrlKey, k = e.key, sh = e.shiftKey;
      if (!active) {
        if (/^(Arrow|Home|End|Page)/.test(k)) { e.preventDefault(); select(0, 0); }
        return;
      }
      var page = Math.max(1, Math.floor((box.h - rowH) / rowH));
      var go = null;
      if (k === 'ArrowDown') go = [mod ? R : active.r + 1, active.c];
      else if (k === 'ArrowUp') go = [mod ? 0 : active.r - 1, active.c];
      else if (k === 'ArrowRight') go = [active.r, mod ? C : active.c + 1];
      else if (k === 'ArrowLeft') go = [active.r, mod ? 0 : active.c - 1];
      else if (k === 'Home') go = [mod ? 0 : active.r, 0];
      else if (k === 'End') go = [mod ? R : active.r, C];
      else if (k === 'PageDown') go = [active.r + page, active.c];
      else if (k === 'PageUp') go = [active.r - page, active.c];
      if (go) { e.preventDefault(); select(go[0], go[1], sh); return; }
      if (mod && (k === 'a' || k === 'A')) { e.preventDefault(); selectBlock(0, 0, R, C); return; }
      if (k === 'Escape') { if (multi) { e.preventDefault(); setAnchor(active); } return; }
      if (k === 'Enter' || k === 'F2') { e.preventDefault(); if (canEdit(cols[active.c])) startEdit(active.r, active.c); else if (k === 'Enter') select(active.r + (sh ? -1 : 1), active.c); return; }
      if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); clearRange(); return; }
      if (k.length === 1 && !mod && !e.altKey && canEdit(cols[active.c])) { e.preventDefault(); setAnchor(active); startEdit(active.r, active.c, k); }
    }
    function onEditKey(e) {
      if (e.key === 'Enter') { e.preventDefault(); commit([e.shiftKey ? -1 : 1, 0]); }
      else if (e.key === 'Tab') { e.preventDefault(); commit([0, e.shiftKey ? -1 : 1]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    }
    useEffect(function () { if (editing && inputRef.current && document.activeElement !== inputRef.current) { inputRef.current.focus(); var n = inputRef.current.value.length; try { inputRef.current.setSelectionRange(n, n); } catch (x) { /* not a text input */ } } }, [editing && editing.r, editing && editing.c]);
    // Pointer: press a cell, drag to extend, shift-click to extend; the gutter picks rows and a header picks its column.
    useEffect(function () {
      function up() { drag.current = null; }
      document.addEventListener('mouseup', up);
      return function () { document.removeEventListener('mouseup', up); };
    }, []);
    function hit(e) {
      var el = e.target.closest ? e.target.closest('[data-cell]') : null;
      if (!el || !scRef.current.contains(el)) return null;
      var kind = el.getAttribute('data-cell');
      return { kind: kind, r: el.hasAttribute('data-r') ? +el.getAttribute('data-r') : -1, c: el.hasAttribute('data-c') ? +el.getAttribute('data-c') : -1 };
    }
    function onDown(e) {
      if (e.button !== 0) return;
      var t = hit(e);
      if (!t || e.target.closest('.ifs-grid__resize, .ifs-grid__sort, .ifs-grid__input')) return;
      e.preventDefault();
      if (editing && !commit()) return;
      focusGrid();
      if (R < 0 && t.kind !== 'col') return;
      if (t.kind === 'cell') { select(t.r, t.c, e.shiftKey); drag.current = 'cell'; }
      // Whole rows and columns keep the active cell at their start (the first column, the top row).
      else if (t.kind === 'row') { selectBlock(e.shiftKey && anchor ? anchor.r : t.r, C, t.r, 0); drag.current = 'row'; }
      else if (t.kind === 'col' && R >= 0) { selectBlock(R, e.shiftKey && anchor ? anchor.c : t.c, 0, t.c); drag.current = 'col'; }
      else if (t.kind === 'corner' && R >= 0) selectBlock(R, C, 0, 0);
    }
    function onMove(e) {
      if (!drag.current || !anchor) return;
      var t = hit(e);
      if (!t) return;
      if (drag.current === 'cell' && t.kind === 'cell') { if (!active || active.r !== t.r || active.c !== t.c) setActiveRaw({ r: t.r, c: t.c }); }
      else if (drag.current === 'row' && t.r >= 0) setActiveRaw({ r: t.r, c: 0 });
      else if (drag.current === 'col' && t.c >= 0) setActiveRaw({ r: 0, c: t.c });
    }
    function onDbl(e) { var t = hit(e); if (t && t.kind === 'cell') startEdit(t.r, t.c); }
    function startResize(e, c) {
      e.preventDefault(); e.stopPropagation();
      var th = e.currentTarget.parentNode, x0 = e.clientX, w0 = th.offsetWidth, key = cols[c].key, min = cols[c].minWidth || 48, last = w0;
      th.setAttribute('data-resizing', 'true');
      function mv(ev) { last = Math.max(min, Math.round(w0 + ev.clientX - x0)); setWidths(function (w) { var n = Object.assign({}, w); n[key] = last; return n; }); }
      function done() { th.removeAttribute('data-resizing'); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', done); if (p.onColumnResize) p.onColumnResize(key, last); }
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', done);
    }
    function fit(e, c) { e.preventDefault(); e.stopPropagation(); var key = cols[c].key; setWidths(function (w) { var n = Object.assign({}, w); n[key] = 'fit'; return n; }); if (p.onColumnResize) p.onColumnResize(key, null); }
    // A dragged width wins; 'fit' (after a double-click) drops any starting width so the column fits its content again.
    function fixedW(c) { var w = widths[c.key]; return typeof w === 'number' ? w : w === 'fit' ? null : c.width != null ? c.width : null; }
    function capOf(c) { return fixedW(c) == null && c.maxWidth != null ? { maxWidth: px(c.maxWidth) } : undefined; }
    var tpl = 'max-content ' + cols.map(function (c) { var f = fixedW(c); return f != null ? px(f) : track({ minWidth: c.minWidth }, false); }).join(' ') + ' minmax(0, 1fr)';
    var sort = p.sort;
    function inR(r, c) { return !!rng && r >= rng.r0 && r <= rng.r1 && c >= rng.c0 && c <= rng.c1; }
    var head = h('div', { ref: headRef, role: 'row', 'aria-rowindex': 1, className: 'ifs-grid__row ifs-grid__head' },
      h('div', { role: 'columnheader', 'data-cell': 'corner', className: 'ifs-grid__corner', 'aria-label': 'Row number' }),
      cols.map(function (c, ci) {
        var on = sort && sort.key === c.key, picked = !!rng && ci >= rng.c0 && ci <= rng.c1;
        var canSort = !!p.onSortChange && c.sortable !== false;
        return h('div', {
          key: c.key, role: 'columnheader', 'aria-colindex': ci + 2, 'data-cell': 'col', 'data-c': ci, 'aria-sort': on ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined,
          className: cx('ifs-grid__col', gridAlign(c) === 'end' && 'ifs-grid__col--end', picked && 'ifs-grid__col--sel'), style: capOf(c),
        },
          c.primaryKey ? h(Icon, { name: 'key', size: 12, strokeWidth: 2, label: 'Primary key' }) : null,
          h('span', { className: 'ifs-grid__name ifs-grid__text' }, c.name || c.key),
          c.type ? h('span', { className: 'ifs-grid__type' }, c.type) : null,
          canSort ? h('button', { type: 'button', tabIndex: -1, className: 'ifs-grid__sort', 'data-active': on ? 'true' : 'false', 'aria-label': 'Sort by ' + (c.name || c.key),
            onClick: function (e) { e.stopPropagation(); p.onSortChange({ key: c.key, dir: on && sort.dir === 'asc' ? 'desc' : 'asc' }); } },
            h(Icon, { name: on && sort.dir === 'desc' ? 'arrow-up' : 'arrow-down', size: 12, strokeWidth: 2 })) : null,
          h('span', { className: 'ifs-grid__resize', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize ' + (c.name || c.key), onMouseDown: function (e) { startResize(e, ci); }, onDoubleClick: function (e) { fit(e, ci); } }));
      }),
      h('div', { className: 'ifs-grid__fill', 'aria-hidden': true }));
    function renderCell(row, r, c, ci) {
      var id = getId(row), v = row[c.key], text = gridText(c, v, row);
      var isActive = !!active && active.r === r && active.c === ci, sel = inR(r, ci);
      var ed = editing && editing.r === r && editing.c === ci ? editing : null;
      var dirty = !!(p.dirty && p.dirty[id] && Object.prototype.hasOwnProperty.call(p.dirty[id], c.key));
      var style;
      if (ed && ed.w) style = { width: ed.w, minWidth: ed.w, maxWidth: ed.w };
      else style = capOf(c);
      var body;
      if (ed) {
        body = h('input', { ref: inputRef, className: 'ifs-grid__input', value: ed.text, spellCheck: false, autoComplete: 'off', 'aria-label': (c.name || c.key) + ', row ' + ((p.rowNumberStart || 1) + r), 'aria-invalid': ed.error ? true : undefined, title: ed.error || undefined,
          onChange: function (e) { var n = Object.assign({}, ed, { text: e.target.value, error: null }); edRef.current = n; setEditing(n); }, onKeyDown: onEditKey, onBlur: function () { commit(); } });
      } else if (c.render) body = c.render(v, row);
      else body = text === null ? h('span', { className: 'ifs-grid__null' }, 'NULL') : h('span', { className: 'ifs-grid__text' }, text);
      return h('div', {
        key: c.key, id: cellId(r, ci), role: 'gridcell', 'aria-colindex': ci + 2, 'aria-selected': sel, 'aria-readonly': canEdit(c) ? undefined : true, 'data-cell': 'cell', 'data-r': r, 'data-c': ci,
        className: cx('ifs-grid__cell', gridAlign(c) === 'end' && 'ifs-grid__cell--end', sel && multi && !isActive && 'ifs-grid__cell--sel', isActive && 'ifs-grid__cell--active', dirty && 'ifs-grid__cell--dirty', ed && 'ifs-grid__cell--editing', ed && ed.error && 'ifs-grid__cell--invalid'),
        style: style,
      }, body);
    }
    function renderRow(row, r) {
      var picked = !!rng && r >= rng.r0 && r <= rng.r1;
      return h('div', { key: getId(row), role: 'row', 'aria-rowindex': r + 2, className: 'ifs-grid__row', style: { height: rowH } },
        h('div', { role: 'rowheader', 'data-cell': 'row', 'data-r': r, className: cx('ifs-grid__num', picked && 'ifs-grid__num--sel') }, (p.rowNumberStart || 1) + r),
        cols.map(function (c, ci) { return renderCell(row, r, c, ci); }),
        h('div', { className: 'ifs-grid__fill', 'aria-hidden': true }));
    }
    var kids = [head];
    if (!rows.length) kids.push(h('div', { key: 'empty', className: 'ifs-grid__empty' }, p.empty || 'No rows'));
    else {
      var range = p.height != null ? windowOf(rows.length, rowH, box, headRef.current ? headRef.current.offsetHeight : 36, 8) : [0, rows.length];
      if (range[0] > 0) kids.push(h('div', { key: 'top', className: 'ifs-grid__spacer', 'aria-hidden': true, style: { height: range[0] * rowH } }));
      for (var i = range[0]; i < range[1]; i++) kids.push(renderRow(rows[i], i));
      if (range[1] < rows.length) kids.push(h('div', { key: 'end', className: 'ifs-grid__spacer', 'aria-hidden': true, style: { height: (rows.length - range[1]) * rowH } }));
    }
    return h('div', { className: cx('ifs-grid', p.className), onMouseOver: peekTruncated },
      h('div', {
        ref: scRef, role: 'grid', tabIndex: 0, 'aria-label': p.label, 'aria-rowcount': rows.length + 1, 'aria-colcount': cols.length + 1, 'aria-multiselectable': true, 'aria-readonly': p.editable ? undefined : true,
        'aria-activedescendant': active && !editing ? cellId(active.r, active.c) : undefined, className: 'ifs-grid__scroll', style: p.height != null ? { height: p.height } : undefined,
        onKeyDown: onKey, onMouseDown: onDown, onMouseMove: onMove, onDoubleClick: onDbl,
      }, h('div', { className: 'ifs-grid__table', style: { gridTemplateColumns: tpl } }, kids)),
      p.footer != null ? h('div', { className: 'ifs-grid__footer' }, p.footer) : null);
  }

  /* ------------------------------------------------------------ Separator */
  function Separator(p) {
    if (p.label) return h('div', { role: 'separator', 'aria-label': p.label, className: cx('ifs-sep-label', p.align === 'center' && 'ifs-sep-label--center', p.className) }, h('span', null, p.label));
    var v = p.orientation === 'vertical';
    return h('div', { role: 'separator', 'aria-orientation': v ? 'vertical' : undefined, className: cx('ifs-sep', v && 'ifs-sep--vertical', p.soft && 'ifs-sep--soft', p.className) });
  }

  /* ------------------------------------------------------------ Tabs */
  var useLayout = React.useLayoutEffect || useEffect;
  var TAB_FADE = 32;
  function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  /* Everything a tablist does besides rendering:
     - one indicator (the segmented thumb or the underline bar) slides and resizes to the current tab (--ifs-slide in bundle.css),
       and is placed without motion on first paint, on resize and when nothing was selected;
     - the list scrolls when it runs out of room, with no scrollbar. A 32px fade shows on each edge that has more tabs past it,
       growing in as you scroll away from that end, and the current or focused tab is scrolled clear of the fade
       (smoothly on a change, instantly on first paint and on resize);
     - a vertical mouse wheel scrolls a horizontal list until it reaches an end, then the page scrolls again. */
  function useTablist(listRef, refs, index, vertical, bar) {
    var ind = useRef(null), placed = useRef(false), mounted = useRef(false), api = useRef({ ind: ind });
    var a = api.current;
    a.vertical = vertical; a.index = index;
    a.box = function (tab) {
      var l = listRef.current, lr = l.getBoundingClientRect(), tr = tab.getBoundingClientRect();
      var k = l.offsetWidth ? lr.width / l.offsetWidth : 1;
      return { x: (tr.left - lr.left) / k - l.clientLeft + l.scrollLeft, y: (tr.top - lr.top) / k - l.clientTop + l.scrollTop, w: tr.width / k, h: tr.height / k };
    };
    a.fades = function () {
      var l = listRef.current; if (!l) return;
      var pos = vertical ? l.scrollTop : l.scrollLeft;
      var max = vertical ? l.scrollHeight - l.clientHeight : l.scrollWidth - l.clientWidth;
      var s = Math.max(0, Math.min(TAB_FADE, pos)), e = Math.max(0, Math.min(TAB_FADE, max - pos));
      l.style.setProperty('--fade-start', s + 'px'); l.style.setProperty('--fade-end', e + 'px');
      if (max > 0.5) l.setAttribute('data-overflow', ''); else l.removeAttribute('data-overflow');
    };
    a.reveal = function (i, smooth) {
      var l = listRef.current, tab = refs.current[i]; if (!l || !tab) return;
      var b = a.box(tab), pos = vertical ? l.scrollTop : l.scrollLeft, size = vertical ? l.clientHeight : l.clientWidth;
      var max = vertical ? l.scrollHeight - l.clientHeight : l.scrollWidth - l.clientWidth;
      var s = vertical ? b.y : b.x, e = s + (vertical ? b.h : b.w), next = pos;
      if (s < pos + TAB_FADE) next = s - TAB_FADE; else if (e > pos + size - TAB_FADE) next = e - size + TAB_FADE;
      next = Math.max(0, Math.min(max, next));
      if (Math.abs(next - pos) < 0.5) return;
      var opt = { behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' }; opt[vertical ? 'top' : 'left'] = next;
      if (l.scrollTo) l.scrollTo(opt); else if (vertical) l.scrollTop = next; else l.scrollLeft = next;
    };
    a.place = function (animate) {
      var el = ind.current, l = listRef.current, tab = refs.current[index];
      if (!el || !l) return;
      if (!tab) { el.hidden = true; placed.current = false; return; }
      var jump = !animate || !placed.current || el.hidden;
      el.hidden = false;
      var b = a.box(tab);
      if (jump) el.style.transition = 'none';
      if (bar && vertical) { el.style.height = b.h + 'px'; el.style.transform = 'translate(' + (b.x + b.w - 2) + 'px, ' + b.y + 'px)'; }
      else if (bar) { el.style.width = b.w + 'px'; el.style.transform = 'translate(' + b.x + 'px, ' + (b.y + b.h - 2) + 'px)'; }
      else { el.style.width = b.w + 'px'; el.style.height = b.h + 'px'; el.style.transform = 'translate(' + b.x + 'px, ' + b.y + 'px)'; }
      if (jump) { void el.offsetWidth; el.style.transition = ''; }
      placed.current = true;
    };
    useLayout(function () {
      a.place(true); a.fades(); a.reveal(index, mounted.current); mounted.current = true;
    }, [index, vertical, bar]);
    useEffect(function () {
      var l = listRef.current;
      if (!l) return undefined;
      var raf = 0;
      function onScroll() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; api.current.fades(); }); }
      function onWheel(e) {
        if (api.current.vertical || e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        var max = l.scrollWidth - l.clientWidth; if (max <= 0) return;
        var d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? l.clientWidth : 1);
        var next = Math.max(0, Math.min(max, l.scrollLeft + d));
        if (Math.abs(next - l.scrollLeft) < 0.5) return;
        e.preventDefault(); l.scrollLeft = next;
      }
      l.addEventListener('scroll', onScroll, { passive: true });
      l.addEventListener('wheel', onWheel, { passive: false });
      var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { var c = api.current; c.place(false); c.reveal(c.index, false); c.fades(); }) : null;
      if (ro) { ro.observe(l); Array.prototype.forEach.call(l.children, function (c) { if (c !== ind.current) ro.observe(c); }); }
      return function () { l.removeEventListener('scroll', onScroll); l.removeEventListener('wheel', onWheel); if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
    }, [refs.current.length]);
    return a;
  }

  /* The label sits over a hidden copy at the selected weight, so every tab keeps its selected width and neighbors never move. */
  function tabLabel(label) {
    return h('span', { className: 'ifs-tab__label' }, h('span', { className: 'ifs-tab__text' }, label), h('span', { className: 'ifs-tab__ghost', 'aria-hidden': true }, label));
  }

  function Tabs(p) {
    var tabs = p.tabs || [];
    var s = useControllable(p.value, p.defaultValue !== undefined ? p.defaultValue : (tabs[0] && tabs[0].value), p.onChange), val = s[0], setVal = s[1];
    var id = useId(), refs = useRef([]), listRef = useRef(null);
    var seg = p.variant === 'segmented', vertical = p.orientation === 'vertical';
    refs.current.length = tabs.length;
    var ci = -1; tabs.forEach(function (t, i) { if (t.value === val) ci = i; });
    var tl = useTablist(listRef, refs, ci, vertical, !seg);
    function key(e, i) {
      var n = null;
      if (e.key === (vertical ? 'ArrowDown' : 'ArrowRight')) n = (i + 1) % tabs.length;
      else if (e.key === (vertical ? 'ArrowUp' : 'ArrowLeft')) n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n !== null) { e.preventDefault(); setVal(tabs[n].value); focusEl(refs.current[n]); }
    }
    var list = h('div', {
      ref: listRef, role: 'tablist', 'aria-label': p.label, 'aria-orientation': vertical ? 'vertical' : undefined,
      className: cx('ifs-tabs__scroll', seg ? 'ifs-segmented__scroll' : 'ifs-tablist__scroll'),
    },
      h('span', { key: '$ind', ref: tl.ind, 'aria-hidden': true, hidden: ci < 0, className: seg ? 'ifs-segmented__thumb' : 'ifs-tablist__bar' }),
      tabs.map(function (t, i) {
        var on = i === ci;
        return h('button', {
          key: t.value, ref: function (el) { refs.current[i] = el; }, type: 'button', role: 'tab', id: id + '-t' + i, 'aria-selected': on, 'aria-controls': tabs[ci] && tabs[ci].content !== undefined ? id + '-p' : undefined,
          tabIndex: on || (ci < 0 && i === 0) ? 0 : -1, className: seg ? 'ifs-segmented__item' : 'ifs-tab',
          onClick: function () { setVal(t.value); }, onKeyDown: function (e) { key(e, i); }, onFocus: function () { tl.reveal(i, true); },
        }, tabLabel(t.label), t.count != null ? h('span', { className: seg ? 'ifs-segmented__count' : 'ifs-tab__count' }, t.count) : null);
      }));
    var cur = tabs[ci];
    return h('div', { className: cx('ifs-tabs', seg && 'ifs-tabs--segmented', vertical && 'ifs-tabs--vertical', p.className) },
      h('div', { className: cx(seg ? 'ifs-segmented' : 'ifs-tablist', vertical && (seg ? 'ifs-segmented--vertical' : 'ifs-tablist--vertical')) }, list),
      cur && cur.content !== undefined ? h('div', { role: 'tabpanel', id: id + '-p', 'aria-labelledby': id + '-t' + ci, tabIndex: 0, className: 'ifs-tabpanel' }, cur.content) : null);
  }

  /* ------------------------------------------------------------ Breadcrumb */
  /* Where a page sits. `default`: ancestors as text2 links, the current page ink at 600. `eyebrow`: the uppercase muted form above a
     page title. `product`: the levels of the product (organization, project, environment) in a top bar, 32px targets that hover like
     ghost buttons, each with an optional `media` lead (an Avatar or Media at 20px). Any crumb with a `menu` becomes a Switcher: its
     label and a chevron open the list of its siblings to switch to. Labels in the product form truncate before they wrap. `current={false}`
     when the page's own title follows (PageHeader): every crumb is then an ancestor. */
  function Breadcrumb(p) {
    var items = p.items || [];
    var e = useState(false), expanded = e[0], setExpanded = e[1];
    var list = items;
    if (p.maxItems && items.length > p.maxItems && !expanded) list = [items[0], { more: true }].concat(items.slice(items.length - (p.maxItems - 1)));
    var chev = p.separator === 'chevron', product = p.variant === 'product';
    var out = [];
    list.forEach(function (it, i) {
      if (i > 0) out.push(h('li', { key: 's' + i, 'aria-hidden': true, className: 'ifs-crumbs__sep' }, chev ? h(Icon, { name: 'chev-right', size: 14, strokeWidth: 1.8 }) : '/'));
      // with current={false} every crumb is an ancestor: the page's own title follows the breadcrumb (PageHeader)
      var last = p.current !== false && i === list.length - 1, cls = it.mono ? 'ifs-crumbs__mono' : undefined;
      var rich = it.media != null || it.menu || product;
      var label = rich ? [it.media != null ? h('span', { key: 'm', className: 'ifs-crumbs__media' }, it.media) : null, h('span', { key: 'l', className: cx('ifs-crumbs__label', cls) }, it.label)] : it.label;
      var node;
      if (it.more) node = h('button', { type: 'button', className: 'ifs-crumbs__more', 'aria-label': 'Show hidden levels', onClick: function () { setExpanded(true); } }, '…');
      else if (it.menu) {
        node = h(Switcher, Object.assign({ label: typeof it.label === 'string' ? 'Switch from ' + it.label : 'Switch' }, it.menu, {
          trigger: h('button', { type: 'button', className: cx('ifs-crumbs__switch', last && 'ifs-crumbs__switch--current'), 'aria-current': last ? 'page' : undefined },
            label, h(Icon, { name: 'chev-ud', size: 14, strokeWidth: 1.8, className: 'ifs-crumbs__chev' })) }));
      }
      else if (last) node = h('span', { 'aria-current': 'page', className: rich ? 'ifs-crumbs__here' : cls }, label);
      else if (it.href || it.onClick) node = h('a', { href: it.href || '#', className: rich ? 'ifs-crumbs__link' : cls, onClick: it.onClick }, label);
      else node = h('span', { className: rich ? 'ifs-crumbs__here ifs-crumbs__here--plain' : cls }, label);
      out.push(h('li', { key: 'i' + i, className: rich ? 'ifs-crumbs__item' : undefined, style: rich ? undefined : { display: 'inline-flex', alignItems: 'center' } }, node));
    });
    return h('nav', { 'aria-label': p.label || 'Breadcrumb', className: cx('ifs-crumbs', p.variant === 'eyebrow' && 'ifs-crumbs--eyebrow', product && 'ifs-crumbs--product', p.className) }, h('ol', null, out));
  }

  /* ------------------------------------------------------------ Pagination */
  function pageList(page, last) {
    var r = [], i;
    if (last <= 7) { for (i = 1; i <= last; i++) r.push(i); return r; }
    if (page <= 3) return [1, 2, 3, 4, 0, last];
    if (page >= last - 2) return [1, 0, last - 3, last - 2, last - 1, last];
    return [1, 0, page - 1, page, page + 1, 0, last];
  }
  function Pagination(p) {
    var variant = p.variant || 'numbered';
    var s = useControllable(p.page, p.defaultPage || 1, p.onPageChange), page = s[0], setPage = s[1];
    var count = p.pageCount || (p.total && p.pageSize ? Math.ceil(p.total / p.pageSize) : 1);
    var label = p.label || 'Pagination';
    if (variant === 'more') {
      var shownN = Math.min(page * (p.pageSize || 25), p.total || 0);
      return h('nav', { 'aria-label': label, className: cx('ifs-row', p.className) },
        h(Button, { variant: 'secondary', size: 'sm', disabled: shownN >= (p.total || 0), onClick: function () { setPage(page + 1); } }, 'Show ' + fmt(Math.min(p.pageSize || 25, Math.max(0, (p.total || 0) - shownN))) + ' more'),
        h('span', { className: 'ifs-pagination__info', 'aria-live': 'polite' }, 'Showing ' + fmt(shownN) + ' of ' + fmt(p.total || 0)));
    }
    var prev = h(Button, { variant: 'secondary', size: 'sm', icon: 'chev-left', iconOnly: true, 'aria-label': 'Previous page', disabled: page <= 1, onClick: function () { setPage(page - 1); } });
    var next = h(Button, { variant: 'secondary', size: 'sm', icon: 'chev-right', iconOnly: true, 'aria-label': 'Next page', disabled: page >= count, onClick: function () { setPage(page + 1); } });
    var info = null;
    if (p.total != null && p.pageSize) { var from = (page - 1) * p.pageSize + 1, to = Math.min(page * p.pageSize, p.total); info = h('span', { className: 'ifs-pagination__info' }, fmt(from) + '\u2013' + fmt(to) + ' of ' + fmt(p.total)); }
    var size = p.pageSizeOptions ? h('span', { className: 'ifs-row', style: { gap: 10 } }, h('span', { className: 'ifs-pagination__info' }, 'Rows per page'),
      h(Select, { size: 'sm', style: { width: 76 }, menuWidth: 96, 'aria-label': 'Rows per page', value: String(p.pageSize), onChange: function (v) { if (p.onPageSizeChange) p.onPageSizeChange(Number(v)); }, options: p.pageSizeOptions.map(function (n) { return { value: String(n), label: String(n) }; }) })) : null;
    if (variant === 'compact') {
      return h('nav', { 'aria-label': label, className: cx('ifs-pagination', p.className), style: info || size ? undefined : { width: 'auto' } }, size || info,
        h('div', { className: 'ifs-pagination__compact' }, prev, h('span', null, 'Page ', h('b', null, page), ' of ', h('b', null, count)), next));
    }
    return h('nav', { 'aria-label': label, className: cx('ifs-pagination', p.className) }, size || info || h('span'),
      h('div', { className: 'ifs-pagination__pages' }, size ? info : null, size ? h('span', { style: { width: 6 } }) : null, prev,
        pageList(page, count).map(function (n, i) {
          return n === 0 ? h('span', { key: 'g' + i, className: 'ifs-page ifs-page--gap', 'aria-hidden': true }, '\u2026')
            : h('button', { key: n, type: 'button', className: 'ifs-page', 'aria-current': n === page ? 'page' : undefined, 'aria-label': 'Page ' + n, onClick: function () { setPage(n); } }, n);
        }), next));
  }

  /* ------------------------------------------------------------ FileTree */
  /* Folders and files as an ARIA tree. One row is in the tab order at a time: arrow keys walk the visible rows, Right opens a folder
     or steps into it, Left closes it or steps out to its parent, Home and End jump, Enter or Space picks, and typing jumps to the
     next name that starts with what you typed. Folders open and close with AnimatedCollapse and their chevron turns with them.
     Names middle-truncate, so the end of a long file name stays readable. Rows are connected: hover takes row-done, the selected
     row takes select with its text a step up, and focus draws the 2px ink outline inside the row. */
  function treeIsFolder(n) { return n.type ? n.type === 'folder' : Array.isArray(n.children); }
  function FileTree(p) {
    var foldersOnly = !!p.foldersOnly;
    var items = p.items || [];
    var ex = useControllable(p.expanded, p.defaultExpanded || [], p.onExpandedChange), expanded = ex[0] || [], setExpanded = ex[1];
    var se = useControllable(p.selected, p.defaultSelected != null ? p.defaultSelected : null, null), selected = se[0], setSelected = se[1];
    var mode = p.selectable || 'all';
    var f = useState(null), focusId = f[0], setFocusId = f[1];
    var refs = useRef({}), wantFocus = useRef(false), typed = useRef({ q: '', t: 0 }), box = useRef(null);
    useEdgeFade(box);

    // index: parents, levels and the rows that are visible now, in order
    var byId = {}, parent = {}, visible = [];
    function walk(list, par, level, shown) {
      list.forEach(function (n) {
        if (foldersOnly && !treeIsFolder(n)) return;
        byId[n.id] = n; parent[n.id] = par;
        if (shown) visible.push(n.id);
        if (treeIsFolder(n) && n.children) walk(n.children, n.id, level + 1, shown && expanded.indexOf(n.id) >= 0);
      });
    }
    walk(items, null, 1, true);
    var current = focusId != null && visible.indexOf(focusId) >= 0 ? focusId : selected != null && visible.indexOf(selected) >= 0 ? selected : visible[0];

    useEffect(function () {
      if (!wantFocus.current) return;
      wantFocus.current = false;
      var el = refs.current[current];
      if (el) { focusEl(el); var row = el.firstChild; if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' }); }
    });

    function canSelect(n) { if (n.disabled || mode === 'none') return false; var fo = treeIsFolder(n); return mode === 'all' || (mode === 'folders' ? fo : !fo); }
    function isOpen(id) { return expanded.indexOf(id) >= 0; }
    function setOpen(id, on) {
      if (isOpen(id) === on) return;
      setExpanded(on ? expanded.concat([id]) : expanded.filter(function (x) { return x !== id; }));
    }
    function go(id) { if (id == null) return; wantFocus.current = true; setFocusId(id); }
    function pick(n) {
      var fo = treeIsFolder(n);
      if (canSelect(n)) {
        setSelected(n.id);
        if (p.onSelect) p.onSelect(n.id, n);
        if (fo && !isOpen(n.id)) setOpen(n.id, true);
      } else if (fo && !n.disabled) setOpen(n.id, !isOpen(n.id));
    }
    function onKey(e) {
      var id = current, n = byId[id]; if (!n) return;
      var i = visible.indexOf(id), fo = treeIsFolder(n), k = e.key;
      if (k === 'ArrowDown') go(visible[Math.min(i + 1, visible.length - 1)]);
      else if (k === 'ArrowUp') go(visible[Math.max(i - 1, 0)]);
      else if (k === 'Home') go(visible[0]);
      else if (k === 'End') go(visible[visible.length - 1]);
      else if (k === 'ArrowRight') { if (fo && !isOpen(id)) setOpen(id, true); else if (fo && visible[i + 1] != null && parent[visible[i + 1]] === id) go(visible[i + 1]); else return; }
      else if (k === 'ArrowLeft') { if (fo && isOpen(id)) setOpen(id, false); else if (parent[id] != null) go(parent[id]); else return; }
      else if (k === 'Enter' || k === ' ') pick(n);
      else if (k.length === 1 && /\S/.test(k) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        var now = Date.now(), tq = typed.current;
        tq.q = now - tq.t < 600 ? tq.q + k.toLowerCase() : k.toLowerCase(); tq.t = now;
        var order = visible.slice(i + (tq.q.length > 1 ? 0 : 1)).concat(visible.slice(0, i + (tq.q.length > 1 ? 0 : 1)));
        var hit = order.filter(function (x) { return String(byId[x].name).toLowerCase().indexOf(tq.q) === 0; })[0];
        if (hit == null) return;
        go(hit);
      } else return;
      e.preventDefault();
    }

    function renderList(list, level) {
      var shownList = foldersOnly ? list.filter(treeIsFolder) : list;
      return shownList.map(function (n, idx) {
        var fo = treeIsFolder(n), open = fo && isOpen(n.id), sel = selected === n.id;
        var icon = n.icon || (fo ? (open ? 'folder-open' : 'folder') : 'file');
        var hasKids = fo && n.children && (foldersOnly ? n.children.some(treeIsFolder) : n.children.length > 0);
        var name = p.truncate === 'end' ? h('span', { className: 'ifs-tree__name ifs-tree__name--end' }, n.name) : h(MiddleTruncate, { className: 'ifs-tree__name', keepEnd: fo ? 0 : 8 }, n.name);
        var row = h('div', {
          className: 'ifs-tree__row', style: { '--lvl': level },
          onClick: function () { setFocusId(n.id); pick(n); },
        },
          fo && hasKids ? h('span', { className: 'ifs-tree__chev', 'aria-hidden': true, onClick: function (e) { e.stopPropagation(); setFocusId(n.id); setOpen(n.id, !open); } }, h(Icon, { name: 'chev-right', size: 14, strokeWidth: 1.9 }))
            : h('span', { className: 'ifs-tree__chev ifs-tree__chev--none', 'aria-hidden': true }),
          h(Icon, { name: icon, size: 16, className: 'ifs-tree__icon' }), name,
          n.meta != null ? h('span', { className: 'ifs-tree__meta' }, n.meta) : null);
        return h('div', {
          key: n.id, ref: function (el) { refs.current[n.id] = el; }, role: 'treeitem', 'data-id': n.id,
          'aria-level': level, 'aria-setsize': shownList.length, 'aria-posinset': idx + 1,
          'aria-expanded': hasKids ? open : undefined, 'aria-selected': canSelect(n) || sel ? sel : undefined, 'aria-disabled': n.disabled || undefined,
          'aria-label': n.label || undefined, tabIndex: n.id === current ? 0 : -1, className: 'ifs-tree__item',
          onFocus: function (e) { if (e.target === e.currentTarget && focusId !== n.id) setFocusId(n.id); },
        }, row, hasKids ? h(AnimatedCollapse, { open: open, lazy: true },
          h('div', { role: 'group', className: 'ifs-tree__group', style: { '--lvl': level + 1 } }, renderList(n.children, level + 1))) : null);
      });
    }
    return h('div', {
      ref: box, role: 'tree', 'aria-label': p.label, className: cx('ifs-tree ifs-fade-y', p.size === 'sm' && 'ifs-tree--sm', p.className),
      style: Object.assign({}, p.maxHeight ? { maxHeight: p.maxHeight } : null, p.style), onKeyDown: onKey,
    }, visible.length ? renderList(items, 1) : h('div', { className: 'ifs-tree__empty' }, p.empty || 'Nothing here yet'));
  }

  /* ------------------------------------------------------------ Tooltip */
  function Tooltip(p) {
    var s = useState(!!p.defaultOpen), open = s[0], setOpen = s[1];
    var id = useId(), t = useRef(null), side = p.side || 'top';
    // top and bottom tips float into the body, so a scroll box or the window's edge never clips them; they flip when their side has no room
    var anchor = useRef(null), tip = useRef(null), vert = side === 'top' || side === 'bottom';
    var pos = useFloat(open && vert, anchor, tip, { portal: true, side: side, center: true, gap: 8 });
    var actual = side;
    if (pos && anchor.current) { var ar = anchor.current.getBoundingClientRect(); actual = pos.top >= ar.bottom - 1 ? 'bottom' : 'top'; }
    useEffect(function () { return function () { clearTimeout(t.current); }; }, []);
    function show(now) { clearTimeout(t.current); if (now) setOpen(true); else t.current = setTimeout(function () { setOpen(true); }, p.delay != null ? p.delay : 300); }
    function hide() { clearTimeout(t.current); setOpen(false); }
    var child = React.Children.only(p.children);
    var trigger = React.cloneElement(child, {
      'aria-describedby': open ? id : child.props['aria-describedby'],
      onMouseEnter: chain(child.props.onMouseEnter, function () { show(false); }), onMouseLeave: chain(child.props.onMouseLeave, hide),
      onFocus: chain(child.props.onFocus, function () { show(true); }), onBlur: chain(child.props.onBlur, hide),
      onKeyDown: chain(child.props.onKeyDown, function (e) { if (e.key === 'Escape') hide(); }),
    });
    var bubble = open ? h('span', { ref: tip, role: 'tooltip', id: id, className: cx('ifs-tooltip', vert ? 'ifs-tooltip--float ifs-tooltip--float-' + actual : 'ifs-tooltip--' + side, p.wrap && 'ifs-tooltip--wrap'), style: vert && !pos ? { visibility: 'hidden' } : undefined },
      h('span', null, p.content), p.shortcut ? h(Kbd, { keys: p.shortcut, size: 'sm' }) : null, h('span', { className: 'ifs-tooltip__nub', 'aria-hidden': true })) : null;
    return h('span', { ref: anchor, className: 'ifs-tooltip-anchor' }, trigger, floated(bubble, pos));
  }

  /* ------------------------------------------------------------ Popover */
  function Popover(p) {
    var s = useControllable(p.open, !!p.defaultOpen, p.onOpenChange), open = s[0], setOpen = s[1];
    var wrap = useRef(null), panel = useRef(null), trig = useRef(null), byUser = useRef(false), id = useId();
    useDismiss(wrap, open, function () { setOpen(false); });
    useEffect(function () {
      if (open && byUser.current && panel.current) { var f = panel.current.querySelector(FOCUSABLE); focusEl(f || panel.current); }
      if (!open) byUser.current = false;
    }, [open]);
    function close() { setOpen(false); focusEl(trig.current); }
    var t = p.trigger;
    var trigger = t && React.cloneElement(t, { ref: trig, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-controls': open ? id : undefined, onClick: chain(t.props.onClick, function () { byUser.current = true; setOpen(!open); }) });
    var content = typeof p.children === 'function' ? p.children({ close: close }) : p.children;
    return h('div', { ref: wrap, className: 'ifs-anchor' }, trigger, open ? h('div', {
      ref: panel, id: id, role: 'dialog', tabIndex: -1, 'aria-label': typeof p.title === 'string' ? p.title : p['aria-label'],
      className: cx('ifs-pop ifs-popover', p.align === 'end' && 'ifs-pop--end', p.side === 'top' && 'ifs-pop--up', p.className), style: p.width ? { width: p.width } : undefined,
      onKeyDown: function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } },
    }, p.title ? h('p', { className: 'ifs-popover__title' }, p.title) : null, p.description ? h('p', { className: 'ifs-popover__desc' }, p.description) : null, content) : null);
  }

  /* ------------------------------------------------------------ Modal base for Dialog, AlertDialog, Sheet */
  function Modal(p) {
    var panel = useRef(null), first = useRef(true), prev = useRef(null);
    useEffect(function () {
      if (p.open && !first.current) {
        prev.current = document.activeElement;
        var el = panel.current;
        if (el) { var f = el.querySelector('[data-autofocus], .ifs-dialog__body input:not([disabled]), .ifs-sheet__body input:not([disabled])') || el.querySelector(FOCUSABLE); focusEl(f || el); }
      } else if (!p.open && prev.current) { focusEl(prev.current); prev.current = null; }
      first.current = false;
    }, [p.open]);
    if (!p.open) return null;
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); p.onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      var list = Array.prototype.slice.call(panel.current.querySelectorAll(FOCUSABLE));
      if (!list.length) return;
      var f = list[0], l = list[list.length - 1];
      if (e.shiftKey && document.activeElement === f) { e.preventDefault(); focusEl(l); }
      else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); focusEl(f); }
    }
    var node = h('div', { className: cx('ifs-overlay', p.sheet && 'ifs-overlay--sheet', p.overlayClassName), onMouseDown: function (e) { if (e.target === e.currentTarget && p.dismissible !== false) p.onClose(); } },
      h('div', { ref: function (el) { panel.current = el; if (p.panelRef) p.panelRef.current = el; }, role: p.role, 'aria-modal': true, 'aria-label': p.ariaLabel, 'aria-labelledby': p.labelledBy, 'aria-describedby': p.describedBy, tabIndex: -1, className: p.className, style: p.style, onKeyDown: onKey }, p.children));
    var RD = window.ReactDOM;
    return RD && RD.createPortal && p.portal !== false ? RD.createPortal(node, document.body) : node;
  }

  function Dialog(p) {
    var id = useId();
    function close() { if (p.onOpenChange) p.onOpenChange(false); }
    return h(Modal, { open: p.open, onClose: close, role: 'dialog', className: cx('ifs-dialog', p.className), labelledBy: id + '-t', describedBy: p.description ? id + '-d' : undefined, style: p.width ? { width: p.width } : undefined, dismissible: p.dismissible, portal: p.portal },
      h('div', { className: 'ifs-dialog__head' }, h('h2', { id: id + '-t', className: 'ifs-dialog__title' }, p.title), p.description ? h('p', { id: id + '-d', className: 'ifs-dialog__desc' }, p.description) : null),
      h('div', { className: 'ifs-dialog__close' }, h(Button, { variant: 'ghost', size: 'sm', icon: 'x', iconOnly: true, 'aria-label': 'Close', onClick: close })),
      p.children != null ? h('div', { className: 'ifs-dialog__body' }, p.children) : null,
      p.footer ? h('div', { className: 'ifs-dialog__footer' }, p.footer) : null);
  }

  function AlertDialog(p) {
    var id = useId();
    var s = useState(''), typed = s[0], setTyped = s[1];
    useEffect(function () { if (!p.open) setTyped(''); }, [p.open]);
    var needs = p.confirmText, ok = !needs || typed === needs, neutral = p.tone === 'neutral';
    function close() { if (p.onOpenChange) p.onOpenChange(false); }
    return h(Modal, { open: p.open, onClose: close, role: 'alertdialog', className: cx('ifs-dialog ifs-alertdialog', p.className), labelledBy: id + '-t', describedBy: id + '-d', dismissible: false, portal: p.portal },
      neutral ? null : h('span', { className: 'ifs-alertdialog__icon', 'aria-hidden': true }, h(Icon, { name: p.icon || 'trash', size: 20 })),
      h('div', { className: 'ifs-alertdialog__text' }, h('h2', { id: id + '-t', className: 'ifs-dialog__title' }, p.title), h('p', { id: id + '-d', className: 'ifs-alertdialog__desc' }, p.description)),
      needs ? h(Field, { label: h('span', null, 'Type ', h('span', { className: 'ifs-mono' }, needs), ' to confirm') }, h(Input, { mono: true, placeholder: needs, value: typed, 'data-autofocus': true, onChange: function (e) { setTyped(e.target.value); } })) : null,
      h('div', { className: 'ifs-alertdialog__actions' }, h(Button, { variant: 'secondary', onClick: close }, p.cancelLabel || 'Cancel'),
        h(Button, { variant: neutral ? 'primary' : 'destructive', disabled: !ok, onClick: function () { if (p.onConfirm) p.onConfirm(); close(); } }, p.confirmLabel || 'Delete')));
  }

  function Sheet(p) {
    var id = useId();
    function close() { if (p.onOpenChange) p.onOpenChange(false); }
    return h(Modal, { open: p.open, onClose: close, sheet: true, role: 'dialog', className: cx('ifs-sheet', p.className), labelledBy: id + '-t', style: p.width ? { width: p.width } : undefined, portal: p.portal },
      h('div', { className: 'ifs-sheet__head' }, p.eyebrow ? h('span', { className: 'ifs-eyebrow' }, p.eyebrow) : null, h('h2', { id: id + '-t', className: cx('ifs-sheet__title', p.monoTitle && 'ifs-sheet__title--mono') }, p.title), p.meta ? h('div', { className: 'ifs-sheet__meta' }, p.meta) : null),
      h('div', { className: 'ifs-dialog__close' }, p.actions, h(Button, { variant: 'ghost', size: 'sm', icon: 'x', iconOnly: true, 'aria-label': 'Close', onClick: close })),
      h('div', { className: 'ifs-sheet__body' }, p.children),
      p.footer ? h('div', { className: 'ifs-sheet__footer' }, p.footer) : null);
  }

  /* ------------------------------------------------------------ Alert, Banner */
  var ALERT_ICON = { info: 'info', ok: 'check-c', warn: 'alert', bad: 'alert-c' };
  function Alert(p) {
    var tone = p.tone || 'info';
    return h('div', { role: p.role || (tone === 'bad' ? 'alert' : 'status'), className: cx('ifs-alert', tone !== 'info' && 'ifs-alert--' + tone, p.className) },
      h('span', { className: 'ifs-alert__icon', 'aria-hidden': true }, h(Icon, { name: p.icon || ALERT_ICON[tone], size: 18, strokeWidth: 1.8 })),
      h('div', { className: 'ifs-alert__text' }, p.title ? h('span', { className: 'ifs-alert__title' }, p.title) : null, p.children != null ? h('div', { className: 'ifs-alert__desc' }, p.children) : null,
        p.actions ? h('div', { className: 'ifs-alert__actions' }, p.actions) : null),
      p.onDismiss ? h('button', { type: 'button', className: 'ifs-alert__dismiss', 'aria-label': 'Dismiss', onClick: p.onDismiss }, h(Icon, { name: 'x', size: 15, strokeWidth: 1.9 })) : h('span'));
  }
  function Banner(p) {
    return h('div', { role: 'status', className: cx('ifs-banner', p.className) }, h(Icon, { name: p.icon || 'lock', size: 17, strokeWidth: 1.8 }), h('span', { className: 'ifs-banner__text' }, p.children), p.action,
      p.onDismiss ? h('button', { type: 'button', className: 'ifs-banner__dismiss', 'aria-label': 'Dismiss', onClick: p.onDismiss }, h(Icon, { name: 'x', size: 15, strokeWidth: 1.9 })) : null);
  }

  /* ------------------------------------------------------------ Toast */
  function Toast(p) {
    var tone = p.tone || 'neutral';
    var dismiss = useRef(p.onDismiss);
    dismiss.current = p.onDismiss;
    useEffect(function () { if (!p.duration) return undefined; var t = setTimeout(function () { if (dismiss.current) dismiss.current(); }, p.duration); return function () { clearTimeout(t); }; }, [p.duration]);
    var lead = p.loading ? h(Spinner, null) : p.icon ? h(Icon, { name: p.icon, size: 18, strokeWidth: 1.8 }) : tone === 'ok' ? h(Icon, { name: 'check-c', size: 18, strokeWidth: 1.8 }) : tone === 'bad' ? h(Icon, { name: 'alert-c', size: 18, strokeWidth: 1.8 }) : null;
    return h('div', { role: tone === 'bad' ? 'alert' : 'status', className: cx('ifs-toast', tone !== 'neutral' && 'ifs-toast--' + tone, p.className) },
      lead ? h('span', { className: 'ifs-toast__lead' }, lead) : null,
      h('div', { className: 'ifs-toast__text' }, h('span', { className: 'ifs-toast__title' }, p.title), p.description ? h('span', { className: 'ifs-toast__desc' }, p.description) : null),
      (p.action || p.onDismiss) ? h('div', { className: 'ifs-toast__actions' },
        p.action ? h('button', { type: 'button', className: 'ifs-toast__action', onClick: p.action.onClick }, p.action.label) : null,
        p.onDismiss ? h('button', { type: 'button', className: 'ifs-toast__dismiss', 'aria-label': 'Dismiss', onClick: p.onDismiss }, h(Icon, { name: 'x', size: 15, strokeWidth: 1.9 })) : null) : null);
  }
  function ToastStack(p) { return h('div', { role: 'region', 'aria-label': p.label || 'Notifications', className: cx('ifs-toasts', p.inline && 'ifs-toasts--inline', p.className) }, p.children); }

  /* ------------------------------------------------------------ Progress */
  function Progress(p) {
    var max = p.max || 100, v = p.value, indet = v == null;
    var ratio = indet ? 0 : v / max, pct = Math.max(0, Math.min(100, ratio * 100));
    var tone = p.tone || 'ink';
    if (tone === 'auto') tone = ratio >= 1 ? 'bad' : ratio >= (p.warnAt || 0.8) ? 'warn' : 'ink';
    var aria = typeof p.label === 'string' ? p.label : p['aria-label'];
    return h('div', { className: cx('ifs-progress', tone === 'warn' && 'ifs-progress--warn', tone === 'bad' && 'ifs-progress--bad', p.className) },
      (p.label || p.valueLabel) ? h('div', { className: 'ifs-progress__labels' }, h('span', { className: 'ifs-progress__label' }, p.label), p.valueLabel ? h('span', { className: 'ifs-progress__value' }, p.valueLabel) : null) : null,
      h('div', { role: 'progressbar', 'aria-label': aria, 'aria-valuemin': indet ? undefined : 0, 'aria-valuemax': indet ? undefined : max, 'aria-valuenow': indet ? undefined : Math.min(v, max), 'aria-valuetext': typeof p.valueLabel === 'string' ? p.valueLabel : undefined, className: 'ifs-progress__track' },
        indet ? h('span', { className: 'ifs-progress__slider' }) : h('span', { className: 'ifs-progress__fill', style: { width: pct + '%' } })));
  }
  function ProgressSteps(p) {
    var steps = p.steps || [], cur = p.current || 0, text = 'Step ' + (cur + 1) + ' of ' + steps.length;
    return h('div', { className: cx('ifs-progress', p.className), style: { gap: 8 } },
      p.label ? h('div', { className: 'ifs-progress__labels' }, h('span', { className: 'ifs-progress__label' }, p.label), h('span', { className: 'ifs-progress__value' }, text)) : null,
      h('div', { role: 'progressbar', 'aria-label': typeof p.label === 'string' ? p.label : 'Progress', 'aria-valuemin': 0, 'aria-valuemax': steps.length, 'aria-valuenow': cur, 'aria-valuetext': text + (steps[cur] ? ', ' + steps[cur] : ''), className: 'ifs-steps' },
        steps.map(function (st, i) { return h('span', { key: i, className: cx('ifs-steps__seg', i < cur && 'ifs-steps__seg--done', i === cur && 'ifs-steps__seg--current') }); })),
      h('div', { className: 'ifs-steps', 'aria-hidden': true }, steps.map(function (st, i) { return h('span', { key: i, className: cx('ifs-steps__label', i === cur && 'ifs-steps__label--current') }, st); })));
  }

  /* ------------------------------------------------------------ Skeleton, EmptyState */
  function Skeleton(p) {
    if (p.lines) {
      var out = [];
      for (var i = 0; i < p.lines; i++) out.push(h('span', { key: i, className: 'ifs-skeleton', style: { width: i === p.lines - 1 && p.lines > 1 ? '60%' : '100%', height: p.height || 12 } }));
      return h('div', { className: cx('ifs-stack', p.className), style: Object.assign({ gap: 8, width: p.width || '100%' }, p.style), 'aria-hidden': true }, out);
    }
    return h('span', { className: cx('ifs-skeleton', p.className), 'aria-hidden': true, style: Object.assign({ width: p.width || '100%', height: p.height || 12 }, p.style) });
  }
  function EmptyState(p) {
    if (p.variant === 'compact') return h('div', { role: 'status', className: cx('ifs-empty ifs-empty--compact', p.className) }, h(Icon, { name: p.icon || 'search', size: 16, strokeWidth: 1.8 }), h('span', null, p.title), p.actions);
    return h('div', { className: cx('ifs-empty', p.className) }, h('span', { className: 'ifs-empty__icon', 'aria-hidden': true }, h(Icon, { name: p.icon || 'inbox', size: 18 })),
      h('h3', { className: 'ifs-empty__title' }, p.title), p.description ? h('p', { className: 'ifs-empty__desc' }, p.description) : null, p.actions ? h('div', { className: 'ifs-empty__actions' }, p.actions) : null);
  }

  /* ------------------------------------------------------------ MiddleTruncate, AnimatedCollapse (utilities) */
  /* MiddleTruncate: one line of text that keeps its start and its end and drops characters from the middle to fit, for keys, paths,
     hosts, IDs and file names, where the end is what tells two values apart. It is as wide as its full text until its container
     is narrower, then it re-fits on every resize and font load. The full text stays in `title`, for screen readers, and on the
     clipboard when a copy covers only this text. */
  var ELLIPSIS = '…';
  function midCut(text, keep, end) {
    var tail = Math.max(Math.floor(keep / 2), Math.min(end || 0, keep - 1));
    return text.slice(0, keep - tail) + ELLIPSIS + text.slice(text.length - tail);
  }
  function MiddleTruncate(p) {
    var text = p.text != null ? String(p.text) : p.children == null ? '' : String(p.children);
    var el = useRef(null), ghost = useRef(null), meas = useRef(null), fitRef = useRef(null);
    var st = useState({ t: text, s: text }), fit = st[0], setFit = st[1];
    var shown = fit.t === text ? fit.s : text;
    function setShown(v) { setFit(function (f) { return f.t === text && f.s === v ? f : { t: text, s: v }; }); }
    fitRef.current = function () {
      var node = el.current, m = meas.current;
      if (!node || !m) return;
      var avail = node.getBoundingClientRect().width;
      if (!avail) return;
      m.textContent = text;
      if (m.getBoundingClientRect().width <= avail + 0.5 || text.length < 4) { m.textContent = ''; setShown(text); return; }
      var lo = 1, hi = text.length - 2, best = 1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        m.textContent = midCut(text, mid, p.keepEnd);
        if (m.getBoundingClientRect().width <= avail + 0.5) { best = mid; lo = mid + 1; } else hi = mid - 1;
      }
      m.textContent = '';
      setShown(midCut(text, best, p.keepEnd));
    };
    useLayout(function () { fitRef.current(); }, [text, p.keepEnd]);
    useEffect(function () {
      var node = el.current;
      if (!node) return undefined;
      function refit() { if (fitRef.current) fitRef.current(); }
      var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refit) : null;
      if (ro) ro.observe(node);
      var fonts = document.fonts;
      if (fonts && fonts.addEventListener) fonts.addEventListener('loadingdone', refit);
      return function () { if (ro) ro.disconnect(); if (fonts && fonts.removeEventListener) fonts.removeEventListener('loadingdone', refit); };
    }, []);
    var cut = shown !== text;
    function onCopy(e) {
      if (!cut || !e.clipboardData || !window.getSelection) return;
      var sel = window.getSelection();
      if (!sel.rangeCount || !el.current.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
      e.preventDefault(); e.clipboardData.setData('text/plain', text);
    }
    return h('span', { ref: el, className: cx('ifs-mtrunc', p.mono && 'ifs-mono', p.className), style: p.style, title: cut && p.title !== false ? text : undefined, onCopy: onCopy },
      h('span', { className: 'ifs-mtrunc__text', 'aria-hidden': cut || undefined }, shown),
      cut ? h('span', { className: 'ifs-sr' }, text) : null,
      h('span', { ref: ghost, className: 'ifs-mtrunc__ghost', 'aria-hidden': true }, text),
      h('span', { ref: meas, className: 'ifs-mtrunc__measure', 'aria-hidden': true }));
  }

  /* useEdgeFade: a vertical scroller with more content past an edge fades that edge over 32px, growing in as you scroll away from
     it, the way an overflowing tablist fades its ends. Code views, JSON, trees and long listboxes use it. bundle.css draws the mask
     from --fade-start, --fade-end and data-overflow on .ifs-fade-y. */
  var EDGE_FADE = 32;
  function useEdgeFade(ref, deps) {
    var fn = useRef(null);
    fn.current = function () {
      var l = ref.current; if (!l) return;
      var max = l.scrollHeight - l.clientHeight, pos = l.scrollTop;
      l.style.setProperty('--fade-start', Math.max(0, Math.min(EDGE_FADE, pos)) + 'px');
      l.style.setProperty('--fade-end', Math.max(0, Math.min(EDGE_FADE, max - pos)) + 'px');
      if (max > 0.5) l.setAttribute('data-overflow', ''); else l.removeAttribute('data-overflow');
    };
    useLayout(function () { fn.current(); });
    useEffect(function () {
      var l = ref.current; if (!l) return undefined;
      var raf = 0;
      function on() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; fn.current(); }); }
      l.addEventListener('scroll', on, { passive: true });
      var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(on) : null;
      if (ro) { ro.observe(l); if (l.firstElementChild) ro.observe(l.firstElementChild); }
      // content that grows without resizing the scroller (a JSON node opening) ends a transition inside it
      l.addEventListener('transitionend', on);
      return function () { l.removeEventListener('scroll', on); l.removeEventListener('transitionend', on); if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
    }, deps || []);
  }

  /* AnimatedCollapse: shows and hides its children by animating their height (a 0fr to 1fr grid row) over 200ms on the shared slide
     curve, with a matching fade. It never animates on first paint. Closed content leaves the tab order and the accessibility tree;
     content only clips while it moves, so focus outlines and popovers inside an open region are never cut. Under reduced motion it
     opens and closes at once. `lazy` mounts the children on first open and keeps them. */
  function AnimatedCollapse(p) {
    var open = !!p.open;
    var seen = useRef(open);
    if (open) seen.current = true;
    var s = useState(open), settled = s[0], setSettled = s[1];
    var first = useRef(true);
    useLayout(function () {
      if (first.current) { first.current = false; return undefined; }
      if (reducedMotion()) { setSettled(open); return undefined; }
      setSettled(false);
      // transitionend settles it; the timer covers a transition that never runs (a hidden ancestor, no height to animate)
      var t = setTimeout(function () { setSettled(open); }, 260);
      return function () { clearTimeout(t); };
    }, [open]);
    function onEnd(e) {
      if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows') setSettled(open);
      if (p.onTransitionEnd) p.onTransitionEnd(e);
    }
    return h('div', {
      id: p.id, className: cx('ifs-collapse', p.className), style: p.style, 'aria-hidden': open ? undefined : true,
      'data-open': open ? '' : undefined, 'data-settled': open && settled ? '' : undefined, onTransitionEnd: onEnd,
    }, h('div', { className: 'ifs-collapse__inner' }, !p.lazy || seen.current ? p.children : null));
  }

  /* ------------------------------------------------------------ Code, CodeBlock, Json, Snippet */
  /* A small tokenizer for the languages Infisical shows: shell, .env, JSON, YAML, JavaScript and TypeScript, Python and HCL.
     Highlighting stays neutral, like the rest of the system: structure (commands, keywords, keys) in ink at a heavier weight,
     values in text2, punctuation and comments in muted. Hue is saved for meaning. */
  var RX = {
    str: /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/,
    num: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/,
  };
  function lex(text, rules, remap) {
    var out = [], i = 0, st = {}, ws = /[ \t]+/y;
    var res = rules.map(function (r) { return { t: r[0], re: new RegExp(r[1].source, 'y' + (r[1].multiline ? 'm' : '')) }; });
    while (i < text.length) {
      var c = text.charAt(i), t = null, v = null;
      if (c === '\n') { t = 'nl'; v = c; }
      else if (c === ' ' || c === '\t') { ws.lastIndex = i; v = ws.exec(text)[0]; t = 'ws'; }
      else {
        for (var k = 0; k < res.length; k++) {
          res[k].re.lastIndex = i;
          var m = res[k].re.exec(text);
          if (m && m[0]) { t = res[k].t; v = m[0]; break; }
        }
      }
      if (t === null) { t = 'plain'; v = c; }
      if (remap) t = remap(t, v, st) || t;
      if (t === 'word') t = 'plain';
      var last = out[out.length - 1];
      if (last && last.t === t && (t === 'plain' || t === 'ws' || t === 'punct')) last.v += v; else out.push({ t: t, v: v });
      i += v.length;
    }
    return out;
  }
  var CODE_LANGS = {
    json: { rules: [['key', /"(?:[^"\\\n]|\\.)*"(?=\s*:)/], ['string', /"(?:[^"\\\n]|\\.)*"/], ['number', RX.num], ['literal', /\b(?:true|false|null)\b/], ['punct', /[{}[\],:]/]] },
    bash: {
      rules: [['comment', /#.*/], ['string', RX.str], ['var', /\$\{[^}\n]*\}|\$[A-Za-z_]\w*|\$[0-9@#?*!$-]/], ['flag', /--?[A-Za-z][\w-]*/],
        ['punct', /&&|\|\||[|;&<>\\=()]/], ['word', /[^\s"'$|;&<>\\=()#]+/]],
      // the first word of a line, or after a pipe, && or ; (or `--` in `infisical run -- npm start`), is the command
      remap: function (t, v, st) {
        if (st.cmd === undefined) st.cmd = true;
        if (t === 'nl') { st.cmd = !st.cont; st.cont = false; return t; }
        if (t === 'ws' || t === 'comment') return t;
        st.cont = false;
        if (t === 'punct') { if (v === '\\') st.cont = true; else if (/^(\||\|\||&&|;|\()$/.test(v)) st.cmd = true; return t; }
        if (t === 'word') {
          if (v === '--') { st.cmd = true; return 'punct'; }
          if (st.cmd) { st.cmd = /^(sudo|exec|time|nohup|xargs|env)$/.test(v); return 'keyword'; }
          return 'plain';
        }
        if (t !== 'var') st.cmd = false;
        return t;
      },
    },
    env: {
      rules: [['comment', /^[ \t]*#.*/m], ['keyword', /^export\b/m], ['string', RX.str], ['punct', /=/], ['word', /[^\s="'#]+/], ['comment', /#.*/]],
      // KEY before the first = on a line, the value after it
      remap: function (t, v, st) {
        if (t === 'nl') { st.eq = false; return t; }
        if (t === 'ws') return t;
        if (!st.eq) { if (t === 'punct') { st.eq = true; return t; } return t === 'word' ? 'key' : t; }
        if (t === 'comment') return t;
        return 'string';
      },
    },
    yaml: {
      rules: [['comment', /#.*/], ['key', /[A-Za-z0-9_$.\/-]+(?=[ \t]*:(?:[ \t]|$))/m], ['string', RX.str], ['literal', /\b(?:true|false|null|yes|no|on|off)\b/],
        ['number', RX.num], ['punct', /[:|>{}[\],&*!-]/], ['word', /[^\s:#,[\]{}]+/]],
      // after `key:` the rest of the line is a value, so a URL's colons stay part of it
      remap: function (t, v, st) {
        if (t === 'nl') { st.val = false; st.key = false; return t; }
        if (t === 'ws' || t === 'comment') return t;
        if (st.val) return t === 'literal' || t === 'number' || t === 'string' ? t : 'string';
        if (t === 'key') { st.key = true; return t; }
        if (t === 'punct' && v === ':' && st.key) { st.val = true; st.key = false; return t; }
        st.key = false;
        return t === 'word' ? 'string' : t;
      },
    },
    js: {
      rules: [['comment', /\/\/.*|\/\*[\s\S]*?\*\//], ['string', /`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/],
        ['keyword', /\b(?:const|let|var|function|return|if|else|for|while|import|from|export|default|new|await|async|class|extends|try|catch|throw|typeof|interface|type|of|in|as)\b/],
        ['literal', /\b(?:true|false|null|undefined)\b/], ['number', RX.num], ['key', /[A-Za-z_$][\w$]*(?=\s*:(?!:))/], ['punct', /[{}()[\];,.:=+\-*/<>!?&|%^~]/], ['word', /[A-Za-z_$][\w$]*/]],
    },
    python: {
      rules: [['comment', /#.*/], ['string', /"""[\s\S]*?"""|'''[\s\S]*?'''|[fr]?"(?:[^"\\\n]|\\.)*"|[fr]?'(?:[^'\\\n]|\\.)*'/],
        ['keyword', /\b(?:import|from|as|def|return|if|elif|else|for|while|in|not|and|or|with|class|try|except|finally|raise|lambda|pass|async|await|yield)\b/],
        ['literal', /\b(?:True|False|None)\b/], ['number', RX.num], ['key', /[A-Za-z_]\w*(?==(?!=))/], ['punct', /[{}()[\];,.:=+\-*/<>!@%]/], ['word', /[A-Za-z_]\w*/]],
    },
    hcl: {
      rules: [['comment', /#.*|\/\/.*|\/\*[\s\S]*?\*\//], ['keyword', /^[ \t]*(?:resource|data|variable|provider|module|output|locals|terraform|backend|required_providers)\b/m],
        ['string', RX.str], ['key', /[A-Za-z_][\w-]*(?=[ \t]*=(?!=))/], ['literal', /\b(?:true|false|null)\b/], ['number', RX.num], ['punct', /[{}[\]()=,.:]/], ['word', /[A-Za-z_][\w-]*/]],
    },
  };
  var CODE_ALIASES = { sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash', dotenv: 'env', yml: 'yaml', javascript: 'js', typescript: 'js', ts: 'js', jsx: 'js', tsx: 'js', node: 'js', py: 'python', tf: 'hcl', terraform: 'hcl' };
  function codeLang(l) { l = String(l || '').toLowerCase(); return CODE_LANGS[l] ? l : CODE_ALIASES[l] || null; }
  function codeText(v) { return v == null ? '' : String(v).replace(/\r\n?/g, '\n').replace(/\n$/, ''); }
  function codeLines(text, lang) {
    var L = CODE_LANGS[codeLang(lang)];
    var toks = L ? lex(text, L.rules, L.remap) : [{ t: 'plain', v: text }], lines = [[]];
    toks.forEach(function (tk) {
      tk.v.split('\n').forEach(function (part, i) { if (i) lines.push([]); if (part) lines[lines.length - 1].push({ t: tk.t, v: part }); });
    });
    return lines;
  }
  function tokNode(tk, i) { return tk.t === 'plain' || tk.t === 'ws' ? tk.v : h('span', { key: i, className: 'ifs-tok--' + tk.t }, tk.v); }

  /* Code: inline by default, a chip of mono text inside a sentence. `block` renders the bare code view that CodeBlock frames:
     lines, optional line numbers, highlighted lines on accent-wash, scrolling (or wrapping) long lines. */
  function codeMax(p) { return p.maxLines ? p.maxLines * 20 + 24 : p.maxHeight; }
  function Code(p) {
    if (!p.block) return h('code', { className: cx('ifs-code', p.className), style: p.style }, p.children != null ? p.children : p.code);
    return h(CodeView, p);
  }
  function CodeView(p) {
    var ref = useRef(null);
    useEdgeFade(ref);
    var max = codeMax(p);
    var text = codeText(p.code != null ? p.code : p.children);
    var lines = codeLines(text, p.language), hl = p.highlight || [];
    var digits = String(lines.length).length;
    return h('pre', {
      ref: ref, className: cx('ifs-codeview ifs-fade-y', p.wrap && 'ifs-codeview--wrap', p.lineNumbers && 'ifs-codeview--ln', p.className), tabIndex: 0, 'aria-label': p['aria-label'] || p.label,
      style: Object.assign({ '--ifs-ln': digits + 'ch' }, max ? { maxHeight: max } : null, p.style),
    }, h('code', { 'data-language': codeLang(p.language) || undefined }, lines.map(function (line, i) {
      // line numbers are a CSS counter on ::before, so they are never selected, copied or read out
      return h('span', { key: i, className: cx('ifs-code__line', hl.indexOf(i + 1) >= 0 && 'ifs-code__line--hl') },
        h('span', { className: 'ifs-code__text' }, line.map(tokNode)));
    })));
  }

  /* Json: a value (or a JSON string) pretty-printed as a tree whose objects and arrays open and close. `redact` names keys whose
     values are never shown, such as secret values in an audit event. */
  function isRedacted(key, redact) { if (key == null || !redact) return false; return typeof redact === 'function' ? !!redact(key) : redact.map(function (x) { return String(x).toLowerCase(); }).indexOf(String(key).toLowerCase()) >= 0; }
  function jsonText(value, redact) {
    return JSON.stringify(value, function (k, v) { return k && typeof v !== 'object' && isRedacted(k, redact) ? '<redacted>' : v; }, 2);
  }
  var MASK = '••••••••';
  function JsonValue(v, key, redact) {
    if (isRedacted(key, redact) && (v === null || typeof v !== 'object')) return h('span', { className: 'ifs-tok--masked', 'aria-label': 'Hidden value' }, '"' + MASK + '"');
    if (typeof v === 'string') return h('span', { className: 'ifs-tok--string' }, JSON.stringify(v));
    if (typeof v === 'number') return h('span', { className: 'ifs-tok--number' }, String(v));
    return h('span', { className: 'ifs-tok--literal' }, String(v));
  }
  function JsonNode(p) {
    var v = p.value, isArr = Array.isArray(v), isObj = v !== null && typeof v === 'object';
    var keys = isObj ? (isArr ? v.map(function (x, i) { return i; }) : Object.keys(v)) : [];
    var s = useState(p.depth < p.openDepth), open = s[0], setOpen = s[1];
    var comma = p.last ? null : h('span', { className: 'ifs-tok--punct' }, ',');
    var keyPart = p.name != null && !p.inArray ? [h('span', { key: 'k', className: 'ifs-tok--key' }, JSON.stringify(String(p.name))), h('span', { key: 'c', className: 'ifs-tok--punct' }, ': ')] : null;
    if (!isObj || !keys.length) {
      var leaf = isObj ? h('span', { className: 'ifs-tok--punct' }, isArr ? '[]' : '{}') : JsonValue(v, p.name, p.redact);
      return h('div', { className: 'ifs-json__line' }, h('span', { className: 'ifs-json__gap' }), keyPart, leaf, comma);
    }
    var ob = isArr ? '[' : '{', cb = isArr ? ']' : '}';
    var count = keys.length + (isArr ? (keys.length === 1 ? ' item' : ' items') : (keys.length === 1 ? ' key' : ' keys'));
    var name = p.name != null && !p.inArray ? String(p.name) : p.inArray ? 'item ' + p.name : 'value';
    function toggle() { setOpen(!open); }
    function lineClick() { var sel = window.getSelection && window.getSelection(); if (sel && String(sel)) return; toggle(); }
    return h('div', { className: 'ifs-json__node' },
      h('div', { className: 'ifs-json__line ifs-json__line--head', onClick: lineClick },
        h('button', { type: 'button', className: 'ifs-json__toggle', 'aria-expanded': open, 'aria-label': (open ? 'Collapse ' : 'Expand ') + name, onClick: function (e) { e.stopPropagation(); toggle(); } }, h(Icon, { name: 'chev-right', size: 12, strokeWidth: 2 })),
        keyPart, h('span', { className: 'ifs-tok--punct' }, ob),
        open ? null : [h('span', { key: 'e', className: 'ifs-tok--punct' }, ' … ' + cb), comma ? h('span', { key: ',' }, comma) : null, h('span', { key: 'n', className: 'ifs-json__count' }, count)]),
      h(AnimatedCollapse, { open: open, lazy: true },
        h('div', { className: 'ifs-json__kids' }, keys.map(function (k, i) {
          return h(JsonNode, { key: k, name: k, inArray: isArr, value: v[k], depth: p.depth + 1, openDepth: p.openDepth, last: i === keys.length - 1, redact: p.redact });
        })),
        h('div', { className: 'ifs-json__line' }, h('span', { className: 'ifs-json__gap' }), h('span', { className: 'ifs-tok--punct' }, cb), comma)));
  }
  function Json(p) {
    var ref = useRef(null);
    useEdgeFade(ref);
    var v = p.value;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return h(Code, { block: true, code: p.value, className: p.className }); } }
    var depth = p.defaultExpandDepth == null ? 2 : p.defaultExpandDepth;
    var max = codeMax(p);
    return h('div', { ref: ref, className: cx('ifs-json ifs-fade-y', p.wrap && 'ifs-json--wrap', p.className), role: 'group', 'aria-label': p['aria-label'] || p.label || 'JSON', style: Object.assign({}, max ? { maxHeight: max } : null, p.style) },
      h('div', { className: 'ifs-json__root' }, h(JsonNode, { value: v, depth: 0, openDepth: depth, last: true, redact: p.redact })));
  }

  /* CodeBlock: code in the framed container. The tint shell carries an opinionated header: a mono label on the left (a file name,
     a language, "Terminal"), actions on the right, Copy always last. The code sits in the inset surface. */
  function CodeBlock(p) {
    var child = p.children;
    var copyText = p.copyValue;
    if (copyText == null) {
      if (React.isValidElement(child) && child.type === Json) copyText = typeof child.props.value === 'string' ? child.props.value : jsonText(child.props.value, child.props.redact);
      else copyText = codeText(p.code != null ? p.code : typeof child === 'string' ? child : '');
    }
    var body = React.isValidElement(child) ? child
      : h(Code, { block: true, code: p.code != null ? p.code : child, language: p.language, lineNumbers: p.lineNumbers, highlight: p.highlight, wrap: p.wrap, maxLines: p.maxLines, maxHeight: p.maxHeight, 'aria-label': typeof p.label === 'string' ? p.label : p.language });
    var label = p.label != null ? p.label : p.language || null;
    var labelNode = label == null ? null : typeof label === 'string' ? h(MiddleTruncate, { keepEnd: 12 }, label) : label;
    return h('section', { className: cx('ifs-codeblock', p.className), style: p.style, 'aria-label': typeof label === 'string' ? label : undefined },
      h('div', { className: 'ifs-codeblock__head' },
        h('span', { className: 'ifs-codeblock__label' }, p.icon ? h(Icon, { name: p.icon, size: 14 }) : null, labelNode),
        h('span', { className: 'ifs-codeblock__actions' }, p.actions, p.copy === false ? null : h(CopyButton, { value: copyText, label: p.copyLabel || 'Copy code', tooltip: true, onCopy: p.onCopy }))),
      h('div', { className: 'ifs-codeblock__body' }, body));
  }

  /* Snippet: one line to copy, such as a command or a URL. It behaves like a read-only input (select it, scroll it with the caret)
     with a Copy button at its end. `prompt` shows a "$" that is never copied. Secret values use SecretInput instead. */
  var Snippet = React.forwardRef(function Snippet(p, ref) {
    var val = p.value == null ? '' : String(p.value);
    var group = nestedGroup([p.copyable === false ? null : h(CopyButton, { value: val, label: p.copyLabel || 'Copy', onCopy: p.onCopy })]);
    return h('div', { className: cx('ifs-control ifs-snippet', group && 'ifs-control--trail', p.size === 'sm' && 'ifs-control--sm', p.invalid && 'ifs-control--invalid', p.className), style: p.style },
      p.prompt ? h('span', { className: 'ifs-snippet__prompt', 'aria-hidden': true }, p.prompt) : null,
      h('input', { ref: ref, id: p.id, type: 'text', readOnly: true, value: val, spellCheck: false, autoComplete: 'off', 'aria-label': p['aria-label'], 'aria-describedby': p['aria-describedby'], name: p.name }),
      group);
  });
  Snippet.ifsControl = true;


  /* ================================================================ Composites
     Components assembled from the ones above, with behavior of their own: the command menu, the switcher, the app sidebar and top
     bar, the page header, settings cards, the floating action bar, multistep flows and announcements. They add no new colors or
     sizes: every ground, rule and height is a token or a measure the primitives already use. */

  /* ------------------------------------------------------------ shared: floating popups, outside clicks, hotkeys, matching */
  // useFloat places a popup beside its anchor. It stays in place (absolute, positioned by the popup's own classes) unless an ancestor
  // would clip it or `portal` is true; then the popup renders into document.body at fixed coordinates, follows the anchor on scroll
  // and resize, and flips to the other side when there is no room. side: bottom (default), top, or right (vertically centered with
  // `center`, bottom edges lined up with align end, else top aligned). align: start (default) or end; above or below, `center` centers it.
  function useFloat(open, anchorRef, popRef, o) {
    var st = useState(null), pos = st[0], setPos = st[1];
    var opts = useRef(o); opts.current = o;
    useIsoLayout(function () {
      var a = anchorRef.current, c = opts.current;
      if (!open || !a || c.portal === false || (c.portal !== true && !clipsIn(a))) { setPos(null); return undefined; }
      function place() {
        var r = a.getBoundingClientRect(), m = popRef.current, q = opts.current;
        var mw = m ? m.offsetWidth : (q.width || 240), mh = m ? m.offsetHeight : 0, gap = q.gap != null ? q.gap : 6;
        var vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, top, left;
        if (q.side === 'right') {
          left = r.right + gap;
          if (left + mw > vw - 8) left = Math.max(8, r.left - gap - mw);
          top = q.center ? r.top + r.height / 2 - mh / 2 : q.align === 'end' ? r.bottom + 4 - mh : r.top - 4;
          top = Math.max(8, Math.min(top, vh - mh - 8));
        } else {
          var below = r.bottom + gap + mh <= vh - 8, above = r.top - gap - mh >= 8;
          var up = q.side === 'top' ? above || !below : !below && above;
          top = up ? r.top - gap - mh : r.bottom + gap;
          left = q.center ? r.left + r.width / 2 - mw / 2 : q.align === 'end' ? r.right - mw : r.left;
          left = Math.max(8, Math.min(left, vw - mw - 8));
        }
        var th = a.closest('[data-theme]');
        var next = { top: Math.round(top), left: Math.round(left), theme: th ? th.getAttribute('data-theme') : null };
        setPos(function (p0) { return p0 && p0.top === next.top && p0.left === next.left && p0.theme === next.theme ? p0 : next; });
      }
      place();
      // once more after the popup has laid out at its real size in the body
      var raf = requestAnimationFrame(place);
      window.addEventListener('scroll', place, true);
      window.addEventListener('resize', place);
      return function () { cancelAnimationFrame(raf); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
    }, [open]);
    return pos;
  }
  // A popup element floated by useFloat: fixed at its coordinates inside document.body, carrying the anchor's theme.
  function floated(el, pos) {
    if (!el || !pos) return el;
    var RD = window.ReactDOM;
    var next = React.cloneElement(el, { 'data-theme': pos.theme || undefined, style: Object.assign({}, el.props.style, { position: 'fixed', top: pos.top, left: pos.left, right: 'auto', bottom: 'auto' }) });
    return RD && RD.createPortal ? RD.createPortal(next, document.body) : next;
  }
  // Calls onClose on a mousedown outside every ref, and on Escape.
  function useOutside(refs, open, onClose) {
    var cb = useRef(onClose); cb.current = onClose;
    var rs = useRef(refs); rs.current = refs;
    useEffect(function () {
      if (!open) return undefined;
      function inside(t) { return rs.current.some(function (r) { return r.current && r.current.contains(t); }); }
      function down(e) { if (!inside(e.target)) cb.current(e); }
      function key(e) { if (e.key === 'Escape') cb.current(e); }
      document.addEventListener('mousedown', down);
      document.addEventListener('keydown', key);
      return function () { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
    }, [open]);
  }
  // "mod+k", "shift+?", "ctrl+alt+p": mod is Command on Apple platforms and Ctrl elsewhere.
  function parseHotkey(s) {
    var parts = String(s).toLowerCase().split('+').filter(Boolean), c = { key: parts[parts.length - 1] };
    parts.slice(0, -1).forEach(function (m) { c[m === 'cmd' || m === 'command' || m === 'meta' ? 'meta' : m === 'control' ? 'ctrl' : m === 'option' || m === 'opt' ? 'alt' : m] = true; });
    return c;
  }
  function hotkeyMatch(e, c) {
    var apple = isApple(), meta = !!c.meta || (!!c.mod && apple), ctrl = !!c.ctrl || (!!c.mod && !apple);
    return e.metaKey === meta && e.ctrlKey === ctrl && e.altKey === !!c.alt && (c.shift == null ? true : e.shiftKey === !!c.shift) && String(e.key).toLowerCase() === c.key;
  }
  function useHotkey(combo, onKey, on) {
    var cb = useRef(onKey); cb.current = onKey;
    useEffect(function () {
      if (!combo || on === false) return undefined;
      var c = parseHotkey(combo);
      function key(e) { if (hotkeyMatch(e, c)) { e.preventDefault(); cb.current(e); } }
      document.addEventListener('keydown', key);
      return function () { document.removeEventListener('keydown', key); };
    }, [combo, on]);
  }
  // Matching for the command menu and the switcher: every word of the query must appear in the label, description or keywords.
  // Label matches rank first: at its start, then at a word start (after a space, _, -, ., / or :), then anywhere.
  function textOf(v) { return typeof v === 'string' || typeof v === 'number' ? String(v) : ''; }
  function queryWords(q) { return String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean); }
  function matchScore(it, words) {
    if (!words.length) return 1;
    var label = (it.searchText != null ? String(it.searchText) : textOf(it.label)).toLowerCase();
    var hay = [label, textOf(it.description), textOf(it.meta), (it.keywords || []).join(' ')].join(' ').toLowerCase(), s = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (hay.indexOf(w) < 0) return 0;
      var at = label.indexOf(w);
      s += at === 0 ? 4 : at > 0 && /[\s_\-./:]/.test(label.charAt(at - 1)) ? 3 : at > 0 ? 2 : 1;
    }
    return s;
  }
  // The matched part of a string label, in <mark> (accent, on-accent text): the first place each word appears.
  function markWords(text, words) {
    if (typeof text !== 'string' || !words.length) return text;
    var low = text.toLowerCase(), marks = [];
    words.forEach(function (w) { var i = low.indexOf(w); if (i >= 0) marks.push([i, i + w.length]); });
    if (!marks.length) return text;
    marks.sort(function (a, b) { return a[0] - b[0]; });
    var out = [], at = 0;
    marks.forEach(function (m, k) { if (m[0] < at) return; if (m[0] > at) out.push(text.slice(at, m[0])); out.push(h('mark', { key: k }, text.slice(m[0], m[1]))); at = m[1]; });
    if (at < text.length) out.push(text.slice(at));
    return out;
  }

  /* useAutoHeight: the outer box eases to the height of its inner box over 200ms on the slide curve, whenever the inner box changes
     size (a new step, an error line, a longer announcement). First paint and reduced motion set it without motion. */
  function useAutoHeight(outerRef, innerRef, on, dep) {
    var first = useRef(true);
    useIsoLayout(function () {
      var o = outerRef.current, n = innerRef.current;
      if (!o) return undefined;
      if (!on || !n) { o.style.height = ''; return undefined; }
      function set(animate) {
        var hgt = n.offsetHeight + 'px';
        if (o.style.height === hgt) return;
        if (!animate || reducedMotion()) { o.style.transition = 'none'; o.style.height = hgt; void o.offsetHeight; o.style.transition = ''; }
        else o.style.height = hgt;
      }
      set(!first.current);
      first.current = false;
      var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { set(true); }) : null;
      if (ro) ro.observe(n);
      return function () { if (ro) ro.disconnect(); };
    }, [on, dep]);
  }

  /* StepStage: one pane at a time, sliding in from the direction of travel while the one it replaces slides out the other way, over
     200ms on the slide curve; its height follows the new pane. MultiStep and Announcements use it. The box clips only while something
     moves, so popups and focus outlines inside a settled pane are never cut. */
  function StepStage(p) {
    var st = useState({ cur: p.index, prev: null, dir: 1, n: 0 }), s = st[0], setS = st[1];
    if (s.cur !== p.index) {
      // derived during render, so the first frame of a change already shows both panes
      s = { cur: p.index, prev: s.cur, dir: p.dir || (p.index > s.cur ? 1 : -1), n: s.n + 1 };
      setS(s);
    }
    var reduce = reducedMotion();
    var outer = useRef(null), inner = useRef(null);
    useEffect(function () {
      if (s.prev == null) return undefined;
      if (reduce) { setS(function (x) { return Object.assign({}, x, { prev: null }); }); return undefined; }
      var n = s.n;
      var t = setTimeout(function () { setS(function (x) { return x.n === n ? Object.assign({}, x, { prev: null }) : x; }); }, 230);
      return function () { clearTimeout(t); };
    }, [s.n]);
    useAutoHeight(outer, inner, p.autoHeight !== false, s.cur);
    var moving = s.prev != null && !reduce;
    return h('div', { ref: outer, className: cx('ifs-stage', moving && 'ifs-stage--moving', p.className), style: p.style, onTransitionEnd: p.onTransitionEnd },
      h('div', { ref: inner, key: 'c' + s.cur, className: cx('ifs-stage__pane', p.paneClassName, moving && (s.dir > 0 ? 'ifs-stage__pane--in-next' : 'ifs-stage__pane--in-prev')), 'data-pane': s.cur }, p.render(s.cur)),
      moving ? h('div', { key: 'p' + s.prev, className: cx('ifs-stage__pane ifs-stage__pane--out', p.paneClassName, s.dir > 0 ? 'ifs-stage__pane--out-next' : 'ifs-stage__pane--out-prev'), 'aria-hidden': true, inert: '' }, p.render(s.prev)) : null);
  }

  /* FloatTip: a tooltip that floats out of anything that clips it (the collapsed sidebar), beside its trigger. Same ink bubble as Tooltip. */
  function FloatTip(p) {
    var s = useState(false), open = s[0], setOpen = s[1];
    var anchor = useRef(null), tip = useRef(null), t = useRef(null), id = useId();
    var pos = useFloat(open, anchor, tip, { portal: true, side: p.side || 'right', center: true, gap: 8 });
    useEffect(function () { return function () { clearTimeout(t.current); }; }, []);
    function show(now) { clearTimeout(t.current); if (now) setOpen(true); else t.current = setTimeout(function () { setOpen(true); }, 300); }
    function hide() { clearTimeout(t.current); setOpen(false); }
    var child = React.Children.only(p.children);
    var trigger = React.cloneElement(child, {
      'aria-describedby': open && p.describe ? id : child.props['aria-describedby'],
      onMouseEnter: chain(child.props.onMouseEnter, function () { if (!p.disabled) show(false); }), onMouseLeave: chain(child.props.onMouseLeave, hide),
      onFocus: chain(child.props.onFocus, function (e) { if (!p.disabled && e.target.matches && e.target.matches(':focus-visible')) show(true); }), onBlur: chain(child.props.onBlur, hide),
      onMouseDown: chain(child.props.onMouseDown, hide), onKeyDown: chain(child.props.onKeyDown, function (e) { if (e.key === 'Escape') hide(); }),
    });
    var fside = p.side || 'right';
    if (pos && anchor.current && (fside === 'top' || fside === 'bottom')) { var fr = anchor.current.getBoundingClientRect(); fside = pos.top >= fr.bottom - 1 ? 'bottom' : 'top'; }
    var bubble = open && !p.disabled ? h('span', { ref: tip, role: 'tooltip', id: id, className: 'ifs-tooltip ifs-tooltip--float ifs-tooltip--float-' + fside, style: pos ? null : { visibility: 'hidden' } },
      h('span', null, p.content), p.shortcut ? h(Kbd, { keys: p.shortcut, size: 'sm' }) : null, h('span', { className: 'ifs-tooltip__nub', 'aria-hidden': true })) : null;
    return h('span', { ref: anchor, className: cx('ifs-tooltip-anchor', p.className) }, trigger, floated(bubble, pos));
  }

  /* ------------------------------------------------------------ AppTile */
  // The app tile: the ink mark at 20 by 10 on a 28px accent square, radius-control corners when corners are on. The mark's path is
  // infisical-mark.svg's, drawn in on-accent (the ink).
  var MARK_D = 'M37.7583 6.37505C41.2043 6.37505 44.4422 7.67224 46.88 10.0168C49.3175 12.3658 50.6588 15.4859 50.6588 18.8066C50.6588 22.1273 49.3175 25.2476 46.88 27.5966C44.4422 29.9457 41.2043 31.2381 37.7583 31.2381C33.956 31.2381 30.8061 29.9813 28.1324 27.4049C27.1751 26.4821 26.2731 25.3901 25.3296 23.9994C24.386 25.3901 23.4838 26.4821 22.5264 27.4049C19.8528 29.9857 16.7028 31.2381 12.9006 31.2381C9.45459 31.2381 6.21664 29.941 3.77897 27.5966C1.34134 25.2476 0 22.1273 0 18.8066C8.22433e-07 15.4859 1.34136 12.3658 3.77897 10.0168C6.21664 7.6678 9.45459 6.37505 12.9006 6.37505C16.7028 6.37505 19.8528 7.63219 22.5264 10.2085C23.4838 11.1312 24.386 12.2231 25.3296 13.6138C26.2731 12.2231 27.1751 11.1312 28.1324 10.2085C30.8061 7.62773 33.956 6.37505 37.7583 6.37505ZM37.7536 11.6437C35.4131 11.6437 33.6323 12.3479 31.9856 13.9347C30.7274 15.1471 29.6913 16.7072 28.4515 18.8111C29.6913 20.9149 30.7274 22.4751 31.9856 23.6874C33.6323 25.2699 35.4085 25.9785 37.7536 25.9785C38.7341 25.9785 39.6917 25.7912 40.6029 25.4302C41.5095 25.0737 42.3237 24.5476 43.0175 23.8789C43.7113 23.206 44.2525 22.4261 44.6272 21.5523C45.0065 20.6743 45.196 19.7515 45.196 18.8066L45.1916 18.8111C45.1916 17.8661 44.9973 16.9434 44.6226 16.0698C44.2479 15.1962 43.7067 14.4118 43.0129 13.7432C42.3191 13.0746 41.5049 12.5487 40.5985 12.1876C39.6919 11.8266 38.7341 11.6437 37.7536 11.6437ZM12.9006 11.6392C10.944 11.6392 9.02897 12.4059 7.64131 13.7387C6.23518 15.0892 5.4628 16.8944 5.4628 18.8066C5.4628 20.7187 6.23516 22.5196 7.64131 23.8747C9.04284 25.2296 10.9116 25.9739 12.9006 25.9739C15.2411 25.9739 17.0221 25.2699 18.6688 23.683C19.9269 22.4705 20.9629 20.9105 22.2025 18.8066C20.9629 16.7027 19.9269 15.1426 18.6688 13.9302C17.0267 12.3479 15.2458 11.6392 12.9006 11.6392Z';
  function AppTile(p) {
    var s = p.size || 28;
    return h('span', { className: cx('ifs-apptile', p.className), style: { '--s': s + 'px' }, role: p.label ? 'img' : undefined, 'aria-label': p.label, 'aria-hidden': p.label ? undefined : true },
      h('svg', { viewBox: '0 6.3 50.8 25.1', width: Math.round(s * 20 / 28), height: Math.round(s * 10 / 28), focusable: 'false' },
        h('path', { d: MARK_D, fill: 'currentColor', fillRule: 'evenodd', clipRule: 'evenodd' })));
  }

  /* ------------------------------------------------------------ SearchTrigger */
  // A button that looks like a search field and opens the command menu: the search icon, a muted label and the shortcut in a nested
  // slot. `compact` is the 32px icon-only form. It never takes text; typing happens in the CommandMenu.
  function SearchTrigger(p) {
    var rest = omit(p, ['label', 'shortcut', 'compact', 'className']);
    var label = p.label || 'Search';
    var keys = p.shortcut === false ? null : p.shortcut || 'mod+K';
    var spoken = keys ? parseKeys(keys, isApple())[0].map(function (k) { return k === '⌘' ? 'Meta' : k === '⌃' || k === 'Ctrl' ? 'Control' : k === '⇧' ? 'Shift' : k === '⌥' ? 'Alt' : k; }).join('+') : undefined;
    return h('button', Object.assign({ type: 'button', className: cx('ifs-searchbtn', p.compact && 'ifs-searchbtn--compact', p.className), 'aria-label': label, 'aria-keyshortcuts': spoken, 'aria-haspopup': 'dialog' }, rest),
      h(Icon, { name: 'search', size: 16, strokeWidth: 1.8 }),
      p.compact ? null : h('span', { className: 'ifs-searchbtn__label' }, label),
      p.compact || !keys ? null : h('span', { className: 'ifs-searchbtn__kbd' }, h(Kbd, { keys: keys, size: 'sm' })));
  }

  /* ------------------------------------------------------------ CommandMenu */
  /* Global navigation and search, opened with mod+K from anywhere. A dialog near the top of the page: a search row, grouped results
     that filter and rank as you type (the matched part marked in the accent), and a footer of key hints. Results can open a page of
     their own ("Switch organization"), which shows as a crumb in the search row; Backspace on an empty search or Escape goes back.
     Up and Down move, Enter opens (mod+Enter opens a link in a new tab), Escape closes. `loading` shows the inline spinner while a
     search runs; `filter={false}` shows results as given, for searches done elsewhere. `inline` renders the panel in place, for docs
     and empty states. */
  function CommandMenu(p) {
    var os = useControllable(p.open, !!p.defaultOpen, p.onOpenChange), open = os[0], setOpen = os[1];
    var openRef = useRef(open); openRef.current = open;
    useHotkey(p.hotkey === undefined ? 'mod+k' : p.hotkey, function () { setOpen(!openRef.current); }, !p.inline);
    var id = useId();
    function close() { setOpen(false); }
    if (p.inline) return h('div', { className: cx('ifs-cmd ifs-cmd--inline', p.className), style: Object.assign(p.width ? { maxWidth: p.width } : {}, p.style) }, h(CommandPanel, Object.assign({}, p, { id: id, onClose: null })));
    return h(Modal, { open: open, onClose: close, role: 'dialog', ariaLabel: p.label || 'Command menu', className: cx('ifs-cmd', p.className), overlayClassName: 'ifs-overlay--cmd', style: p.width ? { width: p.width } : undefined, portal: p.portal },
      h(CommandPanel, Object.assign({}, p, { id: id, onClose: close })));
  }
  function CommandPanel(p) {
    var id = p.id;
    var q0 = useState(p.defaultQuery || ''), query = q0[0], setQueryRaw = q0[1];
    var pg = useState(p.defaultPage ? [p.defaultPage] : []), stack = pg[0], setStack = pg[1];
    var a0 = useState(-1), active = a0[0], setActive = a0[1];
    var inputRef = useRef(null), listRef = useRef(null), byKey = useRef(false);
    useEdgeFade(listRef);
    var pageId = stack.length ? stack[stack.length - 1] : null;
    var page = pageId && p.pages ? p.pages[pageId] || null : null;
    function notify(v, pid) { if (p.onQueryChange) p.onQueryChange(v, pid); }
    function setQuery(v) { setQueryRaw(v); setActive(-1); notify(v, pageId); }
    var words = queryWords(query);
    var src = page ? page.groups : p.groups;
    var filter = page && page.filter !== undefined ? page.filter : p.filter;
    var groups = [];
    (src || []).forEach(function (g, gi) {
      var ranked = (g.items || []).map(function (it, k) { return { it: it, k: k, s: filter === false ? 1 : typeof filter === 'function' ? (filter(it, query) ? 1 : 0) : matchScore(it, words) }; })
        .filter(function (x) { return x.s > 0; });
      if (words.length && filter !== false && typeof filter !== 'function') ranked.sort(function (a, b) { return b.s - a.s || a.k - b.k; });
      var items = ranked.map(function (x) { return x.it; });
      if (words.length && g.limit) items = items.slice(0, g.limit);
      if (!words.length && g.searchOnly) items = [];
      if (items.length) groups.push({ key: g.id || g.label || 'g' + gi, label: g.label, meta: g.meta, items: items });
    });
    if (!page && !words.length && p.recent && p.recent.length) groups.unshift({ key: '$recent', label: p.recentLabel || 'Recent', items: p.recent });
    var flat = [];
    groups.forEach(function (G) { G.items.forEach(function (it) { flat.push(it); }); });
    function dis(i) { return !!flat[i].disabled; }
    var cur = active >= 0 && active < flat.length && !dis(active) ? active : nextIndex(-1, 1, flat, dis);
    if (cur >= 0 && dis(cur)) cur = -1;
    useEffect(function () {
      if (!byKey.current || cur < 0) return;
      byKey.current = false;
      var el = document.getElementById(id + '-o' + cur);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }, [cur]);
    function push(pid) { setStack(stack.concat([pid])); setQueryRaw(''); setActive(-1); notify('', pid); focusEl(inputRef.current); }
    function back() {
      if (!stack.length) return false;
      var rest = stack.slice(0, -1);
      setStack(rest); setQueryRaw(''); setActive(-1); notify('', rest.length ? rest[rest.length - 1] : null); focusEl(inputRef.current);
      return true;
    }
    function choose(it, e) {
      if (!it || it.disabled) return;
      if (it.page) { push(it.page); return; }
      var newTab = !!(e && (e.metaKey || e.ctrlKey));
      if (it.onSelect) it.onSelect(it, { newTab: newTab });
      if (p.onSelect) p.onSelect(it, { newTab: newTab });
      if (it.href && !it.onSelect && !p.onSelect) { if (newTab) window.open(it.href, '_blank', 'noopener'); else window.location.assign(it.href); }
      if (!it.keepOpen && !newTab && p.onClose) p.onClose();
    }
    function onKey(e) {
      var k = e.key;
      if (k === 'ArrowDown' || (e.ctrlKey && (k === 'n' || k === 'j'))) { e.preventDefault(); byKey.current = true; setActive(nextIndex(cur, 1, flat, dis)); }
      else if (k === 'ArrowUp' || (e.ctrlKey && (k === 'p' || k === 'k'))) { e.preventDefault(); byKey.current = true; setActive(nextIndex(cur, -1, flat, dis)); }
      else if (k === 'Enter') { if (cur >= 0) { e.preventDefault(); choose(flat[cur], e); } }
      else if (k === 'Escape') { if (stack.length) { e.preventDefault(); e.stopPropagation(); back(); } else if (!p.onClose && query) { e.preventDefault(); setQuery(''); } }
      else if (k === 'Backspace' && !query && stack.length) { e.preventDefault(); back(); }
    }
    var loading = page ? !!page.loading : !!p.loading;
    var title = page ? page.title : null;
    var search = h('div', { className: 'ifs-cmd__search' },
      stack.length ? h('button', { type: 'button', className: 'ifs-iconbtn ifs-cmd__back', 'aria-label': 'Back', onClick: back }, h(Icon, { name: 'chev-left', size: 16 }))
        : h(Icon, { name: 'search', size: 18, strokeWidth: 1.8, className: 'ifs-cmd__icon' }),
      title ? h('span', { className: 'ifs-cmd__scope' }, title) : null,
      h('input', {
        ref: inputRef, id: id + '-input', 'data-autofocus': true, className: 'ifs-cmd__input', type: 'text', role: 'combobox', 'aria-expanded': true, 'aria-controls': id + '-list',
        'aria-autocomplete': 'list', 'aria-activedescendant': cur >= 0 ? id + '-o' + cur : undefined, 'aria-label': title ? title : p.label || 'Search', autoComplete: 'off', spellCheck: false,
        placeholder: (page && page.placeholder) || p.placeholder || 'Search or jump to', value: query, onChange: function (e) { setQuery(e.target.value); }, onKeyDown: onKey,
      }),
      loading ? h(Spinner, { className: 'ifs-cmd__spinner' }) : null,
      p.onClose ? h(Kbd, { keys: 'esc', size: 'sm', className: 'ifs-cmd__esc' }) : null);
    var n = 0, body;
    function renderItem(it, i) {
      var on = i === cur;
      var lead = it.media != null ? h('span', { className: 'ifs-cmd__media' }, it.media) : it.icon ? h(Icon, { name: it.icon, size: 16 }) : null;
      var trail = it.page ? h(Icon, { name: 'chev-right', size: 15, strokeWidth: 1.8, className: 'ifs-cmd__chev' })
        : it.shortcut ? h(Kbd, { keys: it.shortcut, size: 'sm' })
          : it.meta != null ? h('span', { className: cx('ifs-cmd__meta', it.metaMono && 'ifs-cmd__meta--mono') }, it.meta) : null;
      return h('div', {
        key: it.id != null ? it.id : i, id: id + '-o' + i, role: 'option', 'aria-selected': on, 'aria-disabled': it.disabled || undefined,
        className: cx('ifs-cmd__item', on && 'ifs-cmd__item--active', it.danger && 'ifs-cmd__item--danger'),
        onMouseMove: function () { if (!on && !it.disabled) setActive(i); }, onMouseDown: function (e) { e.preventDefault(); }, onClick: function (e) { choose(it, e); },
      }, lead,
        h('span', { className: 'ifs-cmd__text' },
          h('span', { className: cx('ifs-cmd__name', it.mono && 'ifs-mono') }, markWords(it.label, words)),
          it.description != null ? h('span', { className: 'ifs-cmd__desc' }, it.description) : null),
        trail ? h('span', { className: 'ifs-cmd__trail' }, trail) : null);
    }
    if (flat.length) {
      body = groups.map(function (G, gi) {
        var gid = id + '-g' + gi;
        return h('div', { key: G.key, role: 'group', 'aria-labelledby': G.label ? gid : undefined, className: 'ifs-cmd__group' },
          G.label ? h('div', { id: gid, role: 'presentation', className: 'ifs-cmd__label' }, h('span', null, G.label), G.meta != null ? h('span', { className: 'ifs-cmd__label-meta' }, G.meta) : null) : null,
          G.items.map(function (it) { var i = n; n += 1; return renderItem(it, i); }));
      });
    } else if (loading) {
      body = h('div', { className: 'ifs-cmd__status' }, h(Loader, { size: 'inline', label: (page && page.loadingLabel) || p.loadingLabel || 'Searching' }));
    } else {
      var q = query.trim();
      body = h('div', { className: 'ifs-cmd__empty' },
        h('span', { className: 'ifs-cmd__empty-title' }, q ? ['No results for ', h('span', { key: 'q', className: 'ifs-cmd__q' }, '“' + q + '”'), '.'] : ((page && page.emptyText) || p.emptyText || 'Nothing here yet.')),
        q && (page ? page.emptyHint : p.emptyHint) ? h('span', { className: 'ifs-cmd__empty-hint' }, page ? page.emptyHint : p.emptyHint) : null);
    }
    var foot = p.footer === false ? null : h('div', { className: 'ifs-cmd__footer' },
      h('span', { className: 'ifs-cmd__hint' }, h(Kbd, { keys: ['up', 'down'], size: 'sm' }), 'Move'),
      h('span', { className: 'ifs-cmd__hint' }, h(Kbd, { keys: 'enter', size: 'sm' }), (cur >= 0 && flat[cur] && flat[cur].page) ? 'Open page' : 'Open'),
      p.onClose || stack.length ? h('span', { className: 'ifs-cmd__hint' }, h(Kbd, { keys: stack.length ? 'backspace' : 'esc', size: 'sm' }), stack.length ? 'Back' : 'Close') : null,
      p.footer != null ? h('span', { className: 'ifs-cmd__foot-end' }, p.footer) : null);
    var count = words.length && !loading ? h('span', { className: 'ifs-sr', role: 'status' }, flat.length ? flat.length + (flat.length === 1 ? ' result' : ' results') : 'No results') : h('span', { className: 'ifs-sr', role: 'status' });
    return h(React.Fragment, null, search,
      h('div', { ref: listRef, id: id + '-list', role: 'listbox', 'aria-label': title || p.listLabel || 'Results', className: 'ifs-cmd__list ifs-fade-y', style: { maxHeight: p.maxHeight || 360 } }, body),
      foot, count);
  }

  /* ------------------------------------------------------------ Switcher */
  /* Pick the organization, project or environment you are in, from its trigger in the sidebar header or a product breadcrumb. A
     listbox in a popover: a search row when there are more than seven options (or `searchable`), options with a lead (an Avatar or a
     Media tile), their meta and a check on the current one, groups, then actions after a rule ("Create project"). Rows share the
     menu geometry, so their text lines up with the search text 11px from the edge. It floats out of anything that clips it. Picking
     closes it and returns focus to the trigger. `header` sits above everything on a rule (the account in the Sidebar), and actions
     can be grouped with `{ type: 'separator' }` and `{ type: 'label', label }` entries. */
  function Switcher(p) {
    var os = useControllable(p.open, !!p.defaultOpen, p.onOpenChange), open = os[0], setOpen = os[1];
    var opts = p.options || [], acts = [], deco = {}, pend = [];
    (p.actions || []).forEach(function (a) {
      if (!a) return;
      if (a.type === 'separator' || a.type === 'label') { pend.push(a); return; }
      if (pend.length) { deco[acts.length] = pend; pend = []; }
      acts.push(a);
    });
    var q0 = useState(''), query = q0[0], setQuery = q0[1];
    var a0 = useState(-1), active = a0[0], setActive = a0[1];
    var wrap = useRef(null), trig = useRef(null), pop = useRef(null), input = useRef(null), list = useRef(null), foot = useRef(null), byKey = useRef(false), byUser = useRef(false);
    var id = useId();
    var searchable = p.searchable != null ? !!p.searchable : opts.length > 7;
    var words = queryWords(query);
    var shown = opts.filter(function (o) { return matchScore(o, words) > 0; });
    var rows = shown.map(function (o) { return { o: o }; }).concat(acts.map(function (a) { return { a: a }; }));
    function dis(i) { var r = rows[i]; return r.o ? !!r.o.disabled : !!r.a.disabled; }
    var pos = useFloat(open, wrap, pop, { portal: p.portal, side: p.side, align: p.align, width: p.width || 280 });
    useEdgeFade(list, [open]);
    function close(refocus) { setOpen(false); if (refocus) focusEl(trig.current); }
    useOutside([wrap, pop], open, function (e) { if (e.type === 'keydown') { if (!pop.current || !pop.current.contains(e.target)) close(false); } else close(false); });
    useEffect(function () {
      if (!open) { byUser.current = false; return; }
      setQuery('');
      var i = -1; opts.forEach(function (o, k) { if (i < 0 && o.value === p.value) i = k; });
      setActive(i >= 0 ? i : nextIndex(-1, 1, rows, dis));
    }, [open]);
    // focus moves in once the popup sits where it will stay (floated or in place)
    useEffect(function () { if (open && byUser.current) focusEl(searchable ? input.current : list.current); }, [open, !!pos]);
    useEffect(function () {
      if (!open || active < 0 || !byKey.current) return;
      byKey.current = false;
      var el = document.getElementById(id + '-o' + active);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }, [active, open]);
    var cur = active >= 0 && active < rows.length && !dis(active) ? active : nextIndex(-1, 1, rows, dis);
    if (cur >= 0 && dis(cur)) cur = -1;
    function pick(i) {
      var r = rows[i]; if (!r || dis(i)) return;
      if (r.o) { if (p.onChange) p.onChange(r.o.value, r.o); }
      else if (r.a.onSelect) r.a.onSelect(r.a);
      close(true);
    }
    function onKey(e) {
      var k = e.key, inInput = e.target === input.current;
      // with a footer, Tab walks the popover; past either end it closes and focus goes back to the button
      if (k === 'Tab' && p.footer != null && pop.current) {
        var fs = Array.prototype.filter.call(pop.current.querySelectorAll(FOCUSABLE + ', [role="listbox"]'), function (el) { return el.tabIndex >= 0 || el.getAttribute('role') === 'listbox'; });
        var at = fs.indexOf(e.target);
        if ((e.shiftKey && at === 0) || (!e.shiftKey && at === fs.length - 1)) { e.preventDefault(); close(true); return; }
      }
      // the footer holds its own controls: only Escape belongs to the popover there
      if (foot.current && foot.current.contains(e.target)) { if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } return; }
      if (k === 'ArrowDown') { e.preventDefault(); byKey.current = true; setActive(nextIndex(cur, 1, rows, dis)); }
      else if (k === 'ArrowUp') { e.preventDefault(); byKey.current = true; setActive(nextIndex(cur, -1, rows, dis)); }
      else if ((k === 'Home' || k === 'End') && !inInput) { e.preventDefault(); byKey.current = true; setActive(nextIndex(-1, k === 'Home' ? 1 : -1, rows, dis)); }
      else if (k === 'Enter' || (k === ' ' && !inInput)) { e.preventDefault(); if (cur >= 0) pick(cur); }
      else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (k === 'Tab') { if (p.footer == null) close(false); }
    }
    // with a footer, Tab moves into it; the popover closes once focus leaves it
    function onBlur(e) {
      var to = e.relatedTarget;
      if (p.footer == null || !to) return;
      if ((pop.current && pop.current.contains(to)) || (wrap.current && wrap.current.contains(to))) return;
      close(false);
    }
    var t = p.trigger;
    var trigger = t && React.cloneElement(t, {
      ref: trig, 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': open ? id + '-list' : undefined,
      onClick: chain(t.props.onClick, function () { byUser.current = true; if (open) close(false); else setOpen(true); }),
      onKeyDown: chain(t.props.onKeyDown, function (e) { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) { e.preventDefault(); byUser.current = true; setOpen(true); } }),
    });
    var out = [], lastGroup, optN = 0, ai = -1;
    function sep(key) { if (out.length && out[out.length - 1].props.className !== 'ifs-menu-sep') out.push(h('div', { key: key, role: 'none', 'aria-hidden': true, className: 'ifs-menu-sep' })); }
    rows.forEach(function (r, i) {
      // a listbox may only hold options and groups, so rules and labels between the actions are presentational
      if (r.a) {
        ai += 1;
        if (ai === 0 && shown.length) sep('sep');
        (deco[ai] || []).forEach(function (d, k) {
          if (d.type === 'separator') sep('d' + ai + '-' + k);
          else out.push(h('div', { key: 'd' + ai + '-' + k, role: 'presentation', className: 'ifs-menu-label' }, d.label));
        });
      }
      if (r.o && r.o.group && r.o.group !== lastGroup) { out.push(h('div', { key: 'g' + i, role: 'presentation', className: 'ifs-menu-label' }, r.o.group)); lastGroup = r.o.group; }
      var sel = !!r.o && r.o.value === p.value;
      var x = r.o || r.a;
      if (r.o) optN += 1;
      out.push(h('div', {
        key: r.o ? 'o' + String(r.o.value) : 'a' + i, id: id + '-o' + i, role: 'option', 'aria-selected': sel, 'aria-disabled': x.disabled || undefined,
        className: cx('ifs-option ifs-switcher__row', i === cur && 'ifs-option--active', r.a && 'ifs-switcher__action', r.a && x.danger && 'ifs-option--danger'),
        onMouseMove: function () { if (!dis(i) && i !== cur) setActive(i); }, onMouseDown: function (e) { e.preventDefault(); }, onClick: function () { pick(i); },
      },
        r.o ? (x.media != null ? h('span', { className: 'ifs-switcher__media' }, x.media) : null) : (x.icon ? h(Icon, { name: x.icon, size: 16 }) : null),
        h('span', { className: cx('ifs-option__label', x.mono && 'ifs-mono') }, r.o ? markWords(x.label, words) : x.label),
        x.meta != null ? h('span', { className: cx('ifs-option__meta', x.metaMono && 'ifs-option__meta--mono') }, x.meta) : x.shortcut ? h('span', { className: 'ifs-option__meta ifs-option__meta--kbd' }, h(Kbd, { keys: x.shortcut, size: 'sm' })) : null,
        sel ? h(Icon, { name: 'check', size: 15, strokeWidth: 2.2, className: 'ifs-option__check', style: { marginLeft: x.meta != null ? 0 : 'auto' } }) : null));
    });
    if (opts.length && !shown.length) out.unshift(h('div', { key: 'none', role: 'presentation', className: 'ifs-option ifs-switcher__none', 'aria-disabled': true }, p.emptyText || 'No matches'));
    var popEl = open ? h('div', {
      ref: pop, className: cx('ifs-pop ifs-switcher', searchable && 'ifs-switcher--search', p.header != null && 'ifs-switcher--head', !pos && p.align === 'end' && 'ifs-pop--end', !pos && p.side === 'top' && 'ifs-pop--up', pos && 'ifs-pop--float'),
      style: { width: p.width || 280, minWidth: 0 }, onKeyDown: onKey, onBlur: onBlur,
    },
      p.header != null ? h('div', { className: 'ifs-switcher__head' }, p.header) : null,
      p.header != null ? h('div', { role: 'none', 'aria-hidden': true, className: 'ifs-menu-sep' }) : null,
      searchable ? h('div', { className: 'ifs-switcher__search' }, h(Icon, { name: 'search', size: 15, strokeWidth: 1.8 }),
        h('input', { ref: input, type: 'text', role: 'combobox', 'aria-expanded': true, 'aria-controls': id + '-list', 'aria-autocomplete': 'list', 'aria-activedescendant': cur >= 0 ? id + '-o' + cur : undefined,
          'aria-label': p.placeholder || 'Find', placeholder: p.placeholder || 'Find', autoComplete: 'off', spellCheck: false, value: query, onChange: function (e) { setQuery(e.target.value); setActive(-1); } })) : null,
      h('div', { ref: list, id: id + '-list', role: 'listbox', tabIndex: searchable ? undefined : -1, 'aria-label': p.label || 'Switch', 'aria-activedescendant': !searchable && cur >= 0 ? id + '-o' + cur : undefined, className: 'ifs-switcher__list ifs-fade-y', style: p.maxHeight ? { maxHeight: p.maxHeight } : undefined }, out),
      p.footer != null ? h('div', { role: 'none', 'aria-hidden': true, className: 'ifs-menu-sep' }) : null,
      p.footer != null ? h('div', { ref: foot, className: 'ifs-switcher__foot' }, typeof p.footer === 'function' ? p.footer({ close: function () { close(true); } }) : p.footer) : null) : null;
    return h('div', { ref: wrap, className: cx('ifs-anchor ifs-switcher-anchor', p.className), style: p.style }, trigger, floated(popEl, pos));
  }

  /* ------------------------------------------------------------ Sidebar */
  /* The app's navigation: a 224px column on `sidebar` beside the inset, with a 1px `sidebar-line` between them. Top to bottom: the
     tools row (the collapse toggle at the start, search and invite icon buttons at the end), sections of nav rows under muted eyebrows,
     then footer rows and the account button, which holds the organization too: the org's avatar, your name and the org's name, opening
     one popover with you, the organizations to switch between, their actions and yours. Rows are 36px: an 18px icon, a `text2` label, a
     count or badge at the end. Hover is `sidebar-hover`; the current page is `sidebar-current` (ink at the press step) with ink text,
     and a group holding it keeps its label in ink. Counts are accent Counts. A row with `children` opens and closes them (one level, on a guide
     under its icon). `collapsed` is the 53px rail: the toggle stays where it was and the tools stack under it, icons only, each with a
     floating tooltip; groups open their pages in a flyout, section labels become rules and counts become a dot. Width eases over the
     slide curve. Up and Down move between rows. With `spaces` (Home, Organization), a segmented switch under the tools shows one space's
     sections at a time; the space follows the current page. Section labels run a rule to the sidebar's edge. A closed group shows its
     pages' counts. The account popover ends with a theme picker and you, as the row that opens your settings. */
  function navHas(it, id) { return !!(it.children && it.children.some(function (c) { return c.id === id || navHas(c, id); })); }
  function navKeys(e) {
    var k = e.key;
    if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Home' && k !== 'End') return;
    var t = e.target;
    if (!t || !t.matches || !t.matches('[data-nav]')) return;
    var all = Array.prototype.filter.call(e.currentTarget.querySelectorAll('[data-nav]'), function (el) {
      return !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('.ifs-collapse:not([data-open])');
    });
    var i = all.indexOf(t);
    if (i < 0) return;
    var n = k === 'Home' ? 0 : k === 'End' ? all.length - 1 : k === 'ArrowDown' ? Math.min(all.length - 1, i + 1) : Math.max(0, i - 1);
    e.preventDefault();
    if (all[n] !== t) focusEl(all[n]);
  }
  function NavFlyout(p) {
    var o = useState(false), open = o[0], setOpen = o[1];
    var wrap = useRef(null), pop = useRef(null), btn = useRef(null), byKey = useRef(false);
    var pos = useFloat(open, wrap, pop, { portal: true, side: 'right', gap: 8 });
    useOutside([wrap, pop], open, function (e) { setOpen(false); if (e.type === 'keydown') focusEl(btn.current); });
    useEffect(function () { if (open && pos && byKey.current && pop.current) { byKey.current = false; focusEl(pop.current.querySelector('[data-flyout]')); } }, [open, !!pos]);
    var it = p.item;
    function onPopKey(e) {
      var k = e.key;
      if (k !== 'ArrowDown' && k !== 'ArrowUp') return;
      var all = Array.prototype.slice.call(pop.current.querySelectorAll('[data-flyout]')), i = all.indexOf(document.activeElement);
      e.preventDefault();
      focusEl(all[k === 'ArrowDown' ? Math.min(all.length - 1, i + 1) : Math.max(0, i - 1)]);
    }
    var list = open ? h('div', { ref: pop, className: 'ifs-pop ifs-nav__flyout', role: 'group', 'aria-label': textOf(it.label) || undefined, style: { width: 200, minWidth: 0, visibility: pos ? undefined : 'hidden' }, onKeyDown: onPopKey },
      h('div', { className: 'ifs-menu-label', 'aria-hidden': true }, it.label),
      it.children.map(function (c) {
        var isCur = c.id === p.current;
        var props = { key: c.id, 'data-flyout': '', className: cx('ifs-option ifs-nav__fly', isCur && 'ifs-nav__fly--current'), 'aria-current': isCur ? 'page' : undefined,
          onClick: function (e) { if (c.onClick) c.onClick(e); if (p.onNavigate) p.onNavigate(c, e); setOpen(false); } };
        if (c.href != null) props.href = c.href; else props.type = 'button';
        return h(c.href != null ? 'a' : 'button', props, h('span', { className: 'ifs-option__label' }, c.label), c.count != null ? h('span', { className: 'ifs-option__meta' }, c.count) : null);
      })) : null;
    return h('span', { ref: wrap, className: 'ifs-anchor' },
      h(FloatTip, { content: it.label, disabled: open },
        h('button', { ref: btn, type: 'button', 'data-nav': '', className: cx('ifs-nav__item', p.inside && 'ifs-nav__item--current', open && !p.inside && 'ifs-nav__item--open'), 'aria-haspopup': 'true', 'aria-expanded': open,
          onClick: function () { setOpen(!open); }, onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { byKey.current = true; if (e.key === 'ArrowRight') { e.preventDefault(); setOpen(true); } } } },
          it.icon ? h(Icon, { name: it.icon, size: 18 }) : null, h('span', { className: 'ifs-nav__label' }, it.label), p.dot ? h('span', { className: 'ifs-nav__dot', 'aria-hidden': true }) : null)),
      floated(list, pos));
  }
  function navCount(it) { return it.count != null && it.count !== 0 && it.count !== '0' && it.count !== false; }
  function navCounts(items) { return (items || []).some(function (it) { return navCount(it) || navCounts(it.children); }); }
  // A closed group's count: the sum of its pages' numeric counts, or a dot when one is not a number
  function groupCount(kids) {
    var sum = 0, any = false, dot = false;
    kids.forEach(function (c) { if (!navCount(c)) return; any = true; var n = Number(c.count); if (isNaN(n)) dot = true; else sum += n; });
    return !any ? null : dot && !sum ? '•' : sum;
  }
  var THEMES = [['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['system', 'System', 'monitor']];
  // Light, Dark and System as a compact row of icon radios with floating tips: the theme picker in the account popover
  function ThemePick(p) {
    var id = useId(), refs = useRef([]);
    var ci = 0; THEMES.forEach(function (t, i) { if (t[0] === p.value) ci = i; });
    function key(e, i) {
      var n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % THEMES.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + THEMES.length) % THEMES.length;
      if (n === null) return;
      e.preventDefault(); p.onChange(THEMES[n][0]); focusEl(refs.current[n]);
    }
    return h('div', { className: 'ifs-themerow' },
      h('span', { id: id, className: 'ifs-themerow__label' }, p.label || 'Theme'),
      h('div', { role: 'radiogroup', 'aria-labelledby': id, className: 'ifs-themepick' }, THEMES.map(function (t, i) {
        var on = i === ci;
        return h(FloatTip, { key: t[0], content: t[1], side: 'top' },
          h('button', { ref: function (el) { refs.current[i] = el; }, type: 'button', role: 'radio', 'aria-checked': on, 'aria-label': t[1], tabIndex: on ? 0 : -1,
            className: 'ifs-themepick__opt', onClick: function () { p.onChange(t[0]); }, onKeyDown: function (e) { key(e, i); } }, h(Icon, { name: t[2], size: 16 })));
      })));
  }
  function Sidebar(p) {
    var cs = useControllable(p.collapsed, !!p.defaultCollapsed, p.onCollapsedChange), collapsed = cs[0], setCollapsed = cs[1];
    // spaces: one space's sections at a time, switched under the tools; the space holding the current page shows by default
    var spaces = p.spaces && p.spaces.length ? p.spaces : null;
    function spaceOf(itemId) {
      if (!spaces || itemId == null) return null;
      for (var i = 0; i < spaces.length; i++) {
        var hit = (spaces[i].sections || []).some(function (sec) { return (sec.items || []).some(function (it) { return it.id === itemId || navHas(it, itemId); }); });
        if (hit) return spaces[i].id;
      }
      return null;
    }
    var ss = useControllable(p.space, p.defaultSpace != null ? p.defaultSpace : (spaceOf(p.current) || (spaces ? spaces[0].id : null)), p.onSpaceChange), space = ss[0], setSpace = ss[1];
    // a page opened from elsewhere (the command menu, a link) shows its space
    useEffect(function () { var s2 = spaceOf(p.current); if (s2 && s2 !== space) setSpace(s2); }, [p.current]);
    var activeSpace = spaces ? (spaces.filter(function (x) { return x.id === space; })[0] || spaces[0]) : null;
    var sections = activeSpace ? activeSpace.sections || [] : p.sections || [];
    var allSections = spaces ? [].concat.apply([], spaces.map(function (x) { return x.sections || []; })) : sections;
    var og = useState(function () {
      var ids = [];
      function walk(items) { (items || []).forEach(function (it) { if (it.children && (it.defaultOpen || navHas(it, p.current))) ids.push(it.id); }); }
      allSections.forEach(function (s) { walk(s.items); });
      walk(p.footerItems);
      return ids;
    }), openIds = og[0], setOpenIds = og[1];
    // a page opened from elsewhere (the command menu) opens its group
    useEffect(function () {
      var add = [];
      function walk(items) { (items || []).forEach(function (it) { if (it.children && navHas(it, p.current) && openIds.indexOf(it.id) < 0) add.push(it.id); }); }
      allSections.forEach(function (s) { walk(s.items); });
      if (add.length) setOpenIds(openIds.concat(add));
    }, [p.current]);
    var navRef = useRef(null);
    useEdgeFade(navRef, [collapsed, activeSpace && activeSpace.id]);
    var uid = useId();
    function toggle(itemId) { setOpenIds(openIds.indexOf(itemId) >= 0 ? openIds.filter(function (x) { return x !== itemId; }) : openIds.concat([itemId])); }
    function row(it, depth) {
      var isCur = it.id === p.current, kids = it.children && it.children.length ? it.children : null;
      var open = !!kids && openIds.indexOf(it.id) >= 0, inside = !!kids && navHas(it, p.current);
      var gid = uid + '-' + it.id;
      var dot = navCount(it);
      var kidCount = kids && !open && !collapsed ? groupCount(kids) : null;
      if (collapsed && !depth && kids) return h('li', { key: it.id, className: 'ifs-nav__li' }, h(NavFlyout, { item: it, current: p.current, inside: inside, onNavigate: p.onNavigate, dot: it.children.some(function (c) { return c.count != null && c.count !== 0; }) }));
      var props = { 'data-nav': '', className: cx('ifs-nav__item', depth && 'ifs-nav__item--sub', isCur && 'ifs-nav__item--current', inside && 'ifs-nav__item--inside', it.disabled && 'ifs-nav__item--disabled') };
      var tag = 'button';
      if (kids) { props.type = 'button'; props['aria-expanded'] = open; props['aria-controls'] = gid; props.onClick = function () { toggle(it.id); }; }
      else {
        if (isCur) props['aria-current'] = 'page';
        var click = function (e) { if (it.disabled) { e.preventDefault(); return; } if (it.onClick) it.onClick(e); if (p.onNavigate) p.onNavigate(it, e); };
        if (it.href != null) { tag = 'a'; props.href = it.disabled ? undefined : it.href; props['aria-disabled'] = it.disabled || undefined; props.onClick = click; if (it.external) { props.target = '_blank'; props.rel = 'noreferrer'; } }
        else { props.type = 'button'; props.disabled = it.disabled; props.onClick = click; }
      }
      var el = h(tag, props,
        it.icon && !depth ? h(Icon, { name: it.icon, size: 18 }) : null,
        h('span', { className: 'ifs-nav__label' }, it.label, it.external ? h('span', { className: 'ifs-sr' }, ', opens in a new tab') : null),
        it.badge != null ? h('span', { className: 'ifs-nav__badge' }, it.badge) : null,
        it.count != null ? h(Count, { className: 'ifs-nav__count' }, it.count) : null,
        kidCount != null ? h(Count, { className: 'ifs-nav__count' }, kidCount) : null,
        it.external ? h(Icon, { name: 'external', size: 14, strokeWidth: 1.8, className: 'ifs-nav__trail' }) : null,
        kids ? h(Icon, { name: 'chev-right', size: 14, strokeWidth: 1.9, className: 'ifs-nav__chev' }) : null,
        collapsed && dot ? h('span', { className: 'ifs-nav__dot', 'aria-hidden': true }) : null);
      if (collapsed && !depth) el = h(FloatTip, { content: it.count != null ? [it.label, h('span', { key: 'c', className: 'ifs-tooltip__count' }, it.count)] : it.label, shortcut: it.shortcut }, el);
      return h('li', { key: it.id, className: 'ifs-nav__li' }, el,
        kids && !collapsed ? h(AnimatedCollapse, { open: open, id: gid, lazy: true }, h('ul', { role: 'list', className: 'ifs-nav__sub' }, kids.map(function (c) { return row(c, 1); }))) : null);
    }
    var o = p.org, u = p.user, s = p.search, inv = p.invite;
    // the tools row: the toggle keeps its place at the start in both widths; in the rail the tools stack under it
    var tipSide = collapsed ? 'right' : 'bottom';
    function tool(key, label, icon, onClick, extra, shortcut) {
      return h(FloatTip, { key: key, content: label, shortcut: shortcut, side: tipSide },
        h('button', Object.assign({ type: 'button', className: 'ifs-iconbtn ifs-sidebar__tool', 'aria-label': label, onClick: onClick }, extra), h(Icon, { name: icon, size: 18 })));
    }
    var tlabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    var toggleBtn = p.collapsible === false ? null : tool('toggle', tlabel, 'sidebar', function () { setCollapsed(!collapsed); }, { className: 'ifs-iconbtn ifs-sidebar__tool ifs-sidebar__toggle', 'aria-expanded': !collapsed });
    var searchBtn = s === false || s == null ? null : React.isValidElement(s) ? s : (function () {
      var keys = s.shortcut === false ? null : s.shortcut || 'mod+K';
      var spoken = keys ? parseKeys(keys, isApple())[0].map(function (k) { return k === '⌘' ? 'Meta' : k === '⌃' || k === 'Ctrl' ? 'Control' : k === '⇧' ? 'Shift' : k === '⌥' ? 'Alt' : k; }).join('+') : undefined;
      return tool('search', s.label || 'Search', 'search', s.onClick, { 'aria-haspopup': 'dialog', 'aria-keyshortcuts': spoken }, keys);
    })();
    var inviteBtn = inv === false || inv == null ? null : React.isValidElement(inv) ? inv : tool('invite', inv.label || 'Invite members', 'user-plus', inv.onClick, inv.dialog === false ? null : { 'aria-haspopup': 'dialog' });
    var tools = toggleBtn || searchBtn || inviteBtn ? h('div', { className: 'ifs-sidebar__tools' }, toggleBtn, h('span', { key: 'gap', className: 'ifs-sidebar__tools-gap', 'aria-hidden': true }), searchBtn, inviteBtn) : null;
    // the account button: the organization's avatar, your name and the organization's name, and one popover for both
    var account = null;
    if (o || u) {
      var orgOpts = o ? o.options || [] : [];
      var opts = orgOpts.some(function (x) { return x.group; }) ? orgOpts : orgOpts.map(function (x) { return Object.assign({ group: o.optionsLabel || 'Organizations' }, x); });
      var acts = [].concat(o && o.actions ? o.actions : []);
      if (u && u.items && u.items.length) acts = acts.concat(acts.length ? [{ type: 'separator' }] : [], u.items);
      // both are Identity layouts: you at the popover's foot (the row that opens your settings, when it has somewhere to go), and in
      // the button the organization's avatar beside your name
      var th = p.theme;
      var foot = u || th ? function (api) {
        var me = null;
        if (u) {
          var who = h(Identity, { className: 'ifs-account', name: u.name, initials: u.initials, size: 28, description: u.email, 'aria-hidden': u.href != null || u.onClick ? true : undefined });
          if (u.href != null || u.onClick) {
            var go = u.settingsLabel || 'Personal settings';
            var mp = { className: 'ifs-sidebar__me', 'aria-label': go + ', ' + u.name + (u.email ? ', ' + u.email : ''), onClick: function (e) { if (u.onClick) u.onClick(e); api.close(); } };
            if (u.href != null) mp.href = u.href; else mp.type = 'button';
            me = h(FloatTip, { content: go, side: 'top', className: 'ifs-sidebar__me-anchor' }, h(u.href != null ? 'a' : 'button', mp, who, h(Icon, { name: 'chev-right', size: 14, strokeWidth: 1.9, className: 'ifs-sidebar__me-chev' })));
          } else me = h('div', { className: 'ifs-sidebar__me ifs-sidebar__me--static' }, who);
        }
        return [
          th ? h(ThemePick, { key: 'theme', value: th.value || 'system', onChange: th.onChange || function () {}, label: th.label }) : null,
          th && me ? h('div', { key: 'sep', role: 'none', 'aria-hidden': true, className: 'ifs-menu-sep' }) : null,
          me ? h(React.Fragment, { key: 'me' }, me) : null
        ];
      } : null;
      var lead = o ? (o.media != null ? o.media : h(Avatar, { kind: 'org', name: o.name, size: 20 })) : h(Avatar, { name: u.name, initials: u.initials, size: 20 });
      var line1 = u ? u.name : o.name, line2 = u ? (o ? o.name : u.email) : o.plan;
      var said = (u ? u.name + (o ? ', ' + o.name : u.email ? ', ' + u.email : '') : o.name + (o.plan ? ', ' + o.plan : '')) + '. ' + (o && u ? 'Account and organization' : o ? 'Switch organization' : 'Account menu');
      var trig = h('button', { type: 'button', className: 'ifs-sidebar__user', 'aria-label': said },
        h(Identity, { className: 'ifs-sidebar__who', media: lead, title: line1, description: line2, 'aria-hidden': true }),
        h(Icon, { name: 'chev-ud', size: 16, strokeWidth: 1.8, className: 'ifs-sidebar__user-chev' }));
      account = h(Switcher, Object.assign({ placeholder: 'Find an organization' }, o ? omit(o, ['name', 'plan', 'options', 'actions', 'optionsLabel', 'media']) : {}, {
        label: o && u ? 'Account and organization' : o ? 'Switch organization' : 'Account', width: 264, side: collapsed ? 'right' : 'top', align: collapsed ? 'end' : 'start', portal: true,
        className: 'ifs-sidebar__user-anchor', trigger: trig, footer: foot, options: opts, actions: acts,
        searchable: o && o.searchable != null ? o.searchable : opts.length > 7 }));
    }
    var switcher = null;
    if (spaces) {
      var sl = p.spacesLabel || 'Navigation';
      var mark = function (x) { return x.id !== activeSpace.id && navCounts([].concat.apply([], (x.sections || []).map(function (sec) { return sec.items || []; }))); };
      if (!collapsed) {
        switcher = h('div', { className: 'ifs-sidebar__spaces' }, h(Tabs, { variant: 'segmented', label: sl, value: activeSpace.id, onChange: setSpace,
          tabs: spaces.map(function (x) { return { value: x.id, label: mark(x) ? [x.label, h('span', { key: 'd', className: 'ifs-sidebar__space-dot', 'aria-hidden': true }), h('span', { key: 's', className: 'ifs-sr' }, ', has updates')] : x.label }; }) }));
      } else {
        // the rail: the same switch, stacked icons in a tint pill, each with a floating tip
        var srefs = [];
        switcher = h('div', { className: 'ifs-sidebar__spaces ifs-sidebar__spaces--rail' },
          h('div', { role: 'tablist', 'aria-label': sl, 'aria-orientation': 'vertical', className: 'ifs-sidebar__railspaces' }, spaces.map(function (x, i) {
            var on = x.id === activeSpace.id;
            return h(FloatTip, { key: x.id, content: x.label },
              h('button', { ref: function (el) { srefs[i] = el; }, type: 'button', role: 'tab', 'aria-selected': on, tabIndex: on ? 0 : -1, 'aria-label': x.label + (mark(x) ? ', has updates' : ''),
                className: 'ifs-sidebar__railspace', onClick: function () { setSpace(x.id); },
                onKeyDown: function (e) {
                  var n = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? (i + 1) % spaces.length : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? (i - 1 + spaces.length) % spaces.length : null;
                  if (n === null) return; e.preventDefault(); setSpace(spaces[n].id); focusEl(srefs[n]);
                } },
                h(Icon, { name: x.icon || 'home', size: 18 }), mark(x) ? h('span', { className: 'ifs-nav__dot', 'aria-hidden': true }) : null));
          })));
      }
    }
    return h('div', { className: cx('ifs-sidebar', collapsed && 'ifs-sidebar--collapsed', p.edge === false && 'ifs-sidebar--edgeless', p.className), style: p.style },
      p.header != null ? h('div', { className: 'ifs-sidebar__head' }, p.header) : null,
      tools,
      switcher,
      h('nav', { ref: navRef, className: 'ifs-nav ifs-fade-y', 'aria-label': p.label || (activeSpace ? activeSpace.label : 'Main'), onKeyDown: navKeys },
        sections.map(function (sec, si) {
          var hid = uid + '-s' + si;
          return h('div', { key: sec.id || si, className: 'ifs-nav__section', role: sec.label ? 'group' : undefined, 'aria-labelledby': sec.label ? hid : undefined },
            sec.label ? h('div', { id: hid, className: 'ifs-nav__heading' }, sec.label) : null,
            h('ul', { role: 'list', className: 'ifs-nav__list' }, (sec.items || []).map(function (it) { return row(it, 0); })));
        })),
      (p.footerItems && p.footerItems.length) || account ? h('div', { className: 'ifs-sidebar__foot', onKeyDown: navKeys },
        p.footerItems && p.footerItems.length ? h('ul', { role: 'list', className: 'ifs-nav__list' }, p.footerItems.map(function (it) { return row(it, 0); })) : null,
        account ? h('div', { className: 'ifs-sidebar__account' }, account) : null) : null);
  }

  /* ------------------------------------------------------------ TopBar */
  /* The strip across the top of the inset: where you are in the product on the left (a product Breadcrumb, whose levels switch with a
     Switcher), and page-wide tools on the right (search, notifications, the account). 48px tall on a line-soft rule; its sides line
     the first crumb's text up with the inset's padding (--ifs-inset-pad, 40px). Narrow, the search collapses to its icon. */
  function TopBar(p) {
    var crumbs = p.breadcrumb == null ? null : Array.isArray(p.breadcrumb) ? h(Breadcrumb, { variant: 'product', label: p.label || 'Location', items: p.breadcrumb }) : p.breadcrumb;
    return h('header', { className: cx('ifs-topbar', p.className), style: p.style },
      h('div', { className: 'ifs-topbar__start' }, crumbs, p.children),
      p.actions ? h('div', { className: 'ifs-topbar__actions' }, p.actions) : null);
  }

  /* ------------------------------------------------------------ PageHeader */
  /* The top of a page: a breadcrumb (the eyebrow form by default, or a path), the title in `display` (44/44, `size="md"` for object
     pages: 28/32), badges beside it, a `body-lg` lede in `muted` under it, actions on the right, and tabs under everything. The title
     keeps size-text-min; the actions drop under it when both cannot share a line. */
  function PageHeader(p) {
    var size = p.size === 'md' ? 'md' : 'lg';
    var crumbs = p.breadcrumb == null ? null : Array.isArray(p.breadcrumb)
      ? h(Breadcrumb, { variant: p.breadcrumbVariant || 'eyebrow', separator: p.separator, maxItems: p.maxItems, items: p.breadcrumb, label: p.breadcrumbLabel, current: false }) : p.breadcrumb;
    var Tag = p.as || 'h1';
    return h('header', { className: cx('ifs-pagehead', 'ifs-pagehead--' + size, p.tabs && 'ifs-pagehead--tabs', p.className), style: p.style },
      crumbs ? h('div', { className: 'ifs-pagehead__crumbs' }, crumbs) : null,
      h('div', { className: 'ifs-pagehead__main' },
        h('div', { className: 'ifs-pagehead__text' },
          h('div', { className: 'ifs-pagehead__line' },
            p.media != null ? h('span', { className: 'ifs-pagehead__media' }, p.media) : null,
            h(Tag, { className: cx('ifs-pagehead__title', p.mono && 'ifs-pagehead__title--mono') }, p.title),
            p.badges ? h('span', { className: 'ifs-pagehead__badges' }, p.badges) : null),
          p.description != null ? h('p', { className: 'ifs-pagehead__lede' }, p.description) : null),
        p.actions ? h('div', { className: 'ifs-pagehead__actions' }, p.actions) : null),
      p.tabs ? h('div', { className: 'ifs-pagehead__tabs' }, p.tabs) : null);
  }

  /* ------------------------------------------------------------ SettingsCard */
  /* One setting, or a few that save together: a plain card whose title and description say what it controls, the fields in its
     content, and a `paper` footer shelf. The footer's left is a status line (the hint, then "Unsaved changes", "Saving", "Saved" or what
     failed) and its right the actions: Discard while there are changes, and Save, disabled until something changed and busy while it
     saves. Enter in a field saves. `onSave` may return a promise: its rejection's message becomes the footer's error. `locked` keeps
     everything read-only and says why. `tone="danger"` is for destructive settings, with your own `actions`. */
  function SettingsCard(p) {
    var id = useId();
    var ph = useState(null), phase = ph[0], setPhase = ph[1];
    var alive = useRef(true), timer = useRef(null);
    useEffect(function () { alive.current = true; return function () { alive.current = false; clearTimeout(timer.current); }; }, []);
    var locked = p.locked != null && p.locked !== false;
    var saving = p.saving != null ? !!p.saving : phase === 'saving';
    var err = p.error != null ? p.error : phase && phase.error;
    // new edits after a save or a failure start over
    var dirtyRef = useRef(p.dirty);
    useEffect(function () { if (p.dirty && !dirtyRef.current && phase && phase !== 'saving') setPhase(null); dirtyRef.current = p.dirty; }, [p.dirty]);
    function done() { if (!alive.current) return; setPhase('saved'); clearTimeout(timer.current); timer.current = setTimeout(function () { if (alive.current) setPhase(function (x) { return x === 'saved' ? null : x; }); }, 2400); }
    function fail(x) { if (alive.current) setPhase({ error: x && x.message ? x.message : String(x || 'Could not save. Try again.') }); }
    function save(e) {
      if (e) e.preventDefault();
      if (!p.dirty || saving || locked || !p.onSave) return;
      var r;
      try { r = p.onSave(); } catch (x) { fail(x); return; }
      if (r && typeof r.then === 'function') { setPhase('saving'); r.then(done, fail); } else if (r === false) setPhase(null); else done();
    }
    function discard() { setPhase(null); if (p.onDiscard) p.onDiscard(); }
    var status, tone = null;
    if (locked) { tone = 'locked'; status = [h(Icon, { key: 'i', name: 'lock', size: 14, strokeWidth: 1.8 }), h('span', { key: 't' }, typeof p.locked === 'string' || React.isValidElement(p.locked) ? p.locked : 'You can view this setting but not change it.')]; }
    else if (err) { tone = 'error'; status = [h(Icon, { key: 'i', name: 'alert-c', size: 14, strokeWidth: 1.9 }), h('span', { key: 't' }, err)]; }
    else if (saving) { tone = 'saving'; status = [h(Spinner, { key: 'i' }), h('span', { key: 't' }, p.savingText || 'Saving')]; }
    else if (phase === 'saved') { tone = 'saved'; status = [h(Icon, { key: 'i', name: 'check-c', size: 14, strokeWidth: 1.9 }), h('span', { key: 't' }, p.savedText || 'Saved')]; }
    else if (p.dirty) { tone = 'dirty'; status = [h('span', { key: 'i', className: 'ifs-settings__dot', 'aria-hidden': true }), h('span', { key: 't' }, p.dirtyText || 'Unsaved changes')]; }
    else if (p.hint != null) status = h('span', null, p.hint);
    var actions = p.actions !== undefined ? p.actions : locked || !p.onSave ? null : [
      p.dirty && !saving ? h(Button, { key: 'd', variant: 'ghost', size: 'sm', onClick: discard }, p.discardLabel || 'Discard') : null,
      h(Button, { key: 's', type: 'submit', variant: 'primary', size: 'sm', disabled: !p.dirty && !saving, loading: saving }, p.saveLabel || 'Save')];
    var hasBody = p.children != null || p.loading;
    var body = p.loading
      ? h('div', { className: 'ifs-settings__content', 'aria-busy': 'true' }, h('div', { className: 'ifs-stack', style: { gap: 8 } }, h(Skeleton, { width: 112, height: 12 }), h(Skeleton, { height: 36, style: { maxWidth: 480 } })))
      : p.children != null ? h('fieldset', { className: cx('ifs-settings__content', locked && 'ifs-settings__content--locked'), disabled: locked || undefined }, p.children) : null;
    var showFoot = p.footer !== false && (status != null || (actions && [].concat(actions).some(Boolean)));
    return h('form', { id: p.id, className: cx('ifs-settings', p.tone === 'danger' && 'ifs-settings--danger', !hasBody && 'ifs-settings--bare', p.className), style: p.style, 'aria-labelledby': id + '-t', noValidate: true, onSubmit: save },
      h('div', { className: 'ifs-settings__head' },
        h('div', { className: 'ifs-settings__heading' }, h(p.headingLevel ? 'h' + p.headingLevel : 'h3', { id: id + '-t', className: 'ifs-settings__title' }, p.title), p.description != null ? h('p', { className: 'ifs-settings__desc' }, p.description) : null),
        p.action != null ? h('div', { className: 'ifs-settings__action' }, p.action) : null),
      body,
      showFoot ? h('div', { className: 'ifs-settings__footer' },
        h('div', { className: cx('ifs-settings__status', tone && 'ifs-settings__status--' + tone), role: 'status', 'aria-live': 'polite' }, status),
        actions ? h('div', { className: 'ifs-settings__actions' }, actions) : null) : null);
  }

  /* ------------------------------------------------------------ FloatingActionBar */
  /* Bulk actions for what is selected, floating over the bottom of the view while anything is: the count (an accent Count), "Select all"
     when more exist than are picked, the actions (ghost small buttons, danger last), and Clear. It is a toast-like overlay (`toast-bg`,
     a `toast-line` border, `shadow-pop`) and enters and leaves over the slide curve. Actions that do not fit move, from the end, into a
     More menu, so the bar never wraps or clips. Left and Right move between its buttons; Escape clears the selection. `placement`:
     `fixed` to the viewport (default) or `contained` in the nearest positioned ancestor. */
  function FloatingActionBar(p) {
    var count = p.count || 0, show = count > 0;
    var mt = useState(show), mounted = mt[0], setMounted = mt[1];
    var last = useRef(count);
    if (show) last.current = count;
    useEffect(function () {
      if (show) { setMounted(true); return undefined; }
      if (reducedMotion()) { setMounted(false); return undefined; }
      var t = setTimeout(function () { setMounted(false); }, 200);
      return function () { clearTimeout(t); };
    }, [show]);
    var acts = (p.actions || []).filter(Boolean);
    var extra = (p.moreActions || []).filter(Boolean);
    var wrap = useRef(null), meas = useRef(null), bar = useRef(null), before = useRef(null);
    // fit: how many actions show before More, and whether they show as icons. Labels go first to More, from the end; when not even
    // one labeled action fits, icon-only buttons (with tooltips) take their place if that shows more of them.
    var ft = useState({ n: acts.length, icons: false }), fit = ft[0], setFit = ft[1];
    var measure = useRef(null);
    measure.current = function () {
      var w = wrap.current, m = meas.current;
      if (!w || !m) return;
      var cs = getComputedStyle(w), avail = w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var full = m.offsetWidth, gap = 4;
      var widths = Array.prototype.map.call(m.querySelectorAll('[data-act]'), function (el) { return el.offsetWidth; });
      var more = m.querySelector('[data-more]'), iconW = more ? more.offsetWidth : 32, moreW = iconW + gap;
      var sum = widths.reduce(function (a, x) { return a + x + gap; }, 0);
      var base = full - moreW - sum, needMore = extra.length > 0;
      var next;
      if (base + sum + (needMore ? moreW : 0) <= avail) next = { n: widths.length, icons: false };
      else {
        var tot = base + moreW, nl = 0;
        while (nl < widths.length && tot + widths[nl] + gap <= avail) { tot += widths[nl] + gap; nl += 1; }
        var ni = 0, canIcons = acts.every(function (x) { return !!x.icon; });
        if (canIcons) {
          if (base + widths.length * (iconW + gap) + (needMore ? moreW : 0) <= avail) ni = widths.length;
          else { tot = base + moreW; while (ni < widths.length && tot + iconW + gap <= avail) { tot += iconW + gap; ni += 1; } }
        }
        next = ni > nl ? { n: ni, icons: true } : { n: nl, icons: false };
      }
      setFit(function (f) { return f.n === next.n && f.icons === next.icons ? f : next; });
    };
    var sig = acts.map(function (a) { return String(a.label) + (a.icon || ''); }).join('|') + '/' + (show ? count : last.current) + '/' + extra.length + '/' + (p.total || '');
    useIsoLayout(function () { if (mounted || show) measure.current(); }, [sig, mounted, show]);
    useEffect(function () {
      var w = wrap.current;
      if (!w || typeof ResizeObserver === 'undefined') return undefined;
      var ro = new ResizeObserver(function () { if (measure.current) measure.current(); });
      ro.observe(w);
      return function () { ro.disconnect(); };
    }, [mounted || show]);
    // focus that was in the bar goes back to where it came from when the bar leaves
    useEffect(function () {
      if (show) return;
      var b = bar.current;
      if (b && b.contains(document.activeElement)) { if (before.current && document.contains(before.current)) focusEl(before.current); else document.activeElement.blur(); }
    }, [show]);
    if (!mounted && !show) return null;
    var n = show ? count : last.current;
    var visible = acts.slice(0, fit.n), overflow = acts.slice(fit.n).concat(extra);
    function btn(a, i, forMeasure) {
      var icons = !forMeasure && fit.icons;
      var el = h(Button, { key: a.id || a.label || i, variant: a.danger ? 'danger-ghost' : 'ghost', size: 'sm', icon: a.icon, iconOnly: icons, 'aria-label': icons ? a.label : undefined,
        disabled: a.disabled, loading: a.loading, 'data-act': '', tabIndex: forMeasure ? -1 : undefined, onClick: forMeasure ? undefined : a.onClick }, a.label);
      return icons ? h(Tooltip, { key: a.id || a.label || i, content: a.label, shortcut: a.shortcut }, el) : el;
    }
    function onKey(e) {
      var k = e.key;
      if (k === 'Escape') { if (p.onClear) { e.preventDefault(); e.stopPropagation(); p.onClear(); } return; }
      if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
      if (e.target && e.target.closest && e.target.closest('.ifs-pop')) return;
      var all = Array.prototype.filter.call(bar.current.querySelectorAll('button'), function (el) { return !el.disabled && !el.closest('.ifs-pop'); });
      var i = all.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      focusEl(all[k === 'Home' ? 0 : k === 'End' ? all.length - 1 : k === 'ArrowRight' ? Math.min(all.length - 1, i + 1) : Math.max(0, i - 1)]);
    }
    function onFocusIn(e) { if (bar.current && e.relatedTarget && !bar.current.contains(e.relatedTarget)) before.current = e.relatedTarget; }
    var label = p.selectedLabel || 'selected';
    var countNode = h('span', { className: 'ifs-fab__count' }, h(Count, null, fmt(n)), h('span', { className: 'ifs-fab__label' }, label));
    var selectAll = p.onSelectAll && p.total != null && n < p.total ? h(Button, { variant: 'link', size: 'sm', className: 'ifs-fab__all', onClick: p.onSelectAll }, (p.selectAllLabel || 'Select all') + ' ' + fmt(p.total)) : null;
    var clear = p.onClear ? h(Tooltip, { content: p.clearLabel || 'Clear selection', shortcut: 'esc' }, h(Button, { variant: 'ghost', size: 'sm', icon: 'x', iconOnly: true, 'aria-label': p.clearLabel || 'Clear selection', onClick: p.onClear })) : null;
    var moreMenu = overflow.length ? h(DropdownMenu, { side: 'top', align: 'end', width: 208, label: 'More actions', className: 'ifs-fab__more',
      trigger: h(Button, { variant: 'ghost', size: 'sm', icon: 'more', iconOnly: true, 'aria-label': 'More actions' }),
      items: overflow.map(function (a) { return { label: a.label, icon: a.icon, danger: a.danger, disabled: a.disabled || a.loading, shortcut: a.shortcut, onSelect: a.onClick ? function () { a.onClick(); } : undefined }; }) }) : null;
    var sep = function (k) { return h('span', { key: k, className: 'ifs-fab__sep', 'aria-hidden': true }); };
    var measurer = h('div', { className: 'ifs-fab__measure-box', 'aria-hidden': true }, h('div', { ref: meas, className: 'ifs-fab ifs-fab--measure', inert: '' },
      countNode, selectAll, sep('a'), acts.map(function (a, i) { return btn(a, i, true); }),
      h(Button, { variant: 'ghost', size: 'sm', icon: 'more', iconOnly: true, 'data-more': '', tabIndex: -1, 'aria-label': 'More' }), clear ? sep('b') : null, clear ? h(Button, { variant: 'ghost', size: 'sm', icon: 'x', iconOnly: true, tabIndex: -1, 'aria-label': 'Clear' }) : null));
    return h('div', { ref: wrap, className: cx('ifs-fab-wrap', p.placement === 'contained' && 'ifs-fab-wrap--contained', p.className), style: p.style },
      measurer,
      h('div', { ref: bar, role: 'toolbar', 'aria-label': p.label || 'Bulk actions', className: 'ifs-fab', 'data-state': show ? 'open' : 'closed', onKeyDown: onKey, onFocus: onFocusIn },
        countNode, selectAll, sep('a'), visible.map(function (a, i) { return btn(a, i, false); }), moreMenu, clear ? sep('b') : null, clear),
      h('span', { className: 'ifs-sr', role: 'status', 'aria-live': 'polite' }, show ? fmt(n) + ' ' + label : ''));
  }

  /* ------------------------------------------------------------ Steps */
  /* Where a flow is, and which steps can be revisited. Horizontal: the ProgressSteps segments (done in ink, the current one hatched,
     upcoming on line-soft) with a label under each. Vertical: a numbered list, the marker a 24px square (upcoming: a line border and a
     muted number; current: a 1px ink border; done: an ink fill with a check; error: bad), joined by a rule, with each step's title and
     description beside it. Steps already reached are buttons when `onStepClick` is set. */
  function Steps(p) {
    var steps = p.steps || [], cur = p.current || 0, vertical = p.orientation === 'vertical';
    var reached = p.reached != null ? p.reached : cur;
    function state(i) { var s = steps[i]; if (s.error) return 'error'; if (i === cur) return 'current'; if (p.completed ? p.completed.indexOf(i) >= 0 : i < cur) return 'done'; return 'upcoming'; }
    function canGo(i) { return !!p.onStepClick && i !== cur && !steps[i].disabled && i <= Math.max(reached, cur); }
    var SR = { done: ', done', error: ', has an error', upcoming: ', not started', current: '' };
    if (!vertical) {
      return h('nav', { 'aria-label': p.label || 'Steps', className: cx('ifs-stepbar', p.hideLabels && 'ifs-stepbar--bare', p.className) },
        h('ol', { className: 'ifs-stepbar__list' }, steps.map(function (s, i) {
          var st = state(i), go = canGo(i);
          var inner = [h('span', { key: 'seg', className: 'ifs-stepbar__seg', 'aria-hidden': true }),
            h('span', { key: 'l', className: cx('ifs-stepbar__label', p.hideLabels && 'ifs-sr') }, st === 'error' ? h(Icon, { name: 'alert-c', size: 12, strokeWidth: 2 }) : null, h('span', { className: 'ifs-stepbar__text' }, s.title)),
            h('span', { key: 'sr', className: 'ifs-sr' }, SR[st])];
          return h('li', { key: s.id != null ? s.id : i, className: cx('ifs-stepbar__step', 'ifs-stepbar__step--' + st), 'aria-current': st === 'current' || (i === cur) ? 'step' : undefined },
            go ? h('button', { type: 'button', className: 'ifs-stepbar__btn', onClick: function () { p.onStepClick(i); } }, inner) : h('span', { className: 'ifs-stepbar__btn' }, inner));
        })));
    }
    return h('nav', { 'aria-label': p.label || 'Steps', className: cx('ifs-steplist', p.className) },
      h('ol', { className: 'ifs-steplist__list' }, steps.map(function (s, i) {
        var st = state(i), go = canGo(i);
        var marker = st === 'done' ? h(Icon, { name: 'check', size: 13, strokeWidth: 2.6 }) : st === 'error' ? h(Icon, { name: 'alert-c', size: 14, strokeWidth: 1.9 }) : String(i + 1);
        var inner = [h('span', { key: 'm', className: 'ifs-steplist__marker', 'aria-hidden': true }, marker),
          h('span', { key: 't', className: 'ifs-steplist__text' },
            h('span', { className: 'ifs-steplist__title' }, s.title, s.optional ? h('span', { className: 'ifs-steplist__opt' }, 'Optional') : null),
            s.description != null ? h('span', { className: 'ifs-steplist__desc' }, s.description) : null),
          h('span', { key: 'sr', className: 'ifs-sr' }, SR[st])];
        return h('li', { key: s.id != null ? s.id : i, className: cx('ifs-steplist__step', 'ifs-steplist__step--' + st, i < steps.length - 1 && state(i + 1) !== 'upcoming' && 'ifs-steplist__step--joined'), 'aria-current': i === cur ? 'step' : undefined },
          go ? h('button', { type: 'button', className: 'ifs-steplist__btn', onClick: function () { p.onStepClick(i); } }, inner) : h('div', { className: 'ifs-steplist__btn' }, inner));
      })));
  }

  /* ------------------------------------------------------------ MultiStep */
  /* A task in steps: each step validates before the next, the step indicator shows where you are and lets you go back, and the content
     slides in the direction of travel while its box eases to the new height. Three containers:
     - `sheet`: the right-hand Sheet, for a task beside the list it changes (import secrets). The steps bar sits under the title.
     - `page`: in the page, a vertical step list beside a card that holds each step's heading, fields and footer; under 640px the list
       becomes the steps bar above the card.
     - `dialog`: a dialog that grows out of its trigger, resizes to each step (height, and `width` per step), and shrinks back into the
       trigger when it closes, while the trigger waits hidden underneath. Reduced motion skips the morph and the slides.
     The footer: "Step 2 of 3" on the left; Cancel on the first step and Back after it, then Continue, and on the last step your
     `completeLabel`. A step's `validate` returns true, false (you show the field errors) or a message for the footer, or a promise of one;
     Continue is busy while it runs. `onComplete` may return a promise too: Continue stays busy, and a rejection's message shows. */
  function MultiStep(p) {
    var variant = p.variant === 'sheet' || p.variant === 'dialog' ? p.variant : 'page';
    var steps = p.steps || [];
    var si = useControllable(p.step, p.defaultStep || 0, p.onStepChange), idx = si[0], setIdx = si[1];
    var i = clamp(idx || 0, 0, Math.max(0, steps.length - 1)), step = steps[i] || {};
    var rc = useState(i), reached = rc[0], setReached = rc[1];
    var bz = useState(false), busy = bz[0], setBusy = bz[1];
    var fe = useState(null), flowError = fe[0], setFlowError = fe[1];
    var dir = useRef(1), alive = useRef(true), stageRef = useRef(null);
    useEffect(function () { alive.current = true; return function () { alive.current = false; }; }, []);
    // a closed sheet or dialog starts over next time
    useEffect(function () { if (variant !== 'page' && !p.open && p.resetOnClose !== false) { if (p.step === undefined) setIdx(p.defaultStep || 0); setReached(p.defaultStep || 0); setFlowError(null); setBusy(false); } }, [p.open]);
    var isLast = i === steps.length - 1;
    // a new step takes focus to its first field, so Enter never lands on the next Continue by accident
    var firstRun = useRef(true);
    useEffect(function () {
      if (firstRun.current) { firstRun.current = false; return undefined; }
      var t = setTimeout(function () {
        var root = stageRef.current, pane = root && root.querySelector('.ifs-stage__pane:not(.ifs-stage__pane--out)');
        if (!pane || pane.contains(document.activeElement)) return;
        var order = ['input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), .ifs-select-trigger:not([disabled])', '[role="tab"][aria-selected="true"]', '.ifs-tile[aria-pressed="true"], .ifs-tile', 'button:not([disabled]), a[href]'];
        for (var k = 0; k < order.length; k++) { var el = pane.querySelector(order[k]); if (el) { focusEl(el); return; } }
      }, 0);
      return function () { clearTimeout(t); };
    }, [i]);
    function go(n) {
      if (n === i || n < 0 || n >= steps.length) return;
      dir.current = n > i ? 1 : -1;
      setFlowError(null);
      setIdx(n);
      if (n > reached) setReached(n);
    }
    function focusInvalid() {
      setTimeout(function () {
        var root = stageRef.current;
        var bad = root && root.querySelector('.ifs-stage__pane:not(.ifs-stage__pane--out) [aria-invalid="true"], .ifs-stage__pane:not(.ifs-stage__pane--out) .ifs-control--invalid input');
        if (bad) focusEl(bad);
      }, 0);
    }
    function settle(r, then) {
      if (!alive.current) return;
      setBusy(false);
      if (r === true || r == null) { then(); return; }
      setFlowError(typeof r === 'string' || React.isValidElement(r) ? r : null);
      focusInvalid();
    }
    function next() {
      if (busy) return;
      var v;
      try { v = step.validate ? step.validate() : true; } catch (x) { settle(x && x.message ? x.message : String(x), null); return; }
      var then = function () { if (isLast) finish(); else go(i + 1); };
      if (v && typeof v.then === 'function') { setBusy(true); setFlowError(null); v.then(function (r) { settle(r, then); }, function (x) { settle(x && x.message ? x.message : String(x), then); }); }
      else settle(v, then);
    }
    function finish() {
      var r = p.onComplete ? p.onComplete() : null;
      if (r && typeof r.then === 'function') {
        setBusy(true); setFlowError(null);
        r.then(function () { if (alive.current) setBusy(false); }, function (x) { if (alive.current) { setBusy(false); setFlowError(x && x.message ? x.message : String(x)); } });
      }
    }
    function back() { if (!busy) go(i - 1); }
    function cancel() { if (p.onCancel) p.onCancel(); if (variant !== 'page' && p.onOpenChange) p.onOpenChange(false); }
    var api = { next: next, back: back, goTo: go, index: i, isLast: isLast, busy: busy };
    function content(k) { var s = steps[k] || {}; return typeof s.content === 'function' ? s.content(Object.assign({}, api, { index: k })) : s.content; }
    var ofText = 'Step ' + (i + 1) + ' of ' + steps.length;
    function footer() {
      return [h('div', { key: 'st', className: cx('ifs-mstep__status', flowError && 'ifs-mstep__status--error'), role: 'status', 'aria-live': 'polite' },
          flowError ? [h(Icon, { key: 'i', name: 'alert-c', size: 14, strokeWidth: 1.9 }), h('span', { key: 't' }, flowError)] : variant === 'page' ? null : h('span', { className: 'ifs-mstep__of' }, ofText)),
        h('div', { key: 'ac', className: 'ifs-mstep__actions' },
          i === 0 ? (p.onCancel || variant !== 'page' ? h(Button, { onClick: cancel, disabled: busy }, p.cancelLabel || 'Cancel') : null)
            : h(Button, { onClick: back, disabled: busy }, p.backLabel || 'Back'),
          h(Button, { variant: 'primary', loading: busy, onClick: next }, isLast ? (p.completeLabel || 'Done') : (step.nextLabel || p.nextLabel || 'Continue')))];
    }
    var bar = h(Steps, { steps: steps, current: i, reached: reached, onStepClick: busy ? null : go, label: (p.title ? textOf(p.title) + ', steps' : 'Steps') });
    function pane(k) {
      var s = steps[k] || {};
      return [s.description != null && variant !== 'page' ? h('p', { key: 'd', className: 'ifs-mstep__desc' }, s.description) : null, h(React.Fragment, { key: 'c' }, content(k))];
    }
    // Enter in a text field continues, like a form's submit
    function onKeyDown(e) {
      if (e.key !== 'Enter' || e.defaultPrevented || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
      var t = e.target;
      if (!t || t.tagName !== 'INPUT' || /^(button|checkbox|radio|submit)$/i.test(t.type) || t.getAttribute('role') === 'combobox') return;
      if (t.closest && !t.closest('.ifs-stage__pane')) return;
      e.preventDefault(); next();
    }
    if (variant === 'page') {
      return h('div', { className: cx('ifs-mstep ifs-mstep--page', p.className), style: p.style, onKeyDown: onKeyDown }, h('div', { className: 'ifs-mstep__layout' },
        h('div', { className: 'ifs-mstep__rail' }, h(Steps, { steps: steps.map(function (x) { return Object.assign({}, x, { description: x.summary }); }), current: i, reached: reached, onStepClick: busy ? null : go, orientation: 'vertical', label: bar.props.label })),
        h('div', { className: 'ifs-mstep__bar' }, bar),
        h('section', { className: 'ifs-mstep__card', 'aria-label': p.title ? textOf(p.title) : undefined },
          h('div', { ref: stageRef }, h(StepStage, { index: i, dir: dir.current, paneClassName: 'ifs-mstep__pane', render: function (k) {
            var s = steps[k] || {};
            return [h('div', { key: 'h', className: 'ifs-mstep__head' },
              h('span', { className: 'ifs-mstep__eyebrow' }, 'Step ' + (k + 1) + ' of ' + steps.length),
              h('h2', { className: 'ifs-mstep__title' }, s.heading || s.title),
              s.description != null ? h('p', { className: 'ifs-mstep__lede' }, s.description) : null),
              h('div', { key: 'b', className: 'ifs-mstep__fields' }, content(k))];
          } })),
          h('div', { className: 'ifs-mstep__footer' }, footer()))));
    }
    var stage = h('div', { ref: stageRef, className: cx('ifs-mstep__scroll', variant === 'dialog' && 'ifs-dialog__body') }, h(StepStage, { index: i, dir: dir.current, paneClassName: variant === 'sheet' ? 'ifs-mstep__pane ifs-mstep__pane--sheet' : 'ifs-mstep__pane ifs-mstep__pane--dialog', render: pane, autoHeight: variant === 'dialog' }));
    if (variant === 'sheet') {
      var sid = 'ms';
      return h(Modal, { open: !!p.open, onClose: cancel, sheet: true, role: 'dialog', className: cx('ifs-sheet ifs-mstep ifs-mstep--sheet', p.className), ariaLabel: textOf(p.title) || undefined, style: p.width ? { width: p.width } : undefined, portal: p.portal, dismissible: !busy },
        h('div', { className: 'ifs-sheet__head ifs-mstep__sheethead', onKeyDown: onKeyDown },
          p.eyebrow ? h('span', { className: 'ifs-eyebrow' }, p.eyebrow) : null,
          h('h2', { className: 'ifs-sheet__title' }, p.title),
          h('div', { className: 'ifs-mstep__barwrap' }, bar)),
        h('div', { className: 'ifs-dialog__close' }, h(Button, { variant: 'ghost', size: 'sm', icon: 'x', iconOnly: true, 'aria-label': 'Close', onClick: cancel })),
        h('div', { className: 'ifs-sheet__body ifs-mstep__sheetbody', onKeyDown: onKeyDown }, stage),
        h('div', { className: 'ifs-sheet__footer ifs-mstep__footer' }, footer()));
    }
    return h(MorphDialog, { open: !!p.open, onClose: cancel, onOpen: function () { if (p.onOpenChange) p.onOpenChange(true); }, trigger: p.trigger, title: p.title, width: step.width || p.width || 480, className: p.className, portal: p.portal, dismissible: !busy, onKeyDown: onKeyDown },
      h('div', { className: 'ifs-dialog__head ifs-mstep__dhead' }, h('h2', { className: 'ifs-dialog__title' }, p.title), h('div', { className: 'ifs-mstep__barwrap' }, bar)),
      h('div', { className: 'ifs-dialog__close' }, h(Button, { variant: 'ghost', size: 'sm', icon: 'x', iconOnly: true, 'aria-label': 'Close', onClick: cancel })),
      stage,
      h('div', { className: 'ifs-dialog__footer ifs-mstep__footer' }, footer()));
  }

  /* MorphDialog: a Modal whose panel grows out of its trigger's box and shrinks back into it. While open the trigger is hidden, so the
     dialog reads as the trigger itself; its ground and border ease from the trigger's to the dialog's. The panel's width follows `width`
     (per step in MultiStep) over the slide curve. Without a trigger, or under reduced motion, it just appears. */
  function MorphDialog(p) {
    var ph = useState(p.open ? 'open' : 'closed'), phase = ph[0], setPhase = ph[1];
    var panel = useRef(null), anchor = useRef(null), timer = useRef(null), prevOpen = useRef(p.open);
    // the trigger's own element: the anchor is a display: contents span, so any component (a Tile) can be the trigger
    function trigEl() { return anchor.current ? anchor.current.firstElementChild : null; }
    var id = useId();
    function rectOf(el) { var r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }
    function applyBox(el, b) { el.style.position = 'fixed'; el.style.margin = '0'; el.style.left = b.left + 'px'; el.style.top = b.top + 'px'; el.style.width = b.width + 'px'; el.style.height = b.height + 'px'; el.style.maxWidth = 'none'; el.style.maxHeight = 'none'; }
    function clearBox(el) { ['position', 'margin', 'left', 'top', 'width', 'height', 'maxWidth', 'maxHeight', 'transition', 'backgroundColor', 'borderColor'].forEach(function (k) { el.style[k] = ''; }); }
    function canMorph() { var t = trigEl(); return !!t && !reducedMotion() && t.getBoundingClientRect().width > 0; }
    useEffect(function () {
      if (p.open === prevOpen.current) return;
      prevOpen.current = p.open;
      clearTimeout(timer.current);
      if (p.open) setPhase(canMorph() ? 'opening' : 'open');
      else if (phase !== 'closed') setPhase(canMorph() && panel.current ? 'closing' : 'closed');
    }, [p.open]);
    useIsoLayout(function () {
      var el = panel.current, t = trigEl();
      if (!el) return undefined;
      if (phase === 'opening' && t) {
        var to = rectOf(el), from = rectOf(t), cs = getComputedStyle(t), inner = el.firstElementChild;
        // the content keeps its final width while the box grows around it, so nothing reflows
        if (inner) { inner.style.width = inner.offsetWidth + 'px'; inner.style.flex = 'none'; }
        el.style.transition = 'none';
        applyBox(el, from);
        el.style.backgroundColor = cs.backgroundColor; el.style.borderColor = cs.borderTopColor;
        el.classList.add('ifs-morph--hidden');
        void el.offsetWidth;
        el.style.transition = '';
        el.classList.add('ifs-morph--moving');
        applyBox(el, to);
        el.style.backgroundColor = ''; el.style.borderColor = '';
        el.classList.remove('ifs-morph--hidden');
        timer.current = setTimeout(function () {
          if (panel.current) { panel.current.classList.remove('ifs-morph--moving'); clearBox(panel.current); }
          if (inner) { inner.style.width = ''; inner.style.flex = ''; }
          setPhase('open');
        }, 230);
      } else if (phase === 'closing' && t) {
        var now = rectOf(el), back = rectOf(t), tc = getComputedStyle(t), inner2 = el.firstElementChild;
        if (inner2) { inner2.style.width = inner2.offsetWidth + 'px'; inner2.style.flex = 'none'; }
        el.style.transition = 'none';
        applyBox(el, now);
        void el.offsetWidth;
        el.style.transition = '';
        el.classList.add('ifs-morph--moving', 'ifs-morph--hidden');
        applyBox(el, back);
        el.style.backgroundColor = tc.backgroundColor; el.style.borderColor = tc.borderTopColor;
        timer.current = setTimeout(function () { setPhase('closed'); }, 220);
      }
      return undefined;
    }, [phase]);
    useEffect(function () { return function () { clearTimeout(timer.current); }; }, []);
    // the trigger is hidden while the dialog is up, which takes its focus, so focus goes back to it here once it shows again
    var wasOpen = useRef(phase !== 'closed');
    useEffect(function () {
      if (phase === 'closed' && wasOpen.current) { var el = trigEl(); if (el && el.focus) focusEl(el.matches(FOCUSABLE) ? el : el.querySelector(FOCUSABLE)); }
      wasOpen.current = phase !== 'closed';
    }, [phase]);
    var t = p.trigger;
    var hideTrigger = phase !== 'closed';
    var trigger = t ? h('span', { ref: anchor, className: 'ifs-morph-anchor', style: hideTrigger ? { visibility: 'hidden' } : undefined },
      React.cloneElement(t, { onClick: chain(t.props.onClick, function () { if (p.onOpen) p.onOpen(); }) })) : null;
    return h(React.Fragment, null, trigger,
      h(Modal, { open: phase !== 'closed', onClose: p.onClose, role: 'dialog', labelledBy: undefined, ariaLabel: textOf(p.title) || undefined, dismissible: p.dismissible, portal: p.portal,
        overlayClassName: cx('ifs-overlay--morph', phase === 'closing' && 'ifs-overlay--leaving'), panelRef: panel,
        className: cx('ifs-dialog ifs-mstep ifs-mstep--dialog', p.className), style: { '--ifs-mstep-w': p.width + 'px' } },
        h('div', { className: 'ifs-mstep__dialog', onKeyDown: p.onKeyDown }, p.children)));
  }

  /* ------------------------------------------------------------ Announcements */
  /* What's new, as cards in a dialog that cycle: each card has a media area (a composition of real components on a `tint` ground,
     under a faint dot grid, never an illustration), an eyebrow, a title, a line or two and an optional action. Cards slide in the
     direction of travel and the dialog eases to each card's height. Left and Right (and a swipe on touch) move and wrap around; the dots
     jump; Next becomes Done on the last card. Each card counts as seen when shown (`onSeen`). */
  function Announcements(p) {
    var items = p.items || [];
    var ix = useControllable(p.index, p.defaultIndex || 0, p.onIndexChange), idx = ix[0], setIdx = ix[1];
    var N = items.length, i = N ? ((idx % N) + N) % N : 0, it = items[i] || {};
    var dir = useRef(1), sw = useRef(null), id = useId();
    var loop = p.loop !== false;
    useEffect(function () { if (p.open && it.id != null && p.onSeen) p.onSeen(it.id, it); }, [p.open, it.id]);
    useEffect(function () { if (!p.open && p.index === undefined && p.resetOnClose !== false) setIdx(p.defaultIndex || 0); }, [p.open]);
    function go(n, d) { if (!N) return; var m = loop ? ((n % N) + N) % N : clamp(n, 0, N - 1); if (m === i) return; dir.current = d || (m > i ? 1 : -1); setIdx(m); }
    function close() { if (p.onOpenChange) p.onOpenChange(false); }
    function onKey(e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1, 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1, -1); }
    }
    function down(e) { if (e.pointerType === 'mouse') return; sw.current = { x: e.clientX, y: e.clientY }; }
    function up(e) {
      var s = sw.current; sw.current = null;
      if (!s) return;
      var dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) go(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    }
    function card(k) {
      var c = items[k] || {};
      var act = c.action;
      return [c.media != null ? h('div', { key: 'm', className: 'ifs-announce__media', 'aria-hidden': true }, h('div', { className: 'ifs-announce__art' }, c.media)) : null,
        h('div', { key: 't', className: 'ifs-announce__text' },
          c.eyebrow != null ? h('span', { className: 'ifs-announce__eyebrow' }, c.eyebrow) : null,
          h('h2', { className: 'ifs-announce__title', id: id + '-t' + k }, c.title),
          c.description != null ? h('div', { className: 'ifs-announce__desc' }, c.description) : null,
          act ? h('div', { className: 'ifs-announce__action' }, act.href
            ? h('a', { className: 'ifs-link', href: act.href, onClick: act.onClick, target: act.external ? '_blank' : undefined, rel: act.external ? 'noreferrer' : undefined }, act.label, act.external ? h(Icon, { name: 'external', size: 13, style: { marginLeft: 4, verticalAlign: '-2px' } }) : null)
            : h(Button, { variant: 'link', size: 'sm', onClick: act.onClick }, act.label)) : null)];
    }
    var last = i === N - 1;
    var dots = N > 1 ? h('div', { className: 'ifs-announce__dots', role: 'group', 'aria-label': 'Choose an announcement' }, items.map(function (c, k) {
      return h('button', { key: c.id != null ? c.id : k, type: 'button', className: 'ifs-announce__dot', 'aria-current': k === i ? 'true' : undefined, 'aria-label': (k + 1) + ' of ' + N + ': ' + (textOf(c.title) || 'Announcement'), onClick: function () { go(k); } });
    })) : null;
    return h(Modal, { open: !!p.open, onClose: close, role: 'dialog', ariaLabel: p.label || "What's new", className: cx('ifs-dialog ifs-announce', p.className), style: p.width ? { width: p.width } : undefined, portal: p.portal },
      h('div', { className: 'ifs-announce__wrap', onKeyDown: onKey },
      h('div', { className: 'ifs-dialog__close ifs-announce__close' }, h(Button, { variant: 'ghost', size: 'sm', icon: 'x', iconOnly: true, 'aria-label': 'Close', onClick: close })),
      h('div', { className: 'ifs-announce__deck', role: 'region', 'aria-roledescription': 'carousel', 'aria-label': p.label || "What's new", onPointerDown: down, onPointerUp: up, onPointerCancel: function () { sw.current = null; } },
        h('div', { className: 'ifs-sr', 'aria-live': 'polite' }, (i + 1) + ' of ' + N + ': ' + (textOf(it.title) || '')),
        h(StepStage, { index: i, dir: dir.current, paneClassName: 'ifs-announce__card', render: card })),
      h('div', { className: 'ifs-dialog__footer ifs-announce__footer' },
        dots,
        h('span', { className: 'ifs-announce__of', 'aria-hidden': true }, (i + 1) + ' of ' + N),
        h('div', { className: 'ifs-announce__nav' },
          i > 0 || loop ? h(Button, { onClick: function () { go(i - 1, -1); }, disabled: N < 2 || (!loop && i === 0) }, p.backLabel || 'Back') : null,
          h(Button, { variant: 'primary', 'data-autofocus': true, onClick: function () { if (last) { if (p.onDone) p.onDone(); close(); } else go(i + 1, 1); } }, last ? (p.doneLabel || 'Done') : (p.nextLabel || 'Next'))))));
  }

  var api = {
    Icon: Icon, Kbd: Kbd, Spinner: Spinner, Loader: Loader, Button: Button, ButtonGroup: ButtonGroup, ToggleGroup: ToggleGroup, DropdownMenu: DropdownMenu,
    Field: Field, Input: Input, SecretInput: SecretInput, InputGroup: InputGroup, CopyButton: CopyButton, Select: Select, Combobox: Combobox, MultiSelect: MultiSelect, Checkbox: Checkbox, Switch: Switch,
    Badge: Badge, Count: Count, Avatar: Avatar, AvatarGroup: AvatarGroup, Identity: Identity, Card: Card, Tile: Tile, Media: Media, DataList: DataList,
    ItemGroup: ItemGroup, Item: Item, List: List, ListSection: ListSection, Table: Table, EnvMark: EnvMark, DataGrid: DataGrid, Separator: Separator, Tabs: Tabs, Breadcrumb: Breadcrumb, Pagination: Pagination, FileTree: FileTree,
    Tooltip: Tooltip, Popover: Popover, Dialog: Dialog, AlertDialog: AlertDialog, Sheet: Sheet, Alert: Alert, Banner: Banner, Toast: Toast, ToastStack: ToastStack,
    Progress: Progress, ProgressSteps: ProgressSteps, Skeleton: Skeleton, EmptyState: EmptyState,
    Code: Code, CodeBlock: CodeBlock, Json: Json, Snippet: Snippet, MiddleTruncate: MiddleTruncate, AnimatedCollapse: AnimatedCollapse, iconNames: Object.keys(ICONS),
  };
  Object.assign(api, { CommandMenu: CommandMenu, SearchTrigger: SearchTrigger, Switcher: Switcher, Sidebar: Sidebar, AppTile: AppTile, TopBar: TopBar, PageHeader: PageHeader, SettingsCard: SettingsCard, FloatingActionBar: FloatingActionBar, MultiStep: MultiStep, Steps: Steps, Announcements: Announcements });
  window.Infisical = window.Infisical || {};
  Object.assign(window.Infisical, api);
})();
