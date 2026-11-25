-- Sample clients, projects, quotes, orders, printers, spools, print jobs (logged and planned), service tasks and logs, calendar events,
-- calculator profiles and cost settings for local development only (npm run db:seed). Never run against production. Contact details are made up.
-- As of 2026-11-25 the home screen has something in every block: order 0145 is due today, 0141, 0142 and 0143 are late,
-- Lavanda and Dorado silk are low, three service tasks are due, P-0002 and the quick quote P-0004 wait for an answer, and
-- 0140 was delivered this month with its real cost.
DELETE FROM calc_profiles;
DELETE FROM calendar_events;
DELETE FROM service_logs;
DELETE FROM service_tasks;
DELETE FROM print_job_filaments;
DELETE FROM print_jobs;
DELETE FROM orders;
DELETE FROM projects;
DELETE FROM quotes;
DELETE FROM clients;
DELETE FROM printers;
DELETE FROM spools;
INSERT INTO clients (id, name, phone, instagram, email, note, created_at, updated_at) VALUES
(1, 'Tomás G.', '+54 9 11 5555-0140', 'tomas.figuras', '', 'Colecciona figuras articuladas.', '2026-11-05T12:00:00Z', '2026-11-05T12:00:00Z'),
(2, 'Florencia D.', '+54 9 11 5555-0141', '', 'flor.d@example.com', '', '2026-11-08T12:00:00Z', '2026-11-08T12:00:00Z'),
(3, 'Café Nube', '+54 9 11 5555-0142', 'cafe.nube', 'hola@cafenube.example', 'Comercio. Paga por transferencia.', '2026-11-10T12:00:00Z', '2026-11-10T12:00:00Z'),
(4, 'Lucía M.', '', 'lu.macetas', '', 'Compra por la tienda web.', '2026-11-11T12:00:00Z', '2026-11-11T12:00:00Z'),
(5, 'Escuela N.º 12', '+54 11 5555-0144', '', 'direccion@escuela12.example', 'Proyecto Kit robótica. Factura a nombre de la cooperadora.', '2026-11-12T12:00:00Z', '2026-11-12T12:00:00Z'),
(6, 'Martín R.', '+54 9 11 5555-0145', 'martin.setup', '', '', '2026-11-18T12:00:00Z', '2026-11-18T12:00:00Z'),
(7, 'Sofía P.', '+54 9 11 5555-0146', '', '', 'Retira en persona.', '2026-11-19T12:00:00Z', '2026-11-19T12:00:00Z'),
(8, 'Bruno A.', '+54 9 11 5555-0147', 'bruno.cosplay', '', 'Preguntó por un casco de cosplay. Todavía sin pedido.', '2026-11-21T12:00:00Z', '2026-11-21T12:00:00Z');

-- Projects: the school's robotics kit, still open, and Tomás's dragon, finished and delivered.
INSERT INTO projects (id, name, client_id, status, due_date, note, created_at, updated_at) VALUES
(1, 'Kit robótica', 5, 'activo', '2026-12-05', 'Piezas para los kits del taller de robótica de la escuela. Factura a nombre de la cooperadora.', '2026-11-12T12:00:00Z', '2026-11-12T12:00:00Z'),
(2, 'Dragón articulado', 1, 'terminado', '2026-11-17', 'Figura de regalo. Ya entregada.', '2026-11-05T12:00:00Z', '2026-11-17T12:00:00Z');

-- Quotes with their calculator input and result frozen as JSON (made with calculateCost). P-0001 was priced with the
-- costs the shop had before the 2026-11-20 update, so it does not match what the calculator says today: that is the point.
INSERT INTO quotes (id, number, client_id, title, status, valid_until, input_json, result_json, total, note, created_at, updated_at) VALUES
(1, 1, 3, 'Llaveros con logo', 'aceptado', '2026-11-24',
  '{"lines":[{"name":"Llaveros con logo","quantity":12,"printerId":1,"printMinutesPerUnit":26,"filaments":[{"spoolId":1,"material":"","pricePerKg":0,"gramsPerUnit":6},{"spoolId":2,"material":"","pricePerKg":0,"gramsPerUnit":3}],"prepMinutes":30,"postMinutes":120,"packaging":2400}]}',
  '{"lines":[{"name":"Llaveros con logo","quantity":12,"printerName":"La A1","printMinutesPerUnit":26,"printMinutes":312,"prepMinutes":30,"postMinutes":120,"filaments":[{"label":"PLA Blanco · Grilon3","colorHex":"#ffffff","gramsPerUnit":6,"grams":72,"pricePerKg":21000,"cost":1512},{"label":"PLA Amarillo · Grilon3","colorHex":"#ffc42e","gramsPerUnit":3,"grams":36,"pricePerKg":21000,"cost":756}],"breakdown":{"material":2268,"energy":99,"machineWear":749,"fixedCosts":3120,"labour":15000,"packaging":2400,"failureAllowance":312,"productionCost":23948,"profit":11974,"priceBeforeCommission":35922,"commission":0,"rounding":78,"finalPrice":36000},"total":36000,"unitPrice":3000}],"breakdown":{"material":2268,"energy":99,"machineWear":749,"fixedCosts":3120,"labour":15000,"packaging":2400,"failureAllowance":312,"productionCost":23948,"profit":11974,"priceBeforeCommission":35922,"commission":0,"rounding":78,"finalPrice":36000},"total":36000,"quantity":12,"unitPrice":3000,"settings":{"kwhPrice":200,"labourPerHour":6000,"failurePercent":10,"marginPercent":50,"monthlyFixedCosts":120000,"monthlyPrintHours":200,"packagingCost":800,"roundingStep":100,"commissionPercent":0}}',
  36000, 'Van en bolsita con tarjeta Hola3D. Seña del 50 % para empezar.', '2026-11-09T15:00:00Z', '2026-11-10T12:00:00Z'),
(2, 2, 8, 'Casco de cosplay', 'enviado', '2026-12-06',
  '{"lines":[{"name":"Casco de cosplay","quantity":1,"printerId":1,"printMinutesPerUnit":1080,"filaments":[{"spoolId":5,"material":"","pricePerKg":0,"gramsPerUnit":900}],"prepMinutes":60,"postMinutes":240,"packaging":2500}]}',
  '{"lines":[{"name":"Casco de cosplay","quantity":1,"printerName":"La A1","printMinutesPerUnit":1080,"printMinutes":1080,"prepMinutes":60,"postMinutes":240,"filaments":[{"label":"PLA Negro mate · Grilon3","colorHex":"#2b2b2b","gramsPerUnit":900,"grams":900,"pricePerKg":22500,"cost":20250}],"breakdown":{"material":20250,"energy":368,"machineWear":2592,"fixedCosts":15000,"labour":35000,"packaging":2500,"failureAllowance":2321,"productionCost":78031,"profit":46819,"priceBeforeCommission":124850,"commission":0,"rounding":50,"finalPrice":124900},"total":124900,"unitPrice":124900}],"breakdown":{"material":20250,"energy":368,"machineWear":2592,"fixedCosts":15000,"labour":35000,"packaging":2500,"failureAllowance":2321,"productionCost":78031,"profit":46819,"priceBeforeCommission":124850,"commission":0,"rounding":50,"finalPrice":124900},"total":124900,"quantity":1,"unitPrice":124900,"settings":{"kwhPrice":215,"labourPerHour":7000,"failurePercent":10,"marginPercent":60,"monthlyFixedCosts":150000,"monthlyPrintHours":180,"packagingCost":900,"roundingStep":100,"commissionPercent":0}}',
  124900, 'Incluye lijado, imprimación y pintura. Entrega en 10 días hábiles desde la seña.', '2026-11-21T16:00:00Z', '2026-11-21T16:30:00Z'),
(3, 3, 2, 'Organizadores para la oficina', 'borrador', '2026-12-09',
  '{"lines":[{"name":"Organizador de escritorio","quantity":3,"printerId":1,"printMinutesPerUnit":270,"filaments":[{"spoolId":3,"material":"","pricePerKg":0,"gramsPerUnit":140}],"prepMinutes":15,"postMinutes":30,"packaging":1800},{"name":"Portalápices","quantity":3,"printerId":1,"printMinutesPerUnit":95,"filaments":[{"spoolId":4,"material":"","pricePerKg":0,"gramsPerUnit":45}],"prepMinutes":10,"postMinutes":15,"packaging":900}]}',
  '{"lines":[{"name":"Organizador de escritorio","quantity":3,"printerName":"La A1","printMinutesPerUnit":270,"printMinutes":810,"prepMinutes":15,"postMinutes":30,"filaments":[{"label":"PLA Lavanda · Printalot","colorHex":"#b9a6e8","gramsPerUnit":140,"grams":420,"pricePerKg":23500,"cost":9870}],"breakdown":{"material":9870,"energy":276,"machineWear":1944,"fixedCosts":11250,"labour":5250,"packaging":1800,"failureAllowance":1209,"productionCost":31599,"profit":18959,"priceBeforeCommission":50558,"commission":0,"rounding":42,"finalPrice":50600},"total":50600,"unitPrice":16867},{"name":"Portalápices","quantity":3,"printerName":"La A1","printMinutesPerUnit":95,"printMinutes":285,"prepMinutes":10,"postMinutes":15,"filaments":[{"label":"PLA Celeste · Printalot","colorHex":"#8dd3f7","gramsPerUnit":45,"grams":135,"pricePerKg":23500,"cost":3173}],"breakdown":{"material":3173,"energy":97,"machineWear":684,"fixedCosts":3958,"labour":2917,"packaging":900,"failureAllowance":395,"productionCost":12124,"profit":7274,"priceBeforeCommission":19398,"commission":0,"rounding":2,"finalPrice":19400},"total":19400,"unitPrice":6467}],"breakdown":{"material":13043,"energy":373,"machineWear":2628,"fixedCosts":15208,"labour":8167,"packaging":2700,"failureAllowance":1604,"productionCost":43723,"profit":26233,"priceBeforeCommission":69956,"commission":0,"rounding":44,"finalPrice":70000},"total":70000,"quantity":6,"unitPrice":11667,"settings":{"kwhPrice":215,"labourPerHour":7000,"failurePercent":10,"marginPercent":60,"monthlyFixedCosts":150000,"monthlyPrintHours":180,"packagingCost":900,"roundingStep":100,"commissionPercent":0}}',
  70000, '', '2026-11-24T11:00:00Z', '2026-11-24T11:00:00Z');

-- A quick quote from the calculator: sent to someone who is not a client yet (name and phone as text), with no
-- validity date and the cost breakdown on its print view. Priced with today's costs and the ×3 multiplier.
INSERT INTO quotes (id, number, client_id, recipient_name, recipient_phone, title, status, valid_until, show_breakdown, input_json, result_json, total, note, created_at, updated_at) VALUES
(4, 4, NULL, 'Valentina S.', '+54 9 11 5555-0150', 'Imanes con nombre para el cumple', 'enviado', NULL, 1,
  '{"lines":[{"name":"Imán de heladera con nombre","quantity":20,"printerId":1,"printMinutesPerUnit":18,"filaments":[{"spoolId":4,"material":"","pricePerKg":0,"gramsPerUnit":5},{"spoolId":1,"material":"","pricePerKg":0,"gramsPerUnit":2}],"prepMinutes":20,"postMinutes":60,"packaging":1800}],"profit":{"mode":"multiplicador","value":3}}',
  '{"lines":[{"name":"Imán de heladera con nombre","quantity":20,"printerName":"La A1","printMinutesPerUnit":18,"printMinutes":360,"prepMinutes":20,"postMinutes":60,"filaments":[{"label":"PLA Celeste · Printalot","colorHex":"#8dd3f7","gramsPerUnit":5,"grams":100,"pricePerKg":23500,"cost":2350},{"label":"PLA Blanco · Grilon3","colorHex":"#ffffff","gramsPerUnit":2,"grams":40,"pricePerKg":21000,"cost":840}],"breakdown":{"material":3190,"energy":123,"machineWear":864,"fixedCosts":5000,"labour":9333,"packaging":1800,"failureAllowance":418,"productionCost":20728,"profit":41456,"priceBeforeCommission":62184,"commission":0,"rounding":16,"finalPrice":62200},"total":62200,"unitPrice":3110}],"breakdown":{"material":3190,"energy":123,"machineWear":864,"fixedCosts":5000,"labour":9333,"packaging":1800,"failureAllowance":418,"productionCost":20728,"profit":41456,"priceBeforeCommission":62184,"commission":0,"rounding":16,"finalPrice":62200},"total":62200,"quantity":20,"unitPrice":3110,"settings":{"kwhPrice":215,"labourPerHour":7000,"failurePercent":10,"marginPercent":60,"monthlyFixedCosts":150000,"monthlyPrintHours":180,"packagingCost":900,"roundingStep":100,"commissionPercent":0},"profit":{"mode":"multiplicador","value":3}}',
  62200, 'Entrega en 5 días hábiles desde la seña.', '2026-11-25T10:00:00Z', '2026-11-25T10:00:00Z');

INSERT INTO orders (id, item, client, client_id, channel, stage, due_date, due_time, price, deposit, paid, material, note, created_at, updated_at) VALUES
('0140', 'Figura articulada dragón', 'Tomás G.', 1, 'Instagram', 'entregado', '2026-11-17', NULL, 18000, NULL, 1, 'PLA multicolor (AMS)', 'Pidió reseña. Ofrecer 10% en la próxima compra.', '2026-11-05T12:00:00Z', '2026-11-17T12:00:00Z'),
('0141', 'Organizador de escritorio', 'Florencia D.', 2, 'WhatsApp', 'listo', '2026-11-21', NULL, 22000, 11000, 0, 'PLA lavanda', 'Envío por moto. Cobrar el saldo al entregar.', '2026-11-08T12:00:00Z', '2026-11-19T12:00:00Z'),
('0142', 'Llaveros con logo × 12', 'Café Nube', 3, 'Instagram', 'imprimiendo', '2026-11-23', NULL, 36000, 18000, 0, 'PLA blanco + amarillo (AMS)', 'Imprimiendo en la A1. Van en bolsita con tarjeta Hola3D.', '2026-11-10T12:00:00Z', '2026-11-20T09:00:00Z'),
('0143', 'Maceta geométrica', 'Lucía M.', 4, 'Tienda web', 'listo', '2026-11-20', '10:00', 12000, NULL, 1, 'PLA celeste', 'Retira hoy a las 10. Ya está embalada.', '2026-11-11T12:00:00Z', '2026-11-19T18:00:00Z'),
('0144', 'Piezas de robótica × 30', 'Escuela N.º 12', 5, 'Email', 'disenando', '2026-11-27', NULL, 96000, 48000, 0, 'PETG blanco', 'Parte del proyecto Kit robótica. Ajustar tolerancias de los ejes a 0,2 mm.', '2026-11-12T12:00:00Z', '2026-11-18T12:00:00Z'),
('0145', 'Soporte de auriculares', 'Martín R.', 6, 'Instagram', 'nuevo', '2026-11-25', NULL, 14500, NULL, 0, 'PLA negro mate', 'Quiere el nombre grabado en la base. Mandó foto del escritorio para elegir el tono.', '2026-11-18T12:00:00Z', '2026-11-18T12:00:00Z'),
('0146', 'Topper de torta “Feliz 30”', 'Sofía P.', 7, 'WhatsApp', 'nuevo', '2026-11-28', NULL, 9000, 4500, 0, 'PLA dorado silk', 'Retira en persona. Confirmar tipografía antes del martes.', '2026-11-19T12:00:00Z', '2026-11-19T12:00:00Z');

-- Order 0142 is the accepted quote P-0001 (one line, at its frozen price).
UPDATE orders SET quote_id = 1 WHERE id = '0142';

-- The dragon figure was delivered on the 17th: with its print jobs below, the home screen shows November's revenue and
-- real profit (18000 − 16650).
UPDATE orders SET delivered_at = '2026-11-17T12:00:00Z' WHERE id = '0140';

-- The robotics pieces are the Kit robótica project; the dragon figure is the finished project.
UPDATE orders SET project_id = 1 WHERE id = '0144';
UPDATE orders SET project_id = 2 WHERE id = '0140';

-- Printer minutes and spool grams as they were before the print jobs below; the jobs then add and subtract theirs.
INSERT INTO printers (id, name, model, purchase_price, lifetime_hours, power_watts, print_minutes, status, note, created_at, updated_at) VALUES
(1, 'La A1', 'Bambu Lab A1 + AMS lite', 720000, 5000, 95, 73159, 'activa', 'La que más usamos. AMS para multicolor.', '2026-03-02T12:00:00Z', '2026-11-20T09:00:00Z'),
(2, 'La Ender', 'Creality Ender 3 V3 SE', 320000, 3000, 110, 108270, 'en_servicio', 'Cambiando la boquilla, vuelve el lunes.', '2025-06-15T12:00:00Z', '2026-11-18T12:00:00Z'),
(3, 'La vieja', 'Anet A8', 150000, 2000, 120, 121800, 'fuera_de_uso', 'Guardada para repuestos.', '2023-04-01T12:00:00Z', '2026-01-10T12:00:00Z');

INSERT INTO spools (id, material, color_name, color_hex, brand, net_grams, remaining_grams, price, low_stock_grams, note, created_at, updated_at) VALUES
(1, 'PLA', 'Blanco', '#ffffff', 'Grilon3', 1000, 761, 21000, 150, '', '2026-10-28T12:00:00Z', '2026-11-20T09:00:00Z'),
(2, 'PLA', 'Amarillo', '#ffc42e', 'Grilon3', 1000, 363, 21000, 150, 'Para los llaveros de Café Nube.', '2026-10-28T12:00:00Z', '2026-11-20T09:00:00Z'),
(3, 'PLA', 'Lavanda', '#b9a6e8', 'Printalot', 1000, 260, 23500, 150, 'Pedir otra antes de fin de mes.', '2026-09-14T12:00:00Z', '2026-11-19T12:00:00Z'),
(4, 'PLA', 'Celeste', '#8dd3f7', 'Printalot', 1000, 550, 23500, 150, '', '2026-10-02T12:00:00Z', '2026-11-19T18:00:00Z'),
(5, 'PLA', 'Negro mate', '#2b2b2b', 'Grilon3', 1000, 1000, 22500, 150, 'Sin abrir.', '2026-11-15T12:00:00Z', '2026-11-15T12:00:00Z'),
(6, 'PLA', 'Dorado silk', '#d4a72c', 'Printalot', 500, 90, 16000, 100, 'Alcanza para un topper, no para dos.', '2026-08-30T12:00:00Z', '2026-11-12T12:00:00Z'),
(7, 'PETG', 'Blanco', '#f4f4f4', 'Grilon3', 1000, 870, 24000, 200, 'Para las piezas de robótica.', '2026-11-12T12:00:00Z', '2026-11-18T12:00:00Z'),
(8, 'TPU', 'Negro', '#1a1a1a', 'Grilon3', 500, 380, 19000, 100, 'Flexible. Imprimir lento.', '2026-07-21T12:00:00Z', '2026-10-05T12:00:00Z');

-- Logged print jobs, one of them failed. Order 0142 has printed half of its keychains so far. Each job carries the cost
-- it stored when it was logged, worked out with the printers and spools above and the cost settings at the end of this
-- file (kWh $215, labour $7000/h, $150000 of fixed costs over 180 h), as `jobCost` in shared/print-jobs.ts does:
--   1: 525 + 32 + 228 + 1319 = 2104                         2: 1995 + 143 + 1008 + 5833 + labour 4667 (40 min) + extra 900 = 14546
--   3: 3290 + 92 + 648 + 3750 = 7780                        4: 2233 + 71 + 320 + 2500 + labour 2333 (20 min) + extra 900 = 8357
--   5: 1134 + 53 + 374 + 2167 + labour 3500 (30 min) = 7228
-- Real cost per order: 0140 16650 (price 18000), 0141 7780, 0142 7228, 0143 8357.
INSERT INTO print_jobs (id, order_id, printer_id, status, planned_start, estimated_minutes, actual_minutes, result, labour_minutes, extra_cost,
  cost_material, cost_energy, cost_machine_wear, cost_fixed, cost_labour, cost_extra, note, created_at, updated_at) VALUES
(1, '0140', 1, 'fallida', NULL, NULL, 95, 'fallida', 0, 0, 525, 32, 228, 1319, 0, 0, 'Se despegó de la cama a la hora y media.', '2026-11-14T15:00:00Z', '2026-11-14T15:00:00Z'),
(2, '0140', 1, 'terminada', NULL, NULL, 420, 'ok', 40, 900, 1995, 143, 1008, 5833, 4667, 900, 'Segundo intento, con brim. Lijado y caja de regalo.', '2026-11-15T10:00:00Z', '2026-11-15T10:00:00Z'),
(3, '0141', 1, 'terminada', NULL, NULL, 270, 'ok', 0, 0, 3290, 92, 648, 3750, 0, 0, '', '2026-11-18T09:00:00Z', '2026-11-18T09:00:00Z'),
(4, '0143', 2, 'terminada', NULL, NULL, 180, 'ok', 20, 900, 2233, 71, 320, 2500, 2333, 900, 'Embalada en caja.', '2026-11-17T12:00:00Z', '2026-11-17T12:00:00Z'),
(5, '0142', 1, 'terminada', NULL, NULL, 156, 'ok', 30, 0, 1134, 53, 374, 2167, 3500, 0, 'Primera tanda: 6 de 12.', '2026-11-20T09:00:00Z', '2026-11-20T09:00:00Z');

-- Planned jobs for the calendar, all on La A1 (the only active printer), none overlapping, in the week of 2026-11-25 and
-- the next. A planned job has no outcome, no grams and no cost, and the counter updates below skip it.
INSERT INTO print_jobs (id, order_id, printer_id, status, planned_start, estimated_minutes, actual_minutes, result, labour_minutes, extra_cost,
  cost_material, cost_energy, cost_machine_wear, cost_fixed, cost_labour, cost_extra, note, created_at, updated_at) VALUES
(6, '0142', 1, 'planeada', '2026-11-25T14:00', 160, NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 0, 'Segunda tanda: los 6 llaveros que faltan.', '2026-11-20T09:30:00Z', '2026-11-20T09:30:00Z'),
(7, '0144', 1, 'planeada', '2026-11-26T09:00', 480, NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 0, 'Primera mitad de las piezas de robótica, en PETG.', '2026-11-24T12:00:00Z', '2026-11-24T12:00:00Z'),
(8, '0145', 1, 'planeada', '2026-11-26T18:00', 300, NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 0, 'De noche: soporte con el nombre en la base.', '2026-11-24T12:00:00Z', '2026-11-24T12:00:00Z'),
(9, '0146', 1, 'planeada', '2026-11-27T10:00', 90, NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 0, 'Dorado silk: alcanza justo.', '2026-11-24T12:00:00Z', '2026-11-24T12:00:00Z'),
(10, '0144', 1, 'planeada', '2026-11-30T09:00', 480, NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 0, 'Segunda mitad de las piezas de robótica.', '2026-11-24T12:00:00Z', '2026-11-24T12:00:00Z'),
(11, '0144', 1, 'planeada', '2026-12-02T08:30', 240, NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 0, 'Repuestos para los kits.', '2026-11-24T12:00:00Z', '2026-11-24T12:00:00Z');

INSERT INTO print_job_filaments (id, job_id, spool_id, grams) VALUES
(1, 1, 1, 25),
(2, 2, 1, 60),
(3, 2, 2, 35),
(4, 3, 3, 140),
(5, 4, 4, 95),
(6, 5, 1, 36),
(7, 5, 2, 18);

-- Apply the jobs to the counters, as logging them in the app does. After this: La A1 74100 min, La Ender 108450 min;
-- Blanco 640 g, Amarillo 310 g, Lavanda 120 g, Celeste 455 g. The rows keep their updated_at.
UPDATE printers SET print_minutes = print_minutes + (SELECT COALESCE(SUM(actual_minutes), 0) FROM print_jobs WHERE printer_id = printers.id AND status != 'planeada');
UPDATE spools SET remaining_grams = remaining_grams - (SELECT COALESCE(SUM(grams), 0) FROM print_job_filaments WHERE spool_id = spools.id);

-- Service tasks, counted from when each was last done. As of 2026-11-25 (La A1 at 74100 min, La Ender at 108450 min):
--   1 A1 boquilla: 95 h of 100, 5 h left               2 A1 varillas: 215 h of 200, due by hours
--   3 A1 correas: 185 h of 300, 115 h left             4 A1 cama: 36 days of 30, due by days
--   5 Ender boquilla: 0 h of 100                       6 Ender varillas: 140,8 h of 200 but 116 days of 90, due by days
--   7 Ender correas: 157,5 h of 300                    La vieja has no plan, so its card offers one.
INSERT INTO service_tasks (id, printer_id, name, interval_hours, interval_days, last_done_minutes, last_done_date, active, created_at, updated_at) VALUES
(1, 1, 'Limpiar boquilla', 100, NULL, 68400, '2026-11-10', 1, '2026-03-02T12:00:00Z', '2026-11-10T18:00:00Z'),
(2, 1, 'Lubricar varillas', 200, NULL, 61200, '2026-09-15', 1, '2026-03-02T12:00:00Z', '2026-09-15T18:00:00Z'),
(3, 1, 'Revisar correas', 300, NULL, 63000, '2026-09-15', 1, '2026-03-02T12:00:00Z', '2026-09-15T18:00:00Z'),
(4, 1, 'Limpiar la cama PEI', NULL, 30, 70800, '2026-10-20', 1, '2026-05-04T12:00:00Z', '2026-10-20T18:00:00Z'),
(5, 2, 'Limpiar boquilla', 100, NULL, 108450, '2026-11-18', 1, '2025-06-15T12:00:00Z', '2026-11-18T12:00:00Z'),
(6, 2, 'Lubricar varillas', 200, 90, 100000, '2026-08-01', 1, '2025-06-15T12:00:00Z', '2026-08-01T12:00:00Z'),
(7, 2, 'Revisar correas', 300, NULL, 99000, '2026-08-01', 1, '2025-06-15T12:00:00Z', '2026-08-01T12:00:00Z');

-- Services done, with parts and cost. Total per printer: La A1 $5800, La Ender $11300, La vieja $0.
INSERT INTO service_logs (id, printer_id, task_id, service_date, done, parts, cost, note, created_at, updated_at) VALUES
(1, 2, 6, '2026-08-01', 'Lubricar varillas', 'Grasa de litio', 0, 'Quedaba grasa del pomo anterior.', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z'),
(2, 2, 7, '2026-08-01', 'Revisar correas', '', 0, '', '2026-08-01T12:00:00Z', '2026-08-01T12:00:00Z'),
(3, 2, NULL, '2026-09-02', 'Cambio de ventilador de capa', 'Ventilador 4010 24 V', 4800, 'Hacía ruido.', '2026-09-02T12:00:00Z', '2026-09-02T12:00:00Z'),
(4, 1, 2, '2026-09-15', 'Lubricar varillas', 'Grasa de litio', 2500, '', '2026-09-15T18:00:00Z', '2026-09-15T18:00:00Z'),
(5, 1, 3, '2026-09-15', 'Revisar correas', '', 0, 'Tensadas las dos.', '2026-09-15T18:00:00Z', '2026-09-15T18:00:00Z'),
(6, 1, 4, '2026-10-20', 'Limpiar la cama PEI', 'Alcohol isopropílico', 1800, '', '2026-10-20T18:00:00Z', '2026-10-20T18:00:00Z'),
(7, 1, 1, '2026-11-10', 'Limpiar boquilla', 'Aguja de limpieza 0,4 mm', 1500, '', '2026-11-10T18:00:00Z', '2026-11-10T18:00:00Z'),
(8, 2, 5, '2026-11-18', 'Cambio de boquilla', 'Boquilla 0,4 mm de latón × 2', 6500, 'Estaba tapada. Vuelve el lunes.', '2026-11-18T12:00:00Z', '2026-11-18T12:00:00Z'),
(9, 3, NULL, '2026-01-10', 'Desarmada para repuestos', '', 0, 'Se guardaron el hotend y los motores.', '2026-01-10T12:00:00Z', '2026-01-10T12:00:00Z');

-- Hand-made calendar events of every type around 2026-11-25, one of them already done (shown struck through).
INSERT INTO calendar_events (id, type, title, event_date, event_time, note, done, created_at, updated_at) VALUES
(1, 'recordatorio', 'Pagar la luz del taller', '2026-11-24', NULL, 'Vence el 25.', 1, '2026-11-20T12:00:00Z', '2026-11-24T10:00:00Z'),
(2, 'reunion', 'Escuela N.º 12: ver muestras del kit', '2026-11-25', '10:30', 'Llevar dos piezas impresas en PETG.', 0, '2026-11-20T12:00:00Z', '2026-11-20T12:00:00Z'),
(3, 'tarea', 'Pedir PETG negro', '2026-11-25', NULL, 'Dos rollos para la segunda mitad del kit.', 0, '2026-11-21T12:00:00Z', '2026-11-21T12:00:00Z'),
(4, 'retiro', 'Retirar PETG negro en el proveedor', '2026-11-27', '18:00', 'Pagar en efectivo al retirar.', 0, '2026-11-22T12:00:00Z', '2026-11-22T12:00:00Z'),
(5, 'entrega', 'Llevar llaveros a Café Nube', '2026-11-28', '11:00', '', 0, '2026-11-22T12:00:00Z', '2026-11-22T12:00:00Z'),
(6, 'recordatorio', 'Cobrar la seña del Kit robótica', '2026-12-01', NULL, '', 0, '2026-11-23T12:00:00Z', '2026-11-23T12:00:00Z'),
(7, 'reunion', 'Martín R.: el nombre del soporte', '2026-12-03', '19:00', 'Por videollamada.', 0, '2026-11-23T12:00:00Z', '2026-11-23T12:00:00Z');

-- Saved calculator profiles. "Llaveros por mayor" prices by multiplier; "Topper dorado" still names spool 9, which the shop
-- no longer has, so loading it shows the notice and leaves that filament to choose again.
INSERT INTO calc_profiles (id, name, input_json, created_at, updated_at) VALUES
(1, 'Llaveros por mayor',
  '{"lines":[{"name":"Llavero con logo","quantity":50,"printerId":1,"printMinutesPerUnit":26,"filaments":[{"spoolId":1,"material":"","pricePerKg":0,"gramsPerUnit":6},{"spoolId":2,"material":"","pricePerKg":0,"gramsPerUnit":3}],"prepMinutes":30,"postMinutes":150,"packaging":4000}],"profit":{"mode":"multiplicador","value":3}}',
  '2026-11-18T12:00:00Z', '2026-11-18T12:00:00Z'),
(2, 'Organizador de escritorio',
  '{"lines":[{"name":"Organizador de escritorio","quantity":1,"printerId":1,"printMinutesPerUnit":270,"filaments":[{"spoolId":3,"material":"","pricePerKg":0,"gramsPerUnit":140}],"prepMinutes":15,"postMinutes":30,"packaging":900}],"profit":{"mode":"porcentaje","value":60}}',
  '2026-11-19T12:00:00Z', '2026-11-19T12:00:00Z'),
(3, 'Topper dorado',
  '{"lines":[{"name":"Topper de torta","quantity":1,"printerId":1,"printMinutesPerUnit":95,"filaments":[{"spoolId":9,"material":"","pricePerKg":0,"gramsPerUnit":35}],"prepMinutes":10,"postMinutes":20,"packaging":700}]}',
  '2026-11-20T12:00:00Z', '2026-11-20T12:00:00Z');

-- The single cost settings row (the migration creates it with defaults; these are the sample shop's numbers). New
-- calculations start in percentage (60 %); the multiplier mode starts at ×3 and offers the three shortcuts.
INSERT OR REPLACE INTO cost_settings (id, kwh_price, labour_per_hour, failure_percent, margin_percent, monthly_fixed_costs, monthly_print_hours, packaging_cost, rounding_step, commission_percent, profit_mode, profit_multiplier, profit_shortcuts_json, updated_at) VALUES
(1, 215, 7000, 10, 60, 150000, 180, 900, 100, 0, 'porcentaje', 3,
  '[{"name":"Mayorista","multiplier":3},{"name":"Minorista","multiplier":4},{"name":"Llaveros","multiplier":5}]', '2026-11-20T12:00:00Z');
