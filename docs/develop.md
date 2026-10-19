# Develop

Plain JavaScript with no build step. Reload the extension in `chrome://extensions` after editing
files.

```bash
git clone https://github.com/wyndhamharyata/goui.git
cd goui
npm install
npx playwright install chromium
```

| Command                     | What it does                                                         |
| --------------------------- | -------------------------------------------------------------------- |
| `npm run lint`              | ESLint, then the word and layout checks.                             |
| `npm test`                  | Playwright browser journeys.                                         |
| `npm run icons`             | Rebuild the icon files.                                              |
| `npm run readme-images`     | Rebuild the diagrams in `docs/images` (requires `librsvg`).          |
| `npm run store-images`      | Rebuild Chrome Web Store assets in `store/` (`librsvg`, ImageMagick).|
| `npm run targets`           | Rebuild `src/targets.json` from AutoEQ target curves.                |
| `npm run dependencies-file` | Rebuild `DEPENDENCIES.md` from installed packages.                   |
| `npm run zip`               | Build the release zip and Chrome Web Store zip in `dist/`.           |
| `npm run mac`               | Build and install the Mac app locally.                               |
| `npm run release`           | Bump version, build artifacts, publish GitHub release, deploy site.  |

## Release

To publish a release from a clean `main` branch:

```bash
npm run release -- patch --notes notes.md
```

Pass `patch`, `minor`, `major` or an exact version like `0.2.0`. The script updates
`manifest.json`, rebuilds images and `DEPENDENCIES.md`, runs lint and tests, tags the commit,
uploads the extension zip, Mac tarball (`goui-mac.tar.gz`) and SHA-256 checksums to GitHub
Releases, and deploys the site. Upload `dist/goui-<version>-store.zip` to the Chrome Web Store
manually (see `store/listing.md`).

See [`mac/engine/README.md`](../mac/engine/README.md) for the Mac audio engine and
[`site/README.md`](../site/README.md) for the website.
