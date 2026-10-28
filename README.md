# 🤖 Robo-Skyjo

Das Kartenspiel **Skyjo** als Multiplayer-Webapp – komplett auf **Französisch**, mit Roboter-Thema, Humor, Animationen und Soundeffekten. Gedacht für Kinder ab ca. 10 Jahren.

## Features

- **Online-Multiplayer** (2–8 Spieler) über einen 4-Buchstaben-Raumcode oder Einladungslink
- **Roboter-Gegner** zum Auffüllen oder Solo-Spielen: *Robot rigolo* (leicht) und *Robot malin* (schwer)
- Alle offiziellen Regeln: 150 Karten, 3×4-Raster, Dreier-Spalten verschwinden, letzte Runde, Verdoppelung für den Beender ohne Bestwert, Spielende bei 100 Punkten
- 10 animierte Roboter-Avatare (blinzeln, Propeller, Scanner-Augen …), Karten-Flip, fliegende Karten, Laser-Spalten-Explosion, Konfetti
- Synthetisierte Roboter-Sounds (kein Download nötig, Stummschalter oben rechts)
- Emotes & freche Sprüche der Bots
- Reconnect nach Neuladen der Seite; bei Verbindungsverlust übernimmt nach 20 s ein Autopilot
- Funktioniert auf Desktop, Tablet und Handy

## Lokal starten

```bash
npm install
npm start          # http://localhost:3000
```

Im gleichen WLAN können andere Geräte über `http://<IP-deines-Rechners>:3000` mitspielen.

## Online stellen auf Vercel

Vercel hält keine dauerhaften Verbindungen offen. Darum fragt der Browser etwa jede Sekunde den Spielstand über die Funktion `api/room.js` ab, und der Spielstand liegt in **Upstash Redis**. Die Bots ziehen bei diesen Abfragen, sobald sie an der Reihe sind.

Einmalige Einrichtung:
1. Vercel-Dashboard → Projekt **skjo** → Tab **Storage** → **Create Database** → **Upstash for Redis** (Gratis-Plan) → mit dem Projekt verbinden. Dadurch werden `KV_REST_API_URL` und `KV_REST_API_TOKEN` automatisch gesetzt.
2. **Deployments** → letztes Deployment → **Redeploy**, damit die neuen Variablen aktiv werden.

Ohne Datenbank zeigt das Spiel beim Klick auf „Créer une partie“ eine entsprechende Meldung an.

Grobe Kosten: Pro Spieler und Minute fallen etwa 60–70 Redis-Befehle an. Der Upstash-Gratis-Plan reicht damit für Dutzende Partien pro Monat.

Alternativ läuft `npm start` auf jedem Node-Host (Render, Railway …), dann ohne Redis mit Speicher im Arbeitsspeicher.

## Entwicklung

```bash
npm test                     # Spiellogik, Bot-KI, Räume und HTTP-API
END_SCORE=20 npm start       # kürzere Partien zum Testen
```

| Ordner | Inhalt |
|---|---|
| `server/game.js` | Spielregeln (serverseitig, verdeckte Karten verlassen nie den Server) |
| `server/bot.js` | Roboter-KI und Sprüche |
| `server/rooms.js` | Räume, Bots, Reconnect, Autopilot (zustandslos, für Serverless) |
| `server/store.js` | Speicher: Upstash Redis (Vercel) oder Map (lokal/Tests) |
| `api/room.js` | Vercel-Funktion `POST /api/room` |
| `server/index.js` | Lokaler Express-Server mit derselben API |
| `public/` | Frontend (Vanilla JS, kein Build-Schritt) |

---
*Skyjo ist eine Marke von Magilano. Dies ist ein privates Fan-Projekt ohne kommerzielle Absicht.*
