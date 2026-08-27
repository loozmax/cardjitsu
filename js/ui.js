/* ============================================================
   UI. Реконструкция оригинальной сцены Card-Jitsu (760x480):
   ассеты, геометрия и тайминги перенесены из card.swf / award.swf
   клиента CP (Layout.as / Card.as / Clock.as / PowerController.as /
   BattleController.as / AwardMenu.as). Все координаты — верхний
   левый угол спрайта, как в оригинале.
   ============================================================ */

const BUILD = 'v21';
const EL_ICON = { f: '🔥', w: '💧', s: '❄️' };
const EL_NAME = { f: 'Огонь', w: 'Вода', s: 'Снег' };

/* Layout.as + place-матрицы сцены */
const L = {
  CENTER: { x: 380, y: 240 },
  OFFSCREEN: { x: 375, y: 500 },
  DEALTS: [{ x: 50, y: 385 }, { x: 710, y: 385 }],
  PICKS: [{ x: 225, y: 150 }, { x: 425, y: 150 }],
  WINS: [
    { f: { x: 50, y: 25 }, w: { x: 100, y: 25 }, s: { x: 150, y: 25 } },
    { f: { x: 550, y: 25 }, w: { x: 600, y: 25 }, s: { x: 650, y: 25 } }
  ],
  POWER_TOP: [{ x: 205, y: 25 }, { x: 475, y: 25 }],
  POWER_PICK: [{ x: 250, y: 110 }, { x: 450, y: 110 }],
  WINS_OVER: [
    [{ x: 45, y: 170 }, { x: 95, y: 170 }, { x: 145, y: 170 }],
    [{ x: 570, y: 170 }, { x: 620, y: 170 }, { x: 670, y: 170 }]
  ],
  FRONT_SPACER: 75, BACK_SPACER: 35, WIN_SPACER: 15, POWER_SPACER: 40,
  CARD_W: 235,
  SCALE_NORMAL: 0.28, SCALE_FLIP: 0.40, SCALE_BACK: 0.15
};
const FPS = 24;
const TURN_SECONDS = 20;

const $app = () => document.getElementById('app');
function h(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* страховка от зависших промисов загрузки (Ruffle/сеть) */
const withTimeout = (p, ms) => Promise.race([p, sleep(ms)]);

function sfx(name, vol) {
  try {
    const a = new Audio(`assets/sfx/${name}.mp3`);
    a.volume = vol || 0.6;
    a.play().catch(() => {});
  } catch (e) {}
}
/* звуки стихийной атаки — оригинальные событийные звуки из f/s/w_attack.swf */
const ATTACK_SFX = {
  f: ['f_228', 'f_229', 'f_232'],
  s: ['s_222', 's_234', 's_235', 's_236'],
  w: ['w_226', 'w_235', 'w_236']
};
function attackSfx(elem) {
  (ATTACK_SFX[elem] || []).forEach((n, i) => setTimeout(() => sfx(n, 0.7), i * 300));
}

/* музыка додзё (music/21.swf оригинального клиента), луп на время матча */
let dojoMusic = null;
function startMusic() {
  if (!dojoMusic) {
    dojoMusic = new Audio('assets/sfx/music_dojo.mp3');
    dojoMusic.loop = true;
    dojoMusic.volume = 0.35;
  }
  dojoMusic.play().catch(() => {});
}
function stopMusic() {
  if (dojoMusic) { dojoMusic.pause(); dojoMusic.currentTime = 0; }
}

const S = {
  save: loadSave(),
  screen: 'home',
  homeMode: '',
  match: null,
  matchDom: null
};

/* ---------- карточка (оригинальный вид CP) ---------- */
function cardEl(info, opts = {}) {
  const c = info.card ? info.card : info;
  const wrap = h('div', 'card' + (opts.small ? ' small' : '') + (opts.dim ? ' dim' : ''));
  if (opts.faceDown) { wrap.classList.add('back'); return wrap; }
  if (opts.cloud) {
    wrap.append(h('div', 'cloud'));
    if (c.powerId) wrap.classList.add('glow-' + c.color);
  }
  const face = h('div', 'face');
  const img = h('img', 'art');
  img.src = `assets/cards/${c.id}.png`;
  img.onerror = () => wrap.classList.add('noart');
  img.alt = '';
  const frame = h('img', 'frame');
  frame.src = `assets/ui/frame_${c.color}.png`;
  const elem = h('img', 'elem');
  elem.src = `assets/ui/elem_${opts.element || c.element}.png`;
  face.append(img, frame, elem,
    h('div', 'pt', String(opts.value !== undefined ? opts.value : c.value)));
  wrap.append(face);
  if (opts.qty > 1) wrap.append(h('div', 'qty', '×' + opts.qty));
  return wrap;
}

/* элемент банка выигранных: кадр «thumbnail» карты (цветной квадрат + стихия) */
function winEl(pl, x, y, z) {
  const el = h('div', 'winsq');
  el.dataset.pid = pl.id;
  const sq = h('img', 'sq');
  sq.src = `assets/ui/win_sq_${pl.card.color}.png`;
  const ic = h('img', 'el');
  ic.src = `assets/ui/elem_${pl.card.element}.png`;
  el.append(sq, ic);
  el.style.setProperty('--x', x);
  el.style.setProperty('--y', y);
  el.style.zIndex = z;
  el.style.transition = 'none';
  return el;
}

/* ---------- пояса (BELT_COLOR из BattleController) + фильтры ---------- */
const BELT_COLOR = [null, 0xFFFFFF, 0xFFFF00, 0xFF6600, 0x33CC00, 0x0033CC,
  0xCC0000, 0x6600FF, 0x663300, 0x444444, 0x444444];
function ensureBeltFilters() {
  if (document.getElementById('beltfilters')) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'beltfilters';
  svg.setAttribute('style', 'position:absolute;width:0;height:0');
  for (let r = 1; r < BELT_COLOR.length; r++) {
    const c = BELT_COLOR[r];
    const f = document.createElementNS(NS, 'filter');
    f.id = 'beltf' + r;
    const m = document.createElementNS(NS, 'feColorMatrix');
    const tr = ((c >> 16) & 255) / 255, tg = ((c >> 8) & 255) / 255, tb = (c & 255) / 255;
    m.setAttribute('type', 'matrix');
    m.setAttribute('values',
      `${tr} 0 0 0 0  ${tg} 0 0 0 0  ${tb} 0 0 0 0  0 0 0 1 0`);
    f.append(m);
    svg.append(f);
  }
  document.body.append(svg);
}

/* ---------- webp-анимации боя ---------- */
const webpCache = {};
let ANIM_META = null;
function loadAnimMeta() {
  if (ANIM_META) return Promise.resolve(ANIM_META);
  return fetch('assets/anim/meta.json').then(r => r.json())
    .then(j => (ANIM_META = j)).catch(() => (ANIM_META = {}));
}
function webpBlobUrl(name) {
  if (webpCache[name]) return Promise.resolve(URL.createObjectURL(webpCache[name]));
  return fetch(`assets/anim/${name}.webp`).then(r => r.blob())
    .then(b => { webpCache[name] = b; return URL.createObjectURL(b); });
}
function playWebp(stage, name, frames, { flip = false, loop = false, rank = 0, sensei = false } = {}) {
  const layer = h('div', 'layer' + (flip ? ' flipx' : ''));
  if (!loop) layer.dataset.kill = String(Date.now() + Math.round(frames / FPS * 1000) + 5000);
  stage.append(layer);
  const base = sensei ? name + '_sensei' : name;
  const parts = [webpBlobUrl(base), loadAnimMeta()];
  const withBelt = !sensei && rank > 0;
  if (withBelt) parts.push(webpBlobUrl(name + '_belt'));
  const ready = Promise.all(parts).then(vals => {
    const m = (ANIM_META || {})[name];
    const pos = m ? `left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;` : '';
    const img = document.createElement('img');
    img.src = vals[0];
    img.style.cssText = pos;
    layer.append(img);
    if (withBelt) {
      ensureBeltFilters();
      const belt = document.createElement('img');
      belt.style.cssText = pos + `filter:url(#beltf${Math.min(rank, 10)});`;
      belt.src = vals[2];
      layer.append(belt);
    }
  }).catch(() => {});
  const done = loop ? null
    : withTimeout(ready, 4000)
      .then(() => sleep(Math.round(frames / FPS * 1000)))
      .then(() => layer.remove());
  return { layer, ready, done };
}
/* ---- векторный путь: оригинальные battles/*.swf через Ruffle,
   с рантайм-патчем поясов/тел/бороды (как в клиенте). Растровый
   webp остаётся фолбэком, если Ruffle не поднялся. ---- */
const vecBlobCache = {};
function vecBlobUrl(name, opts) {
  const key = `${name}_${opts.sensei ? 'S' : opts.rank || 0}`;
  if (vecBlobCache[key]) return Promise.resolve(vecBlobCache[key]);
  return fetch(`assets/anim/swf/${name}.swf`).then(r => r.arrayBuffer())
    .then(buf => {
      const url = URL.createObjectURL(new Blob([patchPowBuffer(buf, opts)],
        { type: 'application/x-shockwave-flash' }));
      vecBlobCache[key] = url;
      return url;
    });
}
function vecReady() {
  return !!(window.RufflePlayer && window.RufflePlayer.newest);
}
function playVec(stage, name, frames, { flip = false, loop = false, rank = 0, sensei = false } = {}) {
  if (!vecReady()) return null;
  const rp = window.RufflePlayer;
  const layer = h('div', 'layer' + (flip ? ' flipx' : ''));
  if (!loop) layer.dataset.kill = String(Date.now() + Math.round(frames / FPS * 1000) + 5000);
  stage.append(layer);
  const player = rp.newest().createPlayer();
  player.style.cssText = 'position:absolute;inset:0;width:760px;height:480px;';
  layer.append(player);
  layer.dataset.vec = '1';
  const ready = vecBlobUrl(name, { rank, sensei })
    .then(url => player.ruffle().load({ url, allowScriptAccess: false }))
    .catch(() => {});
  const done = loop ? null
    : withTimeout(ready, 4000)
      .then(() => sleep(Math.round(frames / FPS * 1000)))
      .then(() => layer.remove());
  return { layer, ready, done };
}
/* вектор, если Ruffle готов; иначе webp */
function playAnim(stage, name, frames, opts) {
  return playVec(stage, name, frames, opts) || playWebp(stage, name, frames, opts);
}

/* прогрев боя до начала матча — как в оригинале (loadBasicBattles):
   walk начинается только с готовыми файлами, без пустых секунд */
function preloadBattle(vsSensei) {
  ensureBeltFilters();
  const names = ['ambient', 'walk', 'tie',
    'f_attack', 'f_react', 's_attack', 's_react', 'w_attack', 'w_react'];
  const jobs = [loadAnimMeta(), loadPowMeta()];
  for (const n of names) {
    jobs.push(webpBlobUrl(n));
    jobs.push(webpBlobUrl(n + '_belt'));
    if (vsSensei) jobs.push(webpBlobUrl(n + '_sensei'));
  }
  // векторные swf обеих сторон — после подъёма Ruffle
  const vec = loadRuffle().then(() => {
    if (!vecReady() || !S.match) return null;
    const sides = [sideOpts(true), sideOpts(false)];
    return Promise.all(names.flatMap(n =>
      sides.map(o => vecBlobUrl(n, o).catch(() => {}))));
  });
  jobs.push(vec);
  return Promise.race([Promise.all(jobs).catch(() => {}), sleep(9000)]);
}

/* ---------- ruffle (pow-анимации), рантайм-патч поясов/бороды ---------- */
let ruffleReady = null;
let POW_ANIM = null;
function loadPowMeta() {
  if (POW_ANIM) return Promise.resolve(POW_ANIM);
  return fetch('assets/anim/pow/frames.json').then(r => r.json())
    .then(j => { POW_ANIM = j; return j; }).catch(() => (POW_ANIM = {}));
}
function loadRuffle() {
  if (ruffleReady) return ruffleReady;
  ruffleReady = new Promise(resolve => {
    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = {
      autoplay: 'on', unmuteOverlay: 'hidden', contextMenu: 'off',
      splashScreen: false, wmode: 'transparent', backgroundColor: null,
      logLevel: 'error', showSwfDownload: false
    };
    const s = document.createElement('script');
    s.src = 'vendor/ruffle/ruffle.js';
    s.onload = () => resolve(window.RufflePlayer);
    s.onerror = () => resolve(null);
    document.head.append(s);
  });
  return ruffleReady;
}
function bitsReader(u8, byteOff) {
  let pos = 0;
  return {
    read(n) {
      let v = 0;
      for (let i = 0; i < n; i++) {
        const b = u8[byteOff + (pos >> 3)];
        v = (v << 1) | ((b >> (7 - (pos & 7))) & 1);
        pos++;
      }
      return v;
    },
    used() { return (pos + 7) >> 3; }
  };
}
function parsePlace2(u8, off, len) {
  const flags = u8[off];
  let p = off + 1;
  const depth = u8[p] | (u8[p + 1] << 8); p += 2;
  const info = { flags, depth };
  if (flags & 0x02) { info.char = u8[p] | (u8[p + 1] << 8); p += 2; }
  if (flags & 0x04) {
    const b = bitsReader(u8, p);
    if (b.read(1)) { const n = b.read(5); b.read(n); b.read(n); }
    if (b.read(1)) { const n = b.read(5); b.read(n); b.read(n); }
    const n = b.read(5); b.read(n); b.read(n);
    info.matrixEnd = p + b.used(); p = info.matrixEnd;
  }
  if (flags & 0x08) {
    const b = bitsReader(u8, p);
    const ha = b.read(1), hm = b.read(1), n = b.read(4);
    let cnt = (hm ? 4 : 0) + (ha ? 4 : 0);
    while (cnt--) b.read(n);
    info.cxEnd = p + b.used(); p = info.cxEnd;
  }
  if (flags & 0x10) { p += 2; }
  if (flags & 0x20) {
    let e = p;
    while (u8[e] !== 0) e++;
    info.name = String.fromCharCode(...u8.slice(p, e));
    p = e + 1;
  }
  info.tail = p;
  info.end = off + len;
  return info;
}
function makeCxformRGB(r, g, b) {
  let bits = '11';
  const vals = [0, 0, 0, 256, r, g, b, 0];
  let n = 2;
  for (const v of vals) n = Math.max(n, Math.abs(v).toString(2).length + 1);
  bits += n.toString(2).padStart(4, '0');
  for (const v of vals) bits += (v & ((1 << n) - 1)).toString(2).padStart(n, '0');
  while (bits.length % 8) bits += '0';
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}
function patchPowBuffer(buf, opts) {
  const src = new Uint8Array(buf);
  if (src[0] !== 0x46) return buf;
  const nbits = src[8] >> 3;
  const rectBytes = Math.ceil((5 + nbits * 4) / 8);
  const tagsOff = 8 + rectBytes + 4;
  const hideNames = new Set(['sensay_mc', 'sensay2_mc', 'sensay_mc2']);
  const cxMap = {};
  if (opts.sensei) hideNames.clear();
  else {
    // setColor: тело заливается плоским цветом пингвина
    cxMap.body_mc = 0xFF6500;
    cxMap.frontArm_mc = 0xFF6500;
    cxMap.backArm_mc = 0xFF6500;
  }
  const hideBelt = opts.sensei || !opts.rank;
  if (hideBelt) { hideNames.add('belt_mc'); hideNames.add('beltline_mc'); }
  else cxMap.belt_mc = BELT_COLOR[Math.min(opts.rank, 10)];
  const chunks = [src.slice(0, tagsOff)];
  let off = tagsOff;
  while (off < src.length) {
    let cl = src[off] | (src[off + 1] << 8);
    let code = cl >> 6, len = cl & 0x3F, hdr = 2;
    if (len === 0x3F) {
      len = src[off + 2] | (src[off + 3] << 8) | (src[off + 4] << 16) | (src[off + 5] << 24);
      hdr = 6;
    }
    if (code === 39) {
      chunks.push(patchSprite(src.subarray(off + hdr, off + hdr + len),
        hideNames, cxMap));
    } else {
      chunks.push(src.subarray(off, off + hdr + len));
    }
    off += hdr + len;
    if (code === 0) break;
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  new DataView(out.buffer).setUint32(4, out.length, true);
  return out.buffer;
}
function patchSprite(body, hideNames, cxMap) {
  const parts = [body.slice(0, 4)];
  let off = 4;
  const dropDepths = new Set();
  const cxDepths = {};
  while (off < body.length) {
    let cl = body[off] | (body[off + 1] << 8);
    let code = cl >> 6, len = cl & 0x3F, hdr = 2;
    if (len === 0x3F) {
      len = body[off + 2] | (body[off + 3] << 8) | (body[off + 4] << 16) | (body[off + 5] << 24);
      hdr = 6;
    }
    let keep = true;
    if (code === 26) {
      const info = parsePlace2(body, off + hdr, len);
      // как setColor в клиенте: цвет привязан к ИНСТАНСУ, не к глубине —
      // когда на глубину ставится новый объект (напр. лавина снега после
      // body_mc), окраска/скрытие этой глубины сбрасываются
      if (info.flags & 0x02) {
        dropDepths.delete(info.depth);
        delete cxDepths[info.depth];
      }
      if (info.name && hideNames.has(info.name)) {
        dropDepths.add(info.depth);
        keep = false;
      } else if (dropDepths.has(info.depth)) {
        keep = false;
      } else {
        if (info.name && cxMap[info.name] !== undefined)
          cxDepths[info.depth] = cxMap[info.name];
        if (cxDepths[info.depth] !== undefined) {
          parts.push(rebuildPlaceWithCx(body, off + hdr, len, info, cxDepths[info.depth]));
          keep = false;
        }
      }
    }
    if (keep) parts.push(body.subarray(off, off + hdr + len));
    off += hdr + len;
    if (code === 0) break;
  }
  let total = 0;
  for (const c of parts) total += c.length;
  const payload = new Uint8Array(total);
  let o = 0;
  for (const c of parts) { payload.set(c, o); o += c.length; }
  const out = new Uint8Array(6 + payload.length);
  out[0] = ((39 << 6) | 0x3F) & 255;
  out[1] = ((39 << 6) | 0x3F) >> 8;
  new DataView(out.buffer).setUint32(2, payload.length, true);
  out.set(payload, 6);
  return out;
}
function rebuildPlaceWithCx(u8, off, len, info, color) {
  const cx = makeCxformRGB((color >> 16) & 255, (color >> 8) & 255, color & 255);
  const head = [];
  head.push(info.flags | 0x08);
  head.push(info.depth & 255, info.depth >> 8);
  let p = off + 3;
  if (info.flags & 0x02) { head.push(u8[p], u8[p + 1]); p += 2; }
  let mid = new Uint8Array(0);
  if (info.matrixEnd) { mid = u8.slice(p, info.matrixEnd); p = info.matrixEnd; }
  if (info.cxEnd) p = info.cxEnd;
  const tail = u8.slice(p, off + len);
  const payload = new Uint8Array(head.length + mid.length + cx.length + tail.length);
  payload.set(head, 0);
  payload.set(mid, head.length);
  payload.set(cx, head.length + mid.length);
  payload.set(tail, head.length + mid.length + cx.length);
  const out = new Uint8Array(6 + payload.length);
  out[0] = ((26 << 6) | 0x3F) & 255;
  out[1] = ((26 << 6) | 0x3F) >> 8;
  new DataView(out.buffer).setUint32(2, payload.length, true);
  out.set(payload, 6);
  return out;
}
const powPatchCache = {};
function powBlobUrl(cardId, kind, opts) {
  const key = `${cardId}_${kind}_${opts.sensei ? 'S' : opts.rank}`;
  if (powPatchCache[key]) return Promise.resolve(powPatchCache[key]);
  return fetch(`assets/anim/pow/pow_${cardId}_${kind}.swf`)
    .then(r => r.arrayBuffer())
    .then(buf => {
      const url = URL.createObjectURL(
        new Blob([patchPowBuffer(buf, opts)], { type: 'application/x-shockwave-flash' }));
      powPatchCache[key] = url;
      return url;
    });
}
async function playPowSwf(stage, cardId, winnerIsMe, frames) {
  const rp = await loadRuffle();
  if (!rp || !rp.newest) return false;
  const layerA = h('div', 'layer' + (winnerIsMe ? ' flipx' : ''));
  const layerR = h('div', 'layer' + (winnerIsMe ? '' : ' flipx'));
  const mk = (layer, kind, opts) => {
    const p = rp.newest().createPlayer();
    p.style.width = '760px'; p.style.height = '480px';
    p.style.position = 'absolute'; p.style.inset = '0';
    layer.append(p);
    return powBlobUrl(cardId, kind, opts)
      .then(url => p.ruffle().load({ url, allowScriptAccess: false }))
      .then(() => p).catch(() => null);
  };
  const meta = (POW_ANIM || {})[String(cardId)] || {};
  if (meta.top === false) { stage.append(layerA, layerR); }
  else { stage.append(layerR, layerA); }
  const [pa, pr] = (await withTimeout(Promise.all([
    mk(layerA, 'attack', sideOpts(winnerIsMe)),
    mk(layerR, 'react', sideOpts(!winnerIsMe))
  ]), 5000)) || [null, null];
  if (!pa && !pr) { layerA.remove(); layerR.remove(); return false; }
  await sleep(150);
  hideAmbient();          // ниндзя сменяются атакой без пустого кадра
  const dur = Math.round(frames / FPS * 1000);
  sleep(Math.max(0, dur - 300)).then(() => showAmbient());
  await sleep(dur + 200);
  layerA.remove(); layerR.remove();
  return true;
}

/* ---------- матч ---------- */
function sideOpts(isMe) {
  const ms = S.match;
  return isMe
    ? { rank: S.save.rank, sensei: false }
    : { rank: ms.oppRank, sensei: ms.vsSensei };
}

function startMatch(vsSensei) {
  const save = S.save;
  const pool = collectionCounter(save);
  let m, mySeat, oppSeat, oppName, oppRank;
  if (vsSensei) {
    m = new SenseiMatch(save.rank >= 9);
    mySeat = 1; oppSeat = 0; oppName = 'Сэнсэй'; oppRank = 10;
  } else {
    m = new Match();
    mySeat = 0; oppSeat = 1;
    oppRank = AI.botRank(save.rank);
    oppName = 'Соперник';
  }
  S.match = {
    m, mySeat, oppSeat, oppName, oppRank, vsSensei,
    pool, botPool: vsSensei ? null : AI.botPool(save.rank),
    busy: true, over: null, walked: false, fighting: false,
    timer: null, timeLeft: TURN_SECONDS
  };
  S.matchDom = null;
  S.screen = 'match';
  loadRuffle();
  startMusic();
  preloadBattle(vsSensei).then(() => newRound(true));
  render();
}

function dealAll() {
  const ms = S.match;
  if (ms.vsSensei) ms.m.dealSensei(ms.pool);
  else {
    ms.m.deal(ms.mySeat, ms.pool);
    ms.m.deal(ms.oppSeat, ms.botPool);
  }
}

async function newRound(first) {
  const ms = S.match;
  const before = [ms.m.ninjas[ms.mySeat].deck.size, ms.m.ninjas[ms.oppSeat].deck.size];
  dealAll();
  for (const s of [0, 1]) {
    if (!ms.m.hasCardsToPlay(s)) {
      finishMatch({ winner: (s + 1) % 2, method: 2, cards: null });
      return;
    }
  }
  ms.busy = true;
  ms.dealAnim = true;
  ms.dealtBefore = before;
  render();
  sweepLayers();
  const ambL = document.getElementById('ambient-layers');
  if (first && ambL) {
    ms.walkPhase = true;
    ensureAmbient();
    const W1 = playAnim(ambL, 'walk', 106, Object.assign({ flip: true }, sideOpts(true)));
    const W2 = playAnim(ambL, 'walk', 106, sideOpts(false));
    // как в оригинале: до загрузки walk сцена ждёт — слои скрыты,
    // никаких пустых секунд и преждевременных «сидящих»
    hideLayer(W1.layer);
    hideLayer(W2.layer);
    const dur = Math.round(106 / FPS * 1000);
    await withTimeout(Promise.all([W1.ready, W2.ready]), 8000);
    if (S.match !== ms) return;
    showLayer(W1.layer);
    showLayer(W2.layer);
    // ровно ОДИН проход walk, затем смена на сидящих одним тиком —
    // зациклившийся walk никогда не остаётся на сцене
    await sleep(dur - 150);
    ms.walkPhase = false;
    setAmbientVisible(true);
    W1.layer.remove();
    W2.layer.remove();
    ms.walked = true;
  }
  showAmbient();
  animateDeal();
  await sleep(800);
  ms.dealAnim = false;
  ms.busy = false;
  startTurnClock();
  render();
}

function animateDeal() {
  const pending = document.querySelectorAll('.stage .card[data-tx]');
  pending.forEach((el, i) => {
    setTimeout(() => {
      el.style.setProperty('--x', el.dataset.tx);
      el.style.setProperty('--y', el.dataset.ty);
    }, i * 90);
  });
}

/* скрытие слоёв с сохранением layout: display:none обнуляет размеры
   Ruffle-канваса, а голый visibility WebKit игнорирует для canvas —
   поэтому opacity+visibility вместе */
function hideLayer(l) { l.style.opacity = '0'; l.style.visibility = 'hidden'; }
function showLayer(l) { l.style.opacity = ''; l.style.visibility = ''; }

/* сидящие ниндзя живут ПОСТОЯННО (Ruffle-луп), переключается только
   видимость — переходы к атакам без пустых кадров */
function ensureAmbient() {
  const stage = document.getElementById('ambient-layers');
  if (!stage) return;
  const old = stage.querySelectorAll('.amb');
  if (old.length) {
    // пара уже есть; если она растровая, а Ruffle поднялся — заменяем
    // на векторную (иначе сидящие и атака чуть расходятся по позе)
    if (old[0].dataset.vec === '1' || !vecReady()) return;
    var wasVisible = old[0].style.opacity !== '0';
    old.forEach(n => n.remove());
  } else var wasVisible = false;
  const a = playAnim(stage, 'ambient', 72,
    Object.assign({ loop: true, flip: true }, sideOpts(true)));
  a.layer.classList.add('amb');
  const b = playAnim(stage, 'ambient', 72,
    Object.assign({ loop: true }, sideOpts(false)));
  b.layer.classList.add('amb');
  for (const l of [a.layer, b.layer])
    (wasVisible ? showLayer : hideLayer)(l);
}
/* уборка застрявших временных слоёв (walk/tie/атаки): просроченные по
   сроку жизни всегда, остальные — при полной зачистке между раундами */
function sweepLayers(expiredOnly) {
  const now = Date.now();
  const stale = n => n.dataset.kill && now > +n.dataset.kill;
  const amb = document.getElementById('ambient-layers');
  if (amb) {
    amb.querySelectorAll('.layer:not(.amb)').forEach(n => {
      if (!expiredOnly || stale(n)) n.remove();
    });
    [...amb.querySelectorAll('.amb')].slice(2).forEach(n => n.remove());
  }
  const battle = document.getElementById('battle-layers');
  if (battle) battle.querySelectorAll('.layer').forEach(n => {
    if (!expiredOnly || stale(n)) n.remove();
  });
}
function setAmbientVisible(v) {
  const stage = document.getElementById('ambient-layers');
  if (!stage) return;
  stage.querySelectorAll('.amb').forEach(v ? showLayer : hideLayer);
}
function showAmbient() {
  sweepLayers(true);
  ensureAmbient();
  // во время выхода (walk) постоянная пара не показывается —
  // двух пар на сцене не бывает никогда
  if (S.match && S.match.walkPhase) return;
  setAmbientVisible(true);
}
function hideAmbient() { setAmbientVisible(false); }

/* таймер хода — Clock.as: 20 секунд, виден только во время отсчёта */
function startTurnClock() {
  const ms = S.match;
  if (!ms) return;
  stopTurnClock();
  ms.timeLeft = TURN_SECONDS;
  updateClock();
  ms.timer = setInterval(() => {
    if (S.match !== ms) { clearInterval(ms.timer); return; }
    ms.timeLeft--;
    if (ms.timeLeft <= 0) {
      stopTurnClock();
      autoPick();
      return;
    }
    updateClock();
  }, 1000);
}
function stopTurnClock() {
  const ms = S.match;
  if (ms && ms.timer) { clearInterval(ms.timer); ms.timer = null; }
  const box = document.querySelector('.clockbox');
  if (box) box.style.display = 'none';
}
function updateClock() {
  const ms = S.match;
  const box = document.querySelector('.clockbox');
  if (!box) return;
  box.style.display = '';
  const face = box.querySelector('.cface');
  const num = box.querySelector('.cnum');
  const frame = Math.min(18, Math.max(0, Math.round((1 - ms.timeLeft / TURN_SECONDS) * 18)));
  face.style.backgroundPosition = `${frame * 100 / 18}% 0`;
  num.textContent = ms.timeLeft;
}
function autoPick() {
  const ms = S.match;
  if (!ms || ms.busy || ms.over) return;
  const blocked = ms.m.blockedElement(ms.mySeat);
  const options = [...ms.m.ninjas[ms.mySeat].deck.values()]
    .filter(pl => !(blocked && pl.card.element === blocked));
  if (!options.length) return;
  playCard(options[Math.floor(Math.random() * options.length)].id);
}

async function playCard(playedId) {
  const ms = S.match;
  if (ms.busy || ms.over) return;
  const blocked = ms.m.blockedElement(ms.mySeat);
  const card = ms.m.ninjas[ms.mySeat].deck.get(playedId);
  if (!card || (blocked && card.card.element === blocked)) return;
  ms.busy = true;
  stopTurnClock();
  sfx('pick');

  // перелёт моей карты из руки (живой DOM) и рубашки соперника
  const myCardEl = document.querySelector(`.stage .card[data-pid="${playedId}"]`);
  if (myCardEl) {
    myCardEl.classList.remove('pickable');
    placeCard(myCardEl, L.PICKS[0].x, L.PICKS[0].y, L.SCALE_FLIP);
  }
  if (ms.vsSensei) {
    ms.m.pickPlayer(playedId);
  } else {
    ms.m.pick(ms.mySeat, playedId);
    const botId = AI.pick(ms.m, ms.oppSeat);
    ms.m.pick(ms.oppSeat, botId);
    // живой соперник «думает»: его рубашка прилетает с паузой
    await sleep(500 + Math.random() * 1700);
    if (S.match !== ms) return;
  }
  const stage0 = document.querySelector('.stage');
  if (stage0) {
    const backEl = placeCard(cardEl({}, { faceDown: true }),
      L.DEALTS[1].x - L.BACK_SPACER, L.DEALTS[1].y, L.SCALE_BACK);
    backEl.dataset.fly = '1';
    stage0.querySelector('.dyn').append(backEl);
    requestAnimationFrame(() =>
      placeCard(backEl, L.PICKS[1].x, L.PICKS[1].y, L.SCALE_FLIP));
  }
  await sleep(650);

  const backFly = document.querySelector('.stage .card.back[data-fly]');
  if (backFly) { backFly.classList.add('flipout'); await sleep(120); }
  const res = ms.m.resolveRound();
  ms.lastRes = res;
  ms.fighting = true;
  ms.picksResolved = false;
  ms.bankDelivered = false;
  // отложенные паверы не рисуем в top-слоте, пока их перелёт не отыгран
  ms.armedPending = new Set(res.events.filter(e => e.t === 'armed').map(e => e.pid));
  ms.justRevealed = true;
  render();               // вскрытие (flip)
  ms.justRevealed = false;
  sfx('pick', 0.4);
  await sleep(1000);      // паузы судьи как в stateJudge

  for (const ev of res.events) {   // паверы — до боя (doPowPre/PostJudge)
    await showEvent(ev);
  }

  // как в оригинале: проигравшая карта взрывается пуфом (Card.destroy),
  // победная сжимается в элемент и улетает в банк (arrangeWinCards) —
  // и только после этого начинается бой ниндзя
  await resolveCardsVisual(res);

  // фаза боя ниндзя: сидящие сменяются атакой без «дырки» —
  // ambient убирается только когда слои атаки уже вставлены
  const stage = document.getElementById('battle-layers');
  if (res.winner !== -1) {
    const winPl = res.winner === 0 ? res.a : res.b;
    const winnerIsMe = res.winner === ms.mySeat;
    const isPow = winPl.card.powerId > 0;
    if (stage) {
      let played = false;
      if (isPow) {
        const meta = (POW_ANIM || {})[String(winPl.card.id)];
        if (meta) played = await playPowSwf(stage, winPl.card.id, winnerIsMe, meta.frames);
      }
      if (!played) {
        const elem = winPl.element;
        if (!vecReady()) attackSfx(elem);
        const frames = { f: 118, s: 100, w: 91 }[elem];
        const dur = Math.round(frames / FPS * 1000);
        const A = playAnim(stage, elem + '_attack', frames,
          Object.assign({ flip: winnerIsMe }, sideOpts(winnerIsMe)));
        const R = playAnim(stage, elem + '_react', frames,
          Object.assign({ flip: !winnerIsMe }, sideOpts(!winnerIsMe)));
        await withTimeout(Promise.all([A.ready, R.ready]), 4000);
        await sleep(150);
        hideAmbient();
        sleep(Math.max(0, dur - 450)).then(() => showAmbient());
        await Promise.all([A.done, R.done]);
      }
    }
  } else {
    if (!vecReady()) sfx('tie');
    const ambL2 = document.getElementById('ambient-layers');
    if (ambL2) {
      // tie в оригинале не свапался наверх — идёт под картами
      const dur = Math.round(45 / FPS * 1000);
      const A = playAnim(ambL2, 'tie', 45, Object.assign({ flip: true }, sideOpts(true)));
      const B = playAnim(ambL2, 'tie', 45, sideOpts(false));
      await withTimeout(Promise.all([A.ready, B.ready]), 4000);
      await sleep(150);
      hideAmbient();
      await sleep(Math.max(0, dur - 190));
      showAmbient();            // тем же тиком: сидящие видны, tie снят
      A.layer.remove();
      B.layer.remove();
    }
  }
  ms.fighting = false;
  showAmbient();
  render();
  await sleep(500);

  if (res.matchEnd) { finishMatch(res.matchEnd); return; }
  ms.lastRes = null;
  newRound();
}

/* разбор карт судьи: пуф проигравшей, перелёт победной в банк */
async function resolveCardsVisual(res) {
  const ms = S.match;
  const fx = document.getElementById('fxlayer');
  const dyn = document.querySelector('.stage .dyn');
  const el0 = document.querySelector('.stage .card[data-role="pick0"]');
  const el1 = document.querySelector('.stage .card[data-role="pick1"]');
  const center = side => ({
    x: L.PICKS[side].x + L.CARD_W * L.SCALE_FLIP / 2,
    y: L.PICKS[side].y + 265 * L.SCALE_FLIP / 2
  });
  const poof = (el, side) => {
    sfx('poof', 0.55);
    const c = center(side);
    if (fx) {
      const b = h('div', 'fx-boom big');
      b.style.left = c.x + 'px';
      b.style.top = c.y + 'px';
      fx.append(b);
      setTimeout(() => b.remove(), 700);
    }
    if (el) setTimeout(() => el.remove(), 220);
  };
  if (res.winner === -1) {
    poof(el0, 0);
    poof(el1, 1);
    ms.picksResolved = true;
    await sleep(700);
    return;
  }
  const winnerSide = res.winner === ms.mySeat ? 0 : 1;
  poof(winnerSide === 0 ? el1 : el0, 1 - winnerSide);
  // победная карта -> элемент банка, tween 0.5s в слот стопки
  const wc = res.winner === 0 ? res.a : res.b;
  const bankArr = ms.m.ninjas[res.winner].bank[wc.card.element];
  const idx = Math.max(0, bankArr.length - 1);
  const base = L.WINS[winnerSide][wc.card.element];
  const winCardEl = winnerSide === 0 ? el0 : el1;
  if (winCardEl) winCardEl.remove();
  if (dyn) {
    const flyer = winEl(wc, L.PICKS[winnerSide].x, L.PICKS[winnerSide].y, 25);
    dyn.append(flyer);
    requestAnimationFrame(() => {
      flyer.style.transition = 'transform .5s ease';
      flyer.style.setProperty('--x', base.x);
      flyer.style.setProperty('--y', base.y + idx * L.WIN_SPACER);
    });
    ms.picksResolved = true;
    await sleep(700);
    flyer.remove();
  } else {
    ms.picksResolved = true;
    await sleep(700);
  }
  ms.bankDelivered = true;
  render();
}

/* показ эффекта: иконка спрайта power у карты, перелёт в top-слот
   (PowerController: POS_POWER_PICK -> POS_POWER_TOP) */
function powIcon(pid, x, y) {
  const el = h('div', 'powtop');
  el.style.backgroundPosition = `${(pid - 1) * 100 / 17}% 0`;
  el.style.setProperty('--x', x);
  el.style.setProperty('--y', y);
  return el;
}
function topSlot(side) {
  const ms = S.match;
  const idx = ms.topCount ? (ms.topCount[side] || 0) : 0;
  if (!ms.topCount) ms.topCount = [0, 0];
  return { x: L.POWER_TOP[side].x, y: L.POWER_TOP[side].y + idx * L.POWER_SPACER };
}
function boomEl(x, y) {
  const el = h('div', 'fx-boom');
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  return el;
}
async function showEvent(ev) {
  const ms = S.match;
  const fx = document.getElementById('fxlayer');
  if (!fx) return;
  const mySide = seat => seat === ms.mySeat ? 0 : 1;
  if (ev.t === 'banked') return;
  if (ev.t === 'discard') {
    // взрыв-облако на стопке банка (карта уже снята движком)
    const side = mySide(ev.seat);
    const base = L.WINS[side][ev.element];
    const idx = ms.m.ninjas[ev.seat].bank[ev.element].length;
    fx.append(boomEl(base.x, base.y + idx * L.WIN_SPACER));
    await sleep(700);
    return;
  }
  let pid = ev.pid;
  if (ev.t === 'swap') pid = 1;
  if (ev.t === 'plus2') pid = 2;
  if (ev.t === 'minus2') pid = 3;
  if (ev.t === 'morph') pid = { 'w>f': 16, 's>w': 17, 'f>s': 18 }[ev.from + '>' + ev.to] || 16;
  if (!pid) return;
  const side = ev.seat !== undefined ? mySide(ev.seat) : 0;
  const from = L.POWER_PICK[side];
  const icon = powIcon(pid, from.x, from.y);
  icon.style.transition = 'none';
  fx.append(icon);
  sfx('pick', 0.35);
  await sleep(600);
  if (ev.t === 'armed') {
    // отложенный павер уезжает в top-слот
    const slot = topSlot(side);
    icon.style.transition = '';
    icon.style.setProperty('--x', slot.x);
    icon.style.setProperty('--y', slot.y);
    await sleep(700);
    // постоянная копия появляется тем же кадром, что снимаем перелёт
    if (ms.armedPending) ms.armedPending.delete(ev.pid);
    render();
    icon.remove();
  } else {
    icon.style.transition = 'opacity .4s ease';
    icon.style.opacity = '0';
    await sleep(400);
    icon.remove();
  }
}

async function celebrateWin(end) {
  const ms = S.match;
  if (!end || !end.cards) return;
  const side = end.winner === ms.mySeat ? 0 : 1;
  const dyn = document.querySelector('.stage .dyn');
  if (dyn) {
    end.cards.forEach((pl, i) => {
      const el = dyn.querySelector(`.winsq[data-pid="${pl.id}"]`);
      const pos = L.WINS_OVER[side][i];
      if (el && pos) {
        el.style.transition = 'transform .5s ease';
        el.style.zIndex = 30;
        el.style.setProperty('--x', pos.x);
        el.style.setProperty('--y', pos.y);
      }
    });
  }
  ms.winShow = { ids: end.cards.map(c => c.id), side };
  await sleep(900);
}

async function finishMatch(end) {
  const ms = S.match;
  stopTurnClock();
  await celebrateWin(end);
  if (S.match !== ms) return;
  ms.over = end;
  const save = S.save;
  const iWon = end.winner === ms.mySeat;
  const res = { coins: 0, gained: 0, rankUps: 0, mask: false, oldRank: save.rank };

  if (ms.vsSensei) {
    if (iWon) {
      save.senseiWins++;
      res.mask = senseiWinRankUp(save) && save.rank === 10;
      res.coins = CONFIG.COINS_SENSEI_WIN;
    } else {
      const p = applyProgress(save, false);
      res.gained = p.gained; res.rankUps = p.rankUps;
    }
  } else {
    const p = applyProgress(save, iWon);
    res.gained = p.gained; res.rankUps = p.rankUps;
    res.coins = iWon ? CONFIG.COINS_WIN : CONFIG.COINS_LOSS;
  }
  if (iWon) save.wins++; else save.losses++;
  save.coins += res.coins;
  storeSave(save);
  sfx('end');
  // родного экрана результатов в игре нет — как и в оригинале,
  // после showWinCards матч закрывается и игрок возвращается в додзё
  await sleep(1400);
  if (S.match !== ms) return;
  S.match = null;
  S.matchDom = null;
  S.screen = 'home';
  render();
}

/* позиция карты: верхний-левый угол (как origin спрайта card) */
function placeCard(el, x, y, scale) {
  el.style.setProperty('--x', x);
  el.style.setProperty('--y', y);
  el.style.setProperty('--cw', (L.CARD_W * scale) + 'px');
  return el;
}

/* сцена матча создаётся один раз; динамика перерисовывается в .dyn */
function buildMatchScene() {
  const root = h('div', 'screen match');
  const wrap = h('div', 'mwrap');
  const stage = h('div', 'stage');
  wrap.append(stage);
  root.append(wrap);

  // как в клиенте: ambient/walk/tie живут ПОД картами,
  // наверх свапаются только стихийные атаки и pow-анимации
  const amb = h('div', '', '');
  amb.id = 'ambient-layers';
  amb.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;';
  stage.append(amb);
  const battle = h('div', '', '');
  battle.id = 'battle-layers';
  battle.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:30;';
  stage.append(battle);

  const dyn = h('div', 'dyn');
  dyn.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
  stage.append(dyn);

  const clock = h('div', 'clockbox');
  clock.append(h('div', 'cface'), h('div', 'cnum', ''));
  clock.style.display = 'none';
  stage.append(clock);

  const fx = h('div', '');
  fx.id = 'fxlayer';
  fx.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:40;';
  stage.append(fx);

  const help = h('button', 'hotspot hs-help');
  help.onclick = showHelp;
  const quit = h('button', 'hotspot hs-quit');
  quit.onclick = () => modal('<p>Выйти из матча? Прогресс матча не сохранится.</p>',
    [['Выйти', () => { stopTurnClock(); S.match = null; S.matchDom = null; S.screen = 'home'; render(); }], ['Остаться', null]]);
  stage.append(help, quit);

  S.matchDom = { root, stage, dyn };
  return root;
}

function updateMatchView() {
  const ms = S.match;
  const dom = S.matchDom;
  if (!ms || !dom) return;
  const m = ms.m;
  const me = m.ninjas[ms.mySeat], opp = m.ninjas[ms.oppSeat];
  const dyn = dom.dyn;
  dyn.innerHTML = '';

  // банки выигранных: элементы-thumbnail стопкой (arrangeWinCards);
  // свежая карта скрыта, пока её перелёт в банк не отыгран
  let hideBanked = null;
  if (ms.lastRes && !ms.bankDelivered && ms.lastRes.winner !== -1) {
    const wc = ms.lastRes.winner === 0 ? ms.lastRes.a : ms.lastRes.b;
    const bankArr = m.ninjas[ms.lastRes.winner].bank[wc.card.element];
    if (bankArr.length && bankArr[bankArr.length - 1] === wc)
      hideBanked = wc;
  }
  for (const seatSide of [[me, 0], [opp, 1]]) {
    const [ninja, side] = seatSide;
    for (const el of ['f', 'w', 's']) {
      const base = L.WINS[side][el];
      ninja.bank[el].forEach((pl, i) => {
        if (pl === hideBanked) return;
        if (ms.winShow && ms.winShow.ids.includes(pl.id)) {
          const k = ms.winShow.ids.indexOf(pl.id);
          const pos = L.WINS_OVER[ms.winShow.side][k];
          dyn.append(winEl(pl, pos.x, pos.y, 30));
          return;
        }
        dyn.append(winEl(pl, base.x, base.y + i * L.WIN_SPACER, 20 - i));
      });
    }
  }

  // взведённые паверы: голые иконки в POS_POWER_TOP
  // (свежевзведённый скрыт, пока showEvent не отыграл его перелёт)
  const powsBySide = [[], []];
  for (const pid of Object.keys(m.powers)) {
    const pl = m.powers[pid];
    if (ms.armedPending && ms.armedPending.has(Number(pid))) continue;
    powsBySide[pl.player === ms.mySeat ? 0 : 1].push(pl);
  }
  ms.topCount = [powsBySide[0].length, powsBySide[1].length];
  powsBySide.forEach((list, side) => {
    list.forEach((pl, i) => {
      const ic = powIcon(pl.card.powerId,
        L.POWER_TOP[side].x, L.POWER_TOP[side].y + i * L.POWER_SPACER);
      ic.style.transition = 'none';
      ic.title = POWER_TEXT[pl.card.powerId];
      dyn.append(ic);
    });
  });

  // выбранные карты (после разбора судьи их снимает resolveCardsVisual)
  const r = ms.lastRes;
  if (!ms.picksResolved) {
    const myPl = r ? (ms.mySeat === 0 ? r.a : r.b) : me.chosen;
    const opPl = r ? (ms.mySeat === 0 ? r.b : r.a) : opp.chosen;
    if (myPl) {
      const el = placeCard(
        cardEl(myPl.card, { value: myPl.value, element: myPl.element, cloud: true }),
        L.PICKS[0].x, L.PICKS[0].y, L.SCALE_FLIP);
      el.dataset.role = 'pick0';
      dyn.append(el);
    }
    if (r && opPl) {
      const el = placeCard(
        cardEl(opPl.card, { value: opPl.value, element: opPl.element, cloud: true }),
        L.PICKS[1].x, L.PICKS[1].y, L.SCALE_FLIP);
      el.dataset.role = 'pick1';
      if (ms.justRevealed) el.classList.add('flipin');
      dyn.append(el);
    } else if (opp.chosen || (ms.vsSensei && me.chosen)) {
      dyn.append(placeCard(cardEl({}, { faceDown: true }),
        L.PICKS[1].x, L.PICKS[1].y, L.SCALE_FLIP));
    }
  }

  // моя рука и рубашки соперника (tweenToDealtSlots)
  const blocked = m.blockedElement(ms.mySeat);
  const dealNew = (el, tx, ty, idx, wasCount) => {
    if (ms.dealAnim && idx >= wasCount) {
      el.dataset.tx = tx;
      el.dataset.ty = ty;
      el.style.setProperty('--x', L.OFFSCREEN.x);
      el.style.setProperty('--y', L.OFFSCREEN.y);
    }
  };
  let i = 0;
  for (const pl of me.deck.values()) {
    const isBlocked = blocked && pl.card.element === blocked;
    const el = cardEl(pl.card, { dim: isBlocked, cloud: true });
    el.dataset.pid = pl.id;
    const tx = L.DEALTS[0].x + i * L.FRONT_SPACER, ty = L.DEALTS[0].y;
    placeCard(el, tx, ty, L.SCALE_NORMAL);
    dealNew(el, tx, ty, i, (ms.dealtBefore || [5, 5])[0]);
    if (isBlocked) el.append(h('div', 'blockmark', '🚫'));
    else if (!ms.busy) {
      el.classList.add('pickable');
      el.onclick = () => playCard(pl.id);
    }
    if (pl.card.powerId) {
      const bub = h('div', 'powbubble');
      const ic = h('div', 'pbicon');
      ic.style.backgroundPosition = `${(pl.card.powerId - 1) * 100 / 17}% 0`;
      bub.append(ic, h('div', 'pbtext', POWER_TEXT[pl.card.powerId]));
      el.append(bub);
    }
    dyn.append(el);
    i++;
  }
  let j = 0;
  for (const pl of opp.deck.values()) {
    if (opp.chosen && pl.id === opp.chosen.id) continue;
    const el = cardEl({}, { faceDown: true });
    const tx = L.DEALTS[1].x - L.BACK_SPACER - j * L.BACK_SPACER, ty = L.DEALTS[1].y;
    placeCard(el, tx, ty, L.SCALE_BACK);
    dealNew(el, tx, ty, j, (ms.dealtBefore || [5, 5])[1]);
    dyn.append(el);
    j++;
  }

}

function renderMatch() {
  if (!S.matchDom) buildMatchScene();
  updateMatchView();
  fitStageSoon();
  return S.matchDom.root;
}

/* табличка правил: оригинальная анимация спрайта 113 card.swf */
function helpImg(name, holder) {
  return Promise.all([webpBlobUrl(name), loadAnimMeta()]).then(([u]) => {
    const m = (ANIM_META || {})[name];
    const img = document.createElement('img');
    img.src = u;
    if (m) img.style.cssText =
      `position:absolute;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;`;
    holder.innerHTML = '';
    holder.append(img);
    return (m ? m.frames : 20) / FPS * 1000;
  });
}
function showHelp() {
  const stage = document.querySelector('.stage');
  if (!stage) return;
  const old = stage.querySelector('.helpboard');
  if (old) {
    if (old.dataset.closing) return;
    old.dataset.closing = '1';
    helpImg('help_close', old).then(ms2 =>
      setTimeout(() => old.remove(), ms2));
    return;
  }
  const holder = h('div', 'helpboard');
  holder.style.cssText = 'position:absolute;inset:0;z-index:50;cursor:pointer;';
  holder.onclick = () => showHelp();
  stage.append(holder);
  helpImg('help_open', holder);
}

function fitStage() {
  const wrap = document.querySelector('.mwrap');
  if (!wrap) return;
  const host = wrap.parentElement;
  const w = host ? host.clientWidth : window.innerWidth;
  const hgt = host ? host.clientHeight : window.innerHeight;
  const k = Math.min(w / 760, hgt / 480);
  wrap.style.transform = `translate(-50%, -50%) scale(${k})`;
}
function fitStageSoon() {
  fitStage();
  requestAnimationFrame(fitStage);
  setTimeout(fitStage, 120);
  setTimeout(fitStage, 600);
}
window.addEventListener('resize', fitStageSoon);
if (window.visualViewport)
  window.visualViewport.addEventListener('resize', fitStageSoon);

/* индикатор готовности офлайна: сколько файлов уже в кэше SW */
async function offlineStatus(el) {
  try {
    if (!('caches' in window) || !navigator.serviceWorker) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      // SW ещё регистрируется (или это http-адрес — тогда молча выходим)
      if (location.protocol === 'https:' || location.hostname === 'localhost')
        setTimeout(() => { if (el.isConnected) offlineStatus(el); }, 3000);
      return;
    }
    const files = await fetch('assets/filelist.json').then(r => r.json());
    const need = files.length + 10;
    const tick = async () => {
      if (!el.isConnected) return;
      const keys = await caches.keys();
      const key = keys.filter(k => k.startsWith('cj-')).sort().pop();
      let n = 0;
      if (key) n = (await (await caches.open(key)).keys()).length;
      if (n >= need) { el.textContent = '✓ офлайн готов'; return; }
      el.textContent = '⬇ офлайн: ' + Math.min(99, Math.round(n / need * 100)) + '%';
      setTimeout(tick, 4000);
    };
    tick();
  } catch (e) {}
}

/* ---------- главный экран: сцена Сэнсэя + разделы (стиль CP) ---------- */
const SENSEI_HAIKU = [
  'Огонь, вода, снег.\nСтихии ходят по кругу.\nНачнём же урок.',
  'Смотри на руку.\nСильной карте — свой черёд.\nТерпение, друг.',
  'Пояс — не цель, путь.\nПроигрыш тоже учит.\nСыграем ещё?'
];
function renderHome() {
  const root = h('div', 'screen match home');
  const wrap = h('div', 'mwrap');
  const stage = h('div', 'stage sensei-stage');
  wrap.append(stage);
  root.append(wrap);

  // пузырь Сэнсэя
  const bubble = h('div', 'sensei-bubble');
  if (S.homeMode === 'sensei-warn') {
    bubble.textContent =
      'До чёрного пояса я непобедим —\nна каждую карту отвечаю бьющей.\nНо и поражение — урок.';
  } else {
    bubble.textContent = SENSEI_HAIKU[Math.floor(Math.random() * SENSEI_HAIKU.length)];
  }
  stage.append(bubble);

  // раздел прогресса (пояс + шкала)
  const save = S.save;
  const prog = h('div', 'home-progress');
  prog.append(h('div', 'bp-name',
    save.rank === 10 ? '🥷 ' + BELT_NAMES[10] : BELT_NAMES[save.rank]));
  const strip = h('div', 'belt-strip');
  strip.style.background = BELT_COLORS[save.rank];
  const knot = h('div', 'belt-knot');
  let pct = 100, line;
  if (save.rank < 9) {
    const cur = save.progress - thresholdForRank(save.rank);
    pct = Math.max(0, Math.min(100, Math.round(cur / expToNext(save.rank) * 100)));
    line = `До следующего пояса: ${cur} / ${expToNext(save.rank)}`;
  } else if (save.rank === 9) {
    line = 'Победи Сэнсэя — получишь маску ниндзя';
  } else {
    line = 'Путь пройден';
  }
  knot.style.left = `calc(${pct}% - 7px)`;
  strip.append(knot);
  prog.append(strip);
  prog.append(h('div', 'bp-line',
    `${line}<br>Побед: ${save.wins} · Поражений: ${save.losses}`));
  stage.append(prog);

  // монеты справа сверху
  const coins = h('div', 'home-coins');
  coins.append(h('span', 'coin'), document.createTextNode(String(save.coins)));
  stage.append(coins);

  // деревянная доска-меню
  const menu = h('div', 'sensei-menu');
  const mkItem = (label, fn) => {
    const it = h('div', 'sensei-item', label);
    it.onclick = fn;
    menu.append(it);
  };
  if (S.homeMode === 'sensei-warn') {
    mkItem('Сразиться с Сэнсэем', () => { S.homeMode = ''; startMatch(true); });
    mkItem('Назад', () => { S.homeMode = ''; render(); });
  } else {
    mkItem('В бой', () => startMatch(false));
    mkItem('Сэнсэй', () => {
      if (S.save.rank >= 9) startMatch(true);
      else { S.homeMode = 'sensei-warn'; render(); }
    });
    mkItem('Магазин', () => { S.screen = 'shop'; render(); });
    mkItem('Коллекция', () => { S.screen = 'collection'; render(); });
  }
  stage.append(menu);

  // экспорт/импорт/сброс
  const foot = h('div', 'home-foot');
  const ex = h('a', '', 'Экспорт'); ex.onclick = exportSave;
  const im = h('a', '', 'Импорт'); im.onclick = importSave;
  const rs = h('a', '', 'Сброс'); rs.onclick = resetSave;
  const ver = h('span', '', BUILD);
  ver.style.cssText = 'opacity:.4;';
  const off = h('span', '', '');
  off.style.cssText = 'opacity:.5;';
  foot.append(ex, im, rs, ver, off);
  offlineStatus(off);
  stage.append(foot);

  fitStageSoon();
  return root;
}

/* ---------- магазин ---------- */
function renderShop() {
  const root = h('div', 'screen shop');
  root.append(header('Магазин', `🪙 ${S.save.coins}`));
  const pack = h('div', 'pack-panel');
  const packArt = cardEl({}, { faceDown: true });
  packArt.style.setProperty('--cw', '13dvh');
  pack.append(packArt);
  pack.append(h('div', 'pack-info',
    `<b>Пак карт</b><br>${CONFIG.PACK_SIZE} случайных карт, минимум ${CONFIG.PACK_MIN_POWER} power-карта.<br>Как код из реального набора ККИ.`));
  const buy = h('button', 'btn primary', `Купить · 🪙 ${CONFIG.PACK_PRICE}`);
  if (S.save.coins < CONFIG.PACK_PRICE) buy.disabled = true;
  buy.onclick = () => {
    if (S.save.coins < CONFIG.PACK_PRICE) return;
    S.save.coins -= CONFIG.PACK_PRICE;
    const got = openPack();
    for (const cid of got) S.save.cards[cid] = (S.save.cards[cid] || 0) + 1;
    storeSave(S.save);
    sfx('pack');
    const wrap = h('div', 'pack-open');
    for (const cid of got) wrap.append(cardEl(cardInfo(cid), { small: true }));
    modal('<h3>Твои карты</h3>', [['Ок', null]], wrap);
    render();
  };
  pack.append(buy);
  root.append(pack);
  return root;
}

/* ---------- коллекция ---------- */
let collFilter = 'all';
function renderCollection() {
  const root = h('div', 'screen collection');
  const owned = Object.keys(S.save.cards).filter(c => S.save.cards[c] > 0).length;
  root.append(header('Коллекция', `${owned} / ${ALL_IDS.length}`));
  const filters = h('div', 'filters');
  const defs = [['all', 'Все'], ['f', '🔥'], ['w', '💧'], ['s', '❄️'], ['pow', '★'], ['own', 'Мои']];
  for (const [key, label] of defs) {
    const b = h('button', 'fbtn' + (collFilter === key ? ' on' : ''), label);
    b.onclick = () => { collFilter = key; render(); };
    filters.append(b);
  }
  root.append(filters);
  const grid = h('div', 'grid');
  for (const cid of ALL_IDS) {
    const c = cardInfo(cid);
    if (collFilter === 'f' && c.element !== 'f') continue;
    if (collFilter === 'w' && c.element !== 'w') continue;
    if (collFilter === 's' && c.element !== 's') continue;
    if (collFilter === 'pow' && !c.powerId) continue;
    const qty = S.save.cards[cid] || 0;
    if (collFilter === 'own' && !qty) continue;
    const el = cardEl(c, { small: true, dim: !qty, qty });
    if (c.powerId) el.title = POWER_TEXT[c.powerId];
    el.onclick = () => modal(
      `<h3>${c.name}</h3><p>${EL_ICON[c.element]} ${EL_NAME[c.element]} · ${c.value} · серия ${c.setId}` +
      (c.powerId ? `<br>★ ${POWER_TEXT[c.powerId]}` : '') +
      (qty ? `<br>В коллекции: ×${qty}` : '<br>Нет в коллекции') + '</p>',
      [['Ок', null]]);
    grid.append(el);
  }
  root.append(grid);
  return root;
}

/* ---------- общее ---------- */
function header(title, right) {
  const head = h('div', 'header');
  const back = h('button', 'btn back', '←');
  back.onclick = () => { S.screen = 'home'; render(); };
  head.append(back, h('div', 'htitle', title), h('div', 'hright', right || ''));
  return head;
}

function modal(html, buttons, extraNode) {
  const ov = h('div', 'overlay');
  const box = h('div', 'obox');
  box.append(h('div', '', html));
  if (extraNode) box.append(extraNode);
  const row = h('div', 'obtns');
  for (const [label, fn] of buttons) {
    const b = h('button', 'btn' + (fn ? ' primary' : ''), label);
    b.onclick = () => { ov.remove(); if (fn) fn(); };
    row.append(b);
  }
  box.append(row);
  ov.append(box);
  document.body.append(ov);
}

function exportSave() {
  const ta = h('textarea', 'savebox');
  ta.value = JSON.stringify(S.save);
  ta.onclick = () => ta.select();
  modal('<h3>Экспорт сейва</h3><p>Скопируй и сохрани где-нибудь.</p>', [['Готово', null]], ta);
}
function importSave() {
  const ta = h('textarea', 'savebox');
  ta.placeholder = 'Вставь JSON сейва';
  modal('<h3>Импорт сейва</h3>', [
    ['Загрузить', () => {
      try {
        const data = JSON.parse(ta.value);
        S.save = Object.assign(newSave(), data);
        storeSave(S.save);
        render();
      } catch (e) { modal('<p>Не удалось прочитать сейв.</p>', [['Ок', null]]); }
    }], ['Отмена', null]], ta);
}
function resetSave() {
  modal('<p>Точно сбросить весь прогресс?</p>', [
    ['Сбросить', () => { S.save = newSave(); storeSave(S.save); render(); }],
    ['Отмена', null]]);
}

function render() {
  const app = $app();
  if (S.screen === 'match' && S.match) {
    if (S.matchDom && app.contains(S.matchDom.root)) {
      updateMatchView();
      return;
    }
    app.innerHTML = '';
    app.append(renderMatch());
    return;
  }
  S.matchDom = null;
  stopMusic();
  app.innerHTML = '';
  if (S.screen === 'shop') app.append(renderShop());
  else if (S.screen === 'collection') app.append(renderCollection());
  else app.append(renderHome());
}

document.addEventListener('DOMContentLoaded', () => {
  render();
  if (location.hash === '#test-match') startMatch(false);
  if (location.hash === '#test-sensei') startMatch(true);
  if (location.hash === '#test-battle') {
    startMatch(false);
    setTimeout(() => {
      const ms = S.match;
      if (!ms || ms.busy) return;
      const opts = [...ms.m.ninjas[ms.mySeat].deck.values()];
      if (opts.length) playCard(opts[0].id);
    }, 7000);
  }
  const m = location.hash.match(/^#test-anim=(\w+)$/);
  if (m) {
    startMatch(false);
    setTimeout(() => {
      const stage = document.getElementById('battle-layers');
      hideAmbient();
      if (m[1].startsWith('pow')) {
        loadPowMeta().then(() =>
          playPowSwf(stage, m[1].replace('pow_', ''), true, 300));
      } else {
        playAnim(stage, m[1], 300, { flip: true });
        playAnim(stage, m[1].replace('_attack', '_react'), 300, {});
      }
    }, 7000);
  }
});
