/**
 * Forwards match events from the in-page network watcher (convoke-network.content.ts)
 * to the background worker. Runs on every Convoke page because Convoke changes pages
 * without a full reload, and content scripts only load on a full page load.
 *
 * Any script on convoke.games could post a message like this. That's acceptable:
 * everything relayed is only shown for review, and the person submitting confirms it.
 */
import { isConvokeMatchEvent, RELAY_SOURCE } from "../src/shared/convoke/events";

export default defineContentScript({
  matches: ["https://convoke.games/*"],

  main() {
    const isDev = import.meta.env.MODE === "dev" || import.meta.env.MODE === "development";

    window.addEventListener("message", (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const data = e.data as { source?: unknown; event?: unknown; command?: unknown; matchIds?: unknown } | null;
      if (data?.source !== RELAY_SOURCE) return;

      // The extension was reloaded or rebuilt after this tab loaded: this script can no longer
      // reach it, and messages would be dropped silently.
      if (!chrome.runtime?.id) {
        if (isDev) console.warn("[EDH-Mock] The extension was reloaded. Reload this tab, then try again.");
        return;
      }

      // Dev-only: __edhMock.clear() (all records) and replayLast() (only the replayed matches)
      if (isDev && data.command === "clear-matches") {
        const matchIds = Array.isArray(data.matchIds) ? data.matchIds.filter((id) => typeof id === "string") : null;
        chrome.runtime.sendMessage({ action: "CONVOKE_DEV_CLEAR", data: { matchIds } }).catch(() => {});
        return;
      }

      if (!isConvokeMatchEvent(data.event)) return;

      chrome.runtime.sendMessage({ action: "CONVOKE_MATCH_EVENT", data: data.event }).catch(() => {
        // Background not reachable (e.g. extension reloaded). Nothing to do.
      });
    });
  },
});
