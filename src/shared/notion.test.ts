import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commanderTextMatches,
  deckFilter,
  findDeckByPlayerAndCommander,
  PARTNER_PROPERTY,
} from "./notion";

// Each test picks a Decks database id, so the cached "has a Partner / Background field" check never leaks.
let decksDbId = "decks-db";

vi.mock("./storage", () => ({
  notionConfigStorage: {
    getValue: async () => ({
      apiKey: "test-key",
      playersDbId: "players-db",
      decksDbId,
      gamesDbId: "games-db",
      gameSeatsDbId: "seats-db",
    }),
  },
}));

const text = (s: string) => [{ plain_text: s }];
const deck = (id: string, name: string, commander: string, partner = "") => ({
  id,
  properties: {
    Name: { type: "title", title: text(name) },
    Commander: { type: "rich_text", rich_text: text(commander) },
    [PARTNER_PROPERTY]: { type: "rich_text", rich_text: partner ? text(partner) : [] },
  },
});

/**
 * Fake Notion: the schema request reports whether Decks has a Partner / Background field, and every Decks
 * query returns these pages. Returns the query filters sent.
 */
function mockDecks(results: ReturnType<typeof deck>[], { partnerField = true } = {}) {
  decksDbId = `decks-${Math.random()}`;
  const filters: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === "GET") {
        const properties = partnerField ? { [PARTNER_PROPERTY]: { type: "rich_text" } } : {};
        return new Response(JSON.stringify({ properties }), { status: 200 });
      }
      expect(url).toContain(`/databases/${decksDbId}/query`);
      filters.push(JSON.parse(String(init.body)).filter);
      return new Response(JSON.stringify({ results }), { status: 200 });
    })
  );
  return filters;
}

const queries = () =>
  vi.mocked(fetch).mock.calls.filter(([, init]) => (init as RequestInit).method === "POST");

afterEach(() => vi.unstubAllGlobals());

const owner = { property: "Owner", relation: { contains: "p1" } };
const contains = (property: string, value: string) => ({
  property,
  rich_text: { contains: value },
});

describe("deckFilter", () => {
  it("single commander: Partner / Background must be empty", () => {
    expect(deckFilter(["Krenko, Mob Boss"], "p1", true)).toEqual({
      and: [
        owner,
        contains("Commander", "Krenko, Mob Boss"),
        { property: PARTNER_PROPERTY, rich_text: { is_empty: true } },
      ],
    });
  });

  it("partners: either order across Commander and Partner / Background, or both in Commander", () => {
    expect(deckFilter(["Tymna the Weaver", "Thrasios, Triton Hero"], "p1", true)).toEqual({
      or: [
        {
          and: [
            owner,
            contains("Commander", "Tymna the Weaver"),
            contains(PARTNER_PROPERTY, "Thrasios, Triton Hero"),
          ],
        },
        {
          and: [
            owner,
            contains("Commander", "Thrasios, Triton Hero"),
            contains(PARTNER_PROPERTY, "Tymna the Weaver"),
          ],
        },
        {
          and: [
            owner,
            contains("Commander", "Tymna the Weaver"),
            contains("Commander", "Thrasios, Triton Hero"),
          ],
        },
      ],
    });
  });

  it("without a Partner / Background field: every commander in the Commander text", () => {
    expect(deckFilter(["Tymna the Weaver", "Thrasios, Triton Hero"], "p1", false)).toEqual({
      and: [
        owner,
        contains("Commander", "Tymna the Weaver"),
        contains("Commander", "Thrasios, Triton Hero"),
      ],
    });
    expect(deckFilter(["Krenko, Mob Boss"], "p1", false)).toEqual({
      and: [owner, contains("Commander", "Krenko, Mob Boss")],
    });
  });
});

describe("findDeckByPlayerAndCommander", () => {
  it("returns the only deck the player owns with that commander", async () => {
    const filters = mockDecks([deck("d1", "Krenko Goblins", "Krenko, Mob Boss")]);

    await expect(findDeckByPlayerAndCommander(["Krenko, Mob Boss"], "p1", "Ana")).resolves.toBe(
      "d1"
    );
    expect(filters).toEqual([deckFilter(["Krenko, Mob Boss"], "p1", true)]);
  });

  it("uses the Commander-only filter when Decks has no Partner / Background field", async () => {
    const filters = mockDecks([deck("d1", "Krenko Goblins", "Krenko, Mob Boss")], {
      partnerField: false,
    });

    await expect(findDeckByPlayerAndCommander(["Krenko, Mob Boss"], "p1", "Ana")).resolves.toBe(
      "d1"
    );
    expect(filters).toEqual([deckFilter(["Krenko, Mob Boss"], "p1", false)]);
  });

  it("fails when the player owns no matching deck, with no fallback to other owners", async () => {
    mockDecks([]);

    await expect(findDeckByPlayerAndCommander(["Krenko, Mob Boss"], "p1", "Ana")).rejects.toThrow(
      'No deck found for Ana with commander "Krenko, Mob Boss"'
    );
    expect(queries()).toHaveLength(1);
  });

  it("fails and names the candidates when several decks match", async () => {
    mockDecks([
      deck("d1", "Atraxa Superfriends", "Atraxa, Praetors' Voice"),
      deck("d2", "Atraxa Counters", "Atraxa, Praetors' Voice"),
    ]);

    await expect(
      findDeckByPlayerAndCommander(["Atraxa, Praetors' Voice"], "p1", "Ana")
    ).rejects.toThrow(
      `Ana has 2 decks matching "Atraxa, Praetors' Voice": "Atraxa Superfriends", "Atraxa Counters"`
    );
  });

  it("picks the deck whose commanders are exactly these when another only contains them", async () => {
    // An unsplit partner deck still matches a solo search; the exact one wins.
    mockDecks([
      deck("d1", "Tymna Partners", "Tymna the Weaver / Thrasios, Triton Hero"),
      deck("d2", "Tymna Solo", "Tymna the Weaver"),
    ]);

    await expect(findDeckByPlayerAndCommander(["Tymna the Weaver"], "p1", "Ana")).resolves.toBe(
      "d2"
    );
  });

  it("finds a split partner deck whichever order Convoke sends the commanders", async () => {
    mockDecks([deck("d1", "Tymna Partners", "Thrasios, Triton Hero", "Tymna the Weaver")]);

    await expect(
      findDeckByPlayerAndCommander(["Tymna the Weaver", "Thrasios, Triton Hero"], "p1", "Ana")
    ).resolves.toBe("d1");
  });

  it("prefers the exact partner pair over a deck with a third name in Commander", async () => {
    mockDecks([
      deck("d1", "Split", "Thrasios, Triton Hero", "Tymna the Weaver"),
      deck("d2", "Odd", "Tymna the Weaver / Thrasios, Triton Hero / Kraum, Ludevic's Opus"),
    ]);

    await expect(
      findDeckByPlayerAndCommander(["Tymna the Weaver", "Thrasios, Triton Hero"], "p1", "Ana")
    ).resolves.toBe("d1");
  });

  it("fails without querying when the player has no commander", async () => {
    mockDecks([]);

    await expect(findDeckByPlayerAndCommander([" "], "p1", "Ana")).rejects.toThrow(
      "Ana has no commander"
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("commanderTextMatches", () => {
  it.each([
    ["Krenko, Mob Boss", ["Krenko, Mob Boss"], true],
    ["krenko, mob boss ", ["Krenko, Mob Boss"], true],
    ["Krenko, Mob Boss / ", ["Krenko, Mob Boss"], true],
    [
      "Tymna the Weaver / Thrasios, Triton Hero",
      ["Thrasios, Triton Hero", "Tymna the Weaver"],
      true,
    ],
    [
      "Thrasios, Triton Hero // Tymna the Weaver",
      ["Tymna the Weaver", "Thrasios, Triton Hero"],
      true,
    ],
    ["Tymna the Weaver / Thrasios, Triton Hero", ["Tymna the Weaver"], false],
    ["Atraxa, Grand Unifier", ["Atraxa"], false],
  ])("%j with %j → %s", (text, commanders, expected) => {
    expect(commanderTextMatches(text, commanders)).toBe(expected);
  });
});
