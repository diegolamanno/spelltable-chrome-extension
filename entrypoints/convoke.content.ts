export default defineContentScript({
  matches: ["https://convoke.games/en/play/*"],

  main() {
    let lastSerialized = "";
    let lastTimesSerialized = "";

    function clockwisePos(el: Element, midX: number, midY: number): number {
      const rect = el.getBoundingClientRect();
      const isTop = rect.top + rect.height / 2 < midY;
      const isLeft = rect.left + rect.width / 2 < midX;
      if (isTop && isLeft) return 0; // top-left
      if (isTop && !isLeft) return 1; // top-right
      if (!isTop && !isLeft) return 2; // bottom-right
      return 3; // bottom-left
    }

    // Parses Convoke time strings like "2m 34s", "1h 2m 3s", "45s" into seconds
    function parseTimeToSeconds(str: string): number {
      const h = str.match(/(\d+)h/);
      const m = str.match(/(\d+)m/);
      const s = str.match(/(\d+)s/);
      return (h ? parseInt(h[1]) * 3600 : 0) + (m ? parseInt(m[1]) * 60 : 0) + (s ? parseInt(s[1]) : 0);
    }

    // Scrapes player turn times from the game-end summary dialog.
    // Convoke renders "N turn(s) · Xs" inside span.tabular-nums next to each player name.
    function scrapeTimes() {
      // Format: "2 turns · 7s" or "1 turn · 8s" etc.
      const turnTimeRe = /^\d+\s+turns?\s+·\s+(.+)$/;
      const times: Record<string, number> = {};

      for (const span of document.querySelectorAll<HTMLElement>("span.tabular-nums")) {
        const text = span.textContent?.trim() ?? "";
        const match = text.match(turnTimeRe);
        if (!match) continue;

        // The player name lives in a sibling .font-medium span inside the same container.
        // The Statistics section uses data-slot="hover-card-trigger"; the Winner vote section
        // uses a plain parent div — two levels up covers both.
        const container =
          span.closest<HTMLElement>("[data-slot='hover-card-trigger']") ??
          span.parentElement?.parentElement ?? null;
        if (!container) continue;

        const nameEl = container.querySelector<HTMLElement>(".font-medium");
        if (!nameEl) continue;

        const name = nameEl.textContent?.trim().toLowerCase();
        if (!name || name in times) continue; // dedup across duplicate dialog sections

        times[name] = parseTimeToSeconds(match[1]);
      }

      if (Object.keys(times).length === 0) return;

      const serialized = JSON.stringify(times);
      if (serialized === lastTimesSerialized) return;
      lastTimesSerialized = serialized;

      console.log("[Convoke] Player times scraped:", times);
      chrome.runtime.sendMessage({
        action: "UPDATE_TIMES",
        data: { playerTimes: times },
      });
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
    scrapeTimes();

    const observer = new MutationObserver(() => {
      scrape();
      scrapeTimes();
    });
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
