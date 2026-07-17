/* ============================================================
   catalogo.js — Lógica de la página de Consulta y Administración del Catálogo
   ============================================================ */

let esAdminCatalogo = false;
let puedeSolicitarReq = false;
let proveedoresCache = [];
let _catalogoData   = [];   // cache para filtrado client-side
let _unidadesMedida = [];

const CAT_FILTROS_KEY = 'oc_catalogo_filtros';

function guardarFiltrosCatalogo() {
  try {
    const estado = {
      busqueda: document.getElementById('busqueda')?.value || '',
      tipo: document.getElementById('filtro-tipo')?.value || '',
      proveedor_id: document.getElementById('filtro-proveedor-id')?.value || '',
      proveedor_label: document.getElementById('filtro-proveedor-busqueda')?.value || '',
      soloActivos: document.getElementById('chk-activos')?.checked ?? true,
    };
    sessionStorage.setItem(CAT_FILTROS_KEY, JSON.stringify(estado));
  } catch (_) { /* ignore */ }
}

function limpiarFiltrosCatalogoUI() {
  const busq = document.getElementById('busqueda');
  const tipo = document.getElementById('filtro-tipo');
  const chk = document.getElementById('chk-activos');
  const hid = document.getElementById('filtro-proveedor-id');
  const inp = document.getElementById('filtro-proveedor-busqueda');
  if (busq) busq.value = '';
  if (tipo) tipo.value = '';
  if (chk) chk.checked = true;
  if (hid) hid.value = '';
  if (inp) inp.value = '';
  try { sessionStorage.removeItem(CAT_FILTROS_KEY); } catch (_) { /* ignore */ }
}

function restaurarFiltrosCatalogo() {
  try {
    const raw = sessionStorage.getItem(CAT_FILTROS_KEY);
    if (!raw) return;
    const f = JSON.parse(raw);
    const busq = document.getElementById('busqueda');
    const tipo = document.getElementById('filtro-tipo');
    const chk = document.getElementById('chk-activos');
    if (busq && f.busqueda != null) busq.value = f.busqueda;
    if (tipo && f.tipo != null) tipo.value = f.tipo;
    if (chk && typeof f.soloActivos === 'boolean') chk.checked = f.soloActivos;
    // Solo restaurar proveedor si hay id numérico válido
    const pid = f.proveedor_id != null && String(f.proveedor_id).trim() !== ''
      ? String(f.proveedor_id).trim()
      : '';
    if (pid && /^\d+$/.test(pid)) {
      const hid = document.getElementById('filtro-proveedor-id');
      const inp = document.getElementById('filtro-proveedor-busqueda');
      if (hid) hid.value = pid;
      if (inp) {
        const p = ProveedorBusqueda.obtenerPorId(pid);
        inp.value = p ? UI.labelProveedor(p) : (f.proveedor_label || '');
      }
    }
  } catch (_) { /* ignore */ }
}

function hayFiltrosCatalogoActivos() {
  const q = (document.getElementById('busqueda')?.value || '').trim();
  const tipo = document.getElementById('filtro-tipo')?.value || '';
  const prov = document.getElementById('filtro-proveedor-id')?.value || '';
  return !!(q || tipo || prov);
}

document.addEventListener('DOMContentLoaded', async () => {
  Auth.requiereAuth();
  renderSidebar();
  renderTopbar('Catálogo');

  const usuario = Auth.getUsuario();
  esAdminCatalogo = ['contabilidad', 'admin'].includes(usuario?.rol);
  puedeSolicitarReq = Auth.puedeHacer(['solicitante', 'contabilidad', 'admin']);

  const adminActions = document.getElementById('admin-actions');
  if (adminActions) {
    adminActions.style.display = esAdminCatalogo ? 'flex' : 'none';
  }

  CarritoReq.load();
  // No re-renderizar la tabla si aún no hay datos cargados (evita lista vacía fantasma)
  CarritoReq.onChange(() => {
    if (_catalogoData.length) {
      renderTablaCatalogo(_getCatalogoFiltradoActual(), _catalogoData.length);
    }
    actualizarBarraCarritoReq();
  });
  actualizarBarraCarritoReq();

  initProveedorBusquedaModalCatalogo();
  await ProveedorBusqueda.init({
    inputId: 'filtro-proveedor-busqueda',
    hiddenId: 'filtro-proveedor-id',
    datalistId: 'filtro-proveedores-list',
    placeholder: 'Proveedor (código o nombre)…',
    onChange: () => {
      // Solo refiltrar si ya hay catálogo cargado
      if (!_catalogoData.length) return;
      guardarFiltrosCatalogo();
      filtrarCatalogo();
    },
  });

  restaurarFiltrosCatalogo();
  await cargarUnidadesMedida();
  await cargarCatalogo({ preservarFiltros: true });

  // Abrir edición si se viene desde vista por proveedor
  try {
    const editarId = sessionStorage.getItem('oc_catalogo_editar_id');
    if (editarId && esAdminCatalogo) {
      sessionStorage.removeItem('oc_catalogo_editar_id');
      setTimeout(() => editarCatalogo(parseInt(editarId, 10)), 200);
    }
  } catch (_) { /* ignore */ }
});

async function cargarUnidadesMedida() {
  try {
    _unidadesMedida = await Api.get('/unidades-medida?soloActivas=true') || [];
  } catch {
    _unidadesMedida = [];
  }
  rellenarSelectUnidades();
}

function rellenarSelectUnidades(selected = '') {
  const sel = document.getElementById('cat-unidad');
  if (!sel || sel.tagName !== 'SELECT') return;
  const val = selected || sel.value || '';
  const opts = ['<option value="">— Seleccionar unidad —</option>'];
  _unidadesMedida.forEach((u) => {
    const cod = u.codigo || u.nombre;
    const label = u.codigo && u.nombre && u.codigo !== u.nombre
      ? `${u.codigo} — ${u.nombre}`
      : (u.nombre || u.codigo);
    opts.push(`<option value="${UI.esc(cod)}">${UI.esc(label)}</option>`);
  });
  sel.innerHTML = opts.join('');
  if (val) {
    // Si el valor actual no está en la lista (legacy), agregarlo temporalmente
    if (![...sel.options].some((o) => o.value === val)) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = val;
      sel.appendChild(o);
    }
    sel.value = val;
  }
}

// Carga desde API y guarda en cache (mantiene filtros de búsqueda)
async function cargarCatalogo({ preservarFiltros = true } = {}) {
  const contenedor = document.getElementById('tabla-catalogo');
  UI.spinner(contenedor);

  if (preservarFiltros) {
    guardarFiltrosCatalogo();
  }

  const soloActivos = document.getElementById('chk-activos')?.checked ?? true;
  const params = new URLSearchParams();
  if (soloActivos) params.append('soloActivos', 'true');

  try {
    const items = await Api.get(`/catalogo?${params.toString()}`);
    // Aceptar array directo o { datos: [] } por si el backend envuelve la respuesta
    _catalogoData = Array.isArray(items)
      ? items
      : (Array.isArray(items?.datos) ? items.datos : []);

    // Si el proveedor restaurado no aparece en los datos, quitar ese filtro
    const provId = document.getElementById('filtro-proveedor-id')?.value || '';
    if (provId && _catalogoData.length) {
      const existe = _catalogoData.some((i) => String(i.proveedor_id) === String(provId));
      if (!existe) {
        const hid = document.getElementById('filtro-proveedor-id');
        const inp = document.getElementById('filtro-proveedor-busqueda');
        if (hid) hid.value = '';
        if (inp) inp.value = '';
      }
    }

    filtrarCatalogo();

    // Si hay datos pero el filtro deja la lista en 0, limpiar filtros automáticamente una vez
    if (_catalogoData.length > 0 && _getCatalogoFiltradoActual().length === 0 && hayFiltrosCatalogoActivos()) {
      console.warn('[catálogo] Filtros sin resultados; se limpian para mostrar el catálogo.');
      limpiarFiltrosCatalogoUI();
      filtrarCatalogo();
      Toast.info('Se limpiaron filtros de búsqueda que no devolvían resultados.');
    }
  } catch (err) {
    console.error('Error cargando catálogo:', err);
    _catalogoData = [];
    UI.empty(contenedor, 'Error al cargar el catálogo');
    Toast.error(err.mensaje || 'No se pudo cargar el catálogo');
  }
}

function _getCatalogoFiltradoActual() {
  if (!Array.isArray(_catalogoData) || !_catalogoData.length) return [];

  const q         = (document.getElementById('busqueda')?.value ?? '').trim().toLowerCase();
  const tipo      = document.getElementById('filtro-tipo')?.value || '';
  const proveedor = (document.getElementById('filtro-proveedor-id')?.value || '').trim();

  return _catalogoData.filter(item => {
    const matchTipo = !tipo || item.tipo === tipo;
    const matchProv = !proveedor || String(item.proveedor_id ?? '') === String(proveedor);
    const matchQ    = !q ||
      (item.codigo           || '').toLowerCase().includes(q) ||
      (item.descripcion      || '').toLowerCase().includes(q) ||
      (item.proveedor_nombre || '').toLowerCase().includes(q) ||
      (item.proveedor_num    || '').toLowerCase().includes(q);
    return matchTipo && matchProv && matchQ;
  });
}

// Filtrado client-side por búsqueda + tipo + proveedor
function filtrarCatalogo(termino) {
  if (termino !== undefined) {
    const input = document.getElementById('busqueda');
    if (input && input.value !== termino) input.value = termino;
  }
  guardarFiltrosCatalogo();
  const filtrados = _getCatalogoFiltradoActual();
  renderTablaCatalogo(filtrados, _catalogoData.length);
}

function limpiarFiltrosYRecargar() {
  limpiarFiltrosCatalogoUI();
  cargarCatalogo({ preservarFiltros: false });
}

function renderTablaCatalogo(items, totalOriginal = null) {
  const contenedor = document.getElementById('tabla-catalogo');
  const contador   = document.getElementById('cat-contador');

  if (contador) {
    const total = totalOriginal ?? items.length;
    contador.textContent = totalOriginal !== null && items.length !== total
      ? `${items.length} de ${total} elementos`
      : `${total} elementos`;
  }

  if (!items.length) {
    if (totalOriginal != null && totalOriginal > 0) {
      contenedor.innerHTML = `
        <div class="empty-state" style="padding:28px;text-align:center;">
          <p style="margin:0 0 10px;color:#64748b;">Sin resultados para los filtros actuales
            <span style="display:block;font-size:12px;margin-top:4px;">(${totalOriginal} ítems cargados en total)</span>
          </p>
          <button type="button" class="btn btn-outline btn-sm" onclick="limpiarFiltrosYRecargar()">
            Limpiar filtros y ver todo
          </button>
        </div>`;
    } else {
      UI.empty(contenedor, 'No hay elementos en el catálogo');
    }
    return;
  }

  const tipoBadge = t => {
    const cls = (t || '').toLowerCase();
    return `<span class="badge badge-tipo ${cls}">${t}</span>`;
  };

  const rows = items.map(item => {
    const moneda = item.moneda || 'MXN';
    const costo  = item.costo_referencia != null && !isNaN(parseFloat(item.costo_referencia))
      ? parseFloat(item.costo_referencia).toLocaleString('es-MX', { minimumFractionDigits: 2 })
      : '—';

    const provCell = item.proveedor_num
      ? `<span title="${(item.proveedor_nombre || '').replace(/"/g,'&quot;')}"
              style="cursor:help;font-size:12px;font-family:monospace">${item.proveedor_num}</span>`
      : '<span class="text-muted">—</span>';

    const estadoBadge = item.activo
      ? '<span class="badge badge-aprobado">Activo</span>'
      : '<span class="badge badge-rechazado">Inactivo</span>';

    const accionesAdmin = esAdminCatalogo ? `
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-outline" onclick="editarCatalogo(${item.id})"
                title="Editar" style="padding:2px 6px;">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
               viewBox="0 0 24 24" style="vertical-align:-1px;">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-sm ${item.activo ? 'btn-danger' : 'btn-success'}"
                onclick="cambiarEstadoCatalogo(${item.id}, ${!item.activo})"
                title="${item.activo ? 'Desactivar' : 'Activar'}" style="padding:2px 6px;">
          ${item.activo
            ? '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>'
            : '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px;"><path d="M20 6L9 17l-5-5"/></svg>'}
        </button>
        ${!item.activo ? `
        <button class="btn btn-sm btn-outline" onclick="eliminarCatalogoDesactivado(${item.id}, '${String(item.codigo || '').replace(/'/g, "\\'")}')"
                title="Eliminar definitivamente (solo desactivados)" style="padding:2px 6px;color:#b91c1c;border-color:#fca5a5;">
          🗑
        </button>` : ''}
      </div>` : '';

    const yaEnCarrito = puedeSolicitarReq && item.activo && CarritoReq.tiene(item.id);
    const celdaSolicitar = (puedeSolicitarReq && item.activo) ? `
      <div class="d-flex gap-1 align-items-center" style="flex-wrap:nowrap;">
        ${yaEnCarrito ? `
          <span class="cat-added-badge" style="font-size:11px;">✓ En solicitud</span>
        ` : `
          <input type="number" id="cat-qty-${item.id}" class="form-control" value="1" min="1" step="1"
                 style="width:56px; padding:2px 6px; font-size:12px;" title="Cantidad">
          <button type="button" class="btn btn-sm btn-primary" style="white-space:nowrap; font-size:11px;"
                  onclick="agregarItemCatalogoAlCarrito(${item.id})">
            + Agregar
          </button>
        `}
      </div>` : '<span class="text-muted">—</span>';

    const unidad = item.unidad || '—';

    return `<tr>
      <td><strong>${item.codigo}</strong></td>
      <td style="max-width:280px">${item.descripcion || '—'}</td>
      <td>${tipoBadge(item.tipo)}</td>
      <td>${unidad}</td>
      <td style="text-align:right">${costo}</td>
      <td><span style="font-size:11px;font-weight:600;color:var(--muted)">${moneda}</span></td>
      <td>${provCell}</td>
      <td>${estadoBadge}</td>
      ${puedeSolicitarReq ? `<td>${celdaSolicitar}</td>` : ''}
      ${esAdminCatalogo ? `<td>${accionesAdmin}</td>` : ''}
    </tr>`;
  }).join('');

  contenedor.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Código</th><th>Descripción</th><th>Tipo</th><th>Unidad</th>
          <th style="text-align:right">Costo ref.</th><th>Moneda</th>
          <th>Proveedor</th><th>Estado</th>
          ${puedeSolicitarReq ? '<th>Solicitar</th>' : ''}
          ${esAdminCatalogo ? '<th>Acciones</th>' : ''}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function agregarItemCatalogoAlCarrito(catalogoId) {
  const item = _catalogoData.find((i) => i.id === catalogoId);
  if (!item) return;

  const qtyInput = document.getElementById(`cat-qty-${catalogoId}`);
  const cantidad = qtyInput ? parseFloat(qtyInput.value) || 1 : 1;
  const resultado = CarritoReq.agregar(item, cantidad);

  if (CarritoReqUI.notificarAgregado(resultado)) {
    renderTablaCatalogo(_getCatalogoFiltradoActual(), _catalogoData.length);
    actualizarBarraCarritoReq();
  }
}

function actualizarBarraCarritoReq() {
  const bar = document.getElementById('carrito-req-bar');
  if (!bar || !puedeSolicitarReq) return;

  const n = CarritoReq.count();
  bar.style.display = n > 0 ? 'block' : 'none';
  document.body.classList.toggle('catalogo-con-carrito', n > 0);

  const titulo = document.getElementById('carrito-req-titulo');
  const sub = document.getElementById('carrito-req-sub');
  if (titulo) {
    titulo.textContent = n === 1 ? '1 ítem en tu solicitud' : `${n} ítems en tu solicitud`;
  }
  if (sub) {
    const bloqueado = CarritoReq.getProveedorBloqueado();
    sub.textContent = bloqueado
      ? `Proveedor: ${CarritoReq.labelProveedor(bloqueado)} — solo ítems de este proveedor`
      : '';
  }

  const detalle = document.getElementById('carrito-req-detalle');
  if (detalle && detalle.style.display !== 'none') {
    renderDetalleCarritoReq();
  }
}

function renderDetalleCarritoReq() {
  const detalle = document.getElementById('carrito-req-detalle');
  if (!detalle) return;

  const items = CarritoReq.getItems();
  if (!items.length) {
    detalle.innerHTML = '';
    detalle.style.display = 'none';
    return;
  }

  detalle.innerHTML = `
    <div class="carrito-req-detalle-list">
      ${items.map((item) => `
        <div class="carrito-req-detalle-row">
          <span class="carrito-req-detalle-code">${item.codigo}</span>
          <span class="carrito-req-detalle-desc" title="${(item.descripcion || '').replace(/"/g, '&quot;')}">${item.descripcion}</span>
          <span class="carrito-req-detalle-qty">×${item.cantidad}</span>
          <button type="button" class="libre-del-btn" title="Quitar"
                  onclick="quitarItemCarritoReq(${item.catalogo_id})">×</button>
        </div>
      `).join('')}
    </div>`;
}

function toggleDetalleCarritoReq() {
  const detalle = document.getElementById('carrito-req-detalle');
  if (!detalle) return;
  const visible = detalle.style.display !== 'none';
  if (visible) {
    detalle.style.display = 'none';
    detalle.innerHTML = '';
  } else {
    renderDetalleCarritoReq();
    detalle.style.display = 'block';
  }
}

function quitarItemCarritoReq(catalogoId) {
  CarritoReq.eliminar(catalogoId);
  renderTablaCatalogo(_getCatalogoFiltradoActual(), _catalogoData.length);
  actualizarBarraCarritoReq();
}

function vaciarCarritoReq() {
  if (!CarritoReq.count()) return;
  if (!confirm('¿Vaciar todos los ítems de tu solicitud?')) return;
  CarritoReq.vaciar();
  renderTablaCatalogo(_getCatalogoFiltradoActual(), _catalogoData.length);
  actualizarBarraCarritoReq();
  Toast.info('Solicitud vaciada');
}

async function cargarProveedoresLista() {
  if (proveedoresCache.length) return proveedoresCache;

  try {
    proveedoresCache = await Api.get('/proveedores?activos=true');
  } catch (err) {
    console.warn('No se pudieron cargar proveedores');
    proveedoresCache = [];
  }

  return proveedoresCache;
}

async function initProveedorBusquedaModalCatalogo() {
  if (!esAdminCatalogo) return;
  await ProveedorBusqueda.init({
    inputId: 'cat-proveedor-busqueda',
    hiddenId: 'cat-proveedor-id',
    datalistId: 'cat-proveedores-list',
    placeholder: 'Buscar por código o nombre…',
  });
}

function abrirModalCatalogo(item = null) {
  if (!esAdminCatalogo) return;

  const modal = document.getElementById('modal-catalogo');
  const form = document.getElementById('form-catalogo');
  const titulo = document.getElementById('modal-catalogo-titulo');

  form.reset();
  document.getElementById('catalogo-id').value = '';
  limpiarErroresModal();

  if (item) {
    // Modo edición
    titulo.textContent = 'Editar elemento del catálogo';
    document.getElementById('catalogo-id').value = item.id;
    document.getElementById('cat-tipo').value = item.tipo || '';
    document.getElementById('cat-codigo').value = item.codigo || '';
    document.getElementById('cat-descripcion').value = item.descripcion || '';
    document.getElementById('cat-costo').value = item.costo_referencia || '';
    document.getElementById('cat-moneda').value = item.moneda || 'MXN';
    rellenarSelectUnidades(item.unidad || '');
    ProveedorBusqueda.establecer(
      document.getElementById('cat-proveedor-busqueda'),
      document.getElementById('cat-proveedor-id'),
      item.proveedor_id || ''
    );
  } else {
    titulo.textContent = 'Nuevo elemento del catálogo';
    document.getElementById('cat-moneda').value = 'MXN';
    rellenarSelectUnidades('');
    ProveedorBusqueda.limpiar(
      document.getElementById('cat-proveedor-busqueda'),
      document.getElementById('cat-proveedor-id')
    );
  }

  modal.style.display = 'flex';

  // Auto-focus primer campo
  setTimeout(() => {
    document.getElementById('cat-tipo').focus();
  }, 150);

  // Limpiar errores al escribir/cambiar
  const campos = ['cat-tipo', 'cat-codigo', 'cat-descripcion', 'cat-costo'];
  campos.forEach(idCampo => {
    const input = document.getElementById(idCampo);
    if (input) {
      const handler = () => {
        const errorId = idCampo.replace('cat-', 'error-cat-');
        const errorEl = document.getElementById(errorId);
        if (errorEl) errorEl.textContent = '';
      };
      input.oninput = handler;
      input.onchange = handler; // para el select de tipo
    }
  });
}

function limpiarErroresModal() {
  const campos = ['tipo', 'codigo', 'descripcion', 'costo'];
  campos.forEach(campo => {
    const el = document.getElementById(`error-cat-${campo}`);
    if (el) el.textContent = '';
  });
}

function mostrarErrorCampo(campo, mensaje) {
  const el = document.getElementById(`error-cat-${campo}`);
  if (el) el.textContent = mensaje;
}

function cerrarModalCatalogo() {
  const modal = document.getElementById('modal-catalogo');
  modal.style.display = 'none';
}

async function guardarCatalogo(e) {
  e.preventDefault();

  const btnGuardar = document.getElementById('btn-guardar-catalogo');
  const id = document.getElementById('catalogo-id').value;

  // Limpiar errores previos
  limpiarErroresModal();

  // Recopilar datos
  const tipo = document.getElementById('cat-tipo').value;
  const codigo = document.getElementById('cat-codigo').value.trim();
  const descripcion = document.getElementById('cat-descripcion').value.trim();
  const costoStr = document.getElementById('cat-costo').value;
  const moneda = document.getElementById('cat-moneda').value || 'MXN';
  const unidadEl = document.getElementById('cat-unidad');
  const unidad = (unidadEl?.value || '').trim() || null;
  const provInput  = document.getElementById('cat-proveedor-busqueda');
  const provHidden = document.getElementById('cat-proveedor-id');
  ProveedorBusqueda.resolver(provInput, provHidden);
  const proveedor_id = provHidden?.value || null;

  let tieneErrores = false;

  // Validaciones cliente
  if (!tipo) {
    mostrarErrorCampo('tipo', 'El tipo es obligatorio');
    tieneErrores = true;
  }

  if (!codigo) {
    mostrarErrorCampo('codigo', 'El código es obligatorio');
    tieneErrores = true;
  }

  if (!descripcion) {
    mostrarErrorCampo('descripcion', 'La descripción es obligatoria');
    tieneErrores = true;
  }

  let costo = null;
  if (costoStr && costoStr.trim() !== '') {
    costo = parseFloat(costoStr);
    if (isNaN(costo) || costo < 0) {
      mostrarErrorCampo('costo', 'El costo de referencia debe ser un número mayor o igual a 0');
      tieneErrores = true;
    }
  }

  if (tieneErrores) {
    return;
  }

  const datos = {
    tipo,
    codigo,
    descripcion,
    unidad,
    costo_referencia: costo,
    moneda,
    proveedor_id
  };

  // Estado de carga
  const textoOriginal = btnGuardar.textContent;
  btnGuardar.disabled = true;
  btnGuardar.textContent = id ? 'Actualizando...' : 'Guardando...';

  try {
    if (id) {
      await Api.put(`/catalogo/${id}`, datos);
      Toast.success('Elemento actualizado correctamente');
    } else {
      await Api.post('/catalogo', datos);
      Toast.success('Elemento creado correctamente');
    }

    cerrarModalCatalogo();
    // Mantiene filtros de búsqueda al regresar a la lista
    await cargarCatalogo({ preservarFiltros: true });
  } catch (err) {
    const mensaje = err.mensaje || 'Error al guardar el elemento';

    // Manejo de error específico de código duplicado
    if (mensaje.toLowerCase().includes('código') || mensaje.toLowerCase().includes('codigo')) {
      mostrarErrorCampo('codigo', mensaje);
    } else {
      Toast.error(mensaje);
    }
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = textoOriginal;
  }
}

async function editarCatalogo(id) {
  try {
    const item = await Api.get(`/catalogo/${id}`);
    abrirModalCatalogo(item);
  } catch (err) {
    Toast.error('No se pudo cargar el elemento');
  }
}

async function cambiarEstadoCatalogo(id, nuevoEstado) {
  const accion = nuevoEstado ? 'activar' : 'desactivar';
  if (!confirm(`¿Seguro que deseas ${accion} este elemento?`)) return;

  try {
    await Api.patch(`/catalogo/${id}/estado`, { activo: nuevoEstado });
    Toast.success(`Elemento ${nuevoEstado ? 'activado' : 'desactivado'} correctamente`);
    await cargarCatalogo({ preservarFiltros: true });
  } catch (err) {
    Toast.error(err.mensaje || 'Error al cambiar el estado');
  }
}

async function eliminarCatalogoDesactivado(id, codigo) {
  if (!confirm(
    `¿Eliminar definitivamente el ítem desactivado "${codigo || id}"?\n\n`
    + 'Solo se borra del catálogo si no tiene registros relacionados (REQ/OC). '
    + 'Los históricos no se eliminan.'
  )) return;

  try {
    const data = await Api.delete(`/catalogo/${id}`);
    Toast.success(data.mensaje || 'Ítem eliminado');
    await cargarCatalogo({ preservarFiltros: true });
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudo eliminar el ítem');
  }
}

async function cargarCatalogoDesdeExcel(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  input.value = ''; // reset for reuse

  if (!esAdminCatalogo) {
    Toast.error('No tienes permisos para cargar desde Excel');
    return;
  }

  try {
    Toast.info('Procesando archivo Excel del catálogo (alta y actualización por código)…');

    const data = await Api.uploadFile('/catalogo/import', file, 'excel');

    Toast.success(
      data.mensaje
      || `Carga correcta. Nuevos: ${data.nuevos || 0}, actualizados: ${data.actualizados || 0}.`
    );
    await cargarUnidadesMedida();
    await cargarCatalogo({ preservarFiltros: true });
  } catch (err) {
    Toast.error(err.mensaje || 'Error al cargar el archivo Excel');
  }
}

async function exportarCatalogoExcel() {
  if (!esAdminCatalogo) {
    Toast.error('No tienes permisos para exportar el catálogo');
    return;
  }
  try {
    const soloActivos = document.getElementById('chk-activos')?.checked ?? true;
    const qs = soloActivos ? '?soloActivos=true' : '';
    Toast.info('Generando Excel del catálogo…');
    // Descarga con token: usa fetch directo por blob
    const token = Auth.getToken();
    const res = await fetch(`${API_BASE}/catalogo/export${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let msg = 'Error al exportar';
      try { const j = await res.json(); msg = j.mensaje || msg; } catch (_) {}
      throw { mensaje: msg };
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `catalogo_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    Toast.success('Excel descargado (mismo formato de carga)');
  } catch (err) {
    Toast.error(err.mensaje || 'Error al exportar el catálogo');
  }
}

async function abrirModalUnidades() {
  if (!esAdminCatalogo) return;
  await cargarUnidadesMedidaAdmin();
  const modal = document.getElementById('modal-unidades');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('show');
  }
}

function cerrarModalUnidades() {
  const modal = document.getElementById('modal-unidades');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
  }
}

async function cargarUnidadesMedidaAdmin() {
  const cont = document.getElementById('lista-unidades-admin');
  if (!cont) return;
  UI.spinner(cont);
  try {
    const todas = await Api.get('/unidades-medida?soloActivas=false') || [];
    _unidadesMedida = todas.filter((u) => u.activo);
    rellenarSelectUnidades();
    if (!todas.length) {
      UI.empty(cont, 'No hay unidades registradas');
      return;
    }
    cont.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Código</th><th>Nombre</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${todas.map((u) => `
              <tr>
                <td class="fw-600">${UI.esc(u.codigo)}</td>
                <td>${UI.esc(u.nombre)}</td>
                <td>${u.activo ? '<span class="badge badge-aprobado">Activa</span>' : '<span class="badge badge-rechazado">Inactiva</span>'}</td>
                <td>
                  <button type="button" class="btn btn-sm btn-outline" style="padding:2px 6px;"
                    onclick="editarUnidadMedida(${u.id}, '${String(u.codigo).replace(/'/g, "\\'")}', '${String(u.nombre).replace(/'/g, "\\'")}', ${u.activo ? 1 : 0})">✎</button>
                  ${u.activo ? `<button type="button" class="btn btn-sm btn-outline" style="padding:2px 6px;"
                    onclick="desactivarUnidadMedida(${u.id})">Desactivar</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    UI.empty(cont, 'Error al cargar unidades');
    Toast.error(err.mensaje || 'Error al cargar unidades');
  }
}

async function guardarUnidadMedida(e) {
  e.preventDefault();
  const id = document.getElementById('unidad-id')?.value;
  const codigo = document.getElementById('unidad-codigo')?.value?.trim();
  const nombre = document.getElementById('unidad-nombre')?.value?.trim();
  if (!codigo || !nombre) {
    Toast.error('Código y nombre son obligatorios');
    return;
  }
  try {
    if (id) {
      await Api.put(`/unidades-medida/${id}`, { codigo, nombre, activo: true });
      Toast.success('Unidad actualizada');
    } else {
      await Api.post('/unidades-medida', { codigo, nombre });
      Toast.success('Unidad creada');
    }
    document.getElementById('form-unidad')?.reset();
    const hid = document.getElementById('unidad-id');
    if (hid) hid.value = '';
    await cargarUnidadesMedidaAdmin();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al guardar unidad');
  }
}

function editarUnidadMedida(id, codigo, nombre, activo) {
  const hid = document.getElementById('unidad-id');
  const c = document.getElementById('unidad-codigo');
  const n = document.getElementById('unidad-nombre');
  if (hid) hid.value = id;
  if (c) c.value = codigo;
  if (n) n.value = nombre;
  if (c) c.focus();
}

async function desactivarUnidadMedida(id) {
  if (!confirm('¿Desactivar esta unidad de medida?')) return;
  try {
    await Api.delete(`/unidades-medida/${id}`);
    Toast.success('Unidad desactivada');
    await cargarUnidadesMedidaAdmin();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al desactivar');
  }
}

window.cargarCatalogoDesdeExcel = cargarCatalogoDesdeExcel;
window.exportarCatalogoExcel = exportarCatalogoExcel;
window.eliminarCatalogoDesactivado = eliminarCatalogoDesactivado;
window.abrirModalUnidades = abrirModalUnidades;
window.cerrarModalUnidades = cerrarModalUnidades;
window.guardarUnidadMedida = guardarUnidadMedida;
window.editarUnidadMedida = editarUnidadMedida;
window.desactivarUnidadMedida = desactivarUnidadMedida;

// Exponer funciones útiles
// Ojo: en scripts clásicos (no module), function cargarCatalogo ya es window.cargarCatalogo.
// NO reasignar con () => cargarCatalogo(...) — provoca recursión infinita.
window.cargarCatalogo              = cargarCatalogo;
window.filtrarCatalogo             = filtrarCatalogo;
window.limpiarFiltrosYRecargar     = limpiarFiltrosYRecargar;
window.abrirModalCatalogo          = abrirModalCatalogo;
window.editarCatalogo              = editarCatalogo;
window.cambiarEstadoCatalogo       = cambiarEstadoCatalogo;
window.cerrarModalCatalogo         = cerrarModalCatalogo;
window.guardarCatalogo             = guardarCatalogo;
window.agregarItemCatalogoAlCarrito = agregarItemCatalogoAlCarrito;
window.actualizarBarraCarritoReq   = actualizarBarraCarritoReq;
window.toggleDetalleCarritoReq     = toggleDetalleCarritoReq;
window.vaciarCarritoReq            = vaciarCarritoReq;
window.quitarItemCarritoReq        = quitarItemCarritoReq;