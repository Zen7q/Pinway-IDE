const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createSketch, createEntry, openSketch, projectPath, entries, projectFiles, buildSketch, diagnostics } = require('./projects.cjs');
const { makeArduino, profiles, workspace } = require('./arduino.cjs');
const templates = require('./templates.cjs');

if (process.env.PINWAY_USER_DATA) app.setPath('userData', path.resolve(process.env.PINWAY_USER_DATA));
const storage = app.getPath('userData');
const runtime = app.isPackaged ? path.join(process.resourcesPath, 'arduino') : path.join(__dirname, '../.toolchain/runtime');
const arduino = makeArduino(runtime, storage);
const historyFile = path.join(storage, 'recent.json');
const recoveryFile = path.join(storage, 'recovery.json');
let recovery = null;
let recoveryQueue = Promise.resolve();
let win, project, recent = [], busy = false, scan, monitor, closing = false;
let devices = [];
const send = (type, data) => {
  if (win?.webContents && !win.webContents.isDestroyed()) win.webContents.send('event', type, data);
};

async function setProject(value) {
  if (busy) throw Error('Зачекайте, поки поточна операція завершиться.');
  await closeMonitor();
  const next = value ? [value, ...recent.filter(x => x.primary !== value.primary)].slice(0, 12) : recent;
  if (value) {
    const temporary = historyFile + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(next, null, 2));
    await fs.rename(temporary, historyFile);
  }
  project = value;
  recent = next;
  return value;
}

function findProfile(id) {
  if (typeof id !== 'string' || !/^[\w-]+:[\w-]+:[\w-]+$/.test(id) ||
    !(id.startsWith('arduino:avr:') || id.startsWith('esp32:esp32:'))) throw Error('Виберіть профіль плати.');
  return id;
}

function boardArgs(board, options) {
  const args = ['--fqbn', findProfile(board)];
  for (const [key, value] of Object.entries(options || {})) {
    if (!/^[\w-]+$/.test(key) || typeof value !== 'string' || !/^[\w.-]+$/.test(value)) throw Error('Неправильний параметр плати.');
    args.push('--board-options', key + '=' + value);
  }
  return args;
}

async function closeMonitor() {
  if (!monitor) return;
  const open = monitor;
  open.stop();
  await open.done;
}

async function refresh() {
  if (scan) return scan;
  scan = arduino.ports().then(found => {
    devices = found;
    if (monitor && !found.some(x => x.address === monitor.port)) {
      send('serial', '\nПристрій від’єднано.\n');
      void closeMonitor();
    }
    return devices;
  }).finally(() => { scan = null; });
  return scan;
}

function checkedPort(port) {
  const device = port && devices.find(x => x.address === port);
  if (!device) throw Error('Виберіть підключений порт у Tools.');
  return device;
}

function operation(fn) {
  if (busy) throw Error('Інша операція вже виконується.');
  busy = true;
  return Promise.resolve().then(fn).finally(() => { busy = false; });
}

const handlers = {
  state: () => ({
    recent, project, profiles, recovery,
    templates: Object.entries(templates).map(([id, template]) => ({ id, name: template.name }))
  }),
  rememberSession: snapshot => {
    if ((snapshot?.primary ?? null) !== (project?.primary ?? null)) return;
    recoveryQueue = recoveryQueue.catch(() => {}).then(async () => {
      const temporary = recoveryFile + '.tmp';
      await fs.writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
      await fs.rename(temporary, recoveryFile);
      recovery = snapshot;
    });
    return recoveryQueue;
  },
  prepare: () => arduino.initialize(),
  zoom: percent => {
    if (!Number.isInteger(percent) || percent < 70 || percent > 150) throw Error('Недопустимий масштаб.');
    win.webContents.setZoomFactor(percent / 100);
  },
  catalog: async () => {
    const { boards } = await arduino.json(['board', 'listall']);
    return (boards || [])
      .filter(({ fqbn }) => /^(arduino:avr|esp32:esp32):[\w-]+$/.test(fqbn))
      .map(({ fqbn, name }) => ({ id: fqbn, name }));
  },
  chooseFolder: async () => (await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })).filePaths[0],
  create: async ({ parent, name, template }) => setProject(await createSketch(parent, name, template)),
  select: async () => {
    const chosen = (await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Arduino Sketch', extensions: ['ino'] }] })).filePaths[0];
    return chosen ? setProject(await openSketch(chosen)) : undefined;
  },
  reopen: async file => {
    const item = recent.find(x => x.primary === file);
    if (!item) throw Error('У списку немає цього проєкту.');
    const sketch = await openSketch(item.selected).catch(() => openSketch(item.primary));
    return setProject(sketch);
  },
  close: () => setProject(null),
  projectFiles: async () => project ? projectFiles(project.root) : [],
  children: async dir => entries(await projectPath(project, dir, true)),
  createEntry: payload => operation(() => createEntry(project, payload)),
  read: async file => fs.readFile(await projectPath(project, file), 'utf8'),
  write: async ({ file, content }) => {
    if (typeof content !== 'string' || Buffer.byteLength(content) > 4 * 1024 * 1024) throw Error('Файл перевищує 4 МБ.');
    const target = await projectPath(project, file);
    const stage = await fs.mkdtemp(path.join(path.dirname(target), '.pinway-'));
    try {
      const next = path.join(stage, 'save');
      await fs.writeFile(next, content, { mode: (await fs.stat(target)).mode & 0o777 });
      await fs.rename(next, target);
    } finally { await fs.rm(stage, { recursive: true, force: true }); }
  },
  pinoutSource: url => {
    if (typeof url !== 'string') throw Error('Документація недоступна.');
    const source = new URL(url);
    if (source.protocol !== 'https:' || !['docs.arduino.cc', 'docs.espressif.com'].includes(source.hostname)) {
      throw Error('Документація недоступна.');
    }
    return shell.openExternal(source.href);
  },
  reveal: () => project && shell.showItemInFolder(project.primary),
  dirtyPrompt: async () => (await dialog.showMessageBox(win, {
    type: 'warning', message: 'Зберегти зміни в проєкті?', detail: 'Незбережені зміни буде втрачено.',
    buttons: ['Зберегти', 'Не зберігати', 'Скасувати'], defaultId: 0, cancelId: 2
  })).response,
  quit: exit => { closing = true; if (exit) app.quit(); else win.close(); },
  ports: refresh,
  details: id => arduino.json(['board', 'details', '--fqbn', findProfile(id)]).then(x => x.config_options ?? []),
  probe: address => operation(async () => {
    await refresh();
    const device = devices.find(x => x.address === address);
    if (!device) throw Error('Порт більше не доступний.');
    if (monitor?.port === address) await closeMonitor();
    return arduino.probe(device, text => send('console', text));
  }),
  build: ({ board, options, port, upload }) => operation(async () => {
    if (!project) throw Error('Відкрийте скетч.');
    const args = boardArgs(board, options);
    const device = upload ? (await refresh(), checkedPort(port)) : null;
    await arduino.checkHost();
    const dir = await workspace();
    try {
      const prepared = await buildSketch(project, dir);
      const buildPath = path.join(dir, 'output');
      const output = text => send('console', text);
      send('console', `› Компіляція: ${board}\n`);
      const build = await arduino.run(['compile', ...args, '--build-path', buildPath, prepared.input], {
        timeout: 600000, output
      });
      const result = { diagnostics: diagnostics(build.stderr + '\n' + build.stdout, project, prepared), ok: build.ok };
      if (!build.ok) return { ...result, message: build.reason || (/No such file or directory/.test(build.stderr)
        ? 'Не знайдено заголовок. Перевірте назву й встановіть потрібну бібліотеку на вкладці «Бібліотеки» зліва.'
        : 'Компіляція не вдалася. Перегляньте консоль.') };
      if (!upload) return { ...result, message: 'Компіляція успішна.' };

      if (monitor?.port === port) {
        send('serial', '\nМонітор закрито перед завантаженням. Відкрийте його знову після прошивання.\n');
        await closeMonitor();
      }
      await refresh();
      if (!devices.some(x => x.key === device.key)) return { ...result, ok: false, message: 'Плату від’єднано. Підключіть її, виберіть порт і повторіть.' };
      send('console', `\n› Завантаження: ${port}\n`);
      const job = await arduino.run(['upload', ...args, '--port', port, '--input-dir', buildPath, prepared.input], { output, timeout: 180000 });
      if (job.ok) return { ...result, message: 'Прошивку завантажено.' };
      const present = await refresh().then(list => list.some(x => x.key === device.key), () => true);
      let hint = 'Перевірте плату, профіль і бутлоадер, а потім повторіть.';
      if (!present) hint = 'Плату від’єднано. Підключіть її й повторіть.';
      else if (/busy|resource temporarily unavailable|already in use/i.test(job.stderr + job.stdout)) hint = 'Порт зайнятий. Закрийте інший монітор або програму й повторіть.';
      return { ...result, ok: false, message: 'Завантаження не вдалося. ' + (job.reason ? job.reason + ' ' : '') + hint };
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }),
  installed: async () => {
    const list = await arduino.json(['lib', 'list']);
    return Object.fromEntries((list.installed_libraries || []).map(({ library }) => [library.name, library.version]));
  },
  search: async query => {
    if (typeof query !== 'string' || !query.trim() || query.length > 120) return [];
    const name = query.trim();
    const needle = name.toLowerCase();
    const list = await arduino.json(['lib', 'search', 'name:' + JSON.stringify(name)]);
    return (list.libraries || []).sort((a, b) =>
      Number(b.name.toLowerCase() === needle) - Number(a.name.toLowerCase() === needle)
      || a.name.localeCompare(b.name)
    ).slice(0, 60).map(x => ({
      name: x.name, version: x.latest?.version, description: x.latest?.sentence, author: x.latest?.author
    }));
  },
  refreshLibraries: () => operation(async () => {
    send('console', '› Оновлення індексу бібліотек…\n');
    const r = await arduino.run(['lib', 'update-index'], { output: text => send('console', text) });
    if (!r.ok) throw Error(r.stderr.trim() || r.reason || 'Не вдалося оновити індекс.');
  }),
  install: name => operation(async () => {
    if (typeof name !== 'string' || !name || name.startsWith('-') || name.length > 120) throw Error('Некоректна назва.');
    send('console', `› Встановлення бібліотеки: ${name}\n`);
    const r = await arduino.run(['lib', 'install', name], { output: text => send('console', text) });
    if (!r.ok) throw Error(r.stderr.trim() || r.reason || 'Не вдалося встановити бібліотеку.');
  }),
  serialOpen: ({ port, baud }) => operation(async () => {
    if (!Number.isInteger(baud) || baud < 300 || baud > 2000000) throw Error('Непідтримувана швидкість.');
    await refresh();
    checkedPort(port);
    await closeMonitor();
    const job = arduino.start(['monitor', '--port', port, '--config', 'baudrate=' + baud, '--quiet', '--raw'], {
      timeout: 0, keepInput: true, limit: 8192, output: text => send('serial', text)
    });
    const open = { ...job, port };
    monitor = open;
    send('monitor', { port });
    void job.done.then(r => {
      if (monitor !== open) return;
      monitor = null;
      if (!r.ok && !r.signal) send('serial', '\nНе вдалося відкрити або прочитати порт. Перевірте, чи він підключений і вільний.\n');
      send('monitor', null);
    });
  }),
  serialSend: async ({ port, text }) => {
    if (!monitor || monitor.port !== port) throw Error('Спочатку відкрийте послідовний порт.');
    if (typeof text !== 'string' || !text.length || Buffer.byteLength(text) > 4096 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) {
      throw Error('Введіть текст команди до 4096 байтів.');
    }
    await monitor.write(text);
  },
  serialClose: closeMonitor
};

ipcMain.handle('pinway', async (event, action, payload) => {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame ||
      !Object.hasOwn(handlers, action)) return { error: 'Дія недоступна.' };
  try { return { data: await handlers[action](payload) }; }
  catch (e) { return { error: e.message || 'Невідома помилка.' }; }
});

function createWindow() {
  if (win) return;
  closing = false;
  win = new BrowserWindow({
    width: 1240, height: 820, minWidth: 830, minHeight: 560, show: false,
    backgroundColor: '#15181e', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 17, y: 18 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.once('ready-to-show', () => win?.show());
  win.on('close', e => { if (!closing) { e.preventDefault(); send('shortcut', 'window'); } });
  win.on('closed', () => { win = null; project = null; void closeMonitor(); });
  void win.loadFile(path.join(__dirname, 'index.html'));
}

const command = action => () => send('shortcut', action);
const lock = app.requestSingleInstanceLock();
if (!lock) app.exit();
else {
  app.on('second-instance', () => { if (win?.isMinimized()) win.restore(); win?.focus(); });
  app.whenReady().then(async () => {
    recent = await fs.readFile(historyFile, 'utf8').then(JSON.parse).catch(() => []);
    if (!Array.isArray(recent)) recent = [];
    recovery = await fs.readFile(recoveryFile, 'utf8').then(JSON.parse).catch(() => null);
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Pinway IDE', submenu: [{ role: 'about' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
        { label: 'Вийти з Pinway IDE', accelerator: 'Cmd+Q', click: () => win ? command('quit')() : app.quit() }] },
      { label: 'Файл', submenu: [
        { label: 'Новий проєкт', accelerator: 'Cmd+N', click: command('new') },
        { label: 'Відкрити скетч', accelerator: 'Cmd+O', click: command('open') },
        { label: 'Швидко відкрити файл', accelerator: 'CmdOrCtrl+P', click: command('quickOpen') },
        { label: 'Зберегти файл', accelerator: 'Cmd+S', click: command('save') },
        { label: 'Закрити проєкт', accelerator: 'Cmd+Shift+W', click: command('close') },
        { label: 'Закрити вікно', accelerator: 'Cmd+W', click: command('window') }
      ] },
      { role: 'editMenu' },
      { label: 'Вигляд', submenu: [
        { label: 'Збільшити масштаб', accelerator: 'CmdOrCtrl+=', click: command('zoomIn') },
        { label: 'Зменшити масштаб', accelerator: 'CmdOrCtrl+-', click: command('zoomOut') },
        { label: 'Фактичний розмір', accelerator: 'CmdOrCtrl+0', click: command('zoomReset') }
      ] },
      { role: 'windowMenu' }
    ]));
    createWindow();
  });
  app.on('window-all-closed', () => {});
  app.on('activate', () => { if (!win) createWindow(); });
  app.on('before-quit', e => { if (win && !closing) { e.preventDefault(); command('quit')(); } });
}
