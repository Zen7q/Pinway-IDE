#!/usr/bin/env python3
"""Collect dependency license files and MPL sources for the desktop resources."""
import json
import os
import platform
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    destination = ROOT / '.toolchain/legal'
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    for name in ('LICENSE', 'LICENSE-REVIEW.md', 'THIRD_PARTY.md'):
        shutil.copy2(ROOT / name, destination / name)
    shutil.copytree(ROOT / 'licenses', destination / 'toolchain-licenses')
    npm = json.loads((ROOT / 'package-lock.json').read_text())['packages']
    with (destination / 'npm-notices.txt').open('w') as output:
        for location, package in npm.items():
            directory = ROOT / location
            if not location or not directory.is_dir():
                continue
            for file in sorted(directory.iterdir()):
                if file.is_file() and file.name.lower().startswith(('license', 'copying', 'notice')):
                    output.write(f'\n{location} {package.get("version", "")}\n\n')
                    output.write(file.read_text(errors='replace'))
    host = subprocess.check_output(['rustc', '-vV'], text=True)
    target = next(line.split(': ', 1)[1] for line in host.splitlines() if line.startswith('host: '))
    data = json.loads(subprocess.check_output(['cargo', 'metadata', '--locked', '--filter-platform', target, '--format-version', '1'], text=True, cwd=ROOT))
    sources = []
    for package in data['packages']:
        if not package.get('source'):
            continue
        folder = Path(package['manifest_path']).parent
        name = package['name'] + '-' + package['version']
        licenses = destination / 'rust' / name
        for file in folder.iterdir():
            if file.is_file() and file.name.lower().startswith(('license', 'copying', 'notice', 'copyright')):
                licenses.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file, licenses / file.name)
        if 'MPL' in (package.get('license') or ''):
            shutil.copytree(folder, destination / 'mpl-sources' / name)
        sources.append({key: package.get(key) for key in ('name', 'version', 'license', 'repository')})
    (destination / 'rust-dependencies.json').write_text(json.dumps(sources, indent=2) + '\n')
    (destination / 'SOURCES.txt').write_text('MPL component sources are included in mpl-sources/.\nToolchain component versions and upstream repositories are listed in THIRD_PARTY.md.\nSee LICENSE-REVIEW.md for remaining source-distribution review.\n')

if __name__ == '__main__':
    main()
