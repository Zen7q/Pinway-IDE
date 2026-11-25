# Build and release

Pinway uses Tauri, Rust and a bundled CodeMirror frontend. The base installer includes Code, Arduino CLI 1.5.1 and Arduino AVR Boards 1.8.8. ESP32 support and the Build/Display workspaces are installed separately.

## Requirements

Install Node.js 24, Python 3.12+, Rust stable and the platform dependencies for Tauri. macOS requires Xcode Command Line Tools. Windows requires Microsoft C++ Build Tools and WebView2. Linux builds require GTK and WebKit development packages.

```sh
npm ci
npm run package:tauri
```

The packaging script prepares platform-native Arduino tools, collects dependency licenses, builds in release mode and creates a DMG on macOS, an NSIS EXE on Windows or a DEB on Linux. Each build goes into a new `dist/release-<timestamp>` directory. Set `PINWAY_TAURI_OUT` to choose another empty output directory.

For a debug installer, run `python3 scripts/package-desktop.py --debug`.

## Optional workspaces

```sh
node scripts/build-addons.mjs
python3 scripts/display-libraries.py
python3 scripts/package-addons.py
```

The output in `dist/release/` contains `pinway-build.zip`, `pinway-display.zip` and `pinway-packs.json`. Display includes driver sources and their original notices. ESP32 support is installed by Arduino CLI through the official Espressif package index, using core 3.3.12.

Workspace packages match the application version. The application verifies each archive's size and SHA-256, extracts into a staging directory and validates its contents before completing installation. Downloads can be retried after a failure. Installed modules live in the application's data directory. A new application version may require matching workspace packages.

## Publishing

The `Build and test` GitHub Actions workflow runs tests, builds a Windows installer and builds and smoke-tests the firmware container. It uploads the Windows installer and Docker image as workflow artifacts.

Combine the platform-specific `installers` entries from each generated `pinway-release.json` into one manifest with the same application version. Publish the installers, combined manifest, workspace archives and `pinway-packs.json` in the GitHub Release tagged `v<application-version>`.

## Updates and signing

Published application builds use numeric versions such as `0.3.2` and regular GitHub Releases so older stable updaters can discover them. The product maturity label (`alpha`) is shown separately in the application and release title. Keep the tag, package version, installer manifest and workspace manifest versions identical. Builds that already have a semantic prerelease suffix can also discover prereleases; stable builds only accept numeric releases. Users can disable startup checks or check manually in Settings. When a newer version is available, **Update IDE** downloads the platform installer, verifies its size and SHA-256 and opens it. Users complete installation themselves.

The release manifest is fetched over HTTPS from the project's GitHub repository. Its integrity depends on that repository's access controls. macOS packaging currently uses an ad-hoc signature. Apple Developer ID signing and notarization, and Windows Authenticode signing, require the appropriate publisher certificates.

Retain the dependency license files and source distribution rights described in [THIRD_PARTY.md](../THIRD_PARTY.md).

## Docker

```sh
docker build -t pinway-cli .
docker run --rm pinway-cli version
```

For ESP32 support, build with `docker build --build-arg ESP32=true -t pinway-cli-esp .`. Mount your sketches at `/workspace` to compile them. The downloadable image is Linux x86_64 and can be loaded with `docker load -i pinway-cli-docker.tar.gz`.
