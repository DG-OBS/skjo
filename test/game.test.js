'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, GameError, createDeck } = require('../server/game');
const { botAction } = require('../server/bot');

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function revealAll(game) {
  for (const p of game.players) {
    game.act(p.id, { type: 'reveal', cell: 0 });
    game.act(p.id, { type: 'reveal', cell: 1 });
  }
}

test('le paquet contient 150 cartes avec la bonne répartition', () => {
  const deck = createDeck();
  assert.equal(deck.length, 150);
  const count = v => deck.filter(x => x === v).length;
  assert.equal(count(-2), 5);
  assert.equal(count(-1), 10);
  assert.equal(count(0), 15);
  for (let v = 1; v <= 12; v++) assert.equal(count(v), 10);
});

test('distribution : 12 cartes cachées par joueur et une défausse', () => {
  const g = new Game(['a', 'b', 'c'], { rng: seeded(1) });
  assert.equal(g.phase, 'reveal');
  for (const p of g.players) {
    assert.equal(p.grid.length, 12);
    assert.ok(p.grid.every(c => !c.revealed));
  }
  assert.equal(g.discard.length, 1);
  assert.equal(g.deck.length, 150 - 36 - 1);
});

test('la vue cache les cartes non retournées', () => {
  const g = new Game(['a', 'b'], { rng: seeded(2) });
  g.act('a', { type: 'reveal', cell: 3 });
  const v = g.view();
  assert.equal(v.players[0].grid[3].value, g.players[0].grid[3].value);
  assert.equal(v.players[0].grid[0].value, null);
  assert.equal(v.players[1].grid[0].value, null);
});

test('le joueur avec le plus gros total visible commence', () => {
  const g = new Game(['a', 'b'], { rng: seeded(3) });
  g.players[0].grid[0].value = 1; g.players[0].grid[1].value = 1;
  g.players[1].grid[0].value = 9; g.players[1].grid[1].value = 9;
  revealAll(g);
  assert.equal(g.phase, 'playing');
  assert.equal(g.view().current, 'b');
});

test('on ne peut pas jouer hors de son tour', () => {
  const g = new Game(['a', 'b'], { rng: seeded(4) });
  revealAll(g);
  const other = g.view().current === 'a' ? 'b' : 'a';
  assert.throws(() => g.act(other, { type: 'draw' }), GameError);
});

test('prendre la défausse oblige à échanger', () => {
  const g = new Game(['a', 'b'], { rng: seeded(5) });
  revealAll(g);
  const cur = g.view().current;
  g.act(cur, { type: 'take' });
  assert.throws(() => g.act(cur, { type: 'discard' }), GameError);
  g.act(cur, { type: 'swap', cell: 5 });
  assert.notEqual(g.view().current, cur);
});

test('piocher, jeter puis retourner une carte cachée', () => {
  const g = new Game(['a', 'b'], { rng: seeded(6) });
  revealAll(g);
  const cur = g.view().current;
  g.act(cur, { type: 'draw' });
  g.act(cur, { type: 'discard' });
  assert.throws(() => g.act(cur, { type: 'flip', cell: 0 }), GameError); // déjà retournée
  g.act(cur, { type: 'flip', cell: 7 });
  assert.ok(g.players.find(p => p.id === cur).grid[7].revealed);
});

test('trois cartes identiques dans une colonne sont pulvérisées', () => {
  const g = new Game(['a', 'b'], { rng: seeded(7) });
  revealAll(g);
  const cur = g.view().current;
  const p = g.players.find(x => x.id === cur);
  // Colonne 2 : cellules 2, 6, 10
  p.grid[2] = { value: 7, revealed: true, removed: false };
  p.grid[6] = { value: 7, revealed: true, removed: false };
  p.grid[10] = { value: 3, revealed: false, removed: false };
  g.act(cur, { type: 'draw' });
  g.drawn = 7;
  const events = g.act(cur, { type: 'swap', cell: 10 });
  assert.ok(events.some(e => e.type === 'column' && e.col === 2 && e.value === 7));
  assert.ok([2, 6, 10].every(i => p.grid[i].removed));
});

test('celui qui finit sans le plus petit score voit ses points doublés', () => {
  const g = new Game(['a', 'b'], { rng: seeded(8) });
  revealAll(g);
  g.current = 0;
  const [a, b] = g.players;
  a.grid = Array.from({ length: 12 }, (_, i) => ({ value: (i % 3) + 1, revealed: i !== 11, removed: false }));
  b.grid = Array.from({ length: 12 }, () => ({ value: 0, revealed: false, removed: false }));
  b.grid[0].revealed = true;
  g.act('a', { type: 'draw' });
  g.act('a', { type: 'discard' });
  const ev1 = g.act('a', { type: 'flip', cell: 11 });
  assert.ok(ev1.some(e => e.type === 'finisher' && e.player === 'a'));
  g.act('b', { type: 'draw' });
  g.act('b', { type: 'discard' });
  const ev2 = g.act('b', { type: 'flip', cell: 5 });
  const end = ev2.find(e => e.type === 'roundEnd');
  assert.ok(end, 'la manche doit être terminée');
  assert.equal(a.lastRoundScore, 24 * 2);
  assert.equal(a.doubled, true);
  assert.equal(b.lastRoundScore, 0);
});

test('la partie se termine à 100 points et le plus petit total gagne', () => {
  const g = new Game(['a', 'b'], { rng: seeded(9), endScore: 100 });
  g.players[0].total = 95;
  revealAll(g);
  g.current = 0;
  g.players[0].grid.forEach((c, i) => { c.value = 10; c.revealed = i !== 0; });
  g.players[0].grid[0].value = 9;
  g.act('a', { type: 'draw' });
  g.act('a', { type: 'discard' });
  g.act('a', { type: 'flip', cell: 0 });
  const ev = g.act('b', { type: 'draw' }).concat(g.act('b', { type: 'discard' }));
  const hidden = g.players[1].grid.findIndex(c => !c.revealed && !c.removed);
  ev.push(...g.act('b', { type: 'flip', cell: hidden }));
  assert.equal(g.phase, 'gameOver');
  assert.deepEqual(g.winners, ['b']);
});

test('des parties complètes entre robots se terminent sans erreur', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const rng = seeded(seed);
    const n = 2 + (seed % 7);
    const ids = Array.from({ length: n }, (_, i) => `r${i}`);
    const g = new Game(ids, { rng });
    let guard = 0;
    while (g.phase !== 'gameOver') {
      assert.ok(guard++ < 50000, 'boucle infinie ?');
      if (g.phase === 'roundEnd') { g.nextRound(); continue; }
      const actor = g.phase === 'reveal'
        ? g.players.find(p => p.revealsLeft > 0)
        : g.players[g.current];
      const level = Number(actor.id.slice(1)) % 2 ? 'facile' : 'malin';
      g.act(actor.id, botAction(g, actor.id, level, rng));
    }
    assert.ok(g.players.some(p => p.total >= 100));
    const best = Math.min(...g.players.map(p => p.total));
    assert.ok(g.winners.every(id => g.players.find(p => p.id === id).total === best));
  }
});

test('le robot malin bat le robot rigolo la plupart du temps', () => {
  let malinWins = 0;
  const games = 60;
  for (let seed = 100; seed < 100 + games; seed++) {
    const rng = seeded(seed);
    const g = new Game(['malin', 'facile'], { rng });
    while (g.phase !== 'gameOver') {
      if (g.phase === 'roundEnd') { g.nextRound(); continue; }
      const actor = g.phase === 'reveal' ? g.players.find(p => p.revealsLeft > 0) : g.players[g.current];
      g.act(actor.id, botAction(g, actor.id, actor.id, rng));
    }
    if (g.winners.includes('malin')) malinWins++;
  }
  assert.ok(malinWins > games * 0.6, `malin n'a gagné que ${malinWins}/${games}`);
});
