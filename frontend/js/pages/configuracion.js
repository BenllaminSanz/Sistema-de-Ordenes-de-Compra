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

// Cargar configuración actual
async function cargarConfig() {
  statusBox.innerHTML = '<div class="status-box" style="background:#f1f5f9">Cargando configuración...</div>';

  try {
    const data = await Api.get('/config/smtp');

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

// Inicializar
cargarConfig();

// Exponer para depuración si es necesario
window.cargarConfigSmtp = cargarConfig;
