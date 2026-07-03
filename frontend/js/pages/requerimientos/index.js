// ── INICIALIZACIÓN ────────────────────────────────────────────

Auth.requiereAuth();
renderSidebar();
renderTopbar('Requerimientos');

// Ocultar botón "nuevo" si no puede crear requerimientos
if (!Auth.puedeHacer(['solicitante', 'contabilidad', 'admin'])) {
  const btnNuevo = document.getElementById('btn-nuevo');
  if (btnNuevo) btnNuevo.style.display = 'none';
}

// Mostrar botón importar solo a contabilidad/admin
if (Auth.puedeHacer(['contabilidad', 'admin'])) {
  const btnImportar = document.getElementById('btn-importar');
  if (btnImportar) btnImportar.style.display = '';
}

// Cargar áreas para los filtros de la página (fil-area, fil-departamento)
if (typeof cargarAreasEnForm === 'function') {
  cargarAreasEnForm().catch(console.error);
}

// Si viene con ?id= mostrar detalle directo; ?crear=1 abre editor con carrito del catálogo
const params = new URLSearchParams(window.location.search);
if (params.get('id')) {
  abrirDetalle(params.get('id'));
} else {
  cargarRequerimientos(1);

  if (params.get('crear') === '1' && Auth.puedeHacer(['solicitante', 'contabilidad', 'admin'])) {
    CarritoReq.load();
    setTimeout(() => {
      if (typeof abrirEditorRequerimiento === 'function') {
        abrirEditorRequerimiento();
        if (CarritoReq.count() > 0) {
          Toast.info('Ítems del catálogo cargados en tu solicitud. Completa los datos y guarda.');
        }
      }
    }, 80);
  }
}
