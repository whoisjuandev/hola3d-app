# Workshop modules

Build the seven modules the owner approved so Hola3D Taller is complete from day 1: printers, filament, clients, calculator and quotes, machine service, projects, calendar and a home dashboard.
Pedidos already works. Deploy is postponed until most of the app works. Branch: `feat/workshop-modules`.

## Conventions (apply to every task)

- Read `README.md`, `shared/orders.ts`, `worker/orders/`, `worker/index.ts`, `src/features/orders/`, `src/shell/` and `src/index.css` first and follow their patterns: domain rules and validation in `shared/`, a repository port with a D1 adapter and an in-memory adapter in `worker/<module>/`, routes that return `null` for foreign paths, one feature folder per screen in `src/features/<module>/`.
- UI copy is Spanish (Rioplatense, voseo), like the existing screens. Code, comments, tests, commits and docs are English.
- Reuse the existing visual language and CSS tokens in `src/index.css`. No new UI dependency. Every screen must work on a phone.
- Money is whole pesos (integers). Weights are whole grams. Print time is stored in minutes.
- Schema changes are new files in `migrations/` (never edit an applied one). Extend `seed/dev.sql` with sample rows for each new table.
- Every new API route gets tests in the style of `worker/orders/routes.test.ts`: status, body, and that rejected input leaves stored data unchanged. Every domain rule gets a test in `shared/`.
- Errors follow the existing shape: `{ error }` in Spanish, 422 with `fields` for invalid data.
- Update `README.md` (status table, folder table, API table) for what the task adds.
- Before finishing: `npm test && npm run typecheck && npm run lint` must pass.
- Navigation: the desktop sidebar lists every section. On a phone the bottom bar keeps four main tabs (Inicio, Pedidos, Calendario, Clientes once it exists) plus a "Más" tab that opens a sheet with all other sections; no section links in the top bar.
- Writes that change a counter another screen also changes (printer minutes, spool grams) must be single SQL statements that add or subtract, never read-then-write.

## Specs

- **S1 Printers.** Approved text: "Impresoras con horas. Cada trabajo terminado suma horas; de ahí salen la amortización y el mantenimiento." A new "Impresoras" section lists, creates and edits printers. Fields: name, model, purchase price, expected lifetime in print hours, average power draw in watts, accumulated print minutes, status (`activa`, `en_servicio`, `fuera_de_uso`), note. The screen shows accumulated hours and the wear cost per print hour (purchase price ÷ lifetime hours).
- **S2 Filament.** Approved text: "Filamento por bobina. Material, color, marca y gramos restantes; se descuenta al imprimir y avisa cuando queda poco o cuando no alcanza para un pedido." A new "Filamento" section lists, creates and edits spools. Fields: material, colour name, colour hex, brand, net spool weight in grams, remaining grams, price paid for the spool, low-stock threshold in grams (default 150), note. A spool with remaining grams at or below its threshold is marked low. Remaining grams cannot go below 0 or above the net weight. The list can be filtered by material and shows total stock in grams.
- **S3 Clients.** Approved text: "Clientes — hoy el cliente es un texto suelto en cada pedido; pasa a ser una ficha con historial y saldo." A new "Clientes" section lists, creates and edits clients. Fields: name, phone, Instagram handle, email, note. Orders reference a client by id; a migration creates one client per distinct existing `orders.client` text and links the orders. The new-order form picks an existing client or creates one inline by typing a new name. The client page shows the client's orders, total spent (sum of prices of delivered orders) and balance owed (for orders not marked paid: price minus deposit).
- **S4 Cost settings.** Approved text: "Calculadora con costo real. Todas suman filamento por color, luz, desgaste de máquina, mano de obra y un porcentaje por fallas, y recién después el margen. Las argentinas agregan gastos fijos del taller repartidos por hora, packaging, comisión de Mercado Libre y redondeo comercial." One editable settings record: electricity price per kWh, labour rate per hour, failure allowance %, margin %, monthly fixed costs, monthly print hours used to spread them, default packaging cost, rounding step in pesos (default 100), sales commission % (default 0).
- **S5 Calculator.** A calculation has one or more lines. Each line: piece name, quantity, printer, print minutes per unit, one or more filament uses (spool or material price per kg, grams per unit), preparation minutes and post-processing minutes for the whole line. The breakdown per calculation, in this order: material = Σ grams × spool price ÷ spool net weight; energy = watts ÷ 1000 × hours × kWh price; machine wear = hours × purchase price ÷ lifetime hours; fixed costs = hours × monthly fixed costs ÷ monthly print hours; labour = (prep + post minutes) ÷ 60 × rate; packaging; failure allowance = failure % of the sum of material, energy and machine wear; production cost = sum of all of the above; profit = margin % of production cost; price before commission = production cost + profit; final price = price before commission ÷ (1 − commission %), rounded up to the rounding step. The screen shows every line of the breakdown, the total and the price per unit, and recalculates as inputs change. The formula lives in `shared/` as a pure function with tests for each term.
- **S6 Quotes.** Approved text: "Presupuesto para mandar. PDF con tu marca o link por WhatsApp, con el precio congelado aunque después cambien tus costos." and "que un presupuesto aceptado se convierta en pedido". A calculation can be saved as a quote for a client, with a number, a validity date and a status (`borrador`, `enviado`, `aceptado`, `rechazado`). The quote stores its lines, breakdown and price as they were when saved; later changes to settings, spools or printers do not change it. A quote has a print view with the Hola3D brand (the browser prints it to PDF; the cost breakdown and margin are not shown to the client, only items, quantities, prices, total and validity) and a button that opens WhatsApp with a ready message. Accepting a quote creates one order per line for that client with the frozen price, and links the order to the quote; a quote can be accepted only once.
- **S7 Print jobs.** Approved text: "Estimado contra real. Al terminar cargás tiempo y gramos reales; el reporte muestra la ganancia verdadera por trabajo." An order can have print jobs. Logging a finished print job records printer, actual minutes, grams used per spool and result (`ok` or `fallida`). It adds the minutes to the printer and subtracts the grams from each spool, in one atomic write; it is rejected, changing nothing, when a spool does not have enough grams. The order shows its real cost (same formula as S5 with actual values, failed jobs included) and real profit (price minus real cost).
- **S8 Machine service.** Approved text: "Servicio técnico — tareas por horas o días y registro de servicios, por impresora." and "Tareas recurrentes que vencen por horas de impresión o por días (lo que pase primero), y un registro de cada servicio con repuestos y costo." Per printer: recurring tasks (name, interval in print hours and/or days) and a service log (date, what was done, parts, cost, optional task it completes). A task is due when the printer's hours since it was last done reach the hour interval or the days since reach the day interval, whichever comes first. Logging a service against a task resets both counters. The section lists what is due first. Creating a printer offers a default plan (clean nozzle every 100 h, lubricate rods every 200 h, check belts every 300 h) the owner can accept or skip.
- **S9 Projects.** Approved text: "Proyectos — agrupar varios pedidos o piezas de un mismo trabajo (como el "Kit robótica" del seed)." A project has a name, a client, a status (`activo`, `terminado`), a due date and a note. Orders can be assigned to one project. The project page shows its orders with their stages, progress (delivered ÷ total), and totals for price, deposits and balance.
- **S10 Calendar.** Approved text: "Calendario — entregas y qué imprime cada máquina." A month view and a week view show order due dates (with overdue ones marked), project due dates and service tasks due by date. A print job can be planned on a printer with a start date and time and an estimated duration; the week view shows planned jobs per printer.
- **S11 Home.** Approved text: "Inicio — qué vence hoy, atrasados, bobinas bajas, mantenimiento vencido y ganancia del mes." The home screen replaces the placeholder and shows: orders due today, overdue orders, low spools, service tasks due, quotes waiting for an answer, and this month's revenue (prices of orders delivered this month) and real profit (S7). Each block links to its section.

Deferred, not part of this feature: live printer status (needs a bridge on the workshop network), store sync, ARCA invoicing, customer upload portal.

## Tasks

| ID | Task | Specs | Route | Commit |
|---|---|---|---|---|
| T1 | Printers and filament: schema, API, screens, nav entries | S1, S2 | worker | 96d3b20 (done) |
| T2 | Clients: schema, migration of existing orders, API, screens, order form picker | S3 | worker | |
| T3 | Cost settings and calculator | S4, S5 | worker | |
| T4 | Quotes: save, print view, WhatsApp, accept into orders | S6 | worker | |
| T5 | Print jobs on orders with real cost | S7 | worker | |
| T6 | Machine service: recurring tasks and service log | S8 | worker | |
| T7 | Projects | S9 | worker | |
| T8 | Calendar with planned print jobs | S10 | worker | |
| T9 | Home dashboard | S11 | worker | |

Order note: clients (T2) go before quotes (T4) because a quote needs a client record. The owner approved the module list; this reorder is technical.

## Log

- **L1** (2026-11-25, user, verbatim): "El deploy lo vamos a hacer cuando tengamos buena parte de la app funcionando, ahora construyamos lo que sigue. Necesito que hagas una investigacion en internet de diferentes plataformas de makers que manejen proyectos, calculadoras, clientes, impresoras, etc. Necesito poder tener una app bien completa desde el dia 1"
- **L2** (2026-11-25, decision): after the research report the owner chose "Sí, los 7 módulos en ese orden" for the proposed day-1 scope: Impresoras y Filamento; Calculadora + Presupuestos; Clientes; Servicio técnico; Proyectos; Calendario; Inicio. Deferred: live Bambu status, store sync, ARCA invoicing, customer upload portal.
- **L3** (2026-11-25, evidence): research sources and the shared patterns are saved in Engram, topic `hola3d-app/market-research-modules`.
- **L4** (2026-11-25, evidence): T1 done in 96d3b20. 75 tests pass, typecheck and lint clean; both screens checked in a browser at 1440 px and 390 px. Follow-ups folded into the conventions: phone navigation moves to a "Más" sheet (T2), and counter writes must be atomic (T5), because the T1 PUT handlers read then write every column.
