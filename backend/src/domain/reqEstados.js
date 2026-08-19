/**
 * Máquina de estados de requerimientos y permisos por rol.
 *
 * Flujo modelo:
 *   borrador → en_revision (solicitante envía)
 *   en_revision → recibido (Compras acusa recibo) | rechazado
 *   recibido → aprobado | incompleto | rechazado | en_revision
 *   Tras generar OC el REQ queda cerrado; cancelar se hace sobre la OC.
 */

/** Transiciones permitidas por el modelo (independiente del rol). */
export const TRANSICIONES_REQ = {
  borrador: ['en_revision'],
  en_revision: ['recibido', 'rechazado'],
  recibido: ['aprobado', 'incompleto', 'rechazado', 'en_revision'],
  incompleto: ['en_revision', 'rechazado'],
  aprobado: ['cerrado', 'rechazado', 'recibido', 'en_revision'],
  rechazado: [],
  cerrado: [],
};

/**
 * Transiciones permitidas por rol (admin puede todas las del modelo).
 * El modelo aún debe validar TRANSICIONES_REQ.
 */
export const TRANSICIONES_POR_ROL = {
  solicitante: {
    borrador: ['en_revision'],
    incompleto: ['en_revision'],
  },
  compras: {
    // Compras: acusa recibo (recibido), decide y puede regresar/cancelar pre-OC
    borrador: ['en_revision'],
    incompleto: ['en_revision', 'rechazado'],
    en_revision: ['recibido', 'rechazado'],
    recibido: ['aprobado', 'incompleto', 'rechazado', 'en_revision'],
    aprobado: ['cerrado', 'rechazado', 'recibido', 'en_revision'],
  },
};

/** ¿El modelo permite pasar de estadoActual a estadoNuevo? */
export function puedeTransicionReq(estadoActual, estadoNuevo) {
  const permitidos = TRANSICIONES_REQ[estadoActual] || [];
  return permitidos.includes(estadoNuevo);
}

/**
 * ¿El rol puede solicitar el cambio de estado?
 * Admin siempre true (la máquina de modelo se valida aparte).
 */
export function puedeCambiarEstadoRequerimiento(rol, estadoActual, estadoNuevo) {
  if (rol === 'admin') return true;
  const permitidas = TRANSICIONES_POR_ROL[rol]?.[estadoActual] || [];
  return permitidas.includes(estadoNuevo);
}
