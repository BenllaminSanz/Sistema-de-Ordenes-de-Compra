import { it } from 'node:test';
import assert from 'node:assert/strict';
import { describeIntegration } from '../helpers/integration.js';
import { agentFor } from '../helpers/auth.js';
import {
  createRequerimiento,
  patchEstado,
  AREA_DEPT,
  reqAprobadoSinCotizacion,
} from '../helpers/factories.js';
import { query } from '../helpers/db.js';
import { buildXlsxBuffer, readXlsxRows } from '../helpers/excel.js';
import { HEADERS_BASE_GRAL, HEADERS_REQUERIMIENTOS_POR_ITEM } from '../../src/utils/excelRequerimientos.js';

describeIntegration('Requerimientos', () => {
  it('crea REQ con ítems de catálogo en borrador', async () => {
    const res = await createRequerimiento('sol1', {
      items: [{ catalogo_id: 1, cantidad: 2 }],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.estado, 'borrador');
    assert.equal(res.body.solicitante_id, 3);
    assert.ok(Array.isArray(res.body.items));
    assert.equal(res.body.items.length, 1);
  });

  it('crea REQ con ítems libres y marca requiere_cotizacion', async () => {
    const res = await createRequerimiento('sol1', {
      items: [],
      items_libres: [{ descripcion: 'Pieza custom nueva', cantidad: 1, unidad: 'pza' }],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(Number(res.body.requiere_cotizacion), 1);
  });

  it('rechaza mezcla catálogo + libres', async () => {
    const res = await createRequerimiento('sol1', {
      items: [{ catalogo_id: 1, cantidad: 1 }],
      items_libres: [{ descripcion: 'Libre no permitido', cantidad: 1 }],
    });
    assert.equal(res.status, 400);
  });

  it('rechaza REQ vacío (sin ítems)', async () => {
    const res = await createRequerimiento('sol1', {
      items: [],
      items_libres: [],
    });
    assert.equal(res.status, 400);
  });

  it('rechaza ítems de distintos proveedores', async () => {
    const res = await createRequerimiento('sol1', {
      items: [
        { catalogo_id: 1, cantidad: 1 },
        { catalogo_id: 4, cantidad: 1 }, // Beta
      ],
    });
    assert.equal(res.status, 422);
    assert.match(res.body.mensaje || '', /proveedor/i);
  });

  it('busca REQ por el nombre actual del solicitante (tokens, p. ej. Isai Fonseca)', async () => {
    await createRequerimiento('sol1');
    const porNombre = await agentFor('compras').get(
      `/api/requerimientos?busqueda=${encodeURIComponent('Solicitante Uno')}`
    );
    assert.equal(porNombre.status, 200);
    assert.ok((porNombre.body.datos || []).length >= 1, JSON.stringify(porNombre.body));
    assert.ok(
      (porNombre.body.datos || []).some((r) => r.solicitante_email === 'sol1@test.local')
    );

    const porTokens = await agentFor('compras').get(
      `/api/requerimientos?busqueda=${encodeURIComponent('Uno')}`
    );
    assert.ok((porTokens.body.datos || []).some((r) => r.solicitante_email === 'sol1@test.local'));

    const sinMatch = await agentFor('compras').get(
      `/api/requerimientos?busqueda=${encodeURIComponent('NoExisteXYZ123')}`
    );
    assert.equal((sinMatch.body.datos || []).length, 0);
  });

  it('solicitante lista solo sus REQ por defecto', async () => {
    await createRequerimiento('sol1');
    await createRequerimiento('sol2');

    const res = await agentFor('sol1').get('/api/requerimientos');
    assert.equal(res.status, 200);
    const datos = res.body.datos || res.body;
    assert.ok(Array.isArray(datos));
    assert.ok(datos.length >= 1);
    assert.ok(datos.every((r) => r.solicitante_email === 'sol1@test.local'));
    assert.ok(!datos.some((r) => r.solicitante_email === 'sol2@test.local'));
  });

  it('solicitante ve REQ de todos con solicitante_id=all', async () => {
    await createRequerimiento('sol1');
    await createRequerimiento('sol2');
    const res = await agentFor('sol1').get('/api/requerimientos?solicitante_id=all');
    assert.equal(res.status, 200);
    const datos = res.body.datos || res.body;
    const emails = datos.map((r) => r.solicitante_email);
    assert.ok(emails.includes('sol1@test.local'));
    assert.ok(emails.includes('sol2@test.local'));
  });

  it('solicitante puede consultar el detalle de un REQ ajeno', async () => {
    const created = await createRequerimiento('sol2');
    assert.equal(created.status, 201);
    const res = await agentFor('sol1').get(`/api/requerimientos/${created.body.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, created.body.id);
  });

  it('solicitante no puede editar un REQ ajeno', async () => {
    const created = await createRequerimiento('sol2');
    const res = await agentFor('sol1')
      .put(`/api/requerimientos/${created.body.id}`)
      .send({ titulo_solicitud: 'Intento de edición ajena de diez' });
    assert.equal(res.status, 403);
  });

  it('solicitante envía a revisión y se asigna consecutivo', async () => {
    const created = await createRequerimiento('sol1');
    const id = created.body.id;
    const res = await patchEstado('sol1', id, 'en_revision');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.estado, 'en_revision');
    assert.ok(res.body.consecutivo);
  });

  it('solicitante no puede acusar recibido', async () => {
    const created = await createRequerimiento('sol1');
    await patchEstado('sol1', created.body.id, 'en_revision');
    const res = await patchEstado('sol1', created.body.id, 'recibido');
    assert.equal(res.status, 403);
  });

  it('compras acusa recibido y aprueba (sin cotización)', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    assert.equal(req.estado, 'aprobado');
  });

  it('compras no puede saltar en_revision → aprobado', async () => {
    const created = await createRequerimiento('sol1');
    await patchEstado('sol1', created.body.id, 'en_revision');
    const res = await patchEstado('compras', created.body.id, 'aprobado');
    assert.equal(res.status, 403);
  });

  it('aprobar con cotización requerida sin selección → 400', async () => {
    const created = await createRequerimiento('sol1', {
      items: [],
      items_libres: [{ descripcion: 'Necesita cotizacion', cantidad: 1 }],
    });
    const id = created.body.id;
    await patchEstado('sol1', id, 'en_revision');
    await patchEstado('compras', id, 'recibido');
    const res = await patchEstado('compras', id, 'aprobado');
    assert.equal(res.status, 400);
    assert.match(res.body.mensaje || '', /cotizaci/i);
  });

  it('no se puede regresar a en_revision si ya hay OC', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const oc = await agentFor('compras').post('/api/ordenes-compra').send({
      requerimiento_id: req.id,
      datatextnow_id: 'PO-1',
      fecha_po: '2026-01-10',
    });
    assert.equal(oc.status, 201, JSON.stringify(oc.body));

    const res = await patchEstado('compras', req.id, 'en_revision');
    // Tras generar OC el REQ queda `cerrado`: el rol no permite la transición (403)
    // o la regla de negocio con OC lo bloquea (422). Ambos impiden el regreso.
    assert.ok([403, 422].includes(res.status), `status=${res.status} body=${JSON.stringify(res.body)}`);
  });

  it('solo se elimina en borrador', async () => {
    const created = await createRequerimiento('sol1');
    await patchEstado('sol1', created.body.id, 'en_revision');
    const del = await agentFor('sol1').delete(`/api/requerimientos/${created.body.id}`);
    assert.equal(del.status, 422);
  });

  it('compras puede corregir área/departamento en cualquier estado', async () => {
    const created = await createRequerimiento('sol1');
    await patchEstado('sol1', created.body.id, 'en_revision');
    const res = await agentFor('compras')
      .patch(`/api/requerimientos/${created.body.id}/area-departamento`)
      .send({
        area: AREA_DEPT.area,
        departamento: 'SEGURIDAD',
      });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(String(res.body.departamento).toUpperCase(), 'SEGURIDAD');
  });

  it('solicitante puede editar su REQ en revisión', async () => {
    const created = await createRequerimiento('sol1');
    await patchEstado('sol1', created.body.id, 'en_revision');
    const res = await agentFor('sol1')
      .put(`/api/requerimientos/${created.body.id}`)
      .send({
        titulo_solicitud: 'Titulo corregido aun en revision',
        ...AREA_DEPT,
        tipo: 'PARTES',
        items: [{ catalogo_id: 1, cantidad: 1 }],
      });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.titulo_solicitud, 'Titulo corregido aun en revision');
    assert.equal(res.body.estado, 'en_revision');
  });

  it('solicitante no puede editar el REQ una vez recibido', async () => {
    const created = await createRequerimiento('sol1');
    await patchEstado('sol1', created.body.id, 'en_revision');
    await patchEstado('compras', created.body.id, 'recibido');
    const res = await agentFor('sol1')
      .put(`/api/requerimientos/${created.body.id}`)
      .send({
        titulo_solicitud: 'Intento de edicion ya recibido',
        ...AREA_DEPT,
        tipo: 'PARTES',
        items: [{ catalogo_id: 1, cantidad: 1 }],
      });
    assert.equal(res.status, 404);
  });

  it('máximo 15 ítems por REQ', async () => {
    const items = Array.from({ length: 16 }, () => ({ catalogo_id: 1, cantidad: 1 }));
    const res = await createRequerimiento('sol1', { items });
    assert.equal(res.status, 422);
  });

  it('historial se registra al crear', async () => {
    const created = await createRequerimiento('sol1');
    const [rows] = await query(
      `SELECT estado_nuevo FROM historial_estados
       WHERE entidad_tipo = 'requerimiento' AND entidad_id = ?`,
      [created.body.id]
    );
    assert.ok(rows.some((r) => r.estado_nuevo === 'borrador'));
  });

  it('compras puede editar Notas/Detalles en REQ aprobado', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const res = await agentFor('compras')
      .patch(`/api/requerimientos/${req.id}/notas`)
      .send({ notas: 'Cotización compartida al área el 03/08. Pendiente de visto bueno.' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body.notas || '', /Cotización compartida/);
    assert.ok(res.body.ultimo_estatus?.notas);
    assert.match(res.body.ultimo_estatus.notas, /Cotización compartida/);
  });

  it('solicitante no puede PATCH notas', async () => {
    const created = await createRequerimiento('sol1');
    const res = await agentFor('sol1')
      .patch(`/api/requerimientos/${created.body.id}/notas`)
      .send({ notas: 'intento del dueño' });
    assert.equal(res.status, 403);
  });

  it('compras puede editar título en REQ aprobado', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const res = await agentFor('compras')
      .patch(`/api/requerimientos/${req.id}/titulo`)
      .send({ titulo_solicitud: 'Título corregido desde Compras' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.titulo_solicitud, 'Título corregido desde Compras');
  });

  it('admin puede editar título en REQ aprobado', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const res = await agentFor('admin')
      .patch(`/api/requerimientos/${req.id}/titulo`)
      .send({ titulo_solicitud: 'Título corregido por Admin' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.titulo_solicitud, 'Título corregido por Admin');
  });

  it('solicitante no puede editar título una vez enviado a revisión', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const res = await agentFor('sol1')
      .patch(`/api/requerimientos/${req.id}/titulo`)
      .send({ titulo_solicitud: 'Intento del solicitante publicado' });
    assert.equal(res.status, 403);
  });

  it('import Excel actualiza título (descripción) y notas (Status) de N° existentes', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const [[{ consecutivo }]] = await query(
      'SELECT consecutivo FROM requerimientos WHERE id = ?',
      [req.id]
    );
    assert.ok(consecutivo);

    const rows = [
      HEADERS_BASE_GRAL,
      [
        '', '', consecutivo, '', 'PARTES',
        '', '', '', '', 'Solicitante Uno',
        'Aprobado', AREA_DEPT.area, AREA_DEPT.departamento, '31',
        'Descripcion del reporte de excel', '', 'Bitacora de estatus del Excel',
      ],
    ];
    const buffer = buildXlsxBuffer(rows);
    const res = await agentFor('compras')
      .post('/api/requerimientos/importar')
      .attach('archivo', buffer, 'base-gral.xlsx');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.actualizados, 1, JSON.stringify(res.body));

    const got = await agentFor('compras').get(`/api/requerimientos/${req.id}`);
    assert.equal(got.body.titulo_solicitud, 'Descripcion del reporte de excel');
    assert.equal(got.body.notas, 'Bitacora de estatus del Excel');
  });

  it('crea REQ libre con precio sugerido', async () => {
    const res = await createRequerimiento('sol1', {
      items: [],
      items_libres: [{
        descripcion: 'Papel bond oficio',
        cantidad: 10,
        unidad: 'BO',
        precio_sugerido: 45,
      }],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(Number(res.body.items_libres?.[0]?.precio_sugerido), 45);
  });

  it('export Excel de REQ usa costo de catálogo si no hay cotización', async () => {
    const created = await createRequerimiento('sol1', {
      items: [{ catalogo_id: 1, cantidad: 2 }],
      titulo_solicitud: 'Export precio catalogo tornillo',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const res = await agentFor('compras')
      .get('/api/requerimientos/exportar?completo=1')
      .buffer(true)
      .parse((response, cb) => {
        const chunks = [];
        response.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(res.status, 200);
    const rows = readXlsxRows(res.body);
    const headers = rows[0].map(String);
    const idxPrecio = headers.findIndex((h) => /precio unitario/i.test(h));
    const idxCodigo = headers.findIndex((h) => /c[oó]digo/i.test(h));
    const idxTotal = headers.findIndex((h) => /total/i.test(h));
    const fila = rows.slice(1).find((r) => String(r[idxCodigo]).includes('P-ALPHA-001'));
    assert.ok(fila, JSON.stringify({ headers, rows: rows.slice(0, 3) }));
    assert.equal(Number(fila[idxPrecio]), 12.5);
    assert.equal(Number(fila[idxTotal]), 25);
  });

  it('import Excel Recibido con Total guarda monto estimado y sale en el export', async () => {
    const rowsIn = [
      HEADERS_BASE_GRAL,
      [
        '', '', '2026P-88001', '', 'PARTES',
        '00001', 'Proveedor Alpha', 1500, 'MXN', 'Solicitante Uno',
        'Recibido', AREA_DEPT.area, AREA_DEPT.departamento, '31',
        'Parte con precio importado', '', '',
      ],
    ];
    const buffer = buildXlsxBuffer(rowsIn);
    const imp = await agentFor('compras')
      .post('/api/requerimientos/importar')
      .attach('archivo', buffer, 'base-gral.xlsx');
    assert.equal(imp.status, 200, JSON.stringify(imp.body));
    assert.equal(imp.body.importados, 1, JSON.stringify(imp.body));

    const [[{ monto_estimado, moneda_estimada }]] = await query(
      'SELECT monto_estimado, moneda_estimada FROM requerimientos WHERE consecutivo = ?',
      ['2026P-88001']
    );
    assert.equal(Number(monto_estimado), 1500);
    assert.equal(moneda_estimada, 'MXN');

    const res = await agentFor('compras')
      .get('/api/requerimientos/exportar?completo=1')
      .buffer(true)
      .parse((response, cb) => {
        const chunks = [];
        response.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(res.status, 200);
    const rows = readXlsxRows(res.body);
    const headers = rows[0].map(String);
    const idxN = headers.findIndex((h) => /^n/i.test(h));
    const idxTotal = headers.findIndex((h) => /total/i.test(h));
    const fila = rows.slice(1).find((r) => String(r[idxN]).includes('2026P-88001'));
    assert.ok(fila, JSON.stringify({ headers, rows: rows.slice(0, 3) }));
    assert.equal(Number(fila[idxTotal]), 1500);
  });

  it('import Excel por ítem guarda precio sugerido en ítem libre', async () => {
    const rowsIn = [
      HEADERS_REQUERIMIENTOS_POR_ITEM,
      [
        '', '', '2026P-88002', '', 'PARTES',
        '', '', '', 'MXN', 'Solicitante Uno',
        'Recibido', AREA_DEPT.area, AREA_DEPT.departamento, '31',
        '', 'PAPEL BOND', 10, 'BO', 45, 450, '',
      ],
    ];
    const buffer = buildXlsxBuffer(rowsIn);
    const imp = await agentFor('compras')
      .post('/api/requerimientos/importar')
      .attach('archivo', buffer, 'items.xlsx');
    assert.equal(imp.status, 200, JSON.stringify(imp.body));
    assert.equal(imp.body.importados, 1, JSON.stringify(imp.body));

    const [[item]] = await query(
      `SELECT ril.descripcion, ril.cantidad, ril.unidad, ril.precio_sugerido
       FROM requerimiento_items_libres ril
       JOIN requerimientos r ON r.id = ril.requerimiento_id
       WHERE r.consecutivo = ?`,
      ['2026P-88002']
    );
    assert.ok(item, 'ítem libre no creado');
    assert.match(String(item.descripcion), /PAPEL BOND/i);
    assert.equal(Number(item.cantidad), 10);
    assert.equal(item.unidad, 'BO');
    assert.equal(Number(item.precio_sugerido), 45);
  });

  it('export Excel de REQ respeta filtro tipo', async () => {
    const partes = await createRequerimiento('sol1', {
      tipo: 'PARTES',
      titulo_solicitud: 'Solo partes export',
    });
    const serv = await createRequerimiento('sol1', {
      tipo: 'SERVICIOS',
      titulo_solicitud: 'Solo servicios export',
      items: [],
      items_libres: [{ descripcion: 'Servicio x', cantidad: 1, unidad: 'pza' }],
    });
    assert.equal(partes.status, 201, JSON.stringify(partes.body));
    assert.equal(serv.status, 201, JSON.stringify(serv.body));

    const res = await agentFor('compras')
      .get('/api/requerimientos/exportar?completo=1&tipo=PARTES')
      .buffer(true)
      .parse((response, cb) => {
        const chunks = [];
        response.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(res.status, 200);
    const rows = readXlsxRows(res.body);
    const blob = JSON.stringify(rows);
    assert.match(blob, /PARTES/);
    assert.doesNotMatch(blob, /SERVICIOS/);
    assert.doesNotMatch(blob, /Servicio x/);
  });
});
