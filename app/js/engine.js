/* ============================================================
   Card-Jitsu — движок. Боевая логика перенесена 1-в-1 из
   solero/houdini (MIT), houdini/handlers/games/ninja/card.py:
   правила стихий, все 18 эффектов power-карт и их тайминги,
   банк выигранных карт, две победные комбинации, блокировка
   стихии (полностью заблокированная рука = поражение),
   читерство Сэнсэя до чёрного пояса, формула прокачки поясов.
   Наши добавки помечены комментарием [ДОБАВКА].
   ============================================================ */

let DB, STARTER;
if (typeof module !== 'undefined' && typeof CARDS === 'undefined') {
  const m = require('./cards.js'); DB = m.CARDS; STARTER = m.STARTER_DECK;
} else { DB = CARDS; STARTER = STARTER_DECK; }

/* [ДОБАВКА] Экономика — монеты и паки не существовали в онлайне,
   это перенос кодов из реального ККИ (код давал 5 карт, минимум
   одна power-карта). Цифры настраиваются здесь. */
const CONFIG = {
  COINS_WIN: 30,
  COINS_LOSS: 5,
  COINS_SENSEI_WIN: 100,
  PACK_PRICE: 500,
  PACK_SIZE: 5,
  PACK_MIN_POWER: 1
};

/* ---- Константы боя (houdini, дословно) ---- */
const RULES = { f: 's', w: 'f', s: 'w' };            // огонь>снег, вода>огонь, снег>вода
const DISCARD_ELEMENTS = { 4: 's', 5: 'w', 6: 'f' };
const DISCARD_COLORS = { 7: 'r', 8: 'b', 9: 'g', 10: 'y', 11: 'o', 12: 'p' };
const REPLACEMENTS = { 16: ['w', 'f'], 17: ['s', 'w'], 18: ['f', 's'] };
const POWER_LIMITERS = { 13: 's', 14: 'f', 15: 'w' };
const ON_PLAYED = new Set([1, 16, 17, 18]);
const CURRENT_ROUND = new Set([4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 18]);
const AFFECTS_OWN = new Set([2]);
const ELEMENTS = ['f', 'w', 's'];
const ALL_IDS = Object.keys(DB).map(Number);
const POWER_IDS_ALL = ALL_IDS.filter(c => DB[c][3] > 0);

function cardInfo(cid) {
  const c = DB[cid];
  return { id: cid, element: c[0], color: c[1], value: c[2], powerId: c[3], setId: c[4], name: c[5] };
}

/* ---- Матч ---- */
class Match {
  constructor() {
    this.ninjas = [Match._ninja(), Match._ninja()];
    this.playedId = 1;
    this.powers = {};    // powerId -> Played (эффекты, действующие на следующий раунд)
    this.discards = [];
  }
  static _ninja() { return { deck: new Map(), bank: { f: [], w: [], s: [] }, chosen: null }; }

  makePlayed(cid, seat) {
    const c = cardInfo(cid);
    return {
      id: this.playedId++, card: c, player: seat, opponent: (seat + 1) % 2,
      value: c.value, element: c.element
    };
  }

  /* Раздача как в оригинале: мультимножество всей коллекции минус
     карты, уже находящиеся в руке; случайная добивка до 5. */
  deal(seat, poolCounter) {
    const me = this.ninjas[seat];
    const need = 5 - me.deck.size;
    const out = [];
    if (need <= 0) return out;
    const inHand = {};
    for (const pl of me.deck.values()) inHand[pl.card.id] = (inHand[pl.card.id] || 0) + 1;
    const bag = [];
    for (const [cid, qty] of poolCounter) {
      const q = qty - (inHand[cid] || 0);
      for (let i = 0; i < q; i++) bag.push(cid);
    }
    for (let i = 0; i < need; i++) {
      let cid;
      if (bag.length) cid = bag.splice(Math.floor(Math.random() * bag.length), 1)[0];
      else { // страховка для крошечных коллекций
        const keys = [...poolCounter.keys()];
        cid = keys[Math.floor(Math.random() * keys.length)];
      }
      const pl = this.makePlayed(cid, seat);
      me.deck.set(pl.id, pl);
      out.push(pl);
    }
    return out;
  }

  pick(seat, playedId) {
    const me = this.ninjas[seat];
    if (!me.deck.has(playedId) || me.chosen !== null) return false;
    me.chosen = me.deck.get(playedId);
    me.deck.delete(playedId);
    return true;
  }

  blockedElement(seat) {
    for (const pid of [13, 14, 15])
      if (this.powers[pid] && this.powers[pid].opponent === seat) return POWER_LIMITERS[pid];
    return null;
  }

  hasCardsToPlay(seat) {
    for (const pidStr of Object.keys(POWER_LIMITERS)) {
      const pid = +pidStr;
      if (pid in this.powers) {
        const pc = this.powers[pid];
        if (pc.opponent === seat) {
          for (const c of this.ninjas[seat].deck.values())
            if (c.card.element !== POWER_LIMITERS[pid]) return true;
          return false;
        }
      }
    }
    return true;
  }

  adjustCardValues(a, b, ev) {
    for (const pid of Object.keys(this.powers)) {
      const pc = this.powers[pid];
      const powerId = pc.card.powerId;
      if (powerId === 1 && a.element === b.element) {
        const t = a.value; a.value = b.value; b.value = t;
        ev.push({ t: 'swap' });
      }
      if (powerId === 2) {
        if (pc.player === 0) a.value += 2; else b.value += 2;
        ev.push({ t: 'plus2', seat: pc.player });
      }
      if (powerId === 3) {
        if (pc.player === 0) b.value -= 2; else a.value -= 2;
        ev.push({ t: 'minus2', seat: pc.opponent });
      }
    }
  }

  replaceCards(pid, a, b, ev) {
    const [orig, repl] = REPLACEMENTS[pid];
    if (a.element === orig) { a.element = repl; ev.push({ t: 'morph', seat: 0, from: orig, to: repl }); }
    if (b.element === orig) { b.element = repl; ev.push({ t: 'morph', seat: 1, from: orig, to: repl }); }
  }

  onPlayedEffects(a, b, ev) {
    for (let seat = 0; seat < 2; seat++) {
      const played = this.ninjas[seat].chosen;
      const pid = played.card.powerId;
      if (!pid || !ON_PLAYED.has(pid)) continue;
      const cur = CURRENT_ROUND.has(pid);
      if (!cur) { this.powers[pid] = played; ev.push({ t: 'armed', pid, seat }); }
      else this.replaceCards(pid, a, b, ev);
    }
  }

  onScoredEffects(a, b, ev) {
    const winner = Match.winnerSeat(a, b);
    for (let seat = 0; seat < 2; seat++) {
      const pid = this.ninjas[seat].chosen.card.powerId;
      if (!pid || ON_PLAYED.has(pid)) continue;
      if (seat !== winner) continue;
      const opp = (seat + 1) % 2;
      const cur = CURRENT_ROUND.has(pid);
      if (!cur) { this.powers[pid] = this.ninjas[seat].chosen; ev.push({ t: 'armed', pid, seat }); }
      else this.discardOpponentCard(pid, opp, ev);
    }
  }

  discardOpponentCard(pid, oppSeat, ev) {
    const bank = this.ninjas[oppSeat].bank;
    if (pid in DISCARD_ELEMENTS) {
      const el = DISCARD_ELEMENTS[pid];
      if (bank[el].length) {
        const c = bank[el][bank[el].length - 1];
        this.discards.push(c.id);
        bank[el].pop();
        ev.push({ t: 'discard', seat: oppSeat, element: el, cardId: c.card.id });
        return true;
      }
    }
    if (pid in DISCARD_COLORS) {
      const col = DISCARD_COLORS[pid];
      for (const el of ELEMENTS) {
        for (let i = 0; i < bank[el].length; i++) {
          if (bank[el][i].card.color === col) {
            const c = bank[el][i];
            this.discards.push(c.id);
            bank[el].splice(i, 1);
            ev.push({ t: 'discard', seat: oppSeat, element: el, cardId: c.card.id });
            return true;
          }
        }
      }
    }
    return false;
  }

  /* Полное разрешение раунда — порядок шагов ровно как в
     get_round_winner + обработчике пика houdini. */
  resolveRound() {
    const a = this.ninjas[0].chosen, b = this.ninjas[1].chosen;
    this.discards = [];
    const ev = [];
    a.orig = { value: a.value, element: a.element };
    b.orig = { value: b.value, element: b.element };

    this.adjustCardValues(a, b, ev);   // эффекты 1/2/3, взведённые в прошлом раунде
    this.powers = {};
    this.onPlayedEffects(a, b, ev);    // 16/17/18 сейчас; 1 — на следующий раунд
    this.onScoredEffects(a, b, ev);    // победитель: 4..12 сейчас; 2/3/13..15 — на следующий
    const winner = Match.winnerSeat(a, b);

    let matchEnd = null;
    if (winner !== -1) {
      const w = this.ninjas[winner];
      const wc = winner === 0 ? a : b;
      // в банк карта ложится по исходной стихии карты (как в оригинале)
      w.bank[wc.card.element].push(wc);
      ev.push({ t: 'banked', seat: winner, element: wc.card.element, cardId: wc.card.id });
      const [cards, method] = this.getWinningCards(winner);
      if (cards) matchEnd = { winner, method, cards };
    }
    if (!matchEnd) {
      for (let s = 0; s < 2; s++) {
        if (!this.hasCardsToPlay(s)) {   // рука полностью заблокирована — победа соперника
          matchEnd = { winner: (s + 1) % 2, method: 2, cards: null };
          break;
        }
      }
    }
    const res = { winner, events: ev, a, b, matchEnd, discards: this.discards.slice() };
    this.ninjas[0].chosen = null;
    this.ninjas[1].chosen = null;
    return res;
  }

  getWinningCards(seat) {
    const bank = this.ninjas[seat].bank;
    for (const el of ELEMENTS) {                  // 3 карты одной стихии разных цветов
      const colorCards = [], colors = [];
      for (const c of bank[el]) {
        if (!colors.includes(c.card.color)) {
          colorCards.push(c); colors.push(c.card.color);
          if (colorCards.length === 3) return [colorCards, 0];
        }
      }
    }
    for (const cf of bank.f)                      // по одной каждой стихии, три разных цвета
      for (const cw of bank.w)
        for (const cs of bank.s) {
          const set = new Set([cf.card.color, cw.card.color, cs.card.color]);
          if (set.size === 3) return [[cf, cw, cs], 1];
        }
    return [false, -1];
  }

  static winnerSeat(a, b) {
    if (a.element !== b.element) return RULES[a.element] === b.element ? 0 : 1;
    if (a.value > b.value) return 0;
    if (b.value > a.value) return 1;
    return -1;
  }

  static beats(cardCheck, played) {  // строго бьёт (для Сэнсэя)
    if (cardCheck.element !== played.element) return RULES[cardCheck.element] === played.element;
    return cardCheck.value > played.value;
  }
}

/* ---- Сэнсэй (seat 0 — Сэнсэй, seat 1 — игрок, как в оригинале) ----
   До чёрного пояса: игроку раздаются только карты без паверов, а на
   каждую розданную карту Сэнсэй заранее подбирает бьющую её карту
   (с ротацией цветов) — победить его невозможно, ровно как в CP.
   С чёрным поясом Сэнсэй берёт случайные карты и становится победим. */
class SenseiMatch extends Match {
  constructor(canBeat) {
    super();
    this.canBeat = canBeat;
    this.senseiMove = new Map(); // playedId игрока -> playedId Сэнсэя
    this.colors = [];
  }

  getWinCard(playedCard) {
    if (this.colors.length >= 6) this.colors = [];
    const n = ALL_IDS.length;
    const start = Math.floor(Math.random() * (n + 1));
    for (let i = 0; i < n; i++) {
      const cid = ALL_IDS[(start + i) % n];
      const c = cardInfo(cid);
      /* Не берём карты с эффектами «при игре» (1/16/17/18): смена стихии
         или обмен значениями могли бы перевернуть раунд против Сэнсэя,
         а в оригинале он до чёрного пояса непобедим. */
      if (!this.colors.includes(c.color) && !ON_PLAYED.has(c.powerId) && Match.beats(c, playedCard)) {
        this.colors.push(c.color);
        return cid;
      }
    }
    return ALL_IDS[Math.floor(Math.random() * n)]; // страховка
  }

  dealSensei(playerPool) {
    let pool = playerPool;
    if (!this.canBeat) {
      const filtered = new Map();
      let total = 0;
      for (const [cid, q] of playerPool)
        if (cardInfo(cid).powerId === 0) { filtered.set(cid, q); total += q; }
      if (total >= 5) pool = filtered;
    }
    const dealt = this.deal(1, pool);
    const sensei = this.ninjas[0];
    for (const pl of dealt) {
      const scid = this.canBeat
        ? ALL_IDS[Math.floor(Math.random() * ALL_IDS.length)]
        : this.getWinCard(pl.card);
      const spl = this.makePlayed(scid, 0);
      sensei.deck.set(spl.id, spl);
      this.senseiMove.set(pl.id, spl.id);
    }
    return dealt;
  }

  pickPlayer(playedId) {
    const me = this.ninjas[1], sensei = this.ninjas[0];
    if (!me.deck.has(playedId) || me.chosen !== null) return false;
    me.chosen = me.deck.get(playedId);
    me.deck.delete(playedId);
    const sid = this.senseiMove.get(playedId);
    sensei.chosen = sensei.deck.get(sid);
    sensei.deck.delete(sid);
    this.senseiMove.delete(playedId);
    return true;
  }
}

/* ---- Прокачка поясов (формула houdini) ----
   Опыт: победа +5, поражение +1 (прогресс капает и за поражения).
   Порог ранга r: (r+1)*r/2*5. Ранги: 0 без пояса, 1 белый ...
   9 чёрный, 10 ниндзя (маска — только победой над Сэнсэем). */
const BELT_NAMES = ['Без пояса', 'Белый пояс', 'Жёлтый пояс', 'Оранжевый пояс', 'Зелёный пояс',
  'Синий пояс', 'Красный пояс', 'Фиолетовый пояс', 'Коричневый пояс', 'Чёрный пояс', 'Ниндзя'];
const BELT_COLORS = ['#5a5f6b', '#f2f2ee', '#e8c33a', '#e88a2e', '#3fae5a',
  '#3a6fd6', '#d63a3a', '#9a5bd6', '#7a4b2a', '#17181c', '#c9a34a'];

function expToNext(rank) { return (rank + 1) * 5; }
function thresholdForRank(rank) { return Math.floor((rank + 1) * rank / 2) * 5; }

function applyProgress(save, won) {
  if (save.rank >= 9) return { gained: 0, rankUps: 0 };
  const gained = won ? 5 : 1;
  save.progress += gained;
  let ups = 0;
  while (save.rank < 9 && save.progress >= thresholdForRank(save.rank + 1)) {
    save.rank++; ups++;
  }
  return { gained, rankUps: ups };
}

function senseiWinRankUp(save) {
  if (save.rank < 10) { save.rank++; return true; }
  return false;
}

/* ---- Сейв ---- */
const SAVE_KEY = 'cj_save_v1';
function newSave() {
  const cards = {};
  for (const cid of STARTER) cards[cid] = (cards[cid] || 0) + 1;
  return { rank: 0, progress: 0, wins: 0, losses: 0, senseiWins: 0, coins: 0, cards };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return Object.assign(newSave(), JSON.parse(raw));
  } catch (e) { /* повреждённый сейв — начинаем заново */ }
  return newSave();
}
function storeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* нет места */ }
}
function collectionCounter(save) {
  const m = new Map();
  for (const [cid, q] of Object.entries(save.cards)) if (q > 0) m.set(+cid, q);
  return m;
}

/* [ДОБАВКА] Пак — как код из реального ККИ: PACK_SIZE случайных карт,
   гарантированно PACK_MIN_POWER power-карт. Только существовавшие карты. */
function openPack() {
  const out = [];
  for (let i = 0; i < CONFIG.PACK_SIZE; i++)
    out.push(ALL_IDS[Math.floor(Math.random() * ALL_IDS.length)]);
  let have = out.filter(c => DB[c][3] > 0).length;
  let slot = 0;
  while (have < CONFIG.PACK_MIN_POWER && slot < out.length) {
    if (DB[out[slot]][3] === 0) {
      out[slot] = POWER_IDS_ALL[Math.floor(Math.random() * POWER_IDS_ALL.length)];
      have++;
    }
    slot++;
  }
  return out;
}

/* Описания эффектов (наши формулировки по фактической логике) */
const POWER_TEXT = {
  1: 'След. раунд: при равной стихии карты меняются значениями',
  2: 'След. раунд: +2 к твоей карте',
  3: 'След. раунд: −2 к карте соперника',
  4: 'Убирает у соперника выигранную карту снега',
  5: 'Убирает у соперника выигранную карту воды',
  6: 'Убирает у соперника выигранную карту огня',
  7: 'Убирает у соперника выигранную красную карту',
  8: 'Убирает у соперника выигранную синюю карту',
  9: 'Убирает у соперника выигранную зелёную карту',
  10: 'Убирает у соперника выигранную жёлтую карту',
  11: 'Убирает у соперника выигранную оранжевую карту',
  12: 'Убирает у соперника выигранную фиолетовую карту',
  13: 'След. раунд: сопернику нельзя играть снег',
  14: 'След. раунд: сопернику нельзя играть огонь',
  15: 'След. раунд: сопернику нельзя играть воду',
  16: 'В этом раунде вода становится огнём',
  17: 'В этом раунде снег становится водой',
  18: 'В этом раунде огонь становится снегом'
};

if (typeof module !== 'undefined') {
  module.exports = {
    CONFIG, RULES, ELEMENTS, POWER_LIMITERS, POWER_TEXT,
    cardInfo, Match, SenseiMatch,
    BELT_NAMES, BELT_COLORS, expToNext, thresholdForRank,
    applyProgress, senseiWinRankUp,
    newSave, loadSave, storeSave, collectionCounter, openPack, ALL_IDS
  };
}
