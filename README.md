# Hola3D Taller

The internal workshop app for Hola3D, a 3D printing shop. It tracks every order from the first message to the delivery, on one board.

![The Pedidos board with orders grouped by stage](docs/pedidos.png)

## Status

| Section | State |
|---|---|
| Pedidos (orders) | Works end to end: board, search, new order (pick a client or type a new one), stage moves |
| Clientes (clients) | List with search, create and edit. Client page with contact links, orders, total spent and balance owed |
| Impresoras (printers) | List, create and edit. Shows accumulated print hours and machine wear per print hour |
| Filamento (spools) | List, create and edit. Filter by material, total stock in grams, low-stock warning |
| Calculadora (calculator) | Prices one or more pieces with the real cost breakdown, total and price per unit, live. Edits the workshop costs. Does not save yet (quotes come next) |
| Inicio, Proyectos, Calendario, Servicio técnico | Placeholder screens |
| Deploy to `app.hola3d.com.ar` | Not done yet, see [Deploy](#deploy) |

The app has no login of its own. It is meant to run behind Cloudflare Access, so do not deploy it without that step.

## Run it locally

You need Node.js 22 or newer. Nothing here touches a Cloudflare account: the database is a local D1 copy.

```bash
npm install
npm run db:migrate   # create the local D1 tables
npm run db:seed      # load sample clients, orders, printers, spools and cost settings
npm run dev
```

Open the URL Vite prints and go to **Pedidos**. On a phone the bottom bar has Inicio, Pedidos, Calendario and Clientes; **Más** opens a sheet with the other sections.

## Checks

```bash
npm test             # Vitest: domain rules, API routes, API dispatch, formatting
npm run typecheck
npm run lint
```

## How it is built

One Cloudflare Worker serves both the React app and the API, and stores data in D1 (SQLite).

| Folder | What lives there |
|---|---|
| `src/` | React 19 app (Vite, React Router). One folder per screen in `features/` (`orders/` is Pedidos, `clients/` Clientes, `printers/` Impresoras, `spools/` Filamento, `calculator/` Calculadora), `shell/` the navigation, `ui/` pieces the screens share (API calls, form dialog, icons) |
| `worker/` | The Worker: API under `/api/*`, everything else is the single-page app. One folder per module (`orders/`, `clients/`, `printers/`, `spools/`, `settings/`) with its routes and a storage port with a D1 and an in-memory adapter (orders and clients share in-memory tables, `memory.ts`); `index.ts` tries each module in turn |
| `shared/` | Rules used by both sides: order stages, validation and search; client validation, name matching, total spent, balance owed and contact links; printer validation, hours and wear cost; spool validation, low stock, material filter and stock totals; cost settings validation and defaults; the cost formula and spool shortages for the calculator |
| `migrations/` | D1 schema, one file per change |
| `seed/` | Sample clients, orders, printers, spools and cost settings, for local use only |

An order moves through five stages, in order:

`nuevo` → `disenando` → `imprimiendo` → `listo` → `entregado`

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/orders` | List all orders. Each one has `client` (the client's name) and `clientId` |
| POST | `/api/orders` | Create an order. It starts in `nuevo` and takes the next number, padded to four digits |
| PUT | `/api/orders/:id/stage` | Move an order to another stage |
| GET | `/api/clients` | List clients, by name, each with `orderCount`, `totalSpent` and `balanceOwed` |
| POST | `/api/clients` | Create a client |
| GET | `/api/clients/:id` | One client with its totals, and its `orders` |
| PUT | `/api/clients/:id` | Edit a client. Send only the fields to change; the rest keep their value |
| GET | `/api/printers` | List printers, by name |
| POST | `/api/printers` | Create a printer |
| PUT | `/api/printers/:id` | Edit a printer. Send only the fields to change; the rest keep their value |
| GET | `/api/spools` | List filament spools, by material and colour |
| POST | `/api/spools` | Create a spool |
| PUT | `/api/spools/:id` | Edit a spool. Send only the fields to change; the rest keep their value |
| GET | `/api/settings/costs` | The workshop cost settings (the defaults, with `updatedAt` null, until saved) |
| PUT | `/api/settings/costs` | Edit the cost settings. Send only the fields to change; the rest keep their value |

```bash
# Create an order
curl -X POST http://localhost:5173/api/orders \
  -H 'content-type: application/json' \
  -d '{"item":"Maceta geométrica","client":"Lucía M.","channel":"Instagram","price":12000}'

# Move order 0142 to "listo"
curl -X PUT http://localhost:5173/api/orders/0142/stage \
  -H 'content-type: application/json' \
  -d '{"stage":"listo"}'
```

A new order needs `item`, a client, `channel` and `price` (whole pesos). The client is either `clientId` (an existing client; an unknown id answers 422 on `clientId` and stores nothing) or `client`, a name: when it matches an existing client, ignoring case, accents and surrounding spaces, the order goes to that client; otherwise a client with that name is created. `dueDate`, `dueTime`, `deposit`, `material` and `note` are optional. The channel is one of `Instagram`, `WhatsApp`, `Tienda web`, `Email` or `En persona`.

A client needs `name`. `phone`, `instagram` (stored without the `@`), `email` and `note` are optional. Total spent is the sum of the prices of delivered orders; balance owed adds price minus deposit over the orders not marked paid. The client page links the phone to `https://wa.me/<digits>` and the handle to `https://instagram.com/<handle>`.

A printer needs `name`, `purchasePrice` (whole pesos), `lifetimeHours` (expected lifetime in print hours, at least 1) and `powerWatts` (average draw). `model` and `note` are optional, `printMinutes` (accumulated print time) starts at 0 and `status` at `activa`; the other statuses are `en_servicio` and `fuera_de_uso`. The screen shows the wear cost per print hour: purchase price ÷ lifetime hours.

A spool needs `material` (free text, such as `PLA` or `PETG`), `colorName`, `colorHex` (`#rrggbb`), `netGrams` (filament weight when new) and `price` (whole pesos paid). `brand` and `note` are optional, `remainingGrams` starts at the net weight and `lowStockGrams` at 150. Remaining grams go from 0 to the net weight; a spool at or below its threshold shows as low.

```bash
# Add a spool
curl -X POST http://localhost:5173/api/spools \
  -H 'content-type: application/json' \
  -d '{"material":"PLA","colorName":"Blanco","colorHex":"#ffffff","brand":"Grilon3","netGrams":1000,"price":21000}'

# Weigh it and correct what is left
curl -X PUT http://localhost:5173/api/spools/1 \
  -H 'content-type: application/json' \
  -d '{"remainingGrams":640}'
```

The cost settings are one record: `kwhPrice` (pesos per kWh), `labourPerHour`, `monthlyFixedCosts`, `packagingCost` (what a new calculator piece starts with) and `roundingStep` (at least 1, default 100) in whole pesos; `monthlyPrintHours` (whole hours, more than 0); and `failurePercent` (0 to 100), `marginPercent` (0 to 1000) and `commissionPercent` (0 to under 100, default 0), with up to two decimals. The migration starts them at $200 per kWh, $6000 per hour, 10 % failures, 50 % margin, $120000 of fixed costs over 200 print hours, $800 of packaging, rounding to $100 and no commission.

```bash
# Sell through Mercado Libre: add its commission and round to $500
curl -X PUT http://localhost:5173/api/settings/costs \
  -H 'content-type: application/json' \
  -d '{"commissionPercent":14.5,"roundingStep":500}'
```

The calculator prices each piece (a line: quantity, printer, print time per unit, one or more filaments, and preparation, post-processing and packaging for the whole line) in this order, each term in whole pesos:

| Term | How |
|---|---|
| Material | Σ grams × spool price ÷ spool net weight (or the typed price per kg for a material not in stock) |
| Luz | watts ÷ 1000 × print hours × kWh price |
| Desgaste de máquina | print hours × purchase price ÷ lifetime hours |
| Gastos fijos | print hours × monthly fixed costs ÷ monthly print hours |
| Mano de obra | (preparation + post-processing minutes) ÷ 60 × hourly rate |
| Packaging | the amount on the line |
| Margen por fallas | failure % of material + energy + machine wear |
| Costo de producción | the sum of the terms above |
| Ganancia | margin % of the production cost |
| Precio antes de comisión | production cost + profit |
| Comisión and Redondeo | price before commission ÷ (1 − commission %), then up to the next multiple of the rounding step |

Each line is rounded on its own; the calculation's total is the sum of the line totals and its breakdown the sum of the lines'. The price per unit is the total ÷ quantity. When the pieces need more grams of a spool than it has left, the screen warns next to that filament and still shows the price. The formula is `calculateCost` in `shared/calculator.ts`.

Errors come back as JSON with an `error` message in Spanish, since the app shows them as they are.

| Status | When |
|---|---|
| 400 | The body is not JSON (for an edit, not a JSON object) |
| 404 | The order, client, printer, spool or route does not exist |
| 405 | The method is not allowed on that path |
| 422 | The data is missing or invalid (the answer adds `fields`, one message per field), or the stage does not exist |

## Deploy

None of these steps has been done yet. Each one creates something in the Cloudflare account.

1. `npx wrangler d1 create hola3d-app`, then paste the `database_id` into `wrangler.jsonc`.
2. `npx wrangler d1 migrations apply hola3d-app --remote`
3. Add the custom domain `app.hola3d.com.ar` to the Worker.
4. Put Cloudflare Access in front of that domain, so only the owners can sign in.
5. `npm run deploy`

## Credits

The interface font is [Allo](https://joshpuckett.me) by Josh Puckett, under the SIL Open Font License 1.1. Handwritten accents use [Gochi Hand](https://fonts.google.com/specimen/Gochi+Hand).
