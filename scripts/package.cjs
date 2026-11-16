const packager = require('@electron/packager').packager;
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const project = path.resolve(__dirname, '..');
  const runtime = path.join(project, '.toolchain/runtime');
  fs.accessSync(path.join(runtime, 'seed/packages'));
  const [out] = await packager({
    dir: project, out: path.resolve(project, process.env.PINWAY_PACKAGE_OUT || 'dist'), name: 'Pinway IDE',
    platform: 'darwin', arch: 'arm64', appBundleId: 'dev.binio.pinway',
    overwrite: true, asar: true, prune: false, icon: path.join(project, 'dist/Pinway.icns'),
    ignore: [/^\/(?:dist|\.toolchain|\.git|node_modules|scripts|tests|assets|web|server)(?:\/|$)/, /^\/src\/ui\.js$/],
    extendInfo: { LSMinimumSystemVersion: '13.0.0', NSHumanReadableCopyright: 'Pinway IDE • Third-party notices in Resources' }
  });
  const bundle = path.join(out, 'Pinway IDE.app');
  const res = path.join(bundle, 'Contents/Resources');
  execFileSync('/bin/cp', ['-cR', runtime, path.join(res, 'arduino')], { stdio: 'inherit' });
  fs.chmodSync(path.join(res, 'arduino'), 0o755);
  fs.cpSync(path.join(project, 'licenses'), path.join(res, 'Arduino-Licenses'), { recursive: true });
  fs.copyFileSync(path.join(out, 'LICENSE'), path.join(res, 'Electron-LICENSE.txt'));
  fs.copyFileSync(path.join(out, 'LICENSES.chromium.html'), path.join(res, 'Chromium-LICENSES.html'));
  for (const name of ['THIRD_PARTY.md', 'npm-notices.txt']) {
    fs.copyFileSync(path.join(project, name === 'npm-notices.txt' ? 'dist' : '', name), path.join(res, name));
  }
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', bundle], { stdio: 'inherit' });
  console.log(bundle);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
