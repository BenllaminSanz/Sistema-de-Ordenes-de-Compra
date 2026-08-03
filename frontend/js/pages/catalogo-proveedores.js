/* Catálogo agrupado por proveedor */

let _itemsCatalogoProv = [];
let _proveedorSeleccionadoId = null;
let puedeSolicitarReqProv = false;
let esAdminCatalogoProv = false;
let _unidadesMedidaProv = [];
let _proveedorModalInited = false;

const CAT_PROV_FILTROS_KEY = 'oc_catalogo_prov_filtros';

function guardarFiltrosCatalogoProv() {
  try {
    sessionStorage.setItem(CAT_PROV_FILTROS_KEY, JSON.stringify({
      busqueda: document.getElementById('busqueda-proveedor')?.value || '',
      tipo: document.getElementById('filtro-tipo-prov')?.value || '',
      soloActivos: document.getElementById('chk-activos-prov')?.checked ?? true,
      proveedor_id: _proveedorSeleccionadoId || null,
    }));
  } catch (_) { /* ignore */ }
}

function restaurarFiltrosCatalogoProv() {
  try {
    const raw = sessionStorage.getItem(CAT_PROV_FILTROS_KEY);
    if (!raw) return null;
    const f = JSON.parse(raw);
    const busq = document.getElementById('busqueda-proveedor');
    const tipo = document.getElementById('filtro-tipo-prov');
    const chk = document.getElementById('chk-activos-prov');
    if (busq && f.busqueda != null) busq.value = f.busqueda;
    if (tipo && f.tipo != null) tipo.value = f.tipo;
    if (chk && f.soloActivos != null) chk.checked = !!f.soloActivos;
    return f;
  } catch (_) {
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  Auth.requiereAuth();
  renderSidebar();
  renderTopbar('Catálogo por proveedor');

  puedeSolicitarReqProv = Auth.puedeHacer(['solicitante', 'compras', 'admin']);
  esAdminCatalogoProv = Auth.puedeHacer(['compras', 'admin']);

  CarritoReq.load();
  CarritoReq.onChange(() => {
    if (_proveedorSeleccionadoId) renderItemsProveedor(_proveedorSeleccionadoId);
  });
  actualizarBarraCarritoReqProv();

  await ProveedorBusqueda.cargar();
  if (esAdminCatalogoProv) {
    await cargarUnidadesMedidaProv();
  }
  const guardados = restaurarFiltrosCatalogoProv();
  await cargarCatalogoPorProveedor();

  const params = new URLSearchParams(window.location.search);
  const provParam = params.get('proveedor_id') || guardados?.proveedor_id;
  if (provParam) seleccionarProveedorCatalogo(parseInt(provParam, 10));
});

async function cargarUnidadesMedidaProv() {
  try {
    _unidadesMedidaProv = await Api.get('/unidades-medida?soloActivas=true') || [];
  } catch {
    _unidadesMedidaProv = [];
  }
}

function rellenarSelectUnidadesProv(selected = '') {
  const sel = document.getElementById('cat-prov-unidad');
  if (!sel) return;
  const val = selected || sel.value || '';
  const opts = ['<option value="">— Seleccionar unidad —</option>'];
  (_unidadesMedidaProv || []).forEach((u) => {
    const cod = u.codigo || u.nombre || '';
    const label = u.codigo && u.nombre && u.codigo !== u.nombre
      ? `${u.codigo} — ${u.nombre}`
      : (u.nombre || u.codigo);
    opts.push(`<option value="${UI.esc(cod)}">${UI.esc(label)}</option>`);
  });
  sel.innerHTML = opts.join('');
  if (val) {
    if (![...sel.options].some((o) => o.value === val)) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = val;
      sel.appendChild(o);
    }
    sel.value = val;
  }
}

async function initProveedorModalBusqueda() {
  if (_proveedorModalInited || typeof ProveedorBusqueda === 'undefined') return;
  await ProveedorBusqueda.init({
    inputId: 'cat-prov-proveedor-busqueda',
    hiddenId: 'cat-prov-proveedor-id',
    datalistId: 'cat-prov-proveedores-list',
    placeholder: 'Buscar por código o nombre…',
  });
  _proveedorModalInited = true;
}

async function cargarCatalogoPorProveedor() {
  const lista = document.getElementById('lista-proveedores-catalogo');
  if (lista) UI.spinner(lista);

  guardarFiltrosCatalogoProv();

  const soloActivos = document.getElementById('chk-activos-prov')?.checked ?? true;
  const params = new URLSearchParams();
  if (soloActivos) params.append('soloActivos', 'true');

  try {
    _itemsCatalogoProv = await Api.get(`/catalogo?${params.toString()}`) || [];
    filtrarListaProveedores();
  } catch (err) {
    console.error(err);
    if (lista) UI.empty(lista, 'Error al cargar el catálogo');
    Toast.error('No se pudo cargar el catálogo');
  }
}

function _agruparPorProveedor(items, tipoFiltro) {
  const mapa = new Map();

  items.forEach((item) => {
    if (tipoFiltro && item.tipo !== tipoFiltro) return;
    const pid = item.proveedor_id;
    if (pid == null) return;

    if (!mapa.has(pid)) {
      mapa.set(pid, {
        proveedor_id: pid,
        proveedor_num: item.proveedor_num || '',
        proveedor_nombre: item.proveedor_nombre || '',
        items: [],
      });
    }
    mapa.get(pid).items.push(item);
  });

  return [...mapa.values()].sort((a, b) => {
    const na = (a.proveedor_nombre || a.proveedor_num || '').toLowerCase();
    const nb = (b.proveedor_nombre || b.proveedor_num || '').toLowerCase();
    return na.localeCompare(nb, 'es');
  });
}

function filtrarListaProveedores() {
  const contenedor = document.getElementById('lista-proveedores-catalogo');
  const contador   = document.getElementById('prov-contador');
  if (!contenedor) return;

  guardarFiltrosCatalogoProv();

  const q    = (document.getElementById('busqueda-proveedor')?.value || '').trim();
  const tipo = document.getElementById('filtro-tipo-prov')?.value || '';

  let grupos = _agruparPorProveedor(_itemsCatalogoProv, tipo);

  if (q) {
    grupos = grupos.filter((g) => ProveedorBusqueda.coincide({
      num_proveedor: g.proveedor_num,
      nombre: g.proveedor_nombre,
    }, q));
  }

  if (contador) {
    contador.textContent = `${grupos.length} proveedor${grupos.length === 1 ? '' : 'es'}`;
  }

  if (!grupos.length) {
    UI.empty(contenedor, q ? 'Sin proveedores para esa búsqueda' : 'No hay proveedores con ítems en catálogo');
    // Si el filtro de tipo deja al proveedor seleccionado sin ítems, refrescar panel derecho
    if (_proveedorSeleccionadoId) {
      renderItemsProveedor(_proveedorSeleccionadoId);
    }
    return;
  }

  contenedor.innerHTML = grupos.map((g) => {
    const sel = String(_proveedorSeleccionadoId) === String(g.proveedor_id) ? ' selected' : '';
    const count = g.items.length;
    return `
      <div class="prov-list-row${sel}" onclick="seleccionarProveedorCatalogo(${g.proveedor_id})" role="button" tabindex="0">
        <span class="prov-list-code">${g.proveedor_num || '—'}</span>
        <span class="prov-list-name">${UI.esc(g.proveedor_nombre || 'Sin nombre')}</span>
        <span class="prov-list-count">${count} ítem${count === 1 ? '' : 's'}</span>
      </div>`;
  }).join('');

  if (_proveedorSeleccionadoId && !grupos.some((g) => String(g.proveedor_id) === String(_proveedorSeleccionadoId))) {
    _proveedorSeleccionadoId = null;
    const titulo = document.getElementById('proveedor-seleccionado-titulo');
    const tabla  = document.getElementById('tabla-items-proveedor');
    if (titulo) titulo.textContent = 'Selecciona un proveedor para ver sus ítems';
    if (tabla) tabla.innerHTML = '';
  } else if (_proveedorSeleccionadoId) {
    // Recalcular ítems del proveedor al cambiar tipo (PARTES/SERVICIOS/FLETES)
    renderItemsProveedor(_proveedorSeleccionadoId);
  }
}

function seleccionarProveedorCatalogo(proveedorId) {
  _proveedorSeleccionadoId = proveedorId;
  filtrarListaProveedores();
  renderItemsProveedor(proveedorId);
  guardarFiltrosCatalogoProv();
  history.replaceState(null, '', `catalogo-proveedores.html?proveedor_id=${proveedorId}`);
}

function renderItemsProveedor(proveedorId) {
  const titulo = document.getElementById('proveedor-seleccionado-titulo');
  const cont   = document.getElementById('tabla-items-proveedor');
  if (!cont) return;

  const tipo = document.getElementById('filtro-tipo-prov')?.value || '';
  const items = _itemsCatalogoProv.filter((i) => {
    if (String(i.proveedor_id) !== String(proveedorId)) return false;
    if (tipo && i.tipo !== tipo) return false;
    return true;
  });

  const prov = ProveedorBusqueda.obtenerPorId(proveedorId) || items[0];
  const label = prov ? UI.labelProveedor(prov) : 'Proveedor';

  if (titulo) {
    titulo.innerHTML = `<strong style="color:var(--text);">${UI.esc(label)}</strong> — ${items.length} ítem${items.length === 1 ? '' : 's'}`;
  }

  if (!items.length) {
    UI.empty(cont, 'Este proveedor no tiene ítems con el filtro actual');
    return;
  }

  const tipoBadge = (t) => `<span class="badge badge-tipo ${(t || '').toLowerCase()}">${t}</span>`;

  const rows = items.map((item) => {
    const moneda = item.moneda || 'MXN';
    const costo  = item.costo_referencia != null
      ? parseFloat(item.costo_referencia).toLocaleString('es-MX', { minimumFractionDigits: 2 })
      : '—';
    const yaEnCarrito = puedeSolicitarReqProv && item.activo && CarritoReq.tiene(item.id);
    const estadoBadge = item.activo
      ? '<span class="badge badge-aprobado">Activo</span>'
      : '<span class="badge badge-rechazado">Inactivo</span>';

    const celdaSolicitar = (puedeSolicitarReqProv && item.activo) ? `
      <div class="d-flex gap-1 align-items-center">
        ${yaEnCarrito ? `<span class="cat-added-badge" style="font-size:11px;">✓ En solicitud</span>` : `
          <input type="number" id="cat-prov-qty-${item.id}" class="form-control" value="1" min="1" step="1"
                 style="width:56px; padding:2px 6px; font-size:12px;">
          <button type="button" class="btn btn-sm btn-primary" style="font-size:11px;"
                  onclick="agregarItemProveedorAlCarrito(${item.id})">+ Agregar</button>
        `}
      </div>` : '<span class="text-muted">—</span>';

    const accionesAdmin = esAdminCatalogoProv ? `
      <td>
        <div class="d-flex gap-1">
          <button type="button" class="btn btn-sm btn-outline" title="Editar ítem"
                  style="padding:2px 6px;"
                  onclick="editarItemCatalogoDesdeProveedor(${item.id})">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
                 viewBox="0 0 24 24" style="vertical-align:-1px;">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button type="button" class="btn btn-sm ${item.activo ? 'btn-danger' : 'btn-success'}"
                  style="padding:2px 6px;"
                  title="${item.activo ? 'Desactivar' : 'Activar'}"
                  onclick="cambiarEstadoCatalogoProv(${item.id}, ${!item.activo})">
            ${item.activo
              ? '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>'
              : '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px;"><path d="M20 6L9 17l-5-5"/></svg>'}
          </button>
          ${!item.activo ? `
          <button type="button" class="btn btn-sm btn-outline"
                  style="padding:2px 6px;color:#b91c1c;border-color:#fca5a5;"
                  title="Eliminar definitivamente (solo desactivados)"
                  onclick="eliminarCatalogoProvDesactivado(${item.id}, '${String(item.codigo || '').replace(/'/g, "\\'")}')">
            🗑
          </button>` : ''}
        </div>
      </td>` : '';

    return `<tr>
      <td><strong>${item.codigo}</strong></td>
      <td style="max-width:300px">${item.descripcion || '—'}</td>
      <td>${tipoBadge(item.tipo)}</td>
      <td>${item.unidad || '—'}</td>
      <td style="text-align:right">${costo}</td>
      <td><span style="font-size:11px;font-weight:600;color:var(--muted)">${moneda}</span></td>
      <td>${estadoBadge}</td>
      ${puedeSolicitarReqProv ? `<td>${celdaSolicitar}</td>` : ''}
      ${accionesAdmin}
    </tr>`;
  }).join('');

  cont.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Código</th><th>Descripción</th><th>Tipo</th><th>Unidad</th>
          <th style="text-align:right">Costo ref.</th><th>Moneda</th><th>Estado</th>
          ${puedeSolicitarReqProv ? '<th>Solicitar</th>' : ''}
          ${esAdminCatalogoProv ? '<th>Acciones</th>' : ''}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function limpiarErroresModalProv() {
  ['tipo', 'codigo', 'descripcion', 'costo'].forEach((campo) => {
    const el = document.getElementById(`error-cat-prov-${campo}`);
    if (el) el.textContent = '';
  });
}

function mostrarErrorCampoProv(campo, mensaje) {
  const el = document.getElementById(`error-cat-prov-${campo}`);
  if (el) el.textContent = mensaje;
}

function cerrarModalCatalogoProv() {
  const modal = document.getElementById('modal-catalogo-prov');
  if (modal) modal.style.display = 'none';
}

async function editarItemCatalogoDesdeProveedor(id) {
  if (!esAdminCatalogoProv) return;
  try {
    if (!_unidadesMedidaProv.length) await cargarUnidadesMedidaProv();
    await initProveedorModalBusqueda();

    const item = await Api.get(`/catalogo/${id}`);
    if (!item) return Toast.error('Ítem no encontrado');

    limpiarErroresModalProv();
    document.getElementById('modal-catalogo-prov-titulo').textContent = 'Editar elemento del catálogo';
    document.getElementById('cat-prov-id').value = item.id;
    document.getElementById('cat-prov-tipo').value = item.tipo || '';
    document.getElementById('cat-prov-codigo').value = item.codigo || '';
    document.getElementById('cat-prov-descripcion').value = item.descripcion || '';
    document.getElementById('cat-prov-costo').value = item.costo_referencia ?? '';
    document.getElementById('cat-prov-moneda').value = item.moneda || 'MXN';
    rellenarSelectUnidadesProv(item.unidad || '');
    ProveedorBusqueda.establecer(
      document.getElementById('cat-prov-proveedor-busqueda'),
      document.getElementById('cat-prov-proveedor-id'),
      item.proveedor_id || ''
    );

    const modal = document.getElementById('modal-catalogo-prov');
    if (modal) modal.style.display = 'flex';
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudo abrir el ítem para editar');
  }
}

async function guardarCatalogoProv(e) {
  e.preventDefault();
  if (!esAdminCatalogoProv) return;

  const btn = document.getElementById('btn-guardar-catalogo-prov');
  const id = document.getElementById('cat-prov-id').value;
  limpiarErroresModalProv();

  const tipo = document.getElementById('cat-prov-tipo').value;
  const codigo = document.getElementById('cat-prov-codigo').value.trim();
  const descripcion = document.getElementById('cat-prov-descripcion').value.trim();
  const costoStr = document.getElementById('cat-prov-costo').value;
  const moneda = document.getElementById('cat-prov-moneda').value || 'MXN';
  const unidad = (document.getElementById('cat-prov-unidad')?.value || '').trim() || null;
  const provInput = document.getElementById('cat-prov-proveedor-busqueda');
  const provHidden = document.getElementById('cat-prov-proveedor-id');
  ProveedorBusqueda.resolver(provInput, provHidden);
  const proveedor_id = provHidden?.value || null;

  let tieneErrores = false;
  if (!tipo) { mostrarErrorCampoProv('tipo', 'El tipo es obligatorio'); tieneErrores = true; }
  if (!codigo) { mostrarErrorCampoProv('codigo', 'El código es obligatorio'); tieneErrores = true; }
  if (!descripcion) { mostrarErrorCampoProv('descripcion', 'La descripción es obligatoria'); tieneErrores = true; }

  let costo = null;
  if (costoStr && costoStr.trim() !== '') {
    costo = parseFloat(costoStr);
    if (isNaN(costo) || costo < 0) {
      mostrarErrorCampoProv('costo', 'El costo de referencia debe ser un número ≥ 0');
      tieneErrores = true;
    }
  }
  if (tieneErrores) return;

  const datos = {
    tipo,
    codigo,
    descripcion,
    unidad,
    costo_referencia: costo,
    moneda,
    proveedor_id: proveedor_id ? parseInt(proveedor_id, 10) : null,
  };

  const textoOriginal = btn?.textContent || 'Guardar';
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    await Api.put(`/catalogo/${id}`, datos);
    Toast.success('Elemento actualizado correctamente');
    cerrarModalCatalogoProv();
    const provAntes = _proveedorSeleccionadoId;
    await cargarCatalogoPorProveedor();
    // Si cambió de proveedor, seguir mostrando el proveedor de la lista actual
    if (provAntes) seleccionarProveedorCatalogo(provAntes);
  } catch (err) {
    const mensaje = err.mensaje || 'Error al guardar el elemento';
    if (mensaje.toLowerCase().includes('código') || mensaje.toLowerCase().includes('codigo')) {
      mostrarErrorCampoProv('codigo', mensaje);
    } else {
      Toast.error(mensaje);
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoOriginal; }
  }
}

async function cambiarEstadoCatalogoProv(id, nuevoEstado) {
  if (!esAdminCatalogoProv) return;
  const accion = nuevoEstado ? 'activar' : 'desactivar';
  if (!confirm(`¿Seguro que deseas ${accion} este elemento?`)) return;

  try {
    await Api.patch(`/catalogo/${id}/estado`, { activo: nuevoEstado });
    Toast.success(`Elemento ${nuevoEstado ? 'activado' : 'desactivado'} correctamente`);
    const provAntes = _proveedorSeleccionadoId;
    // Al desactivar con filtro "solo activos", el ítem desaparece de la lista
    await cargarCatalogoPorProveedor();
    if (provAntes) seleccionarProveedorCatalogo(provAntes);
  } catch (err) {
    Toast.error(err.mensaje || 'Error al cambiar el estado');
  }
}

async function eliminarCatalogoProvDesactivado(id, codigo) {
  if (!esAdminCatalogoProv) return;
  if (!confirm(
    `¿Eliminar definitivamente el ítem desactivado "${codigo || id}"?\n\n`
    + 'Solo se borra del catálogo si no tiene registros relacionados (REQ/OC). '
    + 'Los históricos no se eliminan.'
  )) return;

  try {
    const data = await Api.delete(`/catalogo/${id}`);
    Toast.success(data.mensaje || 'Ítem eliminado');
    const provAntes = _proveedorSeleccionadoId;
    await cargarCatalogoPorProveedor();
    if (provAntes) seleccionarProveedorCatalogo(provAntes);
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudo eliminar el ítem');
  }
}

function agregarItemProveedorAlCarrito(catalogoId) {
  const item = _itemsCatalogoProv.find((i) => i.id === catalogoId);
  if (!item) return;

  const qtyInput = document.getElementById(`cat-prov-qty-${catalogoId}`);
  const cantidad = qtyInput ? parseFloat(qtyInput.value) || 1 : 1;
  const resultado = CarritoReq.agregar(item, cantidad);

  if (CarritoReqUI.notificarAgregado(resultado)) {
    renderItemsProveedor(_proveedorSeleccionadoId);
    actualizarBarraCarritoReqProv();
  }
}

function actualizarBarraCarritoReqProv() {
  const bar = document.getElementById('carrito-req-bar');
  if (!bar || !puedeSolicitarReqProv) return;

  const n = CarritoReq.count();
  bar.style.display = n > 0 ? 'block' : 'none';
  document.body.classList.toggle('catalogo-con-carrito', n > 0);

  const titulo = document.getElementById('carrito-req-titulo');
  const sub = document.getElementById('carrito-req-sub');
  if (titulo) titulo.textContent = n === 1 ? '1 ítem en tu solicitud' : `${n} ítems en tu solicitud`;
  if (sub) {
    const bloqueado = CarritoReq.getProveedorBloqueado();
    sub.textContent = bloqueado
      ? `Proveedor: ${CarritoReq.labelProveedor(bloqueado)} — solo ítems de este proveedor`
      : '';
  }
}

function toggleDetalleCarritoReq() {
  const detalle = document.getElementById('carrito-req-detalle');
  if (!detalle) return;
  const visible = detalle.style.display !== 'none';
  if (visible) {
    detalle.style.display = 'none';
    detalle.innerHTML = '';
  } else {
    const items = CarritoReq.getItems();
    detalle.innerHTML = items.length ? `
      <div class="carrito-req-detalle-list">
        ${items.map((item) => `
          <div class="carrito-req-detalle-row">
            <span class="carrito-req-detalle-code">${item.codigo}</span>
            <span class="carrito-req-detalle-desc">${item.descripcion}</span>
            <span class="carrito-req-detalle-qty">×${item.cantidad}</span>
          </div>`).join('')}
      </div>` : '';
    detalle.style.display = 'block';
  }
}

function vaciarCarritoReq() {
  if (!CarritoReq.count()) return;
  if (!confirm('¿Vaciar todos los ítems de tu solicitud?')) return;
  CarritoReq.vaciar();
  if (_proveedorSeleccionadoId) renderItemsProveedor(_proveedorSeleccionadoId);
  actualizarBarraCarritoReqProv();
  Toast.info('Solicitud vaciada');
}

window.cargarCatalogoPorProveedor = cargarCatalogoPorProveedor;
window.filtrarListaProveedores = filtrarListaProveedores;
window.seleccionarProveedorCatalogo = seleccionarProveedorCatalogo;
window.agregarItemProveedorAlCarrito = agregarItemProveedorAlCarrito;
window.editarItemCatalogoDesdeProveedor = editarItemCatalogoDesdeProveedor;
window.cerrarModalCatalogoProv = cerrarModalCatalogoProv;
window.guardarCatalogoProv = guardarCatalogoProv;
window.cambiarEstadoCatalogoProv = cambiarEstadoCatalogoProv;
window.eliminarCatalogoProvDesactivado = eliminarCatalogoProvDesactivado;
window.toggleDetalleCarritoReq = toggleDetalleCarritoReq;
window.vaciarCarritoReq = vaciarCarritoReq;