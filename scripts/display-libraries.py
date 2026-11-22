#!/usr/bin/env python3
"""Prepare the version-pinned, app-owned offline Arduino display library pack."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tempfile
import zipfile

ROOT=Path(__file__).resolve().parents[1]
LOCK=ROOT/'config/display-libraries.lock.json'
PACK=ROOT/'.toolchain/display-libraries'
CACHE=ROOT/'.toolchain/display-library-downloads'

def tree_hash(root):
    digest=hashlib.sha256()
    for path in sorted(p for p in root.rglob('*') if p.is_file()):
        digest.update(path.relative_to(root).as_posix().encode()+b'\0')
        digest.update(path.read_bytes())
    return digest.hexdigest()

def properties(path):
    return dict(line.split('=',1)for line in path.read_text(errors='replace').splitlines()if '='in line and not line.startswith('#'))

def prepare(record=False,verify=False):
    lock=json.loads(LOCK.read_text());PACK.mkdir(parents=True,exist_ok=True);CACHE.mkdir(parents=True,exist_ok=True)
    installed=[]
    for lib in lock['libraries']:
        assert re.fullmatch(r'[A-Za-z0-9_-]+',lib['id'])
        archive=CACHE/(lib['id']+'-'+lib['tag']+'.zip')
        if not archive.exists():
            if verify:raise RuntimeError('Missing archive: '+lib['id'])
            part=archive.with_suffix('.part')
            subprocess.run(['curl','--fail','--location','--silent','--show-error','--retry','2','--max-time','120',lib['url'],'--output',str(part)],check=True)
            os.replace(part,archive)
        checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
        if record and not lib.get('sha256'):lib['sha256']=checksum
        if checksum!=lib.get('sha256'):raise RuntimeError('Archive checksum mismatch: '+lib['id'])
        target=PACK/lib['id']
        if not target.exists():
            if verify:raise RuntimeError('Missing library: '+lib['id'])
            with tempfile.TemporaryDirectory(dir=PACK,prefix='.extract-')as tmp:
                extraction=Path(tmp)
                with zipfile.ZipFile(archive)as z:
                    size=0
                    for member in z.infolist():
                        path=PurePosixPath(member.filename);size+=member.file_size
                        if path.is_absolute()or '..'in path.parts or (member.external_attr>>16)&0o170000==0o120000 or size>700_000_000:raise RuntimeError('Unsafe source archive')
                    z.extractall(extraction)
                folders=list(extraction.iterdir())
                if len(folders)!=1 or not folders[0].is_dir():raise RuntimeError('Unexpected package structure')
                os.replace(folders[0],target)
        props=properties(target/'library.properties')
        for header in lib['headers']:
            if not(target/header).is_file():raise RuntimeError('Missing header: '+header)
        checksum=tree_hash(target)
        if record and not lib.get('tree_sha256'):lib['tree_sha256']=checksum
        if checksum!=lib.get('tree_sha256'):raise RuntimeError('Installed source changed: '+lib['id'])
        lib['name']=props['name'];lib['version']=props['version']
        installed.append({**lib,'depends':props.get('depends',''),'architectures':props.get('architectures','*')})
        print(lib['name']+' '+lib['version']+' verified',flush=True)
    if record:LOCK.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n')
    manifest={'format':'pinway.display-libraries/1','libraries':installed}
    (PACK/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    notices=['Pinway offline display library pack. Original licenses are retained in each source directory.\n']
    for lib in installed:
        notices.append('\n'+lib['name']+' '+lib['version']+'\nhttps://github.com/'+lib['repository']+'\n')
        for path in sorted((PACK/lib['id']).iterdir()):
            if path.is_file()and re.match(r'^(license|licence|copying|copyright)',path.name,re.I):notices.append(path.read_text(errors='replace'))
    (PACK/'THIRD_PARTY.txt').write_text('\n'.join(notices))
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--record-checksums',action='store_true');parser.add_argument('--verify',action='store_true');args=parser.parse_args()
    prepare(args.record_checksums,args.verify)
