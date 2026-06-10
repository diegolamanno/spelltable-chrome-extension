import { notionConfigStorage } from "./storage";

const NOTION_VERSION = "2022-06-28";

// Maps WIN_CONDITIONS button labels → Notion "Win Condition" select option names
const WINCON_MAP: Record<string, string> = {
  Combat:        "Combat",
  "Cmdr Dmg":    "Commander Damage",
  "Burn/Life":   "Burn/Life Loss",
  "Alt Win Con": "Alt Win Con",
  Infect:        "Infect",
  Mill:          "Mill",
  Combo:         "Combo",
  Stolen:        "Stolen",
  Draw:          "Draw",
};

// Maps extension KO type values → Notion "Type of KO" select option names
const KO_TYPE_MAP: Record<string, string> = {
  Simultaneous: "Simultaneous KO",
  Staggered: "Staggered KO",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function notionFetch(path: string, body: object): Promise<unknown> {
  const cfg = await notionConfigStorage.getValue();
  if (!cfg.apiKey) throw new Error("Notion API key not configured — open extension settings.");

  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = (await res.json()) as { message?: string };
    throw new Error(err.message ?? `Notion API error ${res.status}`);
  }

  return res.json();
}

function queryDatabase(databaseId: string, filter: object) {
  return notionFetch(`/databases/${databaseId}/query`, { filter }) as Promise<{
    results: Array<{ id: string }>;
  }>;
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Looks up a player page ID in the Players database.
 * Tries "Username - Spelltable" first, then falls back to "Username - Convoke".
 */
export async function findPlayerByName(name: string): Promise<string> {
  const { playersDbId } = await notionConfigStorage.getValue();
  if (!playersDbId) throw new Error("Players DB ID not configured — open extension settings.");

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

  throw new Error(`Player not found: "${name}" (checked Username - Spelltable and Username - Convoke)`);
}

/**
 * Looks up a deck page ID in the Decks database by commander name.
 * Uses a "contains" match on the Commander rich_text property.
 */
export async function findDeckByCommander(commanderName: string): Promise<string> {
  const { decksDbId } = await notionConfigStorage.getValue();
  if (!decksDbId) throw new Error("Decks DB ID not configured — open extension settings.");

  const result = await queryDatabase(decksDbId, {
    property: "Commander",
    rich_text: { contains: commanderName },
  });

  if (result.results.length > 0) return result.results[0].id;

  throw new Error(`Deck not found for commander: "${commanderName}"`);
}

/**
 * Looks up a deck page ID scoped to a specific player owner.
 * Uses a compound filter: Commander contains commanderName AND Owner relation contains playerId.
 * Falls back to commander-only lookup if no owner-scoped match is found.
 */
export async function findDeckByPlayerAndCommander(
  commanderName: string,
  playerId: string,
): Promise<string> {
  const { decksDbId } = await notionConfigStorage.getValue();
  if (!decksDbId) throw new Error("Decks DB ID not configured — open extension settings.");

  const result = await queryDatabase(decksDbId, {
    and: [
      { property: "Commander", rich_text: { contains: commanderName } },
      { property: "Owner", relation: { contains: playerId } },
    ],
  });

  if (result.results.length > 0) return result.results[0].id;

  return findDeckByCommander(commanderName);
}

export interface GameSeatPayload {
  gameId: string;
  playerId: string;
  deckId: string;
  seat: number;
  playerName: string;
  date: string;
  rawTime?: number; // total turn time in seconds; omitted when game logged before Convoke end screen
}

/**
 * Creates a Game Seat entry linking a player + deck to a specific seat in a game.
 */
export async function createGameSeat(payload: GameSeatPayload): Promise<string> {
  const { gameSeatsDbId } = await notionConfigStorage.getValue();
  if (!gameSeatsDbId) throw new Error("Game Seats DB ID not configured — open extension settings.");

  const { gameId, playerId, deckId, seat, playerName, date, rawTime } = payload;

  const result = (await notionFetch("/pages", {
    parent: { database_id: gameSeatsDbId },
    properties: {
      Name: {
        title: [
          { type: "text", text: { content: `Seat ${seat} - ` } },
          { type: "mention", mention: { type: "date", date: { start: date } } },
        ],
      },
      Game: {
        relation: [{ id: gameId }],
      },
      Player: {
        relation: [{ id: playerId }],
      },
      Deck: {
        relation: [{ id: deckId }],
      },
      Seat: {
        number: seat,
      },
      ...(rawTime !== undefined && {
        "Raw time": { number: rawTime },
      }),
    },
  })) as { id: string };

  return result.id;
}

export interface GamePayload {
  playerIds: string[];
  deckIds: string[];
  winnerId: string | null;
  winnerDeckId: string | null;
  wincon: string;
  date: string; // ISO date string e.g. "2026-03-18"
  firstPlayerId: string | null;
  firstKillerId: string | null;
  firstKillerDeckId: string | null;
  firstVictimId: string | null;
  firstVictimDeckId: string | null;
  koType: string;
  boardWipes: number;
  rounds: number;
  solRing: boolean;
}

/**
 * Creates a new Game page in the Games database.
 * Returns the created page ID.
 */
export async function createGame(payload: GamePayload): Promise<string> {
  const { gamesDbId } = await notionConfigStorage.getValue();
  if (!gamesDbId) throw new Error("Games DB ID not configured — open extension settings.");

  const {
    playerIds, deckIds, winnerId, winnerDeckId, wincon, date,
    firstPlayerId, firstKillerId, firstKillerDeckId, firstVictimId, firstVictimDeckId, koType, boardWipes, rounds, solRing,
  } = payload;

  const notionWincon = WINCON_MAP[wincon];
  if (!notionWincon) throw new Error(`Unknown win condition: "${wincon}"`);

  const notionKoType = KO_TYPE_MAP[koType] ?? "Staggered KO";

  const result = (await notionFetch("/pages", {
    parent: { database_id: gamesDbId },
    properties: {
      Name: {
        title: [
          { type: "text", text: { content: "EDH Session - " } },
          { type: "mention", mention: { type: "date", date: { start: date } } },
        ],
      },
      Date: {
        date: { start: date },
      },
      Players: {
        relation: playerIds.map((id) => ({ id })),
      },
      ...(winnerId && {
        Winner: { relation: [{ id: winnerId }] },
      }),
      Decks: {
        relation: deckIds.map((id) => ({ id })),
      },
      ...(winnerDeckId && {
        "Winner Deck": { relation: [{ id: winnerDeckId }] },
      }),
      "Win Condition": {
        select: { name: notionWincon },
      },
      "Type of KO": {
        select: { name: notionKoType },
      },
      "Board Wipes": {
        number: boardWipes,
      },
      "Game Length": {
        number: rounds,
      },
      "Sol Ring": {
        checkbox: solRing,
      },
      ...(firstPlayerId && {
        "Starting Player": { relation: [{ id: firstPlayerId }] },
      }),
      ...(firstKillerId && {
        "First Blood Killer": { relation: [{ id: firstKillerId }] },
      }),
      ...(firstKillerDeckId && {
        "First Blood Killer Deck": { relation: [{ id: firstKillerDeckId }] },
      }),
      ...(firstVictimId && {
        "First Blood Victim": { relation: [{ id: firstVictimId }] },
      }),
      ...(firstVictimDeckId && {
        "First Blood Victim Deck": { relation: [{ id: firstVictimDeckId }] },
      }),
    },
  })) as { id: string };

  return result.id;
}
