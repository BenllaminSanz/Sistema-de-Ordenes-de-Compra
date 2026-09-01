/**
 * Genera el Manual de Operaciones en Word (.docx) para la versión actual.
 * Uso: cd docs && npm install && node generar-manual-operaciones.mjs
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
const VERSION_SIS = '1.9.4';
const VERSION_DOC = '2.0';
const FECHA = 'Agosto 2026';
const OUT = path.join(__dirname, '..', 'docs-generados', `Manual-de-Operaciones-Sistema-OC-v${VERSION_SIS}.docx`);

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

function note(text) {
  return p(text, { italics: true });
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
  const dataRows = rows.map((row) => new TableRow({
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
  new Paragraph({ spacing: { before: 2400 } }),
  p('MANUAL DE OPERACIONES', { bold: true, size: 56, align: AlignmentType.CENTER }),
  p('Sistema de Órdenes de Compra', { bold: true, size: 40, align: AlignmentType.CENTER }),
  p('Parkdale Mills', { size: 32, align: AlignmentType.CENTER }),
  new Paragraph({ spacing: { before: 600 } }),
  p(`Versión ${VERSION_SIS}  |  ${FECHA}`, { align: AlignmentType.CENTER }),
  p('Documento para: Área de TI, Compras y Administradores del Sistema', { align: AlignmentType.CENTER, italics: true }),
  new Paragraph({ children: [new PageBreak()] }),

  h1('Control del documento'),
  table(
    ['Campo', 'Valor'],
    [
      ['Título', 'Manual de Operaciones — Sistema OC'],
      ['Versión del sistema', VERSION_SIS],
      ['Versión del documento', VERSION_DOC],
      ['Fecha', FECHA],
      ['Clasificación', 'Uso interno'],
      ['Audiencia', 'TI, Compras (antes Contabilidad), Admin, Soporte'],
    ],
    [2800, 6560]
  ),
  new Paragraph({ spacing: { before: 200 } }),
  h2('Historial de revisiones'),
  table(
    ['Versión', 'Fecha', 'Descripción'],
    [
      ['1.0', 'Junio 2026', 'Emisión inicial para entrega a TI (sistema v1.1.2)'],
      ['1.1', 'Julio 2026', 'Ajuste menor alineado a v1.2.1'],
      ['2.0', 'Agosto 2026', 'Regenerado contra v1.9.4: rol Compras, acuse recibido, bandejas, SMTP/notificaciones, dashboard general, import y fusión de usuarios'],
    ],
    [1200, 1800, 6360]
  ),
  p('Al abrir en Microsoft Word: clic derecho en la tabla de contenido → Actualizar campos → Actualizar toda la tabla.', { italics: true }),
  new Paragraph({ children: [new PageBreak()] }),

  h1('Tabla de contenido'),
  new TableOfContents(' ', { hyperlink: true, headingStyleRange: '1-3' }),
  new Paragraph({ children: [new PageBreak()] }),

  // 1
  h1('1. Introducción'),
  p('Este manual describe la operación, administración y soporte del Sistema de Órdenes de Compra (Sistema OC), una aplicación web interna para gestionar el proceso completo de adquisiciones: Requerimientos, Cotizaciones, Órdenes de Compra y Recepciones.'),
  h2('1.1 Propósito'),
  p('Proporcionar a TI y administradores la información necesaria para:'),
  bullet('Dar acceso y soporte a usuarios finales (solicitantes y Compras)'),
  bullet('Administrar cuentas, configuración SMTP, notificaciones y catálogos'),
  bullet('Operar, monitorear y actualizar el servidor de aplicación'),
  bullet('Importar histórico (BASE GRAL) y resolver duplicados de usuarios'),
  bullet('Resolver incidencias frecuentes'),
  h2('1.2 Alcance'),
  p(`Cubre la versión ${VERSION_SIS} desplegada en servidor Windows con Node.js, MySQL y PM2 (proceso "oc"). No incluye la administración del servidor MySQL ni de DataTextNow, salvo las integraciones operativas (campo PO / fecha PO).`),
  h2('1.3 Qué cambió desde el manual v1.0 (sistema 1.1.2)'),
  bullet('El rol Contabilidad se llama Compras (migración automática al arrancar)'),
  bullet('Acuse formal: estado recibido entre en revisión y aprobado'),
  bullet('Bandejas de trabajo REQ y OC en el Dashboard, con acciones rápidas'),
  bullet('Dashboard general: todos los roles consultan REQ/OC (solo lectura si no son dueños)'),
  bullet('Panel de notificaciones: URL pública, avisos de REQ, roles destinatarios y reporte diario'),
  bullet('OC usa el mismo consecutivo del requerimiento (sin prefijo OC-)'),
  bullet('Fusión automática de usuarios duplicados del Excel de import'),

  // 2
  h1('2. Descripción del sistema'),
  h2('2.1 Funcionalidades principales'),
  bullet('Requerimientos con flujo: borrador → en revisión → recibido (acuse) → aprobado / incompleto / cancelado'),
  bullet('Cotizaciones a proveedores: RFQ por correo (ES/EN), o solo registro sin correo'),
  bullet('Generación y seguimiento de Órdenes de Compra, con PO DataTextNow'),
  bullet('Recepciones por ítem (parcial/completa), No. de recibo y cierre controlado'),
  bullet('Catálogo de partes / servicios / fletes, unidades de medida y proveedores'),
  bullet('Dashboard con KPIs, bandejas FIFO, reportes Excel (año / mes / rango / completo)'),
  bullet('Campana in-app y correos a Compras (REQ en revisión y resumen diario)'),
  h2('2.2 Arquitectura'),
  table(
    ['Capa', 'Tecnología'],
    [
      ['Backend', 'Node.js 18+, Express 5, MySQL 8 (mysql2), entrada: backend/server.js'],
      ['Autenticación', 'JWT (sesión ~8 horas)'],
      ['Frontend', 'HTML, CSS, JavaScript vanilla (sin framework)'],
      ['Correo', 'Nodemailer — config en BD (prioridad) o .env'],
      ['Archivos', 'Multer — cotizaciones, referencias e ítems en backend/uploads/'],
      ['Validación', 'Zod en API; migraciones ligeras al arranque'],
    ],
    [2800, 6560]
  ),
  h2('2.3 URL de acceso'),
  p('La aplicación sirve frontend y API en el mismo puerto. URL típica:'),
  p('http://[IP-o-nombre-del-servidor]:3000', { bold: true }),
  p('Página de inicio de sesión: /login.html'),
  p('La URL pública usada en los enlaces de correo se configura en Administración → Configuración SMTP (no debe ser localhost en producción).'),

  // 3
  h1('3. Acceso de usuarios'),
  h2('3.1 Usuario creado por el administrador'),
  p('Cuando TI o Compras crea la cuenta en Usuarios, el usuario recibe:'),
  bullet('Correo electrónico corporativo (usuario de acceso)'),
  bullet('Contraseña temporal'),
  p('Pasos para el usuario:'),
  bullet('Abrir la URL del sistema en Chrome o Edge'),
  bullet('Ingresar correo y contraseña en login.html'),
  bullet('Pedir al administrador el cambio de contraseña (Usuarios → Nueva contraseña)'),
  h2('3.2 Auto-registro (solo solicitantes)'),
  p('En login.html existe el enlace "Regístrate como solicitante". El usuario:'),
  bullet('Completa nombre, correo y contraseña (mínimo 8 caracteres)'),
  bullet('Recibe correo de verificación (revisar spam)'),
  bullet('Hace clic en el enlace de activación antes de poder iniciar sesión'),
  p('Nota: el login se bloquea si email_verificado = 0 o la cuenta está inactiva. Las cuentas creadas desde el menú Usuarios (Admin/Compras) quedan verificadas, sin paso de correo.'),
  h2('3.3 Problemas de acceso frecuentes'),
  table(
    ['Síntoma', 'Causa probable', 'Acción'],
    [
      ['Contraseña incorrecta', 'Credenciales erróneas', 'Restablecer desde Usuarios (admin/compras)'],
      ['Confirma tu correo', 'Cuenta no verificada', 'Reenviar verificación o marcar verificado al crear desde Usuarios'],
      ['Token expirado', 'Sesión > 8 h', 'Cerrar sesión y volver a entrar'],
      ['Acceso denegado', 'Rol sin permiso', 'Verificar rol en módulo Usuarios'],
      ['No aparece en búsquedas', 'Nombre largo del Excel vs nombre corto', 'La fusión al arranque deja el nombre de login; buscar por ese nombre'],
    ],
    [2200, 3600, 3560]
  ),

  // 4
  h1('4. Roles y permisos'),
  p('Existen tres roles. El rol legado contabilidad se normaliza a compras (en API, tokens y UI).'),
  table(
    ['Rol', 'Módulos visibles', 'Capacidades clave'],
    [
      ['solicitante', 'Dashboard, Requerimientos, OC, Catálogo (lectura)', 'Crea/edita sus REQ; consulta REQ/OC ajenos en solo lectura; campana de sus novedades'],
      ['compras', 'Todo excepto Config SMTP', 'Acuse, aprobar, cotizar, generar OC, recepciones, proveedores, usuarios (no admin), áreas'],
      ['admin', 'Todos los módulos', 'Lo de Compras + Configuración SMTP y notificaciones'],
    ],
    [1600, 3200, 4560]
  ),
  h2('4.1 Matriz de módulos'),
  table(
    ['Módulo', 'Solicitante', 'Compras', 'Admin'],
    [
      ['Dashboard (general)', 'Sí (consulta)', 'Sí (acciones)', 'Sí'],
      ['Requerimientos', 'Propios (edita); ajenos lectura', 'Todos', 'Todos'],
      ['Órdenes de Compra', 'Consulta', 'Gestión', 'Gestión'],
      ['Catálogo', 'Lectura + carrito hacia REQ', 'Gestión', 'Gestión'],
      ['Proveedores', 'No', 'Sí', 'Sí'],
      ['Usuarios', 'No', 'Sí*', 'Sí'],
      ['Áreas y Departamentos', 'No', 'Sí', 'Sí'],
      ['Configuración SMTP', 'No', 'No', 'Sí'],
    ],
    [3000, 2200, 2080, 2080]
  ),
  note('* Compras no puede crear ni modificar usuarios con rol administrador.'),
  h2('4.2 Reglas de edición'),
  bullet('Editar o cambiar estado de un REQ: dueño (solicitante) o Compras/Admin'),
  bullet('Corregir área/departamento, notas internas y proveedor de OC: solo Compras/Admin'),
  bullet('Recepciones: solo Compras/Admin; el solicitante consulta'),
  bullet('Activar/desactivar proveedores: Admin (Compras gestiona el resto del directorio)'),

  // 5
  h1('5. Flujo operativo de negocio'),
  p('El proceso estándar de compras sigue esta secuencia:'),
  p('Requerimiento  →  Cotización (si aplica)  →  Acuse Compras  →  Aprobación  →  OC  →  Recepción  →  Cierre', { bold: true }),
  h2('5.1 Requerimiento'),
  bullet('El solicitante crea la solicitud en estado borrador (o Compras/Admin)'),
  bullet('Selecciona área, departamento y tipo: PARTES, SERVICIOS o FLETES'),
  bullet('Agrega ítems del catálogo O ítems en texto libre (nunca ambos en el mismo REQ)'),
  bullet('Máximo 15 ítems por REQ; si necesita más, crea otro requerimiento'),
  bullet('Puede armar un carrito desde el Catálogo (un solo proveedor por REQ)'),
  bullet('El consecutivo se asigna al enviar a revisión, con formato AÑO+letra-número: 2026S-001 (servicios), 2026P-001 (partes), 2026F-001 (fletes)'),
  bullet('El solicitante puede borrar un borrador'),
  h2('5.2 Cotización'),
  bullet('Obligatoria si hay ítems libres; también para SERVICIOS y PARTES sin precio de referencia'),
  bullet('Compras registra cotizaciones, adjunta archivo (PDF, Word, Excel o imagen) y selecciona la ganadora'),
  bullet('Idioma del correo RFQ: español o inglés (se guarda en la cotización)'),
  bullet('Opción Solo registrar (sin correo) cuando la cotización ya llegó o fue compra en tienda'),
  bullet('El correo RFQ incluye No. de parte; CC y Reply-To usan el correo configurado en SMTP'),
  bullet('Proveedor puede no tener email (tiendas / compra directa)'),
  h2('5.3 Acuse y aprobación'),
  bullet('Al enviar a revisión, Compras recibe correo (si las notificaciones están activas) y el REQ entra a la bandeja Por recibir'),
  bullet('Compras marca Recibido (acuse formal) antes de aprobar, devolver incompleto o cancelar'),
  bullet('Si requiere cotización: debe existir cotización seleccionada (adjunto según reglas del flujo)'),
  bullet('Desde aprobado, Compras puede generar la OC o regresar a recibido / en revisión'),
  h2('5.4 Orden de compra'),
  bullet('Se genera desde un REQ aprobado; el número de OC es el mismo consecutivo del REQ'),
  bullet('Estados: generada → distribuida → en_proceso → recibida → cerrada (o cancelada)'),
  bullet('Al generar, se captura PO DataTextNow y fecha PO (o NA; si es NA la fecha es obligatoria)'),
  bullet('Ítems libres se formalizan en el catálogo al generar la OC'),
  bullet('Compras puede corregir el proveedor de la OC sin recotizar (también se refleja en la cotización ligada)'),
  h2('5.5 Recepción y cierre'),
  bullet('Solo Compras/Admin registra recepciones (parcial o completa) por ítem, con cantidad decimal y No. de recibo'),
  bullet('La primera recepción mueve la OC hacia en_proceso / recibida según el avance'),
  bullet('Para cerrar: al menos una recepción y PO DataTextNow (o NA declarado)'),
  bullet('Se puede cerrar con ítems incompletos; queda constancia en el historial'),

  // 6
  h1('6. Estados y transiciones'),
  h2('6.1 Requerimientos'),
  table(
    ['Estado', 'Significado', 'Siguiente paso típico'],
    [
      ['borrador', 'En edición', 'Enviar a revisión'],
      ['en_revision', 'Llegó a Compras', 'Marcar recibido / cancelar'],
      ['recibido', 'Acuse formal de Compras', 'Aprobar / incompleto / cancelar / regresar'],
      ['incompleto', 'Devuelto al solicitante', 'Corregir y reenviar, o cancelar'],
      ['aprobado', 'Autorizado para OC', 'Generar OC, o regresar a recibido/revisión'],
      ['rechazado', 'Cancelado / no procede', '—'],
      ['cerrado', 'Ya tiene OC generada', 'El ciclo sigue en la OC'],
    ],
    [1800, 3680, 3880]
  ),
  note('Si ya hay OC, no se cancela ni se regresa el REQ: hay que actuar sobre la OC.'),
  h2('6.2 Órdenes de compra'),
  table(
    ['Estado', 'Activa*', 'Descripción'],
    [
      ['generada', 'Sí', 'OC recién creada; se puede Distribuir o Cancelar'],
      ['distribuida', 'Sí', 'Enviada a proveedor; se puede pasar a En proceso o regresar'],
      ['en_proceso', 'Sí', 'En tránsito / fabricación; recepciones en curso'],
      ['recibida', 'Sí', 'Material recibido; pendiente cierre'],
      ['cerrada', 'No', 'Proceso completado con PO'],
      ['cancelada', 'No', 'OC cancelada'],
    ],
    [2000, 1200, 6160]
  ),
  note('* Activas = generada, distribuida, en_proceso, recibida. Filtro en dashboard y listado OC.'),
  h2('6.3 Recepciones'),
  table(
    ['Estado', 'Descripción'],
    [
      ['recibido_parcial', 'Entrega incompleta de uno o más ítems'],
      ['recibido_completo', 'Entrega completa registrada por Compras'],
      ['entregado_solicitante', 'Estado legado; el acuse operativo lo hace Compras'],
    ],
    [3200, 6160]
  ),

  // 7
  h1('7. Módulos de la aplicación'),
  h2('7.1 Dashboard'),
  bullet('Visible para todos los roles (ya no es “mi panel” exclusivo)'),
  bullet('KPIs del año: REQ, OC, gasto, Por recibir, OC activas / sin PO'),
  bullet('Bandeja REQ (ancla #bandeja): Por recibir, En proceso, Incompletos, Listos para OC'),
  bullet('Acciones rápidas Compras: Recibido (acuse) e Incompleto (con nota); antigüedad FIFO'),
  bullet('Bandeja OC (ancla #bandeja-oc): Generadas, Distribuidas, En proceso, Recibidas, Sin PO'),
  bullet('Acciones rápidas OC: Distribuir y En proceso'),
  bullet('El solicitante consulta las mismas colas; no ejecuta las acciones de Compras'),
  bullet('Reportes Excel: General (REQ+OC), REQ y OC, por año, mes, rango de fechas o completo'),
  h2('7.2 Requerimientos'),
  bullet('Listado con filtros simplificados (Más filtros + Limpiar), orden por columnas y paginación al pie'),
  bullet('Compras/Admin: filtro por solicitante (no lista placeholders @import.local)'),
  bullet('Búsqueda por consecutivo, notas y nombre/correo actuales del solicitante'),
  bullet('Detalle: historial de estados, último estatus/nota, impresión PDF con firmas (Gerente de Planta / Jefe Inmediato)'),
  bullet('Compras/Admin: Corregir área y departamento; editar Notas/Detalles (visibles para el solicitante)'),
  bullet('Tras Generar OC se permanece en el detalle del REQ'),
  h2('7.3 Órdenes de compra'),
  bullet('Listado: No. OC, PO DTN, Fecha PO, proveedor, estado; sin columna Requerimiento (el REQ está en el detalle)'),
  bullet('Detalle: cambiar estado, capturar/editar PO y fecha, notas de Compras, Cambiar proveedor'),
  bullet('Recepciones editables; se muestra cuánto se ha recibido de cada ítem respecto a lo solicitado'),
  h2('7.4 Catálogo'),
  bullet('Tipos: PARTES, SERVICIOS, FLETES; monedas MXN / USD / EUR'),
  bullet('Filtros persistentes al editar; búsqueda por código, descripción y proveedor'),
  bullet('Vista por proveedor (catalogo-proveedores.html): editar, activar/desactivar, eliminar desactivados'),
  bullet('Carrito: al elegir un ítem, el REQ queda atado a ese proveedor'),
  bullet('Unidades de medida: catálogo CRUD (combo, no texto libre)'),
  h2('7.5 Proveedores'),
  bullet('Alta/edición; correo opcional; búsqueda por código o nombre en REQ, catálogo, cotización y OC'),
  bullet('Export Excel de proveedores'),
  h2('7.6 Usuarios'),
  bullet('Alta, edición, activar/desactivar, restablecer contraseña'),
  bullet('No se listan correos sin-correo / @import.local'),
  h2('7.7 Áreas y departamentos'),
  bullet('Catálogo JSON (no MySQL): backend/src/config/departamentos.json'),
  bullet('Renombrar un área o departamento propaga el cambio a REQ históricos'),
  bullet('Historial de cambios en departamentos_historial.jsonl'),
  bullet('Los combos validan que el departamento pertenezca al área'),
  h2('7.8 Campana (topbar)'),
  bullet('Compras: pendientes de acuse y colas de trabajo; enlace a dashboard.html#bandeja'),
  bullet('Solicitante: novedades de SUS REQ (nota de Compras, incompleto, aprobado, OC generada) — sin correo'),
  bullet('Se refresca periódicamente (~60 s)'),

  // 8
  h1('8. Notificaciones y correo'),
  h2('8.1 Aviso de REQ en revisión'),
  bullet('Se envía cuando un REQ pasa a en_revision'),
  bullet('Destinatarios: usuarios activos con los roles marcados (Compras y/o Admin) más correos extra'),
  bullet('Interruptor en Configuración SMTP: se puede desactivar sin tocar el SMTP'),
  bullet('Los botones “Abrir requerimiento” usan la URL pública configurada'),
  h2('8.2 RFQ al proveedor'),
  bullet('Correo automático si la fecha de la cotización es hoy y no se eligió Solo registrar'),
  bullet('Reenvío manual desde el detalle del REQ (botón Enviar correo)'),
  bullet('CC y Reply-To: campo Copia y respuestas en cotizaciones'),
  bullet('No aplica a la verificación de usuarios'),
  h2('8.3 Reporte diario a Compras'),
  bullet('Resumen a las 7:00 hora México (America/Mexico_City)'),
  bullet('Mismos destinatarios que el aviso de revisión; los solicitantes no lo reciben'),
  bullet('Activar/desactivar con el checkbox en Configuración SMTP'),
  bullet('Prueba manual: node backend/scripts/reporte-diario-compras.mjs [--force]'),
  h2('8.4 Campana del solicitante'),
  p('Es solo in-app (sin correo): nota de Compras, marcado incompleto, aprobado y OC generada.'),

  // 9
  h1('9. Configuración SMTP y ajustes de la aplicación'),
  p('Solo administrador — menú Administración → Configuración SMTP. Los cambios de SMTP y de notificaciones se aplican sin reiniciar el servidor.'),
  h2('9.1 SMTP'),
  bullet('Prioridad: tabla configuracion_smtp (BD) > variables EMAIL_* del .env'),
  bullet('La contraseña se guarda encriptada con SECRET_ENCRYPTION_KEY (32 caracteres)'),
  bullet('Botones: Probar conexión, Enviar correo de prueba, Usar solo .env (desactiva la config de BD)'),
  bullet('Office 365 típico: smtp.office365.com, puerto 587, Secure desmarcado'),
  h2('9.2 Notificaciones y URL pública (tabla configuracion_app)'),
  table(
    ['Campo', 'Qué hace'],
    [
      ['URL pública', 'Base de los enlaces en correos. No usar localhost en el servidor'],
      ['Avisos REQ en revisión', 'Interruptor on/off del correo a Compras/Admin'],
      ['Roles destinatarios', 'Compras y/o Admin; el cambio se guarda al instante'],
      ['Reporte diario', 'Resumen 7:00 hora México'],
      ['Correos extra', 'Lista separada por coma, además de los roles'],
    ],
    [2800, 6560]
  ),
  note('La URL pública y el interruptor de notificaciones NO se pierden si se vuelve a usar el SMTP del .env.'),
  h2('9.3 Health check relacionado'),
  p('GET /api/health responde, entre otros, version, frontend_url y notif_req_revision. No requiere autenticación.'),

  // 10
  h1('10. Reglas de negocio clave'),
  h2('10.1 Catálogo vs ítems libres'),
  bullet('Un requerimiento es 100 % catálogo o 100 % ítems libres; nunca mezclados'),
  bullet('Ítems libres activan requiere_cotizacion'),
  bullet('Los ítems libres originales se conservan; la formalización al catálogo ocurre al generar la OC'),
  bullet('El Nº ítem de la cotización pasa como código de catálogo al formalizar'),
  h2('10.2 PO DataTextNow'),
  bullet('Campos datatextnow_id y fecha_po en la OC'),
  bullet('Obligatorio para cerrar (NA cuenta como PO declarado; si es NA, la fecha es obligatoria)'),
  bullet('Filtro operativo: OC activas sin PO'),
  h2('10.3 Consecutivos'),
  bullet('REQ: 2026S-001 / 2026P-001 / 2026F-001 (año + letra de tipo + correlativo)'),
  bullet('OC: el mismo texto que el REQ de origen'),
  bullet('Control en tabla consecutivos_control (lock de fila al generar)'),
  h2('10.4 Usuarios del import'),
  bullet('El Excel histórico crea placeholders inactivos (@import.local / sin-correo)'),
  bullet('Al arrancar, se fusionan con la cuenta de login (correo corporativo); gana el nombre corto'),
  bullet('Los REQ/OC se reasignan a la cuenta de login; no se borra ningún requerimiento ni OC'),
  bullet('A partir de v1.9.4 el placeholder nunca se elige como canónico aunque tenga más REQ'),

  // 11
  h1('11. Reportes, Excel e importaciones'),
  h2('11.1 Exportaciones de operación'),
  table(
    ['Origen', 'Contenido'],
    [
      ['Dashboard → General', 'REQ del periodo + OC del periodo (deduplica por N°; prioriza fila OC). Layout BASE GRAL'],
      ['Dashboard / listado REQ', 'Requerimientos: proveedor, área, departamento, detalle'],
      ['Listado OC', 'OC desglosada por ítem (código, cantidades, importe, No. de recibo)'],
      ['Catálogo', 'Respeta filtros de la vista (proveedor, tipo, búsqueda, solo activos)'],
      ['Proveedores', 'Directorio completo'],
    ],
    [2800, 6560]
  ),
  p('Periodos disponibles: año, mes, rango de fechas o completo (incluye histórico de carga masiva). Las fechas se formatean en zona local para no correr un día atrás.'),
  h2('11.2 Importar catálogo'),
  bullet('Excel con upsert por código de ítem (si el código existe, actualiza)'),
  bullet('También layout tipo proveedor: VENDOR_NUMBER / PART NUMBER / BASE_COST'),
  h2('11.3 Importar requerimientos (BASE GRAL)'),
  bullet('Script: node backend/scripts/cargar-base-req.mjs --dry-run | --apply'),
  bullet('Solo agrega REQ/OC que aún no existen; consecutivos con sufijo A/B/C válidos'),
  bullet('Si un ítem no está en catálogo, se guarda como ítem libre + nota'),
  bullet('Guía de recarga total en servidor: RECARGAR-BASE-GRAL-SERVIDOR.md (borra flujo REQ/OC; conserva usuarios, catálogo, proveedores, SMTP)'),
  h2('11.4 Scripts de usuarios'),
  table(
    ['Script', 'Uso'],
    [
      ['vincular-usuarios-import.mjs', 'Empareja historial import con usuarios activos (--apply)'],
      ['corregir-nombres-usuarios.mjs', 'Fusiona duplicados; conserva nombre corto (--apply). También corre al arrancar'],
    ],
    [3600, 5760]
  ),

  // 12
  h1('12. Infraestructura y despliegue (TI)'),
  h2('12.1 Requisitos'),
  table(
    ['Componente', 'Requisito'],
    [
      ['SO servidor app', 'Windows Server o Windows 10/11'],
      ['Node.js', '18 o superior (CI usa 22)'],
      ['MySQL', '8.x — base de datos ordenes_compra'],
      ['PM2', 'Proceso de producción: oc'],
      ['Navegadores', 'Chrome, Edge (últimas versiones)'],
    ],
    [3200, 6160]
  ),
  h2('12.2 Estructura de carpetas'),
  p('Sistema de Ordenes de Compra/'),
  bullet('.env                         — Credenciales (raíz, NO en git)'),
  bullet('backend/server.js            — Punto de entrada'),
  bullet('backend/src/                 — Código backend (incluye migraciones)'),
  bullet('backend/uploads/             — Cotizaciones, referencias, ítems'),
  bullet('backend/scripts/             — Import BASE GRAL, usuarios, reporte diario'),
  bullet('frontend/                    — Interfaz web'),
  bullet('empaquetar-deploy.ps1        — ZIP de actualización'),
  bullet('DESPLIEGUE-v1.9.4.md         — Guía de esta versión'),
  h2('12.3 Arranque'),
  p('cd backend'),
  p('npm install --omit=dev     # producción'),
  p('npm start                  # o: pm2 start oc / pm2 restart oc'),
  p('pm2 logs oc'),
  h2('12.4 Despliegue de actualizaciones'),
  p('Empaquetar en el equipo de desarrollo:'),
  p('powershell -ExecutionPolicy Bypass -File .\\empaquetar-deploy.ps1'),
  p('En el servidor:'),
  bullet('Respaldar carpeta, .env y dump MySQL'),
  bullet('pm2 stop oc'),
  bullet('Descomprimir deploy-oc-v1.9.4-*.zip sin pisar .env ni backend/uploads/'),
  bullet('cd backend && npm install --omit=dev'),
  bullet('pm2 start oc'),
  bullet('Verificar GET /api/health → "version": "1.9.4"'),
  note('El ZIP no incluye tests, node_modules, docs-generados ni uploads de usuario.'),
  h2('12.5 Qué se conserva siempre'),
  bullet('.env en la raíz del proyecto'),
  bullet('backend/uploads/ (archivos ya cargados)'),
  bullet('backend/src/config/departamentos.json si se editó en el servidor'),

  // 13
  h1('13. Variables de entorno (.env)'),
  p('El archivo .env debe estar en la RAÍZ del proyecto, no en backend/. Ver .env.example.'),
  table(
    ['Variable', 'Descripción', 'Ejemplo'],
    [
      ['PORT', 'Puerto HTTP', '3000'],
      ['NODE_ENV', 'Entorno', 'production'],
      ['CORS_ORIGIN', 'Origen permitido', 'http://servidor:3000'],
      ['FRONTEND_URL', 'Respaldo de URL pública (mejor en la UI)', 'http://servidor:3000'],
      ['DB_HOST / DB_PORT', 'Servidor MySQL', 'localhost / 3306'],
      ['DB_USER / DB_PASSWORD', 'Credenciales MySQL', '—'],
      ['DB_NAME', 'Base de datos', 'ordenes_compra'],
      ['JWT_SECRET', 'Secreto para tokens', 'Cadena larga aleatoria'],
      ['JWT_EXPIRES_IN', 'Duración sesión', '8h'],
      ['SECRET_ENCRYPTION_KEY', 'Cifrado SMTP (32 chars)', '—'],
      ['EMAIL_*', 'SMTP fallback si no hay config en BD', 'smtp.office365.com'],
      ['EMAIL_CC_COTIZACIONES', 'CC/Reply-To de RFQ (también en UI)', 'compras@…'],
      ['EMAIL_NOTIF_COMPRAS', 'Correos extra de aviso REQ (también en UI)', '—'],
      ['ADMIN_*', 'Referencia documental; no hay seed automático', '—'],
    ],
    [2800, 3800, 2760]
  ),

  // 14
  h1('14. Migraciones automáticas al arranque'),
  p('No se requiere SQL manual. Al iniciar, el backend aplica cambios ligeros de esquema y datos:'),
  bullet('Tabla recepcion_items y columna numero_recibo'),
  bullet('fecha_po en ordenes_compra; idioma_correo en cotizaciones'),
  bullet('Email de proveedor admite NULL'),
  bullet('Rol contabilidad → compras (filas y ENUM)'),
  bullet('Estado recibido en requerimientos.estado'),
  bullet('Tabla configuracion_app (URL pública, notificaciones, reporte diario)'),
  bullet('Fusión de usuarios duplicados del import (nombre corto + reasignación de REQ/OC)'),
  bullet('Unidades de medida (tabla + datos iniciales si falta)'),
  p('Si una migración no puede aplicarse, se registra un warning y el servidor continúa cuando es seguro.'),

  // 15
  h1('15. Monitoreo y mantenimiento'),
  h2('15.1 Health check'),
  p('GET /api/health — ejemplo:'),
  p('{ "estado": "ok", "version": "1.9.4", "frontend_url": "https://…", "notif_req_revision": true, "timestamp": "…" }'),
  h2('15.2 Logs'),
  bullet('PM2: pm2 logs oc'),
  bullet('Al iniciar debe aparecer conexión a MySQL: ordenes_compra y [migrate] Migraciones aplicadas'),
  bullet('Errores SMTP se registran pero no detienen la aplicación'),
  h2('15.3 Respaldos recomendados'),
  bullet('Base de datos ordenes_compra (dump periódico)'),
  bullet('Archivo .env (fuera del repositorio)'),
  bullet('Carpeta backend/uploads/'),
  bullet('backend/src/config/departamentos.json'),
  h2('15.4 Pruebas (equipo de desarrollo)'),
  bullet('Unitarias: cd backend && npm run test:ci (sin MySQL; también en GitHub Actions)'),
  bullet('Integración: npm run test:integration (BD ordenes_compra_test)'),
  bullet('E2E Playwright: workflow manual/nightly; no se instala en producción (omit=dev)'),

  // 16
  h1('16. Resolución de problemas'),
  table(
    ['Problema', 'Diagnóstico', 'Solución'],
    [
      ['App no arranca', 'pm2 logs oc — error MySQL', 'Verificar .env en raíz, credenciales DB, servicio MySQL activo'],
      ['Health no muestra 1.9.4', 'ZIP viejo o proceso no reiniciado', 'Confirmar package.json y pm2 restart oc'],
      ['Error FK al guardar SMTP', 'Token con id de usuario antiguo', 'Cerrar sesión y volver a entrar'],
      ['Correos no salen', 'SMTP o URL pública mal', 'Revisar Config SMTP; SECRET_ENCRYPTION_KEY; no usar localhost en URL pública'],
      ['Enlaces de correo a localhost', 'frontend_url vacío', 'Configuración SMTP → URL pública del servidor'],
      ['Áreas vacías', 'Falta departamentos.json', 'Copiar archivo y pm2 restart oc'],
      ['Login bloqueado', 'email_verificado = 0', 'Crear/editar desde Usuarios (queda verificado) o reenviar correo'],
      ['404 en archivos PDF', 'Falta uploads/', 'Restaurar backend/uploads/'],
      ['REQ de Isai/Juan no aparecen', 'Placeholder del Excel como dueño', 'v1.9.4 reasigna al login al arrancar; buscar por nombre corto'],
      ['Usuarios sin-correo en listado', 'Import sin fusionar', 'Reiniciar backend o correr corregir-nombres-usuarios.mjs --apply'],
      ['No se cierra la OC', 'Sin recepción o sin PO', 'Registrar recepción y capturar PO (o NA + fecha)'],
    ],
    [2200, 3200, 3960]
  ),

  new Paragraph({ children: [new PageBreak()] }),

  h1('Anexo A — Endpoints API principales'),
  table(
    ['Endpoint', 'Descripción'],
    [
      ['GET /api/health', 'Estado, versión, URL pública, flag de avisos'],
      ['POST /api/auth/login', 'Inicio de sesión'],
      ['GET /api/dashboard/stats', 'KPIs del dashboard'],
      ['GET /api/notificaciones/bandeja', 'Bandeja REQ / campana'],
      ['GET /api/notificaciones/bandeja-oc', 'Bandeja OC'],
      ['GET /api/requerimientos', 'Listado (filtros, solicitante, búsqueda por nombre)'],
      ['PATCH /api/requerimientos/:id/estado', 'Cambio de estado (incluye recibido)'],
      ['PATCH /api/requerimientos/:id/area-departamento', 'Corregir área/depto'],
      ['GET /api/ordenes-compra?estado=activas', 'OC pendientes de cerrar'],
      ['PATCH /api/ordenes-compra/:id/proveedor', 'Corregir proveedor de la OC'],
      ['GET /api/proveedores/export', 'Excel de proveedores'],
      ['GET /api/areas', 'Áreas y departamentos'],
      ['GET/PUT /api/config/smtp', 'SMTP (admin)'],
      ['PUT /api/config/notificaciones', 'URL pública, avisos REQ y reporte diario (admin)'],
    ],
    [4800, 4560]
  ),
  h1('Anexo B — Checklist post-despliegue v1.9.4'),
  bullet('GET /api/health → version 1.9.4 y frontend_url correcta (no localhost)'),
  bullet('Login solicitante ve Dashboard general y puede abrir REQ/OC ajenos en solo lectura'),
  bullet('Compras: bandeja Por recibir + botón Recibido; campana con badge'),
  bullet('Configuración SMTP: roles destinatarios, reporte diario, lista “Se envían a”'),
  bullet('Usuarios: no hay sin-correo / @import.local; Isai Fonseca y Juan Ocampo muestran su histórico'),
  bullet('Detalle OC: botón Cambiar proveedor visible para Compras'),
  h1('Anexo C — Contacto y escalamiento'),
  p('Administrador del sistema: [completar nombre y correo]'),
  p('Soporte TI: [completar área y extensión]'),
  p('Base de datos MySQL: [completar responsable DBA]'),
  p('Operación Compras: [completar responsable]'),
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
            new TextRun({ text: `  |  Documento ${VERSION_DOC} — Sistema ${VERSION_SIS} — ${FECHA}  |  Uso interno`, size: 18, color: '64748B' }),
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
const copiaDocs = path.join(__dirname, `Manual-de-Operaciones-Sistema-OC-v${VERSION_SIS}.docx`);
fs.writeFileSync(copiaDocs, buffer);
console.log('Generado:', OUT);
console.log('Copia:    ', copiaDocs);
