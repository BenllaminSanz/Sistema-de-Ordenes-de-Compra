-- Copia (CC) en correos de solicitud de cotización a proveedores
ALTER TABLE configuracion_smtp
  ADD COLUMN cc_cotizaciones VARCHAR(255) NULL DEFAULT NULL
  COMMENT 'Correo en copia (CC) al enviar solicitudes de cotización';