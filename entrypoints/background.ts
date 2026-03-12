import { playerStorage, commanderStorage } from "../src/shared/storage";

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(async (message) => {
    if (message.action === "UPDATE_STORAGE") {
      await playerStorage.setValue(message.data.namesOnPage);
      await commanderStorage.setValue(message.data.commandersOnPage);
    }
  });
});
