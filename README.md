# EDH Score Recorder

A Chrome extension for logging Commander game results from [SpellTable](https://spelltable.wizards.com) and [Convoke](https://convoke.games). It scrapes player names and commander cards from an active game, lets you fill in game details, and submits the result to a Notion database.

## How it works

1. Open a SpellTable or Convoke game in Chrome.
2. Click the extension icon to open the popup.
3. Click **↺** to detect players and their commanders (SpellTable auto-detects; Convoke scrapes on load).
4. Tap a player row to select the **winner** and the crown icon to set the **first player**.
5. Fill in game details: win condition, KO type, first kill event, board wipes, rounds, and Sol Ring.
6. Click **Submit Score** → review the summary → **Log it**. The game is recorded in Notion.

When playing on Convoke, the extension also scrapes each player's total turn time from the end-of-game screen and stores it alongside their seat record.

## Requirements

- Node.js v18+
- A Notion workspace with four databases (see [Notion setup](#notion-setup))

## Setup

```bash
npm install
cp .env.example .env.dev    # dev databases
cp .env.example .env.prod   # prod databases
# Fill in Notion credentials in each file
```

Alternatively, configure credentials directly in the popup via **Settings → Notion Settings** — changes are saved to Chrome local storage and override the build-time values.

## Notion setup

The extension writes to four Notion databases. Create each one in your workspace and share it with your Notion integration.

### Players

| Property | Type |
|---|---|
| `Name` | Title |
| `Username - Spelltable` | Rich text |
| `Username - Convoke` | Rich text |

Player lookup first tries `Username - Spelltable`, then falls back to `Username - Convoke`.

### Decks

| Property | Type |
|---|---|
| `Name` | Title |
| `Commander` | Rich text |
| `Owner` | Relation → Players |

The `Owner` relation scopes deck lookups per player, preventing the wrong deck from being selected when two players share the same commander. Falls back to commander-only lookup if `Owner` is not set.

### Games

| Property | Type |
|---|---|
| `Name` | Title — auto-set to `EDH Session - @<date>` |
| `Date` | Date |
| `Players` | Relation → Players |
| `Winner` | Relation → Players |
| `Decks` | Relation → Decks |
| `Winner Deck` | Relation → Decks |
| `Win Condition` | Select — see options below |
| `Type of KO` | Select: `Simultaneous KO` or `Staggered KO` |
| `Board Wipes` | Number |
| `Game Length` | Number (rounds played) |
| `Sol Ring` | Checkbox |
| `Starting Player` | Relation → Players |
| `First Blood Killer` | Relation → Players |
| `First Blood Killer Deck` | Relation → Decks |
| `First Blood Victim` | Relation → Players |
| `First Blood Victim Deck` | Relation → Decks |

Win Condition select options: `Combat`, `Commander Damage`, `Burn/Life Loss`, `Alt Win Con`, `Infect`, `Mill`, `Combo`, `Stolen`, `Draw`.

### Game Seats

One entry per player per game, linking seat position and turn-time data.

| Property | Type |
|---|---|
| `Name` | Title — auto-set to `Seat N - @<date>` |
| `Game` | Relation → Games |
| `Player` | Relation → Players |
| `Deck` | Relation → Decks |
| `Seat` | Number (clockwise seat order, 1-based) |
| `Raw time` | Number (total turn time in seconds, Convoke only) |

## Environment variables

Create a Notion integration at [notion.so/my-integrations](https://www.notion.so/my-integrations), then populate each env file:

```
VITE_NOTION_API_KEY=secret_...
VITE_NOTION_PLAYERS_DB_ID=<id from database URL>
VITE_NOTION_DECKS_DB_ID=<id from database URL>
VITE_NOTION_GAMES_DB_ID=<id from database URL>
VITE_NOTION_GAME_SEATS_DB_ID=<id from database URL>
```

Database IDs appear in the Notion URL: `notion.so/<workspace>/<DATABASE_ID>?v=...`

## Development

```bash
npm run dev          # WXT dev mode — reloads extension in Chrome on file changes
npm run build        # Build using .env (legacy fallback)
npm run build:dev    # Build using .env.dev  → .output/chrome-mv3/
npm run build:prod   # Build using .env.prod → .output/chrome-mv3/
npm run check        # TypeScript type-check
npm run lint         # Biome lint
npm run format       # Biome auto-format
npm run test         # Vitest
```

## Loading the extension in Chrome

1. Run `npm run build:dev` (or `build:prod`)
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select `.output/chrome-mv3/`

After code changes, rebuild and click the reload icon on the extension card.

## Architecture

| Component | File | Role |
|---|---|---|
| SpellTable content script | `entrypoints/content.ts` | Runs on `spelltable.wizards.com/game/*`; scrapes player names and commander cards; sorts players clockwise by screen position; sends `UPDATE_STORAGE`; responds to `SCRAPE_NOW` |
| Convoke content script | `entrypoints/convoke.content.ts` | Runs on `convoke.games/en/play/*`; scrapes player names and commanders from seat tiles; scrapes per-player turn times from the end-of-game dialog (`span.tabular-nums`); sends `UPDATE_STORAGE` and `UPDATE_TIMES` |
| Background worker | `entrypoints/background.ts` | Handles `UPDATE_STORAGE`, `UPDATE_TIMES`, and `SUBMIT_GAME`; resolves Notion IDs for players and decks (owner-scoped); creates Game and Game Seat pages |
| Popup UI | `entrypoints/popup/App.tsx` | React component — player/winner picker, first-player selector, win condition grid, KO type toggle, first kill event, board wipes stepper, rounds stepper, Sol Ring toggle, confirmation screen, success screen, Notion settings screen |
| Storage | `src/shared/storage.ts` | `local:spelltable-game` (`PlayerData[]`) and `local:convoke-player-times` (`Record<string, number>`) |
| Notion client | `src/shared/notion.ts` | `findPlayerByName`, `findDeckByPlayerAndCommander`, `createGame`, `createGameSeat` |

### Message flow

```
SpellTable content  ──UPDATE_STORAGE──▶  Background  ──writes──▶  chrome.storage.local
Convoke content     ──UPDATE_STORAGE──▶  Background
Convoke content     ──UPDATE_TIMES───▶   Background  ──writes──▶  chrome.storage.local
Popup               ──SCRAPE_NOW────▶    Content script
Popup               ──SUBMIT_GAME───▶    Background  ──POST───▶   Notion API
```

## Known limitations

- DOM selectors in both content scripts rely on class names that can break if SpellTable or Convoke updates their markup.
- No test coverage yet — Vitest + Testing Library infrastructure is set up but no test files exist.
