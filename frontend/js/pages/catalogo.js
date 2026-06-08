/* ============================================================
   catalogo.js — Lógica de la página de Consulta y Administración del Catálogo
   ============================================================ */

let esAdminCatalogo = false;
let proveedoresCache = [];

document.addEventListener('DOMContentLoaded', () => {
  Auth.requiereAuth();
  renderSidebar();
  renderTopbar();

  const usuario = Auth.getUsuario();
  esAdminCatalogo = ['contabilidad', 'admin'].includes(usuario?.rol);

  // Mostrar botones de administración si corresponde
  const adminActions = document.getElementById('admin-actions');
  if (adminActions) {
    adminActions.style.display = esAdminCatalogo ? 'block' : 'none';
  }

  cargarProveedoresParaSelect();
  cargarCatalogo();
});

async function cargarCatalogo() {
  const contenedor = document.getElementById('tabla-catalogo');
  contenedor.innerHTML = '<p class="text-muted">Cargando catálogo...</p>';

  try {
    const busqueda = document.getElementById('busqueda')?.value.trim() || '';
    const tipo = document.getElementById('filtro-tipo')?.value || '';
    const soloActivos = document.getElementById('chk-activos')?.checked ?? true;

    const params = new URLSearchParams();
    if (busqueda) params.append('busqueda', busqueda);
    if (tipo) params.append('tipo', tipo);
    if (soloActivos) params.append('soloActivos', 'true');

    const items = await Api.get(`/catalogo?${params.toString()}`);

    if (!items || items.length === 0) {
      contenedor.innerHTML = `<p class="text-muted text-center py-4">No se encontraron elementos en el catálogo.</p>`;
      return;
    }

    let html = `
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Código</th>
            <th>Descripción</th>
            <th>Tipo</th>
            <th class="text-end">Costo Referencia</th>
            <th>Moneda</th>
            <th>Proveedor</th>
            <th>Estado</th>
            ${esAdminCatalogo ? '<th style="width: 140px;">Acciones</th>' : ''}
          </tr>
        </thead>
        <tbody>
    `;

    items.forEach(item => {
      const estado = item.activo 
        ? `<span class="badge bg-success">Activo</span>` 
        : `<span class="badge bg-secondary">Inactivo</span>`;

      const moneda = item.moneda || 'MXN';
      const costo = (item.costo_referencia != null && !isNaN(parseFloat(item.costo_referencia)))
        ? parseFloat(item.costo_referencia).toLocaleString('es-MX', { minimumFractionDigits: 2 })
        : '—';

      const provNum = item.proveedor_num || '';
      const provNombre = (item.proveedor_nombre || '').replace(/"/g, '&quot;');
      const proveedorCell = provNum
        ? `<code title="${provNombre}" style="cursor:help; font-size:12px;">${provNum}</code>`
        : '<span class="text-muted">—</span>';

      let acciones = '';
      if (esAdminCatalogo) {
        acciones = `
          <button class="btn btn-sm btn-outline" onclick="editarCatalogo(${item.id})" title="Editar" style="padding:2px 6px;">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-1px;">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn-sm ${item.activo ? 'btn-danger' : 'btn-success'}" 
                  onclick="cambiarEstadoCatalogo(${item.id}, ${!item.activo})" 
                  title="${item.activo ? 'Desactivar' : 'Activar'}" style="padding:2px 6px;">
            ${item.activo 
              ? `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>` 
              : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px;"><path d="M20 6L9 17l-5-5"/></svg>`}
          </button>
        `;
      }

      html += `
        <tr>
          <td><strong>${item.codigo}</strong></td>
          <td>${item.descripcion || '—'}</td>
          <td><span class="badge bg-light text-dark">${item.tipo}</span></td>
          <td class="text-end">${costo === '—' ? '—' : costo}</td>
          <td><span class="badge bg-light text-dark">${moneda}</span></td>
          <td>${proveedorCell}</td>
          <td>${estado}</td>
          ${esAdminCatalogo ? `<td class="d-flex gap-1">${acciones}</td>` : ''}
        </tr>
      `;
    });

    html += `</tbody></table>`;
    contenedor.innerHTML = html;

  } catch (err) {
    console.error('Error cargando catálogo:', err);
    contenedor.innerHTML = `<p class="text-danger">Error al cargar el catálogo.</p>`;
    Toast.error('No se pudo cargar el catálogo');
  }
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

// Exponer funciones útiles
window.cargarCatalogo = cargarCatalogo;
window.abrirModalCatalogo = abrirModalCatalogo;