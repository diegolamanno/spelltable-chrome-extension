import { describe, expect, it } from "vitest";
import { applyMatchEvent, type MatchRecords, pendingMatches } from "./match-records";
import { buildScenario, SCENARIOS, type ScenarioName } from "./mock-scenarios";
import { suggestWinner } from "./suggestions";

const replay = (
  name: ScenarioName,
  records: MatchRecords = {},
  now = new Date("2026-12-01T20:00:00Z")
) => buildScenario(name, now).reduce<MatchRecords>(applyMatchEvent, records);

describe("buildScenario", () => {
  it.each(
    Object.keys(SCENARIOS) as ScenarioName[]
  )("%s produces at least one pending game", (name) => {
    expect(pendingMatches(replay(name)).length).toBeGreaterThan(0);
  });

  it("can be replayed again and again, adding new pending games each time", () => {
    const once = replay("full-session");
    const twice = replay("full-session", once, new Date("2026-12-01T21:00:00Z"));
    expect(pendingMatches(twice)).toHaveLength(4);
  });

  it("keeps votes attached to the right match after replaying", () => {
    const twice = replay("full-session", replay("full-session"), new Date("2026-12-01T21:00:00Z"));
    const winners = pendingMatches(twice).map((r) => suggestWinner(r.voteCounts)?.playerId);
    expect(winners).toEqual([9004, 9001, 9004, 9001]);
  });

  it("shifts times so the scenario ends now", () => {
    const now = new Date("2026-12-01T20:00:00Z");
    const ats = buildScenario("single-game", now).map((e) => e.at);
    expect(ats.at(-1)).toBe(now.toISOString());
  });

  it("covers the edge cases it names", () => {
    expect(pendingMatches(replay("no-votes"))[0].voteCounts).toEqual({});
    expect(pendingMatches(replay("simultaneous-ko"))[0].summary?.koType).toBe("Simultaneous");
    const seats = pendingMatches(replay("player-left"))[0].summary?.seats ?? [];
    expect(seats.map((s) => s.playerId)).toContain(9002);
  });

  it.each([
    ["partners", ["Frodo, Adventurous Hobbit", "Sam, Loyal Attendant"]],
    ["partners-swapped", ["Sam, Loyal Attendant", "Frodo, Adventurous Hobbit"]],
  ] as const)("%s gives Player 3 both commanders, in that order", (name, commanders) => {
    const record = pendingMatches(replay(name))[0];
    const seat = record.summary?.seats.find((s) => s.playerId === 9003);
    expect(seat?.commanders).toEqual(commanders);
    expect(record.players.find((p) => p.id === 9003)?.commanders).toEqual(commanders);
  });
});
