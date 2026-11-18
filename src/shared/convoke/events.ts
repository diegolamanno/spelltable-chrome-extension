/**
 * Turns Convoke API traffic (seen by the in-page script) into small match events
 * that are relayed to the background worker. See #12 for the request shapes.
 */
import type { ConvokeGameLogEntry, ConvokeMatchResponse, ConvokePlayer } from "./suggestions";

/** Marks window.postMessage traffic from our in-page script. */
export const RELAY_SOURCE = "edh-score-recorder:convoke";

export type ConvokeMatchEvent =
  | { type: "start"; at: string; response: ConvokeMatchResponse }
  | { type: "end"; at: string; response: ConvokeMatchResponse }
  /**
   * Full vote tally (candidate id → votes). It comes either from a vote-winner reply
   * (`matchId` known) or from the next match's state (`endedAt` of the ended match).
   */
  | { type: "votes"; at: string; matchId?: string; endedAt?: string | null; voteCounts: Record<string, number> };

const MATCH_PATH = /^\/api\/match\/([0-9a-f-]{36})\/(start|end|vote-winner|state)$/;

export function classifyRequest(req: {
  method: string;
  path: string;
  status: number;
  requestBody: unknown;
  responseBody: unknown;
  at: string;
}): ConvokeMatchEvent | null {
  if (req.status < 200 || req.status >= 300) return null;
  const m = MATCH_PATH.exec(req.path);
  if (!m) return null;
  const [, matchId, action] = m;
  const method = req.method.toUpperCase();

  if (method === "POST" && (action === "start" || action === "end")) {
    const response = slimMatchResponse(req.responseBody);
    return response ? { type: action, at: req.at, response } : null;
  }

  if (method === "POST" && action === "vote-winner") {
    const counts = asRecord(asRecord(req.responseBody)?.voteCounts);
    return counts ? { type: "votes", at: req.at, matchId, voteCounts: toCounts(counts) } : null;
  }

  if (method === "PATCH" && action === "state") {
    const body = asRecord(req.requestBody);
    const winnerVotes = asRecord(body?.winnerVotes);
    if (!body || !winnerVotes) return null;
    const endedAt = typeof body.endedAt === "string" ? body.endedAt : null;
    return { type: "votes", at: req.at, endedAt, voteCounts: toCounts(winnerVotes) };
  }

  return null;
}

/** Keeps only the fields we use from a /start or /end reply (the full reply is ~60 KB). */
export function slimMatchResponse(raw: unknown): ConvokeMatchResponse | null {
  const match = asRecord(asRecord(raw)?.match);
  const game = asRecord(asRecord(raw)?.game);
  const state = asRecord(match?.state);
  if (!match || !game || !state) return null;
  if (typeof match.id !== "string" || typeof game.currentMatchId !== "string") return null;
  if (!Array.isArray(state.players) || !Array.isArray(state.playerOrder)) return null;

  return {
    match: {
      id: match.id,
      gameId: typeof match.gameId === "string" ? match.gameId : undefined,
      startedAt: str(match.startedAt),
      endedAt: str(match.endedAt),
      state: {
        playerOrder: state.playerOrder.filter((x): x is number => typeof x === "number"),
        players: state.players.map(slimPlayer).filter((p): p is ConvokePlayer => p !== null),
        turnRound: typeof state.turnRound === "number" ? state.turnRound : 0,
        endedAt: str(state.endedAt),
      },
      gameLog: Array.isArray(match.gameLog) ? match.gameLog.map(slimLogEntry).filter(isLogEntry) : [],
    },
    game: { currentMatchId: game.currentMatchId },
  };
}

/** Light shape check for messages arriving over window.postMessage. */
export function isConvokeMatchEvent(x: unknown): x is ConvokeMatchEvent {
  const e = asRecord(x);
  if (!e || typeof e.at !== "string") return false;
  if (e.type === "start" || e.type === "end") return slimMatchResponse(e.response) !== null;
  if (e.type === "votes") return asRecord(e.voteCounts) !== null;
  return false;
}

/** { candidateId: [voterIds] } or { candidateId: count } → { candidateId: count } */
export function toCounts(votes: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(votes)) {
    const n = Array.isArray(v) ? v.length : typeof v === "number" ? v : 0;
    if (n > 0) out[id] = n;
  }
  return out;
}

// ---------------------------------------------------------------------------

function slimPlayer(raw: unknown): ConvokePlayer | null {
  const p = asRecord(raw);
  if (!p || typeof p.id !== "number" || typeof p.name !== "string") return null;
  return {
    id: p.id,
    name: p.name,
    life: typeof p.life === "number" ? p.life : 0,
    isEliminated: p.isEliminated === true,
    totalTurnTimeMs: typeof p.totalTurnTimeMs === "number" ? p.totalTurnTimeMs : 0,
    commander: slimCard(p.commander),
    secondaryCommander: slimCard(p.secondaryCommander),
  };
}

function slimCard(raw: unknown) {
  const c = asRecord(raw);
  if (!c || typeof c.name !== "string") return null;
  return { name: c.name, ...(typeof c.scryfall_id === "string" && { scryfall_id: c.scryfall_id }) };
}

function slimLogEntry(raw: unknown): ConvokeGameLogEntry | null {
  const e = asRecord(raw);
  if (!e || typeof e.at !== "string" || typeof e.type !== "string") return null;
  if (e.type !== "counter") return { at: e.at, type: e.type }; // only counters need their data
  const d = asRecord(e.data) ?? {};
  return {
    at: e.at,
    type: e.type,
    ...(typeof e.by === "number" && { by: e.by }),
    data: {
      kind: str(d.kind) ?? undefined,
      targetId: num(d.targetId),
      fromPlayerId: num(d.fromPlayerId),
      from: num(d.from),
      to: num(d.to),
    },
  };
}

function isLogEntry(e: ConvokeGameLogEntry | null): e is ConvokeGameLogEntry {
  return e !== null;
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

function str(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function num(x: unknown): number | undefined {
  return typeof x === "number" ? x : undefined;
}
