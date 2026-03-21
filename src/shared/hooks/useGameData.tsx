import { useEffect, useState } from "react";
import { gameStorage } from "../storage";
import type { PlayerData } from "../storage";

export function useGameData() {
  const [players, setPlayers] = useState<PlayerData[]>([]);

  useEffect(() => {
    gameStorage.getValue().then((value) => setPlayers(value ?? []));

    const unwatch = gameStorage.watch((value) => setPlayers(value ?? []));

    return () => {
      unwatch();
    };
  }, []);

  return { players };
}
