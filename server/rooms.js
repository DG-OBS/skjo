'use strict';

const crypto = require('crypto');
const { Game, GameError } = require('./game');
const { botAction, botChat } = require('./bot');

const MAX_PLAYERS = 8;
const AVATARS = 10;
const MAX_EVENTS = 80;
const ABSENT_MS = 30000; // sans nouvelles depuis 30 s → pilote automatique
const OFFLINE_MS = 12000; // affiché « hors ligne » après 12 s
const SEEN_REFRESH_MS = 8000;
const BOT_DELAY_REVEAL = 350;
const BOT_DELAY_PLAY = 1100;

const BOT_NAMES = [
  'Boulon', 'Clank', 'Turbo-Grille-Pain', 'Bip-Bip', 'Écrou-Man',
  'Rouillette', 'Chaussette-Tron', 'Vis-Sans-Fin', 'Pixel', 'Giga-Watt',
];

// ---------- Utilitaires ----------

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
}

function cleanName(name) {
  const n = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return n || 'Robot mystère';
}

function cleanAvatar(a) {
  const n = Number(a);
  return Number.isInteger(n) && n >= 0 && n < AVATARS ? n : crypto.randomInt(AVATARS);
}

const isAuto = p => p.isBot || p.autopilot;

function newHuman({ name, avatar }, now) {
  return {
    id: crypto.randomUUID(), token: crypto.randomUUID(), name: cleanName(name), avatar: cleanAvatar(avatar),
    isBot: false, autopilot: false, left: false, lastSeen: now, lastEmote: 0,
  };
}

function pushEvents(room, events) {
  for (const e of events) room.events.push({ ...e, seq: ++room.seq });
  if (room.events.length > MAX_EVENTS) room.events.splice(0, room.events.length - MAX_EVENTS);
}

function loadGame(room) {
  return room.game ? Game.fromJSON(room.game) : null;
}

// Les robots ont des choses à dire selon ce qui vient de se passer.
function botReactions(room, game, events) {
  const out = [];
  const say = (id, kind, chance) => {
    const p = room.players.find(pl => pl.id === id);
    if (p && p.isBot && Math.random() < chance) out.push({ type: 'chat', player: id, text: botChat(kind) });
  };
  for (const e of events) {
    if (e.type === 'column') say(e.player, 'column', 0.8);
    if (e.type === 'finisher') say(e.player, 'finisher', 0.9);
    if (e.type === 'swap' && e.value >= 10) say(e.player, 'badCard', 0.6);
    if (e.type === 'swap' && e.value <= -1) say(e.player, 'goodCard', 0.5);
    if (e.type === 'flip' && game.phase === 'playing' && e.value >= 11) say(e.player, 'badCard', 0.5);
    if (e.type === 'roundStart') {
      const bots = room.players.filter(p => p.isBot);
      if (bots.length) say(bots[crypto.randomInt(bots.length)].id, 'roundStart', 0.7);
    }
    if (e.type === 'gameOver') {
      room.players.filter(p => p.isBot).forEach(p => say(p.id, e.winners.includes(p.id) ? 'win' : 'lose', 0.8));
    }
  }
  return events.concat(out);
}

// Applique une action de jeu et enregistre les événements.
function play(room, game, playerId, action, now) {
  const events = game.act(playerId, action);
  room.game = game.toJSON();
  room.lastActionAt = now;
  pushEvents(room, botReactions(room, game, events));
}

function ensureHost(room, now) {
  const present = p => !p.isBot && !p.left && now - p.lastSeen < OFFLINE_MS;
  const host = room.players.find(p => p.id === room.hostId);
  if (host && present(host)) return false;
  const next = room.players.find(present);
  if (!next || next.id === room.hostId) return false;
  room.hostId = next.id;
  return true;
}

// Le serveur ne tourne pas en continu : à chaque requête on rattrape ce qui devait se passer
// (robots qui jouent, joueurs absents remplacés par le pilote automatique).
function advance(room, now) {
  let changed = ensureHost(room, now);
  const game = loadGame(room);
  if (!game) return changed;

  for (const p of room.players) {
    if (!p.isBot && !p.autopilot && now - p.lastSeen > ABSENT_MS) {
      p.autopilot = true;
      pushEvents(room, [{ type: 'autopilot', player: p.id }]);
      changed = true;
    }
  }

  // Révélation initiale : tous les robots retournent leurs cartes d'un coup.
  // Pendant la partie : un seul coup de robot par requête, pour garder un rythme lisible.
  for (let guard = 0; guard < 40; guard++) {
    let actor = null;
    if (game.phase === 'reveal') {
      actor = room.players.find(p => isAuto(p) && game.players.find(gp => gp.id === p.id).revealsLeft > 0);
    } else if (game.phase === 'playing') {
      const cur = room.players.find(p => p.id === game.players[game.current].id);
      if (cur && isAuto(cur)) actor = cur;
    }
    if (!actor) break;
    const delay = game.phase === 'reveal' ? BOT_DELAY_REVEAL : BOT_DELAY_PLAY;
    if (now - room.lastActionAt < delay) break;
    const wasReveal = game.phase === 'reveal';
    play(room, game, actor.id, botAction(game, actor.id, actor.level || 'malin'), wasReveal ? room.lastActionAt : now);
    changed = true;
    if (!wasReveal) break;
  }
  return changed;
}

function view(room, me, since, now) {
  const game = loadGame(room);
  const start = Number.isInteger(since) ? since : room.seq;
  return {
    version: room.version,
    seq: room.seq,
    you: me.id,
    events: room.events.filter(e => e.seq > start),
    room: {
      code: room.code,
      hostId: room.hostId,
      players: room.players.map(p => ({
        id: p.id, name: p.name, avatar: p.avatar, isBot: p.isBot, level: p.level || null,
        connected: p.isBot || (!p.left && now - p.lastSeen < OFFLINE_MS), autopilot: p.autopilot,
      })),
      game: game ? game.view() : null,
    },
  };
}

// ---------- Opérations ----------

function requireHost(room, me) {
  if (room.hostId !== me.id) throw new GameError('Seul le chef de la salle peut faire ça.');
}

const OPS = {
  addBot(room, me, data) {
    requireHost(room, me);
    if (room.game) throw new GameError('Impossible pendant une partie.');
    if (room.players.length >= MAX_PLAYERS) throw new GameError('La salle est pleine (8 joueurs max).');
    const usedNames = new Set(room.players.map(p => p.name));
    const usedAvatars = new Set(room.players.map(p => p.avatar));
    const named = BOT_NAMES.map((n, i) => ({ n, i })).filter(b => !usedNames.has(b.n));
    const unique = named.filter(b => !usedAvatars.has(b.i));
    const free = unique.length ? unique : named;
    const choice = free.length ? free[crypto.randomInt(free.length)] : { n: `Robot-${room.players.length}`, i: crypto.randomInt(AVATARS) };
    const bot = {
      id: crypto.randomUUID(), name: choice.n, avatar: choice.i, isBot: true,
      level: data.level === 'facile' ? 'facile' : 'malin', autopilot: false,
    };
    room.players.push(bot);
    pushEvents(room, [{ type: 'joined', player: bot.id }, { type: 'chat', player: bot.id, text: 'Bip boup ! Prêt à jouer !' }]);
  },

  kick(room, me, data) {
    requireHost(room, me);
    if (room.game) throw new GameError('Impossible pendant une partie.');
    if (data.id === me.id) throw new GameError('Tu ne peux pas te retirer toi-même.');
    const target = room.players.find(p => p.id === data.id);
    if (!target) return;
    room.players = room.players.filter(p => p !== target);
    pushEvents(room, [{ type: 'left', name: target.name }]);
  },

  start(room, me, data, now) {
    requireHost(room, me);
    const current = loadGame(room);
    if (current && current.phase !== 'gameOver') throw new GameError('La partie est déjà en cours.');
    if (room.players.length < 2) throw new GameError('Il faut au moins 2 joueurs. Ajoute un robot !');
    const game = new Game(room.players.map(p => p.id), { endScore: room.endScore });
    room.game = game.toJSON();
    room.lastActionAt = now;
    pushEvents(room, botReactions(room, game, [{ type: 'roundStart', round: 1 }]));
  },

  action(room, me, data, now) {
    const game = loadGame(room);
    if (!game) throw new GameError('Aucune partie en cours.');
    const action = { type: String(data.type || ''), cell: data.cell === undefined ? undefined : Number(data.cell) };
    play(room, game, me.id, action, now);
  },

  nextRound(room, me, data, now) {
    requireHost(room, me);
    const game = loadGame(room);
    if (!game) throw new GameError('Aucune partie en cours.');
    const events = game.nextRound();
    room.game = game.toJSON();
    room.lastActionAt = now;
    pushEvents(room, botReactions(room, game, events));
  },

  toLobby(room, me) {
    requireHost(room, me);
    room.game = null;
    room.players = room.players.filter(p => p.isBot || !p.left);
    pushEvents(room, [{ type: 'lobby' }]);
  },

  emote(room, me, data, now) {
    if (now - (me.lastEmote || 0) < 1200) return;
    const text = String(data.text || '').slice(0, 40);
    if (!text) return;
    me.lastEmote = now;
    pushEvents(room, [{ type: 'emote', player: me.id, text }]);
  },

  leave(room, me, data, now) {
    if (room.game) {
      me.left = true;
      me.autopilot = true;
      pushEvents(room, [{ type: 'autopilot', player: me.id }]);
    } else {
      room.players = room.players.filter(p => p !== me);
      pushEvents(room, [{ type: 'left', name: me.name }]);
    }
    ensureHost(room, now);
  },
};

// ---------- Point d'entrée unique de l'API ----------

function createRooms(store, { endScore = 100, now = () => Date.now() } = {}) {
  // Lecture → modification → écriture conditionnelle, avec quelques essais en cas de conflit.
  async function mutate(code, fn) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const room = await store.get(code);
      if (!room) throw new GameError('Aucune salle avec ce code. Vérifie les lettres !', { cause: 'gone' });
      const prev = room.version;
      const result = fn(room);
      if (!result || !result.changed) return { room, result };
      room.version = prev + 1;
      if (await store.cas(code, prev, room)) return { room, result };
      await new Promise(r => setTimeout(r, 15 + Math.random() * 40));
    }
    throw new GameError('Trop de robots parlent en même temps… réessaie !');
  }

  function findMe(room, token) {
    const me = token && room.players.find(p => p.token === token);
    if (!me) throw new GameError('Tu ne fais plus partie de cette salle.', { cause: 'gone' });
    return me;
  }

  async function create(data) {
    const t = now();
    const me = newHuman(data, t);
    for (let attempt = 0; attempt < 10; attempt++) {
      const room = {
        code: makeCode(), version: 1, seq: 0, events: [], hostId: me.id, players: [me],
        game: null, lastActionAt: t, endScore,
      };
      pushEvents(room, [{ type: 'joined', player: me.id }]);
      if (await store.cas(room.code, 0, room)) {
        return { ok: true, code: room.code, token: me.token, playerId: me.id, state: view(room, me, room.seq, t) };
      }
    }
    throw new GameError('Impossible de créer une salle, réessaie !');
  }

  async function join(data) {
    const code = String(data.code || '').toUpperCase().trim();
    const t = now();
    let me;
    const { room } = await mutate(code, r => {
      me = data.token && r.players.find(p => p.token === data.token);
      if (me) {
        const wasAway = me.autopilot || me.left || t - me.lastSeen > OFFLINE_MS;
        me.lastSeen = t;
        me.left = false;
        me.autopilot = false;
        if (wasAway) pushEvents(r, [{ type: 'reconnected', player: me.id }]);
        ensureHost(r, t);
        return { changed: true };
      }
      if (r.game) throw new GameError('La partie a déjà commencé. Attends la prochaine !');
      if (r.players.length >= MAX_PLAYERS) throw new GameError('La salle est pleine (8 joueurs max).');
      me = newHuman(data, t);
      r.players.push(me);
      pushEvents(r, [{ type: 'joined', player: me.id }]);
      return { changed: true };
    });
    return { ok: true, code, token: me.token, playerId: me.id, state: view(room, me, room.seq, t) };
  }

  // poll et toutes les opérations d'un joueur déjà dans une salle.
  async function op(name, data) {
    const code = String(data.code || '').toUpperCase().trim();
    const since = Number.isInteger(data.since) ? data.since : undefined;
    const t = now();
    let me;
    const { room } = await mutate(code, r => {
      me = findMe(r, data.token);
      let changed = false;
      if (t - me.lastSeen > SEEN_REFRESH_MS || me.autopilot) {
        if (me.autopilot && !me.left) pushEvents(r, [{ type: 'reconnected', player: me.id }]);
        me.lastSeen = t;
        if (!me.left) me.autopilot = false;
        changed = true;
      }
      if (name !== 'poll') {
        OPS[name](r, me, data, t);
        changed = true;
      }
      if (advance(r, t)) changed = true;
      return { changed };
    });
    return { ok: true, state: view(room, me, since, t) };
  }

  async function handle(body) {
    const data = body && typeof body === 'object' ? body : {};
    const name = String(data.op || '');
    try {
      if (name === 'create') return await create(data);
      if (name === 'join') return await join(data);
      if (name === 'poll' || Object.prototype.hasOwnProperty.call(OPS, name)) return await op(name, data);
      throw new GameError('Opération inconnue.');
    } catch (err) {
      if (!(err instanceof GameError)) {
        console.error(err);
        return { error: 'Oups, un court-circuit côté serveur !' };
      }
      return { error: err.message, gone: err.cause === 'gone' || undefined };
    }
  }

  return { handle };
}

module.exports = { createRooms };
