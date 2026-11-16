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
const settings = new Map(Object.entries(JSON.parse(localStorage.getItem('pinway.options') || '{}')));
const saveOptions = () => localStorage.setItem('pinway.options', JSON.stringify(Object.fromEntries(settings)));
const completionMode = new Compartment();
let project, recent = [], profiles = [], catalogState = '', board, options = {}, devicePort = '', devices = [], portMissing = false, chip = '';
let savedBoard = localStorage.getItem('pinway.board') || '';
let editor, activeFile, selectedFolder, report = [], buildSnapshots = new Map(), monitorPort = '';
let task = '', tab = 'console', changing = false, parent = '', pendingConsole = '', pendingSerial = '', paint = 0;
let seen = new Set(), lastPorts = '', libraryResults = [], libraryVersions = {}, libraryBusy = false;

function status(message, kind = '') {
  $('status').textContent = message;
  $('status').title = message;
  $('status').dataset.kind = kind;
}
function append(channel, text) {
  if (channel === 'console') pendingConsole += text;
  else pendingSerial += text;
  if (paint) return;
  paint = requestAnimationFrame(() => {
    paint = 0;
    for (const [id, content] of [['console-log', pendingConsole], ['serial-log', pendingSerial]]) {
      if (!content) continue;
      const el = $(id);
      const follow = el.scrollHeight - el.scrollTop < el.clientHeight + 35;
      // Retain the complete build log. Serial output is an unbounded stream.
      const next = id === 'serial-log' ? (el.textContent + content).slice(-400000) : null;
      if (next !== null) el.textContent = next;
      else el.append(document.createTextNode(content));
      if (follow) el.scrollTop = el.scrollHeight;
    }
    pendingConsole = pendingSerial = '';
  });
}
function error(e, log = false) {
  status(e.message, 'error');
  if (log) append('console', '\n' + e.message + '\n');
}
function clearLog(name) {
  if (name === 'console') pendingConsole = '';
  else pendingSerial = '';
  $(name + '-log').replaceChildren();
}
function showPanel(next) {
  tab = next;
  for (const name of ['console', 'serial']) {
    $(name + '-tab').classList.toggle('active', name === next);
    $(name + '-tab').setAttribute('aria-pressed', name === next);
    $(name + '-log').hidden = name !== next;
  }
  $('serial-controls').hidden = next !== 'serial';
  const log = $(next + '-log');
  log.scrollTop = log.scrollHeight;
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
async function openFile(file) {
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
  selectedFolder = value?.root;
  showSidebar('files-panel');
  editor?.destroy();
  editor = activeFile = undefined;
  files.clear();
  folders.clear();
  report = [];
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
function setBoard(next) {
  if (board?.id) settings.set(board.id, options);
  board = next;
  savedBoard = next.id;
  options = settings.get(next.id) || {};
  localStorage.setItem('pinway.board', next.id);
  $('board-label').textContent = next.name;
  if (editor && /\.(ino|pde|c|cc|cpp|cxx|h|hh|hpp)$/i.test(activeFile)) {
    editor.dispatch({ effects: completionMode.reconfigure(arduinoComplete()) });
  }
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
    s.addEventListener('change', () => { options[option.option] = s.value; settings.set(board.id, options); saveOptions(); });
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
      if (board?.id) settings.set(board.id, options);
      board = null;
      options = {};
      optsFor = optionError = '';
      optionRows = [];
      $('board-label').textContent = 'Вибрати плату';
      if (editor && /\.(ino|pde|c|cc|cpp|cxx|h|hh|hpp)$/i.test(activeFile)) editor.dispatch({ effects: completionMode.reconfigure(arduinoComplete()) });
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
  showDiagnostics();
  try {
    await save(true);
    buildSnapshots = new Map([...files].map(([k, v]) => [k, v.saved]));
    const result = await call('build', selection);
    report = result.diagnostics;
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
async function shortcut(action) {
  if (action === 'new') return newDialog();
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
  if (e.metaKey && e.key.toLowerCase() === 's') { e.preventDefault(); void shortcut('save'); }
});
$('verify').onclick = () => void build(false);
$('upload').onclick = () => void build(true);
$('console-tab').onclick = () => showPanel('console');
$('serial-tab').onclick = () => showPanel('serial');
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
window.addEventListener('resize', () => { if (project) panelHeight($('panel').offsetHeight); });

async function init() {
  const state = await call('state');
  profiles = state.profiles;
  recent = state.recent;
  const initial = profiles.find(p => p.id === savedBoard);
  if (initial) setBoard(initial);
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
    const restored = profiles.find(p => p.id === savedBoard);
    if (!board && restored) setBoard(restored);
    catalogState = '';
  } catch (e) {
    catalogState = 'Не вдалося завантажити каталог плат.';
    append('console', '\n' + e.message + '\n');
  }
  if (!$('board-menu').hidden) renderBoards();
}
void init().catch(error);
