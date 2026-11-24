#!/usr/bin/env python3
"""Build a release-mode Code + AVR installer on the current platform."""
import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def run(*args):
    subprocess.run(args, check=True, cwd=ROOT)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--debug', action='store_true')
    options = parser.parse_args()
    os.chdir(ROOT)
    local = ROOT / '.toolchain/rust'
    if (local / 'cargo/bin/cargo').is_file():
        os.environ.update(RUSTUP_HOME=str(local / 'rustup'), CARGO_HOME=str(local / 'cargo'))
        os.environ['PATH'] = str(local / 'cargo/bin') + os.pathsep + os.environ['PATH']
    run('python3' if platform.system() != 'Windows' else 'python', 'scripts/prepare-release.py')
    run('node', 'node_modules/@tauri-apps/cli/tauri.js', 'icon', 'assets/Pinway.png', '--output', '.toolchain/icons')
    run('python3' if platform.system() != 'Windows' else 'python', 'scripts/prepare-notices.py')
    output = Path(os.environ.get('PINWAY_TAURI_OUT', str(ROOT / 'dist' / ('release-' + time.strftime('%Y%m%d-%H%M%S')))))
    if output.exists() and any(output.iterdir()):
        raise RuntimeError('Choose a new PINWAY_TAURI_OUT directory to preserve previous builds')
    output.mkdir(parents=True, exist_ok=True)
    system = platform.system()
    bundle = {'Darwin': 'app', 'Windows': 'nsis', 'Linux': 'deb'}[system]
    args = ['node', 'node_modules/@tauri-apps/cli/tauri.js', 'build', '--bundles', bundle]
    if options.debug:
        args.append('--debug')
    run(*args)
    metadata = json.loads(subprocess.check_output(['cargo', 'metadata', '--no-deps', '--format-version', '1'], text=True))
    target = Path(metadata['target_directory']) / ('debug' if options.debug else 'release') / 'bundle'
    version = json.loads((ROOT / 'package.json').read_text(encoding="utf-8"))['version']
    architecture = 'aarch64' if platform.machine().lower() in ('arm64', 'aarch64') else 'x86_64'
    key = {'Darwin': 'macos', 'Windows': 'windows', 'Linux': 'linux'}[system] + '-' + architecture
    if system == 'Darwin':
        app = output / 'Pinway IDE.app'
        run('cp', '-cR', str(target / 'macos/Pinway IDE.app'), str(app))
        run('codesign', '--force', '--deep', '--sign', '-', str(app))
        run('codesign', '--verify', '--deep', '--strict', str(app))
        image_root = output / '.dmg-root'
        image_root.mkdir()
        run('cp', '-cR', str(app), str(image_root / app.name))
        (image_root / 'Applications').symlink_to('/Applications')
        installer = output / f'Pinway-IDE_{version}_{key}.dmg'
        run('hdiutil', 'create', '-volname', 'Pinway IDE', '-srcfolder', str(image_root), '-ov', '-format', 'UDZO', str(installer))
        shutil.rmtree(image_root)
    else:
        pattern = 'nsis/*.exe' if system == 'Windows' else 'deb/*.deb'
        source = next(target.glob(pattern))
        installer = output / f'Pinway-IDE_{version}_{key}{source.suffix}'
        shutil.copy2(source, installer)
    manifest = {'version': version, 'installers': {key: {'file': installer.name, 'bytes': installer.stat().st_size,
                 'sha256': hashlib.sha256(installer.read_bytes()).hexdigest()}}}
    (output / 'pinway-release.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Installer ready: {installer}')

if __name__ == '__main__':
    main()
