# Despliegue v1.9.3 — Sistema de Órdenes de Compra

Fecha: 2026-08-28

Patch: **buscar REQ y OC por el nombre actual del usuario**.

«Isai Fonseca» encuentra los REQ de **Jose Isai Fonseca**. El nombre de la cuenta de login es el que se muestra y el que se busca, no el nombre largo del Excel.

Al arrancar se reasignan otra vez los REQ del placeholder al usuario con correo corporativo (p. ej. `jose.fonseca@…`).

## Actualizar

1. Respaldar `.env`, uploads y MySQL.
2. `pm2 stop oc`
3. Descomprimir `deploy-oc-v1.9.3-*.zip` sin pisar `.env` ni `backend/uploads/`.
4. `cd backend` → `npm install --omit=dev`
5. `pm2 start oc`

Verificar: `GET /api/health` → `"version": "1.9.3"`.

En Requerimientos, busca `Isai Fonseca` (o el nombre corto actual): deben salir todos sus REQ.
