// ── MODAL DE COTIZACIÓN ───────────────────────────────────────

let _proveedoresCotizacionCache = [];

function resolverProveedorCotizacionId() {
  const hidden = document.getElementById('cot_proveedor_id');
  const input  = document.getElementById('cot_proveedor_busqueda');
  if (!input) return null;

  const texto = input.value.trim();
  if (!texto) {
    if (hidden) hidden.value = '';
    return null;
  }

  const exacto = _proveedoresCotizacionCache.find(p => UI.labelProveedor(p) === texto);
  if (exacto) {
    if (hidden) hidden.value = exacto.id;
    return exacto.id;
  }

  const parcial = _proveedoresCotizacionCache.find(p => {
    const label = UI.labelProveedor(p).toLowerCase();
    return label.includes(texto.toLowerCase());
  });

  if (parcial) {
    input.value = UI.labelProveedor(parcial);
    if (hidden) hidden.value = parcial.id;
    return parcial.id;
  }

  if (hidden) hidden.value = '';
  return null;
}

function setProveedorCotizacion(proveedorId, labelTexto) {
  const hidden = document.getElementById('cot_proveedor_id');
  const input  = document.getElementById('cot_proveedor_busqueda');
  if (hidden) hidden.value = proveedorId || '';
  if (input) input.value = labelTexto || '';
}

function abrirModalCotizacion() {
  if (!puedeGestionarCotizaciones()) return Toast.error('No tienes permisos para crear cotizaciones');
  if (!requerimientoActual)          return Toast.error('No se encontró el requerimiento');

  cotizacionEditandoId = null;
  prepararModalCotizacion(requerimientoActual);
  document.getElementById('modal-cotizacion').style.display = 'flex';
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
    prellenarItemsCotizacionDesdeReq(req);
  }
}

function cerrarModalCotizacion() {
  document.getElementById('modal-cotizacion').style.display = 'none';
  document.getElementById('form-cotizacion').reset();
  setProveedorCotizacion('', '');
  document.querySelector('#tabla-items-cot tbody').innerHTML = '';
  cotizacionEditandoId = null;

  const modalTitle = document.querySelector('#modal-cotizacion .modal-title');
  if (modalTitle) modalTitle.textContent = 'Nueva Cotización';
}

// ── Guardar cotización ────────────────────────────────────────
async function guardarCotizacionOriginal() {
  if (!puedeGestionarCotizaciones()) return Toast.error('No tienes permisos para guardar cotizaciones');

  const reqId       = document.getElementById('cot_req_id').value;
  const proveedor_id = resolverProveedorCotizacionId();
  const fecha_envio  = document.getElementById('cot_fecha_envio').value;
  const moneda       = document.getElementById('cot_moneda').value;
  const notas        = document.getElementById('cot_notas').value.trim();

  if (!reqId)                    return Toast.error('Error: No se encontró el ID del requerimiento');
  if (!proveedor_id || !fecha_envio) return Toast.error('Proveedor y Fecha de Envío son obligatorios');

  try {
    let datos = {
      proveedor_id: parseInt(proveedor_id),
      moneda:       moneda || 'MXN',
      fecha_envio,
      notas:        notas || null,
      items:        []
    };

    if (datosCotizacionPendiente?.hora_envio) {
      datos.hora_envio = datosCotizacionPendiente.hora_envio;
    }

    const tbody           = document.querySelector('#tabla-items-cot tbody');
    const itemsDivVisible = document.getElementById('cotizacion-tipo-items').style.display !== 'none';
    const filasConContenido = tbody ? tbody.querySelectorAll('tr').length : 0;
    const usarItems       = (itemsDivVisible || filasConContenido > 0) && filasConContenido > 0;

    if (usarItems && tbody) {
      const calculo = calcularTotalItems();
      const rows    = tbody.querySelectorAll('tr');

      for (const row of rows) {
        const descripcion = row.querySelector('.item-desc').value.trim();
        if (!descripcion) continue;

        let cantidad        = parseFloat(row.querySelector('.item-cant').value) || 1;
        let precio_unitario = parseFloat(row.querySelector('.item-precio').value) || 0;

        cantidad        = Math.max(1, Math.round(cantidad));
        precio_unitario = redondear2(precio_unitario);

        const codigoCatalogo = row.querySelector('.item-codigo-catalogo')?.value.trim() || null;
        const catalogoIdRaw  = row.querySelector('.item-catalogo-id')?.value;
        const catalogo_id    = catalogoIdRaw ? parseInt(catalogoIdRaw, 10) : null;

        if (!catalogo_id && !codigoCatalogo) {
          return Toast.error(`El concepto "${descripcion}" requiere Nº ítem (código de catálogo). Ese código se guardará al formalizar en catálogo.`);
        }

        datos.items.push({
          descripcion,
          cantidad,
          unidad: row.querySelector('.item-unidad').value,
          precio_unitario,
          codigo_catalogo: codigoCatalogo,
          catalogo_id: Number.isFinite(catalogo_id) ? catalogo_id : null,
        });
      }

      if (datos.items.length === 0) return Toast.error('Debe agregar al menos un concepto en la lista de items');

      datos.monto_subtotal = calculo.total;
      datos.iva            = 0;
      datos.monto_total    = calculo.total;

    } else {
      let monto_total = redondear2(parseFloat(document.getElementById('cot_monto_total').value) || 0);
      if (monto_total <= 0) return Toast.error('Debe ingresar un monto total válido');

      datos.monto_total    = monto_total;
      datos.monto_subtotal = monto_total;
      datos.iva            = 0;
    }

    let response;
    if (cotizacionEditandoId) {
      response = await Api.put(`/cotizaciones/${cotizacionEditandoId}`, datos);
    } else {
      datos.requerimiento_id = parseInt(reqId);
      if (datosCotizacionPendiente?.hora_envio) datos.hora_envio = datosCotizacionPendiente.hora_envio;
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

// ── Modal de confirmación de envío ────────────────────────────
function prepararConfirmacionEnvioCotizacion() {
  if (cotizacionEditandoId) {
    guardarCotizacionOriginal();
    return;
  }

  const proveedor_id = resolverProveedorCotizacionId();
  const fecha_envio  = document.getElementById('cot_fecha_envio').value;

  if (!proveedor_id || !fecha_envio) return Toast.error('Proveedor y Fecha de Envío son obligatorios');

  datosCotizacionPendiente = {
    reqId:        document.getElementById('cot_req_id').value,
    proveedor_id: parseInt(proveedor_id),
    fecha_envio,
    moneda:       document.getElementById('cot_moneda').value || 'MXN',
    notas:        document.getElementById('cot_notas').value.trim() || null,
    hora_envio:   null,
  };

  const fechaSeleccionada = new Date(fecha_envio + 'T00:00:00');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const modal  = document.getElementById('modal-confirmar-envio-cotizacion');
  const body   = document.getElementById('confirm-envio-body');
  const footer = document.getElementById('confirm-envio-footer');
  const titulo = document.getElementById('confirm-envio-titulo');

  const esHoy    = fechaSeleccionada.getTime() === hoy.getTime();
  const esPasado = fechaSeleccionada < hoy;

  const reqActual           = requerimientoActual || {};
  const esLibres            = reqActual.items_libres && reqActual.items_libres.length > 0;
  const esServicioReq       = (reqActual.tipo || '').toUpperCase() === 'SERVICIOS';
  const permiteOpcionesEnvio = esLibres || esServicioReq;

  body.innerHTML   = '';
  footer.innerHTML = '';

  if (esPasado || !permiteOpcionesEnvio) {
    titulo.textContent = !permiteOpcionesEnvio ? 'Cotización para ítems de catálogo' : 'Fecha anterior a hoy';
    body.innerHTML = `
      <div class="alert alert-warning">
        <strong>Atención:</strong>
        ${!permiteOpcionesEnvio
          ? 'Este requerimiento usa ítems que ya están en el catálogo.<br>Se guardará la cotización como registro interno, <strong>pero no se enviará correo</strong> al proveedor.'
          : 'La fecha seleccionada ya pasó.<br><br>Se guardará el registro de la cotización, <strong>pero no se enviará ningún correo</strong> al proveedor.'}
      </div>
      <p>¿Deseas continuar de todas formas?</p>`;
    footer.innerHTML = `
      <button class="btn btn-outline" onclick="cerrarModalConfirmacionEnvio()">Cancelar</button>
      <button class="btn btn-primary" onclick="confirmarGuardarSinEnvio()">Guardar sin enviar correo</button>`;

  } else if (esHoy) {
    titulo.textContent = '¿Enviar cotización ahora?';
    body.innerHTML = `
      <p>La fecha de envío es <strong>hoy</strong>.</p>
      <p>¿Deseas enviar esta solicitud de cotización al proveedor de inmediato?</p>`;
    footer.innerHTML = `
      <button class="btn btn-outline" onclick="cerrarModalConfirmacionEnvio()">Cancelar</button>
      <button class="btn btn-primary" onclick="confirmarEnvioInmediato()">Enviar ahora</button>`;

  } else {
    const fechaFormateada = fechaSeleccionada.toLocaleDateString('es-MX', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    titulo.textContent = 'Programar envío de cotización';
    body.innerHTML = `
      <p>Has seleccionado enviar la cotización el <strong>${fechaFormateada}</strong>.</p>
      <div class="form-group">
        <label class="form-label">¿A qué hora deseas que se envíe?</label>
        <input type="time" id="hora-envio-programado" class="form-control" value="09:00">
        <small class="text-muted">Se enviará automáticamente a la hora indicada (requiere que el sistema esté activo).</small>
      </div>`;
    footer.innerHTML = `
      <button class="btn btn-outline" onclick="cerrarModalConfirmacionEnvio()">Cancelar</button>
      <button class="btn btn-primary" onclick="confirmarProgramarEnvioFuturo()">Programar envío</button>`;
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
  await guardarCotizacionOriginal();
}

async function confirmarGuardarSinEnvio() {
  cerrarModalConfirmacionEnvio();
  await guardarCotizacionOriginal();
}

async function confirmarProgramarEnvioFuturo() {
  const horaInput = document.getElementById('hora-envio-programado');
  if (horaInput && datosCotizacionPendiente) {
    datosCotizacionPendiente.hora_envio = horaInput.value;
  }
  cerrarModalConfirmacionEnvio();
  await guardarCotizacionOriginal();
}

// ── Helpers del modal ─────────────────────────────────────────
async function cargarProveedoresEnModal() {
  try {
    const proveedores = await Api.get('/proveedores?activos=true');
    _proveedoresCotizacionCache = proveedores || [];

    const datalist = document.getElementById('cot_proveedores_list');
    if (datalist) {
      datalist.innerHTML = '';
      _proveedoresCotizacionCache.forEach(p => {
        const opt = document.createElement('option');
        opt.value = UI.labelProveedor(p);
        datalist.appendChild(opt);
      });
    }

    const busqueda = document.getElementById('cot_proveedor_busqueda');
    if (busqueda && !busqueda.dataset.boundResolver) {
      busqueda.dataset.boundResolver = 'true';
      busqueda.addEventListener('change', resolverProveedorCotizacionId);
      busqueda.addEventListener('blur', resolverProveedorCotizacionId);
    }
  } catch (e) {
    console.error('Error cargando proveedores:', e);
  }
}

function configurarToggleDesglose(requerimiento, cotizacion = null) {
  const checkbox  = document.getElementById('cot_desglosar_items');
  const simpleDiv = document.getElementById('cotizacion-tipo-simple');
  const itemsDiv  = document.getElementById('cotizacion-tipo-items');
  const tbody     = document.querySelector('#tabla-items-cot tbody');

  if (!checkbox) return;

  const newCheckbox = checkbox.cloneNode(true);
  checkbox.parentNode.replaceChild(newCheckbox, checkbox);

  const tieneItems         = cotizacion && cotizacion.items && cotizacion.items.length > 0;
  const forzarItemsPorTipo = ['PARTES', 'SERVICIOS'].includes(requerimiento.tipo || '');

  newCheckbox.checked = tieneItems || forzarItemsPorTipo;

  if (newCheckbox.checked) {
    simpleDiv.style.display = 'none';
    itemsDiv.style.display  = 'block';
  } else {
    simpleDiv.style.display = 'block';
    itemsDiv.style.display  = 'none';
  }

  newCheckbox.addEventListener('change', () => {
    if (newCheckbox.checked) {
      simpleDiv.style.display = 'none';
      itemsDiv.style.display  = 'block';

      if (tbody.children.length === 0) {
        const montoActual = parseFloat(document.getElementById('cot_monto_total').value) || 0;
        if (montoActual > 0) {
          tbody.appendChild(crearFilaItem({ descripcion: 'Concepto general / Servicio', cantidad: 1, unidad: 'servicio', precio_unitario: montoActual }));
          document.getElementById('cot_monto_total').value = '';
        } else {
          agregarItemCotizacion();
        }
        calcularTotalItems();
      }
    } else {
      itemsDiv.style.display  = 'none';
      simpleDiv.style.display = 'block';

      const totalCalc = calcularTotalItems();
      if (totalCalc && totalCalc.total > 0) {
        document.getElementById('cot_monto_total').value = totalCalc.total.toFixed(2);
      }
      tbody.innerHTML = '';
    }
  });
}

function configurarModalSegunTipo(requerimiento) {
  document.getElementById('cotizacion-tipo-simple').style.display = 'block';
  document.getElementById('cotizacion-tipo-items').style.display  = 'none';
}

function prellenarItemsCotizacionDesdeReq(req) {
  const tbody     = document.querySelector('#tabla-items-cot tbody');
  const itemsDiv  = document.getElementById('cotizacion-tipo-items');
  const simpleDiv = document.getElementById('cotizacion-tipo-simple');
  const checkbox  = document.getElementById('cot_desglosar_items');

  if (!tbody || !itemsDiv || !simpleDiv) return;
  if (cotizacionEditandoId) return;

  const tieneLibres   = req.items_libres && req.items_libres.length > 0;
  const tieneCatalogo = req.items && req.items.length > 0;
  if (!tieneLibres && !tieneCatalogo) return;

  simpleDiv.style.display = 'none';
  itemsDiv.style.display  = 'block';
  if (checkbox) checkbox.checked = true;

  tbody.innerHTML = '';

  const itemsFuente = tieneLibres
    ? req.items_libres.map(l => ({ descripcion: l.descripcion || '', cantidad: Math.max(1, Math.round(l.cantidad || 1)), unidad: l.unidad || 'pieza', precio_unitario: '' }))
    : req.items.map(i => ({
        descripcion: i.descripcion || i.codigo || '',
        cantidad: Math.max(1, Math.round(i.cantidad || 1)),
        unidad: i.unidad || 'pieza',
        precio_unitario: i.costo_referencia != null ? i.costo_referencia : '',
        codigo_catalogo: i.codigo || '',
        catalogo_id: i.catalogo_id || null,
        proveedor_num: i.proveedor_num || '',
        proveedor_nombre: i.proveedor_nombre || ''
      }));

  itemsFuente.forEach(data => tbody.appendChild(crearFilaItem(data)));
  calcularTotalItems();
}

function crearFilaItem(itemData = {}) {
  const row = document.createElement('tr');
  row.className = 'item-row';

  const provInfo = (itemData.proveedor_num || itemData.proveedor_nombre)
    ? `<div style="font-size:10px; color:#64748b; margin-top:2px; line-height:1;">Prov: <strong>${itemData.proveedor_num || ''}${itemData.proveedor_nombre ? ' — ' + itemData.proveedor_nombre : ''}</strong></div>`
    : '';

  const codigoCatalogo = (itemData.codigo_catalogo || itemData.codigo || '').replace(/"/g, '&quot;');

  row.innerHTML = `
    <td style="vertical-align: top;">
      <input type="text" class="form-control item-codigo-catalogo" placeholder="Nº ítem *" value="${codigoCatalogo}" title="Nº ítem — se guardará como código en el catálogo" ${itemData.catalogo_id ? 'readonly' : ''}>
      <input type="hidden" class="item-catalogo-id" value="${itemData.catalogo_id || ''}">
    </td>
    <td style="vertical-align: top;">
      <input type="text" class="form-control item-desc" placeholder="Ej: Tornillos hexagonales 1/2" value="${itemData.descripcion || ''}" required>
      ${provInfo}
    </td>
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
    </td>`;

  const unidadSelect = row.querySelector('.item-unidad');
  if (unidadSelect && itemData.unidad) unidadSelect.value = itemData.unidad;

  const cantInput   = row.querySelector('.item-cant');
  const precioInput = row.querySelector('.item-precio');

  if (cantInput) {
    cantInput.value = Math.max(1, Math.round(parseFloat(cantInput.value) || 1));
    cantInput.addEventListener('blur', () => {
      cantInput.value = Math.max(1, Math.round(parseFloat(cantInput.value) || 1));
      calcularTotalItems();
    });
  }
  if (precioInput) {
    if (itemData.precio_unitario !== undefined && itemData.precio_unitario !== '' && itemData.precio_unitario !== null) {
      precioInput.value = redondear2(parseFloat(itemData.precio_unitario) || 0);
    }
    precioInput.addEventListener('blur', () => {
      precioInput.value = redondear2(parseFloat(precioInput.value) || 0);
      calcularTotalItems();
    });
  }

  row.querySelectorAll('input').forEach(input => input.addEventListener('input', calcularTotalItems));

  // Delegación para eliminar (se adjunta al tbody una sola vez)
  const itemsTbody = document.querySelector('#tabla-items-cot tbody');
  if (itemsTbody && !itemsTbody.dataset.delegateAttached) {
    itemsTbody.dataset.delegateAttached = 'true';
    window.delegate(itemsTbody, 'button[data-action="eliminar-item"]', 'click', (e, btn) => {
      btn.closest('tr').remove();
      calcularTotalItems();
    });
  }

  return row;
}

function agregarItemCotizacion() {
  const tbody = document.querySelector('#tabla-items-cot tbody');
  tbody.appendChild(crearFilaItem());
  calcularTotalItems();
}

function redondear2(n) {
  const num = parseFloat(n) || 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function calcularTotalItems() {
  let subtotal = 0;
  document.querySelectorAll('#tabla-items-cot tbody tr').forEach(row => {
    const cantidad = Math.round(parseFloat(row.querySelector('.item-cant').value) || 0);
    const precio   = redondear2(parseFloat(row.querySelector('.item-precio').value) || 0);
    const sub      = redondear2(cantidad * precio);
    row.querySelector('.item-subtotal').textContent = sub.toFixed(2);
    subtotal += sub;
  });

  const total = redondear2(subtotal);
  const totalEl = document.getElementById('cot-total-final');
  if (totalEl) totalEl.textContent = total.toFixed(2);

  return { subtotal: total, iva: 0, total };
}
