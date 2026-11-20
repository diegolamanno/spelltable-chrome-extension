import { gameKeyFromUrl } from "./live-games";

/** Built scraper files (WXT names them after the entrypoints). */
const SCRAPERS: Record<string, string> = {
  "spelltable.wizards.com": "content-scripts/content.js",
  "convoke.games": "content-scripts/convoke.js",
};

/**
 * Asks the tab's scraper to scrape now. When no scraper answers (the game was opened from the
 * lobby before #35, or the extension was reloaded since the page loaded), injects one: it
 * scrapes as soon as it starts. Does nothing off a game page.
 */
export async function requestScrape(tab: chrome.tabs.Tab | null | undefined): Promise<void> {
  const tabId = tab?.id;
  const gameKey = gameKeyFromUrl(tab?.url);
  if (tabId === undefined || !gameKey) return;
  try {
    await chrome.tabs.sendMessage(tabId, { action: "SCRAPE_NOW" });
    return;
  } catch {
    // No scraper listening in this tab.
  }
  const file = SCRAPERS[gameKey.slice(0, gameKey.indexOf("/"))];
  if (file) await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
}
