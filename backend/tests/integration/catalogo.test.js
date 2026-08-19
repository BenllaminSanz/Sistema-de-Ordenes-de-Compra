import { it } from 'node:test';
import assert from 'node:assert/strict';
import { describeIntegration } from '../helpers/integration.js';
import { agentFor } from '../helpers/auth.js';
import { query } from '../helpers/db.js';
import { buildXlsxBuffer, readXlsxRows } from '../helpers/excel.js';

describeIntegration('Catálogo', () => {
  it('K01 — compras puede crear y listar ítem de catálogo', async () => {
    const res = await agentFor('compras').post('/api/catalogo').send({
      tipo: 'PARTES',
      codigo: 'P-TEST-NEW-001',
      descripcion: 'Ítem creado en test',
      unidad: 'pza',
      costo_referencia: 9.5,
      moneda: 'MXN',
      proveedor_id: 1,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.codigo, 'P-TEST-NEW-001');

    const list = await agentFor('compras').get('/api/catalogo?busqueda=P-TEST-NEW-001');
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body));
    assert.ok(list.body.some((i) => i.codigo === 'P-TEST-NEW-001'));
  });

  it('K02 — solicitante no puede crear en catálogo', async () => {
    const res = await agentFor('sol1').post('/api/catalogo').send({
      tipo: 'PARTES',
      codigo: 'P-FORBIDDEN',
      descripcion: 'No debe crearse',
    });
    assert.equal(res.status, 403);
  });

  it('solicitante sí puede consultar catálogo', async () => {
    const res = await agentFor('sol1').get('/api/catalogo');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
  });

  it('rechaza moneda inválida', async () => {
    const res = await agentFor('compras').post('/api/catalogo').send({
      tipo: 'PARTES',
      codigo: 'P-BAD-CUR',
      descripcion: 'Moneda mala',
      moneda: 'BTC',
    });
    assert.equal(res.status, 400);
  });

  it('código duplicado → 409', async () => {
    const res = await agentFor('compras').post('/api/catalogo').send({
      tipo: 'PARTES',
      codigo: 'P-ALPHA-001', // seed
      descripcion: 'Duplicado',
    });
    assert.equal(res.status, 409);
  });

  it('K03 — import Excel hace upsert por código', async () => {
    const rows = [
      ['No de proveedor', 'Proveedor', 'Numero de Parte', 'Descripción', 'UOM', 'Costo unitario', 'Moneda'],
      // Actualiza seed P-ALPHA-001
      ['00001', 'Proveedor Alpha', 'P-ALPHA-001', 'Tornillo M8 actualizado por import', 'pza', '15.75', 'MXN'],
      // Nuevo
      ['00001', 'Proveedor Alpha', 'P-IMPORT-NEW-99', 'Nuevo desde import test', 'pza', '2.5', 'USD'],
      // Omitido: sin descripción
      ['00001', 'Alpha', 'P-OMIT', '', 'pza', '1', 'MXN'],
    ];
    const buf = buildXlsxBuffer(rows, 'Catalogo');

    const res = await agentFor('compras')
      .post('/api/catalogo/import')
      .attach('excel', buf, {
        filename: 'catalogo-import.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.nuevos >= 1);
    assert.ok(res.body.actualizados >= 1);

    const [[updated]] = await query(
      'SELECT descripcion, costo_referencia, moneda FROM catalogo WHERE codigo = ?',
      ['P-ALPHA-001']
    );
    assert.match(updated.descripcion, /actualizado por import/i);
    assert.equal(Number(updated.costo_referencia), 15.75);

    const [[created]] = await query(
      'SELECT id, moneda FROM catalogo WHERE codigo = ?',
      ['P-IMPORT-NEW-99']
    );
    assert.ok(created?.id);
    assert.equal(created.moneda, 'USD');
  });

  it('K04 — export Excel respeta filtro de proveedor', async () => {
    const res = await agentFor('compras')
      .get('/api/catalogo/export?proveedor_id=1')
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'] || '', /spreadsheet|excel|octet/i);

    const rows = readXlsxRows(res.body);
    assert.ok(rows.length >= 2); // header + data
    // Columna 0 = num proveedor; seed Alpha = 00001
    const dataRows = rows.slice(1).filter((r) => r[2]); // con código
    assert.ok(dataRows.length >= 1);
    for (const r of dataRows) {
      // Puede ser string '00001' o number
      const num = String(r[0] || '').padStart(5, '0');
      assert.equal(num, '00001', `fila inesperada: ${JSON.stringify(r)}`);
    }
    // No debe incluir ítems de proveedor Beta (00002)
    const codes = dataRows.map((r) => String(r[2]));
    assert.ok(!codes.includes('P-BETA-001'));
  });

  it('K04b — export por nombre de proveedor (sin id)', async () => {
    const res = await agentFor('compras')
      .get('/api/catalogo/export?proveedor_nombre=Alpha')
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(res.status, 200);
    const rows = readXlsxRows(res.body);
    const dataRows = rows.slice(1).filter((r) => r[2]);
    assert.ok(dataRows.length >= 1);
    const codes = dataRows.map((r) => String(r[2]));
    assert.ok(!codes.includes('P-BETA-001'));
  });

  it('solicitante no puede importar ni exportar', async () => {
    const exp = await agentFor('sol1').get('/api/catalogo/export');
    assert.equal(exp.status, 403);

    const buf = buildXlsxBuffer([['a']]);
    const imp = await agentFor('sol1')
      .post('/api/catalogo/import')
      .attach('excel', buf, {
        filename: 'x.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    assert.equal(imp.status, 403);
  });

  it('desactivar ítem de catálogo', async () => {
    const res = await agentFor('compras')
      .patch('/api/catalogo/1/estado')
      .send({ activo: false });
    assert.equal(res.status, 200);

    const [[row]] = await query('SELECT activo FROM catalogo WHERE id = 1');
    assert.equal(Number(row.activo), 0);
  });
});
