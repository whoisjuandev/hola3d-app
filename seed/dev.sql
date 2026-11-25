-- Sample clients, orders, printers, spools and cost settings for local development only (npm run db:seed). Never run against production.
-- Contact details are made up.
DELETE FROM orders;
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

INSERT INTO orders (id, item, client, client_id, channel, stage, due_date, due_time, price, deposit, paid, material, note, created_at, updated_at) VALUES
('0140', 'Figura articulada dragón', 'Tomás G.', 1, 'Instagram', 'entregado', '2026-11-17', NULL, 18000, NULL, 1, 'PLA multicolor (AMS)', 'Pidió reseña. Ofrecer 10% en la próxima compra.', '2026-11-05T12:00:00Z', '2026-11-17T12:00:00Z'),
('0141', 'Organizador de escritorio', 'Florencia D.', 2, 'WhatsApp', 'listo', '2026-11-21', NULL, 22000, 11000, 0, 'PLA lavanda', 'Envío por moto. Cobrar el saldo al entregar.', '2026-11-08T12:00:00Z', '2026-11-19T12:00:00Z'),
('0142', 'Llaveros con logo × 12', 'Café Nube', 3, 'Instagram', 'imprimiendo', '2026-11-23', NULL, 36000, 18000, 0, 'PLA blanco + amarillo (AMS)', 'Imprimiendo en la A1. Van en bolsita con tarjeta Hola3D.', '2026-11-10T12:00:00Z', '2026-11-20T09:00:00Z'),
('0143', 'Maceta geométrica', 'Lucía M.', 4, 'Tienda web', 'listo', '2026-11-20', '10:00', 12000, NULL, 1, 'PLA celeste', 'Retira hoy a las 10. Ya está embalada.', '2026-11-11T12:00:00Z', '2026-11-19T18:00:00Z'),
('0144', 'Piezas de robótica × 30', 'Escuela N.º 12', 5, 'Email', 'disenando', '2026-11-27', NULL, 96000, 48000, 0, 'PETG blanco', 'Parte del proyecto Kit robótica. Ajustar tolerancias de los ejes a 0,2 mm.', '2026-11-12T12:00:00Z', '2026-11-18T12:00:00Z'),
('0145', 'Soporte de auriculares', 'Martín R.', 6, 'Instagram', 'nuevo', '2026-11-25', NULL, 14500, NULL, 0, 'PLA negro mate', 'Quiere el nombre grabado en la base. Mandó foto del escritorio para elegir el tono.', '2026-11-18T12:00:00Z', '2026-11-18T12:00:00Z'),
('0146', 'Topper de torta “Feliz 30”', 'Sofía P.', 7, 'WhatsApp', 'nuevo', '2026-11-28', NULL, 9000, 4500, 0, 'PLA dorado silk', 'Retira en persona. Confirmar tipografía antes del martes.', '2026-11-19T12:00:00Z', '2026-11-19T12:00:00Z');

INSERT INTO printers (id, name, model, purchase_price, lifetime_hours, power_watts, print_minutes, status, note, created_at, updated_at) VALUES
(1, 'La A1', 'Bambu Lab A1 + AMS lite', 720000, 5000, 95, 74100, 'activa', 'La que más usamos. AMS para multicolor.', '2026-03-02T12:00:00Z', '2026-11-20T09:00:00Z'),
(2, 'La Ender', 'Creality Ender 3 V3 SE', 320000, 3000, 110, 108450, 'en_servicio', 'Cambiando la boquilla, vuelve el lunes.', '2025-06-15T12:00:00Z', '2026-11-18T12:00:00Z'),
(3, 'La vieja', 'Anet A8', 150000, 2000, 120, 121800, 'fuera_de_uso', 'Guardada para repuestos.', '2023-04-01T12:00:00Z', '2026-01-10T12:00:00Z');

INSERT INTO spools (id, material, color_name, color_hex, brand, net_grams, remaining_grams, price, low_stock_grams, note, created_at, updated_at) VALUES
(1, 'PLA', 'Blanco', '#ffffff', 'Grilon3', 1000, 640, 21000, 150, '', '2026-10-28T12:00:00Z', '2026-11-20T09:00:00Z'),
(2, 'PLA', 'Amarillo', '#ffc42e', 'Grilon3', 1000, 310, 21000, 150, 'Para los llaveros de Café Nube.', '2026-10-28T12:00:00Z', '2026-11-20T09:00:00Z'),
(3, 'PLA', 'Lavanda', '#b9a6e8', 'Printalot', 1000, 120, 23500, 150, 'Pedir otra antes de fin de mes.', '2026-09-14T12:00:00Z', '2026-11-19T12:00:00Z'),
(4, 'PLA', 'Celeste', '#8dd3f7', 'Printalot', 1000, 455, 23500, 150, '', '2026-10-02T12:00:00Z', '2026-11-19T18:00:00Z'),
(5, 'PLA', 'Negro mate', '#2b2b2b', 'Grilon3', 1000, 1000, 22500, 150, 'Sin abrir.', '2026-11-15T12:00:00Z', '2026-11-15T12:00:00Z'),
(6, 'PLA', 'Dorado silk', '#d4a72c', 'Printalot', 500, 90, 16000, 100, 'Alcanza para un topper, no para dos.', '2026-08-30T12:00:00Z', '2026-11-12T12:00:00Z'),
(7, 'PETG', 'Blanco', '#f4f4f4', 'Grilon3', 1000, 870, 24000, 200, 'Para las piezas de robótica.', '2026-11-12T12:00:00Z', '2026-11-18T12:00:00Z'),
(8, 'TPU', 'Negro', '#1a1a1a', 'Grilon3', 500, 380, 19000, 100, 'Flexible. Imprimir lento.', '2026-07-21T12:00:00Z', '2026-10-05T12:00:00Z');

-- The single cost settings row (the migration creates it with defaults; these are the sample shop's numbers).
INSERT OR REPLACE INTO cost_settings (id, kwh_price, labour_per_hour, failure_percent, margin_percent, monthly_fixed_costs, monthly_print_hours, packaging_cost, rounding_step, commission_percent, updated_at) VALUES
(1, 215, 7000, 10, 60, 150000, 180, 900, 100, 0, '2026-11-20T12:00:00Z');
