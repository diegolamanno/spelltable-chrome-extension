import baLogo from "/logo-large.png";
import "./Popup.css";
import useMyExample from "../../shared/hooks/useMyExample";
import { Players, Commanders } from "../content/index";

function refreshPlayers() {
  console.log("EXECUTING MY INJECTED SCRIPT");
  const namesOnPage: Players = [];
  const commandersOnPage: Commanders = [];
  // Get players names
  const nameElements = document.querySelectorAll(
    ".font-bold.truncate.leading-snug.text-sm"
  );

  nameElements.forEach((element) => {
    const playerName = element?.textContent?.trim().toLowerCase();
    playerName !== undefined && namesOnPage.push(playerName);
  });

  // Get commanders names
  const commanderElements = document.querySelectorAll(
    ".text-xs.italic.text-gray-400.truncate.leading-snug.flex > div"
  );

  commanderElements.forEach((element) => {
    const commanderName = element?.textContent?.trim();
    commanderName !== undefined && commandersOnPage.push(commanderName);
  });

  console.log("Names on Page: ", namesOnPage);
  console.log("Commanders on Page: ", commandersOnPage);

  chrome.runtime.sendMessage({
    action: "UPDATE_STORAGE",
    data: {
      namesOnPage: namesOnPage,
      commandersOnPage: commandersOnPage,
    },
  });
}

function Popup() {
  const { players, commanders } = useMyExample();
  console.log("THIS IS THE PLAYERS FROM THE POP UP");
  console.log(players);

  const executeScript = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        args: [],
        func: refreshPlayers,
      });
    });
  };

  return (
    <>
      <div>
        <a href="https://airtable.com/shrPcVxrIiSGjVx02" target="_blank">
          <img src={baLogo} className="logo" alt="Vite logo" />
        </a>
      </div>
      <h1>Match logger</h1>
      <div className="card">
        <button onClick={() => executeScript()}>Refresh Players</button>
      </div>
      <div className="card">
        {players.map((player) => (
          <span className="player">{player}</span>
        ))}
      </div>
      <div className="card">
        {commanders.map((commander) => (
          <span className="player">{commander}</span>
        ))}
      </div>
      <div className="card">
        <button onClick={() => alert("SUBMIT")}>Submit Score</button>
      </div>
    </>
  );
}

export default Popup;
