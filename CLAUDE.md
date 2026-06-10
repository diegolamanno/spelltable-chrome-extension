# CLAUDE.md — SpellTable Chrome Extension

This file provides guidance for AI assistants working on this codebase.

---

## Project Overview

**EDH Score Recorder** is a Chrome extension (Manifest V3) that scrapes player names and commander card data from active [SpellTable](https://spelltable.wizards.com) and [Convoke](https://convoke.games) game sessions, stores them locally, and submits game scores to a Notion database.

The extension injects a content script into SpellTable game pages, extracts game data via DOM selectors, passes it to a background service worker, and surfaces it in a popup UI built with React.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension framework | **WXT** v0.20+ |
| UI | **React** 19 + **TypeScript** 5.7 |
| Styling | **Tailwind CSS** v4 (CSS-first, no config file) |
| Build tool | **Vite** 7 (via WXT) |
| Linting + formatting | **Biome** (replaces ESLint + Prettier) |
| Testing | **Vitest** v3 + **Testing Library** |

---

## Repository Structure

```
spelltable-chrome-extension/
├── entrypoints/               # WXT extension entry points (auto-wired by WXT)
│   ├── background.ts          # Service worker: handles message routing + storage writes
│   ├── content.ts             # Content script: DOM scraping + MutationObserver
│   └── popup/
│       ├── index.html         # Popup HTML shell
│       ├── main.tsx           # React root mount
│       ├── App.tsx            # Main popup component (Tailwind UI)
│       └── app.css            # Tailwind import (@import "tailwindcss")
├── src/
│   └── shared/
│       ├── storage.ts         # WXT storage items (playerStorage, commanderStorage)
│       ├── hooks/
│       │   └── useGameData.tsx  # React hook for reactive storage access
│       └── test/
│           └── setup.ts       # Vitest setup (@testing-library/jest-dom)
├── public/
│   ├── logo.png               # Extension icon (128x128)
│   └── logo-large.png
├── .wxt/                      # WXT-generated types and tsconfig (do not edit manually)
├── .output/                   # Build output — chrome-mv3/ is the loadable extension
├── wxt.config.ts              # WXT + Vite + Tailwind configuration
├── biome.json                 # Biome linter + formatter config
├── vitest.config.ts           # Vitest test runner config
├── tsconfig.json              # TypeScript config (standalone, WXT-compatible)
└── package.json
```

---

## Architecture

### Extension Components

| Component | File | Role |
|---|---|---|
| Content Script | `entrypoints/content.ts` | Runs on `spelltable.wizards.com/game/*`; scrapes DOM for player names and commander cards; sends `UPDATE_STORAGE` message when data changes; watches DOM via `MutationObserver` |
| Background Service Worker | `entrypoints/background.ts` | Receives `UPDATE_STORAGE` messages; writes player/commander arrays to Chrome local storage |
| Popup UI | `entrypoints/popup/App.tsx` | React component showing current players/commanders; triggers re-scrape via `chrome.scripting.executeScript` |
| Storage | `src/shared/storage.ts` | WXT `storage.defineItem` wrappers for typed Chrome local storage |
| Hook | `src/shared/hooks/useGameData.tsx` | React hook with `useState`/`useEffect` that subscribes to storage changes |

### Message Passing

The content script and popup communicate through the background:

```typescript
// Content script → Background (when DOM data changes)
chrome.runtime.sendMessage({
  action: "UPDATE_STORAGE",
  data: { namesOnPage: string[], commandersOnPage: string[] },
});

// Popup → SpellTable tab (to trigger a re-scrape)
chrome.scripting.executeScript({ target: { tabId }, func: scrapeGamePage });
// scrapeGamePage runs in the page context and sends UPDATE_STORAGE directly
```

### Storage Pattern

Storage is defined with WXT's typed item API in `src/shared/storage.ts`:

```typescript
import { storage } from "wxt/utils/storage";

export const playerStorage = storage.defineItem<string[]>("local:spelltable-players", {
  fallback: [],
});
```

React components consume storage via `useGameData`, which uses `storage.watch()` for reactive updates:

```typescript
const { players, commanders } = useGameData();
```

---

## Development Workflow

### Prerequisites

- Node.js v18+
- npm

### Setup

```bash
npm install
```

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Start WXT dev mode — reloads the extension in Chrome on file changes |
| `npm run build` | Build production extension to `.output/chrome-mv3/` |
| `npm run build:firefox` | Build for Firefox to `.output/firefox-mv2/` |
| `npm run check` | WXT type-check (runs `tsc` internally) |
| `npm run lint` | Biome lint check |
| `npm run format` | Biome auto-format (writes to files) |
| `npm run test` | Run Vitest tests once |
| `npm run test:watch` | Run Vitest in watch mode |

### Loading the Extension in Chrome

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select `.output/chrome-mv3/`
5. Navigate to `https://spelltable.wizards.com/game/<id>` to test

### Build Output

WXT outputs to `.output/chrome-mv3/` (not `dist/`):

```
.output/chrome-mv3/
├── manifest.json             # Auto-generated from wxt.config.ts
├── popup.html
├── background.js
├── content-scripts/content.js
├── chunks/                   # JS chunks
└── assets/                   # CSS + image assets
```

---

## Key Conventions

### WXT Entrypoints

WXT auto-discovers entry points in `entrypoints/` by filename. Each entrypoint uses a WXT-provided global:

- `defineBackground(() => { ... })` — for `background.ts`
- `defineContentScript({ matches, main() { ... } })` — for `content.ts`
- Standard HTML + React for `popup/`

These globals are injected by WXT — no import needed.

### TypeScript

- **Strict mode** is enabled.
- `moduleResolution: "Bundler"` — use for all modern Vite/WXT projects.
- `noEmit: true` — Vite handles compilation; `tsc` is for type-checking only.
- The `.wxt/` directory contains generated types; do not edit them.
- WXT path alias `@/*` maps to the project root.

### Biome (replaces ESLint + Prettier)

Run `npm run lint` before committing. Format with `npm run format`. Configuration is in `biome.json`. Do not add ESLint back.

### Tailwind CSS v4

- No `tailwind.config.js` — v4 is CSS-first.
- Import in CSS: `@import "tailwindcss";` (see `entrypoints/popup/app.css`).
- Plugin added via Vite in `wxt.config.ts`.

### Styling Conventions

- The popup is `w-80` (320px) — standard Chrome extension popup width.
- Dark theme: `bg-gray-950` for the base, `bg-gray-900` for cards.
- Primary action: `bg-indigo-600`. Positive action: `bg-emerald-700`.

### Naming

- **Components**: PascalCase (`App.tsx`)
- **Hooks**: camelCase with `use` prefix (`useGameData`)
- **Storage keys**: `local:kebab-case` WXT format (`local:spelltable-players`)
- **Message actions**: SCREAMING_SNAKE_CASE (`UPDATE_STORAGE`)

---

## Current State & Known TODOs

### Known Incomplete Areas

- **DOM selectors are brittle**: The content script uses hardcoded CSS class selectors (e.g., `.font-bold.truncate.leading-snug.text-sm`) that may break if SpellTable updates its markup.
- **Submit Score is a stub**: The "Submit Score" button in the popup calls `alert("SUBMIT")` — backend integration is not implemented.
- **No tests yet**: Test infrastructure is set up (Vitest + Testing Library) but no test files exist. Add tests in `src/**/*.test.tsx` or `entrypoints/**/*.test.ts`.
- **No CI/CD**: No GitHub Actions workflows exist.

### Adding New Features

**New storage key:**
Add a `storage.defineItem` call to `src/shared/storage.ts`, then consume it in `useGameData.tsx`.

**New message action:**
Add a `case` to the `chrome.runtime.onMessage` listener in `entrypoints/background.ts`.

**New popup UI:**
Edit `entrypoints/popup/App.tsx`. Use Tailwind utility classes for styling.

---

## Dependencies

| Package | Purpose |
|---|---|
| `wxt` | Extension framework (build, HMR, manifest, entrypoints) |
| `react` / `react-dom` | UI framework |
| `typescript` | Type checking |
| `tailwindcss` / `@tailwindcss/vite` | Utility CSS framework (v4) |
| `@vitejs/plugin-react` | React support for Vite (used by WXT and Vitest) |
| `@biomejs/biome` | Linting + formatting |
| `vitest` | Test runner |
| `@testing-library/react` | React component testing utilities |
| `@testing-library/jest-dom` | DOM assertion matchers |
| `jsdom` | Browser DOM simulation for tests |
