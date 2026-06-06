// ── ÍTEMS DEL CATÁLOGO ────────────────────────────────────────

const reqTipoSelect = document.getElementById('req-tipo');
if (reqTipoSelect) {
  reqTipoSelect.addEventListener('change', () => {
    const seccion    = document.getElementById('seccion-items-catalogo');
    const selector   = document.getElementById('selector-items-nuevos');
    const provWrapper = document.getElementById('filtro-proveedor-wrapper');
    const provSelect  = document.getElementById('filtro-proveedor-catalogo');

    if (seccion)    seccion.style.display    = reqTipoSelect.value ? 'block' : 'none';
    if (selector)   selector.style.display   = reqTipoSelect.value ? 'block' : 'none';
    if (provWrapper) provWrapper.style.display = reqTipoSelect.value ? '' : 'none';
    if (provSelect && !reqTipoSelect.value) provSelect.value = '';

    if (reqTipoSelect.value) {
      window.requerimientoItemsSeleccionados = [];
      window.requerimientoItemsLibres = [];
      renderItemsSeleccionados();
      renderLibresResumen();

      const checkbox = document.getElementById('usar-items-nuevos');
      if (checkbox) checkbox.checked = false;

      const seccion2 = document.getElementById('seccion-items-catalogo');
      if (seccion2) seccion2.style.opacity = '1';

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
      </div>`;
  });
  contenedor.innerHTML = html;
}

window.actualizarCantidadItem = function(index, nuevaCantidad) {
  if (window.requerimientoItemsSeleccionados[index]) {
    window.requerimientoItemsSeleccionados[index].cantidad =
      Math.max(1, Math.round(parseFloat(nuevaCantidad) || 1));
  }
};

window.eliminarItemSeleccionado = function(index) {
  window.requerimientoItemsSeleccionados.splice(index, 1);
  renderItemsSeleccionados();
};

async function buscarEnCatalogo() {
  const input     = document.getElementById('busqueda-catalogo');
  const contenedor = document.getElementById('resultados-catalogo');
  if (!input || !contenedor) return;

  const busqueda  = input.value.trim();
  const tipo      = document.getElementById('req-tipo')?.value;
  const provSelect = document.getElementById('filtro-proveedor-catalogo');

  if (!tipo) {
    Toast.info('Primero selecciona el Tipo de requerimiento');
    return;
  }

  contenedor.innerHTML = '<div style="padding:6px; font-size:12px; color:#666;">Buscando...</div>';

  try {
    const params = new URLSearchParams({ tipo, busqueda, soloActivos: 'true' });
    if (provSelect && provSelect.value) params.set('proveedor_id', provSelect.value);

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
            ${item.costo_referencia != null ? `<span style="color:#0d6efd; font-size:11px; font-weight:600; margin-left:4px;">${parseFloat(item.costo_referencia).toFixed(2)} ${item.moneda || 'MXN'}</span>` : ''}
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
          ` : `<span style="color:#28a745; font-size:11px; flex-shrink:0;">✓ Agregado</span>`}
        </div>`;
    });

    html += `
      <div style="padding:3px 4px; font-size:9.5px; color:#854d0e; background:#fffbeb; margin-top:3px; border-radius:3px; border:1px solid #fde047;">
        ¿Ninguno coincide?
        <a href="#" onclick="document.getElementById('usar-items-nuevos').checked=true; toggleModoItemsNuevos(true); return false;" style="font-weight:600; color:#b45309; text-decoration:underline;">Agregar como ítem nuevo</a>
        o
        <a href="#" onclick="crearRequerimientoParaAltaCatalogoFromCurrent(); return false;" style="font-weight:600; color:#b45309; text-decoration:underline;">crear req separado</a>.
      </div>`;

    contenedor.innerHTML = html;

    const addNewHint = document.createElement('div');
    addNewHint.style.cssText = 'margin-top:4px; font-size:10px;';
    addNewHint.innerHTML = `<button type="button" class="btn btn-sm btn-outline" style="font-size:10px;" onclick="document.getElementById('usar-items-nuevos').checked=true; toggleModoItemsNuevos(true);">+ No está en catálogo (agregar como nuevo)</button>`;
    contenedor.appendChild(addNewHint);

  } catch (err) {
    contenedor.innerHTML = '<div style="padding:6px; font-size:12px; color:#c00;">Error al buscar.</div>';
  }
}

window.agregarItemConCantidad = function(catalogo_id, codigo, descripcion, costo, moneda = 'MXN') {
  const tieneLibres = window.requerimientoItemsLibres && window.requerimientoItemsLibres.length > 0;

  if (tieneLibres) {
    if (!confirm('Ya tienes ítems nuevos/libres.\n\n¿Limpiarlos y volver a usar solo catálogo?')) return;
    window.requerimientoItemsLibres = [];
    renderLibresResumen();
    const libresModal = document.getElementById('modal-req-libres');
    if (libresModal && libresModal.style.display !== 'none') renderItemsLibresModal();
    const checkbox = document.getElementById('usar-items-nuevos');
    if (checkbox) checkbox.checked = false;
  }

  if (!window.requerimientoItemsSeleccionados) window.requerimientoItemsSeleccionados = [];
  if (window.requerimientoItemsSeleccionados.find(i => i.catalogo_id === catalogo_id)) return;

  const qtyInput  = document.getElementById(`qty-${catalogo_id}`);
  const cantidad  = qtyInput ? parseFloat(qtyInput.value) || 1 : 1;

  window.requerimientoItemsSeleccionados.push({
    catalogo_id,
    codigo,
    descripcion,
    costo_referencia: costo != null ? parseFloat(costo) : null,
    moneda: moneda || 'MXN',
    cantidad: Math.max(1, Math.round(cantidad))
  });

  renderItemsSeleccionados();

  const cont = document.getElementById('resultados-catalogo');
  if (cont) cont.innerHTML = '';
};

window.agregarItemDesdeCatalogo = window.agregarItemConCantidad;

window.agregarComoLibreDesdeBusqueda = function() {
  const input = document.getElementById('busqueda-catalogo');
  if (!input) return;
  const texto = input.value.trim();
  if (!texto) { Toast.info('Escribe una descripción en el buscador primero'); return; }

  const descInput = document.getElementById('libre-descripcion');
  if (descInput) descInput.value = texto;

  abrirModalItemsLibres();

  const contenedor = document.getElementById('resultados-catalogo');
  if (contenedor) contenedor.innerHTML = '';
};

async function cargarFiltroProveedoresParaCatalogo() {
  const select = document.getElementById('filtro-proveedor-catalogo');
  if (!select) return;

  try {
    if (!_proveedoresCatalogoCache) {
      _proveedoresCatalogoCache = await Api.get('/proveedores?activos=true');
    }

    const previo = select.value;
    select.innerHTML = '<option value="">Todos los proveedores</option>';
    _proveedoresCatalogoCache.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = UI.labelProveedor(p);
      select.appendChild(opt);
    });

    if (previo && Array.from(select.options).some(o => String(o.value) === String(previo))) {
      select.value = previo;
    }

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

window.crearRequerimientoParaAltaCatalogo = function(texto, tipo) {
  const contenedor = document.getElementById('resultados-catalogo');
  if (contenedor) contenedor.innerHTML = '';

  abrirEditorRequerimiento(null);

  setTimeout(() => {
    const tituloEl = document.getElementById('req-titulo');
    const tipoEl   = document.getElementById('req-tipo');
    const notasEl  = document.getElementById('req-notas');

    if (tipoEl) {
      tipoEl.value = tipo || '';
      tipoEl.dispatchEvent(new Event('change'));
    }
    if (tituloEl) tituloEl.value = `Alta en catálogo: ${texto || 'Ítem / servicio no registrado'}`;
    if (notasEl) notasEl.value =
      `SOLICITUD DE ALTA EN CATÁLOGO\n\nEl siguiente ítem/servicio no existe actualmente en el catálogo maestro:\n\n${texto || ''}\n\nAcción requerida: Cotizar con proveedor(es), aprobar y crear el registro en el Catálogo.\n\nUna vez cargado al catálogo, se podrá vincular a requerimientos operativos.`;

    window.requerimientoItemsSeleccionados = [];
    window.requerimientoItemsLibres = [];
    if (typeof renderItemsSeleccionados === 'function') renderItemsSeleccionados();
    renderLibresResumen();

    const checkbox = document.getElementById('usar-items-nuevos');
    if (checkbox) checkbox.checked = true;

    Toast.info('Requerimiento prellenado para solicitud de alta en catálogo. Abre "Gestionar ítems nuevos" para describir los ítems que faltan.');

    setTimeout(() => {
      if (typeof abrirModalItemsLibres === 'function') abrirModalItemsLibres();
    }, 400);
  }, 250);
};

window.crearRequerimientoParaAltaCatalogoFromCurrent = function() {
  const tipoEl = document.getElementById('req-tipo');
  const busqEl = document.getElementById('busqueda-catalogo');
  const tipo   = tipoEl ? tipoEl.value : '';
  const texto  = busqEl ? busqEl.value.trim() : '';
  crearRequerimientoParaAltaCatalogo(texto, tipo);
};

window.crearRequerimientoParaAltaCatalogoFromForm = window.crearRequerimientoParaAltaCatalogoFromCurrent;
