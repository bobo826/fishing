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

  const SAVE_KEY = 'fishing-mvp-save-v4';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // 节奏常量
  const TICK_MS = 180;      // 遛鱼时鱼发力间隔
  const CHARGE_RATE = 38;   // 蓄力速度（0→100 约 2.6 秒）
  const FLY_MS = 900;       // 抛竿飞行时长
  const BITE_MS = 2200;     // 扬竿窗口

  // 世界坐标映射
  const WORLD_HALF_X = 12;  // 横向 aimX 0..1 → -12..12
  const SHORE_Z = 2;        // 水线 z（dist 0）
  const WATER_FAR = 30;     // dist 100 对应 z = SHORE_Z - 30 = -28
  const ROD_BASE = new THREE.Vector3(0, 0.5, 2.4);
  const ROD_LEN = 3.4;

  let state = clone(DEFAULT_STATE);
  let pendingCatch = null;

  let fishing = {
    phase: 'idle',      // idle | charge | flying | waiting | bite | play
    aimX: 0.5,
    power: 0,
    dist: 50,
    tension: 50,
    target: null,
    fishX: 0.5,
    castDist: 50,
    flyWorld: new THREE.Vector3(),
    flyFrom: new THREE.Vector3(),
    flyTo: new THREE.Vector3(),
    flyStart: 0,
    waitTimer: null,
    biteTimer: null,
    tickTimer: null,
    biteDeadline: 0,
  };

  // three.js 对象
  let renderer, scene, camera, sunLight;
  let waterMesh, beachMesh, dockGroup, rodGroup, lineMesh;
  let bobberGroup, fishSprite, previewRing;
  let splashDrops = [], splashRings = [];
  let waterGeo = null, waterBasePos = null;
  let toonGrad = null;
  let cloudSprites = [];

  const $ = (sel) => document.querySelector(sel);

  // ================= 工具 =================
  const rand = (min, max) => Math.random() * (max - min) + min;
  const round2 = (n) => Math.round(n * 100) / 100;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function getGear() { return GEARS.find((g) => g.id === state.gearId) || GEARS[0]; }
  function getBait() { return BAITS.find((b) => b.id === state.activeBait) || BAITS[0]; }
  function getRarity(k) { return RARITY.find((r) => r.key === k) || RARITY[0]; }

  function aimToX(aimX) { return (clamp(aimX, 0.02, 0.98) - 0.5) * WORLD_HALF_X * 2; }
  function distToZ(dist) { return SHORE_Z - (clamp(dist, 0, 100) / 100) * WATER_FAR; }
  function worldPos(x01, dist) { return new THREE.Vector3(aimToX(x01), 0, distToZ(dist)); }

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

  // ================= 渲染（DOM UI） =================
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

  // ================= three.js 场景搭建 =================
  function initThree() {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    $('#scene').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd7ebf2, 45, 110);

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 220);
    camera.position.set(0, 8.5, 14.5);
    camera.lookAt(0, 0, -6);

    // 灯光：半球天空光 + 暖色太阳（柔和自然）
    scene.add(new THREE.HemisphereLight(0xdceef7, 0xc4ad80, 0.8));
    sunLight = new THREE.DirectionalLight(0xfff2cf, 1.1);
    sunLight.position.set(14, 18, 8);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.left = -14;
    sunLight.shadow.camera.right = 14;
    sunLight.shadow.camera.top = 14;
    sunLight.shadow.camera.bottom = -14;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 60;
    sunLight.target.position.set(0, 0, 3);
    scene.add(sunLight);
    scene.add(sunLight.target);

    toonGrad = makeToonGradient();
    buildSky();
    buildWater();
    buildBeach();
    buildDock();
    buildMountains();
    buildSunAndClouds();
    buildProps();
    buildRod();
    buildBobber();
    buildFish();
    buildPreview();
    buildLine();
  }

  let waterNormalTex = null;

  function makeGradientCanvas(stops) {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    for (const [pos, col] of stops) g.addColorStop(pos, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    return c;
  }

  function buildSky() {
    const canvas = makeGradientCanvas([
      [0, '#3f7fb5'],
      [0.35, '#7fb8d9'],
      [0.55, '#cde9f4'],
      [1, '#f4fafc'],
    ]);
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 16), mat);
    sky.renderOrder = -1;
    scene.add(sky);
  }

  function makeWaterNormalTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 10; i++) {
      const cx = Math.random() * size, cy = Math.random() * size;
      const r = 24 + Math.random() * 80;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.12 + Math.random() * 0.18) + ')';
      ctx.lineWidth = 2 + Math.random() * 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    return tex;
  }

  function makeWoodTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#d2a166';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 46; i++) {
      const y = Math.random() * 256;
      ctx.strokeStyle = 'rgba(122,82,40,' + (0.10 + Math.random() * 0.25) + ')';
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.06 + i * 0.7) * 2.2);
      }
      ctx.stroke();
    }
    for (let i = 1; i < 4; i++) {
      ctx.strokeStyle = 'rgba(110,70,35,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64, 256);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function makeToonGradient() {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 1;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 8, 0);
    g.addColorStop(0, '#7d92a2');
    g.addColorStop(0.55, '#b8c9d5');
    g.addColorStop(1, '#fffdf5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 1);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    return tex;
  }

  function makeRadialTexture(inner, outer) {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function makeCloudTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const ctx = c.getContext('2d');
    const blobs = [[78, 58, 26], [118, 46, 32], [158, 56, 28], [108, 68, 24], [138, 70, 24]];
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function buildMountains() {
    const layers = [
      { z: -42, color: 0xb8d6e4, s: 1.0 },
      { z: -34, color: 0x8fb6cc, s: 1.3 },
      { z: -26, color: 0x6694ac, s: 1.6 },
    ];
    for (const L of layers) {
      const mat = new THREE.MeshToonMaterial({ color: L.color, gradientMap: toonGrad });
      const count = 9;
      for (let i = 0; i < count; i++) {
        const w = (2 + Math.random() * 3) * L.s;
        const h = (3 + Math.random() * 5) * L.s;
        const m = new THREE.Mesh(new THREE.ConeGeometry(w, h, 7), mat);
        m.position.set(-18 + i * 4.5 + Math.random() * 2.5, h * 0.45 - 1.2, L.z + (Math.random() - 0.5) * 2);
        scene.add(m);
      }
    }
  }

  function buildSunAndClouds() {
    const sunTex = makeRadialTexture('rgba(255,252,230,1)', 'rgba(255,235,170,0)');
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false }));
    sun.position.set(50, 66, 28);
    sun.scale.set(16, 16, 1);
    scene.add(sun);

    for (let i = 0; i < 5; i++) {
      const cloudTex = makeCloudTexture();
      const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
      cloud.position.set((Math.random() - 0.5) * 44, 13 + Math.random() * 9, -22 + Math.random() * 18);
      cloud.scale.set(8 + Math.random() * 7, 2.6 + Math.random() * 1.8, 1);
      cloud.userData.speed = 0.3 + Math.random() * 0.5;
      scene.add(cloud);
      cloudSprites.push(cloud);
    }
  }

  function buildWater() {
    waterGeo = new THREE.PlaneGeometry(90, 30, 64, 30);
    waterGeo.rotateX(-Math.PI / 2);
    waterBasePos = Float32Array.from(waterGeo.attributes.position.array);
    waterNormalTex = makeWaterNormalTexture();
    const mat = new THREE.MeshPhongMaterial({
      color: 0x3fa9b5,
      specular: 0xd8ecf2,
      shininess: 90,
      normalMap: waterNormalTex,
      normalScale: new THREE.Vector2(0.5, 0.5),
    });
    waterMesh = new THREE.Mesh(waterGeo, mat);
    waterMesh.position.set(0, 0, -13); // z -28..2
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);
  }

  function buildBeach() {
    const geo = new THREE.PlaneGeometry(90, 10);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xf0dfb6 });
    beachMesh = new THREE.Mesh(geo, mat);
    beachMesh.position.set(0, -0.05, 7); // z 2..12
    beachMesh.receiveShadow = true;
    scene.add(beachMesh);
  }

  function buildDock() {
    dockGroup = new THREE.Group();
    const deckMat = new THREE.MeshToonMaterial({ map: makeWoodTexture(), gradientMap: toonGrad });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 5), deckMat);
    deck.position.set(0, 0.35, 4.5); // 桥面 z 2..7，顶部 y=0.5
    deck.castShadow = true;
    deck.receiveShadow = true;
    dockGroup.add(deck);

    const legMat = new THREE.MeshToonMaterial({ color: 0x7a5228, gradientMap: toonGrad });
    const legGeo = new THREE.BoxGeometry(0.3, 0.5, 0.3);
    for (const [lx, lz] of [[-2.4, 3.2], [2.4, 3.2], [-2.4, 5.6], [2.4, 5.6], [0, 3.2], [0, 5.6]]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.0, lz);
      leg.castShadow = true;
      dockGroup.add(leg);
    }
    scene.add(dockGroup);
  }

  function buildIsland() {
    const mat = new THREE.MeshPhongMaterial({ color: 0x2a5d78, flatShading: true });
    const specs = [[-8, -28, 3.4, 2.4], [-2, -30, 4.6, 3.4], [5, -27, 3.0, 2.0], [2, -24, 2.4, 1.6]];
    for (const [x, z, r, h] of specs) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), mat);
      m.position.set(x, h * 0.5 - 0.25, z);
      scene.add(m);
    }
  }

  function buildProps() {
    // 睡莲叶
    const lilyGeo = new THREE.CylinderGeometry(0.5, 0.55, 0.06, 16);
    const lilyMat = new THREE.MeshToonMaterial({ color: 0x57c07a, gradientMap: toonGrad });
    const LILY = [[-6, -8], [6, -6], [-3, -14], [4, -16], [0, -20], [-8, -3], [7, -12]];
    for (const [x, z] of LILY) {
      const lily = new THREE.Mesh(lilyGeo, lilyMat);
      lily.position.set(x, 0.02, z);
      lily.receiveShadow = true;
      scene.add(lily);
    }
    // 芦苇
    const reedGeo = new THREE.CylinderGeometry(0.04, 0.06, 1.6, 6);
    const reedMat = new THREE.MeshToonMaterial({ color: 0x5aa052, gradientMap: toonGrad });
    const REEDS = [[-10, 0.5], [-9.4, 1.2], [10, 0.5], [9.4, 1.2], [-10.6, 1.8], [10.6, 1.8]];
    for (const [x, z] of REEDS) {
      for (let i = 0; i < 3; i++) {
        const reed = new THREE.Mesh(reedGeo, reedMat);
        reed.position.set(x + (i - 1) * 0.25, 0.8, z + (Math.random() - 0.5) * 0.4);
        reed.castShadow = true;
        scene.add(reed);
      }
    }
  }

  function buildRod() {
    rodGroup = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.025, 0.05, ROD_LEN, 8);
    geo.translate(0, ROD_LEN / 2, 0);
    const mat = new THREE.MeshPhongMaterial({ color: 0xbd8a4a });
    const rod = new THREE.Mesh(geo, mat);
    rod.castShadow = true;
    rodGroup.add(rod);
    rodGroup.position.copy(ROD_BASE);
    scene.add(rodGroup);
  }

  function buildLine() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    lineMesh = new THREE.Line(geo, mat);
    lineMesh.frustumCulled = false;
    lineMesh.visible = false;
    scene.add(lineMesh);
  }

  function buildBobber() {
    bobberGroup = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 8),
      new THREE.MeshPhongMaterial({ color: 0xef4444 })
    );
    top.position.y = 0.07;
    const bottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0xffffff })
    );
    bottom.position.y = -0.07;
    bobberGroup.add(top, bottom);
    bobberGroup.visible = false;
    scene.add(bobberGroup);
  }

  function makeEmojiTexture(emoji) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const c = canvas.getContext('2d');
    c.font = '96px "Segoe UI Emoji","Noto Color Emoji",sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(emoji, 64, 70);
    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function buildFish() {
    const mat = new THREE.SpriteMaterial({ map: makeEmojiTexture('🐟'), transparent: true });
    fishSprite = new THREE.Sprite(mat);
    fishSprite.scale.set(2.2, 2.2, 1);
    fishSprite.visible = false;
    scene.add(fishSprite);
  }

  function setFishEmoji(emoji) {
    fishSprite.material.map = makeEmojiTexture(emoji);
    fishSprite.material.needsUpdate = true;
  }

  function buildPreview() {
    const geo = new THREE.RingGeometry(0.6, 0.9, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    previewRing = new THREE.Mesh(geo, mat);
    previewRing.visible = false;
    scene.add(previewRing);
  }

  // ================= 水花粒子 =================
  function spawnSplash(x, z, intensity) {
    intensity = intensity || 1;
    const n = Math.round(6 * intensity);
    const dropGeo = new THREE.SphereGeometry(0.07, 6, 6);
    const dropMat = new THREE.MeshBasicMaterial({ color: 0xeaf7ff });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.position.set(x + (Math.random() - 0.5) * 0.8, 0.15, z + (Math.random() - 0.5) * 0.8);
      splashDrops.push({
        mesh: m,
        v: new THREE.Vector3((Math.random() - 0.5) * 2, 2.5 + Math.random() * 3, (Math.random() - 0.5) * 2),
        life: 0,
        maxLife: 0.55 + Math.random() * 0.4,
      });
      scene.add(m);
    }
    const ringGeo = new THREE.RingGeometry(0.5, 0.72, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, 0.04, z);
    splashRings.push({ mesh: ring, life: 0, maxLife: 0.9 });
    scene.add(ring);
    if (intensity > 1.2) {
      const ring2 = new THREE.Mesh(ringGeo, ringMat.clone());
      ring2.position.set(x, 0.05, z);
      splashRings.push({ mesh: ring2, life: 0.12, maxLife: 1.1 });
      scene.add(ring2);
    }
  }

  function updateSplash(dt) {
    for (let i = splashDrops.length - 1; i >= 0; i--) {
      const d = splashDrops[i];
      d.life += dt;
      if (d.life >= d.maxLife) { scene.remove(d.mesh); splashDrops.splice(i, 1); continue; }
      d.v.y -= 9.8 * dt;
      d.mesh.position.addScaledVector(d.v, dt);
    }
    for (let i = splashRings.length - 1; i >= 0; i--) {
      const r = splashRings[i];
      r.life += dt;
      if (r.life >= r.maxLife) { scene.remove(r.mesh); splashRings.splice(i, 1); continue; }
      const k = r.life / r.maxLife;
      const s = 0.6 + k * 6;
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = 0.7 * (1 - k);
    }
  }

  // ================= 场景同步 =================
  function syncSceneObjects() {
    let target = null;
    if (fishing.phase === 'charge') {
      target = worldPos(fishing.aimX, fishing.power);
    } else if (fishing.phase === 'flying') {
      target = fishing.flyWorld;
    } else if (fishing.phase === 'waiting' || fishing.phase === 'bite') {
      target = worldPos(fishing.aimX, fishing.castDist);
    } else if (fishing.phase === 'play') {
      target = worldPos(fishing.fishX, fishing.dist);
    }

    // 鱼竿朝向
    const up = new THREE.Vector3(0, 1, 0);
    let aimDir;
    if (target) {
      aimDir = target.clone().sub(ROD_BASE).normalize();
    } else {
      aimDir = new THREE.Vector3((fishing.aimX - 0.5) * 1.4, 1, -1).normalize();
    }
    rodGroup.quaternion.setFromUnitVectors(up, aimDir);
    const rodTip = ROD_BASE.clone().addScaledVector(aimDir, ROD_LEN);

    // 鱼线（竿尖 → 目标，带下垂）
    if (target) {
      lineMesh.visible = true;
      const sag = fishing.phase === 'play'
        ? clamp(0.5 + fishing.tension * 0.004, 0.35, 1.3)
        : 0.6;
      const mid = rodTip.clone().add(target).multiplyScalar(0.5);
      mid.y -= sag;
      const arr = lineMesh.geometry.attributes.position.array;
      arr[0] = rodTip.x; arr[1] = rodTip.y; arr[2] = rodTip.z;
      arr[3] = mid.x; arr[4] = mid.y; arr[5] = mid.z;
      arr[6] = target.x; arr[7] = target.y; arr[8] = target.z;
      lineMesh.geometry.attributes.position.needsUpdate = true;
    } else {
      lineMesh.visible = false;
    }

    const t = performance.now() / 1000;

    // 落点预览
    if (fishing.phase === 'charge') {
      previewRing.visible = true;
      previewRing.position.copy(target).setY(0.04);
      const s = 0.85 + Math.sin(t * 6) * 0.15;
      previewRing.scale.set(s, s, 1);
      bobberGroup.visible = false;
      fishSprite.visible = false;
    } else {
      previewRing.visible = false;
    }

    // 浮标 / 鱼
    if (fishing.phase === 'flying' || fishing.phase === 'waiting' || fishing.phase === 'bite') {
      bobberGroup.visible = true;
      bobberGroup.position.copy(target).setY(0.08 + Math.sin(t * 2.4) * 0.04);
      fishSprite.visible = false;
    } else if (fishing.phase === 'play') {
      bobberGroup.visible = false;
      fishSprite.visible = true;
      fishSprite.position.copy(target).setY(0.4 + Math.sin(t * 3) * 0.15);
      fishSprite.material.rotation = Math.sin(t * 9) * 0.25;
    } else {
      bobberGroup.visible = false;
      fishSprite.visible = false;
    }
  }

  function currentTargetWorld() {
    if (fishing.phase === 'play') return worldPos(fishing.fishX, fishing.dist);
    if (fishing.phase === 'waiting' || fishing.phase === 'bite') return worldPos(fishing.aimX, fishing.castDist);
    return null;
  }

  function renderFightHUD() {
    $('#tensionNeedle').style.left = clamp(fishing.tension, 0, 100) + '%';
    $('#distFill').style.width = (100 - clamp(fishing.dist, 0, 100)) + '%';
  }

  function layout() {
    const rect = $('#scene').getBoundingClientRect();
    if (renderer) {
      renderer.setSize(rect.width, rect.height);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    }
  }

  // ================= 钓鱼流程 =================
  function setStatus(text) { $('#status').textContent = text; }

  function beginCharge() {
    if (fishing.phase !== 'idle') return;
    const bait = getBait();
    if ((state.baits[bait.id] || 0) <= 0) {
      toast('鱼饵不足，请先到商店购买');
      openShop();
      return;
    }
    fishing.power = 0;
    fishing.phase = 'charge';
    $('#powerMeter').classList.remove('hidden');
    setStatus('松开鼠标抛竿！');
  }

  function cast() {
    if (fishing.phase !== 'charge') return;
    const bait = getBait();
    state.baits[bait.id] -= 1;
    save();

    fishing.aimX = clamp(fishing.aimX, 0.08, 0.92);
    fishing.castDist = clamp(fishing.power, 5, 100);
    fishing.dist = fishing.castDist;

    fishing.flyTo = worldPos(fishing.aimX, fishing.castDist);
    const dir = fishing.flyTo.clone().sub(ROD_BASE).normalize();
    fishing.flyFrom = ROD_BASE.clone().addScaledVector(dir, ROD_LEN);
    fishing.flyWorld.copy(fishing.flyFrom);
    fishing.flyStart = performance.now();
    fishing.phase = 'flying';
    $('#powerMeter').classList.add('hidden');
    setStatus('抛竿中……');
    renderHUD();
  }

  function updateFly() {
    const p = clamp((performance.now() - fishing.flyStart) / FLY_MS, 0, 1);
    fishing.flyWorld.lerpVectors(fishing.flyFrom, fishing.flyTo, p);
    fishing.flyWorld.y += Math.sin(p * Math.PI) * 2.5;
    if (p >= 1) {
      fishing.phase = 'waiting';
      setStatus('浮标入水，等待鱼儿上钩……');
      spawnSplash(fishing.flyTo.x, fishing.flyTo.z, 1);
      fishing.waitTimer = setTimeout(onBite, rand(2500, 5000));
    }
  }

  function onBite() {
    fishing.phase = 'bite';
    setStatus('浮标猛地一沉！快速上滚滚轮扬竿！');
    const bp = worldPos(fishing.aimX, fishing.castDist);
    spawnSplash(bp.x, bp.z, 1.4);
    fishing.biteDeadline = performance.now() + BITE_MS;
    fishing.biteTimer = setTimeout(() => escape('扬竿太慢，鱼跑掉了……'), BITE_MS);
  }

  function hookSet() {
    if (fishing.phase !== 'bite') return;
    clearTimeout(fishing.biteTimer);
    const remain = clamp(fishing.biteDeadline - performance.now(), 0, BITE_MS);
    const reaction = remain / BITE_MS;
    const zone = fishing.castDist < 50 ? 'shallow' : 'deep';
    const fish = pickFish(zone);

    fishing.target = fish;
    fishing.dist = fishing.castDist;
    fishing.fishX = fishing.aimX;
    fishing.tension = clamp(55 - reaction * 20, 30, 55);
    fishing.phase = 'play';

    setFishEmoji(fish.emoji);
    $('#fightFish').textContent = fish.emoji;
    $('#fightName').textContent = fish.name;
    $('#fightHud').classList.remove('hidden');
    setStatus(`上钩了！滚轮 ↑ 收线 · ↓ 放线`);
    renderFightHUD();
    fishing.tickTimer = setInterval(playTick, TICK_MS);
  }

  function playTick() {
    if (fishing.phase !== 'play') return;
    const f = fishing.target;
    let pull = f.strength * rand(0.5, 1.3);
    if (Math.random() < 0.08) pull += f.strength * 1.8;
    fishing.tension += pull;
    fishing.dist += f.strength * 0.12;
    fishing.fishX = clamp(fishing.fishX + rand(-0.04, 0.04), 0.1, 0.9);
    if (Math.random() < 0.18) {
      const fp = worldPos(fishing.fishX, fishing.dist);
      spawnSplash(fp.x, fp.z, 0.6);
    }
    renderFightHUD();
    if (fishing.tension >= 100) escape('线断了！鱼带着鱼钩跑了……');
    else if (fishing.tension <= 0) escape('鱼线太松，鱼脱钩了……');
    else if (fishing.dist >= 100) escape('线放光了，鱼脱钩了……');
  }

  function reel(dir) {
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
    const tp = currentTargetWorld();
    if (tp) spawnSplash(tp.x, tp.z, 0.8);
    resetFishing();
    renderHUD();
  }

  function resetFishing() {
    clearTimeout(fishing.waitTimer);
    clearTimeout(fishing.biteTimer);
    clearInterval(fishing.tickTimer);
    fishing.phase = 'idle';
    fishing.target = null;
    fishing.power = 0;
    fishing.dist = 50;
    fishing.tension = 50;
    $('#fightHud').classList.add('hidden');
    $('#powerMeter').classList.add('hidden');
    setStatus('移动鼠标瞄准 · 按住左键蓄力 · 松开抛竿');
  }

  function pickFish(zone) {
    const gear = getGear();
    const bait = getBait();
    const maxRarity = Math.min(3, gear.maxRarity + bait.rarityBonus);
    const pool = FISH.filter((f) => f.rarity <= maxRarity);
    const boost = bait.rarityBonus > 0;
    const weighted = pool.map((f) => {
      let w = f.w || RARITY_WEIGHT[f.rarity] || 5;
      w *= (f.zone === zone) ? 1.8 : 0.45;
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
    const cp = worldPos(fishing.fishX, fishing.dist);
    spawnSplash(cp.x, cp.z, 2.4);
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
    if (fish.type === 'invasive') {
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

  // ================= 事件绑定 =================
  function bindEvents() {
    const scene = $('#scene');

    scene.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      beginCharge();
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (fishing.phase === 'charge') cast();
    });

    scene.addEventListener('mousemove', (e) => {
      const r = scene.getBoundingClientRect();
      fishing.aimX = (e.clientX - r.left) / r.width;
    });

    scene.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (fishing.phase === 'bite') {
        if (e.deltaY < 0) hookSet();
        return;
      }
      if (fishing.phase === 'play') {
        reel(e.deltaY < 0 ? 1 : -1);
        return;
      }
    }, { passive: false });

    window.addEventListener('resize', layout);

    $('#baitSwitchBtn').addEventListener('click', cycleBait);
    $('#resetBtn').addEventListener('click', resetGame);

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

  // ================= 主循环 =================
  let lastT = 0;
  function loop() {
    const now = performance.now();
    const dt = lastT ? (now - lastT) / 1000 : 0;
    lastT = now;
    if (fishing.phase === 'charge') {
      fishing.power = Math.min(100, fishing.power + dt * CHARGE_RATE);
      $('#powerFill').style.width = fishing.power + '%';
    }
    if (fishing.phase === 'flying') updateFly();
    updateSplash(dt);
  }

  function renderLoop() {
    requestAnimationFrame(renderLoop);
    const t = performance.now() / 1000;
    if (waterNormalTex) {
      waterNormalTex.offset.y += 0.0015;
      waterNormalTex.offset.x += 0.0004;
    }
    // 水面顶点波浪
    if (waterGeo && waterBasePos) {
      const pos = waterGeo.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        const x = waterBasePos[i];
        const z = waterBasePos[i + 2];
        pos[i + 1] =
          Math.sin(x * 0.22 + t * 1.3) * 0.10 +
          Math.sin(z * 0.28 - t * 1.7) * 0.08 +
          Math.sin((x + z) * 0.16 + t * 0.9) * 0.05;
      }
      waterGeo.attributes.position.needsUpdate = true;
      waterGeo.computeVertexNormals();
    }
    // 云朵漂移
    for (const c of cloudSprites) {
      c.position.x += c.userData.speed * 0.016;
      if (c.position.x > 30) c.position.x = -30;
    }
    syncSceneObjects();
    if (renderer) renderer.render(scene, camera);
  }

  // ================= 启动 =================
  function init() {
    load();
    initThree();
    layout();
    resetFishing();
    render();
    bindEvents();
    setInterval(loop, 33);
    renderLoop();
  }

  init();
})();
