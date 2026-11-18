/**
 * What the popup's review form is filled with when a pending Convoke match is picked.
 *
 * - Filled (editable, no tag): players in seat order, first player, rounds, turn times, date.
 * - Suggested (tagged until the person submitting changes or accepts it): winner, first blood
 *   victim, KO type.
 * - Manual: win condition, first blood killer (a hint is shown), board wipes, Sol Ring.
 *
 * Names are lowercased to match the existing Convoke scraper, which is what the Notion
 * "Username - Convoke" lookup has been working with.
 */
import type { PlayerData } from "../storage";
import type { MatchRecord } from "./match-records";
import { type KoType, suggestWinner, toLocalDate } from "./suggestions";

export type SuggestedField = "winner" | "firstVictim" | "koType";

export interface ReviewDefaults {
  matchId: string;
  endedAt: string | null;
  /** YYYY-MM-DD in the local time zone (the day the game was played). */
  date: string;
  players: PlayerData[];
  firstPlayer: string | null;
  rounds: number;
  koType: KoType;
  winner: string | null;
  firstVictim: string | null;
  /** lowercased player name → total turn time in seconds */
  playerTimes: Record<string, number>;
  /** Which of the values above are suggestions rather than data. */
  suggested: SuggestedField[];
  /** Shown next to the first kill section; never pre-selected. */
  killerHint: string | null;
  winnerVotes: number;
}

export function reviewDefaults(record: MatchRecord, timeZone?: string): ReviewDefaults | null {
  const summary = record.summary;
  if (!summary) return null;

  const nameOf = new Map(summary.seats.map((s) => [s.playerId, s.name.toLowerCase()]));
  const name = (id: number | null | undefined) => (id == null ? null : (nameOf.get(id) ?? null));

  const winnerSuggestion = suggestWinner(record.voteCounts);
  const winner = name(winnerSuggestion?.playerId);
  const victim = name(summary.firstBlood?.victimId);
  const firstVictim = victim && victim !== winner ? victim : null;

  const suggested: SuggestedField[] = [];
  if (winner) suggested.push("winner");
  if (firstVictim) suggested.push("firstVictim");
  if (summary.koType) suggested.push("koType");

  return {
    matchId: record.matchId,
    endedAt: summary.endedAt,
    date: toLocalDate(summary.endedAt ?? record.updatedAt, timeZone),
    players: summary.seats.map((s) => ({ name: s.name.toLowerCase(), commanders: s.commanders })),
    firstPlayer: name(summary.startingPlayerId),
    rounds: summary.rounds,
    koType: summary.koType ?? "Staggered",
    winner,
    firstVictim,
    playerTimes: Object.fromEntries(
      summary.seats
        .filter((s) => s.totalTurnTimeSeconds > 0)
        .map((s) => [s.name.toLowerCase(), s.totalTurnTimeSeconds])
    ),
    suggested,
    killerHint: firstVictim ? name(summary.firstBlood?.killerHintId) : null,
    winnerVotes: winnerSuggestion?.votes ?? 0,
  };
}

/** Short label for the pending-games picker, e.g. "9:44 PM · Zurgo, Felothar +2". */
export function describeMatch(record: MatchRecord, timeZone?: string): string {
  const endedAt = record.summary?.endedAt;
  const time = endedAt
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(
        new Date(endedAt)
      )
    : "in progress";
  const commanders = (record.summary?.seats ?? [])
    .map((s) => s.commanders[0]?.split(",")[0])
    .filter(Boolean);
  const shown = commanders.slice(0, 2).join(", ");
  const more = commanders.length > 2 ? ` +${commanders.length - 2}` : "";
  return `${time} · ${shown}${more}`;
}
