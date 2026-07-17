// ── ÍTEMS LIBRES — flujo inline (sin modal separado) ─────────

let _unidadesMedidaReq = null;

/** Carga unidades estandarizadas y rellena el combo de ítem nuevo. */
async function cargarUnidadesMedidaReq(selected = '') {
  const sel = document.getElementById('libre-unidad');
  if (!sel || sel.tagName !== 'SELECT') return;

  if (!_unidadesMedidaReq) {
    try {
      _unidadesMedidaReq = await Api.get('/unidades-medida?soloActivas=true') || [];
    } catch {
      _unidadesMedidaReq = [];
    }
  }

  const val = selected || sel.value || '';
  const esc = (typeof UI !== 'undefined' && UI.esc)
    ? (s) => UI.esc(s)
    : (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  const opts = ['<option value="">— Unidad —</option>'];
  _unidadesMedidaReq.forEach((u) => {
    const cod = u.codigo || u.nombre || '';
    const label = u.codigo && u.nombre && u.codigo !== u.nombre
      ? `${u.codigo} — ${u.nombre}`
      : (u.nombre || u.codigo);
    opts.push(`<option value="${esc(cod)}">${esc(label)}</option>`);
  });
  sel.innerHTML = opts.join('');

  if (val) {
    if (![...sel.options].some((o) => o.value === val)) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = val;
      sel.appendChild(o);
    }
    sel.value = val;
  }
}

window.cargarUnidadesMedidaReq = cargarUnidadesMedidaReq;

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
  // Resetear tabs visuales
  const tabLink = document.getElementById('tab-ref-link');
  const tabArch = document.getElementById('tab-ref-archivo');
  if (tabLink)  tabLink.classList.add('active');
  if (tabArch)  tabArch.classList.remove('active');
}

window.toggleReferenciaLibre = function() {
  const esLink      = document.getElementById('libre-ref-link')?.checked;
  const linkWrap    = document.getElementById('libre-ref-link-wrap');
  const archivoWrap = document.getElementById('libre-ref-archivo-wrap');
  if (linkWrap)    linkWrap.style.display    = esLink ? 'block' : 'none';
  if (archivoWrap) archivoWrap.style.display = esLink ? 'none'  : 'block';
};

// ── Contadores ────────────────────────────────────────────────
function renderLibresResumen() {
  const n = (window.requerimientoItemsLibres || []).length;

  // Badge en el panel principal
  const countEl = document.getElementById('libres-count');
  if (countEl) {
    if (n > 0) {
      countEl.textContent = `${n} libre${n > 1 ? 's' : ''}`;
      countEl.style.cssText = 'display:inline-block; background:#fde68a; color:#92400e; font-size:10px; font-weight:700; padding:1px 7px; border-radius:999px;';
    } else {
      countEl.style.display = 'none';
    }
  }
}

// ── Lista unificada de ítems (catálogo + libres) ──────────────
// renderItemsSeleccionados vive en items-catalogo.js y llama a ambos arrays.
// Esta función es el punto de sincronización post-agregar libre.
function sincronizarListas() {
  renderLibresResumen();
  if (typeof renderItemsSeleccionados === 'function') renderItemsSeleccionados();
}

// ── Mostrar / ocultar el panel inline de ítem libre ───────────
window.mostrarLibreInline = function() {
  cargarUnidadesMedidaReq().catch(() => {});
  if (typeof window.seleccionarModoItems === 'function') {
    window.seleccionarModoItems('libre');
  } else {
    const panel = document.getElementById('libre-inline-section');
    if (panel) panel.style.display = 'block';
    setTimeout(() => document.getElementById('libre-descripcion')?.focus(), 80);
  }
};

// silencioso = true → solo oculta DOM sin cambiar modo ni confirmar (para resets internos)
window.ocultarLibreInline = function(silencioso = false) {
  if (!silencioso && typeof window.seleccionarModoItems === 'function') {
    window.seleccionarModoItems('catalogo');
  } else {
    const panel = document.getElementById('libre-inline-section');
    if (panel) panel.style.display = 'none';
    const descEl = document.getElementById('libre-descripcion');
    const cantEl = document.getElementById('libre-cantidad');
    const unidEl = document.getElementById('libre-unidad');
    if (descEl) descEl.value = '';
    if (cantEl) cantEl.value = '1';
    if (unidEl) {
      unidEl.value = '';
      if (unidEl.tagName === 'SELECT') cargarUnidadesMedidaReq('').catch(() => {});
    }
    limpiarReferenciaLibreForm();
  }
};

// ── Compatibilidad con el código JS existente ─────────────────
// toggleModoItemsNuevos — antes controlaba modos separados, ahora
// simplemente muestra/oculta el panel inline.
window.toggleModoItemsNuevos = function(checked) {
  if (checked) {
    window.mostrarLibreInline();
    // Si hay ítems del catálogo, preguntar
    const tieneCatalogo = (window.requerimientoItemsSeleccionados || []).length > 0;
    if (tieneCatalogo) {
      if (!confirm('Ya tienes ítems del catálogo.\n\nNo se permite mezclar. ¿Limpiarlos para agregar ítems nuevos?')) {
        ocultarLibreInline();
        const cb = document.getElementById('usar-items-nuevos');
        if (cb) cb.checked = false;
        return;
      }
      window.requerimientoItemsSeleccionados = [];
      sincronizarListas();
    }
  } else {
    ocultarLibreInline();
    const cb = document.getElementById('usar-items-nuevos');
    if (cb) cb.checked = false;
  }
};

// abrirModalItemsLibres — redirige al panel inline
window.abrirModalItemsLibres = function() {
  window.mostrarLibreInline();
};

// cerrarModalItemsLibres — cierra el panel inline (compat)
window.cerrarModalItemsLibres = function() {
  ocultarLibreInline();
  // También ocultar stub de modal por si acaso
  const modal = document.getElementById('modal-req-libres');
  if (modal) modal.style.display = 'none';
  renderLibresResumen();
};

// deseleccionarYVolverACatalogo — oculta panel libre, resetea
window.deseleccionarYVolverACatalogo = function() {
  const tieneLibres = (window.requerimientoItemsLibres || []).length > 0;
  if (tieneLibres) {
    if (!confirm('Tienes ítems nuevos agregados. ¿Limpiarlos y volver al catálogo?')) return;
    window.requerimientoItemsLibres = [];
    sincronizarListas();
  }
  ocultarLibreInline();
  const cb = document.getElementById('usar-items-nuevos');
  if (cb) cb.checked = false;
  const busq = document.getElementById('busqueda-catalogo');
  if (busq) setTimeout(() => busq.focus(), 100);
};

// ── Agregar ítem libre ────────────────────────────────────────
window.agregarItemLibre = async function() {
  const btn = document.getElementById('btn-agregar-item-libre');

  // Validación de mezcla
  const tieneCatalogo = (window.requerimientoItemsSeleccionados || []).length > 0;
  if (tieneCatalogo) {
    if (!confirm('Ya tienes ítems del catálogo.\n\nNo se permite mezclar. ¿Limpiar catálogo y pasar a ítems nuevos?')) return;
    window.requerimientoItemsSeleccionados = [];
    sincronizarListas();
    const cb = document.getElementById('usar-items-nuevos');
    if (cb) cb.checked = true;
  }

  const desc   = document.getElementById('libre-descripcion')?.value.trim();
  let cant     = parseFloat(document.getElementById('libre-cantidad')?.value) || 1;
  const unidad = (document.getElementById('libre-unidad')?.value || '').trim() || '';
  cant = Math.max(1, Math.round(cant));

  if (!desc || desc.length < 3) {
    Toast.error('La descripción debe tener al menos 3 caracteres');
    document.getElementById('libre-descripcion')?.focus();
    return;
  }
  // Unidad opcional pero, si se captura, viene del catálogo estandarizado (combo)

  const maxItems = window.MAX_ITEMS_POR_REQ || 15;
  const nLibres = (window.requerimientoItemsLibres || []).length;
  if (nLibres >= maxItems) {
    Toast.error(`Máximo ${maxItems} ítems por requerimiento. Crea otro REQ para agregar más.`);
    return;
  }

  const item = { descripcion: desc, cantidad: cant, unidad, notas: '' };
  const esArchivo = document.getElementById('libre-ref-archivo')?.checked;
  const link      = document.getElementById('libre-link')?.value.trim() || '';
  const archivo   = document.getElementById('libre-archivo')?.files?.[0] || null;

  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Agregando…'; }

    if (esArchivo && archivo) {
      const subido = await Api.uploadForm('/requerimientos/referencia-item', { archivo });
      item.referencia_tipo   = 'archivo';
      item.referencia_url    = subido.referencia_url;
      item.referencia_nombre = subido.referencia_nombre;
    } else if (!esArchivo && link) {
      if (!/^https?:\/\//i.test(link)) {
        Toast.error('El enlace debe comenzar con http:// o https://');
        return;
      }
      item.referencia_tipo = 'link';
      item.referencia_url  = link;
      item.referencia_nombre = null;
    }

    if (!window.requerimientoItemsLibres) window.requerimientoItemsLibres = [];
    window.requerimientoItemsLibres.push(item);

    const cb = document.getElementById('usar-items-nuevos');
    if (cb) cb.checked = true;

    sincronizarListas();

    // Limpiar el form para el siguiente ítem
    const descInput   = document.getElementById('libre-descripcion');
    const cantInput   = document.getElementById('libre-cantidad');
    const unidadInput = document.getElementById('libre-unidad');
    if (descInput)   descInput.value = '';
    if (cantInput)   cantInput.value = '1';
    if (unidadInput) unidadInput.value = '';
    limpiarReferenciaLibreForm();
    if (descInput) descInput.focus();

  } catch (err) {
    Toast.error(err.mensaje || 'Error al agregar el ítem');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+ Agregar ítem'; }
  }
};

// ── Eliminar ítem libre desde la lista unificada ──────────────
window.eliminarItemLibreInline = function(index) {
  if (window.requerimientoItemsLibres) {
    window.requerimientoItemsLibres.splice(index, 1);
    sincronizarListas();
    // Si ya no hay libres, volver a modo catálogo
    if (window.requerimientoItemsLibres.length === 0) {
      // Sin confirm: el array ya está vacío, no hay nada que limpiar
      ocultarLibreInline(true); // silencioso: solo oculta
      if (typeof window.seleccionarModoItems === 'function') {
        window.seleccionarModoItems('catalogo', true);
      }
    }
  }
};

// Alias para compat con código que llama eliminarItemLibre(index)
window.eliminarItemLibre = window.eliminarItemLibreInline;

// ── Funciones heredadas — ya no se usan pero evitan errores ───
function renderItemsLibresModal() { sincronizarListas(); }
window.mostrarFormItemLibre  = window.mostrarLibreInline;
window.ocultarFormItemLibre  = window.ocultarLibreInline;
