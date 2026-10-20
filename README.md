# Bonus4U

Bonus tools for KDP publishers, served at **https://bonus4u.fastaifactory.com** by
Cloudflare Workers (static assets only, no server code).

Each app gets its own URL:

| URL | What it is |
| --- | --- |
| `/` | 404 on purpose: there is no public list of apps |
| `/<slug>/` | One app, for example `/jigsaw-sudoku-prints/` |
| `/<slug>/index.html`, `/<slug>` | Redirect to `/<slug>/` |

## Layout

```
apps/<slug>/       one folder per app; the folder name is the URL
apps.json          which apps are published, their titles and entry files
site/              404 page, shared assets, _headers, robots.txt
scripts/build.mjs  builds dist/ (no dependencies)
wrangler.jsonc     Cloudflare config (domain, routing)
_dev-source/       unreleased sources, never published
dist/              build output, not committed
```

The apps still work offline: double-clicking an app's `index.html` behaves the same as before.

## Commands

```bash
npm install      # once: installs wrangler
npm run build    # build dist/ and check it
npm run dev      # build, then serve at http://localhost:8787
npm run deploy   # build, then deploy to Cloudflare
```

## What the build does

- Copies `site/` and every app in `apps.json` into `dist/`. It fails if `site/index.html`
  exists, because `/` must answer 404.
- Leaves out dev-only files: `node_modules`, `tests`, `tools`, `scripts`, `src`,
  `examples`, `package*.json`, `build*.js`, `*.md`, `README*`, `how to use.txt`, videos.
- When an app's entry file isn't `index.html` (for example `launchpad.html`), serves it at
  `/<slug>/` and redirects the old file name there.
- For apps with several tools (`"tools"` in `apps.json`), creates a small menu page at `/<slug>/`.
- Fails if a page links a local file that is missing from `dist/`, or if a file is over
  Cloudflare's 25 MiB limit.

## Add an app

1. Put it in `apps/<slug>/` (lowercase, words joined with `-`).
2. Add it to `apps.json`:
   ```json
   { "slug": "my-new-app", "title": "My New App", "description": "One line about the app." }
   ```
   Add `"entry": "file.html"` when the start page isn't `index.html`.
3. Run `npm run dev` and check it, then commit and push.

## Deployment

Needs `fastaifactory.com` to be a zone in the same Cloudflare account.

**Automatic (GitHub Actions)**: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
builds every push and pull request and deploys every push to `main`. On the first deploy,
Wrangler attaches `bonus4u.fastaifactory.com` from `wrangler.jsonc` and creates the DNS
record and certificate.

One-time setup, in GitHub → repo **Settings** → **Secrets and variables** → **Actions**:

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**; Account = your account, Zone = `fastaifactory.com` |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers & Pages → Account ID on the right |

Without the secrets, the workflow still builds and shows a "Not deployed" warning.

**Manual, from this computer**

```bash
npx wrangler login
npm run deploy
```

## Notes

- Search engines are blocked (`robots.txt`, `X-Robots-Tag`, `<meta name="robots">`).
- All apps share one origin, so their `localStorage` is shared. Keep storage keys app-specific
  (they are today, for example `samuraiSudokuPrints.v1`).
- Files are not fingerprinted, so they are served with `max-age=0, must-revalidate`: browsers
  always get the latest deploy.
