-- ============================================================
-- MIGRACIÓN: Sistema de verificación de correo para registro de solicitantes
-- Ejecutar este script en tu base de datos MySQL antes de usar el nuevo registro.
-- ============================================================

-- Agregar columnas para verificación de email
ALTER TABLE usuarios 
  ADD COLUMN email_verificado   TINYINT(1) NOT NULL DEFAULT 0 AFTER rol,
  ADD COLUMN token_verificacion VARCHAR(64) NULL AFTER email_verificado,
  ADD COLUMN token_expiracion   DATETIME NULL AFTER token_verificacion;

-- Índice opcional para búsquedas rápidas por token (recomendado)
ALTER TABLE usuarios 
  ADD INDEX idx_token_verificacion (token_verificacion);

-- (Opcional) Marcar usuarios existentes como verificados
-- para que no se queden bloqueados después de la migración:
-- UPDATE usuarios SET email_verificado = 1;

SELECT 'Migración de verificación de correo completada correctamente.' AS mensaje;