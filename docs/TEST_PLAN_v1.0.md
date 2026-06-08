# Test Plan - Sistema de Órdenes de Compra v1.0

**Objetivo**: Validar que todas las funcionalidades críticas funcionen correctamente antes de la entrega.

**Entorno de prueba recomendado**:
- Base de datos limpia (`database/clean_for_v1_testing.sql` + `node backend/scripts/seed-admin.js`)
- Admin: jebesari48@gmail.com (contraseña definida en .env)
- Correo de pruebas: benjaminsanchez.desarrollador@gmail.com (configurado en SMTP con App Password)
- Backend corriendo en `npm run dev`
- Navegador limpio (o modo incógnito)

---

## 1. Preparación del Entorno

- [ ] Ejecutar limpieza de BD:
  ```bash
  mysql -u root -p ordenes_compra < database/clean_for_v1_testing.sql
  node backend/scripts/seed-admin.js
  ```
- [ ] Verificar que el admin `jebesari48@gmail.com` existe y puede hacer login.
- [ ] Configurar SMTP en el panel de admin apuntando a `benjaminsanchez.desarrollador@gmail.com` (usar App Password de Gmail).
- [ ] Probar botón "Enviar correo de prueba" desde Configuración SMTP.

---

## 2. Autenticación y Usuarios

### 2.1 Login y Sesión
- [ ] Login correcto con admin.
- [ ] Login con credenciales incorrectas (error esperado).
- [ ] Login de usuario no verificado (bloqueado).
- [ ] Logout funciona.

### 2.2 Gestión de Usuarios (solo admin/contabilidad)
- [ ] Crear nuevo usuario solicitante (desde admin).
- [ ] Crear usuario con rol contabilidad (solo admin).
- [ ] Intentar crear admin siendo contabilidad (debe fallar).
- [ ] Editar usuario.
- [ ] Cambiar contraseña de usuario.
- [ ] Desactivar / Activar usuario.
- [ ] Ver lista filtrando solo activos.

### 2.3 Registro Público de Solicitante
- [ ] Registrar nuevo solicitante con email de prueba.
- [ ] Verificar que llega el correo de verificación a `benjaminsanchez.desarrollador@gmail.com`.
- [ ] Hacer clic en el enlace de verificación.
- [ ] Intentar login antes de verificar (debe fallar).
- [ ] Login después de verificar (debe funcionar).

---

## 3. Proveedores

- [ ] Crear proveedor manualmente.
- [ ] Editar proveedor.
- [ ] Activar / Desactivar proveedor (solo admin).
- [ ] **Carga masiva desde Excel**:
  - Usar archivo de ejemplo.
  - Verificar que se omiten duplicados por "No de proveedor".
  - Verificar contador de nuevos cargados.
  - Revisar que aparecen en la lista.

---

## 4. Catálogo

- [ ] Crear elemento manual (PARTES, SERVICIOS, FLETES).
- [ ] Editar elemento.
- [ ] Activar / Desactivar.
- [ ] Filtros por tipo, búsqueda, solo activos.
- [ ] **Carga masiva desde Excel** (nueva funcionalidad):
  - Usar archivo `CATALOGO PARTES AMACEN.xlsx`.
  - Verificar mapeo correcto: No de proveedor, Número de Parte (código), Descripción, UOM (unidad), Costo unitario, Moneda.
  - Verificar que se resuelve correctamente el `proveedor_id`.
  - Verificar que se omiten códigos duplicados.
  - Confirmar que aparecen en la lista con proveedor asociado.

---

## 5. Requerimientos (Flujo Principal)

### 5.1 Creación (Solicitante)
- [ ] Crear requerimiento **solo con catálogo** (sin libres).
- [ ] Crear requerimiento **con ítems libres** (debe marcar `requiere_cotizacion`).
- [ ] Intentar mezclar catálogo + libres (debe rechazarse).
- [ ] Enviar a revisión.

### 5.2 Revisión y Aprobación (Contabilidad / Admin)
- [ ] Ver lista de requerimientos con filtros.
- [ ] Ver detalle (información, ítems catálogo, ítems libres).
- [ ] **Agregar cotizaciones** solo cuando corresponde (libres o SERVICIOS).
- [ ] Botón de enviar correo RFQ visible solo cuando aplica.
- [ ] Enviar solicitud de cotización por correo → verificar que llega al proveedor (usar email de prueba).
- [ ] Editar precios de cotización + adjuntar PDF.
- [ ] Seleccionar cotización ganadora (debe rechazar las otras).
- [ ] Aprobar requerimiento (debe exigir cotización seleccionada + PDF cuando aplica).
- [ ] Rechazar / Marcar incompleto.

### 5.3 Reglas de Negocio
- [ ] Requerimiento de catálogo puro → no debe permitir envío de correo.
- [ ] Requerimiento con libres → debe permitir envío de correo.
- [ ] Historial de estados se registra correctamente.

---

## 6. Órdenes de Compra

- [ ] Generar OC desde requerimiento aprobado (debe heredar datos de cotización si existe).
- [ ] Ver lista de OCs (filtrado por solicitante para rol solicitante).
- [ ] Cambiar estados: generada → distribuida → en_proceso.
- [ ] **Recepciones**:
  - Registrar recepción parcial / completa.
  - Marcar "Entregado al solicitante".
  - Verificar que la OC avanza de estado.
- [ ] Cierre de OC (manual o automático).
- [ ] Ver PO DataTextNow y trazabilidad.

---

## 7. Correos (SMTP)

- [ ] Enviar correo de verificación de usuario (ya probado en 2.3).
- [ ] Enviar RFQ a proveedor desde cotización.
- [ ] Probar conexión SMTP desde el panel de admin.
- [ ] Enviar correo de prueba desde el panel de admin.
- [ ] Cambiar configuración SMTP (DB) y verificar que se recarga sin reiniciar.
- [ ] Verificar que se usa la configuración de DB cuando existe (prioridad sobre .env).

---

## 8. Reportes

- [ ] Descargar reporte STATUS POS HILOS (debe funcionar para contabilidad/admin).
- [ ] Verificar que el archivo Excel se genera correctamente.

---

## 9. Seguridad y Permisos

- [ ] Rol solicitante no puede ver proveedores, catálogo completo, usuarios, configuración SMTP.
- [ ] Rol contabilidad no puede crear admins ni ver configuración SMTP completa.
- [ ] Solo admin puede ver y usar "Configuración SMTP".
- [ ] Tokens JWT expiran correctamente.
- [ ] Acceso sin token redirige a login.

---

## 10. Datos y Consistencia

- [ ] Formalización de ítems libres a catálogo funciona correctamente.
- [ ] Historial completo en requerimientos y órdenes.
- [ ] Trazabilidad req → cotización → OC → recepción.
- [ ] No se permiten transiciones inválidas de estado (guards).

---

## Notas para el Probador

- Usa siempre el mismo correo de pruebas para no saturar bandejas.
- Después de cada prueba de correo, revisa la bandeja de `benjaminsanchez.desarrollador@gmail.com`.
- Si usas la limpieza de BD, recuerda volver a ejecutar `seed-admin.js`.
- Documenta cualquier bug encontrado con pasos para reproducirlo.

---

**¿Listo para empezar la ejecución del plan?**

Dime por dónde quieres comenzar (por ejemplo: "primero limpieza de BD y configuración SMTP", o "empecemos por el flujo completo de un requerimiento con libres").

Si necesitas que prepare scripts de prueba automáticos (por ejemplo para crear datos de prueba vía API), avísame también.