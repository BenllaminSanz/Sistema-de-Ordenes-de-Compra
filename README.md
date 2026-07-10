# Sistema de Órdenes de Compra

**Versión 1.3.2** — Julio 2026

Sistema web para la gestión completa del proceso de compras: **Requerimientos → Cotizaciones → Órdenes de Compra → Recepciones**.

Historial de cambios: [CHANGELOG.md](./CHANGELOG.md) · Cómo versionar: [VERSIONING.md](./VERSIONING.md) · **Manual al subir cambios:** [docs/MANUAL-GIT-GITHUB.md](./docs/MANUAL-GIT-GITHUB.md)

## Novedades v1.3.2

- **Plantilla RFQ** mejorada para cotizaciones
- **Nº de ítem** al generar OC y líneas de OC alineadas al catálogo

## Novedades v1.3

- **Consecutivos con año y tipo** — REQ: `2026S-001` (servicios), `2026P-001` (partes)
- **Carrito y borrador REQ** — al ir al catálogo se guardan datos e ítems; se restauran al volver
- **Catálogo por proveedor** — vista alternativa `catalogo-proveedores.html`
- **Búsqueda de proveedor** por código o nombre (REQ, catálogo, cotización, OC)
- **Impresión REQ** — logo, subtítulo, subtotales por línea, total y ajuste a una página
- **Correos** — branding con logo; cantidades enteras (sin `1.0000`)
- **Cotizaciones** — envío automático si la fecha es hoy; PDF adjunto opcional (con aviso)
- **REQ** — bloqueo de guardado vacío; cancelar aprobado sin OC; proveedor seleccionado en detalle
- **Cotizar** — Nº ítem opcional; notas del REQ prellenan notas de cotización

## Novedades v1.2

- **Carrito compartido** entre catálogo y requerimientos, con aviso de un solo proveedor por REQ
- **Impresión REQ** — firmas con cargo debajo (Gerente de Planta / Jefe Inmediato)
- **Cotización → catálogo** — el Nº ítem de cotización pasa como código de catálogo al formalizar
- **Recepciones** — bloqueo de edición/eliminación en OC cerrada; recálculo de pendientes al editar
- **Cierre de OC** — modal para capturar PO DataTextNow cuando falta

## Novedades v1.0

- **Dashboard** con KPIs en tiempo real, aging de requerimientos en revisión y **OC activas** (pendientes de cerrar)
- **Áreas y departamentos** — catálogo alineado a DataTextNow, editable desde Administración
- **Homologación visual** de badges y estados en catálogo, proveedores y usuarios
- **Filtro `estado=activas`** en el listado de órdenes de compra
- Limpieza de scripts de migración one-time (carga Excel) — la BD de producción ya está poblada

## Características Principales

- **Requerimientos** con flujo de aprobación (borrador → en revisión → aprobado/rechazado/incompleto)
  - Exclusividad catálogo vs ítems libres (nunca mezclados)
- **Cotizaciones** con comparación, PDFs adjuntos y envío de RFQ por correo
- **Órdenes de compra** con herencia de cotización, PO DataTextNow y cierre controlado
- **Recepciones** con avance automático de estado de OC
- **Historial** de cambios de estado por entidad
- **Proveedores, catálogo, usuarios** con roles (Admin, Contabilidad, Solicitante)
- **Configuración SMTP** desde panel de administración
- **Verificación de correo** al registrarse

## Stack

| Capa | Tecnología |
|------|------------|
| Backend | Node.js, Express 5, MySQL (mysql2), JWT, Multer, Nodemailer, Zod |
| Frontend | HTML, CSS, JavaScript vanilla |
| Módulos | ES Modules, estructura MVC |

## Requisitos

- Node.js 18+
- MySQL 8+
- Git

## Instalación

### 1. Clonar e instalar

```bash
git clone <url-del-repositorio>
cd "Sistema de Ordenes de Compra"
cd backend && npm install
```

### 2. Variables de entorno

```bash
# Desde la raíz del proyecto
cp .env.example .env
```

Edita `.env` con credenciales reales de base de datos, JWT, SMTP y admin.

### 3. Base de datos

La instalación de producción utiliza la base de datos `ordenes_compra` ya configurada y poblada.

Para un **ambiente nuevo**, restaura un respaldo proporcionado por el administrador del sistema o solicita el dump del esquema y datos iniciales.

### 4. Usuario administrador

```bash
node backend/scripts/seed-admin.js
```

Usa `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `ADMIN_NOMBRE` del `.env`. El script crea o actualiza el admin y marca el correo como verificado.

### 5. Iniciar

```bash
cd backend
npm run dev    # desarrollo (nodemon)
# npm start    # producción
```

Abre `http://localhost:3000`

## Estructura del Proyecto

```
Sistema de Ordenes de Compra/
├── backend/
│   ├── src/
│   │   ├── config/          # db, mailer, env, departamentos
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middlewares/
│   │   ├── utils/
│   │   └── validations/
│   ├── scripts/
│   │   └── seed-admin.js    # Crear/actualizar administrador
│   ├── uploads/
│   └── app.js
├── frontend/                # HTML + JS + CSS
├── docs/                    # Manual de operaciones
├── empaquetar-deploy.ps1    # Empaquetado para servidor
├── CHANGELOG.md             # Historial de versiones
├── VERSIONING.md            # Flujo de tags y releases
├── docs/
│   └── MANUAL-GIT-GITHUB.md # Consulta al subir cambios a GitHub
├── .env.example
├── README.md
└── .env                     # No se sube al repositorio
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor con recarga automática |
| `npm start` | Servidor en modo producción |
| `node backend/scripts/seed-admin.js` | Crear o actualizar usuario administrador |
| `npm run test:ci` (en `backend/`) | Comprobaciones sin BD (versión, archivos, sintaxis) — lo usa GitHub Actions |
| `npm test` (en `backend/`) | Pruebas de flujo API (requiere servidor + MySQL + admin en `.env`) |
| `powershell -ExecutionPolicy Bypass -File .\empaquetar-deploy.ps1` | Generar ZIP de deploy (sin `node_modules`, `.env` ni `uploads`) |

## Variables de Entorno

Ver [`.env.example`](./.env.example) para la lista completa.

| Grupo | Variables | Uso |
|-------|-----------|-----|
| Servidor | `PORT`, `CORS_ORIGIN`, `FRONTEND_URL` | Puerto y URLs |
| Base de datos | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL |
| Auth | `JWT_SECRET`, `JWT_EXPIRES_IN` | Tokens de sesión |
| Seguridad | `SECRET_ENCRYPTION_KEY` | Encriptación SMTP en DB |
| Correo | `EMAIL_*`, `EMAIL_CC_COTIZACIONES` | Fallback SMTP |
| Admin | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE` | Seed inicial |

Los administradores pueden configurar SMTP completo (incluido CC de cotizaciones) desde **Administración → Configuración SMTP**. La tabla `configuracion_smtp` tiene prioridad sobre `.env`.

**Nota:** El SMTP suele apuntar al servidor interno de la empresa (`192.168.x.x`). En desarrollo local es normal ver un aviso de conexión rechazada; el resto del sistema funciona sin correo.

## Roles y Acceso

| Rol | Acceso principal |
|-----|------------------|
| **Solicitante** | Requerimientos propios, catálogo (lectura), OC de sus reqs aprobados |
| **Contabilidad** | Flujo completo operativo, proveedores, usuarios, áreas |
| **Admin** | Todo lo anterior + configuración SMTP |

## Flujo del Sistema

```mermaid
flowchart TD
    A[Crear Requerimiento] --> B{¿Catálogo o libres?}
    B -->|Catálogo| C[Borrador → En revisión]
    B -->|Libres| D[Requiere cotización]
    C --> E{Aprobar}
    D --> F[Cotizaciones + PDF] --> E
    E --> G[Generar OC]
    G --> H[generada → distribuida → en_proceso → recibida]
    H --> I[Cerrar con PO DataTextNow]
```

### Reglas clave

- Un requerimiento es **solo catálogo** o **solo ítems libres**, nunca ambos
- Ítems libres siempre requieren cotización; el email RFQ solo aplica a SERVICIOS o libres
- La formalización a catálogo ocurre al **generar la OC** (los libres originales se preservan)
- Cerrar una OC exige **PO DataTextNow** (`datatextnow_id`) y recepciones completas
- Estados de OC activos: `generada`, `distribuida`, `en_proceso`, `recibida`

## API Principal

| Endpoint | Descripción |
|----------|-------------|
| `GET /api/dashboard/stats` | KPIs del dashboard |
| `GET /api/ordenes-compra?estado=activas` | OC pendientes de cerrar |
| `GET /api/areas` | Áreas y departamentos |
| `GET /api/health` | Estado del servidor + `version` desplegada |

## Actualizar en producción

1. **Respaldar** la carpeta actual, el archivo `.env` y la base de datos MySQL
2. **Empaquetar** en desarrollo: `powershell -ExecutionPolicy Bypass -File .\empaquetar-deploy.ps1`
3. **Descomprimir** en el servidor conservando `.env` y `backend/uploads/` (PDFs y referencias existentes)
4. En el servidor: `cd backend && npm install --omit=dev`
5. **Reiniciar** el proceso Node (PM2, servicio Windows, IIS, etc.)
6. Verificar `GET /api/health` y probar login

> Esta versión **no requiere migración SQL** adicional: los cambios son de aplicación (frontend + backend).

## Notas de Producción

- El archivo `.env` va siempre en la **raíz** del proyecto
- Cambiar credenciales por defecto después del primer despliegue
- Los archivos subidos se guardan en `backend/uploads/`
- El reporte de status PO está disponible para roles contabilidad y admin desde el dashboard

## Soporte

Para configuración de base de datos, correo o despliegue, contactar al administrador del sistema.