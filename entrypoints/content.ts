export default defineContentScript({
  matches: ["https://spelltable.wizards.com/game/*"],

  main() {
    let lastSerialized = "";

    function findCommonAncestor(els: Element[]): Element | null {
      let ancestor = els[0].parentElement;
      while (ancestor) {
        if (els.every((el) => ancestor!.contains(el))) return ancestor;
        ancestor = ancestor.parentElement;
      }
      return null;
    }

    function clockwisePos(el: Element, midX: number, midY: number): number {
      const rect = el.getBoundingClientRect();
      const isTop = rect.top + rect.height / 2 < midY;
      const isLeft = rect.left + rect.width / 2 < midX;
      if (isTop && isLeft) return 0; // top-left
      if (isTop && !isLeft) return 1; // top-right
      if (!isTop && !isLeft) return 2; // bottom-right
      return 3; // bottom-left
    }

    function scrape() {
      console.log("[SpellTable] Scrape triggered");
      const nameEls = Array.from(
        document.querySelectorAll(".font-bold.truncate.leading-snug.text-sm")
      );

      console.log("[SpellTable] Found name elements:", nameEls.length);
      if (nameEls.length === 0) return;

      // Find the seat container for each player (go up several levels to find the container)
      const seats = nameEls.map((nameEl) => {
        // Go up the DOM tree to find a container that likely holds both name and commanders
        // Typically this is 3-5 levels up from the name element
        let container: Element = nameEl;
        for (let i = 0; i < 6; i++) {
          if (!container.parentElement) break;
          container = container.parentElement;
          // Check if this container has commander elements
          const hasCommanders = container.querySelector(
            ".text-xs.italic.text-gray-400.truncate.leading-snug.flex > div"
          );
          if (hasCommanders) {
            return container;
          }
        }
        // If we didn't find commanders, just use a reasonable parent level
        return nameEl.parentElement?.parentElement?.parentElement ?? nameEl;
      });
      console.log("[SpellTable] Seats found:", seats.length, seats);

      const midX = window.innerWidth / 2;
      const midY = window.innerHeight / 2;

      const sorted = [...seats].sort(
        (a, b) => clockwisePos(a, midX, midY) - clockwisePos(b, midX, midY)
      );
      console.log("[SpellTable] Sorted seats:", sorted);

      const playerData = sorted
        .map((seat, index) => {
          const nameEl = seat.querySelector(".font-bold.truncate.leading-snug.text-sm");
          const name = nameEl?.textContent?.trim().toLowerCase() ?? "";

          const commanderEls = Array.from(
            seat.querySelectorAll(
              ".text-xs.italic.text-gray-400.truncate.leading-snug.flex > div"
            )
          );
          const commanders = commanderEls
            .map((el) => el.textContent?.trim() ?? "")
            .filter(Boolean);

          console.log(`[SpellTable] Seat ${index}:`, {
            seat,
            nameEl,
            name,
            commanderEls,
            commanders
          });

          return { name, commanders };
        })
        .filter((p) => p.name);
      console.log("[SpellTable] Filtered player data:", playerData);

      const serialized = JSON.stringify(playerData);
      console.log("[SpellTable] Player data:", playerData);
      if (serialized === lastSerialized) {
        console.log("[SpellTable] Data unchanged, skipping update");
        return;
      }
      lastSerialized = serialized;

      console.log("[SpellTable] Sending update to background");
      chrome.runtime.sendMessage({
        action: "UPDATE_STORAGE",
        data: { playersOnPage: playerData },
      });
    }

    scrape();

    const observer = new MutationObserver(scrape);
    observer.observe(document.body, { childList: true, subtree: true });

    // Listen for manual refresh requests from popup
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      console.log("[SpellTable] Content script received message:", message);
      if (message.action === "SCRAPE_NOW") {
        console.log("[SpellTable] Triggering manual scrape");
        scrape();
        sendResponse({ success: true });
      }
      return false;
    });
  },
});
