// ── LISTA DE REQUERIMIENTOS ───────────────────────────────────

async function cargarRequerimientos(pagina) {
  paginaActual = pagina;
  const contenedor = document.getElementById('tabla-reqs');
  UI.spinner(contenedor);

  const busqueda = document.getElementById('fil-busqueda').value;
  const estado   = document.getElementById('fil-estado').value;
  const tipo     = document.getElementById('fil-tipo').value;
  const area     = document.getElementById('fil-area').value;
  const depto    = document.getElementById('fil-departamento').value;

  let qs = `?pagina=${pagina}&limite=15`;
  if (busqueda) qs += `&busqueda=${encodeURIComponent(busqueda)}`;
  if (estado)   qs += `&estado=${estado}`;
  if (tipo)     qs += `&tipo=${tipo}`;
  if (area)     qs += `&area=${encodeURIComponent(area)}`;
  if (depto)    qs += `&departamento=${encodeURIComponent(depto)}`;

  try {
    const { datos, total, limite } = await Api.get('/requerimientos' + qs);

    if (!datos.length) { UI.empty(contenedor, 'No se encontraron requerimientos'); return; }

    contenedor.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Consecutivo</th><th>Tipo</th><th>Área</th><th>Depto</th><th>Notas / Detalles</th>
            <th>Solicitante</th><th>Cotización</th><th>Estado</th><th>Fecha</th><th></th>
          </tr></thead>
          <tbody>
            ${datos.map(r => `
            <tr>
              <td class="fw-600">${r.consecutivo}</td>
              <td>${r.tipo}</td>
              <td>${r.area || '—'}</td>
              <td>${r.departamento || '—'}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${UI.esc(r.notas || r.descripcion || '')}">${UI.esc(r.notas || r.descripcion || '')}</td>
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
    }

  } catch (err) {
    UI.empty(contenedor, 'Error al cargar requerimientos');
    Toast.error(err.mensaje || 'Error al cargar');
  }
}

// Búsqueda con debounce
const busquedaInput = document.getElementById('fil-busqueda');
if (busquedaInput) {
  busquedaInput.addEventListener('input', window.debounce(() => {
    cargarRequerimientos(1);
  }, 350));
}
