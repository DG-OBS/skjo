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

## Online stellen (kostenlos, z. B. Render)

1. Auf [render.com](https://render.com) mit GitHub anmelden → **New → Blueprint** → dieses Repo wählen.
2. `render.yaml` wird automatisch erkannt. Nach dem Deploy die URL teilen – fertig.

## Entwicklung

```bash
npm test                     # Spiellogik, Bot-KI und Socket.IO-Multiplayer-Test
END_SCORE=20 npm start       # kürzere Partien zum Testen
```

| Ordner | Inhalt |
|---|---|
| `server/game.js` | Spielregeln (serverseitig, verdeckte Karten verlassen nie den Server) |
| `server/bot.js` | Roboter-KI und Sprüche |
| `server/index.js` | Express + Socket.IO, Räume, Reconnect, Autopilot |
| `public/` | Frontend (Vanilla JS, kein Build-Schritt) |

---
*Skyjo ist eine Marke von Magilano. Dies ist ein privates Fan-Projekt ohne kommerzielle Absicht.*
