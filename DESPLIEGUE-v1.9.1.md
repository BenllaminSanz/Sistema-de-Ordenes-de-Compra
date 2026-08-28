# Despliegue v1.9.1 — Sistema de Órdenes de Compra

Fecha: 2026-08-28

Patch sobre **v1.9.0**: borra de verdad los usuarios `sin-correo*@import.local` del Excel (aunque no tengan un par de nombre) y los oculta en la pantalla Usuarios.

El resto es igual que [DESPLIEGUE-v1.9.0.md](./DESPLIEGUE-v1.9.0.md).

## Actualizar el servidor

1. Respaldar `.env`, `backend/uploads/` y MySQL.
2. Detener: `pm2 stop oc`
3. Descomprimir `deploy-oc-v1.9.1-*.zip` **sin pisar** `.env` ni uploads.
4. `cd backend` → `npm install --omit=dev`
5. Arrancar: `pm2 start oc`

Al iniciar se eliminan los placeholders `sin-correo`. Para forzar a mano:

```powershell
cd "C:\ruta\Sistema de Ordenes de Compra"
node backend/scripts/corregir-nombres-usuarios.mjs
node backend/scripts/corregir-nombres-usuarios.mjs --apply
pm2 restart oc
```

## Verificar

```powershell
Invoke-RestMethod http://localhost:PUERTO/api/health
```

Debe decir `"version": "1.9.1"`.

En **Usuarios**, desmarca “Solo activos” si hace falta: no deben aparecer correos `sin-correo…@import.local`.
