// ── ÍTEMS LIBRES (texto libre / no en catálogo) ───────────────

function renderLibresResumen() {
  const countEl = document.getElementById('libres-count');
  if (countEl) {
    countEl.textContent = (window.requerimientoItemsLibres || []).length;
  }
}

function renderItemsLibresModal() {
  const contenedor = document.getElementById('items-libres-lista-modal');
  if (!contenedor) return;

  if (!window.requerimientoItemsLibres || window.requerimientoItemsLibres.length === 0) {
    contenedor.innerHTML = '<span class="text-muted" style="font-size:11px;">No hay ítems libres. Este modal es para requerimientos que son SOLO de ítems nuevos (que necesitan cotización para alta en catálogo).</span>';
    return;
  }

  let html = '';
  window.requerimientoItemsLibres.forEach((item, index) => {
    const unidad = item.unidad ? ` ${item.unidad}` : '';
    html += `
      <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px; background:#fffbeb; padding:3px 6px; border-radius:3px; border:1px solid #fde047; font-size:12px;">
        <span style="flex:1;">${item.descripcion} — <strong>${parseFloat(item.cantidad).toLocaleString('es-MX')}${unidad}</strong></span>
        <button type="button" class="btn btn-sm btn-danger" style="padding:0 4px; font-size:10px; line-height:1;"
                onclick="eliminarItemLibre(${index}); renderItemsLibresModal();">×</button>
      </div>`;
  });
  contenedor.innerHTML = html;
}

window.agregarItemLibre = function() {
  const tieneCatalogo = window.requerimientoItemsSeleccionados && window.requerimientoItemsSeleccionados.length > 0;

  if (tieneCatalogo) {
    if (!confirm('Ya tienes ítems del catálogo.\n\nNo se permite mezclar. ¿Limpiar catálogo y pasar a ítems nuevos?')) return;
    window.requerimientoItemsSeleccionados = [];
    renderItemsSeleccionados();
    const checkbox = document.getElementById('usar-items-nuevos');
    if (checkbox) checkbox.checked = true;
  }

  const desc   = document.getElementById('libre-descripcion')?.value.trim();
  let cant     = parseFloat(document.getElementById('libre-cantidad')?.value) || 1;
  const unidad = document.getElementById('libre-unidad')?.value.trim() || '';

  cant = Math.max(1, Math.round(cant));

  if (!desc || desc.length < 3) {
    Toast.error('La descripción del ítem libre debe tener al menos 3 caracteres');
    return;
  }

  if (!window.requerimientoItemsLibres) window.requerimientoItemsLibres = [];

  window.requerimientoItemsLibres.push({ descripcion: desc, cantidad: cant, unidad, notas: '' });

  const checkbox = document.getElementById('usar-items-nuevos');
  if (checkbox) checkbox.checked = true;

  renderLibresResumen();
  renderItemsLibresModal();

  const descInput   = document.getElementById('libre-descripcion');
  const cantInput   = document.getElementById('libre-cantidad');
  const unidadInput = document.getElementById('libre-unidad');
  if (descInput)   descInput.value   = '';
  if (cantInput)   cantInput.value   = '1';
  if (unidadInput) unidadInput.value = '';
};

window.abrirModalItemsLibres = function() {
  const tieneCatalogo = window.requerimientoItemsSeleccionados && window.requerimientoItemsSeleccionados.length > 0;

  if (tieneCatalogo) {
    if (!confirm('Ya tienes ítems del catálogo.\n\n¿Limpiarlos y trabajar solo con ítems nuevos (libres)?')) return;
    window.requerimientoItemsSeleccionados = [];
    renderItemsSeleccionados();
  }

  const modal = document.getElementById('modal-req-libres');
  if (!modal) return;
  modal.style.display = 'flex';
  renderItemsLibresModal();
};

window.cerrarModalItemsLibres = function() {
  const modal = document.getElementById('modal-req-libres');
  if (modal) modal.style.display = 'none';
  renderLibresResumen();
};

window.toggleModoItemsNuevos = function(checked) {
  const checkbox = document.getElementById('usar-items-nuevos');
  if (!checkbox) return;

  if (checked) {
    const tieneCatalogo = window.requerimientoItemsSeleccionados && window.requerimientoItemsSeleccionados.length > 0;
    if (tieneCatalogo) {
      if (!confirm('Ya tienes ítems del catálogo.\n\nNo se permite mezclar. ¿Limpiar catálogo y continuar con ítems nuevos?')) {
        checkbox.checked = false;
        return;
      }
      window.requerimientoItemsSeleccionados = [];
      renderItemsSeleccionados();
    }

    if (typeof abrirModalItemsLibres === 'function') abrirModalItemsLibres();

    const seccion = document.getElementById('seccion-items-catalogo');
    if (seccion) seccion.style.display = 'none';

    const actions = document.getElementById('libres-actions');
    if (actions) actions.style.display = 'block';

  } else {
    const tieneLibres = window.requerimientoItemsLibres && window.requerimientoItemsLibres.length > 0;
    if (tieneLibres) {
      if (!confirm('Tienes ítems nuevos/libres agregados.\n\nSi deseleccionas se limpiarán para poder usar el catálogo nuevamente.\n\n¿Continuar?')) {
        checkbox.checked = true;
        return;
      }
      window.requerimientoItemsLibres = [];
      renderLibresResumen();
    }

    cerrarModalItemsLibres();

    const seccion = document.getElementById('seccion-items-catalogo');
    if (seccion) seccion.style.display = 'block';

    const actions = document.getElementById('libres-actions');
    if (actions) actions.style.display = 'none';

    const busq = document.getElementById('busqueda-catalogo');
    if (busq) setTimeout(() => busq.focus(), 100);

    const cb = document.getElementById('usar-items-nuevos');
    if (cb) cb.checked = false;
  }
};

window.deseleccionarYVolverACatalogo = function() {
  const checkbox = document.getElementById('usar-items-nuevos');
  if (checkbox) {
    checkbox.checked = false;
    window.toggleModoItemsNuevos(false);
  } else {
    cerrarModalItemsLibres();
  }
};

window.eliminarItemLibre = function(index) {
  if (window.requerimientoItemsLibres) {
    window.requerimientoItemsLibres.splice(index, 1);
    renderLibresResumen();
    renderItemsLibresModal();
  }
};

window.mostrarFormItemLibre = function() {
  abrirModalItemsLibres();
  setTimeout(() => {
    const inp = document.getElementById('libre-descripcion');
    if (inp) inp.focus();
  }, 150);
};

window.ocultarFormItemLibre = function() {
  cerrarModalItemsLibres();
};
