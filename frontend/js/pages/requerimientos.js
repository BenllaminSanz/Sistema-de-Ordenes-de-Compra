/**
 * requerimientos.js
 * Lógica de la página de Requerimientos (extraída de requerimientos.html)
 * 
 * NOTA: Esta es la extracción inicial del refactor ligero.
 * El código interno complejo (cotizaciones, items, PDF) se mantiene casi idéntico
 * en esta primera fase para minimizar riesgo.
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

// ── Delegación de eventos en la tabla de requerimientos ──────
const tablaReqs = document.getElementById('tabla-reqs');
if (tablaReqs) {
  window.delegate(tablaReqs, 'button[data-action="ver"]', 'click', (e, btn) => {
    const id = btn.dataset.id;
    if (id) abrirDetalle(id);
  });
}

// ── LISTA ─────────────────────────────────────────────────────
async function cargarRequerimientos(pagina) {
  paginaActual = pagina;
  const contenedor = document.getElementById('tabla-reqs');
  UI.spinner(contenedor);

  const busqueda = document.getElementById('fil-busqueda').value;
  const estado   = document.getElementById('fil-estado').value;
  const tipo     = document.getElementById('fil-tipo').value;

  let qs = `?pagina=${pagina}&limite=15`;
  if (busqueda) qs += `&busqueda=${encodeURIComponent(busqueda)}`;
  if (estado)   qs += `&estado=${estado}`;
  if (tipo)     qs += `&tipo=${tipo}`;

  try {
    const { datos, total, limite } = await Api.get('/requerimientos' + qs);

    if (!datos.length) { UI.empty(contenedor, 'No se encontraron requerimientos'); return; }

    contenedor.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Consecutivo</th><th>Tipo</th><th>Descripción</th>
            <th>Solicitante</th><th>Cotización</th><th>Estado</th><th>Fecha</th><th></th>
          </tr></thead>
          <tbody>
            ${datos.map(r => `
            <tr>
              <td class="fw-600">${r.consecutivo}</td>
              <td>${r.tipo}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                  title="${r.descripcion}">${r.descripcion}</td>
              <td>${r.solicitante_nombre}</td>
              <td>${r.requiere_cotizacion ? '✔' : '—'}</td>
              <td>${UI.badge(r.estado)}</td>
              <td class="text-muted text-sm">${UI.fecha(r.created_at)}</td>
              <td>
                <button class="btn btn-sm btn-outline" data-action="ver" data-id="${r.id}">Ver</button>
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
  } catch (err) {
    UI.empty(contenedor, 'Error al cargar requerimientos');
    Toast.error(err.mensaje || 'Error al cargar');
  }
}

// ── DETALLE ───────────────────────────────────────────────────
async function abrirDetalle(id) {
  document.getElementById('vista-lista').style.display   = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  document.getElementById('detalle-info').innerHTML = '<div class="spinner"></div>';

  try {
    const req = await Api.get(`/requerimientos/${id}`);
    requerimientoActual = req;
    renderDetalle(req);
  } catch (err) {
    Toast.error('No se pudo cargar el requerimiento');
  }
}

function volverLista() {
  document.getElementById('vista-lista').style.display   = 'block';
  document.getElementById('vista-detalle').style.display = 'none';
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

    // Prefill campos
    document.getElementById('req-titulo').value = req.titulo_solicitud || '';
    document.getElementById('req-tipo').value = req.tipo || '';
    document.getElementById('req-area').value = req.area || '';
    document.getElementById('req-departamento').value = req.departamento || '';
    document.getElementById('req-descripcion').value = req.descripcion || '';
    document.getElementById('req-cotizacion').checked = !!req.requiere_cotizacion;
  } else {
    // Modo nuevo
    editandoId = null;
    tituloEl.textContent = 'Nuevo requerimiento';
    btnGuardar.textContent = 'Guardar';
    form.reset();
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
      <tr><td style="padding:6px 0;color:#6b7280">Estado</td>
          <td>${UI.badge(req.estado)}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Solicitante</td>
          <td>${req.solicitante_nombre}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Requiere cotización</td>
          <td>${req.requiere_cotizacion ? 'Sí' : 'No'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">DataTextNow</td>
          <td>${req.datatextnow_id || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Fecha creación</td>
          <td>${UI.fecha(req.created_at)}</td></tr>
    </table>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f0f0f0">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Descripción</div>
      <p style="margin:0;line-height:1.6">${req.descripcion}</p>
    </div>

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
    // Mostrar botón agregar solo a contabilidad/admin
    const btnAgregar = document.getElementById('btn-agregar-cot');
    if (btnAgregar) {
      btnAgregar.style.display = Auth.puedeHacer(['contabilidad','admin']) ? '' : 'none';
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

  if (['contabilidad','gerente','admin'].includes(u.rol)) {
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
                                    const sub = ((item.cantidad || 1) * (item.precio_unitario || 0)).toLocaleString('es-MX');
                                    return `
                                        <tr>
                                            <td style="padding:4px; border:1px solid #ccc;">${item.descripcion || ''}</td>
                                            <td style="text-align:center; padding:4px; border:1px solid #ccc;">${item.cantidad || 1}</td>
                                            <td style="text-align:center; padding:4px; border:1px solid #ccc;">${item.unidad || 'pieza'}</td>
                                            <td style="text-align:right; padding:4px; border:1px solid #ccc;">$${(item.precio_unitario || 0).toLocaleString('es-MX')}</td>
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
                        <p style="margin:4px 0;"><strong>Proveedor:</strong> ${seleccionada.proveedor_nombre || '—'}</p>
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
      Toast.error('No tienes permiso para generar Órdenes de Compra. Contacta a un Gerente o Administrador.');
    } else {
      Toast.error(err.mensaje || 'Error al generar OC');
    }
  }
}

// ── COTIZACIONES (MEJORADO) ─────────────────────────────────────
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
      const estado = c.seleccionada === 1 || c.estado === 'seleccionada' 
        ? `<span class="badge bg-success">Seleccionada</span>` 
        : (c.estado 
            ? `<span class="badge bg-secondary">${c.estado}</span>` 
            : `<span class="badge bg-warning">Pendiente</span>`);

      const tieneItems = c.items && c.items.length > 0;
      const desgloseBtn = tieneItems 
        ? `<button class="btn btn-sm btn-link p-0 ms-2" data-cot-action="toggle-desglose" data-cot-id="${c.id}" title="Ver desglose de conceptos">▼ Desglose</button>`
        : '';

      html += `
        <tr data-cot-id="${c.id}">
          <td><strong>${c.proveedor_nombre || 'Sin proveedor'}</strong></td>
          <td class="text-end fw-600">
            $${monto} ${c.moneda || 'MXN'}
            ${desgloseBtn}
          </td>
          <td>${estado}</td>
          <td class="text-muted">${c.fecha_envio ? UI.fecha(c.fecha_envio) : '—'}</td>
          <td>
            ${c.archivo_url 
              ? `<a href="${c.archivo_url}" target="_blank" class="btn btn-sm btn-outline">📄 Ver PDF</a>` 
              : (c.seleccionada === 1 
                  ? `<button class="btn btn-warning btn-sm" data-cot-action="adjuntar-pdf" data-cot-id="${c.id}">📎 Adjuntar PDF</button>`
                  : `<span class="text-muted small">Sin PDF</span>`)}
          </td>
          <td class="text-center">
            ${c.seleccionada !== 1 
              ? `
                <div class="d-flex gap-1" style="justify-content:center">
                  <button class="btn btn-success btn-sm" data-cot-action="seleccionar" data-cot-id="${c.id}">Seleccionar</button>
                  <button class="btn btn-outline btn-sm" data-cot-action="editar" data-cot-id="${c.id}" title="Editar">✎</button>
                  <button class="btn btn-danger btn-sm" data-cot-action="eliminar" data-cot-id="${c.id}" title="Eliminar">×</button>
                </div>`
              : `
                <div style="display:flex; flex-direction:column; align-items:center; gap:4px">
                  <span class="text-success fw-600">✓ Seleccionada</span>
                  <button class="btn btn-danger btn-sm" 
                          data-cot-action="deseleccionar" data-cot-id="${c.id}"
                          title="Quitar esta cotización como seleccionada">
                    Deseleccionar
                  </button>
                </div>`}
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
        const sub = (it.cantidad || 0) * (it.precio_unitario || 0);
        granTotal += sub;
        itemsHtml += `
          <tr>
            <td>${it.descripcion || '—'}</td>
            <td class="text-center">${it.cantidad || 1}</td>
            <td>${it.unidad || 'pieza'}</td>
            <td class="text-end">$${(it.precio_unitario || 0).toLocaleString('es-MX')}</td>
            <td class="text-end fw-600">$${sub.toLocaleString('es-MX')}</td>
          </tr>`;
      });

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

// Permite adjuntar / actualizar el PDF de una cotización (especialmente la seleccionada)
async function adjuntarPdfACotizacion(cotizacionId) {
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

  const payload = {
    titulo_solicitud:    document.getElementById('req-titulo').value,
    tipo:                document.getElementById('req-tipo').value,
    area:                document.getElementById('req-area').value,
    departamento:        document.getElementById('req-departamento').value,
    descripcion:         document.getElementById('req-descripcion').value,
    requiere_cotizacion: document.getElementById('req-cotizacion').checked,
  };

  try {
    let resultado;
    if (editandoId) {
      const idAEditar = editandoId;
      resultado = await Api.put(`/requerimientos/${idAEditar}`, payload);
      editandoId = null;
      UI.cerrarModal('modal-req');
      Toast.success('Requerimiento actualizado');
      if (requerimientoActual && requerimientoActual.id === idAEditar) {
        abrirDetalle(idAEditar);
      }
    } else {
      resultado = await Api.post('/requerimientos', payload);
      editandoId = null;
      UI.cerrarModal('modal-req');
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

// ── FUNCIONES DEL MODAL DE COTIZACIÓN ─────────────────────────────

function abrirModalCotizacion() {
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
  }
}

// ── GUARDAR COTIZACIÓN (MEJORADO CON ITEMS + EDICIÓN) ─────────────────────────────
async function guardarCotizacion() {
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

  // Validación cliente: fecha de envío no puede ser futura
  const fechaSel = new Date(fecha_envio);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fechaSel.setHours(0, 0, 0, 0);
  if (fechaSel > hoy) {
    return Toast.error('La fecha de envío no puede ser mayor al día actual');
  }

  try {
    let datos = {
      proveedor_id: parseInt(proveedor_id),
      moneda: moneda || 'MXN',
      fecha_envio: fecha_envio,
      notas: notas || null,
      items: []
    };

    const tbody = document.querySelector('#tabla-items-cot tbody');
    const itemsDivVisible = document.getElementById('cotizacion-tipo-items').style.display !== 'none';
    const filasConContenido = tbody ? tbody.querySelectorAll('tr').length : 0;

    const usarItems = (itemsDivVisible || filasConContenido > 0) && filasConContenido > 0;

    if (usarItems && tbody) {
      let total = 0;
      const rows = tbody.querySelectorAll('tr');

      rows.forEach(row => {
        const descripcion = row.querySelector('.item-desc').value.trim();
        if (!descripcion) return;

        const cantidad = parseFloat(row.querySelector('.item-cant').value) || 1;
        const precio_unitario = parseFloat(row.querySelector('.item-precio').value) || 0;

        datos.items.push({
          descripcion,
          cantidad,
          unidad: row.querySelector('.item-unidad').value,
          precio_unitario
        });

        total += cantidad * precio_unitario;
      });

      datos.monto_subtotal = total;
      datos.monto_total = total;
      datos.iva = 0;

      if (datos.items.length === 0) {
        return Toast.error('Debe agregar al menos un concepto en la lista de items');
      }
    } 
    else {
      const monto_total = parseFloat(document.getElementById('cot_monto_total').value) || 0;
      
      if (monto_total <= 0) {
        return Toast.error('Debe ingresar un monto total válido');
      }

      datos.monto_total = monto_total;
      datos.monto_subtotal = monto_total;
      datos.iva = 0;
    }

    let response;
    if (cotizacionEditandoId) {
      response = await Api.put(`/cotizaciones/${cotizacionEditandoId}`, datos);
    } else {
      datos.requerimiento_id = parseInt(reqId);
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

// Cargar proveedores en el modal
async function cargarProveedoresEnModal() {
  try {
    const proveedores = await Api.get('/proveedores');
    const select = document.getElementById('cot_proveedor_id');
    select.innerHTML = '<option value="">Selecciona proveedor...</option>';
    
    proveedores.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nombre;
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

      const totalItems = calcularTotalItems();
      if (totalItems > 0) {
        document.getElementById('cot_monto_total').value = totalItems.toFixed(2);
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
    <td><input type="number" class="form-control item-precio text-end" step="0.01" placeholder="0.00" value="${itemData.precio_unitario || 0}"></td>
    <td class="item-subtotal text-end fw-600">0.00</td>
    <td class="text-center">
      <button class="btn btn-sm btn-danger" data-action="eliminar-item">×</button>
    </td>
  `;

  const unidadSelect = row.querySelector('.item-unidad');
  if (unidadSelect && itemData.unidad) {
    unidadSelect.value = itemData.unidad;
  }

  row.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', calcularTotalItems);
  });

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

function calcularTotalItems() {
  let total = 0;
  const rows = document.querySelectorAll('#tabla-items-cot tbody tr');

  rows.forEach(row => {
    const cantidad = parseFloat(row.querySelector('.item-cant').value) || 0;
    const precio = parseFloat(row.querySelector('.item-precio').value) || 0;
    const subtotal = cantidad * precio;

    row.querySelector('.item-subtotal').textContent = subtotal.toFixed(2);
    total += subtotal;
  });

  const totalEl = document.getElementById('total-items');
  if (totalEl) totalEl.textContent = total.toFixed(2);
  return total;
}