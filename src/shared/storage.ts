import { storage } from "wxt/utils/storage";

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

export const notionConfigStorage = storage.defineItem<NotionConfig>("local:notion-config", {
  fallback: {
    apiKey:        (import.meta.env.VITE_NOTION_API_KEY as string)             ?? "",
    playersDbId:   (import.meta.env.VITE_NOTION_PLAYERS_DB_ID as string)       ?? "",
    decksDbId:     (import.meta.env.VITE_NOTION_DECKS_DB_ID as string)         ?? "",
    gamesDbId:     (import.meta.env.VITE_NOTION_GAMES_DB_ID as string)         ?? "",
    gameSeatsDbId: (import.meta.env.VITE_NOTION_GAME_SEATS_DB_ID as string)    ?? "",
  },
});
