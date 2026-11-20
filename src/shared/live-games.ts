/**
 * Live games: the players scraped from each open game tab.
 *
 * Every tab with a SpellTable or Convoke game keeps its own entry, tagged with the game page
 * it came from. The popup shows only the entry for the active tab, and only while that tab is
 * still on the same game, so it never shows another tab's game or one that has ended.
 */
import type { PlayerData } from "./storage";

export interface LiveGame {
  /** Identifies the game page, see gameKeyFromUrl. */
  gameKey: string;
  url: string;
  players: PlayerData[];
  scrapedAt: string;
}

/** Keyed by tab id. */
export type LiveGames = Record<string, LiveGame>;

const GAME_PAGES = [
  { host: "spelltable.wizards.com", path: /^\/game\/[^/]+/ },
  { host: "convoke.games", path: /^\/[a-z]{2}\/play\/[^/]+/ },
];

/**
 * "host/path-to-the-game" for a SpellTable or Convoke game page, or null for any other page.
 * Query strings and fragments are ignored, so they don't count as a different game.
 */
export function gameKeyFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  for (const page of GAME_PAGES) {
    if (parsed.hostname !== page.host) continue;
    const match = parsed.pathname.match(page.path);
    if (match) return `${page.host}${match[0]}`;
  }
  return null;
}

/** Stores what a tab scraped. Ignored when the page isn't a game page. */
export function setLiveGame(
  games: LiveGames,
  tabId: number,
  url: string,
  players: PlayerData[],
  now: string
): LiveGames {
  const gameKey = gameKeyFromUrl(url);
  if (!gameKey) return games;
  return { ...games, [tabId]: { gameKey, url, players, scrapedAt: now } };
}

export function removeTab(games: LiveGames, tabId: number): LiveGames {
  if (!(tabId in games)) return games;
  const { [tabId]: _removed, ...rest } = games;
  return rest;
}

/** Drops the tab's entry when the tab is no longer on that game (another game or another site). */
export function tabNavigated(games: LiveGames, tabId: number, url: string | undefined): LiveGames {
  const game = games[tabId];
  if (!game || gameKeyFromUrl(url) === game.gameKey) return games;
  return removeTab(games, tabId);
}

/** Keeps only the entries whose tab is still open. */
export function keepOpenTabs(games: LiveGames, openTabIds: number[]): LiveGames {
  const open = new Set(openTabIds.map(String));
  const kept = Object.fromEntries(Object.entries(games).filter(([id]) => open.has(id)));
  return Object.keys(kept).length === Object.keys(games).length ? games : kept;
}

/** The game for this tab, or null when the tab has none or has moved to another page. */
export function liveGameForTab(
  games: LiveGames,
  tabId: number | undefined,
  url: string | undefined
): LiveGame | null {
  if (tabId === undefined) return null;
  const game = games[tabId];
  if (!game || gameKeyFromUrl(url) !== game.gameKey) return null;
  return game;
}
