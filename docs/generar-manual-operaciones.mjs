/**
 * Genera el Manual de Operaciones en formato Word (.docx)
 * Uso: node docs/generar-manual-operaciones.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
  TableOfContents, TabStopType, TabStopPosition,
} from 'docx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'Manual-de-Operaciones-Sistema-OC.docx');

const CONTENT_W = 9360;
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, ...opts.spacing },
    alignment: opts.align,
    heading: opts.heading,
    numbering: opts.numbering,
    pageBreakBefore: opts.pageBreak,
    children: Array.isArray(text)
      ? text
      : [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size })],
  });
}

function h1(text) {
  return p(text, { heading: HeadingLevel.HEADING_1 });
}
function h2(text) {
  return p(text, { heading: HeadingLevel.HEADING_2 });
}
function h3(text) {
  return p(text, { heading: HeadingLevel.HEADING_3 });
}

function bullet(text, ref = 'bullets') {
  return p(text, { numbering: { reference: ref, level: 0 } });
}

function table(headers, rows, colWidths) {
  const w = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    children: headers.map((h, i) => new TableCell({
      borders,
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: 'D5E8F0', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
    })),
  });
  const dataRows = rows.map(row => new TableRow({
    children: row.map((cell, i) => new TableCell({
      borders,
      width: { size: colWidths[i], type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun(String(cell))] })],
    })),
  }));
  return new Table({
    width: { size: w, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
}

const children = [
  // ── PORTADA ──
  new Paragraph({ spacing: { before: 2400 } }),
  p('MANUAL DE OPERACIONES', { bold: true, size: 56, align: AlignmentType.CENTER }),
  p('Sistema de Órdenes de Compra', { bold: true, size: 40, align: AlignmentType.CENTER }),
  p('Parkdale Mills', { size: 32, align: AlignmentType.CENTER }),
  new Paragraph({ spacing: { before: 600 } }),
  p('Versión 1.1.2  |  Junio 2026', { align: AlignmentType.CENTER }),
  p('Documento para: Área de TI y Administradores del Sistema', { align: AlignmentType.CENTER, italics: true }),
  new Paragraph({ children: [new PageBreak()] }),

  // ── CONTROL ──
  h1('Control del documento'),
  table(
    ['Campo', 'Valor'],
    [
      ['Título', 'Manual de Operaciones — Sistema OC'],
      ['Versión del sistema', '1.1.2'],
      ['Versión del documento', '1.0'],
      ['Fecha', 'Junio 2026'],
      ['Clasificación', 'Uso interno'],
      ['Audiencia', 'TI, Contabilidad (admin), Soporte'],
    ],
    [2800, 6560]
  ),
  new Paragraph({ spacing: { before: 200 } }),
  h2('Historial de revisiones'),
  table(
    ['Versión', 'Fecha', 'Descripción'],
    [['1.0', 'Junio 2026', 'Emisión inicial para entrega a TI']],
    [1200, 1800, 6360]
  ),
  new Paragraph({ children: [new PageBreak()] }),

  // ── TOC ──
  h1('Tabla de contenido'),
  new TableOfContents(' ', { hyperlink: true, headingStyleRange: '1-3' }),
  new Paragraph({ children: [new PageBreak()] }),

  // ── 1. INTRODUCCIÓN ──
  h1('1. Introducción'),
  p('Este manual describe la operación, administración y soporte del Sistema de Órdenes de Compra (Sistema OC), una aplicación web interna para gestionar el proceso completo de adquisiciones: Requerimientos, Cotizaciones, Órdenes de Compra y Recepciones.'),
  h2('1.1 Propósito'),
  p('Proporcionar a TI y administradores la información necesaria para:'),
  bullet('Dar acceso y soporte a usuarios finales'),
  bullet('Administrar cuentas, configuración y catálogos'),
  bullet('Operar, monitorear y mantener el servidor de aplicación'),
  bullet('Resolver incidencias frecuentes'),
  h2('1.2 Alcance'),
  p('Cubre la versión 1.1.2 desplegada en servidor Windows con Node.js, MySQL y PM2. No incluye la administración del servidor MySQL ni de DataTextNow, salvo las integraciones operativas (campo PO).'),

  // ── 2. DESCRIPCIÓN ──
  h1('2. Descripción del sistema'),
  h2('2.1 Funcionalidades principales'),
  bullet('Requerimientos de compra con flujo de aprobación'),
  bullet('Cotizaciones a proveedores con envío de RFQ por correo'),
  bullet('Generación y seguimiento de Órdenes de Compra (OC)'),
  bullet('Recepciones de material y cierre con PO DataTextNow'),
  bullet('Catálogo de partes/servicios/fletes y directorio de proveedores'),
  bullet('Dashboard con KPIs y reportes'),
  h2('2.2 Arquitectura'),
  table(
    ['Capa', 'Tecnología'],
    [
      ['Backend', 'Node.js 18+, Express 5, MySQL 8 (mysql2)'],
      ['Autenticación', 'JWT (sesión ~8 horas)'],
      ['Frontend', 'HTML, CSS, JavaScript (sin framework)'],
      ['Correo', 'Nodemailer (config en BD o .env)'],
      ['Archivos', 'Multer — PDFs en backend/uploads/'],
    ],
    [2800, 6560]
  ),
  h2('2.3 URL de acceso'),
  p('La aplicación sirve frontend y API en el mismo puerto. URL típica de acceso:'),
  p('http://[IP-o-nombre-del-servidor]:3000', { bold: true }),
  p('Página de inicio de sesión: /login.html'),

  // ── 3. ACCESO USUARIOS ──
  h1('3. Acceso de usuarios'),
  h2('3.1 Usuario creado por el administrador'),
  p('Cuando TI o Contabilidad crea la cuenta, el usuario recibe:'),
  bullet('Correo electrónico corporativo (usuario de acceso)'),
  bullet('Contraseña temporal'),
  p('Pasos para el usuario:'),
  bullet('Abrir la URL del sistema en Chrome o Edge'),
  bullet('Ingresar correo y contraseña en la pantalla de login'),
  bullet('Solicitar al administrador el cambio de contraseña (Usuarios → Nueva contraseña)'),
  h2('3.2 Auto-registro (solo solicitantes)'),
  p('En login.html existe el enlace "Regístrate como solicitante". El usuario:'),
  bullet('Completa nombre, correo y contraseña (mínimo 8 caracteres)'),
  bullet('Recibe correo de verificación (revisar spam)'),
  bullet('Hace clic en el enlace de activación antes de poder iniciar sesión'),
  p('Nota: el login se bloquea si email_verificado = 0 o la cuenta está inactiva.'),
  h2('3.3 Problemas de acceso frecuentes'),
  table(
    ['Síntoma', 'Causa probable', 'Acción'],
    [
      ['Contraseña incorrecta', 'Credenciales erróneas', 'Restablecer desde Usuarios (admin/contabilidad)'],
      ['Confirma tu correo', 'Cuenta no verificada', 'Reenviar verificación o marcar verificado en BD'],
      ['Token expirado', 'Sesión > 8 h', 'Cerrar sesión y volver a entrar'],
      ['Acceso denegado', 'Rol sin permiso', 'Verificar rol del usuario en módulo Usuarios'],
    ],
    [2200, 3600, 3560]
  ),

  // ── 4. ROLES ──
  h1('4. Roles y permisos'),
  p('Existen tres roles. El rol admin tiene acceso total a todas las funciones.'),
  table(
    ['Rol', 'Módulos visibles', 'Capacidades clave'],
    [
      ['solicitante', 'Dashboard, Requerimientos, Catálogo (lectura), OC propias', 'Crear/editar sus requerimientos; confirmar entrega'],
      ['contabilidad', 'Todo excepto Config SMTP', 'Aprobar reqs, cotizar, generar OC, recepciones, proveedores, usuarios (no admin)'],
      ['admin', 'Todos los módulos', 'Config SMTP, áreas, activar proveedores, gestión completa de usuarios'],
    ],
    [1600, 3200, 4560]
  ),
  h2('4.1 Matriz de módulos'),
  table(
    ['Módulo', 'Solicitante', 'Contabilidad', 'Admin'],
    [
      ['Dashboard', 'Sí', 'Sí', 'Sí'],
      ['Requerimientos', 'Sí', 'Sí', 'Sí'],
      ['Catálogo', 'Lectura', 'Gestión', 'Gestión'],
      ['Órdenes de Compra', 'Solo propias', 'Todas', 'Todas'],
      ['Proveedores', 'No', 'Sí', 'Sí'],
      ['Usuarios', 'No', 'Sí*', 'Sí'],
      ['Áreas y Departamentos', 'No', 'Sí', 'Sí'],
      ['Configuración SMTP', 'No', 'No', 'Sí'],
    ],
    [3600, 1800, 1980, 1980]
  ),
  p('* Contabilidad no puede crear ni modificar usuarios con rol administrador.', { italics: true }),

  // ── 5. FLUJO ──
  h1('5. Flujo operativo de negocio'),
  p('El proceso estándar de compras sigue esta secuencia:'),
  p('Requerimiento  →  Cotización (si aplica)  →  Aprobación  →  OC  →  Recepción  →  Cierre', { bold: true }),
  h2('5.1 Requerimiento'),
  bullet('El solicitante crea la solicitud en estado borrador'),
  bullet('Selecciona área, departamento y tipo: PARTES, SERVICIOS o FLETES'),
  bullet('Agrega ítems del catálogo O ítems en texto libre (nunca ambos en el mismo requerimiento)'),
  bullet('Envía a revisión cuando está completo'),
  h2('5.2 Cotización'),
  bullet('Obligatoria si el requerimiento tiene ítems libres'),
  bullet('Opcional si solo usa catálogo'),
  bullet('Contabilidad registra cotizaciones, adjunta PDF y selecciona la ganadora'),
  bullet('El correo RFQ al proveedor solo se envía para SERVICIOS o requerimientos con ítems libres'),
  h2('5.3 Aprobación'),
  bullet('Contabilidad/admin evalúa en revisión: aprueba, marca incompleto o rechaza'),
  bullet('Si requiere cotización: debe existir cotización seleccionada con PDF adjunto'),
  h2('5.4 Orden de compra'),
  bullet('Se genera desde requerimiento aprobado (número OC-AAAA-NNNN)'),
  bullet('Estados: generada → distribuida → en_proceso → recibida → cerrada'),
  bullet('Al generar OC con cotización, los ítems libres se formalizan en el catálogo'),
  h2('5.5 Recepción y cierre'),
  bullet('Contabilidad registra la recepción del material'),
  bullet('El solicitante puede confirmar entrega (entregado_solicitante)'),
  bullet('Para cerrar la OC se requiere PO DataTextNow (datatextnow_id)'),
  bullet('El cierre puede ser manual o automático al cumplir recepción completa + PO'),

  // ── 6. ESTADOS ──
  h1('6. Estados y transiciones'),
  h2('6.1 Requerimientos'),
  table(
    ['Estado', 'Significado', 'Siguiente paso típico'],
    [
      ['borrador', 'En edición', 'Enviar a revisión'],
      ['en_revision', 'En evaluación', 'Aprobar / incompleto / rechazar'],
      ['incompleto', 'Devuelto al solicitante', 'Corregir y reenviar'],
      ['aprobado', 'Autorizado para OC', 'Generar orden de compra'],
      ['rechazado', 'No procede', '—'],
      ['cerrado', 'Finalizado', '—'],
    ],
    [2000, 3680, 3680]
  ),
  h2('6.2 Órdenes de compra'),
  table(
    ['Estado', 'Activa*', 'Descripción'],
    [
      ['generada', 'Sí', 'OC recién creada'],
      ['distribuida', 'Sí', 'Enviada a proveedor/almacén'],
      ['en_proceso', 'Sí', 'En tránsito o fabricación'],
      ['recibida', 'Sí', 'Material recibido, pendiente cierre'],
      ['cerrada', 'No', 'Proceso completado con PO'],
      ['cancelada', 'No', 'OC cancelada'],
    ],
    [2000, 1200, 6160]
  ),
  p('* Activas = generada, distribuida, en_proceso, recibida. Filtro en dashboard y listado OC.', { italics: true }),
  h2('6.3 Recepciones'),
  table(
    ['Estado', 'Descripción'],
    [
      ['recibido_parcial', 'Entrega incompleta'],
      ['recibido_completo', 'Entrega completa registrada por contabilidad'],
      ['entregado_solicitante', 'Confirmado por el solicitante'],
    ],
    [3200, 6160]
  ),

  // ── 7. REGLAS DE NEGOCIO ──
  h1('7. Reglas de negocio clave'),
  h2('7.1 Catálogo vs ítems libres'),
  bullet('Un requerimiento es 100% catálogo o 100% ítems libres; nunca mezclados'),
  bullet('Ítems libres activan requiere_cotizacion automáticamente'),
  bullet('Los ítems libres originales se conservan; la formalización al catálogo ocurre al generar la OC'),
  h2('7.2 PO DataTextNow'),
  bullet('Campo datatextnow_id en la OC (o en recepción)'),
  bullet('Obligatorio para cerrar la orden de compra'),
  bullet('Se obtiene de reportes externos de DataTextNow'),
  bullet('Filtro operativo: OC activas sin PO (sin_po=true)'),
  h2('7.3 Áreas y departamentos'),
  bullet('No se almacenan en MySQL; viven en backend/src/config/departamentos.json'),
  bullet('Alineados a estructura DataTextNow; editables desde Administración → Áreas'),
  bullet('Al actualizar el JSON en servidor, reiniciar la aplicación (pm2 restart)'),

  // ── 8. ADMINISTRACIÓN ──
  h1('8. Administración del sistema'),
  h2('8.1 Usuarios'),
  bullet('Alta: admin/contabilidad en Usuarios, o auto-registro público (solo solicitante)'),
  bullet('Restablecer contraseña: Usuarios → Nueva contraseña'),
  bullet('Activar/desactivar cuentas desde el mismo módulo'),
  bullet('Script de emergencia: node backend/scripts/seed-admin.js (usa ADMIN_* del .env)'),
  h2('8.2 Configuración SMTP'),
  bullet('Solo administrador — módulo Configuración'),
  bullet('Prioridad: tabla configuracion_smtp en BD > variables .env'),
  bullet('La contraseña SMTP se guarda encriptada con SECRET_ENCRYPTION_KEY (32 caracteres)'),
  bullet('Campo CC cotizaciones: correo en copia al enviar RFQ a proveedores'),
  bullet('Probar conexión y envío de correo de prueba desde el mismo panel'),
  h2('8.3 Catálogo y proveedores'),
  bullet('CRUD manual e importación desde Excel (.xlsx)'),
  bullet('Proveedores: activar/desactivar solo admin'),
  h2('8.4 Reportes'),
  bullet('Exportación de OC desde el listado'),
  bullet('Reporte STATUS POS HILOS (Excel anual) desde dashboard — contabilidad/admin'),

  new Paragraph({ children: [new PageBreak()] }),

  // ── 9. INFRAESTRUCTURA ──
  h1('9. Infraestructura y despliegue (TI)'),
  h2('9.1 Requisitos'),
  table(
    ['Componente', 'Requisito'],
    [
      ['SO servidor app', 'Windows Server o Windows 10/11'],
      ['Node.js', '18 o superior'],
      ['MySQL', '8.x — base de datos ordenes_compra'],
      ['PM2', 'Recomendado para producción'],
      ['Navegadores', 'Chrome, Edge (últimas versiones)'],
    ],
    [3200, 6160]
  ),
  h2('9.2 Estructura de carpetas'),
  p('Sistema de Ordenes de Compra/'),
  bullet('.env                    ← Credenciales (raíz, NO en git)'),
  bullet('backend/app.js          ← Punto de entrada'),
  bullet('backend/src/            ← Código backend'),
  bullet('backend/uploads/        ← PDFs y referencias'),
  bullet('backend/scripts/        ← seed-admin.js, test-flujo.mjs'),
  bullet('frontend/               ← Interfaz web'),
  h2('9.3 Instalación y arranque'),
  p('cd backend'),
  p('npm install'),
  p('npm start          # o: pm2 start app.js --name sistema-oc'),
  p('pm2 restart sistema-oc'),
  p('pm2 logs sistema-oc'),
  h2('9.4 Despliegue de actualizaciones'),
  bullet('Detener app: pm2 stop sistema-oc'),
  bullet('Respaldar .env y backend/uploads/'),
  bullet('Copiar archivos nuevos (sin node_modules ni .env)'),
  bullet('cd backend && npm install'),
  bullet('Reiniciar: pm2 restart sistema-oc'),
  bullet('Verificar: GET /api/health y login de prueba'),

  // ── 10. VARIABLES ──
  h1('10. Variables de entorno (.env)'),
  p('El archivo .env debe estar en la RAÍZ del proyecto, no en backend/.'),
  table(
    ['Variable', 'Descripción', 'Ejemplo'],
    [
      ['PORT', 'Puerto HTTP', '3000'],
      ['NODE_ENV', 'Entorno', 'production'],
      ['CORS_ORIGIN', 'Origen permitido', 'http://servidor:3000'],
      ['FRONTEND_URL', 'URL base para enlaces en correos', 'http://servidor:3000'],
      ['DB_HOST', 'Servidor MySQL', 'localhost'],
      ['DB_PORT', 'Puerto MySQL', '3306'],
      ['DB_USER / DB_PASSWORD', 'Credenciales MySQL', '—'],
      ['DB_NAME', 'Base de datos', 'ordenes_compra'],
      ['JWT_SECRET', 'Secreto para tokens', 'Cadena larga aleatoria'],
      ['JWT_EXPIRES_IN', 'Duración sesión', '8h'],
      ['SECRET_ENCRYPTION_KEY', 'Cifrado SMTP (32 chars)', '—'],
      ['EMAIL_*', 'SMTP fallback si no hay config en BD', 'smtp.office365.com'],
      ['ADMIN_EMAIL / ADMIN_PASSWORD', 'Usuario seed de emergencia', '—'],
    ],
    [2800, 3600, 2960]
  ),

  // ── 11. MONITOREO ──
  h1('11. Monitoreo y mantenimiento'),
  h2('11.1 Health check'),
  p('GET /api/health — respuesta: { "estado": "ok", "timestamp": "..." }'),
  p('No requiere autenticación. Usar para monitoreo de disponibilidad.'),
  h2('11.2 Logs'),
  bullet('PM2: pm2 logs sistema-oc'),
  bullet('Al iniciar debe aparecer: Conectado a MySQL: ordenes_compra'),
  bullet('Errores SMTP se registran pero no detienen la aplicación'),
  h2('11.3 Respaldos recomendados'),
  bullet('Base de datos ordenes_compra (dump periódico)'),
  bullet('Archivo .env (fuera del repositorio)'),
  bullet('Carpeta backend/uploads/ (PDFs de cotizaciones)'),
  bullet('backend/src/config/departamentos.json'),

  // ── 12. TROUBLESHOOTING ──
  h1('12. Resolución de problemas'),
  table(
    ['Problema', 'Diagnóstico', 'Solución'],
    [
      ['App no arranca', 'pm2 logs — error MySQL', 'Verificar .env en raíz, credenciales DB, servicio MySQL activo'],
      ['Error FK al guardar SMTP', 'Token con id de usuario antiguo', 'Cerrar sesión y volver a entrar; o actualizar código configSmtp'],
      ['Correos no salen', 'SMTP mal configurado', 'Revisar Config SMTP; SECRET_ENCRYPTION_KEY debe coincidir con la del respaldo'],
      ['Áreas vacías', 'Falta departamentos.json', 'Copiar archivo y pm2 restart'],
      ['Login bloqueado', 'email_verificado = 0', 'Activar cuenta o ejecutar verificación'],
      ['404 en archivos PDF', 'Falta uploads/', 'Restaurar carpeta backend/uploads/'],
    ],
    [2200, 3200, 3960]
  ),

  // ── ANEXO ──
  h1('Anexo A — Endpoints API principales'),
  table(
    ['Endpoint', 'Descripción'],
    [
      ['GET /api/health', 'Estado del servidor'],
      ['POST /api/auth/login', 'Inicio de sesión'],
      ['GET /api/dashboard/stats', 'KPIs del dashboard'],
      ['GET /api/requerimientos', 'Listado de requerimientos'],
      ['GET /api/ordenes-compra?estado=activas', 'OC pendientes de cerrar'],
      ['GET /api/areas', 'Áreas y departamentos'],
      ['GET/PUT /api/config/smtp', 'Configuración de correo (admin)'],
    ],
    [4200, 5160]
  ),
  h1('Anexo B — Contacto y escalamiento'),
  p('Administrador del sistema: [completar nombre y correo]'),
  p('Soporte TI: [completar área y extensión]'),
  p('Base de datos MySQL: [completar responsable DBA]'),
];

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial', color: '185FA5' },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '185FA5', space: 1 } },
          children: [
            new TextRun({ text: 'Manual de Operaciones — Sistema OC', size: 18, color: '64748B' }),
            new TextRun({ text: '\tParkdale Mills', size: 18, color: '64748B' }),
          ],
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Página ', size: 18, color: '64748B' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '64748B' }),
            new TextRun({ text: '  |  Versión 1.0 — Junio 2026  |  Uso interno', size: 18, color: '64748B' }),
          ],
        })],
      }),
    },
    children,
  }],
});

const buffer = await Packer.toBuffer(doc);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buffer);
console.log('Generado:', OUT);