# Sistema de Órdenes de Compra

Sistema web para la gestión completa del proceso de compras: **Requerimientos → Cotizaciones → Órdenes de Compra → Recepciones**.

## Descripción

Aplicación full-stack que permite a las empresas gestionar de forma controlada y trazable todo el flujo de procurement interno.

El sistema incluye control de roles, historial de cambios de estado, generación de consecutivos, carga de documentos (PDFs de cotizaciones) y notificaciones por correo.

## Características Principales

- **Gestión de Requerimientos** con flujo de aprobación (borrador → en revisión → aprobado/rechazado/incompleto)
  - Exclusivo (no híbrido): un requerimiento es **SOLO** ítems del catálogo (sin cotización necesaria) **O** ítems en "texto libre" (requiere cotización para formalizarlos en catálogo). Regla fuertemente enforceada en UI, validaciones, modelos y DB. Libres se preservan como histórico. (Ver sección "Flujo del Sistema" más abajo para diagrama y detalles).
- **Solicitud y comparación de Cotizaciones** con items, precios y archivos adjuntos
- **Generación de Órdenes de Compra**
- **Control de Recepciones** de mercancía
- **Historial completo** de cambios de estado por entidad
- **Gestión de Proveedores**
- **Usuarios con roles** (Admin, Contabilidad, Solicitante)
- **Verificación de correo electrónico** al registrarse
- **Carga de archivos** (PDFs de cotizaciones)
- **Notificaciones por correo**

## Stack Tecnológico

**Backend**
- Node.js + Express 5
- MySQL (mysql2/promise)
- JWT + bcrypt
- Multer (archivos)
- Nodemailer

**Frontend**
- HTML + CSS + JavaScript vanilla (sin frameworks)

**Otros**
- ES Modules
- Estructura MVC limpia

## Requisitos Previos

- Node.js (v18 o superior recomendado)
- MySQL 8+
- Git

## Instalación y Configuración

Sigue estos pasos en orden:

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd "Sistema de Ordenes de Compra"
```

### 2. Instalar dependencias

```bash
cd backend
npm install
```

### 3. Configurar las variables de entorno

Copia el archivo de ejemplo y renómbralo:

```bash
# Desde la raíz del proyecto
cp .env.example .env
```

Edita el archivo `.env` con tus datos reales (base de datos, JWT, correo, etc.).

### 4. Crear la base de datos

Ejecuta el script de esquema:

```bash
mysql -u root -p < database/schema.sql
```

### 5. Crear el usuario administrador

```bash
node backend/scripts/seed-admin.js
```

### 6. Iniciar el proyecto

```bash
cd backend
npm run dev
```

El servidor estará disponible en: `http://localhost:3000`

## Estructura del Proyecto

```
Sistema de Ordenes de Compra/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuración (db, mailer, env, crypto)
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   └── middlewares/
│   ├── scripts/             # Scripts de utilidad (seed, pruebas)
│   ├── uploads/             # Archivos subidos
│   └── app.js
├── database/
│   └── schema.sql           # Esquema de la base de datos
├── frontend/                # Interfaz de usuario (HTML + JS + CSS)
├── .env.example
├── README.md
└── .env                     # ← No se sube al repositorio
```

## Base de Datos

El esquema completo se encuentra en:

```
database/schema.sql
```

Este archivo contiene todas las tablas necesarias. Se recomienda ejecutarlo en un ambiente limpio al iniciar el proyecto.

## Scripts Disponibles

Dentro de la carpeta `backend/`:

| Comando           | Descripción                          |
|-------------------|--------------------------------------|
| `npm run dev`     | Inicia el servidor con nodemon      |
| `npm start`       | Inicia el servidor en modo normal   |
| `node scripts/seed-admin.js` | Crea/actualiza el usuario administrador |
| `database/seed_clean_test_data.sql` | Seed limpio base (proveedores + catálogo + algunos requerimientos + OCs de ejemplo) |
| `database/seed-demo-requerimientos.sql` | **Spool extenso de requerimientos para demo/pruebas**: 15+ requerimientos variados (PARTES catálogo puros, SERVICIOS/FLETES libres), todos los estados (borrador/en_revision/aprobado/incompleto/rechazado), múltiples cotizaciones comparables, seleccionadas, OCs en diferentes estados (generada/distribuida/en_proceso/recibida), historial completo y trazabilidad req↔OC. Ideal para "muestra de cómo funciona el sistema". |
| `database/migrations/add-requerimiento-items-libres.sql` | Migración para agregar soporte de ítems en texto libre (libres para cotización y formalización a catálogo) |
| `database/migrations/add-requerimiento-orden-compra-id.sql` | Nueva migración: agrega `orden_compra_id` (FK) al requerimiento. Permite vista de solicitante de la OC nacida del req aprobado, enlace bidireccional y trazabilidad. |

## Variables de Entorno

Consulta el archivo [`.env.example`](./.env.example) para ver todas las variables disponibles y su descripción.

Las más importantes son:

- `DB_*` → Conexión a MySQL
- `JWT_SECRET` → Clave para firmar tokens
- `EMAIL_*` → Configuración SMTP
- `SECRET_ENCRYPTION_KEY` → Llave de 32 caracteres para encriptación

## Notas Importantes

- El archivo `.env` debe estar siempre en la **raíz** del proyecto.
- Las dependencias se instalan solo dentro de la carpeta `backend/`.
- El sistema utiliza ES Modules (`"type": "module"`).
- Se recomienda cambiar las credenciales por defecto después de la instalación inicial.

## Estado del Proyecto y Arquitectura de Flujo

**Resumen (2026)**: Full-stack (Node/Express + MySQL + vanilla JS/HTML). Cubre el ciclo completo **Requerimiento (catálogo vs libres exclusivo) → (cotización condicional) → Aprobación (con guards) → OC (con herencia) → Recepción**. Desarrollo activo hacia v1.0 estable. Buena traza (historial_estados para req/cot/OC), roles, PDFs de respaldo, formalización automática a catálogo y emails minimales RFQ.

**Stack y Estructura**: Ver secciones superiores. Lógica central en `backend/src/models/{requerimientos,cotizaciones,ordenes}.js` + controllers + `emailService.js`. UI pesada en `frontend/js/pages/requerimientos.js` (~2300 LOC, un archivo monolítico con globals para items seleccionados/libres).

### Reglas de Negocio Implementadas (con referencias al código)
- **Exclusividad catálogo vs libres** (nunca mezclar): Zod `.refine` en schemas + checks en controller + model (throw dentro de tx) + UI confirms/clears. Un req = **SOLO** `requerimiento_items` (del catálogo, no requiere cot por defecto) **O** **SOLO** `requerimiento_items_libres` (nuevos; fuerzan `requiere_cotizacion=1`).  
  Refs: [backend/src/validations/schemas.js:49-57,82-89], [backend/src/controllers/requerimientosController.js:80-84,140+], [backend/src/models/requerimientos.js:181-185,283-285,328-335] (post-update consistency), DB comments en schema/migrations/seeds.
- **requiere_cotizacion derivation**: Forzado a 1 si hay libres (regla: "solo ellos necesitan cot para alta"). Catalog puede ser 0/1. Usado en guards de approve y OC create, y para mostrar panel de cotizaciones en UI.  
  Refs: models crear ~151-152 y actualizar consistency; controller ~90-91.
- **Email / RFQ solo para SERVICIOS o libres**: Catálogo puro (no servicio) → cotización como "registro interno" (no se envía correo al proveedor). Centralizado en `emailService`. Llama asíncrona + manejo `no_requiere_segun_condicion` (marca procesada sin envío). Botón manual ✉ visible solo en casos permitidos. Email body minimal (solo pide items, sin precios propuestos).  
  Refs: [backend/src/utils/emailService.js:33-43] (decisión + "Regla de envío..."), controller crearCotizacion ~193-202 y enviarCorreo handler, UI `mostrarBotonEnviar` y `permiteOpcionesEnvio` en [frontend/js/pages/requerimientos.js:656-660,1908-1913].
- **Formalización (libres → catálogo)**: **Exclusivamente al crear la OC** (después de generar la OC, una vez elegido el proveedor vía cotización). Dedup por `tipo + LOWER(descripcion)`. Al formalizar (o re-formalizar) se asocia/actualiza `proveedor_id` + `costo_referencia` con los de la cot/OC seleccionada ("relacionado con el proveedor seleccionado"). **Nunca muta los libres originales del req** (se preservan como histórico/audit trail).  
  Refs: [backend/src/models/cotizaciones.js:331-383] (JSDoc actualizado), llamado solo en ordenes.crear (después del link `orden_compra_id`); `generarCodigoUnico` en [catalogo.js:86-110]. Seleccionar ya no llama formalizar (cambio para cumplir "cargar después de generar la OC").
- **OC "congela" términos + items**: Si `cotizacion_id`, hereda `proveedor_id / monto_total / moneda` de la cot. Items de la OC: prefieren `cotizacion_items` (precios reales); fallback a req (catalog o libres) si no hay cot. Auto-marca req como aprobado. Además setea `requerimientos.orden_compra_id` (enlace bidireccional para vista de solicitante de OCs nacidas de reqs aprobados + "total de la cotización en OC" y cierre revisado).  
  Refs: [backend/src/models/ordenes.js:155-199] (comentarios "Heredar... congela", formalize safety + UPDATE link), controller guards ~51-56, obtenerPorId items resolution. En frontend: total row en tabla de ítems de OC (cot) y columna "OC" + bloque en detalle de req.
- **Guards de negocio**:
  - Approve ('aprobado'): si `requiere_cotizacion` → exige cot seleccionada **+** `archivo_url` (PDF respaldo).  
    Ref: [requerimientosController.js:208-225].
  - Crear OC: req debe estar 'aprobado'; si requiere_cot → exige `cotizacion_id`.  
    Ref: [ordenesController.js:51-56].
  - Cerrar OC (manual o auto por confirmación de solicitante): exige `datatextnow_id` (PO DTN) registrado + todas las recepciones en 'entregado_solicitante'. Auto-close en marcarEntregado ahora condicional (revisión del flujo DTN + recepciones).  
    Refs: ordenes model cambiarEstado + recepciones marcarEntregado; UI resumen-avance muestra bloqueos.
- **Estados estrictos + historial**: Tablas `TRANSICIONES` (req) y `TRANSICIONES_OC`. FOR UPDATE + checks en models. Historial en req/cot/OC/recepciones. Recepciones completas avanzan OC a 'recibida'.
- **Otros**: Cantidades enteras + precios 2 decimales (HTML step/blur + JS `redondear2` + backend `Math.round *100/100`). Área/Depto persistidos, mostrados en lista/detalle y filtrables. PDF upload solo para cotizaciones (multer, /uploads). Deselect permitido (con confirm). "Alta en catálogo" anima req separado vía botón/UI.

**Notas de implementación**: Libres **siempre** quedan en el req original (ver `obtenerPorId` que carga ambos `items` + `items_libres`). Formalize es idempotente (dedup). Cot para catálogo puro es útil para "registro de precios/proveedor" interno aunque no dispare email.

### Diagrama de Flujo Principal (Mermaid - renderiza en GitHub/README viewers)
```mermaid
flowchart TD
    subgraph Solicitante["Solicitante"]
        A[Crear Requerimiento<br/>Modal: campos + tipo/área/depto] --> B{¿Ítems en catálogo?}
        B -->|Default / buscar| C[Sección catálogo<br/>+ picker + selected<br/>(no requiere cot)]
        B -->|Checkbox final:<br/>"no se encuentran en el catálogo"<br/>+ modal separado| D[Ítems LIBRES<br/>(texto libre + cant + unidad)<br/>+ warning exclusividad]
        C & D --> E[Guardar → Borrador<br/>(exclusividad enforced en save)]
        E --> F[Enviar a revisión<br/>(solo dueño en borrador/incompleto)]
    end

    subgraph ContabilidadAdmin["Contabilidad / Admin"]
        F --> G[En revisión<br/>Ver detalle: área/depto/notas/items + flag requiere_cotizacion]
        G --> H{¿requiere_cotizacion?<br/>(libres o flag/SERVICIOS)}
        
        H -->|No (catálogo puro)| I[Aprobar directo<br/>(o incompleto/rechazar)]
        H -->|Sí| J[Panel Cotizaciones visible<br/>+ botón + Agregar Cot]
        
        J --> K[Crear/Editar Cot<br/>Prefill automático:<br/>libres → desc/cant/unidad<br/>catálogo → desc (precios vacíos)<br/>Forza modo items + tabla editable]
        K --> L{¿Libres o TIPO=SERVICIOS?}
        L -->|Sí| M[Opciones: programar/enviar ahora<br/>Email minimal RFQ<br/>"Por favor su ayuda para cotizar lo siguiente"<br/>(solo items, sin precios)]
        L -->|No (catálogo no-serv)| N[Forzar "Guardar sin enviar"<br/>+ alerta "registro interno"]
        M & N --> O[Contab edita precios unitarios<br/>en tabla cot_items + IVA/monto<br/>+ adjuntar PDF respaldo]
        O --> P{Seleccionar esta cot?}
        P -->|Sí (con confirm)| Q[Seleccionar<br/>→ marca seleccionada + rechaza otras<br/>+ formaliza items a CATÁLOGO<br/>(dedup tipo+desc, genera código,<br/>costo_ref=precio, prov recomendado)]
        P -->|No| R[Deseleccionar permitido]
        Q --> S[Aprobar (guard exige selected + PDF)]
    end

    I & S --> T[Estado Aprobado]
    T --> U{Generar OC? (solo contab/admin)}
    U --> V[Crear OC<br/>Si requiere_cot → exige cotizacion_id<br/>Hereda prov/monto/moneda de cot<br/>+ formalize safety (idempotente)<br/>+ auto marca req aprobado<br/>+ notas del req]
    V --> W[OC generada<br/>Items: de cot_items si hay cot_id<br/>sino fallback req (cat o libres)<br/>"Precios según la cotización elegida"]
    W --> X[Transiciones OC: generada → distribuida → en_proceso → recibida (vía Recepción)<br/>o cancelada]
    X --> Y[Recepción (contab): registra + avanza OC si completo<br/>+ datatextnow cross]
    
    style D fill:#fff3cd,stroke:#f0ad4e
    style Q fill:#d4edda,stroke:#28a745
    style V fill:#cce5ff,stroke:#007bff
    note1["Libres del req ORIGINAL se preservan intactos como histórico.<br/>Catálogo se enriquece para futuros reqs."]
    note2["Email decision en emailService + controller.<br/>UI oculta botón enviar cuando no corresponde."]
```

**Paso a Paso Textual (alineado al diagrama)**:
1. Solicitante abre modal req → elige tipo (muestra secciones) → llena área/depto/título/notas. Por defecto ve picker de catálogo (busca y agrega existentes). Al final del form: checkbox "Los ítems que necesito no se encuentran en el catálogo" → oculta catálogo, muestra botón para modal libres (con su propio warning de "SOLO... o SOLO...").
2. Guarda → backend deriva `requiere_cotizacion` + rechaza mixes. Queda en borrador.
3. Envía a revisión.
4. Contab ve en lista/detalle (muestra área/depto, flag requiere, items catalog o libres con nota "no existían...").
5. Si requiere: abre " + Agregar Cotización" → prellena tabla de conceptos desde el req (precios en blanco para que el proveedor responda). Decide fecha → confirm modal: si catálogo puro no-servicio fuerza guardar sin correo (interno); si libres/SERV permite programar o enviar inmediato (email simple solo pidiendo items).
6. Una vez recibida respuesta: edita la cot (precios reales), adjunta PDF como respaldo.
7. Selecciona la ganadora → formaliza (agrega a catálogo si no existe) + rechaza las otras. Ahora se puede aprobar (el guard exige selected + PDF).
8. Aprobado → Generar OC (hereda datos comerciales; items con precios de la cot si aplica). Formalize se re-ejecuta como red de seguridad.
9. OC fluye por sus estados; recepción la cierra.

**Transiciones Clave** (ver `TRANSICIONES` y `TRANSICIONES_OC` en models):
- Requerimiento: borrador → en_revision → {aprobado | incompleto | rechazado} → cerrado (con guards extra en aprobado).
- OC: generada → distribuida → en_proceso → recibida → cerrada (o cancel en varios puntos).
- Cot: creada (en_revision/enviada) → seleccionada/rechazada.

### Evaluación: ¿Se Entiende el Funcionamiento "por su Propia Lógica"?
**Sí, en gran medida para las reglas de negocio clave** (fortalezas):
- UI es muy explícita: warnings "Importante" repetidos en modales, labels del checkbox, tooltips en botones, notas en detalle ("Este req debe ser SOLO de libres..."), confirm modal con alertas por caso (catálogo vs fecha pasada), render condicional de botones ✉/📎 según `esLibres || SERVICIOS`.
- Backend tiene buenos JSDoc y comentarios en los puntos críticos (formalizar "Preserva histórico...", herencia "congela términos...", derive flag).
- Seeds + schema + migración actúan como "spec viva" con NOTA/Regla claras.
- Flujo es "descubrible": empiezas con catálogo (default), el checkbox al final + botón "REQUERIMIENTO SEPARADO" comunican la intención sin requerir leer código.

**Pero no completamente self-documenting para un recién llegado** (debilidades observadas):
- El archivo `requerimientos.js` es monolítico (~2300 líneas). Lógica de toggles, prefill, guards de mix y modo items/simple está duplicada/repetida en handlers (aunque con comments). State global `window.requerimientoItems*` + `datosCotizacionPendiente` se muta desde muchos sitios.
- Algunos detalles de implementación (listeners "attach once" con dataset/cloneNode, redondeo en 5+ lugares, orden de llamadas prellenar/configurar) requieren leer el archivo completo o tener contexto previo.
- README todavía tenía "Soporte híbrido" (corregido en esta actualización como observación); la distinción "catálogo = no cot" vs "libres = siempre cot + formalize" está más clara en código/UI/seeds que en la doc general.
- Sin un diagrama central o "business rules" doc único, un dev nuevo depende de leer varios archivos (models + controller + emailService + UI + seeds) + correr seeds para "ver" el flujo.

**Conclusión**: La lógica de **negocio** (exclusividad, cuándo email, formalize+histórico, herencia OC, guards) se entiende bien por los textos de UI + comentarios clave + estructura de pantallas. La **implementación detallada** (especialmente frontend) se beneficia de este análisis/diagrama. Post-limpieza de notas viejas, el código está más limpio pero el tamaño del archivo principal sigue siendo el principal obstáculo para "entender de un vistazo".

### Gaps / Deuda / Pendientes Observados
- **Reportes**: Placeholder `flete = 0` + muchos campos 'PENDIENTE'. Ref: [backend/src/controllers/reportesController.js:168].
- **Recepciones**: Cierra el loop (avanza OC), UI en página de órdenes, pero no hay página dedicada ni cruce completo con DataTextNow en todos los flujos.
- **Tests**: Solo seeds y scripts manuales (excelentes para probar el selector de libres, no-mezclar, etc.). No hay tests automatizados visibles.
- **Scheduled emails**: Lógica de `scheduled_at` + oportunista existe, pero depende de que el proceso backend esté corriendo (sin worker/cron robusto documentado).
- **Frontend**: Archivo grande + algo de duplicación de checks de modo/exclusividad. Posible deuda de listeners (patrones de "attach once" indican intentos previos de fix).
- **Enforcement roles**: Mayoría vía `autorizar` middleware, pero varios checks manuales en controllers (para cot/OC) y `puedeGestionarCotizaciones` en JS. Menor inconsistencia.
- **README/docs**: Parcialmente desactualizado vs reglas finales (corregido parcialmente aquí). Falta este diagrama antes.
- **Fletes**: Tratados como "libres por ahora" en la lógica de email/cot (ver historial de chat).

### Cómo Verificar / "Jugar" con el Flujo (usando seeds existentes)
1. DB limpia + `node backend/scripts/seed-admin.js`.
2. (Recomendado) `mysql -u root -p ordenes_compra < database/seed_clean_test_data.sql`.
3. (Para spool rico de demo) `mysql -u root -p ordenes_compra < database/seed-demo-requerimientos.sql` (agrega 15+ reqs variados con cotizaciones, OCs en varios estados, etc.).
4. `cd backend && npm run dev`.
5. Login (demo: juan.perez@empresa.com / Demo2025! como solicitante; admin@empresa.com / Admin1234! como contab).
6. Requerimientos: ver lista con variedad de estados, áreas y tipos. Abrir detalle de uno de catálogo vs uno de libres. Como contab: agregar/ comparar cotizaciones, seleccionar + subir PDF, aprobar, generar OC.
7. Inspeccionar: catálogo (formalización de libres), historial de estados, enlace OC desde el req aprobado, flujo de recepciones.
8. Revisar este mismo README (diagrama + reglas) vs lo que ves en la app.

Este análisis se generó explorando el código actual (post-cleanup). El diagrama y textos están alineados con la implementación real.

---
**¿Necesitas ayuda para configurar algo específico?** (Base de datos, correo, variables de entorno, etc.)

> **Actualización de esta sección**: Incluye análisis + diagrama solicitado para validar claridad de la lógica. "Soporte híbrido" residual actualizado a descripción precisa de la regla exclusiva actual.
