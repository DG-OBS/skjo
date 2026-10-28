(() => {
  'use strict';

  const socket = io();
  const $ = sel => document.querySelector(sel);
  const STORE = 'roboskyjo-session';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // ---------- Session (pour revenir après un rechargement de page) ----------
  let session = {};
  try { session = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { session = {}; }
  function saveSession(patch) {
    session = { ...session, ...patch };
    try { localStorage.setItem(STORE, JSON.stringify(session)); } catch (e) { /* rien */ }
  }

  let room = null;
  let you = null;
  let pending = false;
  let selectedAvatar = Number.isInteger(session.avatar) ? session.avatar : Math.floor(Math.random() * Robots.count);

  // ---------- Toasts, bulles, confettis ----------
  function toast(text, kind = '', life = 2.8) {
    const t = el('div', `toast ${kind}`, text);
    t.style.setProperty('--life', `${life}s`);
    $('#toasts').append(t);
    setTimeout(() => t.remove(), life * 1000 + 500);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  }

  function bubble(playerId, text) {
    const b = boards.get(playerId);
    if (!b) return;
    b.root.querySelector('.bubble')?.remove();
    const isEmoji = [...text].length <= 2 && !/[a-z]/i.test(text);
    const bub = el('div', `bubble${isEmoji ? ' big' : ''}`, text);
    b.root.append(bub);
    setTimeout(() => bub.remove(), 3300);
  }

  function mood(playerId, cls) {
    const b = boards.get(playerId);
    if (!b) return;
    b.root.classList.remove('robot-cry', 'robot-happy');
    void b.root.offsetWidth;
    b.root.classList.add(cls);
    setTimeout(() => b.root.classList.remove(cls), 1600);
  }

  function shake(node) {
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
  }

  function confetti(duration = 4000) {
    const canvas = $('#confetti');
    const ctx = canvas.getContext('2d');
    canvas.width = innerWidth;
    canvas.height = innerHeight;
    const colors = ['#4fd1ff', '#ff8a3d', '#7cff6b', '#ff5fa2', '#ffe066', '#a78bfa'];
    const bits = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height * 0.6,
      vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3, s: 6 + Math.random() * 8, c: pick(colors), gear: Math.random() < 0.15,
    }));
    const end = performance.now() + duration;
    (function frame(now) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.r += b.vr; b.vy += 0.03;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        if (b.gear) { ctx.font = `${b.s * 2.2}px sans-serif`; ctx.fillText('⚙️', 0, 0); }
        else { ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); }
        ctx.restore();
      }
      if (now < end) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    })(performance.now());
  }

  // ---------- Cartes ----------
  function tier(v) {
    if (v === -2) return 'neg2';
    if (v < 0) return 'neg';
    if (v === 0) return 'zero';
    if (v <= 4) return 'low';
    if (v <= 8) return 'mid';
    return 'high';
  }
  const EMO = { neg2: '🤑', neg: '😎', zero: '🙂', low: '👍', mid: '😐', high: '😱' };

  function makeCard() {
    const c = el('div', 'card');
    c.innerHTML = '<div class="card-inner"><div class="face back"><span class="gear">⚙</span></div>'
      + '<div class="face front"><span class="corner tl"></span><span class="num"></span><span class="corner br"></span><span class="emo"></span></div></div>';
    return c;
  }

  function setFace(card, value) {
    if (value === null || value === undefined) return;
    const front = card.querySelector('.front');
    const t = tier(value);
    front.dataset.tier = t;
    front.querySelector('.num').textContent = value;
    front.querySelector('.tl').textContent = value;
    front.querySelector('.br').textContent = value;
    front.querySelector('.emo').textContent = EMO[t];
  }

  function restartAnim(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  // Une carte « fantôme » vole d'un endroit à un autre.
  function fly(fromEl, toEl, value, { delay = 0, duration = 480 } = {}) {
    if (!fromEl || !toEl) return;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    if (!a.width || !b.width) return;
    toEl.classList.add('incoming');
    const ghost = makeCard();
    ghost.classList.add('ghost');
    if (value !== null && value !== undefined) { setFace(ghost, value); ghost.classList.add('revealed'); }
    Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    ghost.style.setProperty('--cw', `${a.width}px`);
    ghost.querySelector('.card-inner').style.transition = 'none';
    document.body.append(ghost);
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    const s = b.width / a.width;
    const anim = ghost.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)' },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${(1 + s) / 2 * 1.15}) rotate(-12deg)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(0deg)` },
    ], { duration, delay, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'both' });
    anim.onfinish = () => { ghost.remove(); toEl.classList.remove('incoming'); };
  }

  // ---------- Accueil ----------
  $('#mascot').innerHTML = Robots.svg(0);
  $('#in-name').value = session.name || '';
  const params = new URLSearchParams(location.search);
  if (params.get('room')) $('#in-code').value = params.get('room').toUpperCase();

  function renderAvatarPicker() {
    const box = $('#avatar-picker');
    box.innerHTML = '';
    for (let i = 0; i < Robots.count; i++) {
      const b = el('button', `avatar-opt${i === selectedAvatar ? ' selected' : ''}`);
      b.title = Robots.NAMES[i];
      b.innerHTML = Robots.svg(i);
      b.onclick = () => {
        selectedAvatar = i;
        Sound.bip();
        $('#mascot').innerHTML = Robots.svg(i);
        renderAvatarPicker();
      };
      box.append(b);
    }
  }
  renderAvatarPicker();
  $('#mascot').innerHTML = Robots.svg(selectedAvatar);

  const FUNNY_NAMES = ['Capitaine Boulon', 'Super Tournevis', 'Pilote Turbo', 'Agent Wi-Fi', 'Ninja Laser', 'Docteur Rouage'];
  function identity() {
    let name = $('#in-name').value.trim();
    if (!name) { name = pick(FUNNY_NAMES); $('#in-name').value = name; }
    saveSession({ name, avatar: selectedAvatar });
    return { name, avatar: selectedAvatar };
  }

  function onJoined(res) {
    if (res.error) { toast(`🚫 ${res.error}`, 'bad'); Sound.error(); return; }
    saveSession({ code: res.code, token: res.token });
    history.replaceState(null, '', `/?room=${res.code}`);
  }

  $('#btn-create').onclick = () => { Sound.unlock(); Sound.click(); socket.emit('create', identity(), onJoined); };
  $('#btn-join').onclick = () => {
    Sound.unlock();
    Sound.click();
    const code = $('#in-code').value.trim().toUpperCase();
    if (code.length !== 4) { toast('Le code fait 4 lettres, pilote ! 🔤', 'bad'); return; }
    const token = session.code === code ? session.token : undefined;
    socket.emit('join', { ...identity(), code, token }, onJoined);
  };
  $('#in-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-join').click(); });

  // ---------- Barre du haut ----------
  function refreshMute() { $('#btn-mute').textContent = Sound.muted ? '🔇' : '🔊'; }
  refreshMute();
  $('#btn-mute').onclick = () => { Sound.toggle(); refreshMute(); };
  $('#btn-rules').onclick = () => { Sound.click(); $('#rules').classList.remove('hidden'); };
  $('#rules').addEventListener('click', e => {
    if (e.target.id === 'rules' || e.target.closest('[data-close]')) $('#rules').classList.add('hidden');
  });
  $('#btn-leave').onclick = () => {
    if (!confirm('Quitter la salle ? (Un robot prendra ta place si la partie est en cours)')) return;
    socket.emit('leave', {}, () => {});
    goHome();
  };

  function goHome() {
    saveSession({ code: null, token: null });
    room = null;
    you = null;
    history.replaceState(null, '', '/');
    boardsKey = '';
    hideOverlay();
    render();
  }

  // ---------- Salon ----------
  $('#btn-copy').onclick = async () => {
    const url = `${location.origin}/?room=${room.code}`;
    try { await navigator.clipboard.writeText(url); toast('🔗 Lien copié ! Envoie-le à tes amis.'); }
    catch (e) { prompt('Copie ce lien :', url); }
  };
  document.querySelectorAll('[data-bot]').forEach(b => {
    b.onclick = () => { Sound.bip(); socket.emit('addBot', { level: b.dataset.bot }, res => res.error && toast(`🚫 ${res.error}`, 'bad')); };
  });
  $('#btn-start').onclick = () => {
    Sound.click();
    socket.emit('start', {}, res => res.error && toast(`🚫 ${res.error}`, 'bad'));
  };

  const isHost = () => room && room.hostId === you;
  const roomPlayer = id => room.players.find(p => p.id === id);
  const nameOf = id => (roomPlayer(id) || { name: '?' }).name;

  function renderLobby() {
    $('#lobby-code').textContent = room.code;
    const list = $('#lobby-players');
    list.innerHTML = '';
    room.players.forEach(p => {
      const li = el('li', p.connected ? '' : 'offline');
      const av = el('div');
      av.innerHTML = Robots.svg(p.avatar);
      const nm = el('div', 'pname', p.name + (p.id === you ? ' (toi)' : ''));
      let tag = p.isBot ? (p.level === 'facile' ? 'Robot rigolo 🤪' : 'Robot malin 🧠') : 'Humain (enfin, on croit) 🧑';
      if (p.id === room.hostId) tag = `👑 Chef de la salle · ${tag}`;
      if (!p.connected) tag += ' · 📡 hors ligne';
      nm.append(el('span', 'tag', tag));
      li.append(av.firstChild, nm);
      if (isHost() && p.id !== you) {
        const k = el('button', 'kick', '❌');
        k.title = 'Retirer';
        k.onclick = () => socket.emit('kick', { id: p.id }, () => {});
        li.append(k);
      }
      list.append(li);
    });
    $('#host-tools').classList.toggle('hidden', !isHost());
    $('#lobby-wait').classList.toggle('hidden', isHost());
    $('#btn-start').disabled = room.players.length < 2;
    $('#btn-start').textContent = room.players.length < 2 ? '⚡ Ajoute au moins 1 adversaire' : `⚡ Lancer la partie ! (${room.players.length} joueurs)`;
    document.querySelectorAll('[data-bot]').forEach(b => { b.disabled = room.players.length >= 8; });
  }

  // ---------- Plateau ----------
  const boards = new Map();
  let boardsKey = '';
  let deckCard; let drawnCard; let discardCard;

  function buildPiles() {
    deckCard = makeCard();
    drawnCard = makeCard();
    discardCard = makeCard();
    $('#deck').append(deckCard);
    $('#drawn').append(drawnCard);
    $('#discard').append(discardCard);
    $('#deck').onclick = () => {
      const g = room && room.game;
      if (g && g.current === you && g.step === 'draw') send({ type: 'draw' });
    };
    $('#discard').onclick = () => {
      const g = room && room.game;
      if (!g || g.current !== you) return;
      if (g.step === 'draw' && g.discardTop !== null) send({ type: 'take' });
      else if (g.step === 'decide') send({ type: 'discard' });
    };
  }
  buildPiles();

  function createBoard(p) {
    const root = el('div', 'board');
    const head = el('div', 'board-head');
    const av = el('div', 'avatar');
    av.innerHTML = Robots.svg(p.avatar);
    const who = el('div', 'who');
    const name = el('span', 'name');
    const stats = el('div', 'stats');
    who.append(name, stats);
    head.append(av, who);
    const grid = el('div', 'grid');
    const cards = [];
    for (let i = 0; i < 12; i++) {
      const c = makeCard();
      c.dataset.i = i;
      grid.append(c);
      cards.push(c);
    }
    root.append(head, grid);
    return { root, name, stats, cards, prevGrid: null };
  }

  function buildBoards() {
    boards.clear();
    $('#opponents').innerHTML = '';
    $('#me').innerHTML = '';
    const ids = room.players.map(p => p.id);
    const meIdx = Math.max(0, ids.indexOf(you));
    // Les adversaires dans l'ordre du tour, en commençant par celui qui joue après moi.
    const order = ids.slice(meIdx + 1).concat(ids.slice(0, meIdx));
    for (const id of [you, ...order]) {
      const p = roomPlayer(id);
      if (!p) continue;
      const b = createBoard(p);
      boards.set(id, b);
      (id === you ? $('#me') : $('#opponents')).append(b.root);
    }
    boards.get(you).root.querySelector('.grid').addEventListener('click', e => {
      const card = e.target.closest('.card');
      if (!card) return;
      const action = myCellAction(Number(card.dataset.i));
      if (action) send(action);
    });
  }

  function myCellAction(i) {
    const g = room && room.game;
    if (!g) return null;
    const me = g.players.find(p => p.id === you);
    const c = me && me.grid[i];
    if (!c || c.removed) return null;
    if (g.phase === 'reveal' && me.revealsLeft > 0 && !c.revealed) return { type: 'reveal', cell: i };
    if (g.phase === 'playing' && g.current === you) {
      if (g.step === 'decide' || g.step === 'place') return { type: 'swap', cell: i };
      if (g.step === 'flip' && !c.revealed) return { type: 'flip', cell: i };
    }
    return null;
  }

  function send(action) {
    if (pending) return;
    pending = true;
    Sound.unlock();
    socket.emit('action', action, res => {
      pending = false;
      if (res && res.error) { toast(`🤖 ${res.error}`, 'bad'); Sound.error(); }
    });
  }

  function updateBoard(b, p, gp, g) {
    b.name.textContent = p.name;
    if (p.id === room.hostId) b.name.append(el('span', 'badge', '👑'));
    if (p.isBot) b.name.append(el('span', 'badge', p.level === 'facile' ? '🤪' : '🧠'));
    if (p.autopilot) b.name.append(el('span', 'badge', '📡 auto'));
    b.stats.innerHTML = `🏆 <b>${gp.total}</b> pts · 👁 <b>${gp.visibleSum}</b>`;
    b.root.classList.toggle('active', g.phase === 'playing' && g.current === p.id);
    b.root.classList.toggle('finisher', g.finisher === p.id);
    b.root.classList.toggle('offline', !p.connected);

    gp.grid.forEach((cell, i) => {
      const card = b.cards[i];
      const before = b.prevGrid && b.prevGrid[i];
      setFace(card, cell.value);
      card.classList.toggle('revealed', cell.revealed);
      if (cell.removed && !card.classList.contains('removed')) {
        card.classList.add('removed');
        setTimeout(() => { if (card.classList.contains('removed')) card.classList.add('gone'); }, 950);
      } else if (!cell.removed) {
        card.classList.remove('removed', 'gone');
      }
      if (before && before.revealed && cell.revealed && before.value !== cell.value && !cell.removed) restartAnim(card, 'bump');
      card.classList.toggle('clickable', p.id === you && !!myCellAction(i));
    });
    b.prevGrid = gp.grid;
  }

  function updatePiles(g, prevGame) {
    $('#deck-count').textContent = `(${g.deckCount})`;
    deckCard.classList.toggle('empty', g.deckCount === 0);

    discardCard.classList.toggle('empty', g.discardTop === null);
    if (g.discardTop !== null) { setFace(discardCard, g.discardTop); discardCard.classList.add('revealed'); }

    if (g.drawn !== null) {
      setFace(drawnCard, g.drawn);
      drawnCard.style.visibility = '';
      drawnCard.classList.add('revealed');
      if (!prevGame || prevGame.drawn === null) restartAnim(drawnCard, 'pop');
      const who = g.current === you ? 'Ta carte !' : `Carte de ${nameOf(g.current)}`;
      $('#drawn-label').textContent = who;
    } else {
      drawnCard.style.visibility = 'hidden';
      $('#drawn-label').innerHTML = '&nbsp;';
    }

    const myTurn = g.phase === 'playing' && g.current === you;
    $('#deck').classList.toggle('clickable', myTurn && g.step === 'draw');
    $('#discard').classList.toggle('clickable', myTurn && ((g.step === 'draw' && g.discardTop !== null) || g.step === 'decide'));
    $('#discard').classList.toggle('trash-target', myTurn && g.step === 'decide');
  }

  function updateInstruction(g) {
    const box = $('#instruction');
    const me = g.players.find(p => p.id === you);
    let text = '';
    let mine = false;
    if (g.phase === 'reveal') {
      if (me.revealsLeft > 0) {
        mine = true;
        text = `🔧 Retourne ${me.revealsLeft} carte${me.revealsLeft > 1 ? 's' : ''} pour démarrer tes moteurs !`;
      } else {
        text = 'Les autres chauffent leurs moteurs… ⏳';
      }
    } else if (g.phase === 'playing') {
      if (g.current === you) {
        mine = true;
        text = {
          draw: '🎯 À toi ! Clique sur la pioche… ou prends la carte de la défausse.',
          decide: '🤔 Clique sur une de tes cartes pour l\'échanger… ou jette-la dans la défausse 🗑️',
          place: '🔁 Choisis la carte à remplacer.',
          flip: '👆 Retourne une de tes cartes cachées.',
        }[g.step];
      } else {
        const cur = roomPlayer(g.current);
        text = cur && (cur.isBot || cur.autopilot) ? `${cur.name} calcule à 3 GHz… 🧠⚙️` : `${nameOf(g.current)} réfléchit… 🤔`;
      }
    } else {
      text = 'Fin de la manche ! Le robot-comptable calcule… 🧮';
    }
    box.textContent = text;
    box.classList.toggle('mine', mine);
    if (g.phase === 'playing' && g.finisher !== null) box.append(el('span', 'last', '  ⏰ DERNIER TOUR !'));
  }

  // ---------- Fin de manche / fin de partie ----------
  let overlayKey = null;
  let overlayTimer = null;

  function hideOverlay() {
    clearTimeout(overlayTimer);
    overlayKey = null;
    $('#overlay').classList.add('hidden');
    $('#overlay').innerHTML = '';
  }

  function scheduleOverlay(g) {
    const key = `${g.round}-${g.phase}`;
    if (g.phase !== 'roundEnd' && g.phase !== 'gameOver') {
      if (overlayKey) hideOverlay();
      return;
    }
    if (overlayKey === key) {
      if (!$('#overlay').classList.contains('hidden')) showOverlay(false);
      return;
    }
    overlayKey = key;
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => showOverlay(true), 2400);
  }

  function showOverlay(fresh) {
    const g = room && room.game;
    if (!g) return;
    const over = g.phase === 'gameOver';
    const ov = $('#overlay');
    ov.innerHTML = '';
    ov.classList.remove('hidden');
    const modal = el('div', 'modal');
    if (!fresh) modal.style.animation = 'none';

    if (over) {
      const win = el('div', 'winner');
      const w = roomPlayer(g.winners[0]);
      win.append(el('span', 'crown', '👑'));
      const av = el('div');
      av.innerHTML = Robots.svg(w ? w.avatar : 0);
      win.append(av.firstChild);
      modal.append(win);
      const names = g.winners.map(nameOf).join(' & ');
      modal.append(el('h2', '', g.winners.includes(you) ? '🏆 TU AS GAGNÉ !!!' : `🏆 ${names} gagne !`));
      modal.append(el('p', 'funny', g.winners.includes(you)
        ? 'Les robots du monde entier s\'inclinent devant toi. Bip boup respect. 🙇'
        : pick(['Pas grave, même les robots ont des bugs. Revanche ? 🔧', 'Défaite détectée… mise à jour du cerveau en cours… 🧠', 'Tu as perdu… mais avec style ! 😎'])));
    } else {
      modal.append(el('h2', '', `Fin de la manche ${g.round} !`));
      const best = [...g.players].sort((a, b) => a.lastRoundScore - b.lastRoundScore)[0];
      const doubled = g.players.find(p => p.doubled);
      let line = `${nameOf(best.id)} est le roi des boulons de cette manche ! 👑`;
      if (doubled) line += ` Et ${nameOf(doubled.id)} a fini trop vite… points DOUBLÉS ! ⚡🤖💥`;
      modal.append(el('p', 'funny', line));
    }

    const table = el('table', 'scores');
    const sorted = [...g.players].sort((a, b) => a.total - b.total);
    sorted.forEach((gp, rank) => {
      const p = roomPlayer(gp.id) || { name: '?', avatar: 0 };
      const tr = el('tr');
      tr.style.animationDelay = `${rank * 0.12}s`;
      const tdAv = el('td');
      tdAv.innerHTML = Robots.svg(p.avatar);
      const tdName = el('td');
      tdName.append(el('div', '', `${['🥇', '🥈', '🥉'][rank] || '🔩'} ${p.name}${gp.id === you ? ' (toi)' : ''}`));
      const sign = gp.lastRoundScore > 0 ? '+' : '';
      tdName.append(el('div', 'sub', `Cette manche : ${sign}${gp.lastRoundScore}`));
      const bar = el('div', 'bar');
      const fill = el('i');
      bar.append(fill);
      tdName.append(bar);
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${Math.min(100, (gp.total / g.endScore) * 100)}%`; }));
      const tdPts = el('td', `pts${gp.total < 0 ? ' neg' : ''}`, `${gp.total}`);
      if (gp.doubled) tdPts.append(el('span', 'x2', '⚡ x2'));
      tr.append(tdAv, tdName, tdPts);
      table.append(tr);
    });
    modal.append(table);
    modal.append(el('p', 'sub hint', `La partie s'arrête quand quelqu'un atteint ${g.endScore} points. Le plus petit score gagne !`));

    const actions = el('div', 'actions');
    if (isHost()) {
      if (over) {
        const again = el('button', 'btn btn-big btn-orange', '🔁 Rejouer !');
        again.onclick = () => { Sound.click(); socket.emit('start', {}, res => res.error && toast(res.error, 'bad')); };
        const lobby = el('button', 'btn btn-cyan', '🏠 Retour au salon');
        lobby.onclick = () => socket.emit('toLobby', {}, () => {});
        actions.append(again, lobby);
      } else {
        const next = el('button', 'btn btn-big btn-orange', '🚀 Manche suivante');
        next.onclick = () => { Sound.click(); socket.emit('nextRound', {}, res => res.error && toast(res.error, 'bad')); };
        actions.append(next);
      }
    } else {
      const w = el('p', 'hint wait', 'En attente du chef de la salle ');
      w.append(el('span', 'dots'));
      actions.append(w);
    }
    const look = el('button', 'btn btn-small', '👀 Voir les cartes');
    look.onclick = () => { ov.classList.add('hidden'); setTimeout(() => { if (overlayKey) showOverlay(false); }, 5000); };
    actions.append(look);
    modal.append(actions);
    ov.append(modal);
  }

  // ---------- Rendu général ----------
  function show(id) {
    ['#screen-home', '#screen-lobby', '#screen-game'].forEach(s => $(s).classList.toggle('hidden', s !== id));
  }

  function render(prevRoom) {
    $('#room-chip').classList.toggle('hidden', !room);
    $('#btn-leave').classList.toggle('hidden', !room);
    if (!room) { show('#screen-home'); return; }
    $('#room-chip').textContent = room.code;
    if (!room.game) {
      hideOverlay();
      boardsKey = '';
      show('#screen-lobby');
      renderLobby();
      return;
    }
    show('#screen-game');
    const g = room.game;
    const key = `${room.players.map(p => p.id).join(',')}|${you}`;
    if (key !== boardsKey) { buildBoards(); boardsKey = key; }
    for (const p of room.players) {
      const gp = g.players.find(x => x.id === p.id);
      const b = boards.get(p.id);
      if (gp && b) updateBoard(b, p, gp, g);
    }
    updatePiles(g, prevRoom && prevRoom.game);
    updateInstruction(g);
    scheduleOverlay(g);
  }

  // ---------- Réactions aux événements ----------
  const cardEl = (playerId, i) => { const b = boards.get(playerId); return b && b.cards[i]; };

  function reactToValue(playerId, value) {
    const human = roomPlayer(playerId) && !roomPlayer(playerId).isBot;
    if (value === -2) {
      mood(playerId, 'robot-happy');
      if (human) bubble(playerId, pick(['🤑 -2 !', 'Jackpot de boulons !', 'Hé hé hé 😏']));
    } else if (value >= 11) {
      mood(playerId, 'robot-cry');
      if (human) bubble(playerId, pick(['😱', 'Aïe, ça pique les circuits !', 'Erreur 404 😵']));
    }
  }

  function handleEvents(events) {
    if (!room) return;
    for (const e of events) {
      const who = e.player ? nameOf(e.player) : '';
      switch (e.type) {
        case 'joined':
          if (!room.game && e.player !== you) { toast(`🤖 ${who} entre dans la salle !`); Sound.bip(); }
          break;
        case 'left': toast(`🔋 ${e.name} est parti recharger ses batteries.`); break;
        case 'disconnected': if (e.player !== you) toast(`📡 ${who} a perdu le signal…`, 'bad'); break;
        case 'reconnected': if (e.player !== you) toast(`📶 ${who} est de retour !`); break;
        case 'autopilot': toast(`🤖 Pilote automatique activé pour ${who} !`); break;
        case 'roundStart':
          hideOverlay();
          toast(`Manche ${e.round} ! Retourne 2 cartes 🔧`, 'hot');
          Sound.ding();
          break;
        case 'flip':
          Sound.flip();
          if (room.game && room.game.phase !== 'reveal') reactToValue(e.player, e.value);
          break;
        case 'draw':
          Sound.draw();
          if (e.from === 'deck') {
            drawnCard.classList.remove('revealed');
            fly(deckCard, drawnCard, null, { duration: 380 });
            setTimeout(() => { if (room && room.game && room.game.drawn !== null) drawnCard.classList.add('revealed'); }, 420);
          } else {
            fly(discardCard, drawnCard, e.value, { duration: 380 });
          }
          break;
        case 'swap':
          Sound.swap();
          fly(drawnCard, cardEl(e.player, e.cell), e.value);
          fly(cardEl(e.player, e.cell), discardCard, e.old, { delay: 140 });
          reactToValue(e.player, e.value);
          break;
        case 'discard':
          Sound.toss();
          fly(drawnCard, discardCard, e.value);
          break;
        case 'column':
          setTimeout(() => Sound.laser(), 300);
          toast(e.value < 0
            ? `💥 ${who} pulvérise une colonne de ${e.value}… les robots pleurent de l'huile 😭`
            : `💥 TRIPLE ${e.value} ! ${who} pulvérise une colonne !`, 'hot');
          shake($('#screen-game'));
          mood(e.player, 'robot-happy');
          break;
        case 'finisher':
          Sound.alarm();
          toast(e.player === you ? '⏰ Tu as tout retourné ! Les autres jouent un dernier tour…' : `⏰ ${who} a tout retourné ! DERNIER TOUR !`, 'hot', 3.5);
          break;
        case 'turn':
          if (e.player === you) {
            Sound.ding();
            if (e.lastTurn) toast('⏰ C\'est ton DERNIER tour, fais-le compter !', 'hot');
          }
          break;
        case 'reshuffle': toast('♻️ Pioche vide ! On recycle la défausse…'); break;
        case 'roundEnd': {
          const d = e.scores.find(s => s.doubled);
          setTimeout(() => {
            if (d) { Sound.fail(); toast(`⚡ Points DOUBLÉS pour ${nameOf(d.id)} ! Court-circuit !`, 'bad', 3.5); mood(d.id, 'robot-cry'); }
            else Sound.ding();
          }, 900);
          break;
        }
        case 'gameOver':
          setTimeout(() => { Sound.win(); confetti(); }, 2500);
          break;
        case 'chat':
          bubble(e.player, e.text);
          Sound.bip();
          break;
        case 'emote':
          bubble(e.player, e.text);
          if (e.player !== you) Sound.bip();
          break;
        default:
      }
    }
  }

  // ---------- Émoticônes ----------
  const EMOTES = ['🤖 Bip boup !', '😂', '😱', '🔥', '👏', '😎', '🥶', 'Trop fort !', 'Noooon !', 'GG 🤝'];
  EMOTES.forEach(t => {
    const b = el('button', '', t);
    b.onclick = () => socket.emit('emote', { text: t }, () => {});
    $('#emotes').append(b);
  });

  // ---------- Socket ----------
  let wasDisconnected = false;
  socket.on('connect', () => {
    if (wasDisconnected) toast('📶 Connexion rétablie !');
    wasDisconnected = false;
    if (session.code && session.token) {
      socket.emit('join', { code: session.code, token: session.token, name: session.name, avatar: session.avatar }, res => {
        if (res.error) { saveSession({ code: null, token: null }); room = null; render(); }
      });
    }
  });
  socket.on('disconnect', () => {
    wasDisconnected = true;
    toast('📡 Connexion perdue… je réessaie !', 'bad');
  });
  socket.on('state', ({ room: r, you: y, events }) => {
    const prev = room;
    room = r;
    you = y;
    pending = false;
    render(prev);
    handleEvents(events || []);
  });
  socket.on('kicked', () => {
    toast('🚪 Le chef t\'a retiré de la salle.', 'bad');
    goHome();
  });

  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  render();
})();
