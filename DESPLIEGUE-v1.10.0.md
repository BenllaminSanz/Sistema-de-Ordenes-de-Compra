# Despliegue v1.10.0 — Sistema de Órdenes de Compra

Fecha: 2026-08-31

Título del requerimiento editable (Compras/Admin) y mapeo Excel: **Tipo de servicio** = título, **Status** = notas. Recargar BASE GRAL actualiza esos campos en los N° que ya existen.

El solicitante ya no ve Dashboard. Los Excel de REQ/OC salen con los filtros de la lista. El correo de las 7:00 incluye OC y se puede elegir de qué días (L–V por defecto).

Detalle: [CHANGELOG.md](./CHANGELOG.md) sección **[1.10.0]**.

## Actualizar

1. Respaldar `.env`, `backend/uploads/` y MySQL.
2. `pm2 stop oc`
3. Descomprimir `deploy-oc-v1.10.0-*.zip` **sin pisar** `.env` ni `backend/uploads/`.
4. `cd backend` → `npm install --omit=dev`
5. `pm2 start oc`

Verificar: `GET /api/health` → `"version": "1.10.0"`.

## Qué probar

- Login como solicitante: **no** aparece Dashboard; aterriza en Requerimientos.
- Listado REQ/OC del solicitante: primero lo suyo; filtro «Todos» + usuarios activos.
- Export Excel con filtros de la página (p. ej. solo PARTES o solo OC generadas). El solicitante también exporta OC.
- Detalle REQ en revisión: el dueño ve **Editar** y puede guardar; tras «Marcar como recibido» ya no.
- Configuración → días del reporte diario (Lun–Vie marcados; Sáb/Dom no) y el texto de la purga mensual.
- Configuración → **Enviar reporte de prueba a mi correo** (llega al Admin logueado, no a Araceli) y **Ejecutar purga ahora**.
- Enviar reporte diario: el correo menciona **órdenes de compra**.
- Detalle de un REQ ya enviado a revisión: Compras/Admin ven **✎ Editar** en el título; el solicitante no.
- Listado de requerimientos: columna **Título**.
- Recargar Excel BASE GRAL **sin wipe**: un N° existente debe actualizar título y notas; no debe duplicar el REQ.

Al arrancar, el backend agrega `configuracion_app.reporte_diario_dias` si falta (`1,2,3,4,5`), `purga_borradores` (activa por defecto) y `purga_borradores_ultimo`. Conservar `.env` y `backend/uploads/`.

Purga: el 1 de cada mes a las 7:00 (hora México) elimina REQ en **borrador**, **en revisión** e **incompleto** creados antes del mes anterior (septiembre → julio y más viejos). Recibidos y aprobados no se tocan. Si el servidor estuvo apagado el día 1, corre el siguiente día a las 7:00, una vez por mes. Admin la detiene o reactiva en **Configuración**.
