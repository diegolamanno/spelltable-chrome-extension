import { gameStorage } from "../src/shared/storage";
import type { PlayerData } from "../src/shared/storage";
import {
  findPlayerByName,
  findDeckByCommander,
  createGame,
} from "../src/shared/notion";

interface SubmitGameData {
  players: PlayerData[];
  winner: string;
  wincon: string;
  firstPlayer: string | null;
  firstKill: string | null;
  koType: string;
  boardWipes: number;
  solRing: boolean;
}

interface SubmitGameResponse {
  success: boolean;
  gameId?: string;
  error?: string;
}

async function handleSubmitGame(data: SubmitGameData): Promise<SubmitGameResponse> {
  const { players, winner, wincon, firstPlayer, firstKill, koType, boardWipes, solRing } = data;

  const date = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  const playerNames = players.map((p) => p.name);
  const commanderNames = players.map((p) => p.commanders.join(" / "));

  // Resolve all player and deck IDs in parallel
  const [playerIds, deckIds] = await Promise.all([
    Promise.all(playerNames.map((name) => findPlayerByName(name))),
    Promise.all(commanderNames.map((name) => findDeckByCommander(name))),
  ]);

  const winnerIndex = players.findIndex((p) => p.name === winner);
  if (winnerIndex === -1) throw new Error(`Winner "${winner}" not in players list`);

  const winnerId = playerIds[winnerIndex];
  const winnerDeckId = deckIds[winnerIndex];

  // Derive first player and first kill IDs from already-resolved arrays
  const firstPlayerIndex = firstPlayer ? players.findIndex((p) => p.name === firstPlayer) : -1;
  const firstPlayerId = firstPlayerIndex !== -1 ? playerIds[firstPlayerIndex] : null;

  const firstKillIndex = firstKill ? players.findIndex((p) => p.name === firstKill) : -1;
  const firstKillId = firstKillIndex !== -1 ? playerIds[firstKillIndex] : null;
  const firstKillDeckId = firstKillIndex !== -1 ? deckIds[firstKillIndex] : null;

  const gameId = await createGame({
    playerIds,
    deckIds,
    winnerId,
    winnerDeckId,
    wincon,
    date,
    firstPlayerId,
    firstKillId,
    firstKillDeckId,
    koType,
    boardWipes,
    solRing,
  });

  return { success: true, gameId };
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log("[Background] Received message:", message);
    if (message.action === "UPDATE_STORAGE") {
      console.log("[Background] Updating storage with:", message.data.playersOnPage);
      gameStorage.setValue(message.data.playersOnPage);
      return false;
    }

    if (message.action === "SUBMIT_GAME") {
      handleSubmitGame(message.data as SubmitGameData)
        .then((result) => sendResponse(result))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          sendResponse({ success: false, error: msg });
        });
      return true; // keep message channel open for async sendResponse
    }
  });
});
