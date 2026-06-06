// ── INICIALIZACIÓN ────────────────────────────────────────────

Auth.requiereAuth();
renderSidebar();
renderTopbar('Requerimientos');

// Ocultar botón "nuevo" si no es solicitante/admin
if (!Auth.puedeHacer(['solicitante', 'admin'])) {
  const btnNuevo = document.getElementById('btn-nuevo');
  if (btnNuevo) btnNuevo.style.display = 'none';
}

// Si viene con ?id= mostrar detalle directo
const params = new URLSearchParams(window.location.search);
if (params.get('id')) {
  abrirDetalle(params.get('id'));
} else {
  cargarRequerimientos(1);
}
