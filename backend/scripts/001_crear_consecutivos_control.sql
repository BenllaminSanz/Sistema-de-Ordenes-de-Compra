-- Tabla de control de consecutivos por año + tipo.
-- Reemplaza el cálculo por MAX() sobre requerimientos.consecutivo.
-- El lock de fila (SELECT ... FOR UPDATE, ver obtenerSiguienteConsecutivo en
-- backend/src/utils/consecutivos.js) usa PRIMARY KEY (anio, tipo) para serializar
-- la generación de folios y evitar duplicados ante creaciones concurrentes.

CREATE TABLE IF NOT EXISTS consecutivos_control (
  anio          INT NOT NULL,
  tipo          ENUM('PARTES','SERVICIOS','FLETES') NOT NULL,
  ultimo_numero INT NOT NULL DEFAULT 0,
  PRIMARY KEY (anio, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
