import { agentFor, USERS } from './auth.js';
import { query } from './db.js';

/** Área/depto válidos según departamentos.json del proyecto */
export const AREA_DEPT = {
  area: 'ADMINISTRACIÓN',
  departamento: 'MATERIAL DE OFICINA-55500',
};

/**
 * Crea un REQ vía API.
 * @param {'sol1'|'sol2'|'compras'|'admin'} asUser
 * @param {object} overrides
 */
export async function createRequerimiento(asUser = 'sol1', overrides = {}) {
  const body = {
    titulo_solicitud: overrides.titulo_solicitud || 'REQ de prueba integración automatica',
    tipo: overrides.tipo || 'PARTES',
    area: overrides.area || AREA_DEPT.area,
    departamento: overrides.departamento || AREA_DEPT.departamento,
    notas: overrides.notas || '',
    items: overrides.items,
    items_libres: overrides.items_libres,
  };

  // Default: un ítem de catálogo con precio (no requiere cotización)
  if (body.items === undefined && body.items_libres === undefined) {
    body.items = [{ catalogo_id: 1, cantidad: 2 }];
  }

  const res = await agentFor(asUser).post('/api/requerimientos').send(body);
  return res;
}

/** Avanza estados de un REQ con el rol indicado. */
export async function patchEstado(asUser, reqId, estado, notas = undefined) {
  const payload = { estado };
  if (notas !== undefined) payload.notas = notas;
  return agentFor(asUser).patch(`/api/requerimientos/${reqId}/estado`).send(payload);
}

/**
 * Flujo hasta aprobado (catálogo con precio, sin cotización).
 * borrador → en_revision → recibido → aprobado
 */
export async function reqAprobadoSinCotizacion(asUser = 'sol1') {
  const created = await createRequerimiento(asUser, {
    items: [{ catalogo_id: 1, cantidad: 3 }],
  });
  if (created.status !== 201) {
    throw new Error(`createRequerimiento falló: ${created.status} ${JSON.stringify(created.body)}`);
  }
  const id = created.body.id;

  let r = await patchEstado(asUser, id, 'en_revision');
  if (r.status !== 200) throw new Error(`en_revision: ${r.status} ${JSON.stringify(r.body)}`);

  r = await patchEstado('compras', id, 'recibido');
  if (r.status !== 200) throw new Error(`recibido: ${r.status} ${JSON.stringify(r.body)}`);

  r = await patchEstado('compras', id, 'aprobado');
  if (r.status !== 200) throw new Error(`aprobado: ${r.status} ${JSON.stringify(r.body)}`);

  return r.body;
}

/**
 * REQ con ítems libres: requiere cotización para aprobar.
 * Devuelve { req, cotizacion } con cotización ya seleccionada y códigos listos.
 */
export async function reqAprobadoConCotizacion(asUser = 'sol1') {
  const created = await createRequerimiento(asUser, {
    titulo_solicitud: 'REQ libres para cotizar y OC',
    items: [],
    items_libres: [
      { descripcion: 'Pieza especial libre A', cantidad: 2, unidad: 'pza' },
    ],
  });
  if (created.status !== 201) {
    throw new Error(`create libres: ${created.status} ${JSON.stringify(created.body)}`);
  }
  const id = created.body.id;

  await patchEstado(asUser, id, 'en_revision');
  await patchEstado('compras', id, 'recibido');

  const cotRes = await agentFor('compras').post('/api/cotizaciones').send({
    requerimiento_id: id,
    proveedor_id: 1,
    monto_total: 100,
    moneda: 'MXN',
    solo_registro: true,
    omitir_envio_correo: true,
    items: [
      {
        descripcion: 'Pieza especial libre A',
        cantidad: 2,
        unidad: 'pza',
        precio_unitario: 50,
        codigo_catalogo: 'P-LIBRE-TEST-001',
      },
    ],
  });
  if (cotRes.status !== 201 && cotRes.status !== 200) {
    throw new Error(`crear cotizacion: ${cotRes.status} ${JSON.stringify(cotRes.body)}`);
  }
  const cotId = cotRes.body.id;
  if (!cotId) {
    throw new Error(`No se obtuvo id de cotización: ${JSON.stringify(cotRes.body)}`);
  }
  return afterSelect(id, cotId);
}

async function afterSelect(reqId, cotId) {
  const sel = await agentFor('compras').post(`/api/cotizaciones/${cotId}/seleccionar`).send({
    requerimiento_id: reqId,
  });
  if (sel.status !== 200) {
    throw new Error(`seleccionar: ${sel.status} ${JSON.stringify(sel.body)}`);
  }

  const apr = await patchEstado('compras', reqId, 'aprobado');
  if (apr.status !== 200) {
    throw new Error(`aprobar con cot: ${apr.status} ${JSON.stringify(apr.body)}`);
  }

  return { req: apr.body, cotizacionId: cotId };
}

export async function crearOc(asUser, payload) {
  return agentFor(asUser).post('/api/ordenes-compra').send({
    datatextnow_id: 'PO-TEST-001',
    fecha_po: '2026-03-15',
    ...payload,
  });
}

/**
 * REQ en estado `recibido` con ítems libres (listo para cotizar).
 */
export async function reqRecibidoConLibres(asUser = 'sol1', libres = null) {
  const created = await createRequerimiento(asUser, {
    titulo_solicitud: 'REQ libres listo para cotizar',
    items: [],
    items_libres: libres || [
      { descripcion: 'Componente libre para RFQ', cantidad: 2, unidad: 'pza' },
    ],
  });
  if (created.status !== 201) {
    throw new Error(`create libres: ${created.status} ${JSON.stringify(created.body)}`);
  }
  const id = created.body.id;
  let r = await patchEstado(asUser, id, 'en_revision');
  if (r.status !== 200) throw new Error(`en_revision: ${r.status} ${JSON.stringify(r.body)}`);
  r = await patchEstado('compras', id, 'recibido');
  if (r.status !== 200) throw new Error(`recibido: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

/**
 * Crea cotización (por defecto solo_registro para no depender de reglas de envío).
 */
export async function crearCotizacion(payload = {}) {
  const body = {
    proveedor_id: 1,
    monto_total: 100,
    moneda: 'MXN',
    solo_registro: true,
    omitir_envio_correo: true,
    items: [
      {
        descripcion: 'Linea cotizacion test',
        cantidad: 2,
        unidad: 'pza',
        precio_unitario: 50,
        codigo_catalogo: 'P-COT-TEST-001',
      },
    ],
    ...payload,
  };
  return agentFor('compras').post('/api/cotizaciones').send(body);
}

export { USERS };
