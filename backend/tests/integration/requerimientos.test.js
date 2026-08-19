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

  it('solicitante solo lista sus propios REQ', async () => {
    await createRequerimiento('sol1');
    await createRequerimiento('sol2');

    const res = await agentFor('sol1').get('/api/requerimientos');
    assert.equal(res.status, 200);
    const datos = res.body.datos || res.body;
    assert.ok(Array.isArray(datos));
    assert.equal(datos.length, 1);
    // El listado expone solicitante_email (no siempre solicitante_id)
    assert.equal(datos[0].solicitante_email, 'sol1@test.local');
  });

  it('solicitante no puede ver REQ ajeno (IDOR)', async () => {
    const created = await createRequerimiento('sol2');
    assert.equal(created.status, 201);
    const res = await agentFor('sol1').get(`/api/requerimientos/${created.body.id}`);
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

  it('editar solo permitido en borrador o incompleto', async () => {
    const created = await createRequerimiento('sol1');
    await patchEstado('sol1', created.body.id, 'en_revision');
    const res = await agentFor('sol1')
      .put(`/api/requerimientos/${created.body.id}`)
      .send({
        titulo_solicitud: 'Intento de edicion en revision',
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
});
