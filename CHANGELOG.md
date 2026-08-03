# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [1.7.0] — 2026-08-03

Entrega operativa: rol Compras, bandeja/notificaciones, acuse formal `recibido` y mejoras de listados/export/cotización.

### Añadido
- **Estado `recibido`** (acuse formal de Compras): `en_revisión` → **Marcar como recibido** → aprobar / incompleto / cancelar
- Migración al arranque: ENUM `requerimientos.estado` incluye `recibido`
- **KPI “Por recibir”** en Dashboard → `requerimientos.html?estado=en_revision`
- **Campana de notificaciones** en el topbar (REQ en revisión/recibidos; badge; enlace al detalle)
- **Correo a Compras/Admin** cuando un REQ pasa a `en_revisión` (usuarios rol compras/admin + opc. `EMAIL_NOTIF_COMPRAS`)
- **Compras/Admin**: regreso a estados anteriores en el flujo pre-OC y en OC
  - REQ: desde **aprobado** → *Regresar a recibido / pendientes*; desde **incompleto** → *Enviar a revisión* o *Cancelar REQ*
  - OC: *Cancelar* desde **generada**; *Regresar a generada / distribuida / en proceso* en el ciclo activo
- **Compras/Admin**: corregir **área y departamento** en un REQ ya creado (cualquier estado) desde el detalle → *Corregir*
- **Filtro por usuario/solicitante** en listados de **Requerimientos** y **Órdenes de Compra** (compras/admin)
- **Orden por columnas** en listados de REQ y OC: clic en cabecera con flechas ↑/↓ (asc/desc)
- **Último estatus / nota** en detalle de REQ (p. ej. cotización enviada al proveedor con fecha); también en el historial
- Renombre de **departamento** propaga el cambio a requerimientos históricos (igual que áreas)
- API: `PATCH /requerimientos/:id/area-departamento`
- API: `GET /api/notificaciones/bandeja`

### Cambiado
- Rol de usuario **`contabilidad` → `compras`** en todo el sistema (API, permisos, UI y etiquetas «Compras»)
- Migración al arranque: usuarios con rol contabilidad pasan a compras; tokens antiguos se normalizan
- **Export Excel de requerimientos**: incluye **proveedor** (OC → cotización → catálogo) y **detalle del REQ** en “Tipo de servicio”
- Acciones de compras/admin alineadas al flujo de negocio (pre-OC / post-OC)
- Al generar OC con PO **NA**, la **fecha es obligatoria**; también al editar PO→NA en el detalle de OC
- **Exportar Excel del catálogo** respeta los filtros de la vista (proveedor, tipo, búsqueda y solo activos)
- **Cotización / RFQ**:
  - **SERVICIOS** (ítems de catálogo o libres) siempre pueden cotizarse y enviar correo
  - **PARTES sin precio de referencia** habilitan cotización y RFQ
  - El correo RFQ incluye **No. de parte** (`codigo` / `codigo_catalogo`)
- Tras **Generar OC** se permanece en el detalle del REQ (no redirige al listado de OC)

### Corregido
- Export de catálogo descargaba el catálogo completo aunque hubiera filtro de proveedor
- Historial de REQs no visible para solicitantes reales tras import Excel (emparejamiento de usuarios)
- Alias fijo de import para **Jose Isai Fonseca** (`jose.fonseca@parkdalemills.com`)
- Catálogo en REQ: al elegir proveedor no listaba sus ítems hasta buscar a mano

### Limpieza
- Eliminados ZIP de deploy y notas `DESPLIEGUE-v1.6.x.md` antiguos
- Eliminada carpeta `docs/` (basura `node_modules`)
- Eliminados: logo JPG duplicado, `frontend/js/pages/requerimientos.js` (obsoleto),
  `backend/src/config/departamentos.js` (wrapper sin uso), `backend/src/utils/syncEstadosOc.js` (sin entrypoint),
  dependencia nativa `bcrypt` (solo se usa `bcryptjs`)
- Documentación y script de empaquetado actualizados para v1.7.0

### Notas de despliegue
- **Migraciones automáticas al arranque** (sin SQL manual):
  1. `usuarios.rol`: `contabilidad` → `compras`
  2. `requerimientos.estado`: se agrega valor ENUM `recibido`
- Conservar en el servidor: `.env` y `backend/uploads/`
- Variable opcional nueva: `EMAIL_NOTIF_COMPRAS` (correos extra al notificar REQ en revisión)
- Tras desplegar: `cd backend && npm install --omit=dev` y reiniciar el proceso Node/PM2
- Verificar: `GET /api/health` → `"version":"1.7.0"`

## [1.6.2] — 2026-07-24

Registrar cotizaciones sin enviar correo al proveedor (cotización ya recibida / compra en tienda).

### Añadido
- Al guardar cotización: opción **Solo registrar (sin correo)** (fecha hoy o futura)
- API: flag `omitir_envio_correo` / `solo_registro` en `POST /cotizaciones`

### Cambiado
- Modal de confirmación: el envío RFQ ya no es la única vía cuando la fecha es hoy
- Etiqueta «Fecha de envío» → **Fecha** (cotización recibida o RFQ)
- Aviso en el formulario de cotización sobre registrar vs enviar

### Notas de despliegue
- Sin migración de BD
- Conservar `.env` y `backend/uploads/`
- Reiniciar Node/PM2

## [1.6.1] — 2026-07-24

Correcciones operativas: proveedores sin correo y vista Área/Departamento alineada al catálogo.

### Añadido
- Proveedores con **correo opcional** (p. ej. tiendas de compra directa: Walmart)
- Migración automática: `proveedores.email` admite `NULL` al arrancar el backend

### Corregido
- **Vista Área / Depto** en listados, detalle, dashboard y reportes Excel:
  - Datos legacy con depto guardado en `area` se muestran con área padre + depto
  - Campos invertidos se corrigen en la respuesta
  - Filtros de área/depto contemplan import histórico
- Import Excel legacy: resuelve área padre desde el catálogo al guardar depto

### Notas de despliegue
- Migración ligera al arranque (nullable de email de proveedor); no borra datos
- Conservar en el servidor: `.env`, `backend/uploads/`
- Reiniciar Node/PM2 tras desplegar para aplicar migración y código

## [1.6.0] — 2026-07-24

Reportes unificados, moneda EUR y mejoras de UI para operación diaria.

### Añadido
- **Moneda EUR** en catálogo, cotizaciones y carga Excel de catálogo
- Layout de import catálogo tipo proveedor (**VENDOR_NUMBER / PART NUMBER / BASE_COST**, p. ej. AMERICAN SUESSEN)
- Helper frontend **ExcelUI**: botones y descargas de Excel homologados

### Cambiado
- **Reportes General / REQ / OC** con el **mismo layout BASE GRAL**:
  `No. proveedor`, `Proveedor`, `Area`, `Departamento` (en lugar de Depto/Centro único)
- **General (Dashboard)**: incluye **REQ del año + OC del año** (deduplica por N°; prioriza fila de OC)
- Botones Excel unificados: **Exportar Excel** / **Cargar Excel** con estado Generando…/Importando…
- Listado OC: se quita columna **Requerimiento**; se mantiene **No. OC** (REQ sigue en el detalle)
- Import REQ acepta layout unificado y el Excel legado de Contabilidad (Depto)

### Notas de despliegue
- **Sin migración de base de datos**
- Conservar en el servidor: `.env`, `backend/uploads/`
- Si se cargó catálogo Suessen solo en local, reimportar el Excel en el servidor (Catálogo → Cargar Excel)

## [1.5.0] — 2026-07-24

Entrega post-carga histórica BASE GRAL + operación con estados de OC reales.

### Añadido
- **Plantilla Excel BASE GRAL** para importar requerimientos (layout Contabilidad: PO → Fecha → N° → … → Estado → Status)
- Import que **solo agrega** REQ/OC que aún no existen (no borra; consecutivos con sufijo **A/B/C** válidos)
- Usuarios solicitantes inexistentes se crean **inactivos** (solo nombre; sin correo real)
- Validación de catálogo al importar: si no hay match, ítem libre + nota
- Script `backend/scripts/cargar-base-req.mjs` (dry-run / apply; wipe solo excepcional)
- Filtro **Activos / no cerrados** en listado de requerimientos
- Paginación **fija al pie** de pantalla en REQ y OC
- Dashboard: depto vía área del Excel, ciclo req→fecha PO, desglose OC activas, monedas USD/EUR

### Cambiado
- Listado OC: columnas **PO DTN → Fecha PO → Requerimiento → No. OC** (anchos fijos; PO como referencia)
- Filtro OC renombrado a **Activas / no concluidas**
- Export Excel de REQ alineado al layout BASE GRAL
- Dashboard KPIs por año + links a listados filtrados

### Corregido
- Dashboard: error `ONLY_FULL_GROUP_BY` en top de áreas/deptos
- Dashboard: top departamentos vacío cuando el depto venía solo en `area` (import)

## [1.4.1] — 2026-07-17

Patch post-reunión de entrega v1.4.0 (correcciones y mejoras de usabilidad).

### Añadido
- Idioma ES/EN con menú formal al envío automático/programado y reenvío de cotización; se guarda en `cotizaciones.idioma_correo`
- No. de recibo por ítem en cada recepción (`recepcion_items.numero_recibo`)
- Reporte Excel de OC desglosado por ítem (código, cantidades, importe, No. de recibo)
- Acciones de catálogo en vista **por proveedor**: editar en modal, activar/desactivar y eliminar desactivados (sin salir de la vista)

### Cambiado
- Unidades en cotización homologadas con el catálogo de unidades de medida (UDM)
- Listado de OC: columna PO DTN muestra el valor o **—** si no hay registro
- Timeouts SMTP más cortos; aviso en UI si la cotización se guardó pero el correo falló (p. ej. red/SMTP)

### Corregido
- Carga Excel de catálogo: código = columna C (antes podía tomar la descripción de la D)

## [1.4.0] — 2026-07-14

### Añadido
- PO DTN + `fecha_po` al generar OC (o NA sin PO)
- Notas de contabilidad editables en OC (panel destacado)
- Unidades de medida estandarizadas (tabla + CRUD + combos en catálogo e ítems libres de REQ)
- Export/import Excel de catálogo con upsert por código de ítem
- Eliminación física de ítems de catálogo desactivados (sin borrar históricos relacionados)
- Export Excel de órdenes de compra desde el listado
- Idioma ES/EN al enviar correo de cotización
- Marcador de correo de cotización enviado / sin enviar
- Adjuntos de cotización: PDF, Word, Excel e imágenes (no solo PDF)
- Límite de 15 ítems por REQ; consecutivo solo al enviar a revisión; borrar borrador

### Cambiado
- REQ pasa a **cerrado** al generar OC (corrige bug de estado aprobado)
- Lista OC: No. OC, fecha PO y última modificación
- Menú: REQ → OC → Catálogo → Proveedores
- Áreas: `id` = nombre visible (JSON servidor); migración de REQ históricos
- Recepción: permite decimales; flechas de teclado ±1
- Correo RFQ sin bloque “Datos de referencia:”
- Impresión REQ: más espacio en firmas
- Filtros de catálogo persistentes al editar ítems

### Corregido
- Catálogo vacío por filtros residuales / recursión en `cargarCatalogo`
- Validación HTML que bloqueaba cantidades 0.5 en recepción

## [1.3.2] — 2026-07-10

### Añadido
- Plantilla RFQ mejorada para envío de cotizaciones
- Nº de ítem al generar órdenes de compra
- Líneas de OC alineadas al catálogo

### Cambiado
- Ajustes en generación de OC y modal de cotización
- Mejoras en servicio de correo y plantillas asociadas

## [1.3.1] — 2026-07-07

### Corregido
- Correcciones en el sistema de consecutivos (REQ con año y tipo)

### Añadido
- Scripts SQL y de migración para consecutivos (`001_crear_consecutivos_control.sql`, `002_migrar_consecutivos.sql`, `migrar-consecutivos.mjs`)

## [1.3.0] — 2026-07-07

### Añadido
- Consecutivos con año y tipo: REQ `2026S-001` (servicios), `2026P-001` (partes)
- Carrito y borrador de REQ al navegar al catálogo (restauración al volver)
- Catálogo por proveedor (`catalogo-proveedores.html`)
- Búsqueda de proveedor por código o nombre (REQ, catálogo, cotización, OC)
- Branding de correos con logo; cantidades enteras en emails
- Script de empaquetado para deploy (`empaquetar-deploy.ps1`)

### Cambiado
- Impresión de REQ: logo, subtítulo, subtotales, total y ajuste a una página
- Cotizaciones: envío automático si la fecha es hoy; PDF adjunto opcional
- Bloqueo de guardado de REQ vacío; cancelar aprobado sin OC
- Cotizar: Nº ítem opcional; notas del REQ prellenan notas de cotización

## [1.2.1] — 2026-07-03

### Corregido
- Ajustes menores en rutas y controladores de requerimientos
- Correcciones en catálogo y flujo de index de requerimientos

## [1.2.0] — 2026-07-03

### Añadido
- Carrito compartido entre catálogo y requerimientos (un solo proveedor por REQ)
- Utilidades de consecutivos
- Mejoras en modelos de recepciones y cotizaciones

### Cambiado
- Impresión REQ: firmas con cargo (Gerente de Planta / Jefe Inmediato)
- Cotización → catálogo: Nº ítem pasa como código al formalizar
- Recepciones: bloqueo en OC cerrada; recálculo de pendientes al editar
- Cierre de OC: modal para capturar PO DataTextNow cuando falta

## [1.1.2] — 2026-06-26

### Cambiado
- Ajustes de configuración de base de datos, entorno y SMTP

## [1.0.0] — 2026-06-26

### Añadido
- Entrega formal del Sistema de Órdenes de Compra
- Dashboard con KPIs, aging de requerimientos y OC activas
- Áreas y departamentos alineados a DataTextNow
- Flujo completo: Requerimientos → Cotizaciones → OC → Recepciones
- Homologación visual de badges y estados
- Filtro `estado=activas` en listado de órdenes de compra
- Configuración SMTP desde panel de administración
- Verificación de correo al registrarse
- Roles: Admin, Contabilidad (hoy **Compras**), Solicitante
