/**
 * usuarios.js
 * Gestión de usuarios (contabilidad / admin)
 */

Auth.requiereAuth();
if (!Auth.puedeHacer(['admin', 'contabilidad'])) window.location.href = 'dashboard.html';

const usuarioActual = Auth.getUsuario();
const esAdmin = usuarioActual?.rol === 'admin';
let usuariosCache = [];

renderSidebar();
renderTopbar('Usuarios');
configurarOpcionesRol();
cargarUsuarios();

const tablaUsuarios = document.getElementById('tabla-usuarios');
if (tablaUsuarios) {
  window.delegate(tablaUsuarios, 'button[data-action="toggle-usuario"]', 'click', (e, btn) => {
    const id = parseInt(btn.dataset.id);
    const activo = btn.dataset.activo === 'true' || btn.dataset.activo === '1';
    toggleUsuario(id, activo);
  });
  window.delegate(tablaUsuarios, 'button[data-action="editar-usuario"]', 'click', (e, btn) => {
    abrirModalEditar(parseInt(btn.dataset.id));
  });
  window.delegate(tablaUsuarios, 'button[data-action="password-usuario"]', 'click', (e, btn) => {
    abrirModalPassword(parseInt(btn.dataset.id));
  });
}

function configurarOpcionesRol() {
  ['usr-rol', 'edit-usr-rol'].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const adminOpt = select.querySelector('option[value="admin"]');
    if (adminOpt) adminOpt.style.display = esAdmin ? '' : 'none';
  });
}

function puedeGestionarUsuario(target) {
  if (esAdmin) return true;
  return target.rol !== 'admin';
}

function abrirModalNuevo() {
  document.getElementById('form-usuario').reset();
  UI.abrirModal('modal-usuario');
}

function abrirModalEditar(id) {
  const u = usuariosCache.find(x => Number(x.id) === Number(id));
  if (!u) return Toast.error('Usuario no encontrado');
  if (!puedeGestionarUsuario(u)) {
    return Toast.error('No tienes permiso para editar este usuario');
  }

  document.getElementById('edit-usr-id').value = u.id;
  document.getElementById('edit-usr-nombre').value = u.nombre || '';
  document.getElementById('edit-usr-email').value = u.email || '';
  document.getElementById('edit-usr-rol').value = u.rol || 'solicitante';
  configurarOpcionesRol();
  UI.abrirModal('modal-editar-usuario');
}

function abrirModalPassword(id) {
  const u = usuariosCache.find(x => Number(x.id) === Number(id));
  if (!u) return Toast.error('Usuario no encontrado');
  if (!puedeGestionarUsuario(u)) {
    return Toast.error('No tienes permiso para cambiar la contraseña de este usuario');
  }

  document.getElementById('pwd-usr-id').value = u.id;
  document.getElementById('pwd-usr-nombre').textContent = u.nombre || u.email;
  document.getElementById('form-password-usuario').reset();
  document.getElementById('pwd-usr-id').value = u.id;
  UI.abrirModal('modal-password-usuario');
}

async function cargarUsuarios() {
  const contenedor = document.getElementById('tabla-usuarios');
  UI.spinner(contenedor);

  const inputBusq = document.getElementById('busq-usuario');
  if (inputBusq) inputBusq.value = '';

  try {
    const soloActivos = document.getElementById('chk-activos')?.checked ?? true;
    const qs = soloActivos ? '?activo=true' : '';
    const usuarios = await Api.get(`/auth/usuarios${qs}`);
    usuariosCache = usuarios;
    renderTablaUsuarios(usuariosCache);
  } catch {
    UI.empty(document.getElementById('tabla-usuarios'), 'Error al cargar usuarios');
  }
}

function filtrarUsuarios(termino) {
  const q = (termino || '').trim().toLowerCase();
  if (!q) { renderTablaUsuarios(usuariosCache); return; }
  const filtrados = usuariosCache.filter(u =>
    (u.nombre || '').toLowerCase().includes(q) ||
    (u.email  || '').toLowerCase().includes(q) ||
    (u.rol    || '').toLowerCase().includes(q)
  );
  renderTablaUsuarios(filtrados, usuariosCache.length);
}

function renderTablaUsuarios(usuarios, totalOriginal = null) {
  const contenedor = document.getElementById('tabla-usuarios');
  const contador   = document.getElementById('usr-contador');

  if (contador) {
    const total = totalOriginal ?? usuarios.length;
    contador.textContent = totalOriginal !== null && usuarios.length !== total
      ? `${usuarios.length} de ${total} usuarios`
      : `${total} usuarios`;
  }

  if (!usuarios.length) {
    UI.empty(contenedor, totalOriginal !== null
      ? 'Sin resultados para esa búsqueda'
      : 'No hay usuarios con el filtro seleccionado');
    return;
  }

    contenedor.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Desde</th><th>Acciones</th>
          </tr></thead>
          <tbody>${usuarios.map(u => {
            const gestionable = puedeGestionarUsuario(u);
            const esYo = Number(u.id) === Number(usuarioActual?.id);
            return `
            <tr>
              <td class="fw-600">${u.nombre}</td>
              <td>${u.email}</td>
              <td><span class="badge badge-en_revision">${u.rol}</span></td>
              <td>${u.activo
                    ? '<span class="badge badge-aprobado">Activo</span>'
                    : '<span class="badge badge-rechazado">Inactivo</span>'}</td>
              <td class="text-muted text-sm">${UI.fecha(u.created_at)}</td>
              <td class="d-flex gap-1" style="flex-wrap:wrap">
                ${gestionable ? `
                  <button class="btn btn-sm btn-outline" data-action="editar-usuario" data-id="${u.id}" title="Editar usuario" style="padding:2px 6px;">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-1px;">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button class="btn btn-sm btn-outline" data-action="password-usuario" data-id="${u.id}">Nueva contraseña</button>
                  ${!esYo ? `
                    <button class="btn btn-sm ${u.activo ? 'btn-danger' : 'btn-success'}"
                            data-action="toggle-usuario" data-id="${u.id}" data-activo="${u.activo ? 'true' : 'false'}"
                            title="${u.activo ? 'Desactivar usuario' : 'Activar usuario'}" style="padding:2px 6px;">
                      ${u.activo 
                        ? `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px;"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>` 
                        : `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="vertical-align:-1px;"><path d="M20 6L9 17l-5-5"/></svg>`}
                    </button>` : ''}
                ` : '<span class="text-muted text-sm">Solo admin</span>'}
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>`;
}

window.filtrarUsuarios = filtrarUsuarios;

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

document.getElementById('form-editar-usuario').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-edit-usr');
  const id = document.getElementById('edit-usr-id').value;
  btn.disabled = true;
  try {
    await Api.patch(`/auth/usuarios/${id}`, {
      nombre: document.getElementById('edit-usr-nombre').value,
      email:  document.getElementById('edit-usr-email').value,
      rol:    document.getElementById('edit-usr-rol').value,
    });
    UI.cerrarModal('modal-editar-usuario');
    Toast.success('Usuario actualizado correctamente');
    cargarUsuarios();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al actualizar usuario');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('form-password-usuario').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-pwd-usr');
  const id = document.getElementById('pwd-usr-id').value;
  const pwd = document.getElementById('pwd-nueva').value;
  const pwd2 = document.getElementById('pwd-nueva2').value;

  if (pwd !== pwd2) {
    return Toast.error('Las contraseñas no coinciden');
  }

  btn.disabled = true;
  try {
    await Api.patch(`/auth/usuarios/${id}/password`, { password_nuevo: pwd });
    UI.cerrarModal('modal-password-usuario');
    Toast.success('Contraseña actualizada correctamente');
  } catch (err) {
    Toast.error(err.mensaje || 'Error al cambiar la contraseña');
  } finally {
    btn.disabled = false;
  }
});

window.abrirModalNuevo = abrirModalNuevo;
window.cargarUsuarios = cargarUsuarios;

async function toggleUsuario(id, activo) {
  const accion = activo ? 'desactivar' : 'activar';
  if (!confirm(`¿${accion.charAt(0).toUpperCase() + accion.slice(1)} este usuario?`)) return;

  try {
    await Api.patch(`/auth/usuarios/${id}/estado`, { activo: !activo });
    Toast.success(`Usuario ${!activo ? 'activado' : 'desactivado'}`);
    cargarUsuarios();
  } catch (err) {
    Toast.error(err.mensaje || 'Error');
  }
}