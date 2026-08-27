/* ============================================================
   Бот-соперник. [ДОБАВКА] В оригинале в додзё играли живые люди,
   поэтому поведение обычного соперника — наша замена матчмейкинга.
   Сам бой при этом идёт строго по движку оригинала (engine.js).
   Сила бота растёт вместе с поясом игрока.
   ============================================================ */

const AI = (() => {
  const _ids = Object.keys(CARDS).map(Number);
  const _plain = _ids.filter(c => CARDS[c][3] === 0);
  const _power = _ids.filter(c => CARDS[c][3] > 0);

  /* Пул карт бота: без паверов на старте, доля паверов растёт с рангом */
  function botPool(playerRank) {
    const pool = new Map();
    for (const c of _plain) pool.set(c, 1);
    const share = Math.min(1, playerRank / 9);
    for (const c of _power) if (Math.random() < share) pool.set(c, 1);
    return pool;
  }

  function botRank(playerRank) {
    const r = playerRank + (Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 1 : -1));
    return Math.max(1, Math.min(9, r));
  }

  /* Какими стихиями ниндзя может закрыть СВОЮ победную линию (свой банк
     игрок видит на экране — чужой бот не читает) */
  function hotElements(ninja) {
    const hot = new Set();
    const bank = ninja.bank;
    for (const el of ['f', 'w', 's']) {
      const colors = new Set(bank[el].map(c => c.card.color));
      if (colors.size >= 2) hot.add(el);          // близко к «3 одной стихии»
    }
    const nonEmpty = ['f', 'w', 's'].filter(el => bank[el].length > 0);
    if (nonEmpty.length === 2) {                   // близко к «3 разных стихии»
      const [a, b] = nonEmpty;
      const pairOk = bank[a].some(x => bank[b].some(y => x.card.color !== y.card.color));
      if (pairOk) hot.add(['f', 'w', 's'].find(el => !nonEmpty.includes(el)));
    }
    return hot;
  }

  /* Выбор карты: как живой человек в додзё — почти всегда наугад,
     с человеческими привычками: рука тянется к крупной карте, а почти
     собранную свою линию хочется достроить. Руку и банк соперника
     бот не анализирует. Возвращает playedId. */
  function pick(match, seat) {
    const me = match.ninjas[seat];
    const blocked = match.blockedElement(seat);
    let hand = [...me.deck.values()];
    const playable = hand.filter(c => !blocked || c.card.element !== blocked);
    if (playable.length) hand = playable;          // полная блокировка решится движком
    const rnd = a => a[Math.floor(Math.random() * a.length)];

    const roll = Math.random();
    if (roll < 0.15) {                             // достроить свою линию
      const mine = hotElements(me);
      const fit = hand.filter(c => mine.has(c.card.element));
      if (fit.length) return rnd(fit).id;
    }
    if (roll < 0.40) {                             // кинуть одну из крупных
      const top = [...hand].sort((x, y) => y.card.value - x.card.value).slice(0, 2);
      return rnd(top).id;
    }
    return rnd(hand).id;                           // просто наугад
  }

  return { botPool, botRank, pick };
})();
