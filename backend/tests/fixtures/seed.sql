-- Datos base estables para integración
-- Password de todos los usuarios activos: Test1234!
-- bcrypt: $2b$10$I6z921pOS9ExCoFPZaxPE..wedpQ7DsIMV95egBBn5.Y4ZFzCtWs6

SET NAMES utf8mb4;

INSERT INTO usuarios (id, nombre, email, password_hash, rol, activo, email_verificado) VALUES
  (1, 'Admin Test', 'admin@test.local', '$2b$10$I6z921pOS9ExCoFPZaxPE..wedpQ7DsIMV95egBBn5.Y4ZFzCtWs6', 'admin', 1, 1),
  (2, 'Compras Test', 'compras@test.local', '$2b$10$I6z921pOS9ExCoFPZaxPE..wedpQ7DsIMV95egBBn5.Y4ZFzCtWs6', 'compras', 1, 1),
  (3, 'Solicitante Uno', 'sol1@test.local', '$2b$10$I6z921pOS9ExCoFPZaxPE..wedpQ7DsIMV95egBBn5.Y4ZFzCtWs6', 'solicitante', 1, 1),
  (4, 'Solicitante Dos', 'sol2@test.local', '$2b$10$I6z921pOS9ExCoFPZaxPE..wedpQ7DsIMV95egBBn5.Y4ZFzCtWs6', 'solicitante', 1, 1),
  (5, 'Inactivo Test', 'inactivo@test.local', '$2b$10$I6z921pOS9ExCoFPZaxPE..wedpQ7DsIMV95egBBn5.Y4ZFzCtWs6', 'solicitante', 0, 1),
  (6, 'No Verificado', 'noverif@test.local', '$2b$10$I6z921pOS9ExCoFPZaxPE..wedpQ7DsIMV95egBBn5.Y4ZFzCtWs6', 'solicitante', 1, 0);

INSERT INTO proveedores (id, num_proveedor, nombre, email, activo) VALUES
  (1, '00001', 'Proveedor Alpha', 'alpha@proveedor.test', 1),
  (2, '00002', 'Proveedor Beta', 'beta@proveedor.test', 1),
  (3, '00003', 'Tienda Sin Email', NULL, 1);

INSERT INTO catalogo (id, tipo, codigo, descripcion, unidad, costo_referencia, moneda, proveedor_id, activo) VALUES
  (1, 'PARTES', 'P-ALPHA-001', 'Tornillo M8 con precio', 'pza', 12.5000, 'MXN', 1, 1),
  (2, 'PARTES', 'P-ALPHA-002', 'Tuerca M8 con precio', 'pza', 3.2500, 'MXN', 1, 1),
  (3, 'PARTES', 'P-ALPHA-000', 'Arandela sin precio', 'pza', NULL, 'MXN', 1, 1),
  (4, 'PARTES', 'P-BETA-001', 'Filtro proveedor Beta', 'pza', 50.0000, 'MXN', 2, 1),
  (5, 'SERVICIOS', 'S-ALPHA-001', 'Reparacion generica', 'servicio', 0, 'MXN', 1, 1);

INSERT INTO unidades_medida (codigo, nombre, activo) VALUES
  ('pza', 'Pieza', 1),
  ('servicio', 'Servicio', 1),
  ('EA', 'Each', 1);

INSERT INTO consecutivos_control (anio, tipo, ultimo_numero) VALUES
  (YEAR(CURDATE()), 'PARTES', 0),
  (YEAR(CURDATE()), 'SERVICIOS', 0),
  (YEAR(CURDATE()), 'FLETES', 0);
