/**
 * usuarios.js
 * Lógica de la página de Usuarios
 */

Auth.requiereAuth();
if (!Auth.puedeHacer(['admin'])) window.location.href = 'dashboard.html';

renderSidebar();
renderTopbar('Usuarios');
cargarUsuarios();

// Delegación en la tabla de usuarios
const tablaUsuarios = document.getElementById('tabla-usuarios');
if (tablaUsuarios) {
  window.delegate(tablaUsuarios, 'button[data-action="toggle-usuario"]', 'click', (e, btn) => {
    const id = parseInt(btn.dataset.id);
    const activo = btn.dataset.activo === 'true' || btn.dataset.activo === '1';
    toggleUsuario(id, activo);
  });
}

async function cargarUsuarios() {
  const contenedor = document.getElementById('tabla-usuarios');
  UI.spinner(contenedor);
  try {
    const usuarios = await Api.get('/auth/usuarios');
    contenedor.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Desde</th><th>Acciones</th>
          </tr></thead>
          <tbody>${usuarios.map(u => `
            <tr>
              <td class="fw-600">${u.nombre}</td>
              <td>${u.email}</td>
              <td><span class="badge badge-en_revision">${u.rol}</span></td>
              <td>${u.activo
                    ? '<span class="badge badge-aprobado">Activo</span>'
                    : '<span class="badge badge-rechazado">Inactivo</span>'}</td>
              <td class="text-muted text-sm">${UI.fecha(u.created_at)}</td>
              <td>
                <button class="btn btn-sm ${u.activo ? 'btn-danger' : 'btn-success'}" 
                        data-action="toggle-usuario" data-id="${u.id}" data-activo="${u.activo ? 'true' : 'false'}">
                  ${u.activo ? 'Desactivar' : 'Activar'}
                </button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    UI.empty(contenedor, 'Error al cargar usuarios');
    Toast.error(err.mensaje || 'Error');
  }
}

document.getElementById('form-usuario').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-usr');
  btn.disabled = true;
  try {
    await Api.post('/auth/registro', {
      nombre:   document.getElementById('usr-nombre').value,
      email:    document.getElementById('usr-email').value,
      password: document.getElementById('usr-password').value,
      rol:      document.getElementById('usr-rol').value,
    });
    UI.cerrarModal('modal-usuario');
    Toast.success('Usuario creado correctamente');
    cargarUsuarios();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al crear usuario');
  } finally {
    btn.disabled = false;
  }
});

async function toggleUsuario(id, activo) {
  try {
    await Api.patch(`/auth/usuarios/${id}/estado`, { activo: !activo });
    Toast.success(`Usuario ${!activo ? 'activado' : 'desactivado'}`);
    cargarUsuarios();
  } catch (err) {
    Toast.error(err.mensaje || 'Error');
  }
}
