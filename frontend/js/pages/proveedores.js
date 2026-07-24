/**
 * proveedores.js
 * Lógica de la página de Proveedores
 */

Auth.requiereAuth();

// Solo contabilidad y admin pueden acceder
if (!Auth.puedeHacer(['contabilidad','admin'])) {
  window.location.href = 'dashboard.html';
}

renderSidebar();
renderTopbar('Proveedores');
cargarProveedores();

let editandoId = null;

// Cache local de proveedores para búsqueda client-side
let _proveedoresData = [];

// Delegación de eventos en la tabla de proveedores
const tablaProveedores = document.getElementById('tabla-proveedores');
if (tablaProveedores) {
  window.delegate(tablaProveedores, 'button[data-action]', 'click', (e, btn) => {
    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id);

    if (action === 'editar') {
      abrirModalProveedor(id);
    }
    if (action === 'toggle') {
      const activo = btn.dataset.activo === 'true' || btn.dataset.activo === '1';
      toggleActivo(id, activo);
    }
  });
}

async function cargarProveedores() {
  const contenedor = document.getElementById('tabla-proveedores');
  UI.spinner(contenedor);
  const soloActivos = document.getElementById('chk-activos').checked;
  // Limpiar búsqueda al recargar
  const inputBusq = document.getElementById('busq-proveedor');
  if (inputBusq) inputBusq.value = '';

  try {
    const provs = await Api.get('/proveedores' + (soloActivos ? '?activos=true' : ''));
    _proveedoresData = provs;
    renderTablaProveedores(provs);
  } catch (err) {
    UI.empty(contenedor, 'Error al cargar proveedores');
    Toast.error(err.mensaje || 'Error');
  }
}

/** Filtra el array en memoria y re-renderiza sin llamar al API */
function filtrarProveedores(termino) {
  const q = termino.trim().toLowerCase();
  if (!q) {
    renderTablaProveedores(_proveedoresData);
    return;
  }
  const filtrados = _proveedoresData.filter(p =>
    (p.nombre        || '').toLowerCase().includes(q) ||
    (p.num_proveedor || '').toLowerCase().includes(q) ||
    (p.email         || '').toLowerCase().includes(q) ||
    (p.rfc           || '').toLowerCase().includes(q)
  );
  renderTablaProveedores(filtrados, _proveedoresData.length);
}

function renderTablaProveedores(provs, totalOriginal = null) {
  const contenedor = document.getElementById('tabla-proveedores');
  const contador   = document.getElementById('prov-contador');

  // Actualizar contador
  if (contador) {
    const total = totalOriginal ?? provs.length;
    contador.textContent = totalOriginal !== null && provs.length !== total
      ? `${provs.length} de ${total} proveedores`
      : `${total} proveedores`;
  }

  if (!provs.length) {
    UI.empty(contenedor, totalOriginal !== null
      ? 'Sin resultados para esa búsqueda'
      : 'No hay proveedores registrados');
    return;
  }

  contenedor.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:85px;min-width:70px">No.</th>
          <th>Nombre</th>
          <th>Email</th>
          <th>Teléfono</th>
          <th>RFC</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr></thead>
        <tbody>${provs.map(p => `
          <tr>
            <td><code>${p.num_proveedor || '—'}</code></td>
            <td class="fw-600">${p.nombre}</td>
            <td>
              ${p.email
                ? `<span class="copy-text" data-copy="${p.email}"
                        title="Clic para copiar"
                        style="cursor:pointer;border-bottom:1px dashed var(--text-muted)"
                   >${p.email}</span>`
                : '—'}
            </td>
            <td>${p.telefono || '—'}</td>
            <td>${p.rfc || '—'}</td>
            <td>${p.activo
                  ? '<span class="badge badge-aprobado">Activo</span>'
                  : '<span class="badge badge-rechazado">Inactivo</span>'}</td>
            <td>
              <div class="d-flex gap-2">
                <button class="btn btn-sm btn-outline" data-action="editar" data-id="${p.id}"
                        title="Editar proveedor" style="padding:2px 6px;">
                  <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-1px;">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                ${Auth.puedeHacer(['admin'])
                  ? `<button class="btn btn-sm ${p.activo ? 'btn-danger' : 'btn-success'}"
                             data-action="toggle" data-id="${p.id}" data-activo="${p.activo ? 'true' : 'false'}"
                             title="${p.activo ? 'Desactivar' : 'Activar'}" style="padding:2px 6px;">
                       ${p.activo
                         ? `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
                         : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px;"><path d="M20 6L9 17l-5-5"/></svg>`}
                     </button>`
                  : ''}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  // Copiar al portapapeles al hacer clic en email
  contenedor.querySelectorAll('.copy-text').forEach(el => {
    el.addEventListener('click', () => {
      navigator.clipboard.writeText(el.dataset.copy).then(() => {
        Toast.success('Email copiado');
      });
    });
  });
}

function normalizarNumProveedor(valor) {
  const limpio = String(valor || '').replace(/\D/g, '');
  if (!limpio) return '';
  return limpio.padStart(5, '0').slice(-5);
}

async function abrirModalProveedor(id = null) {
  editandoId = id;
  document.getElementById('modal-prov-titulo').textContent =
    id ? 'Editar proveedor' : 'Nuevo proveedor';
  document.getElementById('form-proveedor').reset();
  document.getElementById('error-prov-numero').textContent = '';

  if (id) {
    try {
      const p = await Api.get(`/proveedores/${id}`);
      document.getElementById('prov-numero').value   = p.num_proveedor || '';
      document.getElementById('prov-nombre').value    = p.nombre;
      document.getElementById('prov-email').value     = p.email || '';
      document.getElementById('prov-telefono').value  = p.telefono || '';
      document.getElementById('prov-rfc').value       = p.rfc || '';
      document.getElementById('prov-notas').value = p.notas || '';
    } catch { Toast.error('Error al cargar proveedor'); return; }
  }
  UI.abrirModal('modal-proveedor');
}

document.getElementById('prov-numero')?.addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5);
});

document.getElementById('form-proveedor').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-prov');
  btn.disabled = true;
  document.getElementById('error-prov-numero').textContent = '';

  const rawNum = document.getElementById('prov-numero').value.trim();
  const num_proveedor = rawNum ? normalizarNumProveedor(rawNum) : null;
  if (rawNum && !/^\d{5}$/.test(num_proveedor)) {
    document.getElementById('error-prov-numero').textContent =
      'El número de proveedor debe tener exactamente 5 dígitos';
    btn.disabled = false;
    return;
  }

  const emailRaw = document.getElementById('prov-email').value.trim();
  const datos = {
    num_proveedor,
    nombre:    document.getElementById('prov-nombre').value,
    email:     emailRaw || null,
    telefono:  document.getElementById('prov-telefono').value || null,
    rfc:       document.getElementById('prov-rfc').value || null,
    notas: document.getElementById('prov-notas').value || null,
  };

  try {
    if (editandoId) {
      await Api.put(`/proveedores/${editandoId}`, datos);
      Toast.success('Proveedor actualizado');
    } else {
      await Api.post('/proveedores', datos);
      Toast.success('Proveedor creado');
    }
    UI.cerrarModal('modal-proveedor');
    cargarProveedores();
  } catch (err) {
    const msg = err.mensaje || 'Error al guardar';
    if (msg.toLowerCase().includes('número de proveedor') || msg.toLowerCase().includes('numero de proveedor')) {
      document.getElementById('error-prov-numero').textContent = msg;
    } else {
      Toast.error(msg);
    }
  } finally {
    btn.disabled = false;
  }
});

async function toggleActivo(id, activo) {
  try {
    await Api.patch(`/proveedores/${id}/estado`, { activo: !activo });
    Toast.success(`Proveedor ${!activo ? 'activado' : 'desactivado'}`);
    cargarProveedores();
  } catch (err) {
    Toast.error(err.mensaje || 'Error');
  }
}

async function cargarProveedoresDesdeExcel(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  input.value = '';

  const btn = document.getElementById('btn-cargar-proveedores');
  if (btn) setButtonLoading(btn, true, 'Importando…');
  try {
    Toast.info('Procesando archivo Excel…');
    const data = await Api.uploadFile('/proveedores/import', file, 'excel');
    Toast.success(data.mensaje || `Carga correcta. Se importaron ${data.nuevos || 0} proveedores nuevos.`);
    cargarProveedores();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al cargar el archivo Excel');
  } finally {
    if (btn) setButtonLoading(btn, false);
  }
}

// Exponer para el onclick
window.cargarProveedoresDesdeExcel = cargarProveedoresDesdeExcel;
