/**
 * configuracion.js
 * Panel de configuración SMTP (solo admin)
 */
Auth.requiereAuth();

const usuarioActual = Auth.getUsuario();
if (!usuarioActual || usuarioActual.rol !== 'admin') {
  window.location.href = 'dashboard.html';
}

renderSidebar();
renderTopbar('Configuración SMTP');

const form = document.getElementById('form-smtp');
const statusBox = document.getElementById('smtp-status');

// Elementos del formulario
const el = {
  host: document.getElementById('smtp-host'),
  port: document.getElementById('smtp-port'),
  user: document.getElementById('smtp-user'),
  pass: document.getElementById('smtp-pass'),
  fromName: document.getElementById('smtp-from-name'),
  ccCotizaciones: document.getElementById('smtp-cc-cotizaciones'),
  secure: document.getElementById('smtp-secure'),
  tlsCiphers: document.getElementById('smtp-tls-ciphers'),
  reject: document.getElementById('smtp-reject-unauthorized'),
};

const btnGuardar = document.getElementById('btn-guardar-smtp');
const btnReset = document.getElementById('btn-reset-env');
const btnTestConn = document.getElementById('btn-test-conn');
const btnTestEmail = document.getElementById('btn-test-email');
const btnToggleNotif = document.getElementById('btn-toggle-notif');
const btnGuardarNotif = document.getElementById('btn-guardar-notif');
const btnUsarUrlSesion = document.getElementById('btn-usar-url-sesion');

let _notifEstado = {
  notif_req_revision: true,
  frontend_url: '',
  frontend_url_efectiva: '',
  frontend_url_sugerida: '',
  email_notif_compras: '',
  notif_roles: ['compras', 'admin'],
  destinatarios: [],
};

function renderNotificaciones(n) {
  if (!n) return;
  _notifEstado = n;

  const activa = !!n.notif_req_revision;
  const wrap = document.getElementById('notif-toggle-wrap');
  const titulo = document.getElementById('notif-estado-titulo');
  const hint = document.getElementById('notif-estado-hint');
  if (titulo) titulo.textContent = activa ? 'Notificaciones activas' : 'Notificaciones desactivadas';
  if (hint) {
    hint.textContent = activa
      ? 'Se envía un correo cuando un solicitante manda un REQ a revisión.'
      : 'Los REQ en revisión no generan correo. El SMTP (RFQ / prueba) sigue funcionando.';
  }
  if (wrap) {
    wrap.style.borderColor = activa ? '#86efac' : '#fca5a5';
    wrap.style.background = activa ? '#f0fdf4' : '#fef2f2';
  }
  if (titulo) titulo.style.color = activa ? '#166534' : '#991b1b';
  if (btnToggleNotif) {
    btnToggleNotif.textContent = activa ? 'Desactivar' : 'Activar';
    btnToggleNotif.className = activa ? 'btn btn-outline' : 'btn btn-primary';
  }

  const urlEl = document.getElementById('cfg-frontend-url');
  if (urlEl) urlEl.value = n.frontend_url || n.frontend_url_efectiva || '';
  const extraEl = document.getElementById('cfg-email-notif');
  if (extraEl) extraEl.value = n.email_notif_compras || '';
  const roles = Array.isArray(n.notif_roles) ? n.notif_roles : ['compras', 'admin'];
  const chkCompras = document.getElementById('notif-rol-compras');
  const chkAdmin = document.getElementById('notif-rol-admin');
  if (chkCompras) chkCompras.checked = roles.includes('compras');
  if (chkAdmin) chkAdmin.checked = roles.includes('admin');
  const chkDiario = document.getElementById('cfg-reporte-diario');
  if (chkDiario) chkDiario.checked = n.reporte_diario !== false;

  const urlHint = document.getElementById('cfg-frontend-url-hint');
  if (urlHint) {
    const ef = n.frontend_url_efectiva || '—';
    urlHint.innerHTML = n.frontend_url_es_local
      ? `Enlaces actuales: <code>${ef}</code> — esto es localhost; en el servidor los correos no abrirán bien.`
      : `Enlaces actuales: <code>${ef}</code>`;
  }

  if (btnUsarUrlSesion) {
    if (n.frontend_url_sugerida) {
      btnUsarUrlSesion.style.display = '';
      btnUsarUrlSesion.dataset.url = n.frontend_url_sugerida;
      btnUsarUrlSesion.title = n.frontend_url_sugerida;
    } else {
      btnUsarUrlSesion.style.display = 'none';
    }
  }

  const box = document.getElementById('notif-destinatarios');
  if (box) {
    const lista = Array.isArray(n.destinatarios) ? n.destinatarios : [];
    if (!lista.length) {
      box.innerHTML = '<em>Nadie recibirá el aviso: no hay usuarios de los roles marcados con correo, ni extras.</em>';
    } else {
      const filas = lista.map((d) => {
        const rolLabel = d.rol === 'compras' ? 'Compras' : (d.rol === 'admin' ? 'Admin' : d.rol || '');
        const etiqueta = d.origen === 'usuario'
          ? `${d.nombre || 'Usuario'} · ${rolLabel}`.trim()
          : 'Copia extra';
        return `<li style="margin:0 0 4px;"><strong>${d.email}</strong> <span class="text-muted">(${etiqueta})</span></li>`;
      }).join('');
      const avisoOff = activa ? '' : '<p style="margin:0 0 6px;color:#991b1b;">Ahora mismo no se envía a nadie (notificaciones apagadas).</p>';
      box.innerHTML = `${avisoOff}<ul style="margin:0;padding-left:18px;">${filas}</ul>`;
    }
  }
}

// Cargar configuración actual
async function cargarConfig() {
  statusBox.innerHTML = '<div class="status-box" style="background:#f1f5f9">Cargando configuración...</div>';

  try {
    const data = await Api.get('/config/smtp');

    renderNotificaciones(data.notificaciones);

    if (data.usando_env || !data.config) {
      statusBox.innerHTML = `
        <div class="status-box status-env">
          <strong>Usando configuración de .env</strong><br>
          ${data.mensaje || 'No existe configuración activa en la base de datos.'}
        </div>`;
    } else {
      const c = data.config;
      statusBox.innerHTML = `
        <div class="status-box status-db">
          <strong>Configuración activa desde Base de Datos</strong><br>
          Última actualización: ${c.updated_at ? new Date(c.updated_at).toLocaleString('es-MX') : '—'}
        </div>`;

      // Rellenar formulario
      el.host.value = c.host || '';
      el.port.value = c.port || 587;
      el.user.value = c.user || '';
      el.fromName.value = c.from_name || 'Sistema de Órdenes de Compra';
      el.ccCotizaciones.value = c.cc_cotizaciones || '';
      el.secure.checked = !!c.secure;
      el.tlsCiphers.value = c.tls_ciphers || 'SSLv3';
      el.reject.checked = !!c.reject_unauthorized;

      // No rellenamos la contraseña (viene masked)
      el.pass.placeholder = c.tiene_password ? '•••••••••••• (configurada — deja en blanco para mantener)' : 'Contraseña o App Password';
    }
  } catch (err) {
    statusBox.innerHTML = `<div class="status-box status-env">Error al cargar configuración: ${err.mensaje || err}</div>`;
  }
}

// Guardar configuración
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const originalText = btnGuardar.textContent;
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  const payload = {
    host: el.host.value.trim(),
    port: parseInt(el.port.value, 10) || 587,
    user: el.user.value.trim(),
    pass: el.pass.value.trim() || undefined, // undefined = no cambiar
    from_name: el.fromName.value.trim() || undefined,
    cc_cotizaciones: el.ccCotizaciones.value.trim() || '',
    secure: el.secure.checked,
    tls_ciphers: el.tlsCiphers.value.trim() || undefined,
    reject_unauthorized: el.reject.checked,
  };

  try {
    const resp = await Api.put('/config/smtp', payload);
    Toast.success(resp.mensaje || 'Configuración guardada');

    // Recargar para reflejar estado actualizado
    await cargarConfig();

    // Limpiar campo de pass después de guardar
    el.pass.value = '';
  } catch (err) {
    Toast.error(err.mensaje || 'Error al guardar la configuración');
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = originalText;
  }
});

// Reset a solo .env
btnReset.addEventListener('click', async () => {
  if (!confirm('¿Desactivar la configuración de la base de datos y volver a usar solo las variables del archivo .env?')) {
    return;
  }

  try {
    const resp = await Api.delete('/config/smtp');
    Toast.success(resp.mensaje || 'Configuración de DB desactivada');
    await cargarConfig();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al resetear');
  }
});

// Probar conexión actual (usa lo cargado en el servidor)
btnTestConn.addEventListener('click', async () => {
  const original = btnTestConn.textContent;
  btnTestConn.disabled = true;
  btnTestConn.textContent = 'Probando...';

  try {
    // Si el usuario llenó datos en el form, enviamos esos datos para prueba temporal
    const payload = {};
    if (el.host.value.trim()) payload.host = el.host.value.trim();
    if (el.port.value) payload.port = parseInt(el.port.value, 10);
    if (el.user.value.trim()) payload.user = el.user.value.trim();
    if (el.pass.value.trim()) payload.pass = el.pass.value.trim();
    if (el.secure) payload.secure = el.secure.checked;
    if (el.tlsCiphers.value) payload.tls_ciphers = el.tlsCiphers.value.trim();
    if (el.reject) payload.reject_unauthorized = el.reject.checked;

    const result = await Api.post('/config/smtp/test', Object.keys(payload).length ? payload : {});

    if (result.success) {
      Toast.success(result.mensaje || 'Conexión exitosa');
    } else {
      Toast.error(result.mensaje || result.error || 'Fallo en la conexión');
    }
  } catch (err) {
    Toast.error(err.mensaje || 'Error probando la conexión SMTP');
  } finally {
    btnTestConn.disabled = false;
    btnTestConn.textContent = original;
  }
});

// Abrir modal para enviar correo de prueba
btnTestEmail.addEventListener('click', () => {
  document.getElementById('form-test-email').reset();
  // Sugerir el mismo user como destino por defecto
  const sugerido = el.user.value || '';
  if (sugerido) document.getElementById('test-to').value = sugerido;
  UI.abrirModal('modal-test-email');
});

// Enviar correo de prueba desde el modal
document.getElementById('form-test-email').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = document.getElementById('btn-enviar-prueba');
  const to = document.getElementById('test-to').value.trim();

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Enviando...';

  try {
    const result = await Api.post('/config/smtp/test-email', { to });

    if (result.success) {
      Toast.success(result.mensaje || 'Correo de prueba enviado');
      UI.cerrarModal('modal-test-email');
    } else {
      Toast.error(result.mensaje || 'No se pudo enviar el correo de prueba');
    }
  } catch (err) {
    Toast.error(err.mensaje || 'Error enviando correo de prueba');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

if (btnToggleNotif) {
  btnToggleNotif.addEventListener('click', async () => {
    const siguiente = !_notifEstado.notif_req_revision;
    const original = btnToggleNotif.textContent;
    btnToggleNotif.disabled = true;
    btnToggleNotif.textContent = siguiente ? 'Activando…' : 'Desactivando…';
    try {
      const resp = await Api.put('/config/notificaciones', { notif_req_revision: siguiente });
      renderNotificaciones(resp.notificaciones);
      Toast.success(resp.mensaje || (siguiente ? 'Notificaciones activadas' : 'Notificaciones desactivadas'));
    } catch (err) {
      Toast.error(err.mensaje || 'No se pudo cambiar el estado de las notificaciones');
    } finally {
      btnToggleNotif.disabled = false;
      if (btnToggleNotif.textContent === 'Activando…' || btnToggleNotif.textContent === 'Desactivando…') {
        btnToggleNotif.textContent = original;
      }
    }
  });
}

function rolesNotifDesdeUI() {
  const roles = [];
  if (document.getElementById('notif-rol-compras')?.checked) roles.push('compras');
  if (document.getElementById('notif-rol-admin')?.checked) roles.push('admin');
  return roles;
}

async function guardarRolesNotif() {
  const roles = rolesNotifDesdeUI();
  if (!roles.length) {
    Toast.error('Deja al menos un rol marcado (Compras o Admin).');
    renderNotificaciones(_notifEstado);
    return;
  }
  try {
    const resp = await Api.put('/config/notificaciones', { notif_roles: roles });
    renderNotificaciones(resp.notificaciones);
    Toast.success(resp.mensaje || 'Destinatarios actualizados');
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudieron guardar los roles');
    renderNotificaciones(_notifEstado);
  }
}

document.getElementById('notif-rol-compras')?.addEventListener('change', guardarRolesNotif);
document.getElementById('notif-rol-admin')?.addEventListener('change', guardarRolesNotif);

document.getElementById('cfg-reporte-diario')?.addEventListener('change', async (e) => {
  const on = !!e.target.checked;
  try {
    const resp = await Api.put('/config/notificaciones', { reporte_diario: on });
    renderNotificaciones(resp.notificaciones);
    Toast.success(on ? 'Reporte diario activado' : 'Reporte diario desactivado');
  } catch (err) {
    Toast.error(err.mensaje || 'No se pudo guardar el reporte diario');
    e.target.checked = !on;
  }
});

if (btnGuardarNotif) {
  btnGuardarNotif.addEventListener('click', async () => {
    const original = btnGuardarNotif.textContent;
    btnGuardarNotif.disabled = true;
    btnGuardarNotif.textContent = 'Guardando…';
    try {
      const resp = await Api.put('/config/notificaciones', {
        frontend_url: document.getElementById('cfg-frontend-url')?.value.trim() || '',
        email_notif_compras: document.getElementById('cfg-email-notif')?.value.trim() || '',
        notif_req_revision: _notifEstado.notif_req_revision,
        notif_roles: rolesNotifDesdeUI(),
      });
      renderNotificaciones(resp.notificaciones);
      Toast.success(resp.mensaje || 'URL y correos extra guardados');
    } catch (err) {
      Toast.error(err.mensaje || 'Error al guardar URL / correos extra');
    } finally {
      btnGuardarNotif.disabled = false;
      btnGuardarNotif.textContent = original;
    }
  });
}

if (btnUsarUrlSesion) {
  btnUsarUrlSesion.addEventListener('click', () => {
    const url = btnUsarUrlSesion.dataset.url || '';
    const inp = document.getElementById('cfg-frontend-url');
    if (inp && url) inp.value = url;
  });
}

// Inicializar
cargarConfig();

// Exponer para depuración si es necesario
window.cargarConfigSmtp = cargarConfig;
