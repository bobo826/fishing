(() => {
  'use strict';

  // ================= 默认存档 =================
  const DEFAULT_STATE = {
    coins: 100,
    baits: { normal: 10, premium: 0 },
    activeBait: 'normal',
    ownedGears: ['wood'],
    gearId: 'wood',
    bucket: [], // { id, weight, value }
  };

  const SAVE_KEY = 'fishing-mvp-save-v3';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // 节奏常量（整体放慢，保证体验）
  const TICK_MS = 180;      // 遛鱼时鱼发力的间隔
  const FLY_MS = 900;       // 抛竿飞行时长
  const ROD_LEN = 110;      // 鱼竿像素长度

  let state = clone(DEFAULT_STATE);
  let pendingCatch = null;

  let fishing = {
    phase: 'idle',      // idle | flying | waiting | play
    aimX: 0.5,          // 鼠标左右瞄准（0..1）
    aimDist: 50,        // 瞄准落点距离（0..100）
    dist: 50,           // 鱼离岸距离（0..100）
    tension: 50,        // 鱼线张力（0..100）
    target: null,       // 当前目标鱼
    fishX: 0.5,         // 鱼的水平位置（0..1）
    castDist: 50,       // 抛竿落点距离
    fly: { x: 0, y: 0 },// 飞行中浮标位置
    flyFrom: { x: 0, y: 0 },
    flyTo: { x: 0, y: 0 },
    flyStart: 0,
    waitTimer: null,
    tickTimer: null,
  };

  // 布局（Canvas）
  const L = { w: 0, h: 0, dpr: 1, horizonY: 0, shoreY: 0, depthPx: 0 };
  let particles = [];

  const $ = (sel) => document.querySelector(sel);

  // ================= 工具函数 =================
  const rand = (min, max) => Math.random() * (max - min) + min;
  const round2 = (n) => Math.round(n * 100) / 100;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function getGear() { return GEARS.find((g) => g.id === state.gearId) || GEARS[0]; }
  function getBait() { return BAITS.find((b) => b.id === state.activeBait) || BAITS[0]; }
  function getRarity(k) { return RARITY.find((r) => r.key === k) || RARITY[0]; }

  // ================= 布局与透视投影 =================
  function layout() {
    const canvas = $('#pond');
    const rect = $('#scene').getBoundingClientRect();
    L.w = rect.width;
    L.h = rect.height;
    L.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(L.w * L.dpr);
    canvas.height = Math.round(L.h * L.dpr);
    canvas.style.width = L.w + 'px';
    canvas.style.height = L.h + 'px';
    L.horizonY = L.h * 0.14;   // 地平线
    L.shoreY = L.h;            // 岸线（鱼竿支点，位于画面底部）
    L.depthPx = L.shoreY - L.horizonY;
  }

  // 透视投影：越远越向地平线压缩（消失点），且近大远小
  function depthToY(d) {
    return L.horizonY + L.depthPx * Math.pow(1 - d, 1.7);
  }
  function depthToScale(d) {
    return 0.25 + 0.9 * Math.pow(1 - d, 2.0);
  }
  // 屏幕坐标：x01 横向 0..1，dist 距离 0..100
  function pointToScreen(x01, dist) {
    const d = clamp(dist, 0, 100) / 100;
    const lat = 0.3 + 0.8 * Math.pow(1 - d, 1.7); // 横向向消失点收拢
    return {
      x: L.w / 2 + (x01 - 0.5) * L.w * lat,
      y: depthToY(d),
      s: depthToScale(d),
    };
  }

  // 静态纵深参照物（睡莲叶 / 芦苇），散布在不同距离，提供大小对比
  const PROPS = [
    { t: 'lily', x: 0.20, d: 0.74 },
    { t: 'lily', x: 0.78, d: 0.62 },
    { t: 'lily', x: 0.30, d: 0.40 },
    { t: 'lily', x: 0.66, d: 0.26 },
    { t: 'lily', x: 0.48, d: 0.88 },
    { t: 'lily', x: 0.12, d: 0.22 },
    { t: 'reeds', x: 0.03, d: 0.04 },
    { t: 'reeds', x: 0.97, d: 0.03 },
    { t: 'reeds', x: 0.08, d: 0.16 },
    { t: 'reeds', x: 0.92, d: 0.18 },
  ];

  // ================= 存取档 =================
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        state = Object.assign(clone(DEFAULT_STATE), data);
        if (!state.baits) state.baits = clone(DEFAULT_STATE.baits);
        if (!state.ownedGears || !state.ownedGears.length) state.ownedGears = ['wood'];
        if (!state.bucket) state.bucket = [];
        if (!GEARS.some((g) => g.id === state.gearId)) state.gearId = 'wood';
      }
    } catch (e) {
      state = clone(DEFAULT_STATE);
    }
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function resetGame() {
    if (!confirm('确定要清空所有进度，重新开始吗？')) return;
    state = clone(DEFAULT_STATE);
    resetFishing();
    save();
    render();
    toast('进度已重置');
  }

  // ================= 渲染（HUD / 商店 / 鱼篓） =================
  function render() {
    renderHUD();
    renderShop();
    renderBucket();
  }

  function renderHUD() {
    const bait = getBait();
    $('#coins').textContent = state.coins;
    $('#baitEmoji').textContent = bait.emoji;
    $('#baitStat').textContent = `${bait.name} ×${state.baits[state.activeBait] || 0}`;
    $('#gearName').textContent = getGear().name;
  }

  function renderShop() {
    $('#baitShop').innerHTML = BAITS.map((b) => {
      const owned = state.baits[b.id] || 0;
      const isActive = state.activeBait === b.id;
      return `
        <div class="card ${isActive ? 'equipped' : ''}">
          <div class="card-head">
            <span class="card-emoji">${b.emoji}</span>
            <span class="card-name">${b.name}</span>
            <span class="card-badge">${isActive ? '使用中' : '拥有 ' + owned}</span>
          </div>
          <div class="card-desc">${b.desc}${b.rarityBonus ? '<br>稀有鱼概率提升' : ''}</div>
          <div class="card-meta">单价 🪙${b.cost}</div>
          <div class="card-actions">
            <button class="btn primary" data-action="buyBait" data-id="${b.id}" ${state.coins < b.cost ? 'disabled' : ''}>购买</button>
            <button class="btn ghost" data-action="useBait" data-id="${b.id}" ${isActive || owned <= 0 ? 'disabled' : ''}>使用</button>
          </div>
        </div>`;
    }).join('');

    $('#gearShop').innerHTML = GEARS.map((g) => {
      const owned = state.ownedGears.includes(g.id);
      const equipped = state.gearId === g.id;
      const affordable = state.coins >= g.cost;
      const r = getRarity(g.maxRarity);
      let btn = '';
      if (equipped) btn = `<button class="btn ghost" disabled>使用中</button>`;
      else if (owned) btn = `<button class="btn ghost" data-action="equipGear" data-id="${g.id}">装备</button>`;
      else btn = `<button class="btn primary" data-action="buyGear" data-id="${g.id}" ${affordable ? '' : 'disabled'}>购买 🪙${g.cost}</button>`;
      return `
        <div class="card ${equipped ? 'equipped' : ''}">
          <div class="card-head">
            <span class="card-emoji">${g.emoji}</span>
            <span class="card-name">${g.name}</span>
            <span class="card-badge" style="color:${r.color}">${'★'.repeat(g.maxRarity + 1)} ${r.name}</span>
          </div>
          <div class="card-desc">${g.desc}</div>
          <div class="card-meta">收线 ${g.reelSpeed} · 卸力 ${g.relief}</div>
          <div class="card-actions">${btn}</div>
        </div>`;
    }).join('');
  }

  function renderBucket() {
    const groups = {};
    state.bucket.forEach((f) => {
      groups[f.id] = groups[f.id] || { count: 0, total: 0 };
      groups[f.id].count += 1;
      groups[f.id].total += f.value;
    });

    const ids = Object.keys(groups);
    const totalCount = state.bucket.length;
    const totalValue = state.bucket.reduce((s, f) => s + f.value, 0);

    $('#bucketSummary').textContent =
      totalCount > 0 ? `共 ${totalCount} 条鱼 · 总价值 🪙${totalValue}` : '鱼篓空空如也，快去钓鱼吧！';
    $('#sellAllBtn').disabled = totalCount === 0;

    if (ids.length === 0) {
      $('#bucketList').innerHTML = `<div class="empty">🧺 还没有鱼，抛竿试试手气～</div>`;
      return;
    }

    $('#bucketList').innerHTML = ids.map((id) => {
      const g = groups[id];
      const f = FISH.find((x) => x.id === id);
      const r = getRarity(f.rarity);
      const valText = f.type === 'worthless' ? '无价值' : `🪙${g.total}`;
      return `
        <div class="bucket-row">
          <span class="bucket-emoji">${f.emoji}</span>
          <div class="bucket-info">
            <div class="bucket-name">${f.name}
              <span class="card-badge" style="color:${r.color}">${r.name}</span>
            </div>
            <div class="bucket-sub">×${g.count} · 合计 ${valText}</div>
          </div>
          <div class="bucket-actions">
            <button class="btn ghost" data-action="discardOne" data-id="${id}">丢弃</button>
            <button class="btn primary" data-action="sellAll" data-id="${id}">全部卖出</button>
          </div>
        </div>`;
    }).join('');
  }

  // ================= 场景渲染（Canvas） =================
  function renderScene() {
    const canvas = $('#pond');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);

    drawSky(ctx);
    drawWater(ctx);
    drawIsland(ctx);
    drawZoneBoundary(ctx);
    drawProps(ctx);

    // 目标点（鱼线末端）
    let target = null;
    if (fishing.phase === 'idle') {
      target = pointToScreen(fishing.aimX, fishing.aimDist);
    } else if (fishing.phase === 'flying') {
      target = { x: fishing.fly.x, y: fishing.fly.y, s: depthToScale(fishing.castDist / 100) };
    } else if (fishing.phase === 'waiting') {
      target = pointToScreen(fishing.aimX, fishing.castDist);
    } else if (fishing.phase === 'play') {
      target = pointToScreen(fishing.fishX, fishing.dist);
    }

    // 鱼竿
    const base = { x: L.w / 2, y: L.shoreY };
    const angle = target
      ? Math.atan2(target.x - base.x, base.y - target.y)
      : (fishing.aimX - 0.5) * (60 * Math.PI / 180);
    const tip = {
      x: base.x + Math.sin(angle) * ROD_LEN,
      y: base.y - Math.cos(angle) * ROD_LEN,
    };
    drawRod(ctx, base, tip);

    // 鱼线
    if (target) drawLine(ctx, tip, target);

    // 浮标 / 鱼 / 落点预览
    if (fishing.phase === 'idle') {
      drawPreview(ctx, target);
    } else if (fishing.phase === 'flying' || fishing.phase === 'waiting') {
      drawBobber(ctx, target, false);
    } else if (fishing.phase === 'play') {
      drawFish(ctx, target, fishing.target);
    }

    drawParticles(ctx);
    drawFog(ctx);
  }

  function drawSky(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, L.horizonY + 20);
    g.addColorStop(0, '#0d2b44');
    g.addColorStop(0.62, '#3a7ba5');
    g.addColorStop(1, '#cfeaf7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.w, L.horizonY + 2);
    // 太阳
    const sx = L.w * 0.76, sy = L.horizonY * 0.55;
    const rg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 52);
    rg.addColorStop(0, 'rgba(255,244,190,1)');
    rg.addColorStop(0.4, 'rgba(255,214,110,0.85)');
    rg.addColorStop(1, 'rgba(255,214,110,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(sx - 56, sy - 56, 112, 112);
  }

  function drawWater(ctx) {
    const g = ctx.createLinearGradient(0, L.horizonY, 0, L.shoreY);
    g.addColorStop(0, '#a8d4e8');
    g.addColorStop(0.4, '#3f8fb8');
    g.addColorStop(1, '#0e537a');
    ctx.fillStyle = g;
    ctx.fillRect(0, L.horizonY, L.w, L.shoreY - L.horizonY);
    // 地平线水光
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(0, L.horizonY, L.w, 2);

    // 波带：向地平线变密、变细、变弱（强透视线索）
    const t = performance.now() / 1000;
    const N = 36;
    for (let i = 1; i <= N; i++) {
      const d = i / N;
      const y = depthToY(d);
      const amp = 0.6 + (1 - d) * 3.4;
      const freq = 0.02 + (1 - d) * 0.035;
      ctx.globalAlpha = 0.06 + (1 - d) * 0.2;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5 + (1 - d) * 1.3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= L.w; x += 18) {
        ctx.lineTo(x, y + Math.sin(x * freq + t * (0.7 + d * 1.1) + i * 0.7) * amp);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 阳光倒影光带：由地平线向近岸逐渐变宽（强透视线索）
    const sx = L.w * 0.76;
    const gg = ctx.createLinearGradient(0, L.horizonY, 0, L.shoreY);
    gg.addColorStop(0, 'rgba(255,240,190,0)');
    gg.addColorStop(0.3, 'rgba(255,240,190,0.32)');
    gg.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.moveTo(sx - 5, L.horizonY);
    ctx.lineTo(sx + 5, L.horizonY);
    ctx.lineTo(sx + L.w * 0.3, L.shoreY);
    ctx.lineTo(sx - L.w * 0.3, L.shoreY);
    ctx.closePath();
    ctx.fill();
  }

  function drawIsland(ctx) {
    const y = L.horizonY;
    const mound = () => {
      ctx.beginPath();
      ctx.moveTo(-40, y);
      ctx.lineTo(L.w * 0.10, y);
      ctx.quadraticCurveTo(L.w * 0.16, y - 34, L.w * 0.24, y);
      ctx.lineTo(L.w * 0.30, y);
      ctx.quadraticCurveTo(L.w * 0.38, y - 20, L.w * 0.46, y);
      ctx.lineTo(L.w * 0.60, y);
      ctx.quadraticCurveTo(L.w * 0.66, y - 26, L.w * 0.74, y);
      ctx.lineTo(L.w + 40, y);
      ctx.closePath();
    };
    ctx.fillStyle = '#1d4a63';
    mound();
    ctx.fill();
    // 水面倒影
    ctx.save();
    ctx.translate(0, y * 2);
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.22;
    mound();
    ctx.fill();
    ctx.restore();
  }

  function drawZoneBoundary(ctx) {
    const y = depthToY(0.5);
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(L.w, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawProps(ctx) {
    const t = performance.now() / 1000;
    for (const pr of PROPS) {
      const p = pointToScreen(pr.x, pr.d * 100);
      if (pr.t === 'lily') {
        const rx = 11 + 7 * p.s;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(t * 0.5 + pr.x * 20) * 0.15);
        // 叶片
        ctx.fillStyle = '#2f9e5f';
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, rx * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        // 缺口
        ctx.fillStyle = '#1f7a48';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(rx, 0);
        ctx.lineTo(rx * 0.7, -rx * 0.3);
        ctx.closePath();
        ctx.fill();
        // 叶脉
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-rx, 0);
        ctx.stroke();
        ctx.restore();
      } else {
        // 芦苇
        const n = 4;
        const h = 30 * p.s;
        for (let i = 0; i < n; i++) {
          const ox = (i - n / 2) * 7 * p.s + Math.sin(t * 0.8 + i) * 2;
          const sway = Math.sin(t * 1.2 + i) * 2;
          const topX = p.x + ox * 1.7 + sway;
          const topY = p.y - h * (0.7 + (i % 3) * 0.18);
          ctx.strokeStyle = '#3d6b35';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(p.x + ox, p.y);
          ctx.quadraticCurveTo(p.x + ox * 1.4, (p.y + topY) / 2, topX, topY);
          ctx.stroke();
          // 穗
          ctx.fillStyle = '#5a3a1e';
          ctx.beginPath();
          ctx.ellipse(topX, topY, 2.4 * p.s, 7 * p.s, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawRod(ctx, base, tip) {
    // 抽象化鱼竿：纤细、带轻微弯曲的简约线条
    const dx = tip.x - base.x, dy = tip.y - base.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;
    // 控制点：向后微弯，更显轻盈
    const cx = (base.x + tip.x) / 2 - nx * len * 0.08;
    const cy = (base.y + tip.y) / 2 - ny * len * 0.08;

    // 竿身（细线，近粗远细的渐变）
    const g = ctx.createLinearGradient(base.x, base.y, tip.x, tip.y);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(1, 'rgba(255,255,255,0.6)');
    ctx.strokeStyle = g;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.quadraticCurveTo(cx, cy, tip.x, tip.y);
    ctx.stroke();

    // 竿尖亮点
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // 手柄：简洁圆形支点
    ctx.fillStyle = 'rgba(15, 40, 60, 0.85)';
    ctx.beginPath();
    ctx.arc(base.x, base.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLine(ctx, tip, target) {
    const sag = fishing.phase === 'play'
      ? clamp(34 - fishing.tension * 0.3, 3, 34)
      : 16;
    const mx = (tip.x + target.x) / 2;
    const my = (tip.y + target.y) / 2 + sag;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.quadraticCurveTo(mx, my, target.x, target.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawBobber(ctx, p, biting) {
    const s = p.s;
    const r = 3 + 5 * s;
    const t = performance.now() / 1000;
    const yOff = biting ? 6 : Math.sin(t * 2.4) * 2;
    const x = p.x, y = p.y + yOff;
    drawRings(ctx, x, y, s);
    const g = ctx.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, '#ef4444');
    g.addColorStop(0.45, '#ef4444');
    g.addColorStop(0.45, '#ffffff');
    g.addColorStop(1, '#ffffff');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#7f1d1d';
    ctx.stroke();
  }

  function drawFish(ctx, p, fish) {
    const s = p.s;
    const size = Math.max(12, Math.round(48 * s));
    const t = performance.now() / 1000;
    const lift = size * 0.22 + Math.sin(t * 3) * 2;
    const x = p.x, y = p.y - lift;
    // 水面影子（鱼悬空越高影子越淡，增强立体）
    ctx.save();
    ctx.globalAlpha = clamp(0.32 - lift * 0.008, 0.12, 0.32);
    ctx.fillStyle = '#06263a';
    ctx.beginPath();
    ctx.ellipse(x - size * 0.1, p.y + size * 0.22, size * 0.52, size * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 鱼身（emoji，随挣扎摆动）
    const wobble = Math.sin(t * 9) * 0.22;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(wobble);
    ctx.font = size + 'px "Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fish ? fish.emoji : '🐟', 0, 0);
    ctx.restore();
  }

  function drawPreview(ctx, p) {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 20 * p.s, 20 * p.s * 0.38, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawRings(ctx, x, y, s) {
    const t = performance.now() / 1000;
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.8 + i * 0.5) % 1;
      const r = 4 + ph * 22 * s;
      ctx.globalAlpha = (1 - ph) * 0.4;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFog(ctx) {
    const g = ctx.createLinearGradient(0, L.horizonY, 0, L.horizonY + L.depthPx * 0.45);
    g.addColorStop(0, 'rgba(185,222,242,0.5)');
    g.addColorStop(1, 'rgba(185,222,242,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, L.horizonY, L.w, L.depthPx * 0.45);
  }

  function drawParticles(ctx) {
    for (const p of particles) {
      const k = 1 - p.life / p.maxLife;
      if (p.type === 'drop') {
        ctx.globalAlpha = k;
        ctx.fillStyle = '#eaf7ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const r = p.size + (1 - k) * 26 * p.s;
        ctx.globalAlpha = k * 0.6;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * 0.38, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ================= 水花粒子 =================
  function spawnSplash(x, y, s, intensity) {
    intensity = intensity || 1;
    const n = Math.round(5 * intensity);
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.3;
      const sp = (2 + Math.random() * 3) * (0.6 + s * 0.5);
      particles.push({
        type: 'drop', x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 1.5,
        life: 0, maxLife: 0.5 + Math.random() * 0.4,
        size: 1 + Math.random() * 2.2, s,
      });
    }
    particles.push({ type: 'ring', x, y, life: 0, maxLife: 0.9, size: 4, s });
    if (intensity > 1.2) {
      particles.push({ type: 'ring', x, y, life: 0.12, maxLife: 1.1, size: 2, s });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
      if (p.type === 'drop') {
        p.vy += 14 * dt;
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
      }
    }
  }

  function currentTargetScreen() {
    if (fishing.phase === 'play') return pointToScreen(fishing.fishX, fishing.dist);
    if (fishing.phase === 'waiting') return pointToScreen(fishing.aimX, fishing.castDist);
    return null;
  }

  function renderFightHUD() {
    $('#tensionNeedle').style.left = clamp(fishing.tension, 0, 100) + '%';
    $('#distFill').style.width = (100 - clamp(fishing.dist, 0, 100)) + '%';
  }

  // ================= 钓鱼流程 =================
  function setStatus(text) { $('#status').textContent = text; }

  function cast() {
    if (fishing.phase !== 'idle') return;
    const bait = getBait();
    if ((state.baits[bait.id] || 0) <= 0) {
      toast('鱼饵不足，请先到商店购买');
      openShop();
      return;
    }
    state.baits[bait.id] -= 1;
    save();

    fishing.aimX = clamp(fishing.aimX, 0.08, 0.92);
    fishing.castDist = clamp(fishing.aimDist, 5, 100);
    fishing.dist = fishing.castDist;

    const base = { x: L.w * 0.5, y: L.shoreY };
    const to = pointToScreen(fishing.aimX, fishing.castDist);
    const ang = Math.atan2(to.x - base.x, base.y - to.y);
    const tip = { x: base.x + Math.sin(ang) * ROD_LEN, y: base.y - Math.cos(ang) * ROD_LEN };
    fishing.flyFrom = tip;
    fishing.fly = { x: tip.x, y: tip.y };
    fishing.flyTo = to;
    fishing.flyStart = performance.now();
    fishing.phase = 'flying';
    setStatus('抛竿中……');
    renderHUD();
    renderScene();
  }

  function updateFly() {
    const p = clamp((performance.now() - fishing.flyStart) / FLY_MS, 0, 1);
    const from = fishing.flyFrom;
    // 抛物线飞行：先扬起再落入水面
    fishing.fly.x = from.x + (fishing.flyTo.x - from.x) * p;
    fishing.fly.y = from.y + (fishing.flyTo.y - from.y) * p - Math.sin(p * Math.PI) * 80;
    if (p >= 1) {
      fishing.phase = 'waiting';
      setStatus('浮标入水，等待鱼儿上钩……');
      spawnSplash(fishing.flyTo.x, fishing.flyTo.y, fishing.flyTo.s, 1);
      fishing.waitTimer = setTimeout(onBite, rand(2500, 5000));
    }
  }

  function onBite() {
    // 鱼儿上钩：直接进入遛鱼界面，无需再次点击扬竿
    const bp = pointToScreen(fishing.aimX, fishing.castDist);
    spawnSplash(bp.x, bp.y, bp.s, 1.6);
    startPlay();
  }

  function startPlay() {
    const zone = fishing.castDist < 50 ? 'shallow' : 'deep';
    const fish = pickFish(zone);

    fishing.target = fish;
    fishing.dist = fishing.castDist;
    fishing.fishX = fishing.aimX;
    fishing.tension = 45;
    fishing.phase = 'play';

    $('#fightFish').textContent = fish.emoji;
    $('#fightName').textContent = fish.name;
    $('#fightHud').classList.remove('hidden');
    setStatus(`上钩了！滚轮 ↑ 收线 · ↓ 放线`);
    renderFightHUD();
    fishing.tickTimer = setInterval(playTick, TICK_MS);
    renderScene();
  }

  function playTick() {
    if (fishing.phase !== 'play') return;
    const f = fishing.target;
    let pull = f.strength * rand(0.5, 1.3);
    if (Math.random() < 0.08) pull += f.strength * 1.8; // 突然冲刺
    fishing.tension += pull;
    fishing.dist += f.strength * 0.12;      // 鱼拽着线往外跑
    fishing.fishX = clamp(fishing.fishX + rand(-0.04, 0.04), 0.1, 0.9);
    const fp = pointToScreen(fishing.fishX, fishing.dist);
    if (Math.random() < 0.18) spawnSplash(fp.x, fp.y, fp.s, 0.6);
    renderFightHUD();
    if (fishing.tension >= 100) escape('线断了！鱼带着鱼钩跑了……');
    else if (fishing.tension <= 0) escape('鱼线太松，鱼脱钩了……');
    else if (fishing.dist >= 100) escape('线放光了，鱼脱钩了……');
  }

  function reel(dir) { // dir: 1=收线(滚轮上), -1=放线(滚轮下)
    if (fishing.phase !== 'play') return;
    const gear = getGear();
    if (dir > 0) {
      fishing.dist -= gear.reelSpeed;
      fishing.tension += gear.reelTension;
    } else {
      fishing.dist += 3;
      fishing.tension -= gear.relief;
    }
    renderFightHUD();
    if (fishing.dist <= 0) { catchFish(); return; }
    if (fishing.dist >= 100) { escape('线放光了，鱼脱钩了……'); return; }
    if (fishing.tension >= 100) escape('线断了！鱼带着鱼钩跑了……');
    else if (fishing.tension <= 0) escape('鱼线太松，鱼脱钩了……');
  }

  function escape(msg) {
    setStatus(msg);
    toast(msg);
    const tp = currentTargetScreen();
    if (tp) spawnSplash(tp.x, tp.y, tp.s, 0.8);
    resetFishing();
    renderHUD();
  }

  function resetFishing() {
    clearTimeout(fishing.waitTimer);
    clearInterval(fishing.tickTimer);
    fishing.phase = 'idle';
    fishing.target = null;
    fishing.dist = 50;
    fishing.tension = 50;
    $('#fightHud').classList.add('hidden');
    setStatus('移动鼠标瞄准 · 点击抛竿');
    renderScene();
  }

  function pickFish(zone) {
    const gear = getGear();
    const bait = getBait();
    const maxRarity = Math.min(3, gear.maxRarity + bait.rarityBonus);
    const pool = FISH.filter((f) => f.rarity <= maxRarity);
    const boost = bait.rarityBonus > 0;
    const weighted = pool.map((f) => {
      let w = f.w || RARITY_WEIGHT[f.rarity] || 5;
      w *= (f.zone === zone) ? 1.8 : 0.45;  // 钓点分区
      if (boost && f.rarity >= 1) w *= 1.6;
      return { f, w };
    });
    const total = weighted.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const x of weighted) {
      r -= x.w;
      if (r <= 0) return x.f;
    }
    return pool[0];
  }

  function catchFish() {
    const fish = fishing.target;
    const weight = round2(rand(fish.wmin, fish.wmax));
    const value = fish.type === 'normal' ? Math.max(1, Math.round(fish.basePrice * weight)) : 0;
    pendingCatch = { fish, weight, value };
    setStatus(`成功钓起${fish.name}！`);
    const cp = pointToScreen(fishing.fishX, fishing.dist);
    spawnSplash(cp.x, cp.y, cp.s, 2.4);
    resetFishing();
    render();
    showCatchModal(fish, weight, value);
  }

  // ================= 弹窗 =================
  function showCatchModal(fish, weight, value) {
    const r = getRarity(fish.rarity);
    $('#catchIcon').textContent = fish.emoji;
    $('#catchRarity').textContent = `${r.name} · ${'★'.repeat(fish.rarity + 1)}`;
    $('#catchRarity').style.background = r.color + '22';
    $('#catchRarity').style.color = r.color;
    $('#catchName').textContent = fish.name;
    $('#catchTip').textContent = '';

    let desc = '', actions = '';
    if (fish.type === 'protected') {
      desc = `国家保护动物！重量 ${weight.toFixed(2)} kg`;
      $('#catchTip').textContent = '受保护物种，请立即放生！私藏属违法行为';
      actions = `
        <button class="btn green" data-modal-action="releaseProtected">放生 +🪙${fish.bounty}</button>
        <button class="btn danger" data-modal-action="keepProtected">收下（违法）</button>`;
    } else if (fish.type === 'invasive') {
      desc = `外来入侵物种！重量 ${weight.toFixed(2)} kg`;
      $('#catchTip').textContent = '正确处理可获得奖励，切勿放生！';
      actions = `
        <button class="btn green" data-modal-action="dispose">无害化处理 +🪙${fish.bounty}</button>
        <button class="btn danger" data-modal-action="release">放生</button>`;
    } else if (fish.type === 'worthless') {
      desc = `重量 ${weight.toFixed(2)} kg · 毫无价值`;
      $('#catchTip').textContent = '这玩意儿不值钱，建议直接丢弃';
      actions = `
        <button class="btn danger" data-modal-action="discard">丢弃</button>
        <button class="btn ghost" data-modal-action="keep">收下（0 币）</button>`;
    } else {
      desc = `重量 ${weight.toFixed(2)} kg · 价值 🪙${value}`;
      actions = `
        <button class="btn primary" data-modal-action="keep">收下 +🪙${value}</button>
        <button class="btn danger" data-modal-action="discard">丢弃</button>`;
    }

    $('#catchDesc').textContent = desc;
    $('#catchActions').innerHTML = actions;
    $('#catchModal').classList.remove('hidden');
  }

  function closeCatchModal() {
    $('#catchModal').classList.add('hidden');
  }

  function handleModalAction(action) {
    if (!pendingCatch) return;
    const { fish, weight, value } = pendingCatch;
    switch (action) {
      case 'keep':
        state.bucket.push({ id: fish.id, weight, value });
        save(); render();
        toast(`已收下${fish.name}`);
        break;
      case 'discard':
        toast(`丢弃了${fish.name}`);
        break;
      case 'dispose':
        state.coins += fish.bounty;
        save(); render();
        toast(`无害化处理 +🪙${fish.bounty}`);
        break;
      case 'release':
        toast('⚠️ 放生入侵物种会破坏生态！');
        break;
      case 'releaseProtected':
        state.coins += fish.bounty;
        save(); render();
        toast(`✅ 正确放生${fish.name}，生态奖励 +🪙${fish.bounty}`);
        break;
      case 'keepProtected':
        state.coins = 0;
        state.bucket = [];
        save(); render();
        setStatus('⛓️ 你因非法捕捞保护动物被抓进监狱！');
        toast(`⛓️ 非法捕捞${fish.name}被抓进监狱！鱼币与鱼获全部没收`);
        break;
    }
    pendingCatch = null;
    closeCatchModal();
  }

  // ================= 商店 =================
  function buyBait(id) {
    const b = BAITS.find((x) => x.id === id);
    if (!b) return;
    if (state.coins < b.cost) { toast('鱼币不足'); return; }
    state.coins -= b.cost;
    state.baits[id] = (state.baits[id] || 0) + 1;
    state.activeBait = id;
    save(); render();
    toast(`购买了 1 个${b.name}，已自动装备`);
  }

  function useBait(id) {
    if ((state.baits[id] || 0) <= 0) return;
    state.activeBait = id;
    save(); render();
    toast(`切换到${BAITS.find((b) => b.id === id).name}`);
  }

  function cycleBait() {
    const ids = BAITS.map((b) => b.id);
    const i = ids.indexOf(state.activeBait);
    state.activeBait = ids[(i + 1) % ids.length];
    save(); render();
  }

  function buyGear(id) {
    const g = GEARS.find((x) => x.id === id);
    if (!g) return;
    if (state.ownedGears.includes(id)) { equipGear(id); return; }
    if (state.coins < g.cost) { toast('鱼币不足'); return; }
    state.coins -= g.cost;
    state.ownedGears.push(id);
    state.gearId = id;
    save(); render();
    toast(`入手${g.name}，已自动装备！`);
  }

  function equipGear(id) {
    if (!state.ownedGears.includes(id)) return;
    state.gearId = id;
    save(); render();
    toast(`已装备${GEARS.find((g) => g.id === id).name}`);
  }

  // ================= 出售 / 丢弃 =================
  function discardOne(typeId) {
    const idx = state.bucket.findIndex((f) => f.id === typeId);
    if (idx < 0) return;
    state.bucket.splice(idx, 1);
    save(); render();
    toast('已丢弃');
  }

  function sellAllOfType(typeId) {
    const items = state.bucket.filter((f) => f.id === typeId);
    if (!items.length) return;
    const sum = items.reduce((s, f) => s + f.value, 0);
    state.bucket = state.bucket.filter((f) => f.id !== typeId);
    state.coins += sum;
    save(); render();
    toast(`全部卖出 +🪙${sum}`);
  }

  function sellEverything() {
    if (!state.bucket.length) return;
    const sum = state.bucket.reduce((s, f) => s + f.value, 0);
    state.bucket = [];
    state.coins += sum;
    save(); render();
    toast(`一键卖出 +🪙${sum}`);
  }

  // ================= 弹窗开关 =================
  function openModal(id) { $('#' + id).classList.remove('hidden'); }
  function closeModal(id) { $('#' + id).classList.add('hidden'); }
  function openShop() { render(); openModal('shopModal'); }
  function openBucket() { render(); openModal('bucketModal'); }

  // ================= 轻提示 =================
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }
  function refreshFullscreenBtn() {
    const btn = $('#fullscreenBtn');
    if (btn) btn.textContent = document.fullscreenElement ? '⛶ 退出全屏' : '⛶ 全屏';
  }

  // ================= 事件绑定 =================
  function bindEvents() {
    const scene = $('#scene');

    scene.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (fishing.phase === 'idle') cast();
    });

    scene.addEventListener('mousemove', (e) => {
      if (fishing.phase !== 'idle') return;
      const r = scene.getBoundingClientRect();
      fishing.aimX = clamp((e.clientX - r.left) / r.width, 0.06, 0.94);
      // 越靠上抛得越远（深水），越靠下抛得越近（浅水）
      const ty = clamp((e.clientY - r.top) / r.height, 0.08, 0.82);
      fishing.aimDist = clamp(Math.round((1 - ty) * 100), 8, 92);
      renderScene();
    });

    scene.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (fishing.phase === 'play') {
        reel(e.deltaY < 0 ? 1 : -1);
      }
    }, { passive: false });

    window.addEventListener('resize', () => { layout(); renderScene(); });
    document.addEventListener('fullscreenchange', refreshFullscreenBtn);

    $('#baitSwitchBtn').addEventListener('click', cycleBait);
    $('#resetBtn').addEventListener('click', resetGame);
    $('#fullscreenBtn').addEventListener('click', toggleFullscreen);

    $('#shopBtn').addEventListener('click', openShop);
    $('#bucketBtn').addEventListener('click', openBucket);

    document.querySelectorAll('[data-close]').forEach((b) => {
      b.addEventListener('click', () => closeModal(b.dataset.close));
    });
    ['shopModal', 'bucketModal'].forEach((id) => {
      $('#' + id).addEventListener('click', (e) => {
        if (e.target === $('#' + id)) closeModal(id);
      });
    });

    $('#sellAllBtn').addEventListener('click', sellEverything);

    $('#catchActions').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-modal-action]');
      if (btn) handleModalAction(btn.dataset.modalAction);
    });

    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      switch (action) {
        case 'buyBait': buyBait(id); break;
        case 'useBait': useBait(id); break;
        case 'buyGear': buyGear(id); break;
        case 'equipGear': equipGear(id); break;
        case 'discardOne': discardOne(id); break;
        case 'sellAll': sellAllOfType(id); break;
      }
    });
  }

  // ================= 主循环（setInterval 驱动，后台标签也能推进） =================
  let lastT = 0;
  function loop() {
    const now = performance.now();
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    lastT = now;
    if (fishing.phase === 'flying') updateFly();
    updateParticles(dt);
    renderScene();
  }

  // ================= 启动 =================
  function init() {
    load();
    layout();
    resetFishing();
    render();
    bindEvents();
    setInterval(loop, 33);
  }

  init();
})();
