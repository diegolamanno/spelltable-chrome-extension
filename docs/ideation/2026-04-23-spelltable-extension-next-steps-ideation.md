---
date: 2026-04-23
topic: spelltable-extension-next-steps
focus: Look at what we currently have in the extension. Determine what are the right next steps
mode: repo-grounded
---

# Ideation: SpellTable Extension — Next Steps

## Grounding Context

- **Project shape:** WXT + React 19 + TypeScript MV3 Chrome extension for SpellTable (webcam-based Magic: The Gathering Commander platform)
- **Working:** DOM scraping via content.ts, local WXT storage, reactive popup UI via useGameData hook
- **Broken:** Submit Score = `alert()` stub; no actual backend submission
- **Fragile:** DOM selectors use brittle Tailwind utility class chains (`.font-bold.truncate.leading-snug.text-sm`) — will break on any SpellTable markup update
- **Missing:** Tests (Vitest + Testing Library infrastructure exists), CI/CD, canonical data model, session lifecycle management
- **Partial:** Notion API partially wired in `src/shared/notion.ts`
- **MV3 risk:** Service workers reset on inactivity (~30s); Commander games run 1–3 hours
- **Market:** No competing SpellTable-specific Chrome extensions exist; EDHREC/Moxfield have no live game tracking — open niche
- **Prior art:** MTGATracker (archived MTG tracker) proved selector brittleness is an existential failure mode for game-tracking extensions

## Ranked Ideas

### 1. Typed `GameRecord` Domain Model
**Description:** Define a single `GameRecord` TypeScript interface in `src/shared/types.ts` that all layers — content script output, storage schema, background handler, Notion payload, and popup display — derive from or map to. Includes fields for players (with seat positions), commanders, winner, gameId, timestamp, and submission status.

**Rationale:** Currently players and commanders are stored as parallel `string[]` arrays with no link between them — no concept of "a seat" or "a player-commander pair." Every upcoming feature (submission, history, Notion integration, state machine) will independently invent incompatible shapes without a canonical model. This is the universal prerequisite that costs almost nothing and multiplies the value of every subsequent feature.

**Downsides:** Requires a storage migration pass on existing data (near-zero cost now since there's no real user data at risk, but painful later if deferred).

**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

---

### 2. Selector Resilience Fallback Chain
**Description:** Replace the brittle Tailwind utility class chains in `content.ts` with a ranked fallback strategy per scrape target: try ARIA labels first, then `data-*` attributes, then the existing class chains as a last resort. Log which strategy succeeded on each scrape.

**Rationale:** The existing selectors are compiler output — they silently break on any Tailwind config change or SpellTable deploy. MTGATracker's archival proves this is an existential failure mode for game-tracking extensions. A fallback chain degrades gracefully and self-documents which selectors are still alive. This idea appeared independently in all 6 ideation frames.

**Downsides:** Requires inspecting SpellTable's current DOM carefully to find stable ARIA/data attributes (they may not exist, in which case structural + text-content heuristics are the next fallback). Adds some complexity to `content.ts`.

**Confidence:** 95%
**Complexity:** Low–Medium
**Status:** Unexplored

---

### 3. URL-Derived Game Session ID
**Description:** Extract the game ID from `window.location.pathname` (`/game/<id>`) at scrape time and attach it as `gameId` on every storage write and submission. Guard the Submit button against re-submission when the current `gameId` matches an already-submitted record.

**Rationale:** Without a stable identifier, duplicate submissions are silent and undetectable once any backend exists. The game URL is a zero-scrape, structured, always-available data source requiring no new permissions. This is a one-liner change that makes all future submissions retryable and idempotent.

**Downsides:** None meaningful — fully additive.

**Confidence:** 90%
**Complexity:** Very Low
**Status:** Unexplored

---

### 4. Winner Selection UX
**Description:** Add a required "select winner" step in the popup — a single-tap player card highlight before the Submit button activates. Store the selected winner on `GameRecord`. The Submit button remains disabled until a winner is chosen.

**Rationale:** Game outcome is the most important data point in any scoring system, and the current flow captures zero of it. A submit without a winner field produces structurally incomplete data that's useless for history or stats. This is the missing UX step that makes submission meaningful.

**Downsides:** Adds one mandatory interaction step to the submission flow (deliberately — incomplete data is worse than one extra tap). Auto-winner inference from life totals was rejected as unreliable given DOM accessibility uncertainty.

**Confidence:** 92%
**Complexity:** Low
**Status:** Unexplored

---

### 5. Offline-First Game Record + Notion Submission Queue
**Description:** When a game is submitted, write a complete `GameRecord` to local WXT storage with `status: "pending"`, then attempt Notion API submission as a side effect. On success, flip to `status: "submitted"` with the Notion record ID. Failed submissions remain visible in the popup as a retry card. Notion API key and database ID are configured via a settings panel in the popup.

**Rationale:** The Submit button being a stub is the primary user-facing broken feature. Notion is already partially wired in `src/shared/notion.ts`. The offline-first pattern decouples data capture from submission — games are never lost on network failure or service worker reset, and Notion (or any future backend) becomes pluggable rather than a hard dependency.

**Downsides:** Requires implementing a settings panel for Notion credentials (popup grows in scope). Notion API key stored in `chrome.storage.local` has no encryption at rest — acceptable for a personal tool, worth noting.

**Confidence:** 88%
**Complexity:** Medium
**Status:** Unexplored

---

### 6. Game Session State Machine
**Description:** Model the game lifecycle as an explicit state machine (`IDLE → DETECTING → ACTIVE → GAME_OVER → SUBMITTED`) stored in `chrome.storage.local`. The background service worker is the sole writer; popup and content script are read-only consumers. Popup renders differently per state.

**Rationale:** MV3 service workers silently reset after ~30 seconds of inactivity — Commander games run 1–3 hours. Without explicit state in `chrome.storage`, in-memory variables are lost on restart, and the popup and content script guess what phase the game is in, producing race conditions and stale UI. A state machine in storage survives worker restarts and gives all UI a single source of truth.

**Downsides:** Adds meaningful architectural complexity. Requires mapping all state transitions and edge cases (user navigates away mid-game, network disconnects, reconnects). Can be scoped down to `IDLE / ACTIVE / SUBMITTED` initially.

**Confidence:** 82%
**Complexity:** Medium
**Status:** Unexplored

---

### 7. CI + Contract Tests
**Description:** Add `.github/workflows/ci.yml` running `npm run lint`, `npm run check`, and `npm run test` on every push and PR. Add Vitest contract tests verifying every `chrome.runtime` message action string has a handler, payloads match their TypeScript shapes, and storage writes produce the expected `GameRecord` structure.

**Rationale:** Every merge to main is currently untested. The message protocol between `content.ts`, `background.ts`, and the popup is the only seam connecting the extension — it has no runtime type enforcement. Contract tests here cover three components at once and catch regressions before Chrome does. The npm commands already exist; only the CI workflow and test files are missing.

**Downsides:** Contract tests require mocking `chrome.*` APIs (WXT provides a `wxt/testing` module for this). Initial setup takes a few hours.

**Confidence:** 85%
**Complexity:** Low
**Status:** Unexplored

---

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | Auto-winner inference from life totals | Life total DOM accessibility on SpellTable unproven; manual 1-tap UX is simpler and more reliable |
| 2 | Alarms-driven passive sync | MutationObserver already works; don't overhaul a working mechanism without evidence of failure |
| 3 | Session replay / black box recorder | Debugging tool for multi-user scale; premature for current single-user stage |
| 4 | WebSocket interception (listen to network) | Riskier than DOM scraping; no stability guarantee; SpellTable likely uses auth'd connections |
| 5 | Floating sidebar / HUD overlay | Large scope increase; not a next step when core recording is broken |
| 6 | Commander enrichment via Scryfall | Nice-to-have; doesn't address core pain points |
| 7 | Discord shareable card / PNG | Social feature premature when core recording isn't complete |
| 8 | Public leaderboard / global stats feed | Premature — needs users first |
| 9 | Cross-platform adapter (Cockatrice, Untap.in) | Premature — make SpellTable work perfectly first |
| 10 | Remote config for selector repair | Adds infra complexity; local fallback chain solves the problem more simply |
| 11 | Schema migration runner | Superseded by GameRecord — define the model correctly from the start |
| 12 | Clipboard export | Superseded by the Notion submission queue path |
| 13 | Seat map correction UI | Seat ordering recently fixed in PR #2; not top priority |
| 14 | Rivalry graph / head-to-head stats | Needs game history first; premature by 2–3 features |
| 15 | Season view / full-page stats tab | Same — needs history before aggregation makes sense |
| 16 | Crowd-sourced selector repair network | Useful at scale; overkill for a personal tool |
| 17 | Zero-click passive recording | Overlaps with state machine; no clear advantage over existing MutationObserver |
| 18 | Scrape confidence badge in popup | Covered by state machine's DETECTING state surfacing |
