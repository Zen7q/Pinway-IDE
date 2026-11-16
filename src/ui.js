import { basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cpp } from '@codemirror/lang-cpp';
import { autocompletion, completeFromList } from '@codemirror/autocomplete';
import { setDiagnostics, lintGutter } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import completions from './arduino-completions.json';

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
const basename = p => p.split('/').at(-1);
const dirname = p => p.slice(0, p.lastIndexOf('/')) || '/';
const files = new Map();
const folders = new Map();
const projectProfiles = new Map(Object.entries(JSON.parse(localStorage.getItem('pinway.projectProfiles') || '{}')));
const legacyOptions = JSON.parse(localStorage.getItem('pinway.options') || '{}');
const legacyBoard = localStorage.getItem('pinway.board') || '';
let settings = new Map();
function saveProfile() {
  if (!project) return;
  if (board) settings.set(board.id, options);
  projectProfiles.set(project.primary, { board, options: Object.fromEntries(settings) });
  localStorage.setItem('pinway.projectProfiles', JSON.stringify(Object.fromEntries(projectProfiles)));
}
const completionMode = new Compartment();
let project, recent = [], profiles = [], catalogState = '', board, options = {}, devicePort = '', devices = [], portMissing = false, chip = '';
let editor, activeFile, selectedFolder, report = [], buildSnapshots = new Map(), monitorPort = '';
let task = '', tab = 'console', changing = false, parent = '', pendingConsole = '', paint = 0;
let panelCollapsed = localStorage.getItem('pinway.panelCollapsed') === 'true';
const serialLines = [];
let serialTail = '';
let serialSize = 0;
let serialTime = '';
const serialClock = new Intl.DateTimeFormat('uk', {
  hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
});
let seen = new Set(), lastPorts = '', libraryResults = [], libraryVersions = {}, libraryBusy = false;

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
function error(e, log = false) {
  status(e.message, 'error');
  if (log) append('console', '\n' + e.message + '\n');
}
function clearLog(name) {
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
  for (const name of ['console', 'serial', 'problems']) {
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
  $('serial-controls').hidden = panelCollapsed || next !== 'serial';
  $('clear').hidden = panelCollapsed || next === 'problems';
  if (!panelCollapsed && next === 'serial') renderSerial();
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
            for (const p of folders.keys()) if (p === child.path || p.startsWith(child.path + '/')) folders.delete(p);
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
      basicSetup, oneDark, EditorState.lineSeparator.of(content.includes('\r\n') ? '\r\n' : '\n'),
      ...(/\.(ino|pde|c|cc|cpp|cxx|h|hh|hpp)$/i.test(file) ? [cpp(), completionMode.of(arduinoComplete())] : []),
      lintGutter(), EditorView.lineWrapping,
      EditorView.theme({ '&': { backgroundColor: '#181c23' }, '.cm-gutters': { backgroundColor: '#171b21' } }),
      EditorView.updateListener.of(update => {
        const doc = files.get(file);
        if (!doc) return;
        const wasDirty = isDirty(doc);
        doc.state = update.state;
        if (activeFile === file) {
          if (update.docChanged && wasDirty !== isDirty(doc)) renderTabs();
          if (update.docChanged || update.selectionSet) cursor(update.state);
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
  $('breadcrumb').textContent = [project.name, ...file.slice(project.root.length + 1).split('/')].join('  ›  ');
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
}
async function save(all = false) {
  if (!project) return;
  for (const [file, doc] of files) {
    if ((!all && file !== activeFile) || !isDirty(doc)) continue;
    const next = doc.state.sliceDoc();
    await call('write', { file, content: next });
    doc.saved = next;
  }
  renderTabs();
}
async function canClose() {
  if (![...files.values()].some(isDirty)) return true;
  const choice = await call('dirtyPrompt');
  if (choice === 2) return false;
  if (choice === 0) await save(true);
  return true;
}
async function acceptProject(value) {
  project = value;
  const saved = value && projectProfiles.get(value.primary);
  settings = new Map(Object.entries(structuredClone(saved?.options || legacyOptions)));
  board = null;
  const selected = saved ? saved.board : value && profiles.find(p => p.id === legacyBoard);
  setBoard(selected, false);
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
  seen.clear();
  devicePort = '';
  chip = '';
  portMissing = false;
  closeMenus();
  $('welcome').hidden = !!value;
  for (const x of ['workbench', 'toolbar', 'home', 'device-status', 'cursor', 'encoding']) $(x).hidden = !value;
  $('version').hidden = !!value;
  $('caption').textContent = value ? value.name + ' — Pinway IDE' : 'Pinway IDE';
  if (value) {
    layoutSidebar();
    $('root-label').textContent = basename(value.root);
    $('root-label').title = value.root;
    showPanel('console');
    append('console', 'Готово до збірки. Виберіть профіль плати у шапці.\n');
    renderPorts();
    await loadFolder(value.root);
    await openFile(value.selected);
    status('Проєкт відкрито', 'success');
  } else {
    const state = await call('state');
    recent = state.recent;
    renderRecent();
    status('Готово');
  }
}
async function changeProject(action) {
  if (changing || task) return false;
  changing = true;
  try {
    if (!await canClose()) return false;
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
    renderBoards();
    renderBoardDevices();
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
function deviceName(device) { return device.matches.length === 1 && !['10c4', '1a86', '0403', '067b', '303a'].includes((device.vid || '').toLowerCase().replace(/^0x/, '')) ? device.matches[0].name : 'Послідовний USB-пристрій'; }
function renderBoards() {
  const query = $('board-query').value.toLowerCase().trim();
  const tokens = query ? query.split(/\s+/) : [];
  const matches = profiles.filter(p => {
    const label = (p.name + ' ' + p.id).toLowerCase();
    return tokens.every(token => label.includes(token));
  });
  const menu = $('board-results');
  const fragment = document.createDocumentFragment();
  for (const p of matches) {
    const row = button('menu-row board-choice', '', () => {
      setBoard(p);
      closeMenus();
      $('board-button').focus();
      status('Профіль: ' + p.name);
    });
    row.append(node('span', '', p.name), node('small', '', p.id));
    row.setAttribute('aria-pressed', board?.id === p.id);
    fragment.append(row);
  }
  menu.replaceChildren(fragment);
  menu.scrollTop = 0;
  $('board-catalog').textContent = catalogState || (matches.length ? String(matches.length) + ' профілів' : 'Плат не знайдено.');
}
function renderBoardDevices() {
  const menu = $('board-devices');
  menu.replaceChildren();
  if (chip) groupLabel(menu, 'Визначений чип: ' + chip);
  groupLabel(menu, 'Автовизначення');
  if (!devices.length) menu.append(node('p', '', 'Підключіть пристрій через USB.'));
  for (const d of devices) {
    const row = button('menu-row', '', () => { closeMenus(); void detect(d); });
    row.append(node('span', '', 'Автовизначення · ' + basename(d.address)));
    row.title = deviceName(d);
    row.disabled = !!task;
    menu.append(row);
  }
}
function setPort(port) {
  if (port !== devicePort) chip = '';
  devicePort = port;
  portMissing = false;
  if (port) seen.add(port);
  renderPorts();
}
function renderTools() {
  const menu = $('tools-menu');
  menu.replaceChildren();
  groupLabel(menu, 'Порт');
  const select = node('select', 'tools-select');
  select.setAttribute('aria-label', 'Послідовний порт');
  select.append(new Option('Не вибрано', ''));
  for (const d of devices) select.append(new Option(basename(d.address) + ' · ' + deviceName(d), d.address));
  select.value = devicePort;
  select.disabled = !!task;
  select.addEventListener('change', () => setPort(select.value));
  const field = node('label', 'tools-field');
  field.append(node('span', '', 'USB'), select);
  menu.append(field, node('hr'));
  groupLabel(menu, 'Параметри плати');
  if (!board) menu.append(node('p', '', 'Виберіть профіль плати.'));
  else if (optionError) menu.append(node('p', '', optionError));
  else if (!optionRows.length) menu.append(node('p', '', 'Цей профіль не має додаткових параметрів.'));
  for (const option of optionRows) {
    const s = node('select', 'tools-select');
    s.setAttribute('aria-label', option.option_label);
    for (const v of option.values) s.append(new Option(v.value_label, v.value));
    s.value = options[option.option] || option.values.find(v => v.selected)?.value || s.options[0]?.value;
    s.disabled = !!task;
    s.addEventListener('change', () => { options[option.option] = s.value; saveProfile(); });
    const label = node('label', 'tools-field');
    label.append(node('span', '', option.option_label), s);
    menu.append(label);
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
  $('baud').disabled = !!monitorPort;
  $('serial-command').disabled = $('serial-send-button').disabled = !monitorPort || !!task;
  if (!$('tools-menu').hidden) renderTools();
  if (!$('board-menu').hidden) renderBoardDevices();
}
function setTask(value) {
  task = value;
  $('verify').disabled = $('upload').disabled = $('home').disabled = !!value;
  renderPorts();
}
async function detect(device) {
  if (task) return;
  setPort(device.address);
  setTask('probe');
  status('Визначення чипа: ' + basename(device.address) + '…');
  try {
    const found = await call('probe', device.address);
    chip = found.chip || '';
    if (found.board && /^(arduino:avr|esp32:esp32):/.test(found.board.id)) {
      const p = profiles.find(x => x.id === found.board.id);
      if (!p) profiles.unshift({ ...found.board, chip });
      setBoard(p || profiles[0]);
      status('Визначено профіль: ' + found.board.name, 'success');
    } else {
      setBoard(null);
      status(chip ? 'Чип ' + chip + ' · виберіть профіль плати' : 'Модель не визначено. Виберіть профіль вручну.');
      if ($('board-menu').hidden) toggleMenu('board');
    }
  } catch (e) { error(e, true); }
  finally { setTask(''); }
}
async function poll() {
  try {
    const found = await call('ports');
    const fingerprint = JSON.stringify(found);
    if (fingerprint === lastPorts) return;
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
      append('console', '\nПорт від’єднано: ' + old + '\n');
      if (!task) status('Порт від’єднано. Редагування доступне.');
    }
    if (project) renderPorts();
  } catch (e) {
    if (!task && lastPorts !== 'error') status(e.message, 'error');
    lastPorts = 'error';
  } finally { setTimeout(poll, 2100); }
}
async function build(upload) {
  if (task || changing || !project) return;
  showPanel('console');
  if (!board) { if ($('board-menu').hidden) toggleMenu('board'); return error(Error('Виберіть профіль плати у шапці.'), true); }
  if (upload && !devicePort) { if ($('tools-menu').hidden) toggleMenu('tools'); return error(Error('Виберіть підключений порт у Tools.'), true); }
  const selection = { upload, board: board.id, options: { ...options }, port: devicePort };
  closeMenus();
  setTask('build');
  status(upload ? 'Підготовка до завантаження…' : 'Компіляція…');
  clearLog('console');
  report = [];
  renderProblems();
  showDiagnostics();
  try {
    await save(true);
    buildSnapshots = new Map([...files].map(([k, v]) => [k, v.saved]));
    const result = await call('build', selection);
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
async function shortcut(action) {
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
    try { if (await canClose()) await call('quit', action === 'quit'); }
    catch (e) { error(e); }
    finally { changing = false; }
  }
}
window.pinway.subscribe((type, data) => {
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
    const value = await call('create', { parent, name: $('name').value.trim() });
    $('new-dialog').close();
    await acceptProject(value);
  } catch (e) {
    if ($('new-dialog').open) {
      $('new-error').textContent = e.message;
      $('new-error').hidden = false;
    } else error(e);
  } finally { changing = false; $('create').disabled = false; }
};
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
document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu-anchor')) closeMenus(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('tools-menu').querySelector('.tools-select:open')) return;
  if (e.key === 'Escape' && !$('board-menu').hidden) {
    closeMenus();
    $('board-button').focus();
  } else if (e.key === 'Escape') closeMenus();
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && project) {
    e.preventDefault();
    void openQuick();
  }
  if (e.metaKey && e.key.toLowerCase() === 's') { e.preventDefault(); void shortcut('save'); }
});
$('verify').onclick = () => void build(false);
$('upload').onclick = () => void build(true);
for (const name of ['console', 'serial', 'problems']) {
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
const defaultSidebarWidth = 248;
const minSidebarWidth = 208;
let preferredSidebarWidth = Number(localStorage.getItem('pinway.sidebarWidth')) || defaultSidebarWidth;

function layoutSidebar() {
  const railWidth = $('sidebar').querySelector('.side-views').offsetWidth;
  const maxWidth = Math.max(minSidebarWidth, Math.min(520, $('workbench').clientWidth - railWidth - 360));
  const width = Math.max(minSidebarWidth, Math.min(maxWidth, preferredSidebarWidth));
  $('sidebar').style.setProperty('--panel-width', width + 'px');
  sidebarSplit.setAttribute('aria-valuemin', minSidebarWidth);
  sidebarSplit.setAttribute('aria-valuemax', maxWidth);
  sidebarSplit.setAttribute('aria-valuenow', width);
}
function resizeSidebar(width) {
  preferredSidebarWidth = width;
  layoutSidebar();
  preferredSidebarWidth = Number(sidebarSplit.getAttribute('aria-valuenow'));
}
function saveSidebarWidth() {
  localStorage.setItem('pinway.sidebarWidth', String(preferredSidebarWidth));
}
sidebarSplit.onpointerdown = event => {
  if (event.button !== 0 || !event.isPrimary) return;
  event.preventDefault();
  sidebarSplit.focus();
  sidebarSplit.setPointerCapture(event.pointerId);
  const width = Number(sidebarSplit.getAttribute('aria-valuenow'));
  const start = event.clientX;
  $('workbench').classList.add('resizing-sidebar');
  sidebarSplit.classList.add('dragging');
  sidebarSplit.onpointermove = move => resizeSidebar(width + move.clientX - start);
};
sidebarSplit.onlostpointercapture = () => {
  sidebarSplit.onpointermove = null;
  $('workbench').classList.remove('resizing-sidebar');
  sidebarSplit.classList.remove('dragging');
  saveSidebarWidth();
};
sidebarSplit.onkeydown = event => {
  const width = Number(sidebarSplit.getAttribute('aria-valuenow'));
  const sizes = {
    ArrowLeft: width - 16,
    ArrowRight: width + 16,
    Home: minSidebarWidth,
    End: Number(sidebarSplit.getAttribute('aria-valuemax'))
  };
  if (!Object.hasOwn(sizes, event.key)) return;
  event.preventDefault();
  resizeSidebar(sizes[event.key]);
  saveSidebarWidth();
};
sidebarSplit.ondblclick = () => {
  resizeSidebar(defaultSidebarWidth);
  saveSidebarWidth();
};
window.addEventListener('resize', () => {
  if (!project) return;
  if (!panelCollapsed) panelHeight($('panel').offsetHeight);
  layoutSidebar();
});

async function init() {
  const state = await call('state');
  profiles = state.profiles;
  recent = state.recent;
  renderRecent();
  status('Підготовка інструментів Arduino…');
  try {
    await call('prepare');
    if (!project) status('Готово');
  } catch (e) { error(e); }
  void poll();
  catalogState = 'Завантаження каталогу плат…';
  try {
    const catalog = await call('catalog');
    const merged = new Map(profiles.map(p => [p.id, p]));
    for (const p of catalog.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!merged.has(p.id)) merged.set(p.id, p);
    }
    profiles = [...merged.values()];
    if (project && !board && !projectProfiles.has(project.primary)) {
      setBoard(profiles.find(p => p.id === legacyBoard), false);
    }
    catalogState = '';
  } catch (e) {
    catalogState = 'Не вдалося завантажити каталог плат.';
    append('console', '\n' + e.message + '\n');
  }
  if (!$('board-menu').hidden) renderBoards();
}
void init().catch(error);
