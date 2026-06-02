-- ============================================================
-- seed-test-requerimientos.sql
-- Script SQL para insertar SOLICITUDES DE REQUERIMIENTOS de prueba
-- Útil para testing rápido del flujo de Requerimientos + Ítems de Catálogo
-- (especialmente después de arreglar la edición de items en borrador/incompleto)
--
-- PREREQUISITOS:
--   1. Haber ejecutado: mysql -u root -p < database/schema.sql
--   2. Haber ejecutado: node backend/scripts/seed-admin.js   (al menos el admin)
--   3. (Muy recomendado) Haber ejecutado: node backend/scripts/seed-demo-data.js
--      → Esto te da los usuarios "reales" de demo (juan.perez@empresa.com etc con password Demo2025!)
--      y un catálogo más rico. Este script detecta y reutiliza esos usuarios automáticamente.
--
-- USO (ejemplo):
--   mysql -u root -p ordenes_compra < database/seed-test-requerimientos.sql
--
-- O abre el archivo en MySQL Workbench / DBeaver / HeidiSQL y ejecútalo.
--
-- Lo que crea:
--   - 3 usuarios solicitantes de respaldo (si no existen los demo)
--   - 8 ítems de catálogo de prueba (códigos TEST-*) para asociar fácilmente
--   - ~18+ requerimientos variados:
--     * Muchos SOLO con ítems del catálogo (borrador, incompleto, en_revision, aprobado, etc.)
--     * Varios SOLO con ítems libres (puros, sin catálogo) en borrador (para probar el nuevo modal/selección de libres),
--       incompleto, en_revision
--   - NO se mezclan items de catálogo + libres en un mismo req (regla de negocio)
--   - Historial de estados básico para cada uno
--
-- Después de correr esto puedes:
--   - Loguearte como admin@empresa.com / Admin1234!   o   juan.perez@empresa.com / Demo2025!
--   - Ir a la sección Requerimientos
--   - Probar el flujo de catálogo (buscar y agregar ítems existentes) en los reqs correspondientes
--   - Probar el selector "Los ítems que necesito no se encuentran en el catálogo" al final del form
--     (debe ocultar la sección de catálogo y abrir el modal de ítems libres)
--   - Editar borradores con catálogo (agregar/quitar/cambiar cantidades)
--   - Editar borradores con libres (agregar/quitar descripciones libres)
--   - Ver que no permite mezclar los dos tipos
--   - Probar flujos de revisión, aprobación, etc.
-- ============================================================

START TRANSACTION;

-- ============================================================
-- 1. USUARIOS SOLICITANTES DE PRUEBA (si no existen)
--    (usa un hash bcrypt dummy - estos usuarios son principalmente para datos)
--    Password de prueba para estos: Prueba123!
-- ============================================================
INSERT INTO usuarios (nombre, email, password_hash, rol, email_verificado, activo)
VALUES 
  ('Carlos Solis (Pruebas)',     'carlos.solis@pruebas.local',    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G', 'solicitante', 1, 1),
  ('María López (Pruebas)',      'maria.lopez@pruebas.local',     '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G', 'solicitante', 1, 1),
  ('Javier Ruiz (Pruebas)',      'javier.ruiz@pruebas.local',     '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G', 'solicitante', 1, 1)
ON DUPLICATE KEY UPDATE 
  nombre = VALUES(nombre),
  activo = 1;

-- Obtener IDs de los solicitantes de prueba
SET @sol1 = (SELECT id FROM usuarios WHERE email = 'carlos.solis@pruebas.local' LIMIT 1);
SET @sol2 = (SELECT id FROM usuarios WHERE email = 'maria.lopez@pruebas.local'  LIMIT 1);
SET @sol3 = (SELECT id FROM usuarios WHERE email = 'javier.ruiz@pruebas.local'  LIMIT 1);

-- También intentamos obtener IDs de los usuarios del seed-demo (si existen)
SET @demo_sol1 = (SELECT id FROM usuarios WHERE email = 'juan.perez@empresa.com' LIMIT 1);
SET @demo_sol2 = (SELECT id FROM usuarios WHERE email = 'laura.martinez@empresa.com' LIMIT 1);

-- Usar demo si existen, si no los de pruebas
SET @solicitante1 = IFNULL(@demo_sol1, @sol1);
SET @solicitante2 = IFNULL(@demo_sol2, @sol2);
SET @solicitante3 = @sol3;

-- Buscar un usuario que pueda aprobar (contabilidad o admin) para el historial
SET @aprobador = (SELECT id FROM usuarios WHERE rol IN ('contabilidad', 'admin') ORDER BY rol='contabilidad' DESC, id LIMIT 1);
SET @aprobador = IFNULL(@aprobador, 2); -- fallback

-- ============================================================
-- 2. CATÁLOGO DE PRUEBA (ítems para asociar a requerimientos)
--    Usamos códigos únicos TEST-* para no chocar con datos reales/demo
-- ============================================================
INSERT INTO catalogo (tipo, codigo, descripcion, costo_referencia, activo, created_at)
VALUES 
  ('PARTES',    'TEST-P-RODA-6205',   'Rodamiento SKF 6205-2RS - Caja de rodamientos Drawframe',  185.00, 1, NOW()),
  ('PARTES',    'TEST-P-BOMBA-15H',   'Bomba hidráulica 15HP para sistema de lubricación',       2450.00, 1, NOW()),
  ('PARTES',    'TEST-P-SENS-PT100',  'Sensor temperatura PT100 con cable 2m',                    320.50, 1, NOW()),
  ('PARTES',    'TEST-P-KIT-SELLOS',  'Kit completo de sellos y empaques para Drawframe',         475.00, 1, NOW()),
  ('SERVICIOS', 'TEST-S-CALIB-001',   'Calibración y alineación de purgadores LOEPFE',           1850.00, 1, NOW()),
  ('SERVICIOS', 'TEST-S-MANT-LONA',   'Mantenimiento preventivo de lonas divisorias OE/RS',      6800.00, 1, NOW()),
  ('SERVICIOS', 'TEST-S-COMP-AIRE',   'Reparación de compresor de aire industrial 50HP',         4200.00, 1, NOW()),
  ('FLETES',    'TEST-F-LOCAL-01',    'Flete local intra-planta y a almacén externo',             1250.00, 1, NOW())
ON DUPLICATE KEY UPDATE 
  descripcion = VALUES(descripcion),
  costo_referencia = VALUES(costo_referencia);

-- Obtener IDs de los ítems de catálogo recién creados / existentes
SET @cat1 = (SELECT id FROM catalogo WHERE codigo = 'TEST-P-RODA-6205' LIMIT 1);
SET @cat2 = (SELECT id FROM catalogo WHERE codigo = 'TEST-P-BOMBA-15H' LIMIT 1);
SET @cat3 = (SELECT id FROM catalogo WHERE codigo = 'TEST-P-SENS-PT100' LIMIT 1);
SET @cat4 = (SELECT id FROM catalogo WHERE codigo = 'TEST-P-KIT-SELLOS' LIMIT 1);
SET @cat5 = (SELECT id FROM catalogo WHERE codigo = 'TEST-S-CALIB-001' LIMIT 1);
SET @cat6 = (SELECT id FROM catalogo WHERE codigo = 'TEST-S-MANT-LONA' LIMIT 1);
SET @cat7 = (SELECT id FROM catalogo WHERE codigo = 'TEST-S-COMP-AIRE' LIMIT 1);
SET @cat8 = (SELECT id FROM catalogo WHERE codigo = 'TEST-F-LOCAL-01'  LIMIT 1);

-- ============================================================
-- 3. REQUERIMIENTOS DE PRUEBA (los importantes para testing)
-- ============================================================

-- 1. BORRADOR con ítems (el caso principal para probar la edición de items que acabamos de estabilizar)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026P-010', @solicitante1, 'Repuestos urgentes para Drawframe 3', 'PRODUCCION', 'MTTO', 'PARTES', 
   'Se necesitan rodamientos y bomba de repuesto para mantenimiento correctivo programado esta semana.', 
   0, 'borrador', DATE_SUB(NOW(), INTERVAL 3 DAY), NOW());

SET @req_borrador_items = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_borrador_items, @cat1, 4, NOW()),
  (@req_borrador_items, @cat2, 1, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
VALUES ('requerimiento', @req_borrador_items, NULL, 'borrador', @solicitante1, 'Requerimiento creado como borrador con ítems del catálogo', DATE_SUB(NOW(), INTERVAL 3 DAY));

-- 2. BORRADOR sin ítems (para probar agregar items desde cero en la UI)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026S-011', @solicitante2, 'Servicio de calibración de purgadores LOEPFE línea B', 'PRODUCCION', 'MTTO', 'SERVICIOS', 
   'Calibración completa de los 8 purgadores de la línea B. Es urgente porque está afectando la calidad del hilo.', 
   1, 'borrador', DATE_SUB(NOW(), INTERVAL 1 DAY), NOW());

SET @req_borrador_sin_items = LAST_INSERT_ID();

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
VALUES ('requerimiento', @req_borrador_sin_items, NULL, 'borrador', @solicitante2, 'Requerimiento creado como borrador (sin ítems aún)', DATE_SUB(NOW(), INTERVAL 1 DAY));

-- 3. INCOMPLETO con ítems (perfecto para probar el flujo de "corregir" + agregar/quitar items)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, notas_rechazo, created_at, updated_at)
VALUES 
  ('REQ-2026P-012', @solicitante1, 'Kit de sellos y sensores para mantenimiento preventivo', 'PRODUCCION', 'MTTO', 'PARTES', 
   'Material para el programa de mantenimiento preventivo mensual de las máquinas de hilatura.', 
   0, 'incompleto', 'Falta especificar la cantidad exacta de sensores PT100 y confirmar si se necesitan 2 o 3 kits de sellos.', DATE_SUB(NOW(), INTERVAL 5 DAY), NOW());

SET @req_incompleto = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_incompleto, @cat4, 2, NOW()),
  (@req_incompleto, @cat3, 3, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at) VALUES
  ('requerimiento', @req_incompleto, NULL, 'borrador', @solicitante1, 'Requerimiento creado como borrador', DATE_SUB(NOW(), INTERVAL 5 DAY)),
  ('requerimiento', @req_incompleto, 'borrador', 'en_revision', @solicitante1, 'Enviado a revisión por el solicitante', DATE_SUB(NOW(), INTERVAL 4 DAY)),
  ('requerimiento', @req_incompleto, 'en_revision', 'incompleto', @aprobador, 'Falta especificar la cantidad exacta de sensores PT100 y confirmar si se necesitan 2 o 3 kits de sellos.', DATE_SUB(NOW(), INTERVAL 3 DAY));

-- 4. INCOMPLETO sin muchos detalles (otro caso de corrección)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, notas_rechazo, created_at, updated_at)
VALUES 
  ('REQ-2026S-013', @solicitante3, 'Mantenimiento de lonas divisorias - medidas incompletas', 'PRODUCCION', 'MTTO', 'SERVICIOS', 
   'Revisión y reparación de lonas en las áreas de OE y RS.', 
   1, 'incompleto', 'Por favor indicar la cantidad aproximada de metros lineales y si se requiere material adicional.', DATE_SUB(NOW(), INTERVAL 2 DAY), NOW());

SET @req_incompleto2 = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_incompleto2, @cat6, 1, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at) VALUES
  ('requerimiento', @req_incompleto2, NULL, 'borrador', @solicitante3, 'Requerimiento creado como borrador', DATE_SUB(NOW(), INTERVAL 2 DAY)),
  ('requerimiento', @req_incompleto2, 'borrador', 'en_revision', @solicitante3, 'Enviado a revisión', DATE_SUB(NOW(), INTERVAL 2 DAY)),
  ('requerimiento', @req_incompleto2, 'en_revision', 'incompleto', @aprobador, 'Por favor indicar la cantidad aproximada de metros lineales y si se requiere material adicional.', DATE_SUB(NOW(), INTERVAL 1 DAY));

-- 5. BORRADOR FLETES (con item)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026F-014', @solicitante2, 'Flete de material de regreso de proveedor Yazbek', 'ADMINISTRACION', 'ALMACEN', 'FLETES', 
   'Flete de retorno de material plástico y componentes desde el proveedor.', 
   0, 'borrador', DATE_SUB(NOW(), INTERVAL 4 HOUR), NOW());

SET @req_flete = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_flete, @cat8, 1, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
VALUES ('requerimiento', @req_flete, NULL, 'borrador', @solicitante2, 'Requerimiento de flete creado', DATE_SUB(NOW(), INTERVAL 4 HOUR));

-- 6. EN REVISIÓN (con items)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026P-015', @solicitante1, 'Sensor de temperatura y kit de sellos adicionales', 'PRODUCCION', 'MTTO', 'PARTES', 
   'Material crítico para el paro programado del fin de semana.', 
   0, 'en_revision', DATE_SUB(NOW(), INTERVAL 6 DAY), NOW());

SET @req_revision = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_revision, @cat3, 6, NOW()),
  (@req_revision, @cat4, 1, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at) VALUES
  ('requerimiento', @req_revision, NULL, 'borrador', @solicitante1, 'Creado', DATE_SUB(NOW(), INTERVAL 6 DAY)),
  ('requerimiento', @req_revision, 'borrador', 'en_revision', @solicitante1, 'Enviado a revisión para aprobación', DATE_SUB(NOW(), INTERVAL 5 DAY));

-- 7. APROBADO (sin cotización requerida)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, datatextnow_id, created_at, updated_at)
VALUES 
  ('REQ-2026P-016', @solicitante3, 'Rodamientos de repuesto estándar', 'PRODUCCION', 'MTTO', 'PARTES', 
   'Stock de seguridad de rodamientos 6205 para almacén de mantenimiento.', 
   0, 'aprobado', '0310006123', DATE_SUB(NOW(), INTERVAL 12 DAY), NOW());

SET @req_aprobado = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_aprobado, @cat1, 10, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at) VALUES
  ('requerimiento', @req_aprobado, NULL, 'borrador', @solicitante3, 'Creado', DATE_SUB(NOW(), INTERVAL 12 DAY)),
  ('requerimiento', @req_aprobado, 'borrador', 'en_revision', @solicitante3, 'Enviado', DATE_SUB(NOW(), INTERVAL 11 DAY)),
  ('requerimiento', @req_aprobado, 'en_revision', 'aprobado', @aprobador, 'Aprobado para compra directa (no requiere cotización)', DATE_SUB(NOW(), INTERVAL 10 DAY));

-- 8. APROBADO que requiere cotización (debería tener cotización seleccionada en un flujo completo)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026S-017', @solicitante2, 'Reparación de compresor de aire principal', 'PRODUCCION', 'MTTO', 'SERVICIOS', 
   'El compresor principal de la planta está fallando. Requiere diagnóstico y reparación.', 
   1, 'aprobado', DATE_SUB(NOW(), INTERVAL 15 DAY), NOW());

SET @req_aprobado_cot = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_aprobado_cot, @cat7, 1, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at) VALUES
  ('requerimiento', @req_aprobado_cot, NULL, 'borrador', @solicitante2, 'Creado', DATE_SUB(NOW(), INTERVAL 15 DAY)),
  ('requerimiento', @req_aprobado_cot, 'borrador', 'en_revision', @solicitante2, 'Enviado a revisión', DATE_SUB(NOW(), INTERVAL 14 DAY)),
  ('requerimiento', @req_aprobado_cot, 'en_revision', 'aprobado', @aprobador, 'Aprobado. Se requiere cotización del proveedor autorizado.', DATE_SUB(NOW(), INTERVAL 13 DAY));

-- 9. RECHAZADO
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, notas_rechazo, created_at, updated_at)
VALUES 
  ('REQ-2026P-018', @solicitante1, 'Compra de bomba hidráulica de repuesto (alta capacidad)', 'PRODUCCION', 'MTTO', 'PARTES', 
   'Bomba de repuesto para la línea principal.', 
   1, 'rechazado', 'Presupuesto rechazado. Se priorizará reparación del equipo existente en lugar de compra nueva este trimestre.', DATE_SUB(NOW(), INTERVAL 20 DAY), NOW());

SET @req_rechazado = LAST_INSERT_ID();

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at) VALUES
  ('requerimiento', @req_rechazado, NULL, 'borrador', @solicitante1, 'Creado', DATE_SUB(NOW(), INTERVAL 20 DAY)),
  ('requerimiento', @req_rechazado, 'borrador', 'en_revision', @solicitante1, 'Enviado', DATE_SUB(NOW(), INTERVAL 19 DAY)),
  ('requerimiento', @req_rechazado, 'en_revision', 'rechazado', @aprobador, 'Presupuesto rechazado. Se priorizará reparación del equipo existente en lugar de compra nueva este trimestre.', DATE_SUB(NOW(), INTERVAL 18 DAY));

-- 10. CERRADO (ya procesado)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, datatextnow_id, created_at, updated_at)
VALUES 
  ('REQ-2026S-019', @solicitante3, 'Calibración de equipo de medición', 'PRODUCCION', 'MTTO', 'SERVICIOS', 
   'Calibración anual obligatoria de los equipos de control de calidad.', 
   0, 'cerrado', '0310005988', DATE_SUB(NOW(), INTERVAL 45 DAY), NOW());

SET @req_cerrado = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_cerrado, @cat5, 1, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at) VALUES
  ('requerimiento', @req_cerrado, NULL, 'borrador', @solicitante3, 'Creado', DATE_SUB(NOW(), INTERVAL 45 DAY)),
  ('requerimiento', @req_cerrado, 'borrador', 'en_revision', @solicitante3, 'Enviado', DATE_SUB(NOW(), INTERVAL 44 DAY)),
  ('requerimiento', @req_cerrado, 'en_revision', 'aprobado', @aprobador, 'Aprobado para ejecución', DATE_SUB(NOW(), INTERVAL 43 DAY)),
  ('requerimiento', @req_cerrado, 'aprobado', 'cerrado', @aprobador, 'Servicio completado y documentado.', DATE_SUB(NOW(), INTERVAL 30 DAY));

-- ============================================================
-- EJEMPLOS DE ÍTEMS LIBRES (texto libre - no existían en catálogo)
-- Demuestra el flujo híbrido Opción B
-- ============================================================

-- NOTA: Ya NO se permite mezclar catálogo + libres en un mismo req.
-- Este ejemplo de libre se mueve a un req separado más abajo (ver REQ-2026S-020).

-- Un requerimiento que es 100% libre (ejemplo típico cuando surge algo nuevo)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026S-020', @solicitante1, 'Reparación urgente de sistema de vacío no estandarizado', 'PRODUCCION', 'MTTO', 'SERVICIOS', 
   'Falla imprevista en sistema de vacío de la línea C. No hay ítem en catálogo aún.', 
   1, 'borrador', DATE_SUB(NOW(), INTERVAL 2 HOUR), NOW());

SET @req_libre_puro = LAST_INSERT_ID();

INSERT INTO requerimiento_items_libres (requerimiento_id, descripcion, cantidad, unidad, created_at) VALUES
  (@req_libre_puro, 'Reparación completa de bomba de vacío de anillo líquido (modelo no registrado)', 1, 'servicio', NOW()),
  (@req_libre_puro, 'Suministro e instalación de sello mecánico especial para vacío', 2, 'unidad', NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
VALUES ('requerimiento', @req_libre_puro, NULL, 'borrador', @solicitante1, 'Requerimiento creado con ítems libres (no en catálogo)', DATE_SUB(NOW(), INTERVAL 2 HOUR));

-- ============================================================
-- MÁS REQUERIMIENTOS DE PRUEBA - SOLO CATÁLOGO (no mezclar con libres)
-- ============================================================

-- 11. BORRADOR con varios items del catálogo (PARTES, buen para probar multi-select y edición en UI)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026P-021', @solicitante2, 'Repuestos para mantenimiento de Drawframes - lote mensual', 'PRODUCCION', 'MTTO', 'PARTES', 
   'Kit de repuestos estándar para mantenimiento preventivo de 3 Drawframes.', 
   0, 'borrador', DATE_SUB(NOW(), INTERVAL 1 DAY), NOW());

SET @req_cat_multi = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_cat_multi, @cat1, 6, NOW()),
  (@req_cat_multi, @cat3, 4, NOW()),
  (@req_cat_multi, @cat4, 2, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
VALUES ('requerimiento', @req_cat_multi, NULL, 'borrador', @solicitante2, 'Requerimiento borrador con múltiples ítems de catálogo', DATE_SUB(NOW(), INTERVAL 1 DAY));

-- 12. BORRADOR con item de catálogo (SERVICIOS, requiere cotizacion)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026S-022', @solicitante1, 'Mantenimiento correctivo de compresor principal', 'PRODUCCION', 'MTTO', 'SERVICIOS', 
   'Compresor de aire de la línea principal necesita servicio urgente.', 
   1, 'borrador', DATE_SUB(NOW(), INTERVAL 6 HOUR), NOW());

SET @req_cat_cot = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_cat_cot, @cat7, 1, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
VALUES ('requerimiento', @req_cat_cot, NULL, 'borrador', @solicitante1, 'Borrador con ítem de catálogo que requiere cotización', DATE_SUB(NOW(), INTERVAL 6 HOUR));

-- 13. EN REVISIÓN con item catálogo (FLETES)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026F-023', @solicitante3, 'Flete de componentes importados desde Laredo', 'ADMINISTRACION', 'ALMACEN', 'FLETES', 
   'Envío de refacciones críticas desde proveedor en Texas.', 
   0, 'en_revision', DATE_SUB(NOW(), INTERVAL 2 DAY), NOW());

SET @req_cat_flete = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_cat_flete, @cat8, 1, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at) VALUES
  ('requerimiento', @req_cat_flete, NULL, 'borrador', @solicitante3, 'Creado', DATE_SUB(NOW(), INTERVAL 2 DAY)),
  ('requerimiento', @req_cat_flete, 'borrador', 'en_revision', @solicitante3, 'Enviado a revisión', DATE_SUB(NOW(), INTERVAL 1 DAY));

-- 14. INCOMPLETO con item catálogo (para probar corrección)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, notas_rechazo, created_at, updated_at)
VALUES 
  ('REQ-2026P-024', @solicitante2, 'Sensores de temperatura adicionales', 'PRODUCCION', 'MTTO', 'PARTES', 
   'Repuestos para sensores de la línea de producción.', 
   0, 'incompleto', 'Indicar proveedor preferido y cantidades exactas por máquina.', DATE_SUB(NOW(), INTERVAL 4 DAY), NOW());

SET @req_inc_cat = LAST_INSERT_ID();

INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad, created_at) VALUES
  (@req_inc_cat, @cat3, 8, NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at) VALUES
  ('requerimiento', @req_inc_cat, NULL, 'borrador', @solicitante2, 'Creado', DATE_SUB(NOW(), INTERVAL 4 DAY)),
  ('requerimiento', @req_inc_cat, 'borrador', 'en_revision', @solicitante2, 'Enviado', DATE_SUB(NOW(), INTERVAL 3 DAY)),
  ('requerimiento', @req_inc_cat, 'en_revision', 'incompleto', @aprobador, 'Indicar proveedor preferido y cantidades exactas por máquina.', DATE_SUB(NOW(), INTERVAL 2 DAY));

-- ============================================================
-- MÁS REQUERIMIENTOS DE PRUEBA - SOLO LIBRES (puros, para probar el flujo de nuevos ítems + modal de libres)
-- ============================================================

-- 15. BORRADOR puro libre (SERVICIOS, ideal para probar el modal de ítems libres y edición)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026S-025', @solicitante2, 'Servicio de alineación láser de ejes no estandarizado', 'PRODUCCION', 'MTTO', 'SERVICIOS', 
   'Alineación de ejes en la nueva máquina de hilatura que no tiene ítem en catálogo.', 
   1, 'borrador', DATE_SUB(NOW(), INTERVAL 3 HOUR), NOW());

SET @req_libre_borr = LAST_INSERT_ID();

INSERT INTO requerimiento_items_libres (requerimiento_id, descripcion, cantidad, unidad, notas, created_at) VALUES
  (@req_libre_borr, 'Servicio completo de alineación láser de ejes de precisión (modelo especial)', 1, 'servicio', 'Requiere técnico certificado del fabricante', NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
VALUES ('requerimiento', @req_libre_borr, NULL, 'borrador', @solicitante2, 'Borrador solo con ítems libres - para probar UI de nuevos ítems', DATE_SUB(NOW(), INTERVAL 3 HOUR));

-- 16. BORRADOR puro libre (PARTES, para probar agregar varios libres)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026P-026', @solicitante3, 'Componentes hidráulicos especiales sin código en catálogo', 'PRODUCCION', 'MTTO', 'PARTES', 
   'Piezas para reparación de sistema hidráulico de prensa antigua.', 
   0, 'borrador', DATE_SUB(NOW(), INTERVAL 5 HOUR), NOW());

SET @req_libre_part = LAST_INSERT_ID();

INSERT INTO requerimiento_items_libres (requerimiento_id, descripcion, cantidad, unidad, created_at) VALUES
  (@req_libre_part, 'Cilindro hidráulico especial 80mm x 300mm sin stock', 2, 'unidad', NOW()),
  (@req_libre_part, 'Juego de sellos de poliuretano para cilindro especial', 1, 'kit', NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
VALUES ('requerimiento', @req_libre_part, NULL, 'borrador', @solicitante3, 'Borrador con múltiples ítems libres', DATE_SUB(NOW(), INTERVAL 5 HOUR));

-- 17. INCOMPLETO puro libre (SERVICIOS, buen para probar corrección de libres)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, notas_rechazo, created_at, updated_at)
VALUES 
  ('REQ-2026S-027', @solicitante1, 'Mantenimiento de sistema de vacío custom', 'PRODUCCION', 'MTTO', 'SERVICIOS', 
   'Servicio de diagnóstico y reparación de vacío en línea experimental.', 
   1, 'incompleto', 'Falta especificar alcance exacto del diagnóstico y si incluye repuestos.', DATE_SUB(NOW(), INTERVAL 1 DAY), NOW());

SET @req_libre_inc = LAST_INSERT_ID();

INSERT INTO requerimiento_items_libres (requerimiento_id, descripcion, cantidad, unidad, created_at) VALUES
  (@req_libre_inc, 'Diagnóstico completo + reparación de sistema de vacío industrial (no estándar)', 1, 'servicio', NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at) VALUES
  ('requerimiento', @req_libre_inc, NULL, 'borrador', @solicitante1, 'Creado', DATE_SUB(NOW(), INTERVAL 1 DAY)),
  ('requerimiento', @req_libre_inc, 'borrador', 'en_revision', @solicitante1, 'Enviado', DATE_SUB(NOW(), INTERVAL 1 DAY)),
  ('requerimiento', @req_libre_inc, 'en_revision', 'incompleto', @aprobador, 'Falta especificar alcance exacto del diagnóstico y si incluye repuestos.', DATE_SUB(NOW(), INTERVAL 12 HOUR));

-- 18. EN REVISIÓN puro libre (PARTES, con cotizacion requerida)
INSERT INTO requerimientos 
  (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, created_at, updated_at)
VALUES 
  ('REQ-2026P-028', @solicitante2, 'Kit de rodamientos especiales importados', 'PRODUCCION', 'MTTO', 'PARTES', 
   'Rodamientos de alta precisión para máquina prototipo (no en catálogo local).', 
   1, 'en_revision', DATE_SUB(NOW(), INTERVAL 1 DAY), NOW());

SET @req_libre_rev = LAST_INSERT_ID();

INSERT INTO requerimiento_items_libres (requerimiento_id, descripcion, cantidad, unidad, created_at) VALUES
  (@req_libre_rev, 'Rodamiento de bolas de precisión 6205-2RS C3 especial (sin equivalente local)', 5, 'unidad', NOW());

INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at) VALUES
  ('requerimiento', @req_libre_rev, NULL, 'borrador', @solicitante2, 'Creado como borrador libre', DATE_SUB(NOW(), INTERVAL 1 DAY)),
  ('requerimiento', @req_libre_rev, 'borrador', 'en_revision', @solicitante2, 'Enviado a revisión (requiere cotización para alta)', DATE_SUB(NOW(), INTERVAL 12 HOUR));

-- ============================================================
-- RESUMEN
-- ============================================================
SELECT '=== DATOS DE PRUEBA DE REQUERIMIENTOS CREADOS ===' AS '';

SELECT 
  r.consecutivo,
  r.estado,
  r.tipo,
  r.titulo_solicitud,
  u.nombre AS solicitante,
  COUNT(DISTINCT ri.id) AS num_items_catalogo,
  COUNT(DISTINCT ril.id) AS num_items_libres
FROM requerimientos r
JOIN usuarios u ON u.id = r.solicitante_id
LEFT JOIN requerimiento_items ri ON ri.requerimiento_id = r.id
LEFT JOIN requerimiento_items_libres ril ON ril.requerimiento_id = r.id
WHERE r.consecutivo LIKE 'REQ-2026%'
GROUP BY r.id
ORDER BY r.consecutivo;

COMMIT;

-- ============================================================
-- FIN DEL SCRIPT
-- Ahora puedes ir a la aplicación y probar:
--   - Ver la lista de requerimientos (filtro por estado/tipo)
--   - Crear/editar en 'borrador':
--       * Usar la sección de catálogo (buscar + agregar ítems)
--       * Al final del form, marcar "Los ítems que necesito no se encuentran en el catálogo"
--         → debe ocultar catálogo y abrir el modal de ítems libres
--   - Probar que no se permite mezclar (al cambiar de modo pregunta y limpia el otro)
--   - Editar borradores con catálogo (agregar/quitar/cambiar cantidad)
--   - Editar borradores con libres (agregar varias descripciones, cantidades, unidades)
--   - Enviar a revisión, aprobar, rechazar, etc.
--   - Ver detalle con ambos tipos de ítems (catálogo vs libres)
-- ============================================================