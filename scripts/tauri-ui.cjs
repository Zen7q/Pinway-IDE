const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist/tauri-ui');
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'design-tokens.css', 'studio.css', 'style.css', 'designer.css', 'display.css', 'ui.bundle.js', 'tauri-bridge.js']) {
  fs.copyFileSync(path.join(root, 'src', name), path.join(output, name));
}
