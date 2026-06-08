-- ============================================================
-- Script para limpiar datos de prueba (manteniendo estructura)
-- Úsalo antes de probar el sistema nuevo (Excel import catálogo, SMTP, etc.)
--
-- Ejecutar:
--   mysql -u root -p ordenes_compra < database/clean_for_v1_testing.sql
--
-- Luego:
--   node backend/scripts/seed-admin.js
--   (Opcional) mysql -u root -p ordenes_compra < database/seed_clean_test_data.sql
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Orden inverso a dependencias (hijas primero)
TRUNCATE TABLE recepciones;

-- Historial (se usa tanto para requerimientos como para órdenes)
TRUNCATE TABLE historial_estados;

-- Órdenes
TRUNCATE TABLE ordenes_compra;

-- Cotizaciones
TRUNCATE TABLE cotizacion_items;
TRUNCATE TABLE cotizaciones;

-- Requerimientos
TRUNCATE TABLE requerimiento_items_libres;
TRUNCATE TABLE requerimiento_items;
TRUNCATE TABLE requerimientos;

-- Datos maestros del nuevo sistema
TRUNCATE TABLE catalogo;
TRUNCATE TABLE proveedores;

-- Config SMTP (descomenta si quieres empezar sin ninguna configuración de correo)
-- TRUNCATE TABLE configuracion_smtp;

SET FOREIGN_KEY_CHECKS = 1;

-- Mensaje final
SELECT '✅ Datos de prueba limpiados correctamente.' AS resultado;
SELECT 'Próximos pasos recomendados:' AS instrucciones;
SELECT '1. node backend/scripts/seed-admin.js' AS paso1;
SELECT '2. (Opcional) mysql -u root -p ordenes_compra < database/seed_clean_test_data.sql' AS paso2;
SELECT '3. Inicia el backend y prueba las nuevas funciones (carga Excel de catálogo, SMTP, etc.)' AS paso3;