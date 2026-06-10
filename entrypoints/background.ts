import { gameStorage, playerTimesStorage } from "../src/shared/storage";
import type { PlayerData } from "../src/shared/storage";
import {
  findPlayerByName,
  findDeckByPlayerAndCommander,
  createGame,
  createGameSeat,
} from "../src/shared/notion";

interface SubmitGameData {
  players: PlayerData[];
  winner: string | null;
  wincon: string;
  firstPlayer: string | null;
  firstKiller: string | null;
  firstVictim: string | null;
  koType: string;
  boardWipes: number;
  rounds: number;
  solRing: boolean;
}

interface SubmitGameResponse {
  success: boolean;
  gameId?: string;
  error?: string;
}

async function handleSubmitGame(data: SubmitGameData): Promise<SubmitGameResponse> {
  const { players, winner, wincon, firstPlayer, firstKiller, firstVictim, koType, boardWipes, rounds, solRing } = data;

  const date = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  const playerNames = players.map((p) => p.name);

  // Step 1: resolve all player IDs (needed to scope deck lookups by owner)
  const playerIds = await Promise.all(playerNames.map((name) => findPlayerByName(name)));

  // Step 2: resolve deck IDs scoped to each player's owned deck
  const deckIds = await Promise.all(
    players.map((p, i) => findDeckByPlayerAndCommander(p.commanders.join(" / "), playerIds[i])),
  );

  const winnerIndex = winner ? players.findIndex((p) => p.name === winner) : -1;
  if (winner && winnerIndex === -1) throw new Error(`Winner "${winner}" not in players list`);

  const winnerId = winnerIndex !== -1 ? playerIds[winnerIndex] : null;
  const winnerDeckId = winnerIndex !== -1 ? deckIds[winnerIndex] : null;

  // Derive first player and first killer IDs from already-resolved arrays
  const firstPlayerIndex = firstPlayer ? players.findIndex((p) => p.name === firstPlayer) : -1;
  const firstPlayerId = firstPlayerIndex !== -1 ? playerIds[firstPlayerIndex] : null;

  const firstKillerIndex = firstKiller ? players.findIndex((p) => p.name === firstKiller) : -1;
  const firstKillerId = firstKillerIndex !== -1 ? playerIds[firstKillerIndex] : null;
  const firstKillerDeckId = firstKillerIndex !== -1 ? deckIds[firstKillerIndex] : null;

  const firstVictimIndex = firstVictim ? players.findIndex((p) => p.name === firstVictim) : -1;
  const firstVictimId = firstVictimIndex !== -1 ? playerIds[firstVictimIndex] : null;
  const firstVictimDeckId = firstVictimIndex !== -1 ? deckIds[firstVictimIndex] : null;

  const gameId = await createGame({
    playerIds,
    deckIds,
    winnerId,
    winnerDeckId,
    wincon,
    date,
    firstPlayerId,
    firstKillerId,
    firstKillerDeckId,
    firstVictimId,
    firstVictimDeckId,
    koType,
    boardWipes,
    rounds,
    solRing,
  });

  const playerTimes = await playerTimesStorage.getValue();

  // Create one Game Seat entry per player, preserving seat order from scrape
  await Promise.all(
    players.map((p, i) => {
      const rawTime = playerTimes[p.name.toLowerCase()];
      return createGameSeat({
        gameId,
        playerId: playerIds[i],
        deckId: deckIds[i],
        seat: i + 1,
        playerName: p.name,
        date,
        ...(rawTime !== undefined && { rawTime }),
      });
    }),
  );

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
