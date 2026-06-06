/**
 * Utilidades compartidas para validar y resolver datos de cierre de OC.
 */

async function resolverPoOrden(conn, ocId) {
  const [[oc]] = await conn.query(
    'SELECT datatextnow_id FROM ordenes_compra WHERE id = ?',
    [ocId]
  );

  if (oc?.datatextnow_id && String(oc.datatextnow_id).trim()) {
    return String(oc.datatextnow_id).trim();
  }

  const [[rec]] = await conn.query(
    `SELECT datatextnow_id
     FROM recepciones
     WHERE orden_compra_id = ?
       AND datatextnow_id IS NOT NULL
       AND TRIM(datatextnow_id) <> ''
     ORDER BY id DESC
     LIMIT 1`,
    [ocId]
  );

  return rec?.datatextnow_id ? String(rec.datatextnow_id).trim() : null;
}

async function contarRecepciones(conn, ocId) {
  const [[row]] = await conn.query(
    'SELECT COUNT(*) AS cnt FROM recepciones WHERE orden_compra_id = ?',
    [ocId]
  );
  return row?.cnt || 0;
}

/**
 * Estados de recepción que permiten cerrar la OC sin confirmación del solicitante.
 */
function recepcionListaParaCierre(estado) {
  return ['entregado_solicitante', 'recibido_completo'].includes(estado);
}

async function validarCierreOrden(conn, ocId) {
  const total = await contarRecepciones(conn, ocId);
  if (total === 0) {
    return {
      ok: false,
      mensaje: 'No se puede cerrar la OC sin haber registrado al menos una recepción.',
    };
  }

  const [pendientes] = await conn.query(
    `SELECT COUNT(*) AS cnt
     FROM recepciones
     WHERE orden_compra_id = ?
       AND estado NOT IN ('entregado_solicitante', 'recibido_completo')`,
    [ocId]
  );

  if ((pendientes[0]?.cnt || 0) > 0) {
    return {
      ok: false,
      mensaje: 'No se puede cerrar la OC: hay recepciones parciales pendientes de completar o confirmar.',
    };
  }

  const po = await resolverPoOrden(conn, ocId);
  if (!po) {
    return {
      ok: false,
      mensaje: 'No se puede cerrar la OC sin el número de PO de DataTextNow registrado.',
    };
  }

  return { ok: true, po };
}

export {
  resolverPoOrden,
  contarRecepciones,
  recepcionListaParaCierre,
  validarCierreOrden,
};