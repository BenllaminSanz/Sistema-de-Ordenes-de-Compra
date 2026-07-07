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
    setTimeout(async () => {
      if (typeof abrirEditorRequerimiento === 'function') {
        await abrirEditorRequerimiento(null, { restaurarBorrador: true });
        const tieneCarrito = CarritoReq.count() > 0;
        const borradorRestaurado = window._reqBorradorRecienRestaurado === true;
        window._reqBorradorRecienRestaurado = false;
        if (tieneCarrito && borradorRestaurado) {
          Toast.info('Se restauró tu borrador y los ítems del catálogo.');
        } else if (tieneCarrito) {
          Toast.info('Ítems del catálogo cargados en tu solicitud. Completa los datos y guarda.');
        } else if (borradorRestaurado) {
          Toast.info('Se restauró tu borrador del requerimiento.');
        }
      }
    }, 80);
  }
}
