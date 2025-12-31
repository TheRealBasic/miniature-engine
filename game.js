(() => {
  "use strict";

  // ====== Config ======
  const TILE = 16;              // sprite tile size (internal)
  const VIEW_W = 320;           // internal resolution
  const VIEW_H = 180;
  const DASH_CD = 1.65;
  const DASH_TIME = 0.22;
  const DASH_SPEED = 200;

  const CANVAS = document.getElementById("c");
  const ctx = CANVAS.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;
  CANVAS.style.imageRendering = "pixelated";

  let screenScale = 3;          // integer on-screen scale
  let renderScale = screenScale * (window.devicePixelRatio || 1);

  function resizeCanvas(){
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const fitScale = Math.max(
      1,
      Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H))
    );
    screenScale = Math.max(1, fitScale);
    renderScale = screenScale * dpr;

    CANVAS.width  = Math.round(VIEW_W * renderScale);
    CANVAS.height = Math.round(VIEW_H * renderScale);
    CANVAS.style.width  = `${VIEW_W * screenScale}px`;
    CANVAS.style.height = `${VIEW_H * screenScale}px`;
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
  }

  addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Offscreen for pixel-perfect drawing then upscale
  const off = document.createElement("canvas");
  off.width = VIEW_W;
  off.height = VIEW_H;
  const g = off.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.mozImageSmoothingEnabled = false;
  g.webkitImageSmoothingEnabled = false;

  // ====== Palette sampled/approximated from your reference image ======
  const PAL = {
    sky:        "#78c4d6",
    skyDark:    "#4c94a8",
    waterDeep:  "#245a7a",
    water:      "#357ca0",
    waveFoam:   "#d4f1ff",
    waveShadow: "#1f4b67",
    cloud1:     "#f8f8f0",
    cloud2:     "#e0e8c8",
    cloud3:     "#d8d0b8",
    grass:      "#60a860",
    grass2:     "#58a060",
    grassLight: "#98b850",
    outline:    "#203838",
    cliff:      "#6a9898",
    cliff2:     "#587f86",
    cliffDark:  "#3c5c61",
    rock:       "#8aa3a6",
    rock2:      "#6e8b90",
    trunk:      "#b6865b",
    trunk2:     "#8f5f3e",
    leafG:      "#5fa060",
    leafY:      "#c8c86a",
    leafO:      "#d9b05e",
    mushRed:    "#d85a5a",
    mushRed2:   "#b84545",
    mushDot:    "#f1e9db",
    shard:      "#b9d6ff",
    shard2:     "#7da5f2",
    beacon:     "#f2d27a",
    beacon2:    "#f7f3d4",
    feather:    "#f8f2e0",
    feather2:   "#e0d4b4",
    ui:         "rgba(10,20,20,.70)"
  };

  // ====== Helpers ======
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp  = (a, b, t) => a + (b - a) * t;
  const rnd   = (a, b) => a + Math.random() * (b - a);
  const irnd  = (a, b) => Math.floor(rnd(a, b + 1));
  const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

  // ====== Input ======
  const key = new Map();
  const INPUT_KEYS = new Set([
    "ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space",
    "KeyW","KeyA","KeyS","KeyD","KeyJ","KeyK","KeyE","ShiftLeft","ShiftRight"
  ]);

  function recordKey(e, isDown){
    // Opera GX sometimes omits KeyboardEvent.code; fall back to key/id variants.
    const names = new Set([e.code]);
    if(e.key){
      const upper = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      names.add(e.key);
      names.add(upper);
      if(/^[A-Z]$/.test(upper)) names.add(`Key${upper}`);
    }
    for(const name of names){
      if(name) key.set(name, isDown);
    }
    if(INPUT_KEYS.has(e.code) || INPUT_KEYS.has(e.key) || INPUT_KEYS.has(`Key${e.key?.toUpperCase?.()||""}`)){
      e.preventDefault();
    }
  }

  addEventListener("keydown", e => recordKey(e, true));
  addEventListener("keyup",   e => recordKey(e, false));

  const down = (code) => {
    if(key.get(code)) return true;
    if(code.startsWith("Key")){
      const letter = code.slice(3);
      return !!(key.get(letter) || key.get(letter.toLowerCase()) || key.get(letter.toUpperCase()));
    }
    return !!key.get(code.replace("Arrow",""));
  };
  const pressedOnce = (() => {
    const prev = new Map();
    return (code) => {
      const now = down(code);
      const was = !!prev.get(code);
      prev.set(code, now);
      return now && !was;
    };
  })();

  // ====== Sprite factory (procedural pixel-art) ======
  const atlas = document.createElement("canvas");
  atlas.width = 256; atlas.height = 256;
  const a = atlas.getContext("2d");
  a.imageSmoothingEnabled = false;

  function pxRect(c, x,y,w,h){ a.fillStyle=c; a.fillRect(x,y,w,h); }
  function pxDot(c, x,y){ a.fillStyle=c; a.fillRect(x,y,1,1); }

  // sprite registry: name -> {x,y,w,h}
  const SPR = {};
  let sprX = 0, sprY = 0, rowH = 0;
  function addSprite(name, w, h, drawFn){
    if(sprX + w > atlas.width){ sprX = 0; sprY += rowH; rowH = 0; }
    rowH = Math.max(rowH, h);
    a.save();
    a.translate(sprX, sprY);
    drawFn(sprX, sprY);
    a.restore();
    SPR[name] = {x:sprX, y:sprY, w, h};
    sprX += w + 2;
  }

  function outlineBox(x0,y0,w,h, col=PAL.outline){
    a.fillStyle = col;
    a.fillRect(x0,y0,w,1);
    a.fillRect(x0,y0+h-1,w,1);
    a.fillRect(x0,y0,1,h);
    a.fillRect(x0+w-1,y0,1,h);
  }

  // Grass top tile
  addSprite("grass", TILE, TILE, (sx,sy)=>{
    pxRect(PAL.grass, 0,0, TILE,TILE);
    // subtle noise
    for(let i=0;i<26;i++){
      const x=irnd(0,TILE-1), y=irnd(0,TILE-1);
      pxDot(Math.random()<0.5?PAL.grass2:PAL.grassLight, x,y);
    }
    // darker rim like the reference
    for(let x=0;x<TILE;x++){
      if(Math.random()<0.25) pxDot(PAL.grass2, x, TILE-1);
    }
  });

  // Cliff face tile (vertical)
  addSprite("cliffFace", TILE, TILE, ()=>{
    // top lip
    pxRect(PAL.grass, 0,0, TILE,4);
    pxRect(PAL.grass2, 0,3, TILE,1);
    // stone face
    pxRect(PAL.cliff, 0,4, TILE,12);
    // striations
    for(let x=0;x<TILE;x+=3){
      pxRect(Math.random()<0.5?PAL.cliff2:PAL.cliffDark, x, 6, 1, 9);
    }
    // edge outline
    outlineBox(0,0,TILE,TILE);
  });

  // Void tile (sky)
  addSprite("void", TILE, TILE, ()=>{
    pxRect(PAL.sky, 0,0, TILE,TILE);
  });

  // Rock
  addSprite("rock", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)", 0,0, TILE,TILE);
    // blob
    const baseX=3, baseY=7;
    pxRect(PAL.rock2, baseX, baseY, 10,6);
    pxRect(PAL.rock, baseX+1, baseY+1, 8,4);
    pxDot(PAL.cloud1, baseX+3, baseY+2);
    outlineBox(baseX, baseY, 10, 6, PAL.outline);
  });

  // Mushroom (pick-up)
  addSprite("mushroom", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)", 0,0,TILE,TILE);
    // cap
    pxRect(PAL.mushRed2, 4,7, 8,4);
    pxRect(PAL.mushRed,  5,6, 6,5);
    // dots
    pxDot(PAL.mushDot, 6,7);
    pxDot(PAL.mushDot, 9,8);
    // stem
    pxRect("#eadbbf", 7,10,2,4);
    pxRect("#d6c5a6", 7,12,2,2);
    outlineBox(4,6,8,8,PAL.outline);
  });

  // Tree (top-down-ish)
  addSprite("tree", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)", 0,0,TILE,TILE);
    // leaves blob
    pxRect(PAL.leafG, 4,2, 8,8);
    pxRect(PAL.leafY, 5,3, 5,5);
    pxRect(PAL.leafO, 8,5, 3,3);
    // trunk
    pxRect(PAL.trunk2, 7,10,2,4);
    pxRect(PAL.trunk,  7,11,2,2);
    outlineBox(4,2,8,12,PAL.outline);
  });

  // Player (little knight)
  addSprite("player", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)", 0,0,TILE,TILE);
    // body
    pxRect("#c9d7da", 6,8,4,5);
    pxRect("#98aeb2", 6,12,4,2);
    // head/helmet
    pxRect("#dbe8ea", 6,4,4,4);
    pxRect("#7aa1b2", 9,4,1,4); // plume
    pxRect("#5e8796", 9,3,1,1);
    // face slit
    pxDot(PAL.outline, 7,6);
    // sword
    pxRect("#d8e4e6", 11,8,1,4);
    pxRect("#b1c2c5", 11,7,1,1);
    pxRect("#6b4a2f", 10,10,1,1);
    outlineBox(5,3,7,11,PAL.outline);
  });

  // NPC (knight with plume)
  addSprite("npc", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)", 0,0,TILE,TILE);
    pxRect("#d7e2e4", 6,8,4,5);
    pxRect("#9fb3b8", 6,12,4,2);
    pxRect("#e8f3f5", 6,4,4,4);
    pxRect("#4c78b0", 5,4,1,4); // plume
    pxRect("#345f90", 5,3,1,1);
    pxDot(PAL.outline, 7,6);
    // shield
    pxRect("#8b6a3e", 3,9,2,4);
    pxRect("#6a4d2e", 3,10,2,2);
    outlineBox(3,4,7,11,PAL.outline);
  });

  // Slime enemy
  addSprite("slime", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)", 0,0,TILE,TILE);
    pxRect("#7bd3a0", 4,9, 8,4);
    pxRect("#5dbb8a", 5,8, 6,5);
    pxDot(PAL.outline, 6,10);
    pxDot(PAL.outline, 9,10);
    pxDot("#eaffff", 6,9);
    pxDot("#eaffff", 9,9);
    outlineBox(4,8,8,5,PAL.outline);
  });

  // Chest
  addSprite("chest", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)", 0,0,TILE,TILE);
    pxRect("#a77b48", 4,9, 8,5);
    pxRect("#8a5f34", 4,11,8,3);
    pxRect("#d0b070", 7,9,2,5);
    pxDot(PAL.outline, 6,11);
    outlineBox(4,9,8,5,PAL.outline);
  });

  // Sky shard (quest pickup)
  addSprite("shard", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)", 0,0,TILE,TILE);
    pxRect(PAL.shard2, 6,4, 4,8);
    pxRect(PAL.shard,  7,3, 3,8);
    pxDot(PAL.beacon2, 8,4);
    outlineBox(6,3,5,10, PAL.outline);
  });

  // Beacon (ritual brazier)
  addSprite("beacon", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)", 0,0,TILE,TILE);
    pxRect("#4b3b28", 4,9, 8,5); // base
    pxRect("#7a5b3a", 4,10, 8,2);
    pxRect("#c0aa7a", 6,7, 4,3); // bowl
    pxRect("#8b754e", 6,8, 4,1);
    pxDot(PAL.beacon2, 8,6);
    outlineBox(4,7,8,7,PAL.outline);
  });

  // Harpy (flying enemy)
  addSprite("harpy", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)", 0,0,TILE,TILE);
    pxRect("#c8d6da", 6,8,4,5); // body
    pxRect("#9fb3b8", 6,12,4,2);
    pxRect(PAL.feather2, 3,8, 4,6); // wing left
    pxRect(PAL.feather,  9,8, 4,6); // wing right
    pxRect("#f7f3d4", 7,5, 3,3); // head
    pxDot("#203838", 8,6);
    outlineBox(3,4,10,10, PAL.outline);
  });

  // Feather projectile
  addSprite("featherProj", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)",0,0,TILE,TILE);
    pxRect(PAL.feather, 6,7, 4,2);
    pxRect(PAL.feather2, 5,8, 4,2);
    outlineBox(5,7,6,3, PAL.outline);
  });

  // Forge (crafting station)
  addSprite("forge", TILE, TILE, ()=>{
    pxRect("rgba(0,0,0,0)", 0,0,TILE,TILE);
    pxRect("#4a4a52", 3,9, 10,5);
    pxRect("#60606c", 3,10,10,2);
    pxRect("#d26c2c", 5,8, 6,2); // embers
    pxDot("#f4d7aa", 7,7);
    outlineBox(3,7,10,7, PAL.outline);
  });

  // ====== World Map ======
  const MAP_W = 64, MAP_H = 36;
  const ground = new Uint8Array(MAP_W * MAP_H); // 0 void, 1 grass

  function idx(x,y){ return y*MAP_W + x; }
  function inb(x,y){ return x>=0 && y>=0 && x<MAP_W && y<MAP_H; }

  // Handcrafted-ish island shape with a central hub clearing
  function paintRect(x0,y0,w,h,val=1){
    for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++) if(inb(x,y)) ground[idx(x,y)] = val;
  }
  function carveCircle(cx,cy,r){
    for(let y=cy-r-1;y<=cy+r+1;y++){
      for(let x=cx-r-1;x<=cx+r+1;x++){
        if(!inb(x,y)) continue;
        const d=(x-cx)*(x-cx)+(y-cy)*(y-cy);
        if(d<=r*r) ground[idx(x,y)] = 0;
      }
    }
  }

  // base masses
  paintRect(10,16, 30, 15, 1);    // central landmass
  paintRect(22,10, 18, 9, 1);     // top plateau
  paintRect(34,20, 12, 10, 1);    // right wing
  paintRect(14,24, 10, 8, 1);     // lower-left belly

  // shape edges (carves)
  carveCircle(10,16,4);
  carveCircle(12,31,6);
  carveCircle(22,16,3);
  carveCircle(40,11,4);
  carveCircle(43,29,5);
  carveCircle(30,34,6);
  carveCircle(16,18,3);
  carveCircle(24,29,4);

  // Ensure walkable continuity
  function isGround(x,y){ return inb(x,y) && ground[idx(x,y)] === 1; }

  // Coastline cache for animated foam
  const coast = [];
  function rebuildCoast(){
    coast.length = 0;
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for(let y=0;y<MAP_H;y++){
      for(let x=0;x<MAP_W;x++){
        if(!isGround(x,y)) continue;
        for(const [dx,dy] of dirs){
          if(!isGround(x+dx, y+dy)){
            coast.push({x, y, dx, dy});
          }
        }
      }
    }
  }
  rebuildCoast();

  // Decor placements (trees, rocks, mushrooms) stored separately
  const deco = new Map(); // key "x,y" -> {type, solid, pickup}
  const keyXY = (x,y)=> `${x},${y}`;

  function placeDeco(x,y,type, solid=true, pickup=false){
    if(!isGround(x,y)) return;
    deco.set(keyXY(x,y), {type, solid, pickup});
  }

  // Trees framing a central hub clearing
  [
    [12,26],[14,22],[16,30],[18,20],[20,28],
    [22,18],[24,16],[28,16],[30,18],
    [32,22],[34,26],[36,20],[38,24],[40,18],
    [42,26]
  ].forEach(([x,y])=>placeDeco(x,y,"tree", true, false));

  // Rocks pushed toward the coasts
  [[14,32],[20,32],[28,32],[36,28],[40,22]].forEach(([x,y])=>placeDeco(x,y,"rock", true, false));

  // Mushrooms (quest pickups) on accessible grass tiles
  [[16,26],[18,27],[28,28],[30,26],[36,24],[40,24]].forEach(([x,y])=>placeDeco(x,y,"mushroom", false, true));

  // Sky shards scattered farther out
  [[12,30],[24,12],[42,28],[18,18]].forEach(([x,y])=>placeDeco(x,y,"shard", false, true));

  // Chest set near the plateau
  placeDeco(28,15,"chest", true, false);

  // Ancient beacon near the cliff edge
  placeDeco(22,12,"beacon", true, false);

  // Forge for glider crafting
  placeDeco(24,14,"forge", true, false);

  // ====== Entities ======
  const ENT = [];
  function addEntity(e){ ENT.push(e); return e; }

  const HUB_SPAWN = {x: 26*TILE, y: 24*TILE};

  const player = addEntity({
    kind:"player",
    x: HUB_SPAWN.x, y: HUB_SPAWN.y,
    vx:0, vy:0,
    spd: 52, run: 82,
    facing: {x:1,y:0},
    hp: 10, maxHp: 10,
    xp: 0, lvl: 1,
    inv: { mush: 0, coin: 0, shard: 0, feather: 0 },
    atkCD: 0,
    iCD: 0,
    dash: 0,
    dashCD: 0,
    glider: false
  });

  const npc = addEntity({
    kind:"npc",
    x: 38*TILE, y: 14*TILE,
    name:"Sir Cloudrick",
    quest: { state: 0 }, // 0 intro, 1 mushroom quest, 2 legacy complete, 3 beacon quest, 4 beacon done, 5 harpy task, 6 finished
  });

  const slime = addEntity({
    kind:"slime",
    x: 34*TILE, y: 24*TILE,
    hp: 6, maxHp: 6,
    t: 0,
    dir: {x:1,y:0},
    hurt: 0
  });

  const harpies = [
    addEntity({kind:"harpy", x: 14*TILE, y: 12*TILE, hp: 7, maxHp: 7, t:0, dir:{x:1,y:0}, hurt:0, shoot:0, alive:true}),
    addEntity({kind:"harpy", x: 42*TILE, y: 18*TILE, hp: 7, maxHp: 7, t:0, dir:{x:-1,y:0}, hurt:0, shoot:0, alive:true}),
    addEntity({kind:"harpy", x: 30*TILE, y: 30*TILE, hp: 7, maxHp: 7, t:0, dir:{x:0,y:1}, hurt:0, shoot:0, alive:true}),
  ];

  const projectiles = [];

  // ====== Dialog / UI state ======
  const state = {
    time: 0,
    cam: {x: player.x, y: player.y},
    pause: false,
    msg: null,        // {lines, t, done, onClose}
    toast: [],        // quick text popups
    chestOpened: false,
    beaconLit: false,
    harpiesCleared: false,
    soundOn: true,
  };

  function toast(text){
    state.toast.push({text, t: 0});
    if(state.toast.length>4) state.toast.shift();
  }

  function openDialog(lines, opts={}){
    const {onClose=null, blockInput=true, autoCloseOnMove=false} = opts;
    state.msg = {lines, t: 0, done: false, onClose, blockInput, autoCloseOnMove};
  }

  // ====== Simple sound (optional) ======
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ac = null;
  function beep(freq=440, dur=0.06, type="square", gain=0.04){
    if(!state.soundOn) return;
    try{
      if(!ac) ac = new AudioCtx();
      if(ac.state === "suspended"){
        ac.resume().catch(()=>{});
        if(ac.state !== "running") return; // wait for a later beep
      }
      const o = ac.createOscillator();
      const g2 = ac.createGain();
      o.type = type;
      o.frequency.value = freq;
      g2.gain.value = gain;
      o.connect(g2).connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + dur);
    }catch(err){
      // Ignore audio errors (e.g., autoplay restrictions)
    }
  }

  // ====== Save/Load ======
  const SAVE_KEY = "sky_island_rpg_save_v2";
  function save(){
    const s = {
      x: player.x, y: player.y,
      hp: player.hp, maxHp: player.maxHp,
      xp: player.xp, lvl: player.lvl,
      inv: player.inv,
      quest: npc.quest.state,
      chestOpened: state.chestOpened,
      beaconLit: state.beaconLit,
      harpiesCleared: state.harpiesCleared,
      glider: player.glider,
      // mushrooms picked: remove from deco
      picked: [...deco.entries()].filter(([k,v])=>v.type==="mushroom" && v.picked).map(([k])=>k),
      shardsPicked: [...deco.entries()].filter(([k,v])=>v.type==="shard" && v.picked).map(([k])=>k),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  }
  function load(){
    try{
      const raw = localStorage.getItem(SAVE_KEY);
      if(!raw) return;
      const s = JSON.parse(raw);
      player.x=s.x; player.y=s.y;
      player.hp=s.hp; player.maxHp=s.maxHp;
      player.xp=s.xp; player.lvl=s.lvl;
      player.inv=s.inv || player.inv;
      if(player.inv.shard == null) player.inv.shard = 0;
      if(player.inv.feather == null) player.inv.feather = 0;
      npc.quest.state = s.quest ?? 0;
      state.chestOpened = !!s.chestOpened;
      state.beaconLit = !!s.beaconLit;
      state.harpiesCleared = !!s.harpiesCleared;
      player.glider = !!s.glider;
      // Mark mushrooms as picked
      if(Array.isArray(s.picked)){
        for(const k of s.picked){
          const d = deco.get(k);
          if(d && d.type==="mushroom"){ d.picked = true; }
        }
      }
      if(Array.isArray(s.shardsPicked)){
        for(const k of s.shardsPicked){
          const d = deco.get(k);
          if(d && d.type==="shard"){ d.picked = true; }
        }
      }
      // harpies cleared removes them
      if(state.harpiesCleared){
        for(const h of harpies){ h.alive = false; }
      }
      // Make opened chest non-blocking
      if(state.chestOpened){
        for(const [,d] of deco){
          if(d.type === "chest") d.solid = false;
        }
      }
      toast("Loaded save.");
    }catch{ /* ignore */ }
  }
  load();

  // ====== Map collision ======
  function tileAt(px,py){
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    return {tx,ty};
  }

  function solidAtTile(tx,ty){
    if(!inb(tx,ty)) return true;
    if(!isGround(tx,ty)) return true; // void is not walkable
    const d = deco.get(keyXY(tx,ty));
    if(d && d.solid) return true;
    return false;
  }

  function moveWithColl(e, dx, dy){
    // simple AABB per tile
    const r = 4; // player half-size
    let nx = e.x + dx, ny = e.y + dy;

    // X
    let left = nx - r, right = nx + r;
    let top = e.y - r, bottom = e.y + r;
    let tL = tileAt(left, top), tR = tileAt(right, top), bL = tileAt(left, bottom), bR = tileAt(right, bottom);
    if(solidAtTile(tL.tx, tL.ty) || solidAtTile(tR.tx, tR.ty) || solidAtTile(bL.tx, bL.ty) || solidAtTile(bR.tx, bR.ty)){
      nx = e.x; // cancel x
    }

    // Y
    left = nx - r; right = nx + r;
    top = ny - r; bottom = ny + r;
    tL = tileAt(left, top); tR = tileAt(right, top); bL = tileAt(left, bottom); bR = tileAt(right, bottom);
    if(solidAtTile(tL.tx, tL.ty) || solidAtTile(tR.tx, tR.ty) || solidAtTile(bL.tx, bL.ty) || solidAtTile(bR.tx, bR.ty)){
      ny = e.y; // cancel y
    }

    e.x = nx; e.y = ny;
  }

  // ====== Combat ======
  function tryAttack(){
    if(player.atkCD > 0) return;
    player.atkCD = 0.32;
    beep(680, 0.05, "square", 0.03);
    // hitbox in facing direction
    const fx = player.facing.x, fy = player.facing.y;
    const hx = player.x + fx*10;
    const hy = player.y + fy*10;
    // hit slime
    if(slime.hp > 0 && dist2(hx,hy, slime.x, slime.y) < 13*13){
      slime.hp -= 2;
      slime.hurt = 0.15;
      beep(220, 0.06, "sawtooth", 0.025);
      if(slime.hp <= 0){
        toast("Slime defeated! +3 XP");
        player.xp += 3;
        levelCheck();
        save();
      }
    }
    // hit harpies
    for(const h of harpies){
      if(!h.alive) continue;
      if(dist2(hx,hy, h.x, h.y) < 14*14){
        h.hp -= 2;
        h.hurt = 0.2;
        beep(260,0.05,"square",0.02);
        if(h.hp <= 0){
          h.alive = false;
          player.inv.feather++;
          player.xp += 4;
          toast("Harpy down! +1 feather, +4 XP");
          levelCheck();
          if(harpies.filter(x=>x.alive).length === 0){
            state.harpiesCleared = true;
            toast("The skies quiet down...");
          }
          save();
        }
      }
    }
  }

  function levelCheck(){
    const need = 6 + (player.lvl-1)*4;
    if(player.xp >= need){
      player.xp -= need;
      player.lvl++;
      player.maxHp += 2;
      player.hp = player.maxHp;
      toast(`Level up! Now level ${player.lvl}.`);
      beep(880,0.07,"triangle",0.03);
      beep(1320,0.07,"triangle",0.03);
    }
  }

  // ====== Interactions ======
  function nearestInteractable(){
    const pt = tileAt(player.x, player.y);
    // check 4-neighborhood + current
    const spots = [
      [pt.tx, pt.ty],
      [pt.tx+1, pt.ty],[pt.tx-1, pt.ty],[pt.tx, pt.ty+1],[pt.tx, pt.ty-1]
    ];
    // mushrooms / shards / chest / beacon / forge
    for(const [x,y] of spots){
      const d = deco.get(keyXY(x,y));
      if(d && d.type==="mushroom" && !d.picked) return {type:"mushroom", x, y, d};
      if(d && d.type==="shard" && !d.picked) return {type:"shard", x, y, d};
      if(d && d.type==="beacon") return {type:"beacon", x, y, d};
      if(d && d.type==="forge") return {type:"forge", x, y, d};
      if(d && d.type==="chest") return {type:"chest", x, y, d};
    }
    // npc proximity (within 1 tile)
    if(dist2(player.x,player.y, npc.x,npc.y) < (TILE*1.2)*(TILE*1.2)) return {type:"npc"};
    return null;
  }

  function interact(){
    if(state.msg) { // advance dialog
      state.msg.done = true;
      return;
    }
    const it = nearestInteractable();
    if(!it) { toast("Nothing to interact with."); return; }

    if(it.type==="mushroom"){
      it.d.picked = true;
      player.inv.mush++;
      toast(`Picked a red mushroom (${player.inv.mush}).`);
      beep(980, 0.04, "square", 0.03);
      save();
      return;
    }

    if(it.type==="chest"){
      const chestDeco = it.d || deco.get(keyXY(it.x, it.y));
      if(state.chestOpened){
        openDialog([
          "The chest is empty.",
          "(You already looted it.)"
        ]);
        if(chestDeco) chestDeco.solid = false;
        return;
      }
      state.chestOpened = true;
      if(chestDeco) chestDeco.solid = false;
      player.inv.coin += 12;
      openDialog([
        "You opened the chest!",
        "+12 coins.",
        "(Coins don't do much... yet.)"
      ], {onClose: ()=>{ save(); }});
      beep(520, 0.05, "square", 0.03);
      beep(780, 0.06, "triangle", 0.03);
      return;
    }

    if(it.type==="shard"){
      it.d.picked = true;
      player.inv.shard++;
      toast(`Sky shard collected (${player.inv.shard}).`);
      beep(1020, 0.05, "triangle", 0.03);
      save();
      return;
    }

    if(it.type==="forge"){
      const forgeDeco = it.d || deco.get(keyXY(it.x, it.y));
      if(player.glider){
        openDialog([
          "The forge hums — your wind glider is complete.",
          "Feathers swirl lazily in the updraft."
        ]);
        if(forgeDeco) forgeDeco.solid = true;
        return;
      }
      if(!state.beaconLit){
        openDialog([
          "The forge is dormant.",
          "Maybe reigniting the beacon will wake its fire."
        ]);
        return;
      }
      if(player.inv.feather >= 3 && player.inv.coin >= 8){
        player.inv.feather -= 3;
        player.inv.coin -= 8;
        player.glider = true;
        openDialog([
          "You hammer feathers into a wind glider.",
          "New ability: Wind Dash (K) — short burst through gusts.",
          "Use it to dodge harpies and close gaps."
        ], {onClose: ()=>{ toast("Wind glider crafted! Press K to dash."); save(); }});
        beep(620,0.06,"triangle",0.03);
        beep(980,0.06,"triangle",0.03);
        return;
      }
      openDialog([
        "Forge recipe: 3 harpy feathers + 8 coins.",
        `You have ${player.inv.feather}/3 feathers and ${player.inv.coin} coins.`,
        "Harpies patrol the ridges — knock them down and salvage feathers."
      ]);
      return;
    }

    if(it.type==="beacon"){
      const beaconDeco = it.d || deco.get(keyXY(it.x, it.y));
      if(state.beaconLit){
        openDialog([
          "The beacon hums softly, calling to distant towers.",
          "Warmth spreads through the air."
        ]);
        if(beaconDeco) beaconDeco.solid = true;
        return;
      }
      if(player.inv.shard >= 3){
        player.inv.shard -= 3;
        state.beaconLit = true;
        openDialog([
          "You place the shards into the bowl.",
          "Light erupts skyward!",
          "The island no longer feels forgotten."
        ], {onClose: ()=>{ toast("Sky beacon rekindled!"); beep(820,0.08,"triangle",0.03); beep(1240,0.1,"triangle",0.03); save(); }});
        if(npc.quest.state === 3) npc.quest.state = 4;
        return;
      }
      openDialog([
        "An ancient beacon, cold and quiet.",
        "Three sky shards should wake it."
      ]);
      return;
    }

    if(it.type==="npc"){
      // Quest flow
      if(npc.quest.state === 0){
        openDialog([
          `${npc.name}: Ah! A traveler in the clouds.`,
          "Could you bring me 3 red mushrooms?",
          "I swear they grow only where the sky is calm.",
          "",
          "(Pick mushrooms with E, then come back.)"
        ], {onClose: ()=>{ npc.quest.state = 1; save(); }});
        return;
      }
      if(npc.quest.state === 1){
        if(player.inv.mush >= 3){
          openDialog([
            `${npc.name}: You found them! Magnificent.`,
            "As promised — a blessing of stamina.",
            "+2 Max HP.",
            "",
            "One more favor? Gather 3 sky shards",
            "and rekindle the beacon atop the ridge."
          ], {onClose: ()=>{
            player.inv.mush -= 3;
            player.maxHp += 2;
            player.hp = Math.min(player.hp+2, player.maxHp);
            npc.quest.state = 3;
            toast("Beacon quest started!");
            beep(880, 0.07, "triangle", 0.03);
            beep(1320, 0.07, "triangle", 0.03);
            save();
          }});
        }else{
          openDialog([
            `${npc.name}: Still short.`,
            `You have ${player.inv.mush}/3 mushrooms.`,
            "They look like tiny red umbrellas."
          ]);
        }
        return;
      }
      if(npc.quest.state === 2){
        npc.quest.state = 3;
        openDialog([
          `${npc.name}: The mushrooms helped a lot.`,
          "Could you also gather 3 sky shards?",
          "Place them in the beacon bowl to relight it."
        ], {onClose: ()=>{ save(); }});
        return;
      }
      if(npc.quest.state === 3){
        if(state.beaconLit){
          npc.quest.state = 4;
          openDialog([
            `${npc.name}: The beacon is alive!`,
            "But harpies circle now that the light returned.",
            "Craft a wind glider at the forge (northwest).",
            "Bring 3 feathers from harpies; dash with K to evade them."
          ], {onClose: ()=>{ save(); }});
          return;
        }
        openDialog([
          `${npc.name}: The beacon bowl waits for light.`,
          `Shards found: ${player.inv.shard}/3.`,
          "It's up on the northern ridge."
        ]);
        return;
      }
      if(npc.quest.state === 4){
        if(state.harpiesCleared){
          npc.quest.state = 5;
          openDialog([
            `${npc.name}: The harpies fled!`,
            "Your glider stirs the winds nicely.",
            "Take these coins and my thanks.",
            "+18 coins."
          ], {onClose: ()=>{
            player.inv.coin += 18;
            toast("Knight reward received.");
            save();
          }});
          return;
        }
        openDialog([
          `${npc.name}: Harpies linger near the cliffs.`,
          `Feathers gathered: ${player.inv.feather}/3.`,
          "Craft the glider at the forge, then chase them off."
        ]);
        return;
      }
      if(npc.quest.state >= 5){
        openDialog([
          `${npc.name}: The clouds seem friendly today.`,
          "If you hear squelching... swing first."
        ]);
      }
    }
  }

  // ====== Clouds ======
  const clouds = [];
  for(let i=0;i<14;i++){
    clouds.push({
      x: rnd(-120, VIEW_W+120),
      y: rnd(-12, 48),
      s: rnd(0.35, 1.0),
      sp: rnd(4, 12),
      p: Math.random()
    });
  }

  function drawCloud(cx,cy,scale,shade){
    const c1 = shade===0 ? PAL.cloud1 : (shade===1 ? PAL.cloud2 : PAL.cloud3);
    g.fillStyle = c1;
    const w = 34*scale, h = 12*scale;
    // blob via rects (pixel-y)
    g.fillRect(cx, cy, w, h);
    g.fillRect(cx+6*scale, cy-5*scale, 12*scale, 6*scale);
    g.fillRect(cx+18*scale, cy-7*scale, 10*scale, 8*scale);
    // soft-ish underside shadow
    g.fillStyle = "rgba(0,0,0,0.10)";
    g.fillRect(cx+3*scale, cy+h-2*scale, (w-6*scale), 2*scale);
  }

  // ====== Rendering tiles ======
  function spr(name){
    const s = SPR[name];
    return s;
  }
  function drawSpr(name, x, y){
    const s = spr(name);
    g.drawImage(atlas, s.x, s.y, s.w, s.h, x, y, s.w, s.h);
  }

  function drawWaterTile(tx, ty, camX, camY){
    const sx = tx*TILE - camX;
    const sy = ty*TILE - camY;
    const phase = state.time*1.7 + tx*0.9 + ty*0.55;
    g.fillStyle = PAL.waterDeep;
    g.fillRect(sx, sy, TILE, TILE);
    g.fillStyle = PAL.waveShadow;
    g.fillRect(sx, sy + 10 + Math.sin(phase)*1.4, TILE, 2);
    g.fillStyle = PAL.water;
    g.fillRect(sx, sy + 4 + Math.sin(phase*0.7)*2, TILE, 4);
    g.fillStyle = PAL.waveFoam;
    g.fillRect(sx, sy + 2 + Math.sin(phase)*2, TILE, 1);
  }

  function drawFoam(camX, camY){
    g.fillStyle = PAL.waveFoam;
    g.globalAlpha = 0.85;
    for(const edge of coast){
      const sx = edge.x*TILE - camX;
      const sy = edge.y*TILE - camY;
      const wobble = Math.sin(state.time*3 + edge.x*0.7 + edge.y*0.5);
      if(edge.dy === 1){
        g.fillRect((sx+1)|0, (sy+TILE-2 + wobble*1.6)|0, TILE-2, 3);
      }else if(edge.dy === -1){
        g.fillRect((sx+1)|0, (sy-1 + wobble*1.2)|0, TILE-2, 3);
      }else if(edge.dx === 1){
        g.fillRect((sx+TILE-2 + wobble*1.2)|0, (sy+2)|0, 3, TILE-4);
      }else if(edge.dx === -1){
        g.fillRect((sx-1 + wobble*1.2)|0, (sy+2)|0, 3, TILE-4);
      }
    }
    g.globalAlpha = 1;
  }

  function drawWorld(){
    // water base (animated ripples to read as ocean)
    const waterGrad = g.createLinearGradient(0,0,0,VIEW_H);
    waterGrad.addColorStop(0, PAL.sky);
    waterGrad.addColorStop(0.35, PAL.water);
    waterGrad.addColorStop(1, PAL.waterDeep);
    g.fillStyle = waterGrad;
    g.fillRect(0,0,VIEW_W,VIEW_H);
    g.fillStyle = "rgba(255,255,255,0.035)";
    for(let y=0;y<VIEW_H;y+=6){
      const offset = Math.sin(state.time*1.6 + y*0.12) * 6;
      g.fillRect((offset|0)-12, y, VIEW_W+24, 1);
    }

    // drifting clouds above the island
    for(const cl of clouds){
      const x = (cl.x - state.cam.x*0.04) | 0;
      const y = ((cl.y - state.cam.y*0.04) - 14) | 0;
      drawCloud(x, y, cl.s, (cl.p*3)|0);
    }

    // map drawn with camera
    const camX = state.cam.x - VIEW_W/2;
    const camY = state.cam.y - VIEW_H/2;

    const startTx = clamp(Math.floor(camX / TILE)-2, 0, MAP_W-1);
    const startTy = clamp(Math.floor(camY / TILE)-2, 0, MAP_H-1);
    const endTx   = clamp(Math.floor((camX+VIEW_W) / TILE)+3, 0, MAP_W);
    const endTy   = clamp(Math.floor((camY+VIEW_H) / TILE)+3, 0, MAP_H);

    // First pass: draw animated water tiles, then grass.
    for(let ty=startTy; ty<endTy; ty++){
      for(let tx=startTx; tx<endTx; tx++){
        const sx = tx*TILE - camX;
        const sy = ty*TILE - camY;

        const here = isGround(tx,ty);

        if(!here){
          drawWaterTile(tx, ty, camX, camY);
        } else {
          drawSpr("grass", sx|0, sy|0);
        }
      }
    }

    // Coast foam
    drawFoam(camX, camY);

    // Deco
    for(let ty=startTy; ty<endTy; ty++){
      for(let tx=startTx; tx<endTx; tx++){
        const d = deco.get(keyXY(tx,ty));
        if(!d) continue;
        if(d.type==="mushroom" && d.picked) continue;
        if(d.type==="chest" && state.chestOpened){
          // draw open-ish chest by darkening
          const camX2 = camX, camY2 = camY;
          const sx = tx*TILE - camX2;
          const sy = ty*TILE - camY2;
          g.globalAlpha = 0.85;
          drawSpr("chest", sx|0, sy|0);
          g.globalAlpha = 1;
          continue;
        }
        const sx = tx*TILE - camX;
        const sy = ty*TILE - camY;
        if(d.type==="beacon" && state.beaconLit){
          g.globalAlpha = 0.9;
          drawSpr("beacon", sx|0, sy|0);
          g.globalAlpha = 1;
          // glow
          const rad = 18 + Math.sin(state.time*3)*3;
          const grd = g.createRadialGradient(sx+8, sy+8, 2, sx+8, sy+8, rad);
          grd.addColorStop(0, "rgba(247,243,212,0.6)");
          grd.addColorStop(1, "rgba(247,243,212,0)");
          g.fillStyle = grd;
          g.fillRect(sx-rad+8, sy-rad+8, rad*2, rad*2);
        }else{
          drawSpr(d.type, sx|0, sy|0);
        }
      }
    }

    // Entities
    // Slime (if alive)
    if(slime.hp > 0){
      const sx = (slime.x - camX - TILE/2)|0;
      const sy = (slime.y - camY - TILE/2)|0;
      if(slime.hurt>0) g.globalAlpha = 0.65;
      drawSpr("slime", sx, sy);
      g.globalAlpha = 1;
      // tiny HP bar
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(sx, sy-4, TILE, 2);
      g.fillStyle = "rgba(200,255,200,0.9)";
      g.fillRect(sx, sy-4, Math.floor(TILE*(slime.hp/slime.maxHp)), 2);
    }

    // Harpies
    for(const h of harpies){
      if(!h.alive) continue;
      const sx = (h.x - camX - TILE/2)|0;
      const sy = (h.y - camY - TILE/2)|0;
      if(h.hurt>0) g.globalAlpha = 0.7;
      drawSpr("harpy", sx, sy);
      g.globalAlpha = 1;
      // tiny HP bar
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(sx, sy-5, TILE, 2);
      g.fillStyle = "rgba(255,244,200,0.9)";
      g.fillRect(sx, sy-5, Math.floor(TILE*(h.hp/h.maxHp)), 2);
    }

    // Projectiles
    for(const p of projectiles){
      const sx = (p.x - camX - TILE/2)|0;
      const sy = (p.y - camY - TILE/2)|0;
      drawSpr("featherProj", sx, sy);
    }

    // NPC
    {
      const sx = (npc.x - camX - TILE/2)|0;
      const sy = (npc.y - camY - TILE/2)|0;
      drawSpr("npc", sx, sy);
      // nameplate
      g.fillStyle = "rgba(10,20,20,0.5)";
      g.fillRect(sx-8, sy-14, 32, 9);
      g.fillStyle = "rgba(234,255,255,0.95)";
      g.font = "6px system-ui";
      g.fillText("Knight", sx-4, sy-7);
    }

    // Player
    {
      const sx = (player.x - camX - TILE/2)|0;
      const sy = (player.y - camY - TILE/2)|0;
      drawSpr("player", sx, sy);

      // Attack slash preview (very tiny)
      if(player.atkCD > 0.22){
        g.fillStyle = "rgba(255,255,255,0.55)";
        const fx=player.facing.x, fy=player.facing.y;
        g.fillRect((sx+8+fx*10)|0, (sy+8+fy*10)|0, 2,2);
      }
    }

    // Interaction indicator
    const it = nearestInteractable();
    if(it && !state.msg){
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.font = "7px system-ui";
      const txt = it.type==="mushroom" ? "E: pick"
        : it.type==="shard" ? "E: pick"
        : it.type==="chest" ? "E: open"
        : it.type==="beacon" ? "E: ignite"
        : it.type==="forge" ? "E: craft"
        : "E: talk";
      g.fillText(txt, 6, VIEW_H-8);
    }

    // HUD
    drawHUD();
    drawDialog();
    drawToasts();
    if(state.pause) drawPause();
  }

  function drawHUD(){
    // top-left panel
    g.fillStyle = PAL.ui;
    g.fillRect(6,6, 122, 34);
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.strokeRect(6.5,6.5, 122, 34);

    // Hearts
    const hp = player.hp, mx = player.maxHp;
    const hearts = Math.ceil(mx/2);
    let x=12, y=12;
    for(let i=0;i<hearts;i++){
      const full = (i*2+2)<=hp;
      const half = (i*2+1)<=hp && !full;
      g.fillStyle = full ? "rgba(255,120,120,0.95)" : half ? "rgba(255,170,170,0.9)" : "rgba(255,255,255,0.18)";
      g.fillRect(x, y, 6, 6);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(x, y+5, 6, 1);
      x += 8;
      if(x>118){ x=12; y+=8; }
    }

    // XP bar + level
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(12, 30, 92, 4);
    const need = 6 + (player.lvl-1)*4;
    g.fillStyle = "rgba(220,255,180,0.92)";
    g.fillRect(12, 30, Math.floor(92*(player.xp/need)), 4);
    g.fillStyle = "rgba(234,255,255,0.95)";
    g.font = "7px system-ui";
    g.fillText(`Lv ${player.lvl}`, 108, 34);

    // Inventory (top-right)
    g.fillStyle = PAL.ui;
    g.fillRect(VIEW_W-86, 6, 80, 22);
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.strokeRect(VIEW_W-86+0.5, 6.5, 80, 22);
    g.fillStyle = "rgba(234,255,255,0.95)";
    g.font = "7px system-ui";
    g.fillText(`🍄 ${player.inv.mush}  ✧ ${player.inv.shard}  🪽 ${player.inv.feather}  ◇ ${player.inv.coin}`, VIEW_W-80, 20);
  }

  function drawDialog(){
    if(!state.msg) return;
    const boxH = 52;
    const x = 10, y = VIEW_H - boxH - 10, w = VIEW_W - 20, h = boxH;
    g.fillStyle = "rgba(10,20,20,0.72)";
    g.fillRect(x,y,w,h);
    g.strokeStyle = "rgba(255,255,255,0.18)";
    g.strokeRect(x+0.5,y+0.5,w,h);

    // Typewriter-ish reveal
    state.msg.t += 0.9; // chars per frame-ish
    const all = state.msg.lines.join("\n");
    const chars = Math.floor(state.msg.t);
    const shown = all.slice(0, chars);
    if(chars >= all.length) state.msg.done = true;

    g.fillStyle = "rgba(234,255,255,0.95)";
    g.font = "8px system-ui";
    const lines = shown.split("\n");
    for(let i=0;i<lines.length;i++){
      g.fillText(lines[i], x+8, y+14 + i*10);
    }

    g.fillStyle = "rgba(234,255,255,0.70)";
    g.font = "7px system-ui";
    g.fillText(state.msg.done ? "E / Space: close" : "E / Space: skip", x+w-84, y+h-10);
  }

  function drawToasts(){
    if(!state.toast.length) return;
    let y = 48;
    for(const t of state.toast){
      const alpha = clamp(1 - t.t/2.2, 0, 1);
      g.fillStyle = `rgba(10,20,20,${0.55*alpha})`;
      g.fillRect(8, y-10, 170, 14);
      g.fillStyle = `rgba(234,255,255,${0.95*alpha})`;
      g.font = "7px system-ui";
      g.fillText(t.text, 12, y);
      y += 16;
    }
  }

  function drawPause(){
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0,0,VIEW_W,VIEW_H);
    g.fillStyle = "rgba(234,255,255,0.95)";
    g.font = "12px system-ui";
    g.fillText("PAUSED", VIEW_W/2-28, VIEW_H/2-6);
    g.font = "7px system-ui";
    g.fillText("Esc to resume • S to toggle sound • R to reset save", VIEW_W/2-78, VIEW_H/2+12);
  }

  function updateFacing(ax, ay){
    if(ax === 0 && ay === 0) return;
    const len = Math.hypot(ax, ay) || 1;
    const nx = ax / len;
    const ny = ay / len;
    const absX = Math.abs(nx);
    const absY = Math.abs(ny);

    if(absX > absY){
      player.facing.x = Math.sign(nx) || player.facing.x;
      player.facing.y = 0;
      return;
    }
    if(absY > absX){
      player.facing.x = 0;
      player.facing.y = Math.sign(ny) || player.facing.y;
      return;
    }

    // diagonal of equal strength: stick to previous primary axis to avoid diagonal attacks
    if(player.facing.x !== 0){
      player.facing.y = 0;
      player.facing.x = Math.sign(nx) || player.facing.x;
    }else if(player.facing.y !== 0){
      player.facing.x = 0;
      player.facing.y = Math.sign(ny) || player.facing.y;
    }else{
      // default to horizontal bias if no previous facing
      player.facing.x = Math.sign(nx) || 1;
      player.facing.y = 0;
    }
  }

  // ====== Update loop ======
  function update(dt){
    state.time += dt;

    // Pause toggle
    if(pressedOnce("Escape")){
      state.pause = !state.pause;
      if(state.pause) beep(220,0.05,"square",0.02);
      else beep(440,0.05,"square",0.02);
    }

    if(state.pause){
      if(pressedOnce("KeyS")){ state.soundOn = !state.soundOn; toast(`Sound: ${state.soundOn?"on":"off"}`); }
      if(pressedOnce("KeyR")){
        localStorage.removeItem(SAVE_KEY);
        toast("Save reset. Reload page.");
      }
      return;
    }

    // movement intent captured even if a dialog is up (for auto-close)
    let ax = 0, ay = 0;
    if(down("ArrowLeft")||down("KeyA")) ax -= 1;
    if(down("ArrowRight")||down("KeyD")) ax += 1;
    if(down("ArrowUp")||down("KeyW")) ay -= 1;
    if(down("ArrowDown")||down("KeyS")) ay += 1;
    const running = down("ShiftLeft") || down("ShiftRight");
    const spd = running ? player.run : player.spd;

    // Dialog interactions
    if(state.msg){
      if(pressedOnce("KeyE") || pressedOnce("Space")){
        if(!state.msg.done){
          // skip to end
          state.msg.t = 999999;
          state.msg.done = true;
          beep(520,0.03,"square",0.02);
        } else {
          const cb = state.msg.onClose;
          state.msg = null;
          if(cb) cb();
          beep(420,0.03,"square",0.02);
        }
      } else if(state.msg.autoCloseOnMove && (ax || ay)){
        // let the first movement close the intro pop so players can move immediately
        const cb = state.msg.onClose;
        state.msg = null;
        if(cb) cb();
        beep(420,0.03,"square",0.02);
      }
      // still animate clouds even if dialog open
    }

    // Clouds drift
    for(const cl of clouds){
      cl.x += cl.sp * cl.s * dt;
      if(cl.x > VIEW_W + 140) cl.x = -160;
    }

    // Player input (if dialog allows movement)
    if(!state.msg || !state.msg.blockInput){
      if(ax || ay){
        updateFacing(ax, ay);
      }

      moveWithColl(player, ax*spd*dt, ay*spd*dt);

      // Wind dash (requires glider)
      if(player.glider && pressedOnce("KeyK") && player.dashCD <= 0){
        player.dash = DASH_TIME;
        player.dashCD = DASH_CD;
        beep(920,0.05,"triangle",0.025);
      }

      // apply dash movement (overrides speed)
      if(player.dash > 0){
        const fx = player.facing.x || 1;
        const fy = player.facing.y || 0;
        moveWithColl(player, fx*DASH_SPEED*dt, fy*DASH_SPEED*dt);
      }

      // Attack
      if(pressedOnce("KeyJ")) tryAttack();

      // Interact
      if(pressedOnce("KeyE") || pressedOnce("Space")) interact();
    }

    // Cooldowns
    player.atkCD = Math.max(0, player.atkCD - dt);
    player.dash = Math.max(0, player.dash - dt);
    player.dashCD = Math.max(0, player.dashCD - dt);

    // Slime AI
    if(slime.hp > 0){
      slime.t += dt;
      slime.hurt = Math.max(0, slime.hurt - dt);
      if(slime.t > 1.2){
        slime.t = 0;
        // random dir
        const dirs = [[1,0],[-1,0],[0,1],[0,-1],[0,0]];
        const [dx,dy] = dirs[irnd(0, dirs.length-1)];
        slime.dir.x = dx; slime.dir.y = dy;
      }
      // move gently
      const sspd = 22;
      const dx = slime.dir.x * sspd * dt;
      const dy = slime.dir.y * sspd * dt;
      // slime uses same collision as player-ish
      const prevX = slime.x, prevY = slime.y;
      moveWithColl(slime, dx, dy);
      // if it hit a wall, stop
      if(slime.x === prevX && slime.y === prevY){
        slime.dir.x = 0; slime.dir.y = 0;
      }

      // contact damage
      if(!state.msg && dist2(player.x,player.y, slime.x,slime.y) < 10*10){
        // tiny invuln window
        if(player.iCD <= 0){
          player.hp -= 1;
          player.iCD = 0.8;
          toast("Ouch! Slime hit you.");
          beep(160,0.06,"sawtooth",0.03);
          if(player.hp <= 0){
            player.hp = player.maxHp;
            player.x = HUB_SPAWN.x; player.y = HUB_SPAWN.y;
            toast("You wake up back on the grass...");
            beep(220,0.08,"triangle",0.03);
            save();
          }
        }
      }
    }

    player.iCD = Math.max(0, player.iCD - dt);

    // Harpy AI
    for(const h of harpies){
      if(!h.alive) continue;
      h.t += dt;
      h.hurt = Math.max(0, h.hurt - dt);
      h.shoot = Math.max(0, h.shoot - dt);
      const dx = player.x - h.x;
      const dy = player.y - h.y;
      const dist = Math.hypot(dx, dy) || 1;
      const desire = Math.max(36, Math.min(82, dist-26));
      const nx = dx / dist;
      const ny = dy / dist;
      const drift = Math.sin(state.time*2 + h.x*0.01 + h.y*0.01)*0.35;
      const moveX = (nx + drift) * desire * dt;
      const moveY = (ny - drift) * desire * dt;
      h.x += moveX;
      h.y += moveY;
      // shoot
      if(h.shoot <= 0 && dist < 140){
        projectiles.push({
          x: h.x, y: h.y,
          vx: nx * 110, vy: ny * 110,
          t: 0
        });
        h.shoot = 1.2 + Math.random()*0.8;
        beep(640,0.04,"square",0.02);
      }
    }

    // Projectiles update
    for(const p of projectiles){
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if(dist2(p.x,p.y, player.x,player.y) < 10*10 && player.iCD <= 0){
        if(player.dash <= 0){
          player.hp -= 1;
          player.iCD = 0.9;
          toast("Feather strike!");
          beep(200,0.05,"sawtooth",0.03);
          if(player.hp <= 0){
            player.hp = player.maxHp;
            player.x = HUB_SPAWN.x; player.y = HUB_SPAWN.y;
            toast("You wake up back on the grass...");
            beep(220,0.08,"triangle",0.03);
            save();
          }
        }
        p.t = 10; // mark for removal
      }
    }
    // prune projectiles
    for(let i=projectiles.length-1;i>=0;i--){
      const p = projectiles[i];
      if(p.t > 3) projectiles.splice(i,1);
    }

    // Camera follow (smooth)
    state.cam.x = lerp(state.cam.x, player.x, 0.12);
    state.cam.y = lerp(state.cam.y, player.y, 0.12);

    // Toast timers
    for(const t of state.toast) t.t += dt;
    state.toast = state.toast.filter(t => t.t < 2.6);
  }

  // ====== Main loop ======
  let last = performance.now();
  function frame(now){
    const dt = clamp((now - last) / 1000, 0, 0.033);
    last = now;

    update(dt);
    drawWorld();

    // upscale to screen
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.clearRect(0,0,CANVAS.width,CANVAS.height);
    ctx.drawImage(off, 0,0,VIEW_W,VIEW_H, 0,0,CANVAS.width,CANVAS.height);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Little welcome
  openDialog([
    "You step onto a wind-washed isle...",
    "Waves crash softly against the rocks.",
    "",
    "Find the knight and help him.",
    "(WASD • E interact • J attack)"
  ], {blockInput:false, autoCloseOnMove:true});

})();
