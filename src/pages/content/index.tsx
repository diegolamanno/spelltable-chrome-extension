export type Players = Array<string>;
export type Commanders = Array<string>;

const lastNamesOnPage: Players = [];
const lastCommandersOnPage: Commanders = [];

function main() {
  console.log("I MADE IT TO THE CONSOLE");

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

  // If there are no names on the page, the active page is probably the game start page
  if (namesOnPage.length !== 0) {
    const allNamesOnPageAreContained =
      lastNamesOnPage.join(",") === namesOnPage.join(",");
    const allCommandersAreContained =
      lastCommandersOnPage.join(",") === commandersOnPage.join(",");

    if (!allNamesOnPageAreContained || !allCommandersAreContained) {
      console.log("GOT IN HERE");
      console.log({
        action: "GET_PAGE_CONTENT",
        data: {
          namesOnPage: namesOnPage,
          commandersOnPage: commandersOnPage,
          sessionID: window.location.pathname,
        },
      });
      chrome.runtime.sendMessage({
        action: "GET_PAGE_CONTENT",
        data: {
          namesOnPage: namesOnPage,
          commandersOnPage: commandersOnPage,
          sessionID: window.location.pathname,
        },
      });
    }
  }

  console.log(namesOnPage);
}

// NOTE: Observer code to investigate and improve
// const observer = new MutationObserver((mutations) => {
//   console.log("I am looking for mutations in the DOM");
//   myTest(mutations);
// });
// const = targetNode = document.getElementsByClassName(".font-bold.truncate.leading-snug.text-sm")
// const config = {
//   childList: true,
//   attributes: true
// }
// observer.observe(targetNode, config)

main();
