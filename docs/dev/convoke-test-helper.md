# Convoke test helper (`window.__edhMock`)

Replay mock Convoke matches in the browser to test the extension without playing a real game.

The helper sends fake match events (match start, match end, winner votes) through the same path real games use:

```
__edhMock.play()  ─┐
real Convoke game ─┴─▶ convoke-network (in-page) ─▶ convoke-bridge ─▶ background ─▶ local:convoke-matches ─▶ badge
```

So it tests the real relay, the match records and the badge. Only the source of the events is fake.

It exists **only in dev builds**. Prod builds contain no mock code and no fixture data.

Related: #12 (Convoke match flow), #24 (full dev mock environment).

---

## Setup

1. Build the dev extension. Node runs through mise, and the Notion key comes from 1Password:
   ```bash
   mise exec -- npm run build:dev
   ```
2. Load it in Chrome:
   - Open `chrome://extensions` and turn on **Developer mode**.
   - The first time: **Load unpacked**, press **Cmd + Shift + G**, and paste
     `/Users/diegolamanno/dev/spelltable-chrome-extension/.output/chrome-mv3-dev`.
     The `.output` folder is hidden in the file picker.
   - After that: click ↻ on **EDH Score Recorder (Dev)**.
   - Turn off any other copy of the extension, so the badge you check belongs to the dev build.
3. Open **any** `https://convoke.games/...` page. You don't need a game. Reload the tab if it was already open.
4. Open DevTools (**Cmd + Option + J**). Make sure the console context dropdown says **top**. You should see:
   ```
   [EDH-Mock] Ready: __edhMock.play('full-session'). Scenarios: [...]
   ```

---

## Commands

Run these in the Convoke tab's console:

| Command | What it does |
|---|---|
| `__edhMock.scenarios` | Lists the scenarios with a description of each |
| `__edhMock.play()` | Plays `full-session` |
| `__edhMock.play("single-game")` | Plays one scenario. Returns the number of events sent. |
| `__edhMock.clear()` | Deletes **all** stored Convoke match records (mock and real) and clears the badge |

Each `play` gives the matches **new IDs** and moves all timestamps so the scenario ends at the current time. Playing a scenario twice adds two more pending games without overwriting the first ones, and votes stay attached to the right match.

---

## Scenarios and expected results

All scenarios come from the anonymised real session in `src/test/fixtures/convoke/two-match-session.json`. The players are **Player 1–4**, with Convoke IDs **9001–9004**.

| Scenario | Pending games added | What to check |
|---|---|---|
| `full-session` | 2 | **Match 1:** starts with Player 4, 7 rounds, first blood victim Player 1 (killer hint: Player 4), KO **Staggered**, winner suggestion Player 4 (1 vote). **Match 2:** starts with Player 2, 7 rounds, no first blood suggestion, KO **Simultaneous**, winner suggestion Player 1 (2 votes). |
| `single-game` | 1 | Same as match 1 above. The votes are saved in the next match, which is never played, and must still be attached to this match. |
| `simultaneous-ko` | 1 | Same as match 2 above. Everyone was still alive when the game was ended. |
| `no-votes` | 1 | Match 1 with **no winner suggestion** (`voteCounts` is `{}`) |
| `player-left` | 1 | Match 1, but Player 2 is missing from the final state. **Player 2 must keep a seat** (added last, commander *Tidus, Yuna's Guardian*, turn time 0). |

Commanders differ between the matches. For example, Player 1 plays *Felothar the Steadfast* in match 1 and *Imotekh the Stormlord* in match 2. Each match record must keep its own.

---

## Checking the results

**0. The popup.** Open the extension popup. A **To log (N)** bar lists the pending games (end time and commanders), plus **Live table** for the scrape-based flow. The oldest pending game is selected and the form is filled in:
- **Filled:** players in seat order, first player (crown), rounds, turn times.
- **Suggested** (labelled until you change them): winner ("suggested from N votes"), first kill victim (with a killer hint), KO type.
- **Blank:** win condition, first killer, board wipes, Sol Ring.

The confirm screen marks the suggested values. With a dev build and the **dev** Notion databases, submitting creates real rows there. The fixture players (`Player 1`–`4`) must exist in the dev Players DB, or the submit fails with "Player not found" (see #24). After a successful submit, the game leaves the bar and the badge goes down.

**1. The badge.** The extension icon shows the number of pending games (indigo badge). `clear()` removes it.

**2. The background console.** In `chrome://extensions`, under **EDH Score Recorder (Dev)**, click **Inspect views: service worker**. Each event logs:
```
[Background] Convoke end applied; pending: 2
```

**3. The stored records.** In that same service worker console:
```js
// Every record
await chrome.storage.local.get("convoke-matches")

// A short overview of the pending games
Object.values((await chrome.storage.local.get("convoke-matches"))["convoke-matches"])
  .filter((r) => r.status === "ended" && !r.submittedAt)
  .map((r) => ({
    match: r.matchId.slice(0, 8),
    rounds: r.summary?.rounds,
    starter: r.summary?.startingPlayerId,
    ko: r.summary?.koType,
    firstBlood: r.summary?.firstBlood?.victimId ?? null,
    votes: r.voteCounts,
    seats: r.summary?.seats.map((s) => `${s.seat}:${s.name}`).join(", "),
  }))
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `__edhMock is not defined` | The page was loaded before the extension was (re)loaded, so reload the tab. Or the console context isn't **top**. Or you loaded a prod build (`.output/chrome-mv3-prod`), which doesn't have the helper. |
| No `[EDH-Mock] Ready` line | First type `__edhMock` in the console. If it returns an object, the helper is loaded and the line was only hidden. The console filter may be set to something like `EDH-Logger` (use `EDH` to see both), or the line was printed early in the page load and then cleared. If it's `undefined`, the dev extension is off or wasn't rebuilt. Check `chrome://extensions`. |
| `play()` runs but the badge doesn't change | The service worker may be asleep or erroring. Open its console (see above). If you just rebuilt, reload the extension *and* the Convoke tab. |
| Badge count looks too high | Records from earlier runs (and real games) build up. Run `__edhMock.clear()`. |
| Votes attached to the wrong match | This shouldn't happen, since times and IDs are fresh on every play. If it does, it's a bug in `freshen()`. Add a failing test to `mock-scenarios.test.ts`. |

---

## Adding a scenario

Scenarios live in `src/shared/convoke/mock-scenarios.ts`:

1. Add the name and description to `SCENARIOS`.
2. Add a `case` in `buildScenario` that returns the events. You can filter or change the fixture's events, as `no-votes` and `player-left` do, or build from a new fixture.
3. Add the expected result to `mock-scenarios.test.ts`. Every scenario is already checked to produce at least one pending game.
4. Run `mise exec -- npx vitest run`.

### Capturing a new fixture from a real game

1. Set `VITE_CONVOKE_LOGGER=true` in `.env.dev`, rebuild, and reload the extension.
2. Play the game. Before closing or reloading the tab, run:
   ```js
   copy(JSON.stringify(window.__edhLog, null, 2))
   ```
   Paste it into a file matching `log-dumb*.json` or `convoke-log*.json` at the repo root. Both patterns are git-ignored because raw logs contain other players' data.
3. Reduce and anonymise it:
   ```bash
   python3 -I scripts/reduce-convoke-log.py convoke-log.json src/test/fixtures/convoke/<name>.json --anonymise
   ```
   This turns ~50 MB into ~100 KB. Player names become `Player N`, user IDs become `9001+`, and deck links become `example.invalid`.
4. Check the output for anything personal before committing it.

---

## Keeping it out of prod

The mock code only loads when `import.meta.env.MODE` is `dev` or `development`:

- `entrypoints/convoke-network.content.ts`: installs `__edhMock`. The scenarios and fixture are loaded with a dynamic import, which is dropped from prod builds.
- `entrypoints/convoke-bridge.content.ts`: forwards the dev-only `clear-matches` command.
- `entrypoints/background.ts`: handles `CONVOKE_DEV_CLEAR`.

To check, build prod and search the bundle. Build into a scratch folder rather than `.output/`, so your loaded extension isn't overwritten:
```bash
grep -c "__edhMock" .output/chrome-mv3-prod/content-scripts/convoke-network.js   # expect 0
```

---

## Files

| File | Role |
|---|---|
| `src/shared/convoke/mock-scenarios.ts` | Scenario definitions, `buildScenario`, `freshen` |
| `src/shared/convoke/mock-scenarios.test.ts` | Checks every scenario and repeated replays |
| `src/test/fixtures/convoke/two-match-session.json` | Anonymised real session the scenarios are built from |
| `entrypoints/convoke-network.content.ts` | In-page script: real relay, the mock helper, and the optional logger |
| `entrypoints/convoke-bridge.content.ts` | Passes page messages to the background worker |
| `src/shared/convoke/match-records.ts` | How events become match records and pending games |
| `scripts/reduce-convoke-log.py` | Reduces and anonymises captured logs into fixtures |
