# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

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
