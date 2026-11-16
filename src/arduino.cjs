const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const ESP_INDEX = 'https://espressif.github.io/arduino-esp32/package_esp32_index.json';
const profiles = [
  { id: 'arduino:avr:uno', name: 'Arduino Uno R3', chip: 'ATmega328P' },
  { id: 'arduino:avr:nano', name: 'Arduino Nano', chip: 'ATmega328P' },
  { id: 'esp32:esp32:esp32', name: 'ESP32 Dev Module', chip: 'ESP32' },
  { id: 'esp32:esp32:esp32c3', name: 'ESP32C3 Dev Module', chip: 'ESP32-C3' }
];

function execute(bin, args, { env = process.env, output, timeout = 120000, keepInput = false, limit = 80 * 1024 * 1024 } = {}) {
  const child = spawn(bin, args, { env, detached: true, stdio: [keepInput ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  let forceStop;
  const signal = name => { try { if (child.pid) process.kill(-child.pid, name); } catch (e) { if (e.code !== 'ESRCH') throw e; } };
  function stop() {
    if (forceStop) return;
    signal('SIGTERM');
    forceStop = setTimeout(() => signal('SIGKILL'), 2000);
    forceStop.unref();
  }
  const done = new Promise(resolve => {
    let stdout = '', stderr = '', reason = '';
    const timer = timeout ? setTimeout(() => { reason = 'Час очікування вичерпано.'; stop(); }, timeout) : null;
    const append = (source, stream) => {
      stream.setEncoding('utf8');
      stream.on('data', chunk => {
        if (source === 'stdout') stdout = (stdout + chunk).slice(-limit);
        else stderr = (stderr + chunk).slice(-limit);
        output?.(chunk, source);
      });
    };
    append('stdout', child.stdout);
    append('stderr', child.stderr);
    child.on('error', error => { reason = error.message; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(forceStop);
      resolve({ ok: code === 0 && !reason, stdout, stderr, reason, code, signal });
    });
  });
  function write(text) {
    if (!child.stdin?.writable) return Promise.reject(Error('Монітор порту закрито.'));
    return new Promise((resolve, reject) => {
      child.stdin.write(text, error => error ? reject(error) : resolve());
    });
  }
  child.stdin?.on('error', () => { /* writes report errors through their callbacks */ });
  return { stop, done, write };
}

function makeArduino(runtime, storage) {
  const data = path.join(storage, 'arduino-1.5.1-avr-1.8.8-esp-3.3.12');
  const cli = path.join(runtime, 'arduino-cli');
  const user = path.join(storage, 'Sketchbook');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ARDUINO_')));
  Object.assign(env, {
    ARDUINO_DIRECTORIES_DATA: data, ARDUINO_DIRECTORIES_USER: user,
    ARDUINO_DIRECTORIES_DOWNLOADS: path.join(storage, 'downloads'),
    ARDUINO_BUILD_CACHE_PATH: path.join(storage, 'build-cache'),
    ARDUINO_BOARD_MANAGER_ADDITIONAL_URLS: ESP_INDEX,
    ARDUINO_UPDATER_ENABLE_NOTIFICATION: 'false',
    LC_ALL: 'en_US.UTF-8'
  });
  let ready;
  async function setup() {
    const seed = path.join(runtime, 'seed');
    await fs.access(cli).catch(() => { throw Error('Arduino CLI не знайдено. Для запуску із коду виконайте npm run seed.'); });
    await fs.mkdir(storage, { recursive: true });
    await fs.mkdir(user, { recursive: true });
    if (!(await fs.stat(data).then(() => true, () => false))) {
      const stage = await fs.mkdtemp(path.join(storage, '.toolchain-'));
      try {
        const copy = await execute('/bin/cp', ['-cR', seed + '/.', stage], { timeout: 300000 }).done;
        if (!copy.ok) throw Error(copy.stderr || copy.reason || 'Не вдалося скопіювати інструменти Arduino.');
        await fs.rename(stage, data);
      } finally { await fs.rm(stage, { force: true, recursive: true }); }
    }
  }

  const initialize = () => ready ??= setup().catch(error => { ready = undefined; throw error; });
  const start = (args, options) => execute(cli, args, { env, ...options });
  async function run(args, options) { await initialize(); return start(args, options).done; }
  async function json(args) {
    const r = await run([...args, '--json'], { timeout: 25000 });
    let result;
    try { result = JSON.parse(r.stdout); } catch { /* errors may be plain text */ }
    if (!r.ok || !result) throw Error(result?.error || r.stderr.trim() || r.reason || r.stdout.trim() || 'Arduino CLI не відповідає.');
    return result;
  }

  async function ports() {
    const result = await json(['board', 'list']);
    const active = new Set((await fs.readdir('/dev')).filter(x => x.startsWith('cu.')).map(x => '/dev/' + x));
    return (result.detected_ports || []).filter(({ port }) =>
      active.has(port.address) && port.protocol === 'serial' && !/Bluetooth|debug-console/i.test(port.address)
    ).map(({ port, matching_boards }) => ({
      address: port.address, label: port.label,
      vid: port.properties?.vid, pid: port.properties?.pid,
      key: [port.address, port.properties?.vid, port.properties?.pid, port.properties?.serialNumber].join('|'),
      matches: (matching_boards || []).filter(x => x.fqbn).map(x => ({ id: x.fqbn, name: x.name }))
    })).sort((a, b) => a.address.localeCompare(b.address));
  }

  async function probe(device, output) {
    const vid = (device.vid || '').toLowerCase().replace(/^0x/, '');
    // USB-UART vendors and ESP's generic USB bridge identify an interface, not the board.
    const genericBridge = ['10c4', '1a86', '0403', '067b', '303a'].includes(vid);
    if (device.matches.length === 1 && !genericBridge) {
      const best = device.matches[0];
      return { board: best, chip: profiles.find(p => p.id === best.id)?.chip || '' };
    }
    const base = path.join(data, 'packages/esp32/tools/esptool_py/5.3.1');
    const r = await execute(path.join(base, 'esptool'), [
      '--port', device.address, '--baud', '115200', '--connect-attempts', '2', '--no-stub', 'read-mac'
    ], { timeout: 16000, output }).done;
    const body = r.stdout + r.stderr;
    const match = body.match(/\bChip(?: type)?\s*(?:is\s+|:\s*)(ESP32(?:-[A-Z][A-Z0-9]*)?(?:-[A-Z0-9]+)?)/i)
      || body.match(/Connected to (ESP32(?:-[A-Z][A-Z0-9]*)?)/i);
    let chip = match?.[1]?.toUpperCase() || '';
    if (/^ESP32-(?:D0WD|S0WD|U4WDH|PICO|D2WD)/.test(chip)) chip = 'ESP32';
    return { chip, board: null };
  }

  async function checkHost() {
    if (process.arch === 'arm64') {
      const r = await execute('/usr/bin/arch', ['-x86_64', '/usr/bin/true']).done;
      if (!r.ok) throw Error('Для службового інструмента Arduino (ctags) потрібна Rosetta 2. Встановіть її через macOS або командою softwareupdate --install-rosetta.');
    }
  }

  return { initialize, run, start, json, ports, probe, checkHost };
}

async function workspace() {
  return fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pinway-build-')));
}

module.exports = { makeArduino, profiles, workspace };
