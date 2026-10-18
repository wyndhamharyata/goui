# goui homepage

The website at [goui.mwyndham.dev](https://goui.mwyndham.dev). It runs as a static site on
Cloudflare Workers, deployed with SST.

## Shared files

`npm run assets` copies the icons, four diagrams from `docs/images`, the font files, the help
stylesheets (`src/guide.css` and `src/intro.css`), the version from `manifest.json`, and the live
panel demo from `design/` into `public/`. Every dev and deploy script runs `npm run assets` first.
Generated files in `public/` are gitignored.

`public/site.js` mounts the hero copy into `#site-hero` and the interactive panel into
`#site-panel`.

## Develop

```bash
cd site
npm install
npm run dev
```

`npm run dev` serves `public/` via `wrangler dev` at http://localhost:8787.

## Deploy

Copy `.env.example` to `.env` and set `CLOUDFLARE_DEFAULT_ACCOUNT_ID`:

```bash
npm run deploy:dev     # goui-dev.mwyndham.dev
npm run deploy:prod    # goui.mwyndham.dev
```

## Files

- `public/index.html`, `public/mac.html`, `public/privacy.html`, `public/404.html` and
  `public/styles.css` hold the pages and styles.
- `public/site.js` loads the icon sprite, sets the theme colour and mounts the homepage demo.
- `scripts/copy-assets.mjs` copies shared assets from the root repo.
- `src/worker/index.ts` serves static assets and `/health`.
- `sst.config.ts` configures the Cloudflare Worker and domain.
