import mockIndex from "./data/mock-libraries.json";
import { setLibraryEntries, removeLibraryEntries } from "./completion.js";

const STORAGE_KEY = "pinway.libraries";

let added = loadAdded();
let hooks = { onAdd() {}, onRemove() {} };

/* 1. ЗБЕРЕЖЕННЯ: список доданих бібліотек у браузері */
function loadAdded() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAdded() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(added));
  } catch {
    // сховище може бути недоступне (приватний режим), це не критично
  }
}

/* 2. ДАНІ: пошук і перевірки */
function searchLibraries(query) {
  const q = query.trim().toLowerCase();
  if (!q) return mockIndex;
  return mockIndex.filter(
    (lib) =>
      lib.name.toLowerCase().includes(q) ||
      lib.author.toLowerCase().includes(q) ||
      lib.description.toLowerCase().includes(q)
  );
}

function isAdded(name) {
  return added.some((item) => item.name === name);
}

function findLibrary(name) {
  return mockIndex.find((lib) => lib.name === name);
}

/* 3. ДІЇ: додати й прибрати */
function addLibrary(lib) {
  if (isAdded(lib.name)) return;
  added.push({ name: lib.name, version: lib.version });
  setLibraryEntries(lib.name, lib.entries);
  saveAdded();
  hooks.onAdd(lib);
  renderAll();
}

function removeLibrary(name) {
  added = added.filter((item) => item.name !== name);
  removeLibraryEntries(name);
  saveAdded();
  hooks.onRemove(findLibrary(name));
  renderAll();
}

/* 4. МАЛЮВАННЯ: створюємо елементи через textContent, не через innerHTML */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderItem(lib) {
  const li = el("li", "lib-item");
  const info = el("div", "lib-info");

  const title = el("div");
  title.append(
    el("span", "lib-name", lib.name),
    " ",
    el("span", "lib-version", "v" + lib.version)
  );
  info.append(
    title,
    el("p", "lib-desc", lib.description),
    el("div", "lib-meta", "by " + lib.author)
  );

  const button = el("button", "", isAdded(lib.name) ? "Remove" : "Add");
  button.type = "button";
  button.addEventListener("click", () => {
    if (isAdded(lib.name)) {
      removeLibrary(lib.name);
    } else {
      addLibrary(lib);
    }
  });

  li.append(info, button);
  return li;
}

function renderResults() {
  const list = document.querySelector("#lib-results");
  const input = document.querySelector("#lib-search");
  const results = searchLibraries(input.value);

  if (results.length === 0) {
    list.replaceChildren(el("li", "lib-empty", "No libraries found"));
    return;
  }
  list.replaceChildren(...results.map(renderItem));
}

function renderAdded() {
  const list = document.querySelector("#lib-added");
  const libs = added.map((item) => findLibrary(item.name)).filter(Boolean);

  if (libs.length === 0) {
    list.replaceChildren(el("li", "lib-empty", "Nothing added yet"));
    return;
  }
  list.replaceChildren(...libs.map(renderItem));
}

function renderAll() {
  renderResults();
  renderAdded();
}

/* 5. ПУБЛІЧНІ ФУНКЦІЇ */
export function getAddedLibraries() {
  return added.map((item) => ({ ...item }));
}

export function initLibraries(callbacks = {}) {
  hooks = { ...hooks, ...callbacks };

  for (const item of added) {
    const lib = findLibrary(item.name);
    if (lib) setLibraryEntries(lib.name, lib.entries);
  }

  const dialog = document.querySelector("#libraries-dialog");
  const input = document.querySelector("#lib-search");

  document.querySelector("#btn-libraries").addEventListener("click", () => {
    renderAll();
    dialog.showModal();
  });

  input.addEventListener("input", renderResults);
}