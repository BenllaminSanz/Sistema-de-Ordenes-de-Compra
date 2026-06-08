/**
 * requerimientos.js
 * Lógica de la página de Requerimientos
 */

Auth.requiereAuth();
renderSidebar();
renderTopbar('Requerimientos');

let paginaActual = 1;
let requerimientoActual = null;
let estadoPendiente = null;
let editandoId = null;  // ID del requerimiento que se está editando (null = nuevo)
let cotizacionEditandoId = null; // ID de la cotización que se está editando (null = nueva)
let cotizacionParaPdfId = null; // ID de la cotización a la que se le adjuntará PDF

// ── Permisos de Cotizaciones ──────────────────────────────────
function puedeGestionarCotizaciones() {
  return Auth.puedeHacer(['contabilidad', 'admin']);
}

// ── Ocultar botón "nuevo" si no es solicitante/admin ──────────
if (!Auth.puedeHacer(['solicitante','admin'])) {
  const btnNuevo = document.getElementById('btn-nuevo');
  if (btnNuevo) btnNuevo.style.display = 'none';
}

// ── Si viene con ?id= mostrar detalle directo ─────────────────
const params = new URLSearchParams(window.location.search);
if (params.get('id')) {
  abrirDetalle(params.get('id'));
} else {
  cargarRequerimientos(1);
}

// ── LISTA ─────────────────────────────────────────────────────
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
                  title="${r.notas || r.descripcion || ''}">${r.notas || r.descripcion || ''}</td>
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

    // Attach delegation only once (after first render)
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

// ── DETALLE ───────────────────────────────────────────────────
async function abrirDetalle(id) {
  const lista = document.getElementById('vista-lista');
  const detalle = document.getElementById('vista-detalle');

  lista.style.display = 'none';
  detalle.style.display = 'block';
  detalle.classList.remove('hidden');   // ensure it's visible

  document.getElementById('detalle-info').innerHTML = '<div class="spinner"></div>';

  try {
    const req = await Api.get(`/requerimientos/${id}`);
    requerimientoActual = req;
    renderDetalle(req);
  } catch (err) {
    Toast.error('No se pudo cargar el requerimiento');
    document.getElementById('detalle-info').innerHTML = `
      <div class="empty-state">
        <p>No se pudo cargar el requerimiento.</p>
        <button class="btn btn-outline btn-sm mt-2" onclick="volverLista()">Volver a la lista</button>
      </div>
    `;
  }
}

function volverLista() {
  const lista = document.getElementById('vista-lista');
  const detalle = document.getElementById('vista-detalle');

  lista.style.display = 'block';
  detalle.style.display = 'none';
  detalle.classList.add('hidden');

  requerimientoActual = null;
  cargarRequerimientos(paginaActual);
  history.replaceState(null, '', window.location.pathname);
}

// ── Editor de requerimiento (crear o editar) ───────────────────
function abrirEditorRequerimiento(req = null) {
  const tituloEl = document.querySelector('#modal-req .modal-title');
  const btnGuardar = document.getElementById('btn-guardar-req');
  const form = document.getElementById('form-req');

  if (req && req.id) {
    // Modo edición
    editandoId = req.id;
    tituloEl.textContent = 'Editar requerimiento';
    btnGuardar.textContent = 'Guardar cambios';

    // Cargar valores existentes para edición
    document.getElementById('req-titulo').value = req.titulo_solicitud || '';
    document.getElementById('req-tipo').value = req.tipo || '';
    document.getElementById('req-area').value = req.area || '';
    document.getElementById('req-departamento').value = req.departamento || '';
    document.getElementById('req-notas').value = req.notas || req.descripcion || '';

    // Cargar ítems del catálogo si existen
    window.requerimientoItemsSeleccionados = (req.items || []).map(i => ({
      catalogo_id: i.catalogo_id,
      codigo: i.codigo,
      descripcion: i.descripcion,
      costo_referencia: i.costo_referencia != null ? parseFloat(i.costo_referencia) : null,
      moneda: i.moneda || 'MXN',
      cantidad: Math.round(i.cantidad) || 1
    }));
    renderItemsSeleccionados();

    // Cargar ítems libres (texto libre) si existen
    window.requerimientoItemsLibres = (req.items_libres || []).map(i => ({
      descripcion: i.descripcion,
      cantidad: Math.max(1, Math.round(parseFloat(i.cantidad) || 1)),
      unidad: i.unidad || '',
      notas: i.notas || ''
    }));
    renderLibresResumen();

    // Sincronizar el checkbox del selector al final según el contenido
    const checkbox = document.getElementById('usar-items-nuevos');
    if (checkbox) {
      const esModoLibres = (req.items_libres && req.items_libres.length > 0) && (!req.items || req.items.length === 0);
      checkbox.checked = esModoLibres;

      // Si es modo libres, podemos abrir el modal de libres automáticamente (o no, según preferencia)
      // Por ahora solo marcamos el checkbox. El usuario puede abrirlo con el botón si quiere editar.
      const seccionEl = document.getElementById('seccion-items-catalogo');
      const actions = document.getElementById('libres-actions');
      if (esModoLibres) {
        if (seccionEl) seccionEl.style.display = 'none';
        if (actions) actions.style.display = 'block';
        // Opcional: mostrar un pequeño recordatorio
        // Toast.info('Este requerimiento usa ítems nuevos. Abre "Gestionar ítems nuevos" si necesitas editarlos.');
      } else {
        if (seccionEl) seccionEl.style.display = 'block';
        if (actions) actions.style.display = 'none';
      }
    }

    // Advertencia para datos históricos que pudieron quedar en estado mezclado antes de la regla de exclusividad
    const tieneAmbos = (req.items && req.items.length > 0) && (req.items_libres && req.items_libres.length > 0);
    if (tieneAmbos) {
      Toast.warning('Este requerimiento tiene tanto ítems del catálogo como libres. Elige un solo tipo (catálogo o solo nuevos para cotizar).');
    }
  } else {
    // Modo nuevo
    editandoId = null;
    tituloEl.textContent = 'Nuevo requerimiento';
    btnGuardar.textContent = 'Guardar';
    form.reset();
    window.requerimientoItemsSeleccionados = [];
    window.requerimientoItemsLibres = [];
    renderItemsSeleccionados();
    renderLibresResumen();

    const checkbox = document.getElementById('usar-items-nuevos');
    if (checkbox) checkbox.checked = false;

    const seccion = document.getElementById('seccion-items-catalogo');
    if (seccion) seccion.style.opacity = '1';
  }

  // Mostrar/ocultar sección de catálogo y el selector según tipo
  const seccion = document.getElementById('seccion-items-catalogo');
  const selector = document.getElementById('selector-items-nuevos');
  const tipoVal = document.getElementById('req-tipo').value;

  if (seccion) {
    seccion.style.display = tipoVal ? 'block' : 'none';
  }
  if (selector) {
    selector.style.display = tipoVal ? 'block' : 'none';
  }

  // Si ya está marcado el selector de items nuevos, ocultar la sección catálogo
  const cb = document.getElementById('usar-items-nuevos');
  const actions = document.getElementById('libres-actions');
  if (cb && cb.checked) {
    if (seccion) seccion.style.display = 'none';
    if (actions) actions.style.display = 'block';
  } else if (actions) {
    actions.style.display = 'none';
  }

  // Manejar filtro de proveedor (disponible para PARTES, SERVICIOS y FLETES)
  const provWrapper2 = document.getElementById('filtro-proveedor-wrapper');
  const provSel2 = document.getElementById('filtro-proveedor-catalogo');
  if (provWrapper2) {
    provWrapper2.style.display = tipoVal ? '' : 'none';
  }
  if (provSel2 && !tipoVal) {
    provSel2.value = '';
  }
  if (tipoVal) {
    cargarFiltroProveedoresParaCatalogo();
  }

  UI.abrirModal('modal-req');
}

// Al cerrar el modal de requerimiento, limpiamos el modo edición
const modalReq = document.getElementById('modal-req');
if (modalReq) {
  modalReq.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-close') || 
        (e.target.tagName === 'BUTTON' && e.target.textContent.includes('Cancelar'))) {
      setTimeout(() => { editandoId = null; }, 150);
    }
  });
}

function renderDetalle(req) {
  document.getElementById('detalle-titulo').textContent =
    `${req.consecutivo} — ${req.tipo}`;

  // ── Info principal ────────────────────────────────────────
  document.getElementById('detalle-info').innerHTML = `
    <div class="card-title">Información del requerimiento</div>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:6px 0;color:#6b7280;width:140px">Consecutivo</td>
          <td class="fw-600">${req.consecutivo}</td></tr>
      ${req.titulo_solicitud ? `<tr><td style="padding:6px 0;color:#6b7280">Título</td><td class="fw-600">${req.titulo_solicitud}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#6b7280">Tipo</td>
          <td>${req.tipo}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Área</td>
          <td>${req.area || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Departamento</td>
          <td>${req.departamento || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Estado</td>
          <td>${UI.badge(req.estado)}</td></tr>
      ${req.oc_id || req.oc_numero ? `
      <tr><td style="padding:6px 0;color:#6b7280">OC Relacionada</td>
          <td>
            <a href="ordenes.html?id=${req.oc_id}" style="color:var(--primary);font-weight:600;text-decoration:none">${req.oc_numero}</a>
            ${UI.badge(req.oc_estado)}
            <button class="btn btn-sm btn-outline" style="margin-left:6px;padding:1px 6px;font-size:11px" onclick="window.location='ordenes.html?id=${req.oc_id}'">Ver OC</button>
          </td></tr>` : (req.estado === 'aprobado' ? `
      <tr><td style="padding:6px 0;color:#6b7280">OC Relacionada</td>
          <td><span class="text-muted">Pendiente de generación (Contabilidad)</span></td></tr>` : '')}
      <tr><td style="padding:6px 0;color:#6b7280">Solicitante</td>
          <td>${req.solicitante_nombre}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Requiere cotización</td>
          <td>${req.requiere_cotizacion ? 'Sí' : 'No'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">PO en DataTextNow</td>
          <td>${req.datatextnow_id || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Fecha creación</td>
          <td>${UI.fecha(req.created_at)}</td></tr>
    </table>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f0f0f0">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Notas / Detalles</div>
      <p style="margin:0;line-height:1.6">${req.notas || req.descripcion || '—'}</p>
    </div>

    <!-- Ítems del Catálogo -->
    ${req.items && req.items.length > 0 ? `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f0f0f0">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Ítems solicitados del Catálogo</div>
      <table style="width:100%; font-size:13px; border-collapse: collapse;">
        <thead>
          <tr style="background:#f8f9fa;">
            <th style="text-align:left; padding:4px 6px;">Código</th>
            <th style="text-align:left; padding:4px 6px;">Descripción</th>
            <th style="text-align:right; padding:4px 6px;">Cantidad</th>
            <th style="text-align:right; padding:4px 6px;">Precio ref.</th>
          </tr>
        </thead>
        <tbody>
          ${req.items.map(item => {
            const p = (item.costo_referencia != null) ? parseFloat(item.costo_referencia).toFixed(2) : '—';
            const m = item.moneda || 'MXN';
            return `
            <tr>
              <td style="padding:4px 6px; border-bottom:1px solid #eee;"><strong>${item.codigo}</strong></td>
              <td style="padding:4px 6px; border-bottom:1px solid #eee;">${item.descripcion}</td>
              <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right;">${parseFloat(item.cantidad).toLocaleString('es-MX')}</td>
              <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right; color:#0d6efd; font-weight:500;">${p} ${m}</td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Ítems en texto libre (no estaban en catálogo al momento de la solicitud) -->
    ${req.items_libres && req.items_libres.length > 0 ? `
    <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #f0ad4e">
      <div style="font-size:11px;color:#b45309;margin-bottom:3px">
        Ítems en texto libre (no existían en el catálogo)
        <span style="font-size:9px; color:#854d0e;">— (Este req debe ser SOLO de libres para cotización y alta en catálogo)</span>
      </div>
      <ul style="margin:0; padding-left:16px; font-size:12px;">
        ${req.items_libres.map(item => `
          <li>${item.descripcion} — <strong>${parseFloat(item.cantidad).toLocaleString('es-MX')}</strong>${item.unidad ? ' ' + item.unidad : ''}</li>
        `).join('')}
      </ul>
    </div>` : ''}

    ${ (req.estado === 'borrador' || req.estado === 'incompleto') && (Auth.getUsuario() && Auth.getUsuario().id === req.solicitante_id) ? `
    <div style="margin-top:12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:7px;padding:10px 12px;font-size:13px">
      <strong>📝 Borrador</strong> — Puedes editar este requerimiento antes de enviarlo a revisión.
    </div>` : '' }

    ${req.notas_rechazo ? `
    <div style="margin-top:12px;background:#FCEBEB;border-radius:7px;padding:12px">
      <div style="font-size:12px;font-weight:600;color:#A32D2D;margin-bottom:4px">Nota de rechazo</div>
      <p style="margin:0;font-size:13px;color:#791F1F">${req.notas_rechazo}</p>
    </div>` : ''}`;

  // ── Cotizaciones ──────────────────────────────────────────
  const panelCot = document.getElementById('detalle-cotizaciones');
  if (req.requiere_cotizacion) {
    panelCot.style.display = 'block';
    cargarCotizaciones(req.id);

    // Solo contabilidad y admin pueden agregar cotizaciones
    const btnAgregar = document.getElementById('btn-agregar-cot');
    if (btnAgregar) {
      btnAgregar.style.display = puedeGestionarCotizaciones() ? '' : 'none';
    }
  } else {
    panelCot.style.display = 'none';
  }

  // ── Historial ─────────────────────────────────────────────
  const timeline = document.getElementById('historial-timeline');
  if (!req.historial?.length) {
    timeline.innerHTML = '<p class="text-muted text-sm">Sin historial</p>';
  } else {
    timeline.innerHTML = req.historial.map(h => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-date">${UI.fecha(h.created_at)} · ${h.cambiado_por}</div>
        <div class="timeline-text">
          ${h.estado_anterior
            ? `${UI.badge(h.estado_anterior)} → ${UI.badge(h.estado_nuevo)}`
            : `Creado como ${UI.badge(h.estado_nuevo)}`}
          ${h.notas ? `<div class="text-sm text-muted mt-2">${h.notas}</div>` : ''}
        </div>
      </div>`).join('');
  }

  // ── Panel de acciones por rol ─────────────────────────────
  renderAcciones(req);

  // Delegación para el panel de acciones (una sola vez es suficiente)
  const accionesPanel = document.getElementById('panel-acciones');
  if (accionesPanel && !accionesPanel.dataset.delegateAttached) {
    accionesPanel.dataset.delegateAttached = 'true';

    window.delegate(accionesPanel, 'button[data-action]', 'click', (e, btn) => {
      const action = btn.dataset.action;
      if (action === 'imprimirRequerimiento') imprimirRequerimiento();
      if (action === 'editarRequerimientoActual') editarRequerimientoActual();
      if (action === 'generarOC') generarOC();
    });

    window.delegate(accionesPanel, 'button[data-estado]', 'click', (e, btn) => {
      const estado = btn.dataset.estado;
      const label = btn.dataset.label;
      if (estado) prepararCambioEstado(estado, label);
    });
  }
}

function renderAcciones(req) {
  const panel  = document.getElementById('panel-acciones');
  const u      = Auth.getUsuario();
  const acciones = [];

  acciones.push({ label:'🖨️ Imprimir',  accion:'imprimirRequerimiento',  clase:'btn-secundary'  });

  // ── Acciones del dueño (solicitante) sobre sus borradores ─────
  const esDueno = u && req.solicitante_id === u.id;
  if (esDueno && (req.estado === 'borrador' || req.estado === 'incompleto')) {
    acciones.push({ label:'✏️ Editar', accion:'editarRequerimientoActual', clase:'btn-outline' });
    acciones.push({ label:'📤 Enviar a revisión', estado:'en_revision', clase:'btn-primary' });
  }

  if (['contabilidad','admin'].includes(u.rol)) {
    if (req.estado === 'en_revision') {
      acciones.push({ label:'Aprobar',   estado:'aprobado',   clase:'btn-success' });
      acciones.push({ label:'Incompleto',estado:'incompleto', clase:'btn-outline' });
      acciones.push({ label:'Rechazar',  estado:'rechazado',  clase:'btn-danger'  });
    }
    if (req.estado === 'aprobado' && ['contabilidad','admin'].includes(u.rol)) {
      acciones.push({ label:'Generar OC', accion:'generarOC', clase:'btn-primary' });
    }
  }

  if (!acciones.length) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="card-title">Acciones</div>
    <div class="stacked-actions">
      ${acciones.map(a => {
        if (a.accion) {
          return `<button class="btn ${a.clase}" data-action="${a.accion}">${a.label}</button>`;
        } else {
          return `<button class="btn ${a.clase}" data-estado="${a.estado}" data-label="${a.label}">${a.label}</button>`;
        }
      }).join('')}
    </div>`;
}

// ── Cambio de estado ──────────────────────────────────────────
function prepararCambioEstado(estado, label) {
  estadoPendiente = estado;
  document.getElementById('modal-estado-titulo').textContent = label;
  document.getElementById('estado-notas').value = '';
  UI.abrirModal('modal-estado');

  document.getElementById('btn-confirmar-estado').onclick = async () => {
    const notas = document.getElementById('estado-notas').value;
    try {
      await Api.patch(`/requerimientos/${requerimientoActual.id}/estado`,
        { estado: estadoPendiente, notas });
      UI.cerrarModal('modal-estado');
      Toast.success('Estado actualizado');
      abrirDetalle(requerimientoActual.id);
    } catch (err) {
      Toast.error(err.mensaje || 'Error al cambiar estado');
    }
  };
}

// Generar archivo del requerimiento (incluye la cotización seleccionada si existe)
async function imprimirRequerimiento() {
    const detalleElement = document.getElementById('detalle-info');
    
    if (!detalleElement) {
        console.error("No se encontró el contenedor de detalle");
        return;
    }

    let cotizacionHtml = '';

    // Intentar cargar la cotización seleccionada
    if (requerimientoActual && requerimientoActual.requiere_cotizacion) {
        try {
            const response = await Api.get(`/cotizaciones/${requerimientoActual.id}`);
            const cotizaciones = Array.isArray(response) ? response : (response.data || []);
            const seleccionada = cotizaciones.find(c => c.seleccionada === 1 || c.estado === 'seleccionada');

            if (seleccionada) {
                const monto = parseFloat(seleccionada.monto_total || 0).toLocaleString('es-MX');
                let itemsHtml = '';

                if (seleccionada.items && seleccionada.items.length > 0) {
                    itemsHtml = `
                        <table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:12px;">
                            <thead>
                                <tr style="background:#f1f5f9;">
                                    <th style="text-align:left; padding:6px; border:1px solid #ccc;">Descripción</th>
                                    <th style="text-align:center; padding:6px; border:1px solid #ccc;">Cant.</th>
                                    <th style="text-align:center; padding:6px; border:1px solid #ccc;">Unidad</th>
                                    <th style="text-align:right; padding:6px; border:1px solid #ccc;">Precio Unit.</th>
                                    <th style="text-align:right; padding:6px; border:1px solid #ccc;">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${seleccionada.items.map(item => {
                                    const cantidad = Math.round( parseFloat(item.cantidad) || 1 );
                                    const precio = redondear2( parseFloat(item.precio_unitario) || 0 );
                                    const sub = redondear2(cantidad * precio).toLocaleString('es-MX');
                                    return `
                                        <tr>
                                            <td style="padding:4px; border:1px solid #ccc;">${item.descripcion || ''}</td>
                                            <td style="text-align:center; padding:4px; border:1px solid #ccc;">${cantidad}</td>
                                            <td style="text-align:center; padding:4px; border:1px solid #ccc;">${item.unidad || 'pieza'}</td>
                                            <td style="text-align:right; padding:4px; border:1px solid #ccc;">$${precio.toLocaleString('es-MX')}</td>
                                            <td style="text-align:right; padding:4px; border:1px solid #ccc; font-weight:600;">$${sub}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    `;
                }

                cotizacionHtml = `
                    <div style="margin-top:30px; border:2px solid #166534; padding:15px; border-radius:6px;">
                        <h3 style="color:#166534; margin:0 0 10px;">✓ Cotización Seleccionada</h3>
                        <p style="margin:4px 0;"><strong>Proveedor:</strong> ${UI.labelProveedor(seleccionada)}</p>
                        <p style="margin:4px 0;"><strong>Monto Total:</strong> <span style="font-size:18px; font-weight:700; color:#166534;">$${monto} ${seleccionada.moneda || 'MXN'}</span></p>
                        ${itemsHtml}
                        ${seleccionada.notas ? `<p style="margin-top:10px;"><strong>Notas:</strong> ${seleccionada.notas}</p>` : ''}
                    </div>
                `;
            }
        } catch (e) {
            console.warn('No se pudo cargar la cotización seleccionada para impresión', e);
        }
    }

    const ventana = window.open('', '_blank', 'width=800,height=600');
    const contenido = `
        <html>
            <head>
                <title>Requerimiento: ${requerimientoActual.consecutivo}</title>
                <link rel="stylesheet" href="css/app.css">
                <style>
                    body { padding: 30px; background: white; color: black; font-family: Arial, sans-serif; }
                    .no-print, .btn, #sidebar, #topbar { display: none !important; }
                    .card { border: 1px solid #000; box-shadow: none; padding: 20px; }
                </style>
            </head>
            <body>
                <h2>Detalle del Requerimiento: ${requerimientoActual.consecutivo}</h2>
                <hr>
                ${detalleElement.innerHTML}
                ${cotizacionHtml}
            </body>
        </html>
    `;
    
    ventana.document.write(contenido);
    ventana.document.close();
    
    setTimeout(() => {
        ventana.print();
        ventana.close();
    }, 600);
}

function editarRequerimientoActual() {
  if (!requerimientoActual) return;
  abrirEditorRequerimiento(requerimientoActual);
}

// ── Generar OC desde el requerimiento ────────────────────────
async function generarOC() {
  // Si tiene cotización, buscar la seleccionada
  let cotizacion_id = null;
  if (requerimientoActual.requiere_cotizacion) {
    const response = await Api.get(`/cotizaciones/${requerimientoActual.id}`);
    const cots = Array.isArray(response) ? response : (response.data || []);
    const sel = cots.find(c => c.seleccionada === 1 || c.estado === 'seleccionada');
    if (!sel) {
      Toast.error('Debes seleccionar una cotización antes de generar la OC');
      return;
    }
    cotizacion_id = sel.id;
  }

  try {
    const oc = await Api.post('/ordenes-compra', {
      requerimiento_id: requerimientoActual.id,
      cotizacion_id,
    });
    Toast.success(`OC generada: ${oc.numero_oc}`);
    setTimeout(() => window.location.href = `ordenes.html?id=${oc.id}`, 1200);
  } catch (err) {
    if (err.status === 403 || (err.mensaje && err.mensaje.toLowerCase().includes('permiso'))) {
      Toast.error('No tienes permiso para generar Órdenes de Compra. Contacta a Contabilidad o Administrador.');
    } else {
      Toast.error(err.mensaje || 'Error al generar OC');
    }
  }
}

// ── COTIZACIONES ──────────────────────────────────────────────────────────────
async function cargarCotizaciones(reqId) {
  
  const contenedor = document.getElementById('lista-cotizaciones');

  UI.spinner(contenedor);

  try {
    const response = await Api.get(`/cotizaciones/${reqId}`);
    
    // Asegurarnos de que sea un array
    const cotizaciones = Array.isArray(response) ? response : 
                        (response.data && Array.isArray(response.data) ? response.data : []);

    if (cotizaciones.length === 0) {
      contenedor.innerHTML = `
        <p class="text-muted text-center py-4">
          Aún no hay cotizaciones registradas para este requerimiento.
        </p>`;
      return;
    }

    let html = `
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Proveedor</th>
            <th class="text-end">Monto Total</th>
            <th>Estado</th>
            <th>Fecha Envio</th>
            <th>PDF</th>
            <th class="text-center">Acción</th>
          </tr>
        </thead>
        <tbody>`;

    cotizaciones.forEach(c => {
      const monto = parseFloat(c.monto_total || 0).toLocaleString('es-MX');
      const tieneIva = c.iva && parseFloat(c.iva) > 0;
      const estado = c.seleccionada === 1 || c.estado === 'seleccionada' 
        ? `<span class="badge bg-success">Seleccionada</span>` 
        : (c.estado 
            ? `<span class="badge bg-secondary">${c.estado}</span>` 
            : `<span class="badge bg-warning">Pendiente</span>`);

      const tieneItems = c.items && c.items.length > 0;
      const desgloseBtn = tieneItems 
        ? `<button class="btn btn-sm btn-link p-0 ms-2" data-cot-action="toggle-desglose" data-cot-id="${c.id}" title="Ver desglose de conceptos">▼ Desglose</button>`
        : '';

      const esGestor = puedeGestionarCotizaciones();

      // Solo mostrar botón de enviar correo para casos que lo requieren según la regla
      const reqParaCot = requerimientoActual || {};
      const esLibresParaCot = reqParaCot.items_libres && reqParaCot.items_libres.length > 0;
      const esServicioParaCot = (reqParaCot.tipo || '').toUpperCase() === 'SERVICIOS';
      const mostrarBotonEnviar = esGestor && (esLibresParaCot || esServicioParaCot);

      html += `
        <tr data-cot-id="${c.id}">
          <td><strong>${UI.labelProveedor(c) || 'Sin proveedor'}</strong></td>
          <td class="text-end fw-600">
            $${monto} ${c.moneda || 'MXN'}
            ${tieneIva ? '<span class="text-xs text-muted">(con IVA)</span>' : ''}
            ${desgloseBtn}
          </td>
          <td>${estado}</td>
          <td class="text-muted">${c.fecha_envio ? UI.fecha(c.fecha_envio) : '—'}</td>
          <td>
            ${c.archivo_url 
              ? `<a href="${c.archivo_url}" target="_blank" class="btn btn-sm btn-outline" title="Ver PDF adjunto como respaldo de la cotización">📄 Ver PDF</a>` 
              : `<span class="text-muted small">—</span>`}
          </td>
          <td class="text-center">
            ${c.seleccionada !== 1 && esGestor
              ? `
                <div class="d-flex gap-1 justify-content-center flex-wrap" style="font-size:0.75rem;">
                  <button class="btn btn-success btn-sm px-1 py-0" data-cot-action="seleccionar" data-cot-id="${c.id}" title="Seleccionar esta cotización como ganadora">✓</button>
                  <button class="btn btn-outline btn-sm px-1 py-0" data-cot-action="editar" data-cot-id="${c.id}" title="Editar cotización">✎</button>
                  ${mostrarBotonEnviar ? `<button class="btn btn-primary btn-sm px-1 py-0" data-cot-action="enviar-correo" data-cot-id="${c.id}" title="Enviar solicitud de cotización por correo">✉</button>` : ''}
                  <button class="btn btn-danger btn-sm px-1 py-0" data-cot-action="eliminar" data-cot-id="${c.id}" title="Eliminar cotización">×</button>
                </div>`
              : c.seleccionada === 1
                ? `
                  <div style="display:flex; flex-direction:column; align-items:center; gap:3px; font-size:0.72rem;">
                    <span class="text-success fw-600">✓ Seleccionada</span>
                    <div class="d-flex gap-1 justify-content-center flex-wrap">
                      ${esGestor && !c.archivo_url ? `
                        <button class="btn btn-warning btn-sm px-1 py-0" 
                                data-cot-action="adjuntar-pdf" data-cot-id="${c.id}"
                                title="Adjuntar PDF de la cotización como respaldo/evidencia de la elección">
                          📎 Adjuntar PDF
                        </button>
                      ` : ''}
                      ${esGestor ? `
                        <button class="btn btn-danger btn-sm px-1 py-0" 
                                data-cot-action="deseleccionar" data-cot-id="${c.id}"
                                title="Quitar selección de esta cotización">
                          Deseleccionar
                        </button>
                      ` : ''}
                    </div>
                  </div>`
                : `<span class="text-muted small">—</span>`}
          </td>
        </tr>`;
    });

    html += `</tbody></table>`;
    contenedor.innerHTML = html;

  } catch (err) {
    console.error('❌ Error cargando cotizaciones:', err);
    contenedor.innerHTML = `<p class="text-danger text-center py-4">Error al cargar cotizaciones</p>`;
    Toast.error('No se pudieron cargar las cotizaciones');
  }
}

// Delegación para acciones de cotizaciones (una sola vez)
const listaCotizaciones = document.getElementById('lista-cotizaciones');
if (listaCotizaciones && !listaCotizaciones.dataset.delegateAttached) {
  listaCotizaciones.dataset.delegateAttached = 'true';

  window.delegate(listaCotizaciones, 'button[data-cot-action]', 'click', (e, btn) => {
    const action = btn.dataset.cotAction;
    const cotId = parseInt(btn.dataset.cotId);
    const reqId = requerimientoActual?.id;

    if (!cotId || !reqId) return;

    if (action === 'seleccionar') seleccionarCotizacion(cotId, reqId);
    if (action === 'editar') editarCotizacion(cotId);
    if (action === 'eliminar') eliminarCotizacion(cotId);
    if (action === 'adjuntar-pdf') adjuntarPdfACotizacion(cotId);
    if (action === 'deseleccionar') deseleccionarCotizacion(cotId, reqId);
    if (action === 'enviar-correo') enviarCorreoCotizacion(cotId);
    if (action === 'toggle-desglose') {
      // Special case: needs the button element itself
      toggleDesgloseCotizacion(btn, cotId);
    }
  });
}

// ── Toggle para mostrar/ocultar el desglose de items de una cotización ────────
function toggleDesgloseCotizacion(btn, cotizacionId) {
  const mainRow = btn.closest('tr');
  const existingDetail = mainRow.nextElementSibling;

  if (existingDetail && existingDetail.classList.contains('cot-desglose-row')) {
    // Ya está abierto → cerrar
    existingDetail.remove();
    btn.textContent = '▼ Desglose';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Cargando...';

  Api.get(`/cotizaciones/detalle/${cotizacionId}`)
    .then(resp => {
      const c = resp.data || resp;
      const items = c.items || [];

      if (items.length === 0) {
        Toast.info('Esta cotización no tiene conceptos desglosados');
        btn.textContent = '▼ Desglose';
        return;
      }

      let itemsHtml = `
        <table class="table table-sm mb-0" style="background:#f8f9fa">
          <thead>
            <tr>
              <th style="width:45%">Descripción</th>
              <th style="width:12%" class="text-center">Cantidad</th>
              <th style="width:12%">Unidad</th>
              <th style="width:15%" class="text-end">Precio Unit.</th>
              <th style="width:16%" class="text-end">Subtotal</th>
            </tr>
          </thead>
          <tbody>`;

      let granTotal = 0;
      items.forEach(it => {
        const cantidad = Math.round( parseFloat(it.cantidad) || 0 );
        const precio = redondear2( parseFloat(it.precio_unitario) || 0 );
        const sub = redondear2(cantidad * precio);
        granTotal += sub;
        itemsHtml += `
          <tr>
            <td>${it.descripcion || '—'}</td>
            <td class="text-center">${cantidad}</td>
            <td>${it.unidad || 'pieza'}</td>
            <td class="text-end">$${precio.toLocaleString('es-MX')}</td>
            <td class="text-end fw-600">$${sub.toLocaleString('es-MX')}</td>
          </tr>`;
      });

      granTotal = redondear2(granTotal);
      itemsHtml += `
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" class="text-end"><strong>Total desglosado:</strong></td>
              <td class="text-end fw-600">$${granTotal.toLocaleString('es-MX')}</td>
            </tr>
          </tfoot>
        </table>`;

      const detailRow = document.createElement('tr');
      detailRow.className = 'cot-desglose-row';
      detailRow.innerHTML = `
        <td colspan="6" style="padding:0 12px 12px 12px; border-top:none">
          <div style="margin-top:4px; font-size:0.85rem; color:#555">Desglose de conceptos</div>
          ${itemsHtml}
        </td>`;

      mainRow.after(detailRow);
      btn.textContent = '▲ Ocultar';
    })
    .catch(err => {
      console.error(err);
      Toast.error('No se pudo cargar el desglose');
      btn.textContent = '▼ Desglose';
    })
    .finally(() => {
      btn.disabled = false;
    });
}

async function seleccionarCotizacion(cotizacionId, requerimientoId) {
  if (!puedeGestionarCotizaciones()) {
    return Toast.error('No tienes permisos para seleccionar cotizaciones');
  }
  if (!confirm('¿Marcar esta cotización como la seleccionada?\nLas demás se marcarán como rechazadas.')) return;

  try {
    await Api.post(`/cotizaciones/${cotizacionId}/seleccionar`, {
      requerimiento_id: requerimientoId
    });

    Toast.success('Cotización seleccionada correctamente');
    cargarCotizaciones(requerimientoActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al seleccionar la cotización');
  }
}

async function deseleccionarCotizacion(cotizacionId, requerimientoId) {
  if (!puedeGestionarCotizaciones()) {
    return Toast.error('No tienes permisos para deseleccionar cotizaciones');
  }
  if (!confirm(
    '⚠️ ¿Estás seguro de deseleccionar esta cotización?\n\n' +
    'Esto quitará la selección actual y permitirá elegir otra cotización.'
  )) return;

  try {
    await Api.post(`/cotizaciones/${cotizacionId}/deseleccionar`, {
      requerimiento_id: requerimientoId
    });

    Toast.success('Cotización deseleccionada correctamente');
    cargarCotizaciones(requerimientoActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al deseleccionar la cotización');
  }
}

/**
 * Envía manualmente la solicitud de cotización por correo para una cotización existente.
 * Usado principalmente para SERVICIOS (botón explícito) y para ítems libres.
 */
async function enviarCorreoCotizacion(cotizacionId) {
  if (!puedeGestionarCotizaciones()) {
    return Toast.error('No tienes permisos para enviar correos de cotización');
  }
  if (!confirm('¿Enviar ahora la solicitud de cotización por correo a este proveedor?')) {
    return;
  }

  try {
    await Api.post(`/cotizaciones/${cotizacionId}/enviar`);
    Toast.success('Solicitud de cotización enviada por correo');
    await cargarCotizaciones(requerimientoActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudo enviar el correo de cotización');
  }
}

// Permite adjuntar / actualizar el PDF de una cotización (especialmente la seleccionada)
async function adjuntarPdfACotizacion(cotizacionId) {
  if (!puedeGestionarCotizaciones()) {
    return Toast.error('No tienes permisos para adjuntar PDFs a cotizaciones');
  }
  cotizacionParaPdfId = cotizacionId;

  // Resetear modal
  document.getElementById('pdf-file-input').value = '';
  document.getElementById('pdf-url-input').value = '';
  document.getElementById('pdf-error').style.display = 'none';
  document.getElementById('pdf-upload-progress').style.display = 'none';

  // Mostrar por defecto la pestaña de subir archivo
  cambiarTabPdf('subir');

  const modal = document.getElementById('modal-adjuntar-pdf');
  modal.style.display = 'flex';
}

function cambiarTabPdf(tab) {
  const seccionSubir = document.getElementById('seccion-subir');
  const seccionUrl = document.getElementById('seccion-url');
  const tabSubir = document.getElementById('tab-subir');
  const tabUrl = document.getElementById('tab-url');

  if (tab === 'subir') {
    seccionSubir.style.display = 'block';
    seccionUrl.style.display = 'none';
    tabSubir.style.borderBottom = '3px solid #185FA5';
    tabUrl.style.borderBottom = 'none';
  } else {
    seccionSubir.style.display = 'none';
    seccionUrl.style.display = 'block';
    tabSubir.style.borderBottom = 'none';
    tabUrl.style.borderBottom = '3px solid #185FA5';
  }
}

function cerrarModalAdjuntarPdf() {
  const modal = document.getElementById('modal-adjuntar-pdf');
  modal.style.display = 'none';
  cotizacionParaPdfId = null;
}

// Guardar PDF (ya sea por archivo o por URL)
async function guardarPdfCotizacion() {
  if (!cotizacionParaPdfId) return;

  const errorDiv = document.getElementById('pdf-error');
  errorDiv.style.display = 'none';

  const seccionSubirVisible = document.getElementById('seccion-subir').style.display !== 'none';

  try {
    if (seccionSubirVisible) {
      // === MODO SUBIR ARCHIVO ===
      const fileInput = document.getElementById('pdf-file-input');
      if (!fileInput.files.length) {
        errorDiv.textContent = 'Por favor selecciona un archivo PDF';
        errorDiv.style.display = 'block';
        return;
      }

      const file = fileInput.files[0];
      if (file.type !== 'application/pdf') {
        errorDiv.textContent = 'Solo se permiten archivos PDF';
        errorDiv.style.display = 'block';
        return;
      }

      const formData = new FormData();
      formData.append('pdf', file);

      const progressContainer = document.getElementById('pdf-upload-progress');
      const progressBar = document.getElementById('pdf-progress-bar');
      const progressText = document.getElementById('pdf-progress-text');

      progressContainer.style.display = 'block';
      progressBar.style.width = '0%';
      progressText.textContent = 'Subiendo archivo...';

      const token = Auth.getToken();
      if (!token) {
        progressContainer.style.display = 'none';
        Toast.error('Tu sesión ha expirado. Por favor vuelve a iniciar sesión.');
        Auth.cerrar();
        return;
      }

      const response = await fetch(`${API_BASE}/cotizaciones/${cotizacionParaPdfId}/archivo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      let data = {};
      try {
        data = await response.json();
      } catch (e) {}

      if (!response.ok) {
        throw { mensaje: data.message || data.mensaje || 'Error al subir el archivo' };
      }

      Toast.success('PDF subido correctamente');
      cerrarModalAdjuntarPdf();
      cargarCotizaciones(requerimientoActual.id);

    } else {
      // === MODO PEGAR URL ===
      const urlInput = document.getElementById('pdf-url-input').value.trim();
      if (!urlInput) {
        errorDiv.textContent = 'Por favor ingresa una URL válida';
        errorDiv.style.display = 'block';
        return;
      }

      await Api.put(`/cotizaciones/${cotizacionParaPdfId}`, {
        archivo_url: urlInput
      });

      Toast.success('URL del PDF guardada correctamente');
      cerrarModalAdjuntarPdf();
      cargarCotizaciones(requerimientoActual.id);
    }

  } catch (err) {
    errorDiv.textContent = err.mensaje || err.message || 'Error al guardar el PDF';
    errorDiv.style.display = 'block';
  }
}

async function editarCotizacion(cotizacionId) {
  if (!puedeGestionarCotizaciones()) {
    return Toast.error('No tienes permisos para editar cotizaciones');
  }

  try {
    const resp = await Api.get(`/cotizaciones/detalle/${cotizacionId}`);
    const c = resp.data || resp;

    if (!c) {
      return Toast.error('No se pudo cargar la cotización');
    }

    if (c.seleccionada === 1 || c.estado === 'seleccionada') {
      return Toast.error('No se puede editar una cotización ya seleccionada');
    }

    cotizacionEditandoId = c.id;

    document.getElementById('cot_req_id').value = c.requerimiento_id;
    document.getElementById('form-cotizacion').reset();

    const modalTitle = document.querySelector('#modal-cotizacion .modal-title');
    if (modalTitle) modalTitle.textContent = 'Editar Cotización';

    await cargarProveedoresEnModal();

    document.getElementById('cot_proveedor_id').value = c.proveedor_id || '';
    document.getElementById('cot_fecha_envio').value = c.fecha_envio ? c.fecha_envio.substring(0, 10) : '';
    document.getElementById('cot_moneda').value = c.moneda || 'MXN';
    document.getElementById('cot_notas').value = c.notas || '';

    const simpleDiv = document.getElementById('cotizacion-tipo-simple');
    const itemsDiv = document.getElementById('cotizacion-tipo-items');
    const tbody = document.querySelector('#tabla-items-cot tbody');
    tbody.innerHTML = '';

    const tieneItems = c.items && c.items.length > 0;

    if (tieneItems) {
      simpleDiv.style.display = 'none';
      itemsDiv.style.display = 'block';

      c.items.forEach(item => {
        const row = crearFilaItem(item);
        tbody.appendChild(row);
      });

      // Intentamos restaurar el % de IVA original de la cotización (si es 0%, 8% o 16%)
      const ivaSel = document.getElementById('cot-iva-porcentaje');
      if (ivaSel) {
        if (c.monto_subtotal > 0 && c.iva !== undefined) {
          const porcentaje = Math.round((parseFloat(c.iva) / parseFloat(c.monto_subtotal)) * 100);
          if ([0, 8, 16].includes(porcentaje)) {
            ivaSel.value = porcentaje.toString();
          } else {
            ivaSel.value = '16';
          }
        } else {
          ivaSel.value = '16';
        }
      }

      calcularTotalItems();
    } else {
      simpleDiv.style.display = 'block';
      itemsDiv.style.display = 'none';
      document.getElementById('cot_monto_total').value = c.monto_total || '';
    }

    configurarToggleDesglose(requerimientoActual, c);

    const modal = document.getElementById('modal-cotizacion');
    if (modal) modal.style.display = 'flex';

  } catch (err) {
    console.error('Error al cargar cotización para editar:', err);
    Toast.error(err.mensaje || 'Error al cargar la cotización');
    cotizacionEditandoId = null;
  }
}

async function eliminarCotizacion(cotizacionId) {
  if (!puedeGestionarCotizaciones()) {
    return Toast.error('No tienes permisos para eliminar cotizaciones');
  }
  if (!confirm('¿Eliminar esta cotización?\nEsta acción no se puede deshacer.')) return;

  try {
    await Api.delete(`/cotizaciones/${cotizacionId}`);
    Toast.success('Cotización eliminada');
    cargarCotizaciones(requerimientoActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudo eliminar la cotización (¿está seleccionada?)');
  }
}

// ── Formulario crear / editar requerimiento ───────────────────
document.getElementById('form-req').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-req');
  btn.disabled = true;

  const tieneCatalogo = (window.requerimientoItemsSeleccionados || []).length > 0;
  const tieneLibres = (window.requerimientoItemsLibres || []).length > 0;

  if (tieneCatalogo && tieneLibres) {
    Toast.error('No se puede guardar un requerimiento con ítems del catálogo y ítems libres al mismo tiempo. Elige uno de los dos tipos.');
    btn.disabled = false;
    return;
  }

  const payload = {
    titulo_solicitud:    document.getElementById('req-titulo').value,
    tipo:                document.getElementById('req-tipo').value,
    area:                document.getElementById('req-area').value,
    departamento:        document.getElementById('req-departamento').value,
    notas:               document.getElementById('req-notas')?.value || '',
    requiere_cotizacion: tieneLibres,
    items:               (window.requerimientoItemsSeleccionados || []).map(i => ({
                       catalogo_id: i.catalogo_id,
                       cantidad: i.cantidad
                     })),
    items_libres:        (window.requerimientoItemsLibres || []).map(i => ({
                       descripcion: i.descripcion,
                       cantidad: i.cantidad,
                       unidad: i.unidad || null,
                       notas: i.notas || null
                     })),
  };

  try {
    let resultado;
    if (editandoId) {
      const idAEditar = editandoId;
      resultado = await Api.put(`/requerimientos/${idAEditar}`, payload);
      editandoId = null;
      UI.cerrarModal('modal-req');
      if (typeof cerrarModalItemsLibres === 'function') cerrarModalItemsLibres();
      Toast.success('Requerimiento actualizado');
      if (requerimientoActual && requerimientoActual.id === idAEditar) {
        abrirDetalle(idAEditar);
      }
    } else {
      resultado = await Api.post('/requerimientos', payload);
      editandoId = null;
      UI.cerrarModal('modal-req');
      if (typeof cerrarModalItemsLibres === 'function') cerrarModalItemsLibres();
      Toast.success(`Requerimiento ${resultado.consecutivo} creado (borrador)`);
      abrirDetalle(resultado.id);
    }
  } catch (err) {
    Toast.error(err.mensaje || (editandoId ? 'Error al actualizar' : 'Error al crear requerimiento'));
  } finally {
    btn.disabled = false;
  }
});

// Búsqueda con debounce
const busquedaInput = document.getElementById('fil-busqueda');
if (busquedaInput) {
  busquedaInput.addEventListener('input', window.debounce(() => {
    cargarRequerimientos(1);
  }, 350));
}

// ── Integración Catálogo con Requerimientos (exclusivo: catálogo O libres) ──────
window.requerimientoItemsSeleccionados = [];
window.requerimientoItemsLibres = [];

// Cache de proveedores para el filtro del catálogo (evita múltiples llamadas)
let _proveedoresCatalogoCache = null;

const reqTipoSelect = document.getElementById('req-tipo');
if (reqTipoSelect) {
  reqTipoSelect.addEventListener('change', () => {
    const seccion = document.getElementById('seccion-items-catalogo');
    const selector = document.getElementById('selector-items-nuevos');
    const provWrapper = document.getElementById('filtro-proveedor-wrapper');
    const provSelect = document.getElementById('filtro-proveedor-catalogo');

    if (seccion) {
      seccion.style.display = reqTipoSelect.value ? 'block' : 'none';
    }
    if (selector) {
      selector.style.display = reqTipoSelect.value ? 'block' : 'none';
    }

    // Mostrar filtro de proveedor para todos los tipos (PARTES, SERVICIOS y FLETES)
    if (provWrapper) {
      provWrapper.style.display = reqTipoSelect.value ? '' : 'none';
    }
    if (provSelect && !reqTipoSelect.value) {
      provSelect.value = '';
    }

    // Limpiar selecciones previas al cambiar tipo de requerimiento
    if (reqTipoSelect.value) {
      window.requerimientoItemsSeleccionados = [];
      window.requerimientoItemsLibres = [];
      renderItemsSeleccionados();
      renderLibresResumen();

      // Resetear el selector de items nuevos
      const checkbox = document.getElementById('usar-items-nuevos');
      if (checkbox) checkbox.checked = false;

      const seccion2 = document.getElementById('seccion-items-catalogo');
      if (seccion2) seccion2.style.opacity = '1';
    }

    // Cargar proveedores para el filtro (disponible para todos los tipos)
    if (reqTipoSelect.value) {
      cargarFiltroProveedoresParaCatalogo();
    }
  });
}

function renderItemsSeleccionados() {
  const contenedor = document.getElementById('items-seleccionados-req');
  if (!contenedor) return;

  if (!window.requerimientoItemsSeleccionados || window.requerimientoItemsSeleccionados.length === 0) {
    contenedor.innerHTML = '<span class="text-muted" style="font-size:11px;">Ninguno seleccionado aún. Busca arriba y agrega ítems del catálogo.</span>';
    return;
  }

  let html = '';
  window.requerimientoItemsSeleccionados.forEach((item, index) => {
    const precio = (item.costo_referencia != null && !isNaN(item.costo_referencia))
      ? parseFloat(item.costo_referencia).toFixed(2)
      : null;
    const moneda = item.moneda || 'MXN';
    const precioHtml = precio != null
      ? `<span style="color:#555; font-size:11px; margin-left:6px; white-space:nowrap;">${precio} ${moneda}</span>`
      : '';

    html += `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px; background:#e6f4ea; padding:3px 6px; border-radius:4px; border:1px solid #a3d9b1;">
        <span style="flex:1; font-size:12px;">${item.codigo} — ${item.descripcion}${precioHtml}</span>
        <input type="number" value="${Math.round(item.cantidad)}" min="1" step="1" 
               style="width:60px; font-size:11px;" 
               onchange="actualizarCantidadItem(${index}, this.value)">
        <button type="button" class="btn btn-sm btn-danger" style="padding:0 4px; font-size:10px; line-height:1;" 
                onclick="eliminarItemSeleccionado(${index})">×</button>
      </div>
    `;
  });
  contenedor.innerHTML = html;
}

window.actualizarCantidadItem = function(index, nuevaCantidad) {
  if (window.requerimientoItemsSeleccionados[index]) {
    // Forzamos a número entero
    window.requerimientoItemsSeleccionados[index].cantidad = Math.max(1, Math.round(parseFloat(nuevaCantidad) || 1));
  }
};

window.eliminarItemSeleccionado = function(index) {
  window.requerimientoItemsSeleccionados.splice(index, 1);
  renderItemsSeleccionados();
};

// ── Ítems Libres (texto libre / no en catálogo) - Lógica separada en modal dedicado ─────────────
function renderLibresResumen() {
  // Ya no mostramos el resumen/count en la vista principal de catálogo 
  // (el "cargar items nuevos" está oculto de la sección de catálogo por diseño).
  // Solo actualizamos si el elemento existe (compatibilidad o uso futuro).
  const countEl = document.getElementById('libres-count');
  if (countEl) {
    const count = (window.requerimientoItemsLibres || []).length;
    countEl.textContent = count;
  }
}

function renderItemsLibresModal() {
  const contenedor = document.getElementById('items-libres-lista-modal');
  if (!contenedor) return;

  if (!window.requerimientoItemsLibres || window.requerimientoItemsLibres.length === 0) {
    contenedor.innerHTML = '<span class="text-muted" style="font-size:11px;">No hay ítems libres. Este modal es para requerimientos que son SOLO de ítems nuevos (que necesitan cotización para alta en catálogo).</span>';
    return;
  }

  let html = '';
  window.requerimientoItemsLibres.forEach((item, index) => {
    const unidad = item.unidad ? ` ${item.unidad}` : '';
    html += `
      <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px; background:#fffbeb; padding:3px 6px; border-radius:3px; border:1px solid #fde047; font-size:12px;">
        <span style="flex:1;">${item.descripcion} — <strong>${parseFloat(item.cantidad).toLocaleString('es-MX')}${unidad}</strong></span>
        <button type="button" class="btn btn-sm btn-danger" style="padding:0 4px; font-size:10px; line-height:1;" 
                onclick="eliminarItemLibre(${index}); renderItemsLibresModal();">×</button>
      </div>
    `;
  });
  contenedor.innerHTML = html;
}

window.agregarItemLibre = function() {
  const tieneCatalogo = window.requerimientoItemsSeleccionados && window.requerimientoItemsSeleccionados.length > 0;

  if (tieneCatalogo) {
    if (!confirm('Ya tienes ítems del catálogo.\n\nNo se permite mezclar. ¿Limpiar catálogo y pasar a ítems nuevos?')) {
      return;
    }
    window.requerimientoItemsSeleccionados = [];
    renderItemsSeleccionados();

    // Marcar el selector ya que ahora es modo ítems nuevos
    const checkbox = document.getElementById('usar-items-nuevos');
    if (checkbox) checkbox.checked = true;
  }

  const desc = document.getElementById('libre-descripcion')?.value.trim();
  let cant = parseFloat(document.getElementById('libre-cantidad')?.value) || 1;
  const unidad = document.getElementById('libre-unidad')?.value.trim() || '';

  cant = Math.max(1, Math.round(cant));

  if (!desc || desc.length < 3) {
    Toast.error('La descripción del ítem libre debe tener al menos 3 caracteres');
    return;
  }
  if (cant <= 0) {
    Toast.error('La cantidad debe ser mayor a 0');
    return;
  }

  if (!window.requerimientoItemsLibres) window.requerimientoItemsLibres = [];

  window.requerimientoItemsLibres.push({
    descripcion: desc,
    cantidad: cant,
    unidad: unidad,
    notas: ''
  });

  // Asegurar que el selector al final está marcado (modo ítems nuevos)
  const checkbox = document.getElementById('usar-items-nuevos');
  if (checkbox) checkbox.checked = true;

  // Actualizar ambas vistas (resumen en modal principal + lista completa en modal dedicado)
  renderLibresResumen();
  renderItemsLibresModal();

  // Limpiar form (esté donde esté)
  const descInput = document.getElementById('libre-descripcion');
  const cantInput = document.getElementById('libre-cantidad');
  const unidadInput = document.getElementById('libre-unidad');
  if (descInput) descInput.value = '';
  if (cantInput) cantInput.value = '1';
  if (unidadInput) unidadInput.value = '';
};

// ── Funciones para abrir/cerrar el modal dedicado de ítems libres ──────────────
window.abrirModalItemsLibres = function() {
  const tieneCatalogo = window.requerimientoItemsSeleccionados && window.requerimientoItemsSeleccionados.length > 0;

  if (tieneCatalogo) {
    if (!confirm('Ya tienes ítems del catálogo.\n\n¿Limpiarlos y trabajar solo con ítems nuevos (libres)?')) {
      return;
    }
    // Limpiar catálogo para pasar a modo "solo libres"
    window.requerimientoItemsSeleccionados = [];
    renderItemsSeleccionados();
  }

  const modal = document.getElementById('modal-req-libres');
  if (!modal) return;
  modal.style.display = 'flex';
  renderItemsLibresModal();
};

window.cerrarModalItemsLibres = function() {
  const modal = document.getElementById('modal-req-libres');
  if (modal) modal.style.display = 'none';
  // Refrescar resumen en el modal principal
  renderLibresResumen();
};

// --- Selector al final del formulario para modo ítems nuevos ---
window.toggleModoItemsNuevos = function(checked) {
  const checkbox = document.getElementById('usar-items-nuevos');
  if (!checkbox) return;

  if (checked) {
    // El usuario quiere ítems libres / nuevos
    const tieneCatalogo = window.requerimientoItemsSeleccionados && window.requerimientoItemsSeleccionados.length > 0;

    if (tieneCatalogo) {
      if (!confirm('Ya tienes ítems del catálogo.\n\nNo se permite mezclar. ¿Limpiar catálogo y continuar con ítems nuevos?')) {
        checkbox.checked = false;
        return;
      }
      window.requerimientoItemsSeleccionados = [];
      renderItemsSeleccionados();
    }

    // Abrir el modal de libres
    if (typeof abrirModalItemsLibres === 'function') {
      abrirModalItemsLibres();
    }

    // Ocultar la sección de catálogo mientras estamos en modo ítems nuevos
    const seccion = document.getElementById('seccion-items-catalogo');
    if (seccion) {
      seccion.style.display = 'none';
    }

    // Mostrar las acciones de libres
    const actions = document.getElementById('libres-actions');
    if (actions) actions.style.display = 'block';
  } else {
    // Deseleccionar: volver a modo catálogo
    const tieneLibres = window.requerimientoItemsLibres && window.requerimientoItemsLibres.length > 0;

    if (tieneLibres) {
      if (!confirm('Tienes ítems nuevos/libres agregados.\n\nSi deseleccionas se limpiarán para poder usar el catálogo nuevamente.\n\n¿Continuar?')) {
        checkbox.checked = true;
        return;
      }
      window.requerimientoItemsLibres = [];
      renderLibresResumen();
    }

    cerrarModalItemsLibres();

    // Restaurar la sección de catálogo
    const seccion = document.getElementById('seccion-items-catalogo');
    if (seccion) seccion.style.display = 'block';

    // Ocultar las acciones de libres
    const actions = document.getElementById('libres-actions');
    if (actions) actions.style.display = 'none';

    // Enfocar la búsqueda de catálogo
    const busq = document.getElementById('busqueda-catalogo');
    if (busq) setTimeout(() => busq.focus(), 100);

    // Asegurar que el checkbox está desmarcado
    const cb = document.getElementById('usar-items-nuevos');
    if (cb) cb.checked = false;
  }
};

window.deseleccionarYVolverACatalogo = function() {
  const checkbox = document.getElementById('usar-items-nuevos');
  if (checkbox) {
    checkbox.checked = false;
    // Disparar el cambio manualmente
    window.toggleModoItemsNuevos(false);
  } else {
    cerrarModalItemsLibres();
  }
};

window.eliminarItemLibre = function(index) {
  if (window.requerimientoItemsLibres) {
    window.requerimientoItemsLibres.splice(index, 1);
    renderLibresResumen();
    renderItemsLibresModal();
  }
};

// Compatibilidad: abre el modal dedicado de libres
window.mostrarFormItemLibre = function() {
  abrirModalItemsLibres();
  // Enfocar el campo de descripción dentro del modal
  setTimeout(() => {
    const inp = document.getElementById('libre-descripcion');
    if (inp) inp.focus();
  }, 150);
};

window.ocultarFormItemLibre = function() {
  cerrarModalItemsLibres();
};

async function buscarEnCatalogo() {
  const input = document.getElementById('busqueda-catalogo');
  const contenedor = document.getElementById('resultados-catalogo');
  if (!input || !contenedor) return;

  const busqueda = input.value.trim();
  const tipo = document.getElementById('req-tipo')?.value;
  const provSelect = document.getElementById('filtro-proveedor-catalogo');

  if (!tipo) {
    Toast.info('Primero selecciona el Tipo de requerimiento');
    return;
  }

  contenedor.innerHTML = '<div style="padding:6px; font-size:12px; color:#666;">Buscando...</div>';

  try {
    const params = new URLSearchParams({ tipo, busqueda, soloActivos: 'true' });
    if (provSelect && provSelect.value) {
      params.set('proveedor_id', provSelect.value);
    }
    const resultados = await Api.get(`/catalogo?${params.toString()}`);

    if (!resultados.length) {
      contenedor.innerHTML = `
        <div style="padding:8px; font-size:11px; color:#7c3f00; background:#fefce8; border:1px solid #facc15; border-radius:4px;">
          <strong>No se encontró en el catálogo.</strong><br>
          <button type="button" class="btn btn-sm btn-outline-warning mt-1" style="font-size:10px;" 
                  onclick="document.getElementById('usar-items-nuevos').checked=true; toggleModoItemsNuevos(true);">
            Agregar como ítem nuevo (libre)
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary mt-1" style="font-size:10px; margin-left:4px;"
                  onclick="crearRequerimientoParaAltaCatalogoFromCurrent()">
            Crear req separado
          </button>
        </div>`;
      return;
    }

    let html = '';
    resultados.forEach(item => {
      const yaSeleccionado = window.requerimientoItemsSeleccionados.some(i => i.catalogo_id === item.id);
      const safeDesc = item.descripcion.replace(/'/g, "\\'").replace(/"/g, '\\"');

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 6px; border-bottom:1px solid #eee; font-size:12px; gap:6px;">
          <div style="flex:1; min-width:0;">
            <strong>${item.codigo}</strong> — ${item.descripcion}
            ${(item.costo_referencia != null) ? `<span style="color:#0d6efd; font-size:11px; font-weight:600; margin-left:4px;">${parseFloat(item.costo_referencia).toFixed(2)} ${item.moneda || 'MXN'}</span>` : ''}
            ${item.proveedor_nombre ? `<span style="color:#888; font-size:10px; margin-left:6px;">(${UI.labelProveedor(item)})</span>` : ''}
          </div>

          ${!yaSeleccionado ? `
            <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
              <input type="number" id="qty-${item.id}" value="1" min="1" step="1" 
                     style="width:58px; font-size:11px; padding:2px 4px;">
              <button type="button" class="btn btn-sm btn-primary" style="padding:2px 8px; font-size:11px;"
                      onclick="agregarItemConCantidad(${item.id}, '${item.codigo}', '${safeDesc}', ${item.costo_referencia != null ? item.costo_referencia : 0}, '${item.moneda || 'MXN'}')">
                + Agregar
              </button>
            </div>
          ` : `
            <span style="color:#28a745; font-size:11px; flex-shrink:0;">✓ Agregado</span>
          `}
        </div>
      `;
    });

    // Enlace sutil pero siempre visible para recordar el flujo de nuevo ítem
    html += `
      <div style="padding:3px 4px; font-size:9.5px; color:#854d0e; background:#fffbeb; margin-top:3px; border-radius:3px; border:1px solid #fde047;">
        ¿Ninguno coincide? 
        <a href="#" onclick="document.getElementById('usar-items-nuevos').checked=true; toggleModoItemsNuevos(true); return false;" style="font-weight:600; color:#b45309; text-decoration:underline;">Agregar como ítem nuevo</a>
        o 
        <a href="#" onclick="crearRequerimientoParaAltaCatalogoFromCurrent(); return false;" style="font-weight:600; color:#b45309; text-decoration:underline;">crear req separado</a>.
      </div>
    `;

    contenedor.innerHTML = html;

    // Patrón cómodo: siempre ofrecer "agregar como nuevo" como último recurso (inspirado en combobox + add new patterns de UX research)
    // Esto anima a buscar primero (evita duplicados) pero hace obvio el camino para libres.
    const addNewHint = document.createElement('div');
    addNewHint.style.cssText = 'margin-top:4px; font-size:10px;';
    addNewHint.innerHTML = ` <button type="button" class="btn btn-sm btn-outline" style="font-size:10px;" onclick="document.getElementById('usar-items-nuevos').checked=true; toggleModoItemsNuevos(true);">+ No está en catálogo (agregar como nuevo)</button>`;
    contenedor.appendChild(addNewHint);
  } catch (err) {
    contenedor.innerHTML = '<div style="padding:6px; font-size:12px; color:#c00;">Error al buscar.</div>';
  }
}

window.agregarItemConCantidad = function(catalogo_id, codigo, descripcion, costo, moneda = 'MXN') {
  const tieneLibres = window.requerimientoItemsLibres && window.requerimientoItemsLibres.length > 0;

  if (tieneLibres) {
    if (!confirm('Ya tienes ítems nuevos/libres.\n\n¿Limpiarlos y volver a usar solo catálogo?')) {
      return;
    }
    window.requerimientoItemsLibres = [];
    renderLibresResumen();
    // También refrescar el modal de libres si está abierto
    const libresModal = document.getElementById('modal-req-libres');
    if (libresModal && libresModal.style.display !== 'none') {
      renderItemsLibresModal();
    }
    // Desmarcar el selector ya que ahora es modo catálogo
    const checkbox = document.getElementById('usar-items-nuevos');
    if (checkbox) checkbox.checked = false;
  }

  if (!window.requerimientoItemsSeleccionados) window.requerimientoItemsSeleccionados = [];

  const yaExiste = window.requerimientoItemsSeleccionados.find(i => i.catalogo_id === catalogo_id);
  if (yaExiste) return;

  const qtyInput = document.getElementById(`qty-${catalogo_id}`);
  const cantidad = qtyInput ? parseFloat(qtyInput.value) || 1 : 1;

  window.requerimientoItemsSeleccionados.push({
    catalogo_id,
    codigo,
    descripcion,
    costo_referencia: costo != null ? parseFloat(costo) : null,
    moneda: moneda || 'MXN',
    cantidad: Math.max(1, Math.round(cantidad))   // Forzamos a entero
  });

  renderItemsSeleccionados();

  // Limpiar resultados después de agregar
  const cont = document.getElementById('resultados-catalogo');
  if (cont) cont.innerHTML = '';
};

window.agregarItemDesdeCatalogo = window.agregarItemConCantidad;

window.agregarComoLibreDesdeBusqueda = function() {
  const input = document.getElementById('busqueda-catalogo');
  const contenedor = document.getElementById('resultados-catalogo');
  if (!input) return;

  const texto = input.value.trim();
  if (!texto) {
    Toast.info('Escribe una descripción en el buscador primero');
    return;
  }

  // Prellenar y abrir el modal dedicado de libres
  const descInput = document.getElementById('libre-descripcion');
  if (descInput) descInput.value = texto;

  abrirModalItemsLibres();

  // Limpiar resultados
  if (contenedor) contenedor.innerHTML = '';
};

/**
 * Carga (con cache) la lista de proveedores activos en el filtro de catálogo.
 * Disponible para PARTES, SERVICIOS y FLETES.
 */
async function cargarFiltroProveedoresParaCatalogo() {
  const select = document.getElementById('filtro-proveedor-catalogo');
  if (!select) return;

  try {
    if (!_proveedoresCatalogoCache) {
      _proveedoresCatalogoCache = await Api.get('/proveedores?activos=true');
    }

    const previo = select.value; // preservar selección actual si ya había
    select.innerHTML = '<option value="">Todos los proveedores</option>';

    _proveedoresCatalogoCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = UI.labelProveedor(p);
      select.appendChild(opt);
    });

    // Restaurar selección previa si el proveedor sigue en la lista
    if (previo && Array.from(select.options).some(o => String(o.value) === String(previo))) {
      select.value = previo;
    }

    // UX mejorada: al cambiar proveedor, re-buscar automáticamente (si ya hay resultados)
    if (!select.dataset.autoSearchBound) {
      select.dataset.autoSearchBound = 'true';
      select.addEventListener('change', () => {
        const cont = document.getElementById('resultados-catalogo');
        if (cont && cont.innerHTML.trim() !== '' && cont.innerHTML.indexOf('Buscando') === -1) {
          buscarEnCatalogo();
        }
      });
    }
  } catch (e) {
    console.error('Error cargando proveedores para filtro de catálogo:', e);
  }
}

/**
 * Abre el editor de requerimiento prellenado para el flujo de "alta en catálogo".
 * Según feedback del cliente: si el ítem no existe, se debe generar en OTRO req
 * para poder cotizarlo y luego cargarlo al catálogo.
 */
window.crearRequerimientoParaAltaCatalogo = function(texto, tipo) {
  const contenedor = document.getElementById('resultados-catalogo');
  if (contenedor) contenedor.innerHTML = '';

  // Abrir editor de nuevo requerimiento
  abrirEditorRequerimiento(null);

  // Inicializar valores del formulario después de abrir el modal
  setTimeout(() => {
    const tituloEl = document.getElementById('req-titulo');
    const tipoEl = document.getElementById('req-tipo');
    const notasEl = document.getElementById('req-notas');

    if (tipoEl) {
      tipoEl.value = tipo || '';
      tipoEl.dispatchEvent(new Event('change')); // mostrar sección de ítems
    }

    if (tituloEl) {
      tituloEl.value = `Alta en catálogo: ${texto || 'Ítem / servicio no registrado'}`;
    }

    if (notasEl) {
      notasEl.value = `SOLICITUD DE ALTA EN CATÁLOGO\n\nEl siguiente ítem/servicio no existe actualmente en el catálogo maestro:\n\n${texto || ''}\n\nAcción requerida: Cotizar con proveedor(es), aprobar y crear el registro en el Catálogo (por Contabilidad/Admin).\n\nUna vez cargado al catálogo, se podrá vincular a requerimientos operativos.`;
    }

    // Limpiar selecciones de items (no tiene sentido para alta)
    window.requerimientoItemsSeleccionados = [];
    window.requerimientoItemsLibres = [];
    if (typeof renderItemsSeleccionados === 'function') renderItemsSeleccionados();
    renderLibresResumen();

    // Marcar el selector para indicar modo ítems nuevos
    const checkbox = document.getElementById('usar-items-nuevos');
    if (checkbox) checkbox.checked = true;

    // Las acciones y visibilidad se manejan en el código común de display después del if-else

    // Opcional: Toast informativo
    if (typeof Toast !== 'undefined') {
      Toast.info('Requerimiento prellenado para solicitud de alta en catálogo. Abre "Gestionar ítems nuevos" para describir los ítems que faltan.');
    }

    // Para req de alta, abrir directamente el modal de libres para que el usuario agregue las descripciones
    setTimeout(() => {
      if (typeof abrirModalItemsLibres === 'function') {
        abrirModalItemsLibres();
      }
    }, 400);
  }, 250);
};

/**
 * Helpers para el botón grande del nuevo diseño del modal de requerimiento.
 * Llaman a la función principal pasando el tipo y texto actual del formulario.
 */
window.crearRequerimientoParaAltaCatalogoFromCurrent = function() {
  const tipoEl = document.getElementById('req-tipo');
  const busqEl = document.getElementById('busqueda-catalogo');
  const tipo = tipoEl ? tipoEl.value : '';
  const texto = busqEl ? busqEl.value.trim() : '';
  crearRequerimientoParaAltaCatalogo(texto, tipo);
};

window.crearRequerimientoParaAltaCatalogoFromForm = window.crearRequerimientoParaAltaCatalogoFromCurrent;

// ── FUNCIONES DEL MODAL DE COTIZACIÓN ─────────────────────────────

function abrirModalCotizacion() {
  if (!puedeGestionarCotizaciones()) {
    return Toast.error('No tienes permisos para crear cotizaciones');
  }
  if (!requerimientoActual) {
    return Toast.error('No se encontró el requerimiento');
  }
  cotizacionEditandoId = null;
  prepararModalCotizacion(requerimientoActual);
  const modal = document.getElementById('modal-cotizacion');
  if (modal) modal.style.display = 'flex';
}

function prepararModalCotizacion(req) {
  document.getElementById('cot_req_id').value = req.id;
  document.getElementById('form-cotizacion').reset();
  document.querySelector('#tabla-items-cot tbody').innerHTML = '';

  const modalTitle = document.querySelector('#modal-cotizacion .modal-title');
  if (modalTitle) modalTitle.textContent = cotizacionEditandoId ? 'Editar Cotización' : 'Nueva Cotización';

  cargarProveedoresEnModal();
  configurarModalSegunTipo(req);
  if (!cotizacionEditandoId) {
    configurarToggleDesglose(req, null);
    // Prellenar ítems desde el requerimiento (libres o catálogo)
    prellenarItemsCotizacionDesdeReq(req);
  }

  // Sin restricción de fechas.
  // El usuario puede elegir cualquier fecha (pasada, hoy o futura).
  // El comportamiento (enviar o no enviar correo) se maneja en el modal de confirmación.
}

// ── GUARDAR COTIZACIÓN ──────────────────────────────────────────────────────────
async function guardarCotizacionOriginal() {
  if (!puedeGestionarCotizaciones()) {
    return Toast.error('No tienes permisos para guardar cotizaciones');
  }

  const reqId = document.getElementById('cot_req_id').value;

  if (!reqId) {
    return Toast.error('Error: No se encontró el ID del requerimiento');
  }

  const proveedor_id = document.getElementById('cot_proveedor_id').value;
  const fecha_envio = document.getElementById('cot_fecha_envio').value;
  const moneda = document.getElementById('cot_moneda').value;
  const notas = document.getElementById('cot_notas').value.trim();

  if (!proveedor_id || !fecha_envio) {
    return Toast.error('Proveedor y Fecha de Envío son obligatorios');
  }

  try {
    let datos = {
      proveedor_id: parseInt(proveedor_id),
      moneda: moneda || 'MXN',
      fecha_envio: fecha_envio,
      notas: notas || null,
      items: []
    };

    // Si venimos del modal de confirmación con hora, la enviamos
    if (datosCotizacionPendiente?.hora_envio) {
      datos.hora_envio = datosCotizacionPendiente.hora_envio;
    }

    const tbody = document.querySelector('#tabla-items-cot tbody');
    const itemsDivVisible = document.getElementById('cotizacion-tipo-items').style.display !== 'none';
    const filasConContenido = tbody ? tbody.querySelectorAll('tr').length : 0;

    const usarItems = (itemsDivVisible || filasConContenido > 0) && filasConContenido > 0;

    if (usarItems && tbody) {
      const calculo = calcularTotalItems(); // Ahora devuelve {subtotal, iva, total}

      const rows = tbody.querySelectorAll('tr');

      rows.forEach(row => {
        const descripcion = row.querySelector('.item-desc').value.trim();
        if (!descripcion) return;

        let cantidad = parseFloat(row.querySelector('.item-cant').value) || 1;
        let precio_unitario = parseFloat(row.querySelector('.item-precio').value) || 0;

        cantidad = Math.max(1, Math.round(cantidad));
        precio_unitario = redondear2(precio_unitario);

        datos.items.push({
          descripcion,
          cantidad,
          unidad: row.querySelector('.item-unidad').value,
          precio_unitario
        });
      });

      const ivaPorcentaje = obtenerIvaPorcentaje();

      datos.monto_subtotal = calculo.subtotal;
      datos.iva = calculo.iva;
      datos.monto_total = calculo.total;
      datos.iva_porcentaje = ivaPorcentaje;   // útil para el backend si lo quiere guardar

      if (datos.items.length === 0) {
        return Toast.error('Debe agregar al menos un concepto en la lista de items');
      }
    } 
    else {
      let monto_total = parseFloat(document.getElementById('cot_monto_total').value) || 0;
      monto_total = redondear2(monto_total);
      
      if (monto_total <= 0) {
        return Toast.error('Debe ingresar un monto total válido');
      }

      // En modo simple asumimos que el monto ya incluye IVA (o el usuario lo maneja manualmente)
      datos.monto_total = monto_total;
      datos.monto_subtotal = redondear2(monto_total / 1.16); // estimado 16%
      datos.iva = redondear2(datos.monto_total - datos.monto_subtotal);
    }

    let response;
    if (cotizacionEditandoId) {
      response = await Api.put(`/cotizaciones/${cotizacionEditandoId}`, datos);
    } else {
      datos.requerimiento_id = parseInt(reqId);

      // Si tenemos hora de envío desde el modal de confirmación, la enviamos
      if (datosCotizacionPendiente?.hora_envio) {
        datos.hora_envio = datosCotizacionPendiente.hora_envio;
      }

      response = await Api.post('/cotizaciones', datos);
    }

    if (response.success || response.id || response.message) {
      Toast.success(cotizacionEditandoId ? 'Cotización actualizada correctamente' : '¡Cotización guardada correctamente!');
      cerrarModalCotizacion();
      await cargarCotizaciones(requerimientoActual.id);
    } else {
      Toast.error('No se pudo guardar la cotización');
    }
  } catch (err) {
    console.error('Error al guardar cotización:', err);
    Toast.error(err.mensaje || err.message || 'Error al guardar la cotización');
  }
}

function cerrarModalCotizacion() {
  const modal = document.getElementById('modal-cotizacion');
  if (modal) modal.style.display = 'none';
  document.getElementById('form-cotizacion').reset();
  document.querySelector('#tabla-items-cot tbody').innerHTML = '';
  
  const wasEditing = !!cotizacionEditandoId;
  cotizacionEditandoId = null;

  const modalTitle = document.querySelector('#modal-cotizacion .modal-title');
  if (modalTitle) modalTitle.textContent = 'Nueva Cotización';
}

// ── Confirmación de envío de cotización ───────────────────────────────────────
let datosCotizacionPendiente = null;

function prepararConfirmacionEnvioCotizacion() {
  // Si estamos editando una cotización existente, guardamos directamente (sin confirmación de envío)
  if (cotizacionEditandoId) {
    guardarCotizacionOriginal();
    return;
  }

  // Recolectar datos del formulario
  const reqId = document.getElementById('cot_req_id').value;
  const proveedor_id = document.getElementById('cot_proveedor_id').value;
  const fecha_envio = document.getElementById('cot_fecha_envio').value;
  const moneda = document.getElementById('cot_moneda').value;
  const notas = document.getElementById('cot_notas').value.trim();

  if (!proveedor_id || !fecha_envio) {
    return Toast.error('Proveedor y Fecha de Envío son obligatorios');
  }

  // Guardamos los datos para usarlos después de confirmar
  datosCotizacionPendiente = {
    reqId,
    proveedor_id: parseInt(proveedor_id),
    fecha_envio,
    moneda: moneda || 'MXN',
    notas: notas || null,
    hora_envio: null, // se llenará si es futuro
  };

  // Declaramos las variables de fecha aquí para que estén disponibles en toda la función
  const fechaSeleccionada = new Date(fecha_envio + 'T00:00:00');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const modal = document.getElementById('modal-confirmar-envio-cotizacion');
  const body = document.getElementById('confirm-envio-body');
  const footer = document.getElementById('confirm-envio-footer');
  const titulo = document.getElementById('confirm-envio-titulo');

  const esHoy = fechaSeleccionada.getTime() === hoy.getTime();
  const esPasado = fechaSeleccionada < hoy;

  // Regla: solo permitir opciones de envío si el req tiene libres o es SERVICIOS.
  // Para catálogo puro (no servicios): siempre forzar "guardar sin enviar".
  const reqActual = requerimientoActual || {};
  const esLibres = reqActual.items_libres && reqActual.items_libres.length > 0;
  const esServicioReq = (reqActual.tipo || '').toUpperCase() === 'SERVICIOS';
  const permiteOpcionesEnvio = esLibres || esServicioReq;

  body.innerHTML = '';
  footer.innerHTML = '';

  if (esPasado || !permiteOpcionesEnvio) {
    // === CASO: FECHA PASADA O REQUERIMIENTO DE CATÁLOGO (sin libres y no servicio) ===
    // En estos casos NO corresponde enviar correo.
    titulo.textContent = !permiteOpcionesEnvio ? 'Cotización para ítems de catálogo' : 'Fecha anterior a hoy';
    body.innerHTML = `
      <div class="alert alert-warning">
        <strong>Atención:</strong> 
        ${!permiteOpcionesEnvio 
          ? 'Este requerimiento usa ítems que ya están en el catálogo.<br>Se guardará la cotización como registro interno, <strong>pero no se enviará correo</strong> al proveedor.'
          : 'La fecha seleccionada ya pasó.<br><br>Se guardará el registro de la cotización, <strong>pero no se enviará ningún correo</strong> al proveedor.'}
      </div>
      <p>¿Deseas continuar de todas formas?</p>
    `;
    footer.innerHTML = `
      <button class="btn btn-outline" onclick="cerrarModalConfirmacionEnvio()">Cancelar</button>
      <button class="btn btn-primary" onclick="confirmarGuardarSinEnvio()">Guardar sin enviar correo</button>
    `;

  } else if (esHoy) {
    // === CASO: HOY (solo para casos que permiten envío: libres o servicios) ===
    titulo.textContent = '¿Enviar cotización ahora?';
    body.innerHTML = `
      <p>La fecha de envío es <strong>hoy</strong>.</p>
      <p>¿Deseas enviar esta solicitud de cotización al proveedor de inmediato?</p>
    `;
    footer.innerHTML = `
      <button class="btn btn-outline" onclick="cerrarModalConfirmacionEnvio()">Cancelar</button>
      <button class="btn btn-primary" onclick="confirmarEnvioInmediato()">Enviar ahora</button>
    `;

  } else {
    // === CASO: FECHA FUTURA (solo cuando se permite envío) ===
    titulo.textContent = 'Programar envío de cotización';

    const fechaFormateada = fechaSeleccionada.toLocaleDateString('es-MX', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    body.innerHTML = `
      <p>Has seleccionado enviar la cotización el <strong>${fechaFormateada}</strong>.</p>
      <div class="form-group">
        <label class="form-label">¿A qué hora deseas que se envíe?</label>
        <input type="time" id="hora-envio-programado" class="form-control" value="09:00">
        <small class="text-muted">Se enviará automáticamente a la hora indicada (requiere que el sistema esté activo).</small>
      </div>
    `;
    footer.innerHTML = `
      <button class="btn btn-outline" onclick="cerrarModalConfirmacionEnvio()">Cancelar</button>
      <button class="btn btn-primary" onclick="confirmarProgramarEnvioFuturo()">Programar envío</button>
    `;
  }

  modal.style.display = 'flex';
}

function cerrarModalConfirmacionEnvio() {
  const modal = document.getElementById('modal-confirmar-envio-cotizacion');
  if (modal) modal.style.display = 'none';
  datosCotizacionPendiente = null;
}

async function confirmarEnvioInmediato() {
  cerrarModalConfirmacionEnvio();
  await ejecutarGuardadoCotizacion();
}

// Guardar registro de cotización con fecha pasada (sin enviar correo)
async function confirmarGuardarSinEnvio() {
  cerrarModalConfirmacionEnvio();
  // Guardamos normalmente. El backend decidirá no enviar correo.
  await ejecutarGuardadoCotizacion();
}

// Programar envío futuro (envía fecha + hora al backend)
async function confirmarProgramarEnvioFuturo() {
  const horaInput = document.getElementById('hora-envio-programado');
  if (horaInput && datosCotizacionPendiente) {
    datosCotizacionPendiente.hora_envio = horaInput.value;
  }
  cerrarModalConfirmacionEnvio();
  await ejecutarGuardadoCotizacion();
}

async function ejecutarGuardadoCotizacion() {
  await guardarCotizacionOriginal();
}

// Cargar proveedores en el modal
async function cargarProveedoresEnModal() {
  try {
    // Solo proveedores activos en el selector de cotizaciones
    const proveedores = await Api.get('/proveedores?activos=true');
    const select = document.getElementById('cot_proveedor_id');
    select.innerHTML = '<option value="">Selecciona proveedor...</option>';
    
    proveedores.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = UI.labelProveedor(p);
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Error cargando proveedores:', e);
  }
}

// Configura el toggle de desglose y su comportamiento
function configurarToggleDesglose(requerimiento, cotizacion = null) {
  const checkbox = document.getElementById('cot_desglosar_items');
  const simpleDiv = document.getElementById('cotizacion-tipo-simple');
  const itemsDiv = document.getElementById('cotizacion-tipo-items');
  const tbody = document.querySelector('#tabla-items-cot tbody');

  if (!checkbox) return;

  const newCheckbox = checkbox.cloneNode(true);
  checkbox.parentNode.replaceChild(newCheckbox, checkbox);

  const tieneItems = cotizacion && cotizacion.items && cotizacion.items.length > 0;
  const forzarItemsPorTipo = ['PARTES', 'SERVICIOS'].includes(requerimiento.tipo || '');

  newCheckbox.checked = tieneItems || forzarItemsPorTipo;

  if (newCheckbox.checked) {
    simpleDiv.style.display = 'none';
    itemsDiv.style.display = 'block';
  } else {
    simpleDiv.style.display = 'block';
    itemsDiv.style.display = 'none';
  }

  newCheckbox.addEventListener('change', () => {
    if (newCheckbox.checked) {
      simpleDiv.style.display = 'none';
      itemsDiv.style.display = 'block';

      if (tbody.children.length === 0) {
        const montoActual = parseFloat(document.getElementById('cot_monto_total').value) || 0;

        if (montoActual > 0) {
          const row = crearFilaItem({
            descripcion: 'Concepto general / Servicio',
            cantidad: 1,
            unidad: 'servicio',
            precio_unitario: montoActual
          });
          tbody.appendChild(row);
          document.getElementById('cot_monto_total').value = '';
        } else {
          agregarItemCotizacion();
        }

        calcularTotalItems();
      }
    } else {
      itemsDiv.style.display = 'none';
      simpleDiv.style.display = 'block';

      const totalCalc = calcularTotalItems();
      if (totalCalc && totalCalc.total > 0) {
        document.getElementById('cot_monto_total').value = totalCalc.total.toFixed(2);
      }

      tbody.innerHTML = '';
    }
  });
}

// Helper para crear una fila de item
function crearFilaItem(itemData = {}) {
  const row = document.createElement('tr');
  row.className = 'item-row';

  row.innerHTML = `
    <td><input type="text" class="form-control item-desc" placeholder="Ej: Tornillos hexagonales 1/2" value="${itemData.descripcion || ''}" required></td>
    <td><input type="number" class="form-control item-cant text-center" value="${itemData.cantidad || 1}" min="1" step="1"></td>
    <td>
      <select class="form-control item-unidad">
        <option value="pieza">pieza</option>
        <option value="kg">kg</option>
        <option value="hora">hora</option>
        <option value="servicio">servicio</option>
        <option value="lote">lote</option>
        <option value="m">m</option>
      </select>
    </td>
    <td><input type="number" class="form-control item-precio text-end" step="0.01" placeholder="0.00" value="${redondear2(itemData.precio_unitario)}"></td>
    <td class="item-subtotal text-end fw-600">0.00</td>
    <td class="text-center">
      <button class="btn btn-sm btn-danger" data-action="eliminar-item">×</button>
    </td>
  `;

  const unidadSelect = row.querySelector('.item-unidad');
  if (unidadSelect && itemData.unidad) {
    unidadSelect.value = itemData.unidad;
  }

  // Sanitize initial values
  const cantInput = row.querySelector('.item-cant');
  if (cantInput) {
    let c = parseFloat(cantInput.value) || 1;
    cantInput.value = Math.max(1, Math.round(c));
  }

  const precioInput = row.querySelector('.item-precio');
  if (precioInput) {
    let p = parseFloat(precioInput.value) || 0;
    if (itemData.precio_unitario !== undefined && itemData.precio_unitario !== '' && itemData.precio_unitario !== null) {
      p = parseFloat(itemData.precio_unitario) || 0;
    }
    precioInput.value = redondear2(p);
  }

  row.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', calcularTotalItems);
  });

  // Enforce rules on blur for cotizacion items
  if (cantInput) {
    cantInput.addEventListener('blur', () => {
      let val = parseFloat(cantInput.value) || 1;
      val = Math.max(1, Math.round(val));
      cantInput.value = val;
      calcularTotalItems();
    });
  }
  if (precioInput) {
    precioInput.addEventListener('blur', () => {
      let val = parseFloat(precioInput.value) || 0;
      precioInput.value = redondear2(val);
      calcularTotalItems();
    });
  }

  // Also enforce on input for immediate feedback (prevent bad values)
  if (cantInput) {
    cantInput.addEventListener('input', () => {
      // optional live, but blur is sufficient to not fight typing
    });
  }

  // Delegación para eliminar item (se adjunta al tbody una sola vez)
  const itemsTbody = document.querySelector('#tabla-items-cot tbody');
  if (itemsTbody && !itemsTbody.dataset.delegateAttached) {
    itemsTbody.dataset.delegateAttached = 'true';
    window.delegate(itemsTbody, 'button[data-action="eliminar-item"]', 'click', (e, btn) => {
      eliminarItem(btn);
    });
  }

  return row;
}

function configurarModalSegunTipo(requerimiento) {
  const simpleDiv = document.getElementById('cotizacion-tipo-simple');
  const itemsDiv = document.getElementById('cotizacion-tipo-items');

  simpleDiv.style.display = 'block';
  itemsDiv.style.display = 'none';
}

/**
 * Prellena la tabla de ítems de la cotización con los ítems del requerimiento:
 * - Si tiene items_libres → usa las descripciones libres (para cotizar nuevos y luego formalizar en catálogo).
 * - Si tiene ítems de catálogo → copia las descripciones para registro interno (sin necesidad de email).
 */
function prellenarItemsCotizacionDesdeReq(req) {
  const tbody = document.querySelector('#tabla-items-cot tbody');
  const itemsDiv = document.getElementById('cotizacion-tipo-items');
  const simpleDiv = document.getElementById('cotizacion-tipo-simple');
  const checkbox = document.getElementById('cot_desglosar_items');

  if (!tbody || !itemsDiv || !simpleDiv) return;

  // Solo prellenar si es una cotización nueva
  if (cotizacionEditandoId) return;

  const tieneLibres = req.items_libres && req.items_libres.length > 0;
  const tieneCatalogo = req.items && req.items.length > 0;

  if (!tieneLibres && !tieneCatalogo) return;

  // Forzar modo items
  simpleDiv.style.display = 'none';
  itemsDiv.style.display = 'block';
  if (checkbox) checkbox.checked = true;

  tbody.innerHTML = '';

  let itemsFuente = [];

  if (tieneLibres) {
    itemsFuente = req.items_libres.map(l => ({
      descripcion: l.descripcion || '',
      cantidad: Math.max(1, Math.round(l.cantidad || 1)),
      unidad: l.unidad || 'pieza',
      precio_unitario: ''   // se completará con la respuesta del proveedor
    }));
  } else if (tieneCatalogo) {
    itemsFuente = req.items.map(i => ({
      descripcion: i.descripcion || i.codigo || '',
      cantidad: Math.max(1, Math.round(i.cantidad || 1)),
      unidad: 'pieza',
      precio_unitario: ''
    }));
  }

  itemsFuente.forEach(data => {
    const row = crearFilaItem(data);
    tbody.appendChild(row);
  });

  calcularTotalItems();
}

function agregarItemCotizacion() {
  const tbody = document.querySelector('#tabla-items-cot tbody');
  const row = crearFilaItem();
  tbody.appendChild(row);
  calcularTotalItems();
}

function eliminarItem(btn) {
  btn.closest('tr').remove();
  calcularTotalItems();
}

function redondear2(n) {
  // Redondeo seguro para dinero (evita problemas de punto flotante)
  // parseFloat para soportar strings que vienen de DECIMAL de MySQL vía JSON
  const num = parseFloat(n) || 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function obtenerIvaPorcentaje() {
  const val = document.getElementById('cot-iva-porcentaje')?.value;
  const num = parseFloat(val);
  return isNaN(num) ? 16 : num;
}

function calcularTotalItems() {
  let subtotal = 0;
  const rows = document.querySelectorAll('#tabla-items-cot tbody tr');

  rows.forEach(row => {
    const cantidad = Math.round( parseFloat(row.querySelector('.item-cant').value) || 0 );
    const precio = redondear2( parseFloat(row.querySelector('.item-precio').value) || 0 );
    const sub = redondear2(cantidad * precio);

    row.querySelector('.item-subtotal').textContent = sub.toFixed(2);
    subtotal += sub;
  });

  subtotal = redondear2(subtotal);

  // Calcular IVA
  const ivaPorcentaje = obtenerIvaPorcentaje();
  const ivaMonto = redondear2(subtotal * (ivaPorcentaje / 100));
  const totalFinal = redondear2(subtotal + ivaMonto);

  // Actualizar UI - siempre con exactamente 2 decimales
  const subEl = document.getElementById('cot-subtotal');
  const ivaEl = document.getElementById('cot-iva-monto');
  const totalEl = document.getElementById('cot-total-final');

  if (subEl) subEl.textContent = subtotal.toFixed(2);
  if (ivaEl) ivaEl.textContent = ivaMonto.toFixed(2);
  if (totalEl) totalEl.textContent = totalFinal.toFixed(2);

  return { subtotal, iva: ivaMonto, total: totalFinal };
}

// Cableado único del selector de IVA (al cargar). Garantiza recalculo de totales (incl. 0%).
(function () {
  const ivaSelect = document.getElementById('cot-iva-porcentaje');
  if (ivaSelect) {
    ivaSelect.addEventListener('change', calcularTotalItems);
    ivaSelect.addEventListener('input', calcularTotalItems);
  }
})();
