# Despliegue v1.7.5 — Sistema de Órdenes de Compra

Fecha: 2026-08-07

## Qué incluye esta versión

- **Bandeja de trabajo** en el Dashboard (REQ): Por recibir / En proceso / Incompletos / Listos para OC
- Acciones rápidas: **Recibido** (acuse) e **Incompleto** (con nota); antigüedad en días (FIFO)
- **Bandeja OC** en Dashboard: Generadas / Distribuidas / En proceso / Recibidas / Sin PO
- Acciones rápidas OC: **Distribuir** y **En proceso**
- API `GET /api/notificaciones/bandeja-oc`
- Export Excel de proveedores (`GET /api/proveedores/export`)
- Filtros de REQ simplificados (Más filtros + Limpiar)

Detalle: [CHANGELOG.md](./CHANGELOG.md) sección **[1.7.5]**.

No hay migraciones de BD nuevas respecto a v1.7.0.

## Antes de tocar el servidor

1. **Respaldar** la carpeta completa de la app (o al menos código + `backend/uploads/`).
2. **Respaldar** el archivo `.env` de la raíz.
3. **Respaldar MySQL**:

```powershell
mysqldump -u USUARIO -p ordenes_compra > C:\Temp\backup_oc_pre_1.7.5.sql
```

4. Anotar cómo se reinicia el proceso (PM2, servicio Windows, IIS Node, etc.).

## Empaquetar en la máquina de desarrollo

Desde la raíz del repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\empaquetar-deploy.ps1
```

Se genera un ZIP tipo:

`deploy-oc-v1.7.5-YYYYMMDD-HHMM.zip`

El ZIP **no incluye**: `node_modules`, `.env`, `.git`, uploads de usuario, `docs-generados/`, ni otros ZIP.

Ya existe un paquete local: `deploy-oc-v1.7.5-20260807-1606.zip`.

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

Al iniciar, el backend ejecuta las migraciones automáticas ya existentes (v1.7.0 y anteriores). Esta versión no agrega SQL nuevo.

### 5. Verificar

```powershell
Invoke-RestMethod http://localhost:PUERTO/api/health
```

Debe responder algo como:

```json
{ "ok": true, "version": "1.7.5", ... }
```

En la UI:

1. Login con usuario Compras/Admin.
2. Dashboard: bandeja REQ (Por recibir / En proceso / Incompletos / Listos para OC).
3. Dashboard: bandeja OC (Generadas / Distribuidas / En proceso / Recibidas / Sin PO).
4. Footer/sidebar de versión = **1.7.5**.

## Variables de entorno

Sin variables nuevas. Conservar el mismo `.env` de v1.7.0. Ver `.env.example`.

## Si algo falla

1. Detener la app.
2. Restaurar carpeta desde respaldo **o** reponer el ZIP anterior.
3. Restaurar dump SQL si se alteró la BD y hace falta retroceder.
4. Restaurar `.env` y `backend/uploads/`.
5. `npm install --omit=dev` + reiniciar.

## No incluido en este deploy

- Wipe / recarga completa BASE GRAL (es un procedimiento aparte: [RECARGAR-BASE-GRAL-SERVIDOR.md](./RECARGAR-BASE-GRAL-SERVIDOR.md))
- Material en `docs-generados/` (solo apoyo local / cliente)
- Suite de pruebas automatizadas (queda en `[Unreleased]`, no forma parte de este corte)

## Checklist rápido

- [ ] Respaldo carpeta + `.env` + MySQL
- [ ] ZIP `deploy-oc-v1.7.5-*.zip` copiado al servidor
- [ ] Descomprimido sin pisar `.env` ni uploads reales
- [ ] `npm install --omit=dev` en `backend/`
- [ ] Proceso reiniciado
- [ ] `/api/health` → `1.7.5`
- [ ] Dashboard: bandejas REQ y OC visibles
