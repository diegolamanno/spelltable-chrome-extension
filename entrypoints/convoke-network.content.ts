/**
 * Convoke network watcher. Runs inside the page itself (MAIN world) so it can see the
 * page's own fetch calls. It only reads: requests and responses pass through untouched,
 * and request headers (which carry the auth token) are never read.
 *
 * 1. Relay (always on): /start, /end, winner votes → small events posted to
 *    convoke-bridge.content.ts, which forwards them to the background worker.
 * 2. Mock helper (dev builds only): window.__edhMock replays fixture scenarios (see below).
 * 3. Logger (VITE_CONVOKE_LOGGER=true only): records all /api/match and /api/game traffic
 *    to the console and window.__edhLog for discovery. Export after a game with:
 *      copy(JSON.stringify(window.__edhLog, null, 2))
 *    then reduce it with scripts/reduce-convoke-log.py.
 */
import { classifyRequest, RELAY_SOURCE } from "../src/shared/convoke/events";

interface LogEntry {
  at: string;
  method: string;
  path: string;
  status: number | null;
  requestBody: unknown;
  responseBody: unknown;
  error?: string;
}

declare global {
  interface Window {
    __edhLog?: LogEntry[];
    __edhMock?: {
      scenarios: Record<string, string>;
      play: (name?: string) => number;
      replayLast: () => number;
      clear: () => void;
    };
  }
}

// Dev builds only (`npm run dev` / `npm run build:dev`); the prod bundle drops this code.
const IS_DEV = import.meta.env.MODE === "dev" || import.meta.env.MODE === "development";

/**
 * window.__edhMock: replay mock Convoke matches without playing a game.
 *   __edhMock.scenarios        → list of scenarios
 *   __edhMock.play("single-game")  → sends the events; the extension badge should update
 *   __edhMock.clear()          → removes all stored Convoke match records
 */
async function installMockHelper(): Promise<void> {
  const { buildScenario, SCENARIOS } = await import("../src/shared/convoke/mock-scenarios");
  type Name = keyof typeof SCENARIOS;
  type Events = ReturnType<typeof buildScenario>;
  // Kept in this tab's sessionStorage so replayLast() still works after a page reload.
  const LAST_KEY = "__edhMock:lastEvents";
  const saveLast = (events: Events) => {
    try {
      sessionStorage.setItem(LAST_KEY, JSON.stringify(events));
    } catch {
      // Storage blocked or full: replayLast() just won't survive a reload.
    }
  };
  const loadLast = (): Events => {
    try {
      return JSON.parse(sessionStorage.getItem(LAST_KEY) ?? "[]") as Events;
    } catch {
      return [];
    }
  };
  window.__edhMock = {
    scenarios: { ...SCENARIOS },
    play(name = "full-session") {
      if (!(name in SCENARIOS)) {
        console.warn(`[EDH-Mock] Unknown scenario "${name}". Try one of:`, Object.keys(SCENARIOS));
        return 0;
      }
      const events = buildScenario(name as Name);
      saveLast(events);
      for (const event of events) window.postMessage({ source: RELAY_SOURCE, event }, location.origin);
      console.log(`[EDH-Mock] Sent ${events.length} events for "${name}". Check the extension badge.`);
      return events.length;
    },
    // Same match ids as the last play() in this tab. The extension first forgets those matches
    // (even if already submitted), so they come back as pending, like another pod member's
    // copy. Submitting again tests the "already logged" check against Notion.
    replayLast() {
      const events = loadLast();
      if (events.length === 0) {
        console.warn("[EDH-Mock] Nothing to replay: run __edhMock.play(...) in this tab first.");
        return 0;
      }
      const matchIds = [...new Set(events.flatMap((e) => (e.type === "votes" ? [] : [e.response.match.id])))];
      window.postMessage({ source: RELAY_SOURCE, command: "clear-matches", matchIds }, location.origin);
      for (const event of events) window.postMessage({ source: RELAY_SOURCE, event }, location.origin);
      console.log(`[EDH-Mock] Re-sent ${events.length} events with the same match ids.`);
      return events.length;
    },
    clear() {
      window.postMessage({ source: RELAY_SOURCE, command: "clear-matches" }, location.origin);
      console.log("[EDH-Mock] Asked the extension to clear all Convoke match records.");
    },
  };
  console.log("[EDH-Mock] Ready: __edhMock.play('full-session'). Scenarios:", Object.keys(SCENARIOS));
}

const LOGGED = /\/api\/(match|game)\//;
const RELAYED = /^\/api\/match\/[0-9a-f-]{36}\/(start|end|vote-winner|state)$/;

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return body == null ? null : `[${Object.prototype.toString.call(body)}]`;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export default defineContentScript({
  matches: ["https://convoke.games/*"],
  world: "MAIN",
  runAt: "document_start",

  main() {
    if (IS_DEV) installMockHelper().catch((err) => console.warn("[EDH-Mock] Failed to load", err));

    const logging = import.meta.env.VITE_CONVOKE_LOGGER === "true";
    const log: LogEntry[] | null = logging ? [] : null;
    if (log) window.__edhLog = log;
    const originalFetch = window.fetch;

    window.fetch = async function watchedFetch(input: RequestInfo | URL, init?: RequestInit) {
      const response = await originalFetch.call(this, input, init);

      try {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        const relay = RELAYED.test(url.pathname);
        if (!relay && !(log && LOGGED.test(url.pathname))) return response;

        const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        if (!log && method === "GET") return response; // the relay never needs GETs
        const at = new Date().toISOString();
        const requestBody = parseBody(init?.body);

        // Read a clone so the page still gets an untouched response.
        response
          .clone()
          .text()
          .then((text) => {
            let responseBody: unknown;
            try {
              responseBody = JSON.parse(text);
            } catch {
              responseBody = text.slice(0, 2000);
            }

            if (relay) {
              const event = classifyRequest({
                method,
                path: url.pathname,
                status: response.status,
                requestBody,
                responseBody,
                at,
              });
              if (event) window.postMessage({ source: RELAY_SOURCE, event }, location.origin);
            }

            if (log) {
              const entry = { at, method, path: url.pathname, status: response.status, requestBody, responseBody };
              log.push(entry);
              const highlight = /\/(start|end|vote-winner)$/.test(entry.path) ? "★ " : "";
              console.log(`[EDH-Logger] ${highlight}${entry.method} ${entry.path} → ${entry.status}`, entry);
            }
          })
          .catch(() => {
            // Never let the watcher break the page.
          });
      } catch {
        // Never let the watcher break the page.
      }

      return response;
    };

    if (log) {
      console.log(
        "[EDH-Logger] Watching Convoke /api/match and /api/game requests. Export with: copy(JSON.stringify(window.__edhLog, null, 2))",
      );
    }
  },
});
