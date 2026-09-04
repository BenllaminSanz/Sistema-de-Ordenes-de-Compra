// ── ÍTEMS DEL CATÁLOGO ────────────────────────────────────────

const reqTipoSelect = document.getElementById('req-tipo');
if (reqTipoSelect) {
  reqTipoSelect.addEventListener('change', () => {
    // form.reset() del modal también dispara change: no tratarlo como cambio de tipo del usuario
    if (window._reqCerrandoEditor) return;

    const seccion    = document.getElementById('seccion-items-catalogo');
    const selector   = document.getElementById('selector-items-nuevos');
    const provWrapper = document.getElementById('filtro-proveedor-wrapper');
    const provInput   = document.getElementById('filtro-proveedor-busqueda');
    const provHidden  = document.getElementById('filtro-proveedor-id');

    if (seccion)    seccion.style.display    = reqTipoSelect.value ? 'block' : 'none';
    if (selector)   selector.style.display   = reqTipoSelect.value ? 'block' : 'none';
    if (provWrapper) provWrapper.style.display = reqTipoSelect.value ? '' : 'none';
    if (!reqTipoSelect.value && typeof ProveedorBusqueda !== 'undefined') {
      ProveedorBusqueda.limpiar(provInput, provHidden);
    }

    if (reqTipoSelect.value) {
      const restaurando = window._reqRestaurandoBorrador === true;

      if (!restaurando) {
        CarritoReq.vaciar();
        window.requerimientoItemsLibres = [];
        desbloquearFiltroProveedorCatalogo();

        const checkbox = document.getElementById('usar-items-nuevos');
        if (checkbox) checkbox.checked = false;

        if (typeof ocultarLibreInline === 'function') ocultarLibreInline(true);
        if (typeof window.seleccionarModoItems === 'function') window.seleccionarModoItems('catalogo', true);
      }

      renderItemsSeleccionados();
      renderLibresResumen();
      initFiltroProveedorReq().then(() => {
        // Si ya hay proveedor elegido, listar sus ítems del tipo actual (SERVICIOS, etc.)
        const provId = document.getElementById('filtro-proveedor-id')?.value;
        if (provId) buscarEnCatalogo();
      }).catch(console.error);
    }
  });
}

let _filtroProveedorReqInited = false;

async function initFiltroProveedorReq() {
  if (typeof ProveedorBusqueda === 'undefined') return;

  await ProveedorBusqueda.init({
    inputId: 'filtro-proveedor-busqueda',
    hiddenId: 'filtro-proveedor-id',
    datalistId: 'filtro-proveedores-req-list',
    placeholder: 'Proveedor (código o nombre)…',
    onChange: (id) => {
      // Al elegir proveedor (p. ej. de servicios con costo), listar sus ítems
      // aunque no haya búsqueda previa ni resultados en pantalla.
      const tipo = document.getElementById('req-tipo')?.value;
      if (!tipo) return;
      if (id || document.getElementById('busqueda-catalogo')?.value.trim()) {
        buscarEnCatalogo();
      } else {
        const cont = document.getElementById('resultados-catalogo');
        if (cont) cont.innerHTML = '';
      }
    },
  });
  _filtroProveedorReqInited = true;
}

document.addEventListener('DOMContentLoaded', () => {
  initFiltroProveedorReq().catch(console.error);
});

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
    if (item.precio_sugerido != null && item.precio_sugerido !== '' && !Number.isNaN(Number(item.precio_sugerido))) {
      const precioFmt = Number(item.precio_sugerido).toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      metaPartes.push(`$${precioFmt} sugerido`);
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
  if (proveedorId == null || proveedorId === '') return;
  const input  = document.getElementById('filtro-proveedor-busqueda');
  const hidden = document.getElementById('filtro-proveedor-id');
  if (typeof ProveedorBusqueda !== 'undefined') {
    ProveedorBusqueda.bloquear(input, hidden, proveedorId);
  }
}

function desbloquearFiltroProveedorCatalogo() {
  const input  = document.getElementById('filtro-proveedor-busqueda');
  const hidden = document.getElementById('filtro-proveedor-id');
  if (typeof ProveedorBusqueda !== 'undefined') {
    ProveedorBusqueda.limpiar(input, hidden);
  }
}

window.desbloquearFiltroProveedorCatalogo = desbloquearFiltroProveedorCatalogo;

function _escAttrJs(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .replace(/\u2028|\u2029/g, ' ');
}

async function buscarEnCatalogo() {
  const input     = document.getElementById('busqueda-catalogo');
  const contenedor = document.getElementById('resultados-catalogo');
  if (!input || !contenedor) return;

  const busqueda  = input.value.trim();
  const tipo      = document.getElementById('req-tipo')?.value;
  const provHidden = document.getElementById('filtro-proveedor-id');
  const provInput  = document.getElementById('filtro-proveedor-busqueda');

  if (!tipo) {
    Toast.info('Primero selecciona el Tipo de requerimiento');
    return;
  }

  if (typeof ProveedorBusqueda !== 'undefined' && provInput && !provInput.disabled) {
    ProveedorBusqueda.resolver(provInput, provHidden);
  }

  const provId = (provHidden?.value || '').trim();
  // Sin texto ni proveedor: no listar todo el catálogo del tipo (evita listas enormes)
  if (!busqueda && !provId) {
    contenedor.innerHTML = `
      <div class="cat-empty-state">
        <div class="cat-no-results" style="padding:12px;font-size:12px;color:var(--muted);">
          Escribe un código/descripción o elige un <strong>proveedor</strong> para ver sus ítems
          ${(tipo || '').toUpperCase() === 'SERVICIOS' ? ' de servicio' : ''}.
        </div>
      </div>`;
    return;
  }

  contenedor.innerHTML = '<div style="padding:6px; font-size:12px; color:#666;">Buscando...</div>';

  try {
    const params = new URLSearchParams({ tipo, soloActivos: 'true' });
    if (busqueda) params.set('busqueda', busqueda);
    if (provId) params.set('proveedor_id', provId);

    const raw = await Api.get(`/catalogo?${params.toString()}`);
    const resultados = Array.isArray(raw)
      ? raw
      : (Array.isArray(raw?.datos) ? raw.datos : (Array.isArray(raw?.items) ? raw.items : []));

    if (!resultados.length) {
      const hintProv = provId
        ? ' Este proveedor no tiene ítems activos de tipo <strong>' + UI.esc(tipo) + '</strong> en el catálogo (revisa que el ítem esté en ese tipo y con proveedor asignado).'
        : '';
      contenedor.innerHTML = `
        <div class="cat-empty-state">
          <div class="cat-no-results">
            <strong>Sin resultados en el catálogo</strong>
            <div style="margin-top:6px;font-size:11px;color:var(--muted);line-height:1.4;">${hintProv}</div>
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
      const safeDesc = _escAttrJs(item.descripcion || '');
      const safeCodigo = _escAttrJs(item.codigo || '');
      const safeProvNom = _escAttrJs(item.proveedor_nombre || '');
      const safeProvNum = _escAttrJs(item.proveedor_num || '');
      const safeMoneda = _escAttrJs(item.moneda || 'MXN');
      const costoNum = item.costo_referencia != null && item.costo_referencia !== ''
        ? Number(item.costo_referencia)
        : null;
      const costoJs = (costoNum != null && !Number.isNaN(costoNum)) ? costoNum : 0;
      const precio = costoNum != null && !Number.isNaN(costoNum)
        ? costoNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : null;
      const provIdItem = item.proveedor_id != null && item.proveedor_id !== ''
        ? Number(item.proveedor_id)
        : null;

      html += `
        <div class="cat-result-row">
          <div class="cat-result-info">
            <div class="cat-result-top">
              <span class="cat-result-code">${UI.esc(item.codigo || '')}</span>
              <span class="cat-result-desc">${UI.esc(item.descripcion || '')}</span>
            </div>
            <div class="cat-result-meta">
              ${precio != null ? `<span class="cat-result-price">${precio} ${UI.esc(item.moneda || 'MXN')}</span>` : ''}
              ${item.proveedor_nombre ? `<span class="cat-result-prov">${UI.labelProveedor(item)}</span>` : ''}
            </div>
          </div>
          <div class="cat-result-actions">
            ${!yaSeleccionado ? `
              <input type="number" id="qty-${item.id}" class="form-control cat-qty" value="1" min="1" step="1" title="Cantidad">
              <button type="button" class="btn btn-sm btn-primary"
                      onclick="agregarItemConCantidad(${item.id}, '${safeCodigo}', '${safeDesc}', ${costoJs}, '${safeMoneda}', ${provIdItem != null && !Number.isNaN(provIdItem) ? provIdItem : 'null'}, '${safeProvNom}', '${safeProvNum}')">
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
    const n = (window.requerimientoItemsLibres || []).length;
    const msg = n === 1
      ? 'Este requerimiento tiene 1 ítem nuevo (fuera de catálogo).\n\nNo se pueden mezclar con ítems del catálogo.\n¿Eliminarlo y agregar este del catálogo?'
      : `Este requerimiento tiene ${n} ítems nuevos (fuera de catálogo).\n\nNo se pueden mezclar con ítems del catálogo.\n¿Eliminarlos y agregar este del catálogo?`;
    if (!confirm(msg)) return;
    window.requerimientoItemsLibres = [];
    if (typeof ocultarLibreInline === 'function') ocultarLibreInline(true);
    const checkbox = document.getElementById('usar-items-nuevos');
    if (checkbox) checkbox.checked = false;
    if (typeof window.seleccionarModoItems === 'function') {
      window.seleccionarModoItems('catalogo', true);
    }
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
