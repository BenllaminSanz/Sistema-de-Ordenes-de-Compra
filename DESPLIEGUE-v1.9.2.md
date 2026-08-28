# Despliegue v1.9.2 — Sistema de Órdenes de Compra

Fecha: 2026-08-28

Patch: **editar cotización con OC ya generada**.

Antes, al abrir la cotización seleccionada desde el REQ, el sistema decía “ya hay una OC generada” y no dejaba cambiar el proveedor. Ahora Compras puede **Corregir proveedor** ahí; se actualiza también la OC, sin recotizar.

En el detalle de la OC el botón se llama **Cambiar proveedor**.

Incluye v1.9.1 (purga `sin-correo`) y v1.9.0 (dashboard general).

## Actualizar

1. Respaldar `.env`, uploads y MySQL.
2. `pm2 stop oc`
3. Descomprimir `deploy-oc-v1.9.2-*.zip` sin pisar `.env` ni `backend/uploads/`.
4. `cd backend` → `npm install --omit=dev`
5. `pm2 start oc`

Verificar: `GET /api/health` → `"version": "1.9.2"`.

Comprobar: REQ con OC → cotización seleccionada → **Corregir proveedor**. O detalle OC → **Cambiar proveedor**.
