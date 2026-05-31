// backend/src/validations/schemas.js
import { z } from 'zod';

// ============================================================
// ESQUEMAS DE AUTENTICACIÓN
// ============================================================

export const loginSchema = z.object({
  email: z.string().email('El email no es válido').toLowerCase().trim(),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export const cambiarPasswordSchema = z.object({
  password_actual: z.string().min(1, 'La contraseña actual es requerida'),
  password_nuevo: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres'),
});

export const registroSolicitanteSchema = z.object({
  nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').trim(),
  email: z.string().email('El email no es válido').toLowerCase().trim(),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

// ============================================================
// ESQUEMAS DE REQUERIMIENTOS
// ============================================================

export const crearRequerimientoSchema = z.object({
  titulo_solicitud: z.string().min(5, 'El título debe tener al menos 5 caracteres').trim(),
  descripcion: z.string().min(5, 'La descripción debe tener al menos 5 caracteres').trim(),
  area: z.enum(['ADMINISTRACION', 'PRODUCCION']).optional(),
  departamento: z.enum(['ALMACEN', 'RH', 'IT', 'VENTAS', 'MTTO']).optional(),
  tipo: z.enum(['PARTES', 'SERVICIOS', 'FLETES']).optional(),
  requiere_cotizacion: z.coerce.boolean().optional().default(false),
});

export const actualizarRequerimientoSchema = z.object({
  titulo_solicitud: z.string().min(5, 'El título debe tener al menos 5 caracteres').trim().optional(),
  descripcion: z.string().min(5, 'La descripción debe tener al menos 5 caracteres').trim().optional(),
  area: z.enum(['ADMINISTRACION', 'PRODUCCION']).optional(),
  departamento: z.enum(['ALMACEN', 'RH', 'IT', 'VENTAS', 'MTTO']).optional(),
  tipo: z.enum(['PARTES', 'SERVICIOS', 'FLETES']).optional(),
  requiere_cotizacion: z.coerce.boolean().optional(),
  datatextnow_id: z.string().trim().optional(),
});

// ============================================================
// ESQUEMAS DE CAMBIO DE ESTADO (Requerimientos)
// ============================================================

export const cambiarEstadoRequerimientoSchema = z.object({
  estado: z.enum(['en_revision', 'aprobado', 'incompleto', 'rechazado', 'cerrado'], {
    errorMap: () => ({ message: 'Estado inválido' }),
  }),
  notas: z.string().trim().optional(),
});
