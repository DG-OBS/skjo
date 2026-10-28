'use strict';

// Règles du Skyjo : 150 cartes, grille de 3 lignes x 4 colonnes par joueur.
// La cellule i se trouve en colonne i % 4 et en ligne Math.floor(i / 4).
const COLS = 4;
const CELLS = 12;
const DEFAULT_END_SCORE = 100;

class GameError extends Error {}

function createDeck() {
  const deck = [];
  const add = (value, count) => { for (let i = 0; i < count; i++) deck.push(value); };
  add(-2, 5);
  add(-1, 10);
  add(0, 15);
  for (let v = 1; v <= 12; v++) add(v, 10);
  return deck;
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function columnIndexes(col) {
  return [col, col + COLS, col + 2 * COLS];
}

function hiddenCount(grid) {
  return grid.filter(c => !c.removed && !c.revealed).length;
}

function visibleSum(grid) {
  return grid.reduce((s, c) => s + (!c.removed && c.revealed ? c.value : 0), 0);
}

function gridScore(grid) {
  return grid.reduce((s, c) => s + (c.removed ? 0 : c.value), 0);
}

class Game {
  constructor(playerIds, { rng = Math.random, endScore = DEFAULT_END_SCORE } = {}) {
    if (playerIds.length < 2 || playerIds.length > 8) {
      throw new GameError('Il faut entre 2 et 8 joueurs.');
    }
    this.rng = rng;
    this.endScore = endScore;
    this.players = playerIds.map(id => ({
      id, grid: [], total: 0, roundScores: [], revealsLeft: 2, lastRoundScore: null, doubled: false,
    }));
    this.round = 0;
    this.prevFinisherId = null;
    this.winners = [];
    this.startRound();
  }

  // ---------- Déroulement ----------

  startRound() {
    this.round++;
    this.deck = shuffle(createDeck(), this.rng);
    for (const p of this.players) {
      p.grid = Array.from({ length: CELLS }, () => ({ value: this.deck.pop(), revealed: false, removed: false }));
      p.revealsLeft = 2;
      p.lastRoundScore = null;
      p.doubled = false;
    }
    this.discard = [this.deck.pop()];
    this.phase = 'reveal';
    this.current = null;
    this.step = null;
    this.drawn = null;
    this.drawnFrom = null;
    this.finisher = null;
    return [{ type: 'roundStart', round: this.round }];
  }

  nextRound() {
    if (this.phase !== 'roundEnd') throw new GameError('La manche n\'est pas terminée.');
    return this.startRound();
  }

  act(playerId, action) {
    const cell = action.cell;
    switch (action.type) {
      case 'reveal': return this.initialReveal(playerId, cell);
      case 'draw': return this.drawFromDeck(playerId);
      case 'take': return this.takeDiscard(playerId);
      case 'swap': return this.swap(playerId, cell);
      case 'discard': return this.discardDrawn(playerId);
      case 'flip': return this.flip(playerId, cell);
      default: throw new GameError('Action inconnue.');
    }
  }

  indexOf(playerId) {
    const i = this.players.findIndex(p => p.id === playerId);
    if (i < 0) throw new GameError('Joueur inconnu.');
    return i;
  }

  checkCell(p, cell) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) throw new GameError('Carte invalide.');
    if (p.grid[cell].removed) throw new GameError('Cette carte a été pulvérisée !');
    return p.grid[cell];
  }

  initialReveal(playerId, cell) {
    if (this.phase !== 'reveal') throw new GameError('Ce n\'est pas le moment de retourner des cartes.');
    const p = this.players[this.indexOf(playerId)];
    if (p.revealsLeft <= 0) throw new GameError('Tu as déjà retourné tes 2 cartes.');
    const c = this.checkCell(p, cell);
    if (c.revealed) throw new GameError('Cette carte est déjà retournée.');
    c.revealed = true;
    p.revealsLeft--;
    const events = [{ type: 'flip', player: playerId, cell, value: c.value }];
    if (this.players.every(pl => pl.revealsLeft === 0)) this.beginPlay(events);
    return events;
  }

  beginPlay(events) {
    let starter = this.players.findIndex(p => p.id === this.prevFinisherId);
    let reason = 'finisher';
    if (starter < 0) {
      reason = 'highest';
      starter = 0;
      this.players.forEach((p, i) => {
        if (visibleSum(p.grid) > visibleSum(this.players[starter].grid)) starter = i;
      });
    }
    this.phase = 'playing';
    this.current = starter;
    this.step = 'draw';
    events.push({ type: 'turn', player: this.players[starter].id, reason });
  }

  assertTurn(playerId, ...steps) {
    if (this.phase !== 'playing') throw new GameError('La partie n\'est pas en cours.');
    if (this.players[this.current].id !== playerId) throw new GameError('Patience, ce n\'est pas ton tour !');
    if (!steps.includes(this.step)) throw new GameError('Action impossible maintenant.');
    return this.players[this.current];
  }

  ensureDeck(events) {
    if (this.deck.length > 0) return;
    const top = this.discard.pop();
    this.deck = shuffle(this.discard, this.rng);
    this.discard = top === undefined ? [] : [top];
    if (this.deck.length === 0) throw new GameError('Plus aucune carte disponible.');
    events.push({ type: 'reshuffle' });
  }

  drawFromDeck(playerId) {
    this.assertTurn(playerId, 'draw');
    const events = [];
    this.ensureDeck(events);
    this.drawn = this.deck.pop();
    this.drawnFrom = 'deck';
    this.step = 'decide';
    events.push({ type: 'draw', player: playerId, from: 'deck', value: this.drawn });
    return events;
  }

  takeDiscard(playerId) {
    this.assertTurn(playerId, 'draw');
    if (this.discard.length === 0) throw new GameError('La défausse est vide.');
    this.drawn = this.discard.pop();
    this.drawnFrom = 'discard';
    this.step = 'place';
    return [{ type: 'draw', player: playerId, from: 'discard', value: this.drawn }];
  }

  swap(playerId, cell) {
    const p = this.assertTurn(playerId, 'decide', 'place');
    const c = this.checkCell(p, cell);
    const old = c.value;
    const wasRevealed = c.revealed;
    c.value = this.drawn;
    c.revealed = true;
    this.discard.push(old);
    const events = [{ type: 'swap', player: playerId, cell, value: this.drawn, old, wasRevealed }];
    this.drawn = null;
    this.afterAction(events);
    return events;
  }

  discardDrawn(playerId) {
    this.assertTurn(playerId, 'decide');
    this.discard.push(this.drawn);
    const events = [{ type: 'discard', player: playerId, value: this.drawn }];
    this.drawn = null;
    this.step = 'flip';
    return events;
  }

  flip(playerId, cell) {
    const p = this.assertTurn(playerId, 'flip');
    const c = this.checkCell(p, cell);
    if (c.revealed) throw new GameError('Choisis une carte encore cachée.');
    c.revealed = true;
    const events = [{ type: 'flip', player: playerId, cell, value: c.value }];
    this.afterAction(events);
    return events;
  }

  checkColumns(p, events) {
    for (let col = 0; col < COLS; col++) {
      const cells = columnIndexes(col).map(i => p.grid[i]);
      if (cells.some(c => c.removed || !c.revealed)) continue;
      if (cells.every(c => c.value === cells[0].value)) {
        cells.forEach(c => { c.removed = true; this.discard.push(c.value); });
        events.push({ type: 'column', player: p.id, col, value: cells[0].value });
      }
    }
  }

  afterAction(events) {
    const p = this.players[this.current];
    this.checkColumns(p, events);
    if (this.finisher === null && hiddenCount(p.grid) === 0) {
      this.finisher = this.current;
      events.push({ type: 'finisher', player: p.id });
    }
    this.drawnFrom = null;
    this.current = (this.current + 1) % this.players.length;
    if (this.finisher !== null && this.current === this.finisher) {
      this.endRound(events);
    } else {
      this.step = 'draw';
      events.push({ type: 'turn', player: this.players[this.current].id, lastTurn: this.finisher !== null });
    }
  }

  endRound(events) {
    this.step = null;
    for (const p of this.players) {
      p.grid.forEach(c => { if (!c.removed) c.revealed = true; });
      this.checkColumns(p, events);
    }
    const finisher = this.players[this.finisher];
    for (const p of this.players) p.lastRoundScore = gridScore(p.grid);
    const othersMin = Math.min(...this.players.filter(p => p !== finisher).map(p => p.lastRoundScore));
    if (finisher.lastRoundScore > 0 && othersMin <= finisher.lastRoundScore) {
      finisher.lastRoundScore *= 2;
      finisher.doubled = true;
    }
    for (const p of this.players) {
      p.roundScores.push(p.lastRoundScore);
      p.total += p.lastRoundScore;
    }
    this.prevFinisherId = finisher.id;
    events.push({
      type: 'roundEnd',
      round: this.round,
      finisher: finisher.id,
      scores: this.players.map(p => ({ id: p.id, score: p.lastRoundScore, doubled: p.doubled, total: p.total })),
    });
    if (this.players.some(p => p.total >= this.endScore)) {
      const best = Math.min(...this.players.map(p => p.total));
      this.winners = this.players.filter(p => p.total === best).map(p => p.id);
      this.phase = 'gameOver';
      events.push({ type: 'gameOver', winners: this.winners });
    } else {
      this.phase = 'roundEnd';
    }
  }

  // ---------- Vue envoyée aux clients (les cartes cachées restent secrètes) ----------

  view() {
    return {
      phase: this.phase,
      round: this.round,
      endScore: this.endScore,
      current: this.current === null ? null : this.players[this.current].id,
      step: this.step,
      drawn: this.drawn,
      drawnFrom: this.drawnFrom,
      deckCount: this.deck.length,
      discardTop: this.discard.length ? this.discard[this.discard.length - 1] : null,
      discardCount: this.discard.length,
      finisher: this.finisher === null ? null : this.players[this.finisher].id,
      winners: this.winners,
      players: this.players.map(p => ({
        id: p.id,
        total: p.total,
        roundScores: p.roundScores,
        revealsLeft: p.revealsLeft,
        lastRoundScore: p.lastRoundScore,
        doubled: p.doubled,
        visibleSum: visibleSum(p.grid),
        grid: p.grid.map(c => ({ value: c.revealed ? c.value : null, revealed: c.revealed, removed: c.removed })),
      })),
    };
  }
}

module.exports = { Game, GameError, createDeck, columnIndexes, hiddenCount, visibleSum, gridScore, COLS, CELLS };
