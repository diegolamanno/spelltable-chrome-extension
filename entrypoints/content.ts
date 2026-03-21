export default defineContentScript({
  matches: ["https://spelltable.wizards.com/game/*"],

  main() {
    let lastPlayers: string[] = [];
    let lastCommanders: string[] = [];

    function scrape() {
      const nameEls = Array.from(
        document.querySelectorAll<HTMLElement>(".font-bold.truncate.leading-snug.text-sm")
      );

      if (nameEls.length === 0) return;

      // Walk up from a player name element to find its seat container —
      // the nearest ancestor that also owns the commander card element(s).
      function findSeat(nameEl: HTMLElement): HTMLElement {
        let cur: HTMLElement | null = nameEl.parentElement;
        for (let depth = 0; depth < 8; depth++) {
          if (!cur) break;
          if (cur.querySelector(".text-xs.italic.text-gray-400.truncate.leading-snug.flex")) {
            return cur;
          }
          cur = cur.parentElement;
        }
        return nameEl;
      }

      // Build one object per player seat, collecting all commanders within it
      // (handles partner commanders — two commander elements per seat).
      const rawSeats = nameEls
        .map((nameEl) => {
          const seat = findSeat(nameEl);
          const name = nameEl.textContent?.trim().toLowerCase() ?? "";
          const commanderNames = Array.from(
            seat.querySelectorAll(
              ".text-xs.italic.text-gray-400.truncate.leading-snug.flex > div"
            )
          )
            .map((el) => el.textContent?.trim() ?? "")
            .filter(Boolean);
          return { name, commanders: commanderNames, rect: seat.getBoundingClientRect() };
        })
        .filter((s) => s.name);

      // Sort clockwise from top-left: top row left→right, bottom row right→left.
      const avgY = rawSeats.reduce((sum, s) => sum + s.rect.top + s.rect.height / 2, 0) / rawSeats.length;
      const topRow = rawSeats
        .filter((s) => s.rect.top + s.rect.height / 2 <= avgY)
        .sort((a, b) => a.rect.left - b.rect.left);
      const bottomRow = rawSeats
        .filter((s) => s.rect.top + s.rect.height / 2 > avgY)
        .sort((a, b) => b.rect.left - a.rect.left);
      const sorted = [...topRow, ...bottomRow];

      const players = sorted.map((s) => s.name);
      const commanders = sorted.map((s) => s.commanders.join(" / "));

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
