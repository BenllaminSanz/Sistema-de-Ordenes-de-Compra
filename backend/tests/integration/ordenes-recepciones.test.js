import { it } from 'node:test';
import assert from 'node:assert/strict';
import { describeIntegration } from '../helpers/integration.js';
import { agentFor } from '../helpers/auth.js';
import {
  createRequerimiento,
  patchEstado,
  reqAprobadoSinCotizacion,
  reqAprobadoConCotizacion,
  crearOc,
} from '../helpers/factories.js';
import { query } from '../helpers/db.js';
import { readXlsxRows } from '../helpers/excel.js';

describeIntegration('Órdenes de compra y recepciones', () => {
  it('no genera OC si REQ no está aprobado', async () => {
    const created = await createRequerimiento('sol1');
    await patchEstado('sol1', created.body.id, 'en_revision');
    const res = await crearOc('compras', { requerimiento_id: created.body.id });
    assert.equal(res.status, 422);
  });

  it('solicitante no puede crear OC', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const res = await crearOc('sol1', { requerimiento_id: req.id });
    assert.equal(res.status, 403);
  });

  it('genera OC desde REQ aprobado (catálogo) y cierra el REQ', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const res = await crearOc('compras', {
      requerimiento_id: req.id,
      datatextnow_id: 'DTN-100',
      fecha_po: '2026-02-01',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.estado, 'generada');
    assert.equal(res.body.datatextnow_id, 'DTN-100');

    const detalle = await agentFor('compras').get(`/api/requerimientos/${req.id}`);
    assert.equal(detalle.status, 200);
    assert.equal(detalle.body.estado, 'cerrado');
    assert.ok(detalle.body.orden_compra_id || detalle.body.oc_id);
  });

  it('no genera segunda OC del mismo REQ', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const first = await crearOc('compras', { requerimiento_id: req.id });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const second = await crearOc('compras', { requerimiento_id: req.id });
    assert.equal(second.status, 422);
  });

  it('exige cotizacion_id cuando el REQ requiere cotización', async () => {
    // libres → requiere cotización; aprobar sin selección falla; con selección sin pasar cotizacion_id al crear OC
    const { req } = await reqAprobadoConCotizacion('sol1');
    const res = await agentFor('compras').post('/api/ordenes-compra').send({
      requerimiento_id: req.id,
      // sin cotizacion_id
      datatextnow_id: 'PO-X',
      fecha_po: '2026-02-01',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.mensaje || '', /cotizaci/i);
  });

  it('genera OC con cotización y PO = NA', async () => {
    const { req, cotizacionId } = await reqAprobadoConCotizacion('sol1');
    const res = await crearOc('compras', {
      requerimiento_id: req.id,
      cotizacion_id: cotizacionId,
      datatextnow_id: 'NA',
      fecha_po: '2026-03-01',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.datatextnow_id, 'NA');
  });

  it('falla crear OC sin PO', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const res = await agentFor('compras').post('/api/ordenes-compra').send({
      requerimiento_id: req.id,
      datatextnow_id: '',
      fecha_po: '2026-02-01',
    });
    assert.equal(res.status, 400);
  });

  it('transición generada → distribuida', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const oc = await crearOc('compras', { requerimiento_id: req.id });
    const res = await agentFor('compras')
      .patch(`/api/ordenes-compra/${oc.body.id}/estado`)
      .send({ estado: 'distribuida' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.estado, 'distribuida');
  });

  it('cierre manual sin recepciones → 422', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const oc = await crearOc('compras', { requerimiento_id: req.id });
    await agentFor('compras')
      .patch(`/api/ordenes-compra/${oc.body.id}/estado`)
      .send({ estado: 'distribuida' });
    await agentFor('compras')
      .patch(`/api/ordenes-compra/${oc.body.id}/estado`)
      .send({ estado: 'en_proceso' });
    const res = await agentFor('compras')
      .patch(`/api/ordenes-compra/${oc.body.id}/estado`)
      .send({ estado: 'cerrada' });
    assert.equal(res.status, 422);
    assert.match(res.body.mensaje || '', /recepci/i);
  });

  it('solicitante consulta solo sus OC por defecto', async () => {
    const req1 = await reqAprobadoSinCotizacion('sol1');
    await crearOc('compras', { requerimiento_id: req1.id, datatextnow_id: 'PO-S1', fecha_po: '2026-01-01' });

    const req2 = await reqAprobadoSinCotizacion('sol2');
    await crearOc('compras', { requerimiento_id: req2.id, datatextnow_id: 'PO-S2', fecha_po: '2026-01-02' });

    const res = await agentFor('sol1').get('/api/ordenes-compra');
    assert.equal(res.status, 200);
    const datos = res.body.datos || res.body;
    assert.ok(Array.isArray(datos));
    assert.ok(datos.length >= 1);
    assert.ok(datos.every((o) => Number(o.solicitante_id) === 3 || String(o.solicitante_nombre || '').includes('Uno')));
  });

  it('solicitante ve OC de todos con solicitante_id=all', async () => {
    const req1 = await reqAprobadoSinCotizacion('sol1');
    await crearOc('compras', { requerimiento_id: req1.id, datatextnow_id: 'PO-S1B', fecha_po: '2026-01-01' });
    const req2 = await reqAprobadoSinCotizacion('sol2');
    await crearOc('compras', { requerimiento_id: req2.id, datatextnow_id: 'PO-S2B', fecha_po: '2026-01-02' });
    const res = await agentFor('sol1').get('/api/ordenes-compra?solicitante_id=all');
    assert.equal(res.status, 200);
    const datos = res.body.datos || res.body;
    assert.ok(datos.length >= 2);
  });

  it('compras puede cambiar el proveedor de una OC con cotización (sin recotizar)', async () => {
    const { req, cotizacionId } = await reqAprobadoConCotizacion('sol1');
    const oc = await crearOc('compras', {
      requerimiento_id: req.id,
      cotizacion_id: cotizacionId,
    });
    assert.equal(oc.status, 201, JSON.stringify(oc.body));
    assert.equal(Number(oc.body.proveedor_id), 1);

    const res = await agentFor('compras')
      .patch(`/api/ordenes-compra/${oc.body.id}/proveedor`)
      .send({ proveedor_id: 2 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(Number(res.body.proveedor_id), 2);
    assert.match(String(res.body.proveedor_nombre || ''), /Beta/i);

    const [[cot]] = await query('SELECT proveedor_id FROM cotizaciones WHERE id = ?', [cotizacionId]);
    assert.equal(Number(cot.proveedor_id), 2);
  });

  it('solicitante no puede cambiar el proveedor de la OC', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const oc = await crearOc('compras', { requerimiento_id: req.id });
    const res = await agentFor('sol1')
      .patch(`/api/ordenes-compra/${oc.body.id}/proveedor`)
      .send({ proveedor_id: 2 });
    assert.equal(res.status, 403);
  });

  it('solicitante puede consultar una OC ajena (solo lectura)', async () => {
    const req2 = await reqAprobadoSinCotizacion('sol2');
    const oc = await crearOc('compras', { requerimiento_id: req2.id });
    const res = await agentFor('sol1').get(`/api/ordenes-compra/${oc.body.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, oc.body.id);
  });

  it('recepción completa y cierre de OC', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const ocRes = await crearOc('compras', {
      requerimiento_id: req.id,
      datatextnow_id: 'PO-REC-1',
      fecha_po: '2026-04-01',
    });
    assert.equal(ocRes.status, 201, JSON.stringify(ocRes.body));
    const ocId = ocRes.body.id;

    const detalle = await agentFor('compras').get(`/api/ordenes-compra/${ocId}`);
    assert.equal(detalle.status, 200);
    const items = detalle.body.items || [];
    assert.ok(items.length >= 1, 'OC debe traer ítems');

    const item = items[0];
    const itemKey = item.origen === 'catalogo' || item.catalogo_id
      ? `cat-${item.id}`
      : item.item_key;

    // Clave real según modelo de recepciones: cat-${ri.id}
    const key = item.origen === 'cotizacion'
      ? `cot-${item.id}`
      : item.origen === 'libres'
        ? `lib-${item.id}`
        : `cat-${item.id}`;

    const rec = await agentFor('compras')
      .post(`/api/ordenes-compra/${ocId}/recepciones`)
      .send({
        estado: 'recibido_completo',
        cerrar_oc: true,
        items: [
          {
            item_key: key,
            descripcion: item.descripcion,
            codigo: item.codigo,
            cantidad_solicitada: item.cantidad,
            cantidad_recibida: item.cantidad,
            unidad: item.unidad || 'pza',
          },
        ],
      });

    assert.equal(rec.status, 201, JSON.stringify(rec.body));
    assert.equal(rec.body.oc_cerrada, true);

    const ocFinal = await agentFor('compras').get(`/api/ordenes-compra/${ocId}`);
    assert.equal(ocFinal.body.estado, 'cerrada');
  });

  it('no permite recepción con cantidad mayor al pendiente', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const ocRes = await crearOc('compras', { requerimiento_id: req.id });
    const ocId = ocRes.body.id;
    const detalle = await agentFor('compras').get(`/api/ordenes-compra/${ocId}`);
    const item = detalle.body.items[0];
    const key = `cat-${item.id}`;

    const rec = await agentFor('compras')
      .post(`/api/ordenes-compra/${ocId}/recepciones`)
      .send({
        estado: 'recibido_parcial',
        items: [
          {
            item_key: key,
            cantidad_solicitada: item.cantidad,
            cantidad_recibida: Number(item.cantidad) + 10,
            descripcion: item.descripcion,
          },
        ],
      });
    assert.equal(rec.status, 422);
  });

  it('compras puede registrar recepción con fecha histórica', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const ocRes = await crearOc('compras', { requerimiento_id: req.id, datatextnow_id: 'PO-FEC', fecha_po: '2026-04-01' });
    const ocId = ocRes.body.id;
    const detalle = await agentFor('compras').get(`/api/ordenes-compra/${ocId}`);
    const item = detalle.body.items[0];
    const key = `cat-${item.id}`;
    const rec = await agentFor('compras')
      .post(`/api/ordenes-compra/${ocId}/recepciones`)
      .send({
        estado: 'recibido_parcial',
        fecha_recepcion: '2025-11-15',
        items: [{
          item_key: key,
          descripcion: item.descripcion,
          codigo: item.codigo,
          cantidad_solicitada: item.cantidad,
          cantidad_recibida: 1,
          unidad: item.unidad || 'pza',
        }],
      });
    assert.equal(rec.status, 201, JSON.stringify(rec.body));
    assert.match(String(rec.body.fecha_recepcion || ''), /2025-11-15/);

    const recId = rec.body.id;
    const upd = await agentFor('compras')
      .put(`/api/ordenes-compra/${ocId}/recepciones/${recId}`)
      .send({ fecha_recepcion: '2025-12-01' });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    assert.match(String(upd.body.fecha_recepcion || ''), /2025-12-01/);
  });

  it('solicitante no puede crear recepción', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const ocRes = await crearOc('compras', { requerimiento_id: req.id });
    const res = await agentFor('sol1')
      .post(`/api/ordenes-compra/${ocRes.body.id}/recepciones`)
      .send({ estado: 'recibido_completo', items: [] });
    assert.equal(res.status, 403);
  });

  it('export Excel de OC respeta filtro de estado', async () => {
    const reqGen = await reqAprobadoSinCotizacion('sol1');
    await crearOc('compras', {
      requerimiento_id: reqGen.id,
      datatextnow_id: 'PO-EX-GEN',
      fecha_po: '2026-01-01',
    });
    const reqDist = await reqAprobadoSinCotizacion('sol2');
    const ocDist = await crearOc('compras', {
      requerimiento_id: reqDist.id,
      datatextnow_id: 'PO-EX-DIST',
      fecha_po: '2026-01-02',
    });
    assert.equal(ocDist.status, 201, JSON.stringify(ocDist.body));
    const dist = await agentFor('compras')
      .patch(`/api/ordenes-compra/${ocDist.body.id}/estado`)
      .send({ estado: 'distribuida' });
    assert.equal(dist.status, 200, JSON.stringify(dist.body));

    const res = await agentFor('compras')
      .get('/api/reportes/ordenes-compra?libre=1&estado=generada')
      .buffer(true)
      .parse((response, cb) => {
        const chunks = [];
        response.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(res.status, 200);
    const blob = JSON.stringify(readXlsxRows(res.body));
    assert.match(blob, /PO-EX-GEN/);
    assert.doesNotMatch(blob, /PO-EX-DIST/);
  });

  it('solicitante puede exportar Excel de OC (solo las suyas por defecto)', async () => {
    const req1 = await reqAprobadoSinCotizacion('sol1');
    await crearOc('compras', {
      requerimiento_id: req1.id,
      datatextnow_id: 'PO-SOL1-XLS',
      fecha_po: '2026-01-01',
    });
    const req2 = await reqAprobadoSinCotizacion('sol2');
    await crearOc('compras', {
      requerimiento_id: req2.id,
      datatextnow_id: 'PO-SOL2-XLS',
      fecha_po: '2026-01-02',
    });

    const res = await agentFor('sol1')
      .get('/api/reportes/ordenes-compra?libre=1')
      .buffer(true)
      .parse((response, cb) => {
        const chunks = [];
        response.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(res.status, 200);
    const blob = JSON.stringify(readXlsxRows(res.body));
    assert.match(blob, /PO-SOL1-XLS/);
    assert.doesNotMatch(blob, /PO-SOL2-XLS/);
  });

  it('listado y Excel: una OC con 3 recepciones no se triplica', async () => {
    const created = await createRequerimiento('sol1', {
      titulo_solicitud: 'OC tres entregas varios items',
      items: [
        { catalogo_id: 1, cantidad: 3 },
        { catalogo_id: 2, cantidad: 3 },
      ],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.id;
    assert.equal((await patchEstado('sol1', id, 'en_revision')).status, 200);
    assert.equal((await patchEstado('compras', id, 'recibido')).status, 200);
    assert.equal((await patchEstado('compras', id, 'aprobado')).status, 200);

    const oc = await crearOc('compras', {
      requerimiento_id: id,
      datatextnow_id: 'PO-TRIPLE-XLS',
      fecha_po: '2026-05-01',
    });
    assert.equal(oc.status, 201, JSON.stringify(oc.body));
    const ocId = oc.body.id;
    const detalle = await agentFor('compras').get(`/api/ordenes-compra/${ocId}`);
    const ocItems = detalle.body.items || [];
    assert.ok(ocItems.length >= 2, JSON.stringify(detalle.body));
    const payloadItems = ocItems.map((item) => ({
      item_key: item.origen === 'cotizacion' ? `cot-${item.id}` : `cat-${item.id}`,
      descripcion: item.descripcion,
      codigo: item.codigo,
      cantidad_solicitada: item.cantidad,
      cantidad_recibida: 1,
      unidad: item.unidad || 'pza',
    }));

    for (let i = 0; i < 3; i++) {
      const rec = await agentFor('compras')
        .post(`/api/ordenes-compra/${ocId}/recepciones`)
        .send({
          estado: 'recibido_parcial',
          fecha_recepcion: `2026-05-0${i + 1}`,
          items: payloadItems,
        });
      assert.equal(rec.status, 201, JSON.stringify(rec.body));
    }

    const lista = await agentFor('compras').get('/api/ordenes-compra?busqueda=PO-TRIPLE-XLS&limite=50');
    assert.equal(lista.status, 200);
    const mismas = (lista.body.datos || []).filter((o) => o.datatextnow_id === 'PO-TRIPLE-XLS' || o.id === ocId);
    assert.equal(mismas.length, 1, `listado duplicado: ${mismas.length}`);

    const xls = await agentFor('compras')
      .get('/api/reportes/ordenes-compra?libre=1&busqueda=PO-TRIPLE-XLS')
      .buffer(true)
      .parse((response, cb) => {
        const chunks = [];
        response.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(xls.status, 200);
    const rows = readXlsxRows(xls.body);
    const deEsta = rows.filter((r) => r.some((c) => String(c).includes('PO-TRIPLE-XLS')));
    assert.equal(deEsta.length, 3, `esperaba 3 filas (una por recepción), hubo ${deEsta.length}: ${JSON.stringify(deEsta)}`);
  });
});
