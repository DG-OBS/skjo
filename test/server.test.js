'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { server } = require('../server/index');

function emit(sock, event, data) {
  return new Promise(resolve => sock.emit(event, data, resolve));
}

// Garde en mémoire le dernier état reçu, pour ne rater aucun message.
const latest = new WeakMap();
function track(sock) {
  sock.on('state', msg => latest.set(sock, msg));
  return sock;
}

async function waitFor(sock, predicate, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const msg = latest.get(sock);
    if (msg && predicate(msg)) return msg;
    await new Promise(r => setTimeout(r, 20));
  }
  throw new Error('délai dépassé');
}

test('deux humains et un robot jouent ensemble via Socket.IO', { timeout: 30000 }, async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  const alice = track(connect(url, { transports: ['websocket'] }));
  const bob = connect(url, { transports: ['websocket'] });
  try {
    const created = await emit(alice, 'create', { name: 'Alice', avatar: 2 });
    assert.ok(created.code && created.token);

    const badJoin = await emit(bob, 'join', { code: 'ZZZZ', name: 'Bob' });
    assert.match(badJoin.error, /Aucune salle/);

    const joined = await emit(bob, 'join', { code: created.code, name: 'Bob', avatar: 4 });
    assert.ok(joined.ok);

    const notHost = await emit(bob, 'addBot', { level: 'malin' });
    assert.match(notHost.error, /chef/);
    assert.ok((await emit(alice, 'addBot', { level: 'facile' })).ok);

    assert.ok((await emit(alice, 'start', {})).ok);
    const { room } = await waitFor(alice, m => m.room.game && m.room.game.phase === 'reveal');
    assert.equal(room.players.length, 3);

    // Les cartes cachées ne fuitent jamais vers les clients.
    for (const p of room.game.players) assert.ok(p.grid.every(c => c.revealed || c.value === null));

    for (const s of [alice, bob]) {
      assert.ok((await emit(s, 'action', { type: 'reveal', cell: 0 })).ok);
      assert.ok((await emit(s, 'action', { type: 'reveal', cell: 4 })).ok);
    }
    const st = await waitFor(alice, m => m.room.game.phase === 'playing');
    const ids = { [joined.playerId]: bob, [created.playerId]: alice };

    // Joue quelques tours humains (le robot joue tout seul entre les deux).
    let turns = 0;
    let state = st;
    while (turns < 4 && state.room.game.phase === 'playing') {
      const g = state.room.game;
      const sock = ids[g.current];
      if (sock && g.step === 'draw') {
        const wrong = sock === alice ? bob : alice;
        assert.match((await emit(wrong, 'action', { type: 'draw' })).error, /ton tour/);
        assert.ok((await emit(sock, 'action', { type: 'draw' })).ok);
        const me = g.players.find(p => p.id === g.current);
        const cell = me.grid.findIndex(c => !c.removed);
        const before = latest.get(alice);
        assert.ok((await emit(sock, 'action', { type: 'swap', cell })).ok);
        turns++;
        await waitFor(alice, m => m !== before && m.room.game.step !== 'decide');
      }
      state = await waitFor(alice, m => !m.room.game || m.room.game.phase !== 'playing' || (ids[m.room.game.current] && m.room.game.step === 'draw'));
    }
    assert.equal(turns, 4);

    // Reconnexion avec le jeton après un rechargement de page.
    bob.disconnect();
    const bob2 = connect(url, { transports: ['websocket'] });
    const rejoin = await emit(bob2, 'join', { code: created.code, token: joined.token });
    assert.equal(rejoin.playerId, joined.playerId);
    bob2.disconnect();
  } finally {
    alice.disconnect();
    bob.disconnect();
    await new Promise(r => server.close(r));
  }
});
