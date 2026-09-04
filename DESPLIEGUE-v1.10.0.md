# Despliegue v1.10.0 — Sistema de Órdenes de Compra

Fecha: 2026-09-01 (misma versión; ZIP actualizado)

Título del requerimiento editable (Compras/Admin) y mapeo Excel: **Tipo de servicio** = título, **Status** = notas. Recargar BASE GRAL actualiza esos campos en los N° que ya existen.

El solicitante ya no ve Dashboard. Los Excel de REQ/OC salen con los filtros de la lista. El correo de las 7:00 incluye OC y se puede elegir de qué días (L–V por defecto).

**En este ZIP (respecto al 31-ago):** la purga **cancela** (rechazado) los REQ con N° en vez de borrarlos, para no dejar huecos ni que el Excel los vuelva a crear. Precio sugerido en ítem libre y montos estimados del Excel. El historial de la purga queda a nombre del Admin (en el servidor `cambiado_por` no puede ir vacío). El reporte diario nombra los REQ por su estado real (En revisión, Recibido, Incompleto, Aprobado).

Detalle: [CHANGELOG.md](./CHANGELOG.md) sección **[1.10.0]**.

## Actualizar

1. Respaldar `.env`, `backend/uploads/` y MySQL.
2. `pm2 stop oc`
3. Descomprimir `deploy-oc-v1.10.0-*.zip` **sin pisar** `.env` ni `backend/uploads/`.
4. `cd backend` → `npm install --omit=dev`
5. `pm2 start oc`

Verificar: `GET /api/health` → `"version": "1.10.0"`.

Al arrancar, el backend agrega si faltan: `configuracion_app.reporte_diario_dias` (`1,2,3,4,5`), `purga_borradores` (activa), `purga_borradores_ultimo`, `requerimiento_items_libres.precio_sugerido`, `requerimientos.monto_estimado` y `moneda_estimada`. Conservar `.env` y `backend/uploads/`.

## Qué probar

- Login como solicitante: **no** aparece Dashboard; aterriza en Requerimientos.
- Listado REQ/OC del solicitante: primero lo suyo; filtro «Todos» + usuarios activos.
- Export Excel con filtros de la página (p. ej. solo PARTES o solo OC generadas). El solicitante también exporta OC.
- Detalle REQ en revisión: el dueño ve **Editar** y puede guardar; tras «Marcar como recibido» ya no.
- Configuración → días del reporte diario (Lun–Vie marcados; Sáb/Dom no) y el texto de la purga mensual (**cancela** con N°, borra solo borradores sin número).
- Configuración → **Enviar reporte de prueba a mi correo** (llega al Admin logueado, no a Araceli) y **Ejecutar purga ahora**.
- Enviar reporte diario: el correo menciona **órdenes de compra**. Los REQ dicen **En revisión / Recibido / Incompleto / Aprobado** (no “Por recibir” ni “Listos para OC”).
- Detalle de un REQ ya enviado a revisión: Compras/Admin ven **✎ Editar** en el título; el solicitante no.
- Listado de requerimientos: columna **Título**.
- Recargar Excel BASE GRAL **sin wipe**: un N° existente debe actualizar título y notas; **no debe duplicar** el REQ ni reabrir uno cancelado. El **título** = columna **Descripción del ítem** (no el consecutivo).
- Excel de OC: una OC con 3 recepciones sale en **3 filas**; **% entrega** es el de esa entrega (no el acumulado); columnas **Fecha entrega** y **No. recibo**.
- Ítem nuevo (fuera de catálogo): campo **Precio sugerido** opcional.

## Purga mensual

El 1 de cada mes a las 7:00 (hora México):

- **En revisión e incompleto con N°** → pasan a **cancelado** (`rechazado`). El consecutivo se conserva.
- **Borradores sin número** → se eliminan.
- Recibidos, aprobados y con OC no se tocan.

Si el servidor estuvo apagado el día 1, corre el siguiente día a las 7:00, una vez por mes. Admin la detiene o reactiva en **Configuración**.

Si el Excel ya había vuelto a crear N° que se habían borrado (ZIP anterior), **Ejecutar purga ahora** los cancela otra vez si siguen en revisión o incompletos y son de julio o más viejos. Los que el Excel dejó cerrados / con OC hay que cancelarlos a mano.
