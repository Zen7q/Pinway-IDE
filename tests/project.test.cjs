const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { openSketch, createSketch, entries, projectPath, buildSketch, diagnostics } = require('../src/projects.cjs');

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'pinway-test-')));
  t.after(() => fs.rm(root, { force: true, recursive: true }));
  return root;
}
test('creation creates an Arduino layout and never replaces an existing folder', async t => {
  const root = await fixture(t);
  const p = await createSketch(root, 'Blink');
  const ino = path.join(root, 'Blink/Blink.ino');
  assert.equal(p.primary, ino);
  assert.match(await fs.readFile(ino, 'utf8'), /void setup\(\)[\s\S]*void loop\(\)/);
  await assert.rejects(createSketch(root, 'Blink'), /вже є/);
  await assert.rejects(createSketch(root, '../outside'));
});
test('build normalizes an existing .ino outside a canonical folder and maps its compiler diagnostics', async t => {
  const root = await fixture(t);
  const original = path.join(root, 'Моя папка');
  await fs.mkdir(original);
  const input = path.join(original, 'different name.ino');
  await fs.writeFile(input, 'void setup() {}');
  await fs.mkdir(path.join(original, 'src'));
  await fs.writeFile(path.join(original, 'src/pin.h'), '#pragma once');
  const p = await openSketch(input);
  const staged = await buildSketch(p, root);
  const normalized = path.join(staged.input, 'different_name.ino');
  assert.equal(await fs.readFile(normalized, 'utf8'), 'void setup() {}');
  assert.equal(await fs.readFile(path.join(staged.input, 'src/pin.h'), 'utf8'), '#pragma once');
  assert.deepEqual(diagnostics(normalized + ':7:3: error: wrong\nnot a diagnostic', p, staged),
    [{ file: input, line: 7, column: 3, severity: 'error', message: 'wrong' }]);
});
test('opening a secondary tab keeps the main sketch; tree and editor refuse outside symlinks', async t => {
  const root = await fixture(t);
  const sketch = await createSketch(root, 'Test');
  const extra = path.join(sketch.root, 'Extra.ino');
  await fs.writeFile(extra, '');
  const p = await openSketch(extra);
  assert.equal(p.primary, sketch.primary);
  assert.equal(p.selected, extra);
  const outside = path.join(root, 'outside.h');
  await fs.writeFile(outside, '');
  const link = path.join(sketch.root, 'link.h');
  await fs.symlink(outside, link);
  assert.equal((await entries(sketch.root)).find(x => x.path === link), undefined);
  await assert.rejects(projectPath(p, link), /за межами/);
});
