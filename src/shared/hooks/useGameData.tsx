import { useEffect, useState } from "react";
import { gameKeyFromUrl, type LiveGames, liveGameForTab } from "../live-games";
import { requestScrape } from "../request-scrape";
import type { PlayerData } from "../storage";
import { liveGamesStorage } from "../storage";

/**
 * The players of the game in the active tab. Empty when that tab has no game, so the popup
 * never shows another tab's game or one the tab has left.
 */
export function useGameData() {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [games, setGames] = useState<LiveGames>({});

  useEffect(() => {
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([active]) => setTab(active ?? null))
      .catch(() => setTab(null));

    liveGamesStorage.getValue().then(setGames);
    const unwatch = liveGamesStorage.watch((value) => setGames(value ?? {}));
    return () => unwatch();
  }, []);

  const onGamePage = gameKeyFromUrl(tab?.url) !== null;
  const game = liveGameForTab(games, tab?.id, tab?.url);

  // A game page without a stored game (scraped before a navigation, or not yet): ask once.
  const needsScrape = onGamePage && !game;
  useEffect(() => {
    if (needsScrape) requestScrape(tab).catch(() => {});
  }, [needsScrape, tab]);

  const players: PlayerData[] = game?.players ?? EMPTY;
  return { players, onGamePage, tab };
}

const EMPTY: PlayerData[] = [];
