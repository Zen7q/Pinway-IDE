# Contributing to Pinway IDE

Report bugs and propose features through GitHub Issues. Include the Pinway version, operating system, board model, relevant package and reproduction steps. Remove passwords, private network names and personal information from logs.

Open an issue before starting a large change. For a fix, create a fork, use a separate branch and submit a pull request describing the resulting behavior and how you verified it.

```sh
npm ci
npm run ui:tauri
node --test tests/*.test.mjs
npm test
```

Desktop development requires Rust stable, Node.js 24, Python 3.12+ and the platform dependencies for Tauri. Run `npm run dev` to prepare the base Arduino tools and start the application. See the [release guide](docs/RELEASE.md) for packaging instructions.

Preserve compatibility with existing sketches, circuits and Display layouts. For interface changes, check light and dark themes, keyboard navigation, narrow windows and the actual platform WebView. Keep personal sketches, tokens, dependencies and compiled applications out of Git.

Contributions are governed by the [Pinway license](LICENSE). You retain copyright and must have permission to contribute the material you submit. Preserve notices for third-party code. Follow our [Code of Conduct](CODE_OF_CONDUCT.md).
