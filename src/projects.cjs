const fs = require('node:fs/promises');
const path = require('node:path');

const textFile = /\.(ino|pde|cpp|cc|cxx|c|h|hh|hpp|s|asm|txt|md|json|ya?ml|csv|properties|ini|ld|py|sh)$/i;
const sketchName = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$/;
const ignored = name => name.startsWith('.') || ['node_modules', 'build', 'dist'].includes(name);
const starter = `void setup() {
  // Налаштування виконується один раз.
}

void loop() {
  // Код тут повторюється.
}
`;

async function openSketch(file) {
  if (!/\.ino$/i.test(file)) throw Error('Виберіть файл .ino.');
  const selected = await fs.realpath(file);
  if (!(await fs.stat(selected)).isFile()) throw Error('Виберіть файл .ino.');
  const root = path.dirname(selected);
  const canonical = path.join(root, path.basename(root) + '.ino');
  const primary = await fs.lstat(canonical).then(s => s.isFile() ? canonical : selected, () => selected);
  return { root, primary, selected, name: path.basename(primary, path.extname(primary)) };
}

async function createSketch(parent, name) {
  if (!sketchName.test(name) || name.endsWith('.')) {
    throw Error('Назва скетчу: до 63 символів, латинські літери, цифри, _, - або крапка.');
  }
  const dir = path.join(parent, name);
  await fs.mkdir(dir).catch(err => {
    if (err.code === 'EEXIST') throw Error('У цій папці вже є проєкт з такою назвою.');
    throw err;
  });
  const file = path.join(dir, name + '.ino');
  await fs.writeFile(file, starter, { flag: 'wx' });
  return openSketch(file);
}

async function entries(root) {
  const children = await fs.readdir(root, { withFileTypes: true });
  return children.filter(e => !ignored(e.name) && (e.isDirectory() || e.isFile()))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map(e => ({ name: e.name, path: path.join(root, e.name), folder: e.isDirectory(), editable: textFile.test(e.name) }));
}

async function projectPath(project, file, directory = false) {
  if (!project || typeof file !== 'string') throw Error('Спочатку відкрийте проєкт.');
  const actual = await fs.realpath(file);
  const within = path.relative(project.root, actual);
  if (within === '..' || within.startsWith('..' + path.sep) || path.isAbsolute(within)) {
    throw Error('Шлях за межами проєкту.');
  }
  const info = await fs.stat(actual);
  if (directory ? !info.isDirectory() : !info.isFile() || !textFile.test(actual)) {
    throw Error('Цей тип файлу не підтримується редактором.');
  }
  if (!directory && info.size > 4 * 1024 * 1024) throw Error('Файл перевищує 4 МБ.');
  return actual;
}

async function createEntry(project, { parent, name, folder }) {
  if (typeof name !== 'string' || !name.trim() || /[\/\\\x00-\x1f]/.test(name) || ignored(name)) {
    throw Error('Введіть видиму назву без роздільників шляху.');
  }
  const destination = path.join(await projectPath(project, parent, true), name);
  try {
    if (folder) await fs.mkdir(destination);
    else await fs.writeFile(destination, '', { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw Error('У цій папці вже є елемент з такою назвою.');
    throw error;
  }
  return { path: destination, editable: !folder && textFile.test(name) };
}

async function buildSketch(project, workspace) {
  const folder = path.basename(project.root);
  if (sketchName.test(folder) && project.primary === path.join(project.root, folder + '.ino')) {
    return { input: project.root, map: p => p };
  }
  let name = project.name.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^[^a-zA-Z0-9_]/, '_').slice(0, 63) || 'Sketch';
  const all = await entries(project.root);
  const other = new Set(all.filter(x => x.path !== project.primary).map(x => x.name.toLowerCase()));
  const base = name.slice(0, 52);
  for (let i = 1; other.has((name + '.ino').toLowerCase()); i++) name = base + '_' + i;
  const input = path.join(workspace, name);
  await fs.mkdir(input);
  const newPrimary = path.join(input, name + '.ino');
  await fs.copyFile(project.primary, newPrimary);
  for (const e of all) {
    if (e.path === project.primary) continue;
    if (e.folder && e.name === 'src') {
      await fs.cp(e.path, path.join(input, e.name), {
        recursive: true, filter: async p => !(await fs.lstat(p)).isSymbolicLink() && !ignored(path.basename(p))
      });
    } else if (!e.folder && /\.(ino|pde|c|cc|cpp|cxx|s|h|hh|hpp|csv|ld|ya?ml)$/i.test(e.name)) {
      await fs.copyFile(e.path, path.join(input, e.name));
    }
  }
  return { input, map(p) {
    if (p === newPrimary) return project.primary;
    return p.startsWith(input + path.sep) ? path.join(project.root, path.relative(input, p)) : p;
  } };
}

function diagnostics(log, project, prepared) {
  const seen = new Set();
  return log.split(/\r?\n/).flatMap(text => {
    const m = text.match(/^(.+?):(\d+)(?::(\d+))?: (fatal error|error|warning|note): (.*)$/);
    if (!m || m[4] === 'note') return [];
    const raw = path.isAbsolute(m[1]) ? path.normalize(m[1]) : path.resolve(prepared.input, m[1]);
    const file = prepared.map(raw.replace(/^\/var\//, '/private/var/'));
    if (!file.startsWith(project.root + path.sep)) return [];
    const error = { file, line: Number(m[2]), column: Number(m[3]) || 1,
      severity: m[4] === 'warning' ? 'warning' : 'error', message: m[5] };
    const key = JSON.stringify(error);
    if (seen.has(key)) return [];
    seen.add(key);
    return [error];
  });
}

module.exports = { openSketch, createSketch, createEntry, entries, projectPath, buildSketch, diagnostics };
