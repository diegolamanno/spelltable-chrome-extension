import { describe, expect, it } from "vitest";
import {
  gameKeyFromUrl,
  keepOpenTabs,
  type LiveGames,
  liveGameForTab,
  removeTab,
  setLiveGame,
  tabNavigated,
} from "./live-games";

const NOW = "2026-11-20T20:00:00.000Z";
const ST_A = "https://spelltable.wizards.com/game/abc123";
const ST_B = "https://spelltable.wizards.com/game/def456";
const CONVOKE = "https://convoke.games/en/play/xyz789";
const alice = [{ name: "Alice", commanders: ["Atraxa, Praetors' Voice"] }];
const bob = [{ name: "Bob", commanders: ["Kenrith, the Returned King"] }];

describe("gameKeyFromUrl", () => {
  it("identifies SpellTable and Convoke game pages", () => {
    expect(gameKeyFromUrl(ST_A)).toBe("spelltable.wizards.com/game/abc123");
    expect(gameKeyFromUrl(CONVOKE)).toBe("convoke.games/en/play/xyz789");
  });

  it("ignores query strings, fragments and trailing path", () => {
    expect(gameKeyFromUrl(`${ST_A}?spectate=1#chat`)).toBe(gameKeyFromUrl(ST_A));
    expect(gameKeyFromUrl(`${CONVOKE}/`)).toBe(gameKeyFromUrl(CONVOKE));
  });

  it("returns null for other pages and bad input", () => {
    expect(gameKeyFromUrl("https://spelltable.wizards.com/lobby")).toBeNull();
    expect(gameKeyFromUrl("https://convoke.games/en/")).toBeNull();
    expect(gameKeyFromUrl("https://example.com/game/abc123")).toBeNull();
    expect(gameKeyFromUrl("not a url")).toBeNull();
    expect(gameKeyFromUrl(undefined)).toBeNull();
  });
});

describe("live games per tab", () => {
  it("keeps each tab's game separately", () => {
    let games: LiveGames = {};
    games = setLiveGame(games, 1, ST_A, alice, NOW);
    games = setLiveGame(games, 2, CONVOKE, bob, NOW);

    expect(liveGameForTab(games, 1, ST_A)?.players).toEqual(alice);
    expect(liveGameForTab(games, 2, CONVOKE)?.players).toEqual(bob);
  });

  it("ignores scrapes from pages that aren't games", () => {
    const games = setLiveGame({}, 1, "https://spelltable.wizards.com/lobby", alice, NOW);
    expect(games).toEqual({});
  });

  it("shows nothing for a tab without a game", () => {
    const games = setLiveGame({}, 1, ST_A, alice, NOW);
    expect(liveGameForTab(games, 2, "https://example.com")).toBeNull();
    expect(liveGameForTab(games, undefined, ST_A)).toBeNull();
  });

  it("shows nothing once the tab is on another page, even before the background cleans up", () => {
    const games = setLiveGame({}, 1, ST_A, alice, NOW);
    expect(liveGameForTab(games, 1, ST_B)).toBeNull();
    expect(liveGameForTab(games, 1, "https://example.com")).toBeNull();
    expect(liveGameForTab(games, 1, undefined)).toBeNull();
  });

  it("removes a closed tab", () => {
    const games = setLiveGame(setLiveGame({}, 1, ST_A, alice, NOW), 2, CONVOKE, bob, NOW);
    expect(Object.keys(removeTab(games, 1))).toEqual(["2"]);
    expect(removeTab(games, 3)).toBe(games);
  });

  it("removes a tab that navigates to another game or site, and keeps it on reload", () => {
    const games = setLiveGame({}, 1, ST_A, alice, NOW);
    expect(tabNavigated(games, 1, `${ST_A}?reload=1`)).toBe(games);
    expect(tabNavigated(games, 1, ST_B)).toEqual({});
    expect(tabNavigated(games, 1, "https://example.com")).toEqual({});
    // No URL means the extension can't see the page, so it isn't a game page.
    expect(tabNavigated(games, 1, undefined)).toEqual({});
  });

  it("drops entries for tabs that are no longer open", () => {
    const games = setLiveGame(setLiveGame({}, 1, ST_A, alice, NOW), 2, CONVOKE, bob, NOW);
    expect(Object.keys(keepOpenTabs(games, [2, 5]))).toEqual(["2"]);
    expect(keepOpenTabs(games, [1, 2])).toBe(games);
  });
});
