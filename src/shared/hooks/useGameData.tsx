import { useEffect, useState } from "react";
import { commanderStorage, playerStorage } from "../storage";

export function useGameData() {
  const [players, setPlayers] = useState<string[]>([]);
  const [commanders, setCommanders] = useState<string[]>([]);

  useEffect(() => {
    playerStorage.getValue().then(setPlayers);
    commanderStorage.getValue().then(setCommanders);

    const unwatchPlayers = playerStorage.watch((value) => setPlayers(value ?? []));
    const unwatchCommanders = commanderStorage.watch((value) => setCommanders(value ?? []));

    return () => {
      unwatchPlayers();
      unwatchCommanders();
    };
  }, []);

  return { players, commanders };
}
