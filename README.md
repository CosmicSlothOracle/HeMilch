# QTE Fighting Game - Standalone

Ein Standalone Fighting Game mit QTE (Quick Time Events) Mechaniken, extrahiert aus dem Milchcards-Projekt.

## Features

- **Multiplayer Fighting Game**: 2-Player Local Multiplayer
- **Character Selection**: 4 verschiedene Charaktere (Ninja, Cyborg, Laurin, Granny)
- **AI Support**: Singleplayer-Modus mit KI-Gegner
- **Sprite Animationen**: Vollständige Atlas-basierte Animationen
- **Level System**: Mehrere Sektionen mit Heatmap-basierter Kollision
- **Gamepad Support**: Controller-Unterstützung
- **Responsive Design**: Anpassbar an verschiedene Bildschirmgrößen

## Installation

```bash
npm install
```

## Entwicklung

```bash
# Development Server starten
npm run dev

# Build für Production
npm run build

# TypeScript Type-Check
npm run type-check

# Tests ausführen
npm test
```

## Steuerung

### Player 1 (WASD-Layout)
- **Bewegung**: W, A, S, D
- **Angriff 1**: E
- **Angriff 2**: Q
- **Parry**: R
- **Fernkampf 1**: T
- **Fernkampf 2**: Y

### Player 2 (Arrow Keys + Numpad)
- **Bewegung**: Pfeiltasten
- **Angriff 1**: Numpad 1
- **Angriff 2**: Numpad 2
- **Parry**: Numpad 3
- **Fernkampf 1**: Numpad 4
- **Fernkampf 2**: Numpad 5

## Charaktere

1. **Ninja** 🥷 - Schneller, agiler Kämpfer
2. **Cyborg** 🦾 - Roboter mit technischen Angriffen
3. **Laurin** 🧑‍💼 - Business-Charakter mit einzigartigen Moves
4. **Granny** 👵 - Ältere Dame mit überraschenden Fähigkeiten

## Technische Details

- **Framework**: Vanilla TypeScript mit Canvas API
- **Build System**: Vite
- **Animationen**: Sprite-basierte Atlas-Animationen
- **Physik**: Custom Physics Engine mit Heatmap-Kollision
- **Assets**: TexturePacker Atlas-Format

## Projektstruktur

```
src/
├── qte/                 # Hauptspiel-Logik
│   ├── gameLoop.ts      # Game Loop und State Management
│   ├── fighter.ts       # Fighter-Klassen und Combat
│   ├── input.ts         # Input-Handling
│   ├── assetRegistry.ts # Asset-Verwaltung
│   ├── atlasLoader.ts   # Atlas-Loading
│   ├── spriteAnimator.ts # Sprite-Animationen
│   ├── simpleAi.ts      # KI-System
│   └── animationViewer.ts # Animation-Debug-Tool
├── main.ts              # Entry Point
public/
├── qte/                 # Game Assets
│   ├── ninja/           # Ninja-Charakter Assets
│   ├── cyboard/         # Cyborg-Charakter Assets
│   ├── Laurin/          # Laurin-Charakter Assets
│   └── granny/          # Granny-Charakter Assets
└── levels/              # Level-Assets
tests/                   # Unit Tests
```

## Deployment

Das Spiel kann als statische Website deployed werden:

```bash
npm run build
# dist/ Ordner enthält die deploybare Version
```

## Lizenz

MIT License - siehe LICENSE Datei für Details.
