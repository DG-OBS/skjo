'use strict';

const { columnIndexes, hiddenCount, COLS, CELLS } = require('./game');

// Valeur moyenne d'une carte cachée : somme du paquet (760) / 150 cartes.
const HIDDEN_EXPECTED = 760 / 150;

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function cellEstimate(c) {
  return c.revealed ? c.value : HIDDEN_EXPECTED;
}

// Points qu'une colonne rapportera (0 si elle est pulvérisée ou va l'être).
function columnCost(cells) {
  if (cells[0].removed) return 0;
  if (cells.every(c => c.revealed && c.value === cells[0].value)) return 0;
  return cells.reduce((s, c) => s + cellEstimate(c), 0);
}

function estimateScore(grid) {
  let total = 0;
  for (let col = 0; col < COLS; col++) total += columnCost(columnIndexes(col).map(i => grid[i]));
  return total;
}

// Combien de points on gagne en posant `value` sur la cellule `cell`.
function placementGain(grid, cell, value) {
  const idx = columnIndexes(cell % COLS);
  const before = idx.map(i => grid[i]);
  const after = idx.map(i => (i === cell ? { value, revealed: true, removed: false } : grid[i]));
  let gain = columnCost(before) - columnCost(after);
  // Petit bonus quand on prépare une colonne de trois cartes identiques.
  const sameAfter = after.filter(c => c.revealed && c.value === value).length;
  const sameBefore = before.filter(c => c.revealed && c.value === value && c !== grid[cell]).length;
  if (sameAfter === 2 && sameBefore === 1 && value > 0) gain += 1.5;
  return gain;
}

function othersBest(game, me) {
  const others = game.players.filter(p => p !== me).map(p => estimateScore(p.grid));
  return Math.min(...others);
}

// Est-ce risqué de terminer la manche maintenant (risque de points doublés) ?
function finishingIsRisky(game, me, gridAfter) {
  if (game.finisher !== null) return false;
  const mine = estimateScore(gridAfter);
  return mine > 0 && mine >= othersBest(game, me) - 2;
}

function bestPlacement(game, me, value, level) {
  let best = null;
  for (let cell = 0; cell < CELLS; cell++) {
    const c = me.grid[cell];
    if (c.removed) continue;
    let gain = placementGain(me.grid, cell, value);
    if (level === 'malin' && !c.revealed && hiddenCount(me.grid) === 1) {
      const after = me.grid.map((g, i) => (i === cell ? { value, revealed: true, removed: false } : g));
      if (finishingIsRisky(game, me, after)) gain -= 10;
    }
    if (!best || gain > best.gain) best = { cell, gain };
  }
  return best;
}

function chooseFlip(game, me, level, rng) {
  const hidden = me.grid.map((c, i) => i).filter(i => !me.grid[i].removed && !me.grid[i].revealed);
  if (level !== 'malin') return pick(hidden, rng);
  // Préfère retourner une carte dans une colonne qui contient déjà une paire.
  const promising = hidden.filter(i => {
    const vals = columnIndexes(i % COLS).filter(j => j !== i && me.grid[j].revealed).map(j => me.grid[j].value);
    return vals.length === 2 && vals[0] === vals[1];
  });
  return pick(promising.length ? promising : hidden, rng);
}

// Renvoie la prochaine action du robot, ou null s'il n'a rien à faire.
function botAction(game, playerId, level = 'malin', rng = Math.random) {
  const me = game.players.find(p => p.id === playerId);
  if (!me) return null;

  if (game.phase === 'reveal') {
    if (me.revealsLeft <= 0) return null;
    const hidden = me.grid.map((c, i) => i).filter(i => !me.grid[i].revealed);
    return { type: 'reveal', cell: pick(hidden, rng) };
  }
  if (game.phase !== 'playing' || game.players[game.current] !== me) return null;

  const sloppy = level === 'facile' && rng() < 0.3;

  switch (game.step) {
    case 'draw': {
      const top = game.discard[game.discard.length - 1];
      if (top === undefined) return { type: 'draw' };
      if (level === 'facile') return { type: top <= 2 && rng() < 0.7 ? 'take' : 'draw' };
      const best = bestPlacement(game, me, top, level);
      return { type: best.gain >= 3 || (top <= 0 && best.gain > 0) ? 'take' : 'draw' };
    }
    case 'place': {
      if (sloppy) return { type: 'swap', cell: pick(me.grid.map((c, i) => i).filter(i => !me.grid[i].removed), rng) };
      return { type: 'swap', cell: bestPlacement(game, me, game.drawn, level).cell };
    }
    case 'decide': {
      const best = bestPlacement(game, me, game.drawn, level);
      const threshold = level === 'facile' ? 2 : 0.5;
      if (sloppy) return rng() < 0.5 ? { type: 'discard' } : { type: 'swap', cell: best.cell };
      return best.gain > threshold ? { type: 'swap', cell: best.cell } : { type: 'discard' };
    }
    case 'flip':
      return { type: 'flip', cell: chooseFlip(game, me, level, rng) };
    default:
      return null;
  }
}

// ---------- Les robots parlent (avec humour, évidemment) ----------

const LINES = {
  roundStart: [
    'Bip boup ! Mes circuits sont chauds !',
    'Initialisation du mode champion... 87 %...',
    'J\'ai mangé une batterie ce matin, je suis en forme !',
    'Attention, je joue en 4K Ultra HD.',
  ],
  column: [
    'TRIPLE ! Mes lasers sont réglés au millimètre !',
    'Colonne pulvérisée ! Bzzzzt !',
    'Calcul parfait. Comme d\'habitude. 😎',
  ],
  badCard: [
    'Erreur 404 : bonne carte introuvable.',
    'Aïe aïe aïe, ça grince dans mes engrenages...',
    'Je crois que j\'ai un boulon desserré.',
    'Qui a mis du jus d\'orange dans ma carte mère ?',
  ],
  goodCard: [
    'Hé hé hé... *bruit de robot content*',
    'Excellente pioche, merci le Wi-Fi !',
    'Mes capteurs détectent une victoire imminente.',
  ],
  finisher: [
    'J\'AI TOUT RETOURNÉ ! Dernier tour, les humains !',
    'Mode turbo activé ! Plus de cartes cachées !',
  ],
  win: [
    'VICTOIRE ! Je vais fêter ça avec un bain d\'huile.',
    'Les robots dominent le monde... du Skyjo !',
  ],
  lose: [
    'Je demande une mise à jour logicielle...',
    'Ce n\'est pas juste, j\'avais du lag !',
  ],
};

function botChat(kind, rng = Math.random) {
  const lines = LINES[kind];
  return lines ? pick(lines, rng) : null;
}

module.exports = { botAction, botChat, estimateScore, placementGain, HIDDEN_EXPECTED };
