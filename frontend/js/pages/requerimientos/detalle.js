// ── DETALLE DEL REQUERIMIENTO ─────────────────────────────────

const EMPRESA_SUBTITULO = 'Hilos de Yecapixtla S.A. de C.V.';
const LOGO_PRINT_PATH = 'img/topLogoParkdale.png';

function buildPrintEncabezadoHtml() {
  const logoUrl = `${window.location.origin}/${LOGO_PRINT_PATH}`;
  return `
    <div class="print-encabezado">
      <img src="${logoUrl}" alt="Parkdale">
      <p class="print-empresa">${EMPRESA_SUBTITULO}</p>
    </div>`;
}

function getPrintStyles() {
  return `
    @page { size: letter portrait; margin: 8mm 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: white;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      line-height: 1.3;
    }
    #print-sheet {
      width: 100%;
      transform-origin: top left;
    }
    .print-encabezado {
      text-align: center;
      margin-bottom: 6px;
      padding-bottom: 5px;
      border-bottom: 1px solid #cbd5e1;
    }
    .print-encabezado img {
      display: block;
      margin: 0 auto 3px;
      max-width: 150px;
      max-height: 42px;
      height: auto;
    }
    .print-empresa {
      margin: 0;
      font-size: 8.5pt;
      font-weight: 600;
      color: #334155;
    }
    .print-titulo {
      text-align: center;
      margin: 0 0 6px;
      font-size: 11pt;
      font-weight: 700;
    }
    .print-contenido .card-title {
      font-size: 9.5pt;
      font-weight: 700;
      margin: 0 0 4px;
    }
    .print-contenido table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt !important;
    }
    .print-contenido table td,
    .print-contenido table th {
      padding: 2px 4px !important;
      vertical-align: top;
    }
    .print-contenido > div,
    .print-contenido div[style*="margin-top"] {
      margin-top: 5px !important;
      padding-top: 5px !important;
    }
    .print-contenido p {
      margin: 0 !important;
      font-size: 8.5pt !important;
      line-height: 1.35 !important;
    }
    .print-contenido ul {
      margin: 0 !important;
      padding-left: 14px !important;
      font-size: 8pt !important;
    }
    .print-contenido li {
      margin-bottom: 2px !important;
    }
    .print-contenido button {
      display: none !important;
    }
    .print-contenido div[style*="font-size:12px"],
    .print-contenido div[style*="font-size:11px"] {
      font-size: 8pt !important;
      margin-bottom: 2px !important;
    }
    .print-cotizacion {
      margin-top: 6px !important;
      border: 1px solid #166534;
      padding: 6px 8px !important;
      border-radius: 4px;
      page-break-inside: avoid;
    }
    .print-cotizacion h3 {
      color: #166534;
      margin: 0 0 3px;
      font-size: 9pt;
    }
    .print-cotizacion p {
      margin: 1px 0 !important;
      font-size: 8pt !important;
    }
    .print-cotizacion table {
      font-size: 7.5pt !important;
      margin-top: 4px !important;
    }
    .print-cotizacion table td,
    .print-cotizacion table th {
      padding: 2px 3px !important;
    }
    .print-firmas {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      margin-top: 36px;
      padding-top: 18px;
      border-top: 1px solid #e5e7eb;
      page-break-inside: avoid;
    }
    .print-firma-col {
      flex: 1;
      text-align: center;
      min-width: 0;
    }
    .print-firma-linea {
      border-top: 1px solid #000;
      margin: 28px 6px 6px;
      height: 1px;
    }
    .print-firma-label {
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .3px;
      color: #374151;
      margin-bottom: 2px;
    }
    .print-firma-nombre {
      font-size: 8pt;
      color: #111827;
    }
    @media print {
      html, body { height: auto; overflow: visible; }
      #print-sheet { page-break-inside: avoid; }
    }
  `;
}

function ajustarImpresionUnaPagina(ventana) {
  const sheet = ventana.document.getElementById('print-sheet');
  if (!sheet) return;

  sheet.style.transform = '';
  sheet.style.width = '';
  ventana.document.body.style.height = '';

  const maxAltoPx = 1000;
  const alto = sheet.getBoundingClientRect().height;
  if (alto <= maxAltoPx) return;

  const escala = maxAltoPx / alto;
  sheet.style.transform = `scale(${escala})`;
  sheet.style.width = `${100 / escala}%`;
  ventana.document.body.style.height = `${Math.ceil(alto * escala)}px`;
}

function lanzarImpresionVentana(ventana) {
  ajustarImpresionUnaPagina(ventana);
  ventana.focus();
  ventana.print();
  ventana.close();
}

function _redondearMonto(n) {
  return typeof redondear2 === 'function' ? redondear2(n) : Math.round(n * 100) / 100;
}

function renderProveedorSeleccionadoHtml(prov) {
  if (!prov?.proveedor_id && !prov?.proveedor_nombre) return '';
  const label = UI.labelProveedor(prov) || '—';
  const monto = prov.cotizacion_monto != null
    ? parseFloat(prov.cotizacion_monto).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;
  return `
    <tr>
      <td style="padding:6px 0;color:#6b7280">Proveedor seleccionado</td>
      <td>
        <strong style="color:#166534;">${label}</strong>
        ${monto ? `<span style="margin-left:8px;color:#64748b;font-size:12px;">($${monto} ${prov.cotizacion_moneda || 'MXN'})</span>` : ''}
      </td>
    </tr>`;
}

function renderTablaItemsCatalogo(items) {
  if (!items?.length) return '';

  let totalGeneral = 0;
  let monedaTotal = 'MXN';
  let tieneSubtotales = false;

  const filas = items.map(item => {
    const cantidad = parseFloat(item.cantidad) || 0;
    const precioRef = item.costo_referencia != null ? parseFloat(item.costo_referencia) : null;
    const moneda = item.moneda || 'MXN';
    const precioFmt = precioRef != null ? precioRef.toFixed(2) : '—';

    let subtotalFmt = '—';
    if (precioRef != null) {
      const sub = _redondearMonto(cantidad * precioRef);
      totalGeneral = _redondearMonto(totalGeneral + sub);
      monedaTotal = moneda;
      tieneSubtotales = true;
      subtotalFmt = sub.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    const prov = (item.proveedor_num || item.proveedor_nombre)
      ? `<div style="font-size:10px; color:#64748b; margin-top:1px;">Prov: <strong>${item.proveedor_num || ''}${item.proveedor_nombre ? ' — ' + item.proveedor_nombre : ''}</strong></div>`
      : '';

    return `
      <tr>
        <td style="padding:4px 6px; border-bottom:1px solid #eee;"><strong>${item.codigo}</strong>${prov}</td>
        <td style="padding:4px 6px; border-bottom:1px solid #eee;">${item.descripcion}</td>
        <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right;">${cantidad.toLocaleString('es-MX')}</td>
        <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right; color:#0d6efd; font-weight:500;">${precioFmt}${precioRef != null ? ` ${moneda}` : ''}</td>
        <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right; font-weight:600;">${subtotalFmt !== '—' ? `$${subtotalFmt} ${moneda}` : '—'}</td>
      </tr>`;
  }).join('');

  const totalFmt = tieneSubtotales
    ? totalGeneral.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;

  return `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f0f0f0">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Ítems solicitados del Catálogo</div>
      <table style="width:100%; font-size:13px; border-collapse: collapse;">
        <thead>
          <tr style="background:#f8f9fa;">
            <th style="text-align:left; padding:4px 6px;">Código</th>
            <th style="text-align:left; padding:4px 6px;">Descripción</th>
            <th style="text-align:right; padding:4px 6px;">Cantidad</th>
            <th style="text-align:right; padding:4px 6px;">Precio ref.</th>
            <th style="text-align:right; padding:4px 6px;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${filas}
          ${totalFmt ? `
          <tr style="background:#f8fafc;">
            <td colspan="4" style="padding:8px 6px; text-align:right; font-weight:700; border-top:2px solid #e2e8f0;">Total</td>
            <td style="padding:8px 6px; text-align:right; font-weight:700; color:#166534; font-size:14px; border-top:2px solid #e2e8f0;">$${totalFmt} ${monedaTotal}</td>
          </tr>` : ''}
        </tbody>
      </table>
    </div>`;
}

async function abrirDetalle(id) {
  const lista = document.getElementById('vista-lista');
  const detalle = document.getElementById('vista-detalle');

  lista.style.display = 'none';
  detalle.style.display = 'block';
  detalle.classList.remove('hidden');

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

function renderDetalle(req) {
  document.getElementById('detalle-titulo').textContent =
    `${req.consecutivo || 'Borrador (sin consecutivo)'} — ${req.tipo}`;

  document.getElementById('detalle-info').innerHTML = `
    <div class="card-title">Información del requerimiento</div>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:6px 0;color:#6b7280;width:140px">Consecutivo</td>
          <td class="fw-600">${req.consecutivo || '<span class="text-muted">Provisional — se asigna al enviar a revisión</span>'}</td></tr>
      ${req.titulo_solicitud ? `<tr><td style="padding:6px 0;color:#6b7280">Título</td><td class="fw-600">${UI.esc(req.titulo_solicitud)}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#6b7280">Tipo</td>
          <td>${req.tipo}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Área</td>
          <td>${req.area || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Departamento</td>
          <td>${req.departamento ? `${req.departamento_codigo ? `<strong>${req.departamento_codigo}</strong> — ` : ''}${req.departamento}` : '—'}</td></tr>
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
      ${renderProveedorSeleccionadoHtml(req.proveedor_seleccionado)}
      <tr><td style="padding:6px 0;color:#6b7280">PO en DataTextNow</td>
          <td>${req.datatextnow_id || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Fecha creación</td>
          <td>${UI.fecha(req.created_at)}</td></tr>
    </table>
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid #f0f0f0">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px">Notas / Detalles</div>
      <p style="margin:0;line-height:1.6">${req.notas || req.descripcion || '—'}</p>
    </div>

    ${renderTablaItemsCatalogo(req.items)}

    ${req.items_libres && req.items_libres.length > 0 ? `
    <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #f0ad4e">
      <div style="font-size:11px;color:#b45309;margin-bottom:3px">
        Ítems en texto libre (no existían en el catálogo)
        <span style="font-size:9px; color:#854d0e;">— (Este req debe ser SOLO de libres para cotización y alta en catálogo)</span>
      </div>
      <ul style="margin:0; padding-left:0; list-style:none; font-size:12px;">
        ${req.items_libres.map(item => {
          const catBadge = item.catalogo_asignado_id
            ? `<span style="font-size:10px;background:#dcfce7;color:#166534;padding:1px 6px;border-radius:3px;font-weight:600;white-space:nowrap;">&#128230; ${item.catalogo_codigo || 'ID:' + item.catalogo_asignado_id}</span>`
            : '';
          const btnAsignar = Auth.puedeHacer(['contabilidad', 'admin'])
            ? `<button type="button"
                 onclick="abrirAsignarCatalogo(${item.id},'${item.descripcion.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${req.tipo}')"
                 style="padding:1px 7px;font-size:10px;cursor:pointer;border:1px solid #94a3b8;border-radius:3px;background:#f8fafc;color:#334155;flex-shrink:0;">
                 ${item.catalogo_asignado_id ? '&#9998; Cambiar' : '&#128279; Asignar catálogo'}
               </button>`
            : '';
          return `
          <li style="margin-bottom:7px;display:flex;align-items:center;flex-wrap:wrap;gap:5px;">
            <span>${item.descripcion} &mdash; <strong>${parseFloat(item.cantidad).toLocaleString('es-MX')}</strong>${item.unidad ? ' ' + item.unidad : ''}</span>
            ${UI.referenciaItemHtml(item, true)}
            ${catBadge}
            ${btnAsignar}
          </li>`;
        }).join('')}
      </ul>
    </div>` : ''}

    ${(req.estado === 'borrador' || req.estado === 'incompleto') && (Auth.getUsuario() && Auth.getUsuario().id === req.solicitante_id) ? `
    <div style="margin-top:12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:7px;padding:10px 12px;font-size:13px">
      <strong>📝 Borrador</strong> — Puedes editar este requerimiento antes de enviarlo a revisión.
    </div>` : ''}

    ${req.notas_rechazo ? `
    <div style="margin-top:12px;background:#FCEBEB;border-radius:7px;padding:12px">
      <div style="font-size:12px;font-weight:600;color:#A32D2D;margin-bottom:4px">Nota</div>
      <p style="margin:0;font-size:13px;color:#791F1F">${req.notas_rechazo}</p>
    </div>` : ''}`;

  // ── Cotizaciones ──────────────────────────────────────────
  const panelCot = document.getElementById('detalle-cotizaciones');
  if (req.requiere_cotizacion) {
    panelCot.style.display = 'block';
    cargarCotizaciones(req.id);

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

  renderAcciones(req);

  const accionesPanel = document.getElementById('panel-acciones');
  if (accionesPanel && !accionesPanel.dataset.delegateAttached) {
    accionesPanel.dataset.delegateAttached = 'true';

    window.delegate(accionesPanel, 'button[data-action]', 'click', (e, btn) => {
      const action = btn.dataset.action;
      if (action === 'imprimirRequerimiento') imprimirRequerimiento();
      if (action === 'editarRequerimientoActual') editarRequerimientoActual();
      if (action === 'generarOC') generarOC();
      if (action === 'eliminarBorradorReq') eliminarBorradorReq();
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

  acciones.push({ label:'🖨️ Imprimir', accion:'imprimirRequerimiento', clase:'btn-secundary' });

  const esDueno = u && req.solicitante_id === u.id;
  if (esDueno && (req.estado === 'borrador' || req.estado === 'incompleto')) {
    acciones.push({ label:'✏️ Editar', accion:'editarRequerimientoActual', clase:'btn-outline' });
    acciones.push({ label:'📤 Enviar a revisión', estado:'en_revision', clase:'btn-primary' });
  }
  // Eliminar solo en borrador (aún no enviado formalmente a revisión)
  if (req.estado === 'borrador' && (esDueno || ['contabilidad', 'admin'].includes(u?.rol))) {
    acciones.push({ label:'🗑️ Eliminar borrador', accion:'eliminarBorradorReq', clase:'btn-danger' });
  }

  if (['contabilidad','admin'].includes(u.rol)) {
    // Flujo: Revisión → Aprobar/Rechazar → Cotizar (si aplica) → Autorizar/Generar OC
    if (req.estado === 'en_revision') {
      acciones.push({ label:'Aprobar',    estado:'aprobado',   clase:'btn-success' });
      acciones.push({ label:'Incompleto', estado:'incompleto', clase:'btn-outline' });
      acciones.push({ label:'Rechazar',   estado:'rechazado',  clase:'btn-danger'  });
    }
    if (req.estado === 'aprobado') {
      acciones.push({ label:'Generar OC', accion:'generarOC', clase:'btn-primary' });
      if (!req.oc_id && !req.orden_compra_id) {
        acciones.push({ label:'Cancelar REQ', estado:'rechazado', clase:'btn-danger' });
      }
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
async function prepararCambioEstado(estado, label) {
  estadoPendiente = estado;
  const titulo = estado === 'rechazado' && requerimientoActual?.estado === 'aprobado'
    ? 'Cancelar requerimiento'
    : label;
  document.getElementById('modal-estado-titulo').textContent = titulo;
  document.getElementById('estado-notas').value = '';

  const avisoEl = document.getElementById('estado-aviso');
  if (avisoEl) {
    avisoEl.style.display = 'none';
    avisoEl.innerHTML = '';

    if (estado === 'aprobado' && requerimientoActual?.requiere_cotizacion) {
      try {
        const response = await Api.get(`/cotizaciones/${requerimientoActual.id}`);
        const cotizaciones = Array.isArray(response) ? response
          : (response.data && Array.isArray(response.data) ? response.data : []);
        const seleccionada = cotizaciones.find(
          (c) => c.seleccionada === 1 || c.estado === 'seleccionada'
        );
        if (seleccionada && !seleccionada.archivo_url) {
          avisoEl.innerHTML = '<strong>Recomendación:</strong> la cotización seleccionada no tiene PDF adjunto. Puedes aprobar igual, pero se sugiere agregar el documento de respaldo del proveedor.';
          avisoEl.style.display = 'block';
        }
      } catch (_) { /* ignorar */ }
    }
  }

  UI.abrirModal('modal-estado');

  document.getElementById('btn-confirmar-estado').onclick = async () => {
    const notas = document.getElementById('estado-notas').value;
    try {
      const actualizado = await Api.patch(`/requerimientos/${requerimientoActual.id}/estado`,
        { estado: estadoPendiente, notas });
      UI.cerrarModal('modal-estado');
      if (estadoPendiente === 'en_revision' && actualizado?.consecutivo) {
        Toast.success(`Enviado a revisión. Consecutivo: ${actualizado.consecutivo}`);
      } else {
        Toast.success('Estado actualizado');
      }
      if (estadoPendiente === 'aprobado' && avisoEl?.style.display === 'block') {
        Toast.warning('Recuerda adjuntar el PDF de la cotización seleccionada cuando lo tengas disponible.', 7000);
      }
      abrirDetalle(requerimientoActual.id);
    } catch (err) {
      Toast.error(err.mensaje || 'Error al cambiar estado');
    }
  };
}

// ── Imprimir requerimiento ────────────────────────────────────
async function imprimirRequerimiento() {
  const detalleElement = document.getElementById('detalle-info');
  if (!detalleElement) return;

  let cotizacionHtml = '';

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
            <table>
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th style="text-align:center;">Cant.</th>
                  <th style="text-align:center;">Unidad</th>
                  <th style="text-align:right;">Precio</th>
                  <th style="text-align:right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${seleccionada.items.map(item => {
                  const cantidad = Math.round(parseFloat(item.cantidad) || 1);
                  const precio = redondear2(parseFloat(item.precio_unitario) || 0);
                  const sub = redondear2(cantidad * precio).toLocaleString('es-MX');
                  return `
                    <tr>
                      <td>${item.descripcion || ''}</td>
                      <td style="text-align:center;">${cantidad}</td>
                      <td style="text-align:center;">${item.unidad || 'pieza'}</td>
                      <td style="text-align:right;">$${precio.toLocaleString('es-MX')}</td>
                      <td style="text-align:right; font-weight:600;">$${sub}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>`;
        }

        cotizacionHtml = `
          <div class="print-cotizacion">
            <h3>Cotización seleccionada</h3>
            <p><strong>Proveedor:</strong> ${UI.labelProveedor(seleccionada)}</p>
            <p><strong>Monto total:</strong> <strong>$${monto} ${seleccionada.moneda || 'MXN'}</strong></p>
            ${itemsHtml}
            ${seleccionada.notas ? `<p><strong>Notas:</strong> ${seleccionada.notas}</p>` : ''}
          </div>`;
      }
    } catch (e) {
      console.warn('No se pudo cargar la cotización seleccionada para impresión', e);
    }
  }

  const firmasHtml = `
    <div class="print-firmas">
      <div class="print-firma-col">
        <div class="print-firma-linea"></div>
        <div class="print-firma-label">Solicitante</div>
        <div class="print-firma-nombre">${requerimientoActual.solicitante_nombre || '—'}</div>
      </div>
      <div class="print-firma-col">
        <div class="print-firma-linea"></div>
        <div class="print-firma-label">Quien autorizó</div>
        <div class="print-firma-nombre">Gerente de Planta</div>
      </div>
      <div class="print-firma-col">
        <div class="print-firma-linea"></div>
        <div class="print-firma-label">Quien aprobó</div>
        <div class="print-firma-nombre">Jefe Inmediato</div>
      </div>
    </div>`;

  // (Espacio de firmas reforzado en CSS: más separación de la tabla de ítems)

  const ventana = window.open('', '_blank', 'width=800,height=600');
  ventana.document.write(`
    <html>
      <head>
        <title>Requerimiento: ${requerimientoActual.consecutivo}</title>
        <style>${getPrintStyles()}</style>
      </head>
      <body>
        <div id="print-sheet">
          ${buildPrintEncabezadoHtml()}
          <h2 class="print-titulo">Requerimiento: ${requerimientoActual.consecutivo}</h2>
          <div class="print-contenido">${detalleElement.innerHTML}</div>
          ${cotizacionHtml}
          ${firmasHtml}
        </div>
      </body>
    </html>
  `);
  ventana.document.close();

  let impreso = false;
  const imprimir = () => {
    if (impreso) return;
    impreso = true;
    lanzarImpresionVentana(ventana);
  };

  const img = ventana.document.querySelector('.print-encabezado img');
  if (img && !img.complete) {
    img.onload = imprimir;
    img.onerror = imprimir;
    setTimeout(imprimir, 1200);
  } else {
    setTimeout(imprimir, 80);
  }
}

function editarRequerimientoActual() {
  if (!requerimientoActual) return;
  abrirEditorRequerimiento(requerimientoActual);
}

// ── Asignar ítem libre al catálogo (Contabilidad/Admin) ───────
let _asignarCatalogoLibreId = null;

window.abrirAsignarCatalogo = function(libreId, descripcion, tipo) {
  _asignarCatalogoLibreId = libreId;
  const titulo = document.getElementById('modal-asignar-cat-titulo');
  if (titulo) titulo.textContent = descripcion.length > 55 ? descripcion.slice(0, 55) + '…' : descripcion;
  const tipoEl = document.getElementById('modal-asignar-cat-tipo');
  if (tipoEl) tipoEl.value = tipo || '';
  const busq = document.getElementById('modal-asignar-cat-busqueda');
  if (busq) { busq.value = ''; }
  const res = document.getElementById('modal-asignar-cat-resultados');
  if (res) res.innerHTML = '';
  UI.abrirModal('modal-asignar-catalogo');
  setTimeout(() => busq && busq.focus(), 80);
};

window.buscarParaAsignarCatalogo = async function() {
  const busq = document.getElementById('modal-asignar-cat-busqueda')?.value?.trim() || '';
  const tipo  = document.getElementById('modal-asignar-cat-tipo')?.value || '';
  const cont  = document.getElementById('modal-asignar-cat-resultados');
  if (!cont) return;
  if (busq.length < 2) {
    cont.innerHTML = '<p style="font-size:12px;color:#6b7280;padding:8px 10px">Escribe al menos 2 caracteres para buscar</p>';
    return;
  }
  cont.innerHTML = '<p style="font-size:12px;color:#6b7280;padding:8px 10px">Buscando...</p>';
  try {
    const params = new URLSearchParams({ busqueda: busq, soloActivos: 'true' });
    if (tipo) params.set('tipo', tipo);
    const items = await Api.get(`/catalogo?${params}`);
    if (!items.length) {
      cont.innerHTML = '<p style="font-size:12px;color:#6b7280;padding:8px 10px">Sin resultados para esa búsqueda</p>';
      return;
    }
    cont.innerHTML = items.slice(0, 12).map(it => `
      <div style="padding:6px 10px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="min-width:0;font-size:12px;">
          <strong style="color:#185FA5">${it.codigo}</strong>
          <span style="margin-left:5px;">${it.descripcion}</span>
          ${it.proveedor_nombre ? `<div style="font-size:10px;color:#6b7280;margin-top:1px;">${it.proveedor_nombre}</div>` : ''}
        </div>
        <button type="button" onclick="confirmarAsignarCatalogo(${it.id})"
                style="flex-shrink:0;padding:3px 10px;font-size:11px;cursor:pointer;border:1px solid #185FA5;border-radius:3px;background:#185FA5;color:#fff;">
          Asignar
        </button>
      </div>`).join('');
  } catch {
    cont.innerHTML = '<p style="font-size:12px;color:#c00;padding:8px 10px">Error al buscar en el catálogo</p>';
  }
};

window.confirmarAsignarCatalogo = async function(catalogoId) {
  if (!_asignarCatalogoLibreId || !requerimientoActual) return;
  try {
    await Api.patch(
      `/requerimientos/${requerimientoActual.id}/items-libres/${_asignarCatalogoLibreId}/catalogo`,
      { catalogo_id: catalogoId }
    );
    UI.cerrarModal('modal-asignar-catalogo');
    Toast.success('Ítem asignado al catálogo correctamente');
    await abrirDetalle(requerimientoActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al asignar el ítem');
  }
};

// ── Generar OC ────────────────────────────────────────────────
let _generarOcPendiente = null;

function esErrorFaltanCodigosCatalogo(err) {
  const codigoErr = err?.data?.codigo || err?.codigo;
  if (codigoErr === 'FALTAN_CODIGOS_CATALOGO') return true;
  const msg = String(err?.mensaje || err?.data?.mensaje || '');
  return /n[ºo°]?\s*í?tem/i.test(msg) && /cat[aá]logo|completalo|complétalo|generar la oc/i.test(msg);
}

function itemCotizacionSinCodigo(item) {
  if (!item) return false;
  if (item.catalogo_id) return false;
  return !String(item.codigo_catalogo || item.codigo || '').trim();
}

async function obtenerItemsSinCodigoCatalogo(cotizacionId) {
  if (!cotizacionId) return [];

  try {
    const cot = await Api.get(`/cotizaciones/detalle/${cotizacionId}`);
    const items = Array.isArray(cot?.items) ? cot.items : [];
    return items
      .filter(itemCotizacionSinCodigo)
      .map(it => ({
        id: it.id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        unidad: it.unidad || '',
      }));
  } catch (_) {
    try {
      const response = await Api.get(`/cotizaciones/${requerimientoActual.id}`);
      const cots = Array.isArray(response) ? response : (response.data || []);
      const cot = cots.find(c => Number(c.id) === Number(cotizacionId));
      const items = Array.isArray(cot?.items) ? cot.items : [];
      return items
        .filter(itemCotizacionSinCodigo)
        .map(it => ({
          id: it.id,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          unidad: it.unidad || '',
        }));
    } catch (e2) {
      console.warn('[generarOC] No se pudieron cargar ítems sin código', e2);
      return [];
    }
  }
}

async function eliminarBorradorReq() {
  if (!requerimientoActual || requerimientoActual.estado !== 'borrador') {
    return Toast.error('Solo se pueden eliminar requerimientos en borrador');
  }
  const etiqueta = requerimientoActual.consecutivo
    || requerimientoActual.titulo_solicitud
    || `#${requerimientoActual.id}`;
  if (!confirm(`¿Eliminar el borrador "${etiqueta}"?\n\nEsta acción no se puede deshacer.`)) return;

  try {
    await Api.delete(`/requerimientos/${requerimientoActual.id}`);
    Toast.success('Borrador eliminado');
    volverLista();
    if (typeof cargarRequerimientos === 'function') cargarRequerimientos(1);
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudo eliminar el borrador');
  }
}

async function generarOC() {
  let cotizacion_id = null;
  let cotSeleccionada = null;

  if (requerimientoActual.requiere_cotizacion) {
    const response = await Api.get(`/cotizaciones/${requerimientoActual.id}`);
    const cots = Array.isArray(response) ? response : (response.data || []);
    cotSeleccionada = cots.find(c => c.seleccionada === 1 || c.estado === 'seleccionada');
    if (!cotSeleccionada) {
      Toast.error('Debes seleccionar una cotización antes de generar la OC');
      return;
    }
    cotizacion_id = cotSeleccionada.id;

    const itemsLocales = Array.isArray(cotSeleccionada.items) ? cotSeleccionada.items : [];
    let faltantes = itemsLocales
      .filter(itemCotizacionSinCodigo)
      .map(it => ({
        id: it.id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        unidad: it.unidad || '',
      }));

    if (!faltantes.length) {
      faltantes = await obtenerItemsSinCodigoCatalogo(cotizacion_id);
    }

    if (faltantes.length > 0) {
      _generarOcPendiente = { cotizacion_id };
      abrirModalCompletarNroItemOC(
        faltantes,
        faltantes.length === 1
          ? `El ítem "${faltantes[0].descripcion || 'sin descripción'}" no tiene Nº ítem. Complétalo para generar la OC; ese código se guardará en el catálogo.`
          : `Hay ${faltantes.length} ítems sin Nº ítem. Complétalos para generar la OC; esos códigos se guardarán en el catálogo.`
      );
      return;
    }
  }

  await intentarGenerarOC({ cotizacion_id, items_codigo_catalogo: null });
}

async function intentarGenerarOC({ cotizacion_id, items_codigo_catalogo, datatextnow_id, fecha_po }) {
  // Si aún no se capturó el PO, abrir modal y guardar el resto del payload
  if (datatextnow_id === undefined) {
    _generarOcPendiente = {
      cotizacion_id,
      items_codigo_catalogo: items_codigo_catalogo || null,
    };
    // Cierra el modal de Nº ítem si estaba abierto; sigue el de PO
    const modalNro = document.getElementById('modal-completar-nro-item-oc');
    if (modalNro) {
      modalNro.classList.remove('show');
      modalNro.style.display = '';
    }
    abrirModalPoGenerarOC();
    return;
  }

  const body = {
    requerimiento_id: requerimientoActual.id,
    cotizacion_id,
    datatextnow_id,
  };
  if (fecha_po) body.fecha_po = fecha_po;
  if (Array.isArray(items_codigo_catalogo) && items_codigo_catalogo.length > 0) {
    body.items_codigo_catalogo = items_codigo_catalogo;
  }

  try {
    const oc = await Api.post('/ordenes-compra', body);
    cerrarModalCompletarNroItemOC();
    cerrarModalPoGenerarOC();
    Toast.success(`OC generada: ${oc.numero_oc}`);
    setTimeout(() => { window.location.href = `ordenes.html?id=${oc.id}`; }, 1200);
  } catch (err) {
    if (esErrorFaltanCodigosCatalogo(err)) {
      cerrarModalPoGenerarOC();
      let itemsFaltantes = err?.data?.items || err?.items;
      if (!Array.isArray(itemsFaltantes) || !itemsFaltantes.length) {
        itemsFaltantes = await obtenerItemsSinCodigoCatalogo(cotizacion_id);
      }

      if (Array.isArray(itemsFaltantes) && itemsFaltantes.length) {
        _generarOcPendiente = { cotizacion_id, items_codigo_catalogo: null };
        abrirModalCompletarNroItemOC(itemsFaltantes, err.mensaje);
        return;
      }
    }

    if (err.status === 403 || (err.mensaje && err.mensaje.toLowerCase().includes('permiso'))) {
      Toast.error('No tienes permiso para generar Órdenes de Compra. Contacta a Contabilidad o Administrador.');
    } else {
      Toast.error(err.mensaje || 'Error al generar OC');
    }
  }
}

function abrirModalPoGenerarOC() {
  const modal = document.getElementById('modal-po-generar-oc');
  if (!modal) {
    Toast.error('No se encontró el formulario de PO. Recarga la página e intenta de nuevo.');
    return;
  }
  const radioNo = modal.querySelector('input[name="po-oc-tiene"][value="no"]');
  if (radioNo) radioNo.checked = true;
  const num = document.getElementById('po-oc-numero');
  const fecha = document.getElementById('po-oc-fecha');
  if (num) num.value = '';
  if (fecha) fecha.value = '';
  toggleCamposPoGenerarOC();
  modal.classList.add('show');
  modal.style.display = 'flex';
}

function cerrarModalPoGenerarOC() {
  const modal = document.getElementById('modal-po-generar-oc');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = '';
  }
}

function toggleCamposPoGenerarOC() {
  const tiene = document.querySelector('input[name="po-oc-tiene"]:checked')?.value === 'si';
  const box = document.getElementById('po-oc-campos-numero');
  if (box) box.style.display = tiene ? 'block' : 'none';
}

async function confirmarPoYGenerarOC() {
  if (!_generarOcPendiente) {
    Toast.error('No hay generación de OC pendiente. Intenta de nuevo.');
    return;
  }

  const tiene = document.querySelector('input[name="po-oc-tiene"]:checked')?.value === 'si';
  let datatextnow_id = 'NA';
  let fecha_po = null;

  if (tiene) {
    datatextnow_id = (document.getElementById('po-oc-numero')?.value || '').trim();
    fecha_po = (document.getElementById('po-oc-fecha')?.value || '').trim();
    if (!datatextnow_id) {
      Toast.error('Ingresa el número de PO de DataTextNow');
      return;
    }
    if (!fecha_po) {
      Toast.error('Ingresa la fecha del PO en DataTextNow');
      return;
    }
  }

  const btn = document.getElementById('btn-confirmar-po-generar-oc');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generando OC…';
  }

  try {
    await intentarGenerarOC({
      cotizacion_id: _generarOcPendiente.cotizacion_id,
      items_codigo_catalogo: _generarOcPendiente.items_codigo_catalogo,
      datatextnow_id,
      fecha_po,
    });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generar OC';
    }
  }
}

window.cerrarModalPoGenerarOC = cerrarModalPoGenerarOC;
window.toggleCamposPoGenerarOC = toggleCamposPoGenerarOC;
window.confirmarPoYGenerarOC = confirmarPoYGenerarOC;

function abrirModalCompletarNroItemOC(items, mensaje) {
  const modal = document.getElementById('modal-completar-nro-item-oc');
  const aviso = document.getElementById('nro-item-oc-aviso');
  const tbody = document.querySelector('#tabla-nro-item-oc tbody');

  if (!modal || !aviso || !tbody) {
    console.error('[generarOC] Modal de Nº ítem no encontrado en el DOM');
    Toast.error(mensaje || 'Faltan Nº ítem en la cotización para generar la OC. Recarga la página e intenta de nuevo.');
    return;
  }

  aviso.textContent = mensaje
    || 'Uno o más ítems no tienen Nº ítem. Complétalos para continuar; ese código se guardará en el catálogo al generar la OC.';

  tbody.innerHTML = (items || []).map(it => {
    const qty = it.cantidad != null ? it.cantidad : '';
    const unit = it.unidad ? ` ${UI.esc(it.unidad)}` : '';
    const itemId = it.id != null ? it.id : '';
    return `
      <tr data-item-id="${itemId}">
        <td style="padding:8px; border-bottom:1px solid #e2e8f0; vertical-align:top;">
          <div style="font-size:13px; color:#1e293b; line-height:1.4;">${UI.esc(it.descripcion || '—')}</div>
          <div style="font-size:11px; color:#64748b; margin-top:2px;">Cantidad: ${UI.esc(String(qty))}${unit}</div>
        </td>
        <td style="padding:8px; border-bottom:1px solid #e2e8f0; width:160px;">
          <input type="text" class="form-control nro-item-oc-input" placeholder="Ej. LLAV-001"
                 style="font-size:13px;" data-item-id="${itemId}" autocomplete="off">
        </td>
      </tr>`;
  }).join('');

  modal.classList.add('show');
  modal.style.display = 'flex';

  const first = tbody.querySelector('.nro-item-oc-input');
  if (first) setTimeout(() => first.focus(), 50);
}

async function confirmarCompletarNroItemYGenerarOC() {
  if (!_generarOcPendiente) {
    Toast.error('No hay generación de OC pendiente. Intenta de nuevo.');
    return;
  }

  const inputs = document.querySelectorAll('#tabla-nro-item-oc .nro-item-oc-input');
  const items_codigo_catalogo = [];
  let incompleto = false;

  inputs.forEach(inp => {
    const codigo = (inp.value || '').trim();
    const id = parseInt(inp.dataset.itemId, 10);
    if (!codigo) {
      incompleto = true;
      inp.style.borderColor = '#dc2626';
    } else {
      inp.style.borderColor = '';
      if (id) items_codigo_catalogo.push({ id, codigo_catalogo: codigo });
    }
  });

  if (incompleto || items_codigo_catalogo.length === 0) {
    Toast.error('Completa el Nº ítem de todos los conceptos listados.');
    return;
  }

  const btn = document.getElementById('btn-confirmar-nro-item-oc');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generando OC…';
  }

  try {
    // Tras completar Nº ítem, sigue el modal de PO
    await intentarGenerarOC({
      cotizacion_id: _generarOcPendiente.cotizacion_id,
      items_codigo_catalogo,
    });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Guardar y continuar';
    }
  }
}

function cerrarModalCompletarNroItemOC() {
  const modal = document.getElementById('modal-completar-nro-item-oc');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = '';
  }
  _generarOcPendiente = null;
}

window.cerrarModalCompletarNroItemOC = cerrarModalCompletarNroItemOC;
window.confirmarCompletarNroItemYGenerarOC = confirmarCompletarNroItemYGenerarOC;
