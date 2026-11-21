-- Sample orders for local development only (npm run db:seed). Never run against production.
DELETE FROM orders;
INSERT INTO orders (id, item, client, channel, stage, due_date, due_time, price, deposit, paid, material, note, created_at, updated_at) VALUES
('0140', 'Figura articulada dragón', 'Tomás G.', 'Instagram', 'entregado', '2026-11-17', NULL, 18000, NULL, 1, 'PLA multicolor (AMS)', 'Pidió reseña. Ofrecer 10% en la próxima compra.', '2026-11-05T12:00:00Z', '2026-11-17T12:00:00Z'),
('0141', 'Organizador de escritorio', 'Florencia D.', 'WhatsApp', 'listo', '2026-11-21', NULL, 22000, 11000, 0, 'PLA lavanda', 'Envío por moto. Cobrar el saldo al entregar.', '2026-11-08T12:00:00Z', '2026-11-19T12:00:00Z'),
('0142', 'Llaveros con logo × 12', 'Café Nube', 'Instagram', 'imprimiendo', '2026-11-23', NULL, 36000, 18000, 0, 'PLA blanco + amarillo (AMS)', 'Imprimiendo en la A1. Van en bolsita con tarjeta Hola3D.', '2026-11-10T12:00:00Z', '2026-11-20T09:00:00Z'),
('0143', 'Maceta geométrica', 'Lucía M.', 'Tienda web', 'listo', '2026-11-20', '10:00', 12000, NULL, 1, 'PLA celeste', 'Retira hoy a las 10. Ya está embalada.', '2026-11-11T12:00:00Z', '2026-11-19T18:00:00Z'),
('0144', 'Piezas de robótica × 30', 'Escuela N.º 12', 'Email', 'disenando', '2026-11-27', NULL, 96000, 48000, 0, 'PETG blanco', 'Parte del proyecto Kit robótica. Ajustar tolerancias de los ejes a 0,2 mm.', '2026-11-12T12:00:00Z', '2026-11-18T12:00:00Z'),
('0145', 'Soporte de auriculares', 'Martín R.', 'Instagram', 'nuevo', '2026-11-25', NULL, 14500, NULL, 0, 'PLA negro mate', 'Quiere el nombre grabado en la base. Mandó foto del escritorio para elegir el tono.', '2026-11-18T12:00:00Z', '2026-11-18T12:00:00Z'),
('0146', 'Topper de torta “Feliz 30”', 'Sofía P.', 'WhatsApp', 'nuevo', '2026-11-28', NULL, 9000, 4500, 0, 'PLA dorado silk', 'Retira en persona. Confirmar tipografía antes del martes.', '2026-11-19T12:00:00Z', '2026-11-19T12:00:00Z');
