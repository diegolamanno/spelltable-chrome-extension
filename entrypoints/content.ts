export default defineContentScript({
  matches: ["https://spelltable.wizards.com/game/*"],

  main() {
    let lastPlayers: string[] = [];
    let lastCommanders: string[] = [];

    function scrape() {
      const players = Array.from(
        document.querySelectorAll(".font-bold.truncate.leading-snug.text-sm")
      )
        .map((el) => el.textContent?.trim().toLowerCase() ?? "")
        .filter(Boolean);

      const commanders = Array.from(
        document.querySelectorAll(
          ".text-xs.italic.text-gray-400.truncate.leading-snug.flex > div"
        )
      )
        .map((el) => el.textContent?.trim() ?? "")
        .filter(Boolean);

      if (players.length === 0) return;

      const playersChanged = players.join(",") !== lastPlayers.join(",");
      const commandersChanged = commanders.join(",") !== lastCommanders.join(",");

      if (playersChanged || commandersChanged) {
        lastPlayers = players;
        lastCommanders = commanders;
        chrome.runtime.sendMessage({
          action: "UPDATE_STORAGE",
          data: { namesOnPage: players, commandersOnPage: commanders },
        });
      }
    }

    scrape();

    const observer = new MutationObserver(scrape);
    observer.observe(document.body, { childList: true, subtree: true });
  },
});
