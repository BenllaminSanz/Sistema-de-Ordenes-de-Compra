# Despliegue v1.6.1 — checklist servidor

**Fecha:** 2026-07-24  
**Paquete:** `deploy-oc-v1.6.1-*.zip` (generado con `empaquetar-deploy.ps1`)

## Contenido de esta versión

1. **Proveedor sin correo** — email opcional al crear/editar/importar (tiendas / compra directa).
2. **Área / Depto** — la vista y los Excel muestran área padre + departamento según el catálogo (corrige import legacy que guardaba el depto en `area`).

## Antes de tocar el servidor

1. **Respaldar base de datos** (mysqldump de `ordenes_compra`).
2. **Respaldar carpeta de la app** (o al menos `.env` y `backend/uploads/`).
3. Confirmar horario de mantenimiento (reinicio del proceso Node/PM2).

## Esta versión

| Tema | Detalle |
|------|---------|
| Migración SQL | Ligera, **automática al arrancar**: `proveedores.email` pasa a admitir `NULL` si era `NOT NULL` |
| Borrado de datos | No |
| Dependencias nuevas | No |

## Conservar siempre en el servidor

| Ruta | Motivo |
|------|--------|
| `.env` (raíz o backend, según instal.) | DB, JWT, SMTP |
| `backend/uploads/` | Adjuntos de cotizaciones / referencias |

## Pasos de actualización

```powershell
# 1) Copiar el ZIP al servidor y descomprimir en carpeta temporal
# 2) Detener la app (ejemplo PM2)
pm2 stop oc   # o el nombre del proceso

# 3) Reemplazar código (sin pisar .env ni uploads)
#    - Copiar backend\src, backend\app.js, backend\package*.json
#    - Copiar frontend\
#    - NO sobrescribir .env ni backend\uploads\

# 4) Dependencias (si no cambió el lockfile, puede omitirse)
cd ruta\a\backend
npm install --omit=dev

# 5) Reiniciar
pm2 start oc   # o: pm2 restart oc

# 6) Verificar
# Abrir: http://SERVIDOR:PUERTO/api/health
# Debe reportar version: "1.6.1"
```

## Post-despliegue (funcional)

| Prueba | Resultado esperado |
|--------|--------------------|
| Login admin / contabilidad | OK |
| Proveedores → Nuevo → nombre + nº 5 dígitos, **sin correo** | Guarda OK; email muestra "—" |
| Crear proveedor "Walmart" sin email | OK |
| Listado REQ: columnas Área / Depto | Área = padre del catálogo; Depto = departamento (no al revés) |
| Exportar Excel General / REQ / OC | Columnas Area y Departamento coherentes con el catálogo |
| Dashboard pendientes / top deptos | Muestra área / depto resueltos |

## Rollback rápido

1. Restaurar carpeta de código del respaldo previo (v1.6.0).
2. Reiniciar PM2/servicio.
3. La columna `email` nullable puede quedarse (compatible hacia atrás); no hace daño.
4. Si se tocó BD de más, restaurar dump.

## Git (desarrollo)

```powershell
git push origin main
git push origin v1.6.1
```
