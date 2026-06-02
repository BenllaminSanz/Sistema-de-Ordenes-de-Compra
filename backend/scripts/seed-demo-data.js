/**
 * seed-demo-data.js
 * 
 * Script para poblar la base de datos con datos ficticios de demostración.
 * Incluye:
 *  - Usuarios (admin, contabilidad, solicitantes)
 *  - Proveedores
 *  - Catálogo con PARTES / SERVICIOS / FLETES + items ficticios
 *  - Requerimientos en todos los estados (muchos con items del catálogo y el nuevo formato REQ-YYYYT-NNN)
 *  - Cotizaciones (algunas seleccionadas)
 *  - Órdenes de Compra en varios estados (ligadas a cotizaciones cuando aplica)
 *  - Recepciones
 *  - Historial completo
 * 
 * Uso (después de schema.sql y seed-admin.js):
 *   node backend/scripts/seed-demo-data.js
 * 
 * Credenciales demo: Demo2025!
 */

import { hash } from 'bcryptjs';
import pool from '../src/config/db.js';
import '../src/config/env.js';

const DEMO_PASSWORD = 'Demo2025!';
const DEMO_PASSWORD_HASH = await hash(DEMO_PASSWORD, 12);

async function main() {
  console.log('🚀 Iniciando carga de datos de demostración...\n');

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    // ============================================
    // 1. USUARIOS
    // ============================================
    console.log('👥 Creando usuarios...');

    // Admin ya debería existir, pero por si acaso
    await conn.query(`
      INSERT INTO usuarios (nombre, email, password_hash, rol, email_verificado, activo)
      VALUES 
        ('Carlos Ramírez', 'admin@empresa.com', ?, 'admin', 1, 1),
        ('María González', 'contabilidad@empresa.com', ?, 'contabilidad', 1, 1)
      ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
    `, [DEMO_PASSWORD_HASH, DEMO_PASSWORD_HASH]);

    const [userRows] = await conn.query(`
      INSERT INTO usuarios (nombre, email, password_hash, rol, email_verificado, activo) VALUES
      ('Juan Pérez', 'juan.perez@empresa.com', ?, 'solicitante', 1, 1),
      ('Laura Martínez', 'laura.martinez@empresa.com', ?, 'solicitante', 1, 1),
      ('Roberto Sánchez', 'roberto.sanchez@empresa.com', ?, 'solicitante', 1, 1),
      ('Ana Torres', 'ana.torres@empresa.com', ?, 'solicitante', 1, 1),
      ('Miguel Ángel López', 'miguel.lopez@empresa.com', ?, 'solicitante', 1, 1)
    `, [DEMO_PASSWORD_HASH, DEMO_PASSWORD_HASH, DEMO_PASSWORD_HASH, DEMO_PASSWORD_HASH, DEMO_PASSWORD_HASH]);

    console.log('   ✓ Usuarios creados (Admin, Contabilidad + 5 Solicitantes)');

    // Obtener IDs de usuarios
    const [usuarios] = await conn.query(`SELECT id, email, rol FROM usuarios ORDER BY id`);
    const adminId = usuarios.find(u => u.rol === 'admin')?.id || 1;
    const contabilidadId = usuarios.find(u => u.rol === 'contabilidad')?.id || 2;
    const solicitanteIds = usuarios.filter(u => u.rol === 'solicitante').map(u => u.id);

    // ============================================
    // 2. PROVEEDORES
    // ============================================
    console.log('🏭 Creando proveedores...');

    await conn.query(`
      INSERT INTO proveedores (nombre, email, telefono, rfc, direccion, activo) VALUES
      ('RIETER AMERICA LLC', 'compras@rieter.com', '555-123-4567', 'RIE123456ABC', 'Av. Industrial 2450, Monterrey, NL', 1),
      ('AMERICAN TRUETZSCHLER INC.', 'ventas@truetzschler.com', '555-234-5678', 'TRU987654XYZ', 'Carr. México-Querétaro Km 32, Querétaro', 1),
      ('AMERICAN SUESSEN CORP', 'cotizaciones@suessen.com', '555-345-6789', 'SUE456789DEF', 'Blvd. Aeropuerto 890, Guadalajara, Jal', 1),
      ('COMERCIALIZADORA DE ESTOPAS E HILADOS DE MICHOACAN', 'ventas@estopasmich.com', '443-123-4567', 'CEH010203GH1', 'Calle Hilados 120, Morelia, Michoacán', 1),
      ('PITS MONTACARGAS SA DE CV', 'cotiz@pitsmontacargas.com.mx', '477-555-1212', 'PIT020304IJ5', 'Parque Industrial 45, León, Gto', 1),
      ('GRAINGER SA DE CV', 'mexico@grainger.com', '55-8000-1234', 'GRA030405KL9', 'Av. Insurgentes 2340, CDMX', 1),
      ('ALLENBERG COTTON CO', 'sales@allenberg.com', '555-901-2345', 'ALL040506MN3', 'Oficina de Importación, Laredo, TX', 1),
      ('YAZBEK TEXTIL', 'compras@yazbek.com.mx', '55-1234-5678', 'YAZ050607OP7', 'Calzada de los Textileros 78, Puebla', 1),
      ('MANTENIMIENTO INDUSTRIAL DEL NORTE', 'servicio@minorte.com', '81-9876-5432', 'MIN060708QR1', 'Carretera a Colombia 550, Escobedo, NL', 1),
      ('REFACCIONES Y MAQUINADOS PRECISOS', 'ventas@rmp.com.mx', '33-4455-6677', 'RMP070809ST5', 'Calle Precisión 33, Zapopan, Jal', 1)
    `);

    const [proveedores] = await conn.query(`SELECT id, nombre FROM proveedores ORDER BY id`);
    console.log(`   ✓ ${proveedores.length} proveedores creados`);

    // ============================================
    // 3. CATÁLOGO (ítems ficticios para probar integración con requerimientos)
    // ============================================
    console.log('📦 Creando catálogo de partes, servicios y fletes...');

    await conn.query(`
      INSERT INTO catalogo (tipo, codigo, descripcion, costo_referencia, proveedor_id, activo) VALUES
      -- PARTES
      ('PARTES', 'COT-DRAW-38/160', 'COMPONENT -COT -DRAW -38/160 -CPL -75SH -BLACK', 245.50, 1, 1),
      ('PARTES', '5UEM3', 'BLOWER BACKPACK BR600 - REPUESTOS', 1250.00, 5, 1),
      ('PARTES', 'SERVICE-REPAIR-LABOR', 'Servicio técnico especializado para ventiladores', 3200.00, 8, 1),
      ('PARTES', 'DUCTO-10X90', 'Ducto galvanizado 10" x 90cm + adaptador y codo', 890.75, 3, 1),
      ('PARTES', 'STARLET-C1MM', 'Starlet Plus C1MM UDR No.13 / No.14 + Travelers', 1875.00, 2, 1),
      -- SERVICIOS
      ('SERVICIOS', 'REP-VENT-GBRA', 'Reparación completa de ventilador de reclaim / GBRA', 13500.00, 0, 1),
      ('SERVICIOS', 'MANT-LONA-OE', 'Mantenimiento y reparación de lona divisoria área OE y RS', 7500.00, 8, 1),
      ('SERVICIOS', 'CAL-PURG-LOEPFE', 'Calibración y ajuste de purgadores LOEPFE', 5700.00, 2, 1),
      ('SERVICIOS', 'FLETES-LOCAL', 'Flete local de materiales y refacciones (varios viajes)', 3200.00, 6, 1),
      -- FLETES
      ('FLETES', 'FLETE-MTY-GDL', 'Flete Monterrey - Guadalajara (carga mixta)', 18500.00, 0, 1),
      ('FLETES', 'FLETE-INTL-LRD', 'Importación Laredo - Monterrey (contenedor 40ft)', 45200.00, 6, 1)
    `);

    const [catalogoItems] = await conn.query(`SELECT id, codigo, tipo FROM catalogo ORDER BY id`);
    console.log(`   ✓ ${catalogoItems.length} ítems de catálogo creados`);

    // ============================================
    // 4. REQUERIMIENTOS (con variedad de estados + items de catálogo)
    // ============================================
    console.log('📋 Creando requerimientos con items de catálogo...');

    const requerimientosData = [
      // Aprobados con cotización (SERVICIOS) + items de catálogo
      { 
        solicitante: solicitanteIds[0], 
        titulo: 'Servicio de reparación de ventilador de reclaim', 
        area: 'PRODUCCION', depto: 'MTTO', tipo: 'SERVICIOS', 
        descripcion: 'Cambio de codo de 10" galvanizado de salida de ventilador de GBRA + materiales', 
        requiere_cot: 1, estado: 'aprobado', datatext: '0310005905', notas: null,
        items: [ { catIndex: 5, cantidad: 1 } ]
      },
      { 
        solicitante: solicitanteIds[1], 
        titulo: 'Mantenimiento a lona divisoria área OE y RS', 
        area: 'PRODUCCION', depto: 'MTTO', tipo: 'SERVICIOS', 
        descripcion: 'Servicio de mantenimiento y reparación de lona divisoria', 
        requiere_cot: 1, estado: 'aprobado', datatext: '0310005896', notas: null,
        items: [ { catIndex: 6, cantidad: 1 } ]
      },
      { 
        solicitante: solicitanteIds[2], 
        titulo: 'Calibración de purgadores LOEPFE', 
        area: 'PRODUCCION', depto: 'MTTO', tipo: 'SERVICIOS', 
        descripcion: 'Ajuste y calibración de purgadores LOEPFE', 
        requiere_cot: 1, estado: 'aprobado', datatext: '0310005897', notas: null,
        items: [ { catIndex: 7, cantidad: 2 } ]
      },
      
      // Aprobados PARTES (con items)
      { 
        solicitante: solicitanteIds[0], 
        titulo: 'Componentes para Draw Frame - COT DRAW 38/160', 
        area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', 
        descripcion: 'COMPONENT -COT -DRAW -38/160 -CPL -75SH -BLACK', 
        requiere_cot: 0, estado: 'aprobado', datatext: '0310005788', notas: null,
        items: [ { catIndex: 0, cantidad: 4 } ]
      },
      { 
        solicitante: solicitanteIds[3], 
        titulo: 'Blower Backpack BR600 y refacciones', 
        area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', 
        descripcion: 'Blower Backpack BR600 + repuestos varios para área de limpieza', 
        requiere_cot: 1, estado: 'aprobado', datatext: '0310005895', notas: null,
        items: [ { catIndex: 1, cantidad: 1 }, { catIndex: 2, cantidad: 3 } ]
      },
      
      // En revisión (con items de catálogo)
      { 
        solicitante: solicitanteIds[1], 
        titulo: 'Materiales para reparación de ventilador de GBRA', 
        area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', 
        descripcion: 'Ducto de 10"x90cm + adaptador y codo galvanizado', 
        requiere_cot: 1, estado: 'en_revision', datatext: null, notas: null,
        items: [ { catIndex: 3, cantidad: 2 } ]
      },
      { 
        solicitante: solicitanteIds[4], 
        titulo: 'Refacciones para máquina de hilatura', 
        area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', 
        descripcion: 'Starlet Plus C1MM UDR No.13 y No.14 + Travelers', 
        requiere_cot: 1, estado: 'en_revision', datatext: null, notas: null,
        items: [ { catIndex: 4, cantidad: 8 } ]
      },
      
      // Borrador (para probar edición y flujo de solicitante)
      { 
        solicitante: solicitanteIds[2], 
        titulo: 'Flete de refacciones urgentes desde Laredo', 
        area: 'ADMINISTRACION', depto: 'ALMACEN', tipo: 'FLETES', 
        descripcion: 'Flete internacional de componentes críticos para línea de producción', 
        requiere_cot: 0, estado: 'borrador', datatext: null, notas: null,
        items: [ { catIndex: 10, cantidad: 1 } ]
      },
      
      // Rechazado
      { 
        solicitante: solicitanteIds[3], 
        titulo: 'Compra de montacargas eléctrico', 
        area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', 
        descripcion: 'Montacargas 3 toneladas con batería de litio', 
        requiere_cot: 1, estado: 'rechazado', datatext: null, notas: 'Presupuesto fuera de rango para el ejercicio actual' 
      },
      
      // Incompleto
      { 
        solicitante: solicitanteIds[0], 
        titulo: 'Refacciones varias para mantenimiento preventivo', 
        area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', 
        descripcion: 'Rodamientos, sellos y lubricantes para equipo de hilatura', 
        requiere_cot: 1, estado: 'incompleto', datatext: null, notas: 'Falta especificar cantidades exactas y proveedor preferido' 
      },
      
      // Más variedad
      { solicitante: solicitanteIds[2], titulo: 'Servicio de maquinado de partes especiales', area: 'PRODUCCION', depto: 'MTTO', tipo: 'SERVICIOS', descripcion: 'Soporte para rieles del blower', requiere_cot: 1, estado: 'incompleto', datatext: null, notas: 'Falta especificar medidas exactas.' },
      { solicitante: solicitanteIds[0], titulo: 'Compra de repuestos para bomba hidráulica', area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', descripcion: 'Kit de sellos y rodamientos para bomba principal', requiere_cot: 0, estado: 'borrador', datatext: null, notas: null },
      { solicitante: solicitanteIds[3], titulo: 'Flete de retorno de plástico', area: 'ADMINISTRACION', depto: 'ALMACEN', tipo: 'FLETES', descripcion: 'Flete de retorno de material plástico', requiere_cot: 0, estado: 'borrador', datatext: null, notas: null },
      { solicitante: solicitanteIds[1], titulo: 'Cilindros neumáticos para Drawframes', area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', descripcion: 'Cilindro neumático para Drawframes', requiere_cot: 0, estado: 'cerrado', datatext: '0310005630', notas: null },
      { solicitante: solicitanteIds[4], titulo: 'Componentes varios para mantenimiento', area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', descripcion: 'Rodamientos, bujes y conectores', requiere_cot: 1, estado: 'cerrado', datatext: '0310005698', notas: null }
    ];
      
      // Incompleto (para demostrar flujo de corrección)
      { solicitante: solicitanteIds[2], titulo: 'Servicio de maquinado de partes especiales', area: 'PRODUCCION', depto: 'MTTO', tipo: 'SERVICIOS', descripcion: 'Soporte para rieles del blower - medidas incompletas', requiere_cot: 1, estado: 'incompleto', datatext: null, notas: 'Falta especificar medidas exactas y material requerido. Por favor completar información.' },
      
      // Borradores de solicitantes
      { solicitante: solicitanteIds[0], titulo: 'Compra de repuestos para bomba hidráulica', area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', descripcion: 'Kit de sellos y rodamientos para bomba principal', requiere_cot: 0, estado: 'borrador', datatext: null, notas: null },
      { solicitante: solicitanteIds[3], titulo: 'Flete de retorno de plástico', area: 'ADMINISTRACION', depto: 'ALMACEN', tipo: 'FLETES', descripcion: 'Flete de retorno de material plástico desde Yazbek a Hilos', requiere_cot: 0, estado: 'borrador', datatext: null, notas: null },
      
      // Cerrados (ya completados)
      { solicitante: solicitanteIds[1], titulo: 'Cilindros neumáticos para Drawframes', area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', descripcion: 'Cilindro neumático 30.5x63 X183 para Drawframes Truetzschler', requiere_cot: 0, estado: 'cerrado', datatext: '0310005630', notas: null },
      { solicitante: solicitanteIds[4], titulo: 'Componentes varios para mantenimiento preventivo', area: 'PRODUCCION', depto: 'MTTO', tipo: 'PARTES', descripcion: 'Rodamientos, bujes, anillos y conectores varios', requiere_cot: 1, estado: 'cerrado', datatext: '0310005698', notas: null },
    ];

    const reqIds = [];
    for (const req of requerimientosData) {
      const [result] = await conn.query(`
        INSERT INTO requerimientos 
          (consecutivo, solicitante_id, titulo_solicitud, area, departamento, tipo, notas, requiere_cotizacion, estado, notas_rechazo, datatextnow_id, created_at)
        VALUES 
          (CONCAT('REQ-2025', LEFT(?,1), '-', LPAD(FLOOR(RAND()*900)+1, 3, '0')), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL FLOOR(RAND()*90) DAY))
      `, [
        req.tipo, req.solicitante, req.titulo, req.area, req.depto, req.tipo, (req.descripcion || req.notas || ''), 
        req.requiere_cot, req.estado, req.notas, req.datatext
      ]);
      const reqId = result.insertId;
      reqIds.push(reqId);

      // Insertar items del catálogo (para probar la nueva integración)
      if (Array.isArray(req.items) && req.items.length > 0) {
        for (const it of req.items) {
          const cat = catalogoItems[it.catIndex];
          if (cat) {
            await conn.query(`
              INSERT INTO requerimiento_items (requerimiento_id, catalogo_id, cantidad)
              VALUES (?, ?, ?)
            `, [reqId, cat.id, it.cantidad || 1]);
          }
        }
      }
    }

    console.log(`   ✓ ${reqIds.length} requerimientos creados con diferentes estados (muchos con ítems de catálogo)`);

    // ============================================
    // 4. HISTORIAL DE ESTADOS (para realismo)
    // ============================================
    console.log('📜 Generando historial de estados...');

    // Insertamos historial manual para los requerimientos
    for (let i = 0; i < reqIds.length; i++) {
      const reqId = reqIds[i];
      const req = requerimientosData[i];
      
      // Estado inicial
      await conn.query(`
        INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
        VALUES ('requerimiento', ?, NULL, 'borrador', ?, 'Requerimiento creado como borrador', DATE_SUB(NOW(), INTERVAL FLOOR(RAND()*80) DAY))
      `, [reqId, req.solicitante]);

      if (req.estado !== 'borrador') {
        await conn.query(`
          INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
          VALUES ('requerimiento', ?, 'borrador', 'en_revision', ?, 'Enviado a revisión por solicitante', DATE_SUB(NOW(), INTERVAL FLOOR(RAND()*60) DAY))
        `, [reqId, req.solicitante]);
      }

      if (['aprobado', 'incompleto', 'rechazado', 'cerrado'].includes(req.estado)) {
        const nota = req.estado === 'incompleto' ? req.notas : 'Aprobado para cotización / compra';
        await conn.query(`
          INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
          VALUES ('requerimiento', ?, 'en_revision', ?, ?, ?, DATE_SUB(NOW(), INTERVAL FLOOR(RAND()*30) DAY))
        `, [reqId, req.estado, contabilidadId, nota]);
      }
    }

    // ============================================
    // 5. COTIZACIONES (para requerimientos que las necesitan)
    // ============================================
    console.log('💰 Creando cotizaciones...');

    // Cotizaciones para algunos requerimientos
    const cotizacionesToCreate = [
      { reqIndex: 0, provIndex: 0, monto: 13500, seleccionada: 1 },   // RIETER - aprobada
      { reqIndex: 1, provIndex: 8, monto: 7500, seleccionada: 1 },    // Mantenimiento Industrial
      { reqIndex: 2, provIndex: 2, monto: 5700, seleccionada: 1 },    // Suessen
      { reqIndex: 4, provIndex: 5, monto: 15199, seleccionada: 1 },   // Grainger
      { reqIndex: 5, provIndex: 0, monto: 18200, seleccionada: 0 },   // En revisión
      { reqIndex: 6, provIndex: 3, monto: 24500, seleccionada: 0 },   // En revisión
    ];

    const selectedCotByReq = {};
    for (const c of cotizacionesToCreate) {
      const reqId = reqIds[c.reqIndex];
      const provId = proveedores[c.provIndex].id;

      const [cotResult] = await conn.query(`
        INSERT INTO cotizaciones 
          (requerimiento_id, proveedor_id, monto_total, monto_subtotal, iva, moneda, estado, seleccionada, fecha_seleccion, notas)
        VALUES (?, ?, ?, ?, ?, 'MXN', ?, ?, ?, 'Cotización recibida por correo')
      `, [
        reqId, provId, c.monto, Math.round(c.monto * 0.84), Math.round(c.monto * 0.16),
        c.seleccionada ? 'seleccionada' : 'recibida',
        c.seleccionada ? 1 : 0,
        c.seleccionada ? '2025-05-10' : null
      ]);

      const cotId = cotResult.insertId;

      // Items de ejemplo
      await conn.query(`
        INSERT INTO cotizacion_items (cotizacion_id, descripcion, cantidad, unidad, precio_unitario) VALUES
        (?, 'Servicio técnico especializado + materiales', 1, 'Servicio', ?)
      `, [cotId, Math.round(c.monto * 0.7)]);

      if (c.seleccionada) {
        selectedCotByReq[reqId] = cotId;
        // Marcar como seleccionada y crear historial
        await conn.query(`
          INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas)
          VALUES ('cotizacion', ?, NULL, 'seleccionada', ?, 'Cotización seleccionada por Contabilidad')
        `, [cotId, contabilidadId]);
      }
    }

    console.log('   ✓ Cotizaciones y partidas creadas');

    // ============================================
    // 6. ÓRDENES DE COMPRA
    // ============================================
    console.log('📦 Creando Órdenes de Compra...');

    const ocData = [
      { reqIndex: 0, estado: 'cerrada', datatext: '0310005905' },
      { reqIndex: 1, estado: 'cerrada', datatext: '0310005896' },
      { reqIndex: 3, estado: 'recibida', datatext: '0310005788' },
      { reqIndex: 4, estado: 'en_proceso', datatext: '0310005895' },
      { reqIndex: 2, estado: 'distribuida', datatext: '0310005897' },
      { reqIndex: 5, estado: 'generada', datatext: null },
      { reqIndex: 10, estado: 'cerrada', datatext: '0310005630' },
      { reqIndex: 11, estado: 'cerrada', datatext: '0310005698' },
      { reqIndex: 6, estado: 'generada', datatext: null },   // borrador req
      { reqIndex: 8, estado: 'en_proceso', datatext: null },
    ];

    for (let i = 0; i < ocData.length; i++) {
      const d = ocData[i];
      const reqId = reqIds[d.reqIndex];

      if (!reqId) {
        console.warn(`   ⚠ Saltando OC con reqIndex ${d.reqIndex} (no existe)`);
        continue;
      }

      const cotIdForOc = selectedCotByReq[reqId] || null;
      const [ocResult] = await conn.query(`
        INSERT INTO ordenes_compra 
          (numero_oc, requerimiento_id, cotizacion_id, autorizado_por, estado, datatextnow_id, fecha_autorizacion, created_at)
        VALUES 
          (CONCAT('OC-2025-', LPAD(?, 4, '0')), ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY), DATE_SUB(NOW(), INTERVAL ? DAY))
      `, [
        100 + i,
        reqId,
        cotIdForOc,
        contabilidadId,
        d.estado,
        d.datatext,
        Math.floor(Math.random() * 45) + 5,
        Math.floor(Math.random() * 60) + 10
      ]);

      const ocId = ocResult.insertId;

      // Historial de la OC
      await conn.query(`
        INSERT INTO historial_estados (entidad_tipo, entidad_id, estado_anterior, estado_nuevo, cambiado_por, notas, created_at)
        VALUES 
          ('orden_compra', ?, NULL, 'generada', ?, 'Orden de compra generada', DATE_SUB(NOW(), INTERVAL 20 DAY)),
          ('orden_compra', ?, 'generada', ?, ?, 'Actualización de estado', DATE_SUB(NOW(), INTERVAL 5 DAY))
      `, [ocId, contabilidadId, ocId, d.estado, contabilidadId]);
    }

    console.log(`   ✓ ${ocData.length} Órdenes de Compra creadas en diferentes estados`);

    // ============================================
    // 7. RECEPCIONES
    // ============================================
    console.log('📥 Creando recepciones...');

    // Crear algunas recepciones para OCs cerradas o recibidas
    const [ocs] = await conn.query(`SELECT id, numero_oc FROM ordenes_compra WHERE estado IN ('cerrada', 'recibida') LIMIT 6`);

    for (const oc of ocs) {
      await conn.query(`
        INSERT INTO recepciones (orden_compra_id, recibido_por, estado, notas, datatextnow_id, fecha_recepcion, fecha_entrega)
        VALUES (?, ?, 'entregado_solicitante', 'Recepción completa según DataTextNow', ?, DATE_SUB(NOW(), INTERVAL FLOOR(RAND()*15) DAY), DATE_SUB(NOW(), INTERVAL FLOOR(RAND()*5) DAY))
      `, [oc.id, contabilidadId, '031000' + Math.floor(100000 + Math.random() * 900000)]);
    }

    console.log('   ✓ Recepciones registradas');

    await conn.commit();

    console.log('\n✅ ¡Datos de demostración cargados exitosamente!');
    console.log('\n📌 Credenciales para la presentación:');
    console.log('   Admin:         admin@empresa.com / Demo2025!');
    console.log('   Contabilidad:  contabilidad@empresa.com / Demo2025!');
    console.log('   Solicitantes:  juan.perez@empresa.com, laura.martinez@empresa.com, etc. / Demo2025!');
    console.log('\n   Ejecuta primero: node backend/scripts/seed-admin.js si aún no lo has hecho.');

  } catch (error) {
    await conn.rollback();
    console.error('❌ Error durante la carga de datos:', error);
    throw error;
  } finally {
    conn.release();
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
