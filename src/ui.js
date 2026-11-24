import {bindSidebarResize,refreshSidebarWidth,panelHeading} from './workspace-panels';
import { basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cpp } from '@codemirror/lang-cpp';
import { autocompletion, completeFromList } from '@codemirror/autocomplete';
import { setDiagnostics, lintGutter } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import completions from './arduino-completions.json';
import { pinouts } from './pinouts';
import { mountInstallation } from './installation';
import plotData from './plot-data.cjs';
const { parsePlotLine } = plotData;

const $ = id => document.getElementById(id);
const call = (action, data) => window.pinway.call(action, data);
const icon = name => {
  const el = document.createElement('span');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg><use href="#i-${name}"></use></svg>`;
  return el;
};
document.querySelectorAll('[data-icon]').forEach(el => el.append(icon(el.dataset.icon)));
function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function button(cls, text, fn) {
  const b = node('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}
const basename = p => p.split(/[\\/]/).at(-1);
const dirname = p => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))) || '/';
const files = new Map();
const folders = new Map();
const projectProfiles = new Map(Object.entries(JSON.parse(localStorage.getItem('pinway.projectProfiles') || '{}')));
const legacyOptions = JSON.parse(localStorage.getItem('pinway.options') || '{}');
const legacyBoard = localStorage.getItem('pinway.board') || '';
const favoriteBoards = new Set(JSON.parse(localStorage.getItem('pinway.favoriteBoards') || '[]'));
let manualBoard = null;
let catalogLoaded = false;
let autoPort = true;
let settings = new Map();
function saveProfile() {
  if (!project) return;
  if (board) settings.set(board.id, options);
  projectProfiles.set(project.primary, { board: manualBoard, options: Object.fromEntries(settings) });
  localStorage.setItem('pinway.projectProfiles', JSON.stringify(Object.fromEntries(projectProfiles)));
}
const preferences = { theme: 'system', accent: '#75dfbc', updates: true, fontSize: 13, wrap: true, autosave: false, restore: true, ...JSON.parse(localStorage.getItem('pinway.preferences') || '{}') };
if (!localStorage.getItem('pinway.accent-default.v2')) {
  if (preferences.accent.toLowerCase() === '#91baff') preferences.accent = '#75dfbc';
  localStorage.setItem('pinway.accent-default.v2', 'true');
}
const editorAppearance = new Compartment();
const editorWrapping = new Compartment();
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let autosaveTimer;
let discardDisplayOnClose = false;
let saveQueue = Promise.resolve();
function lightTheme() {
  return preferences.theme === 'light' || (preferences.theme === 'system' && !systemTheme.matches);
}
function editorTheme() {
  return [lightTheme() ? [] : oneDark, EditorView.theme({
    '&': { backgroundColor: 'var(--editor-bg)', color: 'var(--editor-text)', fontSize: preferences.fontSize + 'px' },
    '.cm-gutters': { backgroundColor: 'var(--editor-bg)', color: 'var(--sub)' },
    '.cm-content': { caretColor: 'var(--accent)' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--line-bg)' }
  })];
}
function applyPreferences() {
  const root = document.documentElement;
  root.dataset.theme = lightTheme() ? 'light' : 'dark';
  root.style.setProperty('--accent', preferences.accent);
  root.dataset.accent = preferences.accent.toLowerCase() === '#75dfbc' ? 'default' : 'custom';
  root.style.colorScheme = lightTheme() ? 'light' : 'dark';
  localStorage.setItem('pinway.preferences', JSON.stringify(preferences));
  for (const doc of files.values()) {
    const change = { effects: [editorAppearance.reconfigure(editorTheme()), editorWrapping.reconfigure(preferences.wrap ? EditorView.lineWrapping : [])] };
    if (editor && editor.state === doc.state) editor.dispatch(change);
    else doc.state = doc.state.update(change).state;
  }
  document.querySelectorAll('.accent-swatch').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === preferences.accent)));
}
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  if (!preferences.autosave || !project) return;
  const owner = project;
  autosaveTimer = setTimeout(() => {
    if (project !== owner || !preferences.autosave) return;
    if (task || changing) { scheduleAutosave(); return; }
    void save(true).catch(e => error(e, true));
  }, 1200);
}
systemTheme.addEventListener('change', () => applyPreferences());
const completionMode = new Compartment();
let project, recent = [], profiles = [], catalogState = '', board, options = {}, devicePort = '', devices = [], portMissing = false, chip = '';
let editor, activeFile, selectedFolder, report = [], buildSnapshots = new Map(), monitorPort = '';
let task = '', tab = 'console', changing = false, parent = '', pendingConsole = '', paint = 0;
let panelCollapsed = localStorage.getItem('pinway.panelCollapsed') === 'true';
const serialLines = [];
let serialTail = '';
let serialSize = 0;
const plotHistory = [];
const plotColors = ['#75dfbc', '#82b7ff', '#ffc47f', '#ef9cce', '#c4adff', '#cbe57b', '#70dce8', '#ffa9a5'];
let plotLegendKey = '';
let recoveryTimer;
let restoringSession = false;
let quittingSession = false;
let orphanDrafts = {};
let serialTime = '';
const serialClock = new Intl.DateTimeFormat('uk', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
});
let seen = new Set(), lastPorts = '', libraryResults = [], libraryVersions = {}, libraryBusy = false;

function rememberSession(includeDrafts = true) {
  clearTimeout(recoveryTimer);
  recoveryTimer = undefined;
  if (restoringSession || (quittingSession && includeDrafts)) return Promise.resolve();
  let snapshot = null;
  if (project) {
    const drafts = includeDrafts ? { ...orphanDrafts } : {};
    if (includeDrafts) {
      for (const [file, doc] of files) {
        if (isDirty(doc)) drafts[file] = { text: doc.state.sliceDoc(), base: doc.saved };
      }
    }
    snapshot = { primary: project.primary, active: activeFile, tabs: [...files.keys()], drafts };
  }
  return call('rememberSession', snapshot).catch(e => {
    error(Error('Не вдалося записати дані відновлення: ' + e.message), true);
  });
}
function scheduleRecovery() {
  if (restoringSession || recoveryTimer) return;
  recoveryTimer = setTimeout(() => void rememberSession(), 180);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && project) void rememberSession();
});

const zoomMin = 70;
const zoomMax = 150;
const zoomDefault = 100;
let zoomPercent = Number(localStorage.getItem('pinway.zoom')) || zoomDefault;

function setZoom(value) {
  zoomPercent = Math.max(zoomMin, Math.min(zoomMax, Math.round(value)));
  document.documentElement.style.setProperty('--window-point', 100 / zoomPercent + 'px');
  $('zoom-reset').textContent = zoomPercent + '%';
  $('zoom-out').disabled = zoomPercent === zoomMin;
  $('zoom-in').disabled = zoomPercent === zoomMax;
  localStorage.setItem('pinway.zoom', String(zoomPercent));
  return call('zoom', zoomPercent).catch(error);
}
const zoomActions = {
  zoomIn: () => setZoom(zoomPercent + 10),
  zoomOut: () => setZoom(zoomPercent - 10),
  zoomReset: () => setZoom(zoomDefault)
};

function status(message, kind = '') {
  $('status').textContent = message;
  $('status').title = message;
  $('status').dataset.kind = kind;
}
function append(channel, text) {
  if (channel === 'console') {
    pendingConsole += text;
  } else if (text) {
    const timestamp = serialClock.format(Date.now());
    const parts = text.split('\n');
    if (!serialTail) serialTime = timestamp;
    for (const part of parts.slice(0, -1)) {
      const line = (serialTail + part).replace(/\r$/, '').slice(-8192);
      serialLines.push({ time: serialTime, text: line });
      const sample = parsePlotLine(line);
      if (sample.length) {
        plotHistory.push(sample);
        if (plotHistory.length > 150) plotHistory.shift();
      }
      serialSize += line.length + 1;
      serialTail = '';
      serialTime = timestamp;
    }
    serialTail = (serialTail + parts.at(-1)).slice(-8192);
    let remove = 0;
    while (serialLines.length - remove > 2000 || serialSize > 400000) {
      serialSize -= serialLines[remove++].text.length + 1;
    }
    serialLines.splice(0, remove);
  }
  if (paint) return;
  paint = requestAnimationFrame(() => {
    paint = 0;
    if (pendingConsole) {
      const log = $('console-log');
      const follow = log.scrollHeight - log.scrollTop < log.clientHeight + 35;
      log.append(document.createTextNode(pendingConsole));
      if (follow) log.scrollTop = log.scrollHeight;
      pendingConsole = '';
    }
    if (tab === 'serial' && !panelCollapsed) renderSerial();
    if (tab === 'plot' && !panelCollapsed) renderPlot();
  });
}
function renderSerial() {
  const filter = $('serial-filter').value.toLowerCase();
  const stamps = $('serial-timestamps').checked;
  const log = $('serial-log');
  const follow = log.scrollHeight - log.scrollTop < log.clientHeight + 35;
  const lines = serialTail ? [...serialLines, { time: serialTime, text: serialTail }] : serialLines;
  log.textContent = lines.filter(line => line.text.toLowerCase().includes(filter))
    .map(line => (stamps ? line.time + '  ' : '') + line.text).join('\n').slice(-400000);
  if (follow) log.scrollTop = log.scrollHeight;
}
function renderPlot() {
  const canvas = $('plot-canvas');
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const labels = [...new Set(plotHistory.flatMap(sample => sample.map(point => point.label)))].slice(0, 8);
  $('plot-empty').hidden = labels.length > 0;
  const legendKey = labels.join('|');
  if (legendKey !== plotLegendKey) {
    plotLegendKey = legendKey;
    $('plot-legend').replaceChildren(...labels.map((label, index) => {
      const item = node('span', 'plot-key', label);
      item.style.setProperty('--series', plotColors[index]);
      return item;
    }));
  }
  const width = rect.width;
  const height = rect.height;
  const scale = window.devicePixelRatio;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  if (!labels.length || width < 80 || height < 34) return;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const points = plotHistory.flat().filter(point => labels.includes(point.label)).map(point => point.value);
  // Normalize before calculating the range so very large finite values do not overflow.
  const magnitude = Math.max(1, ...points.map(Math.abs));
  let min = Math.min(...points) / magnitude;
  let max = Math.max(...points) / magnitude;
  if (min === max) { min -= 0.05; max += 0.05; }
  const left = 58;
  const right = width - 12;
  const top = 9;
  const bottom = height - 10;
  const formatter = new Intl.NumberFormat('uk', { notation: 'compact', maximumFractionDigits: 2 });
  ctx.font = '10px monospace';
  for (let i = 0; i <= 3; i++) {
    const y = top + (bottom - top) * i / 3;
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue('--border').trim();
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--sub').trim();
    ctx.fillText(formatter.format((max - (max - min) * i / 3) * magnitude), 4, y + 3, left - 9);
  }
  for (const [series, label] of labels.entries()) {
    ctx.strokeStyle = ctx.fillStyle = plotColors[series];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let connected = false;
    const dots = [];
    for (const [index, sample] of plotHistory.entries()) {
      const value = sample.find(point => point.label === label)?.value;
      if (value === undefined) { connected = false; continue; }
      const x = plotHistory.length === 1 ? right : left + (right - left) * index / (plotHistory.length - 1);
      const y = bottom - (bottom - top) * (value / magnitude - min) / (max - min);
      if (connected) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      connected = true;
      dots.push([x, y]);
    }
    ctx.stroke();
    if (dots.length < 8) {
      for (const [x, y] of dots) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
new ResizeObserver(() => {
  if (tab === 'plot' && !panelCollapsed) renderPlot();
}).observe($('plot-area'));

function error(e, log = false) {
  status(e.message, 'error');
  if (log) append('console', '\n' + e.message + '\n');
}
function clearLog(name) {
  if (name === 'plot') {
    plotHistory.length = 0;
    renderPlot();
    return;
  }
  if (name === 'console') pendingConsole = '';
  else {
    serialLines.length = 0;
    serialSize = 0;
    serialTail = '';
    serialTime = '';
  }
  $(name + '-log').replaceChildren();
}
function showPanel(next) {
  tab = next;
  for (const name of ['console', 'serial', 'plot', 'problems']) {
    const expanded = name === next && !panelCollapsed;
    $(name + '-tab').classList.toggle('active', expanded);
    $(name + '-tab').setAttribute('aria-expanded', expanded);
  }
  $('panel').classList.toggle('collapsed', panelCollapsed);
  $('panel-content').hidden = $('split').hidden = panelCollapsed;
  $('panel-toggle').setAttribute('aria-expanded', !panelCollapsed);
  const label = panelCollapsed ? 'Розгорнути нижню панель' : 'Згорнути нижню панель';
  $('panel-toggle').setAttribute('aria-label', label);
  $('panel-toggle').title = label;
  $('console-log').hidden = next !== 'console';
  $('problems-log').hidden = next !== 'problems';
  $('serial-view').hidden = next !== 'serial';
  $('plot-view').hidden = next !== 'plot';
  $('serial-controls').hidden = panelCollapsed || next !== 'serial';
  $('clear').hidden = panelCollapsed || next === 'problems';
  if (!panelCollapsed && next === 'serial') renderSerial();
  if (!panelCollapsed && next === 'plot') renderPlot();
  if (!panelCollapsed && next === 'console') $('console-log').scrollTop = $('console-log').scrollHeight;
}
function togglePanel(next = tab) {
  panelCollapsed = next === tab && !panelCollapsed;
  localStorage.setItem('pinway.panelCollapsed', String(panelCollapsed));
  showPanel(next);
}
function renderProblems() {
  const count = $('problem-count');
  count.hidden = !report.length;
  count.textContent = String(report.length);
  const list = $('problems-log');
  list.replaceChildren();
  if (!report.length) list.append(node('p', 'problem-empty', 'Немає помилок чи попереджень. Натисніть «Перевірити», щоб зібрати скетч.'));
  for (const problem of report) {
    const kind = problem.severity === 'warning' ? 'Попередження' : 'Помилка';
    const item = button('problem-row', '', () => void openFile(problem.file, problem).catch(error));
    const badge = node('span', 'problem-kind', kind);
    badge.dataset.severity = problem.severity;
    const detail = node('span', 'problem-detail');
    detail.append(node('strong', '', problem.message),
      node('small', '', problem.file.slice(project.root.length + 1) + ':' + problem.line + ':' + problem.column));
    item.append(badge, detail);
    list.append(item);
  }
}
function renderRecent() {
  $('recent-count').textContent = String(recent.length).padStart(2, '0');
  const list = $('recent-list');
  list.replaceChildren();
  if (!recent.length) list.append(node('div', 'recent-empty', 'Відкриті скетчі з’являться тут. Щоб почати, створіть проєкт або відкрийте файл .ino.'));
  for (const item of recent) {
    const row = button('recent-row', '', () => changeProject(() => call('reopen', item.primary)));
    const info = node('div');
    info.append(node('strong', '', item.name), node('small', '', item.root));
    row.append(icon('folder'), info, node('span', 'spacer'), icon('chevron'));
    row.title = item.root;
    list.append(row);
  }
}
function isDirty(doc) { return doc.state.sliceDoc() !== doc.saved; }
function renderTabs() {
  $('tabs').replaceChildren();
  for (const [file, doc] of files) {
    const name = button('file-tab' + (file === activeFile ? ' active' : ''), '', () => void openFile(file).catch(error));
    const changed = node('span', 'dirty-dot');
    changed.hidden = !isDirty(doc);
    changed.title = 'Незбережені зміни';
    name.append(icon('code'), node('span', '', basename(file)), changed);
    name.title = file;
    name.setAttribute('aria-current', file === activeFile ? 'true' : 'false');
    $('tabs').append(name);
  }
}
async function loadFolder(dir) { folders.set(dir, await call('children', dir)); }
function renderTree() {
  const root = $('tree');
  $('root-select').classList.toggle('active', selectedFolder === project?.root);
  function group(dir) {
    const fragment = document.createDocumentFragment();
    for (const child of folders.get(dir) || []) {
      const selected = child.folder ? child.path === selectedFolder : child.path === activeFile;
      const row = button('tree-node' + (selected ? ' active' : ''), '', async () => {
        try {
          if (!child.folder) return await openFile(child.path);
          selectedFolder = child.path;
          if (folders.has(child.path)) {
            for (const p of folders.keys()) if (p === child.path || p.startsWith(child.path + '/') || p.startsWith(child.path + '\\')) folders.delete(p);
          } else await loadFolder(child.path);
          renderTree();
        } catch (e) { error(e); }
      });
      row.title = child.path;
      row.disabled = !child.folder && !child.editable;
      row.append(icon(child.folder ? folders.has(child.path) ? 'down' : 'chevron' : 'code'), node('span', '', child.name));
      if (child.folder) row.setAttribute('aria-expanded', folders.has(child.path));
      fragment.append(row);
      if (child.folder && folders.has(child.path)) {
        const nested = node('div', 'tree-indent');
        nested.append(group(child.path));
        fragment.append(nested);
      }
    }
    return fragment;
  }
  root.replaceChildren(project ? group(project.root) : '');
}
function cursor(state) {
  const position = state.selection.main.head;
  const line = state.doc.lineAt(position);
  $('cursor').textContent = `Ряд ${line.number}, стовп. ${position - line.from + 1}`;
}
function activeChip() { return board?.id.startsWith('esp32:') ? 'esp32' : board ? 'avr' : ''; }
function arduinoComplete() {
  const general = activeChip();
  const available = completions.filter(x => x.boards.includes('all') || x.boards.includes(general));
  return autocompletion({ override: [context => {
    const member = context.matchBefore(/\b(?:Serial|Wire|SPI|WiFi)\.[A-Za-z_0-9]*/);
    if (member) {
      const dot = member.text.indexOf('.');
      const prefix = member.text.slice(0, dot + 1);
      const matches = available.filter(x => x.label.startsWith(prefix)).map(x => ({ ...x, label: x.label.slice(prefix.length) }));
      return { from: member.from + prefix.length, options: matches, validFor: /^\w*$/ };
    }
    return completeFromList(available.filter(x => !x.label.includes('.')))(context);
  }] });
}
function createState(file, content) {
  return EditorState.create({
    doc: content,
    extensions: [
      basicSetup, editorAppearance.of(editorTheme()), EditorState.lineSeparator.of(content.includes('\r\n') ? '\r\n' : '\n'),
      ...(/\.(ino|pde|c|cc|cpp|cxx|h|hh|hpp)$/i.test(file) ? [cpp(), completionMode.of(arduinoComplete())] : []),
      lintGutter(), editorWrapping.of(preferences.wrap ? EditorView.lineWrapping : []),
      EditorView.updateListener.of(update => {
        const doc = files.get(file);
        if (!doc) return;
        const wasDirty = isDirty(doc);
        doc.state = update.state;
        if (activeFile === file) {
          if (update.docChanged && wasDirty !== isDirty(doc)) renderTabs();
          if (update.docChanged || update.selectionSet) cursor(update.state);
          if (update.docChanged) { scheduleRecovery(); scheduleAutosave(); void display.refreshCode(); }
        }
      })
    ]
  });
}
function showDiagnostics() {
  if (!editor || !activeFile) return;
  const doc = editor.state.doc;
  const marks = buildSnapshots.get(activeFile) === editor.state.sliceDoc() ? report.filter(d => d.file === activeFile && d.line > 0 && d.line <= doc.lines).map(d => {
    const line = doc.line(d.line);
    const from = Math.min(line.to, line.from + Math.max(0, d.column - 1));
    return { from, to: Math.min(line.to, from + 1), severity: d.severity, message: d.message };
  }) : [];
  editor.dispatch(setDiagnostics(editor.state, marks));
}
let openTicket = 0;
async function openFile(file, location) {
  if (!project) return;
  const owner = project;
  const ticket = ++openTicket;
  let doc = files.get(file);
  if (!doc) {
    const content = await call('read', file);
    if (owner !== project || ticket !== openTicket) return;
    doc = { state: createState(file, content), saved: content };
    files.set(file, doc);
  }
  activeFile = file;
  selectedFolder = dirname(file);
  if (!editor) editor = new EditorView({ state: doc.state, parent: $('editor') });
  else editor.setState(doc.state);
  if (/\.(ino|pde|c|cc|cpp|cxx|h|hh|hpp)$/i.test(file)) editor.dispatch({ effects: completionMode.reconfigure(arduinoComplete()) });
  $('breadcrumb').textContent = [project.name, ...file.slice(project.root.length + 1).split(/[\\/]/)].join('  ›  ');
  if (location) {
    const doc = editor.state.doc;
    const line = doc.line(Math.min(doc.lines, Math.max(1, location.line)));
    const head = Math.min(line.to, line.from + Math.max(0, location.column - 1));
    editor.dispatch({ selection: { anchor: head }, effects: EditorView.scrollIntoView(head, { y: 'center' }) });
  }
  cursor(editor.state);
  showDiagnostics();
  renderTree();
  renderTabs();
  editor.focus();
  scheduleRecovery();
}
function save(all = false) {
  const owner = project;
  const pending = saveQueue.then(() => {
    if (project !== owner) return;
    return persistFiles(all);
  });
  saveQueue = pending.catch(() => {});
  return pending;
}
async function persistFiles(all) {
  if (!project) return;
  for (const [file, doc] of files) {
    if ((!all && file !== activeFile) || !isDirty(doc)) continue;
    const next = doc.state.sliceDoc();
    await call('write', { file, content: next });
    doc.saved = next;
  }
  await display.save();
  renderTabs();
  await rememberSession();
}
async function canClose() {
  discardDisplayOnClose = false;
  if (![...files.values()].some(isDirty) && !display.dirty) return true;
  const choice = await call('dirtyPrompt');
  if (choice === 2) return false;
  if (choice === 0) await save(true);
  else discardDisplayOnClose = true;
  return true;
}
async function acceptProject(value, session) {
  if (discardDisplayOnClose) { display.discardChanges(); discardDisplayOnClose = false; }
  clearTimeout(recoveryTimer);
  recoveryTimer = undefined;
  restoringSession = !!session;
  orphanDrafts = {};
  clearTimeout(autosaveTimer);
  project = value;
  const saved = value && projectProfiles.get(value.primary);
  settings = new Map(Object.entries(structuredClone(saved?.options || legacyOptions)));
  board = null;
  const selected = saved ? saved.board : value && profiles.find(p => p.id === legacyBoard);
  manualBoard = selected || null;
  setBoard(manualBoard, false);
  selectedFolder = value?.root;
  showSidebar('files-panel');
  editor?.destroy();
  editor = activeFile = undefined;
  files.clear();
  folders.clear();
  report = [];
  renderProblems();
  buildSnapshots.clear();
  clearLog('console');
  clearLog('serial');
  clearLog('plot');
  seen.clear();
  devicePort = '';
  autoPort = true;
  chip = '';
  portMissing = false;
  closeMenus();
  $('welcome').hidden = !!value;
  for (const x of ['workbench', 'toolbar', 'home', 'device-status', 'cursor', 'encoding']) $(x).hidden = !value;
  $('version').hidden = !!value;
  $('caption').textContent = value ? value.name : '';
  if (value) {
    layoutSidebar();
    $('root-label').textContent = basename(value.root);
    $('root-label').title = value.root;
    showPanel('console');
    append('console', 'Готово до збірки.\n');
    renderPorts();
    let conflicts = 0;
    let recovered = 0;
    try {
      await loadFolder(value.root);
      if (session) {
        const drafts = session.drafts || {};
        const tabs = new Set([...(session.tabs || []), ...Object.keys(drafts)]);
        for (const file of tabs) {
          const draft = drafts[file];
          try {
            const savedContent = await call('read', file);
            const text = draft?.text ?? savedContent;
            files.set(file, { state: createState(file, text), saved: savedContent });
            if (text !== savedContent) {
              recovered++;
              if (draft.base !== savedContent) conflicts++;
            }
          } catch {
            if (draft) orphanDrafts[file] = draft;
          }
        }
        const active = files.has(session.active) ? session.active : value.selected;
        await openFile(active);
      } else {
        await openFile(value.selected);
      }
    } finally {
      restoringSession = false;
    }
    await rememberSession();
    if (Object.keys(orphanDrafts).length) {
      status('Деякі файли відсутні. Їхні чернетки залишено в даних відновлення.', 'error');
    } else if (conflicts) {
      status('Відновлено чернетки. Деякі файли змінено на диску, перевірте їх перед збереженням.', 'error');
    } else if (recovered) {
      status('Відновлено незбережені зміни', 'success');
    } else {
      status('Проєкт відкрито', 'success');
    }
  } else {
    await rememberSession();
    const state = await call('state');
    recent = state.recent;
    renderRecent();
    status('Готово');
  }
  await designer.setProject(installation.has('build') ? value : null);
  await display.setProject(installation.has('display') ? value : null);
  if (!value) {
    await designer.activate(false);
    display.activate(false);
    $('workspace-toggle').querySelector('span').textContent = 'Pinway Code';
    for (const button of workspaceSwitch.querySelectorAll('[data-workspace]')) button.querySelector('.workspace-check').textContent = button.dataset.workspace === 'code' ? '✓' : '';
    workspaceClose();
    $('welcome').hidden = false;
  } else {
    if (designer.active) await designer.activate(true);
    if (display.active) display.activate(true);
  }
}
async function changeProject(action) {
  if (changing || task) return false;
  changing = true;
  try {
    if (!await canClose()) return false;
    await designer.flushProject();
    const value = await action();
    if (value !== undefined) await acceptProject(value);
    return value !== undefined;
  } catch (e) { error(e); return false; }
  finally { changing = false; }
}
function newDialog() {
  if (changing || task || $('new-dialog').open || $('entry-dialog').open) return;
  parent = '';
  $('new-form').reset();
  $('parent-label').textContent = 'Папку не вибрано';
  $('new-error').hidden = true;
  $('new-dialog').showModal();
}

function closeMenus() {
  closeToolsPicker();
  for (const name of ['board', 'tools']) {
    $(name + '-menu').hidden = true;
    $(name + '-button').setAttribute('aria-expanded', 'false');
  }
}
function toggleMenu(name) {
  const menu = $(name + '-menu');
  const opened = menu.hidden;
  closeMenus();
  if (!opened) return;
  if (name === 'tools') renderTools();
  else {
    $('board-query').value = '';
    renderBoardPort();
    renderBoards();
  }
  menu.hidden = false;
  $(name + '-button').setAttribute('aria-expanded', 'true');
  if (name === 'board') $('board-query').focus();
}
function groupLabel(menu, text) { menu.append(node('h3', '', text)); }
function setBoard(next, persist = true) {
  if (board?.id) settings.set(board.id, options);
  board = next || null;
  options = board ? { ...settings.get(board.id) } : {};
  $('board-label').textContent = board?.name || 'Вибрати плату';
  if (editor && /\.(ino|pde|c|cc|cpp|cxx|h|hh|hpp)$/i.test(activeFile)) {
    editor.dispatch({ effects: completionMode.reconfigure(arduinoComplete()) });
  }
  if (!board) {
    optsFor = optionError = '';
    optionRows = [];
  }
  if (persist) saveProfile();
  if (!$('tools-menu').hidden) renderTools();
  if (!$('board-menu').hidden) renderBoards();
  void fetchOptions();
}
let optsFor = '', optionRows = [], optionError = '';
async function fetchOptions() {
  const selected = board?.id;
  if (!selected || selected === optsFor) return;
  optsFor = selected;
  optionRows = [];
  optionError = 'Завантаження параметрів…';
  try {
    const result = await call('details', selected);
    if (board?.id !== selected) return;
    optionRows = result;
    optionError = '';
  } catch (e) {
    if (board?.id !== selected) return;
    optionError = e.message;
    optsFor = '';
  }
  if (!$('tools-menu').hidden) renderTools();
}
function deviceName(device) {
  return device.board?.name || 'Послідовний USB-пристрій';
}
function renderBoards() {
  const tokens = $('board-query').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = profiles.filter(p => {
    const label = (p.name + ' ' + p.id).toLowerCase();
    return tokens.every(token => label.includes(token));
  });
  const menu = $('board-results');
  const fragment = document.createDocumentFragment();
  function addGroup(title, boards) {
    if (!boards.length) return;
    if (title) groupLabel(fragment, title);
    for (const p of boards) {
      const item = node('div', 'board-item');
      const choice = button('menu-row board-choice', p.name, () => {
        manualBoard = p;
        setBoard(p);
        closeMenus();
        $('board-button').focus();
        status('Профіль: ' + p.name);
      });
      choice.setAttribute('aria-pressed', String(board?.id === p.id));
      const favorite = button('icon-button board-favorite', '', () => {
        if (!favoriteBoards.delete(p.id)) favoriteBoards.add(p.id);
        localStorage.setItem('pinway.favoriteBoards', JSON.stringify([...favoriteBoards]));
        renderBoards();
        [...menu.querySelectorAll('.board-favorite')].find(button => button.dataset.board === p.id)?.focus();
      });
      favorite.dataset.board = p.id;
      const saved = favoriteBoards.has(p.id);
      favorite.setAttribute('aria-pressed', String(saved));
      favorite.setAttribute('aria-label', 'Улюблена плата: ' + p.name);
      favorite.title = saved ? 'Видалити з улюблених' : 'Додати до улюблених';
      favorite.append(icon('star'));
      item.append(choice, favorite);
      fragment.append(item);
    }
  }
  const favorites = matches.filter(p => favoriteBoards.has(p.id));
  addGroup('Улюблені', favorites);
  addGroup(favorites.length ? 'Інші плати' : '', matches.filter(p => !favoriteBoards.has(p.id)));
  const addPacks = button('button board-install', installation.has('esp32') ? 'Керувати пакетами плат…' : 'Встановити пакет ESP32…', () => {
    closeMenus();
    if (installation.has('esp32')) $('settings-view').click(); else void installation.offer('esp32');
  });
  fragment.append(addPacks);
  menu.replaceChildren(fragment);
  menu.scrollTop = 0;
  $('board-catalog').textContent = catalogState || (matches.length ? String(matches.length) + ' профілів' : 'Плат не знайдено.');
}
function setPort(port) {
  if (port !== devicePort) chip = '';
  devicePort = port;
  portMissing = false;
  if (port) seen.add(port);
  renderPorts();
}
const toolsPicker = node('div', 'tools-picker');
toolsPicker.id = 'tools-picker';
toolsPicker.hidden = true;
toolsPicker.setAttribute('role', 'listbox');
document.body.append(toolsPicker);
let pickerTrigger;

function closeToolsPicker(restoreFocus = false) {
  if (!pickerTrigger) return;
  pickerTrigger.setAttribute('aria-expanded', 'false');
  if (restoreFocus) pickerTrigger.focus();
  toolsPicker.hidden = true;
  pickerTrigger = null;
}

function toolsField(label, name, choices, selected, onChange) {
  const field = node('div', 'tools-field');
  const value = node('span', 'tools-value');
  const trigger = button('tools-select', '', () => {
    const alreadyOpen = pickerTrigger === trigger;
    closeToolsPicker();
    if (alreadyOpen) return;
    pickerTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    toolsPicker.setAttribute('aria-label', name);
    const rows = choices.map(choice => {
      const row = button('tools-option', '', () => {
        closeToolsPicker(true);
        if (choice.value === selected) return;
        choose(choice);
        onChange(choice.value);
      });
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(choice.value === selected));
      row.append(node('span', '', choice.label), icon('check'));
      return row;
    });
    toolsPicker.replaceChildren(...rows);
    toolsPicker.hidden = false;
    const rect = trigger.getBoundingClientRect();
    const below = innerHeight - rect.bottom - 10;
    const above = rect.top - 10;
    const width = Math.min(innerWidth - 16, Math.max(220, rect.width));
    toolsPicker.style.width = width + 'px';
    const openAbove = below < Math.min(toolsPicker.scrollHeight, 260) && above > below;
    toolsPicker.style.left = Math.max(8, rect.right - width) + 'px';
    toolsPicker.style.maxHeight = Math.min(openAbove ? above : below, 310) + 'px';
    toolsPicker.style.top = openAbove ? 'auto' : rect.bottom + 4 + 'px';
    toolsPicker.style.bottom = openAbove ? innerHeight - rect.top + 4 + 'px' : 'auto';
    (rows.find(row => row.getAttribute('aria-selected') === 'true') || rows[0])?.focus();
  });
  function choose(choice) {
    selected = choice?.value;
    value.textContent = choice?.label || 'Не вибрано';
    trigger.title = value.textContent;
  }
  choose(choices.find(choice => choice.value === selected) || choices[0]);
  trigger.disabled = !!task || !choices.length;
  trigger.setAttribute('aria-label', name);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', toolsPicker.id);
  trigger.append(value, icon('down'));
  trigger.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    trigger.click();
  });
  field.append(node('span', '', label), trigger);
  return field;
}

toolsPicker.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    closeToolsPicker(true);
    return;
  }
  const rows = [...toolsPicker.children];
  const index = rows.indexOf(document.activeElement);
  const targets = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: rows.length - 1 };
  if (!Object.hasOwn(targets, e.key)) return;
  e.preventDefault();
  rows[Math.max(0, Math.min(rows.length - 1, targets[e.key]))]?.focus();
});

function portField(label) {
  const ports = [{ label: 'Не вибрано', value: '' }, ...devices.map(d => ({
    label: basename(d.address) + ' · ' + deviceName(d), value: d.address
  }))];
  return toolsField(label, 'Послідовний порт', ports, devicePort, port => {
    const device = devices.find(d => d.address === port);
    autoPort = !!device;
    if (device) void detect(device);
    else {
      setPort('');
      if (!manualBoard) setBoard(null, false);
    }
  });
}
function renderBoardPort() {
  const container = $('board-port');
  const focused = container.contains(document.activeElement);
  if (pickerTrigger && container.contains(pickerTrigger)) closeToolsPicker();
  container.replaceChildren(portField('Порт USB'));
  if (focused) (container.querySelector('button:not(:disabled)') || $('board-query')).focus();
}
function renderTools() {
  closeToolsPicker();
  const menu = $('tools-menu');
  menu.replaceChildren();
  const pins = button('menu-row pin-menu-action', '', openPins);
  pins.append(icon('pins'), node('span', '', 'Карта пінів'));
  menu.append(pins, node('hr'));
  groupLabel(menu, 'Порт');
  menu.append(portField('USB'), node('hr'));
  groupLabel(menu, 'Параметри плати');
  if (!board) menu.append(node('p', '', 'Виберіть профіль плати.'));
  else if (optionError) menu.append(node('p', '', optionError));
  else if (!optionRows.length) menu.append(node('p', '', 'Цей профіль не має додаткових параметрів.'));
  for (const option of optionRows) {
    const choices = option.values.map(v => ({ label: v.value_label, value: v.value }));
    const selected = options[option.option] || option.values.find(v => v.selected)?.value;
    menu.append(toolsField(option.option_label, option.option_label, choices, selected, value => {
      options[option.option] = value;
      saveProfile();
    }));
  }
}
function renderPorts() {
  const alerts = $('alerts');
  alerts.replaceChildren();
  for (const d of devices.filter(d => !seen.has(d.address))) {
    const row = node('div', 'notice');
    const info = node('div');
    info.append(node('strong', '', 'Виявлено ' + deviceName(d)), node('small', '', basename(d.address)));
    const connect = button('button compact', 'Підключити', () => void detect(d));
    connect.disabled = !!task;
    const dismiss = button('icon-button', '', () => { seen.add(d.address); renderPorts(); });
    dismiss.append(icon('x'));
    dismiss.setAttribute('aria-label', 'Приховати сповіщення для ' + basename(d.address));
    row.append(icon('usb'), info, connect, dismiss);
    alerts.append(row);
  }
  alerts.hidden = !alerts.firstChild;
  $('device-status').classList.toggle('connected', !!devicePort);
  $('port-label').textContent = devicePort ? basename(devicePort) + (chip ? ' · ' + chip : '') : portMissing ? 'Порт від’єднано' : 'Порт не вибрано';
  $('device-status').title = devicePort;
  $('serial-toggle').disabled = !!task || (!devicePort && !monitorPort);
  $('serial-toggle').textContent = monitorPort ? 'Закрити порт' : 'Відкрити порт';
  $('plot-monitor').disabled = $('serial-toggle').disabled;
  $('plot-monitor').textContent = $('serial-toggle').textContent;
  $('baud').disabled = !!monitorPort;
  $('serial-command').disabled = $('serial-send-button').disabled = !monitorPort || !!task;
  if (!$('board-menu').hidden) renderBoardPort();
  if (!$('tools-menu').hidden) renderTools();
}
function setTask(value) {
  task = value;
  $('verify').disabled = $('upload').disabled = $('home').disabled = !!value;
  renderPorts();
}
async function detect(device) {
  if (task || !project) return;
  if (!manualBoard && device.address !== devicePort) setBoard(null, false);
  setPort(device.address);
  if (manualBoard) return;
  const attachedBoard = device.board;
  if (attachedBoard) {
    if (!profiles.some(p => p.id === attachedBoard.id)) profiles.unshift(attachedBoard);
    setBoard(profiles.find(p => p.id === attachedBoard.id), false);
    status('Вибрано плату: ' + attachedBoard.name, 'success');
    return;
  }
  if (monitorPort) return;
  setTask('probe');
  status('Визначення чипа: ' + basename(device.address) + '…');
  try {
    const found = await call('probe', device.address);
    if (devicePort !== device.address || !devices.some(d => d.key === device.key)) return;
    chip = found.chip || '';
    if (found.needsPack) { status('Для визначення ESP встановіть пакет ESP32 у налаштуваннях.'); return; }
    if (manualBoard) return;
    const genericId = chip ? 'esp32:esp32:' + chip.toLowerCase().replace('-', '') : '';
    const selected = profiles.find(p => p.id === (found.board?.id || genericId));
    setBoard(selected, false);
    status(selected ? 'Вибрано плату: ' + selected.name
      : chip ? 'Чип ' + chip + ' · виберіть профіль плати' : 'Модель не визначено. Виберіть профіль плати.',
    selected ? 'success' : undefined);
  } catch (e) { error(e, true); }
  finally { setTask(''); }
}
async function poll() {
  if (task === 'pack' || document.hidden) { setTimeout(poll, 5000); return; }
  try {
    const found = await call('ports');
    const fingerprint = JSON.stringify(found);
    if (fingerprint !== lastPorts) {
      lastPorts = fingerprint;
      const previous = new Map(devices.map(d => [d.address, d.key]));
      devices = found;
      const sameDevice = address => devices.some(dev => dev.address === address && dev.key === previous.get(address));
      for (const address of seen) if (!sameDevice(address)) seen.delete(address);
      if (devicePort && !sameDevice(devicePort)) {
        const old = devicePort;
        devicePort = '';
        chip = '';
        portMissing = true;
        if (!manualBoard) setBoard(null, false);
        append('console', '\nПорт від’єднано: ' + old + '\n');
        if (!task) status('Порт від’єднано. Редагування доступне.');
      }
      if (project) renderPorts();
    }
    if (project && !changing && !task && !devicePort && autoPort && catalogLoaded) {
      const candidates = devices.filter(d => d.usb);
      if (candidates.length === 1 && !seen.has(candidates[0].address)) void detect(candidates[0]);
    }
  } catch (e) {
    if (!task && lastPorts !== 'error') status(e.message, 'error');
    lastPorts = 'error';
  } finally { setTimeout(poll, project ? 2500 : 10000); }
}
async function build(upload) {
  if (task || changing || !project) return;
  showPanel('console');
  if (!board) { if ($('board-menu').hidden) toggleMenu('board'); return error(Error('Виберіть профіль плати у шапці.'), true); }
  if (upload && !devicePort) { if ($('tools-menu').hidden) toggleMenu('tools'); return error(Error('Виберіть підключений порт у Tools.'), true); }
  if (board.id.startsWith('esp32:') && !installation.has('esp32')) { await installation.offer('esp32'); return; }
  let layout;
  changing = true;
  try { layout = await call('display', { op: 'load', root: project.root }); }
  catch (e) { error(e, true); return; }
  finally { changing = false; }
  if (layout?.hardware && !installation.has('display')) { await installation.offer('display'); return; }
  if (layout?.hardware) {
    changing = true;
    try { await loadWorkspace('display'); }
    catch (e) { error(e, true); return; }
    finally { changing = false; }
  }
  const selection = { upload, board: board.id, options: { ...options }, port: devicePort };
  closeMenus();
  setTask('build');
  status(upload ? 'Підготовка до завантаження…' : 'Компіляція…');
  clearLog('console');
  report = [];
  renderProblems();
  showDiagnostics();
  try {
    selection.display = installation.has('display') ? await display.prepareBuild() : null;
    await save(true);
    buildSnapshots = new Map([...files].map(([k, v]) => [k, v.saved]));
    const result = await call('build', selection);
    await loadFolder(project.root);renderTree();
    if(result.generatedConflicts)display.showGenerationConflicts(result.generatedConflicts);
    report = result.diagnostics;
    renderProblems();
    // Apply diagnostics to files that haven't been opened yet as well.
    for (const file of new Set(report.map(d => d.file))) {
      if (!buildSnapshots.has(file)) {
        try { buildSnapshots.set(file, await call('read', file)); } catch { /* external file removed */ }
      }
    }
    showDiagnostics();
    append('console', '\n' + result.message + '\n');
    status(result.message, result.ok ? 'success' : 'error');
  } catch (e) { error(e, true); }
  finally { setTask(''); }
}
async function toggleSerial() {
  if (task) return;
  try {
    if (monitorPort) await call('serialClose');
    else {
      const port = devicePort;
      if (!port) return;
      append('serial', '› ' + port + ' · ' + $('baud').value + ' бод\n');
      await call('serialOpen', { port, baud: Number($('baud').value) });
    }
  } catch (e) { append('serial', e.message + '\n'); error(e); }
}
function renderLibraries(list) {
  const area = $('library-results');
  area.replaceChildren();
  for (const item of list) {
    const row = node('div', 'library-row');
    const main = node('div');
    const installed = libraryVersions[item.name];
    main.append(node('strong', '', item.name), node('p', '', item.description || item.author || ''));
    row.append(main);
    if (installed) {
      main.append(node('small', '', 'Встановлено: ' + installed));
    } else {
      const action = button('button compact', 'Встановити' + (item.version ? ' ' + item.version : ''), () => void install(item.name));
      action.disabled = libraryBusy || !!task;
      row.append(action);
    }
    area.append(row);
  }
}
function showSidebar(panel) {
  $('sidebar-split').hidden = !panel;
  for (const id of ['files-view', 'libraries-view']) {
    const control = $(id);
    const target = control.getAttribute('aria-controls');
    const expanded = target === panel;
    $(target).hidden = !expanded;
    control.setAttribute('aria-expanded', expanded);
  }
}
function toggleSidebar(control) {
  const panel = control.getAttribute('aria-controls');
  const opening = $(panel).hidden;
  showSidebar(opening ? panel : null);
  if (opening && panel === 'libraries') void openLibraries();
}
async function openLibraries() {
  $('query').focus();
  if (libraryBusy) return;
  libraryBusy = true;
  $('library-status').textContent = 'Завантаження встановлених бібліотек…';
  try {
    libraryVersions = await call('installed');
  } catch (e) {
    $('library-status').textContent = e.message;
    return;
  } finally {
    libraryBusy = false;
  }
  await searchLibraries();
}
async function searchLibraries() {
  if (libraryBusy) return;
  libraryBusy = true;
  $('library-status').textContent = 'Пошук…';
  try {
    const query = $('query').value.trim();
    libraryResults = query ? await call('search', query) : Object.keys(libraryVersions).sort().map(name => ({ name }));
    if (!query) {
      $('library-status').textContent = libraryResults.length
        ? 'Встановлено: ' + libraryResults.length
        : 'Введіть назву бібліотеки для пошуку.';
    } else {
      $('library-status').textContent = libraryResults.length
        ? 'Результатів: ' + libraryResults.length
        : 'Бібліотек не знайдено.';
    }
  } catch (e) { $('library-status').textContent = e.message; }
  finally { libraryBusy = false; renderLibraries(libraryResults); }
}
async function install(name) {
  if (task || libraryBusy) return;
  libraryBusy = true;
  setTask('library');
  renderLibraries(libraryResults);
  $('library-status').textContent = 'Встановлення ' + name + '…';
  try {
    await call('install', name);
    libraryVersions = await call('installed');
    $('library-status').textContent = name + ' встановлено: ' + libraryVersions[name];
  } catch (e) { $('library-status').textContent = e.message; error(e, true); }
  finally { libraryBusy = false; setTask(''); renderLibraries(libraryResults); }
}
async function refreshIndex() {
  if (task || libraryBusy) return;
  libraryBusy = true;
  setTask('library');
  renderLibraries(libraryResults);
  $('library-status').textContent = 'Оновлення індексу…';
  try {
    await call('refreshLibraries');
    $('library-status').textContent = 'Індекс оновлено.';
  } catch (e) { $('library-status').textContent = e.message; error(e, true); }
  finally { libraryBusy = false; setTask(''); renderLibraries(libraryResults); }
}
let quickFiles = [];
let quickIndex = 0;
function renderQuick() {
  const query = $('quick-query').value.toLowerCase().trim();
  const search = query.split(/\s+/);
  const result = quickFiles.filter(entry => search.every(word => entry.relative.toLowerCase().includes(word)))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query))
      || a.relative.localeCompare(b.relative)).slice(0, 80);
  const list = $('quick-results');
  list.replaceChildren();
  if (!result.length) list.append(node('p', 'quick-empty', 'Файлів не знайдено.'));
  for (const [index, entry] of result.entries()) {
    const choice = button('menu-row quick-result', '', () => {
      $('quick-dialog').close();
      void openFile(entry.file).catch(error);
    });
    choice.setAttribute('aria-current', index === quickIndex);
    choice.append(node('strong', '', entry.name), node('small', '', entry.relative));
    list.append(choice);
  }
  list.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
}
async function openQuick() {
  if (!project || changing || document.querySelector('dialog[open]')) return;
  const owner = project;
  const dialog = $('quick-dialog');
  quickFiles = [];
  quickIndex = 0;
  $('quick-query').value = '';
  $('quick-results').replaceChildren(node('p', 'quick-empty', 'Читання файлів…'));
  dialog.showModal();
  $('quick-query').focus();
  try {
    const items = await call('projectFiles');
    if (project !== owner || !dialog.open) return;
    quickFiles = items;
    renderQuick();
  } catch (e) {
    if (dialog.open) $('quick-results').textContent = e.message;
  }
}
$('quick-query').oninput = () => { quickIndex = 0; renderQuick(); };
$('quick-query').onkeydown = event => {
  const rows = $('quick-results').querySelectorAll('button');
  if (event.key === 'Enter') {
    event.preventDefault();
    rows[quickIndex]?.click();
  } else if (rows.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    quickIndex = Math.min(rows.length - 1, Math.max(0, quickIndex + (event.key === 'ArrowDown' ? 1 : -1)));
    renderQuick();
  }
};
function inactiveWorkspace() {
  return { active: false, dirty: false, activate() {}, async setProject() {}, async flushProject() {},
    async save() {}, shortcut() { return false; }, discardChanges() {}, async refreshCode() {},
    async prepareBuild() { return null; }, showGenerationConflicts() {} };
}
let designer = inactiveWorkspace();
let display = inactiveWorkspace();
const loadedWorkspaces = new Set();
const detachedWorkspaces = new Set();
async function loadWorkspace(id) {
  if (loadedWorkspaces.has(id)) {
    if (detachedWorkspaces.delete(id)) await (id === 'build' ? designer : display).setProject(project);
    return;
  }
  const content = await call('packModule', id);
  const url = URL.createObjectURL(new Blob([content.javascript], { type: 'text/javascript' }));
  try {
    const module = await import(url);
    const style = document.createElement('style');
    style.dataset.module = id; style.textContent = content.css; document.head.append(style);
    if (id === 'build') {
      designer = module.mountDesigner(designerOptions);
      await designer.setProject(project);
    } else {
      display = module.mountDisplay(displayOptions);
      await display.setProject(project);
    }
    loadedWorkspaces.add(id);
  } finally { URL.revokeObjectURL(url); }
}
const designerOptions = { call, settings: () => $('settings-view').click(), projectActions: {
  new: () => newDialog(),
  open: () => changeProject(() => call('select')),
  save: () => save(true)
}, onVisibility(active) {
  $('welcome').hidden = !!project;
  $('home').hidden = !project;
  for (const id of ['workbench', 'toolbar', 'device-status', 'cursor', 'encoding']) {
    $(id).hidden = active || !project;
  }
  document.querySelector('.statusbar').hidden = active && !!project;
  $('caption').textContent = active ? '' : project?.name || '';
  closeMenus();
} };
const displayOptions = { call, preferences: () => preferences,
  async codeSource() {
    if(!project)return '';
    return files.get(project.primary)?.state.sliceDoc() ?? await call('read',project.primary);
  },
  onNew: () => newDialog(), onOpen: () => changeProject(() => call('select')),
  onChange: () => scheduleAutosave(), onSave: () => save(true),
  onVisibility(active) {
    for (const id of ['workbench', 'toolbar', 'device-status', 'cursor', 'encoding']) $(id).hidden = active || !project;
    $('welcome').hidden = active || !!project;
    $('home').hidden = !project;
    document.querySelector('.statusbar').hidden = active;
    $('caption').textContent = active ? '' : project?.name || '';
    if (active) document.documentElement.dataset.workspace = 'display';
    closeMenus();
  }
};
const workspaceSwitch = document.createElement('div');
workspaceSwitch.className = 'workspace-switch';
workspaceSwitch.innerHTML = '<button id="workspace-toggle" aria-haspopup="menu" aria-expanded="false"><span>Pinway Code</span><svg><use href="#i-down"></use></svg></button><div id="workspace-options" class="popover" role="menu" hidden><button data-workspace="code" role="menuitem"><span>Pinway Code<small>Write and upload firmware</small></span><span class="workspace-check">✓</span></button><button data-workspace="build" role="menuitem"><span>Pinway Build<small>Design an electronic circuit</small></span><span class="workspace-check"></span></button><button data-workspace="display" role="menuitem"><span>Pinway Display<small>Інтерфейси фізичних дисплеїв</small></span><span class="workspace-check"></span></button></div>';
document.querySelector('.title').before(workspaceSwitch);
$('caption').textContent = '';
const workspaceClose = () => { $('workspace-options').hidden = true; $('workspace-toggle').setAttribute('aria-expanded', 'false'); };
$('workspace-toggle').onclick = () => { const opening = $('workspace-options').hidden; closeMenus(); $('workspace-options').hidden = !opening; $('workspace-toggle').setAttribute('aria-expanded', String(opening)); };
let switchingWorkspace = false;
async function switchWorkspace(id) {
  if (switchingWorkspace || task || changing) return;
  switchingWorkspace = true;
  try {
    workspaceClose();
    if (id !== 'code') {
      if (!installation.has(id) && !await installation.offer(id)) return;
      await loadWorkspace(id);
    }
    await designer.activate(false);
    display.activate(false);
    if (id === 'build') await designer.activate(true);
    else if (id === 'display') display.activate(true);
    else {
      document.documentElement.dataset.workspace = 'code';
      designerOptions.onVisibility(false);
    }
    $('workspace-toggle').querySelector('span').textContent = id === 'code' ? 'Pinway Code' : id === 'build' ? 'Pinway Build' : 'Pinway Display';
    for (const b of workspaceSwitch.querySelectorAll('[data-workspace]')) b.querySelector('.workspace-check').textContent = b.dataset.workspace === id ? '✓' : '';
  } catch (e) { error(e); }
  finally { switchingWorkspace = false; }
}
workspaceSwitch.addEventListener('click', event => {
  const button = event.target.closest('button[data-workspace]');
  if (button) void switchWorkspace(button.dataset.workspace);
});
const installation = mountInstallation({ call, theme: () => preferences.theme,
  autoUpdates: () => preferences.updates,
  setTheme(value) { preferences.theme = value; applyPreferences(); },
  busy: () => !!task || changing, setBusy: value => setTask(value ? 'pack' : ''),
  async beforeRemove(id) {
    await save(true); await designer.flushProject();
    if ((id === 'build' && designer.active) || (id === 'display' && display.active)) await switchWorkspace('code');
    if (id === 'build' || id === 'display') {
      await (id === 'build' ? designer : display).setProject(null);
      detachedWorkspaces.add(id);
    }
    return true;
  },
  async changed() { await refreshCatalog(); }
});
document.addEventListener('pointerdown', e => { if (!workspaceSwitch.contains(e.target)) workspaceClose(); });
workspaceSwitch.onkeydown = e => {
  if (e.key === 'Escape') { workspaceClose(); $('workspace-toggle').focus(); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  $('workspace-options').hidden = false;
  $('workspace-toggle').setAttribute('aria-expanded', 'true');
  const items = [...workspaceSwitch.querySelectorAll('button[data-workspace]')];
  const current = items.indexOf(document.activeElement);
  const index = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 :
    current < 0 ? (e.key === 'ArrowUp' ? items.length - 1 : 0) :
    (current + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
  items[index].focus();
};
async function shortcut(action) {
  if (display.shortcut(action)) return;
  if (await designer.shortcut(action)) return;
  if (action === 'save') await designer.flushProject();
  if (Object.hasOwn(zoomActions, action)) return zoomActions[action]();
  if (action === 'new') return newDialog();
  if (action === 'quickOpen') return openQuick();
  if (action === 'open' && !$('entry-dialog').open) return changeProject(() => call('select'));
  if (action === 'close' && project) return changeProject(() => call('close'));
  if (action === 'save') {
    try { if (project && !task && !changing) { await save(); status('Файл збережено', 'success'); } }
    catch (e) { error(e, true); }
  }
  if (action === 'quit' || action === 'window') {
    if (task || changing) return status('Зачекайте, поки поточна операція завершиться.');
    changing = true;
    try {
      if (await canClose()) {
        if (discardDisplayOnClose) { display.discardChanges(); discardDisplayOnClose = false; }
        quittingSession = true;
        await rememberSession(false);
        await call('quit', action === 'quit');
      }
    }
    catch (e) { error(e); }
    finally { changing = false; }
  }
}
window.pinway.subscribe((type, data) => {
  installation.subscribe(type, data);
  if (type === 'console' || type === 'serial') append(type, data);
  if (type === 'shortcut') void shortcut(data);
  if (type === 'monitor') { monitorPort = data?.port || ''; renderPorts(); }
});

$('new').onclick = newDialog;
$('open').onclick = () => shortcut('open');
$('home').onclick = () => shortcut('close');
$('reveal').onclick = () => void call('reveal').catch(error);
$('pick-folder').onclick = async () => {
  try {
    const picked = await call('chooseFolder');
    if (picked) {
      parent = picked;
      $('parent-label').textContent = picked;
      $('parent-label').title = picked;
      $('new-error').hidden = true;
    }
  } catch (e) {
    $('new-error').textContent = e.message;
    $('new-error').hidden = false;
  }
};
$('new-form').onsubmit = async e => {
  e.preventDefault();
  if (changing || task) return;
  $('new-error').hidden = true;
  if (!parent) {
    $('new-error').textContent = 'Виберіть папку для проєкту.';
    $('new-error').hidden = false;
    return;
  }
  changing = true;
  $('create').disabled = true;
  try {
    if (!await canClose()) return;
    await designer.flushProject();
    const value = await call('create', { parent, name: $('name').value.trim(), template: $('sketch-template').value });
    $('new-dialog').close();
    await acceptProject(value);
  } catch (e) {
    if ($('new-dialog').open) {
      $('new-error').textContent = e.message;
      $('new-error').hidden = false;
    } else error(e);
  } finally { changing = false; $('create').disabled = false; }
};
$('welcome-settings').onclick = () => $('settings-view').click();
$('settings-view').onclick = () => {
  closeMenus();
  $('setting-theme').value = preferences.theme;
  $('setting-accent').value = preferences.accent;
  $('setting-font').value = String(preferences.fontSize);
  $('setting-wrap').checked = preferences.wrap;
  $('setting-autosave').checked = preferences.autosave;
  $('setting-restore').checked = preferences.restore;
  $('setting-updates').checked = preferences.updates;
  void installation.refresh().catch(error);
  $('setting-zoom').value = String(zoomPercent);
  $('settings-dialog').showModal();
};
for (const [id, key] of [['theme','theme'],['accent','accent'],['font','fontSize'],['wrap','wrap'],['autosave','autosave'],['restore','restore'],['updates','updates']]) {
  $('setting-' + id).addEventListener('change', event => {
    const input = event.target;
    preferences[key] = input.type === 'checkbox' ? input.checked : key === 'fontSize' ? Number(input.value) : input.value;
    applyPreferences();
    if (key === 'autosave') scheduleAutosave();
  });
}
for (const value of [70,80,90,100,110,120,130,140,150]) $('setting-zoom').append(new Option(value + '%', String(value)));
$('setting-zoom').onchange = event => void setZoom(Number(event.target.value));
for (const [name,color] of [['Блакитний','#91baff'],['М’ятний','#75dfbc'],['Фіолетовий','#b69cff'],['Рожевий','#ef9cce'],['Помаранчевий','#ffb878'],['Жовтий','#e5cd70']]) {
  const swatch = button('accent-swatch','', () => {
    preferences.accent = color;
    $('setting-accent').value = color;
    applyPreferences();
  });
  swatch.dataset.color = color;
  swatch.style.setProperty('--swatch', color);
  swatch.setAttribute('aria-label', name);
  swatch.setAttribute('aria-pressed', String(color === preferences.accent));
  $('accent-swatches').append(swatch);
}
document.querySelectorAll('.dismiss').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
for (const id of ['files-view', 'libraries-view']) {
  $(id).onclick = event => toggleSidebar(event.currentTarget);
}
$('root-select').onclick = () => {
  selectedFolder = project.root;
  renderTree();
};

let entryTarget;
function openEntryDialog(folder) {
  if (!project || changing || task) return;
  const parent = selectedFolder || project.root;
  entryTarget = { parent, folder };
  $('entry-form').reset();
  $('entry-error').hidden = true;
  $('entry-title').textContent = folder ? 'Нова папка' : 'Новий файл';
  $('entry-name').placeholder = folder ? 'src' : 'helpers.h';
  $('entry-location').textContent = basename(project.root) + parent.slice(project.root.length);
  $('entry-dialog').showModal();
  $('entry-name').focus();
}
$('new-file').onclick = () => openEntryDialog(false);
$('new-folder').onclick = () => openEntryDialog(true);
$('entry-form').onsubmit = async event => {
  event.preventDefault();
  if (changing || task) return;
  changing = true;
  $('entry-create').disabled = true;
  $('entry-error').hidden = true;
  try {
    const { parent, folder } = entryTarget;
    const entry = await call('createEntry', { parent, folder, name: $('entry-name').value.trim() });
    $('entry-dialog').close();
    await loadFolder(parent);
    if (folder) {
      selectedFolder = entry.path;
      await loadFolder(entry.path);
    } else if (entry.editable) {
      await openFile(entry.path);
    }
    renderTree();
    status(folder ? 'Папку створено' : 'Файл створено', 'success');
  } catch (e) {
    if ($('entry-dialog').open) {
      $('entry-error').textContent = e.message;
      $('entry-error').hidden = false;
    } else error(e);
  } finally {
    changing = false;
    $('entry-create').disabled = false;
  }
};

$('board-button').onclick = () => toggleMenu('board');
$('board-query').oninput = renderBoards;
$('board-query').onkeydown = event => {
  if (event.key === 'Enter') $('board-results').querySelector('button')?.click();
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    $('board-results').querySelector('button')?.focus();
  }
};
$('tools-button').onclick = () => toggleMenu('tools');
document.addEventListener('pointerdown', e => {
  if (e.target.closest('#tools-picker')) return;
  if (!e.target.closest('.menu-anchor')) closeMenus();
  else if (!e.target.closest('.tools-select')) closeToolsPicker();
});
$('tools-menu').addEventListener('scroll', () => closeToolsPicker());
window.addEventListener('resize', () => closeToolsPicker());
$('zoom-in').onclick = zoomActions.zoomIn;
$('zoom-out').onclick = zoomActions.zoomOut;
$('zoom-reset').onclick = zoomActions.zoomReset;
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey) {
    const action = { '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut', '0': 'zoomReset' }[e.key];
    if (action) {
      e.preventDefault();
      void zoomActions[action]();
      return;
    }
  }
  if (e.key === 'Escape' && pickerTrigger) {
    e.preventDefault();
    closeToolsPicker(true);
    return;
  }
  if (e.key === 'Escape') {
    const anchor = ['board', 'tools'].find(name => !$(name + '-menu').hidden);
    closeMenus();
    if (anchor) $(anchor + '-button').focus();
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && project) {
    e.preventDefault();
    void openQuick();
  }
  if (e.metaKey && e.key.toLowerCase() === 's') { e.preventDefault(); void shortcut('save'); }
});
$('verify').onclick = () => void build(false);
$('upload').onclick = () => void build(true);
for (const name of ['console', 'serial', 'plot', 'problems']) {
  $(name + '-tab').onclick = () => togglePanel(name);
}
$('panel-toggle').onclick = () => togglePanel();
$('serial-filter').oninput = renderSerial;
$('serial-timestamps').onchange = renderSerial;
$('serial-send').onsubmit = async event => {
  event.preventDefault();
  if (!monitorPort || task) return;
  const input = $('serial-command');
  const command = input.value;
  if (!command) return;
  const endings = { lf: '\n', crlf: '\r\n', none: '' };
  try {
    await call('serialSend', { port: monitorPort, text: command + endings[$('serial-ending').value] });
    if (input.value === command) input.value = '';
  } catch (e) { error(e); }
};
$('clear').onclick = () => clearLog(tab);
$('serial-toggle').onclick = toggleSerial;
$('plot-monitor').onclick = toggleSerial;
function openPins() {
  closeMenus();
  $('pin-query').value = '';
  renderPins();
  $('pin-dialog').showModal();
  if (!$('pin-query').hidden) $('pin-query').focus();
}
$('pin-query').oninput = renderPins;
$('pin-source').onclick = () => void call('pinoutSource', pinouts[board?.id]?.source).catch(error);

function renderPins() {
  const map = pinouts[board?.id];
  $('pin-title').textContent = map?.title || 'Карта пінів';
  $('pin-query').hidden = $('pin-source').hidden = !map;
  const container = $('pin-map');
  container.replaceChildren();
  if (!map) {
    $('pin-note').textContent = board
      ? 'Для цього профілю карти ще немає.'
      : 'Спочатку виберіть плату.';
    return;
  }
  const note = map.reference ? 'Довідкова схема. Назва профілю Dev Module не визначає фізичну розводку вашої плати.' : '';
  $('pin-note').textContent = [note, map.note].filter(Boolean).join(' ');
  const search = $('pin-query').value.trim().toLowerCase();
  for (const group of map.groups) {
    const matches = group.pins.filter(pin => (pin.name + ' ' + pin.functions).toLowerCase().includes(search));
    if (!matches.length) continue;
    const block = node('section', 'pin-header');
    block.append(node('h3', '', group.label));
    for (const pin of matches) {
      const row = node('div', 'pin-row');
      row.append(node('strong', '', pin.name), node('span', '', pin.functions));
      block.append(row);
    }
    container.append(block);
  }
  if (!container.firstChild) container.append(node('p', '', 'Пінів не знайдено.'));
}
$('library-search').onsubmit = e => { e.preventDefault(); void searchLibraries(); };
$('refresh-index').onclick = refreshIndex;
const split = $('split');
function panelHeight(value) {
  const size = Math.max(92, Math.min($('workbench').clientHeight - 158, value));
  $('panel').style.height = size + 'px';
  split.setAttribute('aria-valuenow', size);
}
split.onpointerdown = e => {
  e.preventDefault();
  split.setPointerCapture(e.pointerId);
  const initial = $('panel').offsetHeight;
  const start = e.clientY;
  split.onpointermove = move => panelHeight(initial + start - move.clientY);
  split.onlostpointercapture = () => { split.onpointermove = null; };
};
split.onkeydown = e => {
  if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  panelHeight($('panel').offsetHeight + (e.key === 'ArrowUp' ? 20 : -20));
};
const sidebarSplit = $('sidebar-split');
const codeSave=document.createElement('button');codeSave.className='icon-button';codeSave.title='Зберегти проєкт · ⌘S';codeSave.setAttribute('aria-label',codeSave.title);codeSave.innerHTML='<svg viewBox="0 0 24 24"><path d="M4 3h13l3 3v15H4ZM8 3v6h8V3M8 21v-7h8v7" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';codeSave.onclick=()=>shortcut('save');
$('sidebar').prepend(panelHeading('Code',codeSave));
$('sidebar').after(sidebarSplit);
bindSidebarResize(sidebarSplit);
function layoutSidebar(){refreshSidebarWidth();}
window.addEventListener('resize',()=>{if(project&&!panelCollapsed)panelHeight($('panel').offsetHeight);});

async function init() {
  applyPreferences();
  await setZoom(zoomPercent);
  await installation.initialize();
  const state = await call('state');
  profiles = state.profiles;
  recent = state.recent;
  for (const template of state.templates) {
    if (template.id !== 'empty') $('sketch-template').append(new Option(template.name, template.id));
  }
  renderRecent();
  if (preferences.restore && state.recovery?.primary) {
    changing = true;
    try {
      const workspace = await call('reopen', state.recovery.primary);
      await acceptProject(workspace, state.recovery);
    } catch (e) {
      error(Error('Не вдалося відновити попередній проєкт: ' + e.message), true);
    } finally {
      changing = false;
    }
  }
  if (!project && !(preferences.restore && state.recovery?.primary)) status('Підготовка інструментів Arduino…');
  try {
    await call('prepare');
    if (!project && !(preferences.restore && state.recovery?.primary)) status('Готово');
  } catch (e) { error(e); }
  void poll();
  await refreshCatalog();
}
async function refreshCatalog() {
  catalogState = 'Завантаження каталогу плат…';
  try {
    const catalog = await call('catalog');
    const merged = new Map(profiles.filter(p => installation.has('esp32') || !p.id.startsWith('esp32:')).map(p => [p.id, p]));
    for (const p of catalog.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!merged.has(p.id)) merged.set(p.id, p);
    }
    profiles = [...merged.values()];
    if (project && !board && !projectProfiles.has(project.primary)) {
      manualBoard = profiles.find(p => p.id === legacyBoard) || null;
      setBoard(manualBoard, false);
    }
    catalogState = '';
  } catch (e) {
    catalogState = 'Не вдалося завантажити каталог плат.';
    append('console', '\n' + e.message + '\n');
  }
  catalogLoaded = true;
  if (designer.active) void designer.activate(true);
  if (!$('board-menu').hidden) renderBoards();
}
void init().catch(error);
