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

  it('solicitante solo ve sus OC', async () => {
    const req1 = await reqAprobadoSinCotizacion('sol1');
    await crearOc('compras', { requerimiento_id: req1.id, datatextnow_id: 'PO-S1', fecha_po: '2026-01-01' });

    const req2 = await reqAprobadoSinCotizacion('sol2');
    await crearOc('compras', { requerimiento_id: req2.id, datatextnow_id: 'PO-S2', fecha_po: '2026-01-02' });

    const res = await agentFor('sol1').get('/api/ordenes-compra');
    assert.equal(res.status, 200);
    const datos = res.body.datos || res.body;
    assert.ok(Array.isArray(datos));
    assert.ok(datos.every((oc) => oc.solicitante_id === 3 || oc.solicitante_email === 'sol1@test.local'));
  });

  it('solicitante no ve OC ajena por ID', async () => {
    const req2 = await reqAprobadoSinCotizacion('sol2');
    const oc = await crearOc('compras', { requerimiento_id: req2.id });
    const res = await agentFor('sol1').get(`/api/ordenes-compra/${oc.body.id}`);
    assert.equal(res.status, 403);
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

  it('solicitante no puede crear recepción', async () => {
    const req = await reqAprobadoSinCotizacion('sol1');
    const ocRes = await crearOc('compras', { requerimiento_id: req.id });
    const res = await agentFor('sol1')
      .post(`/api/ordenes-compra/${ocRes.body.id}/recepciones`)
      .send({ estado: 'recibido_completo', items: [] });
    assert.equal(res.status, 403);
  });
});
