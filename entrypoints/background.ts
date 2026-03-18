import { playerStorage, commanderStorage } from "../src/shared/storage";
import {
  findPlayerByName,
  findDeckByCommander,
  createGame,
} from "../src/shared/notion";

interface SubmitGameData {
  players: string[];
  commanders: string[];
  winner: string;
  wincon: string;
}

interface SubmitGameResponse {
  success: boolean;
  gameId?: string;
  error?: string;
}

async function handleSubmitGame(data: SubmitGameData): Promise<SubmitGameResponse> {
  const { players, commanders, winner, wincon } = data;

  const date = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Resolve all player and deck IDs in parallel
  const [playerIds, deckIds] = await Promise.all([
    Promise.all(players.map((name) => findPlayerByName(name))),
    Promise.all(commanders.map((name) => findDeckByCommander(name))),
  ]);

  const winnerIndex = players.indexOf(winner);
  if (winnerIndex === -1) throw new Error(`Winner "${winner}" not in players list`);

  const winnerId = playerIds[winnerIndex];
  const winnerDeckId = deckIds[winnerIndex];

  const gameId = await createGame({
    playerIds,
    deckIds,
    winnerId,
    winnerDeckId,
    wincon,
    date,
  });

  return { success: true, gameId };
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "UPDATE_STORAGE") {
      playerStorage.setValue(message.data.namesOnPage);
      commanderStorage.setValue(message.data.commandersOnPage);
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
