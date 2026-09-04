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

export const actualizarUsuarioSchema = z.object({
  nombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres').trim(),
  email: z.string().email('El email no es válido').toLowerCase().trim(),
  rol: z.enum(['solicitante', 'compras', 'admin'], {
    errorMap: () => ({ message: 'Rol inválido' }),
  }),
});

export const restablecerPasswordUsuarioSchema = z.object({
  password_nuevo: z.string().min(8, 'La nueva contraseña debe tener al menos 8 caracteres'),
});

// ============================================================
// ESQUEMAS DE REQUERIMIENTOS
// ============================================================

const itemLibreSchema = z.object({
  descripcion: z.string().min(3, 'La descripción debe tener al menos 3 caracteres').trim(),
  cantidad: z.number().positive(),
  unidad: z.string().trim().optional().nullable(),
  notas: z.string().trim().optional().nullable(),
  referencia_tipo: z.enum(['link', 'archivo']).optional().nullable(),
  referencia_url: z.string().max(500).optional().nullable(),
  referencia_nombre: z.string().max(255).optional().nullable(),
  precio_sugerido: z
    .union([z.null(), z.literal(''), z.coerce.number().nonnegative()])
    .optional()
    .transform((v) => (v === '' || v == null ? null : v)),
});

export const crearRequerimientoSchema = z.object({
  titulo_solicitud: z.string().min(5, 'El título debe tener al menos 5 caracteres').trim(),
  notas: z.string().trim().optional().default(''),
  area: z.string().trim().toUpperCase().min(1, 'Área requerida').optional(),
  departamento: z.string().trim().toUpperCase().min(1).optional(),
  tipo: z.enum(['PARTES', 'SERVICIOS', 'FLETES']).optional(),
  requiere_cotizacion: z.coerce.boolean().optional().default(false),
  items: z.array(
    z.object({
      catalogo_id: z.number().int().positive(),
      cantidad: z.number().positive(),
    })
  ).optional().default([]),
  // Ítems en texto libre (cuando no existen aún en el catálogo)
  items_libres: z.array(itemLibreSchema).optional().default([]),
}).refine((data) => {
  const tieneItems = Array.isArray(data.items) && data.items.length > 0;
  const tieneLibres = Array.isArray(data.items_libres) && data.items_libres.length > 0;
  // No se permite mezclar: un requerimiento es o de ítems del catálogo o de ítems nuevos (libres)
  return !(tieneItems && tieneLibres);
}, {
  message: "No se puede mezclar ítems del catálogo con ítems en texto libre en el mismo requerimiento. Usa solo uno de los dos tipos.",
  path: ["items"], // o items_libres
});

export const actualizarRequerimientoSchema = z.object({
  titulo_solicitud: z.string().min(5, 'El título debe tener al menos 5 caracteres').trim().optional(),
  notas: z.string().trim().optional(),
  area: z.string().trim().toUpperCase().min(1, 'Área requerida').optional(),
  departamento: z.string().trim().toUpperCase().min(1).optional(),
  tipo: z.enum(['PARTES', 'SERVICIOS', 'FLETES']).optional(),
  requiere_cotizacion: z.coerce.boolean().optional(),
  datatextnow_id: z.string().trim().optional(),
  items: z.array(
    z.object({
      catalogo_id: z.number().int().positive(),
      cantidad: z.number().positive(),
    })
  ).optional(),
  items_libres: z.array(itemLibreSchema).optional(),
}).refine((data) => {
  const tieneItems = Array.isArray(data.items) && data.items.length > 0;
  const tieneLibres = Array.isArray(data.items_libres) && data.items_libres.length > 0;
  // No se permite mezclar: un requerimiento es o de ítems del catálogo o de ítems nuevos (libres)
  return !(tieneItems && tieneLibres);
}, {
  message: "No se puede mezclar ítems del catálogo con ítems en texto libre en el mismo requerimiento. Usa solo uno de los dos tipos.",
  path: ["items"],
});

// Compras/Admin: corregir área y depto en REQ ya creados
export const actualizarAreaDepartamentoSchema = z.object({
  area: z.string().trim().toUpperCase().min(1, 'Área requerida'),
  departamento: z.string().trim().toUpperCase().min(1, 'Departamento requerido'),
});

export const actualizarNotasRequerimientoSchema = z.object({
  notas: z.union([z.string().max(4000), z.null()]).optional(),
});

export const actualizarTituloRequerimientoSchema = z.object({
  titulo_solicitud: z.string().min(5, 'El título debe tener al menos 5 caracteres').max(300).trim(),
});

// ============================================================
// ESQUEMAS DE CAMBIO DE ESTADO (Requerimientos)
// ============================================================

export const cambiarEstadoRequerimientoSchema = z.object({
  estado: z.enum(['en_revision', 'recibido', 'aprobado', 'incompleto', 'rechazado', 'cerrado'], {
    errorMap: () => ({ message: 'Estado inválido' }),
  }),
  notas: z.string().trim().optional(),
});
