import { describe, expect, it } from "vitest";
import { applyMatchEvent, type MatchRecords, markSubmitted, pendingMatches } from "./match-records";
import { buildScenario, type ScenarioName } from "./mock-scenarios";
import { describeMatch, reviewDefaults } from "./review";

const TZ = "America/New_York";
// The real session's last event, so scenario times aren't shifted.
// 02:44 UTC on Nov 18 is the evening of Nov 17 in New York.
const NOW = new Date("2026-11-18T03:41:37Z");

const pendingOf = (name: ScenarioName) =>
  pendingMatches(buildScenario(name, NOW).reduce<MatchRecords>(applyMatchEvent, {}));

describe("reviewDefaults", () => {
  const [match1, match2] = pendingOf("full-session");

  it("fills data fields from match 1", () => {
    const r = reviewDefaults(match1, TZ);
    expect(r).toMatchObject({
      matchId: match1.matchId,
      date: "2026-11-17",
      firstPlayer: "player 4",
      rounds: 7,
    });
    expect(r?.players.map((p) => p.name)).toEqual(["player 4", "player 1", "player 3", "player 2"]);
    expect(r?.players[0].commanders).toEqual(["Zurgo Stormrender"]);
    expect(r?.playerTimes["player 4"]).toBe(664);
  });

  it("marks winner, first victim and KO type in match 1 as suggestions", () => {
    const r = reviewDefaults(match1, TZ);
    expect(r).toMatchObject({ winner: "player 4", firstVictim: "player 1", koType: "Staggered", winnerVotes: 1 });
    expect(r?.suggested.sort()).toEqual(["firstVictim", "koType", "winner"]);
    expect(r?.killerHint).toBe("player 4");
  });

  it("suggests a simultaneous KO and no first victim for match 2", () => {
    const r = reviewDefaults(match2, TZ);
    expect(r).toMatchObject({ winner: "player 1", firstVictim: null, koType: "Simultaneous", killerHint: null });
    expect(r?.suggested.sort()).toEqual(["koType", "winner"]);
  });

  it("leaves the winner empty when nobody voted", () => {
    const [r] = pendingOf("no-votes").map((m) => reviewDefaults(m, TZ));
    expect(r?.winner).toBeNull();
    expect(r?.suggested).not.toContain("winner");
  });

  it("keeps a player who left before the end, without a turn time", () => {
    const [r] = pendingOf("player-left").map((m) => reviewDefaults(m, TZ));
    expect(r?.players.map((p) => p.name)).toContain("player 2");
    expect(r?.playerTimes).not.toHaveProperty("player 2");
  });

  it("returns null for a match that hasn't ended", () => {
    expect(reviewDefaults({ ...match1, summary: null }, TZ)).toBeNull();
  });
});

describe("describeMatch", () => {
  it("shows the local end time and the first commanders", () => {
    const [match1] = pendingOf("full-session");
    expect(describeMatch(match1, TZ)).toBe("9:44 PM · Zurgo Stormrender, Felothar the Steadfast +2");
  });
});

describe("markSubmitted", () => {
  it("removes the match from pending", () => {
    const records = buildScenario("full-session", NOW).reduce<MatchRecords>(applyMatchEvent, {});
    const [first] = pendingMatches(records);
    const after = markSubmitted(records, first.matchId, "2026-11-18T04:00:00Z");
    expect(pendingMatches(after).map((r) => r.matchId)).not.toContain(first.matchId);
    expect(pendingMatches(after)).toHaveLength(1);
  });

  it("ignores unknown ids", () => {
    const records = {};
    expect(markSubmitted(records, "nope", "2026-11-18T04:00:00Z")).toBe(records);
  });
});
