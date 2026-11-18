import { describe, expect, it } from "vitest";
import fixture from "../../test/fixtures/convoke/two-match-session.json";
import {
  type ConvokeMatchResponse,
  isVoteForMatch,
  summariseEndedMatch,
  suggestWinner,
  toLocalDate,
} from "./suggestions";

// Fixture players (anonymised): 9001 = Player 1, 9002 = Player 2, 9003 = Player 3, 9004 = Player 4
const P1 = 9001;
const P2 = 9002;
const P3 = 9003;
const P4 = 9004;

const ends = fixture.milestones
  .filter((m) => m.path.endsWith("/end"))
  .map((m) => m.responseBody as unknown as ConvokeMatchResponse);
const [match1, match2] = ends;

describe("summariseEndedMatch", () => {
  describe("match 1: two players knocked out at different times", () => {
    const summary = summariseEndedMatch(match1);

    it("links to the next match Convoke opened", () => {
      expect(summary.matchId).toBe(match1.match.id);
      expect(summary.nextMatchId).toBe(match1.game.currentMatchId);
      expect(summary.nextMatchId).not.toBe(summary.matchId);
    });

    it("reads rounds and the starting player", () => {
      expect(summary.rounds).toBe(7);
      expect(summary.startingPlayerId).toBe(P4);
    });

    it("orders seats by turn order, with commanders and turn time", () => {
      expect(summary.seats.map((s) => s.playerId)).toEqual([P4, P1, P3, P2]);
      expect(summary.seats.map((s) => s.seat)).toEqual([1, 2, 3, 4]);
      expect(summary.seats[0]).toMatchObject({
        name: "Player 4",
        commanders: ["Zurgo Stormrender"],
        totalTurnTimeSeconds: 664,
      });
    });

    it("suggests the first player whose life hit 0 as first blood victim", () => {
      expect(summary.firstBlood).toMatchObject({ victimId: P1 });
    });

    it("hints the last player who dealt commander damage to the victim", () => {
      expect(summary.firstBlood?.killerHintId).toBe(P4);
    });

    it("suggests a staggered KO", () => {
      expect(summary.koType).toBe("Staggered");
    });
  });

  describe("match 2: game ended with everyone still alive", () => {
    const summary = summariseEndedMatch(match2);

    it("reads rounds and the starting player", () => {
      expect(summary.rounds).toBe(7);
      expect(summary.startingPlayerId).toBe(P2);
    });

    it("picks up commanders that changed since match 1", () => {
      const p1 = summary.seats.find((s) => s.playerId === P1);
      expect(p1?.commanders).toEqual(["Imotekh the Stormlord"]);
    });

    it("has no first blood suggestion", () => {
      expect(summary.firstBlood).toBeNull();
    });

    it("suggests a simultaneous KO", () => {
      expect(summary.koType).toBe("Simultaneous");
    });
  });
});

describe("suggestWinner", () => {
  it("returns the candidate with the most votes", () => {
    expect(suggestWinner({ [P1]: [P1, P4], [P2]: [P3] })).toEqual({ playerId: P1, votes: 2 });
  });

  it("returns null with no votes", () => {
    expect(suggestWinner({})).toBeNull();
    expect(suggestWinner(undefined)).toBeNull();
  });

  it("returns null on a tie", () => {
    expect(suggestWinner({ [P1]: [P1], [P2]: [P2] })).toBeNull();
  });

  it("uses the votes saved in the next match for match 2", () => {
    const patch = fixture.winnerPatches
      .map((p) => p.requestBody as { winnerVotes?: Record<string, number[]>; endedAt?: string })
      .filter((b) => b.winnerVotes && isVoteForMatch(b, match2))
      .at(-1);
    expect(suggestWinner(patch?.winnerVotes)).toEqual({ playerId: P1, votes: 2 });
  });
});

describe("isVoteForMatch", () => {
  it("matches vote patches to the match whose end time they carry", () => {
    const patches = fixture.winnerPatches.map((p) => p.requestBody as { endedAt?: string });
    const forMatch1 = patches.filter((b) => isVoteForMatch(b, match1));
    const forMatch2 = patches.filter((b) => isVoteForMatch(b, match2));
    expect(forMatch1.length).toBeGreaterThan(0);
    expect(forMatch2.length).toBeGreaterThan(0);
    expect(forMatch1.some((b) => forMatch2.includes(b))).toBe(false);
  });
});

describe("toLocalDate", () => {
  it("keeps an evening game on the local day it was played", () => {
    expect(toLocalDate("2026-11-18T02:44:53.812Z", "America/New_York")).toBe("2026-11-17");
  });

  it("uses the same day when UTC and local agree", () => {
    expect(toLocalDate("2026-11-18T15:00:00.000Z", "America/New_York")).toBe("2026-11-18");
  });
});
