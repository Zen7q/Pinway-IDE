#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
cli_version=1.5.1
avr=1.8.8
esp=3.3.12
esp_url=https://espressif.github.io/arduino-esp32/package_esp32_index.json
[[ "$(uname -s)-$(uname -m)" == Darwin-arm64 ]] || { echo "This release targets Apple Silicon."; exit 1; }
work=$(mktemp -d "${TMPDIR:-/tmp}/pinway-seed.XXXXXX")
trap 'rm -rf "$work"' EXIT
base="https://github.com/arduino/arduino-cli/releases/download/v$cli_version"
archive="arduino-cli_${cli_version}_macOS_ARM64.tar.gz"
mkdir -p "$work/runtime/seed" .toolchain
cd "$work"
curl -fLsS --retry 3 "$base/$archive" -o "$archive"
curl -fLsS --retry 3 "$base/$cli_version-checksums.txt" -o checksums
awk -v f="$archive" '$2 == f { print; found=1 } END { if (!found) exit 1 }' checksums | shasum -a 256 -c -
tar -xf "$archive" -C runtime arduino-cli LICENSE.txt
seed="$work/runtime/seed"
if [[ -n "${PINWAY_ARDUINO_DATA:-}" ]]; then
  src="$PINWAY_ARDUINO_DATA"
  mkdir -p "$seed/packages/arduino/hardware/avr" "$seed/packages/esp32/hardware/esp32"
  cp -cR "$src/packages/arduino/hardware/avr/$avr" "$seed/packages/arduino/hardware/avr/"
  cp -cR "$src/packages/esp32/hardware/esp32/$esp" "$seed/packages/esp32/hardware/esp32/"
  for vendor in arduino esp32 builtin; do
    mkdir -p "$seed/packages/$vendor"
    cp -cR "$src/packages/$vendor/tools" "$seed/packages/$vendor/"
  done
  for f in "$src"/package*_index.json* "$src"/library_index.json*; do
    [[ ! -f "$f" ]] || cp -c "$f" "$seed/"
  done
else
  export ARDUINO_DIRECTORIES_DATA="$seed"
  export ARDUINO_DIRECTORIES_DOWNLOADS="$work/staging"
  export ARDUINO_DIRECTORIES_USER="$work/sketchbook"
  runtime/arduino-cli core update-index --additional-urls "$esp_url"
  runtime/arduino-cli core install "arduino:avr@$avr" "esp32:esp32@$esp" --additional-urls "$esp_url"
  runtime/arduino-cli lib update-index
fi
cd - >/dev/null
stage=$(mktemp -d "$PWD/.toolchain/.stage.XXXXXX")
cp -cR "$work/runtime/." "$stage/"
chmod 755 "$stage"
if [[ -d .toolchain/runtime ]]; then rm -rf .toolchain/runtime; fi
mv "$stage" .toolchain/runtime
