#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
work=$(mktemp -d "${TMPDIR:-/tmp}/pinway-assets.XXXXXX")
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/Pinway.iconset" dist
sips -s format png assets/Pinway.svg --out "$work/Pinway.png" >/dev/null
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$work/Pinway.png" --out "$work/Pinway.iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size*2))
  sips -z "$double" "$double" "$work/Pinway.png" --out "$work/Pinway.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$work/Pinway.iconset" -o dist/Pinway.icns
