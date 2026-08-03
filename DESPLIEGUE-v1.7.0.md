# Despliegue v1.7.0 — Sistema de Órdenes de Compra

Fecha: 2026-08-03

## Qué incluye esta versión

- Rol **Compras** (migración automática desde `contabilidad`)
- Estado REQ **`recibido`** (acuse formal de Compras) + migración ENUM
- Bandeja: KPI, campana de notificaciones, correo al enviar a revisión
- Filtros/orden en listados, export Excel mejorado, RFQ/cotización ampliada
- Limpieza de archivos y dependencia nativa `bcrypt` (queda `bcryptjs`)

Detalle: [CHANGELOG.md](./CHANGELOG.md) sección **[1.7.0]**.

## Antes de tocar el servidor

1. **Respaldar** la carpeta completa de la app (o al menos código + `backend/uploads/`).
2. **Respaldar** el archivo `.env` de la raíz.
3. **Respaldar MySQL**:

```powershell
mysqldump -u USUARIO -p ordenes_compra > C:\Temp\backup_oc_pre_1.7.0.sql
```

4. Anotar cómo se reinicia el proceso (PM2, servicio Windows, IIS Node, etc.).

## Empaquetar en la máquina de desarrollo

Desde la raíz del repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\empaquetar-deploy.ps1
```

Se genera un ZIP tipo:

`deploy-oc-v1.7.0-YYYYMMDD-HHMM.zip`

El ZIP **no incluye**: `node_modules`, `.env`, `.git`, uploads de usuario, `docs-generados/`, ni otros ZIP.

## Actualizar el servidor

### 1. Detener la app (recomendado)

```powershell
pm2 stop oc
# o el nombre/comando que usen
```

### 2. Descomprimir sobre la instalación

- Extraer el ZIP **encima** de la carpeta actual de la app.
- **No sobrescribir** el `.env` de producción.
- **No borrar** `backend/uploads/` (PDFs de cotizaciones, referencias).

Si el ZIP trae carpetas `uploads` vacías, no reemplazan los archivos existentes si se descomprime con cuidado; en caso de duda, restaura `uploads` desde el respaldo.

### 3. Dependencias

```powershell
cd "C:\ruta\Sistema de Ordenes de Compra\backend"
npm install --omit=dev
```

### 4. Arrancar

```powershell
pm2 start oc
# o: npm start
```

Al iniciar, el backend ejecuta migraciones automáticas:

| Migración | Efecto |
|-----------|--------|
| Rol `contabilidad` → `compras` | Usuarios y ENUM de rol |
| ENUM `requerimientos.estado` + `recibido` | Habilita acuse formal |
| Otras ya existentes | email proveedor nullable, columnas auxiliares, etc. |

No hace falta ejecutar SQL a mano.

### 5. Verificar

```powershell
Invoke-RestMethod http://localhost:PUERTO/api/health
```

Debe responder algo como:

```json
{ "ok": true, "version": "1.7.0", ... }
```

En la UI:

1. Login con usuario Compras/Admin — sidebar y roles dicen **Compras** (no Contabilidad).
2. Dashboard: KPI **Por recibir**.
3. Campana en el topbar (bandeja).
4. Un REQ en **En revisión** → **Marcar como recibido** → luego Aprobar.
5. Footer/sidebar de versión (si se muestra) = **1.7.0**.

## Variables de entorno nuevas / útiles

| Variable | Obligatoria | Uso |
|----------|-------------|-----|
| `EMAIL_NOTIF_COMPRAS` | No | Correos extra al notificar REQ en revisión (además de usuarios compras/admin) |

El resto es el mismo `.env` de v1.6.x. Ver `.env.example`.

## Si algo falla

1. Detener la app.
2. Restaurar carpeta desde respaldo **o** reponer el ZIP anterior.
3. Restaurar dump SQL si se alteró la BD y hace falta retroceder.
4. Restaurar `.env` y `backend/uploads/`.
5. `npm install --omit=dev` + reiniciar.

## No incluido en este deploy

- Wipe / recarga completa BASE GRAL (es un procedimiento aparte: [RECARGAR-BASE-GRAL-SERVIDOR.md](./RECARGAR-BASE-GRAL-SERVIDOR.md))
- Material en `docs-generados/` (solo apoyo local / cliente)

## Checklist rápido

- [ ] Respaldo carpeta + `.env` + MySQL
- [ ] ZIP `deploy-oc-v1.7.0-*.zip` copiado al servidor
- [ ] Descomprimido sin pisar `.env` ni uploads reales
- [ ] `npm install --omit=dev` en `backend/`
- [ ] Proceso reiniciado
- [ ] `/api/health` → `1.7.0`
- [ ] Login + acuse `recibido` + campana OK
