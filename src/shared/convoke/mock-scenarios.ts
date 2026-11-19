/**
 * Mock Convoke match events for testing without a real game (dev builds only).
 *
 * Scenarios are built from the anonymised fixture by running its captured requests
 * through the same classifyRequest() the real relay uses. Each build gives the matches
 * new ids and shifts every timestamp to "now", so a scenario can be replayed again and
 * again and always creates new pending games.
 */
import fixture from "../../test/fixtures/convoke/two-match-session.json";
import { type ConvokeMatchEvent, classifyRequest } from "./events";

export const SCENARIOS = {
  "full-session": "Two matches in one lobby: staggered KO, then simultaneous KO, with votes",
  "single-game":
    "One match (staggered KO), then everyone leaves. Votes land in the next, unplayed match",
  "simultaneous-ko": "Only match 2: game ended with everyone alive, winner suggestion from 2 votes",
  "no-votes": "Match 1 ends but nobody votes, so there's no winner suggestion",
  "player-left": "Match 1 where one player left before the end; they should keep their seat",
} as const;

export type ScenarioName = keyof typeof SCENARIOS;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const MATCH2_FROM = "2026-11-18T02:50:00Z";

function fixtureEvents(): ConvokeMatchEvent[] {
  return [
    ...fixture.milestones.map((m) => ({ ...m, requestBody: m.requestBody as unknown })),
    ...fixture.winnerPatches.map((p) => ({ ...p, responseBody: null as unknown })),
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((r) => classifyRequest({ ...r, status: r.status ?? 200 }))
    .filter((e): e is ConvokeMatchEvent => e !== null);
}

export function buildScenario(name: ScenarioName, now: Date = new Date()): ConvokeMatchEvent[] {
  const all = fixtureEvents();
  const match1 = all.filter((e) => e.at < MATCH2_FROM);
  const match2 = all.filter((e) => e.at >= MATCH2_FROM);

  let events: ConvokeMatchEvent[];
  switch (name) {
    case "full-session":
      events = all;
      break;
    case "single-game":
      events = match1;
      break;
    case "simultaneous-ko":
      events = match2;
      break;
    case "no-votes":
      events = match1.filter((e) => e.type !== "votes");
      break;
    case "player-left":
      events = match1.map((e) => (e.type === "end" ? withoutPlayer(e, 9002) : e));
      break;
  }
  return freshen(events, now);
}

/** New match ids, and all timestamps moved so the scenario ends "now". */
export function freshen(events: ConvokeMatchEvent[], now: Date): ConvokeMatchEvent[] {
  if (events.length === 0) return events;
  const json = JSON.stringify(events);
  const times = (json.match(ISO) ?? []).map((t) => Date.parse(t));
  const offset = now.getTime() - Math.max(...times);
  const ids = new Map<string, string>();
  return JSON.parse(
    json
      .replace(UUID, (id) => {
        if (!ids.has(id)) ids.set(id, crypto.randomUUID());
        return ids.get(id) as string;
      })
      .replace(ISO, (t) => new Date(Date.parse(t) + offset).toISOString())
  ) as ConvokeMatchEvent[];
}

function withoutPlayer(
  e: Extract<ConvokeMatchEvent, { type: "end" }>,
  playerId: number
): ConvokeMatchEvent {
  const state = e.response.match.state;
  return {
    ...e,
    response: {
      ...e.response,
      match: {
        ...e.response.match,
        state: {
          ...state,
          players: state.players.filter((p) => p.id !== playerId),
          playerOrder: state.playerOrder.filter((id) => id !== playerId),
        },
      },
    },
  };
}
