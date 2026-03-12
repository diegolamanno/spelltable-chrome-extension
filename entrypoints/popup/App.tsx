import { useGameData } from "../../src/shared/hooks/useGameData";

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

  const handleRefresh = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) return;
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeGamePage,
      });
    });
  };

  const handleSubmit = () => {
    // TODO: integrate with backend
    alert("SUBMIT");
  };

  return (
    <div className="w-80 bg-gray-950 text-white p-4 font-sans">
      <header className="flex items-center gap-3 mb-5">
        <img src="/logo.png" className="w-9 h-9 rounded" alt="SpellTable Score Recorder" />
        <div>
          <h1 className="text-base font-bold text-indigo-300 leading-tight">Match Logger</h1>
          <p className="text-xs text-gray-500">SpellTable Score Recorder</p>
        </div>
      </header>

      <div className="mb-4 min-h-[80px]">
        {players.length === 0 ? (
          <div className="flex items-center justify-center h-20 rounded-lg border border-gray-800 border-dashed">
            <p className="text-gray-600 text-xs text-center">
              No players detected.
              <br />
              Open a SpellTable game and click Refresh.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {players.map((player, i) => (
              <li
                key={player}
                className="flex items-start gap-2.5 bg-gray-900 rounded-lg px-3 py-2"
              >
                <span className="text-indigo-500 font-bold text-xs mt-0.5 w-4 shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium capitalize truncate">{player}</p>
                  {commanders[i] && (
                    <p className="text-gray-500 text-xs italic truncate">{commanders[i]}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleRefresh}
          className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          Refresh
        </button>
        <button
          onClick={handleSubmit}
          disabled={players.length === 0}
          className="flex-1 py-2 px-3 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          Submit Score
        </button>
      </div>
    </div>
  );
}
