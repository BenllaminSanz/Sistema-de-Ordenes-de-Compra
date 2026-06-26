/* ============================================================
   catalogo.js — Lógica de la página de Consulta y Administración del Catálogo
   ============================================================ */

let esAdminCatalogo = false;
let proveedoresCache = [];
let _catalogoData   = [];   // cache para filtrado client-side

document.addEventListener('DOMContentLoaded', () => {
  Auth.requiereAuth();
  renderSidebar();
  renderTopbar('Catálogo');

  const usuario = Auth.getUsuario();
  esAdminCatalogo = ['contabilidad', 'admin'].includes(usuario?.rol);

  const adminActions = document.getElementById('admin-actions');
  if (adminActions) {
    adminActions.style.display = esAdminCatalogo ? 'flex' : 'none';
  }

  cargarProveedoresParaSelect();
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

// Filtrado client-side por búsqueda + tipo
function filtrarCatalogo(termino) {
  const q    = (termino ?? document.getElementById('busqueda')?.value ?? '').trim().toLowerCase();
  const tipo = document.getElementById('filtro-tipo')?.value || '';

  const filtrados = _catalogoData.filter(item => {
    const matchTipo = !tipo || item.tipo === tipo;
    const matchQ    = !q ||
      (item.codigo      || '').toLowerCase().includes(q) ||
      (item.descripcion || '').toLowerCase().includes(q) ||
      (item.proveedor_nombre || '').toLowerCase().includes(q);
    return matchTipo && matchQ;
  });

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

    const acciones = esAdminCatalogo ? `
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

    return `<tr>
      <td><strong>${item.codigo}</strong></td>
      <td style="max-width:280px">${item.descripcion || '—'}</td>
      <td>${tipoBadge(item.tipo)}</td>
      <td style="text-align:right">${costo}</td>
      <td><span style="font-size:11px;font-weight:600;color:var(--muted)">${moneda}</span></td>
      <td>${provCell}</td>
      <td>${estadoBadge}</td>
      ${esAdminCatalogo ? `<td>${acciones}</td>` : ''}
    </tr>`;
  }).join('');

  contenedor.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Código</th><th>Descripción</th><th>Tipo</th>
          <th style="text-align:right">Costo ref.</th><th>Moneda</th>
          <th>Proveedor</th><th>Estado</th>
          ${esAdminCatalogo ? '<th>Acciones</th>' : ''}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Cargar proveedores para el selector del modal
async function cargarProveedoresParaSelect() {
  if (!esAdminCatalogo) return;

  try {
    const proveedores = await Api.get('/proveedores?soloActivos=true');
    proveedoresCache = proveedores;

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
  } catch (err) {
    console.warn('No se pudieron cargar proveedores para el selector');
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
window.cargarCatalogo    = cargarCatalogo;
window.filtrarCatalogo   = filtrarCatalogo;
window.abrirModalCatalogo = abrirModalCatalogo;