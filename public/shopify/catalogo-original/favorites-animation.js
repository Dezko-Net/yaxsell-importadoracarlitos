/* Small original Lottie illustration for the favorites page. */
(function () {
  var app = document.getElementById('app');
  if (!app) return;

  var activeNode = null;
  var animation = null;
  var loading = null;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fallback = '<svg viewBox="0 0 240 200" xmlns="http://www.w3.org/2000/svg"><circle cx="120" cy="100" r="75" fill="#e8f3fc"/><circle cx="120" cy="100" r="62" fill="#fff"/><path d="M120 77 C95 52 61 64 61 94 C61 116 85 136 120 158 C155 136 179 116 179 94 C179 64 145 52 120 77Z" fill="#ffce4d"/><path d="M44 48v16M36 56h16M190 122v14M183 129h14" fill="none" stroke="#7baad3" stroke-width="4" stroke-linecap="round"/><circle cx="183" cy="47" r="5" fill="#ffdf76"/></svg>';

  function shapeLayer(name, index, shapes, transform) {
    return { ddd: 0, ind: index, ty: 4, nm: name, sr: 1, ks: transform, ao: 0, shapes: shapes, ip: 0, op: 120, st: 0, bm: 0 };
  }
  function transform(x, y, scale) {
    return { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [x, y, 0] }, a: { a: 0, k: [0, 0, 0] }, s: scale || { a: 0, k: [100, 100, 100] } };
  }
  function scalePulse(from, to, offset) {
    var easeIn = { x: [0.42, 0.42, 0.42], y: [1, 1, 1] };
    var easeOut = { x: [0.58, 0.58, 0.58], y: [0, 0, 0] };
    return { a: 1, k: [
      { t: offset, s: [from, from, 100], e: [to, to, 100], i: easeIn, o: easeOut },
      { t: offset + 22, s: [to, to, 100], e: [from, from, 100], i: easeIn, o: easeOut },
      { t: offset + 50, s: [from, from, 100] }
    ] };
  }
  function ellipse(name, diameter, color) {
    return [{ ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [diameter, diameter] }, nm: name },
      { ty: 'fl', c: { a: 0, k: color }, o: { a: 0, k: 100 }, r: 1, nm: 'Fill' }];
  }
  function sparkle(name, index, x, y, size, offset) {
    var path = { i: [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]], o: [[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0],[0,0]],
      v: [[0,-size],[size*.22,-size*.22],[size,0],[size*.22,size*.22],[0,size],[-size*.22,size*.22],[-size,0],[-size*.22,-size*.22]], c: true };
    return shapeLayer(name, index, [{ ty: 'sh', ks: { a: 0, k: path }, nm: name }, { ty: 'fl', c: { a: 0, k: [.43,.65,.82,1] }, o: { a: 0, k: 100 }, r: 1 }], transform(x, y, scalePulse(65, 115, offset)));
  }
  function illustration() {
    var heartPath = { i: [[24,-24],[18,0],[0,-19],[-25,-20],[0,23],[20,0]], o: [[-24,-24],[-20,0],[0,23],[25,-20],[0,-19],[-18,0]],
      v: [[0,-23],[-39,-43],[-58,-8],[0,49],[58,-8],[39,-43]], c: true };
    return { v: '5.7.4', fr: 30, ip: 0, op: 120, w: 240, h: 200, nm: 'Favoritos Importadora 3B', ddd: 0, assets: [], layers: [
      sparkle('Destello izquierdo', 1, 39, 53, 10, 0),
      sparkle('Destello derecho', 2, 198, 128, 8, 10),
      shapeLayer('Punto amarillo', 3, ellipse('Punto', 9, [1,.81,.3,1]), transform(187, 47, scalePulse(70, 120, 15))),
      shapeLayer('Corazón', 4, [{ ty: 'sh', ks: { a: 0, k: heartPath }, nm: 'Corazón' }, { ty: 'fl', c: { a: 0, k: [1,.79,.25,1] }, o: { a: 0, k: 100 }, r: 1 }], transform(120, 108, scalePulse(94, 102, 0))),
      shapeLayer('Disco blanco', 5, ellipse('Disco', 124, [1,1,1,1]), transform(120, 100)),
      shapeLayer('Halo azul', 6, ellipse('Halo', 150, [.91,.95,.99,1]), transform(120, 100))
    ] };
  }

  function loadPlayer() {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (!loading) loading = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = '/shopify/catalogo-original/vendor/lottie_light.min.js';
      script.onload = function () { window.lottie ? resolve(window.lottie) : reject(new Error('Lottie unavailable')); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return loading;
  }
  function update() {
    var next = app.querySelector('[data-favorites-animation]');
    if (next === activeNode) return;
    if (animation) { animation.destroy(); animation = null; }
    activeNode = next;
    if (!next) return;
    next.innerHTML = fallback;
    next.setAttribute('data-animation-ready', '');
    if (reducedMotion.matches) return;
    loadPlayer().then(function (player) {
      if (activeNode !== next || !next.isConnected || reducedMotion.matches) return;
      next.innerHTML = '';
      try {
        animation = player.loadAnimation({ container: next, renderer: 'svg', loop: 2, autoplay: true, animationData: illustration() });
      } catch (_) { next.innerHTML = fallback; }
    }).catch(function () { /* The static illustration remains visible. */ });
  }
  new MutationObserver(update).observe(app, { childList: true });
  reducedMotion.addEventListener('change', function () {
    if (animation) { animation.destroy(); animation = null; }
    activeNode = null;
    update();
  });
  update();
})();
