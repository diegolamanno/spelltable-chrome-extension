import { useEffect, useState } from "react";
import { type MatchRecord, pendingMatches } from "../convoke/match-records";
import { convokeMatchesStorage } from "../storage";

/** Ended Convoke matches not yet logged, oldest first. Updates live as votes arrive. */
export function usePendingMatches(): MatchRecord[] {
  const [pending, setPending] = useState<MatchRecord[]>([]);

  useEffect(() => {
    convokeMatchesStorage.getValue().then((records) => setPending(pendingMatches(records ?? {})));
    const unwatch = convokeMatchesStorage.watch((records) => setPending(pendingMatches(records ?? {})));
    return () => unwatch();
  }, []);

  return pending;
}
