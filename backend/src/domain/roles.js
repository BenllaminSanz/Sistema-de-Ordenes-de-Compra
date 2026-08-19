/**
 * Reglas de roles y permisos de gestión de usuarios.
 * Fuente única para API, middleware y tests.
 */

export const ROLES_VALIDOS = ['solicitante', 'compras', 'admin'];

/** Rol legacy `contabilidad` → `compras` (tokens y datos previos). */
export function normalizarRol(rol) {
  if (rol === 'contabilidad') return 'compras';
  return rol;
}

export function esRolValido(rol) {
  return ROLES_VALIDOS.includes(normalizarRol(rol));
}

/**
 * ¿Puede el actor gestionar (editar/desactivar/reset) al usuario target?
 * - admin → cualquiera
 * - compras → cualquiera excepto admin
 */
export function puedeGestionarUsuario(actor, target) {
  if (!actor || !target) return false;
  const actorRol = normalizarRol(actor.rol);
  const targetRol = normalizarRol(target.rol);
  if (actorRol === 'admin') return true;
  if (actorRol === 'compras' && targetRol !== 'admin') return true;
  return false;
}

/**
 * ¿Puede el actor asignar el rol indicado al crear/editar?
 * - admin → cualquier rol válido
 * - compras → cualquier rol válido excepto admin
 */
export function puedeAsignarRol(actor, rol) {
  const r = normalizarRol(rol);
  if (!ROLES_VALIDOS.includes(r)) return false;
  if (!actor) return false;
  const actorRol = normalizarRol(actor.rol);
  if (actorRol === 'admin') return true;
  return actorRol === 'compras' && r !== 'admin';
}
