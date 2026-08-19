# Despliegue v1.8.0 — Sistema de Órdenes de Compra

Fecha: 2026-08-19

## Qué incluye esta versión

- Notas/Detalles editables en el REQ (Compras/Admin)
- Corregir proveedor y moneda de la cotización después de aprobar (si aún no hay OC)
- Fechas de reporte sin desfase de un día
- Export de catálogo respeta el filtro de proveedor
- Reportes por año, **mes**, **rango de fechas** o **completo** (incluye histórico de carga masiva)
- Configuración SMTP: URL pública de correos, activar/desactivar avisos de REQ en revisión, elegir roles (Compras y/o Admin) y ver destinatarios

Detalle: [CHANGELOG.md](./CHANGELOG.md) sección **[1.8.0]**.

## Antes de tocar el servidor

1. Respaldar la carpeta de la app (al menos código + `backend/uploads/`).
2. Respaldar el `.env` de la raíz.
3. Respaldar MySQL:

```powershell
mysqldump -u USUARIO -p ordenes_compra > C:\Temp\backup_oc_pre_1.8.0.sql
```

4. Anotar cómo se reinicia el proceso (PM2, servicio Windows, etc.).

## Empaquetar

```powershell
powershell -ExecutionPolicy Bypass -File .\empaquetar-deploy.ps1
```

ZIP: `deploy-oc-v1.8.0-YYYYMMDD-HHMM.zip`

No incluye: `node_modules`, `.env`, `.git`, uploads de usuario, suite de pruebas local.

## Actualizar el servidor

### 1. Detener

```powershell
pm2 stop oc
```

### 2. Descomprimir encima de la instalación

- **No sobrescribir** el `.env` de producción.
- **No borrar** `backend/uploads/`.

### 3. Dependencias

```powershell
cd "C:\ruta\Sistema de Ordenes de Compra\backend"
npm install --omit=dev
```

### 4. Arrancar

```powershell
pm2 start oc
```

Al iniciar se crea sola la tabla `configuracion_app` (URL pública + notificaciones). No hay SQL manual.

### 5. Verificar

```powershell
Invoke-RestMethod http://localhost:PUERTO/api/health
```

Debe incluir `"version": "1.8.0"`. Revisa también `frontend_url`.

En la UI (admin → **Configuración SMTP**):

1. **URL pública**: pulsa *Usar esta dirección* (si aparece) o escribe `https://tu-servidor` → Guardar.
2. **Quién recibe**: deja **Compras** y desmarca **Admin** si el cliente no quiere avisos a administradores.
3. Envía un REQ de prueba a revisión y confirma que el enlace del correo **no** apunta a `localhost:3000`.

## Variables de entorno

| Variable | Obligatoria | Uso |
|----------|-------------|-----|
| `FRONTEND_URL` | No si se guarda en la UI | Respaldo de la URL pública de correos |

El resto es el mismo `.env` de v1.7.5.

## Usuarios / carga masiva

**No** hace falta wipe + reimport para “usuarios sin REQ”. Los inactivos son placeholders del Excel. Si un usuario real no ve su historial: alinear nombres y correr `node backend/scripts/vincular-usuarios-import.mjs` (primero sin `--apply`). Ver [RECARGAR-BASE-GRAL-SERVIDOR.md](./RECARGAR-BASE-GRAL-SERVIDOR.md) solo si realmente van a recargar el histórico.

## Checklist

- [ ] Respaldo carpeta + `.env` + MySQL
- [ ] ZIP `deploy-oc-v1.8.0-*.zip` en el servidor
- [ ] Descomprimido sin pisar `.env` ni uploads
- [ ] `npm install --omit=dev`
- [ ] Proceso reiniciado
- [ ] `/api/health` → `1.8.0`
- [ ] Configuración: URL pública del servidor (no localhost)
- [ ] Roles de notificación según el cliente (p. ej. solo Compras)
- [ ] Un correo de REQ en revisión abre el detalle en el servidor
