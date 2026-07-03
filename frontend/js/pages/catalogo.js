/* ============================================================
   catalogo.js — Lógica de la página de Consulta y Administración del Catálogo
   ============================================================ */

let esAdminCatalogo = false;
let puedeSolicitarReq = false;
let proveedoresCache = [];
let _catalogoData   = [];   // cache para filtrado client-side

document.addEventListener('DOMContentLoaded', () => {
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
  CarritoReq.onChange(() => renderTablaCatalogo(_getCatalogoFiltradoActual()));
  actualizarBarraCarritoReq();

  cargarProveedoresParaSelect();
  cargarProveedoresParaFiltro();
  cargarCatalogo();
});

// Carga desde API y guarda en cache
async function cargarCatalogo() {
  const contenedor = document.getElementById('tabla-catalogo');
  UI.spinner(contenedor);

  // Limpiar búsqueda al recargar
  const inputBusq = document.getElementById('busqueda');
  if (inputBusq) inputBusq.value = '';

  const soloActivos = document.getElementById('chk-activos')?.checked ?? true;
  const params = new URLSearchParams();
  if (soloActivos) params.append('soloActivos', 'true');

  try {
    const items = await Api.get(`/catalogo?${params.toString()}`);
    _catalogoData = items || [];
    renderTablaCatalogo(_catalogoData);
  } catch (err) {
    console.error('Error cargando catálogo:', err);
    UI.empty(contenedor, 'Error al cargar el catálogo');
    Toast.error('No se pudo cargar el catálogo');
  }
}

function _getCatalogoFiltradoActual() {
  const q         = (document.getElementById('busqueda')?.value ?? '').trim().toLowerCase();
  const tipo      = document.getElementById('filtro-tipo')?.value || '';
  const proveedor = document.getElementById('filtro-proveedor')?.value || '';

  return _catalogoData.filter(item => {
    const matchTipo = !tipo || item.tipo === tipo;
    const matchProv = !proveedor || String(item.proveedor_id) === String(proveedor);
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
  const filtrados = _getCatalogoFiltradoActual();
  renderTablaCatalogo(filtrados, _catalogoData.length);
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
    UI.empty(contenedor, totalOriginal !== null
      ? 'Sin resultados para esa búsqueda'
      : 'No hay elementos en el catálogo');
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
    proveedoresCache = await Api.get('/proveedores?soloActivos=true');
  } catch (err) {
    console.warn('No se pudieron cargar proveedores');
    proveedoresCache = [];
  }

  return proveedoresCache;
}

// Cargar proveedores para el selector del modal
async function cargarProveedoresParaSelect() {
  if (!esAdminCatalogo) return;

  const proveedores = await cargarProveedoresLista();
  const select = document.getElementById('cat-proveedor');
  if (select) {
    select.innerHTML = '<option value="">Sin proveedor asignado</option>';
    proveedores.forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = UI.labelProveedor(p);
      select.appendChild(option);
    });
  }
}

async function cargarProveedoresParaFiltro() {
  const proveedores = await cargarProveedoresLista();
  const filtro = document.getElementById('filtro-proveedor');
  if (!filtro) return;

  const previo = filtro.value;
  filtro.innerHTML = '<option value="">Todos los proveedores</option>';
  proveedores.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = UI.labelProveedor(p);
    filtro.appendChild(option);
  });

  if (previo && [...filtro.options].some(o => String(o.value) === String(previo))) {
    filtro.value = previo;
  }
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
    document.getElementById('cat-unidad').value = item.unidad || '';
    document.getElementById('cat-proveedor').value = item.proveedor_id || '';
  } else {
    titulo.textContent = 'Nuevo elemento del catálogo';
    document.getElementById('cat-moneda').value = 'MXN';
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
  const unidad = document.getElementById('cat-unidad').value.trim() || null;
  const proveedor_id = document.getElementById('cat-proveedor').value || null;

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
    cargarCatalogo();
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
    cargarCatalogo();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al cambiar el estado');
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
    Toast.info('Procesando archivo Excel del catálogo...');

    const data = await Api.uploadFile('/catalogo/import', file, 'excel');

    Toast.success(data.mensaje || `Carga correcta. Se importaron ${data.nuevos || 0} elementos.`);
    cargarCatalogo();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al cargar el archivo Excel');
  }
}

window.cargarCatalogoDesdeExcel = cargarCatalogoDesdeExcel;

// Exponer funciones útiles
window.cargarCatalogo              = cargarCatalogo;
window.filtrarCatalogo             = filtrarCatalogo;
window.abrirModalCatalogo          = abrirModalCatalogo;
window.agregarItemCatalogoAlCarrito = agregarItemCatalogoAlCarrito;
window.actualizarBarraCarritoReq   = actualizarBarraCarritoReq;
window.toggleDetalleCarritoReq     = toggleDetalleCarritoReq;
window.vaciarCarritoReq            = vaciarCarritoReq;
window.quitarItemCarritoReq        = quitarItemCarritoReq;