import { it } from 'node:test';
import assert from 'node:assert/strict';
import { describeIntegration } from '../helpers/integration.js';
import { agentFor } from '../helpers/auth.js';
import { buildXlsxBuffer, readXlsxRows } from '../helpers/excel.js';

describeIntegration('Proveedores', () => {
  it('listar proveedores (cualquier autenticado)', async () => {
    const res = await agentFor('sol1').get('/api/proveedores');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.some((p) => p.num_proveedor === '00001' || p.nombre?.includes('Alpha')));
  });

  it('compras crea proveedor válido', async () => {
    const res = await agentFor('compras').post('/api/proveedores').send({
      num_proveedor: '99',
      nombre: 'Proveedor Nuevo Test',
      email: 'nuevo@proveedor.test',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.num_proveedor, '00099'); // pad 5 dígitos
    assert.equal(res.body.email, 'nuevo@proveedor.test');
  });

  it('solicitante no puede crear proveedor', async () => {
    const res = await agentFor('sol1').post('/api/proveedores').send({
      num_proveedor: '12345',
      nombre: 'No debe',
    });
    assert.equal(res.status, 403);
  });

  it('num_proveedor inválido → 400', async () => {
    const res = await agentFor('compras').post('/api/proveedores').send({
      num_proveedor: 'ABC',
      nombre: 'Sin digitos',
    });
    assert.equal(res.status, 400);
  });

  it('K05 — export Excel de proveedores', async () => {
    const res = await agentFor('compras')
      .get('/api/proveedores/export')
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    assert.equal(res.status, 200);
    const rows = readXlsxRows(res.body);
    assert.ok(rows.length >= 2);
    assert.ok(String(rows[0][0]).toLowerCase().includes('proveedor') || rows[0][1]);
    const blob = JSON.stringify(rows).toLowerCase();
    assert.ok(blob.includes('alpha') || blob.includes('00001'));
  });

  it('solicitante no exporta proveedores', async () => {
    const res = await agentFor('sol1').get('/api/proveedores/export');
    assert.equal(res.status, 403);
  });

  it('import Excel de proveedores (smoke)', async () => {
    const rows = [
      ['No. Proveedor', 'Nombre', 'Email', 'Teléfono', 'RFC', 'Notas', 'Activo'],
      ['88', 'Importado Excel SA', 'importado@prov.test', '555', 'XAXX010101000', '', 'Sí'],
    ];
    const buf = buildXlsxBuffer(rows, 'Proveedores');

    const res = await agentFor('compras')
      .post('/api/proveedores/import')
      .attach('excel', buf, {
        filename: 'proveedores.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    // Aceptar 200 con resumen o 201-style success
    assert.ok([200, 201].includes(res.status), JSON.stringify(res.body));

    const list = await agentFor('compras').get('/api/proveedores');
    assert.ok(
      list.body.some((p) =>
        String(p.num_proveedor || '').includes('88')
        || (p.nombre || '').includes('Importado Excel')
      ),
      JSON.stringify(list.body)
    );
  });

  it('obtener proveedor por id', async () => {
    const res = await agentFor('compras').get('/api/proveedores/1');
    assert.equal(res.status, 200);
    assert.ok(res.body.nombre);
  });

  it('404 proveedor inexistente', async () => {
    const res = await agentFor('compras').get('/api/proveedores/999999');
    assert.equal(res.status, 404);
  });
});
