#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
if [[ -x "$root/.toolchain/rust/cargo/bin/cargo" ]]; then
  export RUSTUP_HOME="$root/.toolchain/rust/rustup" CARGO_HOME="$root/.toolchain/rust/cargo"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
if [[ "${1:-}" == --test ]]; then
  npm run ui:tauri
  exec cargo test --locked --manifest-path src-tauri/Cargo.toml
fi
if [[ "${1:-}" == --dev ]]; then
  python3 scripts/prepare-release.py
  node node_modules/@tauri-apps/cli/tauri.js icon assets/Pinway.png --output .toolchain/icons
  python3 scripts/prepare-notices.py
  exec node node_modules/@tauri-apps/cli/tauri.js dev
fi
exec python3 scripts/package-desktop.py "$@"
