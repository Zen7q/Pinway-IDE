const { _electron } = require('playwright-core');
const expect = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const appPath = process.env.PINWAY_APP || path.resolve('dist/Pinway IDE-darwin-arm64/Pinway IDE.app/Contents/MacOS/Pinway IDE');
const libraries = process.argv.includes('--libraries');
const screenshots = process.argv.includes('--screenshots');
// macOS cannot initialize Chromium's sandbox inside the offline test's seatbelt profile.
const args = process.argv.includes('--offline') ? ['--no-sandbox'] : [];
let fixture, instance;

function status(page, text, timeout = 260000) {
  return page.getByRole('status').filter({ hasText: text }).waitFor({ timeout });
}
async function edit(page, content) {
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Meta+A');
  await page.keyboard.insertText(content.trimEnd());
}
async function selectBoard(page, label) {
  const button = page.locator('#board-button');
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
  await page.getByLabel('Пошук плати').fill(label);
  await page.locator('.board-choice').filter({ has: page.getByText(label, { exact: true }) }).click();
}
async function launch(env) {
  instance = await _electron.launch({ executablePath: appPath, args, env, timeout: 45000 });
  const page = await instance.firstWindow({ timeout: 45000 });
  page.on('pageerror', error => console.error('Renderer:', error));
  page.on('console', message => { if (message.type() === 'error') console.error('Browser:', message.text()); });
  await page.locator('#new').waitFor();
  return page;
}
async function screenshot(page, name) {
  if (screenshots) {
    await fs.mkdir('dist/screenshots', { recursive: true });
    await page.screenshot({ path: 'dist/screenshots/' + name + '.png' });
  }
}

(async () => {
  fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pinway-app-test-')));
  const home = path.join(fixture, 'home');
  const sketches = path.join(fixture, 'My Sketches');
  const data = path.join(fixture, 'Application Support/Pinway IDE');
  await Promise.all([fs.mkdir(home), fs.mkdir(sketches), fs.mkdir(data, { recursive: true })]);
  const env = { ...process.env, HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', PINWAY_USER_DATA: data };
  let page = await launch(env);
  await status(page, 'Готово');
  await screenshot(page, 'welcome');
  await instance.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async (_window, options) =>
      ({ canceled: false, filePaths: [options.properties.includes('openDirectory') ? folder : globalThis.testIno] });
    dialog.showMessageBox = async () => ({ response: globalThis.testChoice ?? 2 });
  }, sketches);
  await page.locator('#new').click();
  await page.locator('#name').fill('PinwaySmoke');
  await page.locator('#pick-folder').click();
  await page.locator('#parent-label').filter({ hasText: sketches }).waitFor();
  await page.locator('#create').click();
  await status(page, 'Проєкт відкрито');
  const ino = path.join(sketches, 'PinwaySmoke/PinwaySmoke.ino');
  expect.match(await fs.readFile(ino, 'utf8'), /void setup\(\)/);
  await page.locator('#verify').click();
  await status(page, 'Виберіть профіль плати');
  // Verify completion in the actual CodeMirror editor.
  await edit(page, 'void setup() {\n  digitalW');
  await page.locator('.cm-tooltip-autocomplete').getByText('digitalWrite', { exact: true }).waitFor({ timeout: 12000 });
  const good = 'void setup() { Serial.begin(115200); }\nvoid loop() { Serial.println("Pinway OK"); delay(1000); }';
  await edit(page, good);
  await page.keyboard.press('Meta+S');
  await status(page, 'Файл збережено');
  expect.equal(await fs.readFile(ino, 'utf8'), good);
  console.log('OK: create / folder selection / completion / Cmd+S without hardware');

  await page.getByRole('button', { name: 'Нова папка', exact: true }).click();
  await page.locator('#entry-name').fill('src');
  await page.locator('#entry-create').click();
  await status(page, 'Папку створено');
  await page.getByRole('button', { name: 'Новий файл', exact: true }).click();
  await page.locator('#entry-name').fill('helpers.h');
  await page.locator('#entry-create').click();
  await status(page, 'Файл створено');
  const created = path.join(path.dirname(ino), 'src/helpers.h');
  expect.equal(await fs.readFile(created, 'utf8'), '');
  await edit(page, '#pragma once');
  await page.keyboard.press('Meta+S');
  await status(page, 'Файл збережено');
  await page.getByRole('button', { name: 'Новий файл', exact: true }).click();
  await page.locator('#entry-name').fill('helpers.h');
  await page.locator('#entry-create').click();
  await page.locator('#entry-error').filter({ hasText: 'вже є' }).waitFor();
  expect.equal(await fs.readFile(created, 'utf8'), '#pragma once');
  await page.locator('#entry-dialog').getByRole('button', { name: 'Скасувати' }).click();
  await page.locator('#tabs').getByRole('button', { name: 'PinwaySmoke.ino' }).click();
  await selectBoard(page, 'XIAO_ESP32S3');
  console.log('OK: nested folder and editable file, duplicate protection, selection from full board catalog');

  const cases = libraries ? ['Arduino Uno R3'] : ['Arduino Uno R3', 'Arduino Nano', 'ESP32 Dev Module', 'ESP32C3 Dev Module'];
  for (const board of cases) {
    await selectBoard(page, board);
    if (board === 'Arduino Nano') {
      await page.locator('#tools-button').click();
      await page.getByLabel('Processor', { exact: true }).selectOption('atmega328old');
      await page.keyboard.press('Escape');
    }
    await page.locator('#verify').click();
    await status(page, 'Компіляція успішна.', 390000).catch(async error => {
      console.error(await page.locator('#console-log').textContent());
      throw error;
    });
    console.log('OK: compiled in .app for ' + board);
  }

  await selectBoard(page, 'Arduino Uno R3');
  await page.locator('#upload').click();
  await status(page, 'Виберіть підключений порт');
  await page.keyboard.press('Escape');
  await edit(page, 'void setup() {\n  missingPinwaySymbol();\n}\nvoid loop() {}');
  await page.locator('#verify').click();
  await status(page, 'Компіляція не вдалася');
  await page.locator('.cm-lintRange-error').filter({ hasText: 'm' }).first().waitFor({ timeout: 10000 });
  expect.match(await page.locator('.cm-line').filter({ has: page.locator('.cm-lintRange-error') }).first().textContent(), /missingPinwaySymbol/);
  expect.match(await page.locator('#console-log').textContent(), /PinwaySmoke\.ino:2:\d+: error:/);
  await screenshot(page, 'editor');
  await edit(page, '#include <PinwayMissingHeader.h>\n' + good);
  await page.locator('#verify').click();
  await status(page, 'Не знайдено заголовок');
  expect.match(await page.locator('#console-log').textContent(), /PinwayMissingHeader\.h/);
  console.log('OK: missing port, .ino line diagnostics, missing library');

  if (libraries) {
    await page.getByRole('button', { name: 'Бібліотеки', exact: true }).click();
    await page.locator('#library-status').filter({ hasText: 'Введіть назву' }).waitFor();
    await page.locator('#editor').waitFor();
    await page.locator('#query').fill('ArduinoJson');
    await page.locator('#library-search button[type="submit"]').click();
    const library = page.locator('.library-row').filter({ has: page.locator('strong').filter({ hasText: /^ArduinoJson$/ }) });
    const install = library.getByRole('button', { name: /^Встановити/ });
    await install.waitFor({ timeout: 45000 }).catch(async error => {
      console.error(await page.locator('#library-status').textContent());
      console.error(await page.locator('#library-results').innerText());
      throw error;
    });
    const names = await page.locator('.library-row strong').allTextContents();
    expect.ok(names.length && names.every(name => name.toLowerCase().includes('arduinojson')));
    await install.click();
    await library.getByText(/^Встановлено: /).waitFor({ timeout: 90000 }).catch(async error => {
      console.error(await page.locator('#library-status').textContent());
      throw error;
    });
    console.log('OK: ArduinoJson installation, ' + await library.locator('small').textContent());
    await screenshot(page, 'libraries');
    await page.getByRole('button', { name: 'Файли', exact: true }).click();
    await edit(page, '#include <ArduinoJson.h>\nvoid setup() { JsonDocument doc; doc["pinway"] = true; }\nvoid loop() {}');
    await selectBoard(page, 'XIAO_ESP32S3');
    await page.locator('#verify').click();
    await status(page, 'Компіляція успішна.', 390000);
    console.log('OK: compiled sketch that uses the installed ArduinoJson library');
  }

  const old = await fs.readFile(ino, 'utf8');
  await edit(page, good + '\n// Unsaved');
  await page.locator('#home').click();
  await page.locator('#workbench').waitFor();
  await instance.evaluate(() => { globalThis.testChoice = 1; });
  await page.locator('#home').click();
  await page.locator('#welcome').waitFor();
  expect.equal(await fs.readFile(ino, 'utf8'), old);
  const odd = path.join(sketches, 'Інша папка');
  await fs.mkdir(odd);
  const oddIno = path.join(odd, 'New Sketch.ino');
  const header = path.join(odd, 'helper.h');
  await fs.writeFile(oddIno, '#include "helper.h"\nvoid setup() {}\nvoid loop() { nope(); }\n');
  await fs.writeFile(header, '#pragma once\r\n');
  await instance.evaluate((_electron, file) => { globalThis.testIno = file; }, oddIno);
  await page.locator('#open').click();
  await status(page, 'Проєкт відкрито');
  await page.locator('#tree').getByRole('button', { name: 'helper.h' }).click();
  await page.locator('#tabs').getByRole('button', { name: 'helper.h' }).waitFor();
  await edit(page, '#pragma once\ninline void pinwayTest() {}');
  await page.locator('#tree').getByRole('button', { name: 'New Sketch.ino' }).click();
  await selectBoard(page, 'Arduino Uno R3');
  await page.locator('#verify').click();
  await status(page, 'Компіляція не вдалася');
  await page.locator('.cm-line').filter({ has: page.locator('.cm-lintRange-error') }).filter({ hasText: 'nope' }).waitFor();
  expect.match(await fs.readFile(header, 'utf8'), /inline void pinwayTest/);
  await edit(page, good + '\n// Saved on close');
  await instance.evaluate(() => { globalThis.testChoice = 0; });
  await page.locator('#home').click();
  await page.locator('#welcome').waitFor();
  expect.match(await fs.readFile(oddIno, 'utf8'), /Saved on close/);
  await instance.close();
  page = await launch(env);
  await page.locator('#recent-list').getByRole('button', { name: /New Sketch/ }).click();
  await status(page, 'Проєкт відкрито');
  await page.locator('.cm-line').getByText('Saved on close', { exact: false }).waitFor();
  console.log('OK: open noncanonical sketch / tree / .ino diagnostic mapping / discard and save / recents after restart');
  console.log('Packaged smoke checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await instance?.close().catch(() => {});
  if (fixture) await fs.rm(fixture, { recursive: true, force: true });
});
