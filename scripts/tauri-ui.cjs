const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist/tauri-ui');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, 'assets/Pinway.svg'), path.join(output, 'Pinway.svg'));
for (const name of ['index.html', 'style.css', 'designer.css', 'ui.bundle.js', 'tauri-bridge.js']) {
  fs.copyFileSync(path.join(root, 'src', name), path.join(output, name));
}
