import { describe, expect, it } from "vitest";
import fixture from "../../test/fixtures/convoke/two-match-session.json";
import { type ConvokeMatchEvent, classifyRequest, isConvokeMatchEvent, toCounts } from "./events";
import { applyMatchEvent, type MatchRecords, pendingMatches } from "./match-records";
import { suggestWinner } from "./suggestions";

const P1 = 9001;
const P2 = 9002;
const P4 = 9004;

// Replay the captured session in time order, the way the in-page script would see it.
const requests = [
  ...fixture.milestones.map((m) => ({ ...m, requestBody: m.requestBody as unknown })),
  ...fixture.winnerPatches.map((p) => ({ ...p, responseBody: null as unknown })),
].sort((a, b) => a.at.localeCompare(b.at));

const events = requests
  .map((r) => classifyRequest({ ...r, status: r.status ?? 200 }))
  .filter((e): e is ConvokeMatchEvent => e !== null);

const replay = (evts: ConvokeMatchEvent[]) => evts.reduce<MatchRecords>(applyMatchEvent, {});

function findEvent<T extends ConvokeMatchEvent["type"]>(type: T, matchId?: string) {
  const e = events.find(
    (x) => x.type === type && (!matchId || (x.type !== "votes" && x.response.match.id === matchId))
  );
  if (!e) throw new Error(`no ${type} event in fixture`);
  return e as Extract<ConvokeMatchEvent, { type: T }>;
}
const [match1Id, match2Id] = fixture.milestones
  .filter((m) => m.path.endsWith("/start"))
  .map((m) => m.path.split("/")[3]);

describe("classifyRequest", () => {
  it("turns the session into start, end and vote events", () => {
    expect(events.map((e) => e.type)).toEqual([
      "start",
      "end",
      "votes", // vote-winner reply, match 1
      "votes", // next-match state patches carrying match 1's votes
      "votes",
      "votes",
      "votes",
      "votes",
      "start",
      "end",
      "votes", // vote-winner reply, match 2
      "votes", // next-match state patch carrying match 2's votes
    ]);
  });

  it("ignores state patches without votes and failed requests", () => {
    const base = { at: "2026-01-01T00:00:00Z", responseBody: null };
    const path = `/api/match/${match1Id}/state`;
    expect(
      classifyRequest({
        ...base,
        method: "PATCH",
        path,
        status: 200,
        requestBody: { turnRound: 3 },
      })
    ).toBeNull();
    expect(
      classifyRequest({
        ...base,
        method: "POST",
        path: `/api/match/${match1Id}/end`,
        status: 500,
        requestBody: {},
      })
    ).toBeNull();
    expect(
      classifyRequest({
        ...base,
        method: "GET",
        path: "/api/game/x",
        status: 200,
        requestBody: null,
      })
    ).toBeNull();
  });

  it("produces events small enough to relay", () => {
    const end = events.find((e) => e.type === "end");
    expect(JSON.stringify(end).length).toBeLessThan(25_000);
    expect(events.every(isConvokeMatchEvent)).toBe(true);
  });
});

describe("applyMatchEvent", () => {
  const records = replay(events);

  it("keeps one ended record per match, both pending", () => {
    expect(Object.keys(records).sort()).toEqual([match1Id, match2Id].sort());
    expect(pendingMatches(records).map((r) => r.matchId)).toEqual([match1Id, match2Id]);
  });

  it("keeps each match's own commanders", () => {
    const p1In = (id: string) => records[id].players.find((p) => p.id === P1)?.commanders;
    expect(p1In(match1Id)).toEqual(["Felothar the Steadfast"]);
    expect(p1In(match2Id)).toEqual(["Imotekh the Stormlord"]);
  });

  it("files the next match's vote updates under the match that ended", () => {
    expect(suggestWinner(records[match1Id].voteCounts)).toEqual({ playerId: P4, votes: 1 });
    expect(suggestWinner(records[match2Id].voteCounts)).toEqual({ playerId: P1, votes: 2 });
  });

  it("works for a session with a single game", () => {
    const single = replay(events.filter((e) => e.at < "2026-11-18T02:50:00Z"));
    expect(pendingMatches(single).map((r) => r.matchId)).toEqual([match1Id]);
    expect(suggestWinner(single[match1Id].voteCounts)).toEqual({ playerId: P4, votes: 1 });
  });

  it("creates the record from /end when the extension missed /start", () => {
    const fromEnd = replay(events.filter((e) => e.type !== "start"));
    expect(fromEnd[match1Id].players.map((p) => p.id).sort()).toEqual([P1, P2, 9003, P4]);
    expect(fromEnd[match1Id].summary?.rounds).toBe(7);
  });

  it("keeps a seat for a player who left before the end", () => {
    const start = findEvent("start", match1Id);
    const end = findEvent("end", match1Id);
    const state = end.response.match.state;
    const leftEarly: ConvokeMatchEvent = {
      ...end,
      response: {
        ...end.response,
        match: {
          ...end.response.match,
          state: {
            ...state,
            players: state.players.filter((p) => p.id !== P2),
            playerOrder: state.playerOrder.filter((id) => id !== P2),
          },
        },
      },
    };
    const seats = replay([start, leftEarly])[match1Id].summary?.seats ?? [];
    expect(seats.map((s) => s.playerId)).toContain(P2);
    expect(seats.find((s) => s.playerId === P2)?.commanders).toEqual(["Tidus, Yuna's Guardian"]);
  });

  it("ignores a late /start for a match that already ended", () => {
    const start = findEvent("start", match1Id);
    const after = applyMatchEvent(records, { ...start, at: "2099-01-01T00:00:00Z" });
    expect(after[match1Id].status).toBe("ended");
  });
});

describe("toCounts", () => {
  it("accepts voter lists or counts", () => {
    expect(toCounts({ "1": [1, 2], "2": 3, "3": [] })).toEqual({ "1": 2, "2": 3 });
  });
});
