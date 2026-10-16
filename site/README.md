# goui homepage

The homepage at [goui.mwyndham.dev](https://goui.mwyndham.dev). A static site on Cloudflare Workers,
deployed with SST. It has its own `package.json`, so its tools stay apart from the extension's.

## Shared files

The site shows the icons, four pictures from `docs/images` and the live panel mock from `design/`.
`npm run assets` copies them into `public/`. It also writes `public/sprite.svg`, the icon sprite of
`design/ux-proposals.html`. Every dev and deploy command runs it first. The copies stay out of git,
so the site always matches the repo.

The Mac page is the Mac app's help, so it wears the design of the built-in help. `npm run assets`
copies `src/guide.css` and `src/intro.css` beside it, and writes `public/version.js` with the
version from `manifest.json`.

The panel mock is `design/ux-proposals.js` as it is. It mounts each part only where that part's
markup is on the page. On the site it mounts nothing by itself. `public/site.js` mounts the hero
copy into `#site-hero` and the narrow panel into `#site-panel`, with the Set picker on. It passes the
panel what its **?**, **Credits** and **Measure my ear** buttons do on this page. It also loads the
sprite and sets the theme colour from `--ink-0`, on every page.

## Develop

```bash
cd site
npm install
npm run dev
```

`npm run dev` serves `public/` through `wrangler dev` on http://localhost:8787.

## Deploy

SST deploys to the Cloudflare account that owns the mwyndham.dev zone. Copy `.env.example` to `.env`
and fill in `CLOUDFLARE_DEFAULT_ACCOUNT_ID`, then:

```bash
npm run deploy:dev     # goui-dev.mwyndham.dev
npm run deploy:prod    # goui.mwyndham.dev
```

The production stage is kept. Every other stage is removed on `sst remove`.

## Files

- `public/index.html`, `public/mac.html`, `public/privacy.html`, `public/404.html` and
  `public/styles.css` are the pages.
- `public/site.js` is the script every page loads.
- `scripts/copy-assets.mjs` copies the shared files.
- `src/worker/index.ts` is the worker: a health check and the asset fallback.
- `sst.config.ts` names the worker, the domain and the local dev command.
