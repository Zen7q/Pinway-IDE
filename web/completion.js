import core from "./data/arduino-core.json";

/* 1. СТАН: яка плата вибрана і які команди додали бібліотеки */
let currentFamily = "esp32";
const libraryEntries = new Map();

export function setBoardFamily(family) {
  currentFamily = family;
}

export function setLibraryEntries(libraryName, entries) {
  libraryEntries.set(libraryName, entries);
}

export function removeLibraryEntries(libraryName) {
  libraryEntries.delete(libraryName);
}

/* 2. ПЕРЕТВОРЕННЯ: запис із JSON у формат CodeMirror */
function toCompletion(entry) {
  return {
    label: entry.label,
    type: entry.type,
    detail: entry.detail,
    info: entry.info,
  };
}

/* 3. ФІЛЬТР: чи підходить команда до поточної плати */
function matchesBoard(entry) {
  return entry.boards.includes("all") || entry.boards.includes(currentFamily);
}

/* 4. ДЖЕРЕЛО ПІДКАЗОК: CodeMirror викликає цю функцію під час набору */
export function arduinoCompletions(context) {
  const word = context.matchBefore(/[\w.]*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }

  const fromLibraries = [...libraryEntries.values()].flat();
  const options = [...core, ...fromLibraries]
    .filter(matchesBoard)
    .map(toCompletion);

  return {
    from: word.from,
    options,
    validFor: /^[\w.]*$/,
  };
}