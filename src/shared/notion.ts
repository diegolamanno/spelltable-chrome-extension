const API_KEY = import.meta.env.VITE_NOTION_API_KEY as string;
const PLAYERS_DB_ID = import.meta.env.VITE_NOTION_PLAYERS_DB_ID as string;
const DECKS_DB_ID = import.meta.env.VITE_NOTION_DECKS_DB_ID as string;
const GAMES_DB_ID = import.meta.env.VITE_NOTION_GAMES_DB_ID as string;

const NOTION_VERSION = "2022-06-28";

// Maps extension win condition IDs → Notion "Win Condition" select option names
const WINCON_MAP: Record<string, string> = {
  damage: "Combat",
  "commander-damage": "Commander Damage",
  burn: "Burn/Life Loss",
  "alt-wincon": "Alt Win Con",
  poison: "Infect",
  mill: "Mill",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function notionFetch(path: string, body: object): Promise<unknown> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
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
 * Tries matching against the "Name" title property first, then falls back to
 * "Discord Nickname" — needed because SpellTable names are lowercased and may
 * differ from the canonical Name entry.
 */
export async function findPlayerByName(name: string): Promise<string> {
  // Try title match first (Notion title equals is case-insensitive)
  const byName = await queryDatabase(PLAYERS_DB_ID, {
    property: "Name",
    title: { equals: name },
  });
  if (byName.results.length > 0) return byName.results[0].id;

  // Fall back to Discord Nickname
  const byNick = await queryDatabase(PLAYERS_DB_ID, {
    property: "Discord Nickname",
    rich_text: { equals: name },
  });
  if (byNick.results.length > 0) return byNick.results[0].id;

  throw new Error(`Player not found: "${name}"`);
}

/**
 * Looks up a deck page ID in the Decks database by commander name.
 * Uses a "contains" match on the Commander rich_text property.
 */
export async function findDeckByCommander(commanderName: string): Promise<string> {
  const result = await queryDatabase(DECKS_DB_ID, {
    property: "Commander",
    rich_text: { contains: commanderName },
  });

  if (result.results.length > 0) return result.results[0].id;

  throw new Error(`Deck not found for commander: "${commanderName}"`);
}

export interface GamePayload {
  playerIds: string[];
  deckIds: string[];
  winnerId: string;
  winnerDeckId: string;
  wincon: string;
  date: string; // ISO date string e.g. "2026-03-18"
}

/**
 * Creates a new Game page in the Games database.
 * Returns the created page ID.
 */
export async function createGame(payload: GamePayload): Promise<string> {
  const { playerIds, deckIds, winnerId, winnerDeckId, wincon, date } = payload;

  const notionWincon = WINCON_MAP[wincon];
  if (!notionWincon) throw new Error(`Unknown win condition: "${wincon}"`);

  const result = (await notionFetch("/pages", {
    parent: { database_id: GAMES_DB_ID },
    properties: {
      Name: {
        title: [{ text: { content: `Game – ${date}` } }],
      },
      Date: {
        date: { start: date },
      },
      Players: {
        relation: playerIds.map((id) => ({ id })),
      },
      Winner: {
        relation: [{ id: winnerId }],
      },
      Decks: {
        relation: deckIds.map((id) => ({ id })),
      },
      "Winner Deck": {
        relation: [{ id: winnerDeckId }],
      },
      "Win Condition": {
        select: { name: notionWincon },
      },
      // Placeholder — will be expanded later
      "Type of KO": {
        select: { name: "Staggered KO" },
      },
    },
  })) as { id: string };

  return result.id;
}
