// ── INICIALIZACIÓN ────────────────────────────────────────────

Auth.requiereAuth();
renderSidebar();
renderTopbar('Requerimientos');

// Ocultar botón "nuevo" si no puede crear requerimientos
if (!Auth.puedeHacer(['solicitante', 'compras', 'admin'])) {
  const btnNuevo = document.getElementById('btn-nuevo');
  if (btnNuevo) btnNuevo.style.display = 'none';
}

// Mostrar botón importar solo a compras/admin
if (Auth.puedeHacer(['compras', 'admin'])) {
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
  // Restaurar filtros desde URL (ej. ?estado=activos)
  const estadoUrl = params.get('estado');
  const tipoUrl = params.get('tipo');
  const solicitanteUrl = params.get('solicitante_id') || params.get('usuario');
  if (estadoUrl) {
    const sel = document.getElementById('fil-estado');
    if (sel) sel.value = estadoUrl;
  }
  if (tipoUrl) {
    const sel = document.getElementById('fil-tipo');
    if (sel) sel.value = tipoUrl;
  }
  // Orden por columna vía ?orden= / ?ordenar_por=
  if (typeof aplicarOrdenReqDesdeUrl === 'function') {
    aplicarOrdenReqDesdeUrl(params);
  }
  // Filtro por usuario/solicitante (compras/admin)
  (async () => {
    if (typeof cargarFiltroSolicitantesReq === 'function') {
      await cargarFiltroSolicitantesReq(solicitanteUrl || '');
    }
    cargarRequerimientos(1);
  })();

  if (params.get('crear') === '1' && Auth.puedeHacer(['solicitante', 'compras', 'admin'])) {
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
