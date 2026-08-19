// ── COTIZACIONES ──────────────────────────────────────────────

async function cargarCotizaciones(reqId) {
  const contenedor = document.getElementById('lista-cotizaciones');
  UI.spinner(contenedor);

  try {
    const response     = await Api.get(`/cotizaciones/${reqId}`);
    const cotizaciones = Array.isArray(response) ? response :
                         (response.data && Array.isArray(response.data) ? response.data : []);

    if (cotizaciones.length === 0) {
      contenedor.innerHTML = `
        <p class="text-muted text-center py-4">
          Aún no hay cotizaciones registradas para este requerimiento.
        </p>`;
      return;
    }

    const seleccionadaSinPdf = cotizaciones.find(
      (c) => (c.seleccionada === 1 || c.estado === 'seleccionada') && !c.archivo_url
    );

    let html = '';
    if (seleccionadaSinPdf) {
      html += `
        <div style="font-size:12px; background:#fffbeb; color:#92400e; border:1px solid #fde68a; border-radius:6px; padding:8px 12px; margin-bottom:10px;">
          <strong>Recomendación:</strong> la cotización seleccionada no tiene PDF adjunto. Se recomienda agregar el documento de respaldo del proveedor.
        </div>`;
    }

    html += `
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Proveedor</th>
            <th class="text-end">Monto Total</th>
            <th>Estado</th>
            <th>Correo</th>
            <th>Fecha Envio</th>
            <th>Adjunto</th>
            <th class="text-center">Acción</th>
          </tr>
        </thead>
        <tbody>`;

    cotizaciones.forEach(c => {
      const monto    = parseFloat(c.monto_total || 0).toLocaleString('es-MX');
      const estado   = c.seleccionada === 1 || c.estado === 'seleccionada'
        ? `<span class="badge bg-success">Seleccionada</span>`
        : (c.estado
            ? `<span class="badge bg-secondary">${c.estado}</span>`
            : `<span class="badge bg-warning">Pendiente</span>`);

      const correoEnviado = !!(c.email_sent_at);
      const correoBadge = correoEnviado
        ? `<span class="badge" style="background:#166534;color:#fff;" title="Enviado: ${UI.fecha(c.email_sent_at)}">✉ Enviado</span>
           <div class="text-muted" style="font-size:10px;margin-top:2px;">${UI.fecha(c.email_sent_at)}</div>`
        : `<span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;" title="Aún no se ha enviado el correo de cotización">○ Sin enviar</span>`;

      const tieneItems = c.items && c.items.length > 0;
      const desgloseBtn = tieneItems
        ? `<button class="btn btn-sm btn-link p-0 ms-2" data-cot-action="toggle-desglose" data-cot-id="${c.id}" title="Ver desglose de conceptos">▼ Desglose</button>`
        : '';

      const esGestor          = puedeGestionarCotizaciones();
      const reqParaCot        = requerimientoActual || {};
      const puedeRfq = typeof reqNecesitaCotizacion === 'function'
        ? reqNecesitaCotizacion(reqParaCot)
        : !!(reqParaCot.requiere_cotizacion
          || (reqParaCot.items_libres && reqParaCot.items_libres.length)
          || (reqParaCot.tipo || '').toUpperCase() === 'SERVICIOS');
      const mostrarBotonEnviar = esGestor && puedeRfq;

      const nombreArchivo = c.archivo_url
        ? (String(c.archivo_url).split('/').pop() || 'Archivo')
        : '';
      const adjuntoHtml = c.archivo_url
        ? `<a href="${c.archivo_url}" target="_blank" class="btn btn-sm btn-outline" title="Ver adjunto">📎 Ver</a>
           <div class="text-muted" style="font-size:10px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${UI.esc(nombreArchivo)}">${UI.esc(nombreArchivo)}</div>`
        : `<span class="text-muted small">Sin archivo</span>
           <span class="text-warning small" style="display:block;font-size:10px;">Se recomienda adjuntar</span>`;

      html += `
        <tr data-cot-id="${c.id}">
          <td><strong>${UI.labelProveedor(c) || 'Sin proveedor'}</strong></td>
          <td class="text-end fw-600">
            $${monto} ${c.moneda || 'MXN'}
            ${desgloseBtn}
          </td>
          <td>${estado}</td>
          <td>${correoBadge}</td>
          <td class="text-muted">${c.fecha_envio ? UI.fecha(c.fecha_envio) : '—'}</td>
          <td>${adjuntoHtml}</td>
          <td class="text-center">
            ${c.seleccionada !== 1 && esGestor ? `
              <div class="d-flex gap-1 justify-content-center flex-wrap" style="font-size:0.75rem;">
                <button class="btn btn-success btn-sm px-1 py-0" data-cot-action="seleccionar" data-cot-id="${c.id}" title="Seleccionar esta cotización">✓</button>
                <button class="btn btn-outline btn-sm px-1 py-0" data-cot-action="editar" data-cot-id="${c.id}" title="Editar proveedor / moneda">✎</button>
                <button class="btn btn-warning btn-sm px-1 py-0" data-cot-action="adjuntar-pdf" data-cot-id="${c.id}" title="Adjuntar archivo (PDF, Word, Excel…)">📎</button>
                ${mostrarBotonEnviar ? `<button class="btn btn-primary btn-sm px-1 py-0" data-cot-action="enviar-correo" data-cot-id="${c.id}" data-cot-reenviar="${c.email_sent_at ? '1' : '0'}" title="${c.email_sent_at ? 'Reenviar solicitud por correo' : 'Enviar solicitud por correo'}">✉</button>` : ''}
                <button class="btn btn-danger btn-sm px-1 py-0" data-cot-action="eliminar" data-cot-id="${c.id}" title="Eliminar cotización">×</button>
              </div>`
            : c.seleccionada === 1 ? `
              <div style="display:flex; flex-direction:column; align-items:center; gap:3px; font-size:0.72rem;">
                <span class="text-success fw-600">✓ Seleccionada</span>
                <div class="d-flex gap-1 justify-content-center flex-wrap">
                  ${esGestor ? `
                    <button class="btn btn-warning btn-sm px-1 py-0"
                            data-cot-action="adjuntar-pdf" data-cot-id="${c.id}"
                            title="Adjuntar archivo (PDF, Word, Excel…)">
                      📎 ${c.archivo_url ? 'Cambiar archivo' : 'Adjuntar'}
                    </button>` : ''}
                  ${esGestor ? `
                    <button class="btn btn-outline btn-sm px-1 py-0"
                            data-cot-action="editar" data-cot-id="${c.id}"
                            title="Cambiar proveedor o moneda">
                      ✎ Editar
                    </button>
                    <button class="btn btn-danger btn-sm px-1 py-0"
                            data-cot-action="deseleccionar" data-cot-id="${c.id}"
                            title="Quitar selección">
                      Deseleccionar
                    </button>` : ''}
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

// Delegación de acciones de cotizaciones (una sola vez)
const listaCotizaciones = document.getElementById('lista-cotizaciones');
if (listaCotizaciones && !listaCotizaciones.dataset.delegateAttached) {
  listaCotizaciones.dataset.delegateAttached = 'true';

  window.delegate(listaCotizaciones, 'button[data-cot-action]', 'click', (e, btn) => {
    const action = btn.dataset.cotAction;
    const cotId  = parseInt(btn.dataset.cotId);
    const reqId  = requerimientoActual?.id;

    if (!cotId || !reqId) return;

    if (action === 'seleccionar')     seleccionarCotizacion(cotId, reqId);
    if (action === 'editar')          editarCotizacion(cotId);
    if (action === 'eliminar')        eliminarCotizacion(cotId);
    if (action === 'adjuntar-pdf')    adjuntarPdfACotizacion(cotId);
    if (action === 'deseleccionar')   deseleccionarCotizacion(cotId, reqId);
    if (action === 'enviar-correo')   enviarCorreoCotizacion(cotId, btn.dataset.cotReenviar === '1');
    if (action === 'toggle-desglose') toggleDesgloseCotizacion(btn, cotId);
  });
}

function toggleDesgloseCotizacion(btn, cotizacionId) {
  const mainRow      = btn.closest('tr');
  const existingDetail = mainRow.nextElementSibling;

  if (existingDetail && existingDetail.classList.contains('cot-desglose-row')) {
    existingDetail.remove();
    btn.textContent = '▼ Desglose';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Cargando...';

  Api.get(`/cotizaciones/detalle/${cotizacionId}`)
    .then(resp => {
      const c     = resp.data || resp;
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
        const cantidad = Math.round(parseFloat(it.cantidad) || 0);
        const precio   = redondear2(parseFloat(it.precio_unitario) || 0);
        const sub      = redondear2(cantidad * precio);
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

      granTotal  = redondear2(granTotal);
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
    .finally(() => { btn.disabled = false; });
}

async function seleccionarCotizacion(cotizacionId, requerimientoId) {
  if (!puedeGestionarCotizaciones()) return Toast.error('No tienes permisos para seleccionar cotizaciones');
  if (!confirm('¿Marcar esta cotización como la seleccionada?\nLas demás se marcarán como rechazadas.')) return;

  try {
    await Api.post(`/cotizaciones/${cotizacionId}/seleccionar`, { requerimiento_id: requerimientoId });

    let sinPdf = true;
    try {
      const det = await Api.get(`/cotizaciones/detalle/${cotizacionId}`);
      const cot = det?.data || det;
      sinPdf = !cot?.archivo_url;
    } catch (_) { /* ignorar */ }

    Toast.success('Cotización seleccionada correctamente');
    if (sinPdf) {
      Toast.warning('Se recomienda adjuntar el PDF de respaldo del proveedor a esta cotización.', 7000);
    }
    abrirDetalle(requerimientoId);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al seleccionar la cotización');
  }
}

async function deseleccionarCotizacion(cotizacionId, requerimientoId) {
  if (!puedeGestionarCotizaciones()) return Toast.error('No tienes permisos para deseleccionar cotizaciones');
  if (!confirm('⚠️ ¿Estás seguro de deseleccionar esta cotización?\n\nEsto quitará la selección actual y permitirá elegir otra cotización.')) return;

  try {
    await Api.post(`/cotizaciones/${cotizacionId}/deseleccionar`, { requerimiento_id: requerimientoId });
    Toast.success('Cotización deseleccionada correctamente');
    abrirDetalle(requerimientoId);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al deseleccionar la cotización');
  }
}

async function enviarCorreoCotizacion(cotizacionId, esReenvio = false) {
  if (!puedeGestionarCotizaciones()) return Toast.error('No tienes permisos para enviar correos de cotización');

  const modal = document.getElementById('modal-idioma-correo-cot');
  if (!modal) {
    // Fallback si no hay modal en el DOM
    const idioma = confirm('¿Enviar el correo en inglés?\n\nAceptar = English\nCancelar = Español') ? 'en' : 'es';
    try {
      await Api.post(`/cotizaciones/${cotizacionId}/enviar`, { idioma });
      Toast.success((esReenvio ? 'Cotización reenviada' : 'Cotización enviada') + (idioma === 'en' ? ' (English)' : ' (Español)'));
      if (requerimientoActual?.id) await abrirDetalle(requerimientoActual.id);
      else await cargarCotizaciones(requerimientoActual.id);
    } catch (err) {
      Toast.error(err.mensaje || 'No se pudo enviar el correo de cotización');
    }
    return;
  }

  window._cotizacionEnvioPendiente = { id: cotizacionId, reenvio: esReenvio };
  const titulo = document.getElementById('idioma-correo-titulo');
  if (titulo) {
    titulo.textContent = esReenvio
      ? 'Reenviar solicitud de cotización'
      : 'Enviar solicitud de cotización';
  }
  const sel = document.getElementById('idioma-correo-select');
  if (sel) sel.value = 'es';
  modal.style.display = 'flex';
  modal.classList.add('show');
}

function cerrarModalIdiomaCorreo() {
  const modal = document.getElementById('modal-idioma-correo-cot');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }
  window._cotizacionEnvioPendiente = null;
}

async function confirmarEnvioCorreoConIdioma() {
  const pend = window._cotizacionEnvioPendiente;
  if (!pend?.id) return cerrarModalIdiomaCorreo();
  const sel = document.getElementById('idioma-correo-select');
  const idioma = (sel?.value || 'es').toString().toLowerCase().startsWith('en') ? 'en' : 'es';
  const btn = document.getElementById('btn-confirmar-idioma-correo');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    await Api.post(`/cotizaciones/${pend.id}/enviar`, { idioma });
    Toast.success(
      (pend.reenvio ? 'Cotización reenviada' : 'Cotización enviada')
      + (idioma === 'en' ? ' (English)' : ' (Español)')
    );
    cerrarModalIdiomaCorreo();
    // Recargar detalle para refrescar "Último estatus" (nota con fecha de envío)
    if (requerimientoActual?.id) await abrirDetalle(requerimientoActual.id);
    else await cargarCotizaciones(requerimientoActual?.id);
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudo enviar el correo de cotización');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar correo'; }
  }
}

window.cerrarModalIdiomaCorreo = cerrarModalIdiomaCorreo;
window.confirmarEnvioCorreoConIdioma = confirmarEnvioCorreoConIdioma;

async function adjuntarPdfACotizacion(cotizacionId) {
  if (!puedeGestionarCotizaciones()) return Toast.error('No tienes permisos para adjuntar archivos a cotizaciones');
  cotizacionParaPdfId = cotizacionId;

  document.getElementById('pdf-file-input').value  = '';
  document.getElementById('pdf-url-input').value   = '';
  document.getElementById('pdf-error').style.display = 'none';
  document.getElementById('pdf-upload-progress').style.display = 'none';

  cambiarTabPdf('subir');
  const modal = document.getElementById('modal-adjuntar-pdf');
  if (modal) {
    const title = modal.querySelector('.modal-title');
    if (title) title.textContent = 'Adjuntar archivo a la cotización';
  }
  document.getElementById('modal-adjuntar-pdf').style.display = 'flex';
}

function cambiarTabPdf(tab) {
  const seccionSubir = document.getElementById('seccion-subir');
  const seccionUrl   = document.getElementById('seccion-url');
  const tabSubir     = document.getElementById('tab-subir');
  const tabUrl       = document.getElementById('tab-url');

  if (tab === 'subir') {
    seccionSubir.style.display = 'block';
    seccionUrl.style.display   = 'none';
    tabSubir.style.borderBottom = '3px solid #185FA5';
    tabUrl.style.borderBottom   = 'none';
  } else {
    seccionSubir.style.display = 'none';
    seccionUrl.style.display   = 'block';
    tabSubir.style.borderBottom = 'none';
    tabUrl.style.borderBottom   = '3px solid #185FA5';
  }
}

function cerrarModalAdjuntarPdf() {
  document.getElementById('modal-adjuntar-pdf').style.display = 'none';
  cotizacionParaPdfId = null;
}

async function guardarPdfCotizacion() {
  if (!cotizacionParaPdfId) return;

  const errorDiv = document.getElementById('pdf-error');
  errorDiv.style.display = 'none';

  const seccionSubirVisible = document.getElementById('seccion-subir').style.display !== 'none';

  try {
    if (seccionSubirVisible) {
      const fileInput = document.getElementById('pdf-file-input');
      if (!fileInput.files.length) {
        errorDiv.textContent = 'Por favor selecciona un archivo (PDF, Word, Excel, imagen…)';
        errorDiv.style.display = 'block';
        return;
      }

      const formData = new FormData();
      // Backend acepta "archivo" o "pdf" (compat)
      formData.append('archivo', fileInput.files[0]);

      const progressContainer = document.getElementById('pdf-upload-progress');
      const progressBar       = document.getElementById('pdf-progress-bar');
      const progressText      = document.getElementById('pdf-progress-text');

      progressContainer.style.display = 'block';
      progressBar.style.width  = '0%';
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
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      let data = {};
      try { data = await response.json(); } catch (e) {}

      if (!response.ok) {
        throw { mensaje: data.message || data.mensaje || 'Error al subir el archivo' };
      }

      Toast.success('Archivo subido correctamente');
      cerrarModalAdjuntarPdf();
      cargarCotizaciones(requerimientoActual.id);

    } else {
      const urlInput = document.getElementById('pdf-url-input').value.trim();
      if (!urlInput) {
        errorDiv.textContent = 'Por favor ingresa una URL válida';
        errorDiv.style.display = 'block';
        return;
      }

      await Api.put(`/cotizaciones/${cotizacionParaPdfId}`, { archivo_url: urlInput });
      Toast.success('URL del archivo guardada correctamente');
      cerrarModalAdjuntarPdf();
      cargarCotizaciones(requerimientoActual.id);
    }

  } catch (err) {
    errorDiv.textContent = err.mensaje || err.message || 'Error al guardar el archivo';
    errorDiv.style.display = 'block';
  }
}

async function editarCotizacion(cotizacionId) {
  if (!puedeGestionarCotizaciones()) return Toast.error('No tienes permisos para editar cotizaciones');

  try {
    const resp = await Api.get(`/cotizaciones/detalle/${cotizacionId}`);
    const c    = resp.data || resp;

    if (!c) return Toast.error('No se pudo cargar la cotización');
    const tieneOc = !!(requerimientoActual?.oc_id || requerimientoActual?.orden_compra_id);
    if ((c.seleccionada === 1 || c.estado === 'seleccionada') && tieneOc) {
      return Toast.error('No se puede editar la cotización: ya hay una OC generada');
    }

    cotizacionEditandoId = c.id;

    document.getElementById('cot_req_id').value = c.requerimiento_id;
    document.getElementById('form-cotizacion').reset();

    const modalTitle = document.querySelector('#modal-cotizacion .modal-title');
    if (modalTitle) modalTitle.textContent = 'Editar Cotización';

    await cargarProveedoresEnModal();

    const provLabel = UI.labelProveedor(c) || '';
    if (typeof setProveedorCotizacion === 'function') {
      setProveedorCotizacion(c.proveedor_id || '', provLabel);
    } else {
      const hidden = document.getElementById('cot_proveedor_id');
      const busq   = document.getElementById('cot_proveedor_busqueda');
      if (hidden) hidden.value = c.proveedor_id || '';
      if (busq) busq.value = provLabel;
    }
    document.getElementById('cot_fecha_envio').value   = c.fecha_envio ? c.fecha_envio.substring(0, 10) : '';
    document.getElementById('cot_moneda').value        = c.moneda || 'MXN';
    document.getElementById('cot_notas').value         = c.notas || '';

    const simpleDiv = document.getElementById('cotizacion-tipo-simple');
    const itemsDiv  = document.getElementById('cotizacion-tipo-items');
    const tbody     = document.querySelector('#tabla-items-cot tbody');
    tbody.innerHTML = '';

    const tieneItems = c.items && c.items.length > 0;

    if (tieneItems) {
      simpleDiv.style.display = 'none';
      itemsDiv.style.display  = 'block';

      c.items.forEach(item => tbody.appendChild(crearFilaItem(item)));

      calcularTotalItems();
    } else {
      simpleDiv.style.display = 'block';
      itemsDiv.style.display  = 'none';
      document.getElementById('cot_monto_total').value = c.monto_total || '';
    }

    configurarToggleDesglose(requerimientoActual, c);
    document.getElementById('modal-cotizacion').style.display = 'flex';

  } catch (err) {
    console.error('Error al cargar cotización para editar:', err);
    Toast.error(err.mensaje || 'Error al cargar la cotización');
    cotizacionEditandoId = null;
  }
}

async function eliminarCotizacion(cotizacionId) {
  if (!puedeGestionarCotizaciones()) return Toast.error('No tienes permisos para eliminar cotizaciones');
  if (!confirm('¿Eliminar esta cotización?\nEsta acción no se puede deshacer.')) return;

  try {
    await Api.delete(`/cotizaciones/${cotizacionId}`);
    Toast.success('Cotización eliminada');
    cargarCotizaciones(requerimientoActual.id);
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudo eliminar la cotización (¿está seleccionada?)');
  }
}
