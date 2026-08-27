/* ============================================================
   Мост нативного клиента: оригинальный card.swf (в Ruffle, с
   мок-оболочкой внутри) <-> наш движок (engine.js) в роли сервера.
   Протокол — как у оригинального сервера (см. ClientProxy/GameEngine).
   ============================================================ */

const NB = (() => {
  let player = null;      // <ruffle-player>
  let st = null;          // состояние партии

  const RU_TEXTS = {
    help: 'ПРАВИЛА',
    win: 'побеждает!',
    sensei_label: 'СЭНСЭЙ',
    sudden_death: 'У %name% не осталось ходов',
    quit_game_prompt: 'Выйти из матча?',
    player_quit_prompt: 'Игрок %name% покинул матч.',
    help_award_congratulations: 'Поздравляю!',
    help_award_belt_earned: 'Ты заслужил новый пояс. Продолжай тренировки!',
    help_defeat_sensei_intro: 'Ты победил меня, ученик...',
    help_defeat_sensei_kowtows: 'Я склоняюсь перед тобой.',
    help_defeat_sensei_gift: 'Прими маску ниндзя — ты заслужил её.',
    help_defeat_sensei_final: 'Теперь ты — настоящий ниндзя!',
    belt_colour_white: 'белый',
    belt_colour_yellow: 'жёлтый',
    belt_colour_orange: 'оранжевый',
    belt_colour_green: 'зелёный',
    belt_colour_blue: 'синий',
    belt_colour_red: 'красный',
    belt_colour_purple: 'фиолетовый',
    belt_colour_brown: 'коричневый',
    belt_colour_black: 'чёрный'
  };
  for (const pid of Object.keys(POWER_TEXT)) RU_TEXTS['pow_' + pid] = POWER_TEXT[pid];

  const log = (...a) => console.log('[bridge]', ...a);

  function recv(type, arr) {
    setTimeout(() => {
      try { player.cjRecv(type, arr); }
      catch (e) { console.error('cjRecv fail', type, e); }
    }, 10);
  }

  /* сериализация нашей Played-карты в формат клиента:
     uid|typeId|стихия|значение|цвет|powId */
  const cardStr = pl =>
    `${pl.id}|${pl.card.id}|${pl.card.element}|${pl.card.value}|${pl.card.color}|${pl.card.powerId}`;

  function newState(mode) {
    const save = loadSave();
    const vsSensei = mode === 3;
    const pool = collectionCounter(save);
    const m = vsSensei ? new SenseiMatch(save.rank >= 9) : new Match();
    return {
      m, vsSensei, save, pool,
      botPool: vsSensei ? null : AI.botPool(save.rank),
      mySeat: vsSensei ? 1 : 0,
      oppSeat: vsSensei ? 0 : 1,
      myRank: save.rank,
      oppRank: vsSensei ? 10 : AI.botRank(save.rank),
      round: 0,
      armedPrev: [],   // взведённые pow1 прошлого раунда (для power1)
      over: false
    };
  }

  function dealCards(n) {
    const s = st;
    // добор до 5 обеим сторонам (движок сам держит руку в 5)
    let my, opp;
    if (s.vsSensei) {
      my = s.m.dealSensei(s.pool);
      opp = [...s.m.ninjas[0].deck.values()].slice(-my.length);
    } else {
      my = s.m.deal(s.mySeat, s.pool);
      opp = s.m.deal(s.oppSeat, s.botPool);
    }
    // блокировка руки => немедленный конец (как method 2)
    for (const seat of [0, 1]) {
      if (!s.m.hasCardsToPlay(seat)) {
        finish({ winner: (seat + 1) % 2, method: 2, cards: null });
        return;
      }
    }
    recv('zm', [0, 'deal', s.mySeat, ...my.map(cardStr)]);
    recv('zm', [0, 'deal', s.oppSeat, ...opp.map(cardStr)]);
  }

  function oppOf(seat) { return (seat + 1) % 2; }

  function judgeSequence(res) {
    const s = st;
    // power-сообщения ДО judge (порядок оригинального сервера)
    const played = { 0: s.m.ninjas[0], 1: s.m.ninjas[1] };
    const armedNow = [];
    let discardIdx = 0;
    for (const ev of res.events) {
      if (ev.t === 'armed') {
        const owner = ev.seat;
        const rcv = (ev.pid === 2) ? owner : oppOf(owner);
        recv('zm', [0, 'power', owner, rcv, ev.pid]);
        armedNow.push({ owner, pid: ev.pid });
      } else if (ev.t === 'morph') {
        const owner = res.a.card.powerId === morphPid(ev) ? 0 :
          res.b.card.powerId === morphPid(ev) ? 1 : ev.seat;
        recv('zm', [0, 'power', owner, ev.seat, morphPid(ev)]);
      } else if (ev.t === 'discard') {
        const uid = res.discards[discardIdx++];
        recv('zm', [0, 'power', oppOf(ev.seat), ev.seat, discardPid(ev), uid]);
      } else if (ev.t === 'swap') {
        // сработавший pow1 прошлого раунда: сообщаем receiver
        const prev = s.armedPrev.find(p => p.pid === 1);
        if (prev) recv('zm', [0, 'power1', prev.owner, oppOf(prev.owner), 1]);
      }
    }
    // невыстреливший pow1 прошлого раунда -> пуф (receiver -1)
    for (const p of s.armedPrev) {
      if (p.pid === 1 && !res.events.some(e => e.t === 'swap'))
        recv('zm', [0, 'power1', p.owner, -1, 1]);
    }
    s.armedPrev = armedNow;
    recv('zm', [0, 'judge', res.winner, 0]);
  }

  function morphPid(ev) {
    return { 'w>f': 16, 's>w': 17, 'f>s': 18 }[ev.from + '>' + ev.to] || 16;
  }
  function discardPid(ev) {
    // точный pid сыгранной discard-карты: она у победителя раунда
    const s = st;
    for (const seat of [0, 1]) {
      const ch = s.m.ninjas[seat].chosen;
      if (ch && ch.card.powerId >= 4 && ch.card.powerId <= 12) return ch.card.powerId;
    }
    return 4;
  }

  function finish(end) {
    const s = st;
    if (s.over) return;
    s.over = true;
    const save = s.save;
    const iWon = end.winner === s.mySeat;
    let coins = 0, rankUps = 0, mask = false;
    if (s.vsSensei) {
      if (iWon) {
        save.senseiWins++;
        mask = senseiWinRankUp(save) && save.rank === 10;
        coins = CONFIG.COINS_SENSEI_WIN;
        rankUps = mask ? 1 : (save.rank > s.myRank ? 1 : 0);
      } else {
        rankUps = applyProgress(save, false).rankUps;
      }
    } else {
      rankUps = applyProgress(save, iWon).rankUps;
      coins = iWon ? CONFIG.COINS_WIN : CONFIG.COINS_LOSS;
    }
    if (iWon) save.wins++; else save.losses++;
    save.coins += coins;
    storeSave(save);
    const ids = end.cards ? end.cards.map(pl => pl.id) : [];
    recv('czo', [0, coins, end.winner, ...ids]);
    let awardRank = 0;
    if (iWon && mask) awardRank = 10;
    else if (iWon && rankUps > 0) awardRank = save.rank;
    // тестовый форс церемонии: ?award=N
    try {
      const f = Number(new URLSearchParams(location.search).get('award'));
      if (f) awardRank = f;
    } catch (e) {}
    if (awardRank) recv('cza', [0, awardRank]);   // клиент проведёт церемонию
  }

  // тестовый форс церемонии без матча: __cjForceAward(rank)
  window.__cjForceAward = rank => {
    recv('czo', [0, 0, st.oppSeat]);      // соперник победил, банк пуст -> stateOver
    setTimeout(() => recv('cza', [0, rank]), 200);
  };

  // ---- вызовы из SWF ----
  window.cjDiag = s => log('diag:', s);
  window.cjSpeech = txt => { if (window.nativeSpeech) window.nativeSpeech(txt); };
  window.cjReady = () => log('shim ready');
  window.cjClientLoaded = () => log('client classes loaded');
  window.cjTexts = () => RU_TEXTS;
  window.cjPrompt = (kind, msg, idx) => {
    log('prompt:', kind, msg);
    if (window.nativePrompt) window.nativePrompt(kind, msg, idx);
    else setTimeout(() => player.cjPromptOk(idx), 400);
  };
  window.cjShell = (method, a, b) => {
    switch (method) {
      case 'penguinColor':
        return st && st.vsSensei && Number(a) === 13 ? 0x999999 : 0xFF6500;
      case 'text': return RU_TEXTS[a] !== undefined ? RU_TEXTS[a] : a;
      case 'music':
        log('music', a);
        if (window.nativeMusic) window.nativeMusic(a);
        return 0;
      case 'close':
        log('close game');
        if (window.nativeClose) window.nativeClose();
        return 0;
    }
    return 0;
  };
  window.cjSend = (type, args) => {
    const s = st;
    log('send:', type, JSON.stringify(args));
    if (type === 'gz') {
      recv('gz', [0, 2, 0]);
    } else if (type === 'jz') {
      recv('jz', [0, s.mySeat, 'ПИНГВИН', 6, Math.max(1, s.myRank)]);
      const rows = [];
      rows[s.mySeat] = `${s.mySeat}|ПИНГВИН|6|${Math.max(1, s.myRank)}`;
      rows[s.oppSeat] = s.vsSensei
        ? `${s.oppSeat}|Sensei|13|11`
        : `${s.oppSeat}|СОПЕРНИК|6|${s.oppRank}`;
      recv('uz', [0, ...rows]);
      recv('sz', [0]);
    } else if (type === 'zm') {
      const instr = args[0];
      if (instr === 'deal') {
        st.round++;
        dealCards(args[1]);
      } else if (instr === 'pick') {
        const uid = Number(args[1]);
        if (s.vsSensei) {
          s.m.pickPlayer(uid);
        } else {
          s.m.pick(s.mySeat, uid);
          s.m.pick(s.oppSeat, AI.pick(s.m, s.oppSeat));
        }
        recv('zm', [0, 'pick', s.mySeat, uid]);
        const oppPick = s.m.ninjas[s.oppSeat].chosen;
        const botDelay = s.vsSensei ? 700 : 600 + Math.random() * 1600;
        setTimeout(() => {
          recv('zm', [0, 'pick', s.oppSeat, oppPick.id]);
          setTimeout(() => {
            const res = s.m.resolveRound();
            judgeSequence(res);
            if (res.matchEnd) setTimeout(() => finish(res.matchEnd), 400);
          }, 350);
        }, botDelay);
      } else if (instr === 'death') {
        finish({ winner: Number(args[1]), method: 2, cards: null });
      }
    } else if (type === 'lz') {
      recv('cjsi', [0, '', 0, 0]);
      recv('lz', [0, s ? s.mySeat : 0]);
    }
    return 0;
  };

  function start(hostEl, mode) {
    st = newState(mode);
    return loadRuffle().then(rp => {
      if (!rp || !rp.newest) throw new Error('no ruffle');
      player = rp.newest().createPlayer();
      player.style.cssText = 'width:760px;height:480px;display:block;';
      hostEl.append(player);
      return player.ruffle().load({
        url: 'assets/native/cardnative.swf?mode=' + mode,
        allowScriptAccess: true,
        parameters: 'mode=' + mode
      }).then(() => player);
    });
  }

  function stop() {
    if (player) { try { player.remove(); } catch (e) {} player = null; }
    st = null;
  }

  return { start, stop, state: () => st, save: () => st && st.save };
})();
