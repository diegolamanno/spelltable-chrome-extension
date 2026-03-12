import { useEffect, useState } from "react";
import { useGameData } from "../../src/shared/hooks/useGameData";

const WIN_CONDITIONS = [
  { id: "damage", label: "Damage" },
  { id: "commander-damage", label: "Cmdr Damage" },
  { id: "burn", label: "Burn / Life" },
  { id: "alt-wincon", label: "Alt Wincon" },
  { id: "poison", label: "Poison" },
  { id: "mill", label: "Mill" },
] as const;

type WinCondition = (typeof WIN_CONDITIONS)[number]["id"];

function scrapeGamePage(): void {
  const players = Array.from(
    document.querySelectorAll(".font-bold.truncate.leading-snug.text-sm")
  )
    .map((el) => el.textContent?.trim().toLowerCase() ?? "")
    .filter(Boolean);

  const commanders = Array.from(
    document.querySelectorAll(
      ".text-xs.italic.text-gray-400.truncate.leading-snug.flex > div"
    )
  )
    .map((el) => el.textContent?.trim() ?? "")
    .filter(Boolean);

  chrome.runtime.sendMessage({
    action: "UPDATE_STORAGE",
    data: { namesOnPage: players, commandersOnPage: commanders },
  });
}

export default function App() {
  const { players, commanders } = useGameData();
  const [winner, setWinner] = useState<string | null>(null);
  const [wincon, setWincon] = useState<WinCondition | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Reset selections when the player list changes (after a Refresh)
  useEffect(() => {
    setWinner(null);
    setWincon(null);
    setIsConfirming(false);
  }, [players]);

  const handleRefresh = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeGamePage,
      });
    });
  };

  const handleConfirm = () => {
    // TODO: integrate with backend API
    console.log({
      winner,
      winnerCommander: commanders[players.indexOf(winner!)],
      wincon,
    });
    setIsConfirming(false);
  };

  const winnerIndex = winner !== null ? players.indexOf(winner) : -1;
  const winconLabel = WIN_CONDITIONS.find((w) => w.id === wincon)?.label;
  const canSubmit = winner !== null && wincon !== null;

  // — Confirmation screen —
  if (isConfirming) {
    return (
      <div className="w-80 bg-gray-950 text-white p-4 font-sans">
        <header className="flex items-center gap-3 mb-5">
          <img src="/logo.png" className="w-9 h-9 rounded" alt="SpellTable Score Recorder" />
          <div>
            <h1 className="text-base font-bold text-indigo-300 leading-tight">Match Logger</h1>
            <p className="text-xs text-gray-500">SpellTable Score Recorder</p>
          </div>
        </header>

        <p className="text-sm font-semibold text-white mb-3">Confirm submission?</p>

        <div className="space-y-3 mb-5">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Winner</p>
            <div className="bg-gray-900 rounded-lg px-3 py-2">
              <p className="text-white text-sm font-medium capitalize">{winner}</p>
              {commanders[winnerIndex] && (
                <p className="text-gray-400 text-xs italic">{commanders[winnerIndex]}</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Win condition</p>
            <div className="bg-gray-900 rounded-lg px-3 py-2">
              <p className="text-white text-sm font-medium">{winconLabel}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsConfirming(false)}
            className="flex-1 py-2 px-3 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Edit
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Confirm
          </button>
        </div>
      </div>
    );
  }

  // — Main form —
  return (
    <div className="w-80 bg-gray-950 text-white p-4 font-sans">
      <header className="flex items-center gap-3 mb-5">
        <img src="/logo.png" className="w-9 h-9 rounded" alt="SpellTable Score Recorder" />
        <div>
          <h1 className="text-base font-bold text-indigo-300 leading-tight">Match Logger</h1>
          <p className="text-xs text-gray-500">SpellTable Score Recorder</p>
        </div>
      </header>

      {/* Player list / winner picker */}
      <div className="mb-4">
        {players.length === 0 ? (
          <div className="flex items-center justify-center h-20 rounded-lg border border-gray-800 border-dashed">
            <p className="text-gray-600 text-xs text-center">
              No players detected.
              <br />
              Open a SpellTable game and click Refresh.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Select winner</p>
            <ul className="space-y-1.5">
              {players.map((player, i) => {
                const isSelected = winner === player;
                return (
                  <li key={player}>
                    <button
                      onClick={() => setWinner(isSelected ? null : player)}
                      className={`w-full flex items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-indigo-950 ring-2 ring-indigo-500"
                          : "bg-gray-900 hover:bg-gray-800"
                      }`}
                    >
                      <span className="text-indigo-500 font-bold text-xs mt-0.5 w-4 shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium capitalize truncate">
                          {player}
                        </p>
                        {commanders[i] && (
                          <p className="text-gray-500 text-xs italic truncate">{commanders[i]}</p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Win condition picker */}
      {players.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Win condition</p>
          <div className="grid grid-cols-3 gap-1.5">
            {WIN_CONDITIONS.map((wc) => (
              <button
                key={wc.id}
                onClick={() => setWincon(wincon === wc.id ? null : wc.id)}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  wincon === wc.id
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {wc.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleRefresh}
          className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          Refresh
        </button>
        <button
          onClick={() => setIsConfirming(true)}
          disabled={!canSubmit}
          className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          Submit Score
        </button>
      </div>
    </div>
  );
}
