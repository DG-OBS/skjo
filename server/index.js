'use strict';

// Serveur local : même API que la fonction Vercel (api/room.js), plus les fichiers statiques.
const path = require('path');
const express = require('express');
const { createRooms } = require('./rooms');
const { createStore } = require('./store');

const PORT = process.env.PORT || 3000;

function createApp({ store = createStore(), endScore = Number(process.env.END_SCORE) || 100 } = {}) {
  const rooms = createRooms(store, { endScore });
  const app = express();
  app.use(express.json({ limit: '20kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.post('/api/room', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await rooms.handle(req.body));
  });
  app.get('/health', (req, res) => res.json({ ok: true, store: store.kind }));
  return app;
}

if (require.main === module) {
  createApp().listen(PORT, () => console.log(`🤖 Robo-Skyjo prêt sur http://localhost:${PORT}`));
}

module.exports = { createApp };
