import { describe, expect, it } from "vitest";
import type { GamePayload, GameSeatPayload } from "./notion";
import { type SubmitDeps, type SubmitGameData, type SubmitProgress, submitGame } from "./submit";

/** In-memory Notion + progress store. `failSeats` makes those seat numbers fail once each. */
function fakeNotion(opts: { existingMatchIds?: Record<string, string>; failSeats?: number[]; missingPlayer?: string } = {}) {
  const games: GamePayload[] = [];
  const seats: GameSeatPayload[] = [];
  const progress = new Map<string, SubmitProgress>();
  const failOnce = new Set(opts.failSeats ?? []);

  const deps: SubmitDeps = {
    findPlayerByName: async (name) => {
      if (name === opts.missingPlayer) throw new Error(`Player not found: "${name}"`);
      return `player:${name}`;
    },
    findDeckByPlayerAndCommander: async (commander, playerId) => `deck:${playerId}:${commander}`,
    findGameByMatchId: async (matchId) => opts.existingMatchIds?.[matchId] ?? null,
    createGame: async (payload) => {
      games.push(payload);
      return `game-${games.length}`;
    },
    createGameSeat: async (payload) => {
      if (failOnce.delete(payload.seat)) throw new Error(`Notion error on seat ${payload.seat}`);
      seats.push(payload);
      return `seat-${seats.length}`;
    },
    loadProgress: async (key) => progress.get(key) ?? null,
    saveProgress: async (key, p) => {
      progress.set(key, p);
    },
    clearProgress: async (key) => {
      progress.delete(key);
    },
    fallbackPlayerTimes: async () => ({}),
    today: () => "2026-11-18",
    now: () => "2026-11-18T12:00:00Z",
  };
  return { deps, games, seats, progress };
}

const game: SubmitGameData = {
  players: [
    { name: "player 4", commanders: ["Zurgo Stormrender"] },
    { name: "player 1", commanders: ["Felothar the Steadfast"] },
    { name: "player 3", commanders: ["Doran, Besieged by Time"] },
    { name: "player 2", commanders: ["Tidus, Yuna's Guardian"] },
  ],
  winner: "player 4",
  wincon: "Combat",
  firstPlayer: "player 4",
  firstKiller: null,
  firstVictim: "player 1",
  koType: "Staggered",
  boardWipes: 1,
  rounds: 7,
  solRing: false,
  matchId: "match-1",
  submissionKey: "match-1",
  date: "2026-11-17",
  playerTimes: { "player 4": 664, "player 1": 628 },
};

describe("submitGame", () => {
  it("creates the game and one seat per player, then forgets the progress", async () => {
    const n = fakeNotion();
    const result = await submitGame(game, n.deps);

    expect(result).toEqual({ status: "logged", gameId: "game-1" });
    expect(n.games).toHaveLength(1);
    expect(n.games[0]).toMatchObject({
      matchId: "match-1",
      date: "2026-11-17",
      winnerId: "player:player 4",
      firstVictimId: "player:player 1",
    });
    expect(n.seats.map((s) => s.seat).sort()).toEqual([1, 2, 3, 4]);
    expect(n.seats.find((s) => s.seat === 1)?.rawTime).toBe(664);
    expect(n.seats.find((s) => s.seat === 3)).not.toHaveProperty("rawTime");
    expect(n.progress.size).toBe(0);
  });

  it("reports a match someone already logged, without creating anything", async () => {
    const n = fakeNotion({ existingMatchIds: { "match-1": "game-by-someone-else" } });
    expect(await submitGame(game, n.deps)).toEqual({ status: "already-logged", gameId: "game-by-someone-else" });
    expect(n.games).toHaveLength(0);
    expect(n.seats).toHaveLength(0);
  });

  it("reports failed seats and keeps the game for a retry", async () => {
    const n = fakeNotion({ failSeats: [2, 4] });
    const result = await submitGame(game, n.deps);

    expect(result).toMatchObject({ status: "partial", gameId: "game-1", missingSeats: [2, 4] });
    expect(n.progress.get("match-1")).toMatchObject({ gameId: "game-1", seatsCreated: [1, 3] });
  });

  it("retries only the missing seats, without a second game", async () => {
    const n = fakeNotion({ failSeats: [2, 4] });
    await submitGame(game, n.deps);
    const retry = await submitGame(game, n.deps);

    expect(retry).toEqual({ status: "logged", gameId: "game-1" });
    expect(n.games).toHaveLength(1);
    expect(n.seats.map((s) => s.seat).sort()).toEqual([1, 2, 3, 4]);
    expect(n.progress.size).toBe(0);
  });

  it("resumes its own partial game even though Notion now finds that match id", async () => {
    const n = fakeNotion({ failSeats: [2] });
    await submitGame(game, n.deps);
    // The game we created now carries the Match ID, so the duplicate check would find it.
    n.deps.findGameByMatchId = async () => "game-1";
    expect(await submitGame(game, n.deps)).toEqual({ status: "logged", gameId: "game-1" });
    expect(n.seats).toHaveLength(4);
  });

  it("creates nothing when a lookup fails", async () => {
    const n = fakeNotion({ missingPlayer: "player 3" });
    const result = await submitGame(game, n.deps);

    expect(result).toEqual({ status: "failed", error: 'Player not found: "player 3"' });
    expect(n.games).toHaveLength(0);
    expect(n.progress.size).toBe(0);
  });

  it("rejects a winner who isn't at the table", async () => {
    const n = fakeNotion();
    const result = await submitGame({ ...game, winner: "nobody" }, n.deps);
    expect(result).toMatchObject({ status: "failed" });
    expect(n.games).toHaveLength(0);
  });

  it("uses the popup's key for live-table games (no match id)", async () => {
    const n = fakeNotion({ failSeats: [1] });
    const live = { ...game, matchId: undefined, submissionKey: "form-abc", date: undefined, playerTimes: undefined };
    await submitGame(live, n.deps);
    expect(n.progress.get("form-abc")?.gameId).toBe("game-1");
    expect(await submitGame(live, n.deps)).toEqual({ status: "logged", gameId: "game-1" });
    expect(n.games[0]).not.toHaveProperty("matchId");
    expect(n.games[0].date).toBe("2026-11-18");
  });
});
