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
      const nameEls = Array.from(
        document.querySelectorAll(".font-bold.truncate.leading-snug.text-sm")
      );

      if (nameEls.length === 0) return;

      const gridContainer = findCommonAncestor(nameEls);

      const seats = nameEls.map((nameEl) => {
        let seat: Element = nameEl;
        while (seat.parentElement && seat.parentElement !== gridContainer) {
          seat = seat.parentElement;
        }
        return seat;
      });

      const midX = window.innerWidth / 2;
      const midY = window.innerHeight / 2;

      const sorted = [...seats].sort(
        (a, b) => clockwisePos(a, midX, midY) - clockwisePos(b, midX, midY)
      );

      const playerData = sorted
        .map((seat) => ({
          name:
            seat
              .querySelector(".font-bold.truncate.leading-snug.text-sm")
              ?.textContent?.trim()
              .toLowerCase() ?? "",
          commanders: Array.from(
            seat.querySelectorAll(
              ".text-xs.italic.text-gray-400.truncate.leading-snug.flex > div"
            )
          )
            .map((el) => el.textContent?.trim() ?? "")
            .filter(Boolean),
        }))
        .filter((p) => p.name);

      const serialized = JSON.stringify(playerData);
      if (serialized === lastSerialized) return;
      lastSerialized = serialized;

      chrome.runtime.sendMessage({
        action: "UPDATE_STORAGE",
        data: { playersOnPage: playerData },
      });
    }

    scrape();

    const observer = new MutationObserver(scrape);
    observer.observe(document.body, { childList: true, subtree: true });
  },
});
