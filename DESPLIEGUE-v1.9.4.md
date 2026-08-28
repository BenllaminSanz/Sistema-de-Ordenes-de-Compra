# Despliegue v1.9.4 — Sistema de Órdenes de Compra

Fecha: 2026-08-28

Patch: **los REQ del Excel van a la cuenta de login**, no se quedan en `Juan Carlos Ocampo Reyna` / `Jose Isai Fonseca Vivas` (`sin-correo*@import.local`).

En v1.9.0–1.9.3 el script elegía como canónico al placeholder si tenía más REQ. Al actualizar, se invierte esa regla: gana el correo corporativo; se reasignan REQ/OC; se borra el placeholder. **No se elimina ningún requerimiento ni OC.**

En local (copia del respaldo del servidor) quedó:

| Cuenta de login | REQ | OC |
|---|---:|---:|
| Isai Fonseca | 242 | 203 |
| Juan Ocampo | 171 | 154 |

Totales intactos: 1973 REQ, 1735 OC. Cero REQ/OC con `solicitante_id` inexistente.

## Actualizar

1. Respaldar `.env`, uploads y MySQL.
2. `pm2 stop oc`
3. Descomprimir `deploy-oc-v1.9.4-*.zip` sin pisar `.env` ni `backend/uploads/`.
4. `cd backend` → `npm install --omit=dev`
5. `pm2 start oc`

Verificar: `GET /api/health` → `"version": "1.9.4"`.

En Requerimientos, busca `Isai Fonseca` y `Juan Ocampo`: deben salir todos sus REQ. No deben quedar usuarios `sin-correo` ni nombres largos del Excel como solicitante.
