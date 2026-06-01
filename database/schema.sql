-- ============================================================
-- Sistema de Órdenes de Compra - Esquema de Base de Datos
-- ============================================================
-- Este archivo contiene la estructura completa de la base de datos.
-- Úsalo para crear la base de datos desde cero en cualquier ambiente.
--
-- Instrucciones de uso:
--   1. mysql -u root -p < database/schema.sql
--   2. Ejecuta el seed del administrador:
--      node backend/scripts/seed-admin.js
--
-- NOTA: Este archivo solo contiene la ESTRUCTURA (sin datos).
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- ------------------------------------------------------------
-- Base de datos
-- ------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `ordenes_compra`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `ordenes_compra`;

-- ============================================================
-- TABLA: usuarios
-- ============================================================
DROP TABLE IF EXISTS `usuarios`;

CREATE TABLE `usuarios` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rol` enum('solicitante','contabilidad','admin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'solicitante',
  `email_verificado` tinyint(1) NOT NULL DEFAULT '0',
  `token_verificacion` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token_expiracion` datetime DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_email` (`email`),
  KEY `idx_token_verificacion` (`token_verificacion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: proveedores
-- ============================================================
DROP TABLE IF EXISTS `proveedores`;

CREATE TABLE `proveedores` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefono` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rfc` varchar(13) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `direccion` text COLLATE utf8mb4_unicode_ci,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_proveedores_rfc` (`rfc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: requerimientos
-- ============================================================
DROP TABLE IF EXISTS `requerimientos`;

CREATE TABLE `requerimientos` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `consecutivo` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Folio único generado por contabilidad',
  `solicitante_id` int unsigned NOT NULL,
  `titulo_solicitud` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `area` enum('ADMINISTRACION','PRODUCCION') COLLATE utf8mb4_unicode_ci NOT NULL,
  `departamento` enum('ALMACEN','RH','IT','VENTAS','MTTO') COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo` enum('PARTES','SERVICIOS','FLETES') COLLATE utf8mb4_unicode_ci NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `requiere_cotizacion` tinyint(1) NOT NULL DEFAULT '0',
  `estado` enum('borrador','en_revision','incompleto','aprobado','rechazado','cerrado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'borrador',
  `notas_rechazo` text COLLATE utf8mb4_unicode_ci COMMENT 'Motivo cuando estado = incompleto o rechazado',
  `datatextnow_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Número de PO / Order code en DataTextNow (ej. 0310005905). Se toma de los reportes Excel de DataTextNow (columna Number / Order code). Usado para cruzar información con las exportaciones externas.',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_requerimientos_consecutivo` (`consecutivo`),
  KEY `idx_req_estado` (`estado`),
  KEY `idx_req_solicitante` (`solicitante_id`),
  CONSTRAINT `fk_req_solicitante` FOREIGN KEY (`solicitante_id`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: historial_estados
-- ============================================================
DROP TABLE IF EXISTS `historial_estados`;

CREATE TABLE `historial_estados` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `entidad_tipo` enum('requerimiento','orden_compra','recepcion','cotizacion') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entidad_id` int unsigned NOT NULL,
  `estado_anterior` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado_nuevo` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cambiado_por` int unsigned NOT NULL,
  `notas` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_historial_entidad` (`entidad_tipo`,`entidad_id`),
  KEY `fk_hist_usuario` (`cambiado_por`),
  CONSTRAINT `fk_hist_usuario` FOREIGN KEY (`cambiado_por`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: cotizaciones
-- ============================================================
DROP TABLE IF EXISTS `cotizaciones`;

CREATE TABLE `cotizaciones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `requerimiento_id` int unsigned NOT NULL,
  `tipo` enum('PRODUCTOS','SERVICIOS','FLETES') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PRODUCTOS',
  `proveedor_id` int unsigned NOT NULL,
  `monto_total` decimal(14,2) NOT NULL DEFAULT '0.00',
  `monto_subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
  `iva` decimal(14,2) NOT NULL DEFAULT '0.00',
  `moneda` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MXN',
  `archivo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Ruta o URL del PDF de la cotización',
  `seleccionada` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = cotización firmada y autorizada',
  `fecha_seleccion` datetime DEFAULT NULL,
  `estado` enum('enviada','recibida','en_revision','seleccionada','rechazada','cancelada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'enviada',
  `fecha_envio` date DEFAULT NULL COMMENT 'Fecha en que se solicitó al proveedor',
  `fecha_recepcion` date DEFAULT NULL COMMENT 'Fecha en que se recibió la cotización',
  `notas` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `monto_total_calculado` decimal(14,2) GENERATED ALWAYS AS ((`monto_subtotal` + `iva`)) STORED,
  PRIMARY KEY (`id`),
  KEY `fk_cot_proveedor` (`proveedor_id`),
  KEY `idx_cot_seleccionada` (`requerimiento_id`,`seleccionada`),
  CONSTRAINT `fk_cot_proveedor` FOREIGN KEY (`proveedor_id`) REFERENCES `proveedores` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_cot_requerimiento` FOREIGN KEY (`requerimiento_id`) REFERENCES `requerimientos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: cotizacion_items
-- ============================================================
DROP TABLE IF EXISTS `cotizacion_items`;

CREATE TABLE `cotizacion_items` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `cotizacion_id` int unsigned NOT NULL,
  `descripcion` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `cantidad` decimal(12,4) NOT NULL DEFAULT '1.0000',
  `unidad` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'pieza, kg, hora, servicio, lote, etc.',
  `precio_unitario` decimal(14,4) NOT NULL,
  `subtotal` decimal(14,2) GENERATED ALWAYS AS ((`cantidad` * `precio_unitario`)) STORED,
  `notas_item` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_cot_item` (`cotizacion_id`),
  CONSTRAINT `fk_cot_item_cotizacion` FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizaciones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: ordenes_compra
-- ============================================================
DROP TABLE IF EXISTS `ordenes_compra`;

CREATE TABLE `ordenes_compra` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `numero_oc` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Número de OC visible para el usuario',
  `requerimiento_id` int unsigned NOT NULL,
  `cotizacion_id` int unsigned DEFAULT NULL COMMENT 'Cotización seleccionada (NULL si no requirió cotizar)',
  `autorizado_por` int unsigned NOT NULL COMMENT 'Usuario (contabilidad o admin) que registró la autorización de la OC',
  `estado` enum('generada','distribuida','en_proceso','recibida','cerrada','cancelada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'generada',
  `datatextnow_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Número de PO / Order code en DataTextNow (ej. 0310005905). Se toma de los reportes Excel de DataTextNow (columna Number / Order code). Usado para cruzar información con las exportaciones externas.',
  `fecha_autorizacion` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_oc_numero` (`numero_oc`),
  KEY `fk_oc_requerimiento` (`requerimiento_id`),
  KEY `fk_oc_cotizacion` (`cotizacion_id`),
  KEY `fk_oc_autorizado` (`autorizado_por`),
  KEY `idx_oc_estado` (`estado`),
  CONSTRAINT `fk_oc_autorizado` FOREIGN KEY (`autorizado_por`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_oc_cotizacion` FOREIGN KEY (`cotizacion_id`) REFERENCES `cotizaciones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_oc_requerimiento` FOREIGN KEY (`requerimiento_id`) REFERENCES `requerimientos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLA: recepciones
-- ============================================================
DROP TABLE IF EXISTS `recepciones`;

CREATE TABLE `recepciones` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `orden_compra_id` int unsigned NOT NULL,
  `recibido_por` int unsigned NOT NULL COMMENT 'Usuario de contabilidad que registra',
  `estado` enum('recibido_parcial','recibido_completo','entregado_solicitante') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'recibido_completo',
  `notas` text COLLATE utf8mb4_unicode_ci,
  `datatextnow_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Número de transacción de stock / ID de recepción en DataTextNow (del reporte Stock Transactions). Se usa para cruzar las recepciones reales reportadas externamente.',
  `fecha_recepcion` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_entrega` datetime DEFAULT NULL COMMENT 'Cuando se entregó al solicitante',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_rec_orden_compra` (`orden_compra_id`),
  KEY `fk_rec_usuario` (`recibido_por`),
  CONSTRAINT `fk_rec_orden_compra` FOREIGN KEY (`orden_compra_id`) REFERENCES `ordenes_compra` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_rec_usuario` FOREIGN KEY (`recibido_por`) REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Restaurar configuración
-- ============================================================
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Fin del esquema
-- ============================================================
-- Dump limpio generado para control de versiones.
-- Fecha de generación: 2026-05-30
-- ============================================================