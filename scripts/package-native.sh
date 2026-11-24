#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
if [[ -x "$root/.toolchain/rust/cargo/bin/cargo" ]]; then
  export RUSTUP_HOME="$root/.toolchain/rust/rustup" CARGO_HOME="$root/.toolchain/rust/cargo"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
bash scripts/assets.sh
cargo build --locked --manifest-path native/Cargo.toml
out="${PINWAY_NATIVE_OUT:-$root/dist/native}"
app="$out/Pinway IDE.app"
if [[ -e "$app" ]]; then
  echo "Choose a fresh PINWAY_NATIVE_OUT."
  exit 1
fi
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp LICENSE LICENSE-REVIEW.md THIRD_PARTY.md "$app/Contents/Resources/"
cp native/target/debug/pinway-native "$app/Contents/MacOS/Pinway IDE"
cp -cR .toolchain/runtime "$app/Contents/Resources/arduino"
cp dist/Pinway.icns "$app/Contents/Resources/Pinway.icns"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Pinway IDE</string>
<key>CFBundleIdentifier</key><string>dev.binio.pinway.native</string>
<key>CFBundleName</key><string>Pinway IDE</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.3.0</string>
<key>CFBundleIconFile</key><string>Pinway.icns</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
echo "$app"
