import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  HighlightStyle,
  syntaxHighlighting,
  bracketMatching,
  indentOnInput,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { cpp } from "@codemirror/lang-cpp";
import { tags as t } from "@lezer/highlight";

/* 1. ТЕМА РЕДАКТОРА: кольори інтерфейсу */
const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "#0a1226",
      color: "#c9d4f2",
    },
    ".cm-content": {
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: "14px",
      caretColor: "#3b6cf5",
      padding: "20px 0",
    },
    ".cm-line": { padding: "0 24px 0 8px" },
    ".cm-scroller": { lineHeight: "24px" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "#5c6d96",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#0f1b3e" },
    ".cm-activeLineGutter": { backgroundColor: "#0f1b3e", color: "#a5b8ff" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor": { borderLeftColor: "#3b6cf5" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "#1b2d5c" },
  },
  { dark: true }
);

/* 2. ПІДСВІТКА СИНТАКСИСУ: кольори коду */
const highlight = HighlightStyle.define([
  { tag: t.comment, color: "#7384ad", fontStyle: "italic" },
  { tag: t.keyword, color: "#7aa2f7" },
  { tag: [t.typeName, t.standard(t.typeName)], color: "#5ec8e5" },
  { tag: [t.string, t.special(t.string)], color: "#9ece9a" },
  { tag: [t.number, t.bool, t.null], color: "#f0b27a" },
  { tag: [t.processingInstruction, t.meta], color: "#b494f5" },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: "#a5b8ff",
  },
]);

/* 3. ПОЧАТКОВИЙ КОД */
const startCode = `// Blink + Wi-Fi status
#include <WiFi.h>

const int LED_PIN = 2;
const char* SSID = "my-network";

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  WiFi.begin(SSID, "password");
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
  Serial.println(WiFi.status());
}
`;

/* 4. СТВОРЕННЯ РЕДАКТОРА */
const view = new EditorView({
  parent: document.querySelector("#editor"),
  state: EditorState.create({
    doc: startCode,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      cpp(),
      syntaxHighlighting(highlight),
      theme,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
    ],
  }),
});

/* 5. ДОСТУП ДО КОДУ (знадобиться для кнопки Compile) */
function getCode() {
  return view.state.doc.toString();
}

/* 6. КНОПКА TOOLS ВІДКРИВАЄ ВІКНО НАЛАШТУВАНЬ */
const toolsDialog = document.querySelector("#tools-dialog");
document.querySelector("#btn-tools").addEventListener("click", () => {
  toolsDialog.showModal();
});

// Тимчасова перевірка: виведемо довжину коду в консоль браузера
console.log("Код у редакторі, символів:", getCode().length);