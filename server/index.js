'use strict';

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Game, GameError } = require('./game');
const { botAction, botChat } = require('./bot');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const AVATARS = 10;
const AUTOPILOT_DELAY = 20000;
const ROOM_TTL = 30 * 60 * 1000;
const END_SCORE = Number(process.env.END_SCORE) || 100;

const BOT_NAMES = [
  'Boulon', 'Clank', 'Turbo-Grille-Pain', 'Bip-Bip', 'Écrou-Man',
  'Rouillette', 'Chaussette-Tron', 'Vis-Sans-Fin', 'Pixel', 'Giga-Watt',
];

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

const server = http.createServer(app);
const io = new Server(server);

/** @type {Map<string, any>} */
const rooms = new Map();

// ---------- Utilitaires ----------

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
  } while (rooms.has(code));
  return code;
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

function roomView(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar, isBot: p.isBot, level: p.level,
      connected: p.isBot || p.connected, autopilot: p.autopilot,
    })),
    game: room.game ? room.game.view() : null,
  };
}

function broadcast(room, events = []) {
  room.lastActivity = Date.now();
  const view = roomView(room);
  for (const p of room.players) {
    if (!p.isBot && p.socketId) io.to(p.socketId).emit('state', { room: view, you: p.id, events });
  }
  scheduleBots(room);
}

function playerName(room, id) {
  const p = room.players.find(pl => pl.id === id);
  return p ? p.name : '?';
}

// Les robots ont des choses à dire selon ce qui vient de se passer.
function botReactions(room, events) {
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
    if (e.type === 'flip' && room.game.phase === 'playing' && e.value >= 11) say(e.player, 'badCard', 0.5);
    if (e.type === 'roundStart') {
      const bots = room.players.filter(p => p.isBot);
      if (bots.length) say(bots[Math.floor(Math.random() * bots.length)].id, 'roundStart', 0.7);
    }
    if (e.type === 'gameOver') {
      room.players.filter(p => p.isBot).forEach(p => say(p.id, e.winners.includes(p.id) ? 'win' : 'lose', 0.8));
    }
  }
  return events.concat(out);
}

function applyAction(room, playerId, action) {
  const events = room.game.act(playerId, action);
  broadcast(room, botReactions(room, events));
}

// ---------- Les robots jouent tout seuls ----------

function scheduleBots(room) {
  clearTimeout(room.botTimer);
  const game = room.game;
  if (!game) return;
  let actor = null;
  if (game.phase === 'reveal') {
    actor = room.players.find(p => isAuto(p) && game.players.find(gp => gp.id === p.id).revealsLeft > 0);
  } else if (game.phase === 'playing') {
    const cur = room.players.find(p => p.id === game.players[game.current].id);
    if (cur && isAuto(cur)) actor = cur;
  }
  if (!actor) return;
  const delay = game.phase === 'reveal' ? 450 : 900 + Math.random() * 700;
  room.botTimer = setTimeout(() => {
    if (room.game !== game) return;
    const action = botAction(game, actor.id, actor.level || 'malin');
    if (!action) return;
    try {
      applyAction(room, actor.id, action);
    } catch (err) {
      console.error('Erreur robot', err);
    }
  }, delay);
}

// ---------- Connexions ----------

function newPlayer(socket, { name, avatar }) {
  return {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    name: cleanName(name),
    avatar: cleanAvatar(avatar),
    isBot: false,
    connected: true,
    autopilot: false,
    socketId: socket.id,
  };
}

function attach(socket, room, player) {
  socket.data.code = room.code;
  socket.data.playerId = player.id;
  socket.join(room.code);
}

function currentRoom(socket) {
  const room = rooms.get(socket.data.code);
  if (!room) throw new GameError('Salle introuvable.');
  const player = room.players.find(p => p.id === socket.data.playerId);
  if (!player) throw new GameError('Tu ne fais plus partie de cette salle.');
  return { room, player };
}

function requireHost(room, player) {
  if (room.hostId !== player.id) throw new GameError('Seul le chef de la salle peut faire ça.');
}

function ensureHost(room) {
  const host = room.players.find(p => p.id === room.hostId);
  if (host && !host.isBot && host.connected && !host.left) return;
  const next = room.players.find(p => !p.isBot && p.connected && !p.left);
  if (next) room.hostId = next.id;
}

function handler(socket, fn) {
  return (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      reply(fn(payload || {}) || { ok: true });
    } catch (err) {
      if (!(err instanceof GameError)) console.error(err);
      reply({ error: err instanceof GameError ? err.message : 'Oups, un court-circuit côté serveur !' });
    }
  };
}

io.on('connection', socket => {
  const lastEmote = { t: 0 };

  socket.on('create', handler(socket, data => {
    const player = newPlayer(socket, data);
    const room = { code: makeCode(), hostId: player.id, players: [player], game: null, lastActivity: Date.now() };
    rooms.set(room.code, room);
    attach(socket, room, player);
    broadcast(room, [{ type: 'joined', player: player.id }]);
    return { ok: true, code: room.code, playerId: player.id, token: player.token };
  }));

  socket.on('join', handler(socket, data => {
    const code = String(data.code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) throw new GameError('Aucune salle avec ce code. Vérifie les lettres !');

    const existing = data.token && room.players.find(p => p.token === data.token);
    if (existing) {
      existing.socketId = socket.id;
      existing.connected = true;
      existing.left = false;
      existing.autopilot = false;
      clearTimeout(existing.autoTimer);
      attach(socket, room, existing);
      ensureHost(room);
      broadcast(room, [{ type: 'reconnected', player: existing.id }]);
      return { ok: true, code, playerId: existing.id, token: existing.token };
    }

    if (room.game) throw new GameError('La partie a déjà commencé. Attends la prochaine !');
    if (room.players.length >= MAX_PLAYERS) throw new GameError('La salle est pleine (8 joueurs max).');
    const player = newPlayer(socket, data);
    room.players.push(player);
    attach(socket, room, player);
    broadcast(room, [{ type: 'joined', player: player.id }]);
    return { ok: true, code, playerId: player.id, token: player.token };
  }));

  socket.on('addBot', handler(socket, data => {
    const { room, player } = currentRoom(socket);
    requireHost(room, player);
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
      level: data.level === 'facile' ? 'facile' : 'malin', connected: true, autopilot: false,
    };
    room.players.push(bot);
    broadcast(room, [{ type: 'joined', player: bot.id }, { type: 'chat', player: bot.id, text: 'Bip boup ! Prêt à jouer !' }]);
  }));

  socket.on('kick', handler(socket, data => {
    const { room, player } = currentRoom(socket);
    requireHost(room, player);
    if (room.game) throw new GameError('Impossible pendant une partie.');
    if (data.id === player.id) throw new GameError('Tu ne peux pas te retirer toi-même.');
    const target = room.players.find(p => p.id === data.id);
    if (!target) return;
    room.players = room.players.filter(p => p !== target);
    if (target.socketId) io.to(target.socketId).emit('kicked');
    broadcast(room, [{ type: 'left', name: target.name }]);
  }));

  socket.on('start', handler(socket, () => {
    const { room, player } = currentRoom(socket);
    requireHost(room, player);
    if (room.game && room.game.phase !== 'gameOver') throw new GameError('La partie est déjà en cours.');
    if (room.players.length < 2) throw new GameError('Il faut au moins 2 joueurs. Ajoute un robot !');
    room.game = new Game(room.players.map(p => p.id), { endScore: END_SCORE });
    broadcast(room, botReactions(room, [{ type: 'roundStart', round: 1 }]));
  }));

  socket.on('action', handler(socket, data => {
    const { room, player } = currentRoom(socket);
    if (!room.game) throw new GameError('Aucune partie en cours.');
    const action = { type: String(data.type || ''), cell: data.cell === undefined ? undefined : Number(data.cell) };
    applyAction(room, player.id, action);
  }));

  socket.on('nextRound', handler(socket, () => {
    const { room, player } = currentRoom(socket);
    requireHost(room, player);
    if (!room.game) throw new GameError('Aucune partie en cours.');
    broadcast(room, botReactions(room, room.game.nextRound()));
  }));

  socket.on('toLobby', handler(socket, () => {
    const { room, player } = currentRoom(socket);
    requireHost(room, player);
    clearTimeout(room.botTimer);
    room.game = null;
    room.players = room.players.filter(p => p.isBot || !p.left);
    broadcast(room, []);
  }));

  socket.on('emote', handler(socket, data => {
    const { room, player } = currentRoom(socket);
    const now = Date.now();
    if (now - lastEmote.t < 1200) return;
    lastEmote.t = now;
    const text = String(data.text || '').slice(0, 40);
    if (!text) return;
    broadcast(room, [{ type: 'emote', player: player.id, text }]);
  }));

  socket.on('leave', handler(socket, () => {
    const { room, player } = currentRoom(socket);
    socket.leave(room.code);
    socket.data.code = null;
    player.socketId = null;
    player.connected = false;
    if (room.game) {
      player.left = true;
      player.autopilot = true;
      broadcast(room, [{ type: 'autopilot', player: player.id }]);
    } else {
      room.players = room.players.filter(p => p !== player);
      ensureHost(room);
      broadcast(room, [{ type: 'left', name: player.name }]);
    }
    ensureHost(room);
  }));

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.data.playerId);
    if (!player || player.socketId !== socket.id) return;
    player.connected = false;
    player.socketId = null;
    ensureHost(room);
    if (room.game) {
      clearTimeout(player.autoTimer);
      player.autoTimer = setTimeout(() => {
        if (player.connected) return;
        player.autopilot = true;
        broadcast(room, [{ type: 'autopilot', player: player.id }]);
      }, AUTOPILOT_DELAY);
      player.autoTimer.unref();
      broadcast(room, [{ type: 'disconnected', player: player.id }]);
    } else {
      // Dans le salon, on garde la place un moment au cas où il recharge la page.
      broadcast(room, [{ type: 'disconnected', player: player.id }]);
    }
  });
});

// Ménage : les salles vides depuis longtemps disparaissent.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const someoneHere = room.players.some(p => !p.isBot && p.connected);
    if (!someoneHere && now - room.lastActivity > ROOM_TTL) {
      clearTimeout(room.botTimer);
      rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`🤖 Robo-Skyjo prêt sur http://localhost:${PORT}`));
}

module.exports = { server, rooms };
