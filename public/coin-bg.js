(() => {
  'use strict';

  const MAX_COINS_DESKTOP = 10;
  const MAX_COINS_MOBILE = 5;
  const MAX_FRAGMENTS = 150;
  const CANVAS_OPACITY = 0.42;
  const COIN_SPEED = [45, 110];
  const COIN_SCALE = [3, 6];
  const EXPLOSION_HEIGHT = [0.25, 0.7];
  const STEP_FPS = 12;
  const COIN_GRID = [
    '  HHSS  ',
    ' HHHSSS ',
    'HHHHSSSS',
    'HHHHSSSS',
    'HHHHSSSS',
    'HHHHSSSS',
    ' HHHSSS ',
    '  HHHH  ',
  ];
  const FLIP_STEPS = [1, 0.6, 0.2, 0.6, 1];

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  canvas.className = 'coin-background';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = [
    'position:fixed',
    'inset:0',
    'width:100vw',
    'height:100vh',
    'z-index:0',
    'pointer-events:none',
    'display:block',
    'image-rendering:pixelated',
    `opacity:${reducedMotion ? 0.22 : CANVAS_OPACITY}`,
  ].join(';');
  document.body.prepend(canvas);

  const appRoot = document.getElementById('root');
  if (appRoot) {
    appRoot.style.position = 'relative';
    appRoot.style.zIndex = '1';
  }

  const cssValue = (name, fallback) => getComputedStyle(root).getPropertyValue(name).trim() || fallback;
  const yellow = cssValue('--yellow', '#ffd34e');
  const magenta = cssValue('--pink', '#ff3f9f');
  const ink = cssValue('--ink', '#f7f0ec');
  const darken = (color) => {
    const match = color.match(/#([\da-f]{6})/i);
    if (!match) return cssValue('--bg', '#0d0a1a');
    const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16));
    return `rgb(${channels.map((channel) => Math.round(channel * 0.58)).join(',')})`;
  };
  const yellowDark = darken(yellow);
  const colors = { yellow, yellowDark, highlight: ink, magenta };
  const state = { width: 0, height: 0, dpr: 1, maxCoins: 0, spawnClock: 0, nextSpawn: 0, lastTime: 0, frame: 0, raf: 0 };
  const coins = [];
  const fragments = Array.from({ length: MAX_FRAGMENTS }, () => ({ active: false }));
  const flashes = [];
  const rings = [];

  const random = (min, max) => min + Math.random() * (max - min);
  const integer = (min, max) => Math.floor(random(min, max + 1));
  const resize = () => {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.maxCoins = state.width < 768 ? MAX_COINS_MOBILE : MAX_COINS_DESKTOP;
    canvas.width = Math.floor(state.width * state.dpr);
    canvas.height = Math.floor(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (reducedMotion) drawStaticCoins();
  };

  const drawCoin = (coin) => {
    const cell = coin.scale;
    const flip = FLIP_STEPS[Math.floor(coin.age * STEP_FPS) % FLIP_STEPS.length];
    ctx.save();
    ctx.translate(Math.round(coin.x), Math.round(coin.y));
    ctx.scale(flip, 1);
    for (let row = 0; row < COIN_GRID.length; row += 1) {
      for (let column = 0; column < COIN_GRID[row].length; column += 1) {
        const pixel = COIN_GRID[row][column];
        if (pixel === ' ') continue;
        ctx.fillStyle = pixel === 'H' ? colors.highlight : pixel === 'S' ? colors.yellowDark : colors.yellow;
        ctx.fillRect(-4 * cell + column * cell, -4 * cell + row * cell, cell, cell);
      }
    }
    ctx.restore();
  };

  const drawStaticCoin = (x, y, scale) => drawCoin({ x, y, scale, age: 0 });
  const drawStaticCoins = () => {
    ctx.clearRect(0, 0, state.width, state.height);
    [[0.16, 0.2, 4], [0.74, 0.38, 3], [0.9, 0.72, 4]].forEach(([x, y, scale]) => drawStaticCoin(state.width * x, state.height * y, scale));
  };

  const spawnCoin = (startY = state.height + 20) => {
    if (coins.length >= state.maxCoins) return;
    coins.push({
      x: random(18, Math.max(19, state.width - 18)),
      y: startY,
      baseX: 0,
      scale: integer(COIN_SCALE[0], COIN_SCALE[1]),
      speed: random(COIN_SPEED[0], COIN_SPEED[1]),
      targetY: state.height * random(EXPLOSION_HEIGHT[0], EXPLOSION_HEIGHT[1]),
      sway: random(5, 18),
      swaySpeed: random(1.2, 2.5),
      phase: random(0, Math.PI * 2),
      age: random(0, 1.2),
    });
    coins[coins.length - 1].baseX = coins[coins.length - 1].x;
  };

  const getFragment = () => fragments.find((fragment) => !fragment.active);
  const explode = (coin) => {
    const count = integer(8, 14);
    for (let index = 0; index < count; index += 1) {
      const fragment = getFragment();
      if (!fragment) break;
      const angle = random(0, Math.PI * 2);
      const speed = random(55, 145);
      Object.assign(fragment, {
        active: true,
        x: coin.x,
        y: coin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - random(10, 35),
        gravity: random(95, 170),
        size: integer(2, 5),
        rotation: random(-1.2, 1.2),
        spin: random(-3.5, 3.5),
        age: 0,
        life: random(0.8, 1.2),
        color: Math.random() > 0.48 ? colors.yellow : colors.magenta,
      });
    }
    flashes.push({ x: coin.x, y: coin.y, age: 0, life: 0.1, size: random(10, 20) });
    if (Math.random() < 1 / 6) rings.push({ x: coin.x, y: coin.y, age: 0, life: 0.9, size: 4 });
  };

  const update = (delta) => {
    state.spawnClock += delta;
    if (state.spawnClock >= state.nextSpawn && coins.length < state.maxCoins) {
      spawnCoin();
      state.spawnClock = 0;
      state.nextSpawn = random(0.35, 1.1);
    }
    for (let index = coins.length - 1; index >= 0; index -= 1) {
      const coin = coins[index];
      coin.age += delta;
      coin.y -= coin.speed * delta;
      coin.x = coin.baseX + Math.sin(coin.age * coin.swaySpeed + coin.phase) * coin.sway;
      if (coin.y <= coin.targetY) {
        explode(coin);
        coins.splice(index, 1);
      }
    }
    fragments.forEach((fragment) => {
      if (!fragment.active) return;
      fragment.age += delta;
      fragment.x += fragment.vx * delta;
      fragment.y += fragment.vy * delta;
      fragment.vy += fragment.gravity * delta;
      fragment.rotation += fragment.spin * delta;
      if (fragment.age >= fragment.life) fragment.active = false;
    });
    flashes.forEach((flash) => { flash.age += delta; });
    while (flashes.length && flashes[0].age >= flashes[0].life) flashes.shift();
    rings.forEach((ring) => { ring.age += delta; ring.size += delta * 28; });
    while (rings.length && rings[0].age >= rings[0].life) rings.shift();
  };

  const draw = () => {
    ctx.clearRect(0, 0, state.width, state.height);
    coins.forEach(drawCoin);
    fragments.forEach((fragment) => {
      if (!fragment.active) return;
      const opacity = Math.max(0, 1 - fragment.age / fragment.life);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(Math.round(fragment.x), Math.round(fragment.y));
      ctx.rotate(fragment.rotation);
      ctx.fillStyle = fragment.color;
      ctx.fillRect(-fragment.size / 2, -fragment.size / 2, fragment.size, fragment.size);
      ctx.restore();
    });
    flashes.forEach((flash) => {
      ctx.globalAlpha = 1 - flash.age / flash.life;
      ctx.fillStyle = colors.highlight;
      ctx.fillRect(Math.round(flash.x - flash.size / 2), Math.round(flash.y - flash.size / 2), Math.round(flash.size), Math.round(flash.size));
    });
    ctx.globalAlpha = 1;
    rings.forEach((ring) => {
      ctx.globalAlpha = Math.max(0, 1 - ring.age / ring.life) * 0.8;
      ctx.fillStyle = colors.magenta;
      const size = Math.max(2, Math.round(ring.size));
      const thickness = Math.max(2, Math.round(size / 4));
      ctx.fillRect(Math.round(ring.x - size), Math.round(ring.y - thickness / 2), size * 2, thickness);
      ctx.fillRect(Math.round(ring.x - thickness / 2), Math.round(ring.y - size), thickness, size * 2);
    });
    ctx.globalAlpha = 1;
  };

  const frame = (time) => {
    state.raf = 0;
    if (document.hidden) return;
    const delta = state.lastTime ? Math.min((time - state.lastTime) / 1000, 0.05) : 0;
    state.lastTime = time;
    state.frame += 1;
    update(delta);
    draw();
    state.raf = window.requestAnimationFrame(frame);
  };

  const start = () => {
    if (reducedMotion || state.raf) return;
    state.lastTime = 0;
    state.raf = window.requestAnimationFrame(frame);
  };
  const stop = () => {
    if (state.raf) window.cancelAnimationFrame(state.raf);
    state.raf = 0;
    state.lastTime = 0;
  };
  const onVisibilityChange = () => { if (document.hidden) stop(); else start(); };

  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  resize();
  if (reducedMotion) {
    drawStaticCoins();
    return;
  }
  for (let index = 0; index < Math.min(3, state.maxCoins); index += 1) spawnCoin(state.height + index * 55);
  state.nextSpawn = 0.2;
  start();
})();
