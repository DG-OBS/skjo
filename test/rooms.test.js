'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRooms } = require('../server/rooms');
const { memoryStore } = require('../server/store');
const { createApp } = require('../server/index');

// Horloge contrôlée : les robots jouent quand le temps avance.
function setup(opts = {}) {
  let t = 1_000_000;
  const clock = { now: () => t, tick: ms => { t += ms; } };
  const store = memoryStore();
  const rooms = createRooms(store, { now: clock.now, ...opts });
  return { rooms, store, clock };
}

test('créer, rejoindre, ajouter un robot et lancer une partie', async () => {
  const { rooms } = setup();
  const a = await rooms.handle({ op: 'create', name: 'Alice', avatar: 1 });
  assert.ok(a.ok && a.code.length === 4);
  assert.match((await rooms.handle({ op: 'join', code: 'ZZZZ', name: 'Bob' })).error, /Aucune salle/);
  const b = await rooms.handle({ op: 'join', code: a.code, name: 'Bob' });
  assert.ok(b.ok);
  assert.match((await rooms.handle({ op: 'addBot', code: a.code, token: b.token })).error, /chef/);
  assert.ok((await rooms.handle({ op: 'addBot', code: a.code, token: a.token, level: 'malin' })).ok);
  const started = await rooms.handle({ op: 'start', code: a.code, token: a.token });
  assert.equal(started.state.room.game.phase, 'reveal');
  assert.equal(started.state.room.players.length, 3);
  assert.match((await rooms.handle({ op: 'join', code: a.code, name: 'Carl' })).error, /déjà commencé/);
});

test('les cartes cachées ne sont jamais envoyées au client', async () => {
  const { rooms } = setup();
  const a = await rooms.handle({ op: 'create', name: 'A' });
  await rooms.handle({ op: 'addBot', code: a.code, token: a.token });
  const s = await rooms.handle({ op: 'start', code: a.code, token: a.token });
  for (const p of s.state.room.game.players) assert.ok(p.grid.every(c => c.revealed || c.value === null));
});

test('les événements sont livrés une seule fois grâce à « since »', async () => {
  const { rooms } = setup();
  const a = await rooms.handle({ op: 'create', name: 'A' });
  let since = a.state.seq;
  await rooms.handle({ op: 'addBot', code: a.code, token: a.token, since });
  const p1 = await rooms.handle({ op: 'poll', code: a.code, token: a.token, since });
  assert.ok(p1.state.events.some(e => e.type === 'joined'));
  since = p1.state.seq;
  const p2 = await rooms.handle({ op: 'poll', code: a.code, token: a.token, since });
  assert.equal(p2.state.events.length, 0);
});

test('les robots jouent quand le temps passe, et une partie complète se termine', async () => {
  const { rooms, clock } = setup({ endScore: 40 });
  const a = await rooms.handle({ op: 'create', name: 'A' });
  await rooms.handle({ op: 'addBot', code: a.code, token: a.token, level: 'malin' });
  await rooms.handle({ op: 'addBot', code: a.code, token: a.token, level: 'facile' });
  let st = (await rooms.handle({ op: 'start', code: a.code, token: a.token })).state;
  const poll = async () => (await rooms.handle({ op: 'poll', code: a.code, token: a.token })).state;

  for (let i = 0; i < 5000 && st.room.game.phase !== 'gameOver'; i++) {
    const g = st.room.game;
    const me = g.players.find(p => p.id === a.playerId);
    let res = null;
    if (g.phase === 'reveal' && me.revealsLeft > 0) {
      res = await rooms.handle({ op: 'action', code: a.code, token: a.token, type: 'reveal', cell: me.grid.findIndex(c => !c.revealed) });
    } else if (g.phase === 'playing' && g.current === a.playerId) {
      const step = { draw: { type: 'draw' }, decide: { type: 'discard' }, flip: { type: 'flip', cell: me.grid.findIndex(c => !c.revealed && !c.removed) } }[g.step];
      res = await rooms.handle({ op: 'action', code: a.code, token: a.token, ...step });
    } else if (g.phase === 'roundEnd') {
      res = await rooms.handle({ op: 'nextRound', code: a.code, token: a.token });
    }
    assert.ok(!res || res.ok, res && res.error);
    clock.tick(1200);
    st = res && res.state ? res.state : await poll();
    if (!res) st = await poll();
  }
  assert.equal(st.room.game.phase, 'gameOver');
  assert.ok(st.room.game.winners.length >= 1);
});

test('un robot ne joue pas avant son délai', async () => {
  const { rooms, clock } = setup();
  const a = await rooms.handle({ op: 'create', name: 'A' });
  await rooms.handle({ op: 'addBot', code: a.code, token: a.token });
  await rooms.handle({ op: 'start', code: a.code, token: a.token });
  for (const cell of [0, 1]) await rooms.handle({ op: 'action', code: a.code, token: a.token, type: 'reveal', cell });
  clock.tick(400);
  let st = (await rooms.handle({ op: 'poll', code: a.code, token: a.token })).state;
  assert.equal(st.room.game.phase, 'playing');
  if (st.room.game.current !== a.playerId) {
    const v = st.version;
    st = (await rooms.handle({ op: 'poll', code: a.code, token: a.token })).state;
    assert.equal(st.version, v, 'le robot a joué trop vite');
    clock.tick(1200);
    st = (await rooms.handle({ op: 'poll', code: a.code, token: a.token })).state;
    assert.ok(st.version > v, 'le robot aurait dû jouer');
  }
});

test('un joueur absent passe en pilote automatique puis récupère sa place', async () => {
  const { rooms, clock } = setup();
  const a = await rooms.handle({ op: 'create', name: 'A' });
  const b = await rooms.handle({ op: 'join', code: a.code, name: 'B' });
  await rooms.handle({ op: 'start', code: a.code, token: a.token });
  for (let i = 0; i < 8; i++) { clock.tick(5000); await rooms.handle({ op: 'poll', code: a.code, token: a.token }); }
  let st = (await rooms.handle({ op: 'poll', code: a.code, token: a.token })).state;
  assert.equal(st.room.players.find(p => p.id === b.playerId).autopilot, true);
  st = (await rooms.handle({ op: 'join', code: a.code, token: b.token })).state;
  assert.equal(st.room.players.find(p => p.id === b.playerId).autopilot, false);
});

test('le chef peut retirer un joueur, qui reçoit « gone »', async () => {
  const { rooms } = setup();
  const a = await rooms.handle({ op: 'create', name: 'A' });
  const b = await rooms.handle({ op: 'join', code: a.code, name: 'B' });
  await rooms.handle({ op: 'kick', code: a.code, token: a.token, id: b.playerId });
  const res = await rooms.handle({ op: 'poll', code: a.code, token: b.token });
  assert.equal(res.gone, true);
});

test('les écritures simultanées ne se perdent pas', async () => {
  const { rooms } = setup();
  const a = await rooms.handle({ op: 'create', name: 'A' });
  await Promise.all(Array.from({ length: 6 }, () => rooms.handle({ op: 'addBot', code: a.code, token: a.token })));
  const st = (await rooms.handle({ op: 'poll', code: a.code, token: a.token })).state;
  assert.equal(st.room.players.length, 7);
});

test('API HTTP locale : POST /api/room', async () => {
  const server = createApp({ store: memoryStore() }).listen(0);
  try {
    const url = `http://localhost:${server.address().port}/api/room`;
    const post = body => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    const a = await post({ op: 'create', name: 'Léo', avatar: 3 });
    assert.ok(a.ok);
    assert.equal(a.state.room.players[0].name, 'Léo');
    assert.match((await post({ op: 'pirate' })).error, /inconnue/);
  } finally {
    server.close();
  }
});
