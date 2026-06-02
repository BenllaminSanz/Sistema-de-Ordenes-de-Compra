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
            <th>Nombre</th><th>Email</th><th>Teléfono</th>
            <th>RFC</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody>${provs.map(p => `
            <tr>
              <td class="fw-600">${p.nombre}</td>
              <td>${p.email}</td>
              <td>${p.telefono || '—'}</td>
              <td>${p.rfc || '—'}</td>
              <td>${p.activo
                    ? '<span class="badge badge-aprobado">Activo</span>'
                    : '<span class="badge badge-rechazado">Inactivo</span>'}</td>
              <td>
                <div class="d-flex gap-2">
                  <button class="btn btn-sm btn-outline" data-action="editar" data-id="${p.id}">Editar</button>
                  ${Auth.puedeHacer(['admin'])
                    ? `<button class="btn btn-sm ${p.activo ? 'btn-danger' : 'btn-success'}" data-action="toggle" data-id="${p.id}" data-activo="${p.activo ? 'true' : 'false'}">
                         ${p.activo ? 'Desactivar' : 'Activar'}</button>`
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

async function abrirModalProveedor(id = null) {
  editandoId = id;
  document.getElementById('modal-prov-titulo').textContent =
    id ? 'Editar proveedor' : 'Nuevo proveedor';
  document.getElementById('form-proveedor').reset();

  if (id) {
    try {
      const p = await Api.get(`/proveedores/${id}`);
      document.getElementById('prov-nombre').value    = p.nombre;
      document.getElementById('prov-email').value     = p.email;
      document.getElementById('prov-telefono').value  = p.telefono || '';
      document.getElementById('prov-rfc').value       = p.rfc || '';
      document.getElementById('prov-direccion').value = p.direccion || '';
    } catch { Toast.error('Error al cargar proveedor'); return; }
  }
  UI.abrirModal('modal-proveedor');
}

document.getElementById('form-proveedor').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-prov');
  btn.disabled = true;
  const datos = {
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
    Toast.error(err.mensaje || 'Error al guardar');
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
