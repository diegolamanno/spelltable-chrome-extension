import { useEffect } from "react";
// import { Players } from "../../pages/content/index";
import useStorage from "./useStorage";
import playerStorage from "../storages/playerStorage";
import commanderStorage from "../storages/commanderStorage";

export default function useMyExample() {
  // const [elementText, setElementText] = useState<string | null>(null);

  //   const namesOnPage: Players = [];

  const players = useStorage(playerStorage);
  const commanders = useStorage(commanderStorage);

  // const randomFunction = async () => {
  //   const [tab] = await chrome.tabs.query({ active: true });
  //   chrome.scripting.executeScript<[React.Dispatch<string | null>], void>({
  //     target: { tabId: tab.id! },
  //     args: [setElementText],
  //     func: (setElementText) => {
  //       const element = document.querySelector(
  //         ".font-bold.truncate.leading-snug.text-sm"
  //       );
  //       console.log(element);
  //       if (element) {
  //         setElementText(element.textContent);
  //       }
  //     },
  //   });
  // };

  useEffect(() => {
    console.log("TEST");
    console.log("Use Effect theme", players);

    // chrome.runtime.onMessage.addListener((message) => {
    //   if (message.action === "UPDATE_POPUP") {
    //     const names = message.data.names;
    //     names.map((name: string) => {
    //       namesOnPage.push(name);
    //     });
    //   }
    // });

    // async function getContentFromPage() {
    //   const [tab] = await chrome.tabs.query({
    //     active: true,
    //     currentWindow: true,
    //   });

    //   // chrome.scripting.executeScript<[React.Dispatch<string | null>], void>({
    //   //   target: { tabId: tab.id! },
    //   //   args: [setElementText],
    //   //   func: (setElementText) => {
    //   //     console.log("I AM HERE");
    //   //     const nameOfThePlayer = contentScript();
    //   //     setElementText(nameOfThePlayer);
    //   //   },
    //   // });
    // }

    // getContentFromPage();
  }, [players, commanders]);
  return { players, commanders };
}
