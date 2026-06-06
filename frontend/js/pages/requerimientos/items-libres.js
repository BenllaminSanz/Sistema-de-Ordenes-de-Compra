// ── ÍTEMS LIBRES (texto libre / no en catálogo) ───────────────

function limpiarReferenciaLibreForm() {
  const linkInput = document.getElementById('libre-link');
  const fileInput = document.getElementById('libre-archivo');
  const radioLink = document.getElementById('libre-ref-link');
  if (linkInput) linkInput.value = '';
  if (fileInput) fileInput.value = '';
  if (radioLink) {
    radioLink.checked = true;
    toggleReferenciaLibre();
  }
}

window.toggleReferenciaLibre = function() {
  const esLink = document.getElementById('libre-ref-link')?.checked;
  const linkWrap = document.getElementById('libre-ref-link-wrap');
  const archivoWrap = document.getElementById('libre-ref-archivo-wrap');
  if (linkWrap) linkWrap.style.display = esLink ? 'block' : 'none';
  if (archivoWrap) archivoWrap.style.display = esLink ? 'none' : 'block';
};

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
      <div style="margin-bottom:4px; background:#fffbeb; padding:4px 6px; border-radius:3px; border:1px solid #fde047; font-size:12px;">
        <div style="display:flex; align-items:flex-start; gap:6px;">
          <div style="flex:1;">
            <div>${item.descripcion} — <strong>${parseFloat(item.cantidad).toLocaleString('es-MX')}${unidad}</strong></div>
            ${UI.referenciaItemHtml(item, true)}
          </div>
          <button type="button" class="btn btn-sm btn-danger" style="padding:0 4px; font-size:10px; line-height:1; flex-shrink:0;"
                  onclick="eliminarItemLibre(${index}); renderItemsLibresModal();">×</button>
        </div>
      </div>`;
  });
  contenedor.innerHTML = html;
}

window.agregarItemLibre = async function() {
  const btn = document.getElementById('btn-agregar-item-libre');
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

  const item = { descripcion: desc, cantidad: cant, unidad, notas: '' };
  const esArchivo = document.getElementById('libre-ref-archivo')?.checked;
  const link = document.getElementById('libre-link')?.value.trim() || '';
  const archivo = document.getElementById('libre-archivo')?.files?.[0] || null;

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Agregando...';
    }

    if (esArchivo && archivo) {
      const subido = await Api.uploadForm('/requerimientos/referencia-item', { archivo });
      item.referencia_tipo = 'archivo';
      item.referencia_url = subido.referencia_url;
      item.referencia_nombre = subido.referencia_nombre;
    } else if (!esArchivo && link) {
      if (!/^https?:\/\//i.test(link)) {
        Toast.error('El enlace debe comenzar con http:// o https://');
        return;
      }
      item.referencia_tipo = 'link';
      item.referencia_url = link;
      item.referencia_nombre = null;
    } else if (esArchivo && !archivo && link) {
      if (!/^https?:\/\//i.test(link)) {
        Toast.error('El enlace debe comenzar con http:// o https://');
        return;
      }
      item.referencia_tipo = 'link';
      item.referencia_url = link;
    }

    if (!window.requerimientoItemsLibres) window.requerimientoItemsLibres = [];
    window.requerimientoItemsLibres.push(item);

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
    limpiarReferenciaLibreForm();
  } catch (err) {
    Toast.error(err.mensaje || 'Error al agregar el ítem');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Agregar';
    }
  }
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
  toggleReferenciaLibre();
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