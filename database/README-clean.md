# Limpieza de Base de Datos para Pruebas v1.0

Este script está diseñado para dejar la base de datos limpia y lista para probar las nuevas funcionalidades:

- Carga masiva de proveedores desde Excel
- Carga masiva de catálogo desde Excel (nuevo)
- Sistema de configuración SMTP (DB + recarga en caliente)
- Flujo completo de requerimientos / cotizaciones / órdenes

## Pasos recomendados

1. **Detén el backend** si está corriendo.

2. **Limpia los datos** (estructura se mantiene):
   ```bash
   mysql -u root -p ordenes_compra < database/clean_for_v1_testing.sql
   ```

3. **Recrea el usuario administrador**:
   ```bash
   node backend/scripts/seed-admin.js
   ```

4. **Inicia el backend**:
   ```bash
   cd backend
   npm run dev
   ```

5. **Opcional**: Si tienes el archivo `database/seed_clean_test_data.sql`, puedes cargarlo para tener algunos datos base:
   ```bash
   mysql -u root -p ordenes_compra < database/seed_clean_test_data.sql
   ```

## Qué se limpia

- Requerimientos + items + items libres + historial
- Cotizaciones + items
- Órdenes de compra + recepciones + historial
- Catálogo
- Proveedores
- (Opcional) Configuración SMTP

**No se toca** la tabla `usuarios` (el script `seed-admin.js` se encarga de crear/actualizar el admin).

## Después de limpiar

- Entra como admin
- Configura el SMTP en **Administración → Configuración SMTP** (recomendado para probar correos)
- Prueba la carga de Excel en:
  - Proveedores
  - Catálogo (nuevo)
- Registra un nuevo usuario solicitante para probar el flujo de verificación de correo

¡Listo para probar la versión 1.0 con datos frescos!