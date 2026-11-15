---
title: Notion API patterns for EDH Score Recorder
date: 2026-06-10
category: docs/solutions/architecture-patterns/
module: notion
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - Writing to Notion databases from a Chrome extension background worker
  - Creating pages with inline date references in titles
  - Disambiguating relation lookups when multiple records share the same name
tags:
  - notion
  - chrome-extension
  - rich-text
  - date-mention
  - compound-filter
  - relation
  - wxt
---

# Notion API patterns for EDH Score Recorder

## Context

When wiring up Notion page creation for Games and Game Seats, two non-obvious API patterns emerged that are easy to get wrong: how to embed a clickable date in a page title, and how to scope a relation lookup to a specific owner to avoid returning the wrong record when multiple share the same name.

---

## Guidance

### 1. Inline date mentions in rich text titles

Notion titles (and any rich text property) support `mention` objects alongside `text` objects. To render `"EDH Session - @June 10, 2026"` with the date being a live, clickable mention:

```typescript
Name: {
  title: [
    { type: "text", text: { content: "EDH Session - " } },
    { type: "mention", mention: { type: "date", date: { start: date } } },
  ],
},
```

Where `date` is an ISO string `"YYYY-MM-DD"`. The resulting title shows the date as a Notion inline mention — clicking it opens the date picker. The same pattern works for any rich text property, not just titles.

**Do not** use a plain text object with the formatted date string — that produces a static string, not an interactive mention.

---

### 2. Owner-scoped compound filter for relation lookup

When two players can have decks with the same commander name, querying only by `Commander contains "Krenko"` returns the first match in the DB regardless of ownership. Scope the lookup with a compound `and` filter:

```typescript
const result = await queryDatabase(decksDbId, {
  and: [
    { property: "Commander", rich_text: { contains: commanderName } },
    { property: "Owner", relation: { contains: playerId } },
  ],
});

if (result.results.length > 0) return result.results[0].id;

// Fallback: owner not set on deck
return findDeckByCommander(commanderName);
```

The `relation: { contains: pageId }` filter matches pages where the relation property includes the given page ID. The fallback ensures old decks without an `Owner` set still work.

**Important:** resolve all player IDs first (in parallel), then resolve deck IDs using those player IDs. Do not batch player and deck resolution in a single `Promise.all` — deck lookup depends on player IDs:

```typescript
// Step 1 — resolve players in parallel
const playerIds = await Promise.all(
  playerNames.map((name) => findPlayerByName(name))
);

// Step 2 — resolve decks scoped to each player
const deckIds = await Promise.all(
  players.map((p, i) =>
    findDeckByPlayerAndCommander(p.commanders.join(" / "), playerIds[i])
  )
);
```

---

### 3. Player lookup across two username properties

Players are matched against two properties — `Username - Spelltable` first, then `Username - Convoke` — because the same person can have different usernames on each platform:

```typescript
const bySpelltable = await queryDatabase(playersDbId, {
  property: "Username - Spelltable",
  rich_text: { equals: name },
});
if (bySpelltable.results.length > 0) return bySpelltable.results[0].id;

const byConvoke = await queryDatabase(playersDbId, {
  property: "Username - Convoke",
  rich_text: { equals: name },
});
if (byConvoke.results.length > 0) return byConvoke.results[0].id;

throw new Error(`Player not found: "${name}"`);
```

Use `equals` (not `contains`) here — partial username matches produce false positives.

---

## Why This Matters

- **Date mentions**: Without them, game titles are static strings. With them, the date is a first-class Notion property — filterable, sortable, and linkable from calendar views.
- **Owner-scoped lookup**: Without it, two players sharing a commander silently get each other's decks linked in the game record. The corrupt relation is invisible until stats are wrong.
- **Sequential player → deck resolution**: The Notion API has no batch-resolve endpoint. Parallelising correctly (players first, then decks) is the only way to keep latency low without hitting a race condition on the player IDs.

## When to Apply

- Any time a new Notion page type is added that should reference a date in its title
- Any time a new relation lookup is added and the target DB could have multiple rows matching the same property value
- When adding a new platform (beyond SpellTable and Convoke) that contributes player usernames

## Examples

**Before (static string title):**
```typescript
Name: { title: [{ text: { content: `Game – ${date}` } }] }
// → renders as plain text: "Game – 2026-06-10"
```

**After (clickable date mention):**
```typescript
Name: {
  title: [
    { type: "text", text: { content: "EDH Session - " } },
    { type: "mention", mention: { type: "date", date: { start: date } } },
  ],
}
// → renders as: "EDH Session - @June 10, 2026" (interactive)
```

**Before (commander-only deck lookup — wrong when two players share a commander):**
```typescript
const deckIds = await Promise.all(
  players.map((p) => findDeckByCommander(p.commanders.join(" / ")))
);
```

**After (owner-scoped lookup):**
```typescript
const playerIds = await Promise.all(players.map((p) => findPlayerByName(p.name)));
const deckIds = await Promise.all(
  players.map((p, i) =>
    findDeckByPlayerAndCommander(p.commanders.join(" / "), playerIds[i])
  )
);
```

## Related

- `src/shared/notion.ts` — `findDeckByPlayerAndCommander`, `createGame`, `createGameSeat`
- `entrypoints/background.ts` — sequential player → deck resolution in `handleSubmitGame`
