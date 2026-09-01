/**
 * Listados REQ/OC: el solicitante ve lo suyo salvo que pida otro usuario o "todos".
 * Compras/Admin: sin filtro = todos.
 */
export function aplicarFiltroSolicitante(usuario, querySolicitanteId, filtros = {}) {
  const rol = usuario?.rol;
  const raw = querySolicitanteId == null ? '' : String(querySolicitanteId).trim();
  const pideTodos = raw === 'all' || raw === 'todos';

  if (rol === 'solicitante') {
    if (pideTodos) {
      delete filtros.solicitante_id;
    } else if (!raw) {
      filtros.solicitante_id = usuario.id;
    } else {
      filtros.solicitante_id = raw;
    }
    return filtros;
  }

  if (!raw || pideTodos) {
    delete filtros.solicitante_id;
  } else {
    filtros.solicitante_id = raw;
  }
  return filtros;
}

/**
 * Interpreta fecha de recepción (día calendario).
 * Vacío → null (el modelo usa NOW() / deja la existente).
 */
export function normalizarFechaRecepcion(valor) {
  if (valor == null || valor === '') return null;
  const s = String(valor).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    throw { status: 400, mensaje: 'fecha_recepcion debe tener formato YYYY-MM-DD' };
  }
  return `${m[1]}-${m[2]}-${m[3]} 12:00:00`;
}
