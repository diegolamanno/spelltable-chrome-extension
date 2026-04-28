# SpellTable Score Recorder

A Chrome extension for logging Commander game results from [SpellTable](https://spelltable.wizards.com). It scrapes player names and commander cards from an active game, lets you pick the winner and win condition, and submits the result to a Notion database.

## How it works

1. Open a SpellTable game in Chrome.
2. Click the extension icon to open the popup.
3. Click **Refresh** to detect players and their commanders.
4. Tap a player card to select the winner.
5. Choose the win condition (Damage, Commander Damage, Burn/Life, Alt Wincon, Poison, or Mill).
6. Click **Submit Score** → confirm → done. The game is recorded in Notion.

## Requirements

- Node.js v18+
- A Notion workspace with three databases (see [Notion setup](#notion-setup))

## Setup

```bash
npm install
cp .env.example .env
# Fill in your Notion credentials in .env
```

## Notion setup

The extension submits to three Notion databases. Create them in your workspace and add your Notion integration to each one.

| Database | Required properties |
|---|---|
| **Players** | `Name` (title), `Discord Nickname` (rich text) |
| **Decks** | `Commander` (rich text) |
| **Games** | `Name` (title), `Date` (date), `Players` (relation → Players), `Winner` (relation → Players), `Decks` (relation → Decks), `Winner Deck` (relation → Decks), `Win Condition` (select), `Type of KO` (select) |

Then create a Notion integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) and add the token and database IDs to `.env`:

```
VITE_NOTION_API_KEY=secret_...
VITE_NOTION_PLAYERS_DB_ID=<id from database URL>
VITE_NOTION_DECKS_DB_ID=<id from database URL>
VITE_NOTION_GAMES_DB_ID=<id from database URL>
```

Database IDs appear in the Notion URL: `notion.so/<workspace>/<DATABASE_ID>?v=...`

## Development

```bash
npm run dev        # WXT dev mode — reloads extension in Chrome on file changes
npm run build      # Production build → .output/chrome-mv3/
npm run check      # TypeScript type-check
npm run lint       # Biome lint
npm run format     # Biome auto-format
npm run test       # Vitest
```

## Loading the extension in Chrome

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select `.output/chrome-mv3/`

After code changes, run `npm run build` again and click the reload icon on the extension card.

## Architecture

| Component | File | Role |
|---|---|---|
| Content script | `entrypoints/content.ts` | Runs on `spelltable.wizards.com/game/*`; scrapes player names and commander cards via DOM selectors; sorts players clockwise by screen position; watches for DOM changes via `MutationObserver`; responds to `SCRAPE_NOW` for manual refreshes |
| Background worker | `entrypoints/background.ts` | Handles `UPDATE_STORAGE` (writes scraped players to local storage) and `SUBMIT_GAME` (resolves player and deck IDs from Notion, then creates a Game page) |
| Popup UI | `entrypoints/popup/App.tsx` | React component — player/winner picker, win condition picker, confirmation screen, success screen |
| Storage | `src/shared/storage.ts` | Single WXT storage item (`local:spelltable-game`) holding `PlayerData[]` |
| Notion client | `src/shared/notion.ts` | `findPlayerByName`, `findDeckByCommander`, `createGame` — direct Notion API calls |

### Message flow

```
Content script  ──UPDATE_STORAGE──▶  Background  ──writes──▶  chrome.storage.local
Popup           ──SCRAPE_NOW──▶      Content script
Popup           ──SUBMIT_GAME──▶     Background  ──POST──▶    Notion API
```

## Known limitations

- DOM selectors (`content.ts`) rely on SpellTable's Tailwind class names, which can break if SpellTable updates its markup.
- Player name matching against Notion falls back to the `Discord Nickname` property when the SpellTable display name differs from the Notion `Name`.
- No test coverage yet — Vitest + Testing Library infrastructure is set up but no test files exist.
