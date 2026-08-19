/**
 * Máquina de estados de órdenes de compra (compras/admin).
 * Incluye avance del flujo, cancelación y regreso a estados anteriores
 * mientras la OC no esté cerrada/cancelada.
 *
 * Nota: el paso a `recibida` suele ocurrir vía recepciones, no solo por PATCH manual.
 */

export const TRANSICIONES_OC = {
  generada: ['distribuida', 'cancelada'],
  distribuida: ['en_proceso', 'cancelada', 'generada'],
  en_proceso: ['cerrada', 'cancelada', 'distribuida'],
  recibida: ['cerrada', 'en_proceso'],
  cerrada: [],
  cancelada: [],
};

/** ¿El modelo permite pasar de estadoActual a estadoNuevo? */
export function puedeTransicionOc(estadoActual, estadoNuevo) {
  const permitidos = TRANSICIONES_OC[estadoActual] || [];
  return permitidos.includes(estadoNuevo);
}
