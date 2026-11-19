import type { ConvokeMatchEvent } from "../src/shared/convoke/events";
import {
  applyMatchEvent,
  type MatchRecords,
  markSubmitted,
  pendingMatches,
} from "../src/shared/convoke/match-records";
import { toLocalDate } from "../src/shared/convoke/suggestions";
import {
  createGame,
  createGameSeat,
  findDeckByPlayerAndCommander,
  findGameByMatchId,
  findPlayerByName,
} from "../src/shared/notion";
import {
  convokeMatchesStorage,
  gameStorage,
  playerTimesStorage,
  submitProgressStorage,
} from "../src/shared/storage";
import {
  type SubmitDeps,
  type SubmitGameData,
  type SubmitResult,
  submitGame,
} from "../src/shared/submit";

/** Sent back to the popup for SUBMIT_GAME. */
type SubmitGameResponse = SubmitResult & { success: boolean };

const submitDeps: SubmitDeps = {
  findPlayerByName,
  findDeckByPlayerAndCommander,
  findGameByMatchId,
  createGame,
  createGameSeat,
  loadProgress: async (key) => (await submitProgressStorage.getValue())[key] ?? null,
  saveProgress: async (key, progress) => {
    await submitProgressStorage.setValue({
      ...(await submitProgressStorage.getValue()),
      [key]: progress,
    });
  },
  clearProgress: async (key) => {
    const { [key]: _done, ...rest } = await submitProgressStorage.getValue();
    await submitProgressStorage.setValue(rest);
  },
  fallbackPlayerTimes: () => playerTimesStorage.getValue(),
  // Local date: toISOString() would put evening games (after 7–8 pm Eastern) on the next day.
  today: () => toLocalDate(new Date().toISOString()),
  now: () => new Date().toISOString(),
};

async function handleSubmitGame(data: SubmitGameData): Promise<SubmitGameResponse> {
  const result = await submitGame(data, submitDeps);

  // Logged now, or already logged by someone else: either way this match is done.
  if (data.matchId && (result.status === "logged" || result.status === "already-logged")) {
    const matchId = data.matchId;
    // The game is already in Notion; a failure here must not turn the submit into an error.
    matchQueue = matchQueue
      .then(async () => {
        const records = markSubmitted(
          await convokeMatchesStorage.getValue(),
          matchId,
          new Date().toISOString()
        );
        await convokeMatchesStorage.setValue(records);
        await updateBadge(records);
      })
      .catch((err: unknown) => console.error("[Background] Failed to mark match submitted", err));
    await matchQueue;
  }

  return { ...result, success: result.status === "logged" || result.status === "already-logged" };
}

// Badge on the extension icon = number of ended Convoke matches waiting to be logged.
async function updateBadge(records: MatchRecords): Promise<void> {
  const count = pendingMatches(records).length;
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" }); // indigo-600
}

// Events can arrive close together (e.g. /end then votes). Apply them one at a time
// so one read-modify-write can't overwrite another.
let matchQueue: Promise<void> = Promise.resolve();

function handleConvokeMatchEvent(event: ConvokeMatchEvent): void {
  matchQueue = matchQueue
    .then(async () => {
      const records = applyMatchEvent(await convokeMatchesStorage.getValue(), event);
      await convokeMatchesStorage.setValue(records);
      await updateBadge(records);
      console.log(
        `[Background] Convoke ${event.type} applied; pending:`,
        pendingMatches(records).length
      );
    })
    .catch((err: unknown) => console.error("[Background] Failed to apply Convoke event", err));
}

export default defineBackground(() => {
  // The service worker restarts often; restore the badge from storage each time.
  convokeMatchesStorage
    .getValue()
    .then(updateBadge)
    .catch(() => {});

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "CONVOKE_MATCH_EVENT") {
      handleConvokeMatchEvent(message.data as ConvokeMatchEvent);
      return false;
    }

    // Dev builds only: sent by __edhMock.clear() on a Convoke page.
    if (
      message.action === "CONVOKE_DEV_CLEAR" &&
      (import.meta.env.MODE === "dev" || import.meta.env.MODE === "development")
    ) {
      // Without matchIds: forget every record. With matchIds: forget only those (replayLast).
      const matchIds = (message.data?.matchIds ?? null) as string[] | null;
      matchQueue = matchQueue
        .then(async () => {
          let records: MatchRecords = {};
          if (matchIds) {
            records = { ...(await convokeMatchesStorage.getValue()) };
            for (const id of matchIds) delete records[id];
          }
          await convokeMatchesStorage.setValue(records);
          await updateBadge(records);
          console.log(
            `[Background] Cleared ${matchIds ? matchIds.length : "all"} Convoke match records (dev)`
          );
        })
        .catch((err: unknown) =>
          console.error("[Background] Failed to clear Convoke match records", err)
        );
      return false;
    }

    console.log("[Background] Received message:", message);
    if (message.action === "UPDATE_STORAGE") {
      console.log("[Background] Updating storage with:", message.data.playersOnPage);
      gameStorage.setValue(message.data.playersOnPage);
      return false;
    }

    if (message.action === "UPDATE_TIMES") {
      console.log("[Background] Updating player times:", message.data.playerTimes);
      playerTimesStorage.setValue(message.data.playerTimes);
      return false;
    }

    if (message.action === "SUBMIT_GAME") {
      handleSubmitGame(message.data as SubmitGameData)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          sendResponse({
            success: false,
            status: "failed",
            error: msg,
          } satisfies SubmitGameResponse);
        });
      return true; // keep message channel open for async sendResponse
    }
  });
});
