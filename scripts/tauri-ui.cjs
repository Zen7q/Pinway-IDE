const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist/tauri-ui');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'design-tokens.css', 'studio.css', 'style.css', 'ui.bundle.js', 'tauri-bridge.js']) {
  fs.copyFileSync(path.join(root, 'src', name), path.join(output, name));
}
