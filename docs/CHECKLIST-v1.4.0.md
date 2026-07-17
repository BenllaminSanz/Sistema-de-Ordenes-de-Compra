# Checklist de cambios — v1.4.0

Ronda de observaciones del cliente + fases A–D.  
Fecha de entrega: 2026-07-14.

**Leyenda:** ✅ Hecho · ⏳ Pendiente / fuera de alcance de esta ronda

---

## Fase A — OC, PO y cierre de REQ

| # | Solicitud | Estado | Notas |
|---|-----------|--------|-------|
| A1 | REQ pasa a **cerrado** al generar OC (bug: quedaba en aprobado) | ✅ | También se corrigieron REQ históricos con OC abierta en aprobado |
| A2 | Columna **`fecha_po`** (fecha manual del PO en DTN) | ✅ | Migración automática al arrancar backend |
| A3 | PO obligatorio al crear OC, o **NA** si no tiene | ✅ | Modal al generar OC |
| A4 | Lista OC: **No. OC** primero; fecha PO (no confundir con fecha sistema) | ✅ | |
| A5 | Vista OC: fecha de **última modificación** | ✅ | `updated_at` |
| A6 | Recepción: flechas de 1 en 1; **permite decimales** (ej. 0.5) | ✅ | `step="any"` + flechas teclado ±1 |

---

## Fase B — Flujo REQ, límites e impresión

| # | Solicitud | Estado | Notas |
|---|-----------|--------|-------|
| B1 | Flujo 1:1 con estados actuales (borrador → revisión → aprobar/rechazar → cotizar → OC) | ✅ | Sin estados nuevos en BD |
| B2 | Eliminar REQ en **borrador** (solicitante dueño / contabilidad / admin) | ✅ | |
| B3 | Consecutivo solo al **enviar a revisión** | ✅ | Borrador sin consecutivo formal |
| B4 | Máximo **15 ítems** por REQ | ✅ | Backend + carrito + ítems libres |
| B5 | Más espacio en **firmas** de impresión | ✅ | |
| B6 | **Notas de contabilidad** editables en toda la vida de la OC | ✅ | Panel destacado + `PATCH /ordenes-compra/:id/notas` |
| B7 | Etiqueta “Nota de rechazo” → **“Nota”** | ✅ | |

---

## Fase C — Catálogo y maestros

| # | Solicitud | Estado | Notas |
|---|-----------|--------|-------|
| C1 | Mantener **filtros** al editar/actualizar ítem y volver | ✅ | sessionStorage; auto-limpieza si no hay resultados |
| C2 | Excel carga: **upsert por código** de ítem | ✅ | Inserta o actualiza |
| C3 | Descargar catálogo **mismo formato** de carga | ✅ | Botón Descargar Excel |
| C4 | **Unidades de medida** estandarizadas (combo + CRUD) | ✅ | Tabla `unidades_medida`; combo en catálogo y en ítem libre de REQ |
| C5 | Eliminar ítems **desactivados** (físico, sin borrar relacionados) | ✅ | Bloquea si hay FKs en REQ/cotización |
| C6 | Orden menú: **REQ → OC → Catálogo → Proveedores** | ✅ | |
| C7 | Áreas/deptos: **id = nombre visible** (versión servidor) | ✅ | `departamentos.json` v2 + migración de `requerimientos.area` |

---

## Fase D — Cotizaciones, correo y export OC

| # | Solicitud | Estado | Notas |
|---|-----------|--------|-------|
| D1 | **Marcador** si el correo de cotización ya se envió | ✅ | Columna Correo: Enviado / Sin enviar |
| D2 | Al enviar correo: elegir **español / inglés** | ✅ | |
| D3 | Quitar **“Datos de referencia:”** del cuerpo del mail | ✅ | |
| D4 | Adjuntos cotización: no solo PDF (**Word, Excel**, etc.) | ✅ | |
| D5 | **Exportar OCs a Excel** | ✅ | Botón en listado OC (contabilidad/admin) |

---

## Correcciones de la ronda

| # | Problema | Estado |
|---|----------|--------|
| Fix1 | Lista de catálogo vacía (filtros / stack overflow en `cargarCatalogo`) | ✅ |

---

## Despliegue en servidor (checklist operativo)

- [ ] Respaldo de BD y carpeta actual del servidor
- [ ] Descomprimir ZIP de deploy (conservar `.env` y `backend/uploads/`)
- [ ] `cd backend` → `npm install --omit=dev`
- [ ] Reiniciar servicio (pm2 / IIS Node / etc.)
- [ ] Verificar `GET /api/health` (versión **1.4.0**)
- [ ] Probar: generar OC (PO + cierre REQ), catálogo filtros/Excel, cotización correo ES/EN, export OC

### Migraciones automáticas al arrancar

Al iniciar el backend se aplican (si faltan):

- Columna `ordenes_compra.fecha_po`
- Tabla `unidades_medida` (+ semillas)

No requiere scripts SQL manuales para esta versión (salvo que quieras re-sincronizar áreas en otra BD: el JSON de áreas se despliega con el código).

---

## Fuera de esta entrega / opcional

| Tema | Nota |
|------|------|
| 4 REQ históricos con área `RS` | No están en el catálogo del servidor; se dejaron como están |
| Manual de operaciones actualizado | No regenerado en esta ronda |
| Flujo visual con más estados intermedios | Se mantuvo 1:1 con estados actuales |
