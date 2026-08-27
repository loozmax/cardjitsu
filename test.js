/* Headless-тесты движка (node test.js) */
const m = require('./app/js/cards.js');
global.CARDS = m.CARDS;
global.STARTER_DECK = m.STARTER_DECK;
const E = require('./app/js/engine.js');
const { Match, SenseiMatch } = E;

let failed = 0;
function ok(cond, name) {
  if (!cond) { failed++; console.log('FAIL:', name); }
}

const allIds = Object.keys(CARDS).map(Number);
function fullPool() { const p = new Map(); for (const c of allIds) p.set(c, 1); return p; }
function randPick(match, seat) {
  const me = match.ninjas[seat];
  const blocked = match.blockedElement(seat);
  let hand = [...me.deck.values()];
  const playable = hand.filter(c => !blocked || c.card.element !== blocked);
  if (playable.length) hand = playable;
  return hand[Math.floor(Math.random() * hand.length)].id;
}

/* 1. Симуляция матчей бот-против-бота: завершаемость + срабатывание эффектов */
const seenEvents = new Set();
const seenPowers = new Set();
const methods = { 0: 0, 1: 0, 2: 0 };
for (let i = 0; i < 800; i++) {
  const match = new Match();
  const pools = [fullPool(), fullPool()];
  let rounds = 0, end = null;
  while (!end && rounds < 300) {
    match.deal(0, pools[0]); match.deal(1, pools[1]);
    let blockedOut = false;
    for (const s of [0, 1]) {
      if (!match.hasCardsToPlay(s)) { end = { winner: (s + 1) % 2, method: 2 }; blockedOut = true; }
    }
    if (blockedOut) break;
    for (const s of [0, 1]) {
      const pl = match.ninjas[s].deck.get(randPick(match, s));
      if (pl.card.powerId) seenPowers.add(pl.card.powerId);
    }
    match.pick(0, randPick(match, 0));
    match.pick(1, randPick(match, 1));
    const res = match.resolveRound();
    for (const ev of res.events) seenEvents.add(ev.t);
    end = res.matchEnd;
    rounds++;
  }
  ok(end !== null, `матч #${i} завис (${rounds} раундов)`);
  if (end) methods[end.method]++;
}
console.log('методы побед:', methods, '| события:', [...seenEvents].sort().join(','));
console.log('сыгранные паверы:', [...seenPowers].sort((a, b) => a - b).join(','));
ok(seenEvents.has('swap') && seenEvents.has('plus2') && seenEvents.has('minus2'), 'эффекты 1/2/3 срабатывают');
ok(seenEvents.has('morph') && seenEvents.has('discard') && seenEvents.has('armed') && seenEvents.has('banked'), 'morph/discard/armed/banked срабатывают');
ok(methods[0] > 0 && methods[1] > 0, 'обе победные комбинации встречаются');

/* 2. Правило блокировки руки */
{
  const match = new Match();
  const snowIds = allIds.filter(c => CARDS[c][0] === 's').slice(0, 5);
  for (const cid of snowIds) {
    const pl = match.makePlayed(cid, 1);
    match.ninjas[1].deck.set(pl.id, pl);
  }
  const limiter = match.makePlayed(allIds.find(c => CARDS[c][3] === 13), 0); // блок снега
  match.powers[13] = limiter;
  ok(match.hasCardsToPlay(1) === false, 'полная блокировка снега → нет ходов');
  ok(match.blockedElement(1) === 's', 'blockedElement сообщает снег');
  const fireId = allIds.find(c => CARDS[c][0] === 'f');
  const pl = match.makePlayed(fireId, 1);
  match.ninjas[1].deck.set(pl.id, pl);
  ok(match.hasCardsToPlay(1) === true, 'одна не-снежная карта → ходы есть');
}

/* 3. Победные комбинации напрямую */
{
  const match = new Match();
  const bank = match.ninjas[0].bank;
  const find = (el, col) => allIds.find(c => CARDS[c][0] === el && CARDS[c][1] === col);
  bank.f.push(match.makePlayed(find('f', 'r'), 0), match.makePlayed(find('f', 'b'), 0));
  ok(match.getWinningCards(0)[0] === false, 'двух карт мало');
  bank.f.push(match.makePlayed(find('f', 'g'), 0));
  ok(match.getWinningCards(0)[1] === 0, 'метод 0: три одной стихии, три цвета');
  const m2 = new Match();
  const b2 = m2.ninjas[0].bank;
  b2.f.push(m2.makePlayed(find('f', 'r'), 0));
  b2.w.push(m2.makePlayed(find('w', 'r'), 0));
  b2.s.push(m2.makePlayed(find('s', 'b'), 0));
  ok(m2.getWinningCards(0)[0] === false, 'повторяющийся цвет не считается');
  b2.w.push(m2.makePlayed(find('w', 'y'), 0));
  ok(m2.getWinningCards(0)[1] === 1, 'метод 1: три стихии, три цвета');
}

/* 4. Сэнсэй до чёрного пояса непобедим */
{
  const starterPool = new Map();
  for (const cid of STARTER_DECK) starterPool.set(cid, 1);
  for (let i = 0; i < 60; i++) {
    const sm = new SenseiMatch(false);
    let end = null, rounds = 0;
    while (!end && rounds < 60) {
      sm.dealSensei(starterPool);
      const ids = [...sm.ninjas[1].deck.keys()];
      ok(![...sm.ninjas[1].deck.values()].some(c => c.card.powerId), 'до чёрного пояса паверы не раздаются');
      sm.pickPlayer(ids[Math.floor(Math.random() * ids.length)]);
      const res = sm.resolveRound();
      ok(res.winner === 0, 'Сэнсэй выигрывает каждый раунд');
      end = res.matchEnd;
      rounds++;
    }
    ok(end && end.winner === 0, 'Сэнсэй выигрывает матч');
    ok(rounds <= 10, `Сэнсэй закрывает матч быстро (${rounds})`);
  }
}

/* 5. Сэнсэй с чёрным поясом победим */
{
  let playerWins = 0;
  for (let i = 0; i < 150; i++) {
    const sm = new SenseiMatch(true);
    const pool = fullPool();
    let end = null, rounds = 0;
    while (!end && rounds < 300) {
      sm.dealSensei(pool);
      let blockedOut = false;
      for (const s of [0, 1]) if (!sm.hasCardsToPlay(s)) { end = { winner: (s + 1) % 2 }; blockedOut = true; }
      if (blockedOut) break;
      const ids = [...sm.ninjas[1].deck.keys()];
      const blocked = sm.blockedElement(1);
      const playable = ids.filter(id => !blocked || sm.ninjas[1].deck.get(id).card.element !== blocked);
      sm.pickPlayer((playable.length ? playable : ids)[0]);
      const res = sm.resolveRound();
      end = res.matchEnd;
      rounds++;
    }
    ok(end !== null, 'сэнсэй-матч завершается');
    if (end && end.winner === 1) playerWins++;
  }
  ok(playerWins > 10, `с чёрным поясом Сэнсэй победим (побед: ${playerWins}/150)`);
  console.log('победы над Сэнсэем (чёрный пояс):', playerWins, '/ 150');
}

/* 6. Прокачка */
{
  const save = E.newSave();
  ok(save.cards[1] === 1 && Object.keys(save.cards).length === 12, 'стартовая колода 12 карт');
  const thresholds = [];
  for (let r = 1; r <= 9; r++) thresholds.push(E.thresholdForRank(r));
  ok(JSON.stringify(thresholds) === JSON.stringify([5, 15, 30, 50, 75, 105, 140, 180, 225]), 'пороги рангов');
  E.applyProgress(save, true);
  ok(save.rank === 1, 'первая победа → белый пояс');
  let wins = 1;
  while (save.rank < 9) { E.applyProgress(save, true); wins++; }
  ok(wins === 45, `до чёрного пояса 45 побед подряд (вышло ${wins})`);
  const s2 = E.newSave();
  for (let i = 0; i < 5; i++) E.applyProgress(s2, false);
  ok(s2.rank === 1, 'прогресс капает и за поражения');
  save.rank = 9;
  ok(E.senseiWinRankUp(save) && save.rank === 10, 'победа над Сэнсэем при чёрном поясе → ниндзя');
}

/* 7. Паки */
{
  for (let i = 0; i < 1000; i++) {
    const p = E.openPack();
    ok(p.length === E.CONFIG.PACK_SIZE, 'размер пака');
    ok(p.some(c => CARDS[c][3] > 0), 'в паке есть power-карта');
  }
}

/* 8. Раздача: рука 5, без дублей сверх коллекции */
{
  const match = new Match();
  const pool = new Map();
  for (const cid of STARTER_DECK) pool.set(cid, 1);
  match.deal(0, pool);
  ok(match.ninjas[0].deck.size === 5, 'рука из 5 карт');
  const counts = {};
  for (const pl of match.ninjas[0].deck.values())
    counts[pl.card.id] = (counts[pl.card.id] || 0) + 1;
  ok(Object.values(counts).every(v => v === 1), 'нет дублей сверх коллекции');
}

console.log(failed === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ ✓' : `\nПровалено: ${failed}`);
process.exit(failed ? 1 : 0);
