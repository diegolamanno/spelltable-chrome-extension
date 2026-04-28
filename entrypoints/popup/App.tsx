import { useEffect, useMemo, useState } from "react";
import { useGameData } from "../../src/shared/hooks/useGameData";
import type { PlayerData } from "../../src/shared/storage";

const DEBUG_SINGLE_PLAYER = import.meta.env.VITE_DEBUG_SINGLE_PLAYER === "true";
const DEBUG_PLAYERS: PlayerData[] = [
  { name: "Metalbot", commanders: ["Korvold, Fae-Cursed King"] },
  { name: "Paperbot", commanders: ["Krenko, Mob Boss"] },
  { name: "Waterbot", commanders: ["Yawgmoth, Thran Physician"] },
];

const WIN_CONDITIONS = [
  { id: "damage", label: "Damage" },
  { id: "commander-damage", label: "Cmdr Damage" },
  { id: "burn", label: "Burn / Life" },
  { id: "alt-wincon", label: "Alt Wincon" },
  { id: "poison", label: "Poison" },
  { id: "mill", label: "Mill" },
] as const;

type WinCondition = (typeof WIN_CONDITIONS)[number]["id"];
type SubmitStatus = "idle" | "loading" | "success" | "error";

function Header() {
  return (
    <header className="flex items-center gap-3 mb-5">
      <img src="/logo.png" className="w-9 h-9 rounded" alt="SpellTable Score Recorder" />
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-bold text-indigo-300 leading-tight">Match Logger</h1>
        <p className="text-xs text-gray-500">SpellTable Score Recorder</p>
      </div>
      {DEBUG_SINGLE_PLAYER && (
        <span className="text-xs font-medium bg-amber-900 text-amber-300 px-2 py-0.5 rounded shrink-0">
          DEBUG
        </span>
      )}
    </header>
  );
}

export default function App() {
  const { players: detectedPlayers } = useGameData();
  const players = useMemo(
    () => (DEBUG_SINGLE_PLAYER ? [...detectedPlayers, ...DEBUG_PLAYERS] : detectedPlayers),
    [detectedPlayers],
  );
  const [winner, setWinner] = useState<string | null>(null);
  const [wincon, setWincon] = useState<WinCondition | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset form when the player list changes (after Refresh)
  useEffect(() => {
    setWinner(null);
    setWincon(null);
    setIsConfirming(false);
    setSubmitStatus("idle");
    setSubmitError(null);
  }, [players]);

  const handleRefresh = async () => {
    console.log("[Popup] Refresh button clicked");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log("[Popup] Active tab:", tab);
      if (!tab?.id) {
        console.error("[Popup] No active tab found");
        return;
      }

      // Send message to content script to trigger a scrape
      console.log("[Popup] Sending SCRAPE_NOW message to tab", tab.id);
      await chrome.tabs.sendMessage(tab.id, { action: "SCRAPE_NOW" });
      console.log("[Popup] Message sent successfully");
    } catch (error) {
      console.error("[Popup] Failed to refresh:", error);
    }
  };

  const handleConfirm = () => {
    setSubmitStatus("loading");
    setSubmitError(null);
    chrome.runtime.sendMessage(
      {
        action: "SUBMIT_GAME",
        data: { players, winner, wincon },
      },
      (response: { success: boolean; error?: string } | undefined) => {
        if (response?.success) {
          setSubmitStatus("success");
        } else {
          setSubmitStatus("error");
          setSubmitError(response?.error ?? "Unknown error");
        }
      }
    );
  };

  const handleReset = () => {
    setWinner(null);
    setWincon(null);
    setIsConfirming(false);
    setSubmitStatus("idle");
    setSubmitError(null);
  };

  const winnerPlayer = winner !== null ? players.find((p) => p.name === winner) : undefined;
  const winconLabel = WIN_CONDITIONS.find((w) => w.id === wincon)?.label;
  const canSubmit = winner !== null && wincon !== null;

  // — Success screen —
  if (submitStatus === "success") {
    return (
      <div className="w-80 bg-gray-950 text-white p-4 font-sans">
        <Header />
        <div className="flex flex-col items-center text-center py-4 mb-5">
          <div className="w-12 h-12 rounded-full bg-emerald-900 flex items-center justify-center mb-3">
            <span className="text-emerald-400 text-2xl">✓</span>
          </div>
          <p className="text-white font-semibold text-sm mb-1">Game recorded!</p>
          <p className="text-gray-500 text-xs">
            {winner} ({winnerPlayer?.commanders.join(" / ") ?? "unknown commander"}) won via{" "}
            {winconLabel}.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="w-full py-2 px-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          Record another game
        </button>
      </div>
    );
  }

  // — Confirmation screen —
  if (isConfirming) {
    const isLoading = submitStatus === "loading";
    return (
      <div className="w-80 bg-gray-950 text-white p-4 font-sans">
        <Header />
        <p className="text-sm font-semibold text-white mb-3">Confirm submission?</p>

        <div className="space-y-3 mb-5">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Winner</p>
            <div className="bg-gray-900 rounded-lg px-3 py-2">
              <p className="text-white text-sm font-medium capitalize">{winner}</p>
              {winnerPlayer && winnerPlayer.commanders.length > 0 && (
                <p className="text-gray-400 text-xs italic">
                  {winnerPlayer.commanders.join(" / ")}
                </p>
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

        {submitStatus === "error" && (
          <p className="text-red-400 text-xs mb-3">⚠ {submitError}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              setIsConfirming(false);
              setSubmitStatus("idle");
              setSubmitError(null);
            }}
            disabled={isLoading}
            className="flex-1 py-2 px-3 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Edit
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            {isLoading ? "Submitting…" : "Confirm"}
          </button>
        </div>
      </div>
    );
  }

  // — Main form —
  return (
    <div className="w-80 bg-gray-950 text-white p-4 font-sans">
      <Header />

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
                const isSelected = winner === player.name;
                return (
                  <li key={player.name}>
                    <button
                      onClick={() => setWinner(isSelected ? null : player.name)}
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
                          {player.name}
                        </p>
                        {player.commanders.length > 0 && (
                          <p className="text-gray-500 text-xs italic truncate">
                            {player.commanders.join(" / ")}
                          </p>
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
