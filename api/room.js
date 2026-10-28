'use strict';

// Fonction serverless Vercel : toute l'API du jeu passe par POST /api/room.
const { createRooms } = require('../server/rooms');
const { createStore } = require('../server/store');

const store = createStore();
const rooms = createRooms(store, { endScore: Number(process.env.END_SCORE) || 100 });

const MISSING_DB = 'Base de données absente : connecte « Upstash for Redis » au projet dans Vercel (onglet Storage), puis redéploie.';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Utilise POST.' });
  // Sans Redis, chaque instance aurait sa propre mémoire : les joueurs ne se verraient pas.
  if (store.kind !== 'redis') return res.status(200).json({ error: MISSING_DB });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  return res.status(200).json(await rooms.handle(body));
};
