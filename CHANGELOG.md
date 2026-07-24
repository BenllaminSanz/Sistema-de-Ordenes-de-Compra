# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

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
- Script `backend/scripts/sincronizar-estados-oc.mjs` para **actualizar estados de OC** desde Excel (Cerrada / Distribuida / **Parcial→en_proceso** / Cancelada)
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
- Actualización del manual de operaciones

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

### Añadido
- Manual de operaciones (`docs/Manual-de-Operaciones-Sistema-OC.docx`)
- Generador del manual (`docs/generar-manual-operaciones.mjs`)

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
- Roles: Admin, Contabilidad, Solicitante

---

[1.3.2]: https://github.com/BenllaminSanz/Sistema-de-Ordenes-de-Compra/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/BenllaminSanz/Sistema-de-Ordenes-de-Compra/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/BenllaminSanz/Sistema-de-Ordenes-de-Compra/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/BenllaminSanz/Sistema-de-Ordenes-de-Compra/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/BenllaminSanz/Sistema-de-Ordenes-de-Compra/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/BenllaminSanz/Sistema-de-Ordenes-de-Compra/compare/v1.0.0...v1.1.2
[1.0.0]: https://github.com/BenllaminSanz/Sistema-de-Ordenes-de-Compra/releases/tag/v1.0.0
