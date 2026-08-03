# Recargar TODO desde Excel BASE GRAL (servidor)

Objetivo: dejar el servidor **igual que local** — borrar REQ/OC actuales del flujo y cargar de nuevo el Excel de Contabilidad como fuente de verdad.

## Qué se borra / qué se conserva

| Se **borra** | Se **conserva** |
|--------------|-----------------|
| Requerimientos | Usuarios |
| Órdenes de compra | Catálogo |
| Cotizaciones | Proveedores |
| Recepciones | Áreas / deptos |
| Historial de esos flujos | SMTP / `.env` |
| Consecutivos de control (se regeneran) | Uploads de archivos |

## Archivo recomendado

Preferir el Excel **con estados de OC ya cotejados**:

- `BASE GRAL DE REQ. 23.07.26 (1).xlsx`  ← **recomendado**
- o `BASE GRAL DE REQ. 23.07.26.xlsx` si Contabilidad indica ese

Cópialo al servidor (ej. `C:\Temp\` o carpeta de la app).

## 0) Respaldo (obligatorio)

En el servidor, antes de nada:

```powershell
# Ejemplo mysqldump (ajusta user, host, nombre BD)
mysqldump -u USUARIO -p ordenes_compra > C:\Temp\backup_oc_antes_wipe_%date:~-4,4%%date:~-10,2%%date:~-7,2%.sql
```

También conviene copiar la carpeta de la app o al menos `.env`.

## 1) Código actualizado

Asegúrate de tener **v1.7.0+** (o el ZIP que incluye `backend/scripts/cargar-base-req.mjs`).

```powershell
# Verificar
Invoke-RestMethod http://localhost:PUERTO/api/health
```

## 2) Dry-run (simular, no escribe)

En el servidor:

```powershell
cd "C:\ruta\Sistema de Ordenes de Compra\backend"

node scripts/cargar-base-req.mjs --archivo "C:\Temp\BASE GRAL DE REQ. 23.07.26 (1).xlsx" --dry-run
```

Revisa en la salida: `totalFilas`, `porEstadoReq`, `porEstadoOc`, errores.

## 3) Wipe + carga real (todo nuevo desde Excel)

```powershell
cd "C:\ruta\Sistema de Ordenes de Compra\backend"

node scripts/cargar-base-req.mjs --archivo "C:\Temp\BASE GRAL DE REQ. 23.07.26 (1).xlsx" --wipe --apply
```

Al terminar deberías ver algo como:

- `wipe: true`
- `importados`: ~cantidad de filas del Excel (menos duplicados)
- `ocsCreadas`: OC según columna Estado
- `saltados: 0` (porque se borró todo antes)

## 4) Reiniciar app (si hace falta)

```powershell
pm2 restart oc
# o el nombre de tu proceso
```

## 5) Verificar en la UI

1. Login admin  
2. **Requerimientos** — cantidad alineada al Excel  
3. **Órdenes de compra** — PO y estados  
4. **Dashboard** año actual — KPI + Exportar Excel General  

## Alternativa por API (solo admin)

Si prefieres no usar el script, con sesión admin y token JWT:

```http
POST /api/requerimientos/importar?wipe=1
Authorization: Bearer <token_admin>
Content-Type: multipart/form-data
campo archivo: el .xlsx
```

El botón **Cargar Excel** de la UI **no** manda `wipe=1` (solo agrega N° nuevos). Para “todo de cero” usa el **script** o la API con wipe.

## Si algo sale mal

1. Detener la app  
2. Restaurar el dump SQL  
3. Reiniciar  

## Catálogo Suessen (aparte)

La recarga BASE GRAL **no** toca catálogo. Si también necesitas los ítems Suessen:

**Catálogo → Cargar Excel** → `157- AMERICAN SUESSEN.xlsx`
