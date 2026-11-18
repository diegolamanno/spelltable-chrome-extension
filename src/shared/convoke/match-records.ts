/**
 * Match records: what the extension remembers about each Convoke match, keyed by matchId.
 *
 * A record is created at /start (so players and commanders are kept even if someone leaves
 * or changes commander for the next game), completed at /end, and given its vote tally
 * afterwards. Ended, unsubmitted records are the "pending games" shown in the popup.
 */
import type { ConvokeMatchEvent } from "./events";
import { type EndedMatchSummary, type SeatSummary, summariseEndedMatch } from "./suggestions";

export interface RecordPlayer {
  id: number;
  name: string;
  commanders: string[];
}

export interface MatchRecord {
  matchId: string;
  /** The lobby (the id in the page URL). Several matches can share one. */
  lobbyId: string | null;
  status: "in-progress" | "ended";
  startedAt: string | null;
  /** Players as they were at /start. */
  players: RecordPlayer[];
  /** Filled in at /end. */
  summary: EndedMatchSummary | null;
  /** The ended match's state.endedAt. Vote updates saved in the next match carry this value. */
  stateEndedAt: string | null;
  /** candidate id → votes */
  voteCounts: Record<string, number>;
  updatedAt: string;
  submittedAt: string | null;
}

export type MatchRecords = Record<string, MatchRecord>;

export const MAX_RECORDS = 25;

export function applyMatchEvent(records: MatchRecords, event: ConvokeMatchEvent): MatchRecords {
  switch (event.type) {
    case "start": {
      const { match } = event.response;
      const existing = records[match.id];
      if (existing?.status === "ended") return records; // late duplicate; never undo an end
      const players: RecordPlayer[] = match.state.players.map((p) => ({
        id: p.id,
        name: p.name,
        commanders: [p.commander, p.secondaryCommander].flatMap((c) => (c?.name ? [c.name] : [])),
      }));
      return prune({
        ...records,
        [match.id]: {
          ...emptyRecord(match.id, event.at),
          ...existing,
          lobbyId: match.gameId ?? existing?.lobbyId ?? null,
          startedAt: match.startedAt,
          players,
          updatedAt: event.at,
        },
      });
    }

    case "end": {
      const { match } = event.response;
      const existing = records[match.id] ?? emptyRecord(match.id, event.at);
      const summary = summariseEndedMatch(event.response);
      summary.seats = withPlayersWhoLeft(summary.seats, existing.players);
      return prune({
        ...records,
        [match.id]: {
          ...existing,
          lobbyId: match.gameId ?? existing.lobbyId,
          status: "ended",
          startedAt: existing.startedAt ?? match.startedAt,
          players: existing.players.length
            ? existing.players
            : summary.seats.map((s) => ({
                id: s.playerId,
                name: s.name,
                commanders: s.commanders,
              })),
          summary,
          stateEndedAt: match.state.endedAt ?? null,
          updatedAt: event.at,
        },
      });
    }

    case "votes": {
      const target = event.matchId
        ? records[event.matchId]
        : Object.values(records).find((r) => r.stateEndedAt && r.stateEndedAt === event.endedAt);
      if (!target) return records;
      return {
        ...records,
        [target.matchId]: { ...target, voteCounts: event.voteCounts, updatedAt: event.at },
      };
    }
  }
}

/** Called after Notion accepted the game. Unknown ids are ignored. */
export function markSubmitted(records: MatchRecords, matchId: string, at: string): MatchRecords {
  const r = records[matchId];
  if (!r) return records;
  return { ...records, [matchId]: { ...r, submittedAt: at, updatedAt: at } };
}

/** Ended matches not yet logged to Notion, oldest first. */
export function pendingMatches(records: MatchRecords): MatchRecord[] {
  return Object.values(records)
    .filter((r) => r.status === "ended" && !r.submittedAt)
    .sort((a, b) => (a.summary?.endedAt ?? "").localeCompare(b.summary?.endedAt ?? ""));
}

// ---------------------------------------------------------------------------

function emptyRecord(matchId: string, at: string): MatchRecord {
  return {
    matchId,
    lobbyId: null,
    status: "in-progress",
    startedAt: null,
    players: [],
    summary: null,
    stateEndedAt: null,
    voteCounts: {},
    updatedAt: at,
    submittedAt: null,
  };
}

/** Players seen at /start but missing from the final state keep a seat at the end. */
function withPlayersWhoLeft(seats: SeatSummary[], startPlayers: RecordPlayer[]): SeatSummary[] {
  const present = new Set(seats.map((s) => s.playerId));
  const missing = startPlayers.filter((p) => !present.has(p.id));
  return [
    ...seats,
    ...missing.map((p, i) => ({
      seat: seats.length + i + 1,
      playerId: p.id,
      name: p.name,
      commanders: p.commanders,
      totalTurnTimeSeconds: 0,
    })),
  ];
}

/** Keep the newest MAX_RECORDS, but never drop a pending game. */
function prune(records: MatchRecords): MatchRecords {
  const all = Object.values(records);
  if (all.length <= MAX_RECORDS) return records;
  const pending = new Set(pendingMatches(records).map((r) => r.matchId));
  const keep = all
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((r, i) => pending.has(r.matchId) || i < MAX_RECORDS);
  return Object.fromEntries(keep.map((r) => [r.matchId, r]));
}
