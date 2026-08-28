# Despliegue v1.9.0 — Sistema de Órdenes de Compra

Fecha: 2026-08-28

## Qué incluye esta versión

- **Dashboard general** para todos los roles (ya no “Mi panel”). El solicitante consulta REQ/OC de otros; no puede editarlos.
- **Usuarios duplicados** del import: se fusionan con la cuenta de login y se conserva el **nombre corto**.
- **Proveedor en la OC**: Compras/Admin lo corrige en el detalle, sin recotizar ni reenviar RFQ.
- Campana in-app al solicitante y resumen diario a Compras (si está activo en Configuración).

Detalle: [CHANGELOG.md](./CHANGELOG.md) sección **[1.9.0]**.

## Antes de tocar el servidor

1. Respaldar la carpeta de la app (al menos código + `backend/uploads/`).
2. Respaldar el `.env` de la raíz.
3. Respaldar MySQL:

```powershell
mysqldump -u USUARIO -p ordenes_compra > C:\Temp\backup_oc_pre_1.9.0.sql
```

4. Anotar cómo se reinicia el proceso (PM2, servicio Windows, etc.).

## Empaquetar

```powershell
powershell -ExecutionPolicy Bypass -File .\empaquetar-deploy.ps1
```

ZIP: `deploy-oc-v1.9.0-YYYYMMDD-HHMM.zip`

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

Al iniciar se unifican solos los usuarios duplicados del import (placeholders `@import.local` → cuenta de login, nombre corto). No hay SQL manual.

Para ver el plan de nombres sin escribir (opcional, antes o después):

```powershell
cd "C:\ruta\Sistema de Ordenes de Compra"
node backend/scripts/corregir-nombres-usuarios.mjs
```

Si el arranque ya aplicó los cambios, el dry-run dirá que no hay nada que fusionar.

### 5. Verificar

```powershell
Invoke-RestMethod http://localhost:PUERTO/api/health
```

Debe incluir `"version": "1.9.0"`.

En la UI:

1. Login **solicitante**: el título es **Dashboard** (no “Mi panel”); ve bandejas y REQ de otros; no aparecen Editar / Recibido / Generar OC en lo ajeno.
2. Login **Compras**: detalle de una OC → lápiz junto a **Proveedor** → cambiar sin recotizar.
3. Usuarios: nombres cortos de login; no deben verse duplicados `@import.local` en filtros.

## Variables de entorno

Las mismas de v1.8.0. Conservar el `.env` del servidor.

## Checklist

- [ ] Respaldo carpeta + `.env` + MySQL
- [ ] ZIP `deploy-oc-v1.9.0-*.zip` en el servidor
- [ ] Descomprimido sin pisar `.env` ni uploads
- [ ] `npm install --omit=dev`
- [ ] Proceso reiniciado
- [ ] `/api/health` → `1.9.0`
- [ ] Solicitante ve dashboard general
- [ ] Compras puede cambiar proveedor en una OC
- [ ] Filtros de usuario sin placeholders de import
