// ── DETALLE DEL REQUERIMIENTO ─────────────────────────────────

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
    `${req.consecutivo} — ${req.tipo}`;

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
          <td>${req.departamento ? `${req.departamento}${req.departamento_codigo ? ` (${req.departamento_codigo})` : ''}` : '—'}</td></tr>
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
            const prov = (item.proveedor_num || item.proveedor_nombre)
              ? `<div style="font-size:10px; color:#64748b; margin-top:1px;">Prov: <strong>${item.proveedor_num || ''}${item.proveedor_nombre ? ' — ' + item.proveedor_nombre : ''}</strong></div>`
              : '';
            return `
            <tr>
              <td style="padding:4px 6px; border-bottom:1px solid #eee;"><strong>${item.codigo}</strong>${prov}</td>
              <td style="padding:4px 6px; border-bottom:1px solid #eee;">${item.descripcion}</td>
              <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right;">${parseFloat(item.cantidad).toLocaleString('es-MX')}</td>
              <td style="padding:4px 6px; border-bottom:1px solid #eee; text-align:right; color:#0d6efd; font-weight:500;">${p} ${m}</td>
            </tr>
          `;}).join('')}
        </tbody>
      </table>
    </div>` : ''}

    ${req.items_libres && req.items_libres.length > 0 ? `
    <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #f0ad4e">
      <div style="font-size:11px;color:#b45309;margin-bottom:3px">
        Ítems en texto libre (no existían en el catálogo)
        <span style="font-size:9px; color:#854d0e;">— (Este req debe ser SOLO de libres para cotización y alta en catálogo)</span>
      </div>
      <ul style="margin:0; padding-left:16px; font-size:12px;">
        ${req.items_libres.map(item => `
          <li style="margin-bottom:4px;">
            ${item.descripcion} — <strong>${parseFloat(item.cantidad).toLocaleString('es-MX')}</strong>${item.unidad ? ' ' + item.unidad : ''}
            ${UI.referenciaItemHtml(item, true)}
          </li>
        `).join('')}
      </ul>
    </div>` : ''}

    ${(req.estado === 'borrador' || req.estado === 'incompleto') && (Auth.getUsuario() && Auth.getUsuario().id === req.solicitante_id) ? `
    <div style="margin-top:12px;background:#FEF3C7;border:1px solid #F59E0B;border-radius:7px;padding:10px 12px;font-size:13px">
      <strong>📝 Borrador</strong> — Puedes editar este requerimiento antes de enviarlo a revisión.
    </div>` : ''}

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

  if (['contabilidad','admin'].includes(u.rol)) {
    if (req.estado === 'en_revision') {
      acciones.push({ label:'Aprobar',    estado:'aprobado',   clase:'btn-success' });
      acciones.push({ label:'Incompleto', estado:'incompleto', clase:'btn-outline' });
      acciones.push({ label:'Rechazar',   estado:'rechazado',  clase:'btn-danger'  });
    }
    if (req.estado === 'aprobado') {
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
                  const cantidad = Math.round(parseFloat(item.cantidad) || 1);
                  const precio = redondear2(parseFloat(item.precio_unitario) || 0);
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
            </table>`;
        }

        cotizacionHtml = `
          <div style="margin-top:30px; border:2px solid #166534; padding:15px; border-radius:6px;">
            <h3 style="color:#166534; margin:0 0 10px;">✓ Cotización Seleccionada</h3>
            <p style="margin:4px 0;"><strong>Proveedor:</strong> ${UI.labelProveedor(seleccionada)}</p>
            <p style="margin:4px 0;"><strong>Monto Total:</strong> <span style="font-size:18px; font-weight:700; color:#166534;">$${monto} ${seleccionada.moneda || 'MXN'}</span></p>
            ${itemsHtml}
            ${seleccionada.notas ? `<p style="margin-top:10px;"><strong>Notas:</strong> ${seleccionada.notas}</p>` : ''}
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
      </div>
      <div class="print-firma-col">
        <div class="print-firma-linea"></div>
        <div class="print-firma-label">Quien aprobó</div>
      </div>
    </div>`;

  const ventana = window.open('', '_blank', 'width=800,height=600');
  ventana.document.write(`
    <html>
      <head>
        <title>Requerimiento: ${requerimientoActual.consecutivo}</title>
        <link rel="stylesheet" href="css/app.css">
        <style>
          body { padding: 30px; background: white; color: black; font-family: Arial, sans-serif; }
          .no-print, .btn, #sidebar, #topbar { display: none !important; }
          .card { border: 1px solid #000; box-shadow: none; padding: 20px; }
          .print-firmas {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            margin-top: 48px;
            padding-top: 12px;
            page-break-inside: avoid;
          }
          .print-firma-col {
            flex: 1;
            text-align: center;
            min-width: 0;
          }
          .print-firma-linea {
            border-top: 1px solid #000;
            margin: 0 8px 8px;
            height: 1px;
          }
          .print-firma-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .4px;
            color: #374151;
            margin-bottom: 4px;
          }
          .print-firma-nombre {
            font-size: 12px;
            color: #111827;
          }
        </style>
      </head>
      <body>
        <h2>Detalle del Requerimiento: ${requerimientoActual.consecutivo}</h2>
        <hr>
        ${detalleElement.innerHTML}
        ${cotizacionHtml}
        ${firmasHtml}
      </body>
    </html>
  `);
  ventana.document.close();
  setTimeout(() => { ventana.print(); ventana.close(); }, 600);
}

function editarRequerimientoActual() {
  if (!requerimientoActual) return;
  abrirEditorRequerimiento(requerimientoActual);
}

// ── Generar OC ────────────────────────────────────────────────
async function generarOC() {
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
