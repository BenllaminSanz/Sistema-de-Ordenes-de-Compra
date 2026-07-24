# Presentación al usuario — Sistema OC v1.5.0

**Fecha:** 24 de julio de 2026  
**Audiencia:** Contabilidad / operación (p. ej. Araceli)  
**Entorno de demo:** local validado; mismo proceso en servidor al desplegar  

---

## Mensaje en una frase

> Ya podemos **cargar la base histórica con la plantilla de Contabilidad**, **cerrar/actualizar OC** según el Excel de estados, y **trabajar el día a día** filtrando solo lo que sigue abierto — sin reimportar ni borrar lo que ya está bien.

---

## Qué se entrega (para el usuario)

| Tema | Qué verá |
|------|----------|
| **Plantilla Excel** | Mismo formato BASE GRAL (PO, Fecha, N°, Tipo, Estado, Status…) |
| **Importar REQ** | Solo agrega N° nuevos; no borra ni duplica |
| **Estados de OC** | Cerrada / Distribuida / Parcial (en proceso) / Cancelada |
| **Listado OC** | Primero PO DTN, luego fecha, luego requerimiento |
| **Filtros** | “Activos / no cerrados” (REQ) y “Activas / no concluidas” (OC) |
| **Paginación** | Barra fija abajo para cambiar de página sin perder el control |
| **Dashboard** | OC activas desglosadas, áreas, gasto, pendientes de atención |

---

## Números de referencia (local post-carga + sync)

| Indicador | Valor aprox. |
|-----------|----------------|
| Requerimientos cargados | ~1 921 |
| Órdenes de compra | ~1 708 |
| OC **cerradas** | ~1 382 |
| OC **activas** (distribuida + parcial) | ~326 (250 + 76) |
| REQ abiertos (no cerrados) | ~213 (revisión + aprobado + rechazado) |

*En servidor los totales pueden variar según lo que ya exista.*

---

## Guión de demo (15–20 min)

### 1. Dashboard (2 min)
1. Abrir **Dashboard** año 2026.  
2. Señalar: **OC activas**, desglose distribuidas vs parcial/proceso.  
3. Top **área/depto** (ya no vacío).  
4. Clic en el número de OC activas → listado filtrado.

### 2. Órdenes de compra (4 min)
1. Filtro **Activas / no concluidas** → ~326 filas (no se mezclan las cerradas).  
2. Columnas: **PO DTN | Fecha PO | Requerimiento**.  
3. Paginación **fija abajo** → pasar de página sin “perder” la barra.  
4. Abrir una **parcial** (`en_proceso`) y una **distribuida**.

### 3. Requerimientos (3 min)
1. Filtro **Activos / no cerrados** → solo lo que no está cerrado.  
2. Buscar un N° con sufijo **A/B** (varias OC del mismo REQ lógico).  
3. **Importar Excel** (modal): explicar plantilla y que **solo agrega faltantes**.

### 4. Carga histórica / operación (4 min) — *si preguntan el “cómo”*
| Acción | Cómo |
|--------|------|
| Primera carga o sumar Excel | UI **Importar Excel** o script `cargar-base-req.mjs --apply` |
| Cerrar/actualizar estados OC | Script `sincronizar-estados-oc.mjs --apply` con el Excel de estados (archivo tipo “BASE GRAL (1)”) |
| ¿Borra todo? | **No** en el flujo normal |
| Usuario no existe | Se crea **inactivo** (solo nombre) |
| Producto no está en catálogo | Ítem libre + nota; catálogo de productos se atiende en otra entrega |

### 5. Cierre y siguientes pasos (2 min)
- Validar en **servidor** el mismo proceso (sin wipe).  
- Semana siguiente: **REQ reales** por sistema.  
- Pendiente acordado: **layout de alta de productos** (catálogo).  
- Depurar REQ muy antiguos “en revisión” si Contabilidad lo indica.

---

## Checklist técnico antes de la reunión

- [ ] Backend corriendo (`npm start` / `npm run dev` en `backend`)  
- [ ] Login con admin o contabilidad  
- [ ] Dashboard carga sin error 500  
- [ ] Filtro OC activas muestra ~326 (o el total real del ambiente)  
- [ ] Filtro REQ activos muestra no-cerrados  
- [ ] Paginación fija visible en listados largos  
- [ ] Excel de ejemplo a mano: `BASE GRAL DE REQ. 23.07.26.xlsx` y `(1)` para estados  
- [ ] Respaldo BD disponible (p. ej. `Dump20260724.sql`)  

---

## Preguntas frecuentes

**¿Si vuelvo a subir el mismo Excel?**  
Solo se omiten los N° que ya existen. No se duplican.

**¿Cómo cierro en lote las OC que Contabilidad marcó Cerrada?**  
Con el archivo de estados (como el `(1)`) y el sync de estados OC — no con el import “solo nuevos”.

**¿Qué es Parcial?**  
En el sistema queda como OC **en proceso** (entrega incompleta / no cerrada).

**¿Cuándo va al servidor del cliente?**  
Tras esta presentación y su visto bueno: deploy v1.5.0 + primera sync controlada con backup.

---

## Archivos de apoyo

| Archivo | Uso |
|---------|-----|
| `docs/Presentacion-Sistema-OC-v1.5.0.pptx` | Diapositivas para la reunión |
| `CHANGELOG.md` → sección `[1.5.0]` | Detalle de cambios |
| `backend/scripts/cargar-base-req.mjs` | Carga incremental |
| `backend/scripts/sincronizar-estados-oc.mjs` | Cierre/actualización de OC |
