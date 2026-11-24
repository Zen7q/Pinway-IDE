#!/usr/bin/env python3
"""Create version-matched, SHA256-verified optional workspace packages."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    version = json.loads((ROOT / 'package.json').read_text(encoding="utf-8"))['version']
    output = ROOT / 'dist/release'
    output.mkdir(parents=True, exist_ok=True)
    manifest = {'version': version, 'packs': {}}
    for name in ('build', 'display'):
        directory = ROOT / '.toolchain/addons' / name
        archive = output / f'pinway-{name}.zip'
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
            for file in sorted(directory.rglob('*')):
                if file.is_file():
                    bundle.write(file, str(file.relative_to(directory)))
            for filename in ('LICENSE', 'THIRD_PARTY.md'):
                bundle.write(ROOT / filename, filename)
            if name == 'display':
                libraries = ROOT / '.toolchain/display-libraries'
                if not (libraries / 'manifest.json').is_file():
                    raise RuntimeError('Prepare Display libraries with python3 scripts/display-libraries.py')
                for file in sorted(libraries.rglob('*')):
                    if file.is_file():
                        bundle.write(file, str(Path('libraries') / file.relative_to(libraries)))
        manifest['packs'][name] = {'file': archive.name, 'bytes': archive.stat().st_size,
                                    'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
        print(archive.name, archive.stat().st_size)
    (output / 'pinway-packs.json').write_text(json.dumps(manifest, indent=2) + '\n')

if __name__ == '__main__':
    main()
