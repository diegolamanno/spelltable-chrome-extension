# EDH Score Recorder

A Chrome extension for logging Commander game results from [SpellTable](https://spelltable.wizards.com) and [Convoke](https://convoke.games). It scrapes player names and commander cards from an active game, lets you fill in game details, and submits the result to a Notion database.

## How it works

1. Open a SpellTable or Convoke game in Chrome.
2. Click the extension icon to open the popup.
3. Click **↺** to detect players and their commanders (SpellTable auto-detects; Convoke scrapes on load).
4. Tap a player row to select the **winner** and the crown icon to set the **first player**.
5. Fill in game details: win condition, KO type, first kill event, board wipes, rounds, and Sol Ring.
6. Click **Submit Score** → review the summary → **Log it**. The game is recorded in Notion.

Convoke matches are also recorded in the background as they end, with each player's total turn time from Convoke's match data. The extension icon shows a badge with the number of ended matches not yet logged; the popup lists them and pre-fills the form (players, first player, winner, date) from Convoke's data, so you only review and submit.

## Requirements

- Node.js v18+
- The [1Password CLI](https://developer.1password.com/docs/cli/) (`op`): the `dev` and `build*` scripts read the Notion token from 1Password
- A Notion workspace with four databases (see [Notion setup](#notion-setup))

## Setup

```bash
npm install
cp .env.example .env.dev    # dev databases
cp .env.example .env.prod   # prod databases
# Fill in the database IDs in each file
```

The Notion token is not stored in these files. `.env.op` holds a 1Password secret reference, and the npm scripts run through `op run --env-file=.env.op`, which injects `VITE_NOTION_API_KEY` at build time. Point the reference in `.env.op` at your own 1Password item.

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
| `Partner / Background` | Rich text, *optional*. The second commander (partner, background, or any other secondary commander) |

Deck lookups only consider decks whose `Owner` is the player, so set `Owner` on every deck. A deck matches when its commanders are the game's commanders, in either order across `Commander` and `Partner / Background`. Decks that list both commanders in `Commander` (e.g. `A / B`) also match. With a single commander, a deck with a filled `Partner / Background` doesn't match.

If no deck matches, or several do and their `Commander` text doesn't tell them apart, the submit stops and the popup names the player and the candidate decks. A wrong deck is never linked.

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
| `Match ID` | Text, *optional*. Convoke match id. When present, the extension checks it before creating a game, so the same match can't be logged twice (even by different people in the pod). |

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
| `Raw Time` | Number (total turn time in seconds). Only set when logging a pending Convoke match |

## Environment variables

Create a Notion integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) and share the four databases with it. The variables are listed in `.env.example`:

- `VITE_NOTION_API_KEY`: the integration token. Injected from 1Password by `op run` (see [Setup](#setup)), not written in the env files.
- `VITE_NOTION_PLAYERS_DB_ID`, `VITE_NOTION_DECKS_DB_ID`, `VITE_NOTION_GAMES_DB_ID`, `VITE_NOTION_GAME_SEATS_DB_ID`: the database IDs, from the Notion URL `notion.so/<workspace>/<DATABASE_ID>?v=...`.
- `VITE_DEBUG_SINGLE_PLAYER`, `VITE_CONVOKE_LOGGER`: debug flags. Set them in `.env.dev` only: `.env` is loaded in every mode, so a flag there ends up in prod builds.

## Development

The commands are the `scripts` in `package.json`. `dev` and `build*` run through `op run`. To build without 1Password, run `npx wxt build --mode prod` (CI does this) and enter the token in the popup under **Settings → Notion Settings**.

Dev builds (`npm run dev`, `npm run build:dev`) include a helper for testing Convoke without playing a real game: see [docs/dev/convoke-test-helper.md](docs/dev/convoke-test-helper.md).

CI (`.github/workflows/ci.yml`) runs lint, type-check, tests and a prod build on pushes to `main` and on pull requests.

## Loading the extension in Chrome

1. Run `npm run build:dev` (or `build:prod`)
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select `.output/chrome-mv3-dev/` (or `.output/chrome-mv3-prod/`)

After code changes, rebuild and click the reload icon on the extension card.

## Architecture

| Part | Where | Role |
|---|---|---|
| SpellTable scraper | `entrypoints/content.ts` | Scrapes players and commanders from the game page, in clockwise seat order |
| Convoke scraper | `entrypoints/convoke.content.ts` | Scrapes players and commanders from the seat tiles |
| Convoke match watcher | `entrypoints/convoke-network.content.ts`, `entrypoints/convoke-bridge.content.ts` | Watches Convoke's match API from inside the page and relays match start, end and winner votes to the background |
| Background worker | `entrypoints/background.ts` | Stores scraped data and match records, updates the badge, and runs submits |
| Submit flow | `src/shared/submit.ts` | Looks up players and decks, creates the Game and its Game Seats, blocks duplicates and resumes a submit that failed halfway |
| Notion client | `src/shared/notion.ts` | Notion queries and page creation |
| Convoke match records | `src/shared/convoke/` | Turns match events into records and pre-fills the popup form from them |
| Popup | `entrypoints/popup/App.tsx` | The game form, confirmation and Notion settings |
| Storage | `src/shared/storage.ts` | Every `chrome.storage.local` key and its type |

The message actions are the `message.action` checks in `entrypoints/background.ts` and the content scripts.

## Known limitations

- DOM selectors in both scrapers rely on class names that can break if SpellTable or Convoke updates their markup.
- The scraped game is shared by all tabs, so with two games open the popup shows whichever was scraped last ([#18](https://github.com/diegolamanno/spelltable-chrome-extension/issues/18)).
