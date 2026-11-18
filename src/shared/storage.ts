import { storage } from "wxt/utils/storage";
import type { MatchRecords } from "./convoke/match-records";
import type { SubmitProgress } from "./submit";

// Unfinished submissions (Game created, some seats failed), keyed by submissionKey.
export const submitProgressStorage = storage.defineItem<Record<string, SubmitProgress>>(
  "local:submit-progress",
  {
    fallback: {},
  }
);

// Convoke match records keyed by matchId (see src/shared/convoke/match-records.ts)
export const convokeMatchesStorage = storage.defineItem<MatchRecords>("local:convoke-matches", {
  fallback: {},
});

export interface PlayerData {
  name: string;
  commanders: string[];
}

export const gameStorage = storage.defineItem<PlayerData[]>("local:spelltable-game", {
  fallback: [],
});

export interface NotionConfig {
  apiKey: string;
  playersDbId: string;
  decksDbId: string;
  gamesDbId: string;
  gameSeatsDbId: string;
}

// playerName (lowercased) → total turn time in seconds, populated from Convoke end screen
export const playerTimesStorage = storage.defineItem<Record<string, number>>(
  "local:convoke-player-times",
  {
    fallback: {},
  }
);

export const notionConfigStorage = storage.defineItem<NotionConfig>("local:notion-config", {
  fallback: {
    apiKey: (import.meta.env.VITE_NOTION_API_KEY as string) ?? "",
    playersDbId: (import.meta.env.VITE_NOTION_PLAYERS_DB_ID as string) ?? "",
    decksDbId: (import.meta.env.VITE_NOTION_DECKS_DB_ID as string) ?? "",
    gamesDbId: (import.meta.env.VITE_NOTION_GAMES_DB_ID as string) ?? "",
    gameSeatsDbId: (import.meta.env.VITE_NOTION_GAME_SEATS_DB_ID as string) ?? "",
  },
});
