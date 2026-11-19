/**
 * Submitting a game to Notion, safe to retry.
 *
 * - Duplicates across the pod: when a Convoke matchId is known and the Games database has a
 *   "Match ID" property, a game already logged for that match is reported as "already-logged"
 *   instead of being created again.
 * - Partial failures: once the Game exists, its Notion id and the seats created so far are saved
 *   under the submission key. A retry with the same key creates only the missing seats.
 *
 * Notion and storage are passed in (SubmitDeps) so this can be tested without Chrome or Notion.
 */
import type { GamePayload, GameSeatPayload } from "./notion";
import type { PlayerData } from "./storage";

export interface SubmitGameData {
  players: PlayerData[];
  winner: string | null;
  wincon: string;
  firstPlayer: string | null;
  firstKiller: string | null;
  firstVictim: string | null;
  koType: string;
  boardWipes: number;
  rounds: number;
  solRing: boolean;
  /**
   * Identifies this submission across retries: the Convoke matchId, or an id the popup makes
   * for each live-table form. Without it, a retry can't resume and may create a second Game.
   */
  submissionKey?: string;
  /** Set when logging a pending Convoke match. Used for the duplicate check and marked submitted. */
  matchId?: string;
  /** YYYY-MM-DD the game was played (local). Defaults to deps.today(). */
  date?: string;
  /** lowercased player name → turn time in seconds. Defaults to deps.fallbackPlayerTimes(). */
  playerTimes?: Record<string, number>;
}

export interface SubmitProgress {
  /** Notion page id of the Game created for this submission. */
  gameId: string;
  /** Seat numbers (1-based) whose Game Seat rows exist. */
  seatsCreated: number[];
  updatedAt: string;
}

export type SubmitResult =
  | { status: "logged"; gameId: string }
  /** Someone (possibly another person in the pod) already logged this match. Nothing was created. */
  | { status: "already-logged"; gameId: string }
  /** The Game exists but some seats failed. Retrying with the same submissionKey creates only those. */
  | { status: "partial"; gameId: string; missingSeats: number[]; error: string }
  /** Nothing was created (e.g. a player or deck lookup failed). Safe to retry. */
  | { status: "failed"; error: string };

export interface SubmitDeps {
  findPlayerByName(name: string): Promise<string>;
  /** Throws when the player has no matching deck, or more than one (see notion.ts). */
  findDeckByPlayerAndCommander(
    commanders: string[],
    playerId: string,
    playerName: string
  ): Promise<string>;
  findGameByMatchId(matchId: string): Promise<string | null>;
  createGame(payload: GamePayload): Promise<string>;
  createGameSeat(payload: GameSeatPayload): Promise<string>;
  loadProgress(key: string): Promise<SubmitProgress | null>;
  saveProgress(key: string, progress: SubmitProgress): Promise<void>;
  clearProgress(key: string): Promise<void>;
  fallbackPlayerTimes(): Promise<Record<string, number>>;
  today(): string;
  now(): string;
}

export async function submitGame(data: SubmitGameData, deps: SubmitDeps): Promise<SubmitResult> {
  const key = data.submissionKey ?? data.matchId ?? null;
  let progress = key ? await deps.loadProgress(key) : null;

  try {
    // Our own earlier, partial attempt takes priority over the Notion duplicate check:
    // the Game it finds would be the one we created.
    if (!progress && data.matchId) {
      const existing = await deps.findGameByMatchId(data.matchId);
      if (existing) return { status: "already-logged", gameId: existing };
    }

    const { players } = data;
    const playerIds = await Promise.all(players.map((p) => deps.findPlayerByName(p.name)));
    // Look up every deck before failing, so one attempt reports all the deck problems.
    const decks = await Promise.allSettled(
      players.map((p, i) => deps.findDeckByPlayerAndCommander(p.commanders, playerIds[i], p.name))
    );
    const deckErrors = decks.flatMap((d) =>
      d.status === "rejected"
        ? [d.reason instanceof Error ? d.reason.message : String(d.reason)]
        : []
    );
    if (deckErrors.length > 0) throw new Error(deckErrors.join("\n"));
    const deckIds = decks.map((d) => (d as PromiseFulfilledResult<string>).value);
    const date = data.date ?? deps.today();

    if (!progress) {
      const gameId = await deps.createGame(gamePayload(data, playerIds, deckIds, date));
      progress = { gameId, seatsCreated: [], updatedAt: deps.now() };
      if (key) await deps.saveProgress(key, progress);
    }

    const times = data.playerTimes ?? (await deps.fallbackPlayerTimes());
    const gameId = progress.gameId;
    const missing = players
      .map((_, i) => i + 1)
      .filter((seat) => !progress?.seatsCreated.includes(seat));

    const results = await Promise.allSettled(
      missing.map((seat) => {
        const p = players[seat - 1];
        const rawTime = times[p.name.toLowerCase()];
        return deps.createGameSeat({
          gameId,
          playerId: playerIds[seat - 1],
          deckId: deckIds[seat - 1],
          seat,
          playerName: p.name,
          date,
          ...(rawTime !== undefined && { rawTime }),
        });
      })
    );

    const created = missing.filter((_, i) => results[i].status === "fulfilled");
    const stillMissing = missing.filter((_, i) => results[i].status === "rejected");
    progress = {
      gameId,
      seatsCreated: [...progress.seatsCreated, ...created].sort((a, b) => a - b),
      updatedAt: deps.now(),
    };

    if (stillMissing.length > 0) {
      if (key) await deps.saveProgress(key, progress);
      const firstError = results.find(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      )?.reason;
      return {
        status: "partial",
        gameId,
        missingSeats: stillMissing,
        error: firstError instanceof Error ? firstError.message : String(firstError),
      };
    }

    if (key) await deps.clearProgress(key);
    return { status: "logged", gameId };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

function gamePayload(
  data: SubmitGameData,
  playerIds: string[],
  deckIds: string[],
  date: string
): GamePayload {
  const { players } = data;
  const indexOf = (name: string | null) => (name ? players.findIndex((p) => p.name === name) : -1);
  const pick = (ids: string[], i: number) => (i !== -1 ? ids[i] : null);

  const winnerIndex = indexOf(data.winner);
  if (data.winner && winnerIndex === -1)
    throw new Error(`Winner "${data.winner}" not in players list`);
  const firstPlayerIndex = indexOf(data.firstPlayer);
  const killerIndex = indexOf(data.firstKiller);
  const victimIndex = indexOf(data.firstVictim);

  return {
    playerIds,
    deckIds,
    winnerId: pick(playerIds, winnerIndex),
    winnerDeckId: pick(deckIds, winnerIndex),
    wincon: data.wincon,
    date,
    firstPlayerId: pick(playerIds, firstPlayerIndex),
    firstKillerId: pick(playerIds, killerIndex),
    firstKillerDeckId: pick(deckIds, killerIndex),
    firstVictimId: pick(playerIds, victimIndex),
    firstVictimDeckId: pick(deckIds, victimIndex),
    koType: data.koType,
    boardWipes: data.boardWipes,
    rounds: data.rounds,
    solRing: data.solRing,
    ...(data.matchId && { matchId: data.matchId }),
  };
}
