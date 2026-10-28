'use strict';

// Stockage des salles. Sur Vercel chaque requête peut tomber sur une instance différente,
// donc l'état vit dans Upstash Redis. En local (ou pour les tests) une Map suffit.
// Les écritures sont « compare-and-set » sur un numéro de version pour éviter que deux
// requêtes simultanées s'écrasent.

const ROOM_TTL_SECONDS = 6 * 60 * 60;

const CAS_SCRIPT = `
local v = redis.call('GET', KEYS[2])
if (v or '0') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
return 1`;

function memoryStore() {
  const rooms = new Map();
  const alive = entry => entry && entry.expires > Date.now();
  return {
    kind: 'memory',
    async get(code) {
      const e = rooms.get(code);
      return alive(e) ? JSON.parse(e.json) : null;
    },
    async cas(code, prevVersion, room) {
      const e = rooms.get(code);
      const current = alive(e) ? e.version : 0;
      if (current !== prevVersion) return false;
      rooms.set(code, { json: JSON.stringify(room), version: room.version, expires: Date.now() + ROOM_TTL_SECONDS * 1000 });
      return true;
    },
  };
}

function redisStore(url, token) {
  const { Redis } = require('@upstash/redis');
  const redis = new Redis({ url, token, automaticDeserialization: false });
  return {
    kind: 'redis',
    async get(code) {
      const json = await redis.get(`room:${code}`);
      return json ? JSON.parse(json) : null;
    },
    async cas(code, prevVersion, room) {
      const ok = await redis.eval(CAS_SCRIPT, [`room:${code}`, `room:${code}:v`],
        [String(prevVersion), JSON.stringify(room), String(room.version), String(ROOM_TTL_SECONDS)]);
      return Number(ok) === 1;
    },
  };
}

function createStore(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return redisStore(url, token);
  return memoryStore();
}

module.exports = { createStore, memoryStore };
