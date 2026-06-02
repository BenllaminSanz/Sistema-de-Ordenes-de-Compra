-- ============================================================
-- MIGRACIÓN: add-requerimiento-items-libres.sql
-- Fecha: 2026-06
-- Descripción: Agrega soporte para ítems en texto libre (libres) en requerimientos.
--              (Para casos donde el artículo/servicio aún no existe en el catálogo)
--
-- INSTRUCCIONES:
--   1. Haz backup de tu base de datos.
--   2. Ejecuta este script contra tu base de datos existente:
--        mysql -u root -p ordenes_compra < database/migrations/add-requerimiento-items-libres.sql
--   3. Luego actualiza el código backend/frontend.
--
-- Regla actual: un requerimiento es SOLO de ítems de catálogo O SOLO de ítems libres.
-- Los ítems libres se formalizan (alta en catálogo) al seleccionar cotización o generar OC.
-- ============================================================

USE `ordenes_compra`;

SET FOREIGN_KEY_CHECKS = 0;

-- Crear la tabla si no existe
CREATE TABLE IF NOT EXISTS `requerimiento_items_libres` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `requerimiento_id` int unsigned NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Descripción del ítem/servicio cuando no está (todavía) en el catálogo',
  `cantidad` decimal(12,4) NOT NULL DEFAULT '1.0000',
  `unidad` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'pieza, kg, hora, servicio, lote, etc.',
  `notas` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_req_libre_requerimiento` (`requerimiento_id`),
  CONSTRAINT `fk_req_libre_requerimiento` FOREIGN KEY (`requerimiento_id`) REFERENCES `requerimientos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Ítems en texto libre (no catálogo) asociados a un requerimiento. Complementa a requerimiento_items.';

SET FOREIGN_KEY_CHECKS = 1;

-- Hacer opcional el costo de referencia en catálogo (observación cliente temprana)
ALTER TABLE `catalogo` 
  MODIFY `costo_referencia` decimal(14,2) DEFAULT NULL COMMENT 'Costo de referencia (opcional). Si no se conoce, dejar en blanco.';

-- Mensaje de confirmación
SELECT 'Tabla requerimiento_items_libres + costo_referencia opcional aplicados.' AS resultado;