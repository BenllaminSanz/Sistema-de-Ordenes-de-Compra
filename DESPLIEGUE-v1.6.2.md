# Despliegue v1.6.2 — checklist servidor

**Fecha:** 2026-07-24  
**Paquete:** `deploy-oc-v1.6.2-*.zip` (generado con `empaquetar-deploy.ps1`)

## Contenido

- **Solo registrar cotización sin correo** (cotización ya recibida, ticket de tienda, etc.)
- Incluye también lo de **v1.6.1** si no se desplegó: email proveedor opcional + vista Área/Depto

## Antes

1. Respaldar BD y carpeta de la app (`.env`, `backend/uploads/`).
2. Detener PM2 / servicio Node.

## Pasos

```powershell
# Reemplazar código sin pisar .env ni uploads
# backend\src, backend\app.js, backend\package*.json, frontend\

cd ruta\a\backend
npm install --omit=dev   # opcional si no cambian deps
pm2 restart oc

# Verificar
# GET /api/health → version "1.6.2"
```

## Prueba post-despliegue

| Prueba | Esperado |
|--------|----------|
| REQ → Nueva cotización → Guardar | Modal con **Solo registrar (sin correo)** y, si aplica, **Guardar y enviar correo** |
| Elegir «Solo registrar» | Cotización guardada; **no** llega correo al proveedor |
| Adjuntar PDF 📎 | Sube archivo sin enviar correo |
| Proveedor sin email (Walmart) | Se puede crear y usar en cotización |

## Rollback

Restaurar código v1.6.1 o v1.6.0 y reiniciar.
