// ── INICIALIZACIÓN ────────────────────────────────────────────

Auth.requiereAuth();
renderSidebar();
renderTopbar('Requerimientos');

// Ocultar botón "nuevo" si no es solicitante/admin
if (!Auth.puedeHacer(['solicitante', 'admin'])) {
  const btnNuevo = document.getElementById('btn-nuevo');
  if (btnNuevo) btnNuevo.style.display = 'none';
}

// Cargar áreas para los filtros de la página (fil-area, fil-departamento)
if (typeof cargarAreasEnForm === 'function') {
  cargarAreasEnForm().catch(console.error);
}

// Si viene con ?id= mostrar detalle directo
const params = new URLSearchParams(window.location.search);
if (params.get('id')) {
  abrirDetalle(params.get('id'));
} else {
  cargarRequerimientos(1);
}
