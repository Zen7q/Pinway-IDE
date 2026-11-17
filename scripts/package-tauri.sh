#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
if [[ -x "$root/.toolchain/rust/cargo/bin/cargo" ]]; then
  export RUSTUP_HOME="$root/.toolchain/rust/rustup" CARGO_HOME="$root/.toolchain/rust/cargo"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
bash scripts/assets.sh
mkdir -p src-tauri/icons
cp dist/Pinway.icns src-tauri/icons/Pinway.icns
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'This packaging script prepares the validated macOS bundle. The Rust host has separate platform paths.'
  exit 1
fi
if [[ ! -x .toolchain/runtime/arduino-cli ]]; then
  echo 'Prepare the Arduino bundle with npm run seed.'
  exit 1
fi
out="${PINWAY_TAURI_OUT:-$root/dist/tauri}"
mkdir -p "$out"
if [[ -e "$out/Pinway IDE.app" ]]; then
  echo "Choose a fresh directory with PINWAY_TAURI_OUT or move the previous app."
  exit 1
fi
node node_modules/@tauri-apps/cli/tauri.js build --bundles app --debug
staging="$(mktemp -d "$out/.stage.XXXXXX")"
trap 'rm -rf "$staging"' EXIT
app="$staging/Pinway IDE.app"
cp -cR "src-tauri/target/debug/bundle/macos/Pinway IDE.app" "$app"
res="$app/Contents/Resources"
mkdir -p "$res"
cp -cR .toolchain/runtime "$res/arduino"
chmod 755 "$res/arduino"
cp THIRD_PARTY.md "$res/THIRD_PARTY.md"
cp dist/npm-notices.txt "$res/npm-notices.txt"
cp -R licenses "$res/Arduino-Licenses"
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
mv "$app" "$out/Pinway IDE.app"
echo "$out/Pinway IDE.app"
