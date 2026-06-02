/**
 * seed-from-miselanea.js
 *
 * Seed script to populate clean DB using data from Excel files in miselanea/ folder.
 * Based on user's instructions:
 * - Only 1 user per role (admin, contabilidad, solicitante)
 * - Use PO data where items distinguished by / at end of code / Line nr (decenas)
 * - Reference the expedientes (POs, status, items, providers, comments with REQ.)
 *
 * Usage:
 *   node backend/scripts/seed-from-miselanea.js
 *
 * Assumes:
 * - DB schema is created (run database/schema.sql)
 * - No previous data (clean DB)
 */

import { hash } from 'bcryptjs';
import pool from '../src/config/db.js';
import '../src/config/env.js';
import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEMO_PASSWORD = 'Demo2025!';
let DEMO_PASSWORD_HASH;

const MISELANEA_DIR = path.join(__dirname, '../../miselanea');

async function loadExcel(fileName, sheetName = null) {
  const filePath = path.join(MISELANEA_DIR, fileName);
  const wb = xlsx.readFile(filePath);
  const sheet = sheetName ? wb.Sheets[sheetName] : wb.Sheets[wb.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet);
}

async function main() {
  console.log('🚀 Iniciando seed desde miselanea/ (DB limpia)...\n');

  DEMO_PASSWORD_HASH = await hash(DEMO_PASSWORD, 12);

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    // ============================================
    // 1. USUARIOS - solo uno de cada rol (limpiamos primero por si acaso)
    // ============================================
    console.log('👥 Creando 3 usuarios (uno por rol)...');

    await conn.query(`DELETE FROM usuarios WHERE email IN ('admin@oc-empresa.com', 'contabilidad@oc-empresa.com', 'solicitante@oc-empresa.com')`);

    await conn.query(`
      INSERT INTO usuarios (nombre, email, password_hash, rol, email_verificado, activo) VALUES
      ('Administrador Principal', 'admin@oc-empresa.com', ?, 'admin', 1, 1),
      ('Contabilidad Responsable', 'contabilidad@oc-empresa.com', ?, 'contabilidad', 1, 1),
      ('Solicitante Ejemplo', 'solicitante@oc-empresa.com', ?, 'solicitante', 1, 1)
    `, [DEMO_PASSWORD_HASH, DEMO_PASSWORD_HASH, DEMO_PASSWORD_HASH]);

    const [usuarios] = await conn.query(`SELECT id, email, rol FROM usuarios ORDER BY id`);
    const admin = usuarios.find(u => u.rol === 'admin');
    const contabilidad = usuarios.find(u => u.rol === 'contabilidad');
    const solicitante = usuarios.find(u => u.rol === 'solicitante');

    console.log(`   ✓ Admin: ${admin.email}`);
    console.log(`   ✓ Contabilidad: ${contabilidad.email}`);
    console.log(`   ✓ Solicitante: ${solicitante.email}`);

    // ============================================
    // 2. PROVEEDORES - desde Excel STATUS POS HILOS + PO inquiry
    // ============================================
    console.log('\n🏭 Creando proveedores desde Excel...');

    const statusData = await loadExcel('STATUS 2025 POS HILOS muestra-1.xlsx', 'POS HILOS');
    const uniqueProvs = new Map();

    statusData.forEach(row => {
      if (row.Proveedor && row.Proveedor.trim()) {
        const nombre = row.Proveedor.trim();
        if (!uniqueProvs.has(nombre)) {
          uniqueProvs.set(nombre, {
            nombre,
            email: `${nombre.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')}@proveedor.com`.substring(0, 180),
            telefono: null,
            rfc: null,
            direccion: null,
            activo: 1
          });
        }
      }
    });

    // Add a few from the PO Line file comments/providers if needed
    const poLineData = await loadExcel('com_dat_now_usa_USAPurchaseOrderLineInquirySession.xml - 2025-12-23T141056.414.xlsx', 'Purchase order lines Inquiry');
    // Hardcode a couple more realistic ones from data analysis
    const extraProvs = [
      { nombre: 'RIETER AMERICA LLC', email: 'ventas@rieter.com', rfc: 'RIE123456ABC' },
      { nombre: 'AMERICAN TRUETZSCHLER INC.', email: 'ventas@truetzschler.com', rfc: 'TRU987654XYZ' },
    ];
    extraProvs.forEach(p => {
      if (!uniqueProvs.has(p.nombre)) uniqueProvs.set(p.nombre, { ...p, telefono: null, direccion: null, activo: 1 });
    });

    const provValues = Array.from(uniqueProvs.values()).slice(0, 8); // limit to 8 for demo

    if (provValues.length > 0) {
      const placeholders = provValues.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
      const params = provValues.flatMap(p => [p.nombre, p.email, p.telefono, p.rfc, p.direccion, p.activo]);
      await conn.query(`INSERT INTO proveedores (nombre, email, telefono, rfc, direccion, activo) VALUES ${placeholders}`, params);
    }

    const [proveedores] = await conn.query(`SELECT id, nombre FROM proveedores ORDER BY id`);
    console.log(`   ✓ ${proveedores.length} proveedores creados`);

    // Map for later use (by name)
    const provMap = {};
    proveedores.forEach(p => { provMap[p.nombre] = p.id; });

    // ============================================
    // 3. CATALOGO - desde los items en los Excels (usando / y Line)
    // ============================================
    console.log('\n📦 Creando catálogo desde items de PO / Excel...');

    const catalogoItems = new Map();

    // From STATUS POS HILOS
    statusData.forEach(row => {
      const parte = row['Numero de Parte'] ? String(row['Numero de Parte']).trim() : null;
      const desc = row.DESCRIPCION ? String(row.DESCRIPCION).trim() : null;
      if (parte && desc && !catalogoItems.has(parte)) {
        let tipo = 'PARTES';
        const d = desc.toUpperCase();
        if (d.includes('SERVICE') || d.includes('REPAIR') || d.includes('MANT') || d.includes('INSTALACION')) tipo = 'SERVICIOS';
        if (d.includes('FLETE') || d.includes('FREIGHT') || d.includes('ENVIO')) tipo = 'FLETES';
        catalogoItems.set(parte, {
          tipo,
          codigo: parte,
          descripcion: desc,
          costo_referencia: parseFloat(row['Costo unitario']) || 1000,
          proveedor_id: row.Proveedor ? provMap[row.Proveedor] || null : null,
          activo: row.STATUS && row.STATUS.includes('CANCELADO') ? 0 : 1
        });
      }
    });

    // From PO Line Inquiry - use Full Item Code as codigo, comments have the Line info
    poLineData.forEach(row => {
      const fullItem = row['Full Item Code'] ? String(row['Full Item Code']).trim() : null;
      const itemDesc = row['Item description'] ? String(row['Item description']).trim() : null;
      const comment = row.Comments ? String(row.Comments) : '';
      if (fullItem && itemDesc && !catalogoItems.has(fullItem)) {
        let tipo = 'PARTES';
        const d = (itemDesc + ' ' + fullItem).toUpperCase();
        if (d.includes('SERVICE') || d.includes('REPAIR') || d.includes('LABOR')) tipo = 'SERVICIOS';
        if (d.includes('FLETE') || d.includes('FREIGHT')) tipo = 'FLETES';

        // Use the comment to link, but for catalogo use the code
        catalogoItems.set(fullItem, {
          tipo,
          codigo: fullItem,
          descripcion: itemDesc,
          costo_referencia: parseFloat(row.Price) || 2500,
          proveedor_id: null, // not directly in this file
          activo: 1
        });
      }
    });

    const catValues = Array.from(catalogoItems.values()).slice(0, 12); // limit
    if (catValues.length > 0) {
      const placeholders = catValues.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
      const params = catValues.flatMap(c => [c.tipo, c.codigo, c.descripcion, c.costo_referencia, c.proveedor_id, c.activo]);
      await conn.query(`
        INSERT INTO catalogo (tipo, codigo, descripcion, costo_referencia, proveedor_id, activo)
        VALUES ${placeholders}
      `, params);
    }

    const [catalogo] = await conn.query(`SELECT id, codigo, tipo FROM catalogo ORDER BY id`);
    console.log(`   ✓ ${catalogo.length} items de catálogo creados (usando códigos con / y Line decenas como referencia)`);

    const catMap = {};
    catalogo.forEach(c => { catMap[c.codigo] = c.id; });

    // ============================================
    // 4. REQUERIMIENTOS + ITEMS (usando REQ. de los comments + Line decenas)
    // ============================================
    console.log('\n📋 Creando requerimientos + items del catálogo...');

    // Datos de ejemplo basados en PO 0310005905 + líneas del Excel STATUS

    const reqsToCreate = [
      {
        consecutivo: 'REQ-2025S-1626',
        solicitante_id: solicitante.id,
        titulo_solicitud: 'Reparación de ventilador de reclaim / GBRA - REQ. 2025S-1626',
        area: 'PRODUCCION',
        departamento: 'MTTO',
        tipo: 'SERVICIOS',
        notas: 'CAMBIO DE CODO DE 10" GALVANIZADO DE SALIDA DE VENTILADOR DE GBRA + materiales + instalación. Ver líneas 10,20,30,40 del PO 0310005905. (53020)',
        requiere_cotizacion: 1,
        estado: 'aprobado',
        datatextnow_id: '0310005905',
        items: [
          // Simulating lines 10,20,30,40 as items from catalogo
          // We pick some from the inserted catalogo (using codes we know exist from data)
          { codigo: 'SERVICE -REPAIR -LABOR -- -FAN', cantidad: 1 }, // line 20
          { codigo: 'SERVICE -REPAIR -LABOR -- -FAN', cantidad: 1 }, // line 30
          { codigo: 'SERVICE -REPAIR -MATERIALS -- -FAN', cantidad: 1 }, // line 40
        ]
      },
      {
        consecutivo: 'REQ-2024P-274',
        solicitante_id: solicitante.id,
        titulo_solicitud: 'Materiales y servicio para spray gun y componentes - REQ. 2024S-274',
        area: 'PRODUCCION',
        departamento: 'MTTO',
        tipo: 'PARTES',
        notas: 'COMPONENT -SPRAY_GUN + gastos de envio. PO Line 310000695/10 y /20. (4420)',
        requiere_cotizacion: 0,
        estado: 'en_revision',
        datatextnow_id: '310000695',
        items: [
          { codigo: '5UEM3', cantidad: 1 },
          { codigo: 'GASTOS DE ENVIO', cantidad: 1 },
        ]
      }
    ];

    const reqIds = [];
    for (const r of reqsToCreate) {
      const [result] = await conn.query(`
        INSERT INTO requerimientos (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, datatextnow_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        r.consecutivo || `REQ-${new Date().getFullYear()}${(r.tipo||'X').charAt(0).toUpperCase()}-001`,
        r.solicitante_id,
        r.titulo_solicitud,
        r.area,
        r.departamento,
        r.tipo,
        r.notas,
        r.requiere_cotizacion,
        r.estado,
        r.datatextnow_id
      ]);

      const reqId = result.insertId;
      reqIds.push(reqId);

      // Insert items
      for (const it of r.items) {
        const catId = catMap[it.codigo];
        if (catId) {
          await conn.query(`
            INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad) VALUES (?, ?, ?)
          `, [reqId, catId, it.cantidad]);
        }
      }

      // Historial
      await conn.query(`
        INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
        VALUES ('requerimiento', ?, NULL, ?, ?, ?)
      `, [reqId, r.estado, solicitante.id, 'Creado desde datos de miselanea']);
    }
    console.log(`   ✓ ${reqIds.length} requerimientos + sus items del catálogo creados`);

    // ============================================
    // 5. ORDENES DE COMPRA (usando los POs del Excel, Line como referencia)
    // ============================================
    console.log('\n🛒 Creando órdenes de compra (usando PO numbers y Line decenas como referencia)...');

    const ordenesData = [
      {
        numero_oc: 'OC-0310005905',
        requerimiento_id: reqIds[0],
        cotizacion_id: null,
        autorizado_por: contabilidad.id,
        estado: 'generada',
        datatextnow_id: '0310005905',
        fecha_autorizacion: new Date('2025-12-23'),
        // Las 4 líneas del PO se representan vía los items del requerimiento
      },
      {
        numero_oc: 'OC-310000695',
        requerimiento_id: reqIds[1],
        cotizacion_id: null,
        autorizado_por: contabilidad.id,
        estado: 'en_proceso',
        datatextnow_id: '310000695',
        fecha_autorizacion: new Date('2024-12-15'),
      }
    ];

    for (const o of ordenesData) {
      await conn.query(`
        INSERT INTO ordenes_compra (numero_oc, requerimiento_id, cotizacion_id, autorizado_por, estado, datatextnow_id, fecha_autorizacion, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [o.numero_oc, o.requerimiento_id, o.cotizacion_id, o.autorizado_por, o.estado, o.datatextnow_id, o.fecha_autorizacion, null]);
    }
    console.log(`   ✓ ${ordenesData.length} órdenes de compra creadas (con referencias a Lines decenas en los requerimientos)`);

    // ============================================
    // 6. RECEPCIONES (usando datos de STATUS)
    // ============================================
    console.log('\n📦 Creando recepciones de ejemplo...');

    // Simple ones linked to the OCs
    const [ocs] = await conn.query(`SELECT id, numero_oc, datatextnow_id FROM ordenes_compra ORDER BY id`);

    if (ocs.length > 0) {
      await conn.query(`
        INSERT INTO recepciones (orden_compra_id, recibido_por, estado, notas, datatextnow_id, fecha_recepcion)
        VALUES (?, ?, 'recibido_parcial', 'Recepción parcial desde datos Excel miselanea (Line 10 recibida)', ?, NOW())
      `, [ocs[0].id, contabilidad.id, ocs[0].datatextnow_id + '-REC']);

      if (ocs.length > 1) {
        await conn.query(`
          INSERT INTO recepciones (orden_compra_id, recibido_por, estado, notas, datatextnow_id, fecha_recepcion, fecha_entrega)
          VALUES (?, ?, 'recibido_completo', 'Recepción completa - Flete y componentes Line 10/20', ?, NOW(), NOW())
        `, [ocs[1].id, contabilidad.id, ocs[1].datatextnow_id + '-REC']);
      }
    }
    console.log('   ✓ Recepciones de ejemplo creadas');

    await conn.commit();
    console.log('\n🎉 Seed completado exitosamente desde datos de miselanea/.');
    console.log('\nUsuarios de prueba (contraseña común: Demo2025!):');
    console.log(`  - Admin:        admin@oc-empresa.com`);
    console.log(`  - Contabilidad: contabilidad@oc-empresa.com`);
    console.log(`  - Solicitante:  solicitante@oc-empresa.com`);
    console.log('\nDatos poblados con referencias a POs (ej. 0310005905, 310000695), Lines (10,20,30...), REQ. codes y / en códigos de items.');

  } catch (err) {
    await conn.rollback();
    console.error('❌ Error en seed:', err);
    throw err;
  } finally {
    conn.release();
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Error fatal en seed:', err);
  process.exit(1);
});