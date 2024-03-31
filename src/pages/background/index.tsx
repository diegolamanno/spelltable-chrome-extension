import playerStorage from "../../shared/storages/playerStorage";
import commanderStorage from "../../shared/storages/commanderStorage";
import { Players } from "../content";

chrome.runtime.onMessage.addListener(async (message) => {
  switch (message.action) {
    case "UPDATE_STORAGE": {
      const namesOnPage: Players = message.data.namesOnPage;
      const commandersOnPage = message.data.commandersOnPage;
      console.log("namesOnPage:", namesOnPage);
      console.log("commandersOnPage:", commandersOnPage);

      await playerStorage.set(namesOnPage);
      await commanderStorage.set(commandersOnPage);
      break;
    }
    case "UPDATE_PAGE_DATA": {
      const hello = "HI";
      console.log(hello);
      break;
    }
    default:
      console.log("GOT INTO DEFAULT");
      break;
  }

  // Get information from content scripts
  // if (message.action === "GET_PAGE_CONTENT") {
  //   // sessionID = message.data.sessionID;
  //   const namesOnPage = message.data.namesOnPage;
  //   const commandersOnPage = message.data.commandersOnPage;
  //   // console.log("sessionID:", sessionID);
  //   console.log("namesOnPage:", namesOnPage);
  //   console.log("commandersOnPage:", commandersOnPage);

  //   await exampleThemeStorage.toggle();

  // chrome.runtime.sendMessage({
  //   action: "UPDATE_POPUP",
  //   data: {
  //     names: namesOnPage,
  //     commanders: commandersOnPage,
  //   },
  // });
  // loadDictionary(namesOnPage, commandersOnPage, sessionID);
  // }

  // } else if (message.action === "getNameDictPopup") {
  //   console.log(message);
  //   // Send the data back to the popup
  //   chrome.runtime.sendMessage({
  //     action: "recieveNameDictPopup",
  //     data: nameDictionary,
  //   });
  // }
});
