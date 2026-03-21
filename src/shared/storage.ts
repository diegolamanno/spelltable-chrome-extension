import { storage } from "wxt/utils/storage";

export interface PlayerData {
  name: string;
  commanders: string[];
}

export const gameStorage = storage.defineItem<PlayerData[]>("local:spelltable-game", {
  fallback: [],
});
