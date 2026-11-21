# Hola3D Taller

Internal app for Hola3D's workshop: orders, projects, calendar, machine service and a cost calculator. It is planned to run at `app.hola3d.com.ar`.

Built so far: **Pedidos** works end to end. The other sections show a placeholder until they are built.

## Stack

- React 19 + Vite + TypeScript, with React Router
- One Cloudflare Worker that serves the app and the API under `/api/*` (`worker/`)
- Cloudflare D1 (SQLite) for data (`migrations/`)
- Domain rules shared by both sides (`shared/`)

## Run locally

```bash
npm install
npm run db:migrate   # create the local D1 tables
npm run db:seed      # load sample orders (local only)
npm run dev
```

## Checks

```bash
npm test             # Vitest: domain rules, API routes, formatting
npm run typecheck
npm run lint
```

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/orders` | List all orders |
| POST | `/api/orders` | Create an order (stage `nuevo`, next number). Answers 422 with `fields` when data is missing |
| PUT | `/api/orders/:id/stage` | Move an order to `{ "stage": "listo" }` |

## Before the first deploy

None of these steps has been done yet. Each one creates something in the Cloudflare account.

1. `npx wrangler d1 create hola3d-app`, then paste the `database_id` into `wrangler.jsonc`.
2. `npx wrangler d1 migrations apply hola3d-app --remote`
3. Add the custom domain `app.hola3d.com.ar` to the Worker.
4. Put Cloudflare Access in front of that domain, so only the owners can sign in.
5. `npm run deploy`
