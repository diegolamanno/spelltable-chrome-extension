# CLAUDE.md — SpellTable Chrome Extension

This file provides guidance for AI assistants working on this codebase.

---

## Project Overview

**SpellTable Score Recorder** is a Chrome extension (Manifest V3) that scrapes player names and commander card data from active [SpellTable](https://spelltable.wizards.com) game sessions, stores them locally, and (eventually) submits game scores to an external database.

The extension injects a content script into SpellTable game pages, extracts game data via DOM selectors, passes it to a background service worker, and surfaces it in a popup UI built with React.

---

## Repository Structure

```
spelltable-chrome-extension/
├── public/
│   ├── manifest.json          # Chrome extension manifest (MV3)
│   ├── logo.png               # Extension icon (128x128)
│   └── logo-large.png
├── src/
│   ├── content.tsx            # Standalone UUID utility (currently unused)
│   └── pages/
│       ├── background/
│       │   └── index.tsx      # Service worker: message routing + storage updates
│       ├── content/
│       │   └── index.tsx      # Content script: DOM extraction + message sending
│       └── popup/
│           ├── Popup.tsx      # Main popup React component
│           ├── Popup.css
│           ├── index.tsx      # React entry point (mounts Popup)
│           ├── index.css
│           └── index.html     # HTML template for popup page
│   └── shared/
│       ├── hooks/
│       │   ├── useStorage.tsx     # React hook wrapping Chrome storage with useSyncExternalStore
│       │   └── useMyExample.tsx   # Composite hook returning players + commanders
│       └── storages/
│           ├── base.tsx               # Generic storage factory (Chrome storage API wrapper)
│           ├── playerStorage.tsx      # Storage instance for player name arrays
│           ├── commanderStorage.tsx   # Storage instance for commander name arrays
│           └── exampleThemeStorage.tsx # Example/unused theme storage
├── .eslintrc.cjs              # ESLint config
├── tsconfig.json              # TypeScript config (strict, noEmit)
├── tsconfig.node.json         # TypeScript config for Node tooling scripts
├── vite.config.ts             # Vite multi-entry build config
├── package.json
└── README.md
```

---

## Architecture

### Extension Components

| Component | File | Role |
|---|---|---|
| Content Script | `src/pages/content/index.tsx` | Runs on `spelltable.wizards.com/game/*`; scrapes DOM for player names and commander cards; sends data to background |
| Background Service Worker | `src/pages/background/index.tsx` | Receives messages from content script and popup; writes to Chrome storage |
| Popup UI | `src/pages/popup/Popup.tsx` | React UI showing current players/commanders; triggers a page refresh via message |
| Storage Layer | `src/shared/storages/` | Generic Chrome storage abstraction used across all parts |

### Message Passing Protocol

Messages are passed between the content script, background, and popup using `chrome.runtime.sendMessage`. The message shape is:

```typescript
// Content script → Background
{
  action: "GET_PAGE_CONTENT",
  data: { namesOnPage: string[], commandersOnPage: string[] }
}

// Background stores data, then sends to popup
{
  action: "UPDATE_PAGE_DATA",
  data: { namesOnPage: string[], commandersOnPage: string[], sessionID?: string }
}

// Popup → Background (to trigger a re-scrape)
{
  action: "GET_PAGE_CONTENT"
}
```

### Storage Pattern

All storage is handled by the base factory in `src/shared/storages/base.tsx`. It wraps the Chrome storage API with a typed interface and supports change listeners for reactive updates.

```typescript
// Usage pattern
const storage = createStorage<string[]>("my-key", [], { storageType: StorageType.Local });
// storage.get() — async read
// storage.set(value) — async write
// storage.subscribe(listener) — for useSyncExternalStore
```

React components consume storage via the `useStorage` hook, which uses `useSyncExternalStore` for synchronization:

```typescript
const players = useStorage(playerStorage);
const commanders = useStorage(commanderStorage);
```

---

## Development Workflow

### Prerequisites

- Node.js (v18+ recommended)
- npm

### Setup

```bash
npm install
```

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR (useful for popup UI iteration) |
| `npm run build` | Type-check with `tsc` then bundle with Vite; output goes to `dist/` |
| `npm run lint` | Run ESLint with zero-warning tolerance on all `.ts`/`.tsx` files |
| `npm run preview` | Preview the production build locally |

### Loading the Extension in Chrome

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `dist/` directory
5. Navigate to `https://spelltable.wizards.com/game/<id>` to test

### Build Output Structure

Vite produces a multi-entry build:

```
dist/
├── src/pages/background/index.js   # Service worker
├── src/pages/content/index.js      # Content script
├── src/pages/popup/index.html      # Popup HTML
└── assets/                          # CSS and chunk files
```

---

## Key Conventions

### TypeScript

- **Strict mode** is enabled — avoid `any`, use proper types.
- `noEmit: true` — Vite handles compilation; `tsc` is only used for type checking.
- Use path aliases for imports (configured in `tsconfig.json` and `vite.config.ts`):
  - `@src/*` → `src/`
  - `@pages/*` → `src/pages/`
  - `@assets/*` → `src/assets/`
  - `@root/*` → project root

### Naming

- **Components**: PascalCase (`Popup.tsx`)
- **Hooks**: camelCase with `use` prefix (`useStorage`, `useMyExample`)
- **Storage keys**: kebab-case string literals (`"player-storage-key"`)
- **Message actions**: SCREAMING_SNAKE_CASE (`"GET_PAGE_CONTENT"`)
- **Files**: Lowercase kebab-case for non-component files

### ESLint

ESLint is configured for TypeScript and React hooks. Run `npm run lint` before committing. The linter is set to fail on any warnings (`--max-warnings 0`).

Do not disable ESLint rules without a justification comment.

### Chrome Extension Conventions

- The extension targets **Manifest V3** — use service workers (not background pages), `chrome.scripting` instead of older APIs.
- The content script only runs on `https://spelltable.wizards.com/game/*` (enforced in `manifest.json`).
- All permissions (`scripting`, `storage`, `activeTab`) are declared in `manifest.json`.

---

## Current State & Known TODOs

The project is pre-release (v0.1 in manifest, v0.0.0 in package.json) and actively in development.

### Known Incomplete Areas

- **DOM selectors are brittle**: The content script uses hardcoded CSS class selectors (e.g., `.font-bold.truncate.leading-snug.text-sm`) that may break if SpellTable updates its markup.
- **MutationObserver is commented out**: The content script should watch for page mutations to handle late-loaded player elements, but this logic is disabled.
- **Submit Score is a stub**: The "Submit Score" button in the popup currently just calls `alert("SUBMIT")` — backend integration is not implemented.
- **No tests**: There is no test infrastructure. Vitest or Jest would be appropriate to add.
- **No CI/CD**: No GitHub Actions workflows exist yet.
- **Debug logging**: Several `console.log` statements with debug messages remain in the content script and background worker. These should be removed or gated before release.
- **`src/content.tsx`**: This file (a UUID utility) appears to be unused and may be a leftover.
- **`exampleThemeStorage.tsx`**: This is a template/example file and is not used in the extension.

---

## Adding New Features

### New Storage Key

1. Create a new file in `src/shared/storages/` following the pattern in `playerStorage.tsx`.
2. Export a typed storage instance using `createStorage<T>(key, defaultValue, options)`.
3. Consume it in components via `useStorage(yourStorage)`.

### New Message Action

1. Add the new action string to the message type union in the relevant file.
2. Handle it in `src/pages/background/index.tsx` inside the `chrome.runtime.onMessage` listener.
3. Send it from either the content script or popup as needed.

### New Popup UI

The popup is a standard React SPA. Add components under `src/pages/popup/` and import them into `Popup.tsx`.

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| react | ^18.2.0 | UI framework |
| react-dom | ^18.2.0 | DOM rendering |
| typescript | 5.2.2 | Type checking |
| vite | 5.1.6 | Build tool and dev server |
| @vitejs/plugin-react | — | React support in Vite |
| eslint | 8.57.0 | Linting |
| @typescript-eslint/* | — | TypeScript ESLint rules |
| eslint-plugin-react-hooks | — | React hooks linting rules |
| @types/chrome | 0.0.263 | Chrome extension API types |
