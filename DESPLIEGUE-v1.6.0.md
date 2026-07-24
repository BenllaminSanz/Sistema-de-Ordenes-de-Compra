# Despliegue v1.6.0 — checklist servidor

**Fecha:** 2026-07-24  
**Paquete:** `deploy-oc-v1.6.0-*.zip` (generado con `empaquetar-deploy.ps1`)

## Antes de tocar el servidor

1. **Respaldar base de datos** (mysqldump de `ordenes_compra`).
2. **Respaldar carpeta de la app** (o al menos `.env` y `backend/uploads/`).
3. Confirmar horario de mantenimiento (reinicio del proceso Node/PM2).

## Esta versión NO requiere

- Migraciones SQL nuevas
- Cambiar estructura de tablas
- Borrar datos

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

# 4) Dependencias
cd ruta\a\backend
npm install --omit=dev

# 5) Reiniciar
pm2 start oc   # o: pm2 restart oc
# si usan script propio: powershell -File C:\...\start-oc.ps1

# 6) Verificar
# Abrir: http://SERVIDOR:PUERTO/api/health
# Debe reportar versión 1.6.0 (si el health expone version)
```

## Post-despliegue (funcional)

| Prueba | Resultado esperado |
|--------|--------------------|
| Login admin / contabilidad | OK |
| Dashboard → Exportar Excel (año) | BASE GRAL con No. proveedor, Area, Departamento; filas REQ+OC |
| REQ → Exportar Excel | Mismas columnas |
| OC → Exportar Excel | Mismas columnas; filtros del listado |
| Catálogo moneda | Opción EUR |
| Catálogo → Cargar Excel Suessen | Layout VENDOR_NUMBER / PART NUMBER aceptado |
| Listado OC | Sin columna Requerimiento; sí No. OC |

## Datos solo en local (no viajan en el ZIP)

- Carga del catálogo **157- AMERICAN SUESSEN** hecha en local.  
  **En servidor:** Catálogo → Cargar Excel con `157- AMERICAN SUESSEN.xlsx` si deben existir esos ítems.

## Rollback rápido

1. Restaurar carpeta de código del respaldo previo.
2. `npm install --omit=dev` si cambió el lockfile.
3. Reiniciar PM2/servicio.
4. Si se tocó BD (no aplica en 1.6.0), restaurar dump.

## Git (opcional, en la máquina de desarrollo)

```powershell
git add -A
git status
git commit -m "release: v1.6.0 — reportes unificados, EUR, General REQ+OC"
git tag -a v1.6.0 -m "v1.6.0 — reportes unificados, EUR, General REQ+OC"
git push origin main
git push origin v1.6.0
```
