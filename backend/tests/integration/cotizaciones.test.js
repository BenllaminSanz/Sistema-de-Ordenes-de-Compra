import { it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { describeIntegration } from '../helpers/integration.js';
import { agentFor } from '../helpers/auth.js';
import {
  createRequerimiento,
  patchEstado,
  reqRecibidoConLibres,
  reqAprobadoConCotizacion,
  crearCotizacion,
  crearOc,
} from '../helpers/factories.js';
import { query } from '../helpers/db.js';
import { getSentMails, findMails, flushAsyncMail } from '../helpers/mail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '../..');

describeIntegration('Cotizaciones y RFQ', () => {
  it('C01 — crea cotización en REQ con ítems libres', async () => {
    const req = await reqRecibidoConLibres('sol1');
    const res = await crearCotizacion({
      requerimiento_id: req.id,
      solo_registro: true,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.id);
    assert.equal(res.body.email_omitido, true);

    const list = await agentFor('compras').get(`/api/cotizaciones/${req.id}`);
    assert.equal(list.status, 200);
    const rows = Array.isArray(list.body) ? list.body : list.body?.data || [];
    assert.equal(rows.length, 1);
  });

  it('C02 — seleccionar una desmarca/rechaza las demás', async () => {
    const req = await reqRecibidoConLibres('sol1');
    const a = await crearCotizacion({
      requerimiento_id: req.id,
      proveedor_id: 1,
      items: [{ descripcion: 'Cot A', cantidad: 1, precio_unitario: 10, codigo_catalogo: 'A-1' }],
    });
    const b = await crearCotizacion({
      requerimiento_id: req.id,
      proveedor_id: 2,
      items: [{ descripcion: 'Cot B', cantidad: 1, precio_unitario: 12, codigo_catalogo: 'B-1' }],
    });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);

    const sel = await agentFor('compras')
      .post(`/api/cotizaciones/${a.body.id}/seleccionar`)
      .send({ requerimiento_id: req.id });
    assert.equal(sel.status, 200, JSON.stringify(sel.body));

    const [rows] = await query(
      'SELECT id, seleccionada, estado FROM cotizaciones WHERE requerimiento_id = ? ORDER BY id',
      [req.id]
    );
    const chosen = rows.find((r) => r.id === a.body.id);
    const other = rows.find((r) => r.id === b.body.id);
    assert.equal(Number(chosen.seleccionada), 1);
    assert.equal(chosen.estado, 'seleccionada');
    assert.equal(Number(other.seleccionada), 0);
    assert.equal(other.estado, 'rechazada');
  });

  it('C03 — deseleccionar cotización ganadora', async () => {
    const req = await reqRecibidoConLibres('sol1');
    const cot = await crearCotizacion({ requerimiento_id: req.id });
    await agentFor('compras')
      .post(`/api/cotizaciones/${cot.body.id}/seleccionar`)
      .send({ requerimiento_id: req.id });

    const des = await agentFor('compras')
      .post(`/api/cotizaciones/${cot.body.id}/deseleccionar`)
      .send({ requerimiento_id: req.id });
    assert.equal(des.status, 200, JSON.stringify(des.body));

    const [[row]] = await query(
      'SELECT seleccionada, estado FROM cotizaciones WHERE id = ?',
      [cot.body.id]
    );
    assert.equal(Number(row.seleccionada), 0);
    assert.notEqual(row.estado, 'seleccionada');
  });

  it('C03b — con REQ aprobado sin OC se puede cambiar proveedor y moneda de la seleccionada', async () => {
    const { req, cotizacionId } = await reqAprobadoConCotizacion('sol1');
    assert.ok(!req.oc_id && !req.orden_compra_id);

    const upd = await agentFor('compras')
      .put(`/api/cotizaciones/${cotizacionId}`)
      .send({ proveedor_id: 2, moneda: 'USD' });
    assert.ok([200, 201].includes(upd.status), JSON.stringify(upd.body));

    const [[row]] = await query(
      'SELECT proveedor_id, moneda FROM cotizaciones WHERE id = ?',
      [cotizacionId]
    );
    assert.equal(Number(row.proveedor_id), 2);
    assert.equal(row.moneda, 'USD');
  });

  it('C03c — con OC se puede corregir proveedor/moneda de la cotización seleccionada', async () => {
    const { req, cotizacionId } = await reqAprobadoConCotizacion('sol1');
    const oc = await crearOc('compras', {
      requerimiento_id: req.id,
      cotizacion_id: cotizacionId,
    });
    assert.equal(oc.status, 201, JSON.stringify(oc.body));

    const upd = await agentFor('compras')
      .put(`/api/cotizaciones/${cotizacionId}`)
      .send({ proveedor_id: 2, moneda: 'USD', monto_total: 999 });
    assert.ok([200, 201].includes(upd.status), JSON.stringify(upd.body));

    const [[cot]] = await query(
      'SELECT proveedor_id, moneda, monto_total FROM cotizaciones WHERE id = ?',
      [cotizacionId]
    );
    assert.equal(Number(cot.proveedor_id), 2);
    assert.equal(cot.moneda, 'USD');
    assert.notEqual(Number(cot.monto_total), 999);

    const [[ocRow]] = await query(
      'SELECT proveedor_id, moneda FROM ordenes_compra WHERE id = ?',
      [oc.body.id]
    );
    assert.equal(Number(ocRow.proveedor_id), 2);
    assert.equal(ocRow.moneda, 'USD');
  });

  it('C04 — no elimina cotización ya seleccionada', async () => {
    const req = await reqRecibidoConLibres('sol1');
    const cot = await crearCotizacion({ requerimiento_id: req.id });
    await agentFor('compras')
      .post(`/api/cotizaciones/${cot.body.id}/seleccionar`)
      .send({ requerimiento_id: req.id });

    const del = await agentFor('compras').delete(`/api/cotizaciones/${cot.body.id}`);
    assert.equal(del.status, 400);
    assert.match(del.body.message || del.body.mensaje || '', /seleccionad/i);
  });

  it('C05 — RFQ sin email de proveedor → sin_email', async () => {
    const req = await reqRecibidoConLibres('sol1');
    // proveedor 3 = Tienda Sin Email (seed)
    const cot = await crearCotizacion({
      requerimiento_id: req.id,
      proveedor_id: 3,
      solo_registro: true,
    });
    assert.equal(cot.status, 201);

    // Puede haber mails previos (notif en_revision); el RFQ al proveedor no debe enviarse
    const { clearSentMails } = await import('../helpers/mail.js');
    clearSentMails();

    const env = await agentFor('compras')
      .post(`/api/cotizaciones/${cot.body.id}/enviar`)
      .send({ idioma: 'es' });
    assert.equal(env.status, 400);
    assert.match(env.body.mensaje || '', /sin_email|email|correo/i);
    assert.equal(getSentMails().length, 0);
  });

  it('C06 — PARTES con precio de catálogo: no envía RFQ', async () => {
    // REQ solo catálogo con costo → no requiere cotización; aún se puede registrar cotización
    const created = await createRequerimiento('sol1', {
      items: [{ catalogo_id: 1, cantidad: 1 }],
    });
    const id = created.body.id;
    await patchEstado('sol1', id, 'en_revision');
    await patchEstado('compras', id, 'recibido');

    const cot = await crearCotizacion({
      requerimiento_id: id,
      solo_registro: true,
      items: [
        {
          descripcion: 'Tornillo M8 con precio',
          cantidad: 1,
          precio_unitario: 12.5,
          catalogo_id: 1,
          codigo_catalogo: 'P-ALPHA-001',
        },
      ],
    });
    assert.equal(cot.status, 201);

    const env = await agentFor('compras')
      .post(`/api/cotizaciones/${cot.body.id}/enviar`)
      .send({});
    assert.equal(env.status, 400);
    assert.match(
      env.body.mensaje || '',
      /no corresponde|no requier|catálogo|SERVICIOS|sin_email/i
    );
  });

  it('C06b — crear cotización con envío real (mock) a proveedor con email', async () => {
    const req = await reqRecibidoConLibres('sol1');
    // sin solo_registro → intenta RFQ inmediato (esHoy)
    const res = await agentFor('compras').post('/api/cotizaciones').send({
      requerimiento_id: req.id,
      proveedor_id: 1,
      monto_total: 80,
      items: [
        {
          descripcion: 'Componente libre para RFQ',
          cantidad: 2,
          unidad: 'pza',
          precio_unitario: 40,
          codigo_catalogo: 'P-RFQ-001',
        },
      ],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    // Mock debe registrar envío exitoso
    assert.equal(res.body.email_enviado, true, JSON.stringify(res.body));
    assert.equal(res.body.email_omitido, false);

    const rfq = findMails({ to: 'alpha@proveedor.test' });
    assert.ok(rfq.length >= 1, `mails: ${JSON.stringify(getSentMails())}`);
    assert.match(rfq[0].subject || '', /cotizaci|quotation/i);
  });

  it('C07 — upload tipo no permitido → 400', async () => {
    const req = await reqRecibidoConLibres('sol1');
    const cot = await crearCotizacion({ requerimiento_id: req.id });

    const res = await agentFor('compras')
      .post(`/api/cotizaciones/${cot.body.id}/archivo`)
      .attach('archivo', Buffer.from('MZ-fake-exe'), {
        filename: 'malware.exe',
        contentType: 'application/x-msdownload',
      });

    assert.equal(res.status, 400);
  });

  it('C08 — upload PDF válido guarda archivo_url', async () => {
    const req = await reqRecibidoConLibres('sol1');
    const cot = await crearCotizacion({ requerimiento_id: req.id });

    // PDF mínimo válido (cabecera)
    const pdfBuf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const res = await agentFor('compras')
      .post(`/api/cotizaciones/${cot.body.id}/archivo`)
      .attach('archivo', pdfBuf, {
        filename: 'cotizacion-test.pdf',
        contentType: 'application/pdf',
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.archivo_url);
    assert.match(res.body.archivo_url, /\/uploads\/cotizaciones\//);

    const diskPath = path.join(backendRoot, res.body.archivo_url.replace(/^\//, ''));
    assert.ok(fs.existsSync(diskPath), `archivo en disco: ${diskPath}`);

    // limpieza del archivo de test
    try { fs.unlinkSync(diskPath); } catch { /* ignore */ }
  });

  it('eliminar cotización no seleccionada → ok', async () => {
    const req = await reqRecibidoConLibres('sol1');
    const cot = await crearCotizacion({ requerimiento_id: req.id });
    const del = await agentFor('compras').delete(`/api/cotizaciones/${cot.body.id}`);
    assert.equal(del.status, 200);
  });
});
