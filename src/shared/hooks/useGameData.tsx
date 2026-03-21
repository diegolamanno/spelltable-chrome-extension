import { useEffect, useState } from "react";
import { gameStorage } from "../storage";
import type { PlayerData } from "../storage";

export function useGameData() {
  const [players, setPlayers] = useState<PlayerData[]>([]);

  useEffect(() => {
    gameStorage.getValue().then((value) => {
      console.log("[useGameData] Initial value from storage:", value);
      setPlayers(value ?? []);
    });

    const unwatch = gameStorage.watch((value) => {
      console.log("[useGameData] Storage updated:", value);
      setPlayers(value ?? []);
    });

    return () => {
      unwatch();
    };
  }, []);

  return { players };
}
