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
      CarritoReq.vaciar();
      window.requerimientoItemsLibres = [];
      desbloquearFiltroProveedorCatalogo();
      renderItemsSeleccionados();
      renderLibresResumen();

      const checkbox = document.getElementById('usar-items-nuevos');
      if (checkbox) checkbox.checked = false;

      // Resetear modo al cambiar tipo (arrays ya limpios, sin confirm)
      if (typeof ocultarLibreInline === 'function') ocultarLibreInline(true);
      if (typeof window.seleccionarModoItems === 'function') window.seleccionarModoItems('catalogo');

      cargarFiltroProveedoresParaCatalogo();
    }
  });
}

function renderItemsSeleccionados() {
  const contenedor = document.getElementById('items-seleccionados-req');
  if (!contenedor) return;

  const catalogo = window.requerimientoItemsSeleccionados || [];
  const libres   = window.requerimientoItemsLibres        || [];

  if (catalogo.length === 0 && libres.length === 0) {
    contenedor.innerHTML = `
      <div class="sel-empty">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        Ninguno seleccionado — busca aquí o en el catálogo completo
      </div>`;
    return;
  }

  let html = '';

  if (catalogo.length > 0) {
    const prov = CarritoReq.getProveedorBloqueado() || catalogo[0];
    html += `
      <div class="prov-lock-banner">
        <strong>Mismo proveedor:</strong> ${CarritoReq.labelProveedor(prov)}.
        Solo puedes agregar ítems de este proveedor; para otro proveedor crea otro requerimiento.
      </div>`;
  }

  // ── Ítems del catálogo (verde) ────────────────────────────────
  catalogo.forEach((item, index) => {
    const precio = (item.costo_referencia != null && !isNaN(item.costo_referencia))
      ? parseFloat(item.costo_referencia).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : null;
    const moneda = item.moneda || 'MXN';
    const precioHtml = precio != null
      ? `<span class="sel-item-price">${precio} ${moneda}</span>`
      : '';

    html += `
      <div class="sel-item-row">
        <span class="sel-item-code">${item.codigo}</span>
        <span class="sel-item-desc" title="${item.descripcion}">${item.descripcion}</span>
        ${precioHtml}
        <input type="number" class="form-control sel-item-qty" value="${Math.round(item.cantidad)}"
               min="1" step="1" title="Cantidad"
               onchange="actualizarCantidadItem(${index}, this.value)">
        <button type="button" class="libre-del-btn" title="Quitar" onclick="eliminarItemSeleccionado(${index})">×</button>
      </div>`;
  });

  // ── Ítems libres (ámbar) ──────────────────────────────────────
  libres.forEach((item, index) => {
    const metaPartes = [];
    if (item.cantidad > 1 || item.unidad) {
      metaPartes.push(`${item.cantidad}${item.unidad ? ' ' + item.unidad : ''}`);
    }
    let refHtml = '';
    if (item.referencia_tipo === 'link' && item.referencia_url) {
      refHtml = `<a href="${item.referencia_url}" target="_blank" rel="noopener" style="font-size:10.5px; color:var(--primary); margin-left:4px;">🔗 enlace</a>`;
    } else if (item.referencia_tipo === 'archivo' && item.referencia_nombre) {
      refHtml = `<span style="font-size:10.5px; color:var(--muted); margin-left:4px;">📎 ${item.referencia_nombre}</span>`;
    }

    html += `
      <div class="libre-item-card" style="background:#fffbeb; border-color:#fde68a;">
        <div class="libre-item-num" style="background:#fef3c7; color:#92400e;">${index + 1}</div>
        <div class="libre-item-body">
          <div class="libre-item-desc">${item.descripcion}</div>
          <div class="libre-item-meta">
            ${metaPartes.length ? `<span>${metaPartes.join(' · ')}</span>` : ''}
            ${refHtml}
          </div>
        </div>
        <button type="button" class="libre-del-btn" title="Quitar" onclick="eliminarItemLibreInline(${index})">×</button>
      </div>`;
  });

  contenedor.innerHTML = html;
}

window.actualizarCantidadItem = function(index, nuevaCantidad) {
  const item = window.requerimientoItemsSeleccionados[index];
  if (!item) return;
  const cantidad = Math.max(1, Math.round(parseFloat(nuevaCantidad) || 1));
  item.cantidad = cantidad;
  CarritoReq.actualizarCantidad(item.catalogo_id, cantidad);
};

window.eliminarItemSeleccionado = function(index) {
  const item = window.requerimientoItemsSeleccionados[index];
  if (item) CarritoReq.eliminar(item.catalogo_id);
  renderItemsSeleccionados();
  if (!CarritoReq.count()) {
    desbloquearFiltroProveedorCatalogo();
  }
};

function bloquearFiltroProveedorCatalogo(proveedorId) {
  const select = document.getElementById('filtro-proveedor-catalogo');
  if (!select || proveedorId == null || proveedorId === '') return;

  select.value = String(proveedorId);
  select.disabled = true;
  select.title = 'Proveedor fijado al del primer ítem agregado';
}

function desbloquearFiltroProveedorCatalogo() {
  const select = document.getElementById('filtro-proveedor-catalogo');
  if (!select) return;

  select.disabled = false;
  select.title = '';
}

window.desbloquearFiltroProveedorCatalogo = desbloquearFiltroProveedorCatalogo;

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
        <div class="cat-empty-state">
          <div class="cat-no-results">
            <strong>Sin resultados en el catálogo</strong>
            <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
              <button type="button" class="btn btn-sm btn-primary"
                      onclick="mostrarLibreInline()">
                + Agregar como ítem nuevo
              </button>
            </div>
          </div>
        </div>`;
      return;
    }

    let html = '';
    resultados.forEach(item => {
      const yaSeleccionado = CarritoReq.tiene(item.id);
      const safeDesc = item.descripcion.replace(/'/g, "\\'").replace(/"/g, '\\"');
      const safeProvNom = (item.proveedor_nombre || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const safeProvNum = (item.proveedor_num || '').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const precio = item.costo_referencia != null
        ? parseFloat(item.costo_referencia).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : null;

      html += `
        <div class="cat-result-row">
          <div class="cat-result-info">
            <div class="cat-result-top">
              <span class="cat-result-code">${item.codigo}</span>
              <span class="cat-result-desc">${item.descripcion}</span>
            </div>
            <div class="cat-result-meta">
              ${precio != null ? `<span class="cat-result-price">${precio} ${item.moneda || 'MXN'}</span>` : ''}
              ${item.proveedor_nombre ? `<span class="cat-result-prov">${UI.labelProveedor(item)}</span>` : ''}
            </div>
          </div>
          <div class="cat-result-actions">
            ${!yaSeleccionado ? `
              <input type="number" id="qty-${item.id}" class="form-control cat-qty" value="1" min="1" step="1" title="Cantidad">
              <button type="button" class="btn btn-sm btn-primary"
                      onclick="agregarItemConCantidad(${item.id}, '${item.codigo}', '${safeDesc}', ${item.costo_referencia != null ? item.costo_referencia : 0}, '${item.moneda || 'MXN'}', ${item.proveedor_id != null ? item.proveedor_id : 'null'}, '${safeProvNom}', '${safeProvNum}')">
                + Agregar
              </button>
            ` : `
              <span class="cat-added-badge">
                <svg width="12" height="12" fill="none" stroke="#166534" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
                Agregado
              </span>
            `}
          </div>
        </div>`;
    });

    // Pie del listado — acceso rápido a ítem nuevo
    html += `
      <div style="padding:8px 10px; background:#fffbeb; border-top:1px solid #fde68a; font-size:11px; color:#92400e; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
        <span>¿No está lo que buscas?</span>
        <button type="button" class="btn btn-sm btn-outline" style="font-size:11px;"
                onclick="mostrarLibreInline()">
          + Agregar como ítem nuevo
        </button>
      </div>`;

    contenedor.innerHTML = html;

  } catch (err) {
    contenedor.innerHTML = '<div style="padding:6px; font-size:12px; color:#c00;">Error al buscar.</div>';
  }
}

window.agregarItemConCantidad = function(catalogo_id, codigo, descripcion, costo, moneda = 'MXN', proveedor_id = null, proveedor_nombre = '', proveedor_num = '') {
  const tieneLibres = (window.requerimientoItemsLibres || []).length > 0;

  if (tieneLibres) {
    if (!confirm('Ya tienes ítems nuevos/libres.\n\n¿Limpiarlos y volver a usar solo catálogo?')) return;
    window.requerimientoItemsLibres = [];
    if (typeof ocultarLibreInline === 'function') ocultarLibreInline();
    const checkbox = document.getElementById('usar-items-nuevos');
    if (checkbox) checkbox.checked = false;
  }

  const qtyInput = document.getElementById(`qty-${catalogo_id}`);
  const cantidad = qtyInput ? parseFloat(qtyInput.value) || 1 : 1;
  const tipo = document.getElementById('req-tipo')?.value || '';

  const resultado = CarritoReq.agregar({
    catalogo_id,
    codigo,
    descripcion,
    costo_referencia: costo,
    moneda,
    proveedor_id,
    proveedor_nombre,
    proveedor_num,
    tipo,
  }, cantidad);

  if (!CarritoReqUI.notificarAgregado(resultado)) return;

  if (CarritoReq.count() === 1 && proveedor_id != null) {
    bloquearFiltroProveedorCatalogo(proveedor_id);
  }

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

  // Pre-rellenar descripción con lo que escribió en el buscador
  const descInput = document.getElementById('libre-descripcion');
  if (descInput) descInput.value = texto;

  mostrarLibreInline();

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
