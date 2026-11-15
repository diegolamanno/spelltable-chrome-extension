/**
 * Convoke network logger (discovery tool, read-only).
 *
 * Runs inside the page itself (MAIN world) so it can see the page's own fetch calls.
 * Logs Convoke's match/game API traffic so we can learn what data is available when a
 * match starts, gets votes, and ends. It never modifies requests or responses, and never
 * logs request headers (they carry the auth token).
 *
 * Enable it by setting VITE_CONVOKE_LOGGER=true in .env.dev, then `npm run build:dev`.
 *
 * After a game, in DevTools on the Convoke tab:
 *   copy(JSON.stringify(window.__edhLog, null, 2))   // copies the full log to the clipboard
 */

interface LogEntry {
  at: string; // ISO timestamp
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
  }
}

// Endpoints worth recording: /api/match/* (start, end, vote-winner, state, ...) and /api/game/*
const WATCHED = /\/api\/(match|game)\//;

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
    if (import.meta.env.VITE_CONVOKE_LOGGER !== "true") return;

    const log: LogEntry[] = (window.__edhLog = []);
    const originalFetch = window.fetch;

    window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
      const response = await originalFetch.call(this, input, init);

      try {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (WATCHED.test(url.pathname)) {
          const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
          const entry: LogEntry = {
            at: new Date().toISOString(),
            method,
            path: url.pathname, // query string dropped on purpose
            status: response.status,
            requestBody: parseBody(init?.body),
            responseBody: null,
          };

          // Read a clone so the page still gets an untouched response.
          response
            .clone()
            .text()
            .then((text) => {
              try {
                entry.responseBody = JSON.parse(text);
              } catch {
                entry.responseBody = text.slice(0, 2000);
              }
            })
            .catch((err: unknown) => {
              entry.error = String(err);
            })
            .finally(() => {
              log.push(entry);
              const highlight = /\/(start|end|vote-winner)$/.test(entry.path) ? "★ " : "";
              console.log(`[EDH-Logger] ${highlight}${entry.method} ${entry.path} → ${entry.status}`, entry);
            });
        }
      } catch {
        // Never let the logger break the page.
      }

      return response;
    };

    console.log("[EDH-Logger] Watching Convoke /api/match and /api/game requests. Export with: copy(JSON.stringify(window.__edhLog, null, 2))");
  },
});
