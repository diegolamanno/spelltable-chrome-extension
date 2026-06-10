export default defineContentScript({
  matches: ["https://convoke.games/en/play/*"],

  main() {
    let lastSerialized = "";

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
      console.log("[Convoke] Scrape triggered");

      const slots = Array.from(document.querySelectorAll<HTMLElement>(".slot[data-player-name]"));
      console.log("[Convoke] Found slots:", slots.length);
      if (slots.length === 0) return;

      const midX = window.innerWidth / 2;
      const midY = window.innerHeight / 2;

      const sorted = [...slots].sort(
        (a, b) => clockwisePos(a, midX, midY) - clockwisePos(b, midX, midY)
      );

      const playerData = sorted
        .map((slot, index) => {
          const name = (slot.dataset.playerName ?? "").trim().toLowerCase();

          const commanderEls = Array.from(slot.querySelectorAll(".commander-name-part"));
          const commanders = commanderEls
            .map((el) => el.textContent?.trim() ?? "")
            .filter(Boolean);

          console.log(`[Convoke] Slot ${index}:`, { name, commanders });

          return { name, commanders };
        })
        .filter((p) => p.name);

      console.log("[Convoke] Player data:", playerData);

      const serialized = JSON.stringify(playerData);
      if (serialized === lastSerialized) {
        console.log("[Convoke] Data unchanged, skipping update");
        return;
      }
      lastSerialized = serialized;

      chrome.runtime.sendMessage({
        action: "UPDATE_STORAGE",
        data: { playersOnPage: playerData },
      });
    }

    scrape();

    const observer = new MutationObserver(scrape);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      console.log("[Convoke] Content script received message:", message);
      if (message.action === "SCRAPE_NOW") {
        console.log("[Convoke] Triggering manual scrape");
        lastSerialized = ""; // force re-send even if data matches last observed state
        scrape();
        sendResponse({ success: true });
      }
      return false;
    });
  },
});
