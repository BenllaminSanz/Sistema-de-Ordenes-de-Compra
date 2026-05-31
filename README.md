# Sistema de Órdenes de Compra

Sistema web para la gestión completa del proceso de compras: **Requerimientos → Cotizaciones → Órdenes de Compra → Recepciones**.

## Descripción

Aplicación full-stack que permite a las empresas gestionar de forma controlada y trazable todo el flujo de procurement interno.

El sistema incluye control de roles, historial de cambios de estado, generación de consecutivos, carga de documentos (PDFs de cotizaciones) y notificaciones por correo.

## Características Principales

- **Gestión de Requerimientos** con flujo de aprobación (borrador → en revisión → aprobado/rechazado/incompleto)
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

## Estado del Proyecto

Este proyecto se encuentra en desarrollo activo orientado a una versión estable **v1.0**.

---

**¿Necesitas ayuda para configurar algo específico?** (Base de datos, correo, variables de entorno, etc.)
