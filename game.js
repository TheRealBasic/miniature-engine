(() => {
  "use strict";

  // ====== Config ======
  const TILE = 16;              // sprite tile size (internal)
  const VIEW_W = 320;           // internal resolution
  const VIEW_H = 180;

  const CANVAS = document.getElementById("c");
  const ctx = CANVAS.getContext("2d");
  ctx.imageSmoothingEnabled = false;

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
  }

  addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Offscreen for pixel-perfect drawing then upscale
  const off = document.createElement("canvas");
  off.width = VIEW_W;
  off.height = VIEW_H;
  const g = off.getContext("2d");
  g.imageSmoothingEnabled = false;

  // ====== Palette sampled/approximated from your reference image ======
  const PAL = {
    sky:        "#48a8a8", // 72,168,168
    skyDark:    "#388080", // 56,128,128
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
    "KeyW","KeyA","KeyS","KeyD","KeyJ","KeyE","ShiftLeft","ShiftRight"
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

  // ====== World Map ======
  const MAP_W = 64, MAP_H = 36;
  const ground = new Uint8Array(MAP_W * MAP_H); // 0 void, 1 grass

  function idx(x,y){ return y*MAP_W + x; }
  function inb(x,y){ return x>=0 && y>=0 && x<MAP_W && y<MAP_H; }

  // Handcrafted-ish island shape resembling your reference (big left mass + right top ledge + small pillars)
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
  paintRect(5,18, 28, 14, 1);     // main lower-left island
  paintRect(22,12, 18, 14, 1);    // mid island extension
  paintRect(30,10, 12, 9, 1);     // top-right platform
  paintRect(34,20, 10, 8, 1);     // right-mid platform

  // shape edges (carves)
  carveCircle(5,18,4);
  carveCircle(6,32,6);
  carveCircle(20,18,3);
  carveCircle(41,10,4);
  carveCircle(43,28,5);
  carveCircle(28,33,6);
  carveCircle(14,17,3);
  carveCircle(22,29,4);

  // small floating pillars
  paintRect(10,9, 2,2, 1);
  paintRect(52,22, 2,2, 1);

  // Ensure walkable continuity
  function isGround(x,y){ return inb(x,y) && ground[idx(x,y)] === 1; }

  // Decor placements (trees, rocks, mushrooms) stored separately
  const deco = new Map(); // key "x,y" -> {type, solid, pickup}
  const keyXY = (x,y)=> `${x},${y}`;

  function placeDeco(x,y,type, solid=true, pickup=false){
    if(!isGround(x,y)) return;
    deco.set(keyXY(x,y), {type, solid, pickup});
  }

  // Trees like the reference
  [
    [8,26],[10,27],[12,26],[14,25],[16,26],
    [20,24],[24,22],[27,24],
    [33,13],[35,14],[36,15],
    [36,22],[38,21],[40,22]
  ].forEach(([x,y])=>placeDeco(x,y,"tree", true, false));

  // Rocks
  [[18,25],[25,26],[28,22],[31,24],[39,24]].forEach(([x,y])=>placeDeco(x,y,"rock", true, false));

  // Mushrooms (quest pickups)
  [[12,29],[15,29],[26,24],[29,23],[37,25],[41,23]].forEach(([x,y])=>placeDeco(x,y,"mushroom", false, true));

  // Chest
  placeDeco(24,19,"chest", true, false);

  // ====== Entities ======
  const ENT = [];
  function addEntity(e){ ENT.push(e); return e; }

  const player = addEntity({
    kind:"player",
    x: 18*TILE, y: 26*TILE,
    vx:0, vy:0,
    spd: 52, run: 82,
    facing: {x:1,y:0},
    hp: 10, maxHp: 10,
    xp: 0, lvl: 1,
    inv: { mush: 0, coin: 0 },
    atkCD: 0,
    iCD: 0
  });

  const npc = addEntity({
    kind:"npc",
    x: 38*TILE, y: 14*TILE,
    name:"Sir Cloudrick",
    quest: { state: 0 }, // 0 not started, 1 started, 2 done
  });

  const slime = addEntity({
    kind:"slime",
    x: 26*TILE, y: 23*TILE,
    hp: 6, maxHp: 6,
    t: 0,
    dir: {x:1,y:0},
    hurt: 0
  });

  // ====== Dialog / UI state ======
  const state = {
    time: 0,
    cam: {x: player.x, y: player.y},
    pause: false,
    msg: null,        // {lines, t, done, onClose}
    toast: [],        // quick text popups
    chestOpened: false,
    soundOn: true,
  };

  function toast(text){
    state.toast.push({text, t: 0});
    if(state.toast.length>4) state.toast.shift();
  }

  function openDialog(lines, onClose=null){
    state.msg = {lines, t: 0, done: false, onClose};
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
  const SAVE_KEY = "sky_island_rpg_save_v1";
  function save(){
    const s = {
      x: player.x, y: player.y,
      hp: player.hp, maxHp: player.maxHp,
      xp: player.xp, lvl: player.lvl,
      inv: player.inv,
      quest: npc.quest.state,
      chestOpened: state.chestOpened,
      // mushrooms picked: remove from deco
      picked: [...deco.entries()].filter(([k,v])=>v.type==="mushroom" && v.picked).map(([k])=>k),
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
      npc.quest.state = s.quest ?? 0;
      state.chestOpened = !!s.chestOpened;
      // Mark mushrooms as picked
      if(Array.isArray(s.picked)){
        for(const k of s.picked){
          const d = deco.get(k);
          if(d && d.type==="mushroom"){ d.picked = true; }
        }
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
    // mushrooms / chest
    for(const [x,y] of spots){
      const d = deco.get(keyXY(x,y));
      if(d && d.type==="mushroom" && !d.picked) return {type:"mushroom", x, y, d};
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
      ], ()=>{ save(); });
      beep(520, 0.05, "square", 0.03);
      beep(780, 0.06, "triangle", 0.03);
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
        ], ()=>{ npc.quest.state = 1; save(); });
        return;
      }
      if(npc.quest.state === 1){
        if(player.inv.mush >= 3){
          openDialog([
            `${npc.name}: You found them! Magnificent.`,
            "As promised — a blessing of stamina.",
            "+2 Max HP."
          ], ()=>{
            player.inv.mush -= 3;
            player.maxHp += 2;
            player.hp = Math.min(player.hp+2, player.maxHp);
            npc.quest.state = 2;
            toast("Quest complete!");
            beep(880, 0.07, "triangle", 0.03);
            beep(1320, 0.07, "triangle", 0.03);
            save();
          });
        }else{
          openDialog([
            `${npc.name}: Still short.`,
            `You have ${player.inv.mush}/3 mushrooms.`,
            "They look like tiny red umbrellas."
          ]);
        }
        return;
      }
      openDialog([
        `${npc.name}: The clouds seem friendly today.`,
        "If you hear squelching... swing first."
      ]);
    }
  }

  // ====== Clouds ======
  const clouds = [];
  for(let i=0;i<14;i++){
    clouds.push({
      x: rnd(-120, VIEW_W+120),
      y: rnd(8, 90),
      s: rnd(0.25, 1.0),
      sp: rnd(3, 10),
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

  function drawWorld(){
    // sky base
    g.fillStyle = PAL.sky;
    g.fillRect(0,0,VIEW_W,VIEW_H);

    // drifting clouds
    for(const cl of clouds){
      const x = (cl.x - state.cam.x*0.02) | 0;
      const y = (cl.y - state.cam.y*0.02) | 0;
      drawCloud(x, y, cl.s, (cl.p*3)|0);
    }

    // map drawn with camera
    const camX = state.cam.x - VIEW_W/2;
    const camY = state.cam.y - VIEW_H/2;

    const startTx = clamp(Math.floor(camX / TILE)-2, 0, MAP_W-1);
    const startTy = clamp(Math.floor(camY / TILE)-2, 0, MAP_H-1);
    const endTx   = clamp(Math.floor((camX+VIEW_W) / TILE)+3, 0, MAP_W);
    const endTy   = clamp(Math.floor((camY+VIEW_H) / TILE)+3, 0, MAP_H);

    // First pass: draw cliff faces on void tiles adjacent to ground, then grass.
    for(let ty=startTy; ty<endTy; ty++){
      for(let tx=startTx; tx<endTx; tx++){
        const sx = tx*TILE - camX;
        const sy = ty*TILE - camY;

        const here = isGround(tx,ty);

        if(!here){
          // if any neighbor is ground, draw cliff face (like the reference "walls")
          const nG = isGround(tx,ty-1);
          const sG = isGround(tx,ty+1);
          const wG = isGround(tx-1,ty);
          const eG = isGround(tx+1,ty);
          if(nG || sG || wG || eG){
            // Make cliff face only when there's ground above (so it looks like hanging edge)
            if(nG) drawSpr("cliffFace", sx|0, sy|0);
          }
        } else {
          drawSpr("grass", sx|0, sy|0);
        }
      }
    }

    // Second pass: edge foam-ish highlight where ground meets void (tiny pixel accent)
    g.fillStyle = "rgba(240,255,255,0.30)";
    for(let ty=startTy; ty<endTy; ty++){
      for(let tx=startTx; tx<endTx; tx++){
        if(!isGround(tx,ty)) continue;
        // if neighbor below is void => draw a faint lip at bottom
        if(!isGround(tx,ty+1)){
          const sx = tx*TILE - camX;
          const sy = ty*TILE - camY;
          g.fillRect((sx+1)|0, (sy+TILE-1)|0, (TILE-2)|0, 1);
        }
      }
    }

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
        drawSpr(d.type, sx|0, sy|0);
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
      const txt = it.type==="mushroom" ? "E: pick" : it.type==="chest" ? "E: open" : "E: talk";
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
    g.fillText(`🍄 ${player.inv.mush}   ◇ ${player.inv.coin}`, VIEW_W-80, 20);
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
      }
      // still animate clouds even if dialog open
    }

    // Clouds drift
    for(const cl of clouds){
      cl.x += cl.sp * cl.s * dt;
      if(cl.x > VIEW_W + 140) cl.x = -160;
    }

    // Player input (if no dialog)
    if(!state.msg){
      let ax = 0, ay = 0;
      if(down("ArrowLeft")||down("KeyA")) ax -= 1;
      if(down("ArrowRight")||down("KeyD")) ax += 1;
      if(down("ArrowUp")||down("KeyW")) ay -= 1;
      if(down("ArrowDown")||down("KeyS")) ay += 1;

      const running = down("ShiftLeft") || down("ShiftRight");
      const spd = running ? player.run : player.spd;

      if(ax || ay){
        updateFacing(ax, ay);
      }

      moveWithColl(player, ax*spd*dt, ay*spd*dt);

      // Attack
      if(pressedOnce("KeyJ")) tryAttack();

      // Interact
      if(pressedOnce("KeyE") || pressedOnce("Space")) interact();
    }

    // Cooldowns
    player.atkCD = Math.max(0, player.atkCD - dt);

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
            player.x = 18*TILE; player.y = 26*TILE;
            toast("You wake up back on the grass...");
            beep(220,0.08,"triangle",0.03);
            save();
          }
        }
      }
    }

    player.iCD = Math.max(0, player.iCD - dt);

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
    ctx.clearRect(0,0,CANVAS.width,CANVAS.height);
    ctx.drawImage(off, 0,0,VIEW_W,VIEW_H, 0,0,CANVAS.width,CANVAS.height);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Little welcome
  openDialog([
    "You step onto a floating island...",
    "Clouds drift below like an endless sea.",
    "",
    "Find the knight and help him.",
    "(WASD • E interact • J attack)"
  ]);

})();
