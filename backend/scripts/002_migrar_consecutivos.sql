-- Migración histórica: renumera requerimientos.consecutivo de forma densa y
-- cronológica por (año, tipo), resincroniza ordenes_compra.numero_oc (espejo de
-- requerimientos.consecutivo) y siembra consecutivos_control con el estado final.
--
-- Requiere que 001_crear_consecutivos_control.sql ya se haya ejecutado.
-- Ejecutar dentro de una transacción. Ver backend/scripts/migrar-consecutivos.mjs
-- para la versión con dry-run/--apply que se usó realmente contra producción.
--
-- IMPORTANTE: no agregar `ALTER TABLE ... ADD PRIMARY KEY` sobre las tablas
-- temporales de abajo — se confirmó empíricamente que ALTER TABLE causa un COMMIT
-- IMPLÍCITO incluso sobre una tabla temporal, lo que rompe la atomicidad de toda
-- esta transacción (CREATE/DROP TEMPORARY TABLE sí son seguros, no la rompen).

START TRANSACTION;

-- 1. Nuevo consecutivo por fila: denso y cronológico dentro de cada (año, tipo).
--    Se usa una subconsulta correlacionada (COUNT de filas anteriores en el mismo
--    grupo) en vez de ROW_NUMBER() OVER(...) porque el servidor de producción no
--    soporta funciones de ventana (MySQL 5.7 / versión anterior a 8.0).
DROP TEMPORARY TABLE IF EXISTS tmp_nuevos_consecutivos;
CREATE TEMPORARY TABLE tmp_nuevos_consecutivos AS
SELECT
  r.id,
  CONCAT(
    YEAR(r.created_at),
    CASE r.tipo WHEN 'PARTES' THEN 'P' WHEN 'SERVICIOS' THEN 'S' WHEN 'FLETES' THEN 'F' END,
    '-',
    (
      SELECT COUNT(*) FROM requerimientos r2
      WHERE r2.tipo = r.tipo AND YEAR(r2.created_at) = YEAR(r.created_at)
        AND (r2.created_at < r.created_at OR (r2.created_at = r.created_at AND r2.id <= r.id))
    )
  ) AS nuevo_consecutivo
FROM requerimientos r;

-- 2. Neutralizar valores actuales antes de renombrar: requerimientos.consecutivo
--    tiene UNIQUE KEY, y los números nuevos pueden coincidir con valores viejos
--    que aún no se han actualizado en otras filas (colisión transitoria real).
UPDATE requerimientos SET consecutivo = CONCAT('TMP-', id);

-- 3. Aplicar consecutivos finales.
UPDATE requerimientos r
JOIN tmp_nuevos_consecutivos t ON t.id = r.id
SET r.consecutivo = t.nuevo_consecutivo;

-- 4. Resincronizar numero_oc (también UNIQUE). La mayoría de los requerimientos
--    tienen exactamente una OC (mapeo directo), pero puede haber excepciones (caso
--    real conocido: un requerimiento con 2 OC por un bug preexistente de la app que
--    no cancela la OC "extra"). La OC vinculada en requerimientos.orden_compra_id
--    (o la de menor id si no hay ninguna vinculada) recibe el consecutivo limpio;
--    cualquier OC extra del mismo requerimiento recibe sufijo de letra B, C, ...
--    (mismo patrón que ya usaba el histórico para folios ambiguos, ej. 2026S-32A/32B).
UPDATE ordenes_compra SET numero_oc = CONCAT('TMP-', id);

DROP TEMPORARY TABLE IF EXISTS tmp_numero_oc_nuevo;
CREATE TEMPORARY TABLE tmp_numero_oc_nuevo AS
SELECT
  oc.id,
  CASE
    WHEN oc.id = COALESCE(
      r.orden_compra_id,
      (SELECT MIN(oc0.id) FROM ordenes_compra oc0 WHERE oc0.requerimiento_id = oc.requerimiento_id)
    ) THEN r.consecutivo
    ELSE CONCAT(r.consecutivo, CHAR(66 + (
      SELECT COUNT(*) FROM ordenes_compra oc2
      WHERE oc2.requerimiento_id = oc.requerimiento_id
        AND oc2.id < oc.id
        AND oc2.id <> COALESCE(
          r.orden_compra_id,
          (SELECT MIN(oc1.id) FROM ordenes_compra oc1 WHERE oc1.requerimiento_id = oc.requerimiento_id)
        )
    )))
  END AS numero_oc_nuevo
FROM ordenes_compra oc
JOIN requerimientos r ON r.id = oc.requerimiento_id;

UPDATE ordenes_compra oc
JOIN tmp_numero_oc_nuevo t ON t.id = oc.id
SET oc.numero_oc = t.numero_oc_nuevo;

-- 5. Sembrar consecutivos_control con el máximo real de cada grupo (que tras el
--    renumerado denso equivale al conteo de filas del grupo).
INSERT INTO consecutivos_control (anio, tipo, ultimo_numero)
SELECT YEAR(created_at), tipo, COUNT(*)
FROM requerimientos
GROUP BY YEAR(created_at), tipo
ON DUPLICATE KEY UPDATE ultimo_numero = VALUES(ultimo_numero);

COMMIT;

-- Verificación (debe devolver 0 filas todas):
-- SELECT consecutivo, COUNT(*) FROM requerimientos GROUP BY consecutivo HAVING COUNT(*) > 1;
-- SELECT numero_oc, COUNT(*) FROM ordenes_compra GROUP BY numero_oc HAVING COUNT(*) > 1;
-- SELECT id FROM ordenes_compra WHERE numero_oc LIKE 'TMP-%';
