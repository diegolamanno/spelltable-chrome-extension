/**
 * Pure rules that turn Convoke match data into Notion field values and suggestions.
 *
 * Inputs are the replies captured from Convoke's private API (see #12):
 *   POST /api/match/{id}/end           → ConvokeMatchResponse
 *   PATCH /api/match/{nextId}/state    → { winnerVotes, endedAt } (votes land in the NEXT match)
 *
 * "Suggestions" (winner, first blood, KO type) are never final: the person submitting confirms them.
 */

// ---------------------------------------------------------------------------
// Convoke shapes (only the fields we use)
// ---------------------------------------------------------------------------

export interface ConvokeCard {
  name: string;
  scryfall_id?: string;
}

export interface ConvokePlayer {
  id: number;
  name: string;
  life: number;
  isEliminated: boolean;
  totalTurnTimeMs: number;
  commander: ConvokeCard | null;
  secondaryCommander?: ConvokeCard | null;
}

export interface ConvokeGameLogEntry {
  at: string;
  type: string; // "turnOrder" | "turn" | "counter"
  by?: number;
  data?: {
    kind?: string; // "life" | "commander"
    targetId?: number;
    fromPlayerId?: number;
    from?: number;
    to?: number;
  } | null;
}

export interface ConvokeMatchResponse {
  match: {
    id: string;
    startedAt: string | null;
    endedAt: string | null;
    state: {
      playerOrder: number[];
      players: ConvokePlayer[];
      turnRound: number;
      endedAt?: string | null;
    };
    gameLog?: ConvokeGameLogEntry[];
  };
  game: { currentMatchId: string };
}

/** candidate player id → ids of the players who voted for them */
export type WinnerVotes = Record<string, number[]>;

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type KoType = "Simultaneous" | "Staggered";

export interface SeatSummary {
  seat: number; // 1-based, in turn order
  playerId: number;
  name: string;
  commanders: string[];
  totalTurnTimeSeconds: number;
}

export interface FirstBloodSuggestion {
  victimId: number;
  at: string;
  /** Last player to deal commander damage to the victim before they died. A hint only. */
  killerHintId: number | null;
}

export interface EndedMatchSummary {
  matchId: string;
  /** The match Convoke opened after this one. Winner votes for this match are saved there. */
  nextMatchId: string;
  startedAt: string | null;
  endedAt: string | null;
  rounds: number;
  startingPlayerId: number | null;
  seats: SeatSummary[];
  firstBlood: FirstBloodSuggestion | null;
  koType: KoType | null;
}

// Eliminations this close together count as one moment (people marking themselves dead at once).
const SAME_MOMENT_MS = 15_000;

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function summariseEndedMatch(res: ConvokeMatchResponse): EndedMatchSummary {
  const { match, game } = res;
  const { state } = match;
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const log = match.gameLog ?? [];

  const seats = state.playerOrder
    .map((id, i) => {
      const p = byId.get(id);
      if (!p) return null;
      return {
        seat: i + 1,
        playerId: p.id,
        name: p.name,
        commanders: [p.commander, p.secondaryCommander]
          .filter((c): c is ConvokeCard => Boolean(c?.name))
          .map((c) => c.name),
        totalTurnTimeSeconds: Math.round(p.totalTurnTimeMs / 1000),
      };
    })
    .filter((s): s is SeatSummary => s !== null);

  const eliminations = findEliminations(log);
  const first = eliminations[0];

  return {
    matchId: match.id,
    nextMatchId: game.currentMatchId,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    rounds: state.turnRound,
    startingPlayerId: state.playerOrder[0] ?? null,
    seats,
    firstBlood: first
      ? { victimId: first.playerId, at: first.at, killerHintId: lastCommanderDamageTo(log, first) }
      : null,
    koType: suggestKoType(state.players, eliminations),
  };
}

/** Leading candidate, or null when nobody voted or the top is tied. */
export function suggestWinner(votes: WinnerVotes | undefined): { playerId: number; votes: number } | null {
  const ranked = Object.entries(votes ?? {})
    .map(([id, voters]) => ({ playerId: Number(id), votes: voters.length }))
    .filter((c) => c.votes > 0)
    .sort((a, b) => b.votes - a.votes);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0].votes === ranked[1].votes) return null;
  return ranked[0];
}

/**
 * Winner votes are saved in the next match's state together with the ended match's
 * `state.endedAt`. Use that to tell which ended match a vote patch belongs to.
 */
export function isVoteForMatch(patch: { endedAt?: string | null }, ended: ConvokeMatchResponse): boolean {
  const endedAt = ended.match.state.endedAt;
  return Boolean(endedAt) && patch.endedAt === endedAt;
}

/** ISO timestamp → YYYY-MM-DD in the given (default: the browser's) time zone. */
export function toLocalDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface Elimination {
  playerId: number;
  at: string;
}

/** First time each player's life counter went from above 0 to 0 or below, in time order. */
function findEliminations(log: ConvokeGameLogEntry[]): Elimination[] {
  const seen = new Set<number>();
  const out: Elimination[] = [];
  for (const e of [...log].sort((a, b) => a.at.localeCompare(b.at))) {
    const d = e.data;
    if (e.type !== "counter" || d?.kind !== "life" || d.targetId == null || d.to == null) continue;
    if (d.to <= 0 && (d.from == null || d.from > 0) && !seen.has(d.targetId)) {
      seen.add(d.targetId);
      out.push({ playerId: d.targetId, at: e.at });
    }
  }
  return out;
}

function lastCommanderDamageTo(log: ConvokeGameLogEntry[], victim: Elimination): number | null {
  const hits = log.filter(
    (e) =>
      e.type === "counter" &&
      e.data?.kind === "commander" &&
      e.data.targetId === victim.playerId &&
      e.data.fromPlayerId != null &&
      e.at <= victim.at,
  );
  return hits.at(-1)?.data?.fromPlayerId ?? null;
}

/**
 * Staggered: players went out at two or more different moments.
 * Simultaneous: all losers went out at one moment, which includes the common case where
 * nobody marked themselves dead and the game was ended straight away.
 * The game end counts as a moment for losers still alive (everyone alive except one winner).
 */
function suggestKoType(players: ConvokePlayer[], eliminations: Elimination[]): KoType | null {
  const eliminatedIds = new Set(eliminations.map((e) => e.playerId));
  const alive = players.filter((p) => !p.isEliminated && p.life > 0 && !eliminatedIds.has(p.id));
  const aliveLosers = Math.max(alive.length - 1, 0);

  let moments = 0;
  let lastMoment = Number.NEGATIVE_INFINITY;
  for (const e of eliminations) {
    const t = Date.parse(e.at);
    if (t - lastMoment > SAME_MOMENT_MS) moments++;
    lastMoment = t;
  }
  if (aliveLosers > 0) moments++;

  const losers = eliminations.length + aliveLosers;
  if (losers < 2) return null; // nothing to compare in a 1v1 finish
  return moments >= 2 ? "Staggered" : "Simultaneous";
}
