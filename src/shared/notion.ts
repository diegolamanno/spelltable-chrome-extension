import { notionConfigStorage } from "./storage";

const NOTION_VERSION = "2022-06-28";

// Maps WIN_CONDITIONS button labels → Notion "Win Condition" select option names
const WINCON_MAP: Record<string, string> = {
  Combat: "Combat",
  "Cmdr Dmg": "Commander Damage",
  "Burn/Life": "Burn/Life Loss",
  "Alt Win Con": "Alt Win Con",
  Infect: "Infect",
  Mill: "Mill",
  Combo: "Combo",
  Stolen: "Stolen",
  Draw: "Draw",
};

// Maps extension KO type values → Notion "Type of KO" select option names
const KO_TYPE_MAP: Record<string, string> = {
  Simultaneous: "Simultaneous KO",
  Staggered: "Staggered KO",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function notionFetch(path: string, body?: object): Promise<unknown> {
  const cfg = await notionConfigStorage.getValue();
  if (!cfg.apiKey) throw new Error("Notion API key not configured — open extension settings.");

  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
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
// Match ID (optional Games property, used to block duplicate submits)
// ---------------------------------------------------------------------------

export const MATCH_ID_PROPERTY = "Match ID";

// Optional properties are checked once per service-worker lifetime and per database.
const propertyChecks = new Map<string, Promise<boolean>>();

/** True when the database has a property with this name and type. False on any error. */
function databaseHasProperty(dbId: string, name: string, type: string): Promise<boolean> {
  const key = `${dbId}:${name}:${type}`;
  let check = propertyChecks.get(key);
  if (!check) {
    check = (
      notionFetch(`/databases/${dbId}`) as Promise<{
        properties?: Record<string, { type?: string }>;
      }>
    )
      .then((db) => db.properties?.[name]?.type === type)
      .catch(() => false);
    propertyChecks.set(key, check);
  }
  return check;
}

/** True when the Games database has a text property named "Match ID". */
export function gamesSupportMatchId(): Promise<boolean> {
  return notionConfigStorage
    .getValue()
    .then(({ gamesDbId }) =>
      gamesDbId ? databaseHasProperty(gamesDbId, MATCH_ID_PROPERTY, "rich_text") : false
    );
}

/** Notion page id of a Game already logged for this match, or null (also when Match ID isn't set up). */
export async function findGameByMatchId(matchId: string): Promise<string | null> {
  if (!(await gamesSupportMatchId())) return null;
  const { gamesDbId } = await notionConfigStorage.getValue();
  const result = await queryDatabase(gamesDbId, {
    property: MATCH_ID_PROPERTY,
    rich_text: { equals: matchId },
  });
  return result.results[0]?.id ?? null;
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

  throw new Error(
    `Player not found: "${name}" (checked Username - Spelltable and Username - Convoke)`
  );
}

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

interface DeckPage {
  id: string;
  properties?: Record<string, { type?: string; title?: RichText[]; rich_text?: RichText[] }>;
}
type RichText = { plain_text?: string };

function plainText(prop?: { title?: RichText[]; rich_text?: RichText[] }): string {
  return (prop?.title ?? prop?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");
}

function deckName(deck: DeckPage): string {
  const title = Object.values(deck.properties ?? {}).find((p) => p.type === "title");
  return plainText(title) || "Untitled deck";
}

/**
 * True when the deck's Commander text is exactly these commanders, in any order, with only
 * separators between them ("A / B", "B & A", "A // B"...).
 */
export function commanderTextMatches(text: string, commanders: string[]): boolean {
  let rest = text.toLowerCase();
  // Longest first, so a name that contains another is removed whole.
  for (const name of [...commanders].sort((a, b) => b.length - a.length)) {
    const i = rest.indexOf(name.toLowerCase());
    if (i === -1) return false;
    rest = `${rest.slice(0, i)} ${rest.slice(i + name.length)}`;
  }
  return /^[\s/&+|,-]*$/.test(rest);
}

function listCommanders(commanders: string[]): string {
  return commanders.map((c) => `"${c}"`).join(" + ");
}

/**
 * Optional Decks text property for the second commander (partner, background, or any other
 * card Convoke sends as the secondary commander). Notion matches property names exactly.
 */
export const PARTNER_PROPERTY = "Partner / Background";

const contains = (property: string, value: string) => ({
  property,
  rich_text: { contains: value },
});

/** Notion filter for this player's decks with these commanders. */
export function deckFilter(names: string[], playerId: string, partnerField: boolean): object {
  const owner = { property: "Owner", relation: { contains: playerId } };
  // Decks not split yet (or no Partner / Background field): every commander in the Commander text, "A / B".
  const inCommander = { and: [owner, ...names.map((n) => contains("Commander", n))] };
  if (!partnerField || names.length > 2) return inCommander;

  const [first, second] = names;
  if (!second) {
    // A single commander must not match a partner deck that happens to include it.
    return {
      and: [
        owner,
        contains("Commander", first),
        { property: PARTNER_PROPERTY, rich_text: { is_empty: true } },
      ],
    };
  }
  return {
    or: [
      { and: [owner, contains("Commander", first), contains(PARTNER_PROPERTY, second)] },
      { and: [owner, contains("Commander", second), contains(PARTNER_PROPERTY, first)] },
      inCommander,
    ],
  };
}

/**
 * The deck owned by this player with these commanders: one in Commander and the other in
 * Partner (either way round), or, for decks not split yet, all of them in the Commander text. Throws a message meant for the popup when there is no deck or
 * when the match is ambiguous: a wrong deck must never be linked silently.
 *
 * Several matches are narrowed to the one whose Commander text is exactly these commanders;
 * if that doesn't leave exactly one, the submit fails and names the candidates.
 */
export async function findDeckByPlayerAndCommander(
  commanders: string[],
  playerId: string,
  playerName: string
): Promise<string> {
  const { decksDbId } = await notionConfigStorage.getValue();
  if (!decksDbId) throw new Error("Decks DB ID not configured — open extension settings.");

  const names = commanders.map((c) => c.trim()).filter(Boolean);
  if (names.length === 0)
    throw new Error(`${playerName} has no commander, so no deck can be linked.`);

  const partnerField = await databaseHasProperty(decksDbId, PARTNER_PROPERTY, "rich_text");
  const { results } = (await queryDatabase(
    decksDbId,
    deckFilter(names, playerId, partnerField)
  )) as { results: DeckPage[] };

  if (results.length === 1) return results[0].id;

  if (results.length === 0) {
    throw new Error(
      `No deck found for ${playerName} with commander ${listCommanders(names)}. ` +
        `In Notion Decks, set ${playerName} as the Owner and check the Commander text.`
    );
  }

  const exact = results.filter((d) =>
    commanderTextMatches(
      `${plainText(d.properties?.Commander)} / ${plainText(d.properties?.[PARTNER_PROPERTY])}`,
      names
    )
  );
  if (exact.length === 1) return exact[0].id;

  const candidates = (exact.length > 1 ? exact : results).map((d) => `"${deckName(d)}"`).join(", ");
  throw new Error(
    `${playerName} has ${exact.length > 1 ? exact.length : results.length} decks matching ` +
      `${listCommanders(names)}: ${candidates}. Make their Commander text distinct in Notion.`
  );
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

  const { gameId, playerId, deckId, seat, date, rawTime } = payload;

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
        "Raw Time": { number: rawTime },
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
  /** Convoke match id; written to "Match ID" when the Games database has that property. */
  matchId?: string;
}

/**
 * Creates a new Game page in the Games database.
 * Returns the created page ID.
 */
export async function createGame(payload: GamePayload): Promise<string> {
  const { gamesDbId } = await notionConfigStorage.getValue();
  if (!gamesDbId) throw new Error("Games DB ID not configured — open extension settings.");

  const {
    playerIds,
    deckIds,
    winnerId,
    winnerDeckId,
    wincon,
    date,
    firstPlayerId,
    firstKillerId,
    firstKillerDeckId,
    firstVictimId,
    firstVictimDeckId,
    koType,
    boardWipes,
    rounds,
    solRing,
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
      ...(payload.matchId &&
        (await gamesSupportMatchId()) && {
          [MATCH_ID_PROPERTY]: {
            rich_text: [{ type: "text", text: { content: payload.matchId } }],
          },
        }),
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
