import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('separately downloaded workspaces share sidebar width and one resize observer', async () => {
  const values = new Map();
  let observers = 0;
  let width;
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  globalThis.window = { addEventListener: () => { observers++; } };
  globalThis.document = { documentElement: { clientWidth: 1320, style: { setProperty: (_, value) => { width = value; } } } };
  const source = await readFile(new URL('../src/workspace-panels.js', import.meta.url), 'utf8');
  const data = 'data:text/javascript,' + encodeURIComponent(source);
  const code = await import(data + '#code');
  const build = await import(data + '#build');
  code.setSidebarWidth(286);
  assert.equal(build.sidebarWidth(), 286);
  build.setSidebarWidth(310);
  code.refreshSidebarWidth();
  assert.equal(width, '310px');
  assert.equal(observers, 1);
  delete globalThis[Symbol.for('pinway.workspacePanels')];
});
