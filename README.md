# Emquad

A typographic poster generator. You type a short phrase, the app composes a
poster from letter outlines, and gives you a permanent link and a file to
download.

Live: [emquad.vercel.app](https://emquad.vercel.app)

## What it does

- Five composition modes — stack, break, grid, column, ring — each with its
  own layout policy rather than shared parameters.
- Live preview in the editor with no network requests: every parameter change
  is rendered locally.
- Permanent links. A saved poster keeps its address and its exact appearance.
- PNG and SVG download, and a generated Open Graph image per poster.
- A gallery of sixteen accepted posters.

## Stack

Next.js 16 (App Router), TypeScript in strict mode, Tailwind CSS v4,
Neon Postgres with Drizzle ORM, deployed on Vercel.

## The load-bearing rule

`lib/poster/render.ts` is a pure function: parameters in, an SVG string out.
No browser APIs, no React, no Node APIs, no dependencies.

Six consumers call it — the editor preview, the poster page, the PNG and SVG
download routes, the Open Graph image route, and the gallery wall. It is the
single source of composition, which is what makes a saved link stable: the
same parameters produce the same bytes everywhere.

Inside a poster, SVG filters, blur, shadows, gradients, masks, external fonts
and `foreignObject` are all forbidden — the Open Graph renderer supports none
of them. Grain is drawn as geometry. Type is drawn as glyph outlines from
Onest, so a poster carries no `text` element and depends on no font being
installed anywhere.

## The lab

`npm run lab` renders every case in `lab/cases.ts` and runs geometric checks
against the output — margins, bleed, row structure, type-size ratios between
density settings, and per-mode invariants that keep the five silhouettes
distinguishable.

It also writes `lab/out/hashes.json`. Because saved links promise permanence,
a change that alters the output of an existing specification shows up as a
changed hash, and that is treated as a regression rather than an improvement.

Current state: 80 cases, no failures, no tolerance violations.

## Running it

Requires a Postgres connection string in `.env.local`:

```ini
DATABASE_URL=postgres://...
```

```bash
npm install
npm run db:migrate
npm run dev
```

The dev server runs on port 3100.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3100 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run lab` | Render every lab case and run the geometry checks |
| `npm run gallery:check` | Validate the gallery address set |
| `npm run gallery:plan` | Show what a gallery sync would change |
| `npm run gallery:apply` | Apply the gallery sync |
| `npm run db:generate` | Generate a Drizzle migration |
| `npm run db:migrate` | Apply migrations |

## Layout

```text
app/        routes, metadata, robots and sitemap
components/ editor, gallery, poster display, global chrome
lib/poster/ the renderer: render.ts, the five modes, primitives, glyph data
lib/db/     schema and queries
lab/        composition cases and geometric checks
seed/       gallery data and sync scripts
```
