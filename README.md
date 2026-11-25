# Hola3D Taller

The internal workshop app for Hola3D, a 3D printing shop. It tracks every order from the first message to the delivery, on one board.

![The Pedidos board with orders grouped by stage](docs/pedidos.png)

## Status

| Section | State |
|---|---|
| Pedidos (orders) | Works end to end: board, search, new order (pick a client or type a new one), stage moves. The order detail logs print jobs (printer, time, grams per spool, result, and optionally labour minutes and an extra cost); each job's cost is frozen when logged, and the detail shows the real cost in six terms and the real profit next to the price |
| Clientes (clients) | List with search, create and edit. Client page with contact links, orders, total spent and balance owed |
| Impresoras (printers) | List, create and edit. Shows accumulated print hours and machine wear per print hour; logged print jobs add their hours |
| Filamento (spools) | List, create and edit. Filter by material, total stock in grams, low-stock warning; logged print jobs take their grams off |
| Calculadora (calculator) | Prices one or more pieces with the real cost breakdown, total and price per unit, live. Edits the workshop costs. Saves the calculation as a quote for a client |
| Presupuestos (quotes) | List with status filter and totals. Quote page with the frozen lines and breakdown; mark sent, accept into orders, reject, print view for PDF, WhatsApp message. Client pages list their quotes; orders link back to their quote |
| Inicio, Proyectos, Calendario, Servicio técnico | Placeholder screens |
| Deploy to `app.hola3d.com.ar` | Not done yet, see [Deploy](#deploy) |

The app has no login of its own. It is meant to run behind Cloudflare Access, so do not deploy it without that step.

## Run it locally

You need Node.js 22 or newer. Nothing here touches a Cloudflare account: the database is a local D1 copy.

```bash
npm install
npm run db:migrate   # create the local D1 tables
npm run db:seed      # load sample clients, quotes, orders, printers, spools, print jobs and cost settings
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
| `src/` | React 19 app (Vite, React Router). One folder per screen in `features/` (`orders/` is Pedidos, `clients/` Clientes, `printers/` Impresoras, `spools/` Filamento, `calculator/` Calculadora, `quotes/` Presupuestos and the quote print view), `shell/` the navigation, `ui/` pieces the screens share (API calls, form dialog, icons) |
| `worker/` | The Worker: API under `/api/*`, everything else is the single-page app. One folder per module (`orders/`, `print-jobs/`, `clients/`, `printers/`, `spools/`, `settings/`, `quotes/`) with its routes and a storage port with a D1 and an in-memory adapter (the in-memory adapters share tables, `memory.ts`, where they read each other's rows); `index.ts` tries each module in turn |
| `shared/` | Rules used by both sides: order stages, validation and search; client validation, name matching, total spent, balance owed and contact links; printer validation, hours and wear cost; spool validation, low stock, material filter and stock totals; cost settings validation and defaults; the cost formula and spool shortages for the calculator; quote validation, status rules, the orders a quote becomes and its WhatsApp message; print job validation, the cost of one job and the real cost of an order from its jobs' stored costs |
| `migrations/` | D1 schema, one file per change |
| `seed/` | Sample clients, quotes, orders, printers, spools, print jobs and cost settings, for local use only |

An order moves through five stages, in order:

`nuevo` → `disenando` → `imprimiendo` → `listo` → `entregado`

## API

| Method | Path | What it does |
|---|---|---|
| GET | `/api/orders` | List all orders. Each one has `client` (the client's name), `clientId`, `quoteId` (the quote it was accepted from, or null), and `realCost` and `realProfit` (from its print jobs; null while it has none) |
| POST | `/api/orders` | Create an order. It starts in `nuevo` and takes the next number, padded to four digits |
| PUT | `/api/orders/:id/stage` | Move an order to another stage |
| GET | `/api/orders/:id/jobs` | The order's print jobs, oldest first, each with its stored `cost`, and `cost`: the order's real cost term by term (null without jobs) |
| POST | `/api/orders/:id/jobs` | Log a finished print job: store it with its cost, add its minutes to the printer and take its grams off each spool, in one atomic write. Answers the job and the order |
| DELETE | `/api/orders/:id/jobs/:jobId` | Delete a logged job and give its minutes and grams back, in one atomic write. Answers the order |
| GET | `/api/clients` | List clients, by name, each with `orderCount`, `totalSpent` and `balanceOwed` |
| POST | `/api/clients` | Create a client |
| GET | `/api/clients/:id` | One client with its totals, and its `orders` |
| PUT | `/api/clients/:id` | Edit a client. Send only the fields to change; the rest keep their value |
| GET | `/api/printers` | List printers, by name |
| POST | `/api/printers` | Create a printer |
| PUT | `/api/printers/:id` | Edit a printer. Send only the fields to change; only those are written, so minutes a print job adds meanwhile are kept |
| GET | `/api/spools` | List filament spools, by material and colour |
| POST | `/api/spools` | Create a spool |
| PUT | `/api/spools/:id` | Edit a spool. Send only the fields to change; only those are written, so grams a print job takes meanwhile are kept |
| GET | `/api/settings/costs` | The workshop cost settings (the defaults, with `updatedAt` null, until saved) |
| PUT | `/api/settings/costs` | Edit the cost settings. Send only the fields to change; the rest keep their value |
| GET | `/api/quotes` | List quotes, newest number first, each with `client` (the client's name). `?clientId=3` lists one client's |
| POST | `/api/quotes` | Save a calculator input as a quote. The server prices it with the stored printers, spools and settings and freezes the result |
| GET | `/api/quotes/:id` | One quote, its `client` record and the `orders` made from it |
| PUT | `/api/quotes/:id` | Edit `title`, `validUntil`, `note` or `status`. Send only the fields to change; the lines and prices never change |
| POST | `/api/quotes/:id/accept` | Create one order per line and mark the quote `aceptado`, in one atomic write. Only once |

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

A quote saves a calculation for a client. It needs a client (`clientId`, or a `client` name, matched or created as for an order), `title`, `validUntil` (`YYYY-MM-DD`; the screen starts it 15 days from today) and `input`, the calculator's input (one to 30 pieces, each with a name of up to 100 characters and a quantity of at least 1); `note` (for the client) is optional. The server prices the input with what is stored at that moment and keeps the input and the whole result (lines, breakdown, the settings used) as JSON: later changes to settings, spools or printers never change a saved quote, and any total sent by the browser is ignored. A printer or spool that no longer exists answers 422 on `input`, before any new client is created. Quotes are numbered `P-0001`, `P-0002`… and start as `borrador`.

The status moves freely between `borrador`, `enviado` and `rechazado`. Only accepting makes a quote `aceptado` (a `PUT` to `aceptado` answers 422), and an accepted quote keeps that status (409). Accepting takes an optional `channel` (default `WhatsApp`) and creates, for the quote's client, one order per line in `nuevo`: the item is the piece name with its quantity (`Llavero con logo × 12`), the price is the line's frozen price, and the order's `quoteId` points to the quote. The orders and the status change are one D1 batch, so either all of it is written or none. A second accept, or accepting a `rechazado` quote, answers 409 and creates nothing.

The quote page has a print view at `/presupuestos/:id/imprimir`, outside the app shell: brand, number, date, client, items with quantity, unit price and line price, total, validity and note, never costs or margin. The browser prints it to one A4 page or saves it as PDF. The WhatsApp button opens `https://wa.me/<client phone digits>?text=…` (or `https://wa.me/?text=…` without a phone) with the items, the total and the validity date; the message is `quoteWhatsappMessage` in `shared/quotes.ts`.

```bash
# Accept quote 2; its orders came in by Instagram
curl -X POST http://localhost:5173/api/quotes/2/accept \
  -H 'content-type: application/json' \
  -d '{"channel":"Instagram"}'
```

A print job belongs to an order. Logging one needs `printerId`, `actualMinutes` (whole minutes, more than 0), `result` (`ok` or `fallida`) and `filaments`, one to 16 spools each with whole `grams` above 0 (`[{"spoolId":1,"grams":36}]`); `note`, `labourMinutes` (preparation and post-processing actually spent, whole minutes from 0) and `extraCost` (packaging and other supplies, whole pesos from 0) are optional, and the last two default to 0. A wrong `labourMinutes` or `extraCost` answers 422 on that field. It answers 422 and changes nothing when the printer or a spool does not exist, when a spool appears twice, or when a spool has fewer grams left than the job used. The job, its grams per spool, the printer's minutes and every spool's grams are written in one D1 batch whose statements all repeat the same check, so two logs at the same time can never take a spool below 0 g. A job with result `ok` is stored as `terminada`, a failed one as `fallida`; the table also has `planeada`, `planned_start` and `estimated_minutes` for planning jobs on the calendar later. Deleting a job takes its minutes off the printer (not below 0) and gives its grams back to each spool (not above the net weight), also in one batch. Editing a printer or a spool writes only the fields sent, so an edit never overwrites the counters a job changed in between.

The cost of a job is worked out once, when it is logged, with the printer, spool prices and cost settings of that moment, and stored with the job in six terms, each in whole pesos: material, energy, machine wear and fixed costs as in the calculator, from the actual grams and minutes; labour = labour minutes ÷ 60 × the hourly rate; and the extra cost as logged. Later changes to prices or settings never change it. Migration `0007` added these columns and froze the jobs logged before it with the prices and settings of the moment it ran. The real cost of an order is the sum of the stored terms of all its jobs, failed ones included; it has no failure allowance, because failures are counted for real. Real profit is the order's price minus its real cost; it can be negative. The formulas are `jobCost` (one job, used when logging) and `realCost` (an order, from the stored costs, used on every read) in `shared/print-jobs.ts`.

```bash
# Log 2 h 36 min on printer 1 for order 0142, with 36 g of spool 1 and 18 g of spool 2, 30 min of labour and $900 of packaging
curl -X POST http://localhost:5173/api/orders/0142/jobs \
  -H 'content-type: application/json' \
  -d '{"printerId":1,"actualMinutes":156,"result":"ok","labourMinutes":30,"extraCost":900,"filaments":[{"spoolId":1,"grams":36},{"spoolId":2,"grams":18}]}'
```

Errors come back as JSON with an `error` message in Spanish, since the app shows them as they are.

| Status | When |
|---|---|
| 400 | The body is not JSON (for an edit, not a JSON object) |
| 404 | The order, client, printer, spool, quote, print job or route does not exist |
| 405 | The method is not allowed on that path |
| 409 | The quote was already accepted, or is rejected, so it cannot be accepted or change status |
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
