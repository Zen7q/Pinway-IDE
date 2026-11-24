#!/usr/bin/env python3
"""Prepare a platform-native Arduino AVR seed for a small offline installer."""
import hashlib
import json
import os
import platform
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.5.1'

def fetch(url, target):
    with urllib.request.urlopen(url, timeout=120) as response, target.open('wb') as output:
        shutil.copyfileobj(response, output)

def main():
    system = platform.system()
    machine = platform.machine().lower()
    arch = 'ARM64' if machine in ('arm64', 'aarch64') else '64bit'
    platform_name = {'Darwin': 'macOS', 'Windows': 'Windows', 'Linux': 'Linux'}[system]
    archive_name = f'arduino-cli_{VERSION}_{platform_name}_{arch}.{"zip" if system == "Windows" else "tar.gz"}'
    destination = ROOT / '.toolchain/release-runtime'
    if destination.joinpath('seed/packages/arduino/hardware/avr/1.8.8/platform.txt').is_file():
        print(f'Using prepared AVR runtime: {destination}')
        return
    existing = ROOT / '.toolchain/runtime'
    if system == 'Darwin' and machine in ('arm64', 'aarch64') and existing.joinpath('seed/packages/arduino/hardware/avr/1.8.8/platform.txt').is_file():
        destination.mkdir(parents=True, exist_ok=True)
        for name in ('arduino-cli', 'LICENSE.txt'):
            shutil.copy2(existing / name, destination / name)
        seed = destination / 'seed'
        seed.mkdir(exist_ok=True)
        for source in (existing / 'seed').glob('*index.json*'):
            shutil.copy2(source, seed / source.name)
        for vendor in ('arduino', 'builtin'):
            shutil.copytree(existing / 'seed/packages' / vendor, seed / 'packages' / vendor, dirs_exist_ok=True)
        print(f'Prepared AVR-only seed from local tools: {destination}')
        return
    destination.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='pinway-release-', dir=destination.parent) as temporary:
        work = Path(temporary)
        runtime = work / 'runtime'
        runtime.mkdir()
        archive = work / archive_name
        base = f'https://github.com/arduino/arduino-cli/releases/download/v{VERSION}'
        fetch(f'{base}/{archive_name}', archive)
        checksums = work / 'checksums.txt'
        fetch(f'{base}/{VERSION}-checksums.txt', checksums)
        expected = next(line.split()[0] for line in checksums.read_text().splitlines() if line.split()[-1] == archive_name)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Arduino CLI checksum mismatch')
        shutil.unpack_archive(archive, runtime)
        executable = runtime / ('arduino-cli.exe' if system == 'Windows' else 'arduino-cli')
        if system != 'Windows':
            executable.chmod(0o755)
        env = dict(os.environ, ARDUINO_DIRECTORIES_DATA=str(runtime / 'seed'),
                   ARDUINO_DIRECTORIES_DOWNLOADS=str(work / 'downloads'),
                   ARDUINO_DIRECTORIES_USER=str(work / 'sketchbook'),
                   ARDUINO_UPDATER_ENABLE_NOTIFICATION='false')
        for args in [('core', 'update-index'), ('core', 'install', 'arduino:avr@1.8.8'), ('lib', 'update-index')]:
            subprocess.run([str(executable), *args], env=env, check=True)
        # Espressif's index is small and enables later installation from the app.
        fetch('https://espressif.github.io/arduino-esp32/package_esp32_index.json', runtime / 'seed/package_esp32_index.json')
        if destination.exists():
            shutil.rmtree(destination)
        runtime.rename(destination)
        print(f'Prepared Code + Arduino AVR runtime: {destination}')

if __name__ == '__main__':
    main()
