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
  try {
    const provs = await Api.get('/proveedores' + (soloActivos ? '?activos=true' : ''));

    if (!provs.length) { UI.empty(contenedor, 'No hay proveedores registrados'); return; }

    contenedor.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width: 85px; min-width: 70px;">No.</th>
            <th style="max-width: 200px;">Nombre</th>
            <th>Email</th><th>Teléfono</th>
            <th>RFC</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody>${provs.map(p => `
            <tr>
              <td style="width: 85px; min-width: 70px;"><code>${p.num_proveedor || '—'}</code></td>
              <td class="fw-600" style="max-width: 200px;">${p.nombre}</td>
              <td>${p.email}</td>
              <td>${p.telefono || '—'}</td>
              <td>${p.rfc || '—'}</td>
              <td>${p.activo
                    ? '<span class="badge badge-aprobado">Activo</span>'
                    : '<span class="badge badge-rechazado">Inactivo</span>'}</td>
              <td>
                <div class="d-flex gap-2">
                  <button class="btn btn-sm btn-outline" data-action="editar" data-id="${p.id}" title="Editar proveedor" style="padding:2px 6px;">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-1px;">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  ${Auth.puedeHacer(['admin'])
                    ? `<button class="btn btn-sm ${p.activo ? 'btn-danger' : 'btn-success'}" data-action="toggle" data-id="${p.id}" data-activo="${p.activo ? 'true' : 'false'}" 
                         title="${p.activo ? 'Desactivar proveedor' : 'Activar proveedor'}" style="padding:2px 6px;">
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
  } catch (err) {
    UI.empty(contenedor, 'Error al cargar proveedores');
    Toast.error(err.mensaje || 'Error');
  }
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
      document.getElementById('prov-email').value     = p.email;
      document.getElementById('prov-telefono').value  = p.telefono || '';
      document.getElementById('prov-rfc').value       = p.rfc || '';
      document.getElementById('prov-direccion').value = p.direccion || '';
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

  const num_proveedor = normalizarNumProveedor(document.getElementById('prov-numero').value);
  if (!/^\d{5}$/.test(num_proveedor)) {
    document.getElementById('error-prov-numero').textContent =
      'El número de proveedor debe tener exactamente 5 dígitos';
    btn.disabled = false;
    return;
  }

  const datos = {
    num_proveedor,
    nombre:    document.getElementById('prov-nombre').value,
    email:     document.getElementById('prov-email').value,
    telefono:  document.getElementById('prov-telefono').value || null,
    rfc:       document.getElementById('prov-rfc').value || null,
    direccion: document.getElementById('prov-direccion').value || null,
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
  // reset input for reuse
  input.value = '';

  const originalText = '📥 Cargar desde Excel';

  try {
    // Show loading feedback via toast or temporary
    Toast.info('Procesando archivo Excel...');

    const data = await Api.uploadFile('/proveedores/import', file, 'excel');

    Toast.success(data.mensaje || `Carga correcta. Se importaron ${data.nuevos || 0} proveedores nuevos.`);
    cargarProveedores();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al cargar el archivo Excel');
  }
}

// Exponer para el onclick
window.cargarProveedoresDesdeExcel = cargarProveedoresDesdeExcel;
