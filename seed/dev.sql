-- Sample clients, quotes, orders, printers, spools, print jobs and cost settings for local development only (npm run db:seed).
-- Never run against production. Contact details are made up.
DELETE FROM print_job_filaments;
DELETE FROM print_jobs;
DELETE FROM orders;
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

-- Logged print jobs, one of them failed. Order 0142 has printed half of its keychains so far.
INSERT INTO print_jobs (id, order_id, printer_id, status, planned_start, estimated_minutes, actual_minutes, result, note, created_at, updated_at) VALUES
(1, '0140', 1, 'fallida', NULL, NULL, 95, 'fallida', 'Se despegó de la cama a la hora y media.', '2026-11-14T15:00:00Z', '2026-11-14T15:00:00Z'),
(2, '0140', 1, 'terminada', NULL, NULL, 420, 'ok', 'Segundo intento, con brim.', '2026-11-15T10:00:00Z', '2026-11-15T10:00:00Z'),
(3, '0141', 1, 'terminada', NULL, NULL, 270, 'ok', '', '2026-11-18T09:00:00Z', '2026-11-18T09:00:00Z'),
(4, '0143', 2, 'terminada', NULL, NULL, 180, 'ok', '', '2026-11-17T12:00:00Z', '2026-11-17T12:00:00Z'),
(5, '0142', 1, 'terminada', NULL, NULL, 156, 'ok', 'Primera tanda: 6 de 12.', '2026-11-20T09:00:00Z', '2026-11-20T09:00:00Z');

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

-- The single cost settings row (the migration creates it with defaults; these are the sample shop's numbers).
INSERT OR REPLACE INTO cost_settings (id, kwh_price, labour_per_hour, failure_percent, margin_percent, monthly_fixed_costs, monthly_print_hours, packaging_cost, rounding_step, commission_percent, updated_at) VALUES
(1, 215, 7000, 10, 60, 150000, 180, 900, 100, 0, '2026-11-20T12:00:00Z');
