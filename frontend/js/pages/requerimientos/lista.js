// ── LISTA DE REQUERIMIENTOS ───────────────────────────────────

/** Orden activo por cabecera de columna (flechas ↑/↓). */
let _ordenReq = { por: 'fecha', dir: 'desc' };

const REQ_COLS_ORDENABLES = {
  consecutivo: 'Consecutivo',
  tipo: 'Tipo',
  area: 'Área',
  departamento: 'Depto',
  solicitante: 'Solicitante',
  estado: 'Estado',
  fecha: 'Fecha',
};

function aplicarOrdenReqDesdeUrl(params) {
  const por = params.get('ordenar_por') || params.get('sort');
  const dir = params.get('orden') || params.get('dir');
  if (por && REQ_COLS_ORDENABLES[por]) _ordenReq.por = por;
  if (dir === 'asc' || dir === 'desc') _ordenReq.dir = dir;
}

function thSortableReq(colKey, label) {
  const activa = _ordenReq.por === colKey;
  const ind = !activa ? '↕' : (_ordenReq.dir === 'asc' ? '↑' : '↓');
  const cls = activa ? 'th-sortable th-sorted' : 'th-sortable';
  const title = activa
    ? `Orden: ${ _ordenReq.dir === 'asc' ? 'ascendente' : 'descendente' }. Clic para invertir.`
    : `Ordenar por ${label}`;
  return `<th class="${cls}" data-sort="${colKey}" title="${title}">${label}<span class="sort-ind">${ind}</span></th>`;
}

window.ordenarRequerimientosPor = function(colKey) {
  if (!REQ_COLS_ORDENABLES[colKey]) return;
  if (_ordenReq.por === colKey) {
    _ordenReq.dir = _ordenReq.dir === 'asc' ? 'desc' : 'asc';
  } else {
    _ordenReq.por = colKey;
    // Fecha y consecutivo: primer clic = más nuevas / mayor primero (desc)
    _ordenReq.dir = (colKey === 'fecha' || colKey === 'consecutivo') ? 'desc' : 'asc';
  }
  cargarRequerimientos(1);
};

/** Carga el select de solicitantes (consulta general). */
async function cargarFiltroSolicitantesReq(valorPreferido) {
  const sel = document.getElementById('fil-solicitante');
  if (!sel) return;
  sel.style.display = '';
  if (sel.dataset.loaded === '1') {
    if (valorPreferido) sel.value = String(valorPreferido);
    actualizarUiFiltrosReq();
    return;
  }
  try {
    const usuarios = await Api.get('/auth/usuarios');
    const crudos = Array.isArray(usuarios) ? usuarios : (usuarios?.usuarios || []);
    const lista = UI.usuariosParaFiltro(crudos);
    const yo = Auth.getUsuario();
    const esSol = Auth.puedeHacer(['solicitante']);
    const actual = valorPreferido || sel.value;
    sel.innerHTML = esSol
      ? '<option value="all">Usuario: todos</option>'
      : '<option value="">Usuario: todos</option>';
    lista
      .slice()
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
      .forEach((u) => {
        const opt = document.createElement('option');
        opt.value = u.id;
        const inactivo = u.activo === 0 || u.activo === false ? ' (inactivo)' : '';
        opt.textContent = `${u.nombre || u.email}${inactivo}`;
        sel.appendChild(opt);
      });
    if (actual) sel.value = String(actual);
    else if (esSol && yo?.id) sel.value = String(yo.id);
    sel.dataset.loaded = '1';
    sel.onchange = () => onFiltroReqChange();
    if (actual) abrirFiltrosAvanzadosReq(true);
    actualizarUiFiltrosReq();
  } catch (err) {
    console.warn('No se pudieron cargar usuarios para filtro:', err);
  }
}

function contarFiltrosAvanzadosReq() {
  let n = 0;
  if (document.getElementById('fil-area')?.value) n++;
  if (document.getElementById('fil-departamento')?.value) n++;
  const solVal = document.getElementById('fil-solicitante')?.value;
  const yoId = Auth.getUsuario()?.id;
  if (Auth.puedeHacer(['compras', 'admin']) && solVal) n++;
  if (Auth.puedeHacer(['solicitante']) && solVal && solVal !== String(yoId)) n++;
  return n;
}

function hayFiltrosActivosReq() {
  return !!(
    document.getElementById('fil-busqueda')?.value?.trim()
    || document.getElementById('fil-estado')?.value
    || document.getElementById('fil-tipo')?.value
    || contarFiltrosAvanzadosReq() > 0
  );
}

function actualizarUiFiltrosReq() {
  const n = contarFiltrosAvanzadosReq();
  const badge = document.getElementById('fil-avanzados-badge');
  const btnMas = document.getElementById('btn-filtros-mas');
  const btnLimpiar = document.getElementById('btn-limpiar-filtros');
  if (badge) {
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = String(n);
    } else {
      badge.hidden = true;
    }
  }
  if (btnMas) {
    btnMas.classList.toggle('is-open', !document.getElementById('filtros-req-avanzados')?.hidden);
    btnMas.title = n > 0
      ? `${n} filtro(s) adicional(es) activo(s)`
      : 'Área, departamento y usuario';
  }
  if (btnLimpiar) {
    btnLimpiar.style.display = hayFiltrosActivosReq() ? '' : 'none';
  }
}

function abrirFiltrosAvanzadosReq(abrir) {
  const panel = document.getElementById('filtros-req-avanzados');
  const btn = document.getElementById('btn-filtros-mas');
  if (!panel) return;
  const open = abrir === true || (abrir !== false && panel.hidden);
  panel.hidden = !open;
  if (btn) {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.classList.toggle('is-open', open);
  }
  actualizarUiFiltrosReq();
}

function toggleFiltrosAvanzadosReq() {
  const panel = document.getElementById('filtros-req-avanzados');
  if (!panel) return;
  abrirFiltrosAvanzadosReq(panel.hidden);
}

function onFiltroReqChange() {
  actualizarUiFiltrosReq();
  cargarRequerimientos(1);
}

function limpiarFiltrosReq() {
  const busq = document.getElementById('fil-busqueda');
  if (busq) busq.value = '';
  const estado = document.getElementById('fil-estado');
  if (estado) estado.value = '';
  const tipo = document.getElementById('fil-tipo');
  if (tipo) tipo.value = '';
  const area = document.getElementById('fil-area');
  if (area) area.value = '';
  if (typeof filtrarFiltroDeptosPorArea === 'function') {
    filtrarFiltroDeptosPorArea('', false);
  }
  const depto = document.getElementById('fil-departamento');
  if (depto) depto.value = '';
  const sol = document.getElementById('fil-solicitante');
  if (sol) {
    sol.value = Auth.puedeHacer(['solicitante']) && Auth.getUsuario()?.id
      ? String(Auth.getUsuario().id)
      : '';
  }
  abrirFiltrosAvanzadosReq(false);
  actualizarUiFiltrosReq();
  cargarRequerimientos(1);
}

window.toggleFiltrosAvanzadosReq = toggleFiltrosAvanzadosReq;
window.limpiarFiltrosReq = limpiarFiltrosReq;
window.onFiltroReqChange = onFiltroReqChange;
window.actualizarUiFiltrosReq = actualizarUiFiltrosReq;

async function cargarRequerimientos(pagina) {
  paginaActual = pagina;
  const contenedor = document.getElementById('tabla-reqs');
  UI.spinner(contenedor);

  const busqueda = document.getElementById('fil-busqueda').value;
  const estado   = document.getElementById('fil-estado').value;
  const tipo     = document.getElementById('fil-tipo').value;
  const area     = document.getElementById('fil-area').value;
  const depto    = document.getElementById('fil-departamento').value;
  const solicitante = document.getElementById('fil-solicitante')?.value || '';

  let qs = `?pagina=${pagina}&limite=15`;
  if (busqueda) qs += `&busqueda=${encodeURIComponent(busqueda)}`;
  if (estado)   qs += `&estado=${encodeURIComponent(estado)}`;
  if (tipo)     qs += `&tipo=${tipo}`;
  if (area)     qs += `&area=${encodeURIComponent(area)}`;
  if (depto)    qs += `&departamento=${encodeURIComponent(depto)}`;
  if (solicitante) qs += `&solicitante_id=${encodeURIComponent(solicitante)}`;
  else if (Auth.puedeHacer(['solicitante']) && Auth.getUsuario()?.id) {
    qs += `&solicitante_id=${encodeURIComponent(Auth.getUsuario().id)}`;
  }
  if (_ordenReq.por) qs += `&ordenar_por=${encodeURIComponent(_ordenReq.por)}`;
  if (_ordenReq.dir) qs += `&orden=${encodeURIComponent(_ordenReq.dir)}`;

  try {
    const { datos, total, limite } = await Api.get('/requerimientos' + qs);

    if (!datos.length) {
      let msg = estado === 'activos'
        ? 'No hay requerimientos activos (sin estado cerrado) con los filtros actuales.'
        : 'No se encontraron requerimientos';
      if (solicitante) msg = 'No hay requerimientos de ese usuario con los filtros actuales.';
      UI.empty(contenedor, msg);
      document.getElementById('paginacion-reqs').innerHTML = '';
      return;
    }

    contenedor.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            ${thSortableReq('consecutivo', 'Consecutivo')}
            ${thSortableReq('titulo', 'Título')}
            ${thSortableReq('tipo', 'Tipo')}
            ${thSortableReq('area', 'Área')}
            ${thSortableReq('departamento', 'Depto')}
            ${thSortableReq('solicitante', 'Solicitante')}
            <th>Cotización</th>
            ${thSortableReq('estado', 'Estado')}
            ${thSortableReq('fecha', 'Fecha')}
            <th></th>
          </tr></thead>
          <tbody>
            ${datos.map(r => `
            <tr>
              <td class="fw-600">${r.consecutivo || '<span class="text-muted" title="Se asigna al enviar a revisión">—</span>'}</td>
              <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${UI.esc(r.titulo_solicitud || r.notas || '')}">${UI.esc(r.titulo_solicitud || '—')}</td>
              <td>${r.tipo}</td>
              <td>${r.area || '—'}</td>
              <td>${r.departamento || '—'}</td>
              <td>${r.solicitante_nombre}</td>
              <td>${r.requiere_cotizacion ? '✔' : '—'}</td>
              <td>${UI.badge(r.estado)}</td>
              <td class="text-muted text-sm">${UI.fecha(r.created_at)}</td>
              <td>
                <button class="btn btn-sm btn-outline" data-action="ver" data-id="${r.id}" title="Ver detalle" style="padding:2px 6px;">
                  <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.25" viewBox="0 0 24 24" style="vertical-align:-1px;">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    UI.paginacion(
      document.getElementById('paginacion-reqs'),
      total, pagina, limite,
      (p) => cargarRequerimientos(p)
    );

    const tablaReqs = document.getElementById('tabla-reqs');
    if (tablaReqs && !tablaReqs.dataset.verDelegateAttached) {
      tablaReqs.dataset.verDelegateAttached = 'true';
      window.delegate(tablaReqs, 'button[data-action="ver"]', 'click', (e, btn) => {
        const id = btn.dataset.id;
        if (id) abrirDetalle(id);
      });
      window.delegate(tablaReqs, 'th.th-sortable', 'click', (e, th) => {
        const col = th.dataset.sort;
        if (col) ordenarRequerimientosPor(col);
      });
    }

  } catch (err) {
    UI.empty(contenedor, 'Error al cargar requerimientos');
    Toast.error(err.mensaje || 'Error al cargar');
  }
}

// Filtros principales: aplican al cambiar (sin botón «Filtrar»)
const busquedaInput = document.getElementById('fil-busqueda');
if (busquedaInput) {
  busquedaInput.addEventListener('input', window.debounce(() => {
    onFiltroReqChange();
  }, 350));
}
['fil-estado', 'fil-tipo'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => onFiltroReqChange());
});
// Si ya hay filtros avanzados (p. ej. URL), mostrar panel y badge
if (typeof actualizarUiFiltrosReq === 'function') {
  if (contarFiltrosAvanzadosReq() > 0) abrirFiltrosAvanzadosReq(true);
  else actualizarUiFiltrosReq();
}
