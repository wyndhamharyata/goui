# Development

Built with vanilla JavaScript and no compilation step. Reload the unpacked extension in
`chrome://extensions` to reflect code updates.

## Setup

```bash
git clone https://github.com/wyndhamharyata/goui.git
cd goui
npm install
npx playwright install chromium
```

## Scripts

| Command                     | Action                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run lint`              | Runs ESLint alongside custom word and layout assertions.                                 |
| `npm test`                  | Executes Playwright end-to-end browser tests.                                            |
| `npm run icons`             | Rebuilds application icons.                                                              |
| `npm run readme-images`     | Generates documentation SVG diagrams in `docs/images` (requires `librsvg`).              |
| `npm run store-images`      | Generates Chrome Web Store media in `store/` (requires `librsvg` and ImageMagick).       |
| `npm run targets`           | Rebuilds `src/targets.json` from AutoEQ target curves.                                   |
| `npm run dependencies-file` | Generates `DEPENDENCIES.md` from installed npm packages.                                 |
| `npm run zip`               | Bundles release archives into `dist/`.                                                   |
| `npm run mac`               | Compiles and installs the local macOS application.                                       |
| `npm run release`           | Bumps versions, builds release artifacts, creates GitHub release, and deploys the site. |

## Release Workflow

Execute the release pipeline from a clean `main` branch:

```bash
npm run release -- patch --notes notes.md
```

Accepts `patch`, `minor`, `major`, or explicit semver strings (e.g., `0.2.0`). The script updates
`manifest.json`, regenerates dependencies and store assets, executes the test suite, creates a git
tag, uploads the extension zip, `goui-mac.tar.gz`, and checksums to GitHub Releases, and updates the
live documentation site.

Upload `dist/goui-<version>-store.zip` manually to the Chrome Web Store Developer Dashboard (refer
to [`store/listing.md`](../store/listing.md)).

For lower-level system documentation, see [`mac/engine/README.md`](../mac/engine/README.md) for the
CoreAudio audio engine and [`site/README.md`](../site/README.md) for web assets.
