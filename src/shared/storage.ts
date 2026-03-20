import { storage } from "wxt/utils/storage";

export const playerStorage = storage.defineItem<string[]>("local:spelltable-players", {
  fallback: [],
});

export const commanderStorage = storage.defineItem<string[]>("local:spelltable-commanders", {
  fallback: [],
});
